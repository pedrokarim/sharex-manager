import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

/**
 * Les API de ces écrans sont réservées aux admins, mais les pages elles-mêmes
 * s'affichaient à tout compte connecté. Chaque page vérifie le rôle côté
 * serveur et renvoie les autres comptes vers l'accueil.
 */
const ADMIN_PAGES = [
  "src/app/(app)/admin/security/page.tsx",
  "src/app/(app)/admin/system/page.tsx",
  "src/app/(app)/admin/modules/page.tsx",
  "src/app/(app)/modules/page.tsx",
  "src/app/(app)/uploads/config/page.tsx",
  "src/app/(app)/settings/domains/page.tsx",
];

describe("pages d'administration", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));

  test.each(ADMIN_PAGES)("%s vérifie le rôle admin côté serveur", (file) => {
    const source = readFileSync(join(root, file), "utf-8");
    expect(source).not.toMatch(/^["']use client["']/m);
    expect(source).toMatch(/auth\.api\.getSession\(/);
    expect(source).toMatch(/if \(!session \|\| !isAdmin\(session\)\) redirect\("\/"\);/);
  });

  test("la barre latérale ne pointe plus vers des réglages inexistants", () => {
    const source = readFileSync(join(root, "src/components/sidebar/app-sidebar.tsx"), "utf-8");
    expect(source).not.toContain('"/settings/security"');
    expect(source).not.toContain('"/settings/general"');
  });
});
