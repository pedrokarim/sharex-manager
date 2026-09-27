import { render } from "@react-email/render";
import type { ReactElement } from "react";

import { getTransporter } from "./transporter";

export interface SendMailInput {
  to: string | string[];
  subject: string;
  react: ReactElement;
  /** Permet de répondre directement à l'expéditeur du formulaire. */
  replyTo?: string;
  from?: string;
}

export async function sendMail({
  to,
  subject,
  react,
  replyTo,
  from,
}: SendMailInput) {
  // Une version texte accompagne toujours le HTML : certains clients ne
  // rendent que celle-ci, et son absence pénalise le score anti-spam.
  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  const fromAddress = from ?? process.env.MAIL_FROM ?? process.env.SMTP_USER;
  if (!fromAddress) {
    throw new Error("[email] MAIL_FROM ou SMTP_USER doit être défini.");
  }

  const info = await getTransporter().sendMail({
    from: process.env.MAIL_FROM_NAME
      ? `"${process.env.MAIL_FROM_NAME}" <${fromAddress}>`
      : fromAddress,
    to,
    subject,
    html,
    text,
    replyTo,
  });

  return { messageId: info.messageId, accepted: info.accepted };
}
