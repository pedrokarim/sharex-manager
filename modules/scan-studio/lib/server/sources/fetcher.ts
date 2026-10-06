/**
 * Le client poli, commun à tous les adaptateurs : aucune requête vers un site
 * de lecture ne part d'ailleurs.
 *
 * Ce qu'il garantit :
 *
 * - **adresses publiques seulement.** La protection est celle de
 *   `src/lib/remote-image.ts` (`isPrivateAddress`) : une adresse littérale
 *   interne est refusée, et le nom est résolu dans la connexion elle-même,
 *   toutes ses adresses devant être publiques ;
 * - **domaines déclarés seulement** : ceux de l'adaptateur, plus ceux que
 *   l'API du site a donnés pour le chapitre en cours (`allowHost`). Une
 *   redirection est suivie à la main et revérifiée à chaque saut ; si elle
 *   mène à un domaine non déclaré, la requête s'arrête en `adapter-outdated` ;
 * - **aucun compte** : ni cookie, ni jeton, ni en-tête d'autorisation. Les
 *   seuls en-têtes envoyés sont `User-Agent`, `Accept` et, pour un envoi JSON,
 *   `Content-Type` ;
 * - **une requête à la fois**, tous domaines confondus, avec un délai minimal
 *   entre deux requêtes vers le même domaine ;
 * - **le site décide de l'attente** : `Retry-After` est respecté ; au-delà
 *   d'une minute on n'attend pas, on s'arrête et le domaine est laissé
 *   tranquille jusque-là ;
 * - **tentatives comptées**, avec une attente qui double, puis l'arrêt : trois
 *   requêtes perdues de suite mettent le domaine de côté cinq minutes. Rien ne
 *   boucle ;
 * - durée, poids et type de chaque réponse bornés.
 *
 * Le transport (la requête elle-même) et l'horloge sont remplaçables : les
 * tests en donnent de faux et n'ouvrent aucune connexion.
 */

import { lookup as dnsLookup } from "dns";
import http from "http";
import https from "https";
import { isIP, type LookupFunction } from "net";
import { isPrivateAddress } from "@/lib/remote-image";
import { SITE_LINKS } from "@/config/links";
import { AbortedError, SourceError } from "./adapter";
import { isChallengeResponse } from "./html";

// ─── Réglages ────────────────────────────────────────────────────

export const POLITENESS = {
  /** Délai minimal entre la fin d'une requête et le début de la suivante, par domaine. */
  minDelayMs: 1000,
  /** Au-delà, une requête est abandonnée. */
  requestTimeoutMs: 30_000,
  /** Nouvelles tentatives après un « trop de requêtes », une panne ou un délai dépassé. */
  retries: 2,
  /** Attente avant la première nouvelle tentative ; elle double ensuite. */
  backoffMs: 2000,
  /** Un site qui demande d'attendre plus longtemps n'est pas attendu. */
  maxRetryAfterMs: 60_000,
  /** Requêtes perdues de suite avant de mettre le domaine de côté. */
  breakerThreshold: 3,
  breakerPauseMs: 5 * 60_000,
  maxRedirects: 3,
} as const;

export type ResponseKind = "json" | "image" | "html" | "any";

/** Poids maximal d'une réponse, par type. Une page ne dépasse pas ce qu'accepte l'envoi du module (40 Mo). */
const MAX_BYTES: Record<ResponseKind, number> = {
  json: 2 * 1024 * 1024,
  html: 1024 * 1024,
  image: 40 * 1024 * 1024,
  any: 64 * 1024,
};

const ACCEPT: Record<ResponseKind, string> = {
  json: "application/json",
  html: "text/html,application/xhtml+xml",
  image: "image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8",
  any: "*/*",
};

/**
 * Qui nous sommes, dit clairement : le nom de l'application, celui du module
 * et l'adresse du projet. Jamais l'agent d'un navigateur.
 */
export const USER_AGENT = `ShareX-Manager/ScanStudio (import de chapitre pour usage personnel; +${SITE_LINKS.repository})`;

// ─── Horloge ─────────────────────────────────────────────────────

export interface Clock {
  now(): number;
  /** Attend, ou lève `AbortedError` si le signal tombe avant. */
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new AbortedError());
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortedError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
};

// ─── Transport ───────────────────────────────────────────────────

export interface TransportRequest {
  url: URL;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
}

export interface TransportResponse {
  status: number;
  /** Noms en minuscules. */
  headers: Record<string, string>;
  body: Buffer;
}

/** Une seule requête, sans redirection suivie. */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

/** Refus définitif du transport : réessayer ne changerait rien. */
export class TransportRefusal extends Error {}

