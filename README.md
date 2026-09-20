# Danus — Dana Usaha

Aplikasi web manajemen **barang, stok, pembelian, penjualan, cabang, user, dan laporan keuangan** untuk usaha multi-cabang.

- **Frontend:** React + TypeScript + Vite
- **Backend/DB:** Supabase (PostgreSQL, Auth, RLS, RPC)
- **Export/Import:** Excel (`.xlsx`) — hanya untuk export/import/backup, **bukan** database utama

> Prinsip inti: **stok tidak pernah disimpan sebagai angka statis**. Semua perubahan stok melewati *ledger* `stock_movements`; stok saat ini adalah cache (`branch_inventory`) yang disinkronkan oleh fungsi database di dalam transaksi atomik. Edit/hapus transaksi membuat *reversal movement* — histori tetap utuh dan dapat diaudit.

## Fitur utama

- 🔐 Login (Supabase Auth) + **role & permission per modul** yang divalidasi di database via **RLS** (bukan sekadar sembunyikan tombol).
- 📦 Master data: Barang (SKU unik, search, filter kategori/status), Kategori, Supplier, Cabang.
- 🧮 Inventory: stok per cabang, Stock Movement (ledger), Penyesuaian Stok.
- 🛒 Pembelian: landed cost (pajak + impor + kirim + biaya lain dialokasikan ke modal), stok otomatis bertambah.
- 💰 Penjualan: stok otomatis berkurang, **dicegah bila stok kurang**, HPP di-*snapshot* (WMA), laba dihitung otomatis.
- ✏️ Edit/Delete transaksi: stok dikoreksi otomatis via reversal (atomic RPC).
- 📊 Dashboard: omzet, HPP, laba, jumlah transaksi, total stok, barang stok rendah, grafik omzet & laba, filter hari/minggu/bulan/custom + cabang.
- 📈 Laporan + Export Excel (penjualan, pembelian, stok, laba).
- 📝 Audit log (siapa mengubah apa, nilai lama → baru).

## Menjalankan (lokal)

```bash
# 1. Install dependency
npm install

# 2. Siapkan environment
cp .env.example .env.local
# lalu isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY

# 3. Jalankan
npm run dev
```

Lihat **[docs/SETUP.md](docs/SETUP.md)** untuk langkah setup Supabase (migrasi + admin bootstrap) secara lengkap, dan **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** untuk desain sistem, ERD, dan alur transaksi.

## Struktur proyek

```
danus/
├─ supabase/migrations/   # SQL: schema, RLS, functions/RPC, seed, bootstrap
├─ docs/                  # ARCHITECTURE.md, SETUP.md
└─ src/
   ├─ auth/               # AuthProvider, ProtectedRoute, Can
   ├─ components/         # ui/ (kit) + layout/ (Sidebar, Topbar)
   ├─ features/           # 1 folder per modul (products, purchases, sales, ...)
   ├─ lib/                # supabase client, excel, format, permissions, lookups
   ├─ types/              # tipe Database (Supabase)
   └─ routes.tsx, App.tsx, main.tsx
```

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan dev server (Vite) |
| `npm run build` | Type-check + build produksi |
| `npm run preview` | Preview hasil build |
| `npm run lint` | ESLint |
| `npm run gen:types` | (opsional) generate ulang tipe DB via Supabase CLI |
