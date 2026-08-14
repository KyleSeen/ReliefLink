-- ReliefLink migration v2: cross-role workflow, notifications, audit log.
-- Run with: mysql -u root -p < database/migration_v2.sql
-- Safe to re-run: every change is guarded, so a second run (for example against
-- RDS) is a no-op rather than an error. MySQL 8.0 has no "ADD COLUMN IF NOT
-- EXISTS", so the column and foreign key are added via a stored procedure that
-- checks information_schema first.

USE relieflink;

-- Link tasks back to the aid request that caused them (guarded column + FK).
DROP PROCEDURE IF EXISTS relieflink_migrate_v2;
DELIMITER $$
CREATE PROCEDURE relieflink_migrate_v2()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'request_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN request_id INT NULL AFTER description;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND CONSTRAINT_NAME = 'fk_tasks_request'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_request
      FOREIGN KEY (request_id) REFERENCES aid_requests(id) ON DELETE SET NULL;
  END IF;

  -- Add the 'assigned' status only if it is not already in the enum.
  IF (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'status') NOT LIKE '%assigned%' THEN
    ALTER TABLE tasks
      MODIFY status ENUM('open','assigned','accepted','in_progress','completed') NOT NULL DEFAULT 'open';
  END IF;
END $$
DELIMITER ;

CALL relieflink_migrate_v2();
DROP PROCEDURE IF EXISTS relieflink_migrate_v2;

-- Volunteer activity log (full-CRUD feature for the Volunteer role).
CREATE TABLE IF NOT EXISTS volunteer_logs (
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

-- In-app notifications.
CREATE TABLE IF NOT EXISTS notifications (
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

-- Audit log. user_name / user_role denormalised so history survives deletion.
CREATE TABLE IF NOT EXISTS activity_log (
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

-- ------------------------------------------------------------
-- Seed data (guarded inserts, re-runnable). Password: Test1234
-- ------------------------------------------------------------

-- Supporting accounts: two volunteers (one busy), two victims. Single first names.
INSERT INTO users (name, email, password, role)
SELECT 'Omar', 'omar@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'omar@relief.link');

INSERT INTO users (name, email, password, role, availability)
SELECT 'Lena', 'lena@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'volunteer', 'busy'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'lena@relief.link');

INSERT INTO users (name, email, password, role)
SELECT 'Priya', 'priya@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'priya@relief.link');

INSERT INTO users (name, email, password, role)
SELECT 'Chen', 'chen@relief.link', '$2b$10$Pvppy58zF1s4X6b9rcob2eLXPS2TllDo7iTymUpVQ.FNGKHQKAjHW', 'victim'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'chen@relief.link');

-- Shelters: one full, one near full, one comfortable, one empty.
INSERT INTO shelters (name, location, capacity, current_occupancy, status)
SELECT 'Riverside School Gym', 'Riverside, Sector 9', 120, 120, 'full'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM shelters WHERE name = 'Riverside School Gym');

INSERT INTO shelters (name, location, capacity, current_occupancy, status)
SELECT 'Central Community Hall', 'Downtown, Sector 4', 200, 170, 'open'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM shelters WHERE name = 'Central Community Hall');

INSERT INTO shelters (name, location, capacity, current_occupancy, status)
SELECT 'Northgate Sports Arena', 'Northgate, Sector 1', 350, 90, 'open'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM shelters WHERE name = 'Northgate Sports Arena');

INSERT INTO shelters (name, location, capacity, current_occupancy, status)
SELECT 'Harbourside Depot', 'Harbourside, Sector 12', 150, 0, 'open'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM shelters WHERE name = 'Harbourside Depot');

-- Aid requests: backdated times give three-plus priority bands among the pending.
INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status, created_at)
SELECT u.id, NULL, 'medical', 10, 'pending', NOW() - INTERVAL 30 HOUR
FROM users u WHERE u.email = 'victim@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'medical' AND a.people_count = 10 AND a.status = 'pending');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
SELECT u.id, (SELECT id FROM shelters WHERE name = 'Central Community Hall'), 'water', 15, 'pending'
FROM users u WHERE u.email = 'priya@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'water' AND a.people_count = 15 AND a.status = 'pending');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
SELECT u.id, (SELECT id FROM shelters WHERE name = 'Northgate Sports Arena'), 'food', 4, 'pending'
FROM users u WHERE u.email = 'chen@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'food' AND a.people_count = 4 AND a.status = 'pending');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
SELECT u.id, NULL, 'clothing', 2, 'pending'
FROM users u WHERE u.email = 'victim@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'clothing' AND a.people_count = 2 AND a.status = 'pending');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
SELECT u.id, (SELECT id FROM shelters WHERE name = 'Harbourside Depot'), 'shelter', 12, 'assigned'
FROM users u WHERE u.email = 'priya@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'shelter' AND a.people_count = 12 AND a.status = 'assigned');

