# ---------------------------------------------------------------
# Node 16 LTS (Bullseye) — closest to Node 17 that actually works
# with headless-gl prebuilt binaries and ANGLE compilation.
#
# Why NOT Node 17?
#   - OpenSSL 3.0 breaks legacy crypto in older packages
#   - No prebuilt headless-gl binaries (non-LTS version)
#   - GCC 11 ANGLE compilation bug (#include <limits> missing)
#
# Why xvfb-run?
#   Three.js WebGLRenderer → node-canvas-webgl → headless-gl
#   → ANGLE → GLX → needs an X11 server.
#   Xvfb provides a virtual X11 framebuffer in memory (no GPU).
# ---------------------------------------------------------------
FROM node:16-bullseye

# System dependencies:
#   - build-essential        : compile native addons (headless-gl, node-canvas)
#   - libcairo2-dev          : 2D graphics engine (node-canvas)
#   - libpango1.0-dev        : text layout (node-canvas)
#   - libjpeg-dev/libgif-dev : image I/O (node-canvas)
#   - librsvg2-dev           : SVG support (node-canvas)
#   - libgl1-mesa-*          : OpenGL / GLX runtime + headers (headless-gl / ANGLE)
#   - libgles2-mesa          : OpenGL ES 2.0 (WebGL is based on GLES2)
#   - libegl1-mesa           : EGL context (fallback)
#   - libgbm-dev             : buffer management (Mesa)
#   - libgl1-mesa-dri        : Mesa DRI software rasterizer (swrast)
#   - libxi-dev              : X11 input extension (build dep)
#   - xvfb                   : virtual framebuffer X11 server
#   - mesa-utils             : glxinfo/glxgears for debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libgl1-mesa-dev \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libegl1-mesa \
    libgles2-mesa \
    libgbm-dev \
    libxi-dev \
    xvfb \
    mesa-utils \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY . .

ENV PORT=3089

EXPOSE 3089

# xvfb-run: starts a virtual X11 server in memory
#   -ac             : disable X11 access control (safe in Docker)
#   -screen 0       : screen number 0
#   1280x1024x24    : resolution + 24-bit true color depth
CMD ["xvfb-run", "-s", "-ac -screen 0 1280x1024x24", "node", "server.js"]
