"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNewThemeStore } from "@/store/new-theme-store";
import { Theme, ThemeStyles } from "@/types/new-theme";
import { Sliders } from "lucide-react";
import React, { useEffect } from "react";
import NewThemeControlPanel from "./new-theme-control-panel";
import NewThemePreviewPanel from "./new-theme-preview-panel";
import { useIsMobile } from "@/hooks/use-mobile";

interface NewThemeEditorProps {}

const isThemeStyles = (styles: unknown): styles is ThemeStyles => {
  return (
    !!styles &&
    typeof styles === "object" &&
    styles !== null &&
    "light" in styles &&
    "dark" in styles
  );
};

const NewThemeEditor: React.FC<NewThemeEditorProps> = () => {
  const themeState = useNewThemeStore((state) => state.themeState);
  const setThemeState = useNewThemeStore((state) => state.setThemeState);
  const isMobile = useIsMobile();

  const handleStyleChange = React.useCallback(
    (newStyles: ThemeStyles) => {
      const prev = useNewThemeStore.getState().themeState;
      setThemeState({ ...prev, styles: newStyles });
    },
    [setThemeState]
  );

  useEffect(() => {
    // Initialize with default theme if needed
    const currentState = useNewThemeStore.getState();
    if (!currentState.themeState.styles) {
      // Initialize with default styles
      setThemeState({
        ...currentState.themeState,
        styles: {
          light: {
            primary: "hsl(222.2 47.4% 11.2%)",
            "primary-foreground": "hsl(210 40% 98%)",
            secondary: "hsl(210 40% 96%)",
            "secondary-foreground": "hsl(222.2 84% 4.9%)",
            accent: "hsl(210 40% 96%)",
            "accent-foreground": "hsl(222.2 84% 4.9%)",
            background: "hsl(0 0% 100%)",
            foreground: "hsl(222.2 84% 4.9%)",
            card: "hsl(0 0% 100%)",
            "card-foreground": "hsl(222.2 84% 4.9%)",
            popover: "hsl(0 0% 100%)",
            "popover-foreground": "hsl(222.2 84% 4.9%)",
            muted: "hsl(210 40% 96%)",
            "muted-foreground": "hsl(215.4 16.3% 46.9%)",
            destructive: "hsl(0 84.2% 60.2%)",
            "destructive-foreground": "hsl(210 40% 98%)",
            border: "hsl(214.3 31.8% 91.4%)",
            input: "hsl(214.3 31.8% 91.4%)",
            ring: "hsl(222.2 84% 4.9%)",
            radius: "0.5rem",
          },
          dark: {
            primary: "hsl(210 40% 98%)",
            "primary-foreground": "hsl(222.2 47.4% 11.2%)",
            secondary: "hsl(217.2 32.6% 17.5%)",
            "secondary-foreground": "hsl(210 40% 98%)",
            accent: "hsl(217.2 32.6% 17.5%)",
            "accent-foreground": "hsl(210 40% 98%)",
            background: "hsl(222.2 84% 4.9%)",
            foreground: "hsl(210 40% 98%)",
            card: "hsl(222.2 84% 4.9%)",
            "card-foreground": "hsl(210 40% 98%)",
            popover: "hsl(222.2 84% 4.9%)",
            "popover-foreground": "hsl(210 40% 98%)",
            muted: "hsl(217.2 32.6% 17.5%)",
            "muted-foreground": "hsl(215 20.2% 65.1%)",
            destructive: "hsl(0 62.8% 30.6%)",
            "destructive-foreground": "hsl(210 40% 98%)",
            border: "hsl(217.2 32.6% 17.5%)",
            input: "hsl(217.2 32.6% 17.5%)",
            ring: "hsl(212.7 26.8% 83.9%)",
            radius: "0.5rem",
          },
        },
      });
    }
  }, [setThemeState]);

  const styles = themeState.styles;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="relative isolate flex flex-1 overflow-hidden">
        <div className="size-full flex-1 overflow-hidden">
          <Tabs defaultValue="controls" className="h-full">
            <TabsList className="w-full rounded-none">
              <TabsTrigger value="controls" className="flex-1">
                <Sliders className="mr-2 h-4 w-4" />
                Controls
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="controls" className="mt-0 h-[calc(100%-2.5rem)]">
              <div className="flex h-full flex-col">
                <NewThemeControlPanel
                  styles={styles}
                  onChange={handleStyleChange}
                  currentMode={themeState.currentMode}
                />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-0 h-[calc(100%-2.5rem)]">
              <div className="flex h-full flex-col">
                <NewThemePreviewPanel styles={styles} currentMode={themeState.currentMode} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="relative isolate flex flex-1 overflow-hidden">
      <div className="size-full">
        <ResizablePanelGroup direction="horizontal" className="isolate">
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            className="z-1 min-w-[max(20%,22rem)]"
          >
            <div className="relative isolate flex h-full flex-1 flex-col">
              <NewThemeControlPanel
                styles={styles}
                onChange={handleStyleChange}
                currentMode={themeState.currentMode}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={70}>
            <div className="flex h-full flex-col">
              <div className="flex min-h-0 flex-1 flex-col">
                <NewThemePreviewPanel styles={styles} currentMode={themeState.currentMode} />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default NewThemeEditor;
