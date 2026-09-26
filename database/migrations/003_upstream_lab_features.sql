-- Apply once to a BACKED UP test database after 001 and 002.
USE kinof;
CREATE TABLE IF NOT EXISTS program_rules (
 id INT AUTO_INCREMENT PRIMARY KEY,
 process_name VARCHAR(255) NOT NULL,
 rule_type ENUM('allow','block') NOT NULL,
 display_name VARCHAR(255) NULL,
 category VARCHAR(100) NULL,
 reason VARCHAR(500) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_program_rule (process_name, rule_type)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS behavior_reviews (
 id INT AUTO_INCREMENT PRIMARY KEY,
 event_id BIGINT NOT NULL,
 user_id INT NULL,
 kind VARCHAR(20) NOT NULL,
 target VARCHAR(255) NOT NULL,
 queue_key VARCHAR(320) NOT NULL,
 status ENUM('pending','cleared','penalized') NOT NULL DEFAULT 'pending',
 handled_by INT NULL,
 handled_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_behavior_queue (queue_key),
 FOREIGN KEY (event_id) REFERENCES tracking_events(id),
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (handled_by) REFERENCES admins(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS behavior_penalties (
 id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 source_key VARCHAR(150) NOT NULL,
 points INT NOT NULL DEFAULT 5,
 reason VARCHAR(500) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_behavior_penalty (user_id, source_key),
 FOREIGN KEY (user_id) REFERENCES users(id),
 KEY ix_behavior_month (user_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS kiosk_devices (
 id INT AUTO_INCREMENT PRIMARY KEY,
 room_id INT NOT NULL,
 label VARCHAR(100) NOT NULL,
 key_hash CHAR(64) NOT NULL UNIQUE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at DATETIME NULL,
 revoked_at DATETIME NULL,
 FOREIGN KEY (room_id) REFERENCES rooms(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS agent_login_challenges (
 id INT AUTO_INCREMENT PRIMARY KEY,
 agent_id INT NOT NULL,
 user_id INT NOT NULL,
 code_hash CHAR(64) NOT NULL,
 attempts INT NOT NULL DEFAULT 0,
 expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (agent_id) REFERENCES tracking_agents(id),
 FOREIGN KEY (user_id) REFERENCES users(id),
 KEY ix_agent_challenge (agent_id,user_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS imported_domain_rules (
 domain_id INT PRIMARY KEY,
 category VARCHAR(100) NOT NULL,
 imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (domain_id) REFERENCES blocked_domains(id) ON DELETE CASCADE
) ENGINE=InnoDB;
