import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/email/send";
import { isMailConfigured } from "@/lib/email/transporter";
import ContactMessage from "@/lib/email/templates/contact-message";
import ContactAcknowledgement from "@/lib/email/templates/contact-acknowledgement";

/** 10 Ko : très au-delà d'un message légitime, bien en deçà d'un abus. */
const MAX_BODY_BYTES = 10_240;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(100),
  email: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  subject: z.string().trim().min(3, "Sujet trop court").max(150),
  message: z.string().trim().min(10, "Message trop court").max(5000),
  /**
   * Champ leurre : invisible pour un humain, souvent rempli par les robots.
   * Volontairement permissif ici — le rejet se fait plus bas, en simulant un
   * succès, pour ne pas signaler au robot que le champ est piégé.
   */
  website: z.string().optional(),
});

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: securityHeaders });
}

export async function POST(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return json({ error: "Requête trop volumineuse." }, 413);
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(`contact:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de messages envoyés. Réessayez plus tard." },
      {
        status: 429,
        headers: {
          ...securityHeaders,
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { name, email, subject, message, website } = parsed.data;

  // Piège à robots : on répond comme si tout s'était bien passé, sans envoyer.
  if (website) {
    return json({ success: true }, 200);
  }

  if (!isMailConfigured()) {
    console.error("[contact] SMTP non configuré : message non envoyé.");
    return json(
      { error: "L'envoi d'email n'est pas configuré sur ce serveur." },
      503
    );
  }

  const destination = process.env.CONTACT_EMAIL ?? "contact@ascencia.re";
  const sentAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date());

  try {
    await sendMail({
      to: destination,
      subject: `[Contact] ${subject}`,
      // Répondre au mail écrit directement à l'expéditeur.
      replyTo: `"${name}" <${email}>`,
      react: ContactMessage({ name, email, subject, message, sentAt }),
    });
  } catch (error) {
    console.error("[contact] échec de l'envoi :", error);
    return json({ error: "L'envoi a échoué. Réessayez plus tard." }, 502);
  }

  // L'accusé de réception ne doit pas faire échouer la demande : le message
  // principal est déjà parti, c'est lui qui compte.
  try {
    await sendMail({
      to: email,
      subject: "Votre message a bien été reçu",
      react: ContactAcknowledgement({ name, subject, message }),
    });
  } catch (error) {
    console.warn("[contact] accusé de réception non envoyé :", error);
  }

  return json({ success: true }, 200);
}
