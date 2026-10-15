// Update check against the GitHub releases of this app. Finds the installer for this platform
// (.dmg on macOS, .exe on Windows), downloads it to the Downloads folder and opens it – the app
// isn't code-signed, so it can't replace itself silently; the installer takes it from there.
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { fetchAllowed } = require('./sources');

const REPO = 'rios-kitchen/PokePetExplorer';   // owner/name of the GitHub repository with the releases

/** "v1.2.10" → [1, 2, 10] */
const parts = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);

function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function assetFor(release, platform = process.platform) {
  const ext = platform === 'darwin' ? '.dmg' : platform === 'win32' ? '.exe' : null;
  return ext ? (release.assets || []).find((a) => a.name.toLowerCase().endsWith(ext)) || null : null;
}

class Updater {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = { status: 'idle', version: null, notes: null, url: null, progress: 0, error: null, checkedAt: null };
    this.asset = null;
    this.file = null;
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.onChange(this.state);
  }

  /** Ask GitHub for the latest release. status: none | available | error */
  async check() {
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.state;
    this.set({ status: 'checking', error: null });
    try {
      const res = await fetchAllowed(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (res.status === 404) { this.set({ status: 'none', checkedAt: Date.now() }); return this.state; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rel = await res.json();
      const version = String(rel.tag_name || '').replace(/^v/i, '');
      this.asset = assetFor(rel);
      if (!newer(version, app.getVersion())) {
        this.set({ status: 'none', version, checkedAt: Date.now() });
      } else {
        this.set({ status: 'available', version, notes: (rel.body || '').slice(0, 600), url: rel.html_url, checkedAt: Date.now(), canDownload: !!this.asset });
      }
    } catch (e) {
      this.set({ status: 'error', error: String(e.message || e), checkedAt: Date.now() });
    }
    return this.state;
  }

  /** Download the installer (with progress) and open it. */
  async download() {
    if (this.state.status !== 'available' || !this.asset) return this.state;
    const dir = app.getPath('downloads');
    const file = path.join(dir, this.asset.name);
    const tmp = `${file}.download`;
    this.set({ status: 'downloading', progress: 0 });
    try {
      const res = await fetchAllowed(this.asset.browser_download_url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || this.asset.size || 0;
      const out = fs.createWriteStream(tmp);
      let got = 0, lastSent = 0;
      for await (const chunk of res.body) {
        out.write(Buffer.from(chunk));
        got += chunk.length;
        if (total && Date.now() - lastSent > 250) { lastSent = Date.now(); this.set({ progress: got / total }); }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      fs.renameSync(tmp, file);
      this.file = file;
      this.set({ status: 'downloaded', progress: 1 });
      await shell.openPath(file);   // mounts the .dmg / starts the installer
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
      this.set({ status: 'available', error: String(e.message || e) });
    }
    return this.state;
  }

  /** Open the downloaded installer again, or show it in its folder. */
  openDownloaded() {
    if (this.file && fs.existsSync(this.file)) shell.showItemInFolder(this.file);
  }
}

module.exports = { Updater, REPO, newer, assetFor };
