/**
 * Central definition of permission modules & actions.
 * These MUST match the values seeded in the database (see migrations).
 * The frontend uses them for UI gating; the database enforces them via RLS.
 */
export const MODULES = [
  'products',
  'categories',
  'suppliers',
  'branches',
  'inventory',
  'adjustments',
  'purchases',
  'sales',
  'reports',
  'users',
  'roles',
  'audit',
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissionKey = `${Module}.${Action}`;

export function permKey(module: Module, action: Action): PermissionKey {
  return `${module}.${action}`;
}

export const MODULE_LABELS: Record<Module, string> = {
  products: 'Barang',
  categories: 'Kategori',
  suppliers: 'Supplier',
  branches: 'Cabang',
  inventory: 'Stok',
  adjustments: 'Penyesuaian Stok',
  purchases: 'Pembelian',
  sales: 'Penjualan',
  reports: 'Laporan',
  users: 'User',
  roles: 'Role',
  audit: 'Audit Log',
};

export const ACTION_LABELS: Record<Action, string> = {
  view: 'Lihat',
  create: 'Buat',
  edit: 'Ubah',
  delete: 'Hapus',
};
