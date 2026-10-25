/**
 * Planche d'essai (dossier 01, illustrations, étape I1) : trois séquences
 * qui rejouent les mécanismes relevés sur le short de référence, avec un
 * texte à nous, plus un compteur. Sert aux tests et au banc de rendu
 * (`scripts/board-stills.ts`).
 *
 * - 0 à 3,6 s : titre (un mot sur un pavé, un autre souligné), trois
 *   carreaux qui arrivent un par un, puis une croix sous chacun ;
 * - 3,6 à 10 s : une liste qui se construit mot à mot, puis se barre ligne
 *   à ligne, et une note collée en biais ;
 * - 10 à 15 s : la note devient la carte centrale, cinq pastilles poussent
 *   autour, reliées par des traits ;
 * - 15 à 18 s : un compteur qui monte, avec son unité.
 *
 * La mise en page est calculée en pixels d'un short (1080 × 1920) à partir
 * de la grille d'espacements, puis ramenée en parts de la zone : chaque
 * composition est centrée dans la zone où l'on écrit.
 */

import { column, SPACE, stack, type BoardSpec } from "@/modules/clip-studio/engine/board";
import { takeGeometry } from "@/modules/clip-studio/engine/take-templates";
import type { MediaSource, TimedWord } from "@/modules/clip-studio/engine/types";

export const SAMPLE_FPS = 30;
const FRAME = { width: 1080, height: 1920 };

/** Phrases dites, et leur début en secondes : les mots sont répartis régulièrement dans chaque phrase. */
const SENTENCES: [number, number, string][] = [
  [0, 3.4, "Pourquoi tes montages se ressemblent tous, même avec trois outils différents ?"],
  [3.6, 6.4, "Parce que l'assistant suit une recette : un titre, trois idées, abonne-toi."],
  [6.6, 9.8, "Il recopie les étapes, mais il oublie pourquoi elles marchent."],
  [10, 14.8, "Donne-lui plutôt de quoi réfléchir : une promesse, du concret, une relance, de la tension, une preuve."],
  [15, 17.8, "Sur nos tests, seize mille sept cent neuf vues en une semaine."],
];

export const SAMPLE_WORDS: TimedWord[] = SENTENCES.flatMap(([from, to, sentence]) => {
  const tokens = sentence.split(" ");
  const step = ((to - from) * 1000) / tokens.length;
  return tokens.map((text, index) => ({ text, startMs: Math.round(from * 1000 + index * step), endMs: Math.round(from * 1000 + (index + 1) * step - 40) }));
});

