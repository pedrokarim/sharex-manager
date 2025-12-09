
/*! Copyright © 2021 NameMC. All rights reserved. */

const TAU = 2 * Math.PI;
const EPS = 1e-3;

const SKIN = [
    [
        [[[16, 8, 8, 8], [0, 8, 8, 8], [8, 0, 8, 8], [16, 7, 8, -8], [8, 8, 8, 8], [24, 8, 8, 8]], // Head
        [[48, 8, 8, 8], [32, 8, 8, 8], [40, 0, 8, 8], [48, 7, 8, -8], [40, 8, 8, 8], [56, 8, 8, 8]]], // Hat
        [[[28, 20, 4, 12], [16, 20, 4, 12], [20, 16, 8, 4], [28, 19, 8, -4], [20, 20, 8, 12], [32, 20, 8, 12]]], // Torso
        [[[[48, 20, 4, 12], [40, 20, 4, 12], [44, 16, 4, 4], [48, 19, 4, -4], [44, 20, 4, 12], [52, 20, 4, 12]], // Right Arm
        [[47, 20, 4, 12], [40, 20, 4, 12], [44, 16, 3, 4], [47, 19, 3, -4], [44, 20, 3, 12], [51, 20, 3, 12]]]], // Right Arm (Slim)
        [[[[43, 20, -4, 12], [51, 20, -4, 12], [47, 16, -4, 4], [51, 19, -4, -4], [47, 20, -4, 12], [55, 20, -4, 12]], // Left Arm
        [[43, 20, -4, 12], [50, 20, -4, 12], [46, 16, -3, 4], [49, 19, -3, -4], [46, 20, -3, 12], [53, 20, -3, 12]]]], // Left Arm (Slim)
        [[[8, 20, 4, 12], [0, 20, 4, 12], [4, 16, 4, 4], [8, 19, 4, -4], [4, 20, 4, 12], [12, 20, 4, 12]]], // Right Leg
        [[[3, 20, -4, 12], [11, 20, -4, 12], [7, 16, -4, 4], [11, 19, -4, -4], [7, 20, -4, 12], [15, 20, -4, 12]]] // Left Leg
    ],
    [
        [[[16, 8, 8, 8], [0, 8, 8, 8], [8, 0, 8, 8], [16, 7, 8, -8], [8, 8, 8, 8], [24, 8, 8, 8]], // Head
        [[48, 8, 8, 8], [32, 8, 8, 8], [40, 0, 8, 8], [48, 7, 8, -8], [40, 8, 8, 8], [56, 8, 8, 8]]], // Hat
        [[[28, 20, 4, 12], [16, 20, 4, 12], [20, 16, 8, 4], [28, 19, 8, -4], [20, 20, 8, 12], [32, 20, 8, 12]], // Torso
        [[28, 36, 4, 12], [16, 36, 4, 12], [20, 32, 8, 4], [28, 35, 8, -4], [20, 36, 8, 12], [32, 36, 8, 12]]], // Jacket
        [[[[48, 20, 4, 12], [40, 20, 4, 12], [44, 16, 4, 4], [48, 19, 4, -4], [44, 20, 4, 12], [52, 20, 4, 12]], // Right Arm
        [[47, 20, 4, 12], [40, 20, 4, 12], [44, 16, 3, 4], [47, 19, 3, -4], [44, 20, 3, 12], [51, 20, 3, 12]]], // Right Arm (Slim)
        [[[48, 36, 4, 12], [40, 36, 4, 12], [44, 32, 4, 4], [48, 35, 4, -4], [44, 36, 4, 12], [52, 36, 4, 12]], // Right Sleeve
        [[47, 36, 4, 12], [40, 36, 4, 12], [44, 32, 3, 4], [47, 35, 3, -4], [44, 36, 3, 12], [51, 36, 3, 12]]]], // Right Sleeve (Slim)
        [[[[40, 52, 4, 12], [32, 52, 4, 12], [36, 48, 4, 4], [40, 51, 4, -4], [36, 52, 4, 12], [44, 52, 4, 12]], // Left Arm
        [[39, 52, 4, 12], [32, 52, 4, 12], [36, 48, 3, 4], [39, 51, 3, -4], [36, 52, 3, 12], [43, 52, 3, 12]]], // Left Arm (Slim)
        [[[56, 52, 4, 12], [48, 52, 4, 12], [52, 48, 4, 4], [56, 51, 4, -4], [52, 52, 4, 12], [60, 52, 4, 12]], // Left Sleeve
        [[55, 52, 4, 12], [48, 52, 4, 12], [52, 48, 3, 4], [55, 51, 3, -4], [52, 52, 3, 12], [59, 52, 3, 12]]]], // Left Sleeve (Slim)
        [[[8, 20, 4, 12], [0, 20, 4, 12], [4, 16, 4, 4], [8, 19, 4, -4], [4, 20, 4, 12], [12, 20, 4, 12]], // Right Leg
        [[8, 36, 4, 12], [0, 36, 4, 12], [4, 32, 4, 4], [8, 35, 4, -4], [4, 36, 4, 12], [12, 36, 4, 12]]], // Right Pant
        [[[24, 52, 4, 12], [16, 52, 4, 12], [20, 48, 4, 4], [24, 51, 4, -4], [20, 52, 4, 12], [28, 52, 4, 12]], // Left Leg
        [[8, 52, 4, 12], [0, 52, 4, 12], [4, 48, 4, 4], [8, 51, 4, -4], [4, 52, 4, 12], [12, 52, 4, 12]]] // Left Pant
    ]
];

