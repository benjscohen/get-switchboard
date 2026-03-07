-- Normalize underscore IDs to hyphenated canonical IDs in agents.tool_access
UPDATE agents SET tool_access = (
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN elem #>> '{}' = 'google_calendar' THEN '"google-calendar"'::jsonb
      WHEN elem #>> '{}' = 'google_gmail' THEN '"google-gmail"'::jsonb
      WHEN elem #>> '{}' = 'google_docs' THEN '"google-docs"'::jsonb
      WHEN elem #>> '{}' = 'google_drive' THEN '"google-drive"'::jsonb
      WHEN elem #>> '{}' = 'google_sheets' THEN '"google-sheets"'::jsonb
      WHEN elem #>> '{}' = 'google_slides' THEN '"google-slides"'::jsonb
      WHEN elem #>> '{}' = 'google_ads' THEN '"google-ads"'::jsonb
      WHEN elem #>> '{}' = 'hubspot_crm' THEN '"hubspot-crm"'::jsonb
      WHEN elem #>> '{}' = 'linkedin_ads' THEN '"linkedin-ads"'::jsonb
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(tool_access) AS elem
) WHERE tool_access != '[]'::jsonb AND tool_access IS NOT NULL;

-- Normalize underscore IDs to hyphenated canonical IDs in agent_versions.tool_access
UPDATE agent_versions SET tool_access = (
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN elem #>> '{}' = 'google_calendar' THEN '"google-calendar"'::jsonb
      WHEN elem #>> '{}' = 'google_gmail' THEN '"google-gmail"'::jsonb
      WHEN elem #>> '{}' = 'google_docs' THEN '"google-docs"'::jsonb
      WHEN elem #>> '{}' = 'google_drive' THEN '"google-drive"'::jsonb
      WHEN elem #>> '{}' = 'google_sheets' THEN '"google-sheets"'::jsonb
      WHEN elem #>> '{}' = 'google_slides' THEN '"google-slides"'::jsonb
      WHEN elem #>> '{}' = 'google_ads' THEN '"google-ads"'::jsonb
      WHEN elem #>> '{}' = 'hubspot_crm' THEN '"hubspot-crm"'::jsonb
      WHEN elem #>> '{}' = 'linkedin_ads' THEN '"linkedin-ads"'::jsonb
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(tool_access) AS elem
) WHERE tool_access != '[]'::jsonb AND tool_access IS NOT NULL;

-- Normalize underscore IDs to hyphenated canonical IDs in agent_templates.tool_access
UPDATE agent_templates SET tool_access = (
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN elem #>> '{}' = 'google_calendar' THEN '"google-calendar"'::jsonb
      WHEN elem #>> '{}' = 'google_gmail' THEN '"google-gmail"'::jsonb
      WHEN elem #>> '{}' = 'google_docs' THEN '"google-docs"'::jsonb
      WHEN elem #>> '{}' = 'google_drive' THEN '"google-drive"'::jsonb
      WHEN elem #>> '{}' = 'google_sheets' THEN '"google-sheets"'::jsonb
      WHEN elem #>> '{}' = 'google_slides' THEN '"google-slides"'::jsonb
      WHEN elem #>> '{}' = 'google_ads' THEN '"google-ads"'::jsonb
      WHEN elem #>> '{}' = 'hubspot_crm' THEN '"hubspot-crm"'::jsonb
      WHEN elem #>> '{}' = 'linkedin_ads' THEN '"linkedin-ads"'::jsonb
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(tool_access) AS elem
) WHERE tool_access != '[]'::jsonb AND tool_access IS NOT NULL;
