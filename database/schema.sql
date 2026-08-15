-- ReliefLink database schema.
-- Creates the database, all nine tables, and the starting data.
-- Run with: mysql -u root -p < database/schema.sql
--
-- WARNING: this drops and recreates every table. Running it against a live
-- database removes existing data.

CREATE DATABASE IF NOT EXISTS relieflink;
USE relieflink;

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
  request_id  INT NULL,
  shelter_id  INT NULL,
  assigned_to INT NULL,
  status      ENUM('open','assigned','accepted','in_progress','completed')
                NOT NULL DEFAULT 'open',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id)  REFERENCES aid_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (shelter_id)  REFERENCES shelters(id)     ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id)        ON DELETE SET NULL
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

CREATE TABLE volunteer_logs (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  task_id    INT NULL,
  activity   VARCHAR(200) NOT NULL,
  notes      TEXT,
  status     ENUM('logged','verified') DEFAULT 'logged',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  type       ENUM('request_assigned','task_assigned','task_completed',
                  'request_resolved','shelter_full','donation_received') NOT NULL,
  message    VARCHAR(255) NOT NULL,
  link       VARCHAR(120),
  is_read    TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_unread (user_id, is_read),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE activity_log (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT,
  user_name   VARCHAR(100) NOT NULL,
  user_role   VARCHAR(20)  NOT NULL,
  action      VARCHAR(60)  NOT NULL,
  entity_type VARCHAR(40),
  entity_id   INT,
  detail      VARCHAR(255),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_entity (entity_type, entity_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO users (name, email, password, role, availability) VALUES
  ('Salman',        'admin@relief.link',     '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'admin',     'available'),
  ('Seen Man Hong', 'victim@relief.link',    '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim',    'available'),
  ('Saeed',         'volunteer@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer', 'available'),
  ('Yap Sin Ni',    'donor@relief.link',     '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'donor',     'available'),
  ('Omar',          'omar@relief.link',      '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer', 'available'),
  ('Lena',          'lena@relief.link',      '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer', 'busy'),
  ('Priya',         'priya@relief.link',     '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim',    'available'),
  ('Chen',          'chen@relief.link',      '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim',    'available');

INSERT INTO shelters (name, location, capacity, current_occupancy, status) VALUES
  ('Riverside School Gym',   'Riverside, Sector 9',   120, 120, 'full'),
  ('Central Community Hall', 'Downtown, Sector 4',    200, 170, 'open'),
  ('Northgate Sports Arena', 'Northgate, Sector 1',   350,  90, 'open'),
  ('Harbourside Depot',      'Harbourside, Sector 12',150,   0, 'open');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status, created_at) VALUES
  (2, NULL, 'medical',  10, 'pending',  NOW() - INTERVAL 30 HOUR),
  (7, 2,    'water',    15, 'pending',  NOW() - INTERVAL 6 HOUR),
  (8, 3,    'food',      4, 'pending',  NOW() - INTERVAL 3 HOUR),
  (2, NULL, 'clothing',  2, 'pending',  NOW() - INTERVAL 1 HOUR),
  (7, 4,    'shelter',  12, 'assigned', NOW() - INTERVAL 20 HOUR),
  (8, 2,    'water',    20, 'resolved', NOW() - INTERVAL 26 HOUR);

INSERT INTO incident_reports (user_id, type, location, description, status) VALUES
  (2, 'flood',             'Sector 4, Riverside', 'Water rising fast near the main road, several homes cut off.', 'submitted'),
  (7, 'fire',              'Northgate market',    'Fire spreading through market stalls, people evacuating.',     'in_progress'),
  (8, 'building collapse', 'Old Town, Sector 2',  'A wall collapsed after the quake, road partly blocked.',       'resolved');

INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status) VALUES
  ('Distribute water at Central Community Hall', 'Hand out bottled water to residents.',   NULL, 2, NULL, 'open'),
  ('Set up bedding at Harbourside Depot',        'Prepare space for 12 people.',              5, 4,    3, 'assigned'),
  ('Hand out food parcels at Northgate',         'Distribute food to families.',           NULL, 3,    3, 'accepted'),
  ('Medical check at Northgate',                 'Check on people needing medical help.',  NULL, 3,    6, 'in_progress'),
  ('Deliver water for Chen (20 people)',         'Completed water delivery.',                 6, 2,    5, 'completed');

INSERT INTO volunteer_logs (user_id, task_id, activity, notes) VALUES
  (5, 5, 'Completed: Deliver water for Chen (20 people)', 'Recorded automatically'),
  (3, 3, 'Distributed 40 food parcels', 'Northgate Sports Arena, morning shift');

INSERT INTO donations (user_id, item_type, quantity, status) VALUES
  (4, 'water',   12, 'pledged'),
  (4, 'water',    8, 'received'),
  (4, 'food',    18, 'received'),
  (4, 'food',    12, 'pledged'),
  (4, 'shelter',  5, 'pledged');

INSERT INTO notifications (user_id, type, message, link, is_read) VALUES
  (3, 'task_assigned',     'You have been assigned: Set up bedding at Harbourside Depot.',        '/volunteer/dashboard', 0),
  (3, 'task_assigned',     'You have been assigned: Distribute water at Central Community Hall.', '/volunteer/dashboard', 0),
  (2, 'request_resolved',  'Your request for water has been resolved.',                           '/victim/dashboard',    0),
  (2, 'request_assigned',  'Your request for shelter is now being handled.',                      '/victim/dashboard',    1),
  (4, 'donation_received', 'Your pledge of 8 water has been received.',                           '/donor/dashboard',     0);

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, detail, created_at) VALUES
  (1, 'Salman',        'admin',     'shelter.created', 'shelter',         'Central Community Hall',              NOW() - INTERVAL 300 MINUTE),
  (1, 'Salman',        'admin',     'shelter.created', 'shelter',         'Harbourside Depot',                   NOW() - INTERVAL 295 MINUTE),
  (2, 'Seen Man Hong', 'victim',    'request.created', 'aid_request',     'medical',                             NOW() - INTERVAL 250 MINUTE),
  (7, 'Priya',         'victim',    'request.created', 'aid_request',     'shelter',                             NOW() - INTERVAL 240 MINUTE),
  (8, 'Chen',          'victim',    'report.created',  'incident_report', 'building collapse',                   NOW() - INTERVAL 200 MINUTE),
  (1, 'Salman',        'admin',     'task.raised',     'task',            'Set up bedding at Harbourside Depot', NOW() - INTERVAL 180 MINUTE),
  (1, 'Salman',        'admin',     'task.assigned',   'task',            'Set up bedding at Harbourside Depot', NOW() - INTERVAL 175 MINUTE),
  (4, 'Yap Sin Ni',    'donor',     'pledge.created',  'donation',        '18 food',                             NOW() - INTERVAL 150 MINUTE),
  (4, 'Yap Sin Ni',    'donor',     'pledge.created',  'donation',        '12 water',                            NOW() - INTERVAL 145 MINUTE),
  (1, 'Salman',        'admin',     'shelter.updated', 'shelter',         'Riverside School Gym',                NOW() - INTERVAL 120 MINUTE),
  (5, 'Omar',          'volunteer', 'task.completed',  'task',            'Deliver water for Chen (20 people)',  NOW() - INTERVAL 110 MINUTE),
  (2, 'Seen Man Hong', 'victim',    'report.created',  'incident_report', 'flood',                               NOW() - INTERVAL 90 MINUTE),
  (1, 'Salman',        'admin',     'auth.login',      'user',            NULL,                                  NOW() - INTERVAL 60 MINUTE),
  (4, 'Yap Sin Ni',    'donor',     'auth.login',      'user',            NULL,                                  NOW() - INTERVAL 50 MINUTE),
  (8, 'Chen',          'victim',    'request.created', 'aid_request',     'food',                                NOW() - INTERVAL 40 MINUTE);
