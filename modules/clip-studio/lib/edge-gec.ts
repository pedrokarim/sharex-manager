/**
 * Jeton `Sec-MS-GEC` v2 de la lecture à voix haute d’Edge.
 *
 * Depuis octobre 2026, Microsoft refuse le jeton v1 (SHA-256 nu de l’heure et
 * de la clé publique) : la poignée de main WebSocket échoue partout, en 403
 * ou par une réponse 200 vide. Le v2 assemble deux empreintes de la même
 * chaîne, séparées par un tiret :
 * - un « CS64 » de 16 caractères hexadécimaux, calculé avec une clé tirée de
 *   la seconde empreinte ;
 * - un SHA-256 précédé d’un bloc secret de 57 octets, que l’on ne connaît que
 *   par l’état interne qu’il laisse après 14 tours (`STATE_AFTER_SECRET`).
 *
 * Portage fidèle de `drm.py` de la bibliothèque edge-tts (rany2/edge-tts,
 * 7.3, octobre 2026). Toute l’arithmétique est modulo 2³² : `Math.imul` pour
 * les produits, `>>> 0` pour revenir à un entier non signé.
 */

/** Constantes de tours de SHA-256 (FIPS 180-4). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const INITIAL_HASH = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** Registres de travail après les 14 premiers tours, sur les 56 premiers octets secrets. */
const STATE_AFTER_SECRET = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
/** Part secrète des mots 16 à 29 du premier bloc. */
const SECRET_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e,
  0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564,
];
/** Constante du tour 14, augmentée du 57ᵉ octet secret (le haut du mot 14). */
const K14_WITH_SECRET = 0xc9dc06a7;
const SIGMA0_SECRET = 0x059c0b80;
const SIGMA1_SECRET = 0x000b92c0;

/** Coefficients et décalages initiaux du CS64. */
const CS64_COEFFICIENTS: [number, number][] = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_FIRST_TERM = 0xf2f90b1a;
const CS64_FIRST_OFFSET = 0x0b1a0000;

const rotr = (value: number, bits: number) => ((value >>> bits) | (value << (32 - bits))) >>> 0;
const rol16 = (value: number) => ((value << 16) | (value >>> 16)) >>> 0;
const mul = (a: number, b: number) => Math.imul(a, b) >>> 0;
const sigma0 = (value: number) => (rotr(value, 7) ^ rotr(value, 18) ^ (value >>> 3)) >>> 0;
const sigma1 = (value: number) => (rotr(value, 17) ^ rotr(value, 19) ^ (value >>> 10)) >>> 0;

/** Complète le programme de mots jusqu’au 64ᵉ. */
function expandSchedule(words: number[], firstWord = 16) {
  for (let index = firstWord; index < 64; index++) {
    words[index] = (sigma1(words[index - 2]) + words[index - 7] + sigma0(words[index - 15]) + words[index - 16]) >>> 0;
  }
}

/** Tours de compression, depuis `firstRound` (14 pour reprendre le bloc secret). */
function compress(state: number[], words: number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  for (let index = firstRound; index < 64; index++) {
    const constant = firstRound === 14 && index === 14 ? K14_WITH_SECRET : K[index];
    const choice = (g ^ (e & (f ^ g))) >>> 0;
    const majority = ((a & b) | (c & (a | b))) >>> 0;
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + choice + constant + words[index]) >>> 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + majority) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

/** État après le premier bloc : les 57 octets secrets suivis des 7 premiers octets de la chaîne. */
function stateAfterFirstBlock(head: Uint8Array): number[] {
  const words = new Array<number>(14).fill(0);
  words.push((head[0] << 16) | (head[1] << 8) | head[2]);
  words.push(((head[3] << 24) | (head[4] << 16) | (head[5] << 8) | head[6]) >>> 0);
  for (let index = 16; index < 30; index++) {
    let value = SECRET_SCHEDULE[index - 16];
    if (index - 2 >= 14) value += index === 16 ? (sigma1(words[index - 2]) ^ SIGMA1_SECRET) >>> 0 : sigma1(words[index - 2]);
    if (index - 7 >= 14) value += words[index - 7];
    if (index - 15 >= 14) value += index === 29 ? (sigma0(words[index - 15]) ^ SIGMA0_SECRET) >>> 0 : sigma0(words[index - 15]);
    words.push(value >>> 0);
  }
  words.push((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + K14_WITH_SECRET - K[14]) >>> 0);
  expandSchedule(words, 31);
  const working = compress(STATE_AFTER_SECRET, words, 14);
  return INITIAL_HASH.map((value, index) => (value + working[index]) >>> 0);
}

