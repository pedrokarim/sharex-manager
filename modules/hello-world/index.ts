"use client";

import { ModuleHooks } from "@/types/modules";
import { MessageSquare } from "lucide-react";
import HelloWorldUI from "./ui";

const HelloWorldModule: ModuleHooks = {
  onInit: () => {
    console.log("Module Hello World initialisé");
  },
  onEnable: () => {
    console.log("Module Hello World activé");
  },
  onDisable: () => {
    console.log("Module Hello World désactivé");
  },
  renderUI: (fileInfo: any, onComplete: (result: any) => void) => {
    return <HelloWorldUI fileInfo={fileInfo} onComplete={onComplete} />;
  },
  getActionIcon: () => ({
    icon: MessageSquare,
    tooltip: "Hello World",
  }),
};

export default HelloWorldModule;
