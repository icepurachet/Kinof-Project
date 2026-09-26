using System.Diagnostics;
using System.Security.Principal;
using System.Text;

namespace Kinof.Agent;

internal sealed class HostsWebsiteBlocker(ILogger<HostsWebsiteBlocker> logger)
{
    internal const string MarkerStart = "# KINOF-BLOCK-START";
    internal const string MarkerEnd = "# KINOF-BLOCK-END";

    private static readonly Encoding HostsEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    private readonly string _hostsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.System),
        "drivers", "etc", "hosts");

    public static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    public void Apply(IReadOnlyList<string> domains)
    {
        if (!IsAdministrator())
        {
            logger.LogError("ต้องรัน KINOF Agent ด้วยสิทธิ์ Administrator จึงจะเขียน hosts เพื่อบล็อกเว็บได้");
            return;
        }

        var hosts = ExpandHosts(domains);
        var lines = File.Exists(_hostsPath)
            ? File.ReadAllLines(_hostsPath, HostsEncoding).ToList()
            : [];

        RemoveMarkedSections(lines);

        if (hosts.Count > 0)
        {
            if (lines.Count > 0 && !string.IsNullOrWhiteSpace(lines[^1]))
                lines.Add(string.Empty);
            lines.Add(MarkerStart);
            foreach (var host in hosts)
            {
                lines.Add($"127.0.0.1 {host}");
                lines.Add($"::1 {host}");
            }
            lines.Add(MarkerEnd);
        }

        File.WriteAllLines(_hostsPath, lines, HostsEncoding);
        FlushDns();
        logger.LogInformation("อัปเดต hosts แล้ว บล็อก {Count} โดเมนจากรายการ", domains.Count);
    }

    internal static List<string> ExpandHosts(IReadOnlyList<string> domains)
    {
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var domain in domains)
        {
            var host = NormalizeHost(domain);
            if (host is null) continue;
            names.Add(host);
            if (host.StartsWith("www.", StringComparison.OrdinalIgnoreCase))
                names.Add(host[4..]);
            else
                names.Add("www." + host);
        }

        return [.. names];
    }

    internal static string? NormalizeHost(string? domain)
    {
        var value = domain?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.StartsWith("*.")) value = value[2..];
        if (value.Contains("://", StringComparison.Ordinal))
            value = value[(value.IndexOf("://", StringComparison.Ordinal) + 3)..];
        var slash = value.IndexOf('/');
        if (slash >= 0) value = value[..slash];
        value = value.Trim().Trim('.');
        if (value.Length == 0 || value.Contains(' ', StringComparison.Ordinal) || value.Contains('\\', StringComparison.Ordinal))
            return null;
        return value;
    }

    internal static void RemoveMarkedSections(List<string> lines)
    {
        while (true)
        {
            var start = lines.FindIndex(line =>
                string.Equals(line.Trim(), MarkerStart, StringComparison.Ordinal));
            if (start < 0)
            {
                var orphanEnd = lines.FindIndex(line =>
                    string.Equals(line.Trim(), MarkerEnd, StringComparison.Ordinal));
                if (orphanEnd < 0) break;
                lines.RemoveAt(orphanEnd);
                continue;
            }

            var end = lines.FindIndex(start, line =>
                string.Equals(line.Trim(), MarkerEnd, StringComparison.Ordinal));
            if (end >= 0)
                lines.RemoveRange(start, end - start + 1);
            else
                lines.RemoveRange(start, lines.Count - start);

            while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[^1]))
                lines.RemoveAt(lines.Count - 1);
        }
    }

    private static void FlushDns()
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "ipconfig.exe",
            Arguments = "/flushdns",
            CreateNoWindow = true,
            UseShellExecute = false
        });
        process?.WaitForExit(5000);
    }
}
