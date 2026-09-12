<#
.SYNOPSIS
  KINOF Windows Tracking Agent (MVP production path).

.DESCRIPTION
  Sends authenticated heartbeats, records newly started desktop programs,
  retries events after network outages, receives admin commands and optionally
  enforces the server blocklist through the Windows hosts file.

  The script never records keystrokes, document titles, file contents or passwords.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ApiKey,
    [string]$ApiUrl = "http://localhost:3000",
    [int]$HeartbeatSeconds = 20,
    [string]$QueuePath = "$env:ProgramData\KINOF\event-queue.jsonl",
    [switch]$EnableHostsBlocking,
    [switch]$AllowRemoteSessionCommands
)

$ErrorActionPreference = "Stop"
$agentVersion = "1.0.0"
$headers = @{ "X-Agent-Key" = $ApiKey }
$ignoredProcesses = @(
    "Idle", "System", "Registry", "Memory Compression", "svchost",
    "conhost", "csrss", "wininit", "winlogon", "services", "lsass"
)
$knownProcesses = @{}

if (-not $ApiUrl.StartsWith("https://") -and -not $ApiUrl.StartsWith("http://localhost") -and -not $ApiUrl.StartsWith("http://127.0.0.1")) {
    throw "ApiUrl ต้องใช้ HTTPS ยกเว้น localhost"
}

$queueDirectory = Split-Path -Parent $QueuePath
if (-not (Test-Path -LiteralPath $queueDirectory)) {
    New-Item -ItemType Directory -Path $queueDirectory -Force | Out-Null
}

function Invoke-KinofApi {
    param(
        [Parameter(Mandatory)][ValidateSet("Get", "Post")][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        $Body
    )
    $parameters = @{
        Uri = "$ApiUrl$Path"
        Method = $Method
        Headers = $headers
        TimeoutSec = 15
    }
    if ($null -ne $Body) {
        $parameters.ContentType = "application/json; charset=utf-8"
        $parameters.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress))
    }
    Invoke-RestMethod @parameters
}

function New-AgentEvent {
    param([string]$Type, [string]$Name, [hashtable]$Metadata = @{})
    @{
        event_id = [guid]::NewGuid().ToString()
        event_type = $Type
        name = $Name
        occurred_at = [DateTime]::UtcNow.ToString("o")
        metadata = $Metadata
    }
}

function Add-QueuedEvent {
    param([hashtable]$Event)
    Add-Content -LiteralPath $QueuePath -Value ($Event | ConvertTo-Json -Depth 8 -Compress) -Encoding UTF8
}

function Send-QueuedEvents {
    if (-not (Test-Path -LiteralPath $QueuePath)) { return }
    $lines = @(Get-Content -LiteralPath $QueuePath | Where-Object { $_.Trim() })
    if ($lines.Count -eq 0) { return }

    $events = @($lines | ForEach-Object { $_ | ConvertFrom-Json })
    try {
        Invoke-KinofApi -Method Post -Path "/agent/events" -Body @{ events = $events } | Out-Null
        Clear-Content -LiteralPath $QueuePath
    } catch {
        Write-Warning "ส่ง event queue ไม่สำเร็จ: $($_.Exception.Message)"
    }
}

function Get-NewProgramEvents {
    $current = @{}
    foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
        $key = "$($process.Id):$($process.StartTime.Ticks)"
        $current[$key] = $true
        if (-not $knownProcesses.ContainsKey($key) -and $ignoredProcesses -notcontains $process.ProcessName) {
            Add-QueuedEvent (New-AgentEvent -Type "program" -Name $process.ProcessName -Metadata @{
                process_id = $process.Id
                executable = $process.ProcessName
            })
        }
    }
    $script:knownProcesses = $current
}

function Set-HostsBlocklist {
    if (-not $EnableHostsBlocking) { return }
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $startMarker = "# KINOF BLOCKLIST START"
    $endMarker = "# KINOF BLOCKLIST END"
    $rules = @(Invoke-KinofApi -Method Get -Path "/agent/blocklist")
    $domains = @($rules | Where-Object { $_.action -eq "block" } | ForEach-Object { $_.domain_name } | Sort-Object -Unique)
    $existing = @(Get-Content -LiteralPath $hostsPath)
    $result = [Collections.Generic.List[string]]::new()
    $inside = $false
    foreach ($line in $existing) {
        if ($line -eq $startMarker) { $inside = $true; continue }
        if ($line -eq $endMarker) { $inside = $false; continue }
        if (-not $inside) { $result.Add($line) }
    }
    $result.Add($startMarker)
    foreach ($domain in $domains) {
        $result.Add("0.0.0.0 $domain")
        $result.Add("0.0.0.0 www.$domain")
    }
    $result.Add($endMarker)
    Set-Content -LiteralPath $hostsPath -Value $result -Encoding ASCII
    Clear-DnsClientCache
}

function Complete-Command {
    param([long]$Id, [string]$Status, [string]$Message)
    Invoke-KinofApi -Method Post -Path "/agent/commands/$Id/result" -Body @{
        status = $Status
        message = $Message
    } | Out-Null
}

function Invoke-AgentCommand {
    param($Command)
    try {
        switch ($Command.type) {
            "sync_blocklist" {
                Set-HostsBlocklist
                Complete-Command $Command.id "completed" "blocklist synced"
            }
            "lock" {
                if (-not $AllowRemoteSessionCommands) { throw "remote session commands disabled" }
                Start-Process -FilePath "rundll32.exe" -ArgumentList "user32.dll,LockWorkStation" -WindowStyle Hidden
                Complete-Command $Command.id "completed" "workstation locked"
            }
            "logout" {
                if (-not $AllowRemoteSessionCommands) { throw "remote session commands disabled" }
                Complete-Command $Command.id "completed" "logout accepted"
                Start-Process -FilePath "shutdown.exe" -ArgumentList "/l" -WindowStyle Hidden
            }
            "close_program" {
                $name = [string]$Command.payload.process_name
                if ($name -notmatch '^[A-Za-z0-9._-]{1,80}$') { throw "invalid process_name" }
                Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
                Complete-Command $Command.id "completed" "program closed"
            }
            default { throw "unsupported command" }
        }
    } catch {
        Complete-Command $Command.id "failed" $_.Exception.Message
    }
}

Write-Host "KINOF Tracking Agent $agentVersion" -ForegroundColor Cyan
Invoke-KinofApi -Method Post -Path "/agent/register" -Body @{
    hostname = $env:COMPUTERNAME
    agent_version = $agentVersion
} | Out-Null

foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
    $knownProcesses["$($process.Id):$($process.StartTime.Ticks)"] = $true
}

while ($true) {
    try {
        Get-NewProgramEvents
        Send-QueuedEvents
        $heartbeat = Invoke-KinofApi -Method Post -Path "/agent/heartbeat" -Body @{
            hostname = $env:COMPUTERNAME
            agent_version = $agentVersion
        }
        foreach ($command in @($heartbeat.commands)) { Invoke-AgentCommand $command }
    } catch {
        Write-Warning "Agent ติดต่อ Backend ไม่สำเร็จ: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds ([Math]::Max(5, $HeartbeatSeconds))
}
