/**
 * Migration Auth.js -> better-auth, en exécution manuelle.
 *
 *   bun scripts/auth-migrate.ts
 *
 * En conteneur, ces mêmes étapes sont jouées automatiquement au démarrage par
 * instrumentation.ts : ce script sert au développement local et aux reprises
 * manuelles. Il est idempotent.
 */
import { migrateAuthSchema, seedLegacyUsers } from "@/lib/auth-migrate";

const log = (msg: string) => console.log(`· ${msg}`);

await migrateAuthSchema(log);
await seedLegacyUsers(log);
console.log("migration terminée");
