import { useState, useEffect } from 'react';
import BottomNav from '../components/BottomNav';
import { FeaturedAdCard, StandardAdCard } from '../components/ads/ExploreAdCard';
import type { ExploreAd } from '../components/ads/types';

const ADS_URL = (import.meta.env.VITE_ADS_SERVICE_URL as string | undefined) ?? 'http://localhost:3015';

interface GeoState {
  lat: number | null;
  lng: number | null;
  denied: boolean;
  loading: boolean;
  label: string;
}

export default function Explore() {
  const [geo, setGeo] = useState<GeoState>({ lat: null, lng: null, denied: false, loading: true, label: 'Getting location...' });
  const [ads, setAds] = useState<ExploreAd[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeo({ lat: null, lng: null, denied: true, loading: false, label: 'Location unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setGeo({ lat, lng, denied: false, loading: false, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
      },
      () => {
        setGeo({ lat: null, lng: null, denied: true, loading: false, label: 'Location access denied' });
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    if (geo.loading) return;
    const load = async () => {
      setLoadingAds(true);
      try {
        const qs = new URLSearchParams({ limit: '20' });
        if (geo.lat !== null && geo.lng !== null) {
          qs.set('lat', String(geo.lat));
          qs.set('lng', String(geo.lng));
        } else {
          // fallback — broad fetch without geo
          qs.set('lat', '12.9716');
          qs.set('lng', '77.5946');
        }
        const res = await fetch(`${ADS_URL}/api/v1/ads/explore?${qs.toString()}`);
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; data?: { ads: ExploreAd[] } };
        if (data.success && data.data) setAds(data.data.ads);
      } catch {
        // fail silently
      } finally {
        setLoadingAds(false);
      }
    };
    void load();
  }, [geo.lat, geo.lng, geo.loading]);

  const featured = ads.filter(a => a.type === 'featured');
  const standard = ads.filter(a => a.type === 'standard');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white sticky top-0 z-20 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-bold text-gray-900 text-lg">Explore Nearby</div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>📍</span>
            <span className="truncate max-w-[140px]">{geo.label}</span>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {geo.loading && (
          <div className="text-center py-8 text-gray-400 text-sm">Getting your location...</div>
        )}

        {geo.denied && !geo.loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            📍 Location access was denied. Showing general ads. Enable location for nearby results.
          </div>
        )}

        {loadingAds && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 animate-pulse rounded-2xl" />
            ))}
          </div>
        )}

        {!loadingAds && ads.length === 0 && !geo.loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">🔍</div>
            <div className="font-medium text-gray-600">Nothing nearby yet</div>
            <div className="text-sm mt-1">Check back soon — more businesses are joining.</div>
          </div>
        )}

        {/* Featured (priority 8-10) — max 2 */}
        {featured.length > 0 && (
          <div className="space-y-4">
            {featured.slice(0, 2).map(ad => (
              <FeaturedAdCard
                key={ad.campaign_id}
                ad={ad}
                onClick={() => { window.open(ad.cta_url, '_blank', 'noreferrer'); }}
              />
            ))}
          </div>
        )}

        {/* Standard ads */}
        {standard.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Nearby Offers</h2>
            <div className="space-y-3">
              {standard.map(ad => (
                <StandardAdCard
                  key={ad.campaign_id}
                  ad={ad}
                  onClick={() => { window.open(ad.cta_url, '_blank', 'noreferrer'); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
