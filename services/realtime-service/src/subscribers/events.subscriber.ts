import type { Server as SocketServer } from "socket.io";
import { createSubscriberClient } from "../lib/redis";
import { logger } from "../lib/logger";
import type Redis from "ioredis";

// All event channels to subscribe (from CLAUDE.md)
const EVENT_CHANNELS = [
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "ORDER_COMPLETED",
  "KOT_CREATED",
  "KOT_STATUS_CHANGED",
  "TABLE_STATUS_CHANGED",
  "STOCK_LOW",
  "STOCK_CRITICAL",
  "ITEM_BACK_IN_STOCK",
  "MENU_ITEM_UNAVAILABLE",
  "DASHBOARD_UPDATE",
  "TOKEN_DISPLAY_UPDATE",
  "PAYMENT_COMPLETED",
  "TABLE_CLOSED",
  "TENANT_PLAN_CHANGED",
  "JUKEBOX_SONG_STARTED",
  "JUKEBOX_SONG_ENDED",
  "JUKEBOX_QUEUE_UPDATED",
  "KOT_REJECTED",
  "ORDER_UNBILLED_ALERT",
];

interface EventPayload {
  tenant_id?: string;
  branch_id?: string;
  session_id?: string;
  customer_id?: string;
  status?: string;
  [key: string]: unknown;
}

let subscriberClient: Redis | null = null;

function broadcast(io: SocketServer, room: string, event: string, payload: EventPayload): void {
  const count = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  logger.debug({ room, event, room_size: count }, "Broadcasting event");
  io.to(room).emit(event, payload);
}

