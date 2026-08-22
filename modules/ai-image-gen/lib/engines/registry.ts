/**
 * Assemble les deux familles de moteurs derrière une seule interface.
 *
 * Le reste du module ignore qu'un modèle passe par une API facturée ou par un
 * agent installé sur la machine : il demande un modèle, il reçoit des images.
 * C'est ici que la différence est absorbée.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  API_ENGINES,
  API_HEALTHCHECKS,
} from "./api-engines";
import {
  BUILT_IN_CLI_ENGINES,
  buildCustomEngine,
  type CustomEngineConfig,
} from "./cli-engines";
import {
  EMPTY_PROBE,
  resolveBinary,
  runCommand,
  type CliProbe,
} from "./cli-detect";
import {
  runCliEngine,
  writeReferences,
  type CliEngineSpec,
} from "./cli-runner";
import type {
  Engine,
  EngineContext,
  EngineModelSpec,
  GenerateRequest,
  GenerateResult,
} from "./types";
import { EngineError } from "./types";

export type { CustomEngineConfig } from "./cli-engines";
export type { CliProbe } from "./cli-detect";

/** Réglages d'un moteur CLI, tels que l'utilisateur les a enregistrés. */
export interface CliEngineSettings {
  /** Le moteur est-il proposé dans le studio ? */
  enabled?: boolean;
  /** Chemin imposé de l'exécutable, quand la détection ne suffit pas. */
  binaryPath?: string;
  /** Force la disponibilité d'un CLI que le module croit incapable. */
  assumeImageCapable?: boolean;
  /** Délai maximal d'une exécution, en secondes. */
  timeoutSeconds?: number;
  /** Mode d'isolation, pour les CLI qui en proposent un. */
  sandbox?: string;
}

export interface EngineConfig {
  apiKeys: Record<string, string | undefined>;
  cli: Record<string, CliEngineSettings | undefined>;
  customEngines: CustomEngineConfig[];
  /** Racine des espaces de travail jetables des moteurs CLI. */
  workRoot: string;
}

const DEFAULT_TIMEOUT_SECONDS = 15 * 60;

// ─── Moteurs CLI ─────────────────────────────────────────────────

function readImageFile(file: string): { b64: string; mimeType: string } {
  const extension = path.extname(file).toLowerCase();
  const mimeType =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  return { b64: fs.readFileSync(file).toString("base64"), mimeType };
}

/**
 * Emballe une description de CLI en moteur utilisable.
 *
 * L'espace de travail est recréé à chaque génération puis supprimé : les
 * agents y déposent volontiers des fichiers intermédiaires, et un dossier
 * partagé entre deux exécutions ferait remonter les images de la précédente.
 */