INSERT INTO aid_requests (user_id, shelter_id, need_type, people_count, status)
SELECT u.id, (SELECT id FROM shelters WHERE name = 'Central Community Hall'), 'water', 20, 'resolved'
FROM users u WHERE u.email = 'chen@relief.link'
  AND NOT EXISTS (SELECT 1 FROM aid_requests a WHERE a.user_id = u.id AND a.need_type = 'water' AND a.people_count = 20 AND a.status = 'resolved');

-- Incident reports: one submitted, one in progress, one resolved.
INSERT INTO incident_reports (user_id, type, location, description, status)
SELECT u.id, 'flood', 'Sector 4, Riverside', 'Water rising fast near the main road, several homes cut off.', 'submitted'
FROM users u WHERE u.email = 'victim@relief.link'
  AND NOT EXISTS (SELECT 1 FROM incident_reports r WHERE r.user_id = u.id AND r.type = 'flood' AND r.location = 'Sector 4, Riverside');

INSERT INTO incident_reports (user_id, type, location, description, status)
SELECT u.id, 'fire', 'Northgate market', 'Fire spreading through market stalls, people evacuating.', 'in_progress'
FROM users u WHERE u.email = 'priya@relief.link'
  AND NOT EXISTS (SELECT 1 FROM incident_reports r WHERE r.user_id = u.id AND r.type = 'fire' AND r.location = 'Northgate market');

INSERT INTO incident_reports (user_id, type, location, description, status)
SELECT u.id, 'building collapse', 'Old Town, Sector 2', 'A wall collapsed after the quake, road partly blocked.', 'resolved'
FROM users u WHERE u.email = 'chen@relief.link'
  AND NOT EXISTS (SELECT 1 FROM incident_reports r WHERE r.user_id = u.id AND r.type = 'building collapse' AND r.location = 'Old Town, Sector 2');

-- Tasks: one open, two assigned in different states, one completed and linked
-- to the resolved water request.
INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
SELECT 'Distribute water at Central Community Hall', 'Hand out bottled water to residents.',
       NULL, (SELECT id FROM shelters WHERE name = 'Central Community Hall'), NULL, 'open'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Distribute water at Central Community Hall');

INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
SELECT 'Set up bedding at Harbourside Depot', 'Prepare space for 12 people.',
       (SELECT id FROM aid_requests WHERE need_type = 'shelter' AND people_count = 12 AND status = 'assigned' LIMIT 1),
       (SELECT id FROM shelters WHERE name = 'Harbourside Depot'),
       (SELECT id FROM users WHERE email = 'volunteer@relief.link'), 'assigned'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Set up bedding at Harbourside Depot');

INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
SELECT 'Hand out food parcels at Northgate', 'Distribute food to families.',
       NULL, (SELECT id FROM shelters WHERE name = 'Northgate Sports Arena'),
       (SELECT id FROM users WHERE email = 'volunteer@relief.link'), 'accepted'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Hand out food parcels at Northgate');

INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
SELECT 'Medical check at Northgate', 'Check on people needing medical help.',
       NULL, (SELECT id FROM shelters WHERE name = 'Northgate Sports Arena'),
       (SELECT id FROM users WHERE email = 'lena@relief.link'), 'in_progress'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Medical check at Northgate');

INSERT INTO tasks (title, description, request_id, shelter_id, assigned_to, status)
SELECT 'Deliver water for Chen (20 people)', 'Completed water delivery.',
       (SELECT id FROM aid_requests WHERE need_type = 'water' AND people_count = 20 AND status = 'resolved' LIMIT 1),
       (SELECT id FROM shelters WHERE name = 'Central Community Hall'),
       (SELECT id FROM users WHERE email = 'omar@relief.link'), 'completed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Deliver water for Chen (20 people)');

-- Donations: three categories, leaving water, medical and shelter short, food covered.
INSERT INTO donations (user_id, item_type, quantity, status)
SELECT u.id, 'water', 12, 'pledged' FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.user_id = u.id AND d.item_type = 'water' AND d.quantity = 12 AND d.status = 'pledged');

INSERT INTO donations (user_id, item_type, quantity, status)
SELECT u.id, 'water', 8, 'received' FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.user_id = u.id AND d.item_type = 'water' AND d.quantity = 8 AND d.status = 'received');

INSERT INTO donations (user_id, item_type, quantity, status)
SELECT u.id, 'food', 18, 'received' FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.user_id = u.id AND d.item_type = 'food' AND d.quantity = 18 AND d.status = 'received');

INSERT INTO donations (user_id, item_type, quantity, status)
SELECT u.id, 'food', 12, 'pledged' FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.user_id = u.id AND d.item_type = 'food' AND d.quantity = 12 AND d.status = 'pledged');

