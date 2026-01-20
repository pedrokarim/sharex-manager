import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DownloadAssetsProps {
  title: string;
  description: string;
  downloadKitLabel: string;
  downloadLogoPngLabel: string;
  downloadLogoSimplePngLabel: string;
  downloadLogoSvgLabel: string;
}

export const DownloadAssets = ({
  title,
  description,
  downloadKitLabel,
  downloadLogoPngLabel,
  downloadLogoSimplePngLabel,
  downloadLogoSvgLabel,
}: DownloadAssetsProps) => {
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

      <div className="mx-auto max-w-5xl">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">{downloadKitLabel}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <a href="/images/logo-sxm.png" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLogoPngLabel}
              </Button>
            </a>
            <a href="/images/logo-sxm-simple.png" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLogoSimplePngLabel}
              </Button>
            </a>
            <a href="/branding/logo.svg" download>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                {downloadLogoSvgLabel}
              </Button>
            </a>
            <Button className="w-full gap-2" disabled>
              <Download className="h-4 w-4" />
              {downloadKitLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

