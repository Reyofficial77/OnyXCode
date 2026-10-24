# LICENSE_REVIEW.md

## Ringkasan keputusan

**OnyxCode tidak memuat source code dari proyek lain.** Seluruh kode di `src/` dan
`tests/` ditulis khusus untuk proyek ini dan dilisensikan MIT (lihat `LICENSE`).

Proyek open-source yang relevan hanya dipelajari pada tingkat **konsep dan perilaku
yang terdokumentasi publik** (arsitektur agent loop, pola tool registry, alur TUI),
tanpa menyalin implementasi.

## Proyek yang dievaluasi (tanpa menyalin kode)

| Proyek | Lisensi resmi | Keputusan | Catatan |
| --- | --- | --- | --- |
| OpenCode (`sst/opencode`) | MIT | Tidak menyalin kode | Dipelajari sebagai acuan perilaku CLI/TUI agent. Kode OnyxCode ditulis mandiri. |
| Aider (`Aider-AI/aider`) | Apache-2.0 | Tidak menyalin kode | Apache-2.0 mewajibkan NOTICE + atribusi file yang dimodifikasi jika kode dipakai. Tidak dipakai. |
| OpenAI Codex CLI (`openai/codex`) | Apache-2.0 | Tidak menyalin kode | Idem. |
| Claude Code | Proprietary (closed source) | Tidak menyalin apa pun | Hanya perilaku UX umum yang dapat diamati publik. |
| Gemini CLI (`google-gemini/gemini-cli`) | Apache-2.0 | Tidak menyalin kode | Acuan konsep slash command. |

Catatan legal: lisensi di atas berlaku pada **versi saat ditinjau (Oktober 2026)**;
lisensi dapat berubah. Karena tidak ada kode yang digunakan kembali, tidak ada
kewajiban atribusi source code yang timbul dari proyek-proyek tersebut.

## Dependensi runtime (semua lisensi permisif)

| Paket | Versi | Lisensi |
| --- | --- | --- |
| `commander` | 15.x | MIT |
| `zod` | 4.x | MIT |
| `diff` | 9.x | BSD-3-Clause |
| `ignore` | 7.x | MIT |
| `marked` | 18.x | MIT |
| `@opentui/core` (opsional) | 0.6.x | MIT |

Dependensi dev: `typescript`, `tsup`, `vitest`, `@types/node` — semuanya MIT/Apache-2.0
dan tidak didistribusikan bersama bundle (kecuali hasil kompilasi).

Teks `LICENSE` untuk dependensi tersedia di `node_modules/<pkg>/LICENSE` setelah
`npm install`. Jika OnyxCode didistribusikan sebagai bundle tertutup, sertakan
file lisensi dependensi sesuai kewajiban masing-masing.

## Hal yang tidak dilakukan

- Tidak ada cloning repository besar otomatis.
- Tidak ada penghapusan copyright notice.
- Tidak ada klaim bahwa kode berasal dari proyek lain.
- Asset visual (ASCII art logo) dibuat orisinal untuk OnyxCode.
