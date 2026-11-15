/**
 * Catalogue des jeux d'icônes de l'interface (barre latérale et en-têtes
 * d'écran). Pour chaque concept, chaque famille donne des noms candidats, du
 * meilleur au repli ; le générateur garde le premier qui existe dans le jeu
 * Iconify et échoue si aucun n'existe.
 *
 * Les noms Lucide ne servent qu'à la vérification : le jeu « lucide » est
 * rendu par les composants de `lucide-react`, pas par ce catalogue.
 */

/** Concepts, dans l'ordre de la barre latérale. */
export const CONCEPTS = [
  "gallery", "recent", "starred", "secure", "uploads", "history", "uploadConfig", "stats",
  "organization", "albums", "tags", "collections", "settings", "preferences", "apiKeys",
  "integrations", "modulesSettings", "overview", "users", "logs", "theme", "system", "modules",
  "connections", "services", "security", "tools", "support", "feedback", "about",
];

/** Noms par famille et par concept (sans suffixe de variante). */
const FAMILIES = {
  ph: {
    gallery: ["image"], recent: ["clock"], starred: ["star"], secure: ["lock"], uploads: ["upload-simple"],
    history: ["clock-counter-clockwise"], uploadConfig: ["gear"], stats: ["chart-bar"], organization: ["folder-open"],
    albums: ["images-square", "images"], tags: ["tag"], collections: ["stack"], settings: ["gear-six"],
    preferences: ["sliders-horizontal"], apiKeys: ["key"], integrations: ["share-network"], modulesSettings: ["puzzle-piece"],
    overview: ["squares-four"], users: ["users-three"], logs: ["scroll"], theme: ["palette"], system: ["hard-drives"],
    modules: ["package"], connections: ["link"], services: ["plugs-connected"], security: ["shield-check"],
    tools: ["toolbox", "wrench"], support: ["question"], feedback: ["paper-plane-tilt"], about: ["info"],
  },
  solar: {
    gallery: ["gallery-wide", "gallery"], recent: ["clock-circle"], starred: ["star"], secure: ["lock-keyhole", "lock"],
    uploads: ["upload"], history: ["history"], uploadConfig: ["settings-minimalistic"], stats: ["chart-2", "chart"],
    organization: ["folder-open"], albums: ["album"], tags: ["tag"], collections: ["layers"], settings: ["settings"],
    preferences: ["tuning-2", "tuning"], apiKeys: ["key"], integrations: ["share"], modulesSettings: ["widget-add", "widget"],
    overview: ["widget-5", "widget-2"], users: ["users-group-rounded"], logs: ["document-text"], theme: ["pallete-2", "palette"],
    system: ["server-square", "server"], modules: ["box"], connections: ["link"], services: ["plug-circle"],
    security: ["shield-check"], tools: ["case-round", "suitcase-tag", "case"], support: ["question-circle"], feedback: ["plain-2", "plain"],
    about: ["info-circle"],
  },
  hugeicons: {
    gallery: ["image-01"], recent: ["clock-01"], starred: ["star"], secure: ["square-lock-02", "lock"], uploads: ["upload-04", "upload-01"],
    history: ["time-quarter-pass", "clock-04", "time-02"], uploadConfig: ["settings-02"], stats: ["analytics-01", "chart-column"],
    organization: ["folder-open", "folder-02"], albums: ["album-02", "album-01"], tags: ["tag-01"], collections: ["layers-01"],
    settings: ["settings-01"], preferences: ["sliders-horizontal"], apiKeys: ["key-01"], integrations: ["share-08", "share-01"],
    modulesSettings: ["puzzle"], overview: ["dashboard-square-01"], users: ["user-group"], logs: ["license", "note"],
    theme: ["paint-board", "colors"], system: ["server-stack-01", "database"], modules: ["package"], connections: ["link-01"],
    services: ["plug-socket", "plug-01"], security: ["shield-01", "security-check"], tools: ["wrench-01", "tools"],
    support: ["help-circle"], feedback: ["sent", "sent-02"], about: ["information-circle"],
  },
  fluent: {
    gallery: ["image"], recent: ["clock"], starred: ["star"], secure: ["lock-closed"], uploads: ["arrow-upload"],
    history: ["history"], uploadConfig: ["settings"], stats: ["data-bar-vertical"], organization: ["folder-open"],
    albums: ["image-multiple"], tags: ["tag"], collections: ["grid"], settings: ["settings"], preferences: ["options"],
    apiKeys: ["key"], integrations: ["share"], modulesSettings: ["puzzle-piece"], overview: ["board"], users: ["people"],
    logs: ["document-text"], theme: ["color"], system: ["server"], modules: ["box"], connections: ["link"],
    services: ["plug-connected"], security: ["shield"], tools: ["toolbox", "wrench"], support: ["question-circle"],
    feedback: ["send"], about: ["info"],
  },
  "fluent-color": {
    gallery: ["image"], recent: ["clock"], starred: ["star"], secure: ["lock-closed"], uploads: ["cloud"],
    history: ["history"], uploadConfig: ["settings"], stats: ["data-bar-vertical-ascending"], organization: ["document-folder"],
    albums: ["library"], tags: ["bookmark"], collections: ["apps-list"], settings: ["settings"], preferences: ["options"],
    apiKeys: ["person-key"], integrations: ["share-ios"], modulesSettings: ["apps"], overview: ["board"], users: ["people"],
    logs: ["document-text"], theme: ["paint-brush"], system: ["database"], modules: ["puzzle-piece"], connections: ["link"],
    services: ["globe"], security: ["shield-checkmark"], tools: ["toolbox"], support: ["question-circle"],
    feedback: ["send"], about: ["lightbulb"],
  },
  ri: {
    gallery: ["image"], recent: ["time"], starred: ["star"], secure: ["lock"], uploads: ["upload-cloud-2"],
    history: ["history"], uploadConfig: ["settings-3"], stats: ["bar-chart-2"], organization: ["folder-open"],
    albums: ["gallery", "folder-image"], tags: ["price-tag-3"], collections: ["layout-grid"], settings: ["settings-4"],
    preferences: ["equalizer"], apiKeys: ["key-2"], integrations: ["share"], modulesSettings: ["puzzle"],
    overview: ["dashboard"], users: ["group"], logs: ["file-list-3"], theme: ["palette"], system: ["server"],
    modules: ["box-3"], connections: ["links", "link"], services: ["plug"], security: ["shield-check"], tools: ["tools"],
    support: ["question"], feedback: ["send-plane"], about: ["information"],
  },
  mingcute: {
    gallery: ["pic"], recent: ["time"], starred: ["star"], secure: ["lock"], uploads: ["upload-2"],
    history: ["history"], uploadConfig: ["settings-3"], stats: ["chart-bar"], organization: ["folder-open"],
    albums: ["photo-album", "pic-2"], tags: ["tag"], collections: ["grid"], settings: ["settings-1"],
    preferences: ["settings-6", "settings-5"], apiKeys: ["key-2"], integrations: ["share-2"], modulesSettings: ["puzzled", "box-2"],
    overview: ["dashboard", "layout"], users: ["group"], logs: ["document", "file"], theme: ["palette"], system: ["server"],
    modules: ["box"], connections: ["link"], services: ["plugin", "plugin-2"], security: ["shield"], tools: ["tool"],
    support: ["question"], feedback: ["send"], about: ["information"],
  },
  "material-symbols": {
    gallery: ["image"], recent: ["schedule"], starred: ["star"], secure: ["lock"], uploads: ["upload"],
    history: ["history"], uploadConfig: ["settings"], stats: ["bar-chart"], organization: ["folder-open"],
    albums: ["photo-album", "photo-library"], tags: ["sell"], collections: ["grid-view"], settings: ["settings-applications", "manufacturing"],
    preferences: ["tune"], apiKeys: ["key"], integrations: ["share"], modulesSettings: ["extension"],
    overview: ["dashboard", "space-dashboard"], users: ["group"], logs: ["receipt-long", "list-alt"], theme: ["palette"],
    system: ["dns"], modules: ["deployed-code", "package-2", "inventory-2"], connections: ["link"],
    services: ["electrical-services", "power"], security: ["shield"], tools: ["construction", "handyman"],
    support: ["help"], feedback: ["send"], about: ["info"],
  },
};

