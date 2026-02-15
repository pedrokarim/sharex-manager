import { apiModuleManager } from "./module-manager.api";

export { apiModuleManager };

export async function initModules() {
  await apiModuleManager.ensureInitialized();
}
