"use client";

import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "@/components/home/motion";

interface CodePreviewSectionProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  apiBaseUrl: string;
  windowTitle?: string;
  tabSharexLabel?: string;
  tabCurlLabel?: string;
  copySharexAriaLabel?: string;
  copyCurlAriaLabel?: string;
}

export const CodePreviewSection = ({
  eyebrow = "Style ShareXManager",
  title,
  subtitle,
  apiBaseUrl,
  windowTitle = "Exemple de configuration",
  tabSharexLabel = "ShareX",
  tabCurlLabel = "cURL",
  copySharexAriaLabel = "Copier la config ShareX",
  copyCurlAriaLabel = "Copier la commande cURL",
}: CodePreviewSectionProps) => {
  const sharexRequestUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/upload`;

  const sharexConfig = `{
  "Name": "ShareX Manager",
  "DestinationType": "ImageUploader",
  "RequestMethod": "POST",
  "RequestURL": "${sharexRequestUrl}",
  "FileFormName": "file",
  "Headers": {
    "Authorization": "Bearer <VOTRE_CLE_API>"
  }
}`;

  const curlExample = `curl -X POST "${sharexRequestUrl}" \\
  -H "Authorization: Bearer <VOTRE_CLE_API>" \\
  -F "file=@./capture.png"`;

  return (
    <section className="container mx-auto px-4 py-12 sm:py-16">
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        <Badge variant="secondary" className="mb-3">
          {eyebrow}
        </Badge>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-4xl"
      >
        <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent/70" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="ml-2 text-xs text-muted-foreground">
                {windowTitle}
              </span>
            </div>

            <Tabs defaultValue="sharex" className="w-auto">
              <TabsList>
                <TabsTrigger value="sharex">{tabSharexLabel}</TabsTrigger>
                <TabsTrigger value="curl">{tabCurlLabel}</TabsTrigger>
              </TabsList>
              <TabsContent value="sharex" className="mt-3">
                <CodeBlock code={sharexConfig} language="json">
                  <CodeBlockCopyButton aria-label={copySharexAriaLabel} />
                </CodeBlock>
              </TabsContent>
              <TabsContent value="curl" className="mt-3">
                <CodeBlock code={curlExample} language="bash">
                  <CodeBlockCopyButton aria-label={copyCurlAriaLabel} />
                </CodeBlock>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

