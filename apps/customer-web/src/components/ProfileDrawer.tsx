import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/redux';
import { clearAuth } from '../store/authSlice';
import MyProfilePanel from './MyProfilePanel';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginRequest: () => void;
}

export default function ProfileDrawer({ isOpen, onClose, onLoginRequest }: ProfileDrawerProps) {
  const auth = useAppSelector(s => s.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const isLoggedIn = !!auth.token;
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);

  type SavedPlace = { tenantId: string; name: string; visitCount: number; isPinned?: boolean };

  const savedPlaces = (() => {
    try { return JSON.parse(localStorage.getItem('saved_places') ?? '[]') as SavedPlace[]; }
    catch { return [] as SavedPlace[]; }
  })();

  const maskPhone = (phone: string) => {
    if (phone.length < 5) return phone;
    return phone.slice(0, -5) + 'XXXXX';
  };

  return (
    <>
      <MyProfilePanel isOpen={showMyProfile} onClose={() => setShowMyProfile(false)} />

      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="bg-brand-500 px-5 pt-12 pb-6">
          {isLoggedIn ? (
            <>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold mb-3">
                {auth.name ? auth.name[0].toUpperCase() : auth.phone?.[0] ?? '?'}
              </div>
              <div className="text-white font-semibold text-lg">{auth.name || 'You'}</div>
              <div className="text-white/70 text-sm">+91 {maskPhone(auth.phone ?? '')}</div>
              <button className="mt-3 text-xs bg-white/20 text-white px-3 py-1.5 rounded-full border border-white/30">
                Edit Profile
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-3xl mb-3">
                👤
              </div>
              <div className="text-white font-semibold text-base">Sign in to see your history</div>
              <button
                onClick={() => { onClose(); onLoginRequest(); }}
                className="mt-3 bg-white text-brand-500 font-semibold text-sm px-4 py-2 rounded-full"
              >
                Sign In
              </button>
            </>
          )}
        </div>

        {/* Menu */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* My Profile — opens right-side panel */}
          <button
            onClick={() => { onClose(); setShowMyProfile(true); }}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-xl w-7 text-center">👤</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">My Profile</div>
              <div className="text-xs text-gray-400">Bio, interests, social settings</div>
            </div>
            <span className="text-gray-300 text-xs">▶</span>
          </button>

          {/* My Rewards */}
          {isLoggedIn && (
            <button
              onClick={() => {
                onClose();
                if (slug) navigate(`/place/${slug}/rewards`);
              }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-xl w-7 text-center">🎁</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">My Rewards</div>
                <div className="text-xs text-gray-400">Points, offers & tier status</div>
              </div>
              <span className="text-gray-300 text-xs">▶</span>
            </button>
          )}

          {/* Order History */}
          {isLoggedIn && (
            <button
              onClick={() => {
                onClose();
                navigate('/orders');
              }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-xl w-7 text-center">📦</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">Order History</div>
                <div className="text-xs text-gray-400">All past orders</div>
              </div>
              <span className="text-gray-300 text-xs">▶</span>
            </button>
          )}

          {/* Saved Places */}
          <button
            onClick={() => setActiveSection(activeSection === 'places' ? null : 'places')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-xl w-7 text-center">📍</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Saved Places</div>
              <div className="text-xs text-gray-400">{savedPlaces.length} places saved</div>
            </div>
            <span className="text-gray-300 text-xs">{activeSection === 'places' ? '▲' : '▶'}</span>
          </button>

          {/* Favourites */}
          <button
            onClick={() => setActiveSection(activeSection === 'favourites' ? null : 'favourites')}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-xl w-7 text-center">❤️</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Favourites</div>
              <div className="text-xs text-gray-400">Saved items</div>
            </div>
            <span className="text-gray-300 text-xs">{activeSection === 'favourites' ? '▲' : '▶'}</span>
          </button>

          {/* Saved Places expandable */}
          {activeSection === 'places' && (
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
              {savedPlaces.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-2">No saved places yet</p>
              ) : (
                <div className="space-y-2">
                  {savedPlaces.slice(0, 5).map((p) => (
                    <div key={p.tenantId} className="flex items-center gap-3 py-1">
                      <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-500 text-xs font-bold">
                        {p.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800 truncate">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.visitCount} visit{p.visitCount !== 1 ? 's' : ''}</div>
                      </div>
                      {p.isPinned && <span className="text-xs text-brand-400">📌</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-100 mt-2" />

          {/* Settings */}
          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
            <span className="text-xl w-7 text-center">⚙️</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Settings</div>
              <div className="text-xs text-gray-400">Notifications, privacy, language</div>
            </div>
          </button>

          {isLoggedIn && (
            <button
              onClick={() => { dispatch(clearAuth()); onClose(); }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 transition-colors text-left"
            >
              <span className="text-xl w-7 text-center">🚪</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-500">Sign Out</div>
              </div>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
