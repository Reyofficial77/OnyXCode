# ONYX — AI Coding Agent

Ruang kerja AI pribadi bergaya monokrom: chat dengan agent yang bisa membaca/menulis file, menjalankan perintah, mengingat preferensi, menerima lampiran, dan membuat gambar/video. Dibangun dengan Next.js 15, React 19, dan Tailwind CSS v4.

Semua tampilan memakai palet hitam–abu–putih. Tidak ada CDN, font eksternal, atau ikon pihak ketiga, jadi UI tetap utuh walau offline.

---

## 1. Menjalankan

```bash
npm install
npm run dev
```

Buka **http://localhost:3000**.

Login:

| Field | Nilai |
| --- | --- |
| Username | `owner` |
| Password | `onyx-A4n9lowvNpDa` |

> Ganti password setelah login pertama lewat **Settings → Keamanan**. Password disimpan di `.env` dan sesi lama otomatis gugur.

Produksi:

```bash
npm run build
npm start
```

---

## 2. API key Classai

1. Ambil key di https://router.classai.id/dashboard/api-keys
2. Buka `.env`, isi:

```env
CLASSAI_API_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
```

3. Restart server (`Ctrl+C`, lalu `npm run dev`).
4. Cek koneksi di **Settings → Koneksi → Tes koneksi**.

Tanpa key, aplikasi tetap bisa dibuka dan file tetap bisa dikelola, tetapi chat dan pembuatan media akan menolak permintaan dengan pesan yang jelas.

Variabel lain yang tersedia:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `CLASSAI_BASE_URL` | `https://router.classai.id/v1` | Endpoint OpenAI-compatible |
| `CLASSAI_PII` | `off` | Mematikan sensor PII agar kode tidak rusak |
| `AUTH_USERNAME` | `owner` | Satu-satunya akun |
| `AUTH_PASSWORD` | — | Password login (bisa diubah dari UI) |
| `AUTH_SECRET` | — | Kunci HMAC cookie, minimal 16 karakter |
| `COOKIE_SECURE` | `false` | Set `true` bila memakai HTTPS |
| `WORKSPACE_DIR` | `./workspace` | Folder sandbox agent |

---

## 3. Fitur

### Chat & agent
- Streaming SSE dengan indikator tool dan pembatalan.
- Tool-calling loop: agent benar-benar membaca, menulis, mengedit, mencari, dan menghapus file di `workspace/`.
- Perintah shell dijalankan di dalam sandbox workspace.
- Fallback otomatis ke mode chat saja bila model tidak mendukung tool.
- Riwayat sesi tersimpan di server (`.data/sessions/`), bisa diganti nama, dihapus, dan diekspor.
- Pemilih model (56 model: Claude, GPT, Gemini, DeepSeek, GLM, Kimi, Qwen, Llama, Mistral, dan lainnya) serta tingkat effort `low / medium / high / ultra`.
- Lampiran konteks dari gambar, PDF, DOCX, XLSX, CSV, teks, dan kode.

### Berkas & memori
- Panel **Files**: jelajah folder, baca, edit, simpan, unggah, buat folder, unduh, hapus.
- Panel **Memory**: `SOUL.md`, `IDENTITY.md`, `MEMORY.md`, `SKILL.md` dapat diedit langsung dari UI dan otomatis masuk ke system prompt.
- Unggahan disimpan di `workspace/.uploads/` beserta metadata dan ekstraksi teks.

### Studio media
- Pembuatan gambar dari teks (nano-banana, GPT Image, FLUX, Seedream, dll.).
- Pembuatan video dari teks/gambar (Veo, Seedance, Kling, Hailuo, dll.).
- Galeri media, unduh, hapus, dan tombol **Lampirkan ke chat**.

### Lainnya
- Command palette (`Ctrl/⌘ + K`).
- Toast, dialog, dan animasi halus tanpa dependensi animasi.
- Ekspor seluruh data (sesi + memori + metadata) sebagai JSON.
- Keamanan: cookie HMAC `HttpOnly` + `SameSite=Lax`, rate-limit login per-IP dan global, pemeriksaan `Origin` untuk semua mutasi (CSRF), CSP/XFO/COOP/Permissions-Policy, file HTML/XML dipaksa unduh dan SVG disandbox, path traversal diblokir, serta environment shell disanitasi dari secret.
- Satu pengguna saja; tidak ada pendaftaran publik.

---

## 4. Struktur

```
app/
  app/page.tsx            halaman utama agent (butuh login)
  login/                  halaman masuk
  api/                    auth, chat, models, sessions, memory,
                          workspace, uploads, media, settings, export
components/               AgentApp, Composer, Sidebar, FilesPanel,
                          MemoryPanel, StudioPanel, SettingsDialog, dll.
lib/
  agent.ts                system prompt + streaming + tool loop
  classai.ts              katalog model & koneksi Classai
  tools.ts                definisi dan eksekutor tool
  workspace.ts            sandbox file & shell
  attachments.ts          unggahan + ekstraksi dokumen
  media.ts                gambar/video + galeri
  store.ts                penyimpanan sesi
  auth.ts                 token HMAC (edge-safe)
  server-auth.ts          helper sesi server
SOUL.md IDENTITY.md MEMORY.md SKILL.md   memori agent
workspace/                file kerja agent (dibuat otomatis)
.data/                    sesi, media, hasil generate (dibuat otomatis)
```

---

## 5. Catatan keamanan

- Jangan commit `.env` (sudah masuk `.gitignore`).
- Ganti `AUTH_SECRET` dan password sebelum mengekspos aplikasi ke internet.
- Jika memakai domain HTTPS, set `COOKIE_SECURE=true`.
- Shell agent hanya berjalan di `workspace/`, tetapi tetap perlakukan agent sebagai proses lokal tepercaya: jangan menyimpan kredensial sensitif di dalam workspace.
- Aplikasi ini dirancang untuk satu pengguna. Jangan buka pendaftaran atau membagikan cookie sesi.

---

## 6. Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `AUTH_SECRET belum diatur` | Isi `AUTH_SECRET` (≥16 karakter) di `.env`, restart. |
| Chat selalu gagal | Pastikan `CLASSAI_API_KEY` valid dan **Tes koneksi** sukses. |
| Model tidak muncul | Endpoint `/models` gagal; aplikasi memakai katalog statis. Periksa koneksi. |
| Video lama selesai | Pembuatan video memakai polling; biarkan tab terbuka atau cek galeri beberapa saat lagi. |
| Unggahan PDF gagal | Pastikan file tidak rusak dan berukuran wajar; ekstraksi berjalan di server. |
| Port 3000 dipakai | `npm run dev -- -p 3001` |

---

Dibuat untuk dipakai sendiri. Monokrom, tenang, dan tanpa distraksi.
