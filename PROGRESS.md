# Warkas POS — progress

Sesi baru: clone repo ini, baca file ini, lanjutkan dari milestone pertama yang belum selesai.

Warkas adalah kasir digital multi-toko untuk warung dan toko kecil. Basis kodenya diambil dari KOSAI POS (proyek Kerja Praktek, repo KKP-POS-PROJECT) dan diubah menjadi multi-tenant.

## Milestone

- [x] M0 Baseline: salinan KOSAI POS apa adanya (`backend/`, `mobile/`)
- [x] M1 Multi-tenant: `Store`, `storeId` di semua tabel, kode unik per toko, JWT membawa `storeId`, `POST /register`, isolasi data + tes lintas toko (12 tes lulus di Postgres 16 lokal)
- [x] M2 Harga modal, laporan untung harian, penanda stok menipis (18 tes lulus)
- [x] M3 Buku bon (utang pelanggan) (29 tes lulus)
- [x] M4 Paket gratis/Toko: trial 14 hari, kedaluwarsa, batas 50 produk, kunci bon, `GET /plan`, aktivasi manual (M4a); laporan mingguan/bulanan (M4b); ekspor Excel (M4c). Tidak ada pembayaran otomatis. 54 tes lulus
- [x] M5 Aplikasi mobile Warkas: tema, daftar toko/masuk, dashboard, kasir + struk + riwayat, produk, buku bon, laporan harian/mingguan/bulanan, ekspor Excel, paket, staf kasir. Diuji di pratinjau web terhadap backend asli; BELUM diuji di Android asli
- [ ] M6 Samakan proposal dan landing page dengan fitur yang benar-benar jadi

## Keputusan

- Satu database bersama, tabel dibatasi kolom `storeId` (bukan database per toko).
- `username` unik secara global supaya login cukup username + password.
- Supplier dan kategori opsional pada produk (pemilik warung jarang mengisinya).

## Catatan jujur

- Aplikasi mobile tidak bisa dijalankan sebagai app Android di lingkungan pengembangan Claude. Yang bisa: typecheck (`npx tsc --noEmit`) dan pratinjau web (`npx expo export --platform web`, dibuka di Chromium terhadap backend sungguhan). Uji di emulator atau HP tetap perlu.
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
- Seed: produk "Keripik Singkong" sengaja menipis; transaksi demo berumur 1-5 hari (laporan `?date=` kemarin berisi); satu transaksi BON hari ini untuk Bu Ani.

## Catatan M3

- Migrasi `20261024140000_add_debt_ledger`: enum `PaymentMethod` + `BON`, tabel `Customer` dan `DebtEntry`, `Transaction.customerId`. Ada `CHECK (amount > 0)` di `DebtEntry` yang ditulis tangan di SQL dan tidak muncul di `schema.prisma`. Migrasi ditulis tangan mengikuti gaya Prisma dan belum diverifikasi dengan `prisma migrate diff`; bila `prisma migrate dev` kelak mengusulkan migrasi koreksi, periksa dulu apakah itu hanya perbedaan kosmetik.
- Buku bon berupa buku besar (hanya ditambah): `CHARGE` menambah utang, `PAYMENT` mengurangi. Sisa utang = jumlah CHARGE - jumlah PAYMENT. Tidak ada status lunas yang disimpan; `settled` dihitung.
- Endpoint: `GET/POST /customers`, `GET/PATCH /customers/:id`, `POST /customers/:id/payments` (kasir dan pemilik), `POST /customers/:id/charges` (hanya pemilik, untuk memindahkan catatan bon kertas).
- Checkout `paymentMethod: "BON"` wajib `customerId` dan membuat CHARGE dalam transaksi database yang sama dengan potong stok. Metode lain dengan `customerId` ditolak.
- Pembayaran melebihi sisa utang ditolak (400). Pembayaran memakai `SELECT ... FOR UPDATE` pada baris pelanggan; tes balapan 12 pembayaran serentak gagal bila kunci itu dibuang (diverifikasi dengan mutasi manual). Tes balapan stok checkout (20 serentak) juga diperkuat dan diverifikasi dengan cara yang sama.
- Laporan harian kini memuat `byPayment.BON`, `debtPaymentsReceived`, `cashIn` (uang yang benar-benar masuk), dan `debtOutstanding`. `revenue` dan `profit` tetap berbasis penjualan (termasuk bon).
- Belum ada: batas kredit per pelanggan, pengingat tagihan, hapus/gabung pelanggan, koreksi pembayaran yang salah catat (saat ini hanya bisa dikoreksi dengan CHARGE manual oleh pemilik).

