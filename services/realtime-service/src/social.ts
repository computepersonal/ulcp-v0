import { Server } from "socket.io";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";
import { logger } from "./lib/logger";
import { setupTriviaHandlers } from "./trivia";

// Redis key: social:room:{tenant_id}:{branch_id}
// Value: Redis hash — field = socket_id, value = JSON user entry

const EMOJIS = ["🦊","🐯","🦁","🐺","🦝","🦉","🐸","🦋","🐬","🦄","🌟","⚡","🔥","🌊","🎭"];

// Extended socket type to carry social room reference
interface SocialSocket {
  _socialRoom?: {
    roomKey: string;
    room: string;
    alias: string;
    tenant_id: string;
    branch_id: string;
  };
}

interface SocialUserEntry {
  alias: string;
  mode: "public" | "private";
  joined_at: number;
  customer_id: string | null;
  emoji: string;
  intent?: "socialize" | "date" | null;
}

interface PublicUser {
  alias: string;
  emoji: string;
  joined_at: number;
  is_you: boolean;
  socket_id: string;
  peer_id: string;        // stable customer_id — survives reconnects
  mode?: "public" | "private";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getRoomUsers(redis: Redis, roomKey: string): Promise<Record<string, SocialUserEntry>> {
  const raw = await redis.hgetall(roomKey);
  const result: Record<string, SocialUserEntry> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    try {
      result[k] = JSON.parse(v) as SocialUserEntry;
    } catch {
      // skip malformed entries
    }
  }
  return result;
}

async function getRoomUser(redis: Redis, roomKey: string, socketId: string): Promise<SocialUserEntry | null> {
  const raw = await redis.hget(roomKey, socketId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SocialUserEntry;
  } catch {
    return null;
  }
}

async function getAllUsers(redis: Redis, roomKey: string, mySocketId: string): Promise<PublicUser[]> {
  const all = await getRoomUsers(redis, roomKey);
  return Object.entries(all)
    .map(([sid, u]) => ({
      alias: u.alias,
      emoji: u.emoji,
      joined_at: u.joined_at,
      is_you: sid === mySocketId,
      socket_id: sid,
      peer_id: u.customer_id ?? sid,
      mode: u.mode,
      intent: u.intent ?? null,
    }))
    .sort((a, b) => a.joined_at - b.joined_at);
}

async function getPublicUsers(redis: Redis, roomKey: string, mySocketId: string): Promise<PublicUser[]> {
  const all = await getAllUsers(redis, roomKey, mySocketId);
  return all.filter((u) => u.mode === "public" || u.is_you);
}

async function getPublicCount(redis: Redis, roomKey: string): Promise<number> {
  const all = await getRoomUsers(redis, roomKey);
  return Object.keys(all).length; // total room occupancy
}

async function handleLeave(
  socket: import("socket.io").Socket & SocialSocket,
  social: import("socket.io").Namespace,
  redis: Redis
): Promise<void> {
  const ref = socket._socialRoom;
  if (!ref) return;
  const { roomKey, room, alias } = ref;

  const user = await getRoomUser(redis, roomKey, socket.id);
  await redis.hdel(roomKey, socket.id);
  socket.leave(room);
  delete socket._socialRoom;

  const displayAlias = user?.alias ?? alias;
  const customerId = user?.customer_id;

  // Clean up csock index and set a short-lived recent-leave marker
  // so rapid reconnects (page refresh) don't spam join/leave messages
  if (customerId) {
    await redis.del(`social:csock:${roomKey}:${customerId}`);
    await redis.set(`social:recent_leave:${roomKey}:${customerId}`, displayAlias, "EX", 20);
  }

  const count = await getPublicCount(redis, roomKey);

  socket.to(room).emit("social:user:left", { alias: displayAlias, count });
  socket.to(room).emit("social:bot:message", {
    message: `👋 ${displayAlias} has left the room`,
    type: "info",
  });

  // Push updated users list to remaining members
  const remaining = await getAllUsers(redis, roomKey, "");
  socket.to(room).emit("social:users:updated", { users: remaining, count });

  logger.debug({ alias: displayAlias, roomKey }, "User left social room");
}

