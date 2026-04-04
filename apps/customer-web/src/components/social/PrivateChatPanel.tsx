import { useState, useRef, useEffect } from 'react';
import { useSocial, SocialMessage } from '../../context/SocialContext';

interface Props {
  peerId: string;
  alias: string;
  emoji: string;
  tenantId: string;
  branchId: string;
  onClose: () => void;
}

function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function PrivateChatPanel({ peerId, alias, emoji, tenantId, branchId, onClose }: Props) {
  const { state, sendPrivateMessage, markChatRead } = useSocial();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const messages: SocialMessage[] = state.privateChats[peerId] ?? [];

  useEffect(() => {
    markChatRead(peerId);
  }, [peerId, markChatRead]);

  useEffect(() => {
    markChatRead(peerId);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerId, markChatRead]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    sendPrivateMessage(peerId, msg, tenantId, branchId);
    setInput('');
  };

  return (
    /* Full-screen overlay — sits above everything including PeoplePanel */
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: '#0A0A14', zIndex: 300 }}
    >
      {/* Header — WhatsApp style */}
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
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl shrink-0">
          {emoji}
        </div>
        <div className="flex-1">
          <div className="text-white font-semibold text-base">{alias}</div>
          <div className="text-gray-500 text-xs">Private message</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="text-4xl">{emoji}</div>
            <p className="text-gray-500 text-sm text-center">
              Say hi to <span className="text-white font-medium">{alias}</span>
            </p>
            <p className="text-gray-600 text-xs">Messages are private to you two</p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.is_mine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                msg.is_mine
                  ? 'bg-brand-500 text-white rounded-2xl rounded-br-sm'
                  : 'bg-white/10 text-white rounded-2xl rounded-bl-sm'
              }`}
            >
              {msg.message}
            </div>
            <span className="text-gray-600 text-xs mt-1 px-1">{timeStr(msg.timestamp)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex gap-3 px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 500))}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder={`Message ${alias}...`}
          className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-2xl px-4 py-3 text-sm outline-none focus:bg-white/15"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-12 h-12 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white flex items-center justify-center text-lg shrink-0 transition-colors"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
