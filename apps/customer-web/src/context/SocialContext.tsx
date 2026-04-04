import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

export interface SocialMessage {
  id: string;
  alias: string;
  emoji: string;
  message: string;
  timestamp: number;
  is_bot: boolean;
  is_mine?: boolean;
  socket_id?: string;
  type?: 'welcome' | 'info' | 'action' | 'announcement';
  reactions?: Record<string, number>;
}

export interface SocialUser {
  alias: string;
  emoji: string;
  joined_at: number;
  is_you: boolean;
  socket_id: string;
  peer_id: string;          // stable customer_id — survives reconnects
  mode?: "public" | "private";
  intent?: "socialize" | "date" | null;
}

export interface ActionRequest {
  id: string;
  from_socket_id: string;
  from_alias: string;
  from_emoji: string;
  action: string;
  data: unknown;
  timestamp: number;
}

export interface SocialContent {
  message_id: string;
  type: "image" | "video" | "link" | "poll" | "music" | "match" | "gif" | "text";
  content: {
    url?: string;
    text?: string;
    preview?: { title?: string; description?: string; image_url?: string };
    poll?: { question: string; options: string[]; expires_in_mins?: number };
    match?: { sport: string; team1: string; team2: string; score: string; status: string };
  };
  from_alias: string;
  from_emoji: string;
  timestamp: number;
  socket_id: string;
  is_mine?: boolean;
  reactions?: Record<string, number>;
  poll_votes?: number[];
  poll_total?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  from_alias: string;
  x: number; // random x position 10-90%
}

export interface TriviaState {
  status: "idle" | "voting" | "countdown" | "question" | "revealing" | "finished";
  topic: string;
  question?: string;
  question_number?: number;
  total_questions?: number;
  timer_secs?: number;
  scores?: Array<{ alias: string; score: number }> | Record<string, { alias: string; score: number }>;
  correct_answer?: string;
  fun_fact?: string;
  winner_alias?: string;
  vote_start?: number;
  vote_skip?: number;
}

export interface PrivateChatMeta {
  peer_id: string;          // stable customer_id key
  alias: string;
  emoji: string;
  unread: number;
}

interface SocialState {
  isConnected: boolean;
  alias: string;
  emoji: string;
  mode: 'public' | 'private';
  messages: SocialMessage[];
  publicUsers: SocialUser[];
  publicCount: number;
  pendingRequests: ActionRequest[];
  privateChats: Record<string, SocialMessage[]>;
  privateChatMeta: Record<string, PrivateChatMeta>;
  richMessages: SocialContent[];
  floatingReactions: FloatingReaction[];
  trivia: TriviaState;
}

