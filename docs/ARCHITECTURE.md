# Arsitektur — Danus

Dokumen desain: arsitektur, ERD, relasi tabel, dan alur transaksi.

## 1. Prinsip desain

1. **Database = sumber kebenaran.** Excel hanya untuk export/import/backup.
2. **Stok bukan angka statis.** Semua perubahan stok tercatat di *ledger* `stock_movements` (append-only). Stok saat ini = cache `branch_inventory` yang selalu = `SUM(qty)` movement untuk (product, branch).
3. **Logika bisnis di database.** Pembelian, penjualan, penyesuaian, dan edit/delete dijalankan lewat **RPC PostgreSQL (`SECURITY DEFINER`)** yang atomik — bukan di frontend.
4. **Keamanan berlapis.** Otorisasi ditegakkan **RLS** + fungsi `has_perm()`; RPC juga memeriksa izin. Frontend hanya menyembunyikan UI (kenyamanan), bukan pengaman.
5. **Histori dapat diaudit.** Edit/hapus membuat *reversal movement*, tidak menimpa histori. `audit_logs` mencatat siapa/kapan/apa.

## 2. Arsitektur tingkat tinggi

```
Browser (React+TS+Vite)
  ├─ React Query  → services (supabase-js, anon key + JWT)
  ├─ AuthProvider → my_permissions() RPC → Set<permission>
  └─ Can / ProtectedRoute (UI gating)
        │  HTTPS + JWT
        ▼
Supabase
  ├─ Auth (JWT)
  ├─ PostgREST + RLS (has_perm / is_admin di tiap tabel)
  ├─ RPC atomik: create/update/delete_purchase, *_sale, create_adjustment, admin_*
  ├─ Triggers: set_updated_at, handle_new_user
  └─ PostgreSQL: schema normalized + ledger + cache
```

## 3. ERD (ringkas)

```
auth.users ──1:1── profiles ──*:1── roles ──*:*── permissions
                        │                              │
                        └────*:*── user_permissions ───┘   (role_permissions & user_permissions)

branches ─┐
categories┤
suppliers │
products ─┼─*:*─ branch_inventory (product×branch = qty, avg_cost)   [CACHE]
   │      └─1:*─ stock_movements (signed qty, unit_cost, ref)         [LEDGER]
   │
purchases ─1:*─ purchase_items (qty, unit_price, landed_unit_cost)
sales     ─1:*─ sale_items    (qty, unit_price, discount, cogs_unit, line_profit)
stock_adjustments · expenses · audit_logs
```

## 4. Relasi antar tabel

- `profiles.id → auth.users.id` (1:1). `profiles.role_id → roles.id`.
- Izin efektif user = (admin ⇒ semua) ∪ `role_permissions` (lewat role) ∪ `user_permissions` (langsung). Dihitung oleh `has_perm(module, action)`.
- `branch_inventory(product_id, branch_id)` PK gabungan — cache stok saat ini.
- `stock_movements` immutable; `qty` bertanda (+ masuk, − keluar). Setiap movement mereferensikan transaksi asalnya (`ref_table`, `ref_id`).
- `purchases 1:N purchase_items`, `sales 1:N sale_items` (ON DELETE CASCADE).

## 5. Model biaya (HPP/COGS)

**Weighted Moving Average (WMA) per (product, branch).**

- **Landed cost pembelian:** biaya tambahan (pajak + impor + kirim + lain) dialokasikan **proporsional terhadap subtotal tiap baris**, menghasilkan `landed_unit_cost` per item. Inilah yang masuk ke rata-rata.
- **Saat pembelian (stok masuk):**
  `new_avg = (old_qty*old_avg + in_qty*landed_unit_cost) / (old_qty + in_qty)`
- **Saat penjualan (stok keluar):** `avg_cost` tidak berubah; `cogs_unit` di-*snapshot* dari `avg_cost` saat itu ke `sale_items` → laba historis tidak berubah walau harga modal berikutnya berubah.

## 6. Alur Pembelian → Stok

