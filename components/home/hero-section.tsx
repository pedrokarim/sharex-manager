"use client";

import { motion } from "framer-motion";
import { ArrowRight, Settings, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeroSectionProps {
  title: string;
  subtitle: string;
  ctaGalleryLabel: string;
  ctaConfigureLabel: string;
  showConfigureCta: boolean;
}

export const HeroSection = ({
  title,
  subtitle,
  ctaGalleryLabel,
  ctaConfigureLabel,
  showConfigureCta,
}: HeroSectionProps) => {
  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background" />
        <motion.div
          aria-hidden="true"
          className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.08, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
          animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.12, 1] }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="container relative mx-auto px-4 py-12 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 flex items-center justify-center"
          >
            <Image
              src="/images/logo-sxm-simple.png"
              alt="ShareX Manager"
              width={84}
              height={84}
              className="h-16 w-16 sm:h-[84px] sm:w-[84px]"
              priority
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mb-4 flex justify-center"
          >
            <Badge variant="secondary" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs">Rapide • Sécurisé • Stylé</span>
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
            className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
          >
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              {title}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18 }}
            className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-xl"
          >
            {subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.26 }}
            className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
          >
            <Link href="/gallery" className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 sm:w-auto">
                {ctaGalleryLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            {showConfigureCta ? (
              <Link href="/settings/api-keys" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2 sm:w-auto"
                >
                  {ctaConfigureLabel}
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

