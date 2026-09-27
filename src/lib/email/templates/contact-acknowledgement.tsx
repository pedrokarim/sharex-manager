import { Heading, Section, Text } from "@react-email/components";

import { EmailLayout, emailColors, emailRadius } from "../components/layout";

export interface ContactAcknowledgementProps {
  name: string;
  subject: string;
  message: string;
}

/** Confirmation envoyée à la personne qui a rempli le formulaire. */
export default function ContactAcknowledgement({
  name,
  subject,
  message,
}: ContactAcknowledgementProps) {
  return (
    <EmailLayout
      preview="Votre message a bien été reçu"
      footerNote="Cet email confirme la réception de votre message. Inutile d'y répondre."
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
        Message bien reçu
      </Heading>

      <Text
        style={{
          margin: "0 0 16px",
          fontSize: "15px",
          lineHeight: 1.7,
          color: emailColors.foreground,
        }}
      >
        Bonjour {name}, votre message est arrivé. ShareX Manager est un projet
        personnel maintenu sur le temps libre : la réponse arrivera dès que
        possible, sans délai garanti.
      </Text>

      <Text
        style={{
          margin: "0 0 12px",
          fontSize: "13px",
          fontWeight: 600,
          color: emailColors.mutedForeground,
        }}
      >
        Copie de votre message
      </Text>

      <Section
        style={{
          padding: "18px 20px",
          border: `1px solid ${emailColors.border}`,
          borderRadius: emailRadius,
          backgroundColor: emailColors.muted,
        }}
      >
        <Text
          style={{
            margin: "0 0 10px",
            fontSize: "14px",
            lineHeight: 1.5,
            color: emailColors.foreground,
          }}
        >
          <span style={{ color: emailColors.mutedForeground }}>Sujet : </span>
          {subject}
        </Text>
        <Text
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: 1.7,
            color: emailColors.foreground,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </Text>
      </Section>
    </EmailLayout>
  );
}

ContactAcknowledgement.PreviewProps = {
  name: "Jean Dupont",
  subject: "Question sur les clés API",
  message:
    "Bonjour,\n\nEst-il possible de limiter une clé API à un seul domaine ?\n\nMerci d'avance.",
} satisfies ContactAcknowledgementProps;
