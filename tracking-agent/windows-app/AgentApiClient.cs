using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kinof.Agent;

internal sealed class SessionUser
{
    public long Id { get; set; }
    public string? Username { get; set; }
    public string? DisplayName { get; set; }
    public string? UserType { get; set; }
}

internal sealed class SessionInfo
{
    public long? UserId { get; set; }
    public string? Username { get; set; }
    public string? DisplayName { get; set; }
    public string? UserType { get; set; }
}

internal sealed class HeartbeatResult
{
    public bool Ok { get; set; }
    public string? SeatStatus { get; set; }
    public SessionInfo? Session { get; set; }
    public List<string>? ProgramBlacklist { get; set; }
    public List<string>? ProgramAllowlist { get; set; }
}

internal sealed class RegisterResult
{
    public long AgentId { get; set; }
    public long SeatId { get; set; }
    public long RoomId { get; set; }
    public int SeatNumber { get; set; }
    public string? Hostname { get; set; }
}

internal sealed class SessionLoginStartResult
{
    public bool RequiresOtp { get; set; }
    public long UserId { get; set; }
    public string? MaskedEmail { get; set; }
    public string? DeliveryMode { get; set; }
    public string? DevOtp { get; set; }
}

internal sealed class SessionVerifyResult
{
    public bool Ok { get; set; }
    public SessionUser? User { get; set; }
}

internal sealed class WebsiteBlacklistResult
{
    public List<string> Domains { get; set; } = [];
}

internal sealed class ProgramBlacklistResult
{
    public List<string> ProcessNames { get; set; } = [];
}

internal sealed class AgentLogEvent
{
    public string EventType { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public object? Data { get; set; }
}

internal sealed class AgentApiClient
{
    public const string ApiKeyHeader = "X-Agent-Key";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly ILogger<AgentApiClient> _logger;
    private readonly string _baseUrl;
    private readonly string _apiKey;

    public AgentApiClient(IConfiguration config, ILogger<AgentApiClient> logger)
    {
        _logger = logger;
        _baseUrl = (config["Kinof:ApiBaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
        _apiKey = (config["Kinof:ApiKey"] ?? "").Trim();
    }

    public bool HasApiKey => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<RegisterResult> RegisterAsync(CancellationToken cancellationToken)
    {
        var body = new { apiKey = _apiKey, hostname = Environment.MachineName };
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/register", body, cancellationToken);
        await EnsureSuccessAsync(response, "register", cancellationToken);
        var result = await response.Content.ReadFromJsonAsync<RegisterResult>(JsonOptions, cancellationToken)
            ?? throw new HttpRequestException("ลงทะเบียน Agent ไม่สำเร็จ");
        _logger.LogInformation(
            "ลงทะเบียน Agent แล้ว hostname={Hostname} seat={Seat}",
            Environment.MachineName,
            result.SeatNumber);
        return result;
    }

    public async Task<HeartbeatResult> HeartbeatAsync(CancellationToken cancellationToken)
    {
        var body = new { hostname = Environment.MachineName };
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/heartbeat", body, cancellationToken);
        await EnsureSuccessAsync(response, "heartbeat", cancellationToken);
        return await response.Content.ReadFromJsonAsync<HeartbeatResult>(JsonOptions, cancellationToken)
            ?? new HeartbeatResult();
    }

    public async Task<SessionLoginStartResult> StartLoginAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        var body = new { username, password };
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/session/login", body, cancellationToken);
        await EnsureSuccessAsync(response, "login", cancellationToken);
        return await response.Content.ReadFromJsonAsync<SessionLoginStartResult>(JsonOptions, cancellationToken)
            ?? throw new HttpRequestException("เข้าสู่ระบบไม่สำเร็จ");
    }

    public async Task<SessionVerifyResult> VerifyOtpAsync(
        long userId,
        string code,
        CancellationToken cancellationToken)
    {
        var body = new { userId, code };
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/session/verify-otp", body, cancellationToken);
        await EnsureSuccessAsync(response, "verify-otp", cancellationToken);
        return await response.Content.ReadFromJsonAsync<SessionVerifyResult>(JsonOptions, cancellationToken)
            ?? throw new HttpRequestException("ยืนยัน OTP ไม่สำเร็จ");
    }

    public async Task<SessionLoginStartResult> ResendOtpAsync(long userId, CancellationToken cancellationToken)
    {
        var body = new { userId };
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/session/resend-otp", body, cancellationToken);
        await EnsureSuccessAsync(response, "resend-otp", cancellationToken);
        return await response.Content.ReadFromJsonAsync<SessionLoginStartResult>(JsonOptions, cancellationToken)
            ?? new SessionLoginStartResult();
    }

    public async Task LogoutSessionAsync(CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/session/logout", new { }, cancellationToken);
        await EnsureSuccessAsync(response, "logout", cancellationToken);
        _logger.LogInformation("ออกจากระบบเครื่องแล้ว ที่นั่ง Available");
    }

    public async Task<IReadOnlyList<string>> GetWebsiteBlacklistAsync(CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Get, "/lab/agent/website-blacklist", cancellationToken);
        await EnsureSuccessAsync(response, "website-blacklist", cancellationToken);
        var result = await response.Content.ReadFromJsonAsync<WebsiteBlacklistResult>(JsonOptions, cancellationToken)
            ?? new WebsiteBlacklistResult();
        return result.Domains ?? [];
    }

    public async Task<IReadOnlyList<string>> GetProgramBlacklistAsync(CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Get, "/lab/agent/program-blacklist", cancellationToken);
        await EnsureSuccessAsync(response, "program-blacklist", cancellationToken);
        var result = await response.Content.ReadFromJsonAsync<ProgramBlacklistResult>(JsonOptions, cancellationToken)
            ?? new ProgramBlacklistResult();
        return result.ProcessNames ?? [];
    }

    public async Task<IReadOnlyList<string>> GetProgramAllowlistAsync(CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Get, "/lab/agent/program-allowlist", cancellationToken);
        await EnsureSuccessAsync(response, "program-allowlist", cancellationToken);
        var result = await response.Content.ReadFromJsonAsync<ProgramBlacklistResult>(JsonOptions, cancellationToken)
            ?? new ProgramBlacklistResult();
        return result.ProcessNames ?? [];
    }

    public async Task SendLogsAsync(IReadOnlyList<AgentLogEvent> events, CancellationToken cancellationToken)
    {
        if (events.Count == 0)
            return;
        using var response = await SendAsync(HttpMethod.Post, "/lab/agent/logs", new { events }, cancellationToken);
        await EnsureSuccessAsync(response, "logs", cancellationToken);
    }

    private Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        CancellationToken cancellationToken) =>
        SendAsync(method, path, null, cancellationToken);

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        object? body,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, $"{_baseUrl}{path}");
        request.Headers.TryAddWithoutValidation(ApiKeyHeader, _apiKey);
        if (body is not null)
            request.Content = JsonContent.Create(body, options: JsonOptions);
        return await _http.SendAsync(request, cancellationToken);
    }

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        string action,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
            return;

        var detail = await response.Content.ReadAsStringAsync(cancellationToken);
        throw new HttpRequestException(ReadMessage(detail) ?? $"{action} ไม่สำเร็จ ({(int)response.StatusCode})");
    }

    private static string? ReadMessage(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty("message", out var message) &&
                message.ValueKind == JsonValueKind.String)
            {
                return message.GetString();
            }
        }
        catch (JsonException)
        {
            // Fall through to the raw body.
        }

        return string.IsNullOrWhiteSpace(json) ? null : json;
    }
}
