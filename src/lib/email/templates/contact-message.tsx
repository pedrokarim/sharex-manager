import { Heading, Section, Text } from "@react-email/components";

import {
  EmailField,
  EmailLayout,
  emailColors,
  emailRadius,
} from "../components/layout";

export interface ContactMessageProps {
  name: string;
  email: string;
  subject: string;
  message: string;
  /** Horodatage déjà formaté côté serveur. */
  sentAt: string;
}

/** Notification envoyée à l'administrateur du site. */
export default function ContactMessage({
  name,
  email,
  subject,
  message,
  sentAt,
}: ContactMessageProps) {
  return (
    <EmailLayout
      preview={`Nouveau message de ${name} – ${subject}`}
      footerNote="Message reçu via le formulaire de contact du site. Répondre à cet email écrit directement à l'expéditeur."
    >
      <Heading
        as="h1"
        style={{
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 18px",
          color: emailColors.foreground,
        }}
      >
        Nouveau message de contact
      </Heading>

      <Section
        style={{
          padding: "18px 20px",
          border: `1px solid ${emailColors.border}`,
          borderRadius: emailRadius,
          backgroundColor: emailColors.muted,
        }}
      >
        <EmailField label="Nom" value={name} />
        <EmailField label="Email" value={email} />
        <EmailField label="Sujet" value={subject} />
        <Text
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: 1.5,
            color: emailColors.foreground,
          }}
        >
          <span style={{ color: emailColors.mutedForeground }}>Reçu le : </span>
          {sentAt}
        </Text>
      </Section>

      <Text
        style={{
          margin: "24px 0 0",
          fontSize: "15px",
          lineHeight: 1.7,
          color: emailColors.foreground,
          whiteSpace: "pre-wrap",
        }}
      >
        {message}
      </Text>
    </EmailLayout>
  );
}

ContactMessage.PreviewProps = {
  name: "Jean Dupont",
  email: "jean.dupont@example.com",
  subject: "Question sur les clés API",
  message:
    "Bonjour,\n\nEst-il possible de limiter une clé API à un seul domaine ?\n\nMerci d'avance.",
  sentAt: "4 août 2026 à 19:42",
} satisfies ContactMessageProps;
