import { describe, expect, it } from "vitest";
import { cleanCjkReading } from "@/modules/scan-studio/lib/analysis/clean-cjk";
import { cleanReading } from "@/modules/scan-studio/lib/analysis/clean-text";
import { linesInEngineOrder } from "@/modules/scan-studio/lib/analysis/pipeline";
import { isCreditsText } from "@/modules/scan-studio/lib/analysis/plausibility";
import {
  isCjkCreditsText,
  isCjkNoise,
  isMostlyCjk,
  isTranslatableCjk,
  nativeSigns,
  scriptShares,
} from "@/modules/scan-studio/lib/analysis/plausibility-cjk";
import { PAGE_SEGMENTATION, wordsFromBlocks } from "@/modules/scan-studio/lib/analysis/tesseract-words";
import { isNoiseText, type WordBox } from "@/modules/scan-studio/lib/analysis/words";

// Toutes les phrases de ce fichier sont inventées pour les tests.

/** Caractère donné par son code : les invisibles ne s'écrivent pas en clair dans un fichier de test. */
const char = (code: number) => String.fromCharCode(code);

// ─── Nettoyage ───────────────────────────────────────────────────

describe("nettoyage du japonais", () => {
  const clean = (raw: string, protectedTerms?: string[]) => cleanCjkReading(raw, "ja", { protectedTerms });

  it("retire les espaces que la lecture glisse entre les signes et recolle les lignes", () => {
    expect(clean("今日 は ずい ぶん\n風 が 強い ね 。")).toBe("今日はずいぶん風が強いね。");
    expect(clean("駅前の店で\n待っているよ。")).toBe("駅前の店で待っているよ。");
  });

  it("ramène la ponctuation à sa forme pleine chasse", () => {
    expect(clean("その地図は\nどこで見つけたの?")).toBe("その地図はどこで見つけたの？");
    expect(clean("もう少しだけ\n時間をください !")).toBe("もう少しだけ時間をください！");
    expect(clean("昨日の約束,\n覚えている?")).toBe("昨日の約束、覚えている？");
    expect(clean("わかった.\nすぐ行く.")).toBe("わかった。すぐ行く。");
    expect(clean("そうだね~")).toBe("そうだね〜");
  });

  it("réunit les points de suspension, quelle que soit la forme lue", () => {
    expect(clean("まさか本当に\n来るとは...")).toBe("まさか本当に来るとは…");
    expect(clean("まさか・・・")).toBe("まさか…");
    expect(clean("まさか。。。")).toBe("まさか…");
    // Plusieurs points de suspension à la suite n'en font qu'un.
    expect(clean("まさか… … …")).toBe("まさか…");
    expect(clean("まさか……")).toBe("まさか…");
  });

  it("ramène les formes de compatibilité à leur forme ordinaire", () => {
    // Lettres et chiffres pleine chasse, katakana demi-chasse.
    expect(clean("ＡＢＣは１２３番")).toBe("ABCは123番");
    expect(clean("ｺｰﾋｰをどうぞ")).toBe("コーヒーをどうぞ");
  });

  it("retire les caractères invisibles", () => {
    // Espace de largeur nulle, marque d'ordre des octets, trait d'union conditionnel.
    expect(clean(`今日は${char(0x200b)}雨${char(0xfeff)}だ${char(0xad)}。`)).toBe("今日は雨だ。");
    // Séparateur de ligne : une fin de ligne comme une autre.
    expect(clean(`今日は${char(0x2028)}雨だ。`)).toBe("今日は雨だ。");
  });

  it("écarte les traits lus au bord de la bulle et les lignes qui n'en sont pas", () => {
    expect(clean("| その 地図 は\nどこ で 見 つけ た の ?")).toBe("その地図はどこで見つけたの？");
    expect(clean("今日は\n/ |\n雨だ。 _")).toBe("今日は雨だ。");
    expect(clean("= / |")).toBe("");
    expect(clean("")).toBe("");
  });

  it("rend la marque d'allongement lue comme un tiret ou comme le kanji « un »", () => {
    expect(clean("コ一ヒ一をどうぞ")).toBe("コーヒーをどうぞ");
    expect(clean("ラ-メン")).toBe("ラーメン");
    expect(clean("スピ—ド")).toBe("スピード");
    expect(clean("えー\nそうなの")).toBe("えーそうなの");
    // Le vrai kanji reste : après un hiragana, ou devant un autre kanji.
    expect(clean("もう一杯どうぞ")).toBe("もう一杯どうぞ");
    expect(clean("コーヒー一杯")).toBe("コーヒー一杯");
  });

  it("départage un katakana et le kanji qui lui ressemble par leurs voisins", () => {
    expect(clean("カ口リー")).toBe("カロリー");
    expect(clean("協カ者")).toBe("協力者");
    expect(clean("こちらヘどうぞ")).toBe("こちらへどうぞ");
    // Seuls, rien ne les départage : on n'y touche pas.
    expect(clean("口を開けて")).toBe("口を開けて");
    expect(clean("力がない")).toBe("力がない");
  });

  it("ne touche jamais à un terme du glossaire", () => {
    // Sans le glossaire, le kanji entre deux katakana devient une marque d'allongement.
    expect(clean("カ一ル が 来た")).toBe("カールが来た");
    expect(clean("カ一ル が 来た", ["カ一ル"])).toBe("カ一ルが来た");
    // Un terme lu avec des espaces entre ses signes est retrouvé.
    expect(clean("あの カ 一 ル は", ["カ一ル"])).toBe("あのカ一ルは");
  });

  it("garde une espace entre deux mots en lettres latines", () => {
    expect(clean("OK GO\nと言った")).toBe("OK GOと言った");
  });
});

