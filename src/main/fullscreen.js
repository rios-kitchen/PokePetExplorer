// Is a fullscreen app (video, game, slides) in front? Then the pet steps aside.
//   macOS:   fullscreen apps get their own Space – the pet window simply isn't shown on those
//            (setVisibleOnAllWorkspaces … visibleOnFullScreen: false), so nothing needs watching.
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

class FullscreenWatch {
  /** onChange(isFullscreen) is called when it changes (Windows only). */
  constructor(onChange) {
    this.onChange = onChange;
    this.full = false;
    this.proc = null;
  }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_SCRIPT.replace('__PARENT__', String(process.pid))],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let buf = '';
      this.proc.stdout.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const full = buf.slice(0, i).trim() === 'F';
          buf = buf.slice(i + 1);
          if (full !== this.full) { this.full = full; this.onChange(full); }
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

module.exports = { FullscreenWatch };