type Resolver = (hostname: string, options: { all: true }, callback: (error: Error | null, addresses: { address: string; family: number }[]) => void) => void;

/**
 * Résolution DNS de la connexion : toutes les adresses du nom doivent être
 * publiques, et c'est l'une d'elles qui sert à se connecter. Vérifier d'abord
 * puis laisser la connexion résoudre de nouveau laisserait un nom répondre une
 * adresse publique, puis une adresse interne.
 */
export function createSafeLookup(resolver: Resolver = dnsLookup as unknown as Resolver): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { all: true }, (error, addresses) => {
      if (error) return callback(new Error("Nom de domaine introuvable."), "", 4);
      if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new TransportRefusal("Ce domaine mène à une adresse interne : refusé."), "", 4);
      }
      if ((options as { all?: boolean }).all) {
        return (callback as unknown as (failure: null, list: typeof addresses) => void)(null, addresses);
      }
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const safeLookup = createSafeLookup();

/** Le vrai transport : `http`/`https` de Node, résolution vérifiée, poids et durée bornés. */
export const nodeTransport: Transport = (request) =>
  new Promise((resolve, reject) => {
    if (request.signal?.aborted) return reject(new AbortedError());
    const client = request.url.protocol === "https:" ? https : http;
    const headers: Record<string, string | number> = { ...request.headers };
    if (request.body) headers["content-length"] = request.body.length;

    let settled = false;
    const finish = (error: Error | null, response?: TransportResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      request.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(response!);
    };

    const req = client.request(request.url, { method: request.method, headers, lookup: safeLookup, timeout: request.timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > request.maxBytes) {
          res.destroy();
          finish(new TransportRefusal("Réponse trop lourde."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const flat: Record<string, string> = {};
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) flat[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
        }
        finish(null, { status: res.statusCode ?? 0, headers: flat, body: Buffer.concat(chunks) });
      });
      res.on("error", (error) => finish(error));
    });

    // Délai total, corps compris : `timeout` ne compte que l'inactivité de la connexion.
    const deadline = setTimeout(() => req.destroy(new Error("Le site met trop de temps à répondre.")), request.timeoutMs);
    const onAbort = () => {
      req.destroy();
      finish(new AbortedError());
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });
    req.on("timeout", () => req.destroy(new Error("Le site met trop de temps à répondre.")));
    req.on("error", (error) => finish(error));
    req.end(request.body);
  });

// ─── Client ──────────────────────────────────────────────────────

export interface FetchOptions {
  /** Ce qu'on attend : décide de l'en-tête `Accept`, du poids maximal et du type contrôlé. */
  kind: ResponseKind;
  /** Corps JSON : la requête part en POST. */
  json?: unknown;
  maxBytes?: number;
  /** Nouvelles tentatives permises ; jamais plus que `POLITENESS.retries`. */
  retries?: number;
  signal?: AbortSignal;
}

export interface PoliteResponse {
  /** Adresse finale, redirections suivies. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  /** Durée de la requête, en millisecondes. */
  durationMs: number;
}

interface HostState {
  lastRequestAt?: number;
  /** Requêtes perdues de suite. */
  failures: number;
  /** Fin de la mise à l'écart ; 0 : le domaine n'est pas à l'écart. */
  pausedUntil: number;
  pauseKind: "rate-limited" | "site-error";
}

export interface FetcherOptions {
  /** Domaines déclarés par l'adaptateur. */
  hosts: string[];
  minDelayMs?: number;
  transport?: Transport;
  clock?: Clock;
}

const timeOf = (timestamp: number) => new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/\.$/, "");

/**
 * Un domaine déclaré couvre-t-il ce domaine ? Un nom s'entend au mot près.
 * `*.exemple.org` couvre tout sous-domaine de `exemple.org` (pour un site dont
 * le préfixe change avec le temps), jamais le domaine nu ni un domaine qui
 * finit seulement pareil.
 */
export function hostMatches(declared: string, host: string): boolean {
  const pattern = normalizeHost(declared);
  const name = normalizeHost(host);
  if (!pattern.startsWith("*.")) return pattern === name;
  const suffix = pattern.slice(1);
  return suffix.length > 2 && name.length > suffix.length && name.endsWith(suffix) && !name.includes("*");
}

/**
 * Attente demandée par le site, en millisecondes. `Retry-After` vaut des
 * secondes ou une date ; `X-RateLimit-Retry-After`, que certaines API donnent
 * à la place, est une date en secondes UNIX.
 */
