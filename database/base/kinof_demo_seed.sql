-- KINOF Smart Lab - Fake demo data
-- Run ONLY after the final schema exists and only on an empty/demo database.
-- All people, emails, identifiers, IPs and MAC addresses below are fictional.

USE `kinof`;
START TRANSACTION;

INSERT INTO `admins`
  (`id`, `email`, `first_name`, `last_name`, `password_hash`, `role`, `status`)
VALUES
  (1, 'admin.demo@example.com', 'Demo', 'Admin',
   'DEMO_HASH_REPLACE_WITH_BACKEND_GENERATED_HASH', 'super_admin', 'active');

INSERT INTO `users`
  (`id`, `email`, `username`, `password_hash`, `first_name`, `last_name`,
   `phone`, `role`, `usage_score`, `is_active`, `is_verified`, `google_id`)
VALUES
  (1, 'student01@example.com', 'student01', NULL, 'Anan', 'Demo',
   '0800000001', 'student', 100, 1, 1, 'demo-google-001'),
  (2, 'student02@example.com', 'student02', NULL, 'Boon', 'Demo',
   '0800000002', 'student', 100, 1, 1, 'demo-google-002'),
  (3, 'student03@example.com', 'student03', NULL, 'Chai', 'Demo',
   '0800000003', 'student', 95, 1, 1, 'demo-google-003'),
  (4, 'student04@example.com', 'student04', NULL, 'Dao', 'Demo',
   '0800000004', 'student', 100, 1, 1, 'demo-google-004'),
  (5, 'student05@example.com', 'student05', NULL, 'Eak', 'Demo',
   '0800000005', 'student', 100, 1, 1, 'demo-google-005'),
  (6, 'external01@example.com', 'external01', NULL, 'Fah', 'Demo',
   '0800000006', 'external', 100, 1, 1, 'demo-google-006');

INSERT INTO `rooms` (`id`, `room_name`, `capacity`, `status`)
VALUES
  (1, 'LAB-A', 40, 'active'),
  (2, 'LAB-B', 30, 'active'),
  (3, 'LAB-C', 20, 'active');

INSERT INTO `academic_terms`
  (`id`, `term_name`, `start_date`, `end_date`, `status`)
VALUES
  (1, '1/2026', '2026-08-01', '2026-12-15', 'active');

INSERT INTO `subjects`
  (`id`, `subject_code`, `subject_name`, `section`, `class_type`,
   `instructor_name`, `day_of_week`, `start_time`, `end_time`, `term_id`, `room_id`)
VALUES
  (1, 'CS101', 'Database Fundamentals', '1', 'LAB',
   'Instructor Demo A', 'Monday', '09:00:00', '11:30:00', 1, 1),
  (2, 'IT201', 'Computer Networks', '1', 'LAB',
   'Instructor Demo B', 'Tuesday', '14:00:00', '16:30:00', 1, 2);

INSERT INTO `subject_enrollments`
  (`id`, `subject_id`, `user_id`, `status`)
VALUES
  (1, 1, 1, 'active'),
  (2, 1, 2, 'active'),
  (3, 1, 3, 'active'),
  (4, 1, 4, 'dropped'),
  (5, 2, 4, 'active'),
  (6, 2, 5, 'active');

INSERT INTO `lab_computers`
  (`id`, `machine_no`, `room_id`, `ip_address`, `mac_address`, `status`, `last_seen_at`)
VALUES
  (1, 'A-01', 1, '192.0.2.11', '02:00:00:00:01:01', 'online', CURRENT_TIMESTAMP),
  (2, 'A-02', 1, '192.0.2.12', '02:00:00:00:01:02', 'offline', NULL),
  (3, 'B-01', 2, '192.0.2.21', '02:00:00:00:02:01', 'online', CURRENT_TIMESTAMP),
  (4, 'B-02', 2, '192.0.2.22', '02:00:00:00:02:02', 'maintenance', NULL),
  (5, 'C-01', 3, '192.0.2.31', '02:00:00:00:03:01', 'online', CURRENT_TIMESTAMP),
  (6, 'C-02', 3, '192.0.2.32', '02:00:00:00:03:02', 'offline', NULL);

-- A confirmed solo booking. The user does not choose a seat.
INSERT INTO `bookings`
  (`id`, `booking_date`, `time_slot`, `reserved_seats`, `status`,
   `created_at`, `confirmed_at`, `host_id`, `room_id`)
VALUES
  (1, '2026-09-09', '09:00-11:30', 1, 'confirmed',
   '2026-08-27 09:00:00', '2026-08-27 09:00:02', 1, 3);

-- A group waiting for the Backend to call the load balancer.
-- Host is users.id=2; invited members are users.id=3 and 4.
INSERT INTO `bookings`
  (`id`, `booking_date`, `time_slot`, `reserved_seats`, `status`,
   `created_at`, `expires_at`, `host_id`, `room_id`)
VALUES
  (2, '2026-09-09', '14:00-16:30', 3, 'pending',
   CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), 2, NULL);

INSERT INTO `booking_members`
  (`id`, `invite_status`, `invited_at`, `responded_at`, `booking_id`, `user_id`)
VALUES
  (1, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 3),
  (2, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 2, 4);

INSERT INTO `pc_sessions`
  (`id`, `computer_id`, `login_time`, `logout_time`, `status`, `user_id`)
VALUES
  (1, 1, '2026-08-27 09:00:00', '2026-08-27 10:00:00', 'offline', 1);

INSERT INTO `usage_logs`
  (`id`, `log_type`, `name`, `duration_minutes`, `is_suspicious`,
   `start_time`, `end_time`, `session_id`)
VALUES
  (1, 'program', 'Visual Studio Code', 45, 0,
   '2026-08-27 09:05:00', '2026-08-27 09:50:00', 1),
  (2, 'website', 'example.test', 5, 0,
   '2026-08-27 09:50:00', '2026-08-27 09:55:00', 1);

INSERT INTO `blocked_domains`
  (`id`, `domain_name`, `reason`, `added_by`)
VALUES
  (1, 'blocked-example.test', 'Demo blocked domain', 1);

INSERT INTO `issues`
  (`id`, `category`, `title`, `description`, `status`, `user_id`, `admin_id`)
VALUES
  (1, 'computer', 'Demo keyboard issue',
   'Keyboard on demo computer A-02 is not responding.', 'pending', 2, NULL);

INSERT INTO `issue_images` (`id`, `image_url`, `issue_id`)
VALUES
  (1, '/demo/issues/keyboard-a02.png', 1);

INSERT INTO `penalty_logs`
  (`id`, `points`, `reason`, `user_id`, `admin_id`)
VALUES
  (1, 5, 'Demo late logout penalty', 3, 1);

INSERT INTO `audit_logs` (`id`, `action`, `admin_id`)
VALUES
  (1, 'Created demo blocked domain', 1);

COMMIT;

SELECT 'KINOF demo data inserted' AS result;
