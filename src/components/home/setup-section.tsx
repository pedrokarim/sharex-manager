"use client";

import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import { FRONT_CONTAINER, FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { Reveal } from "@/components/front/reveal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
    <section id="demarrer" className="scroll-mt-24 bg-foreground/[0.035] py-24 sm:py-32">
      <Reveal className={cn(FRONT_NARROW, "text-center")}>
        <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase dark:text-emerald-400">
          {kicker}
        </p>
        <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.02] text-balance sm:text-6xl")}>
          {title}
        </h2>
        <p className="mt-6 text-pretty text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      </Reveal>

      {/* Trois étapes côte à côte, numérotées en grand : pas de cartes, le
          chiffre suffit à les séparer. */}
      <ol className={cn(FRONT_CONTAINER, "mt-16 grid gap-10 sm:grid-cols-3 sm:gap-12")}>
        {steps.map((step, index) => (
          <Reveal as="li" key={step.title} delay={index * 0.12}>
            <span className={cn(DISPLAY, "block text-7xl leading-none text-emerald-700/35 dark:text-emerald-400/40")}>
              {index + 1}
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-pretty text-muted-foreground">{step.description}</p>
          </Reveal>
        ))}
      </ol>

      {/* Le fichier à copier, dans une colonne plus étroite que les étapes. */}
      <Tabs defaultValue="sharex" className={cn(FRONT_NARROW, "mt-16 gap-3")}>
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
    </section>
  );
}
