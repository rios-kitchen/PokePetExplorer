// Update check against the GitHub releases of this app. Finds the installer for this platform (.dmg on macOS,
// .exe on Windows) and downloads it to the Downloads folder. Then it installs it by itself: a small helper
// script waits for the app to quit, puts the new version in place (macOS: copies the app out of the .dmg, keeping
// the old one until that worked; Windows: runs the installer silently) and starts it again.
//
// A note in userData (update-pending.json) remembers the attempt. If the app comes back as the old version, the
// downloaded installer is offered for a manual install; if that doesn't work either, Settings links to the
// release page so it can be downloaded and installed by hand.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
const { fetchAllowed } = require('./sources');

const REPO = 'rios-kitchen/PokePetExplorer';   // owner/name of the GitHub repository with the releases
const RELEASES = `https://github.com/${REPO}/releases`;

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

/**
 * What to show after an attempt, from the pending note and the running version:
 * null (nothing pending / it worked), 'auto-failed' (offer a manual install) or 'manual-failed' (link to GitHub).
 */
function stageOf(pending, current) {
  if (!pending || !newer(pending.version, current)) return null;
  return pending.manualTried ? 'manual-failed' : 'auto-failed';
}

// ---------------------------------------------------------------- the helper scripts
const MAC_SCRIPT = `#!/bin/bash
# PokePet Explorer update: wait for the app to quit, replace it with the one in the .dmg, start it again.
PID="$1"; DMG="$2"; APP="$3"; LOG="$4"
for i in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
MNT=$(mktemp -d "\${TMPDIR:-/tmp}/pokepet-update.XXXXXX")
fail() {
  echo "$(date) update failed: $1" >> "$LOG"
  hdiutil detach "$MNT" -quiet 2>/dev/null
  if [ -d "$APP.old" ] && [ ! -d "$APP" ]; then mv "$APP.old" "$APP"; fi
  open "$APP"
  exit 1
}
hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null || fail "attach"
SRC=$(ls -d "$MNT"/*.app 2>/dev/null | head -1)
[ -n "$SRC" ] || fail "no app in the dmg"
rm -rf "$APP.old"
mv "$APP" "$APP.old" || fail "move the old app"
ditto "$SRC" "$APP" || { rm -rf "$APP"; fail "copy"; }
hdiutil detach "$MNT" -quiet
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
rm -rf "$APP.old"
echo "$(date) updated" >> "$LOG"
open "$APP"
`;

const WIN_SCRIPT = `@echo off
rem PokePet Explorer update: wait for the app to quit, run the installer silently, start the app again.
set PID=%~1
set SETUP=%~2
set EXE=%~3
set LOG=%~4
:wait
tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul && (timeout /t 1 /nobreak >nul & goto wait)
"%SETUP%" /S
if errorlevel 1 echo %date% %time% update failed: installer %errorlevel%>> "%LOG%"
start "" "%EXE%"
`;

class Updater {
  /** onChange(state); quit() closes the app for the install. */
  constructor(onChange, { quit } = {}) {
    this.onChange = onChange;
    this.quit = quit || (() => app.quit());
    this.state = { status: 'idle', version: null, notes: null, url: null, progress: 0, error: null, checkedAt: null, stage: null };
    this.asset = null;
    this.file = null;
    this.pendingFile = path.join(app.getPath('userData'), 'update-pending.json');
    this.restore();
  }

  set(patch) {
    Object.assign(this.state, patch);
    this.onChange(this.state);
  }

  // ---------------------------------------------------------------- the pending note
  readPending() { try { return JSON.parse(fs.readFileSync(this.pendingFile, 'utf8')); } catch { return null; } }
  writePending(p) { try { fs.writeFileSync(this.pendingFile, JSON.stringify(p)); } catch { /* not important */ } }
  clearPending() { try { fs.unlinkSync(this.pendingFile); } catch { /* gone */ } }

  /** At start: did an update get installed? If not, offer the downloaded one (or the release page). */
  restore() {
    const p = this.readPending();
    if (!p) return;
    const stage = stageOf(p, app.getVersion());
    if (!stage) {
      // it worked (or the app is newer anyway): tidy up
      try { if (p.file) fs.unlinkSync(p.file); } catch { /* keep it */ }
      this.clearPending();
      return;
    }
    const have = !!(p.file && fs.existsSync(p.file));
    this.file = have ? p.file : null;
    this.state = { ...this.state, status: have ? 'downloaded' : 'available', version: p.version, url: p.url || RELEASES,
      canDownload: false, stage: have ? stage : 'manual-failed' };
  }

  /** Ask GitHub for the latest release. status: none | available | error */
  async check() {
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.state;
    if (this.state.stage) return this.state;   // an update is already waiting to be installed
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

  /** Download the installer (with progress), then install it and restart. */
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
      this.writePending({ version: this.state.version, file, url: this.state.url, from: app.getVersion(), at: Date.now() });
      this.set({ status: 'downloaded', progress: 1 });
      this.install();
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
      this.set({ status: 'available', error: String(e.message || e) });
    }
    return this.state;
  }

  /** Quit, install and start again (packaged app on macOS / Windows); otherwise fall back to a manual install. */
  install() {
    const p = this.readPending() || {};
    this.writePending({ ...p, autoTried: true });
    try {
      if (!app.isPackaged) throw new Error('not packaged');
      const log = path.join(app.getPath('userData'), 'update.log');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pokepet-update-'));
      let child;
      if (process.platform === 'darwin') {
        const bundle = path.resolve(process.execPath, '..', '..', '..');
        if (!bundle.endsWith('.app')) throw new Error('not an app bundle');
        fs.accessSync(path.dirname(bundle), fs.constants.W_OK);   // e.g. still running from the .dmg
        const script = path.join(tmp, 'update.sh');
        fs.writeFileSync(script, MAC_SCRIPT, { mode: 0o755 });
        child = spawn('/bin/bash', [script, String(process.pid), this.file, bundle, log], { detached: true, stdio: 'ignore' });
      } else if (process.platform === 'win32') {
        const script = path.join(tmp, 'update.cmd');
        fs.writeFileSync(script, WIN_SCRIPT.replace(/\n/g, '\r\n'));
        child = spawn('cmd.exe', ['/c', script, String(process.pid), this.file, process.execPath, log],
          { detached: true, stdio: 'ignore', windowsHide: true });
      } else throw new Error('unsupported');
      child.unref();
      this.set({ status: 'installing' });
      setTimeout(() => this.quit(), 600);
    } catch {
      // can't do it by itself: open the installer for a manual install
      this.set({ status: 'downloaded', stage: 'auto-failed' });
      this.openDownloaded();
    }
  }

  /** Manual install: open the downloaded installer (mounts the .dmg / starts the setup). */
  openDownloaded() {
    if (!this.file || !fs.existsSync(this.file)) { shell.openExternal(this.state.url || RELEASES); return; }
    const p = this.readPending();
    if (p && this.state.stage) this.writePending({ ...p, manualTried: true });
    shell.openPath(this.file);
  }

  /** The release page, for downloading by hand. */
  openReleasePage() { shell.openExternal(this.state.url || RELEASES); }

  /** Testing: show one of the after-update states without a real update. */
  simulate(stage, version) {
    this.set({ status: stage === 'manual-failed' || stage === 'auto-failed' ? 'downloaded' : 'available',
      version, url: RELEASES, canDownload: false, stage });
  }
}

module.exports = { Updater, REPO, RELEASES, newer, assetFor, stageOf, MAC_SCRIPT, WIN_SCRIPT };