function radians(d) {
    return d * (TAU / 360);
}

function getImage(id) {
    return id && window.namemc && window.namemc.images && window.namemc.images[id];
}

function toImage(png) {
    return new Promise((resolve, reject) => {
        if (!png) return resolve(null);
        let image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = `data:image/png;base64,${png}`;
    });
}

function toCanvas(image, x, y, w, h) {
    if (!image) return null;

    x = (typeof x === 'undefined' ? 0 : x);
    y = (typeof y === 'undefined' ? 0 : y);
    w = (typeof w === 'undefined' ? image.width : w);
    h = (typeof h === 'undefined' ? image.height : h);

    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h);

    return canvas;
}

function getBitmap(canvas, x, y, w, h) {
    if (!canvas) return null;

    x = (typeof x === 'undefined' ? 0 : x);
    y = (typeof y === 'undefined' ? 0 : y);
    w = (typeof w === 'undefined' ? canvas.width : w);
    h = (typeof h === 'undefined' ? canvas.height : h);

    return canvas.getContext('2d').getImageData(x, y, w, h);
}

function putBitmap(canvas, bitmap, x, y) {
    x = (typeof x === 'undefined' ? 0 : x);
    y = (typeof y === 'undefined' ? 0 : y);

    canvas.getContext('2d').putImageData(bitmap, x, y);

    return canvas;
}

function hasAlphaLayer(bitmap) {
    for (let p = 3; p < bitmap.data.length; p += 4) {
        if (bitmap.data[p] < 255) {
            return true;
        }
    }
    return false;
}

function makeOpaque(bitmap) {
    if (!bitmap) return null;
    for (let p = 3; p < bitmap.data.length; p += 4) {
        bitmap.data[p] = 255;
    }
    return bitmap;
}

function colorFaces(geometry, bitmap, rectangles) {
    if (!rectangles) return null;

    const faces = [];
    const materials = [];
    const materialIndexMap = [];
    let f = 0;
    let side = THREE.FrontSide;
    rectangles.forEach(r => {
        const dh = 4 * Math.sign(r[2]);
        const dv = 4 * Math.sign(r[3]) * bitmap.width;
        const r1 = 4 * (r[1] * bitmap.width + r[0]);
        const r2 = 4 * (r[3] * bitmap.width) + r1;
        for (let p1 = r1, p2 = r1 + 4 * r[2]; p1 !== r2; p1 += dv, p2 += dv) {
            for (let p = p1; p !== p2; p += dh, f += 2) {
                const a = bitmap.data[p + 3];
                if (a < 255) side = THREE.DoubleSide;
                if (a === 0) continue;

                let materialIndex = materialIndexMap[a];
                if (typeof materialIndex === 'undefined') {
                    materials.push(new THREE.MeshLambertMaterial({
                        vertexColors: THREE.FaceColors,
                        opacity: a / 255,
                        transparent: a < 255
                    }));
                    materialIndex = materials.length - 1;
                    materialIndexMap[a] = materialIndex;
                }

                const r = bitmap.data[p] / 255;
                const g = bitmap.data[p + 1] / 255;
                const b = bitmap.data[p + 2] / 255;

                faces.push(new THREE.Face3(f, f + 1, f + 2, null, new THREE.Color(r, g, b), materialIndex));
                faces.push(new THREE.Face3(f + 2, f + 1, f + 3, null, new THREE.Color(r, g, b), materialIndex));
            }
        }
    });

    if (faces.length === 0) return null;

    geometry.faces = faces;
    geometry = new THREE.BufferGeometry().fromGeometry(geometry);

    materials.forEach(m => m.side = side);

    return new THREE.Mesh(geometry, materials);
}

