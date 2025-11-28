"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { NewThemeEditorPreviewProps } from "@/types/new-theme";
import { ActionBar } from "./action-bar/action-bar";
import NewThemeTabsTriggerPill from "./components/new-theme-tabs-trigger-pill";
import NewThemeColorPreview from "./preview/new-theme-color-preview";
import CardsDemo from "./examples/cards";
import DashboardDemo from "./examples/dashboard";
import PricingDemo from "./examples/pricing";
import CustomDemo from "./examples/custom";
import NewThemeDashboardPreview from "./preview/new-theme-dashboard-preview";
import NewThemeTypographyPreview from "./preview/new-theme-typography-preview";

const NewThemePreviewPanel: React.FC<NewThemeEditorPreviewProps> = ({
  styles,
  currentMode,
}) => {
  if (!styles || !styles[currentMode]) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ActionBar />
      <Tabs defaultValue="cards" className="flex flex-1 flex-col overflow-hidden">
        <div className="mt-2 mb-1 px-4">
          <TabsList className="bg-background text-muted-foreground inline-flex w-fit items-center justify-center rounded-full px-0">
            <NewThemeTabsTriggerPill value="custom">Custom</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="cards">Cards</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="dashboard">Dashboard</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="pricing">Pricing</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="typography">Typography</NewThemeTabsTriggerPill>
            <NewThemeTabsTriggerPill value="colors">Color Palette</NewThemeTabsTriggerPill>
          </TabsList>
        </div>

        <section className="relative size-full overflow-hidden p-4 pt-1">
          <div className="relative isolate size-full overflow-hidden rounded-lg border">
            <TabsContent value="custom" className="m-0 size-full">
              <ScrollArea className="size-full">
                <CustomDemo />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="cards" className="m-0 size-full">
              <ScrollArea className="size-full">
                <CardsDemo />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="dashboard" className="m-0 size-full">
              <ScrollArea className="size-full">
                <DashboardDemo />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="pricing" className="m-0 size-full">
              <ScrollArea className="size-full">
                <PricingDemo />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="typography" className="m-0 size-full">
              <ScrollArea className="size-full">
                <div className="p-4">
                  <NewThemeTypographyPreview styles={styles} currentMode={currentMode} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="colors" className="m-0 size-full">
              <ScrollArea className="size-full">
                <div className="p-4">
                  <NewThemeColorPreview styles={styles} currentMode={currentMode} />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </section>
      </Tabs>
    </div>
  );
};

export default NewThemePreviewPanel;
