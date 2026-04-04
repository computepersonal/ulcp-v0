import { useState } from 'react';

interface Props {
  onSubmit: (data: { sport: string; team1: string; team2: string; score: string; status: string; text?: string }) => void;
  onClose: () => void;
}

const SPORTS = ['🏏', '⚽', '🏀', '🎾', '🏑', '🏒', '🏓'];

export default function MatchCreator({ onSubmit, onClose }: Props) {
  const [sport, setSport] = useState('🏏');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [score, setScore] = useState('');
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');

  const canSubmit = team1.trim() && team2.trim();

  return (
    <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
      <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)' }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <h3 className="text-white font-semibold mb-4">🏏 Match Update</h3>
        <div className="flex gap-2 mb-4">
          {SPORTS.map(s => (
            <button key={s} onClick={() => setSport(s)} className={`text-xl p-2 rounded-lg ${sport === s ? 'bg-brand-500' : 'bg-white/10'}`}>{s}</button>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input value={team1} onChange={e => setTeam1(e.target.value)} placeholder="Team 1" className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm outline-none" />
          <span className="text-white/40 flex items-center text-xs font-bold">vs</span>
          <input value={team2} onChange={e => setTeam2(e.target.value)} placeholder="Team 2" className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm outline-none" />
        </div>
        <input value={score} onChange={e => setScore(e.target.value)} placeholder="Score / Status (e.g. 187/4 • 38 overs)" className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none mb-2" />
        <input value={status} onChange={e => setStatus(e.target.value)} placeholder="Match status (e.g. LIVE • Need 58 off 72)" className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none mb-2" />
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Your comment (optional)" className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none mb-4" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Cancel</button>
          <button onClick={() => { if (canSubmit) onSubmit({ sport, team1: team1.trim(), team2: team2.trim(), score, status, text: comment }); }} disabled={!canSubmit} className="flex-1 py-3 rounded-xl bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold">Post Update</button>
        </div>
      </div>
    </div>
  );
}
