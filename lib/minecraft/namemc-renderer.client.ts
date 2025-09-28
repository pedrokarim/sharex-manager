/**
 * Utilitaire client pour reproduire le rendu 3D de NameMC
 * Basé sur l'analyse du script NameMC
 */

// Constantes exactes de NameMC
export const TAU = 2 * Math.PI;
export const EPS = 1e-3;

// Structure des skins exactement comme NameMC
export const SKIN = [
  [
    [
      [
        [16, 8, 8, 8],
        [0, 8, 8, 8],
        [8, 0, 8, 8],
        [16, 7, 8, -8],
        [8, 8, 8, 8],
        [24, 8, 8, 8],
      ], // Head
      [
        [48, 8, 8, 8],
        [32, 8, 8, 8],
        [40, 0, 8, 8],
        [48, 7, 8, -8],
        [40, 8, 8, 8],
        [56, 8, 8, 8],
      ], // Hat
    ],
    [
      [
        [28, 20, 4, 12],
        [16, 20, 4, 12],
        [20, 16, 8, 4],
        [28, 19, 8, -4],
        [20, 20, 8, 12],
        [32, 20, 8, 12],
      ],
    ], // Torso
    [
      [
        [
          [48, 20, 4, 12],
          [40, 20, 4, 12],
          [44, 16, 4, 4],
          [48, 19, 4, -4],
          [44, 20, 4, 12],
          [52, 20, 4, 12],
        ], // Right Arm
        [
          [47, 20, 4, 12],
          [40, 20, 4, 12],
          [44, 16, 3, 4],
          [47, 19, 3, -4],
          [44, 20, 3, 12],
          [51, 20, 3, 12],
        ],
      ], // Right Arm (Slim)
      [
        [
          [48, 36, 4, 12],
          [40, 36, 4, 12],
          [44, 32, 4, 4],
          [48, 35, 4, -4],
          [44, 36, 4, 12],
          [52, 36, 4, 12],
        ], // Right Sleeve
        [
          [47, 36, 4, 12],
          [40, 36, 4, 12],
          [44, 32, 3, 4],
          [47, 35, 3, -4],
          [44, 36, 3, 12],
          [51, 36, 3, 12],
        ],
      ], // Right Sleeve (Slim)
    ],
    [
      [
        [
          [40, 52, 4, 12],
          [32, 52, 4, 12],
          [36, 48, 4, 4],
          [40, 51, 4, -4],
          [36, 52, 4, 12],
          [44, 52, 4, 12],
        ], // Left Arm
        [
          [39, 52, 4, 12],
          [32, 52, 4, 12],
          [36, 48, 3, 4],
          [39, 51, 3, -4],
          [36, 52, 3, 12],
          [43, 52, 3, 12],
        ],
      ], // Left Arm (Slim)
      [
        [
          [56, 52, 4, 12],
          [48, 52, 4, 12],
          [52, 48, 4, 4],
          [56, 51, 4, -4],
          [52, 52, 4, 12],
          [60, 52, 4, 12],
        ], // Left Sleeve
        [
          [55, 52, 4, 12],
          [48, 52, 4, 12],
          [52, 48, 3, 4],
          [55, 51, 3, -4],
          [52, 52, 3, 12],
          [59, 52, 3, 12],
        ],
      ], // Left Sleeve (Slim)
    ],
    [
      [
        [8, 20, 4, 12],
        [0, 20, 4, 12],
        [4, 16, 4, 4],
        [8, 19, 4, -4],
        [4, 20, 4, 12],
        [12, 20, 4, 12],
      ],
    ], // Right Leg
    [
      [
        [24, 52, 4, 12],
        [16, 52, 4, 12],
        [20, 48, 4, 4],
        [24, 51, 4, -4],
        [20, 52, 4, 12],
        [28, 52, 4, 12],
      ],
    ], // Left Leg
  ],
  [
    [
      [
        [16, 8, 8, 8],
        [0, 8, 8, 8],
        [8, 0, 8, 8],
        [16, 7, 8, -8],
        [8, 8, 8, 8],
        [24, 8, 8, 8],
      ], // Head
      [
        [48, 8, 8, 8],
        [32, 8, 8, 8],
        [40, 0, 8, 8],
        [48, 7, 8, -8],
        [40, 8, 8, 8],
        [56, 8, 8, 8],
      ], // Hat
    ],
    [
      [
        [28, 20, 4, 12],
        [16, 20, 4, 12],
        [20, 16, 8, 4],
        [28, 19, 8, -4],
        [20, 20, 8, 12],
        [32, 20, 8, 12],
      ], // Torso
      [
        [28, 36, 4, 12],
        [16, 36, 4, 12],
        [20, 32, 8, 4],
        [28, 35, 8, -4],
        [20, 36, 8, 12],
        [32, 36, 8, 12],
      ], // Jacket
    ],
    [
      [
        [
          [48, 20, 4, 12],
          [40, 20, 4, 12],
          [44, 16, 4, 4],
          [48, 19, 4, -4],
          [44, 20, 4, 12],
          [52, 20, 4, 12],
        ], // Right Arm
        [
          [47, 20, 4, 12],
          [40, 20, 4, 12],
          [44, 16, 3, 4],
          [47, 19, 3, -4],
          [44, 20, 3, 12],
          [51, 20, 3, 12],
        ],
      ], // Right Arm (Slim)
      [
        [
          [48, 36, 4, 12],
          [40, 36, 4, 12],
          [44, 32, 4, 4],
          [48, 35, 4, -4],
          [44, 36, 4, 12],
          [52, 36, 4, 12],
        ], // Right Sleeve
        [
          [47, 36, 4, 12],
          [40, 36, 4, 12],
          [44, 32, 3, 4],
          [47, 35, 3, -4],
          [44, 36, 3, 12],
          [51, 36, 3, 12],
        ],
      ], // Right Sleeve (Slim)
    ],
    [
      [
        [
          [40, 52, 4, 12],
          [32, 52, 4, 12],
          [36, 48, 4, 4],
          [40, 51, 4, -4],
          [36, 52, 4, 12],
          [44, 52, 4, 12],
        ], // Left Arm
        [
          [39, 52, 4, 12],
          [32, 52, 4, 12],
          [36, 48, 3, 4],
          [39, 51, 3, -4],
          [36, 52, 3, 12],
          [43, 52, 3, 12],
        ],
      ], // Left Arm (Slim)
      [
        [
          [56, 52, 4, 12],
          [48, 52, 4, 12],
          [52, 48, 4, 4],
          [56, 51, 4, -4],
          [52, 52, 4, 12],
          [60, 52, 4, 12],
        ], // Left Sleeve
        [
          [55, 52, 4, 12],
          [48, 52, 4, 12],
          [52, 48, 3, 4],
          [55, 51, 3, -4],
          [52, 52, 3, 12],
          [59, 52, 3, 12],
        ],
      ], // Left Sleeve (Slim)
    ],
    [
      [
        [8, 20, 4, 12],
        [0, 20, 4, 12],
        [4, 16, 4, 4],
        [8, 19, 4, -4],
        [4, 20, 4, 12],
        [12, 20, 4, 12],
      ], // Right Leg
      [
        [8, 36, 4, 12],
        [0, 36, 4, 12],
        [4, 32, 4, 4],
        [8, 35, 4, -4],
        [4, 36, 4, 12],
        [12, 36, 4, 12],
      ], // Right Pant
    ],
    [
      [
        [24, 52, 4, 12],
        [16, 52, 4, 12],
        [20, 48, 4, 4],
        [24, 51, 4, -4],
        [20, 52, 4, 12],
        [28, 52, 4, 12],
      ], // Left Leg
      [
        [8, 52, 4, 12],
        [0, 52, 4, 12],
        [4, 48, 4, 4],
        [8, 51, 4, -4],
        [4, 52, 4, 12],
        [12, 52, 4, 12],
      ], // Left Pant
    ],
  ],
];

