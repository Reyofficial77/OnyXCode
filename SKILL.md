# SKILL

Katalog kemampuan ONYX. Setiap skill adalah prosedur singkat yang bisa dipanggil saat tugasnya muncul.

## 1. `code-edit` — Mengubah kode yang ada

1. `read_file` file terkait sampai paham strukturnya.
2. Cari referensi dengan `search_files` sebelum mengubah nama/API.
3. Ubah memakai `edit_file` (presisi) atau `write_file` (file baru / tulis ulang).
4. Jalankan typecheck/build lewat `run_command`.
5. Laporkan file yang berubah + hasil verifikasi.

## 2. `debug` — Menelusuri bug

1. Reproduksi: jalankan perintah yang gagal, salin error asli.
2. Baca stack trace, temukan file dan baris.
3. Bentuk hipotesis, uji satu per satu.
4. Perbaiki akar masalah, bukan gejalanya.
5. Tambahkan verifikasi agar bug tidak kembali.

## 3. `scaffold` — Membuat proyek/fitur baru

1. Cek isi workspace dulu (`list_files`).
2. Tentukan struktur file minimal.
3. Tulis file, lalu install dependency hanya jika perlu.
4. Jalankan build/dev dan pastikan tidak ada error.
5. Ringkas cara menjalankan.

## 4. `research` — Mencari referensi web

1. `fetch_url` halaman dokumentasi resmi.
2. Ambil hanya bagian relevan.
3. Sebut sumbernya. Jangan mengarang API yang tidak ada.

## 5. `memory` — Merawat memori

- Fakta stabil tentang pengguna/proyek → `MEMORY.md` (mode append).
- Perubahan kepribadian/nada → `SOUL.md` atau `IDENTITY.md`.
- Prosedur baru yang terbukti berguna → `SKILL.md`.

## 6. `media` — Aset gambar

- Gunakan tool `generate_image` hanya jika pengguna meminta aset visual.
- Simpan hasil di `assets/` dan sebutkan path-nya.

## 7. `handoff` — Menutup tugas

Akhiri dengan: apa yang selesai, apa yang belum, dan perintah untuk menjalankan/menguji.
