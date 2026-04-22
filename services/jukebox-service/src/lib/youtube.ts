/**
 * Legacy YouTubeSong interface kept for compatibility with existing queue / player code.
 * Song search now operates against the tenant's pre-seeded Song catalog (song.repository.ts)
 * rather than live YouTube API queries.
 */
export interface YouTubeSong {
  song_id: string;
  song_title: string;
  song_artist: string;
  song_duration_secs: number;
  song_thumbnail: string;
  source: "youtube" | "spotify";
}
