import { useRef } from 'react';

interface Props {
  onClose: () => void;
  onPhoto: (file: File) => void;
  onVideoLink: () => void;
  onLink: () => void;
  onPoll: () => void;
  onMusic: () => void;
  onMatch: () => void;
  onGif: () => void;
  onReaction: () => void;
  onTrivia: () => void;
}

export default function ContentPicker({ onClose, onPhoto, onVideoLink, onLink, onPoll, onMusic, onMatch, onGif, onReaction, onTrivia }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const items = [
    { icon: '📷', label: 'Photo', action: () => fileRef.current?.click() },
    { icon: '🎥', label: 'Video', action: onVideoLink },
    { icon: '🔗', label: 'Link', action: onLink },
    { icon: '📊', label: 'Poll', action: onPoll },
    { icon: '🎵', label: 'Now Playing', action: onMusic },
    { icon: '🏏', label: 'Match Update', action: onMatch },
    { icon: '😂', label: 'GIF', action: onGif },
    { icon: '🎉', label: 'Reaction', action: onReaction },
    { icon: '🎮', label: 'Play Trivia', action: onTrivia },
  ];

  return (
    <>
      <div className="fixed inset-0 z-70" onClick={onClose} />
      <div className="fixed bottom-16 left-0 right-0 z-70 mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'rgba(15,15,25,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-white font-semibold text-sm">Share something with the room</p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-white/5 p-1">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); onClose(); }}
              className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl hover:bg-white/10 transition-colors"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-white/70 text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} />
      </div>
    </>
  );
}
