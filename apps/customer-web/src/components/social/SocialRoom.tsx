import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocial, SocialMessage, SocialUser, SocialContent, PrivateChatMeta } from '../../context/SocialContext';
import { useJukebox, type NowPlaying } from '../../context/JukeboxContext';
import { useAds } from '../ads/useAds';
import type { ServedAd } from '../ads/types';
import { useAppSelector } from '../../hooks/redux';
import PeoplePanel from './PeoplePanel';
import ActionMenu from './ActionMenu';
import PrivateChatPanel from './PrivateChatPanel';
import DmInbox from './DmInbox';
import PeerProfilePanel from './PeerProfilePanel';
import ContentPicker from './ContentPicker';
import PollCreator from './PollCreator';
import MatchCreator from './MatchCreator';
import RichMessageCard from './RichMessageCard';
import TriviaCard from './TriviaCard';
import TriviaTopicSelector from './TriviaTopicSelector';
import FloatingReactions from './FloatingReactions';
import JukeboxPanel from '../jukebox/JukeboxPanel';

interface Props {
  tenantId: string;
  branchId: string;
  placeName: string;
  onClose: () => void;
  onLeaveRoom: () => void;
}

// Unified message item for merged list
type UnifiedItem =
  | { kind: 'text'; timestamp: number; data: SocialMessage }
  | { kind: 'rich'; timestamp: number; data: SocialContent }
  | { kind: 'jukebox_np'; timestamp: number; data: NowPlaying }
  | { kind: 'ad_bot'; timestamp: number; data: ServedAd };

const BROADCAST_EMOJIS = ['🎉', '🔥', '❤️', '😂', '😮', '🥳', '🙌', '💃', '🍹', '🎊', '👏', '✨'];

