import { ModuleHooks } from "../../types/modules";

const moduleHooks: ModuleHooks = {
  onInit: () => {
    console.log("Module AI Image Gen initialisé");
  },
  onEnable: () => {
    console.log("Module AI Image Gen activé");
  },
  onDisable: () => {
    console.log("Module AI Image Gen désactivé");
  },
};

export function initModule(config: any) {
  return moduleHooks;
}

export default moduleHooks;
