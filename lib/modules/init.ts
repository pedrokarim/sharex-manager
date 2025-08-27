import {
  clientModuleManager,
  initClientModuleManager,
} from "./module-manager.client";
// import { apiModuleManager, initApiModuleManager } from "./api-module-manager";

// Exporter les deux gestionnaires de modules
export {
  clientModuleManager,
  //  apiModuleManager
};

// Fonction pour initialiser les modules au démarrage de l'application
export async function initModules() {
  // En fonction de l'environnement, initialiser le gestionnaire approprié
  if (typeof window === "undefined") {
    // Côté serveur (API)
    // console.log("Initialisation du gestionnaire de modules côté API");
    // await initApiModuleManager();
  } else {
    // Côté client (Next.js)
    console.log("Initialisation du gestionnaire de modules côté client");
    await initClientModuleManager();
  }
}
