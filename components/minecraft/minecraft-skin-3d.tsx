"use client";

import React, { useRef, useEffect, useState } from "react";
import { Play, Pause, Camera, Download } from "lucide-react";
import {
  buildSkinModel,
  radians,
} from "@/lib/minecraft/namemc-renderer.client";
import {
  loadSkinImage,
  loadCapeImage,
} from "@/lib/minecraft/image-loader.client";

interface MinecraftSkin3DProps {
  skinUrl: string;
  capeUrl?: string;
  isSlim?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function MinecraftSkin3DVanilla({
  skinUrl,
  capeUrl,
  isSlim = false,
  width = 400,
  height = 400,
  className = "",
}: MinecraftSkin3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [theta, setTheta] = useState(30);
  const [phi, setPhi] = useState(21);
  const [time, setTime] = useState(90);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Charger Three.js dynamiquement
    const loadThreeJS = async () => {
      try {
        // Charger Three.js depuis CDN
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/three.js/r124/three.min.js";
        script.async = true;

        return new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Three.js"));
          document.head.appendChild(script);
        });
      } catch (error) {
        console.error("Error loading Three.js:", error);
        setError("Impossible de charger Three.js");
        return;
      }
    };

    const init3D = async () => {
      try {
        await loadThreeJS();

        if (!(window as any).THREE) {
          setError("Three.js non disponible");
          return;
        }

        const THREE = (window as any).THREE;

        // Configuration de la scène (comme NameMC)
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          75,
          width / height,
          0.1,
          1000
        );
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });

        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);

        // Éclairage (comme NameMC)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight.position.set(0.678, 0.284, 0.678);
        scene.add(ambientLight);
        scene.add(directionalLight);

        // Charger les images
        const skinImage = await loadSkinImage(skinUrl);
        const capeImage = capeUrl ? await loadCapeImage(capeUrl) : null;

        // Construire le modèle avec le système NameMC
        const model = buildSkinModel(skinImage, capeImage, isSlim, false);

        if (!model) {
          setError("Impossible de construire le modèle 3D");
          return;
        }

        scene.add(model);

        // Position de la caméra (comme NameMC)
        camera.position.set(0, 0, 30);
        camera.lookAt(0, 0, 0);

        // Animation (comme NameMC)
        let animationId: number;
        let startTime = performance.now();

        const animate = () => {
          if (isAnimating) {
            const currentTime =
              ((performance.now() - startTime) * (360 / 1500)) % 1440;
            setTime(currentTime);

            // Animation des bras et jambes (comme NameMC)
            const angle = Math.sin(radians(currentTime));

            // Trouver les groupes d'animations
            const rightArmGroup = model.children.find(
              (child: any) =>
                child.position.x < 0 && Math.abs(child.position.x) > 5
            );
            const leftArmGroup = model.children.find(
              (child: any) =>
                child.position.x > 0 && Math.abs(child.position.x) > 5
            );
            const rightLegGroup = model.children.find(
              (child: any) => child.position.x < 0 && child.position.y < 0
            );
            const leftLegGroup = model.children.find(
              (child: any) => child.position.x > 0 && child.position.y < 0
            );

            if (rightArmGroup) rightArmGroup.rotation.x = -radians(18) * angle;
            if (leftArmGroup) leftArmGroup.rotation.x = radians(18) * angle;
            if (rightLegGroup) rightLegGroup.rotation.x = radians(20) * angle;
            if (leftLegGroup) leftLegGroup.rotation.x = -radians(20) * angle;
          }

          // Rotation du modèle
          model.rotation.x = radians(phi);
          model.rotation.y = radians(theta);

          renderer.render(scene, camera);
          animationId = requestAnimationFrame(animate);
        };

        animate();

        // Contrôles de souris
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;

        const onMouseDown = (event: MouseEvent) => {
          isMouseDown = true;
          mouseX = event.clientX;
          mouseY = event.clientY;
        };

        const onMouseUp = () => {
          isMouseDown = false;
        };

        const onMouseMove = (event: MouseEvent) => {
          if (!isMouseDown) return;

          const deltaX = event.clientX - mouseX;
          const deltaY = event.clientY - mouseY;

          setTheta((prev) => prev + deltaX * 0.5);
          setPhi((prev) => Math.max(-90, Math.min(90, prev - deltaY * 0.5)));

          mouseX = event.clientX;
          mouseY = event.clientY;
        };

        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("mousemove", onMouseMove);

        setIsLoaded(true);

        // Cleanup
        return () => {
          cancelAnimationFrame(animationId);
          canvas.removeEventListener("mousedown", onMouseDown);
          canvas.removeEventListener("mouseup", onMouseUp);
          canvas.removeEventListener("mousemove", onMouseMove);
          renderer.dispose();
        };
      } catch (error) {
        console.error("Erreur lors de l'initialisation 3D:", error);
        setError("Erreur lors du rendu 3D");
      }
    };

    init3D();
  }, [skinUrl, capeUrl, isSlim, width, height, isAnimating, theta, phi]);

  if (error) {
    return (
      <div
        className={`bg-gray-900 rounded-lg flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-center text-white">
          <div className="text-red-400 mb-2">⚠️</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-gray-900 rounded-lg overflow-hidden relative ${className}`}
      style={{ width, height }}
    >
      {/* Fond à damier comme NameMC */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #333 25%, transparent 25%), 
            linear-gradient(-45deg, #333 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #333 75%), 
            linear-gradient(-45deg, transparent 75%, #333 75%)
          `,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      />

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full cursor-move relative z-10"
        style={{ background: "transparent" }}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
          <div className="text-white">Chargement du rendu 3D...</div>
        </div>
      )}

      {/* Contrôles comme NameMC */}
      {isLoaded && (
        <div className="absolute top-2 right-2 flex flex-col gap-2 z-20">
          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className="bg-black/70 text-white p-2 rounded hover:bg-black/90 transition-colors"
            title={isAnimating ? "Pause" : "Play"}
          >
            {isAnimating ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            className="bg-black/70 text-white p-2 rounded hover:bg-black/90 transition-colors"
            title="Capture"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            className="bg-black/70 text-white p-2 rounded hover:bg-black/90 transition-colors"
            title="Télécharger"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Badge de cape comme NameMC */}
      {isLoaded && capeUrl && (
        <div className="absolute top-2 left-2 z-20">
          <div className="bg-green-600 text-white px-2 py-1 rounded text-xs">
            Cape: Disponible
          </div>
        </div>
      )}

      {/* Instructions */}
      {isLoaded && (
        <div className="absolute bottom-2 left-2 text-white text-xs bg-black/70 px-2 py-1 rounded z-20">
          Cliquez et glissez pour tourner
        </div>
      )}
    </div>
  );
}
