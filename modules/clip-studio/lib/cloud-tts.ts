/**
 * Voix en ligne : Microsoft Edge (lecture à voix haute, sans clé),
 * Microsoft Azure, OpenAI, Google Cloud Text-to-Speech et ElevenLabs.
 *
 * Elles complètent Piper, gratuit et local, par des voix plus naturelles. Le
 * texte à lire leur est envoyé : rien ne part tant qu'une voix en ligne n'est
 * pas choisie (ou écoutée). Edge et l'offre gratuite d'Azure ne coûtent rien ;
 * les autres sont payées à l'usage chez chaque fournisseur.
 *
 * Les clés sont réservées aux admins. Elles viennent d'une variable
 * d'environnement ou de `data/secrets.json` (droits 600), et ne sont jamais
 * renvoyées au navigateur : seule leur fin sert à les reconnaître.
 */

import fs from "fs";
import path from "path";
import type { TimedWord } from "../engine/types";
import { DATA_DIR, ensureDirs } from "./store";
import { escapeXmlText, fetchEdgeVoices, prosodyRate, stripControls, synthesizeEdge } from "./edge-tts";
import { countCharacters, recordAiUsage, usageError, type AiLimit, type AiModuleReport, type AiProviderId } from "@/lib/ai-usage";
import { readElevenLabsLimits } from "@/lib/ai-usage/remote";

export type CloudProvider = "edge" | "azure" | "openai" | "google" | "elevenlabs";
/** Fournisseurs qui demandent une clé (tous sauf Edge). */
export type KeyProvider = Exclude<CloudProvider, "edge">;

export const CLOUD_PROVIDERS: CloudProvider[] = ["edge", "azure", "openai", "google", "elevenlabs"];
const KEY_PROVIDERS: KeyProvider[] = ["azure", "openai", "google", "elevenlabs"];

const PROVIDER_INFO: Record<CloudProvider, { label: string; env: string; site: string }> = {
  edge: { label: "Microsoft Edge", env: "", site: "" },
  azure: {
    label: "Microsoft Azure",
    env: "AZURE_SPEECH_KEY",
    site: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices",
  },
  openai: { label: "OpenAI", env: "OPENAI_API_KEY", site: "https://platform.openai.com/api-keys" },
  google: { label: "Google Cloud", env: "GOOGLE_TTS_API_KEY", site: "https://console.cloud.google.com/apis/library/texttospeech.googleapis.com" },
  elevenlabs: { label: "ElevenLabs", env: "ELEVENLABS_API_KEY", site: "https://elevenlabs.io/app/settings/api-keys" },
};

const AZURE_REGION_ENV = "AZURE_SPEECH_REGION";
/** Offre gratuite (F0) d'Azure : 500 000 caractères de voix neuronales par mois. */
export const AZURE_FREE_CHARACTERS = 500_000;
/** Offre gratuite (F0) d'Azure : 20 demandes de synthèse par minute au plus. */
const AZURE_REQUESTS_PER_MINUTE = 20;

const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");
const USAGE_FILE = path.join(DATA_DIR, "tts-usage.json");
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const LIST_TTL_MS = 10 * 60 * 1000;
/** Les catalogues de Microsoft bougent rarement : relus toutes les six heures. */
const MICROSOFT_LIST_TTL_MS = 6 * 60 * 60 * 1000;
/** Un catalogue en échec est redemandé plus tôt. */
const ERROR_TTL_MS = 3 * 60 * 1000;

// ─── Clés et réglages ────────────────────────────────────────────

interface Secrets {
  apiKeys: Partial<Record<KeyProvider, string>>;
  azureRegion?: string;
  edgeDisabled?: boolean;
}

function readSecrets(): Secrets {
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
    return {
      apiKeys: raw?.apiKeys && typeof raw.apiKeys === "object" ? raw.apiKeys : {},
      ...(typeof raw?.azureRegion === "string" ? { azureRegion: raw.azureRegion } : {}),
      ...(raw?.edgeDisabled === true ? { edgeDisabled: true } : {}),
    };
  } catch {
    return { apiKeys: {} };
  }
}