describe("nettoyage du chinois", () => {
  it("retire les espaces et met la ponctuation pleine chasse du chinois", () => {
    expect(cleanCjkReading("快点,\n要赶不上火车了!", "zh-Hans")).toBe("快点，要赶不上火车了！");
    expect(cleanCjkReading("知道了.我马上去.", "zh-Hans")).toBe("知道了。我马上去。");
    expect(cleanCjkReading("這張 地圖\n是 在 哪裡 找到 的 ?", "zh-Hant")).toBe("這張地圖是在哪裡找到的？");
    expect(cleanCjkReading("沒想到\n你真的來了...", "zh-Hant")).toBe("沒想到你真的來了…");
  });

  it("n'applique pas les corrections propres au japonais", () => {
    // « 一 » entre deux signes reste « 一 » : il n'y a pas de marque d'allongement en chinois.
    expect(cleanCjkReading("再来一杯", "zh-Hans")).toBe("再来一杯");
  });
});

describe("nettoyage du coréen", () => {
  const clean = (raw: string) => cleanCjkReading(raw, "ko");

  it("garde les espaces entre les mots et recolle les lignes par une espace", () => {
    expect(clean("오늘은 바람이\n정말 세네.")).toBe("오늘은 바람이 정말 세네.");
    expect(clean("오늘은   바람이")).toBe("오늘은 바람이");
  });

  it("retire l'espace devant la ponctuation et garde la ponctuation ordinaire", () => {
    expect(clean("기억하고 있어 ?")).toBe("기억하고 있어?");
    expect(clean("정말 세네 .")).toBe("정말 세네.");
    expect(clean("알았어。\n금방 갈게。")).toBe("알았어. 금방 갈게.");
    expect(clean("올 줄은...")).toBe("올 줄은…");
  });

  it("écarte les traits lus au bord de la bulle", () => {
    expect(clean("_ 상자 안의 물건은 _\n아무에게도 말하지 마 .")).toBe("상자 안의 물건은 아무에게도 말하지 마.");
  });
});

