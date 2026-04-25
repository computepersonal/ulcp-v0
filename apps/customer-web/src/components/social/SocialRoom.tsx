import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  slug: string;
  onClose: () => void;
  onLeaveRoom: () => void;
  onChangePreferences: () => void;
}

// Unified message item for merged list
type UnifiedItem =
  | { kind: 'text'; timestamp: number; data: SocialMessage }
  | { kind: 'rich'; timestamp: number; data: SocialContent }
  | { kind: 'jukebox_np'; timestamp: number; data: NowPlaying }
  | { kind: 'ad_bot'; timestamp: number; data: ServedAd };

const BROADCAST_EMOJIS = ['🎉', '🔥', '❤️', '😂', '😮', '🥳', '🙌', '💃', '🍹', '🎊', '👏', '✨'];

export default function SocialRoom({ tenantId, branchId, placeName, slug, onClose, onLeaveRoom, onChangePreferences }: Props) {
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

  const navigate = useNavigate();

  // ─── Room background gradients ──────────────────────────────────────────
  // Rotates every 10 min with a 3s CSS fade — one repaint per tick, negligible cost.
  // Each gradient stays dark enough for white text to remain readable.
  const ROOM_GRADIENTS = [
    'linear-gradient(135deg, #0A0A0F 0%, #1a1a2e 40%, #16213e 100%)',   // midnight navy
    'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',   // cosmic purple
    'linear-gradient(135deg, #0b3d3d 0%, #0c4747 40%, #0A0A0F 100%)',   // deep teal
    'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 40%, #0f0a1a 100%)',   // violet dusk
    'linear-gradient(135deg, #2d0a2e 0%, #4a1a47 40%, #0f0a1a 100%)',   // magenta night
    'linear-gradient(135deg, #0a1f2e 0%, #1b3a5c 40%, #0a1020 100%)',   // ocean blue
    'linear-gradient(135deg, #2e1a0a 0%, #4a2f1a 40%, #1a0f08 100%)',   // warm ember
    'linear-gradient(135deg, #0a2e1f 0%, #14503a 40%, #0a1a14 100%)',   // emerald forest
    'linear-gradient(135deg, #2e0a1f 0%, #5c1b3a 40%, #1a0a14 100%)',   // rose noir
    'linear-gradient(135deg, #0a0f2e 0%, #1e2b6b 40%, #0a0a1a 100%)',   // electric indigo
  ];
  const [gradientIdx, setGradientIdx] = useState(() => Math.floor(Math.random() * ROOM_GRADIENTS.length));
  useEffect(() => {
    const interval = setInterval(() => {
      setGradientIdx(prev => (prev + 1) % ROOM_GRADIENTS.length);
    }, 600000); // 10 minutes
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    }, 4000);
    return () => clearInterval(interval);
  }, [socialAds.length]);

  // Bot ad messages injected into chat — one every 2 minutes, cycling through ads
  const [botAdCards, setBotAdCards] = useState<Array<{ id: string; timestamp: number; ad: ServedAd }>>([]);
  const botAdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botAdIndexRef = useRef(0);

  useEffect(() => {
    if (socialAds.length === 0) return;
    // Inject first one after 60 seconds, then every 5 minutes
    const injectAd = () => {
      const ad = socialAds[botAdIndexRef.current % socialAds.length];
      botAdIndexRef.current += 1;
      setBotAdCards(prev => [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), ad }]);
    };
    const firstTimeout = setTimeout(injectAd, 60000);
    botAdTimerRef.current = setInterval(injectAd, 300000);
    return () => {
      clearTimeout(firstTimeout);
      if (botAdTimerRef.current) clearInterval(botAdTimerRef.current);
    };
  }, [socialAds]);

  const handleAdClick = useCallback(async (ad: ServedAd) => {
    await recordAdClick(ad, crypto.randomUUID());
    if (ad.type === 'in_house') {
      // In-house promotions: close social room and scroll to the section in catalogue
      onClose();
      if (ad.cta_url) {
        navigate(`/place/${slug}?section=${encodeURIComponent(ad.cta_url)}`);
      }
    } else if (ad.cta_url) {
      window.open(ad.cta_url, '_blank', 'noopener');
    }
  }, [recordAdClick, onClose, navigate, slug]);

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
  const [showMyProfile, setShowMyProfile] = useState(false);

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

  const jukeboxLabel = '🎵';

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
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-500 ml-1 mb-0.5 block">Sponsored</span>
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 border cursor-pointer hover:brightness-110 transition-all"
          style={{
            background: ad.brand_color ? `${ad.brand_color}20` : 'rgba(99,102,241,0.15)',
            borderColor: ad.brand_color ? `${ad.brand_color}40` : 'rgba(99,102,241,0.3)',
          }}
          onClick={() => { void handleAdClick(ad); }}
        >
          <div className="flex items-center justify-between">
            <p className="text-white text-sm font-semibold">{ad.headline}</p>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0 ml-2"
              style={{ background: ad.brand_color ?? '#6366F1' }}
            >→</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Build alias + emoji list for dedications from social state
  const publicUsersForJukebox = state.publicUsers.map(u => ({ alias: u.alias, emoji: u.emoji }));
  // Derive alias from social state
  const myAlias = state.alias;
  const authToken = useAppSelector(s => s.auth.token) ?? undefined;

  const [showExitDialog, setShowExitDialog] = useState(false);
  const [triviaHidden, setTriviaHidden] = useState(false);

  // Reset hidden state when a new trivia round starts
  useEffect(() => {
    if (state.trivia.status === 'voting' || state.trivia.status === 'countdown') {
      setTriviaHidden(false);
    }
  }, [state.trivia.status]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col transition-all duration-[3000ms]" style={{ background: ROOM_GRADIENTS[gradientIdx] }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        {/* Logo with back below */}
        <div className="flex flex-col items-center shrink-0 -space-y-0.5">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-base">🍽</div>
          <button
            onClick={() => setShowExitDialog(true)}
            className="text-white text-xs font-bold hover:text-gray-300 transition-colors leading-none"
            title="Back"
          >
            ←
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{placeName} Social Room</div>
        </div>
        {/* Jukebox button */}
        <button
          onClick={() => setShowJukebox(true)}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            nowPlaying
              ? 'bg-brand-500/20 border border-brand-500/50 animate-pulse'
              : 'bg-white/10 hover:bg-white/20'
          }`}
          style={{ color: nowPlaying ? undefined : '#FFFFF0' }}
          title={`Jukebox — \u20B9${(pricePerSong / 100).toFixed(0)}/song`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFF0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </button>
        <button
          onClick={() => setShowPeople(true)}
          className="flex items-center gap-1.5 bg-white/10 text-xs font-medium px-3 py-1.5 rounded-full"
          style={{ color: '#FFFFF0' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1C4.76 14.04 4.39 14 4 14c-.99 0-1.93.21-2.78.58A2.01 2.01 0 0 0 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm3.78 1.58C22.93 14.21 21.99 14 21 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57c0-.81-.48-1.53-1.22-1.85zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>
          <span>{state.publicCount}</span>
        </button>
      </div>

      {/* Exit confirmation dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6">
          <div className="bg-[#1A1F2E] rounded-2xl p-6 max-w-xs w-full shadow-2xl border border-white/10">
            <div className="text-center mb-5">
              <div className="text-2xl mb-2">👋</div>
              <h3 className="text-white font-semibold text-base">Leaving the room?</h3>
              <p className="text-gray-400 text-sm mt-1">You can browse the menu and come back, or leave permanently.</p>
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => { setShowExitDialog(false); onClose(); }}
                className="w-full py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
              >
                Browse Menu & Come Back
              </button>
              <button
                onClick={() => { setShowExitDialog(false); onLeaveRoom(); }}
                className="w-full py-2.5 rounded-xl bg-white/10 text-red-400 font-semibold text-sm hover:bg-red-500/10 transition-colors"
              >
                Leave Room Permanently
              </button>
              <button
                onClick={() => setShowExitDialog(false)}
                className="w-full py-2 text-gray-500 text-xs hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
          </div>
        );
      })()}

      {/* Pinned Trivia Card */}
      {state.trivia.status !== 'idle' && !triviaHidden && (
        <TriviaCard
          trivia={state.trivia}
          tenantId={tenantId}
          branchId={branchId}
          myAlias={myAlias ?? ''}
          onVote={vote => voteTrivia(vote, tenantId, branchId)}
          onDismiss={() => setTriviaHidden(true)}
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

      {/* Input */}
      <div className={`px-4 py-3 border-t ${state.trivia.status === 'question' ? 'border-brand-500/50 bg-brand-500/10' : 'border-white/10'}`}>
        <div className="flex gap-2">
          {state.trivia.status !== 'question' && (
            <button
              onClick={() => setShowContentPicker(true)}
              className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white text-xl shrink-0 hover:bg-white/20 transition-colors"
            >
              +
            </button>
          )}
          {state.trivia.status === 'question' && (
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center text-lg shrink-0">🎮</div>
          )}
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder={state.trivia.status === 'question' ? '🎯 Type your answer...' : 'Say something... 🎭'}
            className={`flex-1 text-white rounded-xl px-4 py-2.5 text-sm outline-none ${
              state.trivia.status === 'question'
                ? 'bg-brand-500/20 placeholder-brand-300/60 border border-brand-500/40 focus:border-brand-400'
                : 'bg-white/10 placeholder-gray-500 focus:bg-white/15'
            }`}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${
              state.trivia.status === 'question'
                ? 'bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white animate-pulse'
                : 'bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white'
            }`}
          >
            {state.trivia.status === 'question' ? '🎯' : '→'}
          </button>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      {(() => {
        const totalUnread = Object.values(state.privateChatMeta).reduce((s, m) => s + m.unread, 0);
        const tabs: Array<{ id: string; icon: React.ReactNode; label: string; badge?: number; action: () => void }> = [
          {
            id: 'home',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>,
            label: 'Home',
            action: () => setShowExitDialog(true),
          },
          {
            id: 'explore',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/></svg>,
            label: 'Explore',
            action: () => { onClose(); navigate('/explore'); },
          },
          {
            id: 'messages',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>,
            label: 'Messages',
            badge: totalUnread,
            action: () => setShowDmInbox(v => !v),
          },
          {
            id: 'profile',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
            label: 'Profile',
            action: () => setShowMyProfile(true),
          },
        ];
        return (
          <div className="flex items-center justify-around border-t border-white/10 bg-black/30 backdrop-blur-sm">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={tab.action}
                className="relative flex flex-col items-center gap-0.5 py-2 px-4 text-gray-400 hover:text-white transition-colors"
              >
                {tab.icon}
                <span className="text-[10px]">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Floating order tracker */}
      {(() => {
        const activeOrderId = localStorage.getItem('active_order_id');
        const activeOrderSlug = localStorage.getItem('active_order_slug');
        if (!activeOrderId || !activeOrderSlug) return null;
        return (
          <button
            onClick={() => { onClose(); navigate(`/place/${activeOrderSlug}/order/${activeOrderId}`); }}
            className="fixed bottom-16 right-4 z-[55] flex items-center gap-2 bg-green-500 text-white px-4 py-2.5 rounded-full shadow-lg animate-pulse"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.36 9l.6 3H5.04l.6-3h12.72M20 4H4v2h16V4zm0 3H4l-1 5v2h1v6h10v-6h4v6h2v-6h1v-2l-1-5zM6 18v-4h6v4H6z"/></svg>
            <span className="text-xs font-semibold">Track Order</span>
          </button>
        );
      })()}

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
          currentMode={state.mode}
          onToggleMode={(mode) => toggleMode(mode, tenantId, branchId)}
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

      {/* My Social Profile */}
      {showMyProfile && (
        <div className="fixed inset-0 flex flex-col" style={{ background: '#0A0A14', zIndex: 250 }}>
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
          >
            <button
              onClick={() => setShowMyProfile(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xl"
            >
              ←
            </button>
            <div className="text-white font-semibold text-lg">My Profile</div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-8">
            {/* Avatar + Alias */}
            <div className="flex flex-col items-center gap-3 mb-8">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-4xl">
                {state.emoji || '👤'}
              </div>
              <div className="text-white text-xl font-bold">{state.alias || 'Anonymous'}</div>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                state.mode === 'public'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}>
                {state.mode === 'public' ? '🌐 Visible to others' : '🔒 Hidden mode'}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{Object.keys(state.privateChatMeta).length}</div>
                <div className="text-gray-500 text-xs mt-1">Conversations</div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{state.messages.filter(m => m.is_mine).length}</div>
                <div className="text-gray-500 text-xs mt-1">Messages sent</div>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-3">
              <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Room</span>
                <span className="text-white text-sm font-medium">{placeName}</span>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Visibility</span>
                <span className="text-white text-sm font-medium">{state.mode === 'public' ? 'Public' : 'Private'}</span>
              </div>
            </div>

            {/* Change preferences — edit vibe + visibility, keeps alias */}
            <button
              onClick={() => { setShowMyProfile(false); onChangePreferences(); }}
              className="w-full mt-10 py-3 rounded-xl border border-white/15 text-white text-sm font-medium hover:bg-white/5 transition-colors"
            >
              ✨ Change Vibe & Visibility
            </button>

            {/* Leave room button */}
            <button
              onClick={() => { setShowMyProfile(false); onLeaveRoom(); }}
              className="w-full mt-3 py-3 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
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
