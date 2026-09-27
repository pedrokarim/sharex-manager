"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

const loadingMessagesKeys = [
  // Messages classiques
  "loading.messages.preparing_gallery",
  "loading.messages.loading_images",
  "loading.messages.optimizing_display",
  "loading.messages.retrieving_data",
  "loading.messages.configuring_interface",

  // Messages amusants liés à l'IA
  "loading.messages.ai_neurons",
  "loading.messages.consulting_claude",
  "loading.messages.asking_gpt",
  "loading.messages.negotiating_dalle",
  "loading.messages.training_models",
  "loading.messages.meditating",
  "loading.messages.calculating_meaning",
  "loading.messages.downloading_consciousness",
  "loading.messages.aligning_transformers",
  "loading.messages.calibrating_attention",

  // Messages humoristiques
  "loading.messages.feeding_pixels",
  "loading.messages.massaging_tensors",
  "loading.messages.deploying_hamsters",
  "loading.messages.fixing_bugs",
  "loading.messages.reading_manual",
  "loading.messages.counting_pixels",
  "loading.messages.talking_backend",
  "loading.messages.motivating_bytes",
  "loading.messages.resolving_conflicts",
  "loading.messages.negotiating_cache",

  // Messages techniques fun
  "loading.messages.optimizing_prompts",
  "loading.messages.calculating_embeddings",
  "loading.messages.training_llms",
  "loading.messages.deploying_agents",
  "loading.messages.configuring_consciousness",
  "loading.messages.activating_synapses",
  "loading.messages.updating_knowledge",
  "loading.messages.syncing_multiverse",
  "loading.messages.calibrating_sensors",
  "loading.messages.initializing_creativity",
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
  const { t } = useTranslation();
  const [messageKey, setMessageKey] = useState(loadingMessagesKeys[0]);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    if (!showMessage) return;

    const messageInterval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        const randomIndex = Math.floor(
          Math.random() * loadingMessagesKeys.length
        );
        setMessageKey(loadingMessagesKeys[randomIndex]);
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
              {t(messageKey)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("loading.wait_message")}
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
            {t(messageKey)}
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
