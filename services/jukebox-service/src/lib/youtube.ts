export interface YouTubeSong {
  song_id: string;
  song_title: string;
  song_artist: string;
  song_duration_secs: number;
  song_thumbnail: string;
  source: "youtube";
}

const MOCK_SONGS: YouTubeSong[] = [
  {
    song_id: "JRfuAukYTKg",
    song_title: "Kesariya",
    song_artist: "Arijit Singh",
    song_duration_secs: 285,
    song_thumbnail: `https://img.youtube.com/vi/JRfuAukYTKg/mqdefault.jpg`,
    source: "youtube",
  },
  {
    song_id: "JNBNO_oPJo4",
    song_title: "Tum Hi Ho",
    song_artist: "Arijit Singh",
    song_duration_secs: 262,
    song_thumbnail: `https://img.youtube.com/vi/JNBNO_oPJo4/mqdefault.jpg`,
    source: "youtube",
  },
  {
    song_id: "CvFH_6DNRCY",
    song_title: "Cheap Thrills",
    song_artist: "Sia",
    song_duration_secs: 211,
    song_thumbnail: `https://img.youtube.com/vi/CvFH_6DNRCY/mqdefault.jpg`,
    source: "youtube",
  },
  {
    song_id: "7wtfhZwyrcc",
    song_title: "Believer",
    song_artist: "Imagine Dragons",
    song_duration_secs: 204,
    song_thumbnail: `https://img.youtube.com/vi/7wtfhZwyrcc/mqdefault.jpg`,
    source: "youtube",
  },
  {
    song_id: "09R8_2nJtjg",
    song_title: "Sugar",
    song_artist: "Maroon 5",
    song_duration_secs: 235,
    song_thumbnail: `https://img.youtube.com/vi/09R8_2nJtjg/mqdefault.jpg`,
    source: "youtube",
  },
];

export async function searchYouTube(query: string): Promise<YouTubeSong[]> {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (!apiKey) {
    // Dev mode — filter mock songs by query
    const q = query.toLowerCase();
    const filtered = MOCK_SONGS.filter(
      (s) =>
        s.song_title.toLowerCase().includes(q) ||
        s.song_artist.toLowerCase().includes(q)
    );
    return filtered.length > 0 ? filtered : MOCK_SONGS;
  }

  try {
    const params = new URLSearchParams({
      q: query,
      type: "video",
      videoCategoryId: "10",
      part: "snippet",
      maxResults: "10",
      key: apiKey,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );
    const data = (await res.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          thumbnails: { medium: { url: string } };
        };
      }>;
    };
    if (!data.items) return MOCK_SONGS;

    return data.items.map((item) => ({
      song_id: item.id.videoId,
      song_title: item.snippet.title,
      song_artist: item.snippet.channelTitle,
      song_duration_secs: 240, // YouTube search doesn't return duration — would need contentDetails
      song_thumbnail: item.snippet.thumbnails.medium.url,
      source: "youtube" as const,
    }));
  } catch {
    return MOCK_SONGS;
  }
}
