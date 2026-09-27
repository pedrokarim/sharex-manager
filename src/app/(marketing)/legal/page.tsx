import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  Copyright,
  Flag,
  Mail,
  Scale,
  ScrollText,
  Server,
  Shield,
  UserCog,
} from "lucide-react";

import { DocPage, type DocSection } from "../_components/doc-page";
import { LEGAL_INFO } from "./_components/legal-info";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Mentions légales",
  description:
    "Éditeur, hébergement et informations légales du service.",
  path: "/legal",
});


const documents = [
  {
    href: "/legal/terms",
    icon: ScrollText,
    title: "Conditions Générales d'Utilisation",
    description:
      "Règles d'usage, comptes, clés API, contenus envoyés, responsabilités et résiliation.",
  },
  {
    href: "/legal/privacy",
    icon: Shield,
    title: "Politique de confidentialité",
    description:
      "Données traitées, finalités, durées de conservation et vos droits au titre du RGPD.",
  },
];

const sections: DocSection[] = [
  {
    id: "editeur",
    title: "1. Éditeur",
    icon: Building2,
    content: (
      <>
        <p>
          {LEGAL_INFO.appName} est édité par {LEGAL_INFO.editor}.
        </p>
        <p>
          Ascencia est une structure informelle, sans forme sociale
          commerciale&nbsp;: le service est proposé à titre non lucratif, sans
          publicité.
        </p>
        <ul className="not-prose list-none space-y-2 pl-0">
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-primary" />
            <a
              href={`mailto:${LEGAL_INFO.contactEmail}`}
              className="text-primary hover:underline"
            >
              {LEGAL_INFO.contactEmail}
            </a>
          </li>
          <li className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <a
              href={LEGAL_INFO.editorSite}
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              ascencia.re
            </a>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "directeur-publication",
    title: "2. Directeur de la publication",
    icon: UserCog,
    content: (
      <p>
        Le directeur de la publication est {LEGAL_INFO.publicationDirector},
        joignable à{" "}
        <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
          {LEGAL_INFO.contactEmail}
        </a>
        .
      </p>
    ),
  },
  {
    id: "hebergeur",
    title: "3. Hébergeur",
    icon: Server,
    content: (
      <>
        <p>
          L&apos;instance {LEGAL_INFO.domain} est hébergée par&nbsp;:
        </p>
        <p className="not-prose">
          <strong>{LEGAL_INFO.host.name}</strong>
          <br />
          {LEGAL_INFO.host.address}
          <br />
          <a
            href={LEGAL_INFO.host.site}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            contabo.com
          </a>
        </p>
      </>
    ),
  },
  {
    id: "propriete",
    title: "4. Propriété intellectuelle",
    icon: Copyright,
    content: (
      <>
        <p>
          Le code source de {LEGAL_INFO.appName} est publié sous licence{" "}
          <a
            href={LEGAL_INFO.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {LEGAL_INFO.license}
          </a>
          , et disponible sur{" "}
          <a
            href={LEGAL_INFO.repository}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          . Chacun peut l&apos;utiliser, l&apos;étudier, le modifier et le
          redistribuer dans les conditions de cette licence.
        </p>
        <p>
          Le nom {LEGAL_INFO.appName}, le logo et les éléments graphiques
          associés demeurent la propriété d&apos;Ascencia et ne sont pas couverts
          par la licence du code.
        </p>
        <p>
          Les fichiers envoyés par les utilisateurs restent leur propriété
          pleine et entière.
        </p>
      </>
    ),
  },
  {
    id: "signalement",
    title: "5. Signalement d'un contenu illicite",
    icon: Flag,
    content: (
      <p>
        Tout contenu manifestement illicite hébergé sur cette instance peut être
        signalé à{" "}
        <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
          {LEGAL_INFO.contactEmail}
        </a>
        . Merci d&apos;indiquer l&apos;URL concernée et le motif du signalement,
        afin que la demande puisse être traitée dans les meilleurs délais.
      </p>
    ),
  },
  {
    id: "responsabilite",
    title: "6. Limitation de responsabilité",
    icon: AlertCircle,
    content: (
      <p>
        Le service est fourni «&nbsp;en l&apos;état&nbsp;», sans garantie de
        disponibilité ni de conservation des données. L&apos;éditeur ne saurait
        être tenu responsable des dommages indirects liés à son utilisation. Les
        modalités complètes figurent dans les{" "}
        <Link href="/legal/terms">CGU</Link>.
      </p>
    ),
  },
  {
    id: "droit-applicable",
    title: "7. Droit applicable",
    icon: Scale,
    content: (
      <p>
        Les présentes mentions sont soumises au droit français. À défaut de
        résolution amiable, les tribunaux français sont seuls compétents.
      </p>
    ),
  },
];

export default function LegalIndexPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Mentions légales"
      icon={Scale}
      lastUpdated={LEGAL_INFO.lastUpdated}
      intro={
        <>
          <p>
            Qui édite {LEGAL_INFO.appName}, qui l&apos;héberge, et comment nous
            joindre. Les règles d&apos;usage et le traitement des données font
            l&apos;objet de documents dédiés.
          </p>
          <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
            {documents.map((doc) => (
              <Link
                key={doc.href}
                href={doc.href}
                className="group flex flex-col gap-2 rounded-lg border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <div className="flex items-center gap-2">
                  <doc.icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="font-semibold text-foreground group-hover:text-primary">
                    {doc.title}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {doc.description}
                </span>
              </Link>
            ))}
          </div>
        </>
      }
      sections={sections}
    />
  );
}
