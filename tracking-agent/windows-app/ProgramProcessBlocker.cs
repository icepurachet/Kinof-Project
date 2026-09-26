using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Kinof.Agent;

internal sealed record BlockedProcessEvent(string ProcessName, int Pid);

/// <summary>
/// Closes user processes that match the admin program blacklist.
/// Never shuts down Windows, never kills this Agent, and skips OS-critical processes.
/// </summary>
internal sealed class ProgramProcessBlocker(ILogger<ProgramProcessBlocker> logger)
{
    private static readonly HashSet<string> ProtectedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "idle", "system", "registry", "memory compression", "secure system",
        "smss", "csrss", "wininit", "winlogon", "services", "lsass", "lsaiso",
        "svchost", "fontdrvhost", "dwm", "conhost", "sihost", "taskhostw",
        "runtimebroker", "searchhost", "searchindexer", "searchapp",
        "startmenuexperiencehost", "shellexperiencehost", "textinputhost",
        "ctfmon", "spoolsv", "logonui", "dllhost", "wmiprvse",
        "securityhealthservice", "securityhealthsystray", "msmpeng", "nissrv",
        "smartscreen", "applicationframehost", "consent", "trustedinstaller",
        "tiworker", "explorer", "audiodg", "sgrmbroker", "dashost", "unsecapp",
        "lockapp", "userinit", "lsm", "sppsvc", "wlanext",
        "kinof.agent", "kinof.api"
    };

    private volatile HashSet<string> _blocked = new(StringComparer.OrdinalIgnoreCase);
    private volatile HashSet<string> _allowed = new(StringComparer.OrdinalIgnoreCase);
    private int _knownCount = -1;
    private int _allowedCount = -1;

    public int Count => _blocked.Count;

    public int AllowCount => _allowed.Count;

    public void UpdateList(IReadOnlyList<string> processNames)
    {
        var next = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in processNames)
        {
            var normalized = Normalize(name);
            if (normalized is null)
                continue;
            if (IsProtectedName(normalized))
            {
                logger.LogWarning("ข้าม {Process} จากรายการบล็อก เพราะเป็น process ระบบหรือตัว Agent", normalized);
                continue;
            }

            next.Add(normalized);
        }

        _blocked = next;
        if (_knownCount != next.Count)
        {
            logger.LogInformation("ใช้รายการบล็อกโปรแกรม {Count} รายการ", next.Count);
            _knownCount = next.Count;
        }
    }

    public void UpdateAllowList(IReadOnlyList<string> processNames)
    {
        var next = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in processNames)
        {
            var normalized = Normalize(name);
            if (normalized is null) continue;
            next.Add(normalized);
        }

        _allowed = next;
        if (_allowedCount != next.Count)
        {
            logger.LogInformation("ใช้รายการอนุญาตโปรแกรม {Count} รายการ", next.Count);
            _allowedCount = next.Count;
        }
    }

    public IReadOnlyList<string> ListUnknown()
    {
        if (_allowed.Count == 0)
            return [];

        var blocked = _blocked;
        var allowed = _allowed;
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        Process[] processes;
        try
        {
            processes = Process.GetProcesses();
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "อ่านรายการ process ไม่ได้");
            return [];
        }

        using var current = Process.GetCurrentProcess();
        var currentId = current.Id;
        var currentName = Normalize(current.ProcessName);

        foreach (var process in processes)
        {
            using (process)
            {
                try
                {
                    if (process.Id is 0 or 4 || process.Id == currentId)
                        continue;
                    try
                    {
                        if (process.SessionId == 0)
                            continue;
                    }
                    catch (InvalidOperationException)
                    {
                        continue;
                    }

                    var name = Normalize(process.ProcessName);
                    if (name is null || IsProtectedName(name))
                        continue;
                    if (currentName is not null && string.Equals(name, currentName, StringComparison.OrdinalIgnoreCase))
                        continue;
                    if (allowed.Contains(name) || blocked.Contains(name))
                        continue;
                    if (LooksLikeWindowsProcess(process))
                        continue;
                    names.Add(name);
                }
                catch (InvalidOperationException)
                {
                    // Process exited while inspecting.
                }
            }
        }

        return [.. names];
    }

    public IReadOnlyList<BlockedProcessEvent> Enforce()
    {
        var blocked = _blocked;
        if (blocked.Count == 0)
            return [];

        using var current = Process.GetCurrentProcess();
        var currentId = current.Id;
        var parentId = TryGetParentProcessId(current);
        var currentName = Normalize(current.ProcessName);
        var killed = new List<BlockedProcessEvent>();

        foreach (var processName in blocked)
        {
            var lookup = processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                ? processName[..^4]
                : processName;

            Process[] processes;
            try
            {
                processes = Process.GetProcessesByName(lookup);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "อ่าน process {Name} ไม่ได้", lookup);
                continue;
            }

            foreach (var process in processes)
            {
                using (process)
                {
                    if (!ShouldKill(process, currentId, parentId, currentName))
                        continue;
                    if (!TryKill(process, processName))
                        continue;
                    killed.Add(new BlockedProcessEvent(processName, process.Id));
                }
            }
        }

        return killed;
    }

    internal static string? Normalize(string? processName)
    {
        var value = processName?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(value))
            return null;

        value = value.Replace('/', '\\');
        var slash = value.LastIndexOf('\\');
        if (slash >= 0)
            value = value[(slash + 1)..];
        if (!value.EndsWith(".exe", StringComparison.Ordinal) && !value.Contains('.'))
            value += ".exe";
        return value.Trim();
    }

    internal static bool IsProtectedName(string? processName)
    {
        var normalized = Normalize(processName);
        if (normalized is null)
            return true;
        var withoutExt = normalized.EndsWith(".exe", StringComparison.Ordinal)
            ? normalized[..^4]
            : normalized;
        return ProtectedNames.Contains(withoutExt) || ProtectedNames.Contains(normalized);
    }

    private static bool LooksLikeWindowsProcess(Process process)
    {
        try
        {
            var path = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(path))
                return false;
            var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (!string.IsNullOrWhiteSpace(windows) &&
                path.StartsWith(windows, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return path.Contains(@"\WindowsApps\", StringComparison.OrdinalIgnoreCase) ||
                   path.Contains(@"\Microsoft\EdgeUpdate\", StringComparison.OrdinalIgnoreCase);
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return true;
        }
        catch (InvalidOperationException)
        {
            return true;
        }
    }

    private bool ShouldKill(Process process, int currentId, int? parentId, string? currentName)
    {
        try
        {
            if (process.HasExited)
                return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }

        if (process.Id is 0 or 4 || process.Id == currentId)
            return false;
        if (parentId is int parent && process.Id == parent)
            return false;

        try
        {
            if (process.SessionId == 0)
                return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }

        var name = Normalize(process.ProcessName);
        if (name is null || IsProtectedName(name))
            return false;
        if (currentName is not null && string.Equals(name, currentName, StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }

    private bool TryKill(Process process, string processName)
    {
        try
        {
            process.Kill(entireProcessTree: true);
            if (!process.WaitForExit(3000))
                TryTaskKill(process.Id);
            logger.LogInformation("ปิด {Process} pid={Pid} เพราะอยู่ในรายการบล็อก", processName, process.Id);
            return true;
        }
        catch (Exception ex) when (ex is InvalidOperationException or NotSupportedException or System.ComponentModel.Win32Exception)
        {
            if (TryTaskKill(process.Id))
            {
                logger.LogInformation("ปิด {Process} pid={Pid} ด้วย taskkill เพราะอยู่ในรายการบล็อก", processName, process.Id);
                return true;
            }

            logger.LogWarning(ex, "ปิด {Process} pid={Pid} ไม่ได้", processName, process.Id);
            return false;
        }
    }

    private static bool TryTaskKill(int pid)
    {
        try
        {
            using var killer = Process.Start(new ProcessStartInfo
            {
                FileName = "taskkill.exe",
                Arguments = $"/F /PID {pid}",
                CreateNoWindow = true,
                UseShellExecute = false
            });
            return killer is not null && killer.WaitForExit(3000) && killer.ExitCode is 0 or 128;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static int? TryGetParentProcessId(Process process)
    {
        try
        {
            var info = new ProcessBasicInformation();
            var status = NtQueryInformationProcess(
                process.Handle,
                0,
                ref info,
                Marshal.SizeOf<ProcessBasicInformation>(),
                out _);
            if (status != 0)
                return null;
            var parent = info.InheritedFromUniqueProcessId.ToInt64();
            return parent is > 0 and <= int.MaxValue ? (int)parent : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref ProcessBasicInformation processInformation,
        int processInformationLength,
        out int returnLength);

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessBasicInformation
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }
}
