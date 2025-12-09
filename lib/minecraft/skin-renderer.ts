// NOTE: Les packages node-canvas-webgl et gl ont été supprimés car ils ne fonctionnent pas en production
// Cette fonctionnalité de rendu 3D côté serveur est désactivée

// import * as THREE from "three";
// import { createCanvas, loadImage } from "node-canvas-webgl";
// import { skinLayout, type SkinVersion } from "./skin-layout";

const TAU = 2 * Math.PI;
const EPSILON = 1e-3;

// Cache for skin data
const skinCache = new Map<string, any>();
const modelCache = new Map<string, THREE.Object3D>();

function radians(degrees: number): number {
  return degrees * (TAU / 360);
}

async function hasOptifineCape(username: string): Promise<string | null> {
  try {
    const url = `https://optifine.net/capes/${username}.png`;
    const response = await fetch(url);
    return response.ok ? url : null;
  } catch {
    return null;
  }
}

async function getSkinData(uuid: string): Promise<any> {
  if (skinCache.has(uuid)) {
    return skinCache.get(uuid);
  }

  console.log("Fetching new skin data for UUID:", uuid);

  try {
    const response = await fetch(
      `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch skin data: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.properties && Array.isArray(data.properties)) {
      data.properties = data.properties.map((prop: any) => {
        try {
          prop.value = JSON.parse(
            Buffer.from(prop.value, "base64").toString("ascii")
          );
        } catch (e) {
          console.warn("Failed to parse property value:", e);
        }
        return prop;
      });
    }

    skinCache.set(uuid, data);
    return data;
  } catch (error) {
    console.error("Error fetching skin data:", error);
    throw error;
  }
}

async function getSkinTextureUrl(uuid: string): Promise<string | null> {
  try {
    const data = await getSkinData(uuid);
    if (data?.properties?.[0]?.value?.textures?.SKIN) {
      return data.properties[0].value.textures.SKIN.url;
    }
  } catch (error) {
    console.error("Error getting skin texture URL:", error);
  }
  return null;
}

async function getCapeTextureUrl(uuid: string): Promise<string | null> {
  try {
    const data = await getSkinData(uuid);
    if (data?.properties?.[0]?.value?.textures?.CAPE) {
      return data.properties[0].value.textures.CAPE.url;
    } else if (data?.name) {
      return await hasOptifineCape(data.name);
    }
  } catch (error) {
    console.error("Error getting cape texture URL:", error);
  }
  return null;
}

function toCanvas(image: any, x = 0, y = 0, w?: number, h?: number): any {
  const width = w ?? image.width;
  const height = h ?? image.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

  return canvas;
}

function makeOpaque(image: any): any {
  const canvas = toCanvas(image);
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = data.data;

  for (let p = 3; p < pixels.length; p += 4) {
    pixels[p] = 255;
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

function hasAlphaLayer(image: any): boolean {
  const canvas = toCanvas(image);
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = data.data;

  for (let p = 3; p < pixels.length; p += 4) {
    if (pixels[p] !== 255) {
      return true;
    }
  }

  return false;
}

function capeScale(height: number): number {
  if (height % 22 === 0) {
    return height / 22;
  } else if (height % 17 === 0) {
    return height / 17;
  } else if (height >= 32 && (height & (height - 1)) === 0) {
    return height / 32;
  } else {
    return Math.max(1, Math.floor(height / 22));
  }
}

function colorFaces(
  geometry: THREE.BoxGeometry,
  canvas: any,
  rectangles: any
): THREE.Mesh | null {
  if (!rectangles) return null;

  const pixels = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height).data;
  const faces: THREE.Face3[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  const materialIndexMap: Record<number, number> = {};
  let side = THREE.FrontSide;

  Object.keys(rectangles).forEach((key) => {
    const rect = rectangles[key];
    const width = Math.abs(rect.w);
    const height = Math.abs(rect.h);
    const dj = Math.sign(rect.w);
    const di = Math.sign(rect.h);

    for (let y = 0, i = rect.y; y < height; y++, i += di) {
      for (let x = 0, j = rect.x; x < width; x++, j += dj) {
        const p = 4 * (i * canvas.width + j);
        const a = pixels[p + 3];

        if (a === 0) {
          side = THREE.DoubleSide;
          continue;
        }

        let materialIndex = materialIndexMap[a];

        if (typeof materialIndex === "undefined") {
          materials.push(
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              opacity: a / 255,
              transparent: a !== 255,
            })
          );
          materialIndex = materials.length - 1;
          materialIndexMap[a] = materialIndex;
          if (a !== 255) {
            side = THREE.DoubleSide;
          }
        }

        // Note: This is a simplified version. In a real implementation,
        // you'd need to properly map the faces to the geometry
        const color = new THREE.Color(
          pixels[p] / 255,
          pixels[p + 1] / 255,
          pixels[p + 2] / 255
        );

        // This would need proper face mapping in a real implementation
      }
    }
  });

  if (faces.length === 0) return null;

  materials.forEach((m) => {
    m.side = side;
  });

  return new THREE.Mesh(geometry, materials);
}

function buildMinecraftModel(
  skinImage: any,
  capeImage: any,
  slim: boolean,
  flip: boolean
): THREE.Object3D | null {
  if (skinImage.width < 64 || skinImage.height < 32) {
    return null;
  }

  const version = skinImage.height >= 64 ? 1 : 0;
  const cs = capeImage ? capeScale(capeImage.height) : null;

  const opaqueSkinCanvas = makeOpaque(skinImage);
  const transparentSkinCanvas = toCanvas(skinImage);
  const hasAlpha = hasAlphaLayer(skinImage);

  const playerGroup = new THREE.Object3D();

  // Head
  const headGroup = new THREE.Object3D();
  headGroup.position.set(0, 12, 0);
  let box = new THREE.BoxGeometry(8, 8, 8);
  const headMesh = colorFaces(
    box,
    opaqueSkinCanvas,
    skinLayout[version].head[0]
  );
  if (headMesh) headGroup.add(headMesh);

  if (hasAlpha) {
    box = new THREE.BoxGeometry(9, 9, 9);
    const hatMesh = colorFaces(
      box,
      transparentSkinCanvas,
      skinLayout[version].head[1]
    );
    if (hatMesh) headGroup.add(hatMesh);
  }

  // Torso
  const torsoGroup = new THREE.Object3D();
  torsoGroup.position.set(0, 2, 0);
  box = new THREE.BoxGeometry(8 + EPSILON, 12 + EPSILON, 4 + EPSILON);
  const torsoMesh = colorFaces(
    box,
    opaqueSkinCanvas,
    skinLayout[version].torso[0]
  );
  if (torsoMesh) torsoGroup.add(torsoMesh);

  if (version >= 1 && hasAlpha) {
    box = new THREE.BoxGeometry(8.5 + EPSILON, 12.5 + EPSILON, 4.5 + EPSILON);
    const jacketMesh = colorFaces(
      box,
      transparentSkinCanvas,
      skinLayout[version].torso[1]
    );
    if (jacketMesh) torsoGroup.add(jacketMesh);
  }

  // Arms and legs would be implemented similarly...

  playerGroup.add(headGroup);
  playerGroup.add(torsoGroup);

  if (flip) {
    playerGroup.rotation.z += radians(180);
  }

  return playerGroup;
}

// Simplified 2D rendering functions
export async function drawSkin2DHead(options: {
  skin: string;
  width?: number;
  height?: number;
  flip?: boolean;
}): Promise<any> {
  throw new Error(
    "Le rendu 3D des skins Minecraft côté serveur a été désactivé car les dépendances node-canvas-webgl et gl ne fonctionnent pas en production. Utilisez le rendu côté client à la place."
  );
}

export async function drawSkin2DCape(options: {
  skin: string;
  width?: number;
  height?: number;
  flip?: boolean;
}): Promise<any> {
  throw new Error(
    "Le rendu 3D des skins Minecraft côté serveur a été désactivé car les dépendances node-canvas-webgl et gl ne fonctionnent pas en production. Utilisez le rendu côté client à la place."
  );
}

export async function drawSkin2DFull(options: {
  skin: string;
  width?: number;
  height?: number;
  flip?: boolean;
}): Promise<any> {
  throw new Error(
    "Le rendu 3D des skins Minecraft côté serveur a été désactivé car les dépendances node-canvas-webgl et gl ne fonctionnent pas en production. Utilisez le rendu côté client à la place."
  );
}

export async function drawSkin3D(options: {
  skin: string;
  model?: "classic" | "slim";
  width?: number;
  height?: number;
  theta?: number;
  phi?: number;
  time?: number;
  flip?: boolean;
}): Promise<any> {
  throw new Error(
    "Le rendu 3D des skins Minecraft côté serveur a été désactivé car les dépendances node-canvas-webgl et gl ne fonctionnent pas en production. Utilisez le rendu côté client à la place."
  );
}
