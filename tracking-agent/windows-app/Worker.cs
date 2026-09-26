namespace Kinof.Agent;

internal sealed class Worker(
    AgentApiClient api,
    AgentSessionState session,
    HostsWebsiteBlocker websiteBlocker,
    ProgramProcessBlocker programBlocker,
    IConfiguration config,
    ILogger<Worker> logger) : BackgroundService
{
    private readonly Dictionary<string, DateTime> _lastLoggedBlockUtc = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DateTime> _lastUnknownReportUtc = new(StringComparer.OrdinalIgnoreCase);
    private bool _registered;
    private int _blacklistSyncSeconds = 120;
    private int _unknownReportSeconds = 60;
    private DateTime _lastHeartbeatUtc = DateTime.MinValue;
    private DateTime _lastBlacklistSyncUtc = DateTime.MinValue;
    private DateTime _lastProcessScanUtc = DateTime.MinValue;
    private DateTime _lastUnknownReportUtcStamp = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!api.HasApiKey)
        {
            logger.LogError("ใส่ Kinof:ApiKey ใน appsettings.json หรือตัวแปร Kinof__ApiKey ก่อนรัน");
            session.Clear("ใส่ Kinof:ApiKey ใน appsettings.json ก่อนรัน");
            return;
        }

        var heartbeatSeconds = Math.Max(5, config.GetValue("Kinof:HeartbeatIntervalSeconds", 20));
        _blacklistSyncSeconds = Math.Max(30, config.GetValue("Kinof:BlacklistSyncIntervalSeconds", 120));
        var processScanSeconds = Math.Max(1, config.GetValue("Kinof:ProcessScanIntervalSeconds", 3));
        _unknownReportSeconds = Math.Max(30, config.GetValue("Kinof:UnknownProgramReportIntervalSeconds", 60));
        logger.LogInformation(
            "KINOF Agent เริ่มทำงาน heartbeat ทุก {Heartbeat} วินาที สแกนโปรแกรมทุก {Scan} วินาที ซิงค์บล็อกเว็บทุก {Sync} วินาที สรุปโปรแกรมไม่รู้จักทุก {Unknown} วินาที",
            heartbeatSeconds,
            processScanSeconds,
            _blacklistSyncSeconds,
            _unknownReportSeconds);

        if (!HostsWebsiteBlocker.IsAdministrator())
        {
            logger.LogWarning(
                "ยังไม่ได้รันด้วยสิทธิ์ Administrator — heartbeat/ล็อกอินใช้ได้ แต่ยังบล็อกเว็บผ่าน hosts ไม่ได้");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            if (_lastHeartbeatUtc == DateTime.MinValue ||
                (now - _lastHeartbeatUtc).TotalSeconds >= heartbeatSeconds)
            {
                try
                {
                    await HeartbeatTickAsync(stoppingToken);
                    _lastHeartbeatUtc = DateTime.UtcNow;
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Agent ติดต่อ API ไม่ได้ จะลองใหม่");
                }
            }

            if (_lastBlacklistSyncUtc == DateTime.MinValue ||
                (now - _lastBlacklistSyncUtc).TotalSeconds >= _blacklistSyncSeconds)
            {
                try
                {
                    await SyncWebsiteBlacklistAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }

            if (_lastProcessScanUtc == DateTime.MinValue ||
                (now - _lastProcessScanUtc).TotalSeconds >= processScanSeconds)
            {
                try
                {
                    await EnforceProgramBlockAsync(stoppingToken);
                    _lastProcessScanUtc = DateTime.UtcNow;
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }

            if (_lastUnknownReportUtcStamp == DateTime.MinValue ||
                (now - _lastUnknownReportUtcStamp).TotalSeconds >= _unknownReportSeconds)
            {
                try
                {
                    await ReportUnknownProgramsAsync(stoppingToken);
                    _lastUnknownReportUtcStamp = DateTime.UtcNow;
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task HeartbeatTickAsync(CancellationToken cancellationToken)
    {
        if (!_registered)
        {
            var registered = await api.RegisterAsync(cancellationToken);
            session.SetSeat(registered.SeatNumber, registered.SeatId, registered.RoomId);
            _registered = true;
        }

        var beat = await api.HeartbeatAsync(cancellationToken);
        if (session.User is null && beat.Session?.UserId is long userId)
        {
            session.SetLoggedIn(new SessionUser
            {
                Id = userId,
                Username = beat.Session.Username,
                DisplayName = beat.Session.DisplayName,
                UserType = beat.Session.UserType
            });
        }
        else if (session.User is not null && beat.Session is null)
        {
            session.Clear("ผู้ดูแลสั่งออกจากระบบแล้ว ที่นั่งถูกปล่อยแล้ว");
        }

        logger.LogInformation(
            "heartbeat ok seat={Seat} kinofUser={User}",
            beat.SeatStatus ?? "-",
            session.User?.Username ?? "-");

        if (beat.ProgramBlacklist is not null)
            programBlocker.UpdateList(beat.ProgramBlacklist);
        else
            await SyncProgramBlacklistAsync(cancellationToken);

        if (beat.ProgramAllowlist is not null)
            programBlocker.UpdateAllowList(beat.ProgramAllowlist);
        else
            await SyncProgramAllowlistAsync(cancellationToken);
    }

    private async Task SyncProgramBlacklistAsync(CancellationToken cancellationToken)
    {
        try
        {
            var processNames = await api.GetProgramBlacklistAsync(cancellationToken);
            programBlocker.UpdateList(processNames);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ซิงค์รายการบล็อกโปรแกรมไม่สำเร็จ จะใช้รายการชุดเดิมไปก่อน");
        }
    }

    private async Task SyncProgramAllowlistAsync(CancellationToken cancellationToken)
    {
        try
        {
            var processNames = await api.GetProgramAllowlistAsync(cancellationToken);
            programBlocker.UpdateAllowList(processNames);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ซิงค์รายการอนุญาตโปรแกรมไม่สำเร็จ จะใช้รายการชุดเดิมไปก่อน");
        }
    }

    private async Task SyncWebsiteBlacklistAsync(CancellationToken cancellationToken)
    {
        try
        {
            var domains = await api.GetWebsiteBlacklistAsync(cancellationToken);
            websiteBlocker.Apply(domains);
            _lastBlacklistSyncUtc = DateTime.UtcNow;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ซิงค์รายการบล็อกเว็บไม่สำเร็จ จะใช้ hosts ชุดเดิมไปก่อน");
        }
    }

    private async Task EnforceProgramBlockAsync(CancellationToken cancellationToken)
    {
        IReadOnlyList<BlockedProcessEvent> killed;
        try
        {
            killed = programBlocker.Enforce();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "สแกน/ปิดโปรแกรมในรายการบล็อกไม่สำเร็จ");
            return;
        }

        var events = killed
            .Where(item => ShouldLog(item.ProcessName))
            .Select(ToLogEvent)
            .ToList();
        if (events.Count == 0)
            return;

        try
        {
            await api.SendLogsAsync(events, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ส่ง log บล็อกโปรแกรมไม่สำเร็จ Monitor อาจยังไม่เห็นรอบนี้");
        }
    }

    private async Task ReportUnknownProgramsAsync(CancellationToken cancellationToken)
    {
        IReadOnlyList<string> unknown;
        try
        {
            unknown = programBlocker.ListUnknown();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "สรุปโปรแกรมที่ไม่รู้จักไม่สำเร็จ");
            return;
        }

        var events = unknown
            .Where(ShouldReportUnknown)
            .Take(40)
            .Select(name => new AgentLogEvent
            {
                EventType = "unknown_program",
                At = DateTimeOffset.UtcNow,
                Data = new
                {
                    program = name,
                    activity = $"พบ {name} (ไม่ใช่รายการอนุญาต/ห้าม)",
                    suspicious = false,
                    source = "agent",
                    userId = session.User?.Id,
                    username = session.User?.Username,
                    displayName = session.User?.DisplayName,
                    userType = session.User?.UserType
                }
            })
            .ToList();
        if (events.Count == 0)
            return;

        try
        {
            await api.SendLogsAsync(events, cancellationToken);
            logger.LogInformation("สรุปโปรแกรมที่ไม่รู้จัก {Count} รายการ", events.Count);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "ส่งสรุปโปรแกรมที่ไม่รู้จักไม่สำเร็จ");
        }
    }

    private bool ShouldReportUnknown(string processName)
    {
        var now = DateTime.UtcNow;
        if (_lastUnknownReportUtc.TryGetValue(processName, out var last) &&
            (now - last).TotalMinutes < 5)
        {
            return false;
        }

        _lastUnknownReportUtc[processName] = now;
        return true;
    }

    private bool ShouldLog(string processName)
    {
        var now = DateTime.UtcNow;
        if (_lastLoggedBlockUtc.TryGetValue(processName, out var last) &&
            (now - last).TotalSeconds < 30)
        {
            return false;
        }

        _lastLoggedBlockUtc[processName] = now;
        return true;
    }

    private AgentLogEvent ToLogEvent(BlockedProcessEvent blocked)
    {
        var user = session.User;
        return new AgentLogEvent
        {
            EventType = "program",
            At = DateTimeOffset.UtcNow,
            Data = new
            {
                program = blocked.ProcessName,
                activity = $"บล็อก {blocked.ProcessName}",
                suspicious = true,
                matchedPattern = blocked.ProcessName,
                source = "agent",
                pid = blocked.Pid,
                userId = user?.Id,
                username = user?.Username,
                displayName = user?.DisplayName,
                userType = user?.UserType
            }
        };
    }
}
