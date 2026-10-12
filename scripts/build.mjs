// Inject the deployed contract address into frontend/config.js at build time.
// Reads CONTRACT_ADDRESS from the environment (Vercel) or ../.env (local).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function fromDotenv() {
  const p = join(root, ".env");
  if (!existsSync(p)) return "";
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*CONTRACT_ADDRESS\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}

const cfgPath = join(root, "frontend", "config.js");
let cfg = readFileSync(cfgPath, "utf8");

function bakedAddr() {
  const m = cfg.match(/CONTRACT_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/);
  return m ? m[1] : "";
}

// Prefer an explicit env/.env value; otherwise keep the address already baked
// into config.js (committed), so a Vercel build with no env var still works.
const addr = (process.env.CONTRACT_ADDRESS || fromDotenv() || bakedAddr()).trim();
if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
  console.error("build: CONTRACT_ADDRESS missing or invalid:", JSON.stringify(addr));
  process.exit(1);
}

cfg = cfg.replace(/__CONTRACT_ADDRESS__|0x[0-9a-fA-F]{40}/, addr);
writeFileSync(cfgPath, cfg);
console.log("build: injected contract address", addr);
