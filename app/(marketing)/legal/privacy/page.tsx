import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Clock,
  Cookie,
  Database,
  Globe2,
  Lock,
  RefreshCcw,
  Scale,
  Shield,
  Target,
  UserCheck,
} from "lucide-react";

import { DocPage, type DocSection } from "../../_components/doc-page";
import { LEGAL_INFO } from "../_components/legal-info";

export const metadata: Metadata = {
  title: "Politique de confidentialité | ShareX Manager",
  description:
    "Quelles données ShareX Manager traite, pourquoi, combien de temps, et quels sont vos droits (RGPD).",
};

const sections: DocSection[] = [
  {
    id: "responsable",
    title: "1. Responsable du traitement",
    icon: Building2,
    content: (
      <>
        <p>
          Le responsable du traitement est {LEGAL_INFO.editor}, joignable à{" "}
          <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
            {LEGAL_INFO.contactEmail}
          </a>
          .
        </p>
        <p>
          Cette politique s&apos;applique à l&apos;instance {LEGAL_INFO.domain}.
          {" "}
          {LEGAL_INFO.appName} étant un logiciel libre auto-hébergeable, une
          instance installée par un tiers relève de son propre exploitant.
        </p>
      </>
    ),
  },
  {
    id: "donnees",
    title: "2. Données traitées",
    icon: Database,
    content: (
      <>
        <p>
          Le service est volontairement sobre en données. Concrètement, sont
          traités&nbsp;:
        </p>
        <ul>
          <li>
            <strong>Compte</strong> — identifiant, adresse email, rôle, et le
            mot de passe sous forme de condensat bcrypt (jamais en clair).
          </li>
          <li>
            <strong>Sessions</strong> — un jeton de session, sa date
            d&apos;expiration, ainsi que l&apos;adresse IP et le user-agent
            associés à la connexion.
          </li>
          <li>
            <strong>Fichiers envoyés</strong> — le fichier lui-même et ses
            métadonnées (nom, taille, type, date, album, statut public ou privé).
          </li>
          <li>
            <strong>Clés API</strong> — nom, clé, date de création et
            d&apos;expiration, permissions, et compte créateur.
          </li>
          <li>
            <strong>Journaux techniques</strong> — horodatage, action, niveau,
            message, identifiant et email du compte concerné, adresse IP et
            user-agent.
          </li>
          <li>
            <strong>Préférences d&apos;affichage</strong> — thème, couleurs
            personnalisées et plage horaire du mode automatique.
          </li>
        </ul>
        <p>
          Aucune donnée n&apos;est revendue, louée ou utilisée à des fins
          publicitaires. Il n&apos;y a ni traceur publicitaire, ni outil
          d&apos;analyse d&apos;audience tiers.
        </p>
      </>
    ),
  },
  {
    id: "finalites",
    title: "3. Finalités et bases légales",
    icon: Target,
    content: (
      <>
        <ul>
          <li>
            <strong>Fournir le service</strong> (compte, envoi, galerie, albums,
            partage) — exécution du contrat que constituent les{" "}
            <Link href="/legal/terms">CGU</Link>.
          </li>
          <li>
            <strong>Sécuriser le service</strong> (journaux, limitation de débit,
            détection d&apos;accès non autorisés) — intérêt légitime de
            l&apos;éditeur à protéger l&apos;instance et ses utilisateurs.
          </li>
          <li>
            <strong>Statistiques d&apos;usage</strong> (volumétrie, répartition
            géographique approximative des accès) — intérêt légitime à
            comprendre la charge et l&apos;usage de l&apos;instance.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "geolocalisation",
    title: "4. Géolocalisation des adresses IP",
    icon: Globe2,
    content: (
      <>
        <p>
          Pour afficher la répartition géographique des accès dans les
          statistiques, les adresses IP présentes dans les journaux sont
          transmises au service tiers{" "}
          <a href="https://ip-api.com" target="_blank" rel="noopener noreferrer">
            ip-api.com
          </a>
          , qui renvoie un pays, une ville approximative et un fournisseur
          d&apos;accès.
        </p>
        <p>
          Ce service est opéré depuis l&apos;extérieur de l&apos;Union
          européenne. Les résultats sont mis en cache localement afin de limiter
          le nombre d&apos;appels, et les adresses privées ou locales ne sont
          jamais transmises.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "5. Cookies",
    icon: Cookie,
    content: (
      <>
        <p>
          Seuls des cookies strictement nécessaires sont utilisés. Aucun cookie
          publicitaire ou de mesure d&apos;audience n&apos;est déposé, et aucun
          bandeau de consentement n&apos;est donc requis.
        </p>
        <ul>
          <li>
            <strong>Cookie de session</strong> — maintient votre connexion. Il
            est <code>httpOnly</code>, donc inaccessible au JavaScript de la
            page, et expire automatiquement.
          </li>
          <li>
            <strong>
              <code>sidebar_state</code>
            </strong>{" "}
            — mémorise si le menu latéral est ouvert ou replié. Pur confort
            d&apos;affichage, aucune donnée personnelle.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "destinataires",
    title: "6. Destinataires",
    icon: Shield,
    content: (
      <>
        <p>
          Les données restent hébergées sur l&apos;infrastructure de
          l&apos;instance. Les seuls tiers en contact avec elles sont&nbsp;:
        </p>
        <ul>
          <li>
            <strong>{LEGAL_INFO.host.name}</strong> — hébergeur de
            l&apos;infrastructure ({LEGAL_INFO.host.address}).
          </li>
          <li>
            <strong>ip-api.com</strong> — géolocalisation des adresses IP,
            dans les conditions décrites plus haut.
          </li>
        </ul>
        <p>
          Les données peuvent en outre être communiquées à une autorité
          judiciaire sur réquisition légale.
        </p>
      </>
    ),
  },
  {
    id: "conservation",
    title: "7. Durées de conservation",
    icon: Clock,
    content: (
      <ul>
        <li>
          <strong>Compte</strong> — conservé tant que le compte existe, supprimé
          sur demande.
        </li>
        <li>
          <strong>Sessions</strong> — supprimées à l&apos;expiration, à la
          déconnexion ou lors d&apos;un changement de mot de passe.
        </li>
        <li>
          <strong>Fichiers</strong> — conservés jusqu&apos;à leur suppression par
          leur propriétaire ou à la suppression du compte.
        </li>
        <li>
          <strong>Journaux techniques</strong> — conservés pour les besoins de
          sécurité et de diagnostic, puis purgés. Ils peuvent subsister après la
          suppression d&apos;un compte, l&apos;identifiant n&apos;étant alors
          plus rattaché à aucune donnée de profil.
        </li>
      </ul>
    ),
  },
  {
    id: "securite",
    title: "8. Sécurité",
    icon: Lock,
    content: (
      <>
        <p>Les mesures suivantes sont en place&nbsp;:</p>
        <ul>
          <li>mots de passe stockés sous forme de condensat bcrypt&nbsp;;</li>
          <li>
            cookie de session <code>httpOnly</code> et vérification de
            l&apos;origine des requêtes (protection CSRF)&nbsp;;
          </li>
          <li>
            limitation de débit sur les tentatives de connexion et en-têtes de
            sécurité HTTP (HSTS, protection contre le sniffing MIME et
            l&apos;affichage en cadre)&nbsp;;
          </li>
          <li>
            cloisonnement des fichiers privés, non servis sans session valide.
          </li>
        </ul>
        <p>
          Aucun système n&apos;est infaillible&nbsp;: en cas de violation de
          données susceptible d&apos;engendrer un risque élevé, les personnes
          concernées seraient informées conformément à l&apos;article 34 du RGPD.
        </p>
      </>
    ),
  },
  {
    id: "droits",
    title: "9. Vos droits",
    icon: UserCheck,
    content: (
      <>
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de
          rectification, d&apos;effacement, de limitation, d&apos;opposition et
          de portabilité de vos données.
        </p>
        <p>
          Ces droits s&apos;exercent auprès de{" "}
          <a href={`mailto:${LEGAL_INFO.contactEmail}`}>
            {LEGAL_INFO.contactEmail}
          </a>
          . Une réponse vous sera apportée dans un délai d&apos;un mois. Une
          preuve d&apos;identité pourra être demandée en cas de doute
          raisonnable.
        </p>
      </>
    ),
  },
  {
    id: "cnil",
    title: "10. Réclamation",
    icon: Scale,
    content: (
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez
        introduire une réclamation auprès de la CNIL&nbsp;:{" "}
        <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
          www.cnil.fr
        </a>
        , 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.
      </p>
    ),
  },
  {
    id: "modifications",
    title: "11. Modifications",
    icon: RefreshCcw,
    content: (
      <p>
        Cette politique peut évoluer avec le service. La date de dernière mise à
        jour figure en bas de page&nbsp;; toute modification substantielle sera
        signalée aux utilisateurs disposant d&apos;un compte.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Legal · Confidentialité"
      title="Politique de confidentialité"
      icon={Shield}
      backHref="/legal"
      lastUpdated={LEGAL_INFO.lastUpdated}
      intro={
        <p>
          {LEGAL_INFO.appName} héberge vos fichiers&nbsp;: la moindre des choses
          est de dire précisément ce qui est conservé et pourquoi. Cette page
          décrit les traitements réellement effectués par l&apos;instance{" "}
          {LEGAL_INFO.domain} — ni plus, ni moins.
        </p>
      }
      sections={sections}
    />
  );
}
