import { useEffect, useState } from 'react';
import { TriviaState } from '../../context/SocialContext';

interface Props {
  trivia: TriviaState;
  tenantId: string;
  branchId: string;
  myAlias: string;
  onVote: (vote: "start" | "skip") => void;
  onDismiss: () => void;
}

function getScoresArray(scores: TriviaState['scores']): Array<{ alias: string; score: number }> {
  if (Array.isArray(scores)) return scores;
  if (scores && typeof scores === 'object') return Object.values(scores as Record<string, { alias: string; score: number }>);
  return [];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function TriviaCard({ trivia, myAlias, onVote, onDismiss }: Props) {
  const [timeLeft, setTimeLeft] = useState(trivia.timer_secs ?? 30);

  useEffect(() => {
    setTimeLeft(trivia.timer_secs ?? 30);
  }, [trivia.question, trivia.timer_secs]);

  useEffect(() => {
    if (trivia.status !== 'question') return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [trivia.status, trivia.question]);

  const scoresArray = getScoresArray(trivia.scores).sort((a, b) => b.score - a.score);
  const topScorers = scoresArray.slice(0, 3);
  const myScore = scoresArray.find(s => s.alias === myAlias);
  const myRank = scoresArray.findIndex(s => s.alias === myAlias) + 1;
  const pct = trivia.timer_secs ? (timeLeft / trivia.timer_secs) * 100 : 0;

  if (trivia.status === 'idle') return null;

  // Finished — show scoreboard
  if (trivia.status === 'finished') {
    return (
      <div className="mx-3 mb-2 rounded-2xl overflow-hidden border border-brand-500/30" style={{ background: 'rgba(99,102,241,0.15)' }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <span className="text-brand-300 text-xs font-bold">🏆 TRIVIA RESULTS</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">{trivia.topic}</span>
            <button onClick={onDismiss} className="text-gray-500 hover:text-white text-sm">✕</button>
          </div>
        </div>
        <div className="px-4 py-3">
          {/* Top 3 podium */}
          {topScorers.length > 0 ? (
            <div className="space-y-2 mb-3">
              {topScorers.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${i === 0 ? 'bg-yellow-500/15 border border-yellow-500/30' : 'bg-white/5'}`}>
                  <span className="text-lg">{MEDALS[i]}</span>
                  <span className={`flex-1 text-sm font-semibold ${i === 0 ? 'text-yellow-300' : 'text-white'}`}>
                    {s.alias} {s.alias === myAlias && <span className="text-brand-400 text-xs">(you)</span>}
                  </span>
                  <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-300' : 'text-gray-300'}`}>{s.score}pts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-2">No scores yet</p>
          )}
          {/* Personal score if not in top 3 */}
          {myScore && myRank > 3 && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
              <span className="text-xs text-gray-400">#{myRank}</span>
              <span className="flex-1 text-sm font-semibold text-brand-300">{myAlias} <span className="text-brand-400 text-xs">(you)</span></span>
              <span className="text-sm font-bold text-brand-300">{myScore.score}pts</span>
            </div>
          )}
          {!myScore && (
            <p className="text-gray-500 text-xs text-center">You didn't participate this round</p>
          )}
        </div>
      </div>
    );
  }

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

      {/* Countdown phase */}
      {trivia.status === 'countdown' && (
        <div className="px-4 py-4 text-center">
          <p className="text-white text-lg font-bold animate-pulse">Starting soon...</p>
          <p className="text-gray-400 text-xs mt-1">Get ready to type your answers!</p>
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
                <span key={i} className="text-xs text-gray-300">{MEDALS[i]} {s.alias} {s.score}</span>
              ))}
            </div>
          </div>
          {/* Your score during game */}
          {myScore && (
            <div className="mt-2 text-center">
              <span className="text-xs text-brand-300 bg-brand-500/10 px-3 py-1 rounded-full">Your score: {myScore.score}pts (#{myRank})</span>
            </div>
          )}
          {/* Answer hint */}
          <div className="mt-2 bg-brand-500/20 rounded-xl px-3 py-2 text-center border border-brand-500/30">
            <p className="text-brand-300 text-xs font-medium">⬇️ Type your answer below and hit send!</p>
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
          {/* Leaderboard after each reveal */}
          {topScorers.length > 0 && (
            <div className="flex gap-3 mt-2 justify-center">
              {topScorers.map((s, i) => (
                <span key={i} className={`text-xs font-semibold ${i === 0 ? 'text-yellow-300' : 'text-gray-300'}`}>{MEDALS[i]} {s.alias} {s.score}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
