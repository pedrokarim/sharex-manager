"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const loadingMessages = [
  // Messages classiques
  "Préparation de votre galerie...",
  "Chargement des images...",
  "Optimisation de l'affichage...",
  "Récupération des données...",
  "Configuration de l'interface...",

  // Messages amusants liés à l'IA
  "Réveil des neurones artificiels...",
  "Consultation de Claude pour des conseils...",
  "Demande à GPT-4 de faire plus vite...",
  "Négociation avec DALL-E pour les miniatures...",
  "Formation accélérée des modèles...",
  "Méditation profonde avec Stable Diffusion...",
  "Calcul du sens de la vie numérique...",
  "Téléchargement de la conscience artificielle...",
  "Alignement des transformers...",
  "Calibration des attention heads...",

  // Messages humoristiques
  "Nourrissage des pixels affamés...",
  "Massage des tenseurs stressés...",
  "Déploiement des hamsters quantiques...",
  "Réparation des bugs qui n'existent pas...",
  "Lecture du manuel d'utilisation (enfin presque)...",
  "Comptage des pixels jusqu'à l'infini...",
  "Tentative de discussion avec le backend...",
  "Motivation des octets paresseux...",
  "Résolution des conflits entre les composants...",
  "Négociation avec le cache récalcitrant...",

  // Messages techniques fun
  "Optimisation des prompts vectoriels...",
  "Calcul des embeddings multidimensionnels...",
  "Entraînement des LLMs de poche...",
  "Déploiement des agents autonomes...",
  "Configuration du flux de conscience numérique...",
  "Activation des synapses artificielles...",
  "Mise à jour de la base de connaissances...",
  "Synchronisation des multivers parallèles...",
  "Calibration des capteurs émotionnels...",
  "Initialisation du module de créativité...",
];

interface LoadingProps {
  className?: string;
  fullScreen?: boolean;
  fullHeight?: boolean;
  variant?: "default" | "minimal" | "spinner";
  size?: "sm" | "md" | "lg";
  showMessage?: boolean;
}

export function Loading({
  className,
  fullScreen = false,
  fullHeight = false,
  variant = "default",
  size = "md",
  showMessage = true,
}: LoadingProps) {
  const [message, setMessage] = useState(loadingMessages[0]);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    if (!showMessage) return;

    const messageInterval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * loadingMessages.length);
        setMessage(loadingMessages[randomIndex]);
        setFadeIn(true);
      }, 200);
    }, 2000);

    return () => {
      clearInterval(messageInterval);
    };
  }, [showMessage]);

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const variants = {
    default: (
      <>
        <div className="relative">
          <div className="absolute inset-0 animate-ping">
            <Loader2
              className={cn(sizeClasses[size], "animate-none opacity-20")}
            />
          </div>
          <Loader2
            className={cn(sizeClasses[size], "animate-spin text-primary")}
          />
        </div>
        {showMessage && (
          <div className="text-center max-w-md mx-auto">
            <p
              className={cn(
                "text-lg font-medium transition-opacity duration-200",
                fadeIn ? "opacity-100" : "opacity-0"
              )}
            >
              {message}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Veuillez patienter un instant pendant que nos IAs s'activent...
            </p>
          </div>
        )}
      </>
    ),
    minimal: (
      <div className="flex items-center gap-2">
        <Loader2
          className={cn(sizeClasses[size], "animate-spin text-primary")}
        />
        {showMessage && (
          <p
            className={cn(
              "text-muted-foreground transition-opacity duration-200",
              fadeIn ? "opacity-100" : "opacity-0",
              className
            )}
          >
            {message}
          </p>
        )}
      </div>
    ),
    spinner: (
      <Loader2 className={cn(sizeClasses[size], "animate-spin text-primary")} />
    ),
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center space-y-4",
        fullScreen && "fixed inset-0 bg-background/80 backdrop-blur-sm z-50",
        fullHeight && "h-full",
        variant === "minimal" && "flex-row space-y-0",
        variant !== "minimal" && className
      )}
    >
      {variants[variant]}
    </div>
  );
}
