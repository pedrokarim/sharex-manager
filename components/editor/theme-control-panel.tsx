"use client";

import { AlertCircle, Sparkle } from "lucide-react";
import React, { use } from "react";

import { ChatInterface } from "@/components/editor/ai/chat-interface";
import { ColorsTabContent } from "@/components/editor/colors-tab-content";
import ControlSection from "@/components/editor/control-section";
import { FontPicker } from "@/components/editor/font-picker";
import HslAdjustmentControls from "@/components/editor/hsl-adjustment-controls";
import ShadowControl from "@/components/editor/shadow-control";
import { SliderWithInput } from "@/components/editor/slider-with-input";
import ThemeEditActions from "@/components/editor/theme-edit-actions";
import ThemePresetSelect from "@/components/editor/theme-preset-select";
import TabsTriggerPill from "@/components/editor/theme-preview/tabs-trigger-pill";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { COMMON_STYLES, defaultThemeState } from "@/config/theme";
import { useAIThemeGenerationCore } from "@/hooks/use-ai-theme-generation-core";
import {
  useControlsTabFromUrl,
  type ControlTab,
} from "@/hooks/use-controls-tab-from-url";
import { useAtom } from "jotai";
import { themeEditorStateAtom } from "@/lib/atoms/editor";
import { type FontInfo } from "@/types/fonts";
import { ThemeEditorControlsProps, ThemeStyleProps } from "@/types/theme";
import { buildFontFamily } from "@/utils/fonts";
import { getAppliedThemeFont } from "@/utils/theme-fonts";

// Component to handle tab state from URL with Suspense boundary
function TabHandler({
  children,
}: {
  children: (
    tab: ControlTab,
    handleSetTab: (tab: ControlTab) => void,
  ) => React.ReactNode;
}) {
  const { tab, handleSetTab } = useControlsTabFromUrl();
  return <>{children(tab, handleSetTab)}</>;
}

