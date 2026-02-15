"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
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
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const animationIdRef = useRef<number>(0);
  const thetaRef = useRef(30);
  const phiRef = useRef(21);
  const isAnimatingRef = useRef(true);

  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);

  const toggleAnimation = useCallback(() => {
    isAnimatingRef.current = !isAnimatingRef.current;
    setIsAnimating(isAnimatingRef.current);
  }, []);

  const captureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Force a render to ensure the canvas is up-to-date
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    const dataUrl = canvas.toDataURL("image/png");
    // Copy to clipboard
    canvas.toBlob((blob) => {
      if (blob) {
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": blob })])
          .catch(() => {
            // Fallback: open in new tab
            window.open(dataUrl, "_blank");
          });
      }
    });
  }, []);

  const downloadSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Force a render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "minecraft-skin-3d.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup: (() => void) | undefined;

    const loadThreeJS = async () => {
      // Check if Three.js is already loaded
      if ((window as any).THREE) return;

      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r124/three.min.js";
      script.async = true;

      return new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Three.js"));
        document.head.appendChild(script);
      });
    };

    const init3D = async () => {
      try {
        await loadThreeJS();

        if (!(window as any).THREE) {
          setError("Three.js non disponible");
          return;
        }

        const THREE = (window as any).THREE;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          75,
          width / height,
          0.1,
          1000
        );
        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          preserveDrawingBuffer: true,
        });

        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);

        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight.position.set(0.678, 0.284, 0.678);
        scene.add(ambientLight);
        scene.add(directionalLight);

        // Load images
        const skinImage = await loadSkinImage(skinUrl);
        const capeImage = capeUrl ? await loadCapeImage(capeUrl) : null;

        // Build model
        const model = buildSkinModel(skinImage, capeImage, isSlim, false);

        if (!model) {
          setError("Impossible de construire le modele 3D");
          return;
        }

        scene.add(model);
        modelRef.current = model;

        camera.position.set(0, 0, 30);
        camera.lookAt(0, 0, 0);

        // Animation
        let startTime = performance.now();

        const animate = () => {
          if (isAnimatingRef.current) {
            const currentTime =
              ((performance.now() - startTime) * (360 / 1500)) % 1440;
            const angle = Math.sin(radians(currentTime));

            // Animate arms and legs by index (known structure)
            // model children: head(0), torso(1), rightArm(2), leftArm(3), rightLeg(4), leftLeg(5), [cape(6)]
            const rightArm = model.children[2];
            const leftArm = model.children[3];
            const rightLeg = model.children[4];
            const leftLeg = model.children[5];

            if (rightArm) rightArm.rotation.x = -radians(18) * angle;
            if (leftArm) leftArm.rotation.x = radians(18) * angle;
            if (rightLeg) rightLeg.rotation.x = radians(20) * angle;
            if (leftLeg) leftLeg.rotation.x = -radians(20) * angle;
          }

          // Rotation from refs (no state dependency)
          model.rotation.x = radians(phiRef.current);
          model.rotation.y = radians(thetaRef.current);

          renderer.render(scene, camera);
          animationIdRef.current = requestAnimationFrame(animate);
        };

        animate();

        // Mouse controls
        let isMouseDown = false;
        let mouseX = 0;
        let mouseY = 0;

        const onMouseDown = (event: MouseEvent) => {
          event.preventDefault();
          isMouseDown = true;
          mouseX = event.screenX;
          mouseY = event.screenY;
        };

        const onMouseUp = () => {
          isMouseDown = false;
        };

        const onMouseMove = (event: MouseEvent) => {
          if (!isMouseDown) return;
          thetaRef.current += event.screenX - mouseX;
          phiRef.current = Math.max(
            -90,
            Math.min(90, phiRef.current + (event.screenY - mouseY))
          );
          mouseX = event.screenX;
          mouseY = event.screenY;
        };

        // Touch controls
        const onTouchStart = (event: TouchEvent) => {
          event.preventDefault();
          const touch = event.changedTouches[0];
          if (touch) {
            isMouseDown = true;
            mouseX = touch.screenX;
            mouseY = touch.screenY;
          }
        };

        const onTouchMove = (event: TouchEvent) => {
          if (!isMouseDown) return;
          const touch = event.changedTouches[0];
          if (touch) {
            thetaRef.current += touch.screenX - mouseX;
            phiRef.current = Math.max(
              -90,
              Math.min(90, phiRef.current + (touch.screenY - mouseY))
            );
            mouseX = touch.screenX;
            mouseY = touch.screenY;
          }
          event.preventDefault();
        };

        const onTouchEnd = () => {
          isMouseDown = false;
        };

        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("touchstart", onTouchStart, { passive: false });
        canvas.addEventListener("touchmove", onTouchMove, { passive: false });
        canvas.addEventListener("touchend", onTouchEnd);

        setIsLoaded(true);

        cleanup = () => {
          cancelAnimationFrame(animationIdRef.current);
          canvas.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mouseup", onMouseUp);
          window.removeEventListener("mousemove", onMouseMove);
          canvas.removeEventListener("touchstart", onTouchStart);
          canvas.removeEventListener("touchmove", onTouchMove);
          canvas.removeEventListener("touchend", onTouchEnd);
          renderer.dispose();
        };
      } catch (err) {
        console.error("Erreur lors de l'initialisation 3D:", err);
        setError("Erreur lors du rendu 3D");
      }
    };

    init3D();

    return () => {
      cleanup?.();
    };
  }, [skinUrl, capeUrl, isSlim, width, height]);

  if (error) {
    return (
      <div
        className={`bg-gray-900 rounded-lg flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <div className="text-center text-white">
          <div className="text-red-400 mb-2">!</div>
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
      {/* Checkerboard background */}
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

      {/* Controls */}
      {isLoaded && (
        <div className="absolute top-2 right-2 flex flex-col gap-2 z-20">
          <button
            onClick={toggleAnimation}
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
            onClick={captureCanvas}
            className="bg-black/70 text-white p-2 rounded hover:bg-black/90 transition-colors"
            title="Copier dans le presse-papier"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            onClick={downloadSnapshot}
            className="bg-black/70 text-white p-2 rounded hover:bg-black/90 transition-colors"
            title="Telecharger"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cape badge */}
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
