import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, User, Globe, Send } from "lucide-react";
import { Github } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { ContactForm } from "./contact-form";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Contact",
  description:
    "Une question, un signalement ou une demande : écrivez-nous.",
  path: "/contact",
});


export default function ContactPage() {
  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="h-8 w-8 text-primary" />
        <h1 className="text-4xl font-bold">Contactez-nous</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Card className="p-6">
            <ContactForm />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              Autres moyens de nous contacter
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <a
                  href="mailto:contact@ascencia.re"
                  className="hover:text-primary"
                >
                  contact@ascencia.re
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary" />
                <a
                  href="https://ascencia.re"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  ascencia.re
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Github className="h-5 w-5 text-primary" />
                <a
                  href="https://github.com/ascencia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  GitHub
                </a>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-2">Délai de réponse</h2>
            <p className="text-sm text-muted-foreground">
              ShareX Manager est un projet personnel, maintenu sur le temps
              libre : les réponses arrivent dès que possible, sans garantie de
              délai. Pour un bug ou une suggestion, une issue GitHub est souvent
              le chemin le plus rapide.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
