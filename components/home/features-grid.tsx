"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "@/components/home/motion";

export interface FeatureItem {
  icon: ReactNode;
  title: string;
  description: string;
  bullets?: Array<{ icon?: ReactNode; text: string }>;
}

interface FeaturesGridProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  items: FeatureItem[];
}

export const FeaturesGrid = ({ eyebrow, title, subtitle, items }: FeaturesGridProps) => {
  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
        {eyebrow ? (
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        ) : null}
      </div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-120px" }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08 } },
        }}
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
      >
        {items.map((item) => (
          <motion.div
            key={item.title}
            variants={{
              hidden: { opacity: 0, y: 18 },
              show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
            }}
          >
            <Card className="group relative h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              >
                <div className="absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl" />
              </div>

              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                    {item.icon}
                  </span>
                  <span className="text-base">{item.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>

                {item.bullets?.length ? (
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {item.bullets.map((bullet, idx) => (
                      <li key={`${item.title}-${idx}`} className="flex items-center gap-2">
                        {bullet.icon ? (
                          <span className="text-primary">{bullet.icon}</span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        )}
                        <span>{bullet.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};

