"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowRight } from "lucide-react";

export function MinecraftSkinPageClient() {
  return (
    <div className="container mx-auto flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-lg w-full text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Minecraft Skin Viewer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Ce service a été migré vers une plateforme dédiée.
          </p>
          <Button asChild size="lg" className="gap-2">
            <a
              href="http://mcinfo.ascencia.re/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Accéder au nouveau service
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
