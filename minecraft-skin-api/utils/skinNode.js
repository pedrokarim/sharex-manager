/*
 * Copyright © 2019 NameMC. All rights reserved.
 * Rewrite for NodeJS by Ahmed Karim aka PedroKarim64
 */

console.log('[Skin Node] Module is now loaded.');

const THREE = require('three');
const fetch = require('node-fetch');
const { createCanvas, loadImage } = require('node-canvas-webgl');
const skinLayout = require('./skinLayout');

const TAU = 2 * Math.PI;
const EPSILON = 1e-3;

const cacheSkin = {};

function radians (d) {
	return d * (TAU / 360);
}

async function hasOptifineCape (username) {
	const url = `https://optifine.net/capes/${username}.png`;
	const res = await fetch(url).then((res) => !!res.ok);

	return res ? url : null;
}

async function getDataSkin (uuid) {
	if (cacheSkin[uuid]) return cacheSkin[uuid];

	console.log('New skin detect go fetch data ...');

	let data;
	const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
		headers: {
			'Content-Type': 'application/json'
		}
	}).then((res) => {
		if (res.ok) {
			try {
				return res.json();
			} catch (e) {
				return res.text();
			}
		}
	});

	if (res) {
		if (res.properties && Array.isArray(res.properties)) {
			res.properties = res.properties.map((v, k) => {
				v.value = JSON.parse(Buffer.from(v.value, 'base64').toString('ascii'));
				return v;
			});
		}
		cacheSkin[uuid] = data = res;
	}

	return data;
}

async function textureSkinUrl (uuid) {
	const res = await getDataSkin(uuid);
	if (res && res.properties && res.properties[0] && res.properties[0].value && res.properties[0].value.textures && res.properties[0].value.textures.SKIN) {
		return res.properties[0].value.textures.SKIN.url;
	}
}

async function textureCapeUrl (uuid) {
	const res = await getDataSkin(uuid);
	if (res) {
		if (res.properties && res.properties[0] && res.properties[0].value && res.properties[0].value.textures && res.properties[0].value.textures.CAPE) {
			return res.properties[0].value.textures.CAPE.url;
		} else {
			return await hasOptifineCape(res.name);
		}
	}
}

function toCanvas (image, x, y, w, h) {
	x = (typeof x === 'undefined' ? 0 : x);
	y = (typeof y === 'undefined' ? 0 : y);
	w = (typeof w === 'undefined' ? image.width : w);
	h = (typeof h === 'undefined' ? image.height : h);

	const canvas = createCanvas(w, h);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(image, x, y, w, h, 0, 0, w, h);

	return canvas;
}

function makeOpaque (image) {
	const canvas = toCanvas(image);
	const ctx = canvas.getContext('2d');
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels = data.data;

	for (let p = 3; p < pixels.length; p += 4) {
		pixels[p] = 255;
	}

	ctx.putImageData(data, 0, 0);

	return canvas;
}

function hasAlphaLayer (image) {
	const canvas = toCanvas(image);
	const ctx = canvas.getContext('2d');
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const pixels = data.data;

	for (let p = 3; p < pixels.length; p += 4) {
		if (pixels[p] !== 255) {
			return true;
		}
	}

	return false;
}

function capeScale (height) {
	if (height % 22 === 0) {
		return height / 22;
	} else if (height % 17 === 0) {
		return height / 17;
	} else if (height >= 32 && (height & (height - 1)) === 0) { // power of 2
		return height / 32;
	} else {
		return Math.max(1, Math.floor(height / 22));
	}
}

/**
 *
 */
async function drawSkin2DSkinHead (options) {
	options = {
		flip: !!options.flip,
		skin: options.skin,
		width: !isNaN(parseInt(options.width)) && parseInt(options.width) > 0 && parseInt(options.width) < 1000 ? parseInt(options.width) : 32,
		height: !isNaN(parseInt(options.height)) && parseInt(options.height) > 0 && parseInt(options.height) < 1000 ? parseInt(options.height) : 32
	};

	const url = await textureSkinUrl(options.skin);
	if (!url) throw new Error('Url skin minecraft not found');

	const image = await loadImage(url);
	if (!image) throw new Error('Image skin no handle.');

	const canvas = createCanvas(options.width, options.height);

	const opaque = makeOpaque(image);
	const ctx = canvas.getContext('2d');
	ctx.mozImageSmoothingEnabled = false;
	ctx.webkitImageSmoothingEnabled = false;
	ctx.msImageSmoothingEnabled = false;
	ctx.imageSmoothingEnabled = false;
	if (options.flip) {
		ctx.translate(options.width, options.height);
		ctx.scale(-1, -1);
	}
	ctx.drawImage(opaque, 8, 8, 8, 8, 0, 0, options.width, options.height);
	if (hasAlphaLayer(image)) {
		ctx.drawImage(image, 40, 8, 8, 8, 0, 0, options.width, options.height);
	}

	return canvas;
}

