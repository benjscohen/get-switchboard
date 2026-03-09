-- Create storage bucket for agent session file uploads (screenshots, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-files', 'session-files', false)
ON CONFLICT (id) DO NOTHING;
