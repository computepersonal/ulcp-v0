import { useEffect, useRef } from 'react';
import { useSocial, SocialUser } from '../../context/SocialContext';

interface Props {
  user: SocialUser;
  x: number;
  y: number;
  tenantId: string;
  branchId: string;
  onClose: () => void;
  onOpenDM: (user: SocialUser) => void;
  onViewProfile: (user: SocialUser) => void;
}

const ACTIONS = [
  { id: 'drink',      icon: '🍹', label: 'Send a Drink' },
  { id: 'join_table', icon: '🪑', label: 'Join Tables' },
  { id: 'dance',      icon: '💃', label: 'Ask to Dance' },
  { id: 'date',       icon: '💝', label: 'Make it a Date' },
  { id: 'bff',        icon: '🤝', label: 'BFF Meetup' },
];

export default function ActionMenu({ user, x, y, tenantId, branchId, onClose, onOpenDM, onViewProfile }: Props) {
  const { sendAction } = useSocial();
  const menuRef = useRef<HTMLDivElement>(null);

  const menuW = 220;
  const menuH = 320;
  const adjustedX = Math.min(x, window.innerWidth - menuW - 4);
  const adjustedY = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleAction = (actionId: string) => {
    sendAction(user.socket_id, actionId, {}, tenantId, branchId);
    onClose();
  };

  return (
    <>
      {/* Invisible full-screen backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-80" onClick={onClose} />

      {/* Context menu */}
      <div
        ref={menuRef}
        className="fixed z-81 rounded-xl overflow-hidden shadow-2xl border border-white/10"
        style={{
          left: adjustedX,
          top: adjustedY,
          width: menuW,
          background: 'rgba(18,20,34,0.99)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* User header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
          <span className="text-lg">{user.emoji}</span>
          <span className="text-white text-sm font-semibold truncate">{user.alias}</span>
        </div>

        {/* Actions */}
        <div className="py-1">
          {/* Private Message — opens DM panel directly */}
          <button
            onClick={() => { onOpenDM(user); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/8 transition-colors text-left"
          >
            <span className="text-base w-5 text-center shrink-0">💬</span>
            <span className="text-white text-xs font-medium">Private Message</span>
          </button>
          {ACTIONS.map(action => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/8 transition-colors text-left"
            >
              <span className="text-base w-5 text-center shrink-0">{action.icon}</span>
              <span className="text-white text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Divider + danger actions */}
        <div className="border-t border-white/10 py-1">
          <button
            onClick={() => { onViewProfile(user); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/8 transition-colors text-left"
          >
            <span className="text-base w-5 text-center shrink-0">👤</span>
            <span className="text-white text-xs font-medium">View Profile</span>
          </button>
          <button
            onClick={() => handleAction('block')}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-500/10 transition-colors text-left"
          >
            <span className="text-base w-5 text-center shrink-0">🚫</span>
            <span className="text-red-400 text-xs font-medium">Block</span>
          </button>
        </div>
      </div>
    </>
  );
}