export default function SocialRoom({ tenantId, branchId, placeName, onClose, onLeaveRoom }: Props) {
  const {
    state,
    sendMessage,
    toggleMode,
    requestUsers,
    shareContent,
    votePoll,
    reactToMessage,
    broadcastReaction,
    startTrivia,
    voteTrivia,
    sendTriviaAnswer,
    openPrivateChat,
  } = useSocial();

  const { nowPlaying, pricePerSong, fetchStatus } = useJukebox();

  // ─── Ads ─────────────────────────────────────────────────────────────────
  const { ads: socialAds, recordClick: recordAdClick } = useAds({
    placement: 'social_room',
    tenant_id: tenantId,
    branch_id: branchId,
    limit: 10,
  });

  // Rotating banner index
  const [bannerIdx, setBannerIdx] = useState(0);
  useEffect(() => {
    if (socialAds.length <= 1) return;
    const interval = setInterval(() => {
      setBannerIdx(prev => (prev + 1) % socialAds.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [socialAds.length]);

  // Bot ad messages injected into chat — one every 2 minutes, cycling through ads
  const [botAdCards, setBotAdCards] = useState<Array<{ id: string; timestamp: number; ad: ServedAd }>>([]);
  const botAdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botAdIndexRef = useRef(0);

  useEffect(() => {
    if (socialAds.length === 0) return;
    // Inject first one after 30 seconds, then every 2 minutes
    const injectAd = () => {
      const ad = socialAds[botAdIndexRef.current % socialAds.length];
      botAdIndexRef.current += 1;
      setBotAdCards(prev => [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), ad }]);
    };
    const firstTimeout = setTimeout(injectAd, 30000);
    botAdTimerRef.current = setInterval(injectAd, 120000);
    return () => {
      clearTimeout(firstTimeout);
      if (botAdTimerRef.current) clearInterval(botAdTimerRef.current);
    };
  }, [socialAds]);

  const handleAdClick = useCallback(async (ad: ServedAd) => {
    await recordAdClick(ad, crypto.randomUUID());
    if (ad.type === 'in_house') {
      // In-house promotions navigate to catalogue — cta_url holds section/path hint
      const cataloguePath = ad.cta_url ? `/menu?section=${encodeURIComponent(ad.cta_url)}` : '/menu';
      window.location.href = cataloguePath;
    } else if (ad.cta_url) {
      window.open(ad.cta_url, '_blank', 'noopener');
    }
  }, [recordAdClick]);

  const [input, setInput] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ user: SocialUser; x: number; y: number } | null>(null);
  const [showJukebox, setShowJukebox] = useState(false);
  const [showDmInbox, setShowDmInbox] = useState(false);
  const [activeDm, setActiveDm] = useState<PrivateChatMeta | null>(null);
  const [viewingProfile, setViewingProfile] = useState<SocialUser | null>(null);

  // Content picker states
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showMatchCreator, setShowMatchCreator] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showTriviaSelector, setShowTriviaSelector] = useState(false);

  // Link / video / music input modal state
  const [showLinkInput, setShowLinkInput] = useState<null | 'link' | 'video' | 'music'>(null);
  const [linkInputValue, setLinkInputValue] = useState('');

  // Jukebox now-playing chat cards: track last shown song to avoid duplicates
  const lastNowPlayingSongRef = useRef<string | null>(null);
  const [jukeboxNpCards, setJukeboxNpCards] = useState<Array<{ id: string; timestamp: number; data: NowPlaying }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch jukebox status on mount
  useEffect(() => {
    void fetchStatus(tenantId, branchId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When nowPlaying changes to a new song, insert a card in the chat
  useEffect(() => {
    if (!nowPlaying) return;
    const songKey = `${nowPlaying.song_title}::${nowPlaying.song_artist}::${nowPlaying.requested_by_alias}`;
    if (songKey === lastNowPlayingSongRef.current) return;
    lastNowPlayingSongRef.current = songKey;
    setJukeboxNpCards(prev => [
      ...prev,
      { id: crypto.randomUUID(), timestamp: Date.now(), data: nowPlaying },
    ]);
  }, [nowPlaying]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.richMessages, jukeboxNpCards, botAdCards]);

  useEffect(() => {
    requestUsers(tenantId, branchId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    // If trivia is in question phase, also emit trivia answer
    if (state.trivia.status === 'question') {
      sendTriviaAnswer(msg, tenantId, branchId);
    }
    sendMessage(msg, tenantId, branchId);
    setInput('');
  };

  // Upload photo — convert to base64 data URL and share as image content
  const handlePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      shareContent('image', { url }, tenantId, branchId);
    };
    reader.readAsDataURL(file);
  };

  const handleLinkSubmit = () => {
    const url = linkInputValue.trim();
    if (!url || !showLinkInput) return;
    if (showLinkInput === 'link') {
      shareContent('link', { url }, tenantId, branchId);
    } else if (showLinkInput === 'video') {
      shareContent('video', { url }, tenantId, branchId);
    } else if (showLinkInput === 'music') {
      shareContent('music', { text: url }, tenantId, branchId);
    }
    setLinkInputValue('');
    setShowLinkInput(null);
  };

  // Jukebox button label
  const jukeboxLabel = nowPlaying
    ? `♪ ${nowPlaying.song_title.slice(0, 15)}${nowPlaying.song_title.length > 15 ? '…' : ''}`
    : '🎵 Jukebox';

  // Build unified sorted message list
  const allItems: UnifiedItem[] = [
    ...state.messages.map((m): UnifiedItem => ({ kind: 'text', timestamp: m.timestamp, data: m })),
    ...state.richMessages.map((m): UnifiedItem => ({ kind: 'rich', timestamp: m.timestamp, data: m })),
    ...jukeboxNpCards.map((c): UnifiedItem => ({ kind: 'jukebox_np', timestamp: c.timestamp, data: c.data })),
    ...botAdCards.map((c): UnifiedItem => ({ kind: 'ad_bot', timestamp: c.timestamp, data: c.ad })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const renderTextMessage = (msg: SocialMessage) => {
    if (msg.type === 'announcement') {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <span className="bg-gray-800/60 text-gray-300 text-xs px-3 py-1 rounded-full">{msg.message}</span>
        </div>
      );
    }
    if (msg.is_bot) {
      return (
        <div key={msg.id} className="flex gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm shrink-0">🤖</div>
          <div className="bg-indigo-900/80 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-xs">
            <p className="text-white text-sm">{msg.message}</p>
          </div>
        </div>
      );
    }
    return (
      <div key={msg.id} className="flex gap-2 mb-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${msg.is_mine ? 'bg-brand-500' : 'bg-gray-700'}`}>{msg.emoji}</div>
        <div className="max-w-xs">
          <span className="text-xs text-gray-400 ml-1 mb-0.5 block">{msg.is_mine ? 'You' : msg.alias}</span>
          <div className={`rounded-2xl rounded-tl-sm px-4 py-2.5 ${msg.is_mine ? 'bg-brand-500/30 border border-brand-500/40' : 'bg-gray-800'}`}>
            <p className="text-white text-sm">{msg.message}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderJukeboxNpCard = (np: NowPlaying, id: string) => (
    <div key={id} className="flex justify-center my-3">
      <div className="bg-[#1A1F2E] border border-brand-500/40 rounded-2xl p-3 w-64 max-w-xs">
        <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider mb-2">🎵 Now Playing</p>
        <div className="flex items-center gap-3">
          <img
            src={np.song_thumbnail}
            alt=""
            className="w-10 h-10 rounded-lg object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{np.song_title}</p>
            <p className="text-gray-400 text-xs truncate">{np.song_artist}</p>
          </div>
        </div>
        <p className="text-gray-500 text-xs mt-2">
          🎧 {np.requested_by_alias}
          {np.dedicated_to_alias && (
            <span className="text-pink-400"> 💝 To {np.dedicated_to_alias}</span>
          )}
        </p>
        {np.dedication_message && (
          <p className="text-gray-400 text-xs mt-1 italic">&ldquo;{np.dedication_message}&rdquo;</p>
        )}
      </div>
    </div>
  );

  const renderBotAdCard = (ad: ServedAd, key: string) => (
    <div key={key} className="flex gap-2 mb-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-sm shrink-0">📢</div>
      <div className="max-w-xs">
        <span className="text-xs text-gray-500 ml-1 mb-0.5 block">Sponsored</span>
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 border cursor-pointer hover:brightness-110 transition-all"
          style={{
            background: ad.brand_color ? `${ad.brand_color}20` : 'rgba(99,102,241,0.15)',
            borderColor: ad.brand_color ? `${ad.brand_color}40` : 'rgba(99,102,241,0.3)',
          }}
          onClick={() => { void handleAdClick(ad); }}
        >
          <p className="text-white text-sm font-semibold">{ad.headline}</p>
          {ad.body && <p className="text-gray-300 text-xs mt-1">{ad.body}</p>}
          {ad.cta_text && (
            <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full text-white"
              style={{ background: ad.brand_color ?? '#6366F1' }}
            >
              {ad.cta_text} →
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // Build alias + emoji list for dedications from social state
  const publicUsersForJukebox = state.publicUsers.map(u => ({ alias: u.alias, emoji: u.emoji }));
  // Derive alias from social state
  const myAlias = state.alias;
  const authToken = useAppSelector(s => s.auth.token) ?? undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0A0A0F' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        {/* Back to menu — stays in room */}
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-lg" title="Back to menu">
          🍽
        </button>
        <div className="flex-1">
          <div className="text-white font-semibold text-sm">{placeName} Chat</div>
          <div className="text-gray-400 text-xs">{state.publicCount} people here</div>
        </div>
        {/* Jukebox button */}
        <button
          onClick={() => setShowJukebox(true)}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            nowPlaying
              ? 'bg-brand-500/20 border border-brand-500/50 text-brand-400 animate-pulse'
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
          title={`Jukebox — \u20B9${(pricePerSong / 100).toFixed(0)}/song`}
        >
          {jukeboxLabel}
        </button>
        {/* DM inbox button */}
        {(() => {
          const totalUnread = Object.values(state.privateChatMeta).reduce((s, m) => s + m.unread, 0);
          return (
            <button
              onClick={() => setShowDmInbox(v => !v)}
              className="relative flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-1.5 rounded-full"
            >
              💬
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          );
        })()}
        <button
          onClick={() => setShowPeople(true)}
          className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-1.5 rounded-full"
        >
          👥 <span>{state.publicCount}</span>
        </button>
        {/* Leave room — explicit exit */}
        <button
          onClick={onLeaveRoom}
          className="text-red-400 text-xs font-medium px-2 py-1.5 rounded-full hover:bg-red-500/10 transition-colors"
          title="Leave room"
        >
          Exit
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-white/10">
        {(['public', 'private'] as const).map(m => (
          <button
            key={m}
            onClick={() => toggleMode(m, tenantId, branchId)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${state.mode === m ? 'bg-brand-500 text-white' : 'bg-white/10 text-gray-400'}`}
          >
            {m === 'public' ? '🌐' : '🔒'} {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Rotating Ad Banner */}
      {socialAds.length > 0 && (() => {
        const ad = socialAds[bannerIdx % socialAds.length];
        return (
          <div
            className="flex items-center gap-3 px-4 py-2 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
            style={{ background: ad.brand_color ? `${ad.brand_color}15` : 'rgba(99,102,241,0.08)' }}
            onClick={() => { void handleAdClick(ad); }}
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: ad.brand_color ?? '#6366F1' }}
            >
              📢
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{ad.headline}</p>
              {ad.body && <p className="text-gray-400 text-[10px] truncate">{ad.body}</p>}
            </div>
            {ad.cta_text && (
              <span
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white shrink-0"
                style={{ background: ad.brand_color ?? '#6366F1' }}
              >
                {ad.cta_text}
              </span>
            )}
            {socialAds.length > 1 && (
              <span className="text-[9px] text-gray-600 shrink-0">{bannerIdx + 1}/{socialAds.length}</span>
            )}
          </div>
        );
      })()}

      {/* Pinned Trivia Card */}
      {state.trivia.status !== 'idle' && state.trivia.status !== 'finished' && (
        <TriviaCard
          trivia={state.trivia}
          tenantId={tenantId}
          branchId={branchId}
          onVote={vote => voteTrivia(vote, tenantId, branchId)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {allItems.map(item => {
          if (item.kind === 'text') {
            return renderTextMessage(item.data);
          }
          if (item.kind === 'jukebox_np') {
            return renderJukeboxNpCard(item.data, `jnp-${item.timestamp}`);
          }
          if (item.kind === 'ad_bot') {
            return renderBotAdCard(item.data, `ad-${item.timestamp}`);
          }
          return (
            <RichMessageCard
              key={item.data.message_id}
              msg={item.data}
              tenantId={tenantId}
              branchId={branchId}
              onVotePoll={(messageId, optionIndex) => votePoll(messageId, optionIndex, tenantId, branchId)}
              onReact={(messageId, emoji) => reactToMessage(messageId, emoji, tenantId, branchId)}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Trivia answer hint */}
      {state.trivia.status === 'question' && (
        <div className="px-4 py-1">
          <p className="text-brand-400 text-xs text-center">💡 Type your answer and send to play trivia!</p>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex gap-2">
          {/* [+] content picker button */}
          <button
            onClick={() => setShowContentPicker(true)}
            className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white text-xl shrink-0 hover:bg-white/20 transition-colors"
          >
            +
          </button>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder={state.trivia.status === 'question' ? 'Type your trivia answer...' : 'Say something... 🎭'}
            className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:bg-white/15"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            →
          </button>
        </div>
      </div>

      {/* Floating Reactions overlay */}
      <FloatingReactions reactions={state.floatingReactions} />

      {/* Content Picker */}
      {showContentPicker && (
        <ContentPicker
          onClose={() => setShowContentPicker(false)}
          onPhoto={handlePhoto}
          onVideoLink={() => setShowLinkInput('video')}
          onLink={() => setShowLinkInput('link')}
          onPoll={() => setShowPollCreator(true)}
          onMusic={() => setShowLinkInput('music')}
          onMatch={() => setShowMatchCreator(true)}
          onGif={() => setShowGifPicker(true)}
          onReaction={() => setShowReactionPicker(true)}
          onTrivia={() => setShowTriviaSelector(true)}
        />
      )}

      {/* Poll Creator */}
      {showPollCreator && (
        <PollCreator
          onSubmit={(question, options) => {
            shareContent('poll', { poll: { question, options } }, tenantId, branchId);
            setShowPollCreator(false);
          }}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {/* Match Creator */}
      {showMatchCreator && (
        <MatchCreator
          onSubmit={data => {
            shareContent('match', { match: { sport: data.sport, team1: data.team1, team2: data.team2, score: data.score, status: data.status }, text: data.text }, tenantId, branchId);
            setShowMatchCreator(false);
          }}
          onClose={() => setShowMatchCreator(false)}
        />
      )}

      {/* GIF Picker — placeholder */}
      {showGifPicker && (
        <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
          <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)' }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-semibold text-center mb-4">😂 GIFs</h3>
            <div className="flex items-center justify-center py-8">
              <p className="text-gray-400 text-sm text-center">🚧 GIF search coming soon!<br /><span className="text-xs text-gray-600">Tenor integration in next update</span></p>
            </div>
            <button onClick={() => setShowGifPicker(false)} className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Close</button>
          </div>
        </div>
      )}

      {/* Reaction Broadcast Picker */}
      {showReactionPicker && (
        <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
          <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)' }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-semibold text-center mb-4">🎉 Send a Reaction</h3>
            <div className="grid grid-cols-6 gap-3 mb-4">
              {BROADCAST_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { broadcastReaction(emoji, tenantId, branchId); setShowReactionPicker(false); }}
                  className="flex items-center justify-center text-3xl p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button onClick={() => setShowReactionPicker(false)} className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      {/* Trivia Topic Selector */}
      {showTriviaSelector && (
        <TriviaTopicSelector
          onSelect={topic => { startTrivia(topic, tenantId, branchId); setShowTriviaSelector(false); }}
          onClose={() => setShowTriviaSelector(false)}
        />
      )}

      {/* Link / Video / Music input modal */}
      {showLinkInput && (
        <div className="fixed inset-0 bg-black/70 z-70 flex items-end">
          <div className="w-full rounded-t-2xl p-5" style={{ background: 'rgba(15,15,25,0.98)' }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-4">
              {showLinkInput === 'video' ? '🎥 Share a Video' : showLinkInput === 'music' ? '🎵 Now Playing' : '🔗 Share a Link'}
            </h3>
            <input
              autoFocus
              value={linkInputValue}
              onChange={e => setLinkInputValue(e.target.value)}
              placeholder={showLinkInput === 'music' ? 'Song name or artist...' : 'Paste URL here...'}
              className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white/15 mb-4"
              onKeyDown={e => { if (e.key === 'Enter') handleLinkSubmit(); }}
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowLinkInput(null); setLinkInputValue(''); }} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium">Cancel</button>
              <button
                onClick={handleLinkSubmit}
                disabled={!linkInputValue.trim()}
                className="flex-1 py-3 rounded-xl bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* People Panel */}
      {showPeople && (
        <PeoplePanel
          users={state.publicUsers}
          onClose={() => { setShowPeople(false); setSelectedUser(null); }}
          onSelectUser={(user, x, y) => setSelectedUser({ user, x, y })}
          selectedUserId={selectedUser?.user.socket_id ?? null}
        />
      )}

      {/* Action Menu — context menu at click position */}
      {selectedUser && (
        <ActionMenu
          user={selectedUser.user}
          x={selectedUser.x}
          y={selectedUser.y}
          tenantId={tenantId}
          branchId={branchId}
          onClose={() => setSelectedUser(null)}
          onOpenDM={(user) => {
            openPrivateChat(user);
            setActiveDm(state.privateChatMeta[user.peer_id] ?? {
              peer_id: user.peer_id,
              alias: user.alias,
              emoji: user.emoji,
              unread: 0,
            });
          }}
          onViewProfile={(user) => setViewingProfile(user)}
        />
      )}

      {/* DM Inbox */}
      {showDmInbox && (
        <DmInbox
          chats={Object.values(state.privateChatMeta)}
          privateChats={state.privateChats}
          onOpen={(meta) => setActiveDm(meta)}
          onClose={() => setShowDmInbox(false)}
        />
      )}

      {/* Active Private Chat Panel */}
      {activeDm && (
        <PrivateChatPanel
          peerId={activeDm.peer_id}
          alias={activeDm.alias}
          emoji={activeDm.emoji}
          tenantId={tenantId}
          branchId={branchId}
          onClose={() => setActiveDm(null)}
        />
      )}

      {/* Peer Profile Panel */}
      {viewingProfile && (
        <PeerProfilePanel
          user={viewingProfile}
          onClose={() => setViewingProfile(null)}
          onSendDM={(user) => {
            openPrivateChat(user);
            setActiveDm(state.privateChatMeta[user.peer_id] ?? {
              peer_id: user.peer_id,
              alias: user.alias,
              emoji: user.emoji,
              unread: 0,
            });
            setViewingProfile(null);
          }}
        />
      )}

      {/* Jukebox Panel */}
      {showJukebox && (
        <JukeboxPanel
          tenant_id={tenantId}
          branch_id={branchId}
          alias={myAlias || 'Guest'}
          token={authToken}
          publicUsers={publicUsersForJukebox}
          onClose={() => setShowJukebox(false)}
        />
      )}
    </div>
  );
}
