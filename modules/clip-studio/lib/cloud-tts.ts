/**
 * Voix en ligne, par clé API : OpenAI, Google Cloud Text-to-Speech et
 * ElevenLabs.
 *
 * Elles complètent Piper, gratuit et local, par des voix plus naturelles,
 * payées à l'usage chez chaque fournisseur. Le texte à lire leur est envoyé :
 * rien ne part tant qu'une voix en ligne n'est pas choisie.
 *
 * Les clés sont réservées aux admins. Elles viennent d'une variable
 * d'environnement ou de `data/secrets.json` (droits 600), et ne sont jamais
 * renvoyées au navigateur : seule leur fin sert à les reconnaître.
 */

import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDirs } from "./store";

export type CloudProvider = "openai" | "google" | "elevenlabs";

export const CLOUD_PROVIDERS: CloudProvider[] = ["openai", "google", "elevenlabs"];

const PROVIDER_INFO: Record<CloudProvider, { label: string; env: string; site: string }> = {
  openai: { label: "OpenAI", env: "OPENAI_API_KEY", site: "https://platform.openai.com/api-keys" },
  google: { label: "Google Cloud", env: "GOOGLE_TTS_API_KEY", site: "https://console.cloud.google.com/apis/library/texttospeech.googleapis.com" },
  elevenlabs: { label: "ElevenLabs", env: "ELEVENLABS_API_KEY", site: "https://elevenlabs.io/app/settings/api-keys" },
};

const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const LIST_TTL_MS = 10 * 60 * 1000;

// ─── Clés ────────────────────────────────────────────────────────

function readSecrets(): { apiKeys: Partial<Record<CloudProvider, string>> } {
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
    return { apiKeys: raw?.apiKeys && typeof raw.apiKeys === "object" ? raw.apiKeys : {} };
  } catch {
    return { apiKeys: {} };
  }
}

function writeSecrets(secrets: { apiKeys: Partial<Record<CloudProvider, string>> }) {
  ensureDirs();
  const temporary = `${SECRETS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, SECRETS_FILE);
  fs.chmodSync(SECRETS_FILE, 0o600);
}

function apiKey(provider: CloudProvider): string {
  return process.env[PROVIDER_INFO[provider].env] || readSecrets().apiKeys[provider] || "";
}

export function isCloudProvider(value: unknown): value is CloudProvider {
  return CLOUD_PROVIDERS.includes(value as CloudProvider);
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
  /** Dernière erreur rencontrée en listant ses voix (clé refusée…). */
  error?: string;
}

/** État des fournisseurs, pour la page des réglages (réservée aux admins). */
export function providerStatuses(): ProviderStatus[] {
  return CLOUD_PROVIDERS.map((id) => {
    const value = apiKey(id);
    return {
      id,
      label: PROVIDER_INFO[id].label,
      configured: value.length > 0,
      fromEnv: Boolean(process.env[PROVIDER_INFO[id].env]),
      hint: value ? `••••••••${value.slice(-4)}` : "",
      envVariable: PROVIDER_INFO[id].env,
      site: PROVIDER_INFO[id].site,
      error: listCache.get(id)?.error,
    };
  });
}

/** Enregistre ou efface (chaîne vide) la clé d'un fournisseur. */
export function saveProviderKey(provider: CloudProvider, value: string) {
  const key = String(value ?? "").trim();
  if (key.length > 300 || /\s/.test(key)) throw new Error("Cette clé n'a pas la forme attendue.");
  const secrets = readSecrets();
  if (key) secrets.apiKeys[provider] = key;
  else delete secrets.apiKeys[provider];
  writeSecrets(secrets);
  listCache.delete(provider);
}

// ─── Catalogue ───────────────────────────────────────────────────

export interface CloudVoice {
  /** `<fournisseur>:<identifiant de la voix chez lui>`. */
  id: string;
  provider: CloudProvider;
  label: string;
  description: string;
  gender?: "female" | "male";
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

async function providerError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.detail?.message ?? parsed?.detail ?? parsed?.message ?? "";
  } catch {
    detail = body.slice(0, 200);
  }
  if (response.status === 401 || response.status === 403) return "Clé refusée par le fournisseur";
  if (response.status === 429) return "Quota ou limite de débit atteint chez le fournisseur";
  return `Erreur ${response.status}${detail ? ` : ${String(detail).slice(0, 200)}` : ""}`;
}

async function listProvider(provider: CloudProvider, key: string): Promise<CloudVoice[]> {
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

/** Voix des fournisseurs configurés. Une clé refusée n'empêche pas les autres. */
export async function listCloudVoices(): Promise<CloudVoice[]> {
  const all = await Promise.all(
    CLOUD_PROVIDERS.map(async (provider) => {
      const key = apiKey(provider);
      if (!key) return [];
      const cached = listCache.get(provider);
      if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.voices;
      try {
        const voices = await listProvider(provider, key);
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

export function parseCloudVoice(id: string): { provider: CloudProvider; voice: string } | null {
  const match = /^(openai|google|elevenlabs):([A-Za-z0-9_-]{1,80})$/.exec(String(id ?? ""));
  return match ? { provider: match[1] as CloudProvider, voice: match[2] } : null;
}

export function isCloudVoiceUsable(id: string): boolean {
  const parsed = parseCloudVoice(id);
  return Boolean(parsed && apiKey(parsed.provider));
}

export async function cloudVoiceLabel(id: string): Promise<{ label: string; provider: string }> {
  const parsed = parseCloudVoice(id);
  const provider = parsed ? PROVIDER_INFO[parsed.provider].label : "en ligne";
  const voice = (await listCloudVoices()).find((entry) => entry.id === id);
  return { label: voice?.label ?? parsed?.voice ?? id, provider };
}

async function readAudio(response: Response): Promise<Buffer> {
  if (!response.ok) throw new Error(`Voix en ligne : ${await providerError(response)}`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_AUDIO_BYTES) throw new Error("Voix en ligne : réponse trop volumineuse.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("Voix en ligne : réponse trop volumineuse.");
  if (buffer.length === 0) throw new Error("Voix en ligne : le fournisseur n'a renvoyé aucun son.");
  return buffer;
}

/**
 * Lit un texte chez le fournisseur. Renvoie le son tel qu'il arrive (MP3 ou
 * WAV) ; la conversion en WAV mono se fait ensuite avec ffmpeg.
 */
export async function synthesizeCloud(id: string, text: string, speed: number): Promise<{ audio: Buffer; extension: "mp3" | "wav" }> {
  const parsed = parseCloudVoice(id);
  if (!parsed) throw new Error("Voix inconnue.");
  const key = apiKey(parsed.provider);
  if (!key) throw new Error(`Aucune clé ${PROVIDER_INFO[parsed.provider].label} n'est configurée.`);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  if (parsed.provider === "openai") {
    if (!OPENAI_VOICES.some((entry) => entry.voice === parsed.voice)) throw new Error("Voix OpenAI inconnue.");
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
