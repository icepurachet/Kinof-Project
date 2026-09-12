-- KINOF Smart Lab - Final database schema
-- Target: MySQL 8.0+
-- Purpose: create a NEW/EMPTY kinof database.
-- This file does not drop an existing database or existing tables.

SET @OLD_UNIQUE_CHECKS = @@UNIQUE_CHECKS;
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET @OLD_SQL_MODE = @@SQL_MODE;

SET UNIQUE_CHECKS = 0;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS `kinof`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `kinof`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NULL DEFAULT NULL,
  `first_name` VARCHAR(50) NOT NULL,
  `last_name` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(20) NULL,
  `role` ENUM('student', 'external') NOT NULL,
  `totp_secret` VARCHAR(255) NULL,
  `face_embedding` TEXT NULL,
  `usage_score` INT NOT NULL DEFAULT 100,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `google_id` VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_google_id` (`google_id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(100) NOT NULL,
  `first_name` VARCHAR(50) NOT NULL,
  `last_name` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'super_admin') NOT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_email` (`email`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `rooms` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `room_name` VARCHAR(50) NOT NULL,
  `capacity` INT NOT NULL DEFAULT 30,
  `status` ENUM('active', 'maintenance') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rooms_room_name` (`room_name`),
  CONSTRAINT `chk_rooms_capacity` CHECK (`capacity` > 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `academic_terms` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `term_name` VARCHAR(50) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` ENUM('active', 'completed') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academic_terms_term_name` (`term_name`),
  CONSTRAINT `chk_academic_terms_dates` CHECK (`end_date` > `start_date`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `subjects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject_code` VARCHAR(20) NOT NULL,
  `subject_name` VARCHAR(100) NOT NULL,
  `section` VARCHAR(20) NOT NULL,
  `class_type` ENUM('LAB', 'LECT') NOT NULL,
  `instructor_name` VARCHAR(100) NOT NULL,
  `day_of_week` ENUM(
    'Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday'
  ) NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `term_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subjects_term_code_section` (`term_id`, `subject_code`, `section`),
  KEY `idx_subjects_room_schedule` (`room_id`, `day_of_week`, `start_time`, `end_time`),
  CONSTRAINT `fk_subjects_academic_terms`
    FOREIGN KEY (`term_id`) REFERENCES `academic_terms` (`id`),
  CONSTRAINT `fk_subjects_rooms`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`),
  CONSTRAINT `chk_subjects_times` CHECK (`end_time` > `start_time`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `subject_enrollments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subject_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `enrolled_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('active', 'dropped') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subject_enrollments_subject_user` (`subject_id`, `user_id`),
  KEY `idx_subject_enrollments_user_id` (`user_id`),
  CONSTRAINT `fk_subject_enrollments_subject`
    FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`),
  CONSTRAINT `fk_subject_enrollments_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `booking_date` DATE NOT NULL,
  `time_slot` ENUM(
    '09:00-11:30', '11:30-14:00',
    '14:00-16:30', '16:30-19:00'
  ) NOT NULL,
  `reserved_seats` INT NOT NULL DEFAULT 1,
  `status` ENUM(
    'pending', 'confirmed', 'completed',
    'cancelled', 'expired', 'no_show'
  ) NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NULL,
  `confirmed_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `host_id` INT NOT NULL,
  `room_id` INT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bookings_host_id` (`host_id`),
  KEY `idx_bookings_room_id` (`room_id`),
  KEY `idx_bookings_load_balance` (`booking_date`, `time_slot`, `room_id`, `status`),
  CONSTRAINT `fk_bookings_host`
    FOREIGN KEY (`host_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_bookings_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`),
  CONSTRAINT `chk_bookings_reserved_seats` CHECK (`reserved_seats` > 0),
  CONSTRAINT `chk_bookings_expiry`
    CHECK (`expires_at` IS NULL OR `expires_at` > `created_at`),
  CONSTRAINT `chk_bookings_confirmed_room`
    CHECK (`status` NOT IN ('confirmed', 'completed', 'no_show') OR `room_id` IS NOT NULL)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `booking_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invite_status` ENUM('pending', 'accepted', 'declined', 'removed') NOT NULL DEFAULT 'pending',
  `invited_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` DATETIME NULL,
  `removed_at` DATETIME NULL,
  `booking_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_booking_members_booking_user` (`booking_id`, `user_id`),
  KEY `idx_booking_members_user_status` (`user_id`, `invite_status`),
  CONSTRAINT `fk_booking_members_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`),
  CONSTRAINT `fk_booking_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `lab_computers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `machine_no` VARCHAR(10) NOT NULL,
  `room_id` INT NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `mac_address` VARCHAR(17) NULL,
  `status` ENUM('online', 'offline', 'maintenance') NOT NULL DEFAULT 'offline',
  `last_seen_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lab_computers_room_machine` (`room_id`, `machine_no`),
  UNIQUE KEY `uq_lab_computers_mac_address` (`mac_address`),
  KEY `idx_lab_computers_status` (`status`),
  CONSTRAINT `fk_lab_computers_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `pc_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `computer_id` INT NOT NULL,
  `login_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_time` DATETIME NULL,
  `status` ENUM('online', 'offline') NOT NULL DEFAULT 'online',
  `user_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pc_sessions_computer_status` (`computer_id`, `status`),
  KEY `idx_pc_sessions_user_login` (`user_id`, `login_time`),
  CONSTRAINT `fk_pc_sessions_computer`
    FOREIGN KEY (`computer_id`) REFERENCES `lab_computers` (`id`),
  CONSTRAINT `fk_pc_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_pc_sessions_times`
    CHECK (`logout_time` IS NULL OR `logout_time` >= `login_time`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `usage_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `log_type` ENUM('program', 'website') NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `duration_minutes` INT NULL,
  `is_suspicious` TINYINT(1) NOT NULL DEFAULT 0,
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME NULL,
  `session_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_usage_logs_session_id` (`session_id`),
  KEY `idx_usage_logs_suspicious_time` (`is_suspicious`, `start_time`),
  KEY `idx_usage_logs_type_name` (`log_type`, `name`),
  CONSTRAINT `fk_usage_logs_session`
    FOREIGN KEY (`session_id`) REFERENCES `pc_sessions` (`id`),
  CONSTRAINT `chk_usage_logs_duration`
    CHECK (`duration_minutes` IS NULL OR `duration_minutes` >= 0),
  CONSTRAINT `chk_usage_logs_times`
    CHECK (`end_time` IS NULL OR `end_time` >= `start_time`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `blocked_domains` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `domain_name` VARCHAR(255) NOT NULL,
  `reason` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `added_by` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blocked_domains_domain_name` (`domain_name`),
  KEY `idx_blocked_domains_added_by` (`added_by`),
  CONSTRAINT `fk_blocked_domains_admin`
    FOREIGN KEY (`added_by`) REFERENCES `admins` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `issues` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `category` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  `admin_reply` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  `admin_id` INT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_issues_user_id` (`user_id`),
  KEY `idx_issues_admin_status` (`admin_id`, `status`),
  CONSTRAINT `fk_issues_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_issues_admin`
    FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `issue_images` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `image_url` VARCHAR(255) NOT NULL,
  `issue_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_issue_images_issue_id` (`issue_id`),
  CONSTRAINT `fk_issue_images_issue`
    FOREIGN KEY (`issue_id`) REFERENCES `issues` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `penalty_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `points` INT NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  `admin_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_penalty_logs_user_id` (`user_id`),
  KEY `idx_penalty_logs_admin_id` (`admin_id`),
  CONSTRAINT `fk_penalty_logs_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_penalty_logs_admin`
    FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `admin_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_admin_created` (`admin_id`, `created_at`),
  CONSTRAINT `fk_audit_logs_admin`
    FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`)
) ENGINE = InnoDB;

DROP VIEW IF EXISTS `v_subject_active_enrollments`;
CREATE VIEW `v_subject_active_enrollments` AS
SELECT
  s.id AS subject_id,
  s.subject_code,
  s.subject_name,
  s.section,
  s.term_id,
  COUNT(se.id) AS active_student_count
FROM subjects AS s
LEFT JOIN subject_enrollments AS se
  ON se.subject_id = s.id
 AND se.status = 'active'
GROUP BY
  s.id, s.subject_code, s.subject_name, s.section, s.term_id;

DROP VIEW IF EXISTS `v_booking_group_progress`;
CREATE VIEW `v_booking_group_progress` AS
SELECT
  b.id AS booking_id,
  b.host_id,
  b.status AS booking_status,
  b.expires_at,
  b.reserved_seats,
  COALESCE(SUM(bm.invite_status <> 'removed'), 0) AS active_invited_members,
  COALESCE(SUM(bm.invite_status = 'accepted'), 0) AS accepted_members,
  COALESCE(SUM(bm.invite_status = 'pending'), 0) AS pending_members,
  COALESCE(SUM(bm.invite_status = 'declined'), 0) AS declined_members,
  1 + COALESCE(SUM(bm.invite_status <> 'removed'), 0) AS expected_reserved_seats,
  CASE
    WHEN b.status = 'pending'
     AND (b.expires_at IS NULL OR b.expires_at > CURRENT_TIMESTAMP)
     AND COALESCE(SUM(bm.invite_status = 'pending'), 0) = 0
     AND COALESCE(SUM(bm.invite_status = 'declined'), 0) = 0
    THEN 1 ELSE 0
  END AS can_search_room
FROM bookings AS b
LEFT JOIN booking_members AS bm ON bm.booking_id = b.id
GROUP BY
  b.id, b.host_id, b.status, b.expires_at, b.reserved_seats;

DROP VIEW IF EXISTS `v_room_slot_usage`;
CREATE VIEW `v_room_slot_usage` AS
SELECT
  b.room_id,
  b.booking_date,
  b.time_slot,
  SUM(b.reserved_seats) AS used_seats
FROM bookings AS b
WHERE b.status = 'confirmed'
  AND b.room_id IS NOT NULL
GROUP BY b.room_id, b.booking_date, b.time_slot;

DROP PROCEDURE IF EXISTS `sp_find_available_rooms`;
DELIMITER $$
CREATE PROCEDURE `sp_find_available_rooms`(
  IN p_booking_date DATE,
  IN p_time_slot VARCHAR(20),
  IN p_required_seats INT
)
BEGIN
  DECLARE v_slot_start TIME;
  DECLARE v_slot_end TIME;

  IF p_booking_date IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'booking_date is required';
  END IF;

  IF p_required_seats IS NULL OR p_required_seats <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'required_seats must be greater than zero';
  END IF;

  SET v_slot_start = CASE p_time_slot
    WHEN '09:00-11:30' THEN '09:00:00'
    WHEN '11:30-14:00' THEN '11:30:00'
    WHEN '14:00-16:30' THEN '14:00:00'
    WHEN '16:30-19:00' THEN '16:30:00'
    ELSE NULL
  END;

  SET v_slot_end = CASE p_time_slot
    WHEN '09:00-11:30' THEN '11:30:00'
    WHEN '11:30-14:00' THEN '14:00:00'
    WHEN '14:00-16:30' THEN '16:30:00'
    WHEN '16:30-19:00' THEN '19:00:00'
    ELSE NULL
  END;

  IF v_slot_start IS NULL OR v_slot_end IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'invalid time_slot';
  END IF;

  SELECT
    r.id AS room_id,
    r.room_name,
    r.capacity,
    COALESCE(u.used_seats, 0) AS used_seats,
    r.capacity - COALESCE(u.used_seats, 0) AS available_seats,
    r.capacity - COALESCE(u.used_seats, 0) - p_required_seats
      AS remaining_after_assignment
  FROM rooms AS r
  LEFT JOIN (
    SELECT
      b.room_id,
      SUM(b.reserved_seats) AS used_seats
    FROM bookings AS b
    WHERE b.booking_date = p_booking_date
      AND b.time_slot = p_time_slot
      AND b.status = 'confirmed'
      AND b.room_id IS NOT NULL
    GROUP BY b.room_id
  ) AS u ON u.room_id = r.id
  WHERE r.status = 'active'
    AND r.capacity - COALESCE(u.used_seats, 0) >= p_required_seats
    AND NOT EXISTS (
      SELECT 1
      FROM subjects AS s
      INNER JOIN academic_terms AS t ON t.id = s.term_id
      WHERE s.room_id = r.id
        AND t.status = 'active'
        AND p_booking_date BETWEEN t.start_date AND t.end_date
        AND s.day_of_week = ELT(
          WEEKDAY(p_booking_date) + 1,
          'Monday', 'Tuesday', 'Wednesday', 'Thursday',
          'Friday', 'Saturday', 'Sunday'
        )
        AND s.start_time < v_slot_end
        AND s.end_time > v_slot_start
    )
  ORDER BY remaining_after_assignment ASC, r.id ASC;
END$$
DELIMITER ;

SET SQL_MODE = @OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS = @OLD_UNIQUE_CHECKS;