describe("choix des règles selon la langue", () => {
  it("applique les règles des signes pleins quand la langue en est une", () => {
    expect(cleanReading("今日 は\n雨 だ 。", { language: "ja" })).toBe("今日は雨だ。");
    expect(cleanReading("오늘은 바람이\n정말 세네 .", { language: "ko" })).toBe("오늘은 바람이 정말 세네.");
  });

  it("garde les règles de l'anglais sans langue, ou pour l'anglais", () => {
    expect(cleanReading("WHERE DID YOU\nFIND THIS MAP?")).toBe("Where did you find this map?");
    expect(cleanReading("WHERE DID YOU\nFIND THIS MAP?", { language: "en" })).toBe("Where did you find this map?");
    expect(cleanReading("WHERE DID YOU\nFIND THIS MAP?", { language: "auto" })).toBe("Where did you find this map?");
  });
});

// ─── Vraisemblance ───────────────────────────────────────────────

describe("écritures d'un texte", () => {
  it("compte les signes de chaque écriture, sans la ponctuation ni les espaces", () => {
    expect(scriptShares("今日はOK 3回!")).toEqual({ total: 7, han: 3, kana: 1, hangul: 0, latin: 2, digits: 1, symbols: 0 });
    expect(scriptShares("커피 한 잔")).toMatchObject({ total: 4, hangul: 4 });
    // La marque d'allongement compte comme un kana.
    expect(scriptShares("コーヒー").kana).toBe(4);
    expect(scriptShares("= | _").symbols).toBe(3);
  });

  it("sait quels signes sont ceux de la langue", () => {
    const shares = scriptShares("今日は雨 오늘 OK");
    expect(nativeSigns(shares, "ja")).toBe(4);
    expect(nativeSigns(shares, "zh-Hans")).toBe(3);
    expect(nativeSigns(shares, "ko")).toBe(2);
    expect(nativeSigns(shares, "en")).toBe(2);
  });

  it("reconnaît un texte surtout fait de signes pleins", () => {
    expect(isMostlyCjk("今日は雨だ。")).toBe(true);
    expect(isMostlyCjk("오늘은 바람이")).toBe(true);
    expect(isMostlyCjk("Where did you find this map?")).toBe(false);
    expect(isMostlyCjk("OK!")).toBe(false);
    expect(isMostlyCjk("...")).toBe(false);
  });
});

