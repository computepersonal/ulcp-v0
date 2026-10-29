import { useState } from 'react';
import { useAppSelector } from '../hooks/redux';
import BottomNav from '../components/BottomNav';
import FloatingOrderTracker from '../components/FloatingOrderTracker';
import ProfileDrawer from '../components/ProfileDrawer';

interface SavedPlace {
  tenantId: string;
  slug: string;
  name: string;
  businessType: string;
  logo?: string;
  visitCount: number;
  isPinned: boolean;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const name = useAppSelector(s => s.auth.name);
  const [showProfile, setShowProfile] = useState(false);

  const savedPlaces: SavedPlace[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('saved_places') ?? '[]') as SavedPlace[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <header className="bg-white sticky top-0 z-20 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="w-8" />
          <div className="font-bold text-brand-500 text-lg">LocalCommerce</div>
          <button onClick={() => setShowProfile(true)} className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-500 text-sm font-bold">
            {name ? name[0].toUpperCase() : '?'}
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {getGreeting()}{name ? `, ${name}` : ''}! 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">What would you like today?</p>
        </div>

        {/* Saved Places */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Your Places</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
            {savedPlaces.map(place => (
              <a
                key={place.tenantId}
                href={`${import.meta.env.BASE_URL}place/${place.slug}`}
                className="flex-shrink-0 w-40 bg-white rounded-xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-500 font-bold text-lg mb-2">
                  {place.logo ? (
                    <img src={place.logo} alt={place.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    place.name[0].toUpperCase()
                  )}
                </div>
                <div className="text-sm font-medium text-gray-900 truncate">{place.name}</div>
                <div className="text-xs text-gray-400 truncate capitalize">{place.businessType.replace(/_/g, ' ')}</div>
                <div className="flex gap-0.5 mt-1">
                  {Array.from({ length: Math.min(place.visitCount, 5) }).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  ))}
                </div>
              </a>
            ))}
            {savedPlaces.length === 0 && (
              <div className="flex-1 border-2 border-dashed border-brand-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center">
                <div className="text-3xl">📷</div>
                <div className="text-sm font-medium text-brand-500">Scan a place's QR code to see its menu and order</div>
              </div>
            )}
          </div>
        </section>

      </div>

      <FloatingOrderTracker />
      <BottomNav homeLink="/" showMenu={false} />

      {/* Right drawer — Profile and orders */}
      <ProfileDrawer
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        onLoginRequest={() => setShowProfile(false)}
      />
    </div>
  );
}
