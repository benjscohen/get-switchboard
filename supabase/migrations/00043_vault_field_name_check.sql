ALTER TABLE vault_secret_fields
  ADD CONSTRAINT vault_secret_fields_name_not_empty
  CHECK (trim(field_name) <> '');
