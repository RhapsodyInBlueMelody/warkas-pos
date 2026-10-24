# Warkas POS — progress

Sesi baru: clone repo ini, baca file ini, lanjutkan dari milestone pertama yang belum selesai.

Warkas adalah kasir digital multi-toko untuk warung dan toko kecil. Basis kodenya diambil dari KOSAI POS (proyek Kerja Praktek, repo KKP-POS-PROJECT) dan diubah menjadi multi-tenant.

## Milestone

- [x] M0 Baseline: salinan KOSAI POS apa adanya (`backend/`, `mobile/`)
- [x] M1 Multi-tenant: `Store`, `storeId` di semua tabel, kode unik per toko, JWT membawa `storeId`, `POST /register`, isolasi data + tes lintas toko (12 tes lulus di Postgres 16 lokal)
- [x] M2 Harga modal, laporan untung harian, penanda stok menipis (18 tes lulus)
- [ ] M3 Buku bon (utang pelanggan)
- [ ] M4 Batas paket gratis (50 barang), ekspor Excel. Paket berbayar hanya flag di database (belum ada pembayaran)
- [ ] M5 Aplikasi mobile: rebrand ke Warkas, layar daftar toko, bon, laporan
- [ ] M6 Samakan proposal dan landing page dengan fitur yang benar-benar jadi

## Keputusan

- Satu database bersama, tabel dibatasi kolom `storeId` (bukan database per toko).
- `username` unik secara global supaya login cukup username + password.
- Supplier dan kategori opsional pada produk (pemilik warung jarang mengisinya).

## Catatan jujur

- Aplikasi mobile tidak bisa dijalankan di lingkungan pengembangan Claude. Layar mobile ditulis tanpa dijalankan; uji di emulator atau HP.
- Kode asal dikerjakan untuk KOSAI TB 1. Pastikan boleh dipakai ulang sebelum repo ini dipublikasikan atau dipakai komersial.

## Menjalankan backend dan tes

```bash
cd backend && bun install
# Postgres 16 kosong, terapkan migrasi:
for m in prisma/migrations/*/migration.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$m"; done
export DATABASE_URL=... JWT_SECRET=...
bunx prisma generate   # di lingkungan Claude: awali dengan PRISMA_SCHEMA_ENGINE_BINARY=/bin/true karena binaries.prisma.sh diblokir (terbukti bekerja untuk generate)
bunx tsc --noEmit
bun test
bun prisma/seed.ts     # data demo: username demo / demo.kasir, password demo12345 (atau SEED_DEMO_PASSWORD)
```

## Catatan M1

- Migrasi `20261024000000_init` menggantikan migrasi KOSAI lama (skema multi-toko dimulai dari nol). Belum dicoba dengan `prisma migrate deploy` karena engine Prisma tidak bisa diunduh di lingkungan Claude; SQL diterapkan langsung dengan psql.
- Pemilik (ADMIN) melihat semua transaksi tokonya, kasir hanya miliknya sendiri.
- `POST /staff` (pemilik) membuat kasir; `GET/POST /categories` untuk kategori. Pemasok belum punya endpoint.
- `POST /products` dan `POST /transaction` kini membalas 201 (sebelumnya 200). Klien mobile masih versi KOSAI dan belum diuji terhadap API baru.

## Catatan M2

- Migrasi `20261024130000_add_cost_and_min_stock`: `Product.costPrice` (nullable), `Product.minStock` (default 5), `TransactionItem.costAtTime` (nullable, salinan modal saat transaksi).
- `GET /reports/daily?date=YYYY-MM-DD&tzOffset=420` (hanya pemilik). Default hari ini zona WIB. Mengembalikan omzet, modal, untung, rincian per metode bayar, 5 produk teratas.
- Untung hanya dihitung dari item yang punya modal. Bila ada item tanpa modal, `profitComplete=false` dan `uncostedRevenue` memberi tahu berapa omzet yang tidak ikut hitungan untung. Jangan tampilkan angka untung sebagai lengkap di UI saat `profitComplete=false`.
- `GET /products/low-stock` dan field `lowStock` di `GET /products` (stok <= minStock).
- Kasir tidak menerima `costPrice` maupun `costAtTime`, dan mendapat 403 di laporan.
- Laporan mingguan/bulanan belum ada (landing page menjanjikannya untuk paket Toko); dikerjakan bersama M4.
- Seed: produk "Keripik Singkong" sengaja menipis; transaksi demo berumur 1-5 hari, jadi laporan hari ini kosong tetapi `?date=` kemarin berisi.
