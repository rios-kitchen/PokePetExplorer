// Is a fullscreen app (video, game, slides) in front? Then the pet steps aside.
//   macOS:   fullscreen apps get their own Space and the pet is kept off those (visibleOnFullScreen: false), but an
//            always-on-top window of a menu-bar app can still show up over a fullscreen video (Safari, issue #5).
//            So a small JavaScript-for-Automation helper also checks once a second whether the active Space is a
//            fullscreen Space (browsers' fullscreen web video, issue #8) or a window of the front app covers a whole
//            screen. It reads only Space types and window positions and sizes – no titles or contents, and no extra
//            permission.
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

/**
 * macOS: is a fullscreen app in front? Runs inside the helper (its source is pasted into MAC_SCRIPT) and in the tests.
 *   fullscreenSpace: the active Space is a fullscreen Space – browsers put fullscreen web video there, as apps do
 *   windows:         the window list, front to back (CGWindowListCopyWindowInfo, on screen only)
 *   frontPid:        the frontmost app – a browser keeps small windows of its own (the "press Esc" bubble, the
 *                    toolbar) in front of its fullscreen video, so all of the front app's windows count
 */
function macFullscreen({ self, frontPid, fullscreenSpace, screens, windows }) {
  if (fullscreenSpace) return true;
  // the menu bar's status icons (clock, Control Center …) are hidden in a fullscreen Space
  const statusIcons = windows.some((x) => x.kCGWindowLayer === 25 && x.kCGWindowBounds && x.kCGWindowBounds.Y <= 1);
  const normal = windows.filter((x) => x.kCGWindowLayer === 0 && x.kCGWindowOwnerPID !== self && x.kCGWindowAlpha > 0
    && x.kCGWindowBounds && x.kCGWindowBounds.Width > 100);
  const front = frontPid && frontPid !== self ? normal.filter((x) => x.kCGWindowOwnerPID === frontPid) : normal.slice(0, 1);
  // full width down to the bottom, from the very top – or from just below the camera notch with the menu bar gone
  return front.some(({ kCGWindowBounds: b }) => screens.some((s) => Math.abs(b.Width - s.w) < 2 && Math.abs(b.X - s.x) < 2
    && Math.abs(b.Y + b.Height - s.h) < 2 && (b.Y <= 1 || (b.Y <= 50 && !statusIcons))));
}

// argv: our pid, and "nospace" to skip the Space check (if it ever took the helper down)
const MAC_SCRIPT = `
ObjC.import('CoreGraphics'); ObjC.import('AppKit');
function out(s) { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
${macFullscreen.toString()}
// the type of the active Space (4 = fullscreen) – reads only Space ids and types, no extra permission
function spaceCheck() {
  try {
    ObjC.bindFunction('CGSMainConnectionID', ['int', []]);
    ObjC.bindFunction('CGSGetActiveSpace', ['unsigned long long', ['int']]);
    ObjC.bindFunction('CGSCopyManagedDisplaySpaces', ['id', ['int']]);
    const cid = $.CGSMainConnectionID();
    return () => {
      try {
        const active = Number($.CGSGetActiveSpace(cid));
        const displays = ObjC.deepUnwrap($.CGSCopyManagedDisplaySpaces(cid)) || [];
        return displays.some((d) => (d.Spaces || []).some((s) => Number(s.id64) === active && s.type === 4));
      } catch (e) { return false; }
    };
  } catch (e) { return () => false; }
}
function run(argv) {
  const self = Number(argv[0]);
  const fullscreenSpace = argv[1] === 'nospace' ? () => false : spaceCheck();
  for (;;) {
    if ($.NSRunningApplication.runningApplicationWithProcessIdentifier(self).isNil()) return;
    const ss = $.NSScreen.screens, screens = [];
    for (let i = 0; i < ss.count; i++) { const f = ss.objectAtIndex(i).frame; screens.push({ x: f.origin.x, w: f.size.width, h: f.size.height }); }
    const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0))) || [];
    const front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    const frontPid = front.isNil() ? 0 : Number(front.processIdentifier);
    out(macFullscreen({ self, frontPid, fullscreenSpace: fullscreenSpace(), screens, windows }) ? 'F' : '-');
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

  start(noSpace = false) {
    if (this.proc || !['win32', 'darwin'].includes(process.platform)) return;
    try {
      const args = ['-l', 'JavaScript', '-e', MAC_SCRIPT, String(process.pid)].concat(noSpace ? ['nospace'] : []);
      const proc = this.proc = process.platform === 'darwin'
        ? spawn('/usr/bin/osascript', args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
      proc.on('exit', (code) => {
        if (this.proc !== proc) return;
        this.proc = null;
        // the macOS helper died on its own: once more, without the Space check
        if (code !== 0 && process.platform === 'darwin' && !noSpace) this.start(true);
      });
      this.proc.on('error', () => { this.proc = null; });
    } catch { this.proc = null; }
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch { /* gone */ } }
    this.proc = null;
    if (this.full) { this.full = false; this.onChange(false); }
  }
}

module.exports = { FullscreenWatch, MAC_SCRIPT, macFullscreen };
