<#
.SYNOPSIS
    Simulates a KINOF tracking agent until the real Windows agent exists (Phase 7).

.DESCRIPTION
    Registers with the backend using an agent API key, then loops sending heartbeats
    and a small stream of sample events (login / program / website / suspicious).
    The seeded development keys are "dev-agent-key-1" and "dev-agent-key-2", which are
    bound to the first two seats of the first lab room.

.EXAMPLE
    ./scripts/simulate-agent.ps1
    ./scripts/simulate-agent.ps1 -ApiKey dev-agent-key-2 -Username 65010022 -Website ufaflow2.com
    ./scripts/simulate-agent.ps1 -Logout
#>
[CmdletBinding()]
param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$ApiKey = "dev-agent-key-1",
    [string]$Hostname = "PC-LAB-1-01",

    # User that the simulated session belongs to.
    [string]$Username = "student",
    [string]$DisplayName = "สมหญิง ต.",
    [string]$UserType = "นักศึกษา",
    [string]$UserId,

    [string]$Program = "Google Chrome",
    [string]$Website = "docs.google.com",

    # How long to keep sending heartbeats, and how often.
    [int]$DurationSeconds = 120,
    [int]$HeartbeatSeconds = 20,

    # Send only a logout event and exit.
    [switch]$Logout,

    # Skip the sample events and only keep the heartbeat alive.
    [switch]$HeartbeatOnly
)

$ErrorActionPreference = "Stop"
$headers = @{ "X-Agent-Key" = $ApiKey }

function Invoke-Agent {
    param(
        [Parameter(Mandatory)][string]$Path,
        $Body
    )
    $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 6 } else { "{}" }
    return Invoke-RestMethod -Uri "$ApiUrl$Path" -Method Post -Headers $headers `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
}

function New-EventData {
    param([hashtable]$Extra = @{})
    $data = @{
        username    = $Username
        displayName = $DisplayName
        userType    = $UserType
    }
    if ($UserId) { $data.userId = $UserId }
    foreach ($key in $Extra.Keys) { $data[$key] = $Extra[$key] }
    return $data
}

function Send-Events {
    param([array]$Events)
    $result = Invoke-Agent -Path "/api/agent/logs" -Body @{ events = $Events }
    Write-Host ("  logs   -> accepted={0} flagged={1} skipped={2}" -f $result.accepted, $result.flagged, $result.skipped)
}

Write-Host "KINOF agent simulator" -ForegroundColor Cyan
Write-Host "  api      : $ApiUrl"
Write-Host "  hostname : $Hostname"

$registration = Invoke-Agent -Path "/api/agent/register" -Body @{ apiKey = $ApiKey; hostname = $Hostname }
Write-Host ("  register -> agentId={0} seatId={1}" -f $registration.agentId, $registration.seatId) -ForegroundColor Green

if ($Logout) {
    Send-Events -Events @(
        @{ eventType = "logout"; data = (New-EventData); at = (Get-Date).ToUniversalTime().ToString("o") }
    )
    Write-Host "ออกจากระบบแล้ว" -ForegroundColor Yellow
    exit 0
}

if (-not $HeartbeatOnly) {
    $now = (Get-Date).ToUniversalTime()
    Send-Events -Events @(
        @{
            eventType = "login"
            data      = (New-EventData)
            at        = $now.AddMinutes(-25).ToString("o")
        },
        @{
            eventType = "program"
            data      = (New-EventData @{ program = $Program; durationMinutes = 24 })
            at        = $now.AddMinutes(-20).ToString("o")
        },
        @{
            eventType = "website"
            data      = (New-EventData @{ website = $Website; durationMinutes = 12 })
            at        = $now.AddMinutes(-8).ToString("o")
        },
        @{
            eventType = "suspicious"
            data      = (New-EventData @{ activity = "พยายามเปิดโปรแกรมที่ไม่ได้รับอนุญาต"; program = "GameLauncher.exe" })
            at        = $now.AddMinutes(-3).ToString("o")
        }
    )
}

$deadline = (Get-Date).AddSeconds($DurationSeconds)
Write-Host "heartbeat ทุก $HeartbeatSeconds วินาที จนถึง $($deadline.ToString('HH:mm:ss')) (Ctrl+C เพื่อหยุด)" -ForegroundColor Cyan

while ((Get-Date) -lt $deadline) {
    $beat = Invoke-Agent -Path "/api/agent/heartbeat" -Body @{ hostname = $Hostname }
    Write-Host ("  [{0}] heartbeat ok={1} commands={2}" -f (Get-Date).ToString("HH:mm:ss"), $beat.ok, $beat.commands.Count)
    Start-Sleep -Seconds $HeartbeatSeconds
}

Write-Host "จบการจำลอง — เครื่องจะกลายเป็น offline หลังจากไม่มี heartbeat 60 วินาที" -ForegroundColor Yellow
