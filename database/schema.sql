-- ReliefLink database schema. Run with: mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS relieflink;
USE relieflink;

-- Reset cleanly even if the v2 tables (which add foreign keys back onto these)
-- already exist. Foreign-key checks are turned off for the drops only.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS volunteer_logs;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS incident_reports;
DROP TABLE IF EXISTS aid_requests;
DROP TABLE IF EXISTS shelters;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- Accounts for all four roles.
CREATE TABLE users (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  role         ENUM('admin','victim','volunteer','donor') NOT NULL,
  availability ENUM('available','busy','off') DEFAULT 'available',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shelters (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  name              VARCHAR(150) NOT NULL,
  location          VARCHAR(255),
  capacity          INT,
  current_occupancy INT DEFAULT 0,
  status            ENUM('open','full','closed') DEFAULT 'open',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE aid_requests (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  user_id      INT NOT NULL,
  shelter_id   INT NULL,
  need_type    VARCHAR(100),
  people_count INT,
  status       ENUM('pending','assigned','resolved') DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (shelter_id) REFERENCES shelters(id) ON DELETE SET NULL
);

CREATE TABLE incident_reports (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL,
  type        VARCHAR(100),
  location    VARCHAR(255),
  description TEXT,
  status      ENUM('submitted','in_progress','resolved') DEFAULT 'submitted',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tasks (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  title       VARCHAR(150) NOT NULL,
  description TEXT,
  shelter_id  INT NULL,
  assigned_to INT NULL,
  status      ENUM('open','assigned','accepted','in_progress','completed') DEFAULT 'open',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelter_id)  REFERENCES shelters(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)    ON DELETE SET NULL
);

CREATE TABLE donations (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  item_type  VARCHAR(100),
  quantity   INT,
  status     ENUM('pledged','received') DEFAULT 'pledged',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Team accounts, one per role. Password for all of them is Test1234.
INSERT INTO users (name, email, password, role) VALUES
  ('Salman',        'admin@relief.link',   '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'admin'),
  ('Seen Man Hong', 'victim@relief.link',  '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim'),
  ('Saeed',         'volunteer@relief.link',    '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer'),
  ('Yap Sin Ni',    'donor@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'donor');
