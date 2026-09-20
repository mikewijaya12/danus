-- =============================================================================
-- Danus — 0005 INVENTORY ENGINE (internal helpers)
-- Low-level, SECURITY DEFINER helpers that apply movements to the ledger and
-- keep branch_inventory (cache) in sync using Weighted Moving Average.
-- These are NOT granted to clients directly; they are called by the RPCs.
-- =============================================================================

-- Apply a stock-IN movement (purchase / purchase reversal-in / positive adjustment).
-- Updates WMA average cost. Returns nothing.
create or replace function _apply_stock_in(
  p_product uuid, p_branch uuid, p_type movement_type,
  p_qty numeric, p_unit_cost numeric,
  p_ref_table text, p_ref_id uuid, p_note text, p_actor uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old_qty  numeric;
  v_old_avg  numeric;
  v_new_qty  numeric;
  v_new_avg  numeric;
begin
  if p_qty <= 0 then
    raise exception 'stock-in qty must be positive (got %)', p_qty;
  end if;

  insert into branch_inventory (branch_id, product_id, qty, avg_cost)
  values (p_branch, p_product, 0, 0)
  on conflict (branch_id, product_id) do nothing;

  select qty, avg_cost into v_old_qty, v_old_avg
  from branch_inventory
  where branch_id = p_branch and product_id = p_product
  for update;

  v_new_qty := v_old_qty + p_qty;
  -- Weighted moving average. If old qty <= 0, reset avg to incoming cost.
  if v_old_qty <= 0 then
    v_new_avg := p_unit_cost;
  else
    v_new_avg := ((v_old_qty * v_old_avg) + (p_qty * p_unit_cost)) / v_new_qty;
  end if;

  update branch_inventory
  set qty = v_new_qty, avg_cost = v_new_avg
  where branch_id = p_branch and product_id = p_product;

  insert into stock_movements(product_id, branch_id, type, qty, unit_cost, ref_table, ref_id, note, created_by)
  values (p_product, p_branch, p_type, p_qty, p_unit_cost, p_ref_table, p_ref_id, p_note, p_actor);
end $$;

-- Apply a stock-OUT movement (sale / positive-purchase reversal-out / negative adjustment).
-- avg_cost is unchanged on stock-out. Blocks negative stock unless p_allow_negative.
create or replace function _apply_stock_out(
  p_product uuid, p_branch uuid, p_type movement_type,
  p_qty numeric, p_unit_cost numeric,
  p_ref_table text, p_ref_id uuid, p_note text, p_actor uuid,
  p_allow_negative boolean default false
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old_qty numeric;
begin
  if p_qty <= 0 then
    raise exception 'stock-out qty must be positive (got %)', p_qty;
  end if;

  insert into branch_inventory (branch_id, product_id, qty, avg_cost)
  values (p_branch, p_product, 0, 0)
  on conflict (branch_id, product_id) do nothing;

  select qty into v_old_qty
  from branch_inventory
  where branch_id = p_branch and product_id = p_product
  for update;

  if not p_allow_negative and v_old_qty < p_qty then
    raise exception 'INSUFFICIENT_STOCK: product % branch % has % but % requested',
      p_product, p_branch, v_old_qty, p_qty;
  end if;

  update branch_inventory
  set qty = v_old_qty - p_qty
  where branch_id = p_branch and product_id = p_product;

  insert into stock_movements(product_id, branch_id, type, qty, unit_cost, ref_table, ref_id, note, created_by)
  values (p_product, p_branch, p_type, -p_qty, p_unit_cost, p_ref_table, p_ref_id, p_note, p_actor);
end $$;

-- Write an audit entry.
create or replace function _audit(
  p_action text, p_module text, p_record uuid, p_summary text,
  p_old jsonb, p_new jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_email text;
begin
  select email into v_email from profiles where id = auth.uid();
  insert into audit_logs(user_id, user_email, action, module, record_id, summary, old_value, new_value)
  values (auth.uid(), v_email, p_action, p_module, p_record, p_summary, p_old, p_new);
end $$;

-- Generate a sequential transaction number like PREFIX-YYYY-000123.
create or replace function _next_txn_no(p_prefix text, p_table regclass)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_count bigint;
begin
  execute format('select count(*) from %s', p_table) into v_count;
  return p_prefix || '-' || v_year || '-' || lpad((v_count + 1)::text, 6, '0');
end $$;

-- Recompute qty + WMA avg_cost for a single (product, branch) by replaying its ledger.
-- Used after reversals so the moving average stays exact.
create or replace function _recompute_pair(p_product uuid, p_branch uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_qty numeric := 0;
  v_avg numeric := 0;
begin
  for r in
    select type, qty, unit_cost
    from stock_movements
    where product_id = p_product and branch_id = p_branch
    order by created_at, id
  loop
    if r.qty > 0 then
      if v_qty <= 0 then
        v_avg := r.unit_cost;
      else
        v_avg := ((v_qty * v_avg) + (r.qty * r.unit_cost)) / (v_qty + r.qty);
      end if;
    end if;
    v_qty := v_qty + r.qty;
  end loop;

  insert into branch_inventory(branch_id, product_id, qty, avg_cost)
  values (p_branch, p_product, v_qty, v_avg)
  on conflict (branch_id, product_id)
  do update set qty = excluded.qty, avg_cost = excluded.avg_cost;
end $$;

-- Rebuild the whole inventory cache from the ledger (audit/repair tool).
-- avg_cost is recomputed by replaying movements in chronological order.
create or replace function recompute_inventory()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_qty numeric;
  v_avg numeric;
begin
  if not is_admin() then
    raise exception 'FORBIDDEN: admin only';
  end if;

  update branch_inventory set qty = 0, avg_cost = 0;

  for r in
    select product_id, branch_id, type, qty, unit_cost
    from stock_movements
    order by created_at, id
  loop
    insert into branch_inventory(branch_id, product_id, qty, avg_cost)
    values (r.branch_id, r.product_id, 0, 0)
    on conflict (branch_id, product_id) do nothing;

    select qty, avg_cost into v_qty, v_avg
    from branch_inventory where branch_id = r.branch_id and product_id = r.product_id;

    if r.qty > 0 then
      if v_qty <= 0 then
        v_avg := r.unit_cost;
      else
        v_avg := ((v_qty * v_avg) + (r.qty * r.unit_cost)) / (v_qty + r.qty);
      end if;
    end if;
    v_qty := v_qty + r.qty;

    update branch_inventory set qty = v_qty, avg_cost = v_avg
    where branch_id = r.branch_id and product_id = r.product_id;
  end loop;
end $$;

grant execute on function recompute_inventory() to authenticated;
