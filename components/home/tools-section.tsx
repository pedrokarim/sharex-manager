"use client";

import Link from "next/link";
import { ArrowRight, Gamepad2, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "@/components/home/motion";

interface ToolsSectionProps {
  title: string;
  subtitle: string;
  minecraftTitle: string;
  minecraftDescription: string;
  minecraftUseToolLabel: string;
  allToolsTitle: string;
  allToolsDescription: string;
  allToolsCta: string;
  comingSoonTitle: string;
  comingSoonDescription: string;
  comingSoonBadge: string;
  availableBadge: string;
}

export const ToolsSection = ({
  title,
  subtitle,
  minecraftTitle,
  minecraftDescription,
  minecraftUseToolLabel,
  allToolsTitle,
  allToolsDescription,
  allToolsCta,
  comingSoonTitle,
  comingSoonDescription,
  comingSoonBadge,
  availableBadge,
}: ToolsSectionProps) => {
  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      </div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-120px" }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08 } },
        }}
        className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
          }}
        >
          <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary transition-transform duration-300 group-hover:scale-110">
                    <Gamepad2 className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{minecraftTitle}</CardTitle>
                    <p className="text-sm text-muted-foreground">Gaming</p>
                  </div>
                </div>
                <Badge variant="secondary">{availableBadge}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{minecraftDescription}</p>
              <Link href="/tools/minecraft-skin" className="mt-5 block">
                <Button className="w-full gap-2">
                  {minecraftUseToolLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
          }}
        >
          <Card className="h-full border-dashed bg-muted/30 transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{comingSoonTitle}</CardTitle>
                    <p className="text-sm text-muted-foreground">Bientôt</p>
                  </div>
                </div>
                <Badge variant="outline">{comingSoonBadge}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{comingSoonDescription}</p>
              <Button variant="outline" className="mt-5 w-full" disabled>
                {comingSoonBadge}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
          }}
        >
          <Card className="group h-full overflow-hidden bg-gradient-to-br from-primary/5 via-card to-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary transition-transform duration-300 group-hover:scale-110">
                  <Wrench className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg">{allToolsTitle}</CardTitle>
                  <p className="text-sm text-muted-foreground">Découvrir</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{allToolsDescription}</p>
              <Link href="/tools" className="mt-5 block">
                <Button variant="outline" className="w-full gap-2">
                  {allToolsCta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </section>
  );
};

