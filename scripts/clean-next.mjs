/**
 * Removes `.next` so the next dev/build starts without a corrupted webpack pack cache.
 * Usage: `node scripts/clean-next.mjs` or `npm run clean:next`
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".next");
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("[clean-next] Removed", dir);
} else {
  console.log("[clean-next] No .next folder to remove");
}