interface SocialContextValue {
  state: SocialState;
  socket: Socket | null;
  authError: boolean;
  joinRoom: (tenantId: string, branchId: string, alias: string, mode: 'public' | 'private', intent?: 'socialize' | 'date' | null) => void;
  openPrivateChat: (user: SocialUser) => void;
  markChatRead: (socketId: string) => void;
  leaveRoom: (tenantId: string, branchId: string) => void;
  sendMessage: (message: string, tenantId: string, branchId: string) => void;
  sendPrivateMessage: (toPeerId: string, message: string, tenantId: string, branchId: string) => void;
  sendAction: (toSocketId: string, action: string, data: unknown, tenantId: string, branchId: string) => void;
  respondToAction: (toSocketId: string, action: string, accepted: boolean, data: unknown, tenantId: string, branchId: string) => void;
  toggleMode: (mode: 'public' | 'private', tenantId: string, branchId: string) => void;
  requestUsers: (tenantId: string, branchId: string) => void;
  dismissRequest: (id: string) => void;
  shareContent: (type: SocialContent["type"], content: SocialContent["content"], tenantId: string, branchId: string) => void;
  votePoll: (messageId: string, optionIndex: number, tenantId: string, branchId: string) => void;
  reactToMessage: (messageId: string, emoji: string, tenantId: string, branchId: string) => void;
  broadcastReaction: (emoji: string, tenantId: string, branchId: string) => void;
  startTrivia: (topic: string, tenantId: string, branchId: string) => void;
  voteTrivia: (vote: "start" | "skip", tenantId: string, branchId: string) => void;
  sendTriviaAnswer: (answer: string, tenantId: string, branchId: string) => void;
  dismissFloatingReaction: (id: string) => void;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children, authToken }: { children: ReactNode; authToken: string | null }) {
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [authError, setAuthError] = useState(false);
  const [state, setState] = useState<SocialState>({
    isConnected: false,
    alias: '',
    emoji: '',
    mode: 'public',
    messages: [],
    publicUsers: [],
    publicCount: 0,
    pendingRequests: [],
    privateChats: {},
    privateChatMeta: {},
    richMessages: [],
    floatingReactions: [],
    trivia: { status: "idle", topic: "" },
  });

  const realtimeUrl = import.meta.env.VITE_REALTIME_SERVICE_URL ?? 'http://localhost:3008';

  useEffect(() => {
    const socket = io(`${realtimeUrl}/social`, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token: authToken ?? '' },
    });
    socketRef.current = socket;
    setSocketInstance(socket);
    setAuthError(false);

    socket.on('connect', () => { setAuthError(false); setState(s => ({ ...s, isConnected: true })); });
    socket.on('disconnect', () => setState(s => ({ ...s, isConnected: false })));
    socket.on('connect_error', (err: Error) => {
      if (err.message === 'AUTH_REQUIRED') {
        setAuthError(true);
        setState(s => ({ ...s, isConnected: false }));
      }
    });

    socket.on('social:bot:message', (data: { message: string; type: string }) => {
      const msg: SocialMessage = { id: crypto.randomUUID(), alias: '🤖 Bot', emoji: '🤖', message: data.message, timestamp: Date.now(), is_bot: true, type: data.type as SocialMessage['type'] };
      setState(s => ({ ...s, messages: [...s.messages, msg] }));
    });

    socket.on('social:message', (data: SocialMessage) => {
      // Skip messages from our own socket — already added optimistically in sendMessage
      if (data.socket_id && data.socket_id === socket.id) return;
      setState(s => ({ ...s, messages: [...s.messages, { ...data, id: crypto.randomUUID() }] }));
    });

    socket.on('social:announcement', (data: { message: string; type: string }) => {
      const msg: SocialMessage = { id: crypto.randomUUID(), alias: '', emoji: '', message: data.message, timestamp: Date.now(), is_bot: true, type: 'announcement' };
      setState(s => ({ ...s, messages: [...s.messages, msg] }));
    });

    socket.on('social:user:joined', (data: { alias: string; mode: string; count: number; emoji: string }) => {
      if (data.mode === 'public') {
        const msg: SocialMessage = { id: crypto.randomUUID(), alias: '', emoji: '', message: `⭐ ${data.emoji} ${data.alias} just joined the room!`, timestamp: Date.now(), is_bot: true, type: 'info' };
        setState(s => ({ ...s, messages: [...s.messages, msg], publicCount: data.count }));
      }
    });

    socket.on('social:user:left', (data: { alias: string; count: number }) => {
      const msg: SocialMessage = { id: crypto.randomUUID(), alias: '', emoji: '', message: `👋 ${data.alias} has left the room`, timestamp: Date.now(), is_bot: true, type: 'info' };
      setState(s => ({ ...s, messages: [...s.messages, msg], publicCount: data.count }));
    });

    socket.on('social:users:list', (data: { users: SocialUser[] }) => {
      setState(s => ({ ...s, publicUsers: data.users, publicCount: data.users.length }));
    });

    socket.on('social:users:updated', (data: { users: SocialUser[]; count: number }) => {
      // Fix up is_you using our own socket ID (server broadcasts is_you:false to room)
      const fixedUsers = data.users.map(u => ({ ...u, is_you: u.socket_id === socket.id }));
      setState(s => ({ ...s, publicUsers: fixedUsers, publicCount: data.count }));
    });

    socket.on('social:action:received', (data: Omit<ActionRequest, 'id'> & { from_socket_id: string }) => {
      const req: ActionRequest = { id: crypto.randomUUID(), ...data };
      setState(s => ({ ...s, pendingRequests: [...s.pendingRequests, req] }));
      const actionLabels: Record<string, string> = {
        drink: '🍹 wants to send you a drink!',
        join_table: '🪑 wants to join your table!',
        dance: '💃 wants to dance with you!',
        date: '💝 wants to make it a date!',
        bff: '🤝 wants a BFF meetup!',
      };
      const label = actionLabels[data.action];
      if (!label) return; // ignore unknown / private_message actions (handled separately)
      const msg: SocialMessage = { id: req.id, alias: `${data.from_emoji} ${data.from_alias}`, emoji: data.from_emoji, message: `${data.from_alias} ${label}`, timestamp: Date.now(), is_bot: true, type: 'action' };
      setState(s => ({ ...s, messages: [...s.messages, msg] }));
    });

    socket.on('social:action:resolved', (data: { accepted: boolean; action: string; from_alias: string; to_alias: string }) => {
      if (data.accepted) {
        const actionLabels: Record<string, string> = { drink: '🍹', join_table: '🪑', dance: '💃', date: '💝', bff: '🤝' };
        const emoji = actionLabels[data.action] ?? '';
        const msg: SocialMessage = { id: crypto.randomUUID(), alias: '', emoji: '', message: `${emoji} ${data.from_alias} and ${data.to_alias} — ${data.action.replace('_', ' ')} accepted!`, timestamp: Date.now(), is_bot: true, type: 'announcement' };
        setState(s => ({ ...s, messages: [...s.messages, msg] }));
      }
    });

    socket.on('social:private:message', (data: { from_peer_id: string; from_alias: string; from_emoji: string; message: string; timestamp: number }) => {
      setState(s => {
        const key = data.from_peer_id;
        const chat = s.privateChats[key] ?? [];
        const existingMeta = s.privateChatMeta[key];
        const meta: PrivateChatMeta = {
          peer_id: key,
          alias: data.from_alias ?? existingMeta?.alias ?? 'Unknown',
          emoji: data.from_emoji ?? existingMeta?.emoji ?? '👤',
          unread: (existingMeta?.unread ?? 0) + 1,
        };
        const newMsg: SocialMessage = {
          id: crypto.randomUUID(),
          alias: data.from_alias,
          emoji: data.from_emoji,
          message: data.message,
          timestamp: data.timestamp,
          is_bot: false,
          is_mine: false,
        };
        const notif: SocialMessage = {
          id: crypto.randomUUID(),
          alias: '🔒 Private',
          emoji: '💬',
          message: `${data.from_emoji} ${data.from_alias} sent you a private message — tap 💬 to reply`,
          timestamp: data.timestamp,
          is_bot: true,
          type: 'info',
        };
        return {
          ...s,
          messages: [...s.messages, notif],
          privateChats: { ...s.privateChats, [key]: [...chat, newMsg] },
          privateChatMeta: { ...s.privateChatMeta, [key]: meta },
        };
      });
    });

    // social:private:message:sent — only update/fill meta (message already optimistically inserted)
    socket.on('social:private:message:sent', (data: { to_peer_id: string; to_alias: string; to_emoji: string }) => {
      setState(s => {
        const key = data.to_peer_id;
        if (s.privateChatMeta[key]) return s;
        const meta: PrivateChatMeta = { peer_id: key, alias: data.to_alias ?? 'Unknown', emoji: data.to_emoji ?? '👤', unread: 0 };
        return { ...s, privateChatMeta: { ...s.privateChatMeta, [key]: meta } };
      });
    });

    // Rich content events
    socket.on("social:content:received", (data: SocialContent) => {
      setState(s => ({
        ...s,
        richMessages: [...s.richMessages, { ...data, reactions: {}, poll_votes: data.content.poll?.options.map(() => 0) ?? [], poll_total: 0 }],
      }));
    });

    socket.on("social:poll:updated", (data: { message_id: string; votes: number[]; total: number }) => {
      setState(s => ({
        ...s,
        richMessages: s.richMessages.map(m =>
          m.message_id === data.message_id ? { ...m, poll_votes: data.votes, poll_total: data.total } : m
        ),
      }));
    });

    socket.on("social:poll:closed", (data: { message_id: string; votes: number[]; total: number }) => {
      setState(s => ({
        ...s,
        richMessages: s.richMessages.map(m =>
          m.message_id === data.message_id ? { ...m, poll_votes: data.votes, poll_total: data.total } : m
        ),
        messages: [...s.messages, { id: crypto.randomUUID(), alias: "", emoji: "", message: "📊 Poll closed!", timestamp: Date.now(), is_bot: true, type: "info" }],
      }));
    });

    socket.on("social:reaction:updated", (data: { message_id: string; reactions: Record<string, number> }) => {
      setState(s => ({
        ...s,
        messages: s.messages.map(m => m.id === data.message_id ? { ...m, reactions: data.reactions } : m),
        richMessages: s.richMessages.map(m => m.message_id === data.message_id ? { ...m, reactions: data.reactions } : m),
      }));
    });

    socket.on("social:reaction:floatup", (data: { emoji: string; from_alias: string }) => {
      const id = crypto.randomUUID();
      const reaction: FloatingReaction = { id, emoji: data.emoji, from_alias: data.from_alias, x: 10 + Math.random() * 80 };
      setState(s => ({ ...s, floatingReactions: [...s.floatingReactions, reaction] }));
      setTimeout(() => {
        setState(s => ({ ...s, floatingReactions: s.floatingReactions.filter(r => r.id !== id) }));
      }, 3500);
    });

    socket.on("social:trivia:update", (data: Partial<TriviaState> & { status: TriviaState["status"] }) => {
      setState(s => ({ ...s, trivia: { ...s.trivia, ...data } }));
    });

    socket.on("social:trivia:end", (data: { scores: Array<{ alias: string; score: number }>; winner: { alias: string; score: number } | null }) => {
      setState(s => ({ ...s, trivia: { status: "finished", topic: s.trivia.topic, scores: data.scores } }));
    });

    socket.on("social:trivia:vote:updated", (data: { start: number; skip: number }) => {
      setState(s => ({ ...s, trivia: { ...s.trivia, vote_start: data.start, vote_skip: data.skip } }));
    });

    // Only connect if we have a token
    if (authToken) socket.connect();
    return () => { socket.disconnect(); };
  }, [realtimeUrl, authToken]);

  const joinRoom = useCallback((tenantId: string, branchId: string, alias: string, mode: 'public' | 'private', intent?: 'socialize' | 'date' | null) => {
    setState(s => ({ ...s, alias, mode, messages: [], publicUsers: [], richMessages: [], trivia: { status: "idle", topic: "" } }));
    socketRef.current?.emit('social:join', { tenant_id: tenantId, branch_id: branchId, alias, mode, intent: intent ?? null });
  }, []);

  const leaveRoom = useCallback((tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:leave', { tenant_id: tenantId, branch_id: branchId });
    setState(s => ({ ...s, alias: '', messages: [], publicUsers: [], publicCount: 0, richMessages: [], trivia: { status: "idle", topic: "" } }));
  }, []);

  const sendMessage = useCallback((message: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:message', { message, tenant_id: tenantId, branch_id: branchId });
    setState(s => ({
      ...s,
      messages: [...s.messages, {
        id: crypto.randomUUID(),
        alias: s.alias,
        emoji: s.emoji,
        message,
        timestamp: Date.now(),
        is_bot: false,
        is_mine: true,
      }],
    }));
  }, []);

  const sendPrivateMessage = useCallback((toPeerId: string, message: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:private:message', { to_peer_id: toPeerId, message, tenant_id: tenantId, branch_id: branchId });
    // Optimistic insert — dedup guard prevents double-add if HMR or re-render
    setState(s => {
      const chat = s.privateChats[toPeerId] ?? [];
      const lastMsg = chat[chat.length - 1];
      if (lastMsg?.is_mine && lastMsg.message === message && Date.now() - lastMsg.timestamp < 2000) return s;
      const newMsg: SocialMessage = { id: crypto.randomUUID(), alias: s.alias, emoji: s.emoji, message, timestamp: Date.now(), is_bot: false, is_mine: true };
      return { ...s, privateChats: { ...s.privateChats, [toPeerId]: [...chat, newMsg] } };
    });
  }, []);

  const sendAction = useCallback((toSocketId: string, action: string, data: unknown, tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:action:request', { to_socket_id: toSocketId, action, data, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const respondToAction = useCallback((toSocketId: string, action: string, accepted: boolean, data: unknown, tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:action:response', { to_socket_id: toSocketId, action, accepted, data, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const toggleMode = useCallback((mode: 'public' | 'private', tenantId: string, branchId: string) => {
    setState(s => ({ ...s, mode }));
    socketRef.current?.emit('social:toggle:mode', { mode, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const requestUsers = useCallback((tenantId: string, branchId: string) => {
    socketRef.current?.emit('social:users:request', { tenant_id: tenantId, branch_id: branchId });
  }, []);

  const dismissRequest = useCallback((id: string) => {
    setState(s => ({ ...s, pendingRequests: s.pendingRequests.filter(r => r.id !== id) }));
  }, []);

  const openPrivateChat = useCallback((user: SocialUser) => {
    setState(s => {
      const existing = s.privateChatMeta[user.peer_id];
      if (existing) return s;
      const meta: PrivateChatMeta = { peer_id: user.peer_id, alias: user.alias, emoji: user.emoji, unread: 0 };
      return { ...s, privateChatMeta: { ...s.privateChatMeta, [user.peer_id]: meta } };
    });
  }, []);

  const markChatRead = useCallback((peerId: string) => {
    setState(s => {
      const meta = s.privateChatMeta[peerId];
      if (!meta) return s;
      return { ...s, privateChatMeta: { ...s.privateChatMeta, [peerId]: { ...meta, unread: 0 } } };
    });
  }, []);

  const shareContent = useCallback((type: SocialContent["type"], content: SocialContent["content"], tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:content:share", { type, content, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const votePoll = useCallback((messageId: string, optionIndex: number, tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:poll:vote", { message_id: messageId, option_index: optionIndex, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const reactToMessage = useCallback((messageId: string, emoji: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:message:react", { message_id: messageId, emoji, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const broadcastReaction = useCallback((emoji: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:reaction:broadcast", { emoji, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const startTrivia = useCallback((topic: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:trivia:command", { topic, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const voteTrivia = useCallback((vote: "start" | "skip", tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:trivia:vote", { vote, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const sendTriviaAnswer = useCallback((answer: string, tenantId: string, branchId: string) => {
    socketRef.current?.emit("social:trivia:answer", { answer, tenant_id: tenantId, branch_id: branchId });
  }, []);

  const dismissFloatingReaction = useCallback((id: string) => {
    setState(s => ({ ...s, floatingReactions: s.floatingReactions.filter(r => r.id !== id) }));
  }, []);

  return (
    <SocialContext.Provider value={{
      state,
      socket: socketInstance,
      authError,
      joinRoom,
      openPrivateChat,
      markChatRead,
      leaveRoom,
      sendMessage,
      sendPrivateMessage,
      sendAction,
      respondToAction,
      toggleMode,
      requestUsers,
      dismissRequest,
      shareContent,
      votePoll,
      reactToMessage,
      broadcastReaction,
      startTrivia,
      voteTrivia,
      sendTriviaAnswer,
      dismissFloatingReaction,
    }}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
