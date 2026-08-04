/**
 * `register` s'exécute une fois au démarrage du serveur et doit se terminer
 * avant que la première requête soit servie. On y garantit que le schéma
 * better-auth existe : indispensable en conteneur, où data/ est un volume qui
 * peut être vierge au premier lancement.
 *
 * Passer par ce point d'entrée plutôt que par un script évite d'embarquer
 * better-auth dans l'image : ici il est déjà présent dans le bundle Next.
 */
export async function register() {
  // Le fichier est aussi chargé pour le runtime edge, où bun:sqlite n'existe pas.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { migrateAuthSchema, seedLegacyUsers } = await import(
    "@/lib/auth-migrate"
  );

  const log = (msg: string) => console.log(`[auth-migrate] ${msg}`);

  try {
    await migrateAuthSchema(log);
    await seedLegacyUsers(log);
  } catch (error) {
    // Ne pas empêcher le démarrage : le reste de l'application peut servir,
    // et l'erreur doit rester visible dans les journaux du conteneur.
    console.error("[auth-migrate] échec de la migration au démarrage :", error);
  }
}
