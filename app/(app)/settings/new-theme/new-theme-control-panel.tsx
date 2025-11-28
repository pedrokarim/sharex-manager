"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { COMMON_STYLES, defaultThemeState } from "@/config/theme";
import { useControlsTabFromUrl, type ControlTab } from "@/hooks/use-controls-tab-from-url";
import { useNewThemeStore } from "@/store/new-theme-store";
import { NewThemeEditorControlsProps, ThemeStyleProps } from "@/types/new-theme";
import NewThemeColorsTab from "./tabs/new-theme-colors-tab";
import NewThemeTypographyTab from "./tabs/new-theme-typography-tab";
import NewThemeOtherTab from "./tabs/new-theme-other-tab";
import NewThemeChatInterface from "./ai/new-theme-chat-interface";
import NewThemeTabsTriggerPill from "./components/new-theme-tabs-trigger-pill";
import { Sparkle } from "lucide-react";

const NewThemeControlPanel = ({
  styles,
  currentMode,
  onChange,
}: NewThemeEditorControlsProps) => {
  const { themeState } = useNewThemeStore();
  const { tab, handleSetTab } = useControlsTabFromUrl();

  const currentStyles = React.useMemo(
    () => ({
      ...defaultThemeState.styles[currentMode],
      ...styles?.[currentMode],
    }),
    [currentMode, styles]
  );

  const updateStyle = React.useCallback(
    <K extends keyof typeof currentStyles>(key: K, value: (typeof currentStyles)[K]) => {
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
    [onChange, styles, currentMode, currentStyles]
  );

  // Ensure we have valid styles for the current mode
  if (!currentStyles) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => handleSetTab(v as ControlTab)}
        className="flex min-h-0 w-full flex-1 flex-col"
      >
        <div className="mt-2 mb-1 px-4">
          <TabsList className="bg-background text-muted-foreground inline-flex w-fit items-center justify-center rounded-full px-0">
            <NewThemeTabsTriggerPill value="colors">Colors</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="typography">Typography</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="other">Other</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill
              value="ai"
              className="data-[state=active]:[--effect:var(--secondary-foreground)] data-[state=active]:[--foreground:var(--muted-foreground)] data-[state=active]:[--muted-foreground:var(--effect)]"
            >
              <Sparkle className="mr-1 size-3.5 text-current" />
              <span className="animate-text via-foreground from-muted-foreground to-muted-foreground flex items-center gap-1 bg-gradient-to-r from-50% via-60% to-100% bg-[200%_auto] bg-clip-text text-sm text-transparent">
                Generate
              </span>
            </NewThemeTabsTriggerPill>
          </TabsList>
        </div>

        <TabsContent value="colors" className="mt-1 size-full overflow-hidden">
          <ScrollArea className="h-full px-4">
            <NewThemeColorsTab
              currentStyles={currentStyles}
              updateStyle={updateStyle}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="typography" className="mt-1 size-full overflow-hidden">
          <ScrollArea className="h-full px-4">
            <NewThemeTypographyTab
              currentStyles={currentStyles}
              updateStyle={updateStyle}
              themeState={themeState}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="other" className="mt-1 size-full overflow-hidden">
          <ScrollArea className="h-full px-4">
            <NewThemeOtherTab
              currentStyles={currentStyles}
              updateStyle={updateStyle}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="ai" className="mt-1 size-full overflow-hidden">
          <NewThemeChatInterface />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NewThemeControlPanel;
