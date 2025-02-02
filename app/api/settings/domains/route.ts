import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { NextRequest, NextResponse } from "next/server";
import { Domain } from "@/lib/types/upload-config";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

async function readConfig() {
  const configFile = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(configFile);
}

async function writeConfig(config: any) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  try {
    const config = await readConfig();
    return NextResponse.json(config.domains.list);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la lecture des domaines" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const newDomain = await request.json();
    const config = await readConfig();

    // Vérifier si le domaine existe déjà
    if (
      config.domains.list.some((d: Domain) => d.domain === newDomain.domain)
    ) {
      return NextResponse.json(
        { error: "Ce domaine existe déjà" },
        { status: 400 }
      );
    }

    // Si c'est le premier domaine, le définir comme domaine par défaut
    if (config.domains.list.length === 0) {
      newDomain.isDefault = true;
      config.domains.defaultDomain = newDomain.id;
    }

    config.domains.list.push(newDomain);
    await writeConfig(config);

    return NextResponse.json(newDomain);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du domaine" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const updates = await request.json();
    const config = await readConfig();

    const domainIndex = config.domains.list.findIndex(
      (d: Domain) => d.id === updates.id
    );

    if (domainIndex === -1) {
      return NextResponse.json(
        { error: "Domaine non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si le domaine existe déjà (sauf pour le domaine en cours de modification)
    if (
      config.domains.list.some(
        (d: Domain) => d.domain === updates.domain && d.id !== updates.id
      )
    ) {
      return NextResponse.json(
        { error: "Ce domaine existe déjà" },
        { status: 400 }
      );
    }

    // Si on définit ce domaine comme domaine par défaut
    if (updates.isDefault) {
      // Retirer le statut par défaut des autres domaines
      config.domains.list.forEach((d: Domain) => {
        d.isDefault = false;
      });
      config.domains.defaultDomain = updates.id;
    }
    // Si on retire le statut par défaut de ce domaine
    else if (config.domains.list[domainIndex].isDefault && !updates.isDefault) {
      // Vérifier s'il y a d'autres domaines
      if (config.domains.list.length > 1) {
        // Définir le premier autre domaine comme domaine par défaut
        const newDefault = config.domains.list.find(
          (d: Domain) => d.id !== updates.id
        );
        if (newDefault) {
          newDefault.isDefault = true;
          config.domains.defaultDomain = newDefault.id;
        }
      } else {
        // S'il n'y a qu'un seul domaine, il doit rester par défaut
        updates.isDefault = true;
      }
    }

    config.domains.list[domainIndex] = {
      ...config.domains.list[domainIndex],
      ...updates,
    };

    await writeConfig(config);

    return NextResponse.json(config.domains.list[domainIndex]);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du domaine" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const config = await readConfig();
    const domainId = params.id;

    const domainIndex = config.domains.list.findIndex(
      (d: Domain) => d.id === domainId
    );

    if (domainIndex === -1) {
      return NextResponse.json(
        { error: "Domaine non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si c'est le dernier domaine
    if (config.domains.list.length === 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier domaine" },
        { status: 400 }
      );
    }

    // Si le domaine supprimé était le domaine par défaut
    const deletedDomain = config.domains.list[domainIndex];
    if (deletedDomain.isDefault || config.domains.defaultDomain === domainId) {
      // Définir le premier domaine restant comme domaine par défaut
      const newDefaultDomain = config.domains.list.find(
        (d: Domain) => d.id !== domainId
      );
      if (newDefaultDomain) {
        newDefaultDomain.isDefault = true;
        config.domains.defaultDomain = newDefaultDomain.id;
      }
    }

    config.domains.list.splice(domainIndex, 1);
    await writeConfig(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la suppression du domaine" },
      { status: 500 }
    );
  }
}