INSERT INTO donations (user_id, item_type, quantity, status)
SELECT u.id, 'shelter', 5, 'pledged' FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.user_id = u.id AND d.item_type = 'shelter' AND d.quantity = 5 AND d.status = 'pledged');

-- Notifications: unread for several accounts so the bell badge shows immediately.
INSERT INTO notifications (user_id, type, message, link, is_read)
SELECT u.id, 'task_assigned', 'You have been assigned: Set up bedding at Harbourside Depot.', '/volunteer/dashboard', 0
FROM users u WHERE u.email = 'volunteer@relief.link'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.message = 'You have been assigned: Set up bedding at Harbourside Depot.');

INSERT INTO notifications (user_id, type, message, link, is_read)
SELECT u.id, 'task_assigned', 'You have been assigned: Distribute water at Central Community Hall.', '/volunteer/dashboard', 0
FROM users u WHERE u.email = 'volunteer@relief.link'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.message = 'You have been assigned: Distribute water at Central Community Hall.');

INSERT INTO notifications (user_id, type, message, link, is_read)
SELECT u.id, 'request_resolved', 'Your request for water has been resolved.', '/victim/dashboard', 0
FROM users u WHERE u.email = 'victim@relief.link'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.message = 'Your request for water has been resolved.');

INSERT INTO notifications (user_id, type, message, link, is_read)
SELECT u.id, 'request_assigned', 'Your request for shelter is now being handled.', '/victim/dashboard', 1
FROM users u WHERE u.email = 'victim@relief.link'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.message = 'Your request for shelter is now being handled.');

INSERT INTO notifications (user_id, type, message, link, is_read)
SELECT u.id, 'donation_received', 'Your pledge of 8 water has been received.', '/donor/dashboard', 0
FROM users u WHERE u.email = 'donor@relief.link'
  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.message = 'Your pledge of 8 water has been received.');

-- Audit log: backdated entries across roles and action types.
INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'shelter.created', 'shelter', NULL, 'Central Community Hall', NOW() - INTERVAL 300 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='shelter.created' AND detail='Central Community Hall');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'shelter.created', 'shelter', NULL, 'Harbourside Depot', NOW() - INTERVAL 295 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='shelter.created' AND detail='Harbourside Depot');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='victim@relief.link'), 'Seen Man Hong', 'victim', 'request.created', 'aid_request', NULL, 'medical', NOW() - INTERVAL 250 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='request.created' AND detail='medical' AND user_name='Seen Man Hong');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='priya@relief.link'), 'Priya', 'victim', 'request.created', 'aid_request', NULL, 'shelter', NOW() - INTERVAL 240 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='request.created' AND detail='shelter' AND user_name='Priya');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='chen@relief.link'), 'Chen', 'victim', 'report.created', 'incident_report', NULL, 'building collapse', NOW() - INTERVAL 200 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='report.created' AND detail='building collapse');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'task.raised', 'task', NULL, 'Set up bedding at Harbourside Depot', NOW() - INTERVAL 180 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='task.raised' AND detail='Set up bedding at Harbourside Depot');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'task.assigned', 'task', NULL, 'Set up bedding at Harbourside Depot', NOW() - INTERVAL 175 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='task.assigned' AND detail='Set up bedding at Harbourside Depot');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='donor@relief.link'), 'Yap Sin Ni', 'donor', 'pledge.created', 'donation', NULL, '18 food', NOW() - INTERVAL 150 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='pledge.created' AND detail='18 food');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='donor@relief.link'), 'Yap Sin Ni', 'donor', 'pledge.created', 'donation', NULL, '12 water', NOW() - INTERVAL 145 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='pledge.created' AND detail='12 water');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'shelter.updated', 'shelter', NULL, 'Riverside School Gym', NOW() - INTERVAL 120 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='shelter.updated' AND detail='Riverside School Gym');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='victim@relief.link'), 'Seen Man Hong', 'victim', 'report.created', 'incident_report', NULL, 'flood', NOW() - INTERVAL 90 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='report.created' AND detail='flood');

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='admin@relief.link'), 'Salman', 'admin', 'auth.login', 'user', NULL, NULL, NOW() - INTERVAL 60 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='auth.login' AND user_name='Salman' AND created_at = NOW() - INTERVAL 60 MINUTE);

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='donor@relief.link'), 'Yap Sin Ni', 'donor', 'auth.login', 'user', NULL, NULL, NOW() - INTERVAL 50 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='auth.login' AND user_name='Yap Sin Ni' AND created_at = NOW() - INTERVAL 50 MINUTE);

INSERT INTO activity_log (user_id, user_name, user_role, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE email='chen@relief.link'), 'Chen', 'victim', 'request.created', 'aid_request', NULL, 'food', NOW() - INTERVAL 40 MINUTE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action='request.created' AND detail='food' AND user_name='Chen');
