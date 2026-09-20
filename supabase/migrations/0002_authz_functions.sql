-- =============================================================================
-- Danus — 0002 AUTHZ HELPER FUNCTIONS
-- Central permission resolution used by RLS policies AND RPC functions.
-- =============================================================================

-- Create a profile automatically when a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Is the current user an admin (role named 'admin')? Admin bypasses all checks.
create or replace function is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.is_active
      and r.name = 'admin'
  );
$$;

-- Does the current user have module.action?  (admin => always true)
-- Union of role_permissions (via role) and direct user_permissions.
create or replace function has_perm(p_module text, p_action text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1
      from profiles pr
      join role_permissions rp on rp.role_id = pr.role_id
      join permissions pm on pm.id = rp.permission_id
      where pr.id = auth.uid()
        and pr.is_active
        and pm.module = p_module
        and pm.action = p_action
    )
    or exists (
      select 1
      from user_permissions up
      join permissions pm on pm.id = up.permission_id
      where up.user_id = auth.uid()
        and pm.module = p_module
        and pm.action = p_action
    );
$$;

-- Convenience: return the caller's full permission set for the frontend.
create or replace function my_permissions()
returns table(module text, action text)
language sql
stable
security definer set search_path = public
as $$
  select distinct pm.module, pm.action
  from permissions pm
  where is_admin()   -- admin: return everything
     or exists (
        select 1 from profiles pr
        join role_permissions rp on rp.role_id = pr.role_id
        where pr.id = auth.uid() and rp.permission_id = pm.id
     )
     or exists (
        select 1 from user_permissions up
        where up.user_id = auth.uid() and up.permission_id = pm.id
     );
$$;

grant execute on function is_admin() to authenticated;
grant execute on function has_perm(text, text) to authenticated;
grant execute on function my_permissions() to authenticated;
