-- Auto-claim email domain when first non-personal-domain user creates an org.
-- Previously, the trigger always created a personal org for unmatched domains.
-- Now it creates a real org named after the domain and claims the domain,
-- so subsequent users with the same email domain auto-join.

create or replace function handle_new_user()
returns trigger as $$
declare
  email_domain text;
  is_personal_domain boolean;
  matched_org_id uuid;
  new_org_id uuid;
  slug_base text;
  user_role text;
  domain_name text;
begin
  -- Extract domain from email
  email_domain := lower(split_part(new.email, '@', 2));

  -- Determine admin role
  user_role := case
    when new.email = any(string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ','))
    then 'admin' else 'user'
  end;

  -- Check if this is a personal email domain
  select exists(select 1 from public.personal_email_domains where domain = email_domain)
  into is_personal_domain;

  -- If not a personal domain, look for an org with this domain
  if not is_personal_domain then
    select organization_id into matched_org_id
    from public.organization_domains
    where domain = email_domain
    limit 1;
  end if;

  if matched_org_id is not null then
    -- Join existing org as member
    insert into public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      matched_org_id, 'member'
    );
  elsif not is_personal_domain then
    -- Non-personal domain with no existing org: create a real org and claim the domain
    domain_name := initcap(split_part(email_domain, '.', 1));
    slug_base := lower(split_part(email_domain, '.', 1))
                 || '-' || substr(gen_random_uuid()::text, 1, 8);

    insert into public.organizations (name, slug, is_personal)
    values (domain_name, slug_base, false)
    returning id into new_org_id;

    -- Auto-claim the domain so future users with the same domain auto-join
    insert into public.organization_domains (organization_id, domain, is_primary)
    values (new_org_id, email_domain, true);

    insert into public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      new_org_id, 'owner'
    );
  else
    -- Personal email domain: create a personal org
    slug_base := 'personal-' || replace(split_part(new.email, '@', 1), '.', '-')
                 || '-' || substr(gen_random_uuid()::text, 1, 8);

    insert into public.organizations (name, slug, is_personal)
    values ('Personal', slug_base, true)
    returning id into new_org_id;

    insert into public.profiles (id, email, name, image, role, status, permissions_mode, organization_id, org_role)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
      new.raw_user_meta_data->>'avatar_url',
      user_role, 'active', 'full',
      new_org_id, 'owner'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';
