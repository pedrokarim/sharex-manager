/**
 * Ce qu'une image de marque apporte au profil des comptes connectés (onglet
 * « Chaîne / Profil ») : la description de la chaîne rendue depuis son
 * modèle, la bio, les mots-clés (ses tags), la langue, le pays et les liens.
 * Fonction pure, utilisable dans le navigateur.
 */

import { renderTemplate } from "@/lib/connections/templates";
import type { ProfileBrandInput } from "@/lib/connections/profile";
import { DEFAULT_CHANNEL_DESCRIPTION } from "./defaults";
import type { BrandKit } from "./types";
import { cleanLinkUrl } from "./validate";

export function profileBrandInput(kit: BrandKit, now: Date | number = Date.now()): ProfileBrandInput {
  const publishing = kit.publishing;
  const links = (publishing.links ?? [])
    .map((link) => ({ label: link.label, url: cleanLinkUrl(link.url) ?? "" }))
    .filter((link) => link.url);
  const template = typeof publishing.channelDescriptionTemplate === "string" ? publishing.channelDescriptionTemplate : DEFAULT_CHANNEL_DESCRIPTION;
  return {
    name: kit.name,
    bio: publishing.bio ?? "",
    description: renderTemplate(template, {
      brand: kit.name,
      hook: kit.tagline ?? "",
      cta: kit.endCard?.callToAction ?? "",
      tags: publishing.tags ?? [],
      hashtags: publishing.hashtags ?? [],
      links,
      date: now,
      language: kit.language,
    }),
    keywords: publishing.tags ?? [],
    language: kit.language,
    country: publishing.country ?? "",
    links,
  };
}
