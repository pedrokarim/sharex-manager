import { Metadata } from "next";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  Copyright,
  Shield,
  Cookie,
  Scale,
  Gavel,
  Mail,
  AlertCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Mentions Légales | ShareX Manager",
  description:
    "Mentions légales et conditions d'utilisation de ShareX Manager.",
};

const sections = [
  {
    id: "legal",
    title: "Informations Légales",
    icon: Building2,
  },
  {
    id: "intellectual-property",
    title: "Propriété Intellectuelle",
    icon: Copyright,
  },
  {
    id: "data-protection",
    title: "Protection des Données",
    icon: Shield,
  },
  {
    id: "hosting",
    title: "Hébergement",
    icon: Building2,
  },
  {
    id: "cookies",
    title: "Cookies",
    icon: Cookie,
  },
  {
    id: "liability",
    title: "Limitation de Responsabilité",
    icon: AlertCircle,
  },
  {
    id: "applicable-law",
    title: "Droit Applicable",
    icon: Gavel,
  },
  {
    id: "contact",
    title: "Contact",
    icon: Mail,
  },
];

export default function LegalPage() {
  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="hidden lg:block sticky top-14 h-[100vh] w-64 overflow-y-auto border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
          <div className="flex items-center gap-3 mb-8">
            <Scale className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold mt-0">Mentions Légales</h1>
          </div>

          <section id="legal" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">Informations Légales</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p>
                ShareX Manager est un projet développé et maintenu par Ascencia
                (https://ascencia.re). Le site est édité par Ascencia. © 2025
                Ascencia. Tous droits réservés.
              </p>
            </div>
          </section>

          <section id="intellectual-property" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Copyright className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">
                Propriété Intellectuelle
              </h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p>
                ShareX Manager est la propriété exclusive d&apos;Ascencia et est
                distribué sous licence MIT. Le code source est disponible sur
                GitHub. Tous les droits non expressément accordés par la licence
                sont réservés à Ascencia.
              </p>
              <p className="mb-0">
                Le nom ShareX Manager, le logo et les éléments graphiques
                associés sont la propriété exclusive d&apos;Ascencia.
              </p>
            </div>
          </section>

          <section id="data-protection" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">
                Protection des Données
              </h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p>
                Conformément au Règlement Général sur la Protection des Données
                (RGPD), vous disposez d&apos;un droit d&apos;accès, de
                rectification et de suppression de vos données personnelles.
              </p>
              <p className="mb-0">
                Pour exercer ces droits ou pour toute question relative à la
                protection de vos données, vous pouvez nous contacter via la
                page Contact.
              </p>
            </div>
          </section>

          <section id="hosting" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Building2 className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">Hébergement</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="mb-0">
                Ce site est hébergé par : [Nom de l&apos;hébergeur] [Adresse de
                l&apos;hébergeur]
              </p>
            </div>
          </section>

          <section id="cookies" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Cookie className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">Cookies</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="mb-0">
                Ce site utilise des cookies nécessaires à son bon
                fonctionnement. En continuant à naviguer sur ce site, vous
                acceptez leur utilisation.
              </p>
            </div>
          </section>

          <section id="liability" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <AlertCircle className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">
                Limitation de Responsabilité
              </h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="mb-0">
                ShareX Manager ne pourra être tenu responsable des dommages
                directs ou indirects résultant de l&apos;utilisation de ce site
                ou des services proposés.
              </p>
            </div>
          </section>

          <section id="applicable-law" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Gavel className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">Droit Applicable</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p className="mb-0">
                Les présentes mentions légales sont soumises au droit français.
                En cas de litige, les tribunaux français seront seuls
                compétents.
              </p>
            </div>
          </section>

          <section id="contact" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Mail className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold mt-0">Contact</h2>
            </div>
            <div className="bg-card rounded-lg p-6 border">
              <p>
                Pour toute question concernant ces mentions légales ou
                l&apos;utilisation de ShareX Manager, vous pouvez contacter
                Ascencia :
              </p>
              <ul className="list-none pl-0 space-y-2 mb-0">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span>Email : contact@ascencia.re</span>
                </li>
                <li className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <a
                    href="https://ascencia.re"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ascencia.re
                  </a>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
