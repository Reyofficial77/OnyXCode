# OnyxCode — Plan Implementasi

Dokumen ini adalah rencana kerja nyata untuk membangun OnyxCode di repository ini.
Setiap fase diverifikasi dengan tes sebelum lanjut.

## 1. Hasil audit awal (2026-10-24)

| Item | Temuan |
| --- | --- |
| OS | Windows 10/11 (win32, AMD64) |
| Runtime | Node.js v24.20.0 (LTS line), npm 12.2.0 |
| Git | git 2.55.0.windows.5; folder kerja **bukan** repository Git |
| Isi folder | Hanya `OnyxCode_Master_Prompt.md` (+`PLAN.md` ini) |
| Terminal dev | `TERM=xterm-256color`; terminal pengguna bisa ConPTY/PowerShell/CMD |
| Package manager | npm (`registry.npmjs.org`) |

Karyawan lama: tidak ada kode lama, jadi tidak ada fitur yang perlu dipertahankan.
Repository Git belum ada; `git init` akan dilakukan sebagai bagian fondasi agar
fitur Git (status/diff/log) dan `.gitignore` bisa diuji nyata.

## 2. Keputusan teknis

| Area | Pilihan | Alasan |
| --- | --- | --- |
| Bahasa | TypeScript `strict`, target ES2022, module NodeNext | standar ekosistem, type-safety |
| Runtime | Node.js >= 20 (diuji di v24) | LTS, `AbortSignal`, `fetch` native, `node:test`/vitest |
| Build | `tsup` (esbuild) → `dist/` ESM + sourcemap | cepat, satu bundle per entry, shebang otomatis |
| Test | `vitest` | TS native, cepat, mock-friendly, watch mode |
| CLI parser | `commander` | stabil, help/exit code baik |
| Validasi | `zod` | schema runtime untuk config, tool args, manifest plugin |
| TUI | `@opentui/core` (native renderer) + fallback `readline` | renderer fleksibel, keyboard, resize; fallback untuk terminal terbatas / `--plain` |
| Diff | `diff` (jsdiff) | unified diff, dipakai juga untuk ringkasan perubahan |
| Gitignore | `ignore` | parsing `.gitignore` sesuai spec |
| Markdown | `marked` + renderer ANSI custom | render markdown ke terminal tanpa HTML |

Alternatif yang dievaluasi dan ditolak:
- **Ink (React)**: JSX-heavy, streaming dan keyboard handling butuh banyak lapisan; bundle besar; lebih sulit diuji headless.
- **blessed/neo-blessed**: tidak lagi aktif dipelihara.
- **pi-tui**: versi `0.0.1` di npm — belum bisa dianggap stabil.

`@opentui/core` dipakai secara **opsional dan terisolasi** di `src/tui/opentui.ts`;
jika native binary gagal dimuat (mis. terminal terbatas, platform tidak didukung),
OnyxCode otomatis memakai renderer fallback berbasis `readline` sehingga aplikasi
tetap berfungsi.

## 3. Arsitektur (ringkas)

```text
src/
  cli/          entry point, parser commander, subcommand, mode non-interaktif
  tui/          renderer OpenTUI + fallback, komponen, markdown ANSI, keymap
  agent/        agent loop, planner, tool-call parser, batas langkah/cancel
  providers/    registry, adapter (openai, anthropic, gemini, groq, openai-compatible, ollama)
  providers/detect/  ProviderDetector, ProviderVerifier, format registry
  tools/        registry, validasi zod, implementasi tool, sandbox path, runner proses
  permissions/  policy engine, mode, prompt konfirmasi, audit log
  context/      deteksi proyek, gitignore, index file, ringkasan, AGENTS.md
  sessions/     store JSONL + index, resume, export, migrasi skema
  config/       schema zod, merge global/project/env/CLI, credential store
  commands/     slash command TUI + handler command CLI bersama
  plugins/      manifest contract, loader aman
  telemetry/    opt-in, default off
  utils/        logger (redaksi), errors, process, terminal, paths
tests/          unit + integration (mock server, tidak butuh API key)
docs/           PROVIDERS, COMMANDS, SECURITY, CONFIGURATION, ARCHITECTURE, PLUGINS
```

Prinsip:
- Interface/type eksplisit; dependency injection via `AppContext` (config, logger, providers, tools).
- Tidak ada file monolitik; modul maksimum ~400 baris.
- Semua I/O eksternal (HTTP, fs, proses) dapat di-mock.

## 4. Fase implementasi

