-- Add sender_name column to connections for Gmail display name
ALTER TABLE connections ADD COLUMN sender_name text;