describe("texte ou dessin lu comme du texte", () => {
  it("garde une réplique de la langue", () => {
    expect(isCjkNoise("今日はずいぶん風が強いね。", 0.9, "ja")).toBe(false);
    expect(isCjkNoise("今天的风真大啊。", 0.9, "zh-Hans")).toBe(false);
    expect(isCjkNoise("오늘은 바람이 정말 세네.", 0.9, "ko")).toBe(false);
    // Une lecture qui doute reste gardée : elle sera signalée, pas jetée.
    expect(isCjkNoise("今日はずいぶん風が強いね。", 0.5, "ja")).toBe(false);
  });

  it("rejette ce qui ne porte aucun signe de la langue", () => {
    expect(isCjkNoise("", 0.9, "ja")).toBe(true);
    expect(isCjkNoise("…！？", 0.95, "ja")).toBe(true);
    expect(isCjkNoise("abc xyz", 0.9, "ja")).toBe(true);
    // Du japonais dans un chapitre réglé sur le coréen : aucun hangul.
    expect(isCjkNoise("今日は雨だ。", 0.9, "ko")).toBe(true);
  });

  it("rejette une lecture trop peu sûre", () => {
    expect(isCjkNoise("今日はずいぶん風が強いね。", 0.35, "ja")).toBe(true);
  });

  it("rejette des signes noyés dans des lettres latines et des symboles", () => {
    expect(isCjkNoise("今|=_A B c", 0.9, "ja")).toBe(true);
    expect(isCjkNoise("雨 gs vx q", 0.9, "ja")).toBe(true);
  });

  it("ne garde un signe seul que dans une bulle, lu avec assurance", () => {
    expect(isCjkNoise("え", 0.9, "ja")).toBe(false);
    expect(isCjkNoise("え？", 0.9, "ja")).toBe(false);
    expect(isCjkNoise("え", 0.7, "ja")).toBe(true);
    expect(isCjkNoise("え", 0.9, "ja", { enclosed: false })).toBe(true);
    expect(isCjkNoise("네", 0.9, "ko")).toBe(false);
  });

  it("rejette une trame lue comme des signes en traits droits", () => {
    expect(isCjkNoise("一一一", 0.6, "ja")).toBe(true);
    expect(isCjkNoise("二口", 0.8, "ja")).toBe(true);
    expect(isCjkNoise("ーーーー", 0.7, "ja")).toBe(true);
    // Les mêmes signes, lus avec assurance, sont du texte.
    expect(isCjkNoise("三日", 0.95, "ja")).toBe(false);
  });

  it("se méfie d'un long texte japonais sans un seul kana", () => {
    expect(isCjkNoise("東西南北中央", 0.7, "ja")).toBe(true);
    expect(isCjkNoise("東西南北中央", 0.9, "ja")).toBe(false);
    // En chinois, c'est la règle.
    expect(isCjkNoise("东西南北中央", 0.7, "zh-Hans")).toBe(false);
  });

  it("demande davantage à un texte posé sur le dessin", () => {
    expect(isCjkNoise("雨だ", 0.9, "ja", { enclosed: false })).toBe(true);
    expect(isCjkNoise("雨が降る", 0.55, "ja", { enclosed: false })).toBe(true);
    expect(isCjkNoise("雨が降る", 0.9, "ja", { enclosed: false })).toBe(false);
  });

  it("est choisi par la langue donnée au tri des lectures", () => {
    // Sans langue, c'est le tri de l'anglais : une autre écriture est rejetée.
    expect(isNoiseText("今日は雨だ。", 0.9)).toBe(true);
    expect(isNoiseText("今日は雨だ。", 0.9, { language: "ja" })).toBe(false);
    expect(isNoiseText("WHERE DID YOU FIND THIS MAP?", 0.9, { language: "en" })).toBe(false);
    // Un chapitre japonais ne garde pas une lecture toute en lettres latines.
    expect(isNoiseText("WHERE DID YOU FIND THIS MAP?", 0.9, { language: "ja" })).toBe(true);
  });
});

describe("texte à traduire et crédits", () => {
  it("tient pour un texte à traduire des signes pleins lus avec assez d'assurance", () => {
    expect(isTranslatableCjk("今日は雨だ。", 0.6)).toBe(true);
    expect(isTranslatableCjk("오늘은 바람이", 0.6)).toBe(true);
    expect(isTranslatableCjk("今日は雨だ。", 0.5)).toBe(false);
    // Un ou deux signes : il faut en être sûr.
    expect(isTranslatableCjk("雨だ", 0.7)).toBe(false);
    expect(isTranslatableCjk("雨だ", 0.85)).toBe(true);
    expect(isTranslatableCjk("abc 雨 xyz", 0.9)).toBe(false);
    expect(isTranslatableCjk("", 0.9)).toBe(false);
  });

  it("reconnaît les rôles d'une équipe suivis de deux-points", () => {
    expect(isCjkCreditsText("翻訳：ねこ丸")).toBe(true);
    expect(isCjkCreditsText("翻译: 小橘 / 嵌字: 阿青")).toBe(true);
    expect(isCjkCreditsText("번역 : 하늘")).toBe(true);
    // Le même mot dans une réplique n'en fait pas une page de crédits.
    expect(isCjkCreditsText("この本を翻訳してくれ。")).toBe(false);
    expect(isCreditsText("翻訳：ねこ丸")).toBe(true);
    expect(isCreditsText("scans.example.org")).toBe(true);
  });
});

// ─── Ce que rend le moteur ───────────────────────────────────────

