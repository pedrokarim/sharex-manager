import { Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SecurityPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Sécurité
        </h1>
        <p className="text-muted-foreground mt-2">
          Configuration des paramètres de sécurité avancés
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Fonctionnalité à venir
          </CardTitle>
          <CardDescription>
            Cette section est en cours de développement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>
              La configuration avancée de la sécurité sera bientôt disponible.
              Cette section permettra de :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Configurer les politiques de mots de passe</li>
              <li>Gérer l'authentification à deux facteurs (2FA)</li>
              <li>Définir les restrictions d'accès IP</li>
              <li>Configurer les sessions et leur durée de vie</li>
              <li>
                Gérer les tentatives de connexion et le blocage automatique
              </li>
              <li>Mettre en place des alertes de sécurité</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Revenez bientôt pour découvrir ces nouvelles fonctionnalités !
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
