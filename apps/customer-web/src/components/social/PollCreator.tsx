import { useState } from 'react';

interface Props {
  onSubmit: (question: string, options: string[]) => void;
  onClose: () => void;
}

export default function PollCreator({ onSubmit, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const updateOption = (i: number, val: string) => {
    const next = [...options]; next[i] = val; setOptions(next);
  };
  const addOption = () => { if (options.length < 4) setOptions([...options, '']); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)); };

  const canSubmit = question.trim() && options.filter(o => o.trim()).length >= 2;

  return (
    <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
      <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <h3 className="text-white font-semibold mb-4">📊 Create a Poll</h3>
        <input
          autoFocus value={question} onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white/15 mb-3"
        />
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              value={opt} onChange={e => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-white/15"
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)} className="text-red-400 text-lg px-2">✕</button>
            )}
          </div>
        ))}
        {options.length < 4 && (
          <button onClick={addOption} className="text-brand-400 text-sm mb-4 flex items-center gap-1">
            <span className="text-lg">+</span> Add option
          </button>
        )}
        <div className="flex gap-3 mt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Cancel</button>
          <button
            onClick={() => { if (canSubmit) onSubmit(question.trim(), options.filter(o => o.trim())); }}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold"
          >
            Create Poll
          </button>
        </div>
      </div>
    </div>
  );
}