function writeSecrets(secrets: Secrets) {
  ensureDirs();
  const temporary = `${SECRETS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, SECRETS_FILE);
  fs.chmodSync(SECRETS_FILE, 0o600);
}

function apiKey(provider: CloudProvider): string {
  if (provider === "edge") return "";
  return process.env[PROVIDER_INFO[provider].env] || readSecrets().apiKeys[provider] || "";
}

function azureRegion(): string {
  return process.env[AZURE_REGION_ENV] || readSecrets().azureRegion || "";
}

function edgeEnabled(): boolean {
  return !readSecrets().edgeDisabled;
}

/** Fournisseur prêt à lire : clé (et région pour Azure), ou Edge activé. */
function providerReady(provider: CloudProvider): boolean {
  if (provider === "edge") return edgeEnabled();
  if (provider === "azure") return Boolean(apiKey("azure") && azureRegion());
  return Boolean(apiKey(provider));
}

export function isCloudProvider(value: unknown): value is CloudProvider {
  return CLOUD_PROVIDERS.includes(value as CloudProvider);
}

export function isKeyProvider(value: unknown): value is KeyProvider {
  return KEY_PROVIDERS.includes(value as KeyProvider);
}

export interface ProviderStatus {
  id: CloudProvider;
  label: string;
  configured: boolean;
  fromEnv: boolean;
  /** Fin de la clé, pour la reconnaître sans l'exposer. */
  hint: string;
  envVariable: string;
  site: string;
  /** Edge : pas de clé, seulement un interrupteur. */
  keyless?: boolean;
  enabled?: boolean;
  /** Azure : région de la ressource Speech. */
  region?: string;
  regionFromEnv?: boolean;
  regionEnvVariable?: string;
  /** Azure : caractères envoyés ce mois-ci, comptés par Clip Studio. */
  usage?: UsageSummary;
  /** Dernière erreur rencontrée en listant ses voix (clé refusée…). */
  error?: string;
}

export interface UsageSummary {
  month: string;
  characters: number;
  limit: number;
}

/** État des fournisseurs, pour la page des réglages (réservée aux admins). */
export function providerStatuses(now = new Date()): ProviderStatus[] {
  return CLOUD_PROVIDERS.map((id) => {
    if (id === "edge") {
      const enabled = edgeEnabled();
      return {
        id,
        label: PROVIDER_INFO.edge.label,
        configured: enabled,
        fromEnv: false,
        hint: "",
        envVariable: "",
        site: "",
        keyless: true,
        enabled,
        error: enabled ? listCache.get(id)?.error : undefined,
      };
    }
    const value = apiKey(id);
    const status: ProviderStatus = {
      id,
      label: PROVIDER_INFO[id].label,
      configured: providerReady(id),
      fromEnv: Boolean(process.env[PROVIDER_INFO[id].env]),
      hint: value ? `••••••••${value.slice(-4)}` : "",
      envVariable: PROVIDER_INFO[id].env,
      site: PROVIDER_INFO[id].site,
      error: listCache.get(id)?.error,
    };
    if (id === "azure") {
      status.region = azureRegion();
      status.regionFromEnv = Boolean(process.env[AZURE_REGION_ENV]);
      status.regionEnvVariable = AZURE_REGION_ENV;
      status.usage = usageSummary("azure", now);
    }
    return status;
  });
}

/** Disponibilité des sources pour tous les comptes : ni clé, ni fin de clé. */
export interface SourceAvailability {
  id: CloudProvider;
  label: string;
  available: boolean;
  /** Pourquoi la source manque, ou sa dernière erreur. */
  reason?: string;
  /** Azure : caractères envoyés ce mois-ci (aucune donnée de clé). */
  usage?: UsageSummary;
}

export function sourceAvailability(): SourceAvailability[] {
  return CLOUD_PROVIDERS.map((id) => {
    const available = providerReady(id);
    const error = available ? listCache.get(id)?.error : undefined;
    let reason: string | undefined = error;
    if (!available) {
      if (id === "edge") reason = "Désactivée par un administrateur dans « Voix en ligne ».";
      else if (id === "azure" && apiKey("azure")) reason = "Indiquez la région de la ressource Azure dans « Voix en ligne ».";
      else reason = "Ajoutez une clé dans « Voix en ligne » (compte administrateur).";
    }
    return {
      id,
      label: PROVIDER_INFO[id].label,
      available,
      ...(reason ? { reason } : {}),
      ...(id === "azure" && available ? { usage: usageSummary("azure", new Date()) } : {}),
    };
  });
}

/** Enregistre ou efface (chaîne vide) la clé d'un fournisseur. */
export function saveProviderKey(provider: KeyProvider, value: string) {
  const key = String(value ?? "").trim();
  if (key.length > 300 || /\s/.test(key)) throw new Error("Cette clé n'a pas la forme attendue.");
  const secrets = readSecrets();
  if (key) secrets.apiKeys[provider] = key;
  else delete secrets.apiKeys[provider];
  writeSecrets(secrets);
  listCache.delete(provider);
}

/** Région Azure (« westeurope », « francecentral »…), ou chaîne vide pour l'effacer. */
export function saveAzureRegion(value: string) {
  const region = String(value ?? "").trim().toLowerCase();
  if (region && !/^[a-z0-9]{3,30}$/.test(region)) throw new Error("Cette région n'a pas la forme attendue (exemple : westeurope).");
  const secrets = readSecrets();
  if (region) secrets.azureRegion = region;
  else delete secrets.azureRegion;
  writeSecrets(secrets);
  listCache.delete("azure");
}

export function setEdgeEnabled(enabled: boolean) {
  const secrets = readSecrets();
  if (enabled) delete secrets.edgeDisabled;
  else secrets.edgeDisabled = true;
  writeSecrets(secrets);
  listCache.delete("edge");
}

// ─── Compteur de caractères ──────────────────────────────────────

type UsageFile = Partial<Record<CloudProvider, Record<string, number>>>;

/** Mois de facturation, en temps universel : « 2026-10 ». */
export function usageMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readUsage(): UsageFile {
  try {
    const raw = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function usageThisMonth(provider: CloudProvider, now = new Date()): number {
  const value = readUsage()[provider]?.[usageMonth(now)];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageSummary(provider: CloudProvider, now: Date): UsageSummary {
  return { month: usageMonth(now), characters: usageThisMonth(provider, now), limit: AZURE_FREE_CHARACTERS };
}

/** Ajoute des caractères au mois courant ; seuls les trois derniers mois sont gardés. */
export function recordUsage(provider: CloudProvider, characters: number, now = new Date()) {
  if (!(characters > 0)) return;
  const usage = readUsage();
  const months = { ...(usage[provider] ?? {}) };
  const month = usageMonth(now);
  months[month] = (months[month] ?? 0) + characters;
  usage[provider] = Object.fromEntries(Object.entries(months).sort(([a], [b]) => b.localeCompare(a)).slice(0, 3));
  ensureDirs();
  const temporary = `${USAGE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(usage, null, 2));
  fs.renameSync(temporary, USAGE_FILE);
}

