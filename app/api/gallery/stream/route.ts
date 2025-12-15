import { NextRequest } from 'next/server';
import { gallerySSEManager } from '@/lib/sse';

export async function GET(request: NextRequest) {
  console.log('[Gallery SSE] Nouvelle connexion SSE reçue');

  // Créer un ReadableStream pour SSE
  const stream = new ReadableStream({
    start(controller) {
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const clientId = `${Date.now()}-${Math.random()}`;
      const encoder = new TextEncoder();
      console.log(`[Gallery SSE] Client ${clientId} se connecte depuis: ${userAgent?.substring(0, 50)}`);

      // Fonction pour envoyer des données
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          console.error(`[Gallery SSE] Erreur envoi à client ${clientId}:`, error);
        }
      };

      // Envoyer le message de connexion initial
      send(`event: connected\ndata: ${JSON.stringify({ clientId, message: 'Connexion SSE galerie établie' })}\n\n`);

      // Ajouter le client au manager (avec user-agent pour déduplication)
      gallerySSEManager.addClient(clientId, send, userAgent);
      console.log(`[Gallery SSE] Client ${clientId} ajouté. Total clients: ${gallerySSEManager.getClientCount()}`);

      // Envoyer un heartbeat toutes les 30 secondes pour garder la connexion active
      const heartbeatInterval = setInterval(() => {
        try {
          send(`: heartbeat\n\n`);
        } catch (error) {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Nettoyer quand le client se déconnecte
      request.signal.addEventListener('abort', () => {
        console.log(`[Gallery SSE] Client ${clientId} se déconnecte`);
        clearInterval(heartbeatInterval);
        gallerySSEManager.removeClient(clientId);
        console.log(`[Gallery SSE] Client ${clientId} supprimé. Total clients: ${gallerySSEManager.getClientCount()}`);
        try {
          controller.close();
        } catch (error) {
          // Ignorer les erreurs de fermeture
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Désactiver le buffering nginx
    },
  });
}
