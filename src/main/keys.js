// Knows *when* a key was last pressed – never *which* key. Mouse clicks and scrolling don't count.
//   macOS:   CGEventSourceSecondsSinceLastEventType(kCGEventKeyDown) via a tiny JXA loop
//            (no Accessibility / Input Monitoring permission needed)
//   Windows: GetAsyncKeyState polling for keyboard keys (VK 0x08–0xFE, mouse buttons excluded)
// If the helper can't start, `available` stays false and the pet falls back to a heuristic.
const { spawn } = require('child_process');

// __PARENT__ is replaced with PokePet's pid: the helper quits by itself if PokePet is gone (e.g. after a crash)
const MAC_SCRIPT = `
ObjC.import('CoreGraphics');
ObjC.import('AppKit');
let n = 0;
while (true) {
  console.log(String($.CGEventSourceSecondsSinceLastEventType(1, 10)));
  if (++n % 20 === 0) {
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(__PARENT__);
    if (app.isNil() || app.terminated) break;
  }
  delay(0.15);
}`;

const WIN_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class PokePetKeys {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  public static void Run(int parent) {
    var p = System.Diagnostics.Process.GetProcessById(parent);
    while (!p.HasExited) {
      bool any = false;
      for (int v = 0x08; v <= 0xFE; v++) {
        if ((GetAsyncKeyState(v) & 0x8001) != 0) { any = true; }
      }
      Console.WriteLine(any ? "k" : ".");
      Console.Out.Flush();
      Thread.Sleep(120);
    }
  }
}
"@
[PokePetKeys]::Run(__PARENT__)
`;

class KeyActivity {
  constructor() {
    this.lastKey = 0;          // timestamp of the last key press
    this.available = false;
    this.proc = null;
  }

  start() {
    try {
      if (process.platform === 'darwin') {
        this.proc = spawn('osascript', ['-l', 'JavaScript', '-e', MAC_SCRIPT.replace('__PARENT__', String(process.pid))], { stdio: ['ignore', 'pipe', 'pipe'] });
        // JXA's console.log writes to stderr
        this.listen(this.proc.stderr, (line) => {
          const s = parseFloat(line);
          if (Number.isFinite(s)) this.lastKey = Math.max(this.lastKey, Date.now() - s * 1000);
        });
      } else if (process.platform === 'win32') {
        this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_SCRIPT.replace('__PARENT__', String(process.pid))],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        this.listen(this.proc.stdout, (line) => {
          if (line.trim() === 'k') this.lastKey = Date.now();
        });
      } else {
        return;
      }
      this.proc.on('error', () => { this.available = false; });
      this.proc.on('exit', () => { this.available = false; this.proc = null; });
    } catch {
      this.available = false;
    }
  }

  listen(stream, onLine) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        this.available = true;
        onLine(line);
      }
    });
  }

  /** Milliseconds since the last key press, or null if unknown. */
  sinceKey() {
    if (!this.available) return null;
    return this.lastKey ? Date.now() - this.lastKey : Infinity;
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch { /* gone */ } }
    this.proc = null;
  }
}

module.exports = { KeyActivity };
