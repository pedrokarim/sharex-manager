import { atomWithStorage } from "jotai/utils";

// Atome pour l'état d'ouverture/fermeture de la sidebar
export const sidebarOpenAtom = atomWithStorage("sidebar_open", true);

// Atome pour l'état mobile de la sidebar
export const sidebarOpenMobileAtom = atomWithStorage("sidebar_open_mobile", false);