module.exports.drawSkin2DSkinHead = drawSkin2DSkinHead;

async function drawSkin2DCape (options) {
	options = {
		flip: !!options.flip,
		skin: options.skin,
		width: !isNaN(parseInt(options.width)) && parseInt(options.width) > 0 && parseInt(options.width) < 1000 ? parseInt(options.width) : 40,
		height: !isNaN(parseInt(options.height)) && parseInt(options.height) > 0 && parseInt(options.height) < 1600 ? parseInt(options.height) : 64
	};

	const url = await textureCapeUrl(options.skin);
	if (!url) throw new Error('Url skin minecraft not found');

	const image = await loadImage(url);
	if (!image) throw new Error('Image skin no handle.');

	const canvas = createCanvas(options.width, options.height);

	const cs = image ? capeScale(image.height) : null;

	const opaque = makeOpaque(image);
	const ctx = canvas.getContext('2d');
	ctx.mozImageSmoothingEnabled = false;
	ctx.webkitImageSmoothingEnabled = false;
	ctx.msImageSmoothingEnabled = false;
	ctx.imageSmoothingEnabled = false;
	if (options.flip) {
		ctx.translate(options.width, options.height);
		ctx.scale(-1, -1);
	}
	ctx.drawImage(opaque, cs, cs, 10 * cs, 16 * cs, 0, 0, options.width, options.height);

	return canvas;
}

module.exports.drawSkin2DCape = drawSkin2DCape;

