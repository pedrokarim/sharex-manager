import { ModuleHooks } from "@/types/modules";
import path from "path";

class AnimeTraceModule implements ModuleHooks {
  private settings: {
    cacheSize: number;
    similarityThreshold: number;
  };

  constructor(modulePath: string, settings: any) {
    this.settings = settings;
  }

  public onInit = () => {
    console.log("Module Anime Trace initialisé");
  };

  public onEnable = () => {
    console.log("Module Anime Trace activé");
  };

  public onDisable = () => {
    console.log("Module Anime Trace désactivé");
  };
}

export function initModule(config: any): ModuleHooks {
  const modulePath = path.dirname(config.entry);
  return new AnimeTraceModule(modulePath, config.settings);
}
