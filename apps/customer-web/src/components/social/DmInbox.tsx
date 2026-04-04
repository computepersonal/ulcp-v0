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

export default function DmInbox({ chats, privateChats, onOpen, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-80" onClick={onClose} />
      <div
        className="fixed z-81 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
        style={{
          top: 56,
          right: 16,
          width: 280,
          maxHeight: 360,
          background: 'rgba(14,16,28,0.98)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-white text-sm font-semibold">💬 Messages</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {chats.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-8">No private chats yet</p>
          )}
          {chats.map(meta => (
            <button
              key={meta.peer_id}
              onClick={() => { onOpen(meta); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-lg shrink-0 relative">
                {meta.emoji}
                {meta.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {meta.unread > 9 ? '9+' : meta.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">{meta.alias}</div>
                <div className="text-gray-500 text-xs truncate">{lastMsg(privateChats[meta.peer_id])}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
