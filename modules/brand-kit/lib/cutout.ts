/**
 * Détourage d'une pose de la mascotte (dossier 07 sexies, D2), en pur calcul
 * sur des pixels RGBA : le serveur décode et réencode l'image avec sharp,
 * tout le reste est ici et se teste sans fichier.
 *
 * Deux cas rencontrés avec les images générées :
 * - un fond vert uni (`#00FF00`, demandé à la génération) : il devient
 *   transparent, les bords gardent un dégradé et perdent leur reflet vert ;
 * - un fond déjà transparent mais avec une lueur autour du personnage : les
 *   pixels trop peu opaques (la lueur) sont retirés par seuillage de l'alpha.
 *
 * Puis l'image est recadrée au plus près du personnage, avec une petite marge.
 */

export interface RgbaImage {
  /** Pixels RGBA, 4 octets par pixel, ligne après ligne. */
  data: Uint8Array;
  width: number;
  height: number;
}

/** Écart vert (G − max(R, B)) au-delà duquel un pixel est du fond, en deçà duquel il est opaque. */
const GREEN_FULL = 90;
const GREEN_NONE = 30;
/** Un fond vert est aussi lumineux : un vert sombre du dessin n'en est pas. */
const GREEN_MIN = 120;
/** Part des pixels du bord qui doivent être du fond pour parler de fond vert ou transparent. */
const BORDER_SHARE = 0.6;
/** Alpha sous lequel un pixel est une lueur, pas le personnage. */
export const GLOW_ALPHA = 112;

const greenExcess = (data: Uint8Array, offset: number) => data[offset + 1] - Math.max(data[offset], data[offset + 2]);
const isKeyGreen = (data: Uint8Array, offset: number) => data[offset + 1] >= GREEN_MIN && greenExcess(data, offset) >= GREEN_FULL;

/** Décalage de chaque pixel du bord (une couronne d'un pixel). */
function borderOffsets(width: number, height: number): number[] {
  const offsets: number[] = [];
  for (let x = 0; x < width; x++) offsets.push(x * 4, ((height - 1) * width + x) * 4);
  for (let y = 1; y < height - 1; y++) offsets.push(y * width * 4, (y * width + width - 1) * 4);
  return offsets;
}

/** Le bord de l'image est-il surtout du vert d'incrustation ? */
export function hasGreenBackground(image: RgbaImage): boolean {
  const offsets = borderOffsets(image.width, image.height);
  const green = offsets.filter((offset) => image.data[offset + 3] > 0 && isKeyGreen(image.data, offset)).length;
  return offsets.length > 0 && green / offsets.length >= BORDER_SHARE;
}

/** Le bord de l'image est-il surtout transparent (image déjà détourée, peut-être avec une lueur) ? */
export function hasTransparentBackground(image: RgbaImage): boolean {
  const offsets = borderOffsets(image.width, image.height);
  const clear = offsets.filter((offset) => image.data[offset + 3] < GLOW_ALPHA).length;
  return offsets.length > 0 && clear / offsets.length >= BORDER_SHARE;
}

/**
 * Rend le vert d'incrustation transparent. Entre les deux seuils, l'alpha
 * suit l'écart vert (bords adoucis) et le reflet vert est retiré (G ramené
 * à max(R, B)). Les pixels qui ne tirent pas vers le vert ne bougent pas.
 */
export function keyOutGreen(image: RgbaImage): RgbaImage {
  const data = new Uint8Array(image.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    const excess = greenExcess(data, offset);
    if (excess <= GREEN_NONE) continue;
    if (isKeyGreen(data, offset)) {
      data[offset] = data[offset + 1] = data[offset + 2] = data[offset + 3] = 0;
      continue;
    }
    const keep = Math.min(1, Math.max(0, (GREEN_FULL - excess) / (GREEN_FULL - GREEN_NONE)));
    data[offset + 1] = Math.max(data[offset], data[offset + 2]);
    data[offset + 3] = Math.round(data[offset + 3] * keep);
  }
  return { data, width: image.width, height: image.height };
}

/** Retire la lueur : tout pixel moins opaque que `threshold` devient transparent. */
export function dropFaintPixels(image: RgbaImage, threshold = GLOW_ALPHA): RgbaImage {
  const data = new Uint8Array(image.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < threshold) data[offset] = data[offset + 1] = data[offset + 2] = data[offset + 3] = 0;
  }
  return { data, width: image.width, height: image.height };
}

/**
 * Retire les îlots isolés (une poussière de couleur restée sur le fond) :
 * tout groupe de pixels visibles, d'un seul tenant, plus petit que
 * `minPixels`. Le personnage, d'un seul tenant, n'y perd rien.
 */
export function dropSpecks(image: RgbaImage, minPixels: number): RgbaImage {
  const { width, height } = image;
  const data = new Uint8Array(image.data);
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const group: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    group.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      group.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next] || data[next * 4 + 3] === 0) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (group.length < minPixels) for (const index of group) data[index * 4] = data[index * 4 + 1] = data[index * 4 + 2] = data[index * 4 + 3] = 0;
  }
  return { data, width, height };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Plus petit cadre qui contient tous les pixels visibles ; `null` pour une image vide. */
export function contentBox(image: RgbaImage): Box | null {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Découpe un cadre (borné à l'image). */
export function crop(image: RgbaImage, box: Box): RgbaImage {
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(box.left)));
  const top = Math.max(0, Math.min(image.height - 1, Math.floor(box.top)));
  const width = Math.max(1, Math.min(image.width - left, Math.round(box.width)));
  const height = Math.max(1, Math.min(image.height - top, Math.round(box.height)));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
}

export type CutoutMethod = "green" | "glow" | "none";

/**
 * Détoure une pose : fond vert retiré, ou lueur retirée d'un fond déjà
 * transparent, puis recadrage au plus près avec une marge (2 % du grand
 * côté). Une image sans fond reconnu revient telle quelle (`none`).
 */
export function cutOutPose(image: RgbaImage, marginRatio = 0.02): { image: RgbaImage; method: CutoutMethod } {
  const method: CutoutMethod = hasGreenBackground(image) ? "green" : hasTransparentBackground(image) ? "glow" : "none";
  if (method === "none") return { image, method };
  const keyed = method === "green" ? dropFaintPixels(keyOutGreen(image), 8) : dropFaintPixels(image);
  // Îlots de moins d'un dix-millième de l'image (au moins 4 pixels) : des poussières, pas le personnage.
  const cleared = dropSpecks(keyed, Math.max(4, Math.round(image.width * image.height * 0.0001)));
  const box = contentBox(cleared);
  if (!box) return { image: cleared, method };
  const margin = Math.round(Math.max(box.width, box.height) * marginRatio);
  return {
    image: crop(cleared, { left: box.left - margin, top: box.top - margin, width: box.width + margin * 2, height: box.height + margin * 2 }),
    method,
  };
}
