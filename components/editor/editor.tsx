"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAtom } from "jotai";
import { themeEditorStateAtom, setThemeStateAtom } from "@/lib/atoms/editor";
import { Theme, ThemeStyles } from "@/types/theme";
import { Sliders } from "lucide-react";
import React, { use, useEffect } from "react";
import { ActionBar } from "./action-bar/action-bar";
import ThemeControlPanel from "./theme-control-panel";
import ThemePreviewPanel from "./theme-preview-panel";
import { useIsMobile } from "@/hooks/use-mobile";

interface EditorProps {
  themePromise: Promise<Theme | null>;
  showActionBar?: boolean;
}

const isThemeStyles = (styles: unknown): styles is ThemeStyles => {
  return (
    !!styles &&
    typeof styles === "object" &&
    styles !== null &&
    "light" in styles &&
    "dark" in styles
  );
};

const Editor: React.FC<EditorProps> = ({ themePromise, showActionBar = true }) => {
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, setThemeState] = useAtom(setThemeStateAtom);
  const isMobile = useIsMobile();

  const initialTheme = themePromise ? use(themePromise) : null;

  const handleStyleChange = React.useCallback(
    (newStyles: ThemeStyles) => {
      setThemeState({ ...themeState, styles: newStyles });
    },
    [setThemeState, themeState]
  );

  useEffect(() => {
    if (initialTheme && isThemeStyles(initialTheme.styles)) {
      setThemeState({
        ...themeState,
        styles: initialTheme.styles,
        preset: initialTheme.id,
      });
    }
  }, [initialTheme, setThemeState, themeState]);

  if (initialTheme && !isThemeStyles(initialTheme.styles)) {
    return (
      <div className="text-destructive flex h-full items-center justify-center">
        Fetched theme data is invalid.
      </div>
    );
  }

  const styles = themeState.styles;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="relative isolate flex h-full min-h-0 flex-1 overflow-hidden">
        <div className="size-full min-h-0 flex-1 overflow-hidden">
          <Tabs
            defaultValue="controls"
            className="flex h-full min-h-0 flex-col overflow-hidden"
          >
            <TabsList className="w-full rounded-none">
              <TabsTrigger value="controls" className="flex-1">
                <Sliders className="mr-2 h-4 w-4" />
                Controls
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="controls"
              className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
            >
              <div className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
                <ThemeControlPanel
                  styles={styles}
                  onChange={handleStyleChange}
                  currentMode={themeState.currentMode}
                  themePromise={themePromise}
                />
              </div>
            </TabsContent>
            <TabsContent
              value="preview"
              className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
            >
              <div className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
                {showActionBar ? <ActionBar /> : null}
                <ThemePreviewPanel styles={styles} currentMode={themeState.currentMode} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="relative isolate flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="size-full min-h-0 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          className="isolate h-full min-h-0 overflow-hidden"
        >
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            className="z-1 min-h-0 min-w-[max(20%,22rem)] overflow-hidden"
          >
            <div className="relative isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <ThemeControlPanel
                styles={styles}
                onChange={handleStyleChange}
                currentMode={themeState.currentMode}
                themePromise={themePromise}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={70} className="min-h-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {showActionBar ? <ActionBar /> : null}
                <ThemePreviewPanel styles={styles} currentMode={themeState.currentMode} />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default Editor;
