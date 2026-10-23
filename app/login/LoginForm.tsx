"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Logo, Shield, User } from "@/components/icons";
import { Spinner } from "@/components/ui";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Tidak bisa masuk. Coba lagi.");
        setShake((value) => value + 1);
        setLoading(false);
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("Koneksi ke server gagal.");
      setShake((value) => value + 1);
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen w-full overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.045),transparent_65%)]" />

      <section className="relative hidden w-[54%] flex-col justify-between border-r border-line/70 p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <Logo size={34} className="text-ink" />
          <div>
            <p className="text-[15px] font-semibold tracking-[0.22em] text-ink">ONYX</p>
            <p className="text-[10.5px] uppercase tracking-[0.18em] text-dim">AI Coding Agent</p>
          </div>
        </div>

        <div className="max-w-[560px]">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-box/60 px-3 py-1 text-[10.5px] uppercase tracking-[0.16em] text-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse-soft" />
            Private workspace
          </p>
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink xl:text-[54px]">
            Ngobrol.
            <br />
            Bangun.
            <br />
            <span className="text-dim">Selesai.</span>
          </h1>
          <p className="mt-6 max-w-[440px] text-[14px] leading-relaxed text-mute">
            Satu agen untuk menulis kode, menjalankan perintah, mengelola file, dan membuat aset.
            Semua di workspace lokalmu.
          </p>

          <div className="mt-10 grid max-w-[460px] grid-cols-2 gap-x-8 gap-y-3 border-t border-line pt-6">
            {[
              "Baca & tulis file",
              "Tool shell lokal",
              "Memory permanen",
              "Gambar & video",
              "Streaming real-time",
              "Monokrom, tanpa distraksi",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[12px] text-mute">
                <span className="h-1 w-1 rounded-full bg-[#8a8a8a]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 text-[10.5px] uppercase tracking-[0.14em] text-dim">
          <span className="flex items-center gap-2">
            <Shield size={13} /> Single user
          </span>
          <span>Local-first</span>
          <span>Classai Router</span>
        </div>
      </section>

      <section className="relative flex w-full flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[400px] animate-enter">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={34} className="text-ink" />
            <div>
              <p className="text-[15px] font-semibold tracking-[0.22em]">ONYX</p>
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-dim">AI Coding Agent</p>
            </div>
          </div>

          <div
            key={shake}
            className={`rounded-2xl border border-line bg-[#0b0b0b]/90 p-6 panel-shadow backdrop-blur-sm sm:p-7 ${
              shake ? "animate-shake" : ""
            }`}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-dim">Akses terbatas</p>
                <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  Masuk ke ONYX
                </h2>
                <p className="mt-1 text-[12.5px] text-mute">
                  Gunakan kredensial yang tertera di file <code className="font-mono text-[11.5px] text-ink">.env</code>.
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-box text-mute">
                <Lock size={15} />
              </span>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-mute">Username</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">
                    <User size={15} />
                  </span>
                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="owner"
                    className="input-base h-11 pl-9"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-mute">Password</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim">
                    <Lock size={15} />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className="input-base h-11 pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-dim transition-colors hover:bg-box2 hover:text-ink"
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-[#3a3a3a] bg-[#141414] px-3 py-2.5 text-[12px] text-[#e0e0e0]">
                  <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="btn-press mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[13px] font-semibold text-black transition hover:bg-white disabled:bg-[#3a3a3a] disabled:text-[#0a0a0a]"
              >
                {loading ? (
                  <>
                    <Spinner size={15} className="border-[#666] border-t-black" />
                    Memeriksa…
                  </>
                ) : (
                  "Masuk ke workspace"
                )}
              </button>
            </form>

            <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[10.5px] leading-relaxed text-dim">
              <Shield size={12} className="shrink-0" />
              Sesi ditandatangani dengan HMAC. Tidak ada akses publik, tidak ada pendaftaran.
            </div>
          </div>

          <p className="mt-5 text-center text-[10.5px] text-faint">
            ONYX v1.0 · dibuat untuk satu pengguna
          </p>
        </div>
      </section>
    </main>
  );
}
