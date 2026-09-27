import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const APP_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://sxm.ascencia.re";

/**
 * Palette du thème clair par défaut de l'application, convertie d'oklch en
 * hexadécimal : les clients mail ne savent pas interpréter oklch, ni les
 * variables CSS. Les emails ne suivent volontairement pas le thème de
 * l'utilisateur – ils gardent la direction artistique par défaut du site.
 */
export const emailColors = {
  background: "#ffffff",
  foreground: "#09090b",
  card: "#ffffff",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  muted: "#f4f4f5",
  mutedForeground: "#71717b",
  border: "#e4e4e7",
} as const;

/** --radius vaut 0.625rem dans le thème ; les emails veulent des pixels. */
export const emailRadius = "10px";

export const emailFont =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
  footerNote?: string;
}

export function EmailLayout({
  preview,
  children,
  footerNote,
}: EmailLayoutProps) {
  return (
    <Html lang="fr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          fontFamily: emailFont,
          backgroundColor: emailColors.muted,
          color: emailColors.foreground,
          margin: 0,
          padding: "40px 20px",
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: emailColors.card,
            border: `1px solid ${emailColors.border}`,
            borderRadius: emailRadius,
            padding: "36px",
          }}
        >
          <Section style={{ marginBottom: "28px" }}>
            <Text
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: emailColors.foreground,
              }}
            >
              ShareX&nbsp;Manager
            </Text>
          </Section>

          {children}

          <Hr
            style={{
              borderColor: emailColors.border,
              borderStyle: "solid",
              borderWidth: "1px 0 0",
              margin: "32px 0 18px",
            }}
          />
          {footerNote ? (
            <Text
              style={{
                fontSize: "13px",
                lineHeight: 1.6,
                color: emailColors.mutedForeground,
                margin: "0 0 6px",
              }}
            >
              {footerNote}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: "12px",
              color: emailColors.mutedForeground,
              margin: 0,
            }}
          >
            <Link
              href={APP_URL}
              style={{
                color: emailColors.foreground,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ShareX Manager
            </Link>
            {" · une expérience "}
            <Link
              href="https://ascencia.re"
              style={{
                color: emailColors.mutedForeground,
                textDecoration: "underline",
              }}
            >
              Ascencia
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Bloc clé/valeur, repris du style des encadrés du site. */
export function EmailField({ label, value }: { label: string; value: string }) {
  return (
    <Text
      style={{
        margin: "0 0 10px",
        fontSize: "14px",
        lineHeight: 1.5,
        color: emailColors.foreground,
      }}
    >
      <span style={{ color: emailColors.mutedForeground }}>{label} : </span>
      {value}
    </Text>
  );
}