## Catatan M4a (paket)

- Keputusan: naik paket lewat **aktivasi manual** oleh pemilik platform (`bun scripts/set-plan.ts <storeId|username> TOKO <hari|forever>`), toko baru dapat **trial 14 hari** paket Toko, batas produk gratis **50**. Tidak ada payment gateway (tidak bisa diuji di lingkungan Claude).
- Migrasi `20261025000000_add_plan_expiry`: `Store.planExpiresAt`, `Store.planIsTrial`. Paket TOKO yang lewat `planExpiresAt` otomatis dianggap FREE (`effectivePlan`), tanpa tugas terjadwal; kolom `plan` menyimpan paket terakhir yang diaktifkan.
- Server menegakkan batas: produk ke-51 di paket gratis ditolak `402 {code:"PLAN_LIMIT", limit:50}` (hitung dan buat dalam satu transaksi dengan `FOR UPDATE` pada baris toko). Fitur terkunci mengembalikan `402 {code:"PLAN_REQUIRED", feature, upgradeTo:"TOKO"}`.
- Kunci bon: `POST /customers`, `POST /customers/:id/charges`, dan checkout `BON` butuh paket Toko. Melihat pelanggan dan mencatat pembayaran bon lama tetap bebas di paket gratis agar toko yang turun paket tidak terjebak dengan utang yang tak bisa ditagih. Produk berlebih tidak dihapus saat turun paket; hanya tidak bisa menambah.
- `GET /plan` (semua peran): paket berlaku, `isTrial`, `daysLeft`, batas, pemakaian, fitur. `login`, `register`, dan `profile` juga memuat info paket.
- Tes: balapan batas produk (20 permintaan serentak, kuota 5) diverifikasi gagal bila kunci `FOR UPDATE` dibuang.
- **Untuk M6 (landing page dan proposal):** sebutkan trial 14 hari; paket Toko diaktifkan manual (bukan bayar di aplikasi); batas gratis 50 produk sudah sesuai.

## Catatan M4b (laporan mingguan/bulanan)

- `GET /reports/summary?period=week|month&date=YYYY-MM-DD&tzOffset=420` (pemilik, paket Toko; gratis mendapat 402 `PLAN_REQUIRED`/`extendedReports`). Minggu = Senin-Minggu yang memuat `date`; bulan = tanggal 1 sampai akhir bulan yang memuat `date`. Default hari ini zona WIB.
- Isi: semua kolom laporan harian + `from`/`to` (tanggal lokal, inklusif) + `days[]` (transaksi, omzet, modal, untung, uang masuk per hari, termasuk hari kosong). Transaksi dikelompokkan per hari kalender lokal sehingga yang jatuh tepat tengah malam masuk hari yang benar.
- `report.ts` direfaktor: harian dan ringkasan memakai fungsi `loadRange` dan `summarize` yang sama.
- Tes memakai transaksi yang waktunya dimundurkan ke tanggal tetap (2026-10-19 s.d. 2026-11-01), jadi tidak bergantung pada jam berjalan. Mutasi manual terverifikasi: awal minggu salah, bucket hari UTC, dan akhir bulan salah, semuanya membuat tes gagal.

## Catatan M4c (ekspor Excel)

- `GET /export/xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD&tzOffset` hanya untuk pemilik (403 kasir) dan paket Toko (402 `PLAN_REQUIRED`, feature `export`). Default: awal bulan sampai hari ini (WIB). Maks 366 hari dan 20.000 transaksi, selebihnya 400.
- Sheet: Ringkasan, Transaksi, Item terjual (modal dan untung kosong bila modal tidak diketahui), Stok (menandai stok menipis), Bon (sisa utang saat ini).
- Waktu ditulis sebagai jam lokal sesuai `tzOffset`. Semua string ditulis sebagai teks, jadi isi yang diawali "=" tidak menjadi rumus.
- Tes diverifikasi dengan mutasi: gate paket dan offset zona waktu dimatikan, tes gagal.
- Belum diuji dibuka di Excel/LibreOffice sungguhan; hanya dibaca ulang dengan exceljs.

## Catatan M5a (mobile: fondasi)

