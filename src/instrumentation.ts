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

  // Les modules se chargent sinon à la première requête. Les charger dès le
  // démarrage lance leurs préparatifs (téléchargement des voix de Clip
  // Studio…) sans attendre une visite. Sans bloquer : le serveur répond déjà.
  setTimeout(() => {
    // ffmpeg sert aux couvertures des vidéos de la galerie.
    import("@/lib/media/ffmpeg")
      .then(({ prefetchFfmpeg }) => prefetchFfmpeg())
      .catch((error) => console.error("[ffmpeg] échec du préchargement :", error));
    import("@/lib/modules/module-manager.api")
      .then(({ apiModuleManager }) => apiModuleManager.ensureInitialized())
      .catch((error) => console.error("[modules] échec du chargement au démarrage :", error));
    // File de publication des comptes connectés : reprise des envois
    // interrompus par l'arrêt du serveur, et du suivi des traitements.
    import("@/lib/connections/publish-queue")
      .then(({ startPublishQueue }) => startPublishQueue())
      .catch((error) => console.error("[connections] échec de la reprise de la file :", error));
    // Droits des fichiers de data/, puis ménage quotidien du journal selon la
    // durée de conservation de l'écran Sécurité.
    import("@/lib/security/maintenance")
      .then(({ startSecurityMaintenance }) => startSecurityMaintenance())
      .catch((error) => console.error("[security] échec du démarrage de la tâche de fond :", error));
    // Prolongation des jetons même sans publication, ménage des liens publics.
    import("@/lib/connections/maintenance")
      .then(({ startConnectionMaintenance }) => startConnectionMaintenance())
      .catch((error) => console.error("[connections] échec du démarrage de la tâche de fond :", error));
  }, 2000);
}
