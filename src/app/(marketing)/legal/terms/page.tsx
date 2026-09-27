import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  Ban,
  Building2,
  FileText,
  Gavel,
  KeyRound,
  RefreshCcw,
  ScrollText,
  ServerCog,
  Trash2,
  UploadCloud,
  UserCog,
} from "lucide-react";

import { DocPage, type DocSection } from "../../_components/doc-page";
import { LEGAL_INFO } from "../_components/legal-info";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Conditions générales d'utilisation",
  description:
    "Les règles d'usage du service et les engagements de chacun.",
  path: "/legal/terms",
});


const sections: DocSection[] = [
  {
    id: "objet",
    title: "1. Objet",
    icon: FileText,
    content: (
      <>
        <p>
          {LEGAL_INFO.appName} est une application d&apos;hébergement et de
          gestion de fichiers, conçue pour recevoir les captures et fichiers
          envoyés depuis ShareX (Windows) ou des outils équivalents sous Linux,
          puis les organiser en galeries et albums.
        </p>
        <p>
          Les présentes Conditions Générales d&apos;Utilisation («&nbsp;CGU&nbsp;»)
          régissent l&apos;accès et l&apos;usage de l&apos;instance accessible à
          l&apos;adresse {LEGAL_INFO.domain}. En créant un compte ou en
          utilisant le service, vous les acceptez sans réserve.
        </p>
        <p>
          Le service est proposé à titre non commercial, sans publicité, par
          {" "}
          {LEGAL_INFO.editor}.
        </p>
      </>
    ),
  },
  {
    id: "editeur-hebergeur",
    title: "2. Éditeur et hébergeur",
    icon: Building2,
    content: (
      <>
        <p>
          L&apos;éditeur est {LEGAL_INFO.editor}, joignable à l&apos;adresse{" "}
          <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
            {LEGAL_INFO.contactEmail}
          </a>
          .
        </p>
        <p>
          L&apos;instance est hébergée par {LEGAL_INFO.host.name},{" "}
          {LEGAL_INFO.host.address}.
        </p>
        <p>
          Les informations complètes figurent dans les{" "}
          <Link href="/legal">mentions légales</Link>.
        </p>
      </>
    ),
  },
  {
    id: "acces",
    title: "3. Accès au service",
    icon: UserCog,
    content: (
      <>
        <p>
          L&apos;accès aux fonctionnalités de gestion (galerie, albums, envoi de
          fichiers, clés API, paramètres) nécessite un compte. Les comptes sont
          créés par l&apos;administrateur de l&apos;instance&nbsp;: il n&apos;y a
          pas d&apos;inscription libre.
        </p>
        <p>
          L&apos;accès est réservé aux personnes âgées de 15 ans ou plus,
          conformément aux règles applicables en France en matière de
          consentement au traitement des données personnelles.
        </p>
        <p>
          Certains contenus peuvent être rendus publics par leur propriétaire
          (catalogue, albums partagés)&nbsp;; leur consultation ne requiert alors
          pas de compte.
        </p>
      </>
    ),
  },
  {
    id: "compte",
    title: "4. Compte et sécurité",
    icon: KeyRound,
    content: (
      <>
        <p>
          Chaque compte est personnel. Vous êtes responsable de la
          confidentialité de vos identifiants et de toute activité effectuée
          depuis votre compte.
        </p>
        <p>
          Les mots de passe ne sont jamais stockés en clair&nbsp;: ils sont
          conservés sous forme de condensat (bcrypt). L&apos;éditeur ne peut donc
          pas vous communiquer votre mot de passe, seulement le réinitialiser.
        </p>
        <p>
          Les clés API permettent à des outils externes d&apos;envoyer des
          fichiers en votre nom. Une clé compromise doit être révoquée sans délai
          depuis la page dédiée&nbsp;; toute action réalisée avec une clé valide
          est réputée émaner de son détenteur.
        </p>
      </>
    ),
  },
  {
    id: "contenus",
    title: "5. Contenus envoyés",
    icon: UploadCloud,
    content: (
      <>
        <p>
          Vous conservez l&apos;intégralité des droits sur les fichiers que vous
          envoyez. L&apos;éditeur ne revendique aucun droit de propriété sur vos
          contenus et ne les exploite à aucune fin commerciale.
        </p>
        <p>
          Vous garantissez disposer des droits nécessaires sur les fichiers
          envoyés et être seul responsable de leur contenu, y compris lorsque
          vous les rendez publics par un lien de partage.
        </p>
        <p>
          Un lien de partage public reste accessible à toute personne le
          possédant tant que le fichier n&apos;est pas supprimé ou repassé en
          privé.
        </p>
      </>
    ),
  },
  {
    id: "usage-interdit",
    title: "6. Usages interdits",
    icon: Ban,
    content: (
      <>
        <p>Il est notamment interdit d&apos;utiliser le service pour&nbsp;:</p>
        <ul>
          <li>
            héberger ou diffuser des contenus illicites, notamment à caractère
            pédopornographique, haineux, violent ou contrefaisant&nbsp;;
          </li>
          <li>
            diffuser des logiciels malveillants ou des fichiers destinés à porter
            atteinte à des systèmes tiers&nbsp;;
          </li>
          <li>
            mener des campagnes d&apos;hameçonnage ou usurper l&apos;identité
            d&apos;un tiers&nbsp;;
          </li>
          <li>
            contourner les limitations techniques, sonder ou saturer
            l&apos;infrastructure (envois automatisés massifs, contournement des
            quotas ou de la limitation de débit)&nbsp;;
          </li>
          <li>
            accéder à des fichiers ou à des comptes qui ne vous appartiennent
            pas.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "moderation",
    title: "7. Modération et sanctions",
    icon: AlertCircle,
    content: (
      <>
        <p>
          L&apos;éditeur peut supprimer un contenu manifestement illicite,
          suspendre une clé API ou désactiver un compte, sans préavis lorsque la
          gravité des faits ou une obligation légale l&apos;impose.
        </p>
        <p>
          Les actions sensibles (connexions, envois, suppressions, changements de
          configuration) sont journalisées à des fins de sécurité et de
          traçabilité. Le détail de ces journaux est décrit dans la{" "}
          <Link href="/legal/privacy">politique de confidentialité</Link>.
        </p>
        <p>
          Tout contenu manifestement illicite peut être signalé à{" "}
          <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
            {LEGAL_INFO.contactEmail}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "propriete",
    title: "8. Propriété intellectuelle",
    icon: ScrollText,
    content: (
      <>
        <p>
          Le code source de {LEGAL_INFO.appName} est distribué sous licence{" "}
          <a
            href={LEGAL_INFO.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {LEGAL_INFO.license}
          </a>
          . Les droits et obligations attachés à cette licence, notamment
          l&apos;accès au code source et la réciprocité en cas de redistribution,
          s&apos;appliquent intégralement.
        </p>
        <p>
          Le nom {LEGAL_INFO.appName}, le logo et les éléments graphiques
          associés restent la propriété d&apos;Ascencia et ne sont pas couverts
          par la licence du code.
        </p>
      </>
    ),
  },
  {
    id: "disponibilite",
    title: "9. Disponibilité du service",
    icon: ServerCog,
    content: (
      <>
        <p>
          Le service est fourni «&nbsp;en l&apos;état&nbsp;», sans engagement de
          disponibilité ni de performance. Il s&apos;agit d&apos;un projet
          personnel&nbsp;: des interruptions peuvent survenir pour maintenance,
          mise à jour ou incident, sans préavis.
        </p>
        <p>
          Aucune garantie de sauvegarde n&apos;est offerte. Vous êtes invité à
          conserver une copie de tout fichier important&nbsp;; le service ne doit
          pas être utilisé comme unique support de stockage.
        </p>
      </>
    ),
  },
  {
    id: "responsabilite",
    title: "10. Limitation de responsabilité",
    icon: AlertCircle,
    content: (
      <>
        <p>
          L&apos;éditeur ne saurait être tenu responsable des dommages indirects
          résultant de l&apos;utilisation du service, notamment la perte de
          fichiers, la perte d&apos;exploitation ou l&apos;indisponibilité
          temporaire.
        </p>
        <p>
          Cette limitation ne s&apos;applique pas aux dommages résultant
          d&apos;une faute lourde ou intentionnelle, ni aux cas où la loi
          l&apos;interdit.
        </p>
      </>
    ),
  },
  {
    id: "resiliation",
    title: "11. Résiliation",
    icon: Trash2,
    content: (
      <>
        <p>
          Vous pouvez demander à tout moment la suppression de votre compte en
          écrivant à{" "}
          <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
            {LEGAL_INFO.contactEmail}
          </a>
          . La suppression entraîne celle de vos fichiers, albums, clés API et
          préférences.
        </p>
        <p>
          Certains journaux techniques peuvent être conservés au-delà, dans les
          limites et durées précisées par la{" "}
          <Link href="/legal/privacy">politique de confidentialité</Link>.
        </p>
      </>
    ),
  },
  {
    id: "modifications",
    title: "12. Modification des CGU",
    icon: RefreshCcw,
    content: (
      <p>
        Les présentes CGU peuvent être modifiées pour suivre l&apos;évolution du
        service ou de la réglementation. La date de dernière mise à jour figure
        en bas de cette page&nbsp;; l&apos;usage continu du service après
        modification vaut acceptation.
      </p>
    ),
  },
  {
    id: "droit-applicable",
    title: "13. Droit applicable",
    icon: Gavel,
    content: (
      <p>
        Les présentes CGU sont soumises au droit français. À défaut de résolution
        amiable, les tribunaux français sont seuls compétents.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Legal · CGU"
      title="Conditions Générales d'Utilisation"
      icon={ScrollText}
      backHref="/legal"
      lastUpdated={LEGAL_INFO.lastUpdated}
      intro={
        <p>
          Ces conditions encadrent l&apos;utilisation de {LEGAL_INFO.appName},
          l&apos;application d&apos;hébergement de fichiers éditée par Ascencia.
          Elles précisent ce que vous pouvez en attendre, ce qui vous incombe, et
          les limites du service.
        </p>
      }
      sections={sections}
    />
  );
}
