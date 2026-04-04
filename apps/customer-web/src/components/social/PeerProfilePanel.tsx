import { SocialUser } from '../../context/SocialContext';

interface Props {
  user: SocialUser;
  onClose: () => void;
  onSendDM: (user: SocialUser) => void;
}

export default function PeerProfilePanel({ user, onClose, onSendDM }: Props) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-290"
        onClick={onClose}
      />

      {/* Panel — slides in from right */}
      <div
        className="fixed top-0 right-0 h-full w-80 max-w-full flex flex-col shadow-2xl z-300"
        style={{ background: '#0E1020' }}
      >
        {/* Header */}
        <div
          className="relative flex flex-col items-center py-10 px-5 shrink-0"
          style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #0E1020 100%)' }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white text-sm hover:bg-white/20"
          >
            ✕
          </button>

          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-5xl mb-3">
            {user.emoji}
          </div>
          <div className="text-white font-bold text-xl">{user.alias}</div>
          <div className="text-gray-400 text-xs mt-1">
            {user.is_mine ? 'This is you' : 'In this room'}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Bio placeholder */}
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 font-semibold">Bio</p>
            <p className="text-gray-300 text-sm">No bio yet.</p>
          </div>

          {/* Interests placeholder */}
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Interests</p>
            <p className="text-gray-600 text-xs">Nothing shared yet.</p>
          </div>

          {/* Mode badge */}
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Status</p>
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${user.mode === 'private' ? 'bg-gray-700 text-gray-300' : 'bg-brand-500/20 text-brand-300'}`}>
                {user.mode === 'private' ? '🔒 Private' : '🌐 Public'}
              </span>
              {user.intent === 'socialize' && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-500/20 text-brand-300">
                  🤝 Open to Socialize
                </span>
              )}
              {user.intent === 'date' && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-pink-500/20 text-pink-300">
                  💝 Open to Date
                </span>
              )}
              {!user.intent && !user.is_mine && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-700 text-gray-400">
                  👻 Just Browsing
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!user.is_mine && (
          <div className="px-5 py-4 border-t border-white/10 flex flex-col gap-3 shrink-0">
            <button
              onClick={() => { onSendDM(user); onClose(); }}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
            >
              💬 Send Message
            </button>
          </div>
        )}
      </div>
    </>
  );
}