function toEngine(spec: CliEngineSpec, config: EngineConfig): Engine {
  const settings = config.cli[spec.id] ?? {};

  return {
    id: spec.id,
    label: spec.label,
    kind: "cli",
    billing: "subscription",
    accessHint: `Compte connecté au CLI ${spec.label}, aucune clé API.`,
    models: spec.models,

    async generate(request, ctx): Promise<GenerateResult> {
      const binaryPath =
        ctx.binaryPath ??
        settings.binaryPath ??
        resolveCliBinary(spec, settings);

      if (!binaryPath) {
        throw new EngineError(
          `${spec.label} est introuvable sur ce serveur. ${spec.installHint}`
        );
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const workspace = path.join(config.workRoot, runId);
      const outputDir = path.join(workspace, "out");
      const referenceDir = path.join(workspace, "ref");
      fs.mkdirSync(outputDir, { recursive: true });

      try {
        const referenceFiles = writeReferences(request.references, referenceDir);
        const outcome = await runCliEngine(
          spec,
          binaryPath,
          {
            request,
            workspace,
            outputDir,
            referenceFiles,
            options: (settings as Record<string, unknown>) ?? {},
          },
          {
            onProgress: ctx.onProgress,
            signal: ctx.signal,
            timeoutMs:
              (settings.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
          }
        );

        if (!outcome.files.length) {
          const lastError = [...outcome.state.log]
            .reverse()
            .find((line) => line.level === "error");

          // La sortie brute est souvent la seule chose qui explique l'échec :
          // un agent qui refuse la demande, une commande mal formée, un quota
          // épuisé. Sans elle, l'utilisateur n'a qu'un « rien n'est sorti ».
          const rawTail = [...outcome.state.stderrTail, ...outcome.state.stdoutTail]
            .filter((line) => !line.trim().startsWith("{"))
            .slice(-3)
            .join(" · ")
            .slice(0, 400);

          const base =
            lastError?.text ??
            `${spec.label} s'est terminé sans produire d'image (code ${outcome.exitCode ?? "?"}).`;
          throw new EngineError(rawTail ? `${base} ${rawTail}` : base, rawTail);
        }

        return {
          images: outcome.files.slice(0, request.n).map(readImageFile),
          log: outcome.state.log,
        };
      } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
      }
    },
  };
}

function resolveCliBinary(
  spec: CliEngineSpec,
  settings: CliEngineSettings
): string | null {
  if (settings.binaryPath) {
    return resolveBinary(settings.binaryPath);
  }
  for (const name of spec.binaries) {
    const found = resolveBinary(name);
    if (found) return found;
  }
  return null;
}

// ─── Détection ───────────────────────────────────────────────────

export interface CliEngineStatus extends CliProbe {
  id: string;
  label: string;
  installHint: string;
  docsUrl?: string;
  /** Le module sait-il faire générer des images à ce CLI, réglage compris ? */
  imageCapable: boolean;
  /** Capacité annoncée par le module, avant réglage de l'utilisateur. */
  nativeImageCapable: boolean;
  /** L'utilisateur a-t-il forcé la capacité ? Distinct de `imageCapable`, qui
   *  fusionne les deux : sans cette distinction, l'interface ne pourrait plus
   *  proposer de désactiver ce qu'elle vient d'activer. */
  assumeImageCapable: boolean;
  /** Le moteur est-il retenu pour le studio ? */
  enabled: boolean;
  /** Chemin imposé par l'utilisateur, s'il y en a un. */
  configuredPath?: string;
  custom: boolean;
  /** Modes d'isolation proposés par ce CLI, vide s'il n'en a pas. */
  sandboxModes: { value: string; label: string; description: string }[];
  /** Mode retenu, ou null quand la notion ne s'applique pas. */
  sandbox: string | null;
  models: EngineModelSpec[];
}

/**
 * Résultat de la dernière détection.
 *
 * Chaque sonde lance deux processus par CLI installé, et le studio demande le
 * catalogue à chaque ouverture. Sur une machine modeste, relancer tout cela à
 * chaque chargement se voit. Le cache est volontairement court : une
 * connexion faite dans un terminal doit se refléter sans qu'on ait à redémarrer
 * le serveur, et le bouton de la page Moteurs le contourne de toute façon.
 */
const PROBE_CACHE_MS = 60_000;

let probeCache: { key: string; at: number; result: CliEngineStatus[] } | null = null;

/** Ce qui, en changeant, doit invalider la détection. */
function probeKey(config: EngineConfig): string {
  return JSON.stringify({
    cli: config.cli,
    customs: config.customEngines.map((entry) => [entry.id, entry.binary]),
  });
}

/**
 * Interroge chaque CLI connu. La détection est volontairement tolérante : un
 * outil présent mais déconnecté doit apparaître dans la liste avec la raison,
 * plutôt que disparaître comme s'il n'était pas installé.
 */
export async function probeCliEngines(
  config: EngineConfig,
  options: { force?: boolean } = {}
): Promise<CliEngineStatus[]> {
  const key = probeKey(config);
  if (
    !options.force &&
    probeCache &&
    probeCache.key === key &&
    Date.now() - probeCache.at < PROBE_CACHE_MS
  ) {
    return probeCache.result;
  }

  const result = await runProbes(config);
  probeCache = { key, at: Date.now(), result };
  return result;
}

async function runProbes(config: EngineConfig): Promise<CliEngineStatus[]> {
  const specs = [
    ...BUILT_IN_CLI_ENGINES,
    ...config.customEngines.map(buildCustomEngine),
  ];

  return Promise.all(
    specs.map(async (spec) => {
      const settings = config.cli[spec.id] ?? {};
      const custom = config.customEngines.some((entry) => entry.id === spec.id);
      const assumeImageCapable = Boolean(settings.assumeImageCapable);
      const imageCapable = spec.imageCapable || assumeImageCapable;
      const base: CliEngineStatus = {
        ...EMPTY_PROBE,
        id: spec.id,
        label: spec.label,
        installHint: spec.installHint,
        docsUrl: spec.docsUrl,
        imageCapable,
        nativeImageCapable: spec.imageCapable,
        assumeImageCapable,
        enabled: settings.enabled !== false,
        configuredPath: settings.binaryPath,
        custom,
        sandboxModes: spec.sandboxModes ?? [],
        sandbox: spec.sandboxModes?.length
          ? (settings.sandbox ?? spec.sandboxModes[0].value)
          : null,
        models: spec.models,
      };

      const binaryPath = resolveCliBinary(spec, settings);
      if (!binaryPath) {
        return {
          ...base,
          error: settings.binaryPath
            ? "Le chemin configuré ne pointe sur aucun fichier."
            : null,
        };
      }

      const version = await runCommand(binaryPath, spec.versionArgs, {
        timeoutMs: 20000,
      });
      const versionText = (version.stdout || version.stderr)
        .split("\n")[0]
        ?.trim();

      let authenticated: boolean | null = null;
      let account: string | null = null;
      if (spec.authArgs) {
        const auth = await runCommand(binaryPath, spec.authArgs, {
          timeoutMs: 25000,
        });
        const parsed = spec.parseAuth?.(auth.stdout + "\n" + auth.stderr);
        authenticated = parsed?.authenticated ?? auth.code === 0;
        account = parsed?.account ?? null;
      }

      return {
        ...base,
        binaryPath,
        version: versionText || null,
        authenticated,
        account,
        error:
          version.code !== 0 && !versionText
            ? `L'exécutable répond en erreur (${version.stderr.slice(0, 160)})`
            : null,
      };
    })
  );
}

// ─── Catalogue unifié ────────────────────────────────────────────

export function listEngines(config: EngineConfig): Engine[] {
  const cliSpecs = [
    ...BUILT_IN_CLI_ENGINES,
    ...config.customEngines.map(buildCustomEngine),
  ];
  return [
    ...API_ENGINES,
    ...cliSpecs.map((spec) => toEngine(spec, config)),
  ];
}

export function findEngine(
  engineId: string,
  config: EngineConfig
): Engine | undefined {
  return listEngines(config).find((engine) => engine.id === engineId);
}

export function allModels(config: EngineConfig): EngineModelSpec[] {
  return listEngines(config).flatMap((engine) => engine.models);
}

export function findModel(
  modelId: string,
  config: EngineConfig
): EngineModelSpec | undefined {
  return allModels(config).find((model) => model.id === modelId);
}

export interface ModelAvailability extends EngineModelSpec {
  available: boolean;
  /** Pourquoi le modèle ne peut pas être utilisé en l'état. */
  reason: string | null;
  /** Comment l'accès est obtenu, pour l'affichage. */
  accessLabel: string;
}

/**
 * Le catalogue tel que le studio doit l'afficher : chaque modèle sait dire
 * s'il est utilisable et, sinon, ce qui manque. Proposer un modèle qui échoue
 * à l'exécution est la pire des interfaces.
 */
export async function getCatalog(
  config: EngineConfig
): Promise<{ models: ModelAvailability[]; cli: CliEngineStatus[] }> {
  const cli = await probeCliEngines(config);
  const cliById = new Map(cli.map((status) => [status.id, status]));

  const models = listEngines(config).flatMap((engine) =>
    engine.models.map((model): ModelAvailability => {
      if (engine.kind === "api") {
        const configured = Boolean(config.apiKeys[engine.id]);
        return {
          ...model,
          available: configured,
          reason: configured ? null : `Clé ${engine.label} non renseignée.`,
          accessLabel: `Clé ${engine.label}`,
        };
      }

      const status = cliById.get(engine.id);
      const reason = !status?.binaryPath
        ? `${engine.label} n'est pas installé sur le serveur.`
        : status.enabled === false
          ? `${engine.label} est désactivé dans la configuration.`
          : !status.imageCapable
            ? `${engine.label} ne dispose pas d'outil de génération d'image.`
            : status.authenticated === false
              ? `Aucun compte connecté à ${engine.label}.`
              : null;

      return {
        ...model,
        available: reason === null,
        reason,
        accessLabel: status?.account
          ? `${engine.label} · ${status.account}`
          : `${engine.label}`,
      };
    })
  );

  return { models, cli };
}

// ─── Exécution ───────────────────────────────────────────────────

export async function generateWithEngine(
  request: GenerateRequest,
  config: EngineConfig,
  hooks: Pick<EngineContext, "onProgress" | "signal"> = {}
): Promise<GenerateResult> {
  const model = findModel(request.model, config);
  if (!model) {
    throw new EngineError(`Modèle inconnu : ${request.model}`);
  }

  const engine = findEngine(model.engineId, config);
  if (!engine) {
    throw new EngineError(`Moteur inconnu : ${model.engineId}`);
  }

  if (request.references?.length && !model.supportsReference) {
    throw new EngineError(
      `${model.label} ne sait pas partir d'une image de référence. Choisissez un autre modèle ou retirez l'image.`
    );
  }

  return engine.generate(request, {
    apiKey: config.apiKeys[engine.id],
    onProgress: hooks.onProgress,
    signal: hooks.signal,
  });
}

// ─── Diagnostic des clés API ─────────────────────────────────────

export async function testApiKey(
  engineId: string,
  apiKey: string | undefined
): Promise<{ success: boolean; message: string }> {
  const check = API_HEALTHCHECKS[engineId];
  if (!check) return { success: false, message: "Moteur inconnu" };
  if (!apiKey) return { success: false, message: "Aucune clé enregistrée" };

  try {
    const response = await fetch(check.url, { headers: check.headers(apiKey) });
    if (response.ok) return { success: true, message: "Connexion établie" };
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: `Clé refusée (${response.status})` };
    }
    return {
      success: false,
      message: `Réponse inattendue : HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Réseau injoignable : ${error?.message ?? error}`,
    };
  }
}

/** Emplacement par défaut des espaces de travail jetables. */
export function defaultWorkRoot(moduleDir: string): string {
  // Sous le module plutôt que dans le temp système : en conteneur, `/tmp` est
  // parfois monté en lecture seule ou purgé pendant l'exécution.
  const preferred = path.join(moduleDir, "data", "work");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), "ai-image-gen-"));
  }
}
