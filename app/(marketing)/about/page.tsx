import { Metadata } from "next";
import {
  Target,
  Sparkles,
  Users,
  Shield,
  Workflow,
  Globe,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const metadata: Metadata = {
  title: "À propos | ShareX Manager",
  description:
    "Découvrez ShareX Manager, la solution ultime pour gérer vos uploads d'images et de fichiers.",
};

const sections = [
  {
    id: "mission",
    title: "Notre Mission",
    icon: Target,
  },
  {
    id: "features",
    title: "Fonctionnalités",
    icon: Sparkles,
  },
  {
    id: "team",
    title: "Notre Équipe",
    icon: Users,
  },
];

export default function AboutPage() {
  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="hidden lg:block sticky top-14 h-screen w-64 overflow-y-auto border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <ScrollArea className="py-6 pr-6 lg:py-8">
          <div className="space-y-4">
            <div className="px-4 py-2">
              <h2 className="text-lg font-semibold">Sur cette page</h2>
            </div>
            <nav className="space-y-1 px-4">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <section.icon className="h-4 w-4" />
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <main className="flex-1 container py-8 px-4">
        <div className="prose dark:prose-invert max-w-none">
          <section id="mission" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Target className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold mt-0">Notre Mission</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="text-lg mb-4">
                ShareX Manager est né de la volonté de simplifier la gestion et
                le partage de fichiers pour les utilisateurs de ShareX. Notre
                plateforme offre une solution complète et sécurisée pour
                l&apos;hébergement et la gestion de vos fichiers.
              </p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span>Sécurité renforcée</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <span>Support multi-domaines</span>
                </div>
              </div>
            </div>
          </section>

          <section id="features" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold mt-0">Fonctionnalités</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card rounded-lg p-6 border">
                <Workflow className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  Gestion simplifiée
                </h3>
                <p>
                  Interface intuitive pour gérer tous vos uploads facilement.
                </p>
              </div>
              <div className="bg-card rounded-lg p-6 border">
                <Shield className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Sécurité avancée</h3>
                <p>
                  Protection de vos fichiers avec des contrôles d&apos;accès
                  stricts.
                </p>
              </div>
            </div>
          </section>

          <section id="team" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Users className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold mt-0">Notre Équipe</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="text-lg mb-6">
                Nous sommes une équipe passionnée par l&apos;open source et
                dédiée à fournir les meilleures solutions pour la gestion de
                fichiers.
              </p>
              <Button variant="outline" className="gap-2">
                <Github className="h-4 w-4" />
                Voir le projet sur GitHub
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