export function retryAfterMs(headers: Record<string, string>, now: number): number | undefined {
  const standard = headers["retry-after"]?.trim();
  if (standard) {
    if (/^\d+$/.test(standard)) return Number(standard) * 1000;
    const date = Date.parse(standard);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const stamp = headers["x-ratelimit-retry-after"]?.trim();
  if (stamp && /^\d+$/.test(stamp)) return Math.max(0, Number(stamp) * 1000 - now);
  return undefined;
}

export class PoliteFetcher {
  private readonly hosts: Set<string>;
  private readonly minDelayMs: number;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly states = new Map<string, HostState>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: FetcherOptions) {
    this.hosts = new Set(options.hosts.map(normalizeHost));
    // Un adaptateur peut demander plus lent, jamais plus rapide.
    this.minDelayMs = Math.max(POLITENESS.minDelayMs, options.minDelayMs ?? 0);
    this.transport = options.transport ?? nodeTransport;
    this.clock = options.clock ?? systemClock;
  }

  /**
   * Autorise un domaine que l'API du site vient de donner pour un chapitre
   * (un serveur d'images, par exemple). Il reste soumis à tout le reste :
   * adresse publique, délais, bornes.
   */
  allowHost(host: string) {
    const normalized = normalizeHost(host);
    // Un domaine confié en route est toujours un nom précis, jamais une famille.
    if (normalized && !normalized.includes("*")) this.hosts.add(normalized);
  }

  isAllowed(host: string): boolean {
    const normalized = normalizeHost(host);
    if (this.hosts.has(normalized)) return true;
    for (const declared of this.hosts) {
      if (declared.startsWith("*.") && hostMatches(declared, normalized)) return true;
    }
    return false;
  }

  private state(host: string): HostState {
    let state = this.states.get(host);
    if (!state) {
      state = { failures: 0, pausedUntil: 0, pauseKind: "site-error" };
      this.states.set(host, state);
    }
    return state;
  }

  /** Refuse ce qui n'est pas une adresse http(s) publique d'un domaine autorisé. */
  private check(url: URL, redirectedFrom?: string): string {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new SourceError("site-error", "Seules les adresses http et https sont appelées.");
    }
    if (url.username || url.password) throw new SourceError("site-error", "Une adresse avec identifiants n’est jamais appelée.");
    const host = normalizeHost(url.hostname.replace(/^\[|\]$/g, ""));
    if (!this.isAllowed(host)) {
      // Une redirection vers un domaine inconnu dit que le site a changé : on ne l'élargit pas en silence.
      if (redirectedFrom) {
        throw new SourceError(
          "adapter-outdated",
          `${redirectedFrom} renvoie vers « ${host} », un domaine que cet adaptateur n’a pas déclaré : il n’est pas appelé. L’adaptateur est à revoir avant de réessayer.`
        );
      }
      throw new SourceError("site-error", `Le domaine « ${host} » ne fait pas partie de ceux que cet adaptateur a déclarés : il n’est pas appelé.`);
    }
    if (isIP(host) && isPrivateAddress(host)) throw new SourceError("site-error", "Cette adresse est interne : refusée.");
    return host;
  }

  /** Une requête à la fois : la suivante attend la fin de la précédente, réussie ou non. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Une requête, précédée du délai minimal de son domaine, redirections suivies et revérifiées. */
  private async send(first: URL, options: FetchOptions, signal: AbortSignal | undefined): Promise<PoliteResponse> {
    const body = options.json === undefined ? undefined : Buffer.from(JSON.stringify(options.json));
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: ACCEPT[options.kind] };
    if (body) headers["content-type"] = "application/json";

    let url = first;
    for (let hop = 0; hop <= POLITENESS.maxRedirects; hop++) {
      const host = this.check(url, hop > 0 ? first.hostname : undefined);
      const state = this.state(host);
      if (state.lastRequestAt !== undefined) {
        const wait = state.lastRequestAt + this.minDelayMs - this.clock.now();
        if (wait > 0) await this.clock.sleep(wait, signal);
      }
      if (signal?.aborted) throw new AbortedError();

      const startedAt = this.clock.now();
      let response: TransportResponse;
      try {
        response = await this.transport({
          url,
          method: body ? "POST" : "GET",
          headers,
          body,
          timeoutMs: POLITENESS.requestTimeoutMs,
          maxBytes: options.maxBytes ?? MAX_BYTES[options.kind],
          signal,
        });
      } finally {
        state.lastRequestAt = this.clock.now();
      }

      const location = response.headers.location;
      if (!body && response.status >= 300 && response.status < 400 && location) {
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new SourceError("site-error", "Redirection vers une adresse illisible.");
        }
        url = next;
        continue;
      }
      return { url: url.toString(), status: response.status, headers: response.headers, body: response.body, durationMs: state.lastRequestAt - startedAt };
    }
    throw new SourceError("site-error", "Trop de redirections.");
  }

  /**
   * Appelle une adresse. Rend la réponse pour tout statut que l'adaptateur
   * doit interpréter lui-même (200, 403, 404…). Lève `rate-limited` ou
   * `site-error` quand le site demande d'attendre, tombe en panne ou ne répond
   * pas, une fois les tentatives permises épuisées.
   */
  request(rawUrl: string | URL, options: FetchOptions): Promise<PoliteResponse> {
    const signal = options.signal;
    const maxRetries = Math.max(0, Math.min(options.retries ?? POLITENESS.retries, POLITENESS.retries));

    return this.enqueue(async () => {
      let url: URL;
      try {
        url = new URL(rawUrl.toString());
      } catch {
        throw new SourceError("site-error", "Adresse illisible.");
      }
      const state = this.state(this.check(url));

      for (let retries = 0; ; retries++) {
        if (signal?.aborted) throw new AbortedError();
        if (state.pausedUntil > this.clock.now()) {
          throw new SourceError(state.pauseKind, `${url.hostname} est laissé tranquille jusqu’à ${timeOf(state.pausedUntil)}. Réessayez après.`, {
            retryAfterMs: state.pausedUntil - this.clock.now(),
          });
        }

        let failure: SourceError;
        try {
          const response = await this.send(url, options, signal);
          const asked = retryAfterMs(response.headers, this.clock.now());
          if (response.status >= 500 && isChallengeResponse(response.status, response.headers, response.body)) {
            // Une vérification du navigateur n'est pas une panne : la retenter serait insister.
            // Elle est rendue telle quelle à l'adaptateur, qui répond `unavailable`.
            return response;
          }
          if (response.status === 429 || (response.status === 503 && asked !== undefined)) {
            failure = new SourceError("rate-limited", `${url.hostname} a répondu « trop de requêtes » (HTTP ${response.status}).`, { retryAfterMs: asked });
          } else if (response.status >= 500) {
            failure = new SourceError("site-error", `${url.hostname} a répondu HTTP ${response.status}.`);
          } else {
            state.failures = 0;
            state.pausedUntil = 0;
            if (response.status >= 200 && response.status < 300) assertContentType(response, options.kind);
            return response;
          }
        } catch (error) {
          // Ni une annulation, ni un refus de principe, ni une réponse d'un autre type ne se retentent.
          if (error instanceof AbortedError || signal?.aborted) throw new AbortedError();
          if (error instanceof SourceError) throw error;
          if (error instanceof TransportRefusal) throw new SourceError("site-error", error.message);
          failure = new SourceError("site-error", `${url.hostname} ne répond pas (${error instanceof Error ? error.message : "connexion impossible"}).`);
        }

        const now = this.clock.now();
        const asked = failure.retryAfterMs ?? 0;
        if (failure.kind === "rate-limited" && asked > POLITENESS.maxRetryAfterMs) {
          // Le site demande une longue attente : on ne l'attend pas, et on ne revient pas avant.
          state.pausedUntil = now + asked;
          state.pauseKind = "rate-limited";
          throw new SourceError("rate-limited", `${url.hostname} demande d’attendre jusqu’à ${timeOf(state.pausedUntil)}.`, { retryAfterMs: asked });
        }
        if (retries >= maxRetries) {
          state.failures++;
          if (state.failures >= POLITENESS.breakerThreshold) {
            state.pausedUntil = now + POLITENESS.breakerPauseMs;
            state.pauseKind = failure.kind === "rate-limited" ? "rate-limited" : "site-error";
          }
          throw failure;
        }
        await this.clock.sleep(Math.max(asked, POLITENESS.backoffMs * 2 ** retries), signal);
      }
    });
  }

  /** Une réponse JSON, lue. Un corps qui n'en est pas lève `site-error`. */
  async json(rawUrl: string | URL, options: Omit<FetchOptions, "kind"> = {}): Promise<{ response: PoliteResponse; data: unknown }> {
    const response = await this.request(rawUrl, { ...options, kind: "json" });
    let data: unknown = null;
    try {
      data = JSON.parse(response.body.toString("utf-8"));
    } catch {
      if (response.status >= 200 && response.status < 300) throw new SourceError("site-error", "Le site a rendu une réponse illisible.");
    }
    return { response, data };
  }
}

function assertContentType(response: PoliteResponse, kind: ResponseKind) {
  if (kind === "any") return;
  const type = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const fits =
    kind === "json" ? type.includes("json") : kind === "html" ? type.includes("html") : type.startsWith("image/") && type !== "image/svg+xml";
  if (!fits) {
    throw new SourceError("site-error", `Le site a rendu « ${type || "un type inconnu"} » au lieu de ${kind === "json" ? "JSON" : kind === "html" ? "HTML" : "une image"}.`);
  }
}
