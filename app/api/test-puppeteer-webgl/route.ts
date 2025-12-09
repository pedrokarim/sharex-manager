import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function GET(request: NextRequest) {
  let browser;

  try {
    console.log("Test Puppeteer avec WebGL...");

    // Lancer Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--enable-webgl",
        "--enable-accelerated-2d-canvas",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--ignore-gpu-blacklist",
        "--ignore-gpu-blocklist",
      ],
    });

    const page = await browser.newPage();

    // Définir la taille de la page
    await page.setViewport({ width: 400, height: 400 });

    // Créer une page HTML avec WebGL
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>WebGL Test</title>
        <style>
          body { margin: 0; padding: 20px; background: #1a1a1a; color: white; font-family: Arial; }
          canvas { border: 2px solid #333; background: #000; }
          .info { margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>Test WebGL avec Puppeteer</h2>
        <canvas id="webglCanvas" width="300" height="300"></canvas>
        <div class="info" id="info">Initialisation...</div>
        
        <script>
          const canvas = document.getElementById('webglCanvas');
          const info = document.getElementById('info');
          
          try {
            // Obtenir le contexte WebGL
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (!gl) {
              info.textContent = 'WebGL non supporté';
              throw new Error('WebGL not supported');
            }
            
            info.textContent = 'WebGL supporté ! Rendu en cours...';
            
            // Configuration WebGL basique
            gl.clearColor(0.2, 0.0, 0.8, 1.0); // Bleu foncé
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            // Créer un shader simple
            const vertexShaderSource = \`
              attribute vec2 position;
              void main() {
                gl_Position = vec4(position, 0.0, 1.0);
              }
            \`;
            
            const fragmentShaderSource = \`
              precision mediump float;
              void main() {
                gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0); // Orange
              }
            \`;
            
            // Compiler les shaders
            function createShader(gl, type, source) {
              const shader = gl.createShader(type);
              gl.shaderSource(shader, source);
              gl.compileShader(shader);
              
              if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Erreur compilation shader:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
              }
              
              return shader;
            }
            
            const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
            const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
            
            if (!vertexShader || !fragmentShader) {
              throw new Error('Erreur création shaders');
            }
            
            // Créer le programme
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
              console.error('Erreur lien programme:', gl.getProgramInfoLog(program));
              throw new Error('Erreur lien programme');
            }
            
            // Créer un triangle
            const positions = [
              0.0, 0.5,   // Haut
              -0.5, -0.5, // Bas gauche
              0.5, -0.5   // Bas droite
            ];
            
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            
            // Utiliser le programme
            gl.useProgram(program);
            
            // Configurer l'attribut position
            const positionAttributeLocation = gl.getAttribLocation(program, 'position');
            gl.enableVertexAttribArray(positionAttributeLocation);
            gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
            
            // Dessiner le triangle
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            
            info.textContent = 'Rendu WebGL terminé avec succès !';
            
            // Ajouter un indicateur de succès
            document.body.style.background = 'linear-gradient(45deg, #1a1a1a, #2a2a2a)';
            
          } catch (error) {
            console.error('Erreur WebGL:', error);
            info.textContent = 'Erreur: ' + error.message;
            document.body.style.background = '#4a1a1a'; // Rouge en cas d'erreur
          }
        </script>
      </body>
      </html>
    `;

    // Charger le contenu HTML
    await page.setContent(htmlContent);

    // Attendre que le rendu soit terminé
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Prendre une capture d'écran
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    console.log("Rendu WebGL avec Puppeteer terminé avec succès !");

    return new Response(screenshot as any, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Erreur avec Puppeteer WebGL:", error);
    return NextResponse.json(
      {
        error: true,
        message: "Erreur Puppeteer WebGL",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
