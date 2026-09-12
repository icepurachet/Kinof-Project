-- KINOF phase: real tracking agents, safer blocklist and entry audit.
-- Review and back up the database before applying this migration.

ALTER TABLE `rooms`
  MODIFY COLUMN `status` ENUM('active', 'closed', 'maintenance') NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS `tracking_agents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `computer_id` INT NOT NULL,
  `api_key_hash` CHAR(64) NOT NULL,
  `hostname` VARCHAR(255) NULL,
  `agent_version` VARCHAR(50) NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `last_seen_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tracking_agents_computer` (`computer_id`),
  UNIQUE KEY `uq_tracking_agents_key_hash` (`api_key_hash`),
  KEY `idx_tracking_agents_last_seen` (`last_seen_at`),
  CONSTRAINT `fk_tracking_agents_computer`
    FOREIGN KEY (`computer_id`) REFERENCES `lab_computers` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `tracking_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_uuid` CHAR(36) NOT NULL,
  `agent_id` INT NOT NULL,
  `session_id` INT NULL,
  `event_type` ENUM('login', 'logout', 'program', 'website', 'suspicious') NOT NULL,
  `name` VARCHAR(255) NULL,
  `domain` VARCHAR(255) NULL,
  `duration_minutes` INT NULL,
  `risk_level` ENUM('none', 'low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'none',
  `was_blocked` TINYINT(1) NOT NULL DEFAULT 0,
  `occurred_at` DATETIME NOT NULL,
  `payload_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tracking_events_uuid` (`event_uuid`),
  KEY `idx_tracking_events_agent_time` (`agent_id`, `occurred_at`),
  KEY `idx_tracking_events_session` (`session_id`),
  KEY `idx_tracking_events_risk_time` (`risk_level`, `occurred_at`),
  CONSTRAINT `fk_tracking_events_agent`
    FOREIGN KEY (`agent_id`) REFERENCES `tracking_agents` (`id`),
  CONSTRAINT `fk_tracking_events_session`
    FOREIGN KEY (`session_id`) REFERENCES `pc_sessions` (`id`),
  CONSTRAINT `chk_tracking_events_duration`
    CHECK (`duration_minutes` IS NULL OR `duration_minutes` >= 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `agent_commands` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `agent_id` INT NOT NULL,
  `command_type` ENUM('logout', 'lock', 'close_program', 'sync_blocklist') NOT NULL,
  `payload_json` JSON NULL,
  `status` ENUM('pending', 'delivered', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `result_message` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_commands_delivery` (`agent_id`, `status`, `created_at`),
  CONSTRAINT `fk_agent_commands_agent`
    FOREIGN KEY (`agent_id`) REFERENCES `tracking_agents` (`id`)
) ENGINE = InnoDB;

ALTER TABLE `blocked_domains`
  ADD COLUMN `category` VARCHAR(100) NULL AFTER `domain_name`,
  ADD COLUMN `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium' AFTER `category`,
  ADD COLUMN `action` ENUM('monitor', 'warn', 'block') NOT NULL DEFAULT 'block' AFTER `severity`,
  ADD COLUMN `match_type` ENUM('exact', 'suffix') NOT NULL DEFAULT 'suffix' AFTER `action`,
  ADD COLUMN `is_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `match_type`,
  ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

CREATE TABLE IF NOT EXISTS `entry_verifications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `method` ENUM('face', 'otp', 'totp') NOT NULL,
  `result` ENUM('success', 'failed') NOT NULL,
  `similarity_score` DECIMAL(6,5) NULL,
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entry_verifications_user_time` (`user_id`, `created_at`),
  KEY `idx_entry_verifications_room_time` (`room_id`, `created_at`),
  CONSTRAINT `fk_entry_verifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_entry_verifications_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `entry_otp_codes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `room_id` INT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entry_otp_lookup` (`code_hash`, `expires_at`, `used_at`),
  KEY `idx_entry_otp_user_time` (`user_id`, `created_at`),
  CONSTRAINT `fk_entry_otp_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_entry_otp_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`)
) ENGINE = InnoDB;
