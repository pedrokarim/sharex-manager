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
}

export interface ModuleHooks {
  onInit?: () => void | Promise<void>;
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
  processImage?: (imageBuffer: Buffer) => Promise<Buffer>;
  cropImage?: (imageBuffer: Buffer, cropData: any) => Promise<Buffer>;
  renderUI?: (
    fileInfo: any,
    onComplete: (result: any) => void
  ) => React.ReactNode;
  getActionIcon?: () => { icon: React.ComponentType; tooltip: string };
}
