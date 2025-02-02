import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, User, Github, Globe, Send } from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact | ShareX Manager",
  description: "Contactez-nous pour toute question concernant ShareX Manager.",
};

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
            <form className="space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Nom
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Votre nom"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="votre@email.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="subject"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Sujet
                </label>
                <Input
                  id="subject"
                  name="subject"
                  type="text"
                  placeholder="Sujet de votre message"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="message"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Message
                </label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder="Votre message..."
                  rows={6}
                  required
                />
              </div>

              <Button type="submit" className="w-full gap-2">
                <Send className="h-4 w-4" />
                Envoyer le message
              </Button>
            </form>
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

          <Card className="p-6 bg-primary text-primary-foreground">
            <h2 className="text-xl font-semibold mb-2">Support prioritaire</h2>
            <p className="text-sm opacity-90">
              Besoin d&apos;une réponse rapide ? Nos clients bénéficient
              d&apos;un support prioritaire 24/7.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
