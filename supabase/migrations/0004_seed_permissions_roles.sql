-- =============================================================================
-- Danus — 0004 SEED: permissions catalog + system roles
-- Idempotent: safe to re-run.
-- =============================================================================

-- Seed every module.action into permissions.
insert into permissions (module, action, description)
select m.module, a.action, m.module || '.' || a.action
from (values
  ('products'), ('categories'), ('suppliers'), ('branches'),
  ('inventory'), ('adjustments'), ('purchases'), ('sales'),
  ('reports'), ('users'), ('roles'), ('audit')
) as m(module)
cross join (values ('view'), ('create'), ('edit'), ('delete')) as a(action)
on conflict (module, action) do nothing;

-- System roles.
insert into roles (name, description, is_system)
values
  ('admin', 'Admin Utama — akses penuh ke seluruh sistem', true),
  ('staff', 'Staff — hak akses ditentukan per modul', true)
on conflict (name) do nothing;

-- Admin role: grant ALL permissions (admin also bypasses via is_admin(),
-- but we grant explicitly too so my_permissions()/UI is consistent).
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.name = 'admin'
on conflict do nothing;

-- Staff role: sensible read-only defaults (view on operational modules).
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.action = 'view'
  and p.module in ('products','categories','suppliers','branches','inventory','purchases','sales','reports')
where r.name = 'staff'
on conflict do nothing;
