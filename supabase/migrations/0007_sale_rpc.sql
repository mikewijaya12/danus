-- =============================================================================
-- Danus — 0007 SALE RPCs (atomic)
-- Sales deduct stock (blocked if insufficient), snapshot COGS = avg_cost at
-- sale time onto each sale_item so historical profit never drifts.
--
-- Item JSON shape:
--   { "product_id": uuid, "qty": number, "unit_price": number, "discount": number }
-- =============================================================================

-- Internal: reverse the stock effect of an active sale (return goods to stock).
create or replace function _reverse_sale(p_sale uuid, p_actor uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare it record; v_branch uuid;
begin
  select branch_id into v_branch from sales where id = p_sale;
  for it in select product_id, qty, cogs_unit from sale_items where sale_id = p_sale
  loop
    -- Returning stock uses the snapshotted COGS so the average is restored consistently.
    perform _apply_stock_in(
      it.product_id, v_branch, 'SALE_REVERSAL', it.qty, it.cogs_unit,
      'sales', p_sale, 'reversal of sale', p_actor
    );
  end loop;
end $$;

-- Internal: apply sale items (deduct stock, snapshot COGS, compute totals).
create or replace function _apply_sale_items(p_sale uuid, p_actor uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  it record;
  v_branch uuid;
  v_avg numeric;
  v_subtotal numeric := 0;
  v_cogs numeric := 0;
  v_header_discount numeric;
begin
  select branch_id, discount into v_branch, v_header_discount from sales where id = p_sale;

  for it in select id, product_id, qty, unit_price, discount from sale_items where sale_id = p_sale
  loop
    -- Deduct stock (blocks if insufficient).
    select avg_cost into v_avg from branch_inventory
      where branch_id = v_branch and product_id = it.product_id;
    v_avg := coalesce(v_avg, 0);

    perform _apply_stock_out(
      it.product_id, v_branch, 'SALE', it.qty, v_avg,
      'sales', p_sale, 'sale', p_actor, false
    );

    update sale_items
    set line_total  = round(qty * unit_price - discount, 2),
        cogs_unit   = v_avg,
        line_cogs   = round(qty * v_avg, 2),
        line_profit = round((qty * unit_price - discount) - (qty * v_avg), 2)
    where id = it.id;
  end loop;

  select coalesce(sum(line_total),0), coalesce(sum(line_cogs),0)
    into v_subtotal, v_cogs
  from sale_items where sale_id = p_sale;

  update sales
  set subtotal     = v_subtotal,
      total        = v_subtotal - coalesce(v_header_discount,0),
      total_cogs   = v_cogs,
      total_profit = (v_subtotal - coalesce(v_header_discount,0)) - v_cogs
  where id = p_sale;
end $$;

-- ---------------------------------------------------------------------------
-- create_sale
-- ---------------------------------------------------------------------------
create or replace function create_sale(
  p_branch uuid,
  p_txn_date date,
  p_customer_name text,
  p_discount numeric,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
  it jsonb;
begin
  if not has_perm('sales','create') then
    raise exception 'FORBIDDEN: missing sales.create';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION: sale must have at least one item';
  end if;

  insert into sales(txn_no, txn_date, branch_id, customer_name, discount, note, created_by)
  values (_next_txn_no('SO','sales'), coalesce(p_txn_date, current_date), p_branch,
          p_customer_name, coalesce(p_discount,0), p_note, v_actor)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items(sale_id, product_id, qty, unit_price, discount)
    values (v_id, (it->>'product_id')::uuid, (it->>'qty')::numeric,
            (it->>'unit_price')::numeric, coalesce((it->>'discount')::numeric,0));
  end loop;

  perform _apply_sale_items(v_id, v_actor);  -- deducts stock; raises if insufficient -> whole tx rolls back

  perform _audit('CREATE','sales', v_id,
    'created sale ' || (select txn_no from sales where id = v_id),
    null, to_jsonb((select s from sales s where s.id = v_id)));

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- update_sale — reverse old effect, re-apply new items (re-validates stock).
-- ---------------------------------------------------------------------------
create or replace function update_sale(
  p_id uuid,
  p_branch uuid,
  p_txn_date date,
  p_customer_name text,
  p_discount numeric,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb;
  it jsonb;
begin
  if not has_perm('sales','edit') then
    raise exception 'FORBIDDEN: missing sales.edit';
  end if;
  if not exists (select 1 from sales where id = p_id and status = 'active') then
    raise exception 'NOT_FOUND: active sale % not found', p_id;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION: sale must have at least one item';
  end if;

  v_old := to_jsonb((select s from sales s where s.id = p_id));

  -- 1) Return the previously-sold stock.
  perform _reverse_sale(p_id, v_actor);

  -- 2) Replace header + items.
  update sales
  set branch_id = p_branch, txn_date = coalesce(p_txn_date, current_date),
      customer_name = p_customer_name, discount = coalesce(p_discount,0), note = p_note
  where id = p_id;

  delete from sale_items where sale_id = p_id;
  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_items(sale_id, product_id, qty, unit_price, discount)
    values (p_id, (it->>'product_id')::uuid, (it->>'qty')::numeric,
            (it->>'unit_price')::numeric, coalesce((it->>'discount')::numeric,0));
  end loop;

  -- 3) Re-apply (re-validates stock; rolls back everything on shortage).
  perform _apply_sale_items(p_id, v_actor);

  -- 4) Recompute exact WMA for every product touched by this sale.
  perform _recompute_pair(si.product_id, s.branch_id)
  from sale_items si, sales s
  where si.sale_id = p_id and s.id = p_id;

  perform _audit('UPDATE','sales', p_id,
    'edited sale ' || (select txn_no from sales where id = p_id),
    v_old, to_jsonb((select s from sales s where s.id = p_id)));

  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- delete_sale — returns stock and marks sale voided.
-- ---------------------------------------------------------------------------
create or replace function delete_sale(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb;
begin
  if not has_perm('sales','delete') then
    raise exception 'FORBIDDEN: missing sales.delete';
  end if;
  if not exists (select 1 from sales where id = p_id and status = 'active') then
    raise exception 'NOT_FOUND: active sale % not found', p_id;
  end if;

  v_old := to_jsonb((select s from sales s where s.id = p_id));
  perform _reverse_sale(p_id, v_actor);

  -- Recompute exact WMA for every product touched by this sale.
  perform _recompute_pair(si.product_id, (select branch_id from sales where id = p_id))
  from sale_items si where si.sale_id = p_id;

  update sales set status = 'voided' where id = p_id;

  perform _audit('VOID','sales', p_id,
    'voided sale ' || (select txn_no from sales where id = p_id), v_old, null);
end $$;

grant execute on function create_sale(uuid,date,text,numeric,text,jsonb) to authenticated;
grant execute on function update_sale(uuid,uuid,date,text,numeric,text,jsonb) to authenticated;
grant execute on function delete_sale(uuid) to authenticated;
