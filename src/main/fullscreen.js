// Is a fullscreen app (video, game, slides) in front? Then the pet steps aside.
//   macOS:   fullscreen apps get their own Space and the pet is kept off those (visibleOnFullScreen: false), but an
//            always-on-top window of a menu-bar app can still show up over a fullscreen video (Safari, issue #5).
//            So a small JavaScript-for-Automation helper also checks once a second whether the frontmost normal
//            window covers a whole screen. It reads only window positions and sizes from the window list – no
//            titles or contents, and no extra permission.
//   Windows: a small PowerShell helper checks once a second whether the foreground window covers its
//            whole monitor. Only the window's size is read – never its title or contents.
const { spawn } = require('child_process');

const WIN_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class PokePetFullscreen {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static void Run(int parent) {
    var p = System.Diagnostics.Process.GetProcessById(parent);
    while (!p.HasExited) {
      bool full = false;
      IntPtr w = GetForegroundWindow();
      if (w != IntPtr.Zero && w != GetShellWindow() && w != GetDesktopWindow()) {
        var cls = new StringBuilder(64); GetClassName(w, cls, 64);
        string c = cls.ToString();
        if (c != "Progman" && c != "WorkerW") {
          RECT r; MONITORINFO mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
          if (GetWindowRect(w, out r) && GetMonitorInfo(MonitorFromWindow(w, 2), ref mi)) {
            full = r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
          }
        }
      }
      Console.WriteLine(full ? "F" : "-");
      Console.Out.Flush();
      Thread.Sleep(1000);
    }
  }
}
"@
[PokePetFullscreen]::Run(__PARENT__)
`;

const MAC_SCRIPT = `
ObjC.import('CoreGraphics'); ObjC.import('AppKit');
function out(s) { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
function run(argv) {
  const self = Number(argv[0]);
  for (;;) {
    if ($.NSRunningApplication.runningApplicationWithProcessIdentifier(self).isNil()) return;
    let full = false;
    const ss = $.NSScreen.screens, screens = [];
    for (let i = 0; i < ss.count; i++) { const f = ss.objectAtIndex(i).frame; screens.push({ x: f.origin.x, w: f.size.width, h: f.size.height }); }
    const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0))) || [];
    // the menu bar's status icons (clock, Control Center …) are hidden in a fullscreen Space
    const statusIcons = list.some((x) => x.kCGWindowLayer === 25 && x.kCGWindowBounds && x.kCGWindowBounds.Y <= 1);
    // the frontmost normal window that isn't ours
    const w = list.find((x) => x.kCGWindowLayer === 0 && x.kCGWindowOwnerPID !== self && x.kCGWindowAlpha > 0 && x.kCGWindowBounds && x.kCGWindowBounds.Width > 100);
    if (w) {
      const b = w.kCGWindowBounds;
      // full width down to the bottom, from the very top – or from just below the camera notch with the menu bar gone
      full = screens.some((s) => Math.abs(b.Width - s.w) < 2 && Math.abs(b.X - s.x) < 2 && Math.abs(b.Y + b.Height - s.h) < 2
        && (b.Y <= 1 || (b.Y <= 50 && !statusIcons)));
    }
    out(full ? 'F' : '-');
    delay(1);
  }
}
`;

class FullscreenWatch {
  /** onChange(isFullscreen) is called when it changes (macOS and Windows). */
  constructor(onChange) {
    this.onChange = onChange;
    this.full = false;
    this.proc = null;
  }

  start() {
    if (this.proc || !['win32', 'darwin'].includes(process.platform)) return;
    try {
      this.proc = process.platform === 'darwin'
        ? spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_SCRIPT, String(process.pid)], { stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_SCRIPT.replace('__PARENT__', String(process.pid))],
          { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let buf = '';
      this.proc.stdout.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const full = buf.slice(0, i).trim() === 'F';
          buf = buf.slice(i + 1);
          // hide at once, come back only after two "not fullscreen" readings in a row
          this.notFull = full ? 0 : (this.notFull || 0) + 1;
          if (full && !this.full) { this.full = true; this.onChange(true); }
          else if (!full && this.full && this.notFull >= 2) { this.full = false; this.onChange(false); }
        }
      });
      this.proc.on('exit', () => { this.proc = null; });
      this.proc.on('error', () => { this.proc = null; });
    } catch { this.proc = null; }
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch { /* gone */ } }
    this.proc = null;
    if (this.full) { this.full = false; this.onChange(false); }
  }
}

module.exports = { FullscreenWatch, MAC_SCRIPT };
