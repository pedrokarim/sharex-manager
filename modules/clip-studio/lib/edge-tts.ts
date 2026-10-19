/**
 * Voix de la lecture à voix haute d’Edge, sans clé.
 *
 * Le navigateur Edge lit les pages avec les voix neuronales de Microsoft, par
 * un accès public mais non documenté : une liste de voix en HTTPS et une
 * synthèse par WebSocket. Clip Studio parle le même protocole. Rien ne
 * garantit qu’il dure : Microsoft l’a déjà changé (octobre 2026, nouvel hôte
 * de synthèse). Chaque échec renvoie donc un message clair et ne boucle pas.
 *
 * Déroulé d’une synthèse :
 * 1. jeton `Sec-MS-GEC` : empreinte SHA-256 de l’heure (en tranches de cinq
 *    minutes, comptée en centaines de nanosecondes depuis 1601) suivie de la
 *    clé publique du client ;
 * 2. connexion WebSocket, puis deux messages texte : la configuration (format
 *    MP3 24 kHz mono, instants des mots demandés) et le SSML à lire ;
 * 3. réponses : messages texte (`turn.start`, `audio.metadata` avec les
 *    instants des mots, `turn.end`) et messages binaires (deux octets de
 *    longueur d’en-tête, l’en-tête `Path:audio`, puis le son).
 */

import { createHash, randomBytes, randomUUID } from "crypto";
import type { TimedWord } from "../engine/types";

