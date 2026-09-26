-- Back up first. Existing accounts retain their IDs and passwords.
USE kinof;
ALTER TABLE users ADD COLUMN student_id VARCHAR(10) NULL,
 ADD UNIQUE KEY uq_users_student_id (student_id);
ALTER TABLE admins ADD COLUMN username VARCHAR(50) NULL,
 ADD COLUMN job_title VARCHAR(100) NULL,
 ADD COLUMN phone VARCHAR(20) NULL,
 ADD COLUMN password_setup_required TINYINT(1) NOT NULL DEFAULT 0,
 ADD UNIQUE KEY uq_admins_username (username);
CREATE TABLE admin_password_tokens (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 admin_id INT NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,
 FOREIGN KEY (admin_id) REFERENCES admins(id),
 KEY ix_admin_reset_requests(admin_id,created_at)
) ENGINE=InnoDB;
