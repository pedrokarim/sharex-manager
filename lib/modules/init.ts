import { moduleManager } from "./module-manager";

// Fonction pour initialiser les modules au démarrage de l'application
export async function initModules() {
  try {
    console.log("Initialisation des modules...");
    const loadedModules = await moduleManager.loadModules();
    console.log(`${loadedModules.length} modules chargés avec succès`);
    return loadedModules;
  } catch (error) {
    console.error("Erreur lors de l'initialisation des modules:", error);
    return [];
  }
}