/** Clé publique du client de lecture d’Edge, la même pour tous les navigateurs. */
export const EDGE_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VERSION = "143.0.3650.75";
const EDGE_MAJOR = EDGE_VERSION.split(".")[0];
export const EDGE_GEC_VERSION = `1-${EDGE_VERSION}`;
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${EDGE_MAJOR}.0.0.0 Safari/537.36 Edg/${EDGE_MAJOR}.0.0.0`;
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

/**
 * Hôtes de synthèse, essayés dans l’ordre, une fois chacun. Edge synthétise
 * par `api.msedgeservices.com` depuis octobre 2026 ; l’ancien hôte répond
 * encore dans certains pays.
 */
const SYNTHESIS_ENDPOINTS = [
  `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${EDGE_CLIENT_TOKEN}`,
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_CLIENT_TOKEN}`,
];
const VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${EDGE_CLIENT_TOKEN}`;

/** Secondes entre le 1er janvier 1601 (horloge de Windows) et le 1er janvier 1970. */
const WINDOWS_EPOCH_SECONDS = 11_644_473_600;
const TICKS_PER_MS = 10_000;
/** Débit constant du MP3 demandé : sert à décaler les instants d’un morceau à l’autre. */
const MP3_BITRATE = 48_000;
/** Taille maximale du SSML échappé d’un morceau, en octets (le service refuse au-delà de 4 096). */
const MAX_CHUNK_BYTES = 3_800;
const CONNECT_TIMEOUT_MS = 10_000;
const TURN_TIMEOUT_MS = 45_000;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export const EDGE_BROKEN_MESSAGE = "Microsoft a changé l’accès de lecture d’Edge : passez par Azure ou une voix locale.";

export class EdgeAccessError extends Error {
  constructor(detail?: string) {
    super(detail ? `${EDGE_BROKEN_MESSAGE} (${detail})` : EDGE_BROKEN_MESSAGE);
    this.name = "EdgeAccessError";
  }
}

/**
 * Edge refuse ou coupe la connexion après plusieurs essais. C’est le plus
 * souvent passager (vu le 19/10/2026 : deux refus au milieu de 63 lectures
 * réussies) : le message ne parle pas d’un changement d’accès.
 */
export class EdgeUnavailableError extends Error {
  constructor(
    readonly attempts: number,
    readonly detail: string
  ) {
    super(`Edge n’a pas répondu après ${attempts} essais (${detail}). C’est le plus souvent passager${" "}: relancez dans un instant, ou choisissez une autre voix si cela dure.`);
    this.name = "EdgeUnavailableError";
  }
}

/** Attentes avant les nouveaux essais d’une connexion refusée ou coupée. */
export const EDGE_RETRY_DELAYS_MS = [1_500, 4_000, 10_000];
/** Lectures simultanées au plus : au-delà, Microsoft refuse plus souvent les connexions. */
export const EDGE_MAX_CONCURRENT = 3;

const edgeQueue: { running: number; waiting: (() => void)[] } = { running: 0, waiting: [] };

async function withEdgeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (edgeQueue.running >= EDGE_MAX_CONCURRENT) await new Promise<void>((resolve) => edgeQueue.waiting.push(resolve));
  edgeQueue.running++;
  try {
    return await task();
  } finally {
    edgeQueue.running--;
    edgeQueue.waiting.shift()?.();
  }
}

// ─── Jeton ───────────────────────────────────────────────────────

/** Écart entre l’horloge du serveur de Microsoft et la nôtre, lu dans l’en-tête `Date`. */
let clockSkewMs = 0;

/** Jeton `Sec-MS-GEC` pour un instant donné (millisecondes Unix) : le même pendant cinq minutes. */
export function secMsGec(nowMs: number): string {
  let seconds = Math.floor(nowMs / 1000) + WINDOWS_EPOCH_SECONDS;
  seconds -= seconds % 300;
  const ticks = BigInt(seconds) * BigInt(10_000_000);
  return createHash("sha256").update(`${ticks}${EDGE_CLIENT_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

function currentGec(): string {
  return secMsGec(Date.now() + clockSkewMs);
}

/** Recale l’horloge sur l’en-tête `Date` d’une réponse de Microsoft. Renvoie l’écart corrigé. */
function adjustClock(dateHeader: string | null): number {
  const server = dateHeader ? Date.parse(dateHeader) : NaN;
  if (!Number.isFinite(server)) return 0;
  const previous = clockSkewMs;
  clockSkewMs = server - Date.now();
  return Math.abs(clockSkewMs - previous);
}

/** Identifiant de navigateur aléatoire, comme celui qu’Edge envoie en cookie. */
function muidCookie(): string {
  return `muid=${randomBytes(16).toString("hex").toUpperCase()};`;
}

// ─── Liste des voix ──────────────────────────────────────────────

export interface EdgeVoiceEntry {
  shortName: string;
  gender?: "female" | "male";
  locale: string;
  friendlyName: string;
}

export async function fetchEdgeVoices(): Promise<EdgeVoiceEntry[]> {
  let response: Response;
  try {
    response = await fetch(`${VOICES_URL}&Sec-MS-GEC=${currentGec()}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Cookie: muidCookie(),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EdgeAccessError("liste des voix injoignable");
  }
  adjustClock(response.headers.get("date"));
  if (!response.ok) throw new EdgeAccessError(`liste des voix, erreur ${response.status}`);
  const data = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) throw new EdgeAccessError("liste des voix illisible");
  return data.flatMap((raw): EdgeVoiceEntry[] => {
    const entry = raw as Record<string, unknown>;
    const shortName = String(entry?.ShortName ?? "");
    const locale = String(entry?.Locale ?? "");
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]+){1,4}$/.test(shortName) || !locale) return [];
    return [
      {
        shortName,
        locale,
        gender: entry.Gender === "Female" ? "female" : entry.Gender === "Male" ? "male" : undefined,
        friendlyName: String(entry.FriendlyName ?? shortName).slice(0, 120),
      },
    ];
  });
}

// ─── Messages ────────────────────────────────────────────────────

/** Date au format qu’attend le service (celui de `Date.toString()` en UTC). */
export function edgeTimestamp(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

export function configMessage(timestamp: string): string {
  const config = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "true" },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        },
      },
    },
  };
  return `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}\r\n`;
}

/** Caractères que le service refuse (contrôles), remplacés par des espaces. */
export function stripControls(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
}

/** Contenu d'un élément : seuls `&`, `<` et `>` sont échappés (chaque entité compte chez Azure). */
export function escapeXmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Valeur d'un attribut : les guillemets aussi. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function unescapeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Débit en pourcentage signé, comme l’attend l’attribut `rate` de SSML. */
export function prosodyRate(speed: number): string {
  const percent = Math.round((speed - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function edgeSsml(voice: string, text: string, speed: number): string {
  const lang = /^([a-z]{2,3}-[A-Z]{2})/.exec(voice)?.[1] ?? "fr-FR";
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${escapeXml(voice)}'><prosody pitch='+0Hz' rate='${prosodyRate(speed)}' volume='+0%'>` +
    `${escapeXmlText(stripControls(text))}</prosody></voice></speak>`
  );
}

export function ssmlMessage(requestId: string, timestamp: string, ssml: string): string {
  // Le « Z » collé à la date reprend ce qu’envoie Edge.
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`;
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.split("\r\n")) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return headers;
}

/** Message texte : en-têtes, ligne vide, corps. */
export function parseTextMessage(data: string): { path: string; body: string } {
  const split = data.indexOf("\r\n\r\n");
  const headers = parseHeaders(split === -1 ? data : data.slice(0, split));
  return { path: headers.Path ?? "", body: split === -1 ? "" : data.slice(split + 4) };
}

/** Message binaire : longueur de l’en-tête sur deux octets (gros-boutiste), en-tête, puis le son. */
export function parseBinaryMessage(data: Uint8Array): { path: string; contentType?: string; audio: Uint8Array } {
  if (data.length < 2) throw new Error("message binaire tronqué");
  const headerLength = (data[0] << 8) | data[1];
  if (headerLength + 2 > data.length) throw new Error("en-tête binaire plus long que le message");
  const headers = parseHeaders(Buffer.from(data.subarray(2, 2 + headerLength)).toString("utf-8"));
  // Le son commence après l’en-tête et son séparateur de fin de ligne.
  let start = 2 + headerLength;
  if (data[start] === 0x0d && data[start + 1] === 0x0a) start += 2;
  return { path: headers.Path ?? "", contentType: headers["Content-Type"], audio: data.subarray(start) };
}

export interface EdgeBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

/** Instants des mots d’un message `audio.metadata`, décalés de `offsetMs`. */
export function parseWordBoundaries(body: string, offsetMs = 0): EdgeBoundary[] {
  let parsed: { Metadata?: { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } }[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  return (parsed.Metadata ?? []).flatMap((entry) => {
    if (entry.Type !== "WordBoundary" || !entry.Data) return [];
    const text = unescapeXml(String(entry.Data.text?.Text ?? "")).trim();
    const offset = Number(entry.Data.Offset);
    const duration = Number(entry.Data.Duration);
    if (!text || !Number.isFinite(offset) || !Number.isFinite(duration)) return [];
    return [{ text, offsetMs: offsetMs + offset / TICKS_PER_MS, durationMs: duration / TICKS_PER_MS }];
  });
}

// ─── Mots du texte ───────────────────────────────────────────────

function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Mots horodatés à partir des instants d’Edge, avec la ponctuation du texte
 * d’origine : Edge renvoie les mots nus (« tous » pour « tous, »), les
 * sous-titres gardent la virgule. Un mot qu’Edge n’a pas signalé prend le
 * temps entre ses voisins ; une ponctuation isolée rejoint le mot d’avant.
 */
export function wordsFromBoundaries(text: string, boundaries: EdgeBoundary[]): TimedWord[] {
  const raw = () =>
    boundaries.map((entry) => ({ text: entry.text, startMs: Math.round(entry.offsetMs), endMs: Math.round(entry.offsetMs + entry.durationMs) }));
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || boundaries.length === 0) return raw();

  const keys = tokens.map(normalizeWord);
  const spans: { start?: number; end?: number; used: number }[] = tokens.map(() => ({ used: 0 }));
  let cursor = 0;
  let matched = 0;
  for (const boundary of boundaries) {
    const key = normalizeWord(boundary.text);
    if (!key) continue;
    let found = -1;
    for (let index = cursor; index < Math.min(tokens.length, cursor + 6); index++) {
      if (keys[index] && (keys[index].includes(key) || key.includes(keys[index]))) {
        found = index;
        break;
      }
    }
    if (found === -1) continue;
    const span = spans[found];
    span.start ??= boundary.offsetMs;
    span.end = boundary.offsetMs + boundary.durationMs;
    span.used += key.length;
    matched++;
    cursor = span.used >= keys[found].length ? found + 1 : found;
  }
  // Correspondance trop faible (texte réécrit par le service) : les mots d’Edge tels quels.
  if (matched < boundaries.length / 2) return raw();

  const words: TimedWord[] = [];
  let pendingPrefix = "";
  tokens.forEach((token, index) => {
    const span = spans[index];
    if (span.start !== undefined && span.end !== undefined) {
      words.push({ text: pendingPrefix + token, startMs: Math.round(span.start), endMs: Math.round(span.end) });
      pendingPrefix = "";
      return;
    }
    if (!keys[index]) {
      // Ponctuation seule : collée au mot d’avant, ou au suivant en tête de texte.
      if (words.length) words[words.length - 1].text += ` ${token}`;
      else pendingPrefix += `${token} `;
      return;
    }
    // Mot non signalé : entre la fin du mot d’avant et le début du suivant.
    const previousEnd = words.length ? words[words.length - 1].endMs : 0;
    const next = spans.slice(index + 1).find((entry) => entry.start !== undefined);
    const nextStart = next?.start !== undefined ? Math.round(next.start) : previousEnd + 300;
    words.push({ text: pendingPrefix + token, startMs: previousEnd, endMs: Math.max(previousEnd, nextStart) });
    pendingPrefix = "";
  });
  return words;
}

/** Découpe un texte en morceaux dont le SSML échappé reste sous la limite du service. */
export function splitForEdge(text: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && Buffer.byteLength(escapeXmlText(candidate), "utf-8") > maxBytes) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ─── Synthèse ────────────────────────────────────────────────────

/** Ce que Clip Studio attend d’un WebSocket : le standard, plus des en-têtes à l’ouverture. */
export interface SocketLike {
  binaryType: string;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike;

/**
 * Bun et Node (undici) acceptent des en-têtes en second argument du
 * constructeur ; le service refuse une connexion sans `Origin` d’Edge.
 */
const defaultSocket: SocketFactory = (url, headers) => {
  const Constructor = (globalThis as unknown as { WebSocket?: new (url: string, init: unknown) => SocketLike }).WebSocket;
  if (!Constructor) throw new EdgeAccessError("WebSocket indisponible sur ce serveur");
  return new Constructor(url, { headers });
};

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

class HandshakeError extends Error {}

/** Un tour de synthèse sur une connexion : le son MP3 et les instants des mots. */
function synthesizeChunk(
  endpoint: string,
  voice: string,
  text: string,
  speed: number,
  offsetMs: number,
  socketFactory: SocketFactory
): Promise<{ audio: Buffer; boundaries: EdgeBoundary[] }> {
  return new Promise((resolve, reject) => {
    const url = `${endpoint}&ConnectionId=${randomUUID().replace(/-/g, "")}&Sec-MS-GEC=${currentGec()}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}`;
    let socket: SocketLike;
    try {
      socket = socketFactory(url, {
        "User-Agent": USER_AGENT,
        Origin: ORIGIN,
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Cookie: muidCookie(),
      });
    } catch (error) {
      reject(error);
      return;
    }
    socket.binaryType = "arraybuffer";
    const parts: Uint8Array[] = [];
    const boundaries: EdgeBoundary[] = [];
    let opened = false;
    let settled = false;
    let size = 0;

    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(turnTimer);
      try {
        socket.close();
      } catch {
        // Déjà fermée.
      }
      if (error) reject(error);
      else resolve({ audio: Buffer.concat(parts), boundaries });
    };
    const connectTimer = setTimeout(() => finish(new HandshakeError("connexion trop lente")), CONNECT_TIMEOUT_MS);
    const turnTimer = setTimeout(() => finish(new EdgeAccessError("aucune réponse complète en 45 s")), TURN_TIMEOUT_MS);

    socket.onopen = () => {
      opened = true;
      clearTimeout(connectTimer);
      const timestamp = edgeTimestamp(new Date());
      socket.send(configMessage(timestamp));
      socket.send(ssmlMessage(randomUUID().replace(/-/g, ""), timestamp, edgeSsml(voice, text, speed)));
    };
    socket.onmessage = (event) => {
      try {
        if (typeof event.data === "string") {
          const message = parseTextMessage(event.data);
          if (message.path === "audio.metadata") boundaries.push(...parseWordBoundaries(message.body, offsetMs));
          else if (message.path === "turn.end") {
            if (size === 0) finish(new Error("Edge n’a renvoyé aucun son pour cette voix."));
            else finish(null);
          }
          return;
        }
        const bytes = toBytes(event.data);
        if (!bytes) return;
        const message = parseBinaryMessage(bytes);
        if (message.path !== "audio" || message.audio.length === 0) return;
        size += message.audio.length;
        if (size > MAX_AUDIO_BYTES) {
          finish(new Error("Edge a renvoyé un son trop volumineux."));
          return;
        }
        parts.push(Buffer.from(message.audio));
      } catch (error) {
        finish(new EdgeAccessError(error instanceof Error ? error.message : "réponse illisible"));
      }
    };
    socket.onerror = () => {
      finish(opened ? new EdgeAccessError("connexion interrompue") : new HandshakeError("connexion refusée"));
    };
    socket.onclose = (event) => {
      if (!settled) finish(opened ? new EdgeAccessError(`connexion fermée (${event?.code ?? "?"})`) : new HandshakeError("connexion refusée"));
    };
  });
}

/** Essaie chaque hôte une fois ; un refus d’ouverture passe au suivant, rien d’autre. */
async function synthesizeOnAnyEndpoint(
  voice: string,
  text: string,
  speed: number,
  offsetMs: number,
  socketFactory: SocketFactory
): Promise<{ audio: Buffer; boundaries: EdgeBoundary[] }> {
  for (const endpoint of SYNTHESIS_ENDPOINTS) {
    try {
      return await synthesizeChunk(endpoint, voice, text, speed, offsetMs, socketFactory);
    } catch (error) {
      if (!(error instanceof HandshakeError)) throw error;
    }
  }
  throw new HandshakeError("connexion refusée par tous les hôtes");
}

export interface EdgeSynthesis {
  audio: Buffer;
  words: TimedWord[];
  /** Essais faits pour le morceau le plus difficile (1 sans nouvel essai). */
  attempts: number;
}

/**
 * Un morceau, avec ses nouveaux essais. Un refus d’ouverture peut venir d’une
 * horloge décalée (corrigée une fois d’après l’heure de Microsoft) ou d’un
 * refus passager ; une connexion coupée en route se retente aussi. Au bout
 * des essais : `EdgeUnavailableError`.
 */
async function synthesizeChunkWithRetries(
  voice: string,
  text: string,
  speed: number,
  offsetMs: number,
  socketFactory: SocketFactory,
  onAttempt: (count: number) => void,
  delays: number[] = EDGE_RETRY_DELAYS_MS
): Promise<{ audio: Buffer; boundaries: EdgeBoundary[] }> {
  let clockChecked = false;
  let lastProblem = "connexion refusée";
  for (let attempt = 1; ; attempt++) {
    onAttempt(attempt);
    try {
      return await synthesizeOnAnyEndpoint(voice, text, speed, offsetMs, socketFactory);
    } catch (error) {
      const passing = error instanceof HandshakeError || (error instanceof EdgeAccessError && /connexion (interrompue|fermée)/.test(error.message));
      if (!passing) throw error;
      lastProblem = error instanceof HandshakeError ? error.message : "connexion coupée";
      if (error instanceof HandshakeError && !clockChecked) {
        clockChecked = true;
        await fetch(VOICES_URL, { method: "HEAD", signal: AbortSignal.timeout(8_000) })
          .then((response) => adjustClock(response.headers.get("date")))
          .catch(() => 0);
      }
      const delay = delays[attempt - 1];
      if (delay === undefined) throw new EdgeUnavailableError(attempt, lastProblem);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Lit un texte avec une voix d’Edge. Le texte est découpé si son SSML
 * dépasse la limite du service ; les instants des morceaux suivants sont
 * décalés de la durée du son déjà reçu (MP3 à débit constant).
 */
export async function synthesizeEdge(
  voice: string,
  text: string,
  speed: number,
  options: { socketFactory?: SocketFactory; delays?: number[] } = {}
): Promise<EdgeSynthesis> {
  const socketFactory = options.socketFactory ?? defaultSocket;
  const parts: Buffer[] = [];
  const boundaries: EdgeBoundary[] = [];
  let bytes = 0;
  let attempts = 1;
  for (const chunk of splitForEdge(text)) {
    const offsetMs = (bytes * 8 * 1000) / MP3_BITRATE;
    const result = await withEdgeSlot(() => synthesizeChunkWithRetries(voice, chunk, speed, offsetMs, socketFactory, (count) => (attempts = Math.max(attempts, count)), options.delays));
    parts.push(result.audio);
    boundaries.push(...result.boundaries);
    bytes += result.audio.length;
  }
  return { audio: Buffer.concat(parts), words: wordsFromBoundaries(text, boundaries), attempts };
}
