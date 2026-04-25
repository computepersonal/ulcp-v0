import { Server as SocketServer, Socket } from "socket.io";
import { verifyToken, TokenPayload } from "./jwt";
import { logger } from "./logger";

const KITCHEN_ROLES = new Set([
  "head_chef",
  "sous_chef",
  "line_cook",
  "kitchen_helper",
]);

function autoJoinRooms(socket: Socket & { data: { user: TokenPayload } }): void {
  const { tenant_id, branch_id, role, customer_id, device_id, station } = socket.data.user;

  if (customer_id) {
    socket.join(`customer:${customer_id}`);
    logger.debug({ customer_id }, "Customer joined room");
    return;
  }

  // KDS device — auto-join its kitchen station room
  if (role === "kds_device" && tenant_id && branch_id && station) {
    const room = `kitchen:${tenant_id}:${branch_id}:${station}`;
    socket.join(room);
    logger.info({ device_id, tenant_id, branch_id, station, room }, "KDS device joined kitchen room");
    return;
  }

  if (!tenant_id) return;

  // All staff join tenant room
  socket.join(`tenant:${tenant_id}`);

  // Owner/management rooms
  if (
    role === "tenant_owner" ||
    role === "platform_superadmin" ||
    role === "managing_partner"
  ) {
    socket.join(`tenant:${tenant_id}:owner`);
    socket.join(`tenant:${tenant_id}:dashboard`);
  }

  // Branch-specific room
  if (branch_id) {
    socket.join(`tenant:${tenant_id}:branch:${branch_id}`);
  }

  // Kitchen KDS room
  if (KITCHEN_ROLES.has(role) && branch_id) {
    socket.join(`kitchen:${tenant_id}:${branch_id}:kitchen`);
  }

  // Bar KDS room (Type 3 — seated_full_service)
  if (role === "bartender" && branch_id) {
    socket.join(`kitchen:${tenant_id}:${branch_id}:bar`);
  }

  logger.debug(
    { user_id: socket.data.user.user_id, tenant_id, role, branch_id },
    "Staff auto-joined rooms"
  );
}

function isRoomAllowed(room: string): boolean {
  const validPrefixes = ["tenant:", "kitchen:", "session:", "customer:", "token:", "order:"];
  return validPrefixes.some((p) => room.startsWith(p));
}

export function createSocketServer(
  httpServer: import("http").Server,
  corsOrigins: string[]
): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      logger.warn({ origin: socket.handshake.headers.origin }, "Socket auth rejected: no token");
      return next(new Error("Authentication required"));
    }

    const user = verifyToken(token);
    if (!user) {
      logger.warn({ tokenPrefix: token.slice(0, 20) }, "Socket auth rejected: invalid token");
      return next(new Error("Invalid or expired token"));
    }

    (socket as Socket & { data: { user: TokenPayload } }).data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const typedSocket = socket as Socket & { data: { user: TokenPayload } };
    const user = typedSocket.data.user;

    logger.info(
      {
        user_id: user.user_id,
        customer_id: user.customer_id,
        role: user.role,
        tenant_id: user.tenant_id,
      },
      "Socket connected"
    );

    // Auto-join rooms based on role
    autoJoinRooms(typedSocket);

    // Client can explicitly join additional rooms (e.g., session room)
    socket.on("join:room", ({ room }: { room: string }) => {
      if (!room || !isRoomAllowed(room)) {
        logger.warn({ room, user_id: user.user_id }, "Blocked join attempt to invalid room");
        return;
      }
      socket.join(room);
      logger.debug({ room, user_id: user.user_id }, "Joined room");
    });

    socket.on("leave:room", ({ room }: { room: string }) => {
      socket.leave(room);
      logger.debug({ room, user_id: user.user_id }, "Left room");
    });

    // Ping/pong for connection health check
    socket.on("ping", (cb: unknown) => {
      if (typeof cb === "function") {
        (cb as (data: { pong: boolean; ts: number }) => void)({
          pong: true,
          ts: Date.now(),
        });
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info(
        { user_id: user.user_id, customer_id: user.customer_id, reason },
        "Socket disconnected"
      );
    });

    socket.on("error", (err) => {
      logger.error({ err, user_id: user.user_id }, "Socket error");
    });
  });

  return io;
}
