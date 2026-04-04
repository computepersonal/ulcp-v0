import { useEffect, useState } from 'react';
import { TriviaState } from '../../context/SocialContext';

interface Props {
  trivia: TriviaState;
  tenantId: string;
  branchId: string;
  onVote: (vote: "start" | "skip") => void;
}

export default function TriviaCard({ trivia, onVote }: Props) {
  const [timeLeft, setTimeLeft] = useState(trivia.timer_secs ?? 30);

  useEffect(() => {
    setTimeLeft(trivia.timer_secs ?? 30);
  }, [trivia.question, trivia.timer_secs]);

  useEffect(() => {
    if (trivia.status !== 'question') return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [trivia.status, trivia.question]);

  if (trivia.status === 'idle' || trivia.status === 'finished') return null;

  const pct = trivia.timer_secs ? (timeLeft / trivia.timer_secs) * 100 : 0;
  const scoresRaw = trivia.scores;
  const scoresArray: Array<{ alias: string; score: number }> = Array.isArray(scoresRaw)
    ? scoresRaw
    : scoresRaw && typeof scoresRaw === 'object'
      ? Object.values(scoresRaw as Record<string, { alias: string; score: number }>)
      : [];
  const topScorers = scoresArray.sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <div className="mx-3 mb-2 rounded-2xl overflow-hidden border border-brand-500/30" style={{ background: 'rgba(99,102,241,0.15)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-brand-300 text-xs font-bold">🎮 TRIVIA {trivia.question_number && `• Q${trivia.question_number}/${trivia.total_questions}`}</span>
        <span className="text-gray-400 text-xs">{trivia.topic}</span>
      </div>

      {/* Voting phase */}
      {trivia.status === 'voting' && (
        <div className="px-4 py-3 text-center">
          <p className="text-white text-sm mb-3">🗳️ Vote to start trivia!</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => onVote('start')} className="flex items-center gap-1 bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-full">
              ▶️ Let's play! {trivia.vote_start ? `(${trivia.vote_start})` : ''}
            </button>
            <button onClick={() => onVote('skip')} className="flex items-center gap-1 bg-white/10 text-white text-xs font-medium px-4 py-2 rounded-full">
              ⏭️ Skip {trivia.vote_skip ? `(${trivia.vote_skip})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Question phase */}
      {trivia.status === 'question' && trivia.question && (
        <div className="px-4 py-3">
          <p className="text-white text-sm font-semibold mb-3">{trivia.question}</p>
          {/* Timer bar */}
          <div className="bg-white/10 rounded-full h-1.5 mb-3">
            <div className={`h-full rounded-full transition-all duration-1000 ${pct > 50 ? 'bg-brand-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">⏱ {timeLeft}s</span>
            <div className="flex gap-3">
              {topScorers.map((s, i) => (
                <span key={i} className="text-xs text-gray-300">{'🥇🥈🥉'[i]} {s.alias} {s.score}pts</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reveal phase */}
      {trivia.status === 'revealing' && (
        <div className="px-4 py-3">
          {trivia.winner_alias ? (
            <p className="text-green-400 text-sm font-semibold">✅ {trivia.winner_alias} got it! +10pts</p>
          ) : (
            <p className="text-red-400 text-sm font-semibold">⏰ Time's up!</p>
          )}
          <p className="text-white text-sm mt-1">Answer: <span className="font-bold text-brand-300">{trivia.correct_answer}</span></p>
          {trivia.fun_fact && <p className="text-gray-400 text-xs mt-1 italic">{trivia.fun_fact}</p>}
        </div>
      )}
    </div>
  );
}
