import { FloatingReaction } from '../../context/SocialContext';

interface Props {
  reactions: FloatingReaction[];
}

export default function FloatingReactions({ reactions }: Props) {
  if (reactions.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-75 overflow-hidden">
      {reactions.map(r => (
        <div
          key={r.id}
          className="absolute bottom-20 text-4xl"
          style={{
            left: `${r.x}%`,
            animation: 'floatUp 3s ease-out forwards',
          }}
        >
          {r.emoji}
        </div>
      ))}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-60vh) scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
