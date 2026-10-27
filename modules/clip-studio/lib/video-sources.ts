/**
 * Réglages des sources vidéo (réservés aux administrateurs) : les cookies
 * YouTube d'un compte dédié, et les clés des API Pexels et Pixabay.
 *
 * Rangés à part de `secrets.json` (voix en ligne), qui ne garde que les
 * champs qu'il connaît et effacerait les autres à sa prochaine écriture :
 *
 * - `data/youtube-cookies.txt` : le fichier de cookies, au format Netscape ;
 * - `data/video-sources.json` : les clés Pexels et Pixabay et la date des cookies.
 *
 * Les deux fichiers sont en droits 600, ne sont jamais servis par la route
 * des données (ni `.txt` ni `.json`) et ne repartent jamais vers le
 * navigateur : seul l'état (« configuré », date, fin de la clé) en sort. La
 * clé Pexels peut aussi venir de la variable `PEXELS_API_KEY`, celle de
 * Pixabay de `PIXABAY_API_KEY`.
 *
 * `video-sources.json` est chiffré (`lib/security/secret-file.ts`) ; le
 * fichier de cookies reste en clair, en 600 : yt-dlp doit pouvoir le lire.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { DATA_DIR, ensureDirs } from "./store";
import { readSecretJson, writeSecretJson } from "@/lib/security/secret-file";

const COOKIES_FILE = path.join(DATA_DIR, "youtube-cookies.txt");
const SETTINGS_FILE = path.join(DATA_DIR, "video-sources.json");
/** Lie le chiffré de `video-sources.json` à ce module. */
const SETTINGS_CONTEXT = "module:clip-studio:video-sources";
const PEXELS_ENV = "PEXELS_API_KEY";
const PIXABAY_ENV = "PIXABAY_API_KEY";
/** Un export de cookies de navigateur tient en quelques dizaines de kilo-octets. */
const MAX_COOKIES_BYTES = 512 * 1024;

interface Settings {
  pexelsKey?: string;
  pixabayKey?: string;
  /** Date d'enregistrement des cookies YouTube. */
  cookiesSavedAt?: number;
  /** Dernier refus de YouTube malgré les cookies : ils sont à renouveler. */
  cookiesRejectedAt?: number;
}

function readSettings(): Settings {
  try {
    const raw = readSecretJson<{ pexelsKey?: unknown; pixabayKey?: unknown; cookiesSavedAt?: number; cookiesRejectedAt?: number } | null>(
      SETTINGS_FILE,
      SETTINGS_CONTEXT,
      null
    );
    return {
      ...(typeof raw?.pexelsKey === "string" && raw.pexelsKey ? { pexelsKey: raw.pexelsKey } : {}),
      ...(typeof raw?.pixabayKey === "string" && raw.pixabayKey ? { pixabayKey: raw.pixabayKey } : {}),
      ...(Number.isFinite(raw?.cookiesSavedAt) ? { cookiesSavedAt: raw?.cookiesSavedAt } : {}),
      ...(Number.isFinite(raw?.cookiesRejectedAt) ? { cookiesRejectedAt: raw?.cookiesRejectedAt } : {}),
    };
  } catch {
    return {};
  }
}

/** Écriture atomique en droits 600 (le renommage garde les droits du fichier temporaire). */
function writePrivate(file: string, content: string) {
  ensureDirs();
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function writeSettings(settings: Settings) {
  ensureDirs();
  writeSecretJson(SETTINGS_FILE, SETTINGS_CONTEXT, settings);
}

// ─── Cookies YouTube ─────────────────────────────────────────────

/**
 * Contrôle un export de cookies au format Netscape : lignes de sept champs
 * séparés par des tabulations. Seuls les cookies de youtube.com (et de ses
 * sous-domaines) sont gardés : un export de tout le navigateur ne laisse pas
 * sur le serveur les sessions d’autres sites, que yt-dlp n’a pas à voir.
 * Renvoie le texte normalisé (fins de ligne Unix, ligne d’en-tête).
 */
/** Domaine d’un cookie de YouTube : `youtube.com`, `.youtube.com`, `www.youtube.com`… */
const YOUTUBE_COOKIE_DOMAIN = /(^|\.)youtube\.com$/;

export function normalizeCookies(input: unknown): string {
  if (typeof input !== "string") throw new Error("Fichier de cookies invalide.");
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Le fichier de cookies est vide.");
  if (Buffer.byteLength(text) > MAX_COOKIES_BYTES) throw new Error("Fichier de cookies trop lourd (512 Kio au plus).");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("Ce fichier n’est pas un export de cookies en texte.");

  const kept: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line) continue;
    // `#HttpOnly_` précède les cookies HttpOnly : ce n'est pas un commentaire.
    const body = line.startsWith("#HttpOnly_") ? line.slice("#HttpOnly_".length) : line;
    if (line.startsWith("#") && body === line) continue;
    const fields = body.split("\t");
    if (fields.length !== 7) {
      throw new Error("Format non reconnu : exportez les cookies au format Netscape (cookies.txt), avec une extension comme « Get cookies.txt LOCALLY ».");
    }
    const domain = fields[0].toLowerCase();
    // Les autres domaines sont écartés sans bruit.
    if (YOUTUBE_COOKIE_DOMAIN.test(domain)) kept.push(line);
  }
  if (kept.length === 0) throw new Error("Aucun cookie de youtube.com dans ce fichier : exportez-le depuis un onglet YouTube connecté au compte dédié.");
  return `# Netscape HTTP Cookie File\n${kept.join("\n")}\n`;
}

