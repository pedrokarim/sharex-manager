// Système de broadcast pour SSE (Server-Sent Events)
// Utilise un singleton global pour partager l'état entre les routes

interface SSEClient {
  id: string;
  send: (data: string) => void;
  lastActivity: number;
  userAgent?: string;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private messageId = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private static MAX_CLIENTS = 50;

  // Singleton global au niveau du processus (globalThis)
  static getInstance(): SSEManager {
    // Utiliser globalThis pour partager entre toutes les instances du module
    const globalKey = "__gallery_sse_manager_instance__";
    if (!(globalThis as any)[globalKey]) {
      (globalThis as any)[globalKey] = new SSEManager();
      console.log("[Gallery SSE] Nouvelle instance SSEManager créée");
      // Démarrer le nettoyage automatique
      (globalThis as any)[globalKey].startCleanup();
    }
    return (globalThis as any)[globalKey];
  }

  addClient(id: string, send: (data: string) => void, userAgent?: string): void {
    // Éviter l'accumulation infinie : évincer les plus anciens si on dépasse le max
    if (this.clients.size >= SSEManager.MAX_CLIENTS) {
      const oldest = Array.from(this.clients.entries())
        .sort((a, b) => a[1].lastActivity - b[1].lastActivity);
      const toRemove = oldest.slice(0, this.clients.size - SSEManager.MAX_CLIENTS + 1);
      for (const [clientId] of toRemove) {
        console.log(`[Gallery SSE] Éviction du client le plus ancien: ${clientId}`);
        this.clients.delete(clientId);
      }
    }

    this.clients.set(id, { id, send, lastActivity: Date.now(), userAgent });
    console.log(
      `[Gallery SSE] Client ajouté: ${id}, total: ${this.clients.size}`
    );
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    console.log(
      `[Gallery SSE] Client supprimé: ${id}, total: ${this.clients.size}`
    );
  }

  broadcast(event: string, data: any): void {
    const message = `id: ${this
      .messageId++}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    console.log(
      `[Gallery SSE] Broadcast event "${event}" to ${this.clients.size} client(s)`
    );
    console.log(
      `[Gallery SSE] Active client IDs:`,
      Array.from(this.clients.keys())
    );

    let successCount = 0;
    let errorCount = 0;

    this.clients.forEach((client) => {
      try {
        client.send(message);
        client.lastActivity = Date.now();
        successCount++;
      } catch (error) {
        console.error(
          `[Gallery SSE] Erreur envoi à client ${client.id}:`,
          error
        );
        // Client déconnecté, on le supprime
        this.removeClient(client.id);
        errorCount++;
      }
    });

    console.log(
      `[Gallery SSE] Send results: ${successCount} success, ${errorCount} errors`
    );
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private startCleanup(): void {
    // Nettoyer les connexions mortes toutes les 30 secondes
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadConnections();
    }, 30000);

    // En développement, nettoyer aussi les connexions inactives depuis plus de 5 minutes
    if (process.env.NODE_ENV === "development") {
      setInterval(() => {
        this.cleanupInactiveConnections();
      }, 60000); // Toutes les minutes
    }
  }

  private cleanupDeadConnections(): void {
    const initialCount = this.clients.size;
    const deadClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      try {
        // Essayer d'envoyer un ping pour tester la connexion
        client.send(": ping\n\n");
      } catch (error) {
        // Si l'envoi échoue, la connexion est morte
        deadClients.push(clientId);
      }
    });

    // Supprimer les connexions mortes
    deadClients.forEach((clientId) => {
      this.removeClient(clientId);
    });

    if (deadClients.length > 0) {
      console.log(
        `[Gallery SSE] Nettoyé ${deadClients.length} connexions mortes (${initialCount} -> ${this.clients.size})`
      );
    }
  }

  private cleanupInactiveConnections(): void {
    if (process.env.NODE_ENV !== "development") return;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const inactiveClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      if (client.lastActivity < fiveMinutesAgo) {
        inactiveClients.push(clientId);
      }
    });

    inactiveClients.forEach((clientId) => {
      console.log(`[Gallery SSE] Suppression connexion inactive: ${clientId}`);
      this.removeClient(clientId);
    });

    if (inactiveClients.length > 0) {
      console.log(
        `[Gallery SSE] Nettoyé ${inactiveClients.length} connexions inactives`
      );
    }
  }
}

// Export du singleton
export const gallerySSEManager = SSEManager.getInstance();
