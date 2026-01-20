"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

type TokenKey =
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "muted"
  | "muted-foreground"
  | "border"
  | "input"
  | "ring";

type TokenDef = {
  key: TokenKey;
  label: string;
  swatchClassName: string;
};

interface ColorPaletteProps {
  title: string;
  description: string;
  groupMain: string;
  groupBackground: string;
  groupText: string;
  groupUi: string;
}

export const ColorPalette = ({
  title,
  description,
  groupMain,
  groupBackground,
  groupText,
  groupUi,
}: ColorPaletteProps) => {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const root = document.documentElement;
    const computed = getComputedStyle(root);

    const keys: TokenKey[] = [
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "destructive-foreground",
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "muted",
      "muted-foreground",
      "border",
      "input",
      "ring",
    ];

    const next: Record<string, string> = {};
    for (const key of keys) {
      next[key] = computed.getPropertyValue(`--${key}`).trim();
    }
    setValues(next);
  }, []);

  const groups = useMemo(() => {
    const main: TokenDef[] = [
      { key: "primary", label: "primary", swatchClassName: "bg-primary text-primary-foreground" },
      {
        key: "secondary",
        label: "secondary",
        swatchClassName: "bg-secondary text-secondary-foreground",
      },
      { key: "accent", label: "accent", swatchClassName: "bg-accent text-accent-foreground" },
      {
        key: "destructive",
        label: "destructive",
        swatchClassName: "bg-destructive text-destructive-foreground",
      },
    ];

    const background: TokenDef[] = [
      { key: "background", label: "background", swatchClassName: "bg-background text-foreground border border-border" },
      { key: "card", label: "card", swatchClassName: "bg-card text-card-foreground border border-border" },
      { key: "popover", label: "popover", swatchClassName: "bg-popover text-popover-foreground border border-border" },
      { key: "muted", label: "muted", swatchClassName: "bg-muted text-muted-foreground border border-border" },
    ];

    const text: TokenDef[] = [
      { key: "foreground", label: "foreground", swatchClassName: "bg-background text-foreground border border-border" },
      { key: "muted-foreground", label: "muted-foreground", swatchClassName: "bg-muted text-muted-foreground border border-border" },
      { key: "primary-foreground", label: "primary-foreground", swatchClassName: "bg-primary text-primary-foreground" },
      { key: "secondary-foreground", label: "secondary-foreground", swatchClassName: "bg-secondary text-secondary-foreground" },
      { key: "accent-foreground", label: "accent-foreground", swatchClassName: "bg-accent text-accent-foreground" },
      { key: "destructive-foreground", label: "destructive-foreground", swatchClassName: "bg-destructive text-destructive-foreground" },
    ];

    const ui: TokenDef[] = [
      { key: "border", label: "border", swatchClassName: "bg-card text-card-foreground border border-border" },
      { key: "input", label: "input", swatchClassName: "bg-background text-foreground border border-input" },
      { key: "ring", label: "ring", swatchClassName: "bg-background text-foreground ring-2 ring-ring" },
    ];

    return [
      { title: groupMain, tokens: main },
      { title: groupBackground, tokens: background },
      { title: groupText, tokens: text },
      { title: groupUi, tokens: ui },
    ];
  }, [groupBackground, groupMain, groupText, groupUi]);

  return (
    <section className="container mx-auto px-4 py-10 sm:py-14">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <Badge variant="secondary" className="mb-3">
          Theme-aware
        </Badge>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
          {description}
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-8">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              {group.title}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.tokens.map((token) => {
                const value = values[token.key] ?? "";
                return (
                  <motion.div
                    key={token.key}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-120px" }}
                    transition={{ duration: 0.35 }}
                  >
                    <Card className="overflow-hidden">
                      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                        <div>
                          <CardTitle className="text-sm">{token.label}</CardTitle>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            --{token.key}
                          </p>
                        </div>
                        <CopyButton
                          textToCopy={value || `var(--${token.key})`}
                          aria-label={`Copier ${token.label}`}
                        />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div
                          className={[
                            "flex h-20 items-end justify-between rounded-lg p-3",
                            token.swatchClassName,
                          ].join(" ")}
                        >
                          <span className="text-xs font-medium">Aa</span>
                          <span className="text-xs opacity-80">Theme</span>
                        </div>

                        <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                          {value ? value : `var(--${token.key})`}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