export function saveYoutubeCookies(input: unknown) {
  const content = normalizeCookies(input);
  writePrivate(COOKIES_FILE, content);
  const { cookiesRejectedAt: _cleared, ...settings } = readSettings();
  writeSettings({ ...settings, cookiesSavedAt: Date.now() });
}

export function clearYoutubeCookies() {
  fs.rmSync(COOKIES_FILE, { force: true });
  const { cookiesSavedAt: _saved, cookiesRejectedAt: _rejected, ...settings } = readSettings();
  writeSettings(settings);
}

export function hasYoutubeCookies(): boolean {
  try {
    return fs.statSync(COOKIES_FILE).size > 0;
  } catch {
    return false;
  }
}

/**
 * Copie des cookies pour un appel de yt-dlp, dans le dossier du travail :
 * yt-dlp réécrit le fichier qu'on lui donne, deux récupérations simultanées
 * ne doivent pas se marcher dessus. La copie part avec le dossier.
 */
export function copyYoutubeCookies(dir: string): string | null {
  if (!hasYoutubeCookies()) return null;
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "cookies.txt");
  fs.copyFileSync(COOKIES_FILE, target);
  fs.chmodSync(target, 0o600);
  return target;
}

/** Date du dernier refus des cookies enregistrés par YouTube ; absente s'ils n'ont pas été refusés depuis leur enregistrement. */
export function youtubeCookiesRejectedAt(): number | undefined {
  return hasYoutubeCookies() ? readSettings().cookiesRejectedAt : undefined;
}

/** YouTube a refusé le serveur malgré les cookies : l'écran des réglages le dira. */
export function markCookiesRejected() {
  writeSettings({ ...readSettings(), cookiesRejectedAt: Date.now() });
}

// ─── Clé Pexels ──────────────────────────────────────────────────

export function pexelsApiKey(): string {
  return process.env[PEXELS_ENV] || readSettings().pexelsKey || "";
}

/** Enregistre la clé Pexels ; une chaîne vide l'efface. */
export function savePexelsKey(input: unknown) {
  if (typeof input !== "string") throw new Error("Clé invalide.");
  const key = input.trim();
  if (key && !/^[\x21-\x7e]{8,200}$/.test(key)) throw new Error("Cette clé ne ressemble pas à une clé Pexels : copiez-la depuis pexels.com/api.");
  const { pexelsKey: _previous, ...settings } = readSettings();
  writeSettings(key ? { ...settings, pexelsKey: key } : settings);
}

// ─── Clé Pixabay ─────────────────────────────────────────────────

export function pixabayApiKey(): string {
  return process.env[PIXABAY_ENV] || readSettings().pixabayKey || "";
}

/** Enregistre la clé Pixabay ; une chaîne vide l'efface. */
export function savePixabayKey(input: unknown) {
  if (typeof input !== "string") throw new Error("Clé invalide.");
  const key = input.trim();
  // Une clé Pixabay ressemble à « 12345678-0123456789abcdef0123456 ».
  if (key && !/^[\x21-\x7e]{8,200}$/.test(key)) throw new Error("Cette clé ne ressemble pas à une clé Pixabay : copiez-la depuis pixabay.com/api/docs.");
  const { pixabayKey: _previous, ...settings } = readSettings();
  writeSettings(key ? { ...settings, pixabayKey: key } : settings);
}

// ─── État pour l'écran des réglages ──────────────────────────────

export interface VideoSourcesStatus {
  youtubeCookies: { configured: boolean; savedAt?: number; rejectedAt?: number };
  pexels: ApiKeyStatus;
  pixabay: ApiKeyStatus;
}

/** État d'une clé d'API : jamais la clé elle-même, seulement ses quatre derniers caractères. */
export interface ApiKeyStatus {
  configured: boolean;
  fromEnv: boolean;
  hint: string;
  envVariable: string;
  site: string;
}

function keyStatus(key: string, envVariable: string, site: string): ApiKeyStatus {
  return { configured: Boolean(key), fromEnv: Boolean(process.env[envVariable]), hint: key ? `••••••••${key.slice(-4)}` : "", envVariable, site };
}

export function videoSourcesStatus(): VideoSourcesStatus {
  const settings = readSettings();
  const key = pexelsApiKey();
  const configured = hasYoutubeCookies();
  return {
    youtubeCookies: {
      configured,
      ...(configured && settings.cookiesSavedAt ? { savedAt: settings.cookiesSavedAt } : {}),
      ...(configured && settings.cookiesRejectedAt ? { rejectedAt: settings.cookiesRejectedAt } : {}),
    },
    pexels: keyStatus(key, PEXELS_ENV, "https://www.pexels.com/api/"),
    pixabay: keyStatus(pixabayApiKey(), PIXABAY_ENV, "https://pixabay.com/api/docs/"),
  };
}