const ThemeControlPanel = ({
  styles,
  currentMode,
  onChange,
  themePromise,
}: ThemeEditorControlsProps) => {
  const [themeState] = useAtom(themeEditorStateAtom);
  const { isGeneratingTheme } = useAIThemeGenerationCore();

  const currentStyles = React.useMemo(
    () => ({
      ...defaultThemeState.styles[currentMode],
      ...styles?.[currentMode],
    }),
    [currentMode, styles],
  );

  const updateStyle = React.useCallback(
    <K extends keyof typeof currentStyles>(
      key: K,
      value: (typeof currentStyles)[K],
    ) => {
      // apply common styles to both light and dark modes
      if (COMMON_STYLES.includes(key)) {
        onChange({
          ...styles,
          light: { ...styles.light, [key]: value },
          dark: { ...styles.dark, [key]: value },
        });
        return;
      }

      onChange({
        ...styles,
        [currentMode]: {
          ...currentStyles,
          [key]: value,
        },
      });
    },
    [onChange, styles, currentMode, currentStyles],
  );

  const updateStyles = React.useCallback(
    (updates: Partial<ThemeStyleProps>) => {
      onChange({
        ...styles,
        [currentMode]: {
          ...currentStyles,
          ...updates,
        },
      });
    },
    [onChange, styles, currentMode, currentStyles],
  );

  // Ensure we have valid styles for the current mode
  if (!currentStyles) {
    return null; // Or some fallback UI
  }

  const radius = parseFloat(currentStyles.radius.replace("rem", ""));

  const theme = use(themePromise);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b">
        {!theme ? (
          <ThemePresetSelect
            className="h-14 rounded-none"
            disabled={isGeneratingTheme}
          />
        ) : (
          <ThemeEditActions theme={theme} disabled={isGeneratingTheme} />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabHandler>
          {(tab, handleSetTab) => (
            <Tabs
              value={tab}
              onValueChange={(v) => handleSetTab(v as ControlTab)}
              className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
            >
              <HorizontalScrollArea className="mt-2 mb-1 px-4">
                <TabsList className="bg-background text-muted-foreground inline-flex w-fit items-center justify-center rounded-full px-0">
                  <TabsTriggerPill value="colors">Colors</TabsTriggerPill>
                  <TabsTriggerPill value="typography">
                    Typography
                  </TabsTriggerPill>
                  <TabsTriggerPill value="other">Other</TabsTriggerPill>
                  <TabsTriggerPill
                    value="ai"
                    className="data-[state=active]:[--effect:var(--secondary-foreground)] data-[state=active]:[--foreground:var(--muted-foreground)] data-[state=active]:[--muted-foreground:var(--effect)]"
                  >
                    <Sparkle className="mr-1 size-3.5 text-current" />
                    <span className="animate-text via-foreground from-muted-foreground to-muted-foreground flex items-center gap-1 bg-gradient-to-r from-50% via-60% to-100% bg-[200%_auto] bg-clip-text text-sm text-transparent">
                      Generate
                    </span>
                  </TabsTriggerPill>
                </TabsList>
              </HorizontalScrollArea>

              <TabsContent
                value="colors"
                className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                <ColorsTabContent
                  currentStyles={currentStyles}
                  updateStyle={updateStyle}
                  updateStyles={updateStyles}
                />
              </TabsContent>

              <TabsContent
                value="typography"
                className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                <ScrollArea className="h-full px-4">
                  <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[11px]">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <div>
                      <p>
                        To use custom fonts, embed them in your project. See{" "}
                        <a
                          href="https://tailwindcss.com/docs/font-family"
                          target="_blank"
                          className="text-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors"
                        >
                          Tailwind docs
                        </a>{" "}
                        for details.
                      </p>
                    </div>
                  </div>

                  <ControlSection title="Font Family" expanded>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="font-sans"
                          className="text-muted-foreground w-16 shrink-0 text-[11px] font-medium"
                        >
                          Sans
                        </Label>
                        <div className="min-w-0 flex-1">
                          <FontPicker
                            value={
                              getAppliedThemeFont(themeState, "font-sans") ||
                              undefined
                            }
                            category="sans-serif"
                            placeholder="Sans-serif font..."
                            onSelect={(font: FontInfo) => {
                              const fontFamily = buildFontFamily(
                                font.family,
                                font.category,
                              );
                              updateStyle("font-sans", fontFamily);
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="font-serif"
                          className="text-muted-foreground w-16 shrink-0 text-[11px] font-medium"
                        >
                          Serif
                        </Label>
                        <div className="min-w-0 flex-1">
                          <FontPicker
                            value={
                              getAppliedThemeFont(themeState, "font-serif") ||
                              undefined
                            }
                            category="serif"
                            placeholder="Serif font..."
                            onSelect={(font: FontInfo) => {
                              const fontFamily = buildFontFamily(
                                font.family,
                                font.category,
                              );
                              updateStyle("font-serif", fontFamily);
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="font-mono"
                          className="text-muted-foreground w-16 shrink-0 text-[11px] font-medium"
                        >
                          Mono
                        </Label>
                        <div className="min-w-0 flex-1">
                          <FontPicker
                            value={
                              getAppliedThemeFont(themeState, "font-mono") ||
                              undefined
                            }
                            category="monospace"
                            placeholder="Monospace font..."
                            onSelect={(font: FontInfo) => {
                              const fontFamily = buildFontFamily(
                                font.family,
                                font.category,
                              );
                              updateStyle("font-mono", fontFamily);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </ControlSection>

                  <ControlSection title="Letter Spacing" expanded>
                    <SliderWithInput
                      value={parseFloat(
                        currentStyles["letter-spacing"]?.replace("em", ""),
                      )}
                      onChange={(value) =>
                        updateStyle("letter-spacing", `${value}em`)
                      }
                      min={-0.5}
                      max={0.5}
                      step={0.025}
                      unit="em"
                      label="Tracking"
                    />
                  </ControlSection>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="other"
                className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                <ScrollArea className="h-full px-4">
                  <ControlSection title="HSL Adjustments" expanded>
                    <HslAdjustmentControls />
                  </ControlSection>

                  <ControlSection title="Radius" expanded>
                    <SliderWithInput
                      value={radius}
                      onChange={(value) => updateStyle("radius", `${value}rem`)}
                      min={0}
                      max={5}
                      step={0.025}
                      unit="rem"
                      label="Radius"
                    />
                  </ControlSection>

                  <ControlSection title="Spacing">
                    <SliderWithInput
                      value={parseFloat(
                        currentStyles?.spacing?.replace("rem", "") || "0",
                      )}
                      onChange={(value) =>
                        updateStyle("spacing", `${value}rem`)
                      }
                      min={0.15}
                      max={0.35}
                      step={0.01}
                      unit="rem"
                      label="Spacing"
                    />
                  </ControlSection>

                  <ControlSection title="Shadow">
                    <ShadowControl
                      shadowColor={currentStyles["shadow-color"]}
                      shadowOpacity={parseFloat(
                        currentStyles["shadow-opacity"],
                      )}
                      shadowBlur={parseFloat(
                        currentStyles["shadow-blur"]?.replace("px", ""),
                      )}
                      shadowSpread={parseFloat(
                        currentStyles["shadow-spread"]?.replace("px", ""),
                      )}
                      shadowOffsetX={parseFloat(
                        currentStyles["shadow-offset-x"]?.replace("px", ""),
                      )}
                      shadowOffsetY={parseFloat(
                        currentStyles["shadow-offset-y"]?.replace("px", ""),
                      )}
                      onChange={(key, value) => {
                        if (key === "shadow-color") {
                          updateStyle(key, value as string);
                        } else if (key === "shadow-opacity") {
                          updateStyle(key, value.toString());
                        } else {
                          updateStyle(
                            key as keyof ThemeStyleProps,
                            `${value}px`,
                          );
                        }
                      }}
                    />
                  </ControlSection>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="ai"
                className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                <ChatInterface />
              </TabsContent>
            </Tabs>
          )}
        </TabHandler>
      </div>
    </div>
  );
};

export default ThemeControlPanel;
