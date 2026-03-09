-- Allow authenticated users to read messages from their own sessions
CREATE POLICY "Users can read their session messages"
  ON agent_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agent_sessions
      WHERE agent_sessions.id = agent_messages.session_id
      AND agent_sessions.user_id = auth.uid()
    )
  );

-- Enable Realtime on agent_messages so the web UI gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
