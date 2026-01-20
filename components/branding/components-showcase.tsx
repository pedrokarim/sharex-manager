"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Info } from "lucide-react";

interface ComponentsShowcaseProps {
  title: string;
  description: string;
}

export const ComponentsShowcase = ({ title, description }: ComponentsShowcaseProps) => {
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
          <CardHeader>
            <CardTitle className="text-base">Boutons & Badges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Badge</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formulaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branding-email">Email</Label>
              <Input id="branding-email" placeholder="vous@exemple.com" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline">Annuler</Button>
              <Button>Enregistrer</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">États & Navigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Information</AlertTitle>
                <AlertDescription>
                  Ce composant suit automatiquement les couleurs du thème.
                </AlertDescription>
              </Alert>
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Succès</AlertTitle>
                <AlertDescription>
                  Les styles restent cohérents en clair comme en sombre.
                </AlertDescription>
              </Alert>
            </div>

            <Tabs defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">Tab 1</TabsTrigger>
                <TabsTrigger value="two">Tab 2</TabsTrigger>
              </TabsList>
              <TabsContent value="one" className="mt-3">
                <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                  Contenu de l’onglet 1.
                </div>
              </TabsContent>
              <TabsContent value="two" className="mt-3">
                <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                  Contenu de l’onglet 2.
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