function buildSkinModel(skin, cape, slim, flip) {
    if (skin.width < 64 || skin.height < 32) {
        return null;
    }

    const v = skin.height >= 64 ? 1 : 0;
    const armW = slim ? 3 : 4;

    // Convertir l'image en canvas d'abord
    const skinCanvas = toCanvas(skin);
    if (!skinCanvas) return null;

    const bitmap = getBitmap(skinCanvas);
    let hasAlpha = hasAlphaLayer(bitmap);
    let opaque = hasAlpha ? makeOpaque(getBitmap(skinCanvas)) : bitmap;

    let headGroup = new THREE.Object3D();
    headGroup.position.x = 0;
    headGroup.position.y = 12;
    headGroup.position.z = 0;
    let headBox = new THREE.BoxGeometry(8, 8, 8, 8, 8, 8);
    let headMesh = colorFaces(headBox, opaque, SKIN[v][0][0]);
    headGroup.add(headMesh);
    if (hasAlpha) {
        let hatBox = new THREE.BoxGeometry(9, 9, 9, 8, 8, 8);
        let hatMesh = colorFaces(hatBox, bitmap, SKIN[v][0][1]);
        if (hatMesh) headGroup.add(hatMesh);
    }

    let torsoGroup = new THREE.Object3D();
    torsoGroup.position.x = 0;
    torsoGroup.position.y = 2;
    torsoGroup.position.z = 0;
    let torsoBox = new THREE.BoxGeometry(8 + EPS, 12 + EPS, 4 + EPS, 8, 12, 4);
    let torsoMesh = colorFaces(torsoBox, opaque, SKIN[v][1][0]);
    torsoGroup.add(torsoMesh);
    if (v >= 1 && hasAlpha) {
        let jacketBox = new THREE.BoxGeometry(8.5 + EPS, 12.5 + EPS, 4.5 + EPS, 8, 12, 4);
        let jacketMesh = colorFaces(jacketBox, bitmap, SKIN[v][1][1]);
        if (jacketMesh) torsoGroup.add(jacketMesh);
    }

    let rightArmGroup = new THREE.Object3D();
    rightArmGroup.position.x = slim ? -5.5 : -6;
    rightArmGroup.position.y = 6;
    rightArmGroup.position.z = 0;
    let rightArmBox = new THREE.BoxGeometry(armW, 12, 4, armW, 12, 4).translate(0, -4, 0);
    let rightArmMesh = colorFaces(rightArmBox, opaque, SKIN[v][2][0][slim]);
    rightArmGroup.add(rightArmMesh);
    if (v >= 1 && hasAlpha) {
        let rightSleeveBox = new THREE.BoxGeometry(armW + 0.5 + EPS * 4, 12.5 + EPS * 4, 4.5 + EPS * 4, armW, 12, 4).translate(0, -4, 0);
        let rightSleeveMesh = colorFaces(rightSleeveBox, bitmap, SKIN[v][2][1][slim]);
        if (rightSleeveMesh) rightArmGroup.add(rightSleeveMesh);
    }

    let leftArmGroup = new THREE.Object3D();
    leftArmGroup.position.x = slim ? 5.5 : 6;
    leftArmGroup.position.y = 6;
    leftArmGroup.position.z = 0;
    let leftArmBox = new THREE.BoxGeometry(armW, 12, 4, armW, 12, 4).translate(0, -4, 0);
    let leftArmMesh = colorFaces(leftArmBox, opaque, SKIN[v][3][0][slim]);
    leftArmGroup.add(leftArmMesh);
    if (v >= 1 && hasAlpha) {
        let leftSleeveBox = new THREE.BoxGeometry(armW + 0.5 + EPS * 4, 12.5 + EPS * 4, 4.5 + EPS * 4, armW, 12, 4).translate(0, -4, 0);
        let leftSleeveMesh = colorFaces(leftSleeveBox, bitmap, SKIN[v][3][1][slim]);
        if (leftSleeveMesh) leftArmGroup.add(leftSleeveMesh);
    }

    let rightLegGroup = new THREE.Object3D();
    rightLegGroup.position.x = -2;
    rightLegGroup.position.y = -4;
    rightLegGroup.position.z = 0;
    let rightLegBox = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0);
    let rightLegMesh = colorFaces(rightLegBox, opaque, SKIN[v][4][0]);
    rightLegGroup.add(rightLegMesh);
    if (v >= 1 && hasAlpha) {
        let rightPantBox = new THREE.BoxGeometry(4.5 + EPS * 2, 12.5 + EPS * 2, 4.5 + EPS * 2, 4, 12, 4).translate(0, -6, 0);
        let rightPantMesh = colorFaces(rightPantBox, bitmap, SKIN[v][4][1]);
        if (rightPantMesh) rightLegGroup.add(rightPantMesh);
    }

    let leftLegGroup = new THREE.Object3D();
    leftLegGroup.position.x = 2;
    leftLegGroup.position.y = -4;
    leftLegGroup.position.z = 0;
    let leftLegBox = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0);
    let leftLegMesh = colorFaces(leftLegBox, opaque, SKIN[v][5][0]);
    leftLegGroup.add(leftLegMesh);
    if (v >= 1 && hasAlpha) {
        let leftPantBox = new THREE.BoxGeometry(4.5 + EPS * 3, 12.5 + EPS * 3, 4.5 + EPS * 3, 4, 12, 4).translate(0, -6, 0);
        let leftPantMesh = colorFaces(leftPantBox, bitmap, SKIN[v][5][1]);
        if (leftPantMesh) leftLegGroup.add(leftPantMesh);
    }

    let model = new THREE.Object3D();
    model.add(headGroup);
    model.add(torsoGroup);
    model.add(rightArmGroup);
    model.add(leftArmGroup);
    model.add(rightLegGroup);
    model.add(leftLegGroup);

    if (flip) {
        model.scale.x = -1;
    }

    return model;
}