// ─── Consommation des IA (écran `/admin/ai`) ─────────────────────

/** Premier instant du mois suivant, en temps universel : le compteur d’Azure repart alors. */
function nextUsageMonth(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

function keyAccess(provider: KeyProvider): "env" | "key" | "none" {
  if (process.env[PROVIDER_INFO[provider].env]) return "env";
  return readSecrets().apiKeys[provider] ? "key" : "none";
}

/**
 * Ce que Clip Studio sait des voix en ligne, sans aucune clé : l’accès à
 * chaque fournisseur et le compteur mensuel d’Azure, tenu ici.
 */
export function voiceUsageReport(now = new Date()): AiModuleReport {
  const settingsHref = "/m/clip-studio/voices";
  const azureAccess = keyAccess("azure");
  return {
    "edge-tts": { access: edgeEnabled() ? "open" : "none", settingsHref },
    "azure-speech": {
      // Une clé sans région ne sert à rien.
      access: azureAccess !== "none" && azureRegion() ? azureAccess : "none",
      settingsHref,
      limits: [
        {
          id: "azure-free-characters",
          label: "Caractères gratuits du mois (offre F0)",
          unit: "characters",
          period: "month",
          used: usageThisMonth("azure", now),
          limit: AZURE_FREE_CHARACTERS,
          resetsAt: nextUsageMonth(now),
          source: "local",
          note: "Compté par Clip Studio ; au-delà, une voix Azure est refusée.",
        },
      ],
    },
    "google-tts": { access: keyAccess("google"), settingsHref },
    elevenlabs: { access: keyAccess("elevenlabs"), remoteReadable: Boolean(apiKey("elevenlabs")), settingsHref },
  };
}

/** Accès d’OpenAI pour les voix : une clé propre à Clip Studio, ou la variable d’environnement. */
export function openAiVoiceAccess(): "env" | "key" | "none" {
  return keyAccess("openai");
}

/** Solde ElevenLabs lu chez le service, sans rien dépenser. */
export async function readElevenLabsBalance(): Promise<AiLimit[]> {
  const key = apiKey("elevenlabs");
  if (!key) throw new Error("Aucune clé ElevenLabs n’est configurée dans « Voix en ligne ».");
  return readElevenLabsLimits(key);
}

/**
 * Caractères facturés par Azure pour un SSML : tout, sauf les balises
 * `<speak>` et `<voice>` ; un idéogramme chinois compte double.
 */
export function billableCharacters(ssml: string): number {
  const counted = ssml.replace(/<\/?speak\b[^>]*>/g, "").replace(/<\/?voice\b[^>]*>/g, "");
  let total = 0;
  for (const character of counted) total += /\p{Script=Han}/u.test(character) ? 2 : 1;
  return total;
}

// ─── Catalogue ───────────────────────────────────────────────────

export interface CloudVoice {
  /** `<fournisseur>:<identifiant de la voix chez lui>`. */
  id: string;
  provider: CloudProvider;
  label: string;
  description: string;
  gender?: "female" | "male";
  /** Langue de la voix (« fr-FR »), quand le fournisseur la donne. */
  locale?: string;
}

/** Voix d'OpenAI, les mêmes pour toutes les clés ; elles parlent français. */
const OPENAI_VOICES: { voice: string; label: string; description: string; gender?: "female" | "male" }[] = [
  { voice: "nova", label: "Nova", description: "Féminine, vive", gender: "female" },
  { voice: "shimmer", label: "Shimmer", description: "Féminine, douce", gender: "female" },
  { voice: "coral", label: "Coral", description: "Féminine, chaleureuse", gender: "female" },
  { voice: "sage", label: "Sage", description: "Féminine, posée", gender: "female" },
  { voice: "alloy", label: "Alloy", description: "Neutre, équilibrée" },
  { voice: "ash", label: "Ash", description: "Masculine, claire", gender: "male" },
  { voice: "onyx", label: "Onyx", description: "Masculine, grave", gender: "male" },
  { voice: "echo", label: "Echo", description: "Masculine, calme", gender: "male" },
  { voice: "fable", label: "Fable", description: "Masculine, conteuse", gender: "male" },
];

const listCache = new Map<CloudProvider, { at: number; voices: CloudVoice[]; error?: string }>();

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(await providerError(response));
  return response.json();
}

