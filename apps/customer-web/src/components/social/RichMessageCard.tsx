import { useState } from 'react';
import { SocialContent } from '../../context/SocialContext';

interface Props {
  msg: SocialContent;
  tenantId: string;
  branchId: string;
  onVotePoll: (messageId: string, optionIndex: number) => void;
  onReact: (messageId: string, emoji: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥'];

export default function RichMessageCard({ msg, onVotePoll, onReact }: Props) {
  const [showReactions, setShowReactions] = useState(false);
  const [expandImage, setExpandImage] = useState(false);

  const totalPollVotes = msg.poll_total ?? 0;

  return (
    <div
      className={`mb-4 ${msg.is_mine ? 'flex justify-end' : ''}`}
      onContextMenu={e => { e.preventDefault(); setShowReactions(true); }}
    >
      {!msg.is_mine && (
        <span className="text-xs text-gray-400 ml-1 mb-0.5 block">{msg.from_emoji} {msg.from_alias}</span>
      )}

      <div className={`max-w-xs rounded-2xl overflow-hidden ${msg.is_mine ? 'rounded-tr-sm bg-brand-600' : 'rounded-tl-sm'}`} style={!msg.is_mine ? { background: 'rgba(255,255,255,0.08)' } : {}}>

        {/* IMAGE */}
        {msg.type === 'image' && msg.content.url && (
          <>
            <img
              src={msg.content.url} alt="shared"
              className="w-full max-h-48 object-cover cursor-pointer"
              onClick={() => setExpandImage(true)}
              loading="lazy"
            />
            {msg.content.text && <p className="text-white text-sm px-3 py-2">{msg.content.text}</p>}
          </>
        )}

        {/* VIDEO / LINK */}
        {(msg.type === 'video' || msg.type === 'link') && (
          <a href={msg.content.url} target="_blank" rel="noopener noreferrer" className="block">
            {msg.content.preview?.image_url && (
              <img src={msg.content.preview.image_url} alt="" className="w-full max-h-32 object-cover" />
            )}
            <div className="px-3 py-2.5">
              {msg.type === 'video' && <span className="text-xs text-brand-400 font-semibold">▶️ VIDEO</span>}
              <p className="text-white text-sm font-medium mt-0.5">{msg.content.preview?.title ?? msg.content.url}</p>
              {msg.content.preview?.description && <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{msg.content.preview.description}</p>}
            </div>
          </a>
        )}

        {/* POLL */}
        {msg.type === 'poll' && msg.content.poll && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs font-bold text-brand-400">📊 POLL</span>
            </div>
            <p className="text-white text-sm font-semibold mb-3">{msg.content.poll.question}</p>
            {msg.content.poll.options.map((opt, i) => {
              const votes = msg.poll_votes?.[i] ?? 0;
              const pct = totalPollVotes > 0 ? Math.round((votes / totalPollVotes) * 100) : 0;
              return (
                <button
                  key={i}
                  onClick={() => onVotePoll(msg.message_id, i)}
                  className="w-full mb-2 rounded-lg overflow-hidden text-left relative"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <div className="absolute top-0 left-0 h-full bg-brand-500/40 transition-all" style={{ width: `${pct}%` }} />
                  <div className="relative flex items-center justify-between px-3 py-2">
                    <span className="text-white text-xs font-medium">{opt}</span>
                    <span className="text-gray-300 text-xs">{pct}%</span>
                  </div>
                </button>
              );
            })}
            <p className="text-gray-500 text-xs mt-1">{totalPollVotes} vote{totalPollVotes !== 1 ? 's' : ''}</p>
          </div>
        )}

        {/* MUSIC */}
        {msg.type === 'music' && (
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-500/30 flex items-center justify-center text-xl flex-shrink-0">🎵</div>
            <div>
              <p className="text-xs text-brand-400 font-semibold">NOW PLAYING</p>
              <p className="text-white text-sm font-medium">{msg.content.text}</p>
              <p className="text-gray-400 text-xs">shared by {msg.from_alias}</p>
            </div>
          </div>
        )}

        {/* MATCH */}
        {msg.type === 'match' && msg.content.match && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs font-bold text-red-400 animate-pulse">🔴 LIVE</span>
              <span className="text-xs text-gray-400">{msg.content.match.sport} MATCH UPDATE</span>
            </div>
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className="text-white font-bold text-sm">{msg.content.match.team1}</span>
              <span className="text-gray-500 text-xs">vs</span>
              <span className="text-white font-bold text-sm">{msg.content.match.team2}</span>
            </div>
            {msg.content.match.score && <p className="text-brand-300 text-xs text-center font-mono">{msg.content.match.score}</p>}
            {msg.content.match.status && <p className="text-gray-400 text-xs text-center mt-0.5">{msg.content.match.status}</p>}
            {msg.content.text && <p className="text-white/70 text-xs text-center mt-2 italic">"{msg.content.text}"</p>}
          </div>
        )}

        {/* GIF */}
        {msg.type === 'gif' && msg.content.url && (
          <img src={msg.content.url} alt="gif" className="w-full max-h-48 object-cover" />
        )}
      </div>

      {/* Reactions */}
      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {Object.entries(msg.reactions).map(([emoji, count]) => (
            <button key={emoji} onClick={() => onReact(msg.message_id, emoji)}
              className="flex items-center gap-0.5 bg-white/10 rounded-full px-2 py-0.5 text-xs text-white hover:bg-white/20">
              {emoji} {count}
            </button>
          ))}
        </div>
      )}

      {/* Quick reaction picker */}
      {showReactions && (
        <>
          <div className="fixed inset-0 z-80" onClick={() => setShowReactions(false)} />
          <div className="flex gap-1 mt-1 z-80 relative bg-gray-900 rounded-full px-2 py-1.5 w-fit shadow-xl border border-white/10">
            {QUICK_REACTIONS.map(e => (
              <button key={e} onClick={() => { onReact(msg.message_id, e); setShowReactions(false); }} className="text-xl hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        </>
      )}

      {/* Fullscreen image */}
      {expandImage && msg.content.url && (
        <div className="fixed inset-0 bg-black z-90 flex items-center justify-center" onClick={() => setExpandImage(false)}>
          <img src={msg.content.url} alt="full" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
