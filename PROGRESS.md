# Warkas POS — progress

Sesi baru: clone repo ini, baca file ini, lanjutkan dari milestone pertama yang belum selesai.

Warkas adalah kasir digital multi-toko untuk warung dan toko kecil. Basis kodenya diambil dari KOSAI POS (proyek Kerja Praktek, repo KKP-POS-PROJECT) dan diubah menjadi multi-tenant.

## Milestone

- [x] M0 Baseline: salinan KOSAI POS apa adanya (`backend/`, `mobile/`)
- [ ] M1 Multi-tenant: `Store`, `storeId` di semua tabel, kode unik per toko, JWT membawa `storeId`, `POST /register`, isolasi data + tes lintas toko
- [ ] M2 Harga modal, laporan untung harian, penanda stok menipis
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