async function providerError(response: Response, provider?: CloudProvider): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.detail?.message ?? parsed?.detail ?? parsed?.message ?? "";
  } catch {
    detail = body.slice(0, 200);
  }
  if (provider === "azure") {
    if (response.status === 401 || response.status === 403) return "Clé Azure refusée : vérifiez la clé et la région de la ressource Speech";
    if (response.status === 429) {
      return "Azure refuse la demande (429) : quota gratuit du mois épuisé, ou plus de 20 demandes par minute. Réessayez plus tard, ou choisissez une voix locale ou Edge";
    }
  }
  if (response.status === 401 || response.status === 403) return "Clé refusée par le fournisseur";
  if (response.status === 429) return "Quota ou limite de débit atteint chez le fournisseur";
  return `Erreur ${response.status}${detail ? ` : ${String(detail).slice(0, 200)}` : ""}`;
}

/** « Français (France) » : nom d'une langue, en français. */
export function localeLabel(locale: string): string {
  try {
    const name = new Intl.DisplayNames(["fr"], { type: "language" }).of(locale) ?? locale;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return locale;
  }
}

/** « fr-FR-VivienneMultilingualNeural » → « Vivienne (multilingue) ». */
export function microsoftVoiceLabel(shortName: string, displayName?: string): string {
  const name = shortName.replace(/^[a-z]{2,3}(-[A-Za-z0-9]+)?-/, "").replace(/Neural$/, "");
  const multilingual = /Multilingual/.test(name);
  const base = displayName?.replace(/\s*Multilingual$/i, "").trim() || name.replace(/Multilingual/, "") || shortName;
  return multilingual ? `${base} (multilingue)` : base;
}

