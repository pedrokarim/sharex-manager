import { Card, CardContent } from "@/components/ui/card";

interface TypographySectionProps {
  title: string;
  description: string;
}

export const TypographySection = ({ title, description }: TypographySectionProps) => {
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

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">H1</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  ShareX Manager
                </h1>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">H2</p>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Une interface moderne
                </h2>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Paragraphe</p>
                <p className="text-muted-foreground">
                  Générez, organisez et partagez vos fichiers en gardant une expérience
                  fluide, responsive et cohérente avec votre thème.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Monospace</p>
                <p className="font-mono text-sm">
                  POST /api/upload  Authorization: Bearer &lt;API_KEY&gt;
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Caption</p>
                <p className="text-xs text-muted-foreground">
                  Texte secondaire, hints, labels et UI microcopy.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Label</p>
                <p className="text-sm font-medium">Configuration</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

