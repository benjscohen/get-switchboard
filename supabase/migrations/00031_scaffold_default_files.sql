-- Scaffold default files for new users and backfill existing users
-- Also updates handle_new_user() trigger to auto-create starter files

-- 1. Backfill existing users who have no files
INSERT INTO public.files (user_id, organization_id, path, name, parent_path, is_folder, content, metadata, current_version)
SELECT p.id, p.organization_id, v.path, v.name, v.parent_path, v.is_folder, v.content, v.metadata::jsonb, 1
FROM public.profiles p
CROSS JOIN (VALUES
  ('/memories', 'memories', '/', true, null, '{}'),
  ('/memories/MEMORY.md', 'MEMORY.md', '/memories', false,
   '# Memory' || E'\n\n' || 'Core memory file. Save important context, preferences, and decisions here.',
   '{"type": "memory"}'),
  ('/CLAUDE.md', 'CLAUDE.md', '/', false,
   '# Agent Instructions' || E'\n\n' || 'Add instructions and context for your AI agents here.',
   '{"type": "instructions"}')
) AS v(path, name, parent_path, is_folder, content, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM public.files f
  WHERE f.user_id = p.id
    AND f.path = v.path
    AND (
      (f.organization_id IS NOT NULL AND p.organization_id IS NOT NULL AND f.organization_id = p.organization_id)
      OR (f.organization_id IS NULL AND p.organization_id IS NULL)
    )
);

-- 2. Update handle_new_user() to scaffold default files for new signups
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  email_domain text;
  is_personal_domain boolean;
  matched_org_id uuid;
  new_org_id uuid;
  slug_base text;
  user_role text;
  domain_name text;
  the_org_id uuid;
BEGIN
  -- Extract domain from email
  email_domain := lower(split_part(new.email, '@', 2));

  -- Determine admin role
  user_role := case
    when new.email = any(string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
    then 'admin' else 'user'
  end;

  -- Check if this is a personal email domain
  SELECT exists(SELECT 1 FROM public.personal_email_domains WHERE domain = email_domain)
  INTO is_personal_domain;

  -- If not a personal domain, look for an org with this domain
  IF NOT is_personal_domain THEN
    SELECT organization_id INTO matched_org_id
    FROM public.organization_domains
    WHERE domain = email_domain
    LIMIT 1;
  END IF;

  IF matched_org_id IS NOT NULL THEN
    -- Join existing org as member
    the_org_id := matched_org_id;

    INSERT INTO public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    VALUES (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      matched_org_id, 'member'
    );
  ELSIF NOT is_personal_domain THEN
    -- Non-personal domain with no existing org: create a real org and claim the domain
    domain_name := initcap(split_part(email_domain, '.', 1));
    slug_base := lower(split_part(email_domain, '.', 1))
                 || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO public.organizations (name, slug, is_personal)
    VALUES (domain_name, slug_base, false)
    RETURNING id INTO new_org_id;

    the_org_id := new_org_id;

    -- Auto-claim the domain so future users with the same domain auto-join
    INSERT INTO public.organization_domains (organization_id, domain, is_primary)
    VALUES (new_org_id, email_domain, true);

    INSERT INTO public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    VALUES (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      new_org_id, 'owner'
    );
  ELSE
    -- Personal email domain: create a personal org
    slug_base := 'personal-' || replace(split_part(new.email, '@', 1), '.', '-')
                 || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO public.organizations (name, slug, is_personal)
    VALUES ('Personal', slug_base, true)
    RETURNING id INTO new_org_id;

    the_org_id := new_org_id;

    INSERT INTO public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    VALUES (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      new_org_id, 'owner'
    );
  END IF;

  -- Scaffold default files for the new user
  INSERT INTO public.files (user_id, organization_id, path, name, parent_path, is_folder, content, metadata, current_version)
  VALUES
    (new.id, the_org_id, '/memories', 'memories', '/', true, null, '{}', 1),
    (new.id, the_org_id, '/memories/MEMORY.md', 'MEMORY.md', '/memories', false,
     '# Memory' || E'\n\n' || 'Core memory file. Save important context, preferences, and decisions here.',
     '{"type": "memory"}', 1),
    (new.id, the_org_id, '/CLAUDE.md', 'CLAUDE.md', '/', false,
     '# Agent Instructions' || E'\n\n' || 'Add instructions and context for your AI agents here.',
     '{"type": "instructions"}', 1);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
