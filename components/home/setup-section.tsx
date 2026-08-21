"use client";

import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SetupStep {
  title: string;
  description: string;
}

interface SetupSectionProps {
  kicker: string;
  title: string;
  subtitle: string;
  steps: SetupStep[];
  apiBaseUrl: string;
  windowTitle: string;
  tabSharexLabel: string;
  tabCurlLabel: string;
  copySharexAriaLabel: string;
  copyCurlAriaLabel: string;
}

/**
 * Mise en route : trois étapes puis le fichier de configuration à copier.
 *
 * C'est le dernier bloc de la page, celui qui répond à « est-ce que c'est
 * compliqué à brancher ? ». Les onglets sont au-dessus du bloc de code, pas
 * dans son en-tête : c'est ce qui manquait à l'ancienne section, où le
 * `TabsContent` se retrouvait coincé dans une barre de titre en flex.
 */
export function SetupSection({
  kicker,
  title,
  subtitle,
  steps,
  apiBaseUrl,
  windowTitle,
  tabSharexLabel,
  tabCurlLabel,
  copySharexAriaLabel,
  copyCurlAriaLabel,
}: SetupSectionProps) {
  const requestUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/upload`;

  const sharexConfig = `{
  "Name": "ShareX Manager",
  "DestinationType": "ImageUploader",
  "RequestMethod": "POST",
  "RequestURL": "${requestUrl}",
  "FileFormName": "file",
  "Headers": {
    "Authorization": "Bearer <VOTRE_CLE_API>"
  },
  "URL": "{json:url}"
}`;

  const curlExample = `curl -X POST "${requestUrl}" \\
  -H "Authorization: Bearer <VOTRE_CLE_API>" \\
  -F "file=@./capture.png"`;

  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            {kicker}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-balance sm:text-3xl lg:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        <Tabs defaultValue="sharex" className="mt-8 w-full max-w-4xl gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {windowTitle}
            </span>
            <TabsList>
              <TabsTrigger value="sharex">{tabSharexLabel}</TabsTrigger>
              <TabsTrigger value="curl">{tabCurlLabel}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sharex">
            <CodeBlock code={sharexConfig} language="json">
              <CodeBlockCopyButton aria-label={copySharexAriaLabel} />
            </CodeBlock>
          </TabsContent>
          <TabsContent value="curl">
            <CodeBlock code={curlExample} language="bash">
              <CodeBlockCopyButton aria-label={copyCurlAriaLabel} />
            </CodeBlock>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
