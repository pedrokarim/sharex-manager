import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { NextRequest, NextResponse } from "next/server";
import { Domain } from "@/lib/types/upload-config";
import { logDb } from "@/lib/utils/db";
import { auth } from "@/auth";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

async function readConfig() {
  try {
    const configFile = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configFile);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la lecture de la configuration des domaines",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_PATH,
      },
    });
    throw error;
  }
}

async function writeConfig(config: any) {
  try {
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de l'écriture de la configuration des domaines",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        configPath: CONFIG_PATH,
      },
    });
    throw error;
  }
}

export async function GET() {
  const session = await auth();
  try {
    if (!session?.user) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de lecture des domaines non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const config = await readConfig();

    logDb.createLog({
      level: "info",
      action: "admin.action",
      message: "Lecture des domaines réussie",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
    });

    return NextResponse.json(config.domains.list);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la lecture des domaines",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Erreur lors de la lecture des domaines" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    if (!session?.user || session.user.role !== "admin") {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative d'ajout de domaine non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const newDomain = await request.json();
    const config = await readConfig();

    // Vérifier si le domaine existe déjà
    if (config.domains.list.some((d: Domain) => d.url === newDomain.url)) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative d'ajout d'un domaine déjà existant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          domainUrl: newDomain.url,
        },
      });
      return NextResponse.json(
        { error: "Ce domaine existe déjà" },
        { status: 400 }
      );
    }

    // Si c'est le premier domaine, le définir comme domaine par défaut
    if (config.domains.list.length === 0) {
      newDomain.isDefault = true;
      config.domains.defaultDomain = newDomain.id;
    } else if (newDomain.isDefault) {
      // Si le nouveau domaine est défini comme par défaut, retirer le statut par défaut des autres domaines
      config.domains.list.forEach((d: Domain) => {
        d.isDefault = false;
      });
      config.domains.defaultDomain = newDomain.id;
    }

    config.domains.list.push(newDomain);
    await writeConfig(config);

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Ajout d'un nouveau domaine",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        domain: newDomain,
        isFirstDomain: config.domains.list.length === 1,
      },
    });

    return NextResponse.json(newDomain);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de l'ajout du domaine",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Erreur lors de l'ajout du domaine" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  try {
    if (!session?.user || session.user.role !== "admin") {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de modification de domaine non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const updates = await request.json();
    const config = await readConfig();

    const domainIndex = config.domains.list.findIndex(
      (d: Domain) => d.id === updates.id
    );

    if (domainIndex === -1) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de modification d'un domaine inexistant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          domainId: updates.id,
        },
      });
      return NextResponse.json(
        { error: "Domaine non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si le domaine existe déjà (sauf pour le domaine en cours de modification)
    if (
      config.domains.list.some(
        (d: Domain) => d.url === updates.url && d.id !== updates.id
      )
    ) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de modification vers un domaine déjà existant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          domainId: updates.id,
          newUrl: updates.url,
        },
      });
      return NextResponse.json(
        { error: "Ce domaine existe déjà" },
        { status: 400 }
      );
    }

    const oldDomain = { ...config.domains.list[domainIndex] };

    // Si on définit ce domaine comme domaine par défaut
    if (updates.isDefault) {
      // Retirer le statut par défaut des autres domaines
      config.domains.list.forEach((d: Domain) => {
        if (d.id !== updates.id) {
          d.isDefault = false;
        }
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

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Modification d'un domaine",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        domainId: updates.id,
        changes: {
          before: oldDomain,
          after: config.domains.list[domainIndex],
        },
      },
    });

    return NextResponse.json(config.domains.list[domainIndex]);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la mise à jour du domaine",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du domaine" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  try {
    if (!session?.user || session.user.role !== "admin") {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de suppression de domaine non autorisée",
        userId: session?.user?.id || undefined,
        userEmail: session?.user?.email || undefined,
      });
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("id");

    if (!domainId) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de suppression sans ID de domaine",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
      });
      return NextResponse.json(
        { error: "ID de domaine manquant" },
        { status: 400 }
      );
    }

    const config = await readConfig();

    const domainIndex = config.domains.list.findIndex(
      (d: Domain) => d.id === domainId
    );

    if (domainIndex === -1) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de suppression d'un domaine inexistant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          domainId,
        },
      });
      return NextResponse.json(
        { error: "Domaine non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si c'est le dernier domaine
    if (config.domains.list.length === 1) {
      logDb.createLog({
        level: "warning",
        action: "admin.action",
        message: "Tentative de suppression du dernier domaine",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          domainId,
        },
      });
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier domaine" },
        { status: 400 }
      );
    }

    const deletedDomain = { ...config.domains.list[domainIndex] };

    // Si le domaine supprimé était le domaine par défaut
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

    logDb.createLog({
      level: "info",
      action: "config.update",
      message: "Suppression d'un domaine",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        deletedDomain,
        wasDefault: deletedDomain.isDefault,
        newDefaultDomainId: config.domains.defaultDomain,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la suppression du domaine",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Erreur lors de la suppression du domaine" },
      { status: 500 }
    );
  }
}
