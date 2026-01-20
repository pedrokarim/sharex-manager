import Image from "next/image";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogoSectionProps {
  title: string;
  description: string;
  primaryLabel: string;
  simplifiedLabel: string;
  svgLabel: string;
  downloadLabel: string;
}

export const LogoSection = ({
  title,
  description,
  primaryLabel,
  simplifiedLabel,
  svgLabel,
  downloadLabel,
}: LogoSectionProps) => {
  return (
    <section className="container mx-auto px-4 py-10 sm:py-14">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
          {description}
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{primaryLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background p-6">
              <div className="relative mx-auto h-20 w-20">
                <Image
                  src="/images/logo-sxm.png"
                  alt={primaryLabel}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <a href="/images/logo-sxm.png" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLabel}
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{simplifiedLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background p-6">
              <div className="relative mx-auto h-20 w-20">
                <Image
                  src="/images/logo-sxm-simple.png"
                  alt={simplifiedLabel}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <a href="/images/logo-sxm-simple.png" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLabel}
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{svgLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background p-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center text-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/logo.svg"
                  alt={svgLabel}
                  className="h-20 w-20"
                />
              </div>
            </div>
            <a href="/branding/logo.svg" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLabel}
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

