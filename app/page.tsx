import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Upload,
  Shield,
  Image as ImageIcon,
  Image,
} from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

export default function HomePage() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <main className="flex-1">
        {/* Hero Section */}
        <div className="container mx-auto px-4 py-16">
          {/* use Image from lucide react as logo */}
          <div className="text-center p-3">
            <Image className="w-16 h-16 mx-auto" />
          </div>
          <div className="mb-16 text-center">
            <h1 className="mb-4 text-4xl font-bold">ShareX Manager</h1>
            <p className="mb-8 text-xl text-muted-foreground">
              Gérez facilement vos captures d'écran et fichiers uploadés via
              ShareX
            </p>
            <Link href="/gallery">
              <Button size="lg">
                Accéder à la galerie
                <ArrowRight className="ml-2" />
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="mb-16 grid gap-8 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Simple
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Uploadez vos fichiers instantanément via ShareX avec une
                  configuration simple
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Sécurisé
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Accès protégé par authentification pour gérer vos fichiers en
                  toute sécurité
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Gestion Facile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Interface intuitive pour visualiser, partager et gérer vos
                  uploads
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ShareX Configuration */}
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-2xl font-bold">Configuration ShareX</h2>
            <Card>
              <CardContent className="p-6">
                <p className="mb-4">
                  Pour configurer ShareX avec ce serveur, suivez ces étapes :
                </p>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>Ouvrez ShareX</li>
                  <li>
                    Allez dans{" "}
                    <code className="rounded bg-muted px-1">Destinations</code>{" "}
                    →{" "}
                    <code className="rounded bg-muted px-1">
                      Destination Settings
                    </code>
                  </li>
                  <li>
                    Dans{" "}
                    <code className="rounded bg-muted px-1">
                      Custom Uploader Settings
                    </code>
                    , configurez :
                    <ul className="mt-2 list-disc pl-4">
                      <li>
                        Request URL:{" "}
                        <code className="rounded bg-muted px-1">
                          {`${
                            process.env.NEXT_PUBLIC_API_URL ||
                            "http://localhost:3000"
                          }/api/upload`}
                        </code>
                      </li>
                      <li>
                        Method:{" "}
                        <code className="rounded bg-muted px-1">POST</code>
                      </li>
                      <li>
                        File form name:{" "}
                        <code className="rounded bg-muted px-1">file</code>
                      </li>
                    </ul>
                  </li>
                  <li>Testez la configuration avec le bouton "Test"</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
