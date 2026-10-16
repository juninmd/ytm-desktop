import type { Album, Playlist, Track } from "../types";

/**
 * Mock catalogue. Invented artists and releases — no real catalogue data is
 * bundled, so the prototype carries no licensing surface. Swapping this module
 * for a `ytmusicapi`-backed client is the only change needed to go live.
 */

type TrackSeed = {
  slug: string;
  title: string;
  duration: number;
  plays: string;
};

type AlbumSeed = {
  id: string;
  title: string;
  artist: string;
  year: number;
  kind: Album["kind"];
  tracks: TrackSeed[];
};

const albumSeeds: AlbumSeed[] = [
  {
    id: "midnight-autobahn",
    title: "Midnight Autobahn",
    artist: "Neon Harvester",
    year: 2025,
    kind: "album",
    tracks: [
      { slug: "ignition", title: "Ignition Sequence", duration: 214, plays: "4,8 mi" },
      { slug: "chrome", title: "Chrome Rain", duration: 267, plays: "12 mi" },
      { slug: "autobahn", title: "Midnight Autobahn", duration: 341, plays: "21 mi" },
      { slug: "taillights", title: "Taillights Fading", duration: 198, plays: "2,1 mi" },
    ],
  },
  {
    id: "sal-e-vento",
    title: "Sal e Vento",
    artist: "Clara Bittencourt",
    year: 2024,
    kind: "album",
    tracks: [
      { slug: "mare-cheia", title: "Maré Cheia", duration: 232, plays: "8,9 mi" },
      { slug: "farol", title: "Farol Apagado", duration: 285, plays: "3,4 mi" },
      { slug: "sal", title: "Sal e Vento", duration: 251, plays: "15 mi" },
      { slug: "volta", title: "Quando a Maré Voltar", duration: 309, plays: "1,7 mi" },
    ],
  },
  {
    id: "low-orbit",
    title: "Low Orbit",
    artist: "Ghost Signal",
    year: 2026,
    kind: "album",
    tracks: [
      { slug: "telemetry", title: "Telemetry", duration: 176, plays: "1,2 mi" },
      { slug: "vacuum", title: "Soft Vacuum", duration: 388, plays: "740 mil" },
      { slug: "perihelion", title: "Perihelion", duration: 297, plays: "2,6 mi" },
      { slug: "reentry", title: "Re-entry Burn", duration: 254, plays: "980 mil" },
    ],
  },
  {
    id: "slow-weather",
    title: "Slow Weather",
    artist: "Paper Lantern",
    year: 2025,
    kind: "ep",
    tracks: [
      { slug: "tin-roof", title: "Tin Roof", duration: 203, plays: "6,3 mi" },
      { slug: "hemlock", title: "Hemlock & Ash", duration: 241, plays: "2,9 mi" },
      { slug: "field", title: "Open Field, Late Light", duration: 318, plays: "1,1 mi" },
    ],
  },
  {
    id: "voltagem",
    title: "Voltagem",
    artist: "Baile do Andarilho",
    year: 2026,
    kind: "album",
    tracks: [
      { slug: "corrente", title: "Corrente Alternada", duration: 189, plays: "11 mi" },
      { slug: "ressaca", title: "Ressaca Elétrica", duration: 226, plays: "5,5 mi" },
      { slug: "baixo", title: "Baixo Trovão", duration: 205, plays: "3,2 mi" },
      { slug: "curto", title: "Curto-Circuito", duration: 172, plays: "890 mil" },
    ],
  },
  {
    id: "blue-hour",
    title: "Blue Hour",
    artist: "Kaito Mori",
    year: 2023,
    kind: "album",
    tracks: [
      { slug: "lamplight", title: "Lamplight", duration: 164, plays: "19 mi" },
      { slug: "shinjuku", title: "Shinjuku 4:40", duration: 222, plays: "7,8 mi" },
      { slug: "rain-loop", title: "Rain Loop", duration: 190, plays: "26 mi" },
      { slug: "homeward", title: "Homeward, Quietly", duration: 236, plays: "4,4 mi" },
    ],
  },
  {
    id: "fusivel",
    title: "Fusível",
    artist: "Vermelho 27",
    year: 2026,
    kind: "single",
    tracks: [
      { slug: "fusivel", title: "Fusível", duration: 201, plays: "1,4 mi" },
      { slug: "estatica", title: "Estática", duration: 178, plays: "420 mil" },
    ],
  },
];

