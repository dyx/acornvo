-- migration: 003_file_columns
-- Add columns that were present in the FileRow model since phase-05
-- but never added to the migration schema. Without these, upsertFile
-- fails with "no such column" at runtime.

ALTER TABLE files ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
