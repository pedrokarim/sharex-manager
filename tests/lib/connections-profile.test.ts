/**
 * Profil des comptes connectés (dossier 07, § 8.12) contre de faux services :
 * aucun appel réel. Lecture, mise à jour qui renvoie le reste inchangé (titre
 * compris), limites, capacité non autorisée, éléments non modifiables
 * déclarés, sections et playlists, fonctions pures du profil.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { readTransaction, startAuthorization } from "@/lib/connections/oauth";
import { completeConnection, getAccountSummary } from "@/lib/connections/accounts";
import {
  addAccountSection,
  moveAccountSection,
  readAccountProfile,
  updateAccountPlaylist,
  updateAccountProfile,
} from "@/lib/connections/manage";
import { getQuotaUsage } from "@/lib/connections/quota";
import { describeConnector, getConnector } from "@/lib/connections/registry";
import {
  brandCopyText,
  brandProfileValue,
  cleanProfileValue,
  fitKeywords,
  formatKeywords,
  keywordsLength,
  listDiff,
  parseKeywords,
  resolveManualUrl,
  sameProfileValue,
  wordDiff,
  type ProfileBrandInput,
} from "@/lib/connections/profile";
import { readFacebookProfile, updateFacebookProfile } from "@/lib/connections/connectors/facebook/profile";
import { readInstagramProfile } from "@/lib/connections/connectors/instagram/profile";
import type { ConnectorContext, ProfileField } from "@/lib/connections/types";
import { ALL_SCOPES, TEST_CHANNELS, UPLOAD_SCOPES, createFakeGoogle, type FakeGoogle } from "./connections-fake-google";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
let root: string;
let google: FakeGoogle;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Ce que le faux YouTube garde de la chaîne, et ce qu'il reçoit. */
interface ChannelState {
  branding: Record<string, unknown>;
  localizations: Record<string, { title: string; description: string }>;
  sections: { id: string; snippet: Record<string, unknown>; contentDetails?: Record<string, unknown> }[];
  playlists: { id: string; snippet: Record<string, unknown>; status: Record<string, unknown>; contentDetails?: Record<string, unknown> }[];
  writes: { method: string; path: string; part: string | null; body: any }[];
}

let channel: ChannelState;

/** Profil, sections et playlists de YouTube ; le reste (OAuth…) passe au faux Google commun. */
function profileFetch(base: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    if (url.host !== "www.googleapis.com" || !url.pathname.startsWith("/youtube/v3/")) return base(input, init);
    const pathName = url.pathname.slice("/youtube/v3/".length);
    const part = url.searchParams.get("part");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    if (method !== "GET") channel.writes.push({ method, path: pathName, part, body });

    if (pathName === "channels" && method === "GET") {
      const item: Record<string, unknown> = { id: TEST_CHANNELS.first.id };
      if (part?.includes("snippet")) {
        item.snippet = { title: TEST_CHANNELS.first.title, customUrl: TEST_CHANNELS.first.handle, thumbnails: { high: { url: "https://yt3.fake/avatar.jpg" } } };
      }
      if (part?.includes("brandingSettings")) item.brandingSettings = structuredClone(channel.branding);
      if (part?.includes("localizations")) item.localizations = structuredClone(channel.localizations);
      return json({ items: [item] });
    }
    if (pathName === "channels" && method === "PUT") {
      if (part === "brandingSettings") channel.branding = body.brandingSettings;
      if (part === "localizations") channel.localizations = body.localizations;
      return json(body);
    }
    if (pathName === "channelSections" && method === "GET") return json({ items: structuredClone(channel.sections) });
    if (pathName === "channelSections" && method === "POST") {
      const created = { id: `sec-${channel.sections.length + 1}`, snippet: { ...body.snippet, position: channel.sections.length }, contentDetails: body.contentDetails };
      channel.sections.push(created);
      return json(created);
    }
    if (pathName === "channelSections" && method === "PUT") {
      channel.sections = channel.sections.map((section) => (section.id === body.id ? { id: body.id, snippet: body.snippet, contentDetails: body.contentDetails } : section));
      return json(body);
    }
    if (pathName === "playlists" && method === "GET") {
      const id = url.searchParams.get("id");
      return json({ items: structuredClone(id ? channel.playlists.filter((playlist) => playlist.id === id) : channel.playlists) });
    }
    if (pathName === "playlists" && method === "PUT") return json(body);
    return json({ error: { code: 404, message: "notFound", errors: [{ reason: "notFound" }] } }, 404);
  }) as typeof fetch;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-profile-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.test";
  process.env.YOUTUBE_CLIENT_ID = "client-id";
  process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
  google = createFakeGoogle();
  channel = {
    branding: {
      channel: {
        title: "Ma chaîne",
        description: "Ancienne description",
        keywords: 'anime "jeu vidéo"',
        country: "BE",
        defaultLanguage: "fr",
        unsubscribedTrailer: "trailer0001",
        trackingAnalyticsAccountId: "UA-1",
      },
      image: { bannerExternalUrl: "https://yt3.fake/banner" },
    },
    localizations: { en: { title: "My channel", description: "Old" } },
    sections: [
      { id: "sec-a", snippet: { type: "recentUploads", position: 0 } },
      { id: "sec-b", snippet: { type: "singlePlaylist", position: 1 }, contentDetails: { playlists: ["PL1"] } },
    ],
    playlists: [{ id: "PL1", snippet: { title: "Best of", description: "Les meilleurs moments", defaultLanguage: "fr" }, status: { privacyStatus: "public" }, contentDetails: { itemCount: 3 } }],
    writes: [],
  };
  globalThis.fetch = profileFetch(google.fetch);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