### Fase 1 — Fondasi
- `package.json`, `tsconfig.json`, `tsup` config, `vitest` config, `.gitignore`, `LICENSE` (MIT — kode ditulis sendiri).
- `src/cli/main.ts`: `--help`, `--version`, `init`, `doctor`, `status`, `config`.
- Logger dengan redaksi secret; error class terstruktur.
- TUI dasar yang benar-benar menerima input, menampilkan pesan, `/help`, `/exit`.
- Tes: CLI help/version, argumen tidak valid, doctor tanpa secret.

### Fase 2 — Provider & API Detected
- `ProviderRegistry`, `ProviderAdapter` interface (chat, stream, listModels, verify).
- Adapter: OpenAI, Anthropic, Google Gemini, Groq, OpenAI-compatible, Ollama.
- `ProviderDetector` (format key: pola `sk-`, `sk-ant-`, `AIza`, `gsk_`, `sk-or-`, JWT non-identifiable, dll) — hasil **perkiraan**.
- `ProviderVerifier` — request minimal setelah konfirmasi; status: detected/verified/invalid/unknown/network_error/rate_limited/unsupported.
- `CredentialStore`: OS keychain opsional (`keytar` tidak dipakai; gunakan file 0600 di `~/.onyxcode/credentials.json` dengan permission check + peringatan) dan opsi `--ephemeral` (hanya sesi).
- Wizard setup + `onyxcode provider detect`.
- Tes dengan mock HTTP server.

### Fase 3 — Chat & agent loop
- Streaming SSE parser generik (OpenAI/Anthropic/Gemini) dengan abort.
- Agent loop: max steps, timeout, batas output tool, deteksi siklus tool.
- Sesi persisten (JSONL, index, resume, export, migrasi, nonaktifkan persistensi).

### Fase 4 — Tool coding
- Tool: list_files, read_file, search_files, write_file, edit_file, apply_patch, delete_file, run_command, git_status, git_diff, git_log, run_tests, run_linter, project_info.
- Sandbox path (realpath, symlink, traversal, Windows drive/UNC), tolak file sensitif default.
- Permission engine: mode `read-only`, `confirm-risky`, `allow-all` (per tool/pattern, hanya per sesi, tidak permanen).
- Diff viewer, checkpoint/backup untuk perubahan berisiko, `/undo` berbasis checkpoint nyata.

### Fase 5 — Command & UX lanjutan
- Semua slash command terdokumentasi; `session list/resume/export`, `models`, `auth`.
- Provider tambahan terdokumentasi; terminal resize, mode tanpa warna, `--plain`, `--print`.
- Plugin loader sederhana (manifest tervalidasi, opt-in).

### Fase 6 — Hardening & release
- Seluruh tes lulus; audit secret leakage + path traversal; uji packaging `npm pack` + install lokal.
- Dokumentasi lengkap; laporan fitur nyata & batasan.

## 5. Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Native TUI gagal di terminal tertentu | Fallback `readline`; flag `--plain`; error jelas |
| Windows shell differences (cmd vs pwsh) | Runner memilih shell: `pwsh` → `powershell` → `cmd`; tes proses nyata |
| Prompt injection dari repo | Konten file dibungkus penanda data, bukan instruksi; permission per aksi |
| Kebocoran API key | Redaksi terpusat di logger/error/export; key tidak di config; file 0600 |
| Biaya API tak terduga | Tanpa retry otomatis untuk streaming; retry hanya 429/5xx dengan maks 2 & backoff; verifikasi butuh konfirmasi |
| Native binary tambah besar | `@opentui/core` optionalDependency |
| Sesi rusak | JSONL line-level recovery + index rebuild |

## 6. Definisi selesai (Definition of Done)

- [ ] `npm install && npm run build && npm test && npm link` berjalan.
- [ ] `onyxcode --help/--version`, `doctor`, `init`, `provider detect`, `config`, `models`, `session` berfungsi.
- [ ] TUI menerima prompt dan menampilkan respons streaming dari provider terkonfigurasi (diuji dengan mock server + provider sungguhan bila user memasang key).
- [ ] API Detected jujur, tidak membocorkan key, tidak menembak banyak endpoint.
- [ ] Agent membaca file dan mengubah file lewat tool dengan izin; perintah berisiko tidak diam-diam dijalankan.
- [ ] Diff dan hasil operasi terlihat.
- [ ] Sesi disimpan/dilanjutkan.
- [ ] Tes inti lulus tanpa API key.
- [ ] README sesuai implementasi; batasan disebutkan.