`create_purchase(...)` (atomic):
1. Cek `has_perm('purchases','create')`.
2. Insert `purchases` + `purchase_items`.
3. `_recalc_purchase`: hitung subtotal, alokasi biaya proporsional, `landed_unit_cost`, total.
4. `_apply_purchase_items`: tiap item → `stock_movements(PURCHASE, +qty)` + upsert `branch_inventory` (qty naik, avg WMA).
5. Tulis `audit_logs`. **Commit** (semua atau tidak sama sekali).

Contoh: stok 20 + beli 10 → **30**.

## 7. Alur Penjualan → Stok

`create_sale(...)` (atomic):
1. Cek `has_perm('sales','create')`.
2. Tiap item: kunci baris `branch_inventory` (`FOR UPDATE`); **jika qty < diminta → EXCEPTION** (`INSUFFICIENT_STOCK`, seluruh transaksi rollback).
3. Snapshot `cogs_unit = avg_cost`; hitung `line_profit = (harga−diskon−cogs)*qty`.
4. `stock_movements(SALE, −qty)`; `branch_inventory.qty -= qty`.
5. Update total sale (omzet, HPP, laba). `audit_logs`. **Commit**.

Contoh: stok 30 − jual 5 → **25**. Jual 40 saat stok 30 → ditolak.

## 8. Edit / Delete transaksi (reversal)

Prinsip: **jangan** update stok berdasarkan nilai terbaru saja. Balik dulu efek lama, lalu terapkan yang baru.

- **Edit pembelian:** `_reverse_purchase` (movement `PURCHASE_REVERSAL` mengeluarkan qty lama) → ganti header/item → `_apply_purchase_items` (movement `PURCHASE` baru).
  Contoh: beli 10 (stok 30) diedit jadi 15 → reversal −10, apply +15 → **35**.
- **Edit penjualan:** `_reverse_sale` (movement `SALE_REVERSAL` mengembalikan qty) → ganti item → `_apply_sale_items` (validasi stok lagi).
  Contoh: jual 10 (stok 20) diedit jadi 6 → kembalikan 4 → **24**.
- **Delete:** buat reversal, tandai transaksi `voided`. Hapus pembelian ditolak bila membuat stok negatif (barang mungkin sudah terjual).

Semua di dalam satu transaksi PostgreSQL ⇒ tidak ada state setengah jadi.

## 9. Authentication + Authorization + RLS

- **Auth:** Supabase Auth (email/password). Trigger `handle_new_user` membuat `profiles` saat signup.
- **Fungsi otorisasi:** `is_admin()` (role = `admin`, bypass semua) dan `has_perm(module, action)` membaca `auth.uid()`.
- **RLS tiap tabel:**
  - `SELECT` ⇐ `module.view`, `INSERT` ⇐ `module.create`, `UPDATE` ⇐ `module.edit`, `DELETE` ⇐ `module.delete`.
  - Tabel transaksional (`stock_movements`, `branch_inventory`, `purchases`, dst.) hanya bisa **dibaca** langsung; **penulisan** hanya lewat RPC `SECURITY DEFINER` yang mengecek izin — sehingga panggilan PostgREST langsung pun tetap aman.
- **Frontend** memanggil `my_permissions()` untuk menyusun `Set<permission>` guna menampilkan/menyembunyikan UI (`<Can>`, `ProtectedRoute`).

## 10. Transaction safety

Semua operasi multi-langkah (validasi izin → validasi barang/cabang → cek stok → insert header → insert item → movement → update inventory) berada dalam **satu fungsi PL/pgSQL** = satu transaksi. Kegagalan di langkah mana pun me-*rollback* seluruhnya.

## 11. Ketahanan / audit

- `recompute_inventory()` (admin) membangun ulang seluruh cache `branch_inventory` dengan memutar ulang ledger — alat verifikasi/perbaikan bila diperlukan.
- `audit_logs` menyimpan `user`, `action`, `module`, `record_id`, `summary`, `old_value`, `new_value`, `timestamp`.

## 12. Asumsi & keputusan desain

- **WMA** dipilih (bukan FIFO) untuk kesederhanaan & skalabilitas; skema memungkinkan migrasi ke FIFO nanti (movement sudah menyimpan `unit_cost`).
- **Permission global per modul** di v1; skema (`branches`, `branch_inventory`) siap untuk penambahan scoping per cabang.
- **Mata uang tunggal (IDR)**, `numeric(14,2)`.
- **Stok negatif diblokir** pada penjualan.