async function connect(scope = ALL_SCOPES) {
  const { url, cookie } = startAuthorization("youtube", scope === ALL_SCOPES ? "all" : "upload");
  google.codes.set("code-1", { channel: TEST_CHANNELS.first, scope });
  return completeConnection("youtube", "code-1", readTransaction(cookie, "youtube", new URL(url).searchParams.get("state")));
}

const generalUnits = () => getQuotaUsage(getConnector("youtube")!)!.buckets.find((bucket) => bucket.id === "general")!.used;

describe("profil YouTube", () => {
  test("lecture : description, mots-clés entre guillemets, langue, pays, bande-annonce, traductions et identité", async () => {
    const account = await connect();
    const snapshot = await readAccountProfile(account.id);
    expect(snapshot.values).toMatchObject({
      title: "Première chaîne",
      handle: "@premiere",
      avatar: "https://yt3.fake/avatar.jpg",
      description: "Ancienne description",
      keywords: ["anime", "jeu vidéo"],
      defaultLanguage: "fr",
      country: "BE",
      unsubscribedTrailer: "trailer0001",
      localizations: { en: { title: "My channel", description: "Old" } },
    });
  });

  test("mise à jour : relit d'abord, renvoie le titre et les autres valeurs inchangés, puis relit", async () => {
    const account = await connect();
    const before = generalUnits();
    const snapshot = await updateAccountProfile(account.id, { description: "Nouvelle <description>", keywords: ["anime", "jeu vidéo", "top 5"] });
    expect(channel.writes).toHaveLength(1);
    const write = channel.writes[0];
    expect(write).toMatchObject({ method: "PUT", path: "channels", part: "brandingSettings" });
    expect(write.body).toEqual({
      id: TEST_CHANNELS.first.id,
      brandingSettings: {
        channel: {
          title: "Ma chaîne",
          description: "Nouvelle description",
          keywords: 'anime "jeu vidéo" "top 5"',
          country: "BE",
          defaultLanguage: "fr",
          unsubscribedTrailer: "trailer0001",
          trackingAnalyticsAccountId: "UA-1",
        },
        image: { bannerExternalUrl: "https://yt3.fake/banner" },
      },
    });
    expect(snapshot.values.keywords).toEqual(["anime", "jeu vidéo", "top 5"]);
    // channels.list 1 + channels.update 50 + channels.list 1 (relecture).
    expect(generalUnits() - before).toBe(52);
  });

  test("pays et bande-annonce vidés : la clé disparaît, le reste est gardé", async () => {
    const account = await connect();
    await updateAccountProfile(account.id, { country: "", unsubscribedTrailer: "" });
    const sent = channel.writes[0].body.brandingSettings.channel;
    expect(sent).not.toHaveProperty("country");
    expect(sent).not.toHaveProperty("unsubscribedTrailer");
    expect(sent).toMatchObject({ title: "Ma chaîne", description: "Ancienne description", keywords: 'anime "jeu vidéo"' });
  });

  test("traductions : une requête à part, et une langue de chaîne exigée avant tout envoi", async () => {
    const account = await connect();
    await updateAccountProfile(account.id, { defaultLanguage: "fr", localizations: { en: { title: "My channel", description: "New" }, es: { title: "Mi canal", description: "" } } });
    expect(channel.writes.map((write) => write.part)).toEqual(["brandingSettings", "localizations"]);
    expect(channel.writes[1].body).toEqual({ id: TEST_CHANNELS.first.id, localizations: { en: { title: "My channel", description: "New" }, es: { title: "Mi canal", description: "" } } });

    (channel.branding.channel as Record<string, unknown>).defaultLanguage = undefined;
    channel.writes = [];
    await expect(updateAccountProfile(account.id, { localizations: { en: { title: "My channel", description: "x" } } })).rejects.toThrow(/langue de la chaîne/);
    expect(channel.writes).toHaveLength(0);
  });

  test("limites : rien ne part si un seul élément dépasse", async () => {
    const account = await connect();
    await expect(updateAccountProfile(account.id, { description: "a".repeat(1001) })).rejects.toThrow(/1\s000 caractères/);
    const many = Array.from({ length: 80 }, (_, index) => `motclé${index}`);
    await expect(updateAccountProfile(account.id, { description: "court", keywords: many })).rejects.toThrow(/500 caractères au total/);
    await expect(updateAccountProfile(account.id, { country: "France" })).rejects.toThrow(/valeur refusée/);
    expect(channel.writes).toHaveLength(0);
  });

  test("éléments non modifiables et inconnus refusés, déclarés avec leur page d'aide", async () => {
    const account = await connect();
    await expect(updateAccountProfile(account.id, { title: "Nouveau nom" })).rejects.toThrow(/ne permet pas de changer/);
    await expect(updateAccountProfile(account.id, { banner: "x" })).rejects.toThrow(/ne permet pas de changer|image/);
    await expect(updateAccountProfile(account.id, { inconnu: "x" })).rejects.toThrow(/inconnu/);
    expect(channel.writes).toHaveLength(0);

    const info = describeConnector(getConnector("youtube")!);
    const manual = info.profileFields!.filter((field) => !field.editable).map((field) => field.key);
    expect(manual).toEqual(["title", "handle", "avatar", "links"]);
    for (const field of info.profileFields!.filter((entry) => !entry.editable)) expect(field.manual?.url).toMatch(/^https:\/\/studio\.youtube\.com\/channel\/\{externalId\}\//);
    const description = info.profileFields!.find((field) => field.key === "description")!;
    expect(description).toMatchObject({ editable: true, maxLength: 1000, capability: "profile.details", scopes: ["https://www.googleapis.com/auth/youtube"] });
    expect(info.profileChoiceKeys).toEqual(["unsubscribedTrailer"]);
    expect(info.profileSections?.maxSections).toBe(10);
    const title = info.profileFields!.find((field) => field.key === "title")!;
    expect(resolveManualUrl(title.manual!.url, getAccountSummary(account.id)!)).toBe(
      `https://studio.youtube.com/channel/${TEST_CHANNELS.first.id}/editing/profile`
    );
  });

  test("capacité non autorisée : « Autoriser… » proposé, aucune écriture", async () => {
    const account = await connect(UPLOAD_SCOPES);
    expect(account.capabilities).not.toContain("profile.details");
    expect(getAccountSummary(account.id)?.requestableCapabilities).toEqual(expect.arrayContaining(["profile.details", "profile.sections", "playlists.manage"]));
    await expect(updateAccountProfile(account.id, { description: "x" })).rejects.toThrow(/Autoriser…/);
    // La lecture, elle, ne demande rien de plus.
    await expect(readAccountProfile(account.id)).resolves.toMatchObject({ values: { description: "Ancienne description" } });
    expect(channel.writes).toHaveLength(0);
  });
});

describe("sections et playlists YouTube", () => {
  test("déplacer une section renvoie son type et son contenu, dans la limite de 10", async () => {
    const account = await connect();
    const sections = await moveAccountSection(account.id, "sec-b", 0);
    expect(channel.writes[0]).toMatchObject({ method: "PUT", path: "channelSections", part: "snippet,contentDetails" });
    expect(channel.writes[0].body).toEqual({ id: "sec-b", snippet: { type: "singlePlaylist", position: 0 }, contentDetails: { playlists: ["PL1"] } });
    expect(sections.map((section) => section.id)).toContain("sec-b");

    await expect(addAccountSection(account.id, { type: "likes" })).rejects.toThrow(/refusé/);
    await expect(addAccountSection(account.id, { type: "singlePlaylist" })).rejects.toThrow(/playlist/);
    for (let index = channel.sections.length; index < 10; index += 1) channel.sections.push({ id: `sec-${index}`, snippet: { type: "recentUploads", position: index } });
    channel.writes = [];
    await expect(addAccountSection(account.id, { type: "popularUploads" })).rejects.toThrow(/10 sections au plus/);
    expect(channel.writes).toHaveLength(0);
  });

  test("modifier une playlist relit et renvoie la description et la langue inchangées", async () => {
    const account = await connect();
    const playlist = await updateAccountPlaylist(account.id, "PL1", { privacy: "unlisted" });
    expect(channel.writes[0].body).toEqual({
      id: "PL1",
      snippet: { title: "Best of", description: "Les meilleurs moments", defaultLanguage: "fr" },
      status: { privacyStatus: "unlisted" },
    });
    expect(playlist).toMatchObject({ id: "PL1", title: "Best of", itemCount: 3, url: "https://www.youtube.com/playlist?list=PL1" });
    await expect(updateAccountPlaylist(account.id, "PL1", { title: "  " })).rejects.toThrow(/obligatoire/);
  });
});

// ─── Meta ─────────────────────────────────────────────────────────

function fakeContext(externalId: string): ConnectorContext {
  return {
    accountId: "acc-test01",
    externalId,
    getAccessToken: async () => ({ value: "jeton", expiresAt: Number.MAX_SAFE_INTEGER }),
    chargeQuota: () => undefined,
    appSecretProof: () => "preuve",
    appSettings: {},
  };
}

describe("profils Meta", () => {
  test("Facebook : description et site web envoyés par POST /{page-id}, puis relus", async () => {
    const calls: { method: string; url: URL; body?: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      calls.push({ method: init.method ?? "GET", url, body: typeof init.body === "string" ? init.body : undefined });
      if ((init.method ?? "GET") === "POST") return json({ success: true });
      return json({ name: "Ma Page", about: "Bio envoyée", website: "https://exemple.fr/", picture: { data: { url: "https://cdn.fake/p.jpg" } } });
    }) as typeof fetch;
    const snapshot = await updateFacebookProfile(fakeContext("1001"), { about: "Bio envoyée", website: "https://exemple.fr/" });
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url.pathname).toMatch(/\/1001$/);
    const params = new URLSearchParams(post.body);
    expect(params.get("about")).toBe("Bio envoyée");
    expect(params.get("website")).toBe("https://exemple.fr/");
    expect(params.get("appsecret_proof")).toBe("preuve");
    expect(snapshot.values).toMatchObject({ name: "Ma Page", about: "Bio envoyée", avatar: "https://cdn.fake/p.jpg" });
    await expect(readFacebookProfile(fakeContext("1001"))).resolves.toBeTruthy();

    const info = describeConnector(getConnector("facebook")!);
    expect(info.profileFields!.find((field) => field.key === "about")).toMatchObject({ editable: true, maxLength: 100, scopes: ["pages_manage_metadata"] });
    expect(info.profileFields!.filter((field) => !field.editable).map((field) => field.key)).toEqual(["name", "avatar", "cover"]);
  });

  test("Instagram et Threads : tout le profil est à changer chez le service ; Instagram se replie sur les champs de base", async () => {
    for (const id of ["instagram", "threads"]) {
      const info = describeConnector(getConnector(id)!);
      expect(info.profileFields!.length).toBeGreaterThan(0);
      expect(info.profileFields!.every((field) => !field.editable && field.manual?.url)).toBe(true);
      expect(info.profileRead).toBe(true);
    }
    const asked: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const fields = new URL(String(input)).searchParams.get("fields") ?? "";
      asked.push(fields);
      if (fields.includes("biography")) return json({ error: { code: 100, message: "Tried accessing nonexisting field (biography)" } }, 400);
      return json({ username: "moncompte", name: "Mon compte", profile_picture_url: "https://cdn.fake/ig.jpg" });
    }) as typeof fetch;
    const snapshot = await readInstagramProfile(fakeContext("17841400000000000"));
    expect(asked).toHaveLength(2);
    expect(snapshot.values).toEqual({ name: "Mon compte", username: "@moncompte", avatar: "https://cdn.fake/ig.jpg" });
  });
});

