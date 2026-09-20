-- =============================================================================
-- Danus — 0010 BOOTSTRAP ADMIN  (RUN MANUALLY, ONCE)
-- =============================================================================
-- Steps:
--   1) Start the app and SIGN UP once with the email that should be Admin Utama.
--      (This creates rows in auth.users and public.profiles automatically.)
--   2) Replace the email below and run this block in the Supabase SQL editor.
--
-- This promotes that user to the 'admin' role (full access).
-- =============================================================================

do $$
declare
  v_admin_email text := 'mwijaya2006@gmail.com';   -- <-- CHANGE THIS
  v_role uuid;
  v_uid uuid;
begin
  select id into v_role from roles where name = 'admin';
  select id into v_uid from auth.users where lower(email) = lower(v_admin_email);

  if v_uid is null then
    raise exception 'No auth user found for %. Sign up first, then re-run.', v_admin_email;
  end if;

  update profiles set role_id = v_role, is_active = true where id = v_uid;
  raise notice 'User % promoted to admin.', v_admin_email;
end $$;
