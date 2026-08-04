/**
 * Réinitialise le mot de passe d'un compte better-auth.
 *
 *   bun scripts/auth-set-password.ts <username> [mot-de-passe]
 *
 * Sans mot de passe, un mot de passe fort est généré et affiché.
 * Le hash passe par ctx.password.hash, donc par la config bcrypt de lib/auth.ts.
 */
import { randomBytes } from "crypto";

import { auth } from "@/lib/auth";

const [, , rawUsername, providedPassword] = process.argv;

if (!rawUsername) {
  console.error("usage: bun scripts/auth-set-password.ts <username> [mot-de-passe]");
  process.exit(1);
}

/** Mot de passe lisible mais fort : 24 caractères sans ambiguïté visuelle. */
function generatePassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
  const bytes = randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const username = rawUsername.toLowerCase();
const password = providedPassword ?? generatePassword();

const ctx = await auth.$context;

// `operator` doit être explicite : la valeur par défaut "eq" n'est pas
// appliquée par l'adaptateur dans cette version de better-auth.
const user = await ctx.adapter.findOne<{ id: string; username: string }>({
  model: "user",
  where: [{ field: "username", value: username, operator: "eq" }],
});

if (!user) {
  console.error(`Aucun compte avec le username "${rawUsername}".`);
  process.exit(1);
}

const minLength = auth.options.emailAndPassword?.minPasswordLength ?? 8;
if (password.length < minLength) {
  console.error(`Mot de passe trop court (minimum ${minLength} caractères).`);
  process.exit(1);
}

const hash = await ctx.password.hash(password);
await ctx.internalAdapter.updatePassword(user.id, hash);

// Les sessions existantes deviennent caduques : on les révoque.
// (deleteSessions attend des tokens ; c'est deleteUserSessions qui prend un userId.)
await ctx.internalAdapter.deleteUserSessions(user.id);

console.log(`✓ mot de passe mis à jour pour ${rawUsername}`);
console.log(`  sessions existantes révoquées`);
if (!providedPassword) {
  console.log(`\n  nouveau mot de passe : ${password}\n`);
}