/** Variantes : famille, suffixes essayés dans l'ordre, nom affiché. */
export const SETS = [
  { id: "fluent-color", family: "fluent-color", suffixes: ["-24", "-20", "-28", "-32", "-16", "-48"], label: "Fluent Color", license: "MIT", colored: true },
  { id: "lucide", family: null, label: "Lucide", license: "ISC" },
  { id: "phosphor", family: "ph", suffixes: [""], label: "Phosphor", license: "MIT" },
  { id: "phosphor-duotone", family: "ph", suffixes: ["-duotone"], label: "Phosphor Duotone", license: "MIT" },
  { id: "solar-linear", family: "solar", suffixes: ["-linear"], label: "Solar Linear", license: "CC BY 4.0, 480 Design" },
  { id: "solar-duotone", family: "solar", suffixes: ["-bold-duotone"], label: "Solar Bold Duotone", license: "CC BY 4.0, 480 Design" },
  { id: "hugeicons", family: "hugeicons", suffixes: [""], label: "Hugeicons", license: "MIT" },
  { id: "fluent", family: "fluent", suffixes: ["-24-regular", "-20-regular", "-28-regular", "-16-regular"], label: "Fluent", license: "MIT" },
  { id: "remix-fill", family: "ri", suffixes: ["-fill", ""], label: "Remix Icon Fill", license: "Apache 2.0" },
  { id: "mingcute", family: "mingcute", suffixes: ["-line"], label: "MingCute", license: "Apache 2.0" },
  { id: "material-rounded", family: "material-symbols", suffixes: ["-outline-rounded", "-rounded", "-outline", ""], label: "Material Symbols Rounded", license: "Apache 2.0" },
];

export { FAMILIES };
