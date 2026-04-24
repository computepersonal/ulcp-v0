import { useState } from 'react';
import { SocialUser } from '../../context/SocialContext';

interface Props {
  users: SocialUser[];
  currentMode: 'public' | 'private';
  onToggleMode: (mode: 'public' | 'private') => void;
  onClose: () => void;
  onSelectUser: (user: SocialUser, x: number, y: number) => void;
  selectedUserId: string | null;
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function PeoplePanel({ users, currentMode, onToggleMode, onClose, onSelectUser, selectedUserId }: Props) {
  const [confirmMode, setConfirmMode] = useState<'public' | 'private' | null>(null);

  return (
    <>
      <div className="fixed inset-0 z-60" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-4/5 max-w-sm z-60 flex flex-col shadow-2xl"
        style={{ background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-semibold">👥 Vibing souls here ({users.length})</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {users.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No public users yet</p>
          ) : (
            users.map(user => {
              const isSelected = user.socket_id === selectedUserId;
              return (
                <button
                  key={user.socket_id}
                  onClick={(e) => {
                    if (user.is_you) return;
                    if (user.mode === 'private') return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onSelectUser(user, rect.left, rect.top);
                  }}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                    isSelected ? 'bg-brand-500/20 border-r-2 border-brand-500' : 'hover:bg-white/5'
                  } ${user.mode === 'private' && !user.is_you ? 'opacity-50 cursor-default' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl relative">
                    {user.emoji}
                    {isSelected && (
                      <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-[#0a0a14]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium flex items-center gap-1.5 flex-wrap">
                      {user.alias}
                      {user.is_you && <span className="text-brand-400 text-xs">(you)</span>}
                      {user.mode === 'private' && !user.is_you && <span className="text-xs">🔒</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-gray-500 text-xs">
                        {user.mode === 'private' && !user.is_you ? 'Private' : timeAgo(user.joined_at)}
                      </span>
                      {user.intent === 'socialize' && (
                        <span className="text-xs bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full font-medium">🤝 Social</span>
                      )}
                      {user.intent === 'date' && (
                        <span className="text-xs bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full font-medium">💝 Date</span>
                      )}
                    </div>
                  </div>
                  {user.is_you ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const target = currentMode === 'public' ? 'private' : 'public';
                        setConfirmMode(target);
                      }}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors ${
                        currentMode === 'public'
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      }`}
                    >
                      {currentMode === 'public' ? '🌐' : '🔒'}
                      {currentMode === 'public' ? 'Public' : 'Private'}
                    </button>
                  ) : user.mode === 'private' ? null : (
                    <span className="text-gray-600 text-xs">›</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Mode switch confirmation */}
      {confirmMode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6">
          <div className="bg-[#1A1F2E] rounded-2xl p-6 max-w-xs w-full shadow-2xl border border-white/10">
            <div className="text-center mb-5">
              <div className="text-2xl mb-2">{confirmMode === 'private' ? '🔒' : '🌐'}</div>
              <h3 className="text-white font-semibold text-base">
                Switch to {confirmMode === 'private' ? 'Private' : 'Public'}?
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                {confirmMode === 'private'
                  ? 'Others won\'t see your messages in the public chat. You can still receive DMs.'
                  : 'Your messages will be visible to everyone in the room.'}
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => { onToggleMode(confirmMode); setConfirmMode(null); }}
                className="w-full py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
              >
                Yes, go {confirmMode === 'private' ? 'Private' : 'Public'}
              </button>
              <button
                onClick={() => setConfirmMode(null)}
                className="w-full py-2 text-gray-500 text-xs hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
