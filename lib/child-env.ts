/**
 * Environnement transmis aux programmes externes (agents CLI, Piper…).
 *
 * Leur passer `process.env` leur donnait tous les secrets du serveur
 * (`AUTH_SECRET`, secret client Ascencia ID, clés API) : un agent détourné
 * par un texte piégé pouvait les lire et les recopier dans sa réponse. On ne
 * transmet que le nécessaire au système, plus les variables propres à l'outil
 * lancé.
 */

/** Variables système sans lesquelles un programme ne démarre pas correctement. */
const SYSTEM_NAMES = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "TERM",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  // Certificats et proxy de sortie, pour les outils qui appellent une API.
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  // Windows.
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
];

const SYSTEM_PREFIXES = ["LC_"];

/**
 * Environnement minimal, plus les variables dont le nom commence par l'un des
 * `prefixes` (ex. `CODEX_`, `GEMINI_` pour l'authentification d'un CLI) et
 * les valeurs de `extra`.
 */
export function childEnv(
  options: { prefixes?: string[]; extra?: Record<string, string | undefined> } = {}
): NodeJS.ProcessEnv {
  const names = new Set(SYSTEM_NAMES);
  const prefixes = [...SYSTEM_PREFIXES, ...(options.prefixes ?? [])].map((prefix) => prefix.toUpperCase());
  // `NodeJS.ProcessEnv` est augmenté par le projet (AUTH_SECRET obligatoire) :
  // on construit un simple dictionnaire, puisque le but est justement de
  // laisser ces variables de côté.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // Sous Windows, les noms de variables ne tiennent pas compte de la casse.
    const upper = key.toUpperCase();
    if (names.has(upper) || prefixes.some((prefix) => upper.startsWith(prefix))) env[key] = value;
  }
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}
