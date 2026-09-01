import { readFile } from "fs/promises";
import { resolve } from "path";
import { Metadata } from "next";
import DomainsPage from "./page.client";

export const metadata: Metadata = {
  title: "Domaines",
  description: "Gérez les domaines utilisés par vos uploads ShareX",
};

async function getDomainsConfig() {
  try {
    const configPath = resolve(process.cwd(), "config", "uploads.json");
    const configFile = await readFile(configPath, "utf-8");
    const config = JSON.parse(configFile);

    return {
      domains: config.domains.list,
      config: {
        useSSL: config.domains.useSSL,
        pathPrefix: config.domains.pathPrefix,
        defaultDomain: config.domains.defaultDomain,
      },
    };
  } catch (error) {
    console.error("Error reading configuration:", error);
    return {
      domains: [],
      config: {
        useSSL: true,
        pathPrefix: "/uploads",
        defaultDomain: "default",
      },
    };
  }
}

export default async function Page() {
  const { domains, config } = await getDomainsConfig();

  return <DomainsPage initialDomains={domains} initialConfig={config} />;
}