// ── Setup /social namespace ───────────────────────────────────────────────────

const JWT_CUSTOMER_SECRET = process.env.JWT_CUSTOMER_SECRET ?? "dev_customer_secret_32chars_long!";

interface CustomerTokenPayload {
  customer_id: string;
  iat?: number;
  exp?: number;
}

export function setupSocialNamespace(io: Server, redis: Redis): import("socket.io").Namespace {
  const social = io.of("/social");

  // ── Auth middleware — require valid customer JWT ──────────────────────────
  social.use((socket, next) => {
    const token = (socket.handshake.auth as Record<string, unknown>).token as string | undefined;
    if (!token) {
      return next(new Error("AUTH_REQUIRED"));
    }
    try {
      const payload = jwt.verify(token, JWT_CUSTOMER_SECRET) as CustomerTokenPayload;
      if (!payload.customer_id) return next(new Error("AUTH_REQUIRED"));
      socket.data.customerId = payload.customer_id;
      return next();
    } catch {
      return next(new Error("AUTH_REQUIRED"));
    }
  });

  social.on("connection", (socket) => {
    const typedSocket = socket as typeof socket & SocialSocket;

    logger.info({ socket_id: socket.id }, "Social namespace connection");

    // Per-socket rate-limit state
    let lastMessageAt = 0;

    // ── social:join ──────────────────────────────────────────────────────────
    socket.on(
      "social:join",
      async (data: {
        tenant_id: string;
        branch_id: string;
        alias: string;
        mode: "public" | "private";
        intent?: "socialize" | "date" | null;
      }) => {
        const { tenant_id, branch_id, mode, intent } = data;
        // Use verified customer_id from JWT, never trust client
        const customer_id = socket.data.customerId as string;
        const alias = String(data.alias ?? "").slice(0, 30).trim() || "Guest";
        const roomKey = `social:room:${tenant_id}:${branch_id}`;
        const room = `social:${tenant_id}:${branch_id}`;

        // Check if this is a rapid reconnect (page refresh) — suppress spam
        const recentLeaveKey = `social:recent_leave:${roomKey}:${customer_id}`;
        const recentLeaveAlias = await redis.get(recentLeaveKey);
        const isReconnect = !!recentLeaveAlias;
        if (isReconnect) await redis.del(recentLeaveKey);

        // Evict any stale entry for this customer (same person, old socket)
        const existing = await getRoomUsers(redis, roomKey);
        let reuseAlias: string | null = recentLeaveAlias ?? null;
        let reuseEmoji: string | null = null;
        for (const [oldSocketId, oldUser] of Object.entries(existing)) {
          if (oldUser.customer_id === customer_id && oldSocketId !== socket.id) {
            reuseAlias = oldUser.alias;
            reuseEmoji = oldUser.emoji;
            await redis.hdel(roomKey, oldSocketId);
            logger.debug({ oldSocketId, customer_id }, "Evicted stale social room entry");
          }
        }

        // Determine alias — reuse previous if rejoining, else enforce uniqueness
        let finalAlias = reuseAlias ?? alias;
        if (!reuseAlias) {
          const takenAliases = Object.values(existing)
            .filter((_, i) => Object.keys(existing)[i] !== socket.id)
            .map((u) => u.alias);
          if (takenAliases.includes(finalAlias)) {
            let n = 2;
            while (takenAliases.includes(`${alias}${n}`)) n++;
            finalAlias = `${alias}${n}`;
          }
        }

        const emoji = reuseEmoji ?? (EMOJIS[Math.floor(Math.random() * EMOJIS.length)] ?? "🦊");
        const userEntry: SocialUserEntry = {
          alias: finalAlias,
          mode,
          joined_at: isReconnect ? (existing[Object.keys(existing).find(k => existing[k]?.customer_id === customer_id) ?? ""]?.joined_at ?? Date.now()) : Date.now(),
          customer_id: customer_id ?? null,
          emoji,
          intent: intent ?? null,   // always use freshly provided intent — never reuse stale value
        };

        // Store in Redis hash + csock index for stable private message routing
        await redis.hset(roomKey, socket.id, JSON.stringify(userEntry));
        await redis.expire(roomKey, 4 * 60 * 60);
        await redis.set(`social:csock:${roomKey}:${customer_id}`, socket.id, "EX", 4 * 60 * 60);

        socket.join(room);
        typedSocket._socialRoom = { roomKey, room, alias: finalAlias, tenant_id, branch_id };

        const count = await getPublicCount(redis, roomKey);

        // Only announce join/update list if not a rapid reconnect
        if (!isReconnect) {
          socket.to(room).emit("social:user:joined", { alias: finalAlias, mode, count, emoji });
        }

        // Always push updated users list to existing room members
        const allUsersForRoom = await getAllUsers(redis, roomKey, "");
        socket.to(room).emit("social:users:updated", { users: allUsersForRoom, count });

        // Welcome bot message to joining user
        const welcomeMsg = isReconnect
          ? `🔄 Welcome back, **${finalAlias}** ${emoji}! You're still in the room.`
          : count === 1
            ? `🌙 You're the first one here — be the icebreaker!`
            : `Welcome! You're now **${finalAlias}** ${emoji} — ${count} people are here right now.${
                mode === "public"
                  ? " You're visible to others. Say hi!"
                  : " You're in private mode."
              }`;

        socket.emit("social:bot:message", { message: welcomeMsg, type: "welcome" });

        // Send all room users (public + private) to the joining user (with correct is_you)
        const allRoomUsers = await getAllUsers(redis, roomKey, socket.id);
        socket.emit("social:users:list", { users: allRoomUsers });

        logger.debug({ alias: finalAlias, room, count }, "User joined social room");
      }
    );

    // ── social:leave ─────────────────────────────────────────────────────────
    socket.on("social:leave", async () => {
      await handleLeave(typedSocket, social, redis);
    });

    // ── social:message ───────────────────────────────────────────────────────
    socket.on(
      "social:message",
      async (data: { message: string; tenant_id: string; branch_id: string }) => {
        const now = Date.now();
        if (now - lastMessageAt < 1000) return; // 1 message/second rate limit
        lastMessageAt = now;

        const msg = String(data.message ?? "").slice(0, 500).trim();
        if (!msg) return;

        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const user = await getRoomUser(redis, roomKey, socket.id);
        if (!user) return;

        // Bot commands
        if (msg.startsWith("/")) {
          const parts = msg.slice(1).split(" ");
          const cmd = parts[0] ?? "";
          const args = parts.slice(1);

          if (cmd === "help") {
            socket.emit("social:bot:message", {
              message: "🤖 Commands:\n/trivia [topic] — start trivia\n/poll — create poll\n/vibe — vibe check\n/joke — hear a joke\n/shoutout [alias] — shout someone out",
              type: "info",
            });
            return;
          }
          if (cmd === "trivia") {
            const topic = args.join(" ") || "general knowledge";
            socket.emit("social:message", { alias: user.alias, emoji: user.emoji, message: msg, timestamp: now, is_bot: false, socket_id: socket.id });
            socket.to(room).emit("social:message", { alias: user.alias, emoji: user.emoji, message: msg, timestamp: now, is_bot: false, socket_id: socket.id });
            socket.emit("social:bot:message", { message: `Starting trivia about "${topic}"! 🎮`, type: "info" });
            return;
          }
          if (cmd === "vibe") {
            socket.emit("social:bot:message", { message: "💫 Posting a vibe check poll!", type: "info" });
            const message_id = `msg_vibe_${Date.now()}`;
            const pollKey = `social:poll:${message_id}`;
            const vibeOptions = ["🔥 On fire!", "😎 Pretty cool", "😐 Meh...", "🌙 Chill night"];
            await redis.set(
              pollKey,
              JSON.stringify({
                question: "How's the vibe tonight? ✨",
                options: vibeOptions,
                votes: [0, 0, 0, 0],
                voters: [],
                expires_at: Date.now() + 5 * 60 * 1000,
              }),
              "EX",
              300
            );
            social.to(room).emit("social:content:received", {
              message_id,
              type: "poll",
              content: { poll: { question: "How's the vibe tonight? ✨", options: vibeOptions, expires_in_mins: 5 } },
              from_alias: "🤖 RoomBot",
              from_emoji: "🤖",
              timestamp: now,
            });
            return;
          }
          if (cmd === "joke") {
            const jokes = [
              "Why did the chef get arrested? He was caught beating an egg! 😂",
              "What do you call a fake noodle? An impasta! 🍝",
              "Why did the tomato turn red? Because it saw the salad dressing! 🥗",
              "I'm on a seafood diet. I see food and I eat it! 🍤",
              "Why do chefs make good referees? They always know when something is well done! 🥩",
            ];
            socket.emit("social:bot:message", { message: jokes[Math.floor(Math.random() * jokes.length)], type: "info" });
            return;
          }
          if (cmd === "shoutout" && args.length > 0) {
            const target = args.join(" ");
            social.to(room).emit("social:bot:message", {
              message: `📣 **${user.alias}** gives a shoutout to **${target}**! 🙌`,
              type: "info",
            });
            return;
          }
        }

        social.to(room).emit("social:message", {
          alias: user.alias,
          emoji: user.emoji,
          message: msg,
          timestamp: now,
          is_bot: false,
          socket_id: socket.id,
        });
      }
    );

    // ── social:private:message ───────────────────────────────────────────────
    socket.on(
      "social:private:message",
      async (data: { to_peer_id: string; message: string; tenant_id: string; branch_id: string }) => {
        const msg = String(data.message ?? "").slice(0, 500).trim();
        if (!msg) return;

        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const sender = await getRoomUser(redis, roomKey, socket.id);
        if (!sender) return;

        // Look up recipient's CURRENT socket via stable peer_id (survives reconnects)
        const recipientSocketId = await redis.get(`social:csock:${roomKey}:${data.to_peer_id}`);

        // Also look up recipient meta for the sent-ack payload
        const recipientEntry = recipientSocketId
          ? await getRoomUser(redis, roomKey, recipientSocketId)
          : null;

        const fromPeerId = sender.customer_id ?? socket.id;
        const toPayload = {
          from_peer_id: fromPeerId,
          from_alias: sender.alias,
          from_emoji: sender.emoji,
          message: msg,
          timestamp: Date.now(),
        };
        const sentPayload = {
          to_peer_id: data.to_peer_id,
          to_alias: recipientEntry?.alias ?? "Unknown",
          to_emoji: recipientEntry?.emoji ?? "👤",
        };

        if (recipientSocketId) {
          social.to(recipientSocketId).emit("social:private:message", toPayload);
        }
        socket.emit("social:private:message:sent", sentPayload);
      }
    );

    // ── social:action:request ────────────────────────────────────────────────
    socket.on(
      "social:action:request",
      async (data: { to_socket_id: string; action: string; data: unknown; tenant_id: string; branch_id: string }) => {
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const sender = await getRoomUser(redis, roomKey, socket.id);
        if (!sender) return;

        social.to(data.to_socket_id).emit("social:action:received", {
          from_socket_id: socket.id,
          from_alias: sender.alias,
          from_emoji: sender.emoji,
          action: data.action,
          data: data.data,
          timestamp: Date.now(),
        });
      }
    );

    // ── social:action:response ───────────────────────────────────────────────
    socket.on(
      "social:action:response",
      async (data: {
        to_socket_id: string;
        action: string;
        accepted: boolean;
        data?: { item_id?: string; item_name?: string; table_number?: string };
        tenant_id: string;
        branch_id: string;
      }) => {
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const responder = await getRoomUser(redis, roomKey, socket.id);
        const requester = await getRoomUser(redis, roomKey, data.to_socket_id);
        if (!responder || !requester) return;

        const resolvedPayload = {
          action: data.action,
          accepted: data.accepted,
          from_alias: requester.alias,
          to_alias: responder.alias,
          data: data.data,
        };

        social.to(data.to_socket_id).emit("social:action:resolved", resolvedPayload);
        socket.emit("social:action:resolved", resolvedPayload);

        // Announce to room if accepted
        if (data.accepted) {
          const announcements: Record<string, string> = {
            drink: `🍹 ${requester.alias} sent a drink to ${responder.alias}`,
            join_table: `🪑 ${requester.alias} and ${responder.alias} are joining tables`,
            dance: `💃 ${requester.alias} and ${responder.alias} are dancing!`,
            date: `💝 ${requester.alias} and ${responder.alias} made a connection!`,
            bff: `🤝 ${requester.alias} and ${responder.alias} are hanging out!`,
          };

          const announcement = announcements[data.action];
          if (announcement) {
            social.to(room).emit("social:announcement", {
              message: announcement,
              type: "action",
            });
          }

          // Emit drink order event for order-service to pick up
          if (data.action === "drink" && data.data?.item_id) {
            social.to(room).emit("social:drink:order", {
              item_id: data.data.item_id,
              item_name: data.data.item_name,
              from_alias: requester.alias,
              to_alias: responder.alias,
              to_table: data.data.table_number,
              tenant_id: data.tenant_id,
              branch_id: data.branch_id,
            });
          }
        }
      }
    );

    // ── social:toggle:mode ───────────────────────────────────────────────────
    socket.on(
      "social:toggle:mode",
      async (data: { mode: "public" | "private"; tenant_id: string; branch_id: string }) => {
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const user = await getRoomUser(redis, roomKey, socket.id);
        if (!user) return;

        user.mode = data.mode;
        await redis.hset(roomKey, socket.id, JSON.stringify(user));

        const count = await getPublicCount(redis, roomKey);
        // Broadcast all users; each client marks is_you on their own socket
        const allUsers = await getAllUsers(redis, roomKey, "");
        social.to(room).emit("social:users:updated", { users: allUsers, count });
        socket.emit("social:users:updated", { users: await getAllUsers(redis, roomKey, socket.id), count });
      }
    );

    // ── social:content:share ────────────────────────────────────────────────
    socket.on("social:content:share", async (data: {
      type: "image" | "video" | "link" | "poll" | "music" | "match" | "gif";
      content: {
        url?: string;
        text?: string;
        preview?: { title?: string; description?: string; image_url?: string };
        poll?: { question: string; options: string[]; expires_in_mins: number };
        match?: { sport: string; team1: string; team2: string; score: string; status: string };
      };
      tenant_id: string;
      branch_id: string;
    }) => {
      const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
      const room = `social:${data.tenant_id}:${data.branch_id}`;
      const user = await getRoomUser(redis, roomKey, socket.id);
      if (!user) return;

      const message_id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // For polls: store poll state in Redis
      if (data.type === "poll" && data.content.poll) {
        const pollKey = `social:poll:${message_id}`;
        const pollData = {
          question: data.content.poll.question,
          options: data.content.poll.options.slice(0, 4),
          votes: data.content.poll.options.slice(0, 4).map(() => 0),
          voters: [] as string[], // socket_ids who voted
          expires_at: Date.now() + (data.content.poll.expires_in_mins ?? 10) * 60 * 1000,
        };
        await redis.set(pollKey, JSON.stringify(pollData), "EX", (data.content.poll.expires_in_mins ?? 10) * 60);

        // Auto-close poll after expiry
        setTimeout(() => {
          void (async () => {
            const raw = await redis.get(pollKey);
            if (!raw) return;
            const poll = JSON.parse(raw) as typeof pollData;
            social.to(room).emit("social:poll:closed", { message_id, votes: poll.votes, total: poll.voters.length });
          })();
        }, (data.content.poll.expires_in_mins ?? 10) * 60 * 1000);
      }

      social.to(room).emit("social:content:received", {
        message_id,
        type: data.type,
        content: data.content,
        from_alias: user.alias,
        from_emoji: user.emoji,
        timestamp: Date.now(),
        socket_id: socket.id,
      });
      // Also emit back to sender
      socket.emit("social:content:received", {
        message_id,
        type: data.type,
        content: data.content,
        from_alias: user.alias,
        from_emoji: user.emoji,
        timestamp: Date.now(),
        socket_id: socket.id,
        is_mine: true,
      });
    });

    // ── social:poll:vote ────────────────────────────────────────────────────
    socket.on("social:poll:vote", async (data: { message_id: string; option_index: number; tenant_id: string; branch_id: string }) => {
      const room = `social:${data.tenant_id}:${data.branch_id}`;
      const pollKey = `social:poll:${data.message_id}`;
      const raw = await redis.get(pollKey);
      if (!raw) return;

      const poll = JSON.parse(raw) as { question: string; options: string[]; votes: number[]; voters: string[]; expires_at: number };
      if (poll.voters.includes(socket.id)) return; // already voted
      if (data.option_index < 0 || data.option_index >= poll.options.length) return;
      if (Date.now() > poll.expires_at) return; // poll expired

      poll.votes[data.option_index]++;
      poll.voters.push(socket.id);
      await redis.set(pollKey, JSON.stringify(poll), "KEEPTTL");

      social.to(room).emit("social:poll:updated", {
        message_id: data.message_id,
        votes: poll.votes,
        total: poll.voters.length,
      });
    });

    // ── social:message:react ────────────────────────────────────────────────
    socket.on("social:message:react", async (data: { message_id: string; emoji: string; tenant_id: string; branch_id: string }) => {
      const room = `social:${data.tenant_id}:${data.branch_id}`;
      const reactKey = `social:reactions:${data.message_id}`;

      // Store reactions: { emoji: Set<socket_id> }
      const raw = await redis.get(reactKey);
      const reactions: Record<string, string[]> = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};

      if (!reactions[data.emoji]) reactions[data.emoji] = [];
      const idx = reactions[data.emoji]!.indexOf(socket.id);
      if (idx >= 0) {
        reactions[data.emoji]!.splice(idx, 1); // unreact
      } else {
        reactions[data.emoji]!.push(socket.id);
      }
      // Clean up empty
      if (reactions[data.emoji]!.length === 0) delete reactions[data.emoji];

      await redis.set(reactKey, JSON.stringify(reactions), "EX", 4 * 60 * 60);

      // Emit counts (not socket IDs)
      const counts: Record<string, number> = {};
      for (const [e, ids] of Object.entries(reactions)) counts[e] = ids.length;

      social.to(room).emit("social:reaction:updated", { message_id: data.message_id, reactions: counts });
      socket.emit("social:reaction:updated", { message_id: data.message_id, reactions: counts });
    });

    // ── social:reaction:broadcast (floating emoji) ──────────────────────────
    socket.on("social:reaction:broadcast", async (data: { emoji: string; tenant_id: string; branch_id: string }) => {
      const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
      const room = `social:${data.tenant_id}:${data.branch_id}`;
      const user = await getRoomUser(redis, roomKey, socket.id);
      if (!user) return;
      social.to(room).emit("social:reaction:floatup", { emoji: data.emoji, from_alias: user.alias });
      socket.emit("social:reaction:floatup", { emoji: data.emoji, from_alias: user.alias });
    });

    // ── social:users:request ─────────────────────────────────────────────────
    socket.on(
      "social:users:request",
      async (data: { tenant_id: string; branch_id: string }) => {
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const publicUsers = await getAllUsers(redis, roomKey, socket.id);
        socket.emit("social:users:list", { users: publicUsers });
      }
    );

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      await handleLeave(typedSocket, social, redis);
    });

    socket.on("error", (err) => {
      logger.error({ err, socket_id: socket.id }, "Social namespace socket error");
    });
  });

  // Attach trivia handlers
  setupTriviaHandlers(social, redis);

  return social;
}
