// ─────────────────────────────────────────────────────────────
//  Real-time push over WebSockets (path: /api/ws)
//  Clients connect, then send { type: "auth", token: <access token> }.
//  The server pushes { type: "<event>", data } to every socket of a user.
// ─────────────────────────────────────────────────────────────
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");

const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30000;

// userId -> Set<WebSocket>
const sockets = new Map();

const register = (userId, ws) => {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId).add(ws);
};

const unregister = (userId, ws) => {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) sockets.delete(userId);
};

/**
 * Attach the WebSocket server to an existing HTTP server.
 * @param {import("http").Server} server
 * @param {string[]} allowedOrigins - browser origins allowed to connect
 */
const attach = (server, allowedOrigins) => {
  const wss = new WebSocketServer({
    server,
    path: "/api/ws",
    maxPayload: 4 * 1024,
    // Browsers always send Origin; reject cross-site pages (CSWSH protection)
    verifyClient: ({ origin }) => !origin || allowedOrigins.includes(origin),
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    const authTimer = setTimeout(() => ws.close(4001, "Authentication required"), AUTH_TIMEOUT_MS);

    ws.on("message", (raw) => {
      if (ws.userId) return; // only the auth message is accepted from clients
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== "auth") throw new Error("expected auth");
        const decoded = jwt.verify(msg.token, process.env.JWT_SECRET);
        ws.userId = decoded.id;
        clearTimeout(authTimer);
        register(ws.userId, ws);
        ws.send(JSON.stringify({ type: "ready" }));
      } catch {
        ws.close(4001, "Invalid token");
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (ws.userId) unregister(ws.userId, ws);
    });
  });

  // Drop dead connections
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
};

/** Push an event to every open socket of a user. Safe to call when no one is connected. */
const emitToUser = (userId, type, data) => {
  const set = sockets.get(Number(userId));
  if (!set) return;
  const payload = JSON.stringify({ type, data });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
};

module.exports = { attach, emitToUser };
