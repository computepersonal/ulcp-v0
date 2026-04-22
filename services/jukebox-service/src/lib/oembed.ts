import { logger } from "./logger";

export interface SongMetadata {
  title: string;
  artist: string;
  duration_secs: number;
  thumbnail: string | undefined;
  source: "youtube" | "spotify";
  source_id: string;
  source_url: string;
}

// ── URL parsers ──────────────────────────────────────────────────────────────

function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id && id.length > 0 ? id : null;
    }
    // youtube.com/watch?v=VIDEO_ID
    if (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "m.youtube.com"
    ) {
      const v = u.searchParams.get("v");
      if (v) return v;
      // youtube.com/shorts/VIDEO_ID
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) return shortsMatch[1] ?? null;
      // youtube.com/embed/VIDEO_ID
      const embedMatch = u.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embedMatch) return embedMatch[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSpotifyTrackId(url: string): string | null {
  try {
    const u = new URL(url);
    if (
      u.hostname === "open.spotify.com" ||
      u.hostname === "spotify.com"
    ) {
      const trackMatch = u.pathname.match(/^\/track\/([^/?#]+)/);
      if (trackMatch) return trackMatch[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Title parsing ────────────────────────────────────────────────────────────

/**
 * Attempts to split a combined "Title - Artist" or "Artist - Title" string.
 * YouTube titles commonly follow "Artist - Song Title" or "Song Title - Artist".
 * We return the two parts without making assumptions about order — the caller
 * decides which part becomes title vs artist based on context.
 *
 * Heuristic: if the left part looks like an artist name (short, title-case,
 * no "ft.", "feat", "official") we treat it as artist. Otherwise left=title.
 */
function parseTitleArtist(raw: string): { title: string; artist: string } {
  // Strip common suffixes that YouTube appends
  const cleaned = raw
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, "")
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, "")
    .replace(/\s*\(Lyric\s*Video\)/gi, "")
    .replace(/\s*\[Lyric\s*Video\]/gi, "")
    .replace(/\s*\(Audio\)/gi, "")
    .replace(/\s*\[Audio\]/gi, "")
    .trim();

  const sep = cleaned.indexOf(" - ");
  if (sep === -1) {
    return { title: cleaned, artist: "Unknown Artist" };
  }

  const left = cleaned.slice(0, sep).trim();
  const right = cleaned.slice(sep + 3).trim();

  // If left part is short (<= 40 chars) and right is longer, left is likely artist
  // This matches "Arijit Singh - Kesariya" pattern
  if (left.length <= 40 && right.length > left.length) {
    return { title: right, artist: left };
  }
  // Otherwise "Kesariya (Full Song) - Arijit Singh" → title=left, artist=right
  return { title: left, artist: right };
}

// ── oEmbed fetchers ──────────────────────────────────────────────────────────

interface NoembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  error?: string;
}

interface SpotifyOembedResponse {
  title?: string;
  thumbnail_url?: string;
  error?: string;
}

async function fetchYouTubeMetadata(
  videoId: string,
  sourceUrl: string
): Promise<SongMetadata> {
  const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}`;

  const res = await fetch(endpoint, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "ULCP-Jukebox/1.0" },
  });

  if (!res.ok) {
    throw new Error(`noembed returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as NoembedResponse;

  if (data.error) {
    throw new Error(`noembed error: ${data.error}`);
  }

  const rawTitle = data.title ?? "";
  const { title, artist: parsedArtist } = parseTitleArtist(rawTitle);
  // noembed also provides author_name (channel name) — use it as fallback
  const artist =
    parsedArtist !== "Unknown Artist"
      ? parsedArtist
      : (data.author_name ?? "Unknown Artist");

  return {
    title: title || rawTitle || "Unknown Title",
    artist,
    duration_secs: 240,
    thumbnail:
      data.thumbnail_url ??
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    source: "youtube",
    source_id: videoId,
    source_url: sourceUrl,
  };
}

async function fetchSpotifyMetadata(
  trackId: string,
  sourceUrl: string
): Promise<SongMetadata> {
  const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(
    `https://open.spotify.com/track/${trackId}`
  )}`;

  const res = await fetch(endpoint, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "ULCP-Jukebox/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Spotify oEmbed returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as SpotifyOembedResponse;

  if (data.error) {
    throw new Error(`Spotify oEmbed error: ${data.error}`);
  }

  const rawTitle = data.title ?? "Unknown Title";
  // Spotify oEmbed title is just the track name (no artist embedded)
  const { title, artist } = parseTitleArtist(rawTitle);

  return {
    title,
    artist,
    duration_secs: 240,
    thumbnail: data.thumbnail_url,
    source: "spotify",
    source_id: trackId,
    source_url: sourceUrl,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts song metadata from a YouTube or Spotify URL using free oEmbed APIs.
 * No API keys required. Throws on unsupported URLs or network failures.
 */
export async function extractSongMetadata(url: string): Promise<SongMetadata> {
  const trimmed = url.trim();

  const youtubeId = parseYouTubeId(trimmed);
  if (youtubeId) {
    logger.debug({ url: trimmed, videoId: youtubeId }, "Fetching YouTube oEmbed");
    return fetchYouTubeMetadata(youtubeId, trimmed);
  }

  const spotifyId = parseSpotifyTrackId(trimmed);
  if (spotifyId) {
    logger.debug({ url: trimmed, trackId: spotifyId }, "Fetching Spotify oEmbed");
    return fetchSpotifyMetadata(spotifyId, trimmed);
  }

  throw new Error(
    "Unsupported URL. Please paste a YouTube (youtube.com/watch, youtu.be, youtube.com/shorts) or Spotify track URL (open.spotify.com/track/...)."
  );
}