export function radians(d: number): number {
  return d * (TAU / 360);
}

export function toImage(png: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!png) return resolve(null as any);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `data:image/png;base64,${png}`;
  });
}

export function toCanvas(
  image: HTMLImageElement,
  x?: number,
  y?: number,
  w?: number,
  h?: number
): HTMLCanvasElement | null {
  if (!image) return null;

  x = typeof x === "undefined" ? 0 : x;
  y = typeof y === "undefined" ? 0 : y;
  w = typeof w === "undefined" ? image.width : w;
  h = typeof h === "undefined" ? image.height : h;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(image, x, y, w, h, 0, 0, w, h);

  return canvas;
}

export function getBitmap(
  canvas: HTMLCanvasElement,
  x?: number,
  y?: number,
  w?: number,
  h?: number
): ImageData | null {
  if (!canvas) return null;

  x = typeof x === "undefined" ? 0 : x;
  y = typeof y === "undefined" ? 0 : y;
  w = typeof w === "undefined" ? canvas.width : w;
  h = typeof h === "undefined" ? canvas.height : h;

  return canvas.getContext("2d")!.getImageData(x, y, w, h);
}

export function hasAlphaLayer(bitmap: ImageData): boolean {
  for (let p = 3; p < bitmap.data.length; p += 4) {
    if (bitmap.data[p] < 255) {
      return true;
    }
  }
  return false;
}