async function listProvider(provider: CloudProvider, key: string): Promise<CloudVoice[]> {
  if (provider === "edge") {
    const voices = await fetchEdgeVoices();
    return voices.map((voice) => ({
      id: `edge:${voice.shortName}`,
      provider,
      label: microsoftVoiceLabel(voice.shortName, /^Microsoft (.+?) Online/.exec(voice.friendlyName)?.[1]),
      description: localeLabel(voice.locale),
      gender: voice.gender,
      locale: voice.locale,
    }));
  }
  if (provider === "azure") {
    const region = azureRegion();
    const data = await fetchJson(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    }).catch(async (error) => {
      // `fetchJson` ne connaît pas le fournisseur : on reformule une clé refusée.
      if (/Clé refusée/.test(String(error?.message))) throw new Error("Clé Azure refusée : vérifiez la clé et la région de la ressource Speech");
      throw error;
    });
    const voices: Record<string, unknown>[] = Array.isArray(data) ? data : [];
    return voices.flatMap((voice): CloudVoice[] => {
      const shortName = String(voice.ShortName ?? "");
      // Voix neuronales standard seulement : les voix HD et personnalisées
      // ne sont pas comprises dans l'offre gratuite.
      if (voice.VoiceType !== "Neural" || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]+){1,4}$/.test(shortName)) return [];
      const locale = String(voice.Locale ?? "");
      const styles = Array.isArray(voice.StyleList) ? voice.StyleList.length : 0;
      const gender = voice.Gender === "Female" ? "female" : voice.Gender === "Male" ? "male" : undefined;
      return [
        {
          id: `azure:${shortName}`,
          provider,
          label: microsoftVoiceLabel(shortName, typeof voice.DisplayName === "string" ? voice.DisplayName : undefined),
          description: `${localeLabel(locale)}${styles ? `, ${styles} style${styles > 1 ? "s" : ""}` : ""}`,
          gender,
          locale,
        },
      ];
    });
  }
  if (provider === "openai") {
    return OPENAI_VOICES.map((entry) => ({ id: `openai:${entry.voice}`, provider, label: entry.label, description: entry.description, gender: entry.gender }));
  }
  if (provider === "google") {
    const data = await fetchJson(`https://texttospeech.googleapis.com/v1/voices?languageCode=fr-FR&key=${encodeURIComponent(key)}`, {});
    const voices: { name: string; ssmlGender?: string }[] = Array.isArray(data?.voices) ? data.voices : [];
    return voices
      .filter((voice) => /^fr-FR-(Neural2|Wavenet|Studio)-[A-Z]$/.test(voice.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 24)
      .map((voice) => {
        const [, family, letter] = /^fr-FR-(\w+)-([A-Z])$/.exec(voice.name) ?? [];
        const gender = voice.ssmlGender === "FEMALE" ? "female" : voice.ssmlGender === "MALE" ? "male" : undefined;
        return {
          id: `google:${voice.name}`,
          provider,
          label: `${family} ${letter}`,
          description: gender === "female" ? "Féminine" : gender === "male" ? "Masculine" : "Voix Google",
          gender,
          locale: "fr-FR",
        };
      });
  }
  const data = await fetchJson("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  const voices: { voice_id: string; name: string; labels?: Record<string, string> }[] = Array.isArray(data?.voices) ? data.voices : [];
  return voices
    .filter((voice) => /^[A-Za-z0-9]{1,64}$/.test(voice.voice_id))
    .slice(0, 40)
    .map((voice) => {
      const gender = voice.labels?.gender === "female" ? "female" : voice.labels?.gender === "male" ? "male" : undefined;
      const traits = [voice.labels?.description, voice.labels?.accent].filter(Boolean).join(", ");
      return {
        id: `elevenlabs:${voice.voice_id}`,
        provider,
        label: String(voice.name).slice(0, 40),
        description: traits ? traits.slice(0, 60) : "Voix ElevenLabs",
        gender,
      };
    });
}

/** Voix des fournisseurs prêts. Un fournisseur en échec n'empêche pas les autres. */
export async function listCloudVoices(): Promise<CloudVoice[]> {
  const all = await Promise.all(
    CLOUD_PROVIDERS.map(async (provider) => {
      if (!providerReady(provider)) return [];
      const ttl = provider === "edge" || provider === "azure" ? MICROSOFT_LIST_TTL_MS : LIST_TTL_MS;
      const cached = listCache.get(provider);
      if (cached && Date.now() - cached.at < (cached.error ? ERROR_TTL_MS : ttl)) return cached.voices;
      try {
        const voices = await listProvider(provider, apiKey(provider));
        listCache.set(provider, { at: Date.now(), voices });
        return voices;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Liste des voix indisponible";
        listCache.set(provider, { at: Date.now(), voices: [], error: message });
        return [];
      }
    })
  );
  return all.flat();
}

// ─── Synthèse ────────────────────────────────────────────────────

const MICROSOFT_VOICE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]+){1,4}$/;
const SIMPLE_VOICE = /^[A-Za-z0-9_-]{1,80}$/;