function colorFaces (geometry, canvas, rectangles) {
	if (!rectangles) return null;
	const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
	let f = 0;
	const faces = [];
	const materials = [];
	const materialIndexMap = {};
	let side = THREE.FrontSide;

	Object.keys(rectangles).forEach(function (k) {
		const rect = rectangles[k];
		const width = Math.abs(rect.w);
		const height = Math.abs(rect.h);
		const dj = Math.sign(rect.w);
		const di = Math.sign(rect.h);
		for (let y = 0, i = rect.y; y < height; y++, i += di) {
			for (let x = 0, j = rect.x; x < width; x++, j += dj, f += 2) {
				const p = 4 * (i * canvas.width + j);
				const a = pixels[p + 3];

				if (a === 0) {
					side = THREE.DoubleSide;
					continue;
				}

				let materialIndex = materialIndexMap[a];

				if (typeof materialIndex === 'undefined') {
					materials.push(new THREE.MeshBasicMaterial({
						vertexColors: THREE.FaceColors,
						opacity: a / 255,
						transparent: (a !== 255)
					}));
					materialIndex = materials.length - 1;
					materialIndexMap[a] = materialIndex;
					if (a !== 255) {
						side = THREE.DoubleSide;
					}
				}

				const face1 = geometry.faces[f];
				const face2 = geometry.faces[f + 1];
				face1.color.r = pixels[p] / 255;
				face1.color.g = pixels[p + 1] / 255;
				face1.color.b = pixels[p + 2] / 255;
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

	materials.forEach(function (m) {
		m.side = side;
	});

	return new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry), materials);
}

function buildMinecraftModel (skinImage, capeImage, slim, flip) {
	if (skinImage.width < 64 || skinImage.height < 32) {
		return null;
	}

	const version = (skinImage.height >= 64 ? 1 : 0);
	const cs = capeImage ? capeScale(capeImage.height) : null;

	const opaqueSkinCanvas = makeOpaque(skinImage);
	const transparentSkinCanvas = toCanvas(skinImage);
	const hasAlpha = hasAlphaLayer(skinImage);

	const headGroup = new THREE.Object3D();
	headGroup.position.x = 0;
	headGroup.position.y = 12;
	headGroup.position.z = 0;
	let box = new THREE.BoxGeometry(8, 8, 8, 8, 8, 8);
	const headMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].head[0]);
	headGroup.add(headMesh);
	if (hasAlpha) {
		box = new THREE.BoxGeometry(9, 9, 9, 8, 8, 8);
		const hatMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].head[1]);
		hatMesh && headGroup.add(hatMesh);
	}

	const torsoGroup = new THREE.Object3D();
	torsoGroup.position.x = 0;
	torsoGroup.position.y = 2;
	torsoGroup.position.z = 0;
	box = new THREE.BoxGeometry(8 + EPSILON, 12 + EPSILON, 4 + EPSILON, 8, 12, 4);
	const torsoMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].torso[0]);
	torsoGroup.add(torsoMesh);
	if (version >= 1 && hasAlpha) {
		box = new THREE.BoxGeometry(8.5 + EPSILON, 12.5 + EPSILON, 4.5 + EPSILON, 8, 12, 4);
		const jacketMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].torso[1]);
		jacketMesh && torsoGroup.add(jacketMesh);
	}

	const rightArmGroup = new THREE.Object3D();
	rightArmGroup.position.x = slim ? -5.5 : -6;
	rightArmGroup.position.y = 6;
	rightArmGroup.position.z = 0;
	let rightArmMesh;
	if (slim) {
		box = new THREE.BoxGeometry(3, 12, 4, 3, 12, 4).translate(0, -4, 0);
		rightArmMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].armRS[0]);
	} else {
		box = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -4, 0);
		rightArmMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].armR[0]);
	}
	rightArmGroup.add(rightArmMesh);
	if (version >= 1 && hasAlpha) {
		let rightSleeveMesh;
		if (slim) {
			box = new THREE.BoxGeometry(3.5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, 3, 12, 4).translate(0, -4, 0);
			rightSleeveMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].armRS[1]);
		} else {
			box = new THREE.BoxGeometry(4.5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, 4, 12, 4).translate(0, -4, 0);
			rightSleeveMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].armR[1]);
		}
		rightSleeveMesh && rightArmGroup.add(rightSleeveMesh);
	}

	const leftArmGroup = new THREE.Object3D();
	leftArmGroup.position.x = slim ? 5.5 : 6;
	leftArmGroup.position.y = 6;
	leftArmGroup.position.z = 0;
	let leftArmMesh;
	if (slim) {
		box = new THREE.BoxGeometry(3, 12, 4, 3, 12, 4).translate(0, -4, 0);
		leftArmMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].armLS[0]);
	} else {
		box = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -4, 0);
		leftArmMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].armL[0]);
	}
	leftArmGroup.add(leftArmMesh);
	if (version >= 1 && hasAlpha) {
		let leftSleeveMesh;
		if (slim) {
			box = new THREE.BoxGeometry(3.5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, 3, 12, 4).translate(0, -4, 0);
			leftSleeveMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].armLS[1]);
		} else {
			box = new THREE.BoxGeometry(4.5 + EPSILON * 4, 12.5 + EPSILON * 4, 4.5 + EPSILON * 4, 4, 12, 4).translate(0, -4, 0);
			leftSleeveMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].armL[1]);
		}
		leftSleeveMesh && leftArmGroup.add(leftSleeveMesh);
	}

	const rightLegGroup = new THREE.Object3D();
	rightLegGroup.position.x = -2;
	rightLegGroup.position.y = -4;
	rightLegGroup.position.z = 0;
	box = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0);
	const rightLegMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].legR[0]);
	rightLegGroup.add(rightLegMesh);
	if (version >= 1 && hasAlpha) {
		box = new THREE.BoxGeometry(4.5 + EPSILON * 2, 12.5 + EPSILON * 2, 4.5 + EPSILON * 2, 4, 12, 4).translate(0, -6, 0);
		const rightPantMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].legR[1]);
		rightPantMesh && rightLegGroup.add(rightPantMesh);
	}

	const leftLegGroup = new THREE.Object3D();
	leftLegGroup.position.x = 2;
	leftLegGroup.position.y = -4;
	leftLegGroup.position.z = 0;
	box = new THREE.BoxGeometry(4, 12, 4, 4, 12, 4).translate(0, -6, 0);
	const leftLegMesh = colorFaces(box, opaqueSkinCanvas, skinLayout[version].legL[0]);
	leftLegGroup.add(leftLegMesh);
	if (version >= 1 && hasAlpha) {
		box = new THREE.BoxGeometry(4.5 + EPSILON * 3, 12.5 + EPSILON * 3, 4.5 + EPSILON * 3, 4, 12, 4).translate(0, -6, 0);
		const leftPantMesh = colorFaces(box, transparentSkinCanvas, skinLayout[version].legL[1]);
		leftPantMesh && leftLegGroup.add(leftPantMesh);
	}

	const playerGroup = new THREE.Object3D();
	playerGroup.add(headGroup);
	playerGroup.add(torsoGroup);
	playerGroup.add(rightArmGroup);
	playerGroup.add(leftArmGroup);
	playerGroup.add(rightLegGroup);
	playerGroup.add(leftLegGroup);

	if (capeImage) {
		const capeCanvas = makeOpaque(capeImage);

		const capeGroup = new THREE.Object3D();
		capeGroup.position.x = 0;
		capeGroup.position.y = 8;
		capeGroup.position.z = -2;
		capeGroup.rotation.y += radians(180);
		box = new THREE.BoxGeometry(10, 16, 1, 10 * cs, 16 * cs, 1 * cs).translate(0, -8, 0.5);
		capeGroup.add(colorFaces(box, capeCanvas, {
			left: { x: 11 * cs, y: 1 * cs, w: 1 * cs, h: 16 * cs },
			right: { x: 0 * cs, y: 1 * cs, w: 1 * cs, h: 16 * cs },
			top: { x: 1 * cs, y: 0 * cs, w: 10 * cs, h: 1 * cs },
			bottom: { x: 11 * cs, y: cs - 1, w: 10 * cs, h: -1 * cs },
			front: { x: 1 * cs, y: 1 * cs, w: 10 * cs, h: 16 * cs },
			back: { x: 12 * cs, y: 1 * cs, w: 10 * cs, h: 16 * cs }
		}));
		playerGroup.add(capeGroup);
	}

	if (flip) {
		playerGroup.rotation.z += radians(180);
	}

	return playerGroup;
}