export function makeOpaque(bitmap: ImageData): ImageData {
  if (!bitmap) return null as any;
  for (let p = 3; p < bitmap.data.length; p += 4) {
    bitmap.data[p] = 255;
  }
  return bitmap;
}

export function capeScale(height: number): number {
  if (height % 22 === 0) {
    return height / 22;
  } else if (height % 17 === 0) {
    return height / 17;
  } else if (height >= 32 && (height & (height - 1)) === 0) {
    // power of 2
    return height / 32;
  } else {
    return Math.max(1, Math.floor(height / 22));
  }
}

/**
 * Fonction principale pour colorer les faces comme NameMC
 * C'est le cœur du système de rendu NameMC
 */
export function colorFaces(
  geometry: any,
  bitmap: ImageData,
  rectangles: number[][]
): any {
  if (!rectangles) return null;

  const faces: any[] = [];
  const materials: any[] = [];
  const materialIndexMap: { [key: number]: number } = {};
  let f = 0;
  let side = (window as any).THREE?.FrontSide || 0;

  rectangles.forEach((r) => {
    const dh = 4 * Math.sign(r[2]);
    const dv = 4 * Math.sign(r[3]) * bitmap.width;
    const r1 = 4 * (r[1] * bitmap.width + r[0]);
    const r2 = 4 * (r[3] * bitmap.width) + r1;

    for (let p1 = r1, p2 = r1 + 4 * r[2]; p1 !== r2; p1 += dv, p2 += dv) {
      for (let p = p1; p !== p2; p += dh, f += 2) {
        const a = bitmap.data[p + 3];
        if (a < 255) side = (window as any).THREE?.DoubleSide || 1;
        if (a === 0) continue;

        let materialIndex = materialIndexMap[a];
        if (typeof materialIndex === "undefined") {
          const THREE = (window as any).THREE;
          materials.push(
            new THREE.MeshLambertMaterial({
              vertexColors: THREE.FaceColors,
              opacity: a / 255,
              transparent: a < 255,
            })
          );
          materialIndex = materials.length - 1;
          materialIndexMap[a] = materialIndex;
        }

        const face1 = geometry.faces[f];
        const face2 = geometry.faces[f + 1];
        face1.color.r = bitmap.data[p] / 255;
        face1.color.g = bitmap.data[p + 1] / 255;
        face1.color.b = bitmap.data[p + 2] / 255;
        face2.color = face1.color;
        face1.materialIndex = materialIndex;
        face2.materialIndex = materialIndex;
        faces.push(face1);
        faces.push(face2);
      }
    }
  });

  if (faces.length === 0) return null;

  geometry.faces = faces;
  const THREE = (window as any).THREE;
  geometry = new THREE.BufferGeometry().fromGeometry(geometry);

  materials.forEach((m) => (m.side = side));

  return new THREE.Mesh(geometry, materials);
}

