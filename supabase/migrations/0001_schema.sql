-- =============================================================================
-- Danus (Dana Usaha) — 0001 SCHEMA
-- Normalized PostgreSQL schema for multi-branch inventory + finance.
-- Source of truth = this database. Excel is only for export/import/backup.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive text (emails)

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type movement_type as enum (
    'PURCHASE', 'SALE', 'PURCHASE_REVERSAL', 'SALE_REVERSAL', 'ADJUSTMENT', 'TRANSFER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type txn_status as enum ('active', 'voided');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================================
-- AUTHZ: roles, permissions, profiles
-- =============================================================================
create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- e.g. 'admin', 'staff'
  description text,
  is_system   boolean not null default false, -- system roles cannot be deleted
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Catalog of every possible permission (module.action).
create table if not exists permissions (
  id          uuid primary key default gen_random_uuid(),
  module      text not null,
  action      text not null check (action in ('view','create','edit','delete')),
  description text,
  unique (module, action)
);

-- Which permissions a role grants.
create table if not exists role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- User profile mirrors auth.users; holds role + status.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      citext,
  role_id    uuid references roles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Direct per-user permission grants (in addition to role).
create table if not exists user_permissions (
  user_id       uuid not null references profiles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (user_id, permission_id)
);

create index if not exists idx_profiles_role on profiles(role_id);
create trigger trg_roles_updated    before update on roles    for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- =============================================================================
-- MASTER DATA: branches, categories, suppliers, products
-- =============================================================================
create table if not exists branches (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  name       text not null,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  description text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      citext,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,                 -- SKU must be unique
  name          text not null,
  category_id   uuid references categories(id) on delete set null,
  unit          text not null default 'pcs',          -- satuan
  default_cost  numeric(14,2) not null default 0 check (default_cost >= 0), -- fallback modal
  sell_price    numeric(14,2) not null default 0 check (sell_price >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_name on products(lower(name));
create index if not exists idx_products_active on products(is_active);

create trigger trg_branches_updated   before update on branches   for each row execute function set_updated_at();
create trigger trg_categories_updated before update on categories for each row execute function set_updated_at();
create trigger trg_suppliers_updated  before update on suppliers  for each row execute function set_updated_at();
create trigger trg_products_updated   before update on products   for each row execute function set_updated_at();

-- =============================================================================
-- INVENTORY: branch_inventory (cache) + stock_movements (ledger)
-- =============================================================================

-- Current stock cache. qty MUST equal SUM(stock_movements.qty) for (product,branch).
-- avg_cost = weighted moving average landed cost.
create table if not exists branch_inventory (
  branch_id  uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  qty        numeric(16,3) not null default 0,
  avg_cost   numeric(14,4) not null default 0 check (avg_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create index if not exists idx_inventory_product on branch_inventory(product_id);
create trigger trg_inventory_updated before update on branch_inventory for each row execute function set_updated_at();

-- Immutable append-only ledger. Positive qty = stock in, negative = stock out.
create table if not exists stock_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete restrict,
  branch_id   uuid not null references branches(id) on delete restrict,
  type        movement_type not null,
  qty         numeric(16,3) not null,     -- signed
  unit_cost   numeric(14,4) not null default 0, -- landed cost per unit at this movement
  ref_table   text,                       -- 'purchases' | 'sales' | 'stock_adjustments'
  ref_id      uuid,
  note        text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_moves_product_branch on stock_movements(product_id, branch_id);
create index if not exists idx_moves_ref on stock_movements(ref_table, ref_id);
create index if not exists idx_moves_created on stock_movements(created_at);

-- =============================================================================
-- PURCHASES
-- =============================================================================
create table if not exists purchases (
  id            uuid primary key default gen_random_uuid(),
  txn_no        text not null unique,        -- e.g. PO-2026-000123
  txn_date      date not null default current_date,
  supplier_id   uuid references suppliers(id) on delete set null,
  branch_id     uuid not null references branches(id) on delete restrict,
  tax           numeric(14,2) not null default 0 check (tax >= 0),
  import_fee    numeric(14,2) not null default 0 check (import_fee >= 0),
  shipping_fee  numeric(14,2) not null default 0 check (shipping_fee >= 0),
  other_fee     numeric(14,2) not null default 0 check (other_fee >= 0),
  items_subtotal numeric(14,2) not null default 0, -- sum of line subtotals
  total_cost    numeric(14,2) not null default 0,  -- subtotal + all extra fees (landed)
  status        txn_status not null default 'active',
  note          text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists purchase_items (
  id               uuid primary key default gen_random_uuid(),
  purchase_id      uuid not null references purchases(id) on delete cascade,
  product_id       uuid not null references products(id) on delete restrict,
  qty              numeric(16,3) not null check (qty > 0),
  unit_price       numeric(14,4) not null check (unit_price >= 0), -- raw buy price/unit
  line_subtotal    numeric(14,2) not null default 0,               -- qty * unit_price
  allocated_fee    numeric(14,2) not null default 0,               -- share of extra fees
  landed_unit_cost numeric(14,4) not null default 0                -- (line_subtotal+allocated_fee)/qty
);

create index if not exists idx_purchases_date on purchases(txn_date);
create index if not exists idx_purchases_branch on purchases(branch_id);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on purchase_items(product_id);
create trigger trg_purchases_updated before update on purchases for each row execute function set_updated_at();

-- =============================================================================
-- SALES
-- =============================================================================
create table if not exists sales (
  id            uuid primary key default gen_random_uuid(),
  txn_no        text not null unique,        -- e.g. SO-2026-000123
  txn_date      date not null default current_date,
  branch_id     uuid not null references branches(id) on delete restrict,
  customer_name text,
  subtotal      numeric(14,2) not null default 0, -- sum of line totals before discount
  discount      numeric(14,2) not null default 0 check (discount >= 0), -- header-level discount
  total         numeric(14,2) not null default 0, -- omzet (revenue)
  total_cogs    numeric(14,2) not null default 0, -- HPP of goods sold
  total_profit  numeric(14,2) not null default 0, -- total - total_cogs - discount
  status        txn_status not null default 'active',
  note          text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references sales(id) on delete cascade,
  product_id   uuid not null references products(id) on delete restrict,
  qty          numeric(16,3) not null check (qty > 0),
  unit_price   numeric(14,4) not null check (unit_price >= 0),
  discount     numeric(14,2) not null default 0 check (discount >= 0), -- line discount
  line_total   numeric(14,2) not null default 0,  -- qty*unit_price - discount
  cogs_unit    numeric(14,4) not null default 0,  -- snapshot of avg_cost at sale time
  line_cogs    numeric(14,2) not null default 0,  -- qty * cogs_unit
  line_profit  numeric(14,2) not null default 0   -- line_total - line_cogs
);

create index if not exists idx_sales_date on sales(txn_date);
create index if not exists idx_sales_branch on sales(branch_id);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_product on sale_items(product_id);
create trigger trg_sales_updated before update on sales for each row execute function set_updated_at();

-- =============================================================================
-- STOCK ADJUSTMENTS
-- =============================================================================
create table if not exists stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  txn_no      text not null unique,          -- ADJ-...
  txn_date    date not null default current_date,
  branch_id   uuid not null references branches(id) on delete restrict,
  product_id  uuid not null references products(id) on delete restrict,
  qty_change  numeric(16,3) not null,        -- signed
  reason      text not null,
  status      txn_status not null default 'active',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_adjustments_branch_product on stock_adjustments(branch_id, product_id);

-- =============================================================================
-- EXPENSES (operational, optional for profit reports)
-- =============================================================================
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  txn_date    date not null default current_date,
  branch_id   uuid references branches(id) on delete set null,
  category    text,
  amount      numeric(14,2) not null check (amount >= 0),
  note        text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================
create table if not exists audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  user_email text,
  action     text not null,      -- CREATE | UPDATE | DELETE | VOID
  module     text not null,      -- products | purchases | sales | ...
  record_id  uuid,
  summary    text,               -- human readable, e.g. 'edited SALE-001 qty 10 -> 6'
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_module on audit_logs(module);
create index if not exists idx_audit_created on audit_logs(created_at);
create index if not exists idx_audit_user on audit_logs(user_id);
