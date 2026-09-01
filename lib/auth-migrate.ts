import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getMigrations } from "better-auth/db/migration";

import { auth } from "@/lib/auth";

interface LegacyUser {
  id: string;
  username: string;
  password: string;
  role: "admin" | "user";
}

const LEGACY_PATH = join(process.cwd(), "data/users.json");

/**
 * better-auth impose un email unique et non nul, alors que les comptes
 * historiques n'en ont pas. On en dérive un depuis le username : il ne sert
 * jamais à la connexion, le plugin username s'en charge.
 */
function syntheticEmail(username: string) {
  return `${username.toLowerCase()}@local.sharex-manager`;
}

/** Crée ou complète les tables better-auth. Idempotent. */
export async function migrateAuthSchema(log: (msg: string) => void = () => {}) {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
    auth.options
  );

  if (!toBeCreated.length && !toBeAdded.length) {
    log("schéma auth déjà à jour");
    return { created: [], added: [] };
  }

  await runMigrations();
  const created = toBeCreated.map((t) => t.table);
  const added = toBeAdded.map((t) => t.table);
  if (created.length) log(`tables créées : ${created.join(", ")}`);
  if (added.length) log(`colonnes ajoutées : ${added.join(", ")}`);
  return { created, added };
}

/**
 * Importe les comptes de data/users.json en conservant leur hash bcrypt.
 * Ne fait rien si des comptes existent déjà : au premier démarrage d'un
 * déploiement, cela évite de rester sans aucun accès administrateur ; ensuite,
 * cela garantit qu'on ne réécrit jamais des données vivantes.
 */
export async function seedLegacyUsers(log: (msg: string) => void = () => {}) {
  if (!existsSync(LEGACY_PATH)) return { imported: 0 };

  const ctx = await auth.$context;
  const existing = await ctx.adapter.count({ model: "user" });
  if (existing > 0) {
    log(`${existing} compte(s) déjà en base – import ignoré`);
    return { imported: 0 };
  }

  let legacy: LegacyUser[];
  try {
    legacy = JSON.parse(readFileSync(LEGACY_PATH, "utf-8")) as LegacyUser[];
  } catch (error) {
    log(`data/users.json illisible : ${String(error)}`);
    return { imported: 0 };
  }

  let imported = 0;
  for (const user of legacy) {
    const created = await ctx.internalAdapter.createUser({
      id: user.id,
      name: user.username,
      email: syntheticEmail(user.username),
      emailVerified: true,
      username: user.username.toLowerCase(),
      displayUsername: user.username,
      role: user.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Le hash bcrypt est repris tel quel : lib/auth.ts vérifie avec bcrypt.
    await ctx.internalAdapter.createAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: user.password,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    imported++;
    log(`compte importé : ${user.username} (${user.role})`);
  }

  return { imported };
}
