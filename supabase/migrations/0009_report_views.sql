-- =============================================================================
-- Danus — 0009 REPORTING VIEWS + dashboard RPC
-- Views are security_invoker so RLS of the caller applies.
-- =============================================================================

-- Inventory joined with product/branch info for the Stok page & exports.
create or replace view v_inventory as
  select bi.branch_id, b.name as branch_name,
         bi.product_id, p.sku, p.name as product_name, p.unit,
         c.name as category_name,
         bi.qty, bi.avg_cost, round(bi.qty * bi.avg_cost, 2) as stock_value,
         p.sell_price, bi.updated_at
  from branch_inventory bi
  join products p on p.id = bi.product_id
  left join categories c on c.id = p.category_id
  join branches b on b.id = bi.branch_id;

alter view v_inventory set (security_invoker = true);

-- Stock movements enriched for the ledger page & exports.
create or replace view v_stock_movements as
  select m.id, m.created_at, m.type, m.qty, m.unit_cost,
         p.sku, p.name as product_name,
         b.name as branch_name,
         m.ref_table, m.ref_id, m.note,
         pr.full_name as created_by_name
  from stock_movements m
  join products p on p.id = m.product_id
  join branches b on b.id = m.branch_id
  left join profiles pr on pr.id = m.created_by;

alter view v_stock_movements set (security_invoker = true);

-- Dashboard summary. Filters: date range + optional branch.
create or replace function dashboard_summary(
  p_from date,
  p_to date,
  p_branch uuid default null
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if not has_perm('reports','view') then
    raise exception 'FORBIDDEN: missing reports.view';
  end if;

  select jsonb_build_object(
    'omzet', coalesce((select sum(total) from sales
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)), 0),
    'hpp', coalesce((select sum(total_cogs) from sales
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)), 0),
    'laba', coalesce((select sum(total_profit) from sales
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)), 0),
    'purchase_total', coalesce((select sum(total_cost) from purchases
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)), 0),
    'sales_count', (select count(*) from sales
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)),
    'purchases_count', (select count(*) from purchases
        where status='active' and txn_date between p_from and p_to
          and (p_branch is null or branch_id = p_branch)),
    'total_products', (select count(*) from products where is_active),
    'total_stock', coalesce((select sum(qty) from branch_inventory
        where (p_branch is null or branch_id = p_branch)), 0),
    'stock_value', coalesce((select sum(qty*avg_cost) from branch_inventory
        where (p_branch is null or branch_id = p_branch)), 0)
  ) into v;

  return v;
end $$;

-- Time series of omzet & laba grouped by day for charts.
create or replace function sales_timeseries(
  p_from date,
  p_to date,
  p_branch uuid default null
)
returns table(day date, omzet numeric, laba numeric, hpp numeric)
language sql
stable
security definer set search_path = public
as $$
  select s.txn_date as day,
         sum(s.total) as omzet,
         sum(s.total_profit) as laba,
         sum(s.total_cogs) as hpp
  from sales s
  where s.status = 'active'
    and s.txn_date between p_from and p_to
    and (p_branch is null or s.branch_id = p_branch)
    and has_perm('reports','view')
  group by s.txn_date
  order by s.txn_date;
$$;

-- Low-stock products (qty <= threshold) for the dashboard.
create or replace function low_stock(
  p_threshold numeric default 5,
  p_branch uuid default null
)
returns table(sku text, product_name text, branch_name text, qty numeric)
language sql
stable
security definer set search_path = public
as $$
  select p.sku, p.name, b.name, bi.qty
  from branch_inventory bi
  join products p on p.id = bi.product_id
  join branches b on b.id = bi.branch_id
  where bi.qty <= p_threshold
    and (p_branch is null or bi.branch_id = p_branch)
    and has_perm('inventory','view')
  order by bi.qty asc
  limit 50;
$$;

grant execute on function dashboard_summary(date,date,uuid) to authenticated;
grant execute on function sales_timeseries(date,date,uuid) to authenticated;
grant execute on function low_stock(numeric,uuid) to authenticated;
grant select on v_inventory, v_stock_movements to authenticated;
