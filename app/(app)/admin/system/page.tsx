import { Settings, Upload, Database } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SystemPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          Configuration système
        </h1>
        <p className="text-muted-foreground mt-2">
          Gérez les paramètres système et la configuration des uploads
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl">
        {/* Configuration des uploads */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Configuration des uploads
            </CardTitle>
            <CardDescription>
              Gérez les paramètres liés aux uploads de fichiers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                Configurez les types de fichiers autorisés, les limites de
                taille, les options de stockage et plus encore.
              </p>
              <Button asChild>
                <Link href="/uploads/config">
                  Accéder à la configuration des uploads
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration système */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Configuration système
            </CardTitle>
            <CardDescription>
              Paramètres système avancés (Bientôt disponible)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                Cette section permettra de configurer les paramètres système
                avancés :
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Gestion de la base de données</li>
                <li>Configuration du cache</li>
                <li>Paramètres de performance</li>
                <li>Options de sauvegarde</li>
                <li>Gestion des tâches planifiées</li>
                <li>Configuration des notifications système</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                Ces fonctionnalités seront disponibles dans une prochaine mise à
                jour.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