// ─── Fonctions pures ──────────────────────────────────────────────

describe("fonctions du profil", () => {
  test("mots-clés : lecture avec guillemets, écriture, mise à la limite sans doublon", () => {
    expect(parseKeywords('anime  "jeu vidéo" top')).toEqual(["anime", "jeu vidéo", "top"]);
    expect(formatKeywords(["anime", "jeu vidéo"])).toBe('anime "jeu vidéo"');
    expect(keywordsLength(["anime", "jeu vidéo"])).toBe(17);
    expect(fitKeywords(["Anime", "anime", 'jeu "vidéo"', "<b>"], 500)).toEqual(["Anime", "jeu vidéo", "b"]);
    expect(fitKeywords(["aaaa", "bbbb", "cc"], 9)).toEqual(["aaaa", "bbbb"]);
  });

  const field = (patch: Partial<ProfileField>): ProfileField => ({ key: "k", label: "Élément", kind: "text", editable: true, ...patch });

  test("contrôle des valeurs selon leur nature", () => {
    expect(cleanProfileValue(field({ kind: "textarea", maxLength: 10 }), "  ab\r\ncd  ")).toBe("ab\ncd");
    expect(() => cleanProfileValue(field({ maxLength: 3 }), "abcd")).toThrow(/dépasse 3 caractères/);
    expect(cleanProfileValue(field({ kind: "keywords", maxLength: 50 }), ["a", "A", " b "])).toEqual(["a", "b"]);
    expect(cleanProfileValue(field({ kind: "language" }), "pt-BR")).toBe("pt-BR");
    expect(() => cleanProfileValue(field({ kind: "language" }), "")).toThrow(/vide/);
    expect(cleanProfileValue(field({ kind: "country", clearable: true }), "")).toBe("");
    expect(() => cleanProfileValue(field({ kind: "url" }), "javascript:alert(1)")).toThrow(/http/);
    expect(cleanProfileValue(field({ kind: "localizations", itemLimits: { description: 5 } }), { en: { title: " T ", description: "" }, de: { title: "", description: "" } })).toEqual({
      en: { title: "T", description: "" },
    });
    expect(() => cleanProfileValue(field({ kind: "localizations" }), { "pas une langue": { title: "x", description: "" } })).toThrow(/refusée/);
    expect(() => cleanProfileValue(field({ kind: "image" }), "x")).toThrow(/image/);
  });

  test("comparaison et différence lisible", () => {
    expect(sameProfileValue("a\r\nb ", "a\nb")).toBe(true);
    expect(sameProfileValue({ en: { title: "a", description: "" }, fr: { title: "b", description: "" } }, { fr: { title: "b", description: "" }, en: { title: "a", description: "" } })).toBe(true);
    expect(listDiff(["a", "B"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(wordDiff("le chat dort", "le chien dort")).toEqual([
      { kind: "same", text: "le " },
      { kind: "removed", text: "chat" },
      { kind: "added", text: "chien" },
      { kind: "same", text: " dort" },
    ]);
  });

  test("préremplissage depuis la marque", () => {
    const brand: ProfileBrandInput = {
      name: "Ma marque",
      bio: "Une bio",
      description: "Description rendue",
      keywords: ["anime", "jeu vidéo", "anime"],
      language: "fr",
      country: "",
      links: [{ label: "Site", url: "https://exemple.fr" }, { label: "Discord", url: "https://discord.gg/x" }],
    };
    expect(brandProfileValue(field({ brand: "description" }), brand)).toBe("Description rendue");
    expect(brandProfileValue(field({ kind: "keywords", brand: "keywords", maxLength: 500 }), brand)).toEqual(["anime", "jeu vidéo"]);
    expect(brandProfileValue(field({ kind: "country", brand: "country" }), brand)).toBeUndefined();
    expect(brandProfileValue(field({ kind: "country", brand: "country", clearable: true }), brand)).toBe("");
    expect(brandProfileValue(field({ kind: "url", brand: "website" }), brand)).toBe("https://exemple.fr/");
    expect(brandCopyText(field({ kind: "textarea", brand: "links" }), brand)).toMatch(/^Site\s:\shttps:\/\/exemple\.fr\nDiscord\s:\shttps:\/\/discord\.gg\/x$/);
    expect(brandProfileValue(field({}), brand)).toBeUndefined();
    expect(brandProfileValue(field({ brand: "name" }), null)).toBeUndefined();
  });
});