/** Index du premier mot qui commence par `prefix` à partir de `after` (sans la ponctuation). */
export function wordIndex(prefix: string, after = 0): number {
  const index = SAMPLE_WORDS.findIndex((word, position) => position >= after && word.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").startsWith(prefix.toLowerCase()));
  if (index < 0) throw new Error(`mot absent : ${prefix}`);
  return index;
}

const w = (prefix: string, after = 0) => ({ word: wordIndex(prefix, after) });

/** Planche d'un short monté : le papier couvre le haut du cadre, on écrit dans la zone sûre. */
const GEOMETRY = takeGeometry("9:16");
export const SAMPLE_AREA = GEOMETRY.content;
const PAPER = GEOMETRY.board;

/** Pixels du cadre en parts de la zone, sur chaque axe. */
const ax = (px: number) => px / (SAMPLE_AREA.width * FRAME.width);
const ay = (px: number) => px / (SAMPLE_AREA.height * FRAME.height);

export function sampleBoards(logos: MediaSource[]): BoardSpec[] {
  const second = (value: number) => Math.round(value * SAMPLE_FPS);

  // Séquence A : titre de deux lignes, puis les carreaux et leurs croix, le tout centré dans la zone.
  const titleSize = 0.05;
  const titlePx = 2 * titleSize * FRAME.height * 1.12;
  const tilePx = 230;
  const crossPx = 36 + SPACE.m - 18;
  const [titleY, tilesY] = column([ay(titlePx), ay(tilePx + crossPx)], ay(SPACE.l));
  const tileX = stack(3, ax(tilePx), ax(SPACE.l), 0.5);
  const tileCenterY = tilesY - ay(crossPx) / 2;

  // Séquence B : intitulé, puis trois cartes, centrés ensemble.
  const labelPx = 64;
  const cardPx = 150;
  const [labelY, ...rowY] = column([ay(labelPx), ay(cardPx), ay(cardPx), ay(cardPx)], [ay(SPACE.s), ay(28), ay(28)]);
  const notePlace = { y: rowY[0] - ay(cardPx) / 2 };

  // Séquence C : la carte au centre ; cinq pastilles autour, en haut au centre puis aux quatre coins,
  // chacune à un écart franc de la carte (au moins SPACE.l au-dessus ou en dessous d'elle).
  const centerPx = { width: 440, height: 190 };
  const chipPx = 56;
  const chipDy = ay(centerPx.height / 2 + SPACE.l + chipPx / 2);
  const chipSpots = [
    { x: 0.5, y: 0.5 - chipDy - ay(chipPx + SPACE.m) },
    { x: 0.8, y: 0.5 - chipDy },
    { x: 0.8, y: 0.5 + chipDy },
    { x: 0.2, y: 0.5 + chipDy },
    { x: 0.2, y: 0.5 - chipDy },
  ];
  const afterRecipe = wordIndex("recette");
  const afterThink = wordIndex("réfléchir");

  // Séquence D : le compteur et sa pastille, centrés ensemble.
  const counterSize = 0.085;
  const chipLine = 0.026 * FRAME.height * 1.2;
  const [sourceY, counterY, weekY] = column([ay(0.028 * FRAME.height * 1.2), ay(counterSize * FRAME.height * 1.12), ay(chipLine)], [ay(SPACE.s), ay(SPACE.m)]);

  return [
    {
      area: SAMPLE_AREA,
      paperBox: PAPER,
      start: 0,
      end: second(3.6),
      paper: true,
      actors: [
        {
          id: "title",
          kind: "text",
          text: "Tes montages se ressemblent tous",
          size: titleSize,
          x: 0.5,
          y: titleY,
          w: 1,
          h: ay(titlePx),
          marks: [
            { kind: "pill", from: 3, to: 4 },
            { kind: "underline", from: 4, to: 5, color: "ink", at: w("tous") },
          ],
        },
        ...logos.slice(0, 3).map((source, index) => ({
          id: `logo-${index}`,
          kind: "image" as const,
          source,
          x: tileX[index],
          y: tileCenterY,
          w: ax(tilePx),
          h: ay(tilePx),
          tile: true,
          // L'accroche se lit dès la première image : le premier carreau est déjà posé.
          ...(index === 0 ? {} : { enter: { at: w(index === 1 ? "même" : "outils"), style: "pop" as const } }),
        })),
      ],
      actions: logos.slice(0, 3).map((_, index) => ({ verb: "cross" as const, actor: `logo-${index}`, at: { word: wordIndex("différents"), delay: index * 0.12 }, place: "below" as const })),
    },
    {
      area: SAMPLE_AREA,
      paperBox: PAPER,
      start: second(3.6),
      end: second(10),
      paper: true,
      actors: [
        { id: "label", kind: "text", text: "La recette", size: 0.028, role: "label", color: "muted", align: "left", x: 0.5, y: labelY, w: 1, h: ay(labelPx) },
        { id: "row-1", kind: "card", index: "01", text: "Un titre", x: 0.5, y: rowY[0], w: 1, h: ay(cardPx), size: 0.03, enter: { at: w("titre", afterRecipe) } },
        { id: "row-2", kind: "card", index: "02", text: "Trois idées", x: 0.5, y: rowY[1], w: 1, h: ay(cardPx), size: 0.03, enter: { at: w("trois", afterRecipe) } },
        { id: "row-3", kind: "card", index: "03", text: "Abonne-toi", x: 0.5, y: rowY[2], w: 1, h: ay(cardPx), size: 0.03, enter: { at: w("abonne", afterRecipe) } },
        // Note collée sur le coin de la liste, comme un pense-bête : elle chevauche la première carte, voulu.
        { id: "note", kind: "note", text: "Et pourquoi ça marche ?", x: 0.8, y: notePlace.y, w: ax(330), h: ay(190), tilt: 5, size: 0.028, overlap: true, persist: true, enter: { at: w("pourquoi", wordIndex("oublie")), style: "pop" } },
      ],
      actions: [
        { verb: "strike", actor: "row-1", at: w("recopie") },
        { verb: "strike", actor: "row-2", at: w("étapes", wordIndex("recopie")) },
        { verb: "strike", actor: "row-3", at: w("oublie") },
      ],
    },
    {
      area: SAMPLE_AREA,
      paperBox: PAPER,
      start: second(10),
      end: second(15),
      paper: true,
      actors: [
        // La note reste exactement où elle était sur la planche d'avant : le changement de planche ne la fait pas sauter.
        { id: "seed", kind: "note", text: "Et pourquoi ça marche ?", x: 0.8, y: notePlace.y, w: ax(330), h: ay(190), tilt: 5, size: 0.028 },
        { id: "center", kind: "card", text: "Apprendre à réfléchir", x: 0.5, y: 0.5, w: ax(centerPx.width), h: ay(centerPx.height), size: 0.03, enter: { at: w("réfléchir") } },
        ...["Promesse", "Concret", "Relance", "Tension", "Preuve"].map((text, index) => ({
          id: `chip-${index}`,
          kind: "chip" as const,
          text,
          dot: true,
          size: 0.024,
          x: chipSpots[index].x,
          y: chipSpots[index].y,
          enter: { at: w(text.toLowerCase().slice(0, 5), afterThink), style: "pop" as const },
        })),
      ],
      actions: [
        { verb: "morph", actor: "seed", into: "center", at: w("réfléchir") },
        ...[0, 1, 2, 3, 4].map((index) => ({ verb: "link" as const, from: "center", to: `chip-${index}`, at: w(["promesse", "concret", "relance", "tension", "preuve"][index], afterThink) })),
      ],
    },
    {
      area: SAMPLE_AREA,
      paperBox: PAPER,
      start: second(15),
      end: second(18),
      paper: true,
      actors: [
        { id: "source", kind: "text", text: "Sur nos tests", size: 0.028, role: "label", color: "muted", x: 0.5, y: sourceY, w: 1, h: ay(0.028 * FRAME.height * 1.2) },
        { id: "count", kind: "counter", value: "16 709", unit: "vues", from: 0, size: counterSize, x: 0.5, y: counterY },
        { id: "week", kind: "chip", text: "en une semaine", size: 0.026, x: 0.5, y: weekY, enter: { at: w("semaine"), style: "pop" } },
      ],
      actions: [{ verb: "count", actor: "count", at: w("seize"), seconds: 1.4 }],
    },
  ];
}
