# Setup — Danus

Panduan menyiapkan Supabase + menjalankan aplikasi dari nol.

## 1. Buat proyek Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **Project Settings → API**, catat:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

## 2. Jalankan migrasi database

Migrasi ada di `supabase/migrations/` dan **harus dijalankan berurutan** (0001 → 0010).

### Opsi A — SQL Editor (paling mudah)
Buka **SQL Editor** di dashboard Supabase, lalu tempel & jalankan isi tiap file secara berurutan:

```
0001_schema.sql              -- tabel, enum, index, constraint
0002_authz_functions.sql     -- is_admin(), has_perm(), trigger profil otomatis
0003_rls.sql                 -- Row Level Security di semua tabel
0004_seed_permissions_roles.sql  -- katalog permission + role admin/staff
0005_inventory_engine.sql    -- engine stok (WMA), ledger, recompute
0006_purchase_rpc.sql        -- create/update/delete pembelian (atomic + landed cost)
0007_sale_rpc.sql            -- create/update/delete penjualan (atomic + COGS snapshot)
0008_adjustment_and_admin_rpc.sql -- penyesuaian stok + admin akses/role
0009_report_views.sql        -- view & RPC laporan/dashboard
```

> `0010_bootstrap_admin.sql` dijalankan **nanti** (lihat langkah 5).

### Opsi B — Supabase CLI
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

## 3. Konfigurasi environment aplikasi

```bash
cp .env.example .env.local
```
Isi `.env.local`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

## 4. Jalankan aplikasi

```bash
npm install
npm run dev
```
Buka http://localhost:5173

## 5. Buat Admin Utama

1. Di halaman login, klik **Daftar** dan buat akun dengan email admin Anda.
   (Trigger `handle_new_user` otomatis membuat baris di `profiles`.)
2. Buka **SQL Editor**, edit `0010_bootstrap_admin.sql`: ganti `admin@example.com`
   dengan email yang baru Anda daftarkan, lalu jalankan.
3. **Logout lalu login lagi** agar permission ter-refresh. Anda kini Admin Utama (akses penuh).

## 6. Konfigurasi Auth (opsional tapi disarankan)

- **Authentication → Providers → Email:** untuk mempermudah testing, matikan
  "Confirm email" agar user bisa langsung login setelah daftar. Aktifkan kembali
  untuk produksi.
- Atur **Site URL** dan **Redirect URLs** sesuai domain Anda.

## 7. Data awal

Sebagai admin:
1. **Cabang** → tambah cabang (mis. Bandung, Jakarta).
2. **Kategori** & **Supplier** (opsional).
3. **Barang** → tambah manual atau **Import** dari Excel (ada tombol unduh template).
4. **Pembelian** → stok akan bertambah otomatis di cabang tujuan.
5. **Penjualan** → stok berkurang otomatis, laba dihitung otomatis.

## 8. Membuat user biasa + permission

1. User mendaftar sendiri (Daftar), atau Anda arahkan mereka mendaftar.
2. **User → Atur Akses:** pilih role (mis. `staff`) dan/atau centang izin langsung per modul.
3. **Role & Permission:** buat role kustom (mis. `kasir`) dan atur matriks izinnya.

## Troubleshooting

| Gejala | Solusi |
|---|---|
| "Missing Supabase env vars" | `.env.local` belum diisi / salah nama variabel (harus prefix `VITE_`). |
| Login sukses tapi menu kosong | User belum punya role/izin. Admin set via **User → Atur Akses**. Login ulang. |
| "Akses ditolak oleh kebijakan keamanan (RLS)" | Operasi tidak diizinkan permission user — memang perilaku yang benar. |
| Stok terlihat tidak sinkron | Jalankan `select recompute_inventory();` (khusus admin) untuk membangun ulang cache dari ledger. |
| Perlu regenerate tipe TS | `npm run gen:types` (butuh Supabase CLI + `SUPABASE_PROJECT_ID`). |
