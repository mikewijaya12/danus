/**
 * Hand-maintained Supabase Database types.
 *
 * In a networked environment you can regenerate this with:
 *   npm run gen:types   (requires the Supabase CLI + SUPABASE_PROJECT_ID)
 *
 * These match migrations 0001–0009. Keep in sync when the schema changes.
 */

type Timestamp = string;
type UUID = string;
type Numeric = number;

export type MovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'PURCHASE_REVERSAL'
  | 'SALE_REVERSAL'
  | 'ADJUSTMENT'
  | 'TRANSFER';

export type TxnStatus = 'active' | 'voided';

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: { id: UUID; name: string; description: string | null; is_system: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id?: UUID; name: string; description?: string | null; is_system?: boolean };
        Update: Partial<Database['public']['Tables']['roles']['Insert']>;
        Relationships: [];
      };
      permissions: {
        Row: { id: UUID; module: string; action: string; description: string | null };
        Insert: { id?: UUID; module: string; action: string; description?: string | null };
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: UUID; permission_id: UUID };
        Insert: { role_id: UUID; permission_id: UUID };
        Update: Partial<{ role_id: UUID; permission_id: UUID }>;
        Relationships: [];
      };
      profiles: {
        Row: { id: UUID; full_name: string | null; email: string | null; role_id: UUID | null; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id: UUID; full_name?: string | null; email?: string | null; role_id?: UUID | null; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      user_permissions: {
        Row: { user_id: UUID; permission_id: UUID };
        Insert: { user_id: UUID; permission_id: UUID };
        Update: Partial<{ user_id: UUID; permission_id: UUID }>;
        Relationships: [];
      };
      branches: {
        Row: { id: UUID; code: string | null; name: string; address: string | null; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id?: UUID; code?: string | null; name: string; address?: string | null; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['branches']['Insert']>;
        Relationships: [];
      };
      categories: {
        Row: { id: UUID; name: string; description: string | null; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id?: UUID; name: string; description?: string | null; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      suppliers: {
        Row: { id: UUID; name: string; phone: string | null; email: string | null; address: string | null; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id?: UUID; name: string; phone?: string | null; email?: string | null; address?: string | null; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>;
        Relationships: [];
      };
      products: {
        Row: { id: UUID; sku: string; name: string; category_id: UUID | null; unit: string; default_cost: Numeric; sell_price: Numeric; is_active: boolean; created_at: Timestamp; updated_at: Timestamp };
        Insert: { id?: UUID; sku: string; name: string; category_id?: UUID | null; unit?: string; default_cost?: Numeric; sell_price?: Numeric; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [];
      };
      branch_inventory: {
        Row: { branch_id: UUID; product_id: UUID; qty: Numeric; avg_cost: Numeric; updated_at: Timestamp };
        Insert: { branch_id: UUID; product_id: UUID; qty?: Numeric; avg_cost?: Numeric };
        Update: Partial<Database['public']['Tables']['branch_inventory']['Insert']>;
        Relationships: [];
      };
      stock_movements: {
        Row: { id: UUID; product_id: UUID; branch_id: UUID; type: MovementType; qty: Numeric; unit_cost: Numeric; ref_table: string | null; ref_id: UUID | null; note: string | null; created_by: UUID | null; created_at: Timestamp };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      purchases: {
        Row: { id: UUID; txn_no: string; txn_date: string; supplier_id: UUID | null; branch_id: UUID; tax: Numeric; import_fee: Numeric; shipping_fee: Numeric; other_fee: Numeric; items_subtotal: Numeric; total_cost: Numeric; status: TxnStatus; note: string | null; created_by: UUID | null; created_at: Timestamp; updated_at: Timestamp };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      purchase_items: {
        Row: { id: UUID; purchase_id: UUID; product_id: UUID; qty: Numeric; unit_price: Numeric; line_subtotal: Numeric; allocated_fee: Numeric; landed_unit_cost: Numeric };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sales: {
        Row: { id: UUID; txn_no: string; txn_date: string; branch_id: UUID; customer_name: string | null; subtotal: Numeric; discount: Numeric; total: Numeric; total_cogs: Numeric; total_profit: Numeric; status: TxnStatus; note: string | null; created_by: UUID | null; created_at: Timestamp; updated_at: Timestamp };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_items: {
        Row: { id: UUID; sale_id: UUID; product_id: UUID; qty: Numeric; unit_price: Numeric; discount: Numeric; line_total: Numeric; cogs_unit: Numeric; line_cogs: Numeric; line_profit: Numeric };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_adjustments: {
        Row: { id: UUID; txn_no: string; txn_date: string; branch_id: UUID; product_id: UUID; qty_change: Numeric; reason: string; status: TxnStatus; created_by: UUID | null; created_at: Timestamp };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      expenses: {
        Row: { id: UUID; txn_date: string; branch_id: UUID | null; category: string | null; amount: Numeric; note: string | null; created_by: UUID | null; created_at: Timestamp };
        Insert: { id?: UUID; txn_date?: string; branch_id?: UUID | null; category?: string | null; amount: Numeric; note?: string | null };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
        Relationships: [];
      };
      audit_logs: {
        Row: { id: UUID; user_id: UUID | null; user_email: string | null; action: string; module: string; record_id: UUID | null; summary: string | null; old_value: unknown; new_value: unknown; created_at: Timestamp };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      v_inventory: {
        Row: { branch_id: UUID; branch_name: string; product_id: UUID; sku: string; product_name: string; unit: string; category_name: string | null; qty: Numeric; avg_cost: Numeric; stock_value: Numeric; sell_price: Numeric; updated_at: Timestamp };
      };
      v_stock_movements: {
        Row: { id: UUID; created_at: Timestamp; type: MovementType; qty: Numeric; unit_cost: Numeric; sku: string; product_name: string; branch_name: string; ref_table: string | null; ref_id: UUID | null; note: string | null; created_by_name: string | null };
      };
    };
    Functions: {
      has_perm: { Args: { p_module: string; p_action: string }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      my_permissions: { Args: Record<string, never>; Returns: { module: string; action: string }[] };
      create_purchase: { Args: { p_branch: UUID; p_supplier: UUID | null; p_txn_date: string; p_tax: number; p_import_fee: number; p_shipping_fee: number; p_other_fee: number; p_note: string | null; p_items: unknown }; Returns: UUID };
      update_purchase: { Args: { p_id: UUID; p_branch: UUID; p_supplier: UUID | null; p_txn_date: string; p_tax: number; p_import_fee: number; p_shipping_fee: number; p_other_fee: number; p_note: string | null; p_items: unknown }; Returns: UUID };
      delete_purchase: { Args: { p_id: UUID }; Returns: undefined };
      create_sale: { Args: { p_branch: UUID; p_txn_date: string; p_customer_name: string | null; p_discount: number; p_note: string | null; p_items: unknown }; Returns: UUID };
      update_sale: { Args: { p_id: UUID; p_branch: UUID; p_txn_date: string; p_customer_name: string | null; p_discount: number; p_note: string | null; p_items: unknown }; Returns: UUID };
      delete_sale: { Args: { p_id: UUID }; Returns: undefined };
      create_adjustment: { Args: { p_branch: UUID; p_product: UUID; p_qty_change: number; p_reason: string; p_unit_cost?: number | null; p_txn_date?: string | null }; Returns: UUID };
      admin_set_user_access: { Args: { p_user: UUID; p_role: UUID | null; p_is_active: boolean; p_permissions: string[] }; Returns: undefined };
      admin_set_role_permissions: { Args: { p_role: UUID; p_permissions: string[] }; Returns: undefined };
      dashboard_summary: { Args: { p_from: string; p_to: string; p_branch?: UUID | null }; Returns: unknown };
      sales_timeseries: { Args: { p_from: string; p_to: string; p_branch?: UUID | null }; Returns: { day: string; omzet: number; laba: number; hpp: number }[] };
      low_stock: { Args: { p_threshold?: number; p_branch?: UUID | null }; Returns: { sku: string; product_name: string; branch_name: string; qty: number }[] };
      recompute_inventory: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      movement_type: MovementType;
      txn_status: TxnStatus;
    };
  };
}

// Convenience row aliases
export type Role = Database['public']['Tables']['roles']['Row'];
export type Permission = Database['public']['Tables']['permissions']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Branch = Database['public']['Tables']['branches']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type BranchInventory = Database['public']['Tables']['branch_inventory']['Row'];
export type Purchase = Database['public']['Tables']['purchases']['Row'];
export type PurchaseItem = Database['public']['Tables']['purchase_items']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type SaleItem = Database['public']['Tables']['sale_items']['Row'];
export type StockAdjustment = Database['public']['Tables']['stock_adjustments']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type InventoryView = Database['public']['Views']['v_inventory']['Row'];
export type MovementView = Database['public']['Views']['v_stock_movements']['Row'];
