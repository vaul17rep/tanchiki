// Упаковывает dist/<площадка>/ в release/<площадка>.zip (index.html в корне архива).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node scripts/pack.mjs <web|vkplay> ...");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

mkdirSync("release", { recursive: true });
for (const t of targets) {
  const dir = join("dist", t);
  if (!existsSync(dir)) {
    console.error(`dist/${t} не найден, сначала npm run build:${t}`);
    process.exit(1);
  }
  const files = {};
  for (const f of walk(dir)) files[relative(dir, f).split("\\").join("/")] = readFileSync(f);
  const out = join("release", `${t}.zip`);
  writeFileSync(out, zipSync(files, { level: 9 }));
  console.log(`${out}: ${Object.keys(files).length} файл(ов), ${(statSync(out).size / 1024).toFixed(0)} КБ`);
}
