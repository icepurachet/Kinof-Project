# Upstream integration — 2026-09-17

Source: Virus260710/Kinof-project at 23bfe9e126a69b1c89aafd6b47941cfc679b108f.
Backend remains the existing NestJS/MySQL application.

## Imported and connected

- Latest user booking, invitations, home, profile, emergency entry OTP, Sidebar,
  Toast, face capture, Kiosk, Monitor, Tracking, Export and Help Center changes.
- Monthly behavior score: 100 points, 5-point no-show deduction, booking minimum
  50 points, Bangkok month reset. Reviews persist and cannot deduct twice.
- Program allowlist/blacklist and unknown-program counts with room/date filters.
- Website category import from UT1, preserving manually created domain rules.
- Review queue, clear/block actions, and navigation badges.
- Kiosk device keys: create once, hashed storage, room binding, revoke.
- Kiosk face/OTP authorizes the door; the Windows Agent allocates its own seat.
- Windows desktop Agent imported into tracking-agent/windows-app and adapted
  from GUID identifiers to numeric MySQL IDs and the NestJS port 3000.
- Real CSV and XLSX downloads with room and date filters.
- Staff progress replies use the existing issues.admin_reply field.

## Existing behavior retained

- Admin and super-admin authentication, account provisioning and audit logs.
- Current database records, configuration, frontend auth adapters, managed users,
  computers, schedules, old PowerShell Agent and browser extension.
- Face Service: upstream has no changes relative to the imported baseline.
  Keep the currently configured service and matching FACE_SERVICE_API_KEY.
- Browser sign-in and registration now require email OTP, including Admin and
  Super Admin. Imported OtpVerify UI is connected to our NestJS authentication.
  Password-only HTTP login no longer issues tokens. A random challenge binds
  the account type, expires in 10 minutes and permits five verification attempts.
  Resend cooldown is 60 seconds, with five sends per challenge; resend does not
  reset the attempt budget. Challenges are single-use and kept in process memory;
  a restart requires signing in again. Multi-instance hosting needs shared storage.
  LOGIN_OTP_WEBHOOK_URL/KEY can configure login delivery, falling back to the
  existing ENTRY_OTP_WEBHOOK_URL/KEY sender. Production fails closed without a
  sender; development without a sender shows an explicitly labeled test code.
  Desktop Agent and room-entry OTP remain separate challenges.

## Database upgrade

Migration: database/migrations/003_upstream_lab_features.sql, after 001 and 002.
It creates six new tables; it does not overwrite the original schema or seed data.
Back up the database before applying. New feature endpoints require these tables.

## Verification

- Frontend production build passed, including lazy-loaded Excel export.
- NestJS compilation passed.
- Backend: 25 suites, 70 tests passed after browser OTP integration.
- Windows Agent .NET 8 compilation passed with zero warnings/errors.
- Migration 003 applied on 2026-09-18 after tables/data/views/triggers backup.
  Six new tables verified; existing table row counts unchanged. The backup
  excludes untouched routines/events due to the application account privileges.
- Real camera, email delivery, hosts blocking and multi-PC usage still require
  testing on the running system after the database upgrade.
- ExcelJS dependency audit reports a moderate transitive uuid advisory.
  Export writes literal cell strings; it does not use the affected UUID buffer API.
  Existing development tooling audit findings have not been upgraded by force.

See เริ่มใช้งานหลังอัปเดต.txt for commands.

## Latest-source comparison — 2026-09-18

GitHub API confirms upstream HEAD is still 23bfe9e126a69b1c89aafd6b47941cfc679b108f.
All upstream frontend source paths were compared with line endings normalized.
OtpVerify was the missing functional screen and is now imported. mockData.js is
intentionally not used: pages use our actual database rather than fake records.
Remaining differences are backend URL/data adapters, managed admin roles and
guards, camera cleanup, Kiosk device authentication, monthly OTP quota handling,
and the all-members booking-score check. These must not be overwritten blindly.
The existing Face Service and imported Windows Agent are preserved at this
upstream revision; no newer upstream revision was found.
