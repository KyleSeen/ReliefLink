-- Task #2 — Media Upload Service (Seen Man Hong, TP069765)
-- Adds the S3 object key for a photo attached to an incident report.
-- The image itself lives in S3; only the key is stored relationally.
-- Run once against an existing database:
--   mysql -u root relieflink < database/migration_task2_media.sql

ALTER TABLE incident_reports
  ADD COLUMN photo_key VARCHAR(255) NULL AFTER description;
