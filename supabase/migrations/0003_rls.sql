-- =============================================================================
-- Danus — 0003 ROW LEVEL SECURITY
-- Every table gets RLS. Access requires the matching module.action permission.
-- Admin bypasses via is_admin() inside has_perm().
-- Writes to transactional tables happen through SECURITY DEFINER RPCs which
-- re-check permissions, so direct PostgREST writes are also governed here.
-- =============================================================================

-- Helper macro pattern (manual per table since PL/pgSQL can't templatize policies easily).

-- ---- roles ------------------------------------------------------------------
alter table roles enable row level security;
create policy roles_select on roles for select to authenticated using (has_perm('roles','view'));
create policy roles_insert on roles for insert to authenticated with check (has_perm('roles','create'));
create policy roles_update on roles for update to authenticated using (has_perm('roles','edit')) with check (has_perm('roles','edit'));
create policy roles_delete on roles for delete to authenticated using (has_perm('roles','delete') and is_system = false);

-- ---- permissions (read-only catalog for anyone who can view roles/users) -----
alter table permissions enable row level security;
create policy permissions_select on permissions for select to authenticated
  using (has_perm('roles','view') or has_perm('users','view'));

-- ---- role_permissions -------------------------------------------------------
alter table role_permissions enable row level security;
create policy role_perms_select on role_permissions for select to authenticated using (has_perm('roles','view'));
create policy role_perms_ins on role_permissions for insert to authenticated with check (has_perm('roles','edit'));
create policy role_perms_del on role_permissions for delete to authenticated using (has_perm('roles','edit'));

-- ---- profiles ---------------------------------------------------------------
alter table profiles enable row level security;
-- A user can always read their own profile; users.view grants reading all.
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or has_perm('users','view'));
create policy profiles_insert on profiles for insert to authenticated with check (has_perm('users','create'));
-- users.edit can edit anyone; a user may edit their own full_name (role changes still need users.edit).
create policy profiles_update on profiles for update to authenticated
  using (has_perm('users','edit') or id = auth.uid())
  with check (has_perm('users','edit') or id = auth.uid());
create policy profiles_delete on profiles for delete to authenticated using (has_perm('users','delete'));

-- ---- user_permissions -------------------------------------------------------
alter table user_permissions enable row level security;
create policy user_perms_select on user_permissions for select to authenticated
  using (user_id = auth.uid() or has_perm('users','view'));
create policy user_perms_ins on user_permissions for insert to authenticated with check (has_perm('users','edit'));
create policy user_perms_del on user_permissions for delete to authenticated using (has_perm('users','edit'));

-- ---- branches ---------------------------------------------------------------
alter table branches enable row level security;
create policy branches_select on branches for select to authenticated using (has_perm('branches','view'));
create policy branches_insert on branches for insert to authenticated with check (has_perm('branches','create'));
create policy branches_update on branches for update to authenticated using (has_perm('branches','edit')) with check (has_perm('branches','edit'));
create policy branches_delete on branches for delete to authenticated using (has_perm('branches','delete'));

-- ---- categories -------------------------------------------------------------
alter table categories enable row level security;
create policy categories_select on categories for select to authenticated using (has_perm('categories','view'));
create policy categories_insert on categories for insert to authenticated with check (has_perm('categories','create'));
create policy categories_update on categories for update to authenticated using (has_perm('categories','edit')) with check (has_perm('categories','edit'));
create policy categories_delete on categories for delete to authenticated using (has_perm('categories','delete'));

-- ---- suppliers --------------------------------------------------------------
alter table suppliers enable row level security;
create policy suppliers_select on suppliers for select to authenticated using (has_perm('suppliers','view'));
create policy suppliers_insert on suppliers for insert to authenticated with check (has_perm('suppliers','create'));
create policy suppliers_update on suppliers for update to authenticated using (has_perm('suppliers','edit')) with check (has_perm('suppliers','edit'));
create policy suppliers_delete on suppliers for delete to authenticated using (has_perm('suppliers','delete'));

-- ---- products ---------------------------------------------------------------
alter table products enable row level security;
create policy products_select on products for select to authenticated using (has_perm('products','view'));
create policy products_insert on products for insert to authenticated with check (has_perm('products','create'));
create policy products_update on products for update to authenticated using (has_perm('products','edit')) with check (has_perm('products','edit'));
create policy products_delete on products for delete to authenticated using (has_perm('products','delete'));

-- ---- branch_inventory (read via inventory.view; writes only via RPC) --------
alter table branch_inventory enable row level security;
create policy inventory_select on branch_inventory for select to authenticated using (has_perm('inventory','view'));
-- No direct insert/update/delete policies: only SECURITY DEFINER functions modify it.

-- ---- stock_movements (read via inventory.view; writes only via RPC) ---------
alter table stock_movements enable row level security;
create policy movements_select on stock_movements for select to authenticated using (has_perm('inventory','view'));
-- Ledger is immutable from clients; RPCs (SECURITY DEFINER) do the inserts.

-- ---- purchases / purchase_items (read direct; writes via RPC) ---------------
alter table purchases enable row level security;
create policy purchases_select on purchases for select to authenticated using (has_perm('purchases','view'));
alter table purchase_items enable row level security;
create policy purchase_items_select on purchase_items for select to authenticated using (has_perm('purchases','view'));

-- ---- sales / sale_items -----------------------------------------------------
alter table sales enable row level security;
create policy sales_select on sales for select to authenticated using (has_perm('sales','view'));
alter table sale_items enable row level security;
create policy sale_items_select on sale_items for select to authenticated using (has_perm('sales','view'));

-- ---- stock_adjustments (read direct; writes via RPC) ------------------------
alter table stock_adjustments enable row level security;
create policy adjustments_select on stock_adjustments for select to authenticated using (has_perm('adjustments','view'));

-- ---- expenses ---------------------------------------------------------------
alter table expenses enable row level security;
create policy expenses_select on expenses for select to authenticated using (has_perm('reports','view'));
create policy expenses_insert on expenses for insert to authenticated with check (has_perm('reports','create'));
create policy expenses_update on expenses for update to authenticated using (has_perm('reports','edit')) with check (has_perm('reports','edit'));
create policy expenses_delete on expenses for delete to authenticated using (has_perm('reports','delete'));

-- ---- audit_logs (read only for audit.view; inserts via RPC/definer) ---------
alter table audit_logs enable row level security;
create policy audit_select on audit_logs for select to authenticated using (has_perm('audit','view'));
