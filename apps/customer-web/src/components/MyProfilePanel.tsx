import { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { clearAuth, setName as setNameAction } from '../store/authSlice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// V0 profile: display name (kept on this device), phone (read-only), sign out.
export default function MyProfilePanel({ isOpen, onClose }: Props) {
  const auth = useAppSelector(s => s.auth);
  const dispatch = useAppDispatch();
  const [name, setName] = useState(auth.name ?? '');
  const [editing, setEditing] = useState(false);

  const displayName = name || auth.name || '';
  const initials = displayName ? displayName[0].toUpperCase() : auth.phone?.[0] ?? '?';

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-full flex flex-col shadow-2xl z-50 transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#F9FAFB' }}
      >
        <div className="bg-brand-500 px-5 pt-12 pb-6 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-sm"
          >
            ✕
          </button>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold mb-3">
            {initials}
          </div>
          <div className="text-white font-semibold text-lg">{displayName || 'You'}</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Display Name</span>
              <button onClick={() => setEditing(v => !v)} className="text-xs text-brand-500 font-medium">
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editing ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 40))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500"
                  placeholder="Your name"
                  autoFocus
                />
                <button
                  onClick={() => { dispatch(setNameAction(name.trim())); setEditing(false); }}
                  className="bg-brand-500 text-white text-sm font-semibold px-3 py-2 rounded-lg"
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="text-gray-800 font-medium mt-1">{displayName || '—'}</p>
            )}
          </div>

          <div className="px-5 py-5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Phone</span>
            <p className="text-gray-800 font-medium mt-1">+91 {auth.phone ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Phone number cannot be changed</p>
          </div>

          <div className="px-5 py-5">
            <button
              onClick={() => { dispatch(clearAuth()); onClose(); }}
              className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold border border-red-100 hover:bg-red-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
