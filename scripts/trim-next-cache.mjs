// Runs before `pnpm dev`. Next's dev cache (.next/dev/cache) only grows; past
// NEXT_CACHE_MAX_MB (1500) it's deleted, and the next start rebuilds it (the
// first page loads take a little longer once).
import { readdir, lstat, rm } from "node:fs/promises";
import { join } from "node:path";

const dir = join(process.cwd(), ".next", "dev", "cache");
const maxMb = Number(process.env.NEXT_CACHE_MAX_MB) || 1500;

async function size(p) {
  const s = await lstat(p).catch(() => null);
  if (!s) return 0;
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const name of await readdir(p).catch(() => [])) total += await size(join(p, name));
  return total;
}

const mb = (await size(dir)) / 1e6;
if (mb > maxMb) {
  await rm(dir, { recursive: true, force: true });
  console.log(`Cleared Next's dev cache (${mb.toFixed(0)} MB, over ${maxMb} MB).`);
}
