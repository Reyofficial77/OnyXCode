import { promises as fs } from "fs";
import path from "path";

/**
 * Penyimpanan data. Di Vercel, folder proyek bersifat read-only, jadi arahkan
 * ONYX_DATA_DIR / ONYX_MEMORY_DIR ke /tmp lewat environment variable.
 */
export const DATA_DIR = process.env.ONYX_DATA_DIR?.trim()
  ? path.resolve(process.env.ONYX_DATA_DIR.trim())
  : path.join(process.cwd(), ".data");

export const MEMORY_DIR = process.env.ONYX_MEMORY_DIR?.trim()
  ? path.resolve(process.env.ONYX_MEMORY_DIR.trim())
  : process.cwd();

/** Path file memori; seed dari file bawaan proyek saat memakai folder sementara. */
export async function memoryFile(file: string) {
  const target = path.join(MEMORY_DIR, file);
  await fs.mkdir(MEMORY_DIR, { recursive: true }).catch(() => undefined);
  if (MEMORY_DIR !== process.cwd()) {
    const exists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      const seed = await fs.readFile(path.join(process.cwd(), file), "utf8").catch(() => null);
      if (seed !== null) await fs.writeFile(target, seed, "utf8").catch(() => undefined);
    }
  }
  return target;
}