export const albums: Album[] = albumSeeds.map(({ tracks, ...album }) => ({
  ...album,
  trackIds: tracks.map((track) => `${album.id}:${track.slug}`),
}));

export const tracks: Track[] = albumSeeds.flatMap((album) =>
  album.tracks.map((track) => ({
    id: `${album.id}:${track.slug}`,
    title: track.title,
    artist: album.artist,
    album: album.title,
    albumId: album.id,
    duration: track.duration,
    year: album.year,
    plays: track.plays,
  })),
);

const byId = new Map(tracks.map((track) => [track.id, track]));
const albumById = new Map(albums.map((album) => [album.id, album]));

export function getTrack(id: string): Track | undefined {
  return byId.get(id);
}

/** Resolves ids to tracks, skipping any that no longer exist. */
export function resolveTracks(ids: string[]): Track[] {
  return ids.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
}

export function getAlbum(id: string): Album | undefined {
  return albumById.get(id);
}

export const playlists: Playlist[] = [
  {
    id: "mix-semanal",
    title: "Mix semanal",
    description: "Sua mistura de segunda-feira, atualizada toda semana.",
    trackIds: [
      "midnight-autobahn:chrome",
      "voltagem:corrente",
      "sal-e-vento:sal",
      "blue-hour:lamplight",
      "low-orbit:perihelion",
      "slow-weather:tin-roof",
    ],
  },
  {
    id: "rota-noturna",
    title: "Rota noturna",
    description: "Para dirigir devagar por avenidas vazias.",
    trackIds: [
      "midnight-autobahn:autobahn",
      "midnight-autobahn:taillights",
      "blue-hour:shinjuku",
      "low-orbit:telemetry",
      "fusivel:fusivel",
    ],
  },
  {
    id: "foco-profundo",
    title: "Foco profundo",
    description: "Instrumental, sem vocais, sem distração.",
    trackIds: [
      "low-orbit:vacuum",
      "low-orbit:reentry",
      "blue-hour:rain-loop",
      "slow-weather:field",
      "blue-hour:homeward",
    ],
  },
  {
    id: "curtidas",
    title: "Músicas curtidas",
    description: "Tudo que você marcou com o coração.",
    trackIds: [
      "sal-e-vento:mare-cheia",
      "voltagem:ressaca",
      "slow-weather:hemlock",
      "midnight-autobahn:ignition",
      "blue-hour:lamplight",
      "sal-e-vento:farol",
      "fusivel:estatica",
    ],
  },
];

export const getPlaylist = (id: string) => playlists.find((playlist) => playlist.id === id);

/** A unified shape for anything that can be opened and played as a whole. */
export type Collection = {
  id: string;
  kind: "album" | "playlist";
  format: "album" | "ep" | "single" | "playlist";
  title: string;
  subtitle: string;
  description?: string;
  year?: number;
  trackIds: string[];
};

export const collections: Collection[] = [
  ...albums.map((album) => ({
    id: album.id,
    kind: "album" as const,
    format: album.kind,
    title: album.title,
    subtitle: album.artist,
    year: album.year,
    trackIds: album.trackIds,
  })),
  ...playlists.map((playlist) => ({
    id: playlist.id,
    kind: "playlist" as const,
    format: "playlist" as const,
    title: playlist.title,
    subtitle: "Playlist",
    description: playlist.description,
    trackIds: playlist.trackIds,
  })),
];

const collectionById = new Map(collections.map((collection) => [collection.id, collection]));

export function getCollection(id: string): Collection | undefined {
  return collectionById.get(id);
}

/** Rows behind the "Quick picks" grid on Home. */
export const quickPicks: string[] = [
  "mix-semanal",
  "midnight-autobahn",
  "sal-e-vento",
  "blue-hour",
  "voltagem",
  "low-orbit",
];

export const shelves: { title: string; subtitle?: string; ids: string[] }[] = [
  {
    title: "Ouvir de novo",
    ids: ["sal-e-vento", "blue-hour", "rota-noturna", "voltagem", "foco-profundo", "low-orbit"],
  },
  {
    title: "Lançamentos para você",
    subtitle: "Baseado no que você ouviu",
    ids: ["low-orbit", "fusivel", "voltagem", "midnight-autobahn", "mix-semanal"],
  },
  {
    title: "Clima de agora",
    ids: ["curtidas", "slow-weather", "rota-noturna", "sal-e-vento", "blue-hour"],
  },
];
