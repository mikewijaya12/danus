-- =============================================================================
-- Danus — 0008 ADJUSTMENT RPC + admin helper RPCs
-- =============================================================================

-- Stock adjustment (manual +/-). Positive adds stock, negative removes.
create or replace function create_adjustment(
  p_branch uuid,
  p_product uuid,
  p_qty_change numeric,
  p_reason text,
  p_unit_cost numeric default null,
  p_txn_date date default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
  v_avg numeric;
begin
  if not has_perm('adjustments','create') then
    raise exception 'FORBIDDEN: missing adjustments.create';
  end if;
  if p_qty_change = 0 then
    raise exception 'VALIDATION: qty_change cannot be zero';
  end if;

  insert into stock_adjustments(txn_no, txn_date, branch_id, product_id, qty_change, reason, created_by)
  values (_next_txn_no('ADJ','stock_adjustments'), coalesce(p_txn_date, current_date),
          p_branch, p_product, p_qty_change, p_reason, v_actor)
  returning id into v_id;

  if p_qty_change > 0 then
    -- Use provided cost or fall back to current average / product default.
    select avg_cost into v_avg from branch_inventory where branch_id = p_branch and product_id = p_product;
    v_avg := coalesce(p_unit_cost, nullif(v_avg,0), (select default_cost from products where id = p_product), 0);
    perform _apply_stock_in(p_product, p_branch, 'ADJUSTMENT', p_qty_change, v_avg,
                            'stock_adjustments', v_id, p_reason, v_actor);
  else
    perform _apply_stock_out(p_product, p_branch, 'ADJUSTMENT', abs(p_qty_change), 0,
                             'stock_adjustments', v_id, p_reason, v_actor, false);
  end if;

  perform _audit('CREATE','adjustments', v_id,
    'stock adjustment ' || p_qty_change::text || ' (' || coalesce(p_reason,'') || ')',
    null, to_jsonb((select a from stock_adjustments a where a.id = v_id)));

  return v_id;
end $$;

grant execute on function create_adjustment(uuid,uuid,numeric,text,numeric,date) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: set a user's role + direct permissions in one call.
-- p_permissions is an array of "module.action" strings for direct grants.
-- ---------------------------------------------------------------------------
create or replace function admin_set_user_access(
  p_user uuid,
  p_role uuid,
  p_is_active boolean,
  p_permissions text[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare k text; v_module text; v_action text; v_perm uuid;
begin
  if not (is_admin() or has_perm('users','edit')) then
    raise exception 'FORBIDDEN: missing users.edit';
  end if;

  update profiles set role_id = p_role, is_active = coalesce(p_is_active, true) where id = p_user;

  delete from user_permissions where user_id = p_user;
  if p_permissions is not null then
    foreach k in array p_permissions loop
      v_module := split_part(k, '.', 1);
      v_action := split_part(k, '.', 2);
      select id into v_perm from permissions where module = v_module and action = v_action;
      if v_perm is not null then
        insert into user_permissions(user_id, permission_id) values (p_user, v_perm)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform _audit('UPDATE','users', p_user, 'updated user access', null,
                 jsonb_build_object('role', p_role, 'is_active', p_is_active, 'permissions', p_permissions));
end $$;

grant execute on function admin_set_user_access(uuid,uuid,boolean,text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: set a role's permission set (array of "module.action").
-- ---------------------------------------------------------------------------
create or replace function admin_set_role_permissions(
  p_role uuid,
  p_permissions text[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare k text; v_perm uuid;
begin
  if not (is_admin() or has_perm('roles','edit')) then
    raise exception 'FORBIDDEN: missing roles.edit';
  end if;

  delete from role_permissions where role_id = p_role;
  if p_permissions is not null then
    foreach k in array p_permissions loop
      select id into v_perm from permissions
        where module = split_part(k,'.',1) and action = split_part(k,'.',2);
      if v_perm is not null then
        insert into role_permissions(role_id, permission_id) values (p_role, v_perm)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  perform _audit('UPDATE','roles', p_role, 'updated role permissions', null, to_jsonb(p_permissions));
end $$;

grant execute on function admin_set_role_permissions(uuid,text[]) to authenticated;
