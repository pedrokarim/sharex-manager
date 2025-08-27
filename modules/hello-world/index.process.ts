import { ModuleHooks } from "@/types/modules";

const HelloWorldProcessModule: ModuleHooks = {
  onInit: () => {
    console.log("Module Hello World Process initialisé");
  },
  onEnable: () => {
    console.log("Module Hello World Process activé");
  },
  onDisable: () => {
    console.log("Module Hello World Process désactivé");
  },
  processImage: async (buffer: Buffer) => {
    console.log("Hello World Process - Image reçue");
    return buffer; // Retourne l'image sans modification
  },
};

export default HelloWorldProcessModule;
