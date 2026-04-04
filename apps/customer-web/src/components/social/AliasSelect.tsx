import { useState } from 'react';

const SUGGESTIONS = ['FoodieX', 'CoolCat', 'NightOwl', 'StarDust', 'WildCard', 'NeonWave', 'MysticFox', 'LuckyDog'];

export type SocialIntent = 'socialize' | 'date' | null;

interface Props {
  placeName: string;
  savedAlias?: string;
  savedMode?: 'public' | 'private';
  savedIntent?: SocialIntent;
  onEnter: (alias: string, mode: 'public' | 'private', intent: SocialIntent) => void;
  onClose: () => void;
}

const VIBES = [
  {
    value: null,
    icon: '👻',
    label: 'Just Browsing',
    sub: 'I prefer not to be approached',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-gray-500 bg-gray-100',
    badge: null,
  },
  {
    value: 'socialize',
    icon: '🤝',
    label: 'Open to Socialize',
    sub: 'Happy to chat, meet people, hang out',
    color: 'border-brand-300 bg-brand-50',
    activeColor: 'border-brand-500 bg-brand-50',
    badge: '🤝 Social',
  },
  {
    value: 'date',
    icon: '💝',
    label: 'Open to Date',
    sub: 'Open to romantic connections too',
    color: 'border-pink-300 bg-pink-50',
    activeColor: 'border-pink-500 bg-pink-50',
    badge: '💝 Date',
  },
] as const;

export default function AliasSelect({ placeName, savedAlias, savedMode, savedIntent, onEnter, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [alias, setAlias] = useState(savedAlias ?? '');
  const [mode, setMode] = useState<'public' | 'private'>(savedMode ?? 'public');
  const [intent, setIntent] = useState<SocialIntent>(savedIntent ?? null);   // always ask fresh on re-entry

  const handleVibeSelect = (v: SocialIntent) => {
    setIntent(v);
    // If open to socialising, auto-set public
    if (v !== null) setMode('public');
  };

  const handleEnter = () => {
    if (alias.trim().length < 1) return;
    onEnter(alias.trim(), mode, intent);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-1">
          {[1, 2].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* ── STEP 1: Alias ── */}
        {step === 1 && (
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">🏠</div>
              <h2 className="text-lg font-bold text-gray-900">{placeName} Social Room</h2>
              <p className="text-sm text-gray-500 mt-1">Your real identity is never shared</p>
            </div>

            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              What should people call you?
            </label>
            <input
              type="text"
              value={alias}
              autoFocus
              maxLength={20}
              onChange={e => setAlias(e.target.value)}
              placeholder="Choose an alias..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 mt-2 mb-3"
            />
            <div className="flex flex-wrap gap-2 mb-5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setAlias(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    alias === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => { if (alias.trim().length >= 1) setStep(2); }}
              disabled={alias.trim().length < 1}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold rounded-xl"
            >
              Next →
            </button>
          </div>
        )}

        {/* ── STEP 2: Vibe / Intent ── */}
        {step === 2 && (
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="text-3xl mb-2">✨</div>
              <h2 className="text-base font-bold text-gray-900">How open are you?</h2>
              <p className="text-sm text-gray-500 mt-1">
                Others will see your vibe — be honest!
              </p>
            </div>

            <div className="space-y-2 mb-4">
              {VIBES.map(vibe => {
                const isSelected = intent === vibe.value;
                return (
                  <button
                    key={String(vibe.value)}
                    onClick={() => handleVibeSelect(vibe.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isSelected ? vibe.activeColor + ' border-opacity-100' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="text-2xl shrink-0">{vibe.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-800">{vibe.label}</div>
                      <div className="text-xs text-gray-500">{vibe.sub}</div>
                    </div>
                    {isSelected && <span className="text-brand-500 shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Visibility — only shown when "Just Browsing" */}
            {intent === null && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  {([
                    { value: 'public', icon: '🌐', label: 'Visible' },
                    { value: 'private', icon: '🔒', label: 'Hidden' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMode(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                        mode === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                ← Back
              </button>
              <button
                onClick={handleEnter}
                className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl text-sm"
              >
                Enter Room →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
