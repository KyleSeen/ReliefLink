-- ============================================================
-- ReliefLink — Database Schema
-- Run with:  mysql -u root -p relieflink < database/schema.sql
-- (Create the database first, or uncomment the lines below.)
-- ============================================================

CREATE DATABASE IF NOT EXISTS relieflink;
USE relieflink;

-- Drop in dependency order so the script is re-runnable.
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS incident_reports;
DROP TABLE IF EXISTS aid_requests;
DROP TABLE IF EXISTS shelters;
DROP TABLE IF EXISTS users;

-- ------------------------------------------------------------
-- users — accounts for all four roles
-- ------------------------------------------------------------
CREATE TABLE users (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,                       -- bcrypt hash
  role         ENUM('admin','victim','volunteer','donor') NOT NULL,
  availability ENUM('available','busy','off') DEFAULT 'available',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- shelters — (used by Admin later)
-- ------------------------------------------------------------
CREATE TABLE shelters (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  name              VARCHAR(150) NOT NULL,
  location          VARCHAR(255),
  capacity          INT,
  current_occupancy INT DEFAULT 0,
  status            ENUM('open','full','closed') DEFAULT 'open',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- aid_requests — (used by Victim later)
-- ------------------------------------------------------------
CREATE TABLE aid_requests (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  user_id      INT NOT NULL,
  shelter_id   INT NULL,
  need_type    VARCHAR(100),                                 -- food / medical / shelter
  people_count INT,
  status       ENUM('pending','assigned','resolved') DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (shelter_id) REFERENCES shelters(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- incident_reports — (used by Victim later)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- tasks — (used by Admin + Volunteer later)
-- ------------------------------------------------------------
CREATE TABLE tasks (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  title       VARCHAR(150) NOT NULL,
  description TEXT,
  shelter_id  INT NULL,
  assigned_to INT NULL,                                      -- volunteer (users.id)
  status      ENUM('open','accepted','in_progress','completed') DEFAULT 'open',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelter_id)  REFERENCES shelters(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)    ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- donations — (used by Donor later)
-- ------------------------------------------------------------
CREATE TABLE donations (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,                                   -- donor
  item_type  VARCHAR(100),                                   -- money / food / supplies
  quantity   INT,
  status     ENUM('pledged','received') DEFAULT 'pledged',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Seed data
-- ============================================================
-- One test user per role. Password for ALL of them is: Test1234
-- (bcrypt hash below). Change these in production.
INSERT INTO users (name, email, password, role) VALUES
  ('Admin Test',     'admin@relief.link',     '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'admin'),
  ('Victim Test',    'victim@relief.link',    '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim'),
  ('Volunteer Test', 'volunteer@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer'),
  ('Donor Test',     'donor@relief.link',     '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'donor');

-- Sample shelters so Admin/Donor pages have data once those features are built.
INSERT INTO shelters (name, location, capacity, current_occupancy, status) VALUES
  ('Central Community Hall', 'Downtown, Sector 4',   200, 45,  'open'),
  ('Riverside School Gym',   'Riverside, Sector 9',  120, 120, 'full'),
  ('Northgate Sports Arena', 'Northgate, Sector 1',  350, 80,  'open');
