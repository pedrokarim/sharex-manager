import { describe, expect, it } from "vitest";
import { buildLines, groupWords } from "@/modules/scan-studio/lib/analysis/grouping";
import { sortByReadingOrder } from "@/modules/scan-studio/lib/analysis/reading-order";
import { wordsFromBlocks } from "@/modules/scan-studio/lib/analysis/tesseract-words";
import {
  REVIEW_CONFIDENCE,
  dropNoiseWords,
  isNoiseText,
  isNoiseWord,
  overlapRatio,
  type Box,
  type WordBox,
} from "@/modules/scan-studio/lib/analysis/words";

const page = { width: 1200, height: 1700 };

/** Mot de 22 px de haut, large de 16 px par caractère, comme un lettrage de 30 px. */
function word(text: string, x: number, y: number, confidence = 0.95, height = 22): WordBox {
  return { text, confidence, x0: x, y0: y, x1: x + text.length * 16, y1: y + height };
}

/** Ligne de mots posés l'un après l'autre, séparés d'une espace de 8 px. */
function line(text: string, x: number, y: number, confidence = 0.95, height = 22): WordBox[] {
  let cursor = x;
  return text.split(" ").map((part) => {
    const box = word(part, cursor, y, confidence, height);
    cursor = box.x1 + 8;
    return box;
  });
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

describe("mots : ce qui n'est pas du texte", () => {
  it("écarte les mots vides, minuscules, démesurés ou trop peu sûrs", () => {
    expect(isNoiseWord(word("  ", 10, 10), page)).toBe(true);
    expect(isNoiseWord(word("ok", 10, 10, 0.95, 3), page)).toBe(true);
    expect(isNoiseWord(word("ok", 10, 10, 0.95, 1200), page)).toBe(true);
    expect(isNoiseWord(word("ok", 10, 10, 0.1), page)).toBe(true);
    expect(isNoiseWord(word("OK", 10, 10), page)).toBe(false);
  });

  it("écarte les signes sans lettre, sauf la ponctuation de phrase", () => {
    expect(isNoiseWord(word("|||", 10, 10), page)).toBe(true);
    expect(isNoiseWord(word("#=", 10, 10), page)).toBe(true);
    expect(isNoiseWord(word("?!", 10, 10), page)).toBe(false);
    expect(isNoiseWord(word("...", 10, 10), page)).toBe(false);
  });

  it("écarte un trait horizontal lu comme un tiret", () => {
    expect(isNoiseWord({ text: "—", confidence: 0.9, x0: 10, y0: 10, x1: 400, y1: 18 }, page)).toBe(true);
  });

  it("ne garde que les mots plausibles", () => {
    const kept = dropNoiseWords([word("HELLO", 10, 10), word("", 100, 10), word("///", 200, 10)], page);
    expect(kept.map((entry) => entry.text)).toEqual(["HELLO"]);
  });
});

describe("groupes : ce qui n'est pas une réplique", () => {
  it("rejette un caractère isolé", () => {
    expect(isNoiseText("I", 0.99)).toBe(true);
    expect(isNoiseText("?", 0.99)).toBe(true);
    expect(isNoiseText("=", 0.94)).toBe(true);
  });

  it("rejette les hachures lues comme du texte", () => {
    expect(isNoiseText("IIIIlllI", 0.9)).toBe(true);
    expect(isNoiseText("//l/|", 0.9)).toBe(true);
    expect(isNoiseText("LLLL", 0.9)).toBe(true);
    expect(isNoiseText("%$#@ a", 0.9)).toBe(true);
  });

  it("rejette une lecture trop peu sûre", () => {
    expect(isNoiseText("Hr IEC", 0.3)).toBe(true);
    expect(isNoiseText("Za", 0.61)).toBe(true);
    expect(isNoiseText("WNNM", 0.6)).toBe(true);
  });

  it("garde les répliques, même courtes", () => {
    expect(isNoiseText("NO!", 0.93)).toBe(false);
    expect(isNoiseText("OK", 0.9)).toBe(false);
    expect(isNoiseText("WHAT WAS THAT?!", 0.96)).toBe(false);
    expect(isNoiseText("I really doubt it.", 0.7)).toBe(false);
  });

  it("place le seuil de vérification au-dessus du seuil de rejet", () => {
    expect(REVIEW_CONFIDENCE).toBeGreaterThan(0.45);
    expect(REVIEW_CONFIDENCE).toBeLessThan(1);
  });
});

describe("regroupement des mots en lignes", () => {
  it("réunit les mots d'une même ligne, de gauche à droite", () => {
    const words = line("WE HAVE TO LEAVE", 100, 100);
    const lines = buildLines([words[2], words[0], words[3], words[1]]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("WE HAVE TO LEAVE");
  });

  it("sépare deux bulles voisines posées à la même hauteur", () => {
    const lines = buildLines([...line("WHERE DID YOU", 200, 180), ...line("IN THE OLD", 800, 180)]);
    expect(lines.map((entry) => entry.text)).toEqual(["WHERE DID YOU", "IN THE OLD"]);
  });

  it("rattache un petit signe à la ligne qui le porte", () => {
    const dash: WordBox = { text: "-", confidence: 0.9, x0: 176, y0: 108, x1: 186, y1: 112 };
    const lines = buildLines([...line("WAIT", 100, 100), dash, ...line("WHAT", 198, 100)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("WAIT - WHAT");
  });
});

describe("regroupement des lignes en zones", () => {
  it("fait une zone par bulle", () => {
    const groups = groupWords([
      ...line("WHERE DID YOU", 208, 181),
      ...line("FIND THIS MAP?", 212, 219),
      ...line("IN THE OLD", 797, 161),
      ...line("LIBRARY.", 814, 199),
      ...line("WHAT WAS", 178, 991),
      ...line("THAT?!", 208, 1029),
    ]);
    expect(groups.map((group) => group.raw)).toEqual(["IN THE OLD\nLIBRARY.", "WHERE DID YOU\nFIND THIS MAP?", "WHAT WAS\nTHAT?!"]);
  });

  it("ne réunit pas deux lignes trop éloignées", () => {
    const groups = groupWords([...line("FIRST BUBBLE", 100, 100), ...line("SECOND BUBBLE", 100, 220)]);
    expect(groups).toHaveLength(2);
  });

  it("ne réunit pas deux lignes qui ne sont pas à l'aplomb l'une de l'autre", () => {
    const groups = groupWords([...line("LEFT", 100, 100), ...line("RIGHT", 400, 130)]);
    expect(groups).toHaveLength(2);
  });

  it("ne réunit pas un titre et un texte de tailles très différentes", () => {
    const groups = groupWords([...line("BOOM", 100, 100, 0.9, 80), ...line("what was that", 110, 200, 0.9, 20)]);
    expect(groups).toHaveLength(2);
  });

  it("réunit une ligne courte centrée sous une ligne longue", () => {
    const groups = groupWords([...line("I NEVER DOUBTED", 100, 100), ...line("IT.", 200, 138)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].raw).toBe("I NEVER DOUBTED\nIT.");
    expect(groups[0].lineHeight).toBe(22);
  });

  it("pondère la confiance par la longueur des mots", () => {
    const [group] = groupWords([word("ABCDEFGH", 100, 100, 1), word("IJ", 240, 100, 0.5)]);
    expect(group.confidence).toBeCloseTo(0.9, 5);
  });

  it("donne la boîte englobante du groupe", () => {
    const [group] = groupWords([...line("ARE YOU SURE", 196, 821), ...line("ABOUT THIS?", 209, 859)]);
    expect(group).toMatchObject({ x0: 196, y0: 821, y1: 881 });
  });

  it("moyenne l'inclinaison quand le moteur la donne", () => {
    const tilted = line("CRASH BANG", 100, 100).map((entry) => ({ ...entry, angle: -8 }));
    expect(groupWords(tilted)[0].angle).toBeCloseTo(-8, 5);
    expect(groupWords(line("FLAT TEXT", 100, 100))[0].angle).toBe(0);
  });
});

describe("ordre de lecture", () => {
  // Deux bulles en haut, une case en dessous avec deux bulles, puis une dernière.
  const topLeft = { ...box(100, 100, 400, 200), name: "haut gauche" };
  const topRight = { ...box(700, 120, 1000, 220), name: "haut droite" };
  const middleLeft = { ...box(120, 600, 380, 700), name: "milieu gauche" };
  const middleRight = { ...box(720, 640, 980, 720), name: "milieu droite" };
  const bottom = { ...box(400, 1300, 800, 1400), name: "bas" };
  const all = [bottom, middleLeft, topRight, middleRight, topLeft];
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  it("manga : de droite à gauche, puis de haut en bas", () => {
    expect(names(sortByReadingOrder(all, "manga"))).toEqual(["haut droite", "haut gauche", "milieu droite", "milieu gauche", "bas"]);
  });

  it("manhua : de gauche à droite, puis de haut en bas", () => {
    expect(names(sortByReadingOrder(all, "manhua"))).toEqual(["haut gauche", "haut droite", "milieu gauche", "milieu droite", "bas"]);
  });

  it("webtoon : de haut en bas, sans rangées", () => {
    expect(names(sortByReadingOrder(all, "webtoon"))).toEqual(["haut gauche", "haut droite", "milieu gauche", "milieu droite", "bas"]);
    const stacked = [{ ...box(600, 300, 700, 350), name: "b" }, { ...box(100, 290, 200, 340), name: "a" }];
    expect(names(sortByReadingOrder(stacked, "webtoon"))).toEqual(["a", "b"]);
  });

  it("ne modifie pas la liste reçue", () => {
    const copy = [...all];
    sortByReadingOrder(all, "manga");
    expect(all).toEqual(copy);
  });

  it("met dans des rangées différentes deux zones qui se chevauchent à peine", () => {
    const high = { ...box(100, 100, 300, 200), name: "haute" };
    const low = { ...box(700, 180, 900, 300), name: "basse" };
    expect(names(sortByReadingOrder([low, high], "manga"))).toEqual(["haute", "basse"]);
  });
});

describe("boîtes", () => {
  it("mesure le recouvrement par rapport à la plus petite boîte", () => {
    expect(overlapRatio(box(0, 0, 100, 100), box(50, 0, 150, 100))).toBeCloseTo(0.5, 5);
    expect(overlapRatio(box(0, 0, 100, 100), box(10, 10, 30, 30))).toBe(1);
    expect(overlapRatio(box(0, 0, 100, 100), box(200, 200, 300, 300))).toBe(0);
  });
});

describe("mots rendus par le moteur", () => {
  const blocks = [
    {
      paragraphs: [
        {
          lines: [
            {
              bbox: { x0: 100, y0: 100, x1: 400, y1: 122 },
              baseline: { x0: 100, y0: 122, x1: 400, y1: 122 },
              words: [
                { text: "HELLO", confidence: 96, bbox: { x0: 100, y0: 100, x1: 200, y1: 122 } },
                { text: " ", confidence: 10, bbox: { x0: 200, y0: 100, x1: 210, y1: 122 } },
                { text: "THERE", confidence: 150, bbox: { x0: 220, y0: 100, x1: 400, y1: 122 } },
              ],
            },
            {
              bbox: { x0: 100, y0: 200, x1: 400, y1: 280 },
              baseline: { x0: 100, y0: 240, x1: 400, y1: 198 },
              words: [{ text: "CRASH", confidence: 80, bbox: { x0: 100, y0: 200, x1: 400, y1: 280 } }],
            },
            {
              bbox: { x0: 500, y0: 100, x1: 506, y1: 122 },
              baseline: { x0: 505, y0: 122, x1: 503, y1: 100 },
              words: [{ text: "=", confidence: 94, bbox: { x0: 500, y0: 100, x1: 506, y1: 122 } }],
            },
          ],
        },
      ],
    },
  ];

  it("met les mots à plat, sans les vides, confiance ramenée entre 0 et 1", () => {
    const words = wordsFromBlocks(blocks);
    expect(words.map((entry) => entry.text)).toEqual(["HELLO", "THERE", "CRASH", "="]);
    expect(words[0].confidence).toBeCloseTo(0.96, 5);
    expect(words[1].confidence).toBe(1);
    expect(words[0]).toMatchObject({ x0: 100, y0: 100, x1: 200, y1: 122 });
  });

  it("donne l'inclinaison de la ligne, sauf quand elle est trop courte pour en juger", () => {
    const words = wordsFromBlocks(blocks);
    expect(words[0].angle).toBeCloseTo(0, 5);
    expect(words[2].angle).toBeCloseTo(-7.97, 1);
    expect(words[3].angle).toBeUndefined();
  });

  it("accepte une lecture sans blocs", () => {
    expect(wordsFromBlocks(null)).toEqual([]);
    expect(wordsFromBlocks(undefined)).toEqual([]);
  });
});
