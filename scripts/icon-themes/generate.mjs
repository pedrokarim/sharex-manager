#!/usr/bin/env node
/**
 * Génère `src/lib/icon-themes/sets/<jeu>.json` : pour chaque jeu d'icônes du
 * catalogue, le SVG des seuls concepts de l'interface. Les fichiers générés
 * sont versionnés : ni le build ni l'application n'ont besoin du réseau.
 *
 *   node scripts/icon-themes/generate.mjs [dossier des JSON Iconify]
 *
 * Sans dossier, les jeux sont téléchargés depuis npm (jsDelivr,
 * `@iconify-json/<famille>/icons.json`) dans un dossier temporaire.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONCEPTS, FAMILIES, SETS } from "./catalog.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const outDir = path.join(root, "src", "lib", "icon-themes", "sets");
let sourceDir = process.argv[2];

async function ensureSource() {
  if (!sourceDir) sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "iconify-json-"));
  for (const family of new Set(SETS.map((set) => set.family).filter(Boolean))) {
    const file = path.join(sourceDir, `${family}.json`);
    if (fs.existsSync(file)) continue;
    const url = `https://cdn.jsdelivr.net/npm/@iconify-json/${family}/icons.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
    fs.writeFileSync(file, await response.text());
  }
}

function lookup(data, name) {
  let icon = data.icons[name];
  if (!icon && data.aliases?.[name]) icon = data.icons[data.aliases[name].parent];
  if (!icon) return null;
  const width = icon.width ?? data.width ?? 16;
  const height = icon.height ?? data.height ?? 16;
  return { viewBox: `${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}`, body: icon.body };
}

await ensureSource();
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
const cache = {};
for (const set of SETS) {
  if (!set.family) continue;
  const data = (cache[set.family] ??= JSON.parse(fs.readFileSync(path.join(sourceDir, `${set.family}.json`), "utf8")));
  const icons = {};
  for (const concept of CONCEPTS) {
    const candidates = FAMILIES[set.family][concept] ?? [];
    let found = null;
    for (const base of candidates) {
      for (const suffix of set.suffixes) {
        const svg = lookup(data, `${base}${suffix}`);
        if (svg) { found = { name: `${set.family}:${base}${suffix}`, ...svg }; break; }
      }
      if (found) break;
    }
    if (!found) errors.push(`${set.id} / ${concept} : aucun de ${candidates.join(", ")}`);
    else icons[concept] = found;
  }
  const file = path.join(outDir, `${set.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id: set.id, icons }) + "\n");
  console.log(`${set.id} : ${Object.keys(icons).length}/${CONCEPTS.length} icônes, ${Math.round(fs.statSync(file).size / 1024)} Ko`);
}
if (errors.length) {
  console.error(`\nIntrouvables :\n${errors.join("\n")}`);
  process.exit(1);
}