/** SHA-256 du bloc secret suivi de `data` (au moins 7 octets). */
export function secretSha256(data: Uint8Array): Buffer {
  if (data.length < 7) throw new Error("la chaîne du jeton doit faire au moins sept octets");
  const length = 57 + data.length;
  const zeros = (((55 - length) % 64) + 64) % 64;
  const padded = Buffer.alloc(data.length - 7 + 1 + zeros + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;
  padded.writeBigUInt64BE(BigInt(length * 8), padded.length - 8);
  let state = stateAfterFirstBlock(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => padded.readUInt32BE(offset + index * 4));
    expandSchedule(words);
    const working = compress(state, words);
    state = state.map((value, index) => (value + working[index]) >>> 0);
  }
  const digest = Buffer.alloc(32);
  state.forEach((value, index) => digest.writeUInt32BE(value, index * 4));
  return digest;
}

/** Mots de 32 bits petit-boutistes, complétés de zéros jusqu’à un nombre pair. */
function littleEndianWords(data: Uint8Array): number[] {
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  padded.set(data);
  const words = Array.from({ length: padded.length / 4 }, (_, index) => padded.readUInt32LE(index * 4));
  if (words.length % 2) words.push(0);
  return words;
}

/** Les deux mots du CS64, avec une clé tirée de l’empreinte SHA-256. */
export function cs64(data: Uint8Array, digest: Buffer): [number, number] {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0;
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0;
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([coefficient], index) => mul(coefficient, factors[index % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, offset]) => offset);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  littleEndianWords(prefixed).forEach((word, index) => {
    const even = index % 2 === 0;
    let term = mul(word, even ? keyA : keyB);
    let offset = mul(rol16(word), even ? 0xef0569fb : 0xc31713db);
    if (index === 0) {
      term = (term + mul(CS64_FIRST_TERM, factors[0])) >>> 0;
      offset = (offset + CS64_FIRST_OFFSET) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  });

  let swapSum = 0;
  let swapLast = 0;
  let state = 0;
  let sum = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];
    let q = mul(rol16((offsets[index] + x) >>> 0), 0x76f50f34);
    swapSum = (swapSum + ((mul(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;
    q = mul(rol16((offsets[index + 1] + y) >>> 0), 0x1881ce3c);
    swapLast = (mul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapSum = (swapSum + swapLast) >>> 0;

    state = (mul(state, keyA) + x) >>> 0;
    state = mul(rol16(state), 0xcf98b111);
    state = mul(rol16(state), 0x87085b9f);
    state = mul(rol16(state), 0x12ceb96d);
    state = mul(rol16(state), 0x257e1d83);
    sum = (sum + state) >>> 0;
    let t = (mul(state, keyB) + y) >>> 0;
    t = mul(rol16(t), 0xa27416f5);
    t = mul(rol16(t), 0xd38396ff);
    state = mul(rol16(mul(rol16(t), 0x7c932b89)), 0xbfa49f69);
    sum = (sum + state) >>> 0;
  }
  return [(swapLast ^ state) >>> 0, (swapSum ^ sum) >>> 0];
}

/** Jeton v2 d’une chaîne (l’heure en tics Windows suivie de la clé publique) : `<16 hex>-<64 hex>`. */
export function secMsGecV2(input: string): string {
  const data = Buffer.from(input, "ascii");
  const digest = secretSha256(data);
  const words = Buffer.alloc(8);
  const [low, high] = cs64(data, digest);
  words.writeUInt32LE(low, 0);
  words.writeUInt32LE(high, 4);
  return `${words.toString("hex")}-${digest.toString("hex")}`.toUpperCase();
}