let renderState;
const canvas3dNode = createCanvas(600, 800);

function render () {
	const time = (4 * renderState.frame) % 360;

	const angle = Math.sin(radians(time));
	renderState.model.children[2].rotation.x = -radians(18) * angle;
	renderState.model.children[3].rotation.x = radians(18) * angle;
	renderState.model.children[4].rotation.x = radians(20) * angle;
	renderState.model.children[5].rotation.x = -radians(20) * angle;
	if (renderState.model.children[6]) {
		const capeAngle = Math.sin(radians(renderState.frame));
		renderState.model.children[6].rotation.x = radians(18) - radians(6) * capeAngle;
	}
	renderState.renderer.render(renderState.scene, renderState.camera);
	if (renderState.canvas !== renderState.renderer.domElement) {
		renderState.canvas.getContext('2d').drawImage(renderState.renderer.domElement, 0, 0);
	}
}

let renderer;

function renderSkinHelper (canvas, options, model) {
	if (renderState) {
		renderState.canvas = canvas;
		renderState.scene.remove(renderState.model);
		renderState.model = model;
		renderState.scene.add(model);
		render();
		return;
	}

	if (!renderer) {
		renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
	}

	renderState = {
		canvas: canvas,
		animate: false,
		model: model,
		theta: options.theta,
		phi: options.phi,
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera(32, canvas.width / canvas.height, 72 - 20, 72 + 20),
		renderer: renderer,
		dragState: {},
		frame: options.time / 4
	};

	const origin = new THREE.Vector3(0, 0, 0);

	function positionCamera (camera, theta, phi) {
		const cosPhi = Math.cos(phi);
		camera.position.x = 72 * cosPhi * Math.sin(theta);
		camera.position.z = 72 * cosPhi * Math.cos(theta);
		camera.position.y = 72 * Math.sin(phi);
		camera.lookAt(origin);
	}

	renderState.scene.add(model);

	positionCamera(renderState.camera, radians(renderState.theta), radians(renderState.phi));

	render();
}

const modelCache = {};

async function renderSkin (canvas, options) {
	const identifier = [options.skin, options.slim, options.flip].join(':');

	function handleModel () {
		try {
			renderSkinHelper(canvas, options, modelCache[identifier]);
		} catch (e) {
		}
	}

	if (modelCache[identifier]) {
		handleModel();
	} else {
		const handleImages = (skinImage, capeImage) => {
			const model = buildMinecraftModel(skinImage, capeImage, options.slim, options.flip);
			if (model) {
				modelCache[identifier] = model;
				handleModel();
			}
		};

		const imageSkin = await textureSkinUrl(options.skin);
		if (imageSkin) {
			const imageCape = await textureCapeUrl(options.skin);

			handleImages(await loadImage(imageSkin), imageCape ? await loadImage(imageCape) : null);
		} else {
			throw new Error('Image texture skin no found.');
		}
	}
}

