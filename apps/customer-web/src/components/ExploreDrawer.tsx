import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SavedPlace {
  tenantId: string;
  slug: string;
  name: string;
  businessType: string;
  logo?: string;
  visitCount: number;
  isPinned: boolean;
}

interface PartyEnquiry {
  event_type: string;
  guest_count: string;
  budget: string;
  date: string;
  time_slot: string;
  cuisine: string[];
  venue_pref: 'restaurant' | 'home_delivery' | 'outdoor' | 'any';
  location: string;
  notes: string;
  name: string;
  phone: string;
}

const EVENT_TYPES = [
  'Birthday Party', 'Anniversary', 'Corporate Event', 'Wedding Reception',
  'House Party', 'Get Together', 'Baby Shower', 'Farewell', 'Other',
];

const TIME_SLOTS = ['Lunch (12-3 PM)', 'Evening (4-7 PM)', 'Dinner (7-11 PM)', 'Full Day'];

const CUISINES = ['North Indian', 'South Indian', 'Chinese', 'Continental', 'Italian', 'Mughlai', 'Street Food', 'Desserts', 'Multi-cuisine'];

const VENUE_OPTIONS = [
  { value: 'restaurant' as const, icon: '🍽', label: 'At Restaurant' },
  { value: 'home_delivery' as const, icon: '🏠', label: 'Home Delivery' },
  { value: 'outdoor' as const, icon: '🌳', label: 'Outdoor Venue' },
  { value: 'any' as const, icon: '🤷', label: 'Any / Flexible' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExploreDrawer({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const [showPartyForm, setShowPartyForm] = useState(false);
  const [enquiry, setEnquiry] = useState<PartyEnquiry>({
    event_type: '', guest_count: '', budget: '', date: '', time_slot: '',
    cuisine: [], venue_pref: 'any', location: '', notes: '', name: '', phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const savedPlaces: SavedPlace[] = (() => {
    try { return JSON.parse(localStorage.getItem('saved_places') ?? '[]') as SavedPlace[]; }
    catch { return []; }
  })();

  const toggleCuisine = (c: string) => {
    setEnquiry(prev => ({
      ...prev,
      cuisine: prev.cuisine.includes(c) ? prev.cuisine.filter(x => x !== c) : [...prev.cuisine, c],
    }));
  };

  const handleSubmitEnquiry = async () => {
    if (!enquiry.event_type || !enquiry.guest_count || !enquiry.date || !enquiry.name || !enquiry.phone) return;
    setSubmitting(true);
    // Save locally for now — backend bid creation will be wired later
    try {
      const history = JSON.parse(localStorage.getItem('party_enquiries') ?? '[]') as Record<string, unknown>[];
      history.unshift({ ...enquiry, id: crypto.randomUUID(), created_at: new Date().toISOString(), status: 'pending' });
      localStorage.setItem('party_enquiries', JSON.stringify(history.slice(0, 20)));
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    setSubmitted(true);
  };

  const resetForm = () => {
    setEnquiry({ event_type: '', guest_count: '', budget: '', date: '', time_slot: '', cuisine: [], venue_pref: 'any', location: '', notes: '', name: '', phone: '' });
    setSubmitted(false);
    setShowPartyForm(false);
  };

  // Party enquiry form — full screen overlay
  if (showPartyForm) {
    return (
      <>
        <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => { resetForm(); onClose(); }} />
        <div className={`fixed top-0 left-0 h-full w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Header */}
          <div className="bg-brand-500 px-4 pt-10 pb-5">
            <button onClick={resetForm} className="text-white/80 text-sm mb-3">← Back</button>
            <h2 className="text-white text-lg font-bold">Enquire Party Package</h2>
            <p className="text-white/70 text-xs mt-1">Get quotes from restaurants & caterers near you</p>
          </div>

          {submitted ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Enquiry Submitted!</h3>
              <p className="text-gray-500 text-sm mb-2">
                We'll share your requirements with nearby restaurants and caterers. Expect quotes within 24 hours.
              </p>
              <p className="text-gray-400 text-xs mb-6">You'll receive quotes via SMS and in-app notifications.</p>
              <button onClick={resetForm} className="px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-full">
                Done
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Event Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Type *</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {EVENT_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => setEnquiry(p => ({ ...p, event_type: t }))}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        enquiry.event_type === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Guest Count + Budget */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Guests *</label>
                  <input
                    type="number"
                    value={enquiry.guest_count}
                    onChange={e => setEnquiry(p => ({ ...p, guest_count: e.target.value }))}
                    placeholder="e.g. 50"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget (per head)</label>
                  <input
                    type="number"
                    value={enquiry.budget}
                    onChange={e => setEnquiry(p => ({ ...p, budget: e.target.value }))}
                    placeholder="e.g. 500"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                  />
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date *</label>
                  <input
                    type="date"
                    value={enquiry.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setEnquiry(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Slot</label>
                  <select
                    value={enquiry.time_slot}
                    onChange={e => setEnquiry(p => ({ ...p, time_slot: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1 bg-white"
                  >
                    <option value="">Select</option>
                    {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Venue Preference */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Venue Preference</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {VENUE_OPTIONS.map(v => (
                    <button
                      key={v.value}
                      onClick={() => setEnquiry(p => ({ ...p, venue_pref: v.value }))}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-medium transition-colors ${
                        enquiry.venue_pref === v.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="text-base">{v.icon}</span>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuisine */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cuisine Preferences</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CUISINES.map(c => (
                    <button
                      key={c}
                      onClick={() => toggleCuisine(c)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        enquiry.cuisine.includes(c) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location / Area</label>
                <input
                  type="text"
                  value={enquiry.location}
                  onChange={e => setEnquiry(p => ({ ...p, location: e.target.value }))}
                  placeholder="e.g. Banjara Hills, Hyderabad"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                />
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Name *</label>
                  <input
                    type="text"
                    value={enquiry.name}
                    onChange={e => setEnquiry(p => ({ ...p, name: e.target.value }))}
                    placeholder="Name"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone *</label>
                  <input
                    type="tel"
                    value={enquiry.phone}
                    onChange={e => setEnquiry(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Mobile"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1"
                  />
                </div>
              </div>

              {/* Special Requests */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Special Requests</label>
                <textarea
                  value={enquiry.notes}
                  onChange={e => setEnquiry(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="Veg only, specific dishes, decor needed, DJ, etc."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500 mt-1 resize-none"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmitEnquiry}
                disabled={submitting || !enquiry.event_type || !enquiry.guest_count || !enquiry.date || !enquiry.name || !enquiry.phone}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {submitting ? 'Submitting...' : 'Get Quotes from Caterers'}
              </button>
              <p className="text-gray-400 text-xs text-center pb-4">
                Your enquiry will be shared with verified restaurants and caterers in your area
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  // Main explore drawer
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 left-0 h-full w-72 bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="bg-brand-500 px-5 pt-10 pb-5">
          <div className="text-white font-bold text-lg">Discover</div>
          <p className="text-white/70 text-xs mt-1">Explore local businesses & events</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Visited Places */}
          <div className="border-b border-gray-100">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Visited Places</h3>
            </div>
            {savedPlaces.length === 0 ? (
              <p className="px-4 pb-4 text-gray-400 text-xs">No places visited yet. Scan a QR to get started!</p>
            ) : (
              <div className="px-2 pb-3">
                {savedPlaces.slice(0, 8).map(place => (
                  <button
                    key={place.tenantId}
                    onClick={() => { onClose(); navigate(`/place/${place.slug}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 text-sm font-bold shrink-0">
                      {place.name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{place.name}</div>
                      <div className="text-xs text-gray-400">{place.visitCount} visit{place.visitCount !== 1 ? 's' : ''}</div>
                    </div>
                    {place.isPinned && <span className="text-xs">📌</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nearby & Explore */}
          <div className="border-b border-gray-100">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Explore</h3>
            </div>
            <div className="px-2 pb-3">
              <button
                onClick={() => { onClose(); navigate('/explore'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-lg shrink-0">📍</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Nearby Places</div>
                  <div className="text-xs text-gray-400">Restaurants, shops around you</div>
                </div>
              </button>
              <button
                onClick={() => { onClose(); navigate('/explore'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-lg shrink-0">🎪</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Events Nearby</div>
                  <div className="text-xs text-gray-400">Live music, DJ nights, karaoke</div>
                </div>
              </button>
              <button
                onClick={() => { onClose(); navigate('/explore'); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center text-lg shrink-0">🎭</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">Events In City</div>
                  <div className="text-xs text-gray-400">Food festivals, pop-ups, tastings</div>
                </div>
              </button>
            </div>
          </div>

          {/* Party Packages */}
          <div>
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Party & Catering</h3>
            </div>
            <div className="px-2 pb-3">
              <button
                onClick={() => setShowPartyForm(true)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-brand-50 transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-lg shrink-0">🎉</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-brand-600 group-hover:text-brand-700">Enquire Party Package</div>
                  <div className="text-xs text-gray-400">Get quotes from restaurants & caterers</div>
                </div>
                <span className="text-brand-400 text-xs">→</span>
              </button>
              <button
                onClick={() => {
                  onClose();
                  // Navigate to enquiry history
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0">📋</div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">My Enquiries</div>
                  <div className="text-xs text-gray-400">Track your party requests</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
