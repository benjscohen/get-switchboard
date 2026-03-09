-- Add 'resume' to session_commands command CHECK constraint
ALTER TABLE session_commands DROP CONSTRAINT session_commands_command_check;
ALTER TABLE session_commands ADD CONSTRAINT session_commands_command_check
  CHECK (command IN ('stop', 'respond', 'resume'));
