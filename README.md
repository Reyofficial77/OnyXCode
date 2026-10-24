# OnyxCode

**OnyxCode** adalah AI coding agent mandiri berbasis terminal yang responsif, modular, aman, dan dirancang khusus untuk ekosistem terminal modern.

Dibangun dengan arsitektur bersih di atas **Node.js >= 20** dan **TypeScript**, OnyxCode menyediakan pengalaman interaktif terminal (TUI) adaptif dengan fallback yang stabil, serta antarmuka CLI otomatis (`onyxcode run <prompt>`).

---

## ⚡ Fitur Utama

- **Autonomous Agent Loop**: Menyelesaikan instruksi coding bertahap dengan batas langkah, timeout, dan pelacakan checkpoint otomatis.
- **Rich Coding Tools**:
  - Manipulasi file: `list_files`, `read_file`, `write_file`, `edit_file` (find/replace unik), `delete_file`, `search_files`, `apply_patch`.
  - Integrasi Git: `git_status`, `git_diff`, `git_log`.
  - Eksekusi terisolasi: `run_command`, `run_tests`, `run_linter`, `project_info`.
- **Keamanan & Sandboxing Ketat**:
  - Path traversal guard: mencegah manipulasi file di luar workspace root.
  - Perlindungan file sensitif: `.env`, sertifikat, dan SSH keys disaring dari pembacaan otomatis.
  - Redaksi rahasia terpusat: API key atau authorization token otomatis disensor (`***REDACTED***`) di log, exception, dan output terminal.
  - Mesin perizinan fleksibel: `read-only`, `confirm-risky`, dan `allow-all`.
- **Multi-Provider First-Class**:
  - Dukungan native OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Ollama (lokal), dan endpoint custom OpenAI-compatible.
  - Streaming SSE / NDJSON dengan pembatalan real-time (`AbortSignal`).
- **Deteksi Kunci API Mandiri (API Detected)**:
  - Analisis format & pola kunci lokal tanpa menembak jaringan secara diam-diam.
  - Verifikasi eksplisit satu langkah (`onyxcode provider test <provider>`).
- **Terminal UX Adaptif**:
  - Renderer OpenTUI modern dengan fallback otomatis ke antarmuka `Readline` di terminal terbatas / non-TTY.
  - Markdown ANSI viewer, live streaming diffs, dan slash commands (`/undo`, `/model`, `/provider`, `/mode`, `/help`, `/exit`).

---

## 🚀 Instalasi & Memulai Cepat

### Prasyarat
- **Node.js** >= 20.11.0 (LTS direkomendasikan)
- **Git**

### Instalasi Lokal & Build
```bash
# Clone atau masuk ke repositori
npm install

# Kompilasi TypeScript
npm run build

# Jalankan test suite
npm test

# Tautkan binary ke path sistem
npm link
```

### Menjalankan Pemeriksaan Sistem (Doctor)
Pastikan dependensi, shell, direktori sesi, dan konfigurasi siap digunakan:
```bash
onyxcode doctor
```

---

## 📖 Penggunaan

### 1. Mode Interaktif (TUI)
Jalankan di dalam folder proyek Anda:
```bash
onyxcode
```
Gunakan slash command di dalam sesi:
- `/help` — Menampilkan daftar command yang tersedia.
- `/undo` — Membatalkan modifikasi file terakhir yang dilakukan agen.
- `/model <nama>` — Beralih model (contoh: `claude-sonnet-4-5`, `gpt-4o-mini`).
- `/provider <nama>` — Beralih provider aktif (`openai`, `anthropic`, `gemini`, `groq`, `ollama`).
- `/mode <mode>` — Ubah tingkat perizinan (`read-only`, `confirm-risky`, `allow-all`).
- `/clear` — Bersihkan konteks percakapan saat ini.
- `/exit` — Keluar dari sesi.

### 2. Mode Non-Interaktif / Scripting
Eksekusi instruksi langsung secara mandiri:
```bash
onyxcode run "Periksa package.json dan tambahkan script build jika belum ada"
```

Untuk piping atau output bersih langsung ke stdout:
```bash
onyxcode run --print "Jelaskan struktur folder proyek ini"
```

### 3. Autentikasi & Manajemen Provider
Simpan API key dengan aman (tersimpan dengan izin 0600 di `~/.onyxcode/credentials.json`):
```bash
onyxcode auth login --provider anthropic
```

Deteksi jenis kunci API tanpa menghubungi jaringan:
```bash
onyxcode provider detect
```

Uji koneksi kunci ke provider resmi secara sadar:
```bash
onyxcode provider test anthropic --model claude-haiku-4-5
```

---

## 🔒 Dokumen Keamanan & Lisensi

- **Lisensi**: Proyek ini berlisensi [MIT](LICENSE).
- **Atribusi & Tinjauan**: Lihat [LICENSE_REVIEW.md](LICENSE_REVIEW.md) dan [NOTICE](NOTICE). Seluruh kode ditulis mandiri tanpa menyalin implementasi kode dari repositori lain.
- **Rencana Kerja**: Seluruh spesifikasi dan tahapan implementasi terdokumentasi di [PLAN.md](PLAN.md).
