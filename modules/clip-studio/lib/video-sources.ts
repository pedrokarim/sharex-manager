/**
 * Réglages des sources vidéo (réservés aux administrateurs) : les cookies
 * YouTube d'un compte dédié, et la clé de l'API Pexels.
 *
 * Rangés à part de `secrets.json` (voix en ligne), qui ne garde que les
 * champs qu'il connaît et effacerait les autres à sa prochaine écriture :
 *
 * - `data/youtube-cookies.txt` : le fichier de cookies, au format Netscape ;
 * - `data/video-sources.json` : la clé Pexels et la date des cookies.
 *
 * Les deux fichiers sont en droits 600, ne sont jamais servis par la route
 * des données (ni `.txt` ni `.json`) et ne repartent jamais vers le
 * navigateur : seul l'état (« configuré », date, fin de la clé) en sort. La
 * clé Pexels peut aussi venir de la variable `PEXELS_API_KEY`.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { DATA_DIR, ensureDirs } from "./store";

const COOKIES_FILE = path.join(DATA_DIR, "youtube-cookies.txt");
const SETTINGS_FILE = path.join(DATA_DIR, "video-sources.json");
const PEXELS_ENV = "PEXELS_API_KEY";
/** Un export de cookies de navigateur tient en quelques dizaines de kilo-octets. */
const MAX_COOKIES_BYTES = 512 * 1024;

interface Settings {
  pexelsKey?: string;
  /** Date d'enregistrement des cookies YouTube. */
  cookiesSavedAt?: number;
  /** Dernier refus de YouTube malgré les cookies : ils sont à renouveler. */
  cookiesRejectedAt?: number;
}

function readSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    return {
      ...(typeof raw?.pexelsKey === "string" && raw.pexelsKey ? { pexelsKey: raw.pexelsKey } : {}),
      ...(Number.isFinite(raw?.cookiesSavedAt) ? { cookiesSavedAt: raw.cookiesSavedAt } : {}),
      ...(Number.isFinite(raw?.cookiesRejectedAt) ? { cookiesRejectedAt: raw.cookiesRejectedAt } : {}),
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
  writePrivate(SETTINGS_FILE, JSON.stringify(settings, null, 2));
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

/** YouTube a refusé le serveur malgré les cookies : l'écran des réglages le dira. */
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

// ─── État pour l'écran des réglages ──────────────────────────────

export interface VideoSourcesStatus {
  youtubeCookies: { configured: boolean; savedAt?: number; rejectedAt?: number };
  pexels: { configured: boolean; fromEnv: boolean; hint: string; envVariable: string; site: string };
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
    pexels: {
      configured: Boolean(key),
      fromEnv: Boolean(process.env[PEXELS_ENV]),
      hint: key ? `••••••••${key.slice(-4)}` : "",
      envVariable: PEXELS_ENV,
      site: "https://www.pexels.com/api/",
    },
  };
}