export function parseCloudVoice(id: string): { provider: CloudProvider; voice: string } | null {
  const match = /^(edge|azure|openai|google|elevenlabs):(.{1,100})$/.exec(String(id ?? ""));
  if (!match) return null;
  const provider = match[1] as CloudProvider;
  const voice = match[2];
  const valid = provider === "edge" || provider === "azure" ? MICROSOFT_VOICE.test(voice) : SIMPLE_VOICE.test(voice);
  return valid ? { provider, voice } : null;
}

export function isCloudVoiceUsable(id: string): boolean {
  const parsed = parseCloudVoice(id);
  return Boolean(parsed && providerReady(parsed.provider));
}

export function providerLabel(provider: CloudProvider): string {
  return PROVIDER_INFO[provider].label;
}

export async function cloudVoiceLabel(id: string): Promise<{ label: string; provider: string }> {
  const parsed = parseCloudVoice(id);
  const provider = parsed ? PROVIDER_INFO[parsed.provider].label : "en ligne";
  const voice = (await listCloudVoices()).find((entry) => entry.id === id);
  return { label: voice?.label ?? parsed?.voice ?? id, provider };
}

async function readAudio(response: Response, provider?: CloudProvider): Promise<Buffer> {
  if (!response.ok) throw new Error(`Voix en ligne : ${await providerError(response, provider)}`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_AUDIO_BYTES) throw new Error("Voix en ligne : réponse trop volumineuse.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("Voix en ligne : réponse trop volumineuse.");
  if (buffer.length === 0) throw new Error("Voix en ligne : le fournisseur n'a renvoyé aucun son.");
  return buffer;
}

/** SSML d'Azure : sans `<prosody>` à vitesse normale, pour ne pas payer ses caractères. */
export function azureSsml(voice: string, text: string, speed: number): string {
  const lang = /^([a-z]{2,3}-[A-Z]{2})/.exec(voice)?.[1] ?? "fr-FR";
  const body = escapeXmlText(stripControls(text));
  const inner = Math.abs(speed - 1) < 0.005 ? body : `<prosody rate='${prosodyRate(speed)}'>${body}</prosody>`;
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>${inner}</voice></speak>`;
}

/** Instants des dernières demandes à Azure, pour rester sous 20 par minute. */
const azureRequests: number[] = [];

/**
 * Attend une place sous la limite de l'offre gratuite (20 demandes par
 * minute). L'attente est bornée : une minute au plus.
 */
async function azureSlot() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    while (azureRequests.length && now - azureRequests[0] >= 60_000) azureRequests.shift();
    if (azureRequests.length < AZURE_REQUESTS_PER_MINUTE) {
      azureRequests.push(now);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 60_000 - (now - azureRequests[0]) + 50)));
  }
  throw new Error("Azure : trop de demandes en une minute. Réessayez dans un instant.");
}

export interface CloudSynthesis {
  audio: Buffer;
  extension: "mp3" | "wav";
  /** Instants des mots quand le fournisseur les donne (Edge) ; sinon l'alignement les calcule. */
  words?: TimedWord[];
}

/** Fournisseur du registre de consommation des IA, pour chaque source de voix en ligne. */
const USAGE_PROVIDERS: Record<CloudProvider, AiProviderId> = {
  edge: "edge-tts",
  azure: "azure-speech",
  openai: "openai",
  google: "google-tts",
  elevenlabs: "elevenlabs",
};

/** Modèle noté dans le registre : le modèle de synthèse quand il est fixe, sinon la voix. */
function usageModel(provider: CloudProvider, voice: string): string {
  if (provider === "openai") return "gpt-4o-mini-tts";
  if (provider === "elevenlabs") return "eleven_multilingual_v2";
  return voice;
}

/**
 * Lit un texte chez le fournisseur. Renvoie le son tel qu'il arrive (MP3 ou
 * WAV) ; la conversion en WAV mono se fait ensuite avec ffmpeg. `feature` :
 * l'usage noté dans le registre de consommation des IA.
 */
export async function synthesizeCloud(id: string, text: string, speed: number, feature = "Voix off"): Promise<CloudSynthesis> {
  const parsed = parseCloudVoice(id);
  if (!parsed) throw new Error("Voix inconnue.");
  // Caractères facturés : ceux du SSML pour Azure, ceux du texte ailleurs.
  let characters = countCharacters(text);
  let sent = false;
  try {
    const synthesis = await synthesizeWith(parsed, text, speed, (billed) => {
      sent = true;
      if (billed !== undefined) characters = billed;
    });
    recordAiUsage({ provider: USAGE_PROVIDERS[parsed.provider], module: "clip-studio", feature, model: usageModel(parsed.provider, parsed.voice), unit: "characters", amount: characters, ok: true });
    return synthesis;
  } catch (error) {
    // Refusé avant tout envoi (clé absente, quota local atteint) : aucun appel n'est parti.
    if (sent) {
      recordAiUsage({
        provider: USAGE_PROVIDERS[parsed.provider],
        module: "clip-studio",
        feature,
        model: usageModel(parsed.provider, parsed.voice),
        unit: "characters",
        amount: 0,
        ok: false,
        error: usageError(error),
      });
    }
    throw error;
  }
}

/** `onSend` est appelé juste avant la requête au fournisseur, avec les caractères facturés s'ils diffèrent du texte. */
async function synthesizeWith(
  parsed: { provider: CloudProvider; voice: string },
  text: string,
  speed: number,
  onSend: (billed?: number) => void
): Promise<CloudSynthesis> {
  if (parsed.provider === "edge") {
    if (!edgeEnabled()) throw new Error("Les voix d'Edge sont désactivées dans « Voix en ligne ».");
    onSend();
    const result = await synthesizeEdge(parsed.voice, text, speed);
    return { audio: result.audio, extension: "mp3", words: result.words };
  }

  const key = apiKey(parsed.provider);
  if (!key) throw new Error(`Aucune clé ${PROVIDER_INFO[parsed.provider].label} n'est configurée.`);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  if (parsed.provider === "azure") {
    const region = azureRegion();
    if (!region) throw new Error("Indiquez la région de la ressource Azure dans « Voix en ligne ».");
    const ssml = azureSsml(parsed.voice, text, speed);
    const characters = billableCharacters(ssml);
    const used = usageThisMonth("azure");
    // Garde-fou du « zéro euro » : au-delà de l'offre gratuite, une ressource
    // payante facturerait. Le compte est local, donc approximatif.
    if (used + characters > AZURE_FREE_CHARACTERS) {
      throw new Error(
        `Quota gratuit d'Azure atteint ce mois-ci (${used.toLocaleString("fr-FR")} caractères sur ${AZURE_FREE_CHARACTERS.toLocaleString("fr-FR")}, comptés par Clip Studio). Choisissez une voix locale ou Edge.`
      );
    }
    await azureSlot();
    onSend(characters);
    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      signal,
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "ShareX-Manager-Clip-Studio",
      },
      body: ssml,
    });
    const audio = await readAudio(response, "azure");
    recordUsage("azure", characters);
    return { audio, extension: "wav" };
  }

  if (parsed.provider === "openai") {
    if (!OPENAI_VOICES.some((entry) => entry.voice === parsed.voice)) throw new Error("Voix OpenAI inconnue.");
    onSend();
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: parsed.voice,
        input: text,
        instructions: "Lis ce texte en français, avec une diction naturelle et un ton engageant de vidéo courte.",
        response_format: "mp3",
        speed,
      }),
    });
    return { audio: await readAudio(response), extension: "mp3" };
  }

  if (parsed.provider === "google") {
    onSend();
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "fr-FR", name: parsed.voice },
        audioConfig: { audioEncoding: "MP3", speakingRate: speed },
      }),
    });
    if (!response.ok) throw new Error(`Voix en ligne : ${await providerError(response)}`);
    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) throw new Error("Voix en ligne : le fournisseur n'a renvoyé aucun son.");
    const audio = Buffer.from(data.audioContent, "base64");
    if (audio.length > MAX_AUDIO_BYTES) throw new Error("Voix en ligne : réponse trop volumineuse.");
    return { audio, extension: "mp3" };
  }

  onSend();
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${parsed.voice}?output_format=mp3_44100_128`, {
    method: "POST",
    signal,
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, speed)) },
    }),
  });
  return { audio: await readAudio(response), extension: "mp3" };
}
