import { GameRoom } from './game';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return new Response('Use the client from your public folder. Deploy public/ contents separately.', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    if (url.pathname.startsWith('/socket.io/')) {
      const upgradeHeader = request.headers.get('Upgrade');
      
      if (upgradeHeader === 'websocket') {
        const [client, server] = Object.values(new WebSocketPair());
        const gameRoom = env.GAME.get(env.GAME.idFromName('main'));
        gameRoom.acceptWebSocket(server);
        return new Response(null, { status: 101, webSocket: client });
      }
      
      return new Response('', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }
};
