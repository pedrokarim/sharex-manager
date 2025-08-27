export interface AnimeResult {
  anilist: number;
  filename: string;
  episode: number;
  from: number;
  to: number;
  similarity: number;
  video: string;
  image: string;
}

export interface TraceMoeResponse {
  frameCount: number;
  error: string;
  result: AnimeResult[];
}

export interface AnilistTitle {
  native: string;
  romaji: string;
  english: string;
}

export interface AnilistMedia {
  id: number;
  title: AnilistTitle;
  coverImage: {
    large: string;
  };
  season: string;
  seasonYear: number;
  episodes: number;
  duration: number;
  genres: string[];
  averageScore: number;
  description: string;
}

export interface EnrichedAnimeResult extends AnimeResult {
  anilistInfo?: AnilistMedia;
}
