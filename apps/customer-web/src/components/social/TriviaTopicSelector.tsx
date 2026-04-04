interface Props {
  onSelect: (topic: string) => void;
  onClose: () => void;
}

const TOPICS = [
  { emoji: '🎲', label: 'General Knowledge', value: 'general knowledge' },
  { emoji: '🍕', label: 'Food & Drinks', value: 'food and drinks' },
  { emoji: '🏏', label: 'Cricket', value: 'cricket' },
  { emoji: '🎬', label: 'Bollywood', value: 'Bollywood movies' },
  { emoji: '🎵', label: 'Music', value: 'music' },
  { emoji: '🌍', label: 'Geography', value: 'world geography' },
  { emoji: '⚽', label: 'Football', value: 'football soccer' },
  { emoji: '🔬', label: 'Science', value: 'science' },
  { emoji: '📺', label: 'TV & OTT', value: 'TV shows and OTT content' },
  { emoji: '🏆', label: 'Sports', value: 'sports' },
];

export default function TriviaTopicSelector({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
      <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)' }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <h3 className="text-white font-semibold text-center mb-4">🎮 Choose Trivia Topic</h3>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TOPICS.map(t => (
            <button
              key={t.value}
              onClick={() => onSelect(t.value)}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/15 transition-colors text-left"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="text-white text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Cancel</button>
      </div>
    </div>
  );
}