function handleEvent(io: SocketServer, channel: string, payload: EventPayload): void {
  const { tenant_id, branch_id, session_id } = payload;

  switch (channel) {
    case "ORDER_CREATED": {
      if (tenant_id && branch_id) {
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "order:new", payload);
      }
      break;
    }

    case "ORDER_STATUS_CHANGED": {
      if (tenant_id && branch_id) {
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "order:status:changed", payload);
      }
      if (session_id) {
        broadcast(io, `session:${session_id}`, "order:status:changed", payload);
      }
      const order_id = payload["order_id"] as string | undefined;
      if (order_id) {
        broadcast(io, `order:${order_id}`, "order:status:changed", payload);
      }
      break;
    }

    case "ORDER_COMPLETED": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}:owner`, "order:completed", payload);
      }
      break;
    }

    case "KOT_CREATED": {
      if (tenant_id && branch_id) {
        // Route to kitchen or bar based on station in payload
        const station = (payload.station as string) ?? "kitchen";
        broadcast(io, `kitchen:${tenant_id}:${branch_id}:${station}`, "kot:created", payload);
      }
      break;
    }

    case "ORDER_UNBILLED_ALERT": {
      if (tenant_id) {
        // Alert owner/managers — order was in-progress but never billed
        broadcast(io, `tenant:${tenant_id}:owner`, "order:unbilled_alert", payload);
        if (branch_id) {
          broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "order:unbilled_alert", payload);
        }
      }
      break;
    }

    case "KOT_REJECTED": {
      if (tenant_id && branch_id) {
        // Notify branch staff (waiters/managers) — shown as alert in portal
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "kot:rejected", payload);
        // Also notify tenant room in case manager is on a different branch view
        broadcast(io, `tenant:${tenant_id}`, "kot:rejected", payload);
      }
      break;
    }

    case "KOT_STATUS_CHANGED": {
      if (tenant_id && branch_id) {
        const station = (payload.station as string) ?? "kitchen";
        broadcast(io, `kitchen:${tenant_id}:${branch_id}:${station}`, "kot:status:changed", payload);
        // If KOT is ready, also notify branch staff (waiters)
        if (payload.status === "ready") {
          broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "kot:ready", payload);
        }
      }
      break;
    }

    case "TABLE_STATUS_CHANGED":
    case "TABLE_CLOSED": {
      if (tenant_id && branch_id) {
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "table:status:changed", payload);
      }
      break;
    }

    case "STOCK_LOW": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}:owner`, "inventory:low", payload);
      }
      break;
    }

    case "STOCK_CRITICAL": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}`, "inventory:critical", payload);
      }
      break;
    }

    case "ITEM_BACK_IN_STOCK": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}`, "menu:item:available", payload);
      }
      break;
    }

    case "MENU_ITEM_UNAVAILABLE": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}`, "menu:item:unavailable", payload);
      }
      break;
    }

    case "DASHBOARD_UPDATE": {
      if (tenant_id) {
        broadcast(io, `tenant:${tenant_id}:dashboard`, "dashboard:update", payload);
      }
      break;
    }

    case "TOKEN_DISPLAY_UPDATE": {
      if (tenant_id && branch_id) {
        broadcast(io, `token:${tenant_id}:${branch_id}`, "token:update", payload);
      }
      break;
    }

    case "PAYMENT_COMPLETED": {
      if (tenant_id && branch_id) {
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "payment:completed", payload);
      }
      if (session_id) {
        broadcast(io, `session:${session_id}`, "payment:completed", payload);
      }
      const order_id = payload["order_id"] as string | undefined;
      if (order_id) {
        broadcast(io, `order:${order_id}`, "payment:completed", payload);
      }
      break;
    }

    case "TENANT_PLAN_CHANGED": {
      if (tenant_id) {
        // Broadcast to all tenant staff to re-fetch their config
        broadcast(io, `tenant:${tenant_id}`, "tenant:plan:changed", payload);
      }
      break;
    }

    case "JUKEBOX_SONG_STARTED": {
      if (tenant_id && branch_id) {
        // Emit to /social namespace room so customers in social room see it
        const song = payload.song as Record<string, unknown> | undefined;
        io.of("/social")
          .to(`social:${tenant_id}:${branch_id}`)
          .emit("jukebox:now_playing", {
            song_title: song?.song_title ?? "",
            song_artist: song?.song_artist ?? "",
            song_thumbnail: song?.song_thumbnail ?? "",
            song_duration_secs: song?.song_duration_secs ?? 0,
            requested_by_alias: payload.requested_by_alias,
            dedicated_to_alias: payload.dedicated_to_alias,
            dedication_message: payload.dedication_message,
          });
        // Also broadcast to staff rooms
        broadcast(io, `tenant:${tenant_id}:branch:${branch_id}`, "jukebox:now_playing", payload);
      }
      break;
    }

    case "JUKEBOX_SONG_ENDED": {
      if (tenant_id && branch_id) {
        io.of("/social")
          .to(`social:${tenant_id}:${branch_id}`)
          .emit("jukebox:song_ended", payload);
      }
      break;
    }

    case "JUKEBOX_QUEUE_UPDATED": {
      if (tenant_id && branch_id) {
        io.of("/social")
          .to(`social:${tenant_id}:${branch_id}`)
          .emit("jukebox:queue_updated", payload);
      }
      break;
    }

    default:
      logger.debug({ channel }, "Unhandled event channel");
  }
}

export async function subscribeToEvents(io: SocketServer): Promise<void> {
  subscriberClient = createSubscriberClient();

  await subscriberClient.subscribe(...EVENT_CHANNELS);

  subscriberClient.on("message", (channel: string, message: string) => {
    let payload: EventPayload;
    try {
      payload = JSON.parse(message) as EventPayload;
    } catch {
      logger.warn({ channel, message }, "Failed to parse event payload");
      return;
    }

    try {
      handleEvent(io, channel, payload);
    } catch (err) {
      logger.error({ err, channel }, "Error broadcasting event");
    }
  });

  logger.info({ channels: EVENT_CHANNELS }, "Subscribed to Redis event channels");
}

export async function closeSubscriber(): Promise<void> {
  if (subscriberClient) {
    await subscriberClient.quit();
    logger.info("Redis event subscriber closed");
  }
}
