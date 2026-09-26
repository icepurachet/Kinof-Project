using System.Runtime.InteropServices;

namespace Kinof.Agent;

/// <summary>
/// Reads the interactive console user. KINOF seat occupancy must never be derived
/// from this name — occupancy comes only from verified /lab/agent/session login.
/// </summary>
internal static class WindowsSession
{
    private const int WtsUserName = 5;

    public static string? GetInteractiveUsername()
    {
        var sessionId = WTSGetActiveConsoleSessionId();
        if (sessionId == 0xFFFFFFFF)
            return null;

        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, WtsUserName, out var buffer, out _))
            return null;

        try
        {
            var name = Marshal.PtrToStringUni(buffer);
            return string.IsNullOrWhiteSpace(name) ? null : name.Trim();
        }
        finally
        {
            WTSFreeMemory(buffer);
        }
    }

    [DllImport("kernel32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr hServer,
        uint sessionId,
        int wtsInfoClass,
        out IntPtr ppBuffer,
        out int pBytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
}