/**
 * Construit le modèle 3D exactement comme NameMC
 */
export function buildSkinModel(
  skin: HTMLImageElement,
  cape: HTMLImageElement | null,
  slim: boolean,
  flip: boolean = false
): any {
  if (skin.width < 64 || skin.height < 32) {
    return null;
  }

  const THREE = (window as any).THREE;
  if (!THREE) return null;

  const v = skin.height >= 64 ? 1 : 0;
  const armW = slim ? 3 : 4;

  const bitmap = getBitmap(toCanvas(skin)!);
  if (!bitmap) return null;

  const hasAlpha = hasAlphaLayer(bitmap);
  const opaque = hasAlpha ? makeOpaque(getBitmap(toCanvas(skin)!)!) : bitmap;

  // Tête
  const headGroup = new THREE.Object3D();
  headGroup.position.x = 0;
  headGroup.position.y = 12;
  headGroup.position.z = 0;
  const headBox = new THREE.BoxGeometry(8, 8, 8, 8, 8, 8);
  const headMesh = colorFaces(headBox, opaque, SKIN[v][0][0] as number[][]);
  headGroup.add(headMesh);

  if (hasAlpha) {
    const hatBox = new THREE.BoxGeometry(9, 9, 9, 8, 8, 8);
    const hatMesh = colorFaces(hatBox, bitmap, SKIN[v][0][1] as number[][]);
    if (hatMesh) headGroup.add(hatMesh);
  }

  // Torse
  const torsoGroup = new THREE.Object3D();
  torsoGroup.position.x = 0;
  torsoGroup.position.y = 2;
  torsoGroup.position.z = 0;
  const torsoBox = new THREE.BoxGeometry(8 + EPS, 12 + EPS, 4 + EPS, 8, 12, 4);
  const torsoMesh = colorFaces(torsoBox, opaque, SKIN[v][1][0] as number[][]);
  torsoGroup.add(torsoMesh);

  if (v >= 1 && hasAlpha) {
    const jacketBox = new THREE.BoxGeometry(
      8.5 + EPS,
      12.5 + EPS,
      4.5 + EPS,
      8,
      12,
      4
    );
    const jacketMesh = colorFaces(
      jacketBox,
      bitmap,
      SKIN[v][1][1] as number[][]
    );
    if (jacketMesh) torsoGroup.add(jacketMesh);
  }

  // Bras droit
  const rightArmGroup = new THREE.Object3D();
  rightArmGroup.position.x = slim ? -5.5 : -6;
  rightArmGroup.position.y = 6;
  rightArmGroup.position.z = 0;
  const rightArmBox = new THREE.BoxGeometry(armW, 12, 4, armW, 12, 4).translate(
    0,
    -4,
    0
  );
  const rightArmMesh = colorFaces(
    rightArmBox,
    opaque,
    SKIN[v][2][0][slim ? 1 : 0] as number[][]
  );
  rightArmGroup.add(rightArmMesh);

  if (v >= 1 && hasAlpha) {
    const rightSleeveBox = new THREE.BoxGeometry(
      armW + 0.5 + EPS * 4,
      12.5 + EPS * 4,
      4.5 + EPS * 4,
      armW,
      12,
      4
    ).translate(0, -4, 0);
    const rightSleeveMesh = colorFaces(
      rightSleeveBox,
      bitmap,
      SKIN[v][2][1][slim ? 1 : 0] as number[][]
    );
    if (rightSleeveMesh) rightArmGroup.add(rightSleeveMesh);
  }

  // Bras gauche
  const leftArmGroup = new THREE.Object3D();
  leftArmGroup.position.x = slim ? 5.5 : 6;
  leftArmGroup.position.y = 6;
  leftArmGroup.position.z = 0;
  const leftArmBox = new THREE.BoxGeometry(armW, 12, 4, armW, 12, 4).translate(
    0,
    -4,
    0
  );
  const leftArmMesh = colorFaces(
    leftArmBox,
    opaque,
    SKIN[v][3][0][slim ? 1 : 0] as number[][]
  );
  leftArmGroup.add(leftArmMesh);

  if (v >= 1 && hasAlpha) {
    const leftSleeveBox = new THREE.BoxGeometry(
      armW + 0.5 + EPS * 4,
      12.5 + EPS * 4,
      4.5 + EPS * 4,
      armW,
      12,
      4
    ).translate(0, -4, 0);
    const leftSleeveMesh = colorFaces(
      leftSleeveBox,
      bitmap,
      SKIN[v][3][1][slim ? 1 : 0] as number[][]
    );
    if (leftSleeveMesh) leftArmGroup.add(leftSleeveMesh);
  }

  // Jambe droite
  const rightLegGroup = new THREE.Object3D();
  rightLegGroup.position.x = -2;
  rightLegGroup.position.y = -4;
  rightLegGroup.position.z = 0;
  const rightLegBox = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(
    0,
    -6,
    0
  );
  const rightLegMesh = colorFaces(
    rightLegBox,
    opaque,
    SKIN[v][4][0] as number[][]
  );
  rightLegGroup.add(rightLegMesh);

  if (v >= 1 && hasAlpha) {
    const rightPantBox = new THREE.BoxGeometry(
      4.5 + EPS * 2,
      12.5 + EPS * 2,
      4.5 + EPS * 2,
      4,
      12,
      4
    ).translate(0, -6, 0);
    const rightPantMesh = colorFaces(
      rightPantBox,
      bitmap,
      SKIN[v][4][1] as number[][]
    );
    if (rightPantMesh) rightLegGroup.add(rightPantMesh);
  }

  // Jambe gauche
  const leftLegGroup = new THREE.Object3D();
  leftLegGroup.position.x = 2;
  leftLegGroup.position.y = -4;
  leftLegGroup.position.z = 0;
  const leftLegBox = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(
    0,
    -6,
    0
  );
  const leftLegMesh = colorFaces(
    leftLegBox,
    opaque,
    SKIN[v][5][0] as number[][]
  );
  leftLegGroup.add(leftLegMesh);

  if (v >= 1 && hasAlpha) {
    const leftPantBox = new THREE.BoxGeometry(
      4.5 + EPS * 3,
      12.5 + EPS * 3,
      4.5 + EPS * 3,
      4,
      12,
      4
    ).translate(0, -6, 0);
    const leftPantMesh = colorFaces(
      leftPantBox,
      bitmap,
      SKIN[v][5][1] as number[][]
    );
    if (leftPantMesh) leftLegGroup.add(leftPantMesh);
  }

  // Assembler le modèle
  const model = new THREE.Object3D();
  model.add(headGroup);
  model.add(torsoGroup);
  model.add(rightArmGroup);
  model.add(leftArmGroup);
  model.add(rightLegGroup);
  model.add(leftLegGroup);

  // Cape
  if (cape) {
    const cs = capeScale(cape.height);
    const capeGroup = new THREE.Object3D();
    capeGroup.position.x = 0;
    capeGroup.position.y = 8;
    capeGroup.position.z = -2;
    capeGroup.rotation.y += radians(180);
    const capeBox = new THREE.BoxGeometry(
      10,
      16,
      1,
      10 * cs,
      16 * cs,
      cs
    ).translate(0, -8, 0.5);
    const capeMesh = colorFaces(capeBox, getBitmap(toCanvas(cape)!)!, [
      [11 * cs, cs, cs, 16 * cs],
      [0, cs, cs, 16 * cs],
      [cs, 0, 10 * cs, cs],
      [11 * cs, cs - 1, 10 * cs, -cs],
      [cs, cs, 10 * cs, 16 * cs],
      [12 * cs, cs, 10 * cs, 16 * cs],
    ]);
    capeGroup.add(capeMesh);
    model.add(capeGroup);
  }

  if (flip) {
    model.rotation.z += radians(180);
  }

  return model;
}
