import { PrivateChatMeta, SocialMessage } from '../../context/SocialContext';

interface Props {
  chats: PrivateChatMeta[];
  privateChats: Record<string, SocialMessage[]>;
  onOpen: (meta: PrivateChatMeta) => void;
  onClose: () => void;
}

function lastMsg(messages: SocialMessage[] | undefined): string {
  if (!messages || messages.length === 0) return 'No messages yet';
  const last = messages[messages.length - 1]!;
  return (last.is_mine ? 'You: ' : '') + last.message.slice(0, 40) + (last.message.length > 40 ? '…' : '');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function lastTimestamp(messages: SocialMessage[] | undefined): number {
  if (!messages || messages.length === 0) return 0;
  return messages[messages.length - 1]!.timestamp;
}

export default function DmInbox({ chats, privateChats, onOpen, onClose }: Props) {
  // Sort chats by most recent message
  const sorted = [...chats].sort((a, b) => lastTimestamp(privateChats[b.peer_id]) - lastTimestamp(privateChats[a.peer_id]));

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0A0A14', zIndex: 250 }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xl"
        >
          ←
        </button>
        <div className="flex-1">
          <div className="text-white font-semibold text-lg">Messages</div>
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm text-center">No conversations yet</p>
            <p className="text-gray-600 text-xs text-center">
              Tap on someone in the room to start a private chat
            </p>
          </div>
        )}
        {sorted.map(meta => {
          const messages = privateChats[meta.peer_id];
          const ts = lastTimestamp(messages);
          return (
            <button
              key={meta.peer_id}
              onClick={() => { onOpen(meta); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/8 transition-colors text-left border-b border-white/5"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl shrink-0 relative">
                {meta.emoji}
                {meta.unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 bg-brand-500 rounded-full text-white text-xs flex items-center justify-center font-bold px-1">
                    {meta.unread > 99 ? '99+' : meta.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold truncate ${meta.unread > 0 ? 'text-white' : 'text-gray-300'}`}>
                    {meta.alias}
                  </span>
                  {ts > 0 && (
                    <span className={`text-xs shrink-0 ${meta.unread > 0 ? 'text-brand-400' : 'text-gray-600'}`}>
                      {timeAgo(ts)}
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${meta.unread > 0 ? 'text-gray-300 font-medium' : 'text-gray-600'}`}>
                  {lastMsg(messages)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
