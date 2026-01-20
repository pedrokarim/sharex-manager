"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "@/components/home/motion";
import { AnimatedCounter } from "@/components/home/animated-counter";

export interface CtaStat {
  label: string;
  value: number;
  suffix?: string;
}

interface CtaSectionProps {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  stats?: CtaStat[];
}

export const CtaSection = ({
  title,
  subtitle,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  stats,
}: CtaSectionProps) => {
  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-sm sm:p-12"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            {subtitle}
          </p>

          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href={primaryCtaHref} className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 sm:w-auto">
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            {secondaryCtaLabel && secondaryCtaHref ? (
              <Link href={secondaryCtaHref} className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  {secondaryCtaLabel}
                </Button>
              </Link>
            ) : null}
          </div>

          {stats?.length ? (
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <Card key={stat.label} className="bg-card/60">
                  <CardContent className="p-5">
                    <div className="text-2xl font-semibold tracking-tight">
                      <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
    </section>
  );
};

