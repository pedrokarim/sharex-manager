import { readFile } from "fs/promises";
import { resolve } from "path";
import DomainsPage from "./page.client";

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
    console.error("Erreur lors de la lecture de la configuration:", error);
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