describe("lignes dans l'ordre du moteur", () => {
  const word = (text: string, line: number, spaced?: boolean, x = 0): WordBox => ({ text, confidence: 0.9, x0: x, y0: 0, x1: x + 30, y1: 30, line, ...(spaced === undefined ? {} : { spaced }) });

  it("suit le rang des lignes, pas la place des boîtes", () => {
    // Deux colonnes : le moteur lit celle de droite d'abord, bien qu'elle soit plus loin sur l'axe des x.
    const words = [word("風が", 1, undefined, 0), word("今日", 0, undefined, 200), word("強いね。", 1, undefined, 0), word("は", 0, undefined, 200)];
    const lines = linesInEngineOrder(words, 28, "none");
    expect(lines.map((line) => line.text)).toEqual(["今日は", "風が強いね。"]);
    expect(lines.every((line) => line.height === 28)).toBe(true);
  });

  it("ne met aucune espace entre les signes du japonais et du chinois", () => {
    const lines = linesInEngineOrder([word("今日", 0, false), word("は", 0, true), word("雨", 0, true)], 28, "none");
    expect(lines[0].text).toBe("今日は雨");
  });

  it("garde en coréen les espaces que le moteur met dans sa ligne", () => {
    const words = [word("오", 0, false), word("늘", 0, false), word("은", 0, false), word("바", 0, true), word("람", 0, false), word("이", 0, false)];
    expect(linesInEngineOrder(words, 28, "engine")[0].text).toBe("오늘은 바람이");
    // Sans indication du moteur, une espace entre deux mots.
    expect(linesInEngineOrder([word("오늘은", 0), word("바람이", 0)], 28, "engine")[0].text).toBe("오늘은 바람이");
  });

  it("rend une seule ligne quand le moteur ne donne pas de rang", () => {
    const bare: WordBox[] = [{ text: "今日", confidence: 0.9, x0: 0, y0: 0, x1: 30, y1: 30 }, { text: "は", confidence: 0.9, x0: 0, y0: 30, x1: 30, y1: 60 }];
    expect(linesInEngineOrder(bare, 28, "none").map((line) => line.text)).toEqual(["今日は"]);
    expect(linesInEngineOrder([], 28, "none")).toEqual([]);
  });
});

describe("mots rendus par le moteur, en signes pleins", () => {
  const bbox = { x0: 0, y0: 0, x1: 30, y1: 30 };
  const engineWord = (text: string) => ({ text, confidence: 92, bbox });

  it("numérote les lignes dans l'ordre de lecture du moteur", () => {
    const words = wordsFromBlocks([
      { paragraphs: [{ lines: [{ bbox, words: [engineWord("今日"), engineWord("は")] }, { bbox, words: [engineWord("雨だ。")] }] }] },
      { paragraphs: [{ lines: [{ bbox, words: [engineWord("えっ")] }] }] },
    ]);
    expect(words.map((entry) => [entry.text, entry.line])).toEqual([
      ["今日", 0],
      ["は", 0],
      ["雨だ。", 1],
      ["えっ", 2],
    ]);
  });

  it("relit dans le texte de la ligne où le moteur met des espaces", () => {
    // Le moteur coréen rend une syllabe par « mot » ; sa ligne, elle, sépare bien les mots.
    const line = { bbox, text: "오늘은 바람이\n", words: ["오", "늘", "은", "바", "람", "이"].map(engineWord) };
    const words = wordsFromBlocks([{ paragraphs: [{ lines: [line] }] }]);
    expect(words.map((entry) => entry.spaced)).toEqual([false, false, false, true, false, false]);
  });

  it("suppose une espace quand la ligne ne dit rien", () => {
    const words = wordsFromBlocks([{ paragraphs: [{ lines: [{ bbox, words: [engineWord("HELLO"), engineWord("THERE")] }] }] }]);
    expect(words.map((entry) => entry.spaced)).toEqual([true, true]);
  });

  it("a un réglage de segmentation pour le texte en colonnes", () => {
    expect(PAGE_SEGMENTATION).toMatchObject({ block: "6", sparse: "11", vertical: "5" });
  });
});
