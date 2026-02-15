const express = require('express');
const fetch = require('node-fetch');
const app = express();

const skinNode = require('./utils/skinNode');

const PORT = process.env.PORT || 3089;

// Health check
app.get('/health', (req, res) => {
	res.json({ status: 'ok', service: 'minecraft-skin-api' });
});

// --------------------------------------------------------------------------
// GET /api/namemc/mcbody.png
// Render 3D animated body
// Example: /api/namemc/mcbody.png?skin=<UUID>&model=classic&theta=-30&phi=20&time=90
// --------------------------------------------------------------------------
app.get('/api/namemc/mcbody.png', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const canvas = await skinNode.drawSkin3DNode({ ...req.query });

		if (canvas) {
			res.setHeader('Content-Type', 'image/png');
			res.send(canvas.toBuffer());
		} else {
			res.status(404).json({ error: true, message: 'Skin no handle.' });
		}
	} catch (e) {
		console.error('[mcbody]', e);
		res.status(500).json({ error: true, message: 'An error occurred during rendering.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/mchead.png
// Render 2D head
// Example: /api/namemc/mchead.png?skin=<UUID>&width=126&height=126
// --------------------------------------------------------------------------
app.get('/api/namemc/mchead.png', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const canvas = await skinNode.drawSkin2DSkinHead({ ...req.query });

		if (canvas) {
			res.setHeader('Content-Type', 'image/png');
			res.send(canvas.toBuffer());
		} else {
			res.status(404).json({ error: true, message: 'Skin no handle.' });
		}
	} catch (e) {
		console.error('[mchead]', e);
		res.status(500).json({ error: true, message: 'An error occurred during rendering skin.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/mccape.png
// Render cape (Mojang or Optifine)
// Example: /api/namemc/mccape.png?skin=<UUID>&width=100&height=160
// --------------------------------------------------------------------------
app.get('/api/namemc/mccape.png', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const canvas = await skinNode.drawSkin2DCape({ ...req.query });

		if (canvas) {
			res.setHeader('Content-Type', 'image/png');
			res.send(canvas.toBuffer());
		} else {
			res.status(404).json({ error: true, message: 'Skin cape no handle.' });
		}
	} catch (e) {
		console.error('[mccape]', e);
		res.status(500).json({ error: true, message: 'An error occurred during rendering skin cape.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/mcskin.png
// Render full 2D body skin
// Example: /api/namemc/mcskin.png?skin=<UUID>
// --------------------------------------------------------------------------
app.get('/api/namemc/mcskin.png', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const canvas = await skinNode.drawFullSkin2DNode({ ...req.query });

		if (canvas) {
			res.setHeader('Content-Type', 'image/png');
			res.send(canvas.toBuffer());
		} else {
			res.status(404).json({ error: true, message: 'Skin no handle.' });
		}
	} catch (e) {
		console.error('[mcskin]', e);
		res.status(500).json({ error: true, message: 'An error occurred during rendering skin.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/texture/skin?skin=<UUID>
// Proxy the raw skin texture PNG from Mojang (64x64 or 64x32)
// --------------------------------------------------------------------------
app.get('/api/namemc/texture/skin', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const url = await skinNode.textureSkinUrl(req.query.skin);

		if (!url) {
			return res.status(404).json({ error: true, message: 'Skin texture not found for this UUID.' });
		}

		const response = await fetch(url);

		if (!response.ok) {
			return res.status(502).json({ error: true, message: 'Failed to fetch texture from Mojang.' });
		}

		res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
		response.body.pipe(res);
	} catch (e) {
		console.error('[texture/skin]', e);
		res.status(500).json({ error: true, message: 'An error occurred while fetching skin texture.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/texture/cape?skin=<UUID>
// Proxy the raw cape texture PNG from Mojang or Optifine
// --------------------------------------------------------------------------
app.get('/api/namemc/texture/cape', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const url = await skinNode.textureCapeUrl(req.query.skin);

		if (!url) {
			return res.status(404).json({ error: true, message: 'Cape texture not found for this UUID.' });
		}

		const response = await fetch(url);

		if (!response.ok) {
			return res.status(502).json({ error: true, message: 'Failed to fetch cape texture.' });
		}

		res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
		response.body.pipe(res);
	} catch (e) {
		console.error('[texture/cape]', e);
		res.status(500).json({ error: true, message: 'An error occurred while fetching cape texture.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/profile?skin=<UUID>
// Return the full Mojang profile data (UUID, name, textures URLs, etc.)
// --------------------------------------------------------------------------
app.get('/api/namemc/profile', async (req, res) => {
	if (!req.query.skin) {
		return res.status(400).json({ error: true, message: 'Params skin is missing.' });
	}

	try {
		const data = await skinNode.getDataSkin(req.query.skin);

		if (!data) {
			return res.status(404).json({ error: true, message: 'Profile not found for this UUID.' });
		}

		res.json(data);
	} catch (e) {
		console.error('[profile]', e);
		res.status(500).json({ error: true, message: 'An error occurred while fetching profile.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/uuid/:username
// Convert a Minecraft username to UUID
// Uses the new minecraftservices.com endpoint (the old api.mojang.com one
// has been unreliable since January 2025 with random 403 errors)
// --------------------------------------------------------------------------
app.get('/api/namemc/uuid/:username', async (req, res) => {
	const username = req.params.username;

	if (!username) {
		return res.status(400).json({ error: true, message: 'Username is missing.' });
	}

	try {
		const response = await fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`);

		if (!response.ok) {
			return res.status(404).json({ error: true, message: 'Player not found.' });
		}

		const data = await response.json();
		res.json(data);
	} catch (e) {
		console.error('[uuid]', e);
		res.status(500).json({ error: true, message: 'An error occurred while looking up username.' });
	}
});

// --------------------------------------------------------------------------
// GET /api/namemc/namehistory/:uuid
// Minecraft name history — NOTE: Mojang removed this endpoint in Sept. 2022
// for privacy reasons. There is NO official replacement.
// This route falls back to a third-party API (laby.net) which cached
// historical data before the removal.
// --------------------------------------------------------------------------
app.get('/api/namemc/namehistory/:uuid', async (req, res) => {
	const uuid = req.params.uuid;

	if (!uuid) {
		return res.status(400).json({ error: true, message: 'UUID is missing.' });
	}

	try {
		// Try laby.net API (has cached historical name data)
		const labyRes = await fetch(`https://laby.net/api/user/${uuid}/get-names`);

		if (labyRes.ok) {
			const names = await labyRes.json();
			return res.json({
				uuid,
				source: 'laby.net',
				note: 'Mojang removed the official name history API in September 2022. This data comes from a third-party cache and may be incomplete.',
				names
			});
		}

		// Fallback: return current name from Mojang profile
		const profile = await skinNode.getDataSkin(uuid);

		if (profile) {
			return res.json({
				uuid,
				source: 'mojang-profile',
				note: 'Name history is no longer available from Mojang (removed Sept. 2022). Only the current name is returned.',
				names: [{ name: profile.name }]
			});
		}

		res.status(404).json({ error: true, message: 'Player not found.' });
	} catch (e) {
		console.error('[namehistory]', e);
		res.status(500).json({ error: true, message: 'An error occurred while fetching name history.' });
	}
});

app.listen(PORT, () => {
	console.log(`[Minecraft Skin API] Running on port ${PORT}`);
});