// Variables globales pour le rendu
let skin3d = {
    canvas: null,
    scene: null,
    camera: null,
    renderer: null,
    model: null,
    modelCache: {},
    id: null,
    modelType: null,
    time: 0,
    startTime: 0,
    animationId: null
};

function renderSkin() {
    if (!skin3d.canvas) return;

    skin3d.id = skin3d.canvas.getAttribute('data-id');
    skin3d.modelType = skin3d.canvas.getAttribute('data-model') || 'classic';

    if (!skin3d.id) return;

    const key = `${skin3d.id}_${skin3d.modelType}`;

    if (!skin3d.modelCache[key]) {
        const skinData = getImage(skin3d.id);
        if (!skinData) return;

        // Convertir la chaîne base64 en objet Image
        toImage(skinData).then(skin => {
            if (skin) {
                skin3d.modelCache[key] = buildSkinModel(skin, null, skin3d.modelType === 'slim', false);
            }
        }).catch(error => {
            console.error('Erreur conversion image:', error);
        });

        // Retourner temporairement null pendant le chargement
        return;
    }

    if (skin3d.model) skin3d.scene.remove(skin3d.model);
    skin3d.model = skin3d.modelCache[key];
    if (!skin3d.scene) {
        skin3d.scene = new THREE.Scene();
        let ambLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
        let dirLight = new THREE.DirectionalLight(0xFFFFFF, 0.3);
        dirLight.position.set(0.678, 0.284, 0.678);
        skin3d.scene.add(ambLight);
        skin3d.scene.add(dirLight);
    }

    if (skin3d.model) {
        skin3d.scene.add(skin3d.model);

        const cosPhi = Math.cos(radians(20));
        skin3d.model.rotation.y = radians(skin3d.time);
        skin3d.model.position.x = 0;
        skin3d.model.position.y = 0;
        skin3d.model.position.z = 0;
    }

    if (!skin3d.camera) {
        skin3d.camera = new THREE.PerspectiveCamera(38, skin3d.canvas.width / skin3d.canvas.height, 60 - 20, 60 + 20);
        skin3d.camera.position.x = 0;
        skin3d.camera.position.y = 0;
        skin3d.camera.position.z = 60;
        skin3d.camera.lookAt(new THREE.Vector3(0, 0, 0));
    }

    if (!skin3d.renderer) {
        skin3d.renderer = new THREE.WebGLRenderer({
            canvas: skin3d.canvas,
            antialias: true,
            alpha: true
        });
        skin3d.renderer.setSize(skin3d.canvas.width, skin3d.canvas.height);
        skin3d.renderer.setClearColor(0x000000, 0);
    }

    skin3d.renderer.render(skin3d.scene, skin3d.camera);
}

function renderSkinLoop() {
    // Pas d'animation - pose par défaut
    skin3d.time = 0; // Angle fixe
    skin3d.canvas.setAttribute('data-time', '0');
    // Pas de requestAnimationFrame - rendu statique
    renderSkin();
}

// Fonction d'initialisation
function initSkinRenderer(canvasId, skinId, modelType = 'classic') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return false;

    skin3d.canvas = canvas;
    skin3d.canvas.setAttribute('data-id', skinId);
    skin3d.canvas.setAttribute('data-model', modelType);

    skin3d.startTime = performance.now();
    renderSkinLoop();

    return true;
}

// Fonction pour arrêter l'animation
function stopSkinRenderer() {
    if (skin3d.animationId) {
        window.cancelAnimationFrame(skin3d.animationId);
        skin3d.animationId = null;
    }
}
