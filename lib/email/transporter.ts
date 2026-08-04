import nodemailer from "nodemailer";

/**
 * SMTP LWS — cf. NODEMAILER_SETUP_GUIDE.md.
 *
 * Deux pièges documentés :
 *  - le host doit être le serveur LWS direct (mail52.lwspanel.com) et non
 *    mail.<domaine>, qui résout vers Cloudflare ;
 *  - TLS implicite sur le port 465, surtout pas STARTTLS sur 587.
 *
 * Le certificat distant reste vérifié (rejectUnauthorized: true), comme dans
 * l'implémentation en production de watchme.
 */

let transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST ?? "mail52.lwspanel.com";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn(
      "[email] SMTP_USER / SMTP_PASS non définis — aucun mail ne partira."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: true },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 60_000,
    greetingTimeout: 30_000,
    socketTimeout: 60_000,
  });

  return transporter;
}

/** Vérifie la connexion SMTP sans envoyer de message. */
export async function verifyTransporter(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Vrai si la configuration minimale d'envoi est présente. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}
