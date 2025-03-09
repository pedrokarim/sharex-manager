export interface ModuleConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  entry: string;
  icon?: string;
  category?: string;
  supportedFileTypes: string[];
  hasUI: boolean;
  dependencies?: string[];
  npmDependencies?: Record<string, string>;
  settings?: Record<string, any>;
  capabilities?: string[];
}

export interface LoadedModule {
  name: string;
  config: ModuleConfig;
  module: any;
  path: string;
}

export interface ModuleManager {
  loadModules: () => Promise<LoadedModule[]>;
  getModules: () => Promise<ModuleConfig[]>;
  toggleModule: (moduleName: string) => Promise<boolean>;
  deleteModule: (moduleName: string) => Promise<boolean>;
  installModule: (modulePath: string) => Promise<boolean>;
  getModulesByFileType: (fileType: string) => Promise<ModuleConfig[]>;
  installNpmDependencies: (moduleName: string) => Promise<boolean>;
  getLoadedModule: (moduleName: string) => LoadedModule | undefined;
  getAllLoadedModules: () => LoadedModule[];
  processImageWithModule?: (
    moduleName: string,
    imageBuffer: Buffer,
    settings?: any
  ) => Promise<Buffer>;
  processImage?: (imageBuffer: Buffer) => Promise<Buffer>;
  callModuleFunction?: (
    moduleName: string,
    functionName: string,
    ...args: any[]
  ) => Promise<any>;
}

export interface ModuleHooks {
  onInit?: () => void | Promise<void>;
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
  processImage?: (imageBuffer: Buffer, data: any) => Promise<Buffer>;
  processText?: (text: string, data: any) => Promise<string>;
  renderUI?: (
    fileInfo: any,
    onComplete: (result: any) => void
  ) => React.ReactNode;
  getActionIcon?: () => { icon: React.ComponentType; tooltip: string };
  getCapabilities?: () => string[];
  _exports?: Record<string, any>;
}
