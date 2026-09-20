import type { PostgrestError } from '@supabase/supabase-js';

/** Translate Postgres/RPC errors into friendly Indonesian messages. */
export function friendlyError(err: unknown): string {
  const raw =
    (err as PostgrestError)?.message ??
    (err as Error)?.message ??
    String(err);

  if (raw.includes('INSUFFICIENT_STOCK')) return 'Stok tidak mencukupi untuk transaksi ini.';
  if (raw.includes('CANNOT_DELETE')) return 'Transaksi tidak dapat dihapus karena akan membuat stok negatif (barang mungkin sudah terjual).';
  if (raw.includes('FORBIDDEN')) return 'Anda tidak memiliki izin untuk melakukan aksi ini.';
  if (raw.includes('NOT_FOUND')) return 'Data tidak ditemukan atau sudah dibatalkan.';
  if (raw.includes('VALIDATION')) return raw.replace(/^VALIDATION:\s*/, '');
  if (raw.includes('duplicate key') && raw.includes('sku')) return 'SKU sudah digunakan. Gunakan SKU lain.';
  if (raw.includes('duplicate key')) return 'Data dengan nilai unik tersebut sudah ada.';
  if (raw.includes('row-level security') || raw.includes('violates row-level security')) return 'Akses ditolak oleh kebijakan keamanan (RLS).';
  if (raw.includes('JWT') || raw.includes('Invalid login')) return 'Sesi tidak valid. Silakan login kembali.';

  return raw;
}
