import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function GET(request: NextRequest) {
  let browser;

  try {
    console.log("Test Puppeteer Three.js simple...");

    // Lancer Puppeteer en mode visible pour debug
    browser = await puppeteer.launch({
      headless: false, // Mode visible pour voir ce qui se passe
      devtools: true, // Ouvrir les DevTools automatiquement
      slowMo: 100, // Ralentir les actions pour mieux voir
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
        "--window-size=800,1000", // Taille de fenêtre fixe
      ],
    });

    const page = await browser.newPage();

    // Définir la taille de la page
    await page.setViewport({ width: 600, height: 800 });

    // Créer une page HTML très simple
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Three.js Test</title>
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background: #1a1a1a; 
      color: white; 
      font-family: Arial; 
      text-align: center;
    }
    canvas { 
      border: 2px solid #333; 
      background: #000; 
      margin: 20px;
    }
    .info { 
      margin: 10px 0; 
    }
    button {
      padding: 10px 20px;
      background: #4a4a4a;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 10px;
    }
    button:hover {
      background: #5a5a5a;
    }
  </style>
</head>
<body>
  <h2>Test Three.js Simple</h2>
  <div class="info" id="info">Chargement...</div>
  
  <button id="toggleBtn">Toggle Animation</button>
  <div class="info">Rotation: <span id="rotation">0°</span></div>
  
  <canvas id="canvas" width="400" height="400"></canvas>
  
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    let scene, camera, renderer, cube;
    let isAnimating = true;
    let rotation = 0;
    
    const info = document.getElementById('info');
    const canvas = document.getElementById('canvas');
    const rotationDisplay = document.getElementById('rotation');
    const toggleBtn = document.getElementById('toggleBtn');
    
    function toggleAnimation() {
      isAnimating = !isAnimating;
      console.log('Animation toggled:', isAnimating);
    }
    
    function updateRotation() {
      rotationDisplay.textContent = Math.round(rotation) + '°';
    }
    
    function init() {
      try {
        info.textContent = 'Initialisation Three.js...';
        
        if (typeof THREE === 'undefined') {
          throw new Error('Three.js non chargé');
        }
        
        info.textContent = 'Three.js chargé !';
        
        // Créer la scène
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222222);
        
        // Créer la caméra
        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 5;
        
        // Créer le renderer
        renderer = new THREE.WebGLRenderer({ 
          canvas: canvas, 
          antialias: true 
        });
        renderer.setSize(400, 400);
        
        // Créer un cube
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          wireframe: true 
        });
        cube = new THREE.Mesh(geometry, material);
        scene.add(cube);
        
        info.textContent = 'Cube créé ! Animation démarrée ✅';
        
        // Démarrer l'animation
        animate();
        
      } catch (error) {
        console.error('Erreur:', error);
        info.textContent = 'Erreur: ' + error.message;
      }
    }
    
    function animate() {
      requestAnimationFrame(animate);
      
      if (isAnimating && cube) {
        rotation += 1;
        cube.rotation.x = THREE.MathUtils.degToRad(rotation);
        cube.rotation.y = THREE.MathUtils.degToRad(rotation * 0.5);
        updateRotation();
      }
      
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    }
    
    // Attacher l'événement
    toggleBtn.addEventListener('click', toggleAnimation);
    
    // Attendre que Three.js soit chargé
    function waitForThree() {
      if (typeof THREE !== 'undefined') {
        init();
      } else {
        setTimeout(waitForThree, 100);
      }
    }
    
    waitForThree();
  </script>
</body>
</html>`;

    // Charger le contenu HTML
    await page.setContent(htmlContent);

    // Attendre que l'animation soit démarrée
    await page.waitForFunction(
      () => {
        const info = document.getElementById("info");
        return info && info.textContent.includes("Animation démarrée ✅");
      },
      { timeout: 15000 }
    );

    // Attendre quelques secondes pour voir l'animation
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Prendre une capture d'écran
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    console.log("Rendu Three.js avec Puppeteer terminé avec succès !");
    console.log(
      "Le navigateur reste ouvert pour que tu puisses voir le résultat..."
    );

    return new Response(screenshot as any, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Erreur avec Puppeteer Three.js:", error);
    return NextResponse.json(
      {
        error: true,
        message: "Erreur Puppeteer Three.js",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  } finally {
    // En mode debug, on ne ferme pas automatiquement le navigateur
    // Tu peux le fermer manuellement quand tu as fini de regarder
    // if (browser) {
    //   await browser.close();
    // }
  }
}
