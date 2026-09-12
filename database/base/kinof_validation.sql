-- KINOF Smart Lab - Read-only validation and demo queries
-- Safe to run repeatedly. This file does not change data.

USE `kinof`;

-- 1) Core structure checks.
SELECT
  'table_count_is_16' AS test_name,
  IF(COUNT(*) = 16, 'PASS', CONCAT('FAIL: found ', COUNT(*))) AS result
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_TYPE = 'BASE TABLE'
UNION ALL
SELECT
  'subjects.enrolled_students_removed',
  IF(COUNT(*) = 0, 'PASS', 'FAIL: column still exists')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_NAME = 'subjects'
  AND COLUMN_NAME = 'enrolled_students'
UNION ALL
SELECT
  'bookings.room_id_is_nullable',
  IF(COUNT(*) = 1, 'PASS', 'FAIL')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'room_id'
  AND IS_NULLABLE = 'YES'
UNION ALL
SELECT
  'bookings.reserved_seats_exists',
  IF(COUNT(*) = 1, 'PASS', 'FAIL')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_NAME = 'bookings'
  AND COLUMN_NAME = 'reserved_seats'
UNION ALL
SELECT
  'pc_sessions.uses_computer_id',
  IF(
    SUM(COLUMN_NAME = 'computer_id') = 1
    AND SUM(COLUMN_NAME IN ('machine_no', 'room_id', 'ip_address')) = 0,
    'PASS', 'FAIL'
  )
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_NAME = 'pc_sessions'
UNION ALL
SELECT
  'usage_logs.machine_no_removed',
  IF(COUNT(*) = 0, 'PASS', 'FAIL: column still exists')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'kinof'
  AND TABLE_NAME = 'usage_logs'
  AND COLUMN_NAME = 'machine_no';

-- 2) Foreign keys. Review that every referenced table/column is correct.
SELECT
  TABLE_NAME,
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'kinof'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

-- 3) Required checks, views and procedure.
SELECT
  CONSTRAINT_NAME,
  CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'kinof'
ORDER BY CONSTRAINT_NAME;

SELECT
  TABLE_NAME AS view_name
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = 'kinof'
ORDER BY TABLE_NAME;

SELECT
  ROUTINE_NAME,
  ROUTINE_TYPE
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'kinof'
ORDER BY ROUTINE_NAME;

-- 4) Data validity checks. Every result below should return zero rows.
SELECT id, room_name, capacity
FROM rooms
WHERE capacity <= 0;

SELECT id, term_name, start_date, end_date
FROM academic_terms
WHERE end_date <= start_date;

SELECT id, subject_code, section, start_time, end_time
FROM subjects
WHERE end_time <= start_time;

SELECT id, reserved_seats
FROM bookings
WHERE reserved_seats <= 0;

SELECT id, status, room_id
FROM bookings
WHERE status IN ('confirmed', 'completed', 'no_show')
  AND room_id IS NULL;

SELECT id, login_time, logout_time
FROM pc_sessions
WHERE logout_time IS NOT NULL
  AND logout_time < login_time;

SELECT id, duration_minutes, start_time, end_time
FROM usage_logs
WHERE (duration_minutes IS NOT NULL AND duration_minutes < 0)
   OR (end_time IS NOT NULL AND end_time < start_time);

-- 5) Useful Backend-facing results.
SELECT *
FROM v_subject_active_enrollments
ORDER BY subject_id;

SELECT *
FROM v_booking_group_progress
ORDER BY booking_id;

SELECT *
FROM v_room_slot_usage
ORDER BY booking_date, time_slot, room_id;

-- Load-balance demo: candidates are ordered by best fit.
-- The procedure keeps the whole group together and excludes class schedules.
CALL sp_find_available_rooms('2026-09-09', '09:00-11:30', 3);