async function drawFullSkin2DNode (options) {
	const isCape = !!options.cape;
	const flip = !!options.flip;

	const url = isCape ? await textureCapeUrl(options.skin) : await textureSkinUrl(options.skin);
	if (!url) throw new Error('Url skin or cape minecraft not found');

	const image = await loadImage(url);
	if (!image) throw new Error('Image skin no handle.');

	const opaque = await makeOpaque(image);
	const canvas = createCanvas(600, 800);
	const ctx = canvas.getContext('2d');
	ctx.save();
	ctx.mozImageSmoothingEnabled = false;
	ctx.webkitImageSmoothingEnabled = false;
	ctx.msImageSmoothingEnabled = false;
	ctx.imageSmoothingEnabled = false;
	if (flip) {
		ctx.translate(canvas.width, canvas.height);
		ctx.scale(-1, -1);
	}
	ctx.translate(canvas.width / 2, canvas.height / 2);

	let scale;
	if (isCape) {
		scale = Math.min(Math.floor(canvas.width / 10), Math.floor(canvas.height / 16)) - 1;
		ctx.scale(scale, scale);

		ctx.drawImage(opaque, 1, 1, 10, 16, -5, -8, 10, 16);
	} else {
		scale = Math.min(Math.floor(canvas.width / 16), Math.floor(canvas.height / 32)) - 1;
		ctx.scale(scale, scale);

		ctx.drawImage(opaque, 8, 8, 8, 8, -4, -16, 8, 8); // face
		ctx.drawImage(opaque, 20, 20, 8, 12, -4, -8, 8, 12); // chest
		ctx.drawImage(opaque, 44, 20, 4, 12, -8, -8, 4, 12); // right arm

		const version = (image.height >= 64 ? 1 : 0);
		if (version === 0) {
			ctx.save();
			ctx.scale(-1, 1);
			ctx.drawImage(opaque, 44, 20, 4, 12, -8, -8, 4, 12); // left arm
			ctx.restore();
		} else {
			ctx.drawImage(opaque, 36, 52, 4, 12, 4, -8, 4, 12); // left arm
		}
		ctx.drawImage(opaque, 4, 20, 4, 12, -4, 4, 4, 12); // right leg
		if (version === 0) {
			ctx.save();
			ctx.scale(-1, 1);
			ctx.drawImage(opaque, 4, 20, 4, 12, -4, 4, 4, 12); // left leg
			ctx.restore();
		} else {
			ctx.drawImage(opaque, 20, 52, 4, 12, 0, 4, 4, 12); // left leg
		}

		if (hasAlphaLayer(image)) {
			ctx.drawImage(image, 40, 8, 8, 8, -4, -16, 8, 8); // mask
			if (version >= 1) {
				ctx.drawImage(image, 20, 36, 8, 12, -4, -8, 8, 12); // jacket
				ctx.drawImage(image, 44, 36, 4, 12, -8, -8, 4, 12); // right sleeve
				ctx.drawImage(image, 52, 52, 4, 12, 4, -8, 4, 12); // left sleeve
				ctx.drawImage(image, 4, 36, 4, 12, -4, 4, 4, 12); // right pant
				ctx.drawImage(image, 4, 52, 4, 12, 0, 4, 4, 12); // left pant
			}
		}
	}
	ctx.restore();

	return canvas;
}

module.exports.drawFullSkin2DNode = drawFullSkin2DNode;

/**
 *
 * @param {{ model?: string, skin: string, flip?: boolean, theta?: number, phi?: number, time?: number }} options
 */
async function drawSkin3DNode (options = {}) {
	options = {
		model: ['slim', 'classic'].includes(options.model) ? options.model : 'slim',
		slim: options.model === 'slim',
		skin: options.skin,
		flip: !!options.flip,
		theta: !isNaN(parseInt(options.theta)) ? options.theta : -30,
		phi: !isNaN(parseInt(options.phi)) ? options.phi : 20,
		time: !isNaN(parseInt(options.time)) ? options.time : 90
	};

	try {
		console.log(`Rending skin with uuid (${options.skin}) goooooo .....`);
		await renderSkin(canvas3dNode, options);

		return renderState.renderer.domElement;
	} catch (error) {
		console.error('[Skin Node]', error);
	}
}

module.exports.drawSkin3DNode = drawSkin3DNode;

module.exports.getDataSkin = getDataSkin;
module.exports.textureSkinUrl = textureSkinUrl;
module.exports.textureCapeUrl = textureCapeUrl;
