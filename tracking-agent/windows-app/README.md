# KINOF Windows Agent for NestJS

Imported from Virus260710/Kinof-project at 23bfe9e and adapted to this repository.

Requires .NET SDK 8 and Windows. Backend runs on port 3000.
Create a per-computer Agent key from the admin Tracking screen. No seeded dev key is accepted.

Run from PowerShell as Administrator (hosts rules require elevation):

```powershell
cd C:\Users\User\OneDrive\Desktop\kinof2\tracking-agent\windows-app
$env:Kinof__ApiBaseUrl = "http://localhost:3000"
$env:Kinof__ApiKey = "KEY_FROM_ADMIN"
dotnet run
```

Use the Backend host's IP when running on a different PC or VM. Keep the key private.
Do not run the legacy PowerShell Agent for the same computer simultaneously.

Endpoints use /lab/agent and X-Agent-Key. User, room, seat and agent identifiers
are numeric MySQL identifiers. Login verifies the KINOF password and a separate
email OTP challenge; valid booking or class access is required at login time.
Production delivery uses the Backend ENTRY_OTP_WEBHOOK_URL and Bearer webhook key.
Development without a webhook returns a test OTP to the login form.

Kiosk face and emergency OTP authorize the door only. Agent login assigns its own
computer. Agent logout or an admin logout command releases that computer.

Program rules and website rules are synchronized periodically. Protected Windows
processes are excluded from termination. Hosts changes are limited to the KINOF
marker block. The browser extension remains the component for browser activity;
this desktop app reports unknown and blocked processes and heartbeat.

Closing/minimizing the form keeps the tray app running. Use the tray menu to exit.
Do not install this interactive UI in Windows Service session 0.

Compilation was verified on .NET SDK 8.0.425 with zero errors and warnings.
Actual process blocking, hosts changes and email delivery need a running-system test.