- Layar KOSAI lama (Dashboard, Product, History, TransactionSuccess, Login) dihapus; kasir dan riwayat ditulis ulang di M5b. 
- Tema di `theme.ts` (palet dan font sama dengan landing page), komponen dasar di `ui.tsx`. `react-native-paper`, vector-icons, blur, gradient, Inter, Poppins dibuang.
- Alamat backend lewat `EXPO_PUBLIC_API_URL` (bawaan `http://10.0.2.2:3000` untuk emulator Android; HP asli pakai IP komputer).
- Sesi disimpan di `expo-secure-store` (terenkripsi). Aturan sesi 3 menit milik KOSAI dibuang; sesi berakhir saat server membalas 401 (token berlaku 24 jam), lalu navigator kembali ke layar masuk otomatis dan cache data dihapus.
- Batas hari laporan memakai zona waktu perangkat (`tzOffset`).
- Diverifikasi: typecheck bersih; pratinjau web di Chromium terhadap backend + data demo (login salah/kosong, daftar, dashboard pemilik). Belum: Android asli, dashboard kasir, toko paket gratis.
- Kunci SecureStore tidak jalan di web, jadi di pratinjau web sesi hilang saat reload (di Android tersimpan).

## Catatan M5b (mobile: kasir)

- Kasir: cari produk, keranjang (jumlah dibatasi stok), bayar Tunai/QRIS/Transfer/Bon. Tunai punya kolom uang diterima dan kembalian (hanya tampil di struk, tidak disimpan di server). Bon memilih atau menambah pelanggan; di paket gratis tombol Bon bertanda "Toko" dan menampilkan ajakan upgrade (dan 402 dari server juga ditangani).
- Struk: teks monospace lebar 32 karakter, dibagikan lewat Share bawaan (mis. ke WhatsApp). Cetak thermal Bluetooth belum ada (placeholder KOSAI dihapus, bukan dipalsukan).
- Waktu di struk setelah checkout memakai jam perangkat; riwayat memakai waktu server.
- `constants/app.ts`: nomor WhatsApp admin untuk aktivasi lewat `EXPO_PUBLIC_UPGRADE_WHATSAPP`. Kosong sampai ada nomor sungguhan; tanpa nomor tombol "Hubungi admin" tidak muncul.
- Diverifikasi di pratinjau web terhadap backend asli: tunai dengan kembalian, bon (saldo Bu Ani 20.000 -> 23.500, stok 98 -> 97 sesuai database), riwayat, toko paket gratis (bon terkunci). Belum: Android asli, dashboard kasir (peran KASIR), stok habis/melebihi stok di UI.

## Catatan M5c-1 (mobile: produk dan bon)

- Produk: daftar + cari + filter stok menipis; pemilik bisa tambah/ubah (harga modal, batas stok menipis); kasir hanya melihat dan tidak melihat modal. Batas 50 produk paket gratis ditampilkan dan 402 `PLAN_LIMIT` memunculkan ajakan upgrade. Harga modal yang sudah diisi tidak bisa dikosongkan lagi (server tidak mendukung).
- Buku bon: total utang, daftar pelanggan, detail dengan riwayat utang/bayar, catat pembayaran (tombol Lunasi, melebihi utang ditolak di UI dan server), pemilik bisa menambah utang manual. Di paket gratis, melihat dan membayar bon lama tetap bisa; pelanggan baru memunculkan ajakan upgrade.
- Diverifikasi di pratinjau web terhadap backend asli (hasil dicocokkan ke database lewat API). Belum: Android asli, tampilan peran KASIR untuk layar ini, hapus produk (belum ada di UI).

## Catatan M5c-2 (mobile: laporan, paket, staf, ekspor)

- Laporan (pemilik): Hari/Minggu/Bulan, navigasi periode, omzet/uang masuk/untung/transaksi, grafik batang per hari, rincian metode bayar, produk terlaris, sisa bon. Paket gratis: Minggu/Bulan dan ekspor menampilkan ajakan upgrade; harian tetap bisa. Untung yang tidak lengkap diberi peringatan, tidak disembunyikan.
- Ekspor Excel: unduh dari server lalu `expo-file-system` + `expo-sharing` (Android/iOS). Jalur native ini TIDAK bisa dijalankan di sini; di pratinjau web berkas diunduh langsung dan isinya dicocokkan dengan API (omzet dan jumlah transaksi sama).
- Paket: status, sisa trial, tabel fitur Warung vs Toko, ajakan upgrade manual.
- Staf: pemilik membuat akun kasir. Tampilan kasir diperiksa: tidak ada kartu paket, laporan, staf, tombol tambah produk, ataupun info modal.
- Pratinjau web memakai proxy satu-origin karena backend belum mengaktifkan CORS (tidak perlu untuk app native). Jika nanti ada klien web, tambahkan CORS.
- Belum ada: hapus produk di UI, kelola kategori/pemasok di UI, ubah/nonaktifkan akun kasir, batas utang pelanggan, pengingat bon, pembayaran otomatis, cetak thermal Bluetooth.
