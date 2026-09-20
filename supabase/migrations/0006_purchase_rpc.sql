-- =============================================================================
-- Danus — 0006 PURCHASE RPCs (atomic)
-- Landed cost: extra fees (tax + import + shipping + other) are allocated across
-- line items proportionally by line_subtotal -> landed_unit_cost feeds WMA.
--
-- Item JSON shape: { "product_id": uuid, "qty": number, "unit_price": number }
-- =============================================================================

-- Internal: reverse the stock effect of an active purchase (used by update/delete).
create or replace function _reverse_purchase(p_purchase uuid, p_actor uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare it record;
begin
  for it in
    select product_id, qty, landed_unit_cost
    from purchase_items where purchase_id = p_purchase
  loop
    -- Removing previously-added stock. Allow negative so reversal never blocks,
    -- but the caller (update/delete) validates business rules first.
    perform _apply_stock_out(
      it.product_id, (select branch_id from purchases where id = p_purchase),
      'PURCHASE_REVERSAL', it.qty, it.landed_unit_cost,
      'purchases', p_purchase, 'reversal of purchase', p_actor, true
    );
  end loop;
end $$;

-- Internal: apply purchase items to stock (used by create/update).
create or replace function _apply_purchase_items(p_purchase uuid, p_actor uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare it record; v_branch uuid;
begin
  select branch_id into v_branch from purchases where id = p_purchase;
  for it in
    select product_id, qty, landed_unit_cost
    from purchase_items where purchase_id = p_purchase
  loop
    perform _apply_stock_in(
      it.product_id, v_branch, 'PURCHASE', it.qty, it.landed_unit_cost,
      'purchases', p_purchase, 'purchase', p_actor
    );
  end loop;
end $$;

-- Internal: (re)compute purchase_items subtotals, fee allocation, landed cost,
-- and header totals for a purchase whose items already exist.
create or replace function _recalc_purchase(p_purchase uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_subtotal numeric;
  v_extra    numeric;
begin
  update purchase_items
  set line_subtotal = round(qty * unit_price, 2)
  where purchase_id = p_purchase;

  select coalesce(sum(line_subtotal),0) into v_subtotal
  from purchase_items where purchase_id = p_purchase;

  select (tax + import_fee + shipping_fee + other_fee) into v_extra
  from purchases where id = p_purchase;

  -- Allocate extra fees proportionally by line_subtotal.
  if v_subtotal > 0 then
    update purchase_items
    set allocated_fee = round(v_extra * (line_subtotal / v_subtotal), 2)
    where purchase_id = p_purchase;
  else
    update purchase_items set allocated_fee = 0 where purchase_id = p_purchase;
  end if;

  update purchase_items
  set landed_unit_cost = case when qty > 0
        then round((line_subtotal + allocated_fee) / qty, 4) else 0 end
  where purchase_id = p_purchase;

  update purchases
  set items_subtotal = v_subtotal,
      total_cost = v_subtotal + v_extra
  where id = p_purchase;
end $$;

-- ---------------------------------------------------------------------------
-- create_purchase
-- ---------------------------------------------------------------------------
create or replace function create_purchase(
  p_branch uuid,
  p_supplier uuid,
  p_txn_date date,
  p_tax numeric,
  p_import_fee numeric,
  p_shipping_fee numeric,
  p_other_fee numeric,
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
  if not has_perm('purchases','create') then
    raise exception 'FORBIDDEN: missing purchases.create';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION: purchase must have at least one item';
  end if;

  insert into purchases(txn_no, txn_date, supplier_id, branch_id, tax, import_fee, shipping_fee, other_fee, note, created_by)
  values (_next_txn_no('PO','purchases'), coalesce(p_txn_date, current_date), p_supplier, p_branch,
          coalesce(p_tax,0), coalesce(p_import_fee,0), coalesce(p_shipping_fee,0), coalesce(p_other_fee,0),
          p_note, v_actor)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into purchase_items(purchase_id, product_id, qty, unit_price)
    values (v_id, (it->>'product_id')::uuid, (it->>'qty')::numeric, (it->>'unit_price')::numeric);
  end loop;

  perform _recalc_purchase(v_id);
  perform _apply_purchase_items(v_id, v_actor);

  perform _audit('CREATE','purchases', v_id,
    'created purchase ' || (select txn_no from purchases where id = v_id),
    null, to_jsonb((select p from purchases p where p.id = v_id)));

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- update_purchase — reverses old stock effect then re-applies new items.
-- ---------------------------------------------------------------------------
create or replace function update_purchase(
  p_id uuid,
  p_branch uuid,
  p_supplier uuid,
  p_txn_date date,
  p_tax numeric,
  p_import_fee numeric,
  p_shipping_fee numeric,
  p_other_fee numeric,
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
  if not has_perm('purchases','edit') then
    raise exception 'FORBIDDEN: missing purchases.edit';
  end if;
  if not exists (select 1 from purchases where id = p_id and status = 'active') then
    raise exception 'NOT_FOUND: active purchase % not found', p_id;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VALIDATION: purchase must have at least one item';
  end if;

  v_old := to_jsonb((select p from purchases p where p.id = p_id));

  -- 1) Reverse the current stock effect.
  perform _reverse_purchase(p_id, v_actor);

  -- 2) Replace header + items.
  update purchases
  set branch_id = p_branch, supplier_id = p_supplier,
      txn_date = coalesce(p_txn_date, current_date),
      tax = coalesce(p_tax,0), import_fee = coalesce(p_import_fee,0),
      shipping_fee = coalesce(p_shipping_fee,0), other_fee = coalesce(p_other_fee,0),
      note = p_note
  where id = p_id;

  delete from purchase_items where purchase_id = p_id;
  for it in select * from jsonb_array_elements(p_items)
  loop
    insert into purchase_items(purchase_id, product_id, qty, unit_price)
    values (p_id, (it->>'product_id')::uuid, (it->>'qty')::numeric, (it->>'unit_price')::numeric);
  end loop;

  -- 3) Recalc + re-apply.
  perform _recalc_purchase(p_id);
  perform _apply_purchase_items(p_id, v_actor);

  -- 4) Recompute exact WMA for every product touched by this purchase.
  perform _recompute_pair(pi.product_id, p.branch_id)
  from purchase_items pi, purchases p
  where pi.purchase_id = p_id and p.id = p_id;

  perform _audit('UPDATE','purchases', p_id,
    'edited purchase ' || (select txn_no from purchases where id = p_id),
    v_old, to_jsonb((select p from purchases p where p.id = p_id)));

  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- delete_purchase — reverses stock effect and marks purchase voided.
-- Guards against driving stock negative (goods already sold).
-- ---------------------------------------------------------------------------
create or replace function delete_purchase(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb;
  it record;
  v_branch uuid;
  v_avail numeric;
begin
  if not has_perm('purchases','delete') then
    raise exception 'FORBIDDEN: missing purchases.delete';
  end if;
  if not exists (select 1 from purchases where id = p_id and status = 'active') then
    raise exception 'NOT_FOUND: active purchase % not found', p_id;
  end if;

  select branch_id into v_branch from purchases where id = p_id;
  v_old := to_jsonb((select p from purchases p where p.id = p_id));

  -- Guard: cannot remove more stock than currently available.
  for it in select product_id, qty from purchase_items where purchase_id = p_id
  loop
    select qty into v_avail from branch_inventory
      where branch_id = v_branch and product_id = it.product_id;
    if coalesce(v_avail,0) < it.qty then
      raise exception
        'CANNOT_DELETE: deleting this purchase would make stock negative for product % (avail %, needed %). Goods may already be sold.',
        it.product_id, coalesce(v_avail,0), it.qty;
    end if;
  end loop;

  perform _reverse_purchase(p_id, v_actor);

  -- Recompute exact WMA for every product touched by this purchase.
  perform _recompute_pair(pi.product_id, v_branch)
  from purchase_items pi where pi.purchase_id = p_id;

  update purchases set status = 'voided' where id = p_id;

  perform _audit('VOID','purchases', p_id,
    'voided purchase ' || (select txn_no from purchases where id = p_id), v_old, null);
end $$;

grant execute on function create_purchase(uuid,uuid,date,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;
grant execute on function update_purchase(uuid,uuid,uuid,date,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;
grant execute on function delete_purchase(uuid) to authenticated;
