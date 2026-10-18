import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setDataLocale } from "./music";

/**
 * A tiny, typed i18n layer.
 *
 * `pt` is the source of truth for the key set; `en` is typed against it, so a
 * missing translation is a compile error. Values may carry `{name}` placeholders
 * that `t` fills in.
 *
 * Switching the language also switches the *data* language: the catalogue is
 * served by YouTube Music, and `set_locale` tells the Rust client which `hl` to
 * send, so titles and shelf names come back in the chosen language too.
 */

export type Locale = "pt" | "en";

export const LANGUAGES: { id: Locale; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
];

const pt = {
  "nav.home": "Início",
  "nav.explore": "Explorar",
  "nav.library": "Biblioteca",
  "nav.downloads": "Baixados",
  "nav.badge": "protótipo",
  "nav.yourLibrary": "Sua biblioteca",
  "nav.searchLibrary": "Buscar na biblioteca",
  "nav.createPlaylist": "Criar playlist",
  "nav.signOut": "Sair da conta",
  "nav.connectHint": "Conecte o cookie em Biblioteca para ver suas playlists.",
  "nav.playlistRow": "Playlist · {count} faixas",
  "nav.albumRow": "{kind} · {artist}",
  "nav.liked": "Músicas curtidas",
  "nav.open": "Abrir {title}",
  "nav.play": "Tocar {title}",

  "top.back": "Voltar",
  "top.forward": "Avançar",
  "top.search": "Buscar no catálogo",
  "top.clearSearch": "Limpar busca",
  "top.showQueue": "Mostrar fila",
  "top.hideQueue": "Ocultar fila",
  "top.demo": "Modo demonstração",
  "top.placeholder": "Músicas, artistas, álbuns ou podcasts",

  "home.morning": "Bom dia",
  "home.afternoon": "Boa tarde",
  "home.evening": "Boa noite",
  "home.loading": "Carregando o catálogo…",
  "home.error": "Não foi possível carregar o catálogo",
  "home.showAll": "Mostrar tudo",
  "common.retry": "Tentar de novo",

  "library.title": "Sua biblioteca",
  "library.count": "{playlists} playlists · {albums} álbuns e singles",
  "library.filterAll": "Tudo",
  "library.filterPlaylists": "Playlists",
  "library.filterAlbums": "Álbuns",
  "library.empty": "Nada nesta categoria ainda.",

  "search.title": "Resultados para “{query}”",
  "search.artists": "Artistas",
  "search.collections": "Coleções",
  "search.tracks": "Faixas",
  "search.empty": "Nenhum resultado para “{query}”",
  "search.emptyHint": "Verifique a grafia ou tente outro termo.",
  "search.failed": "A busca falhou",
  "search.loadMore": "Carregar mais",
  "search.filterAll": "Tudo",
  "search.filterSongs": "Músicas",
  "search.filterAlbums": "Álbuns",
  "search.filterArtists": "Artistas",
  "search.filterPlaylists": "Playlists",
  "common.tracks": "{count} faixas",

  "collection.loadingFailed": "Não foi possível abrir esta coleção",
  "collection.loadingFailedHint": "Verifique a conexão e tente de novo.",
  "collection.tracksFailed": "Não foi possível carregar as faixas.",
  "collection.empty": "Esta coleção ainda não tem faixas.",
  "collection.play": "Tocar {title}",
  "collection.shuffle": "Embaralhar",
  "collection.like": "Curtir coleção",
  "collection.unlike": "Remover das curtidas",
  "collection.download": "Baixar coleção",
  "collection.downloading": "Baixando coleção",
  "collection.downloadFailed": "{count} faixa(s) não puderam ser baixadas.",

  "format.album": "Álbum",
  "format.ep": "EP",
  "format.single": "Single",
  "format.playlist": "Playlist",
  "format.artist": "Artista",

  "track.index": "#",
  "track.title": "Título",
  "track.album": "Álbum",
  "track.plays": "Reproduções",
  "track.duration": "Duração",
  "track.table": "Faixas",
  "track.play": "Tocar {title}",
  "track.like": "Curtir {title}",
  "track.unlike": "Remover {title} das curtidas",
  "track.download": "Baixar {title}",
  "track.downloaded": "{title} já está baixada",
  "track.empty": "Nada por aqui ainda.",
  "track.downloadFailed": "Não foi possível baixar {title}.",

  "player.nothing": "Nenhuma faixa selecionada",
  "player.nothingHint": "Escolha algo na sua biblioteca",
  "player.like": "Curtir",
  "player.unlike": "Remover das curtidas",
  "player.showLyrics": "Mostrar letra",
  "player.hideLyrics": "Ocultar letra",
  "player.showQueue": "Mostrar fila",
  "player.hideQueue": "Ocultar fila",
  "player.shuffle": "Embaralhar",
  "player.previous": "Faixa anterior",
  "player.pause": "Pausar",
  "player.play": "Tocar",
  "player.next": "Próxima faixa",
  "player.repeatOne": "Repetir: uma faixa",
  "player.repeatAll": "Repetir: tudo",
  "player.repeatOff": "Repetir: desligado",
  "player.position": "Posição da faixa",
  "player.volume": "Volume",
  "player.unmute": "Ativar som",
  "player.mute": "Silenciar",
  "player.engineReal": "áudio real",
  "player.engineSim": "simulado",
  "player.engineRealTitle": "Reproduzindo áudio real resolvido pelo yt-dlp",
  "player.engineSimTitle": "Transporte simulado: nenhum áudio real está tocando",
  "player.likeFailed": "Não foi possível salvar a curtida na conta.",

  "queue.title": "Fila de reprodução",
  "queue.close": "Fechar fila",
  "queue.autoplay": "Reprodução automática",
  "queue.autoplayOn": "Continua com o rádio quando a fila acaba",
  "queue.autoplayOff": "Para ao fim da fila",
  "queue.now": "Tocando agora",
  "queue.next": "A seguir",
  "queue.empty": "A fila está vazia.",
  "queue.nothingNext": "Nada na sequência. Ative o modo aleatório ou escolha outra coleção.",

  "lyrics.title": "Letra",
  "lyrics.close": "Fechar letra",
  "lyrics.empty": "Escolha uma faixa para ver a letra.",
  "lyrics.synced": "Sincronizada",
  "lyrics.plain": "Sem sincronia",
  "lyrics.source": "Letras via LRCLIB (lrclib.net) — artista, título e álbum são enviados para a busca.",

  "artist.topTracks": "{count} faixa(s) em destaque",
  "artist.empty": "Nenhuma música em destaque.",

  "downloads.title": "Baixados",
  "downloads.count": "{count} faixa(s) · {size} no disco",
  "downloads.empty": "Nada baixado ainda. Use o botão de download em uma faixa para ouvi-la sem internet.",
  "downloads.remove": "Remover {title} dos baixados",
  "downloads.removeFailed": "Não foi possível remover {title}.",

  "cookie.title": "Conectar a biblioteca do YouTube Music",
  "cookie.intro":
    "A busca e o catálogo já funcionam. Para ver as suas playlists, curtidas e álbuns salvos, a API privada do YouTube Music exige o Cookie do navegador — ela não aceita o token do login.",
  "cookie.browserHeading": "Ler direto do navegador",
  "cookie.browserHint":
    "Usa o yt-dlp para ler os cookies de uma sessão já autenticada. No Chrome/Edge, feche o navegador antes — ele trava o banco de cookies enquanto está aberto; o Firefox lê direto.",
  "cookie.readFromBrowser": "Ler do navegador",
  "cookie.manual": "Ou cole o cookie manualmente",
  "cookie.manualHint":
    "Copie o cabeçalho Cookie de qualquer requisição a music.youtube.com em uma aba autenticada.",
  "cookie.save": "Salvar cookie",
  "cookie.connected": "Conectado",
  "cookie.disconnect": "Desconectar",
  "cookie.footnote":
    "O valor fica no cofre do sistema operacional, nunca no localStorage. No Chrome/Edge, feche o navegador para a leitura automática; o Firefox funciona com ele aberto.",

  "signin.title": "Entrar no YTM Desktop",
  "signin.intro":
    "Conecte a conta do Google para carregar playlists, curtidas e histórico. Nenhuma senha é digitada neste app.",
  "signin.failed": "Não foi possível entrar",
  "signin.continue": "Continuar com o Google",
  "signin.or": "ou",
  "signin.demo": "Explorar em modo demonstração",
  "signin.scope": "Escopo solicitado:",
  "signin.storage": "O token fica no cofre do sistema operacional, nunca no localStorage",
  "signin.awaiting": "Aguardando autorização",
  "signin.confirm": "Confirme no navegador",
  "signin.confirmHint":
    "Abrimos o Google em uma aba. Digite o código abaixo para autorizar este dispositivo.",
  "signin.deviceCode": "Código do dispositivo",
  "signin.copy": "Copiar",
  "signin.copied": "Copiado",
  "signin.expires": "Expira em {time} · intervalo de consulta {interval}s",
  "signin.open": "Abrir {host}",
  "signin.cancel": "Cancelar",
  "signin.granted": "Conta conectada",
  "signin.grantedHint": "Carregando sua biblioteca…",
  "signin.hero": "Sua música, em um app que é seu.",
  "signin.heroIntro":
    "Player nativo construído com Tauri 2, React 19 e Tailwind 4. A mesma biblioteca do YouTube Music, sem aba do navegador.",
  "signin.feature1": "Biblioteca, playlists e curtidas carregadas da sua conta",
  "signin.feature2": "Login pelo Google com código de dispositivo — sem senha no app",
  "signin.feature3": "Toca em segundo plano com controles nativos do sistema",
  "signin.footer": "Binário de ~8 MB · sem Electron · WebView2 do sistema",
  "signin.simulated":
    "Pré-visualização no navegador: o fluxo de dispositivo está simulado. No app Tauri, as mesmas chamadas chegam ao backend Rust.",

  "app.loading": "Carregando o player",
  "app.noAudio": "Áudio real indisponível:",
  "app.noAudioBody":
    "o yt-dlp não foi encontrado, então o transporte está simulado (sem som). Instale-o com winget install yt-dlp.yt-dlp e reabra o app para tocar de verdade.",
  "app.playing": "Tocando {title}, de {artist}",
  "app.dismiss": "Fechar aviso",
  "app.language": "Idioma",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "nav.home": "Home",
  "nav.explore": "Explore",
  "nav.library": "Library",
  "nav.downloads": "Downloads",
  "nav.badge": "prototype",
  "nav.yourLibrary": "Your library",
  "nav.searchLibrary": "Search your library",
  "nav.createPlaylist": "Create playlist",
  "nav.signOut": "Sign out",
  "nav.connectHint": "Connect the cookie in Library to see your playlists.",
  "nav.playlistRow": "Playlist · {count} tracks",
  "nav.albumRow": "{kind} · {artist}",
  "nav.liked": "Liked music",
  "nav.open": "Open {title}",
  "nav.play": "Play {title}",

  "top.back": "Back",
  "top.forward": "Forward",
  "top.search": "Search the catalogue",
  "top.clearSearch": "Clear search",
  "top.showQueue": "Show queue",
  "top.hideQueue": "Hide queue",
  "top.demo": "Demo mode",
  "top.placeholder": "Songs, artists, albums or podcasts",

  "home.morning": "Good morning",
  "home.afternoon": "Good afternoon",
  "home.evening": "Good evening",
  "home.loading": "Loading the catalogue…",
  "home.error": "Could not load the catalogue",
  "home.showAll": "Show all",
  "common.retry": "Try again",

  "library.title": "Your library",
  "library.count": "{playlists} playlists · {albums} albums and singles",
  "library.filterAll": "All",
  "library.filterPlaylists": "Playlists",
  "library.filterAlbums": "Albums",
  "library.empty": "Nothing in this category yet.",

  "search.title": "Results for “{query}”",
  "search.artists": "Artists",
  "search.collections": "Collections",
  "search.tracks": "Tracks",
  "search.empty": "No results for “{query}”",
  "search.emptyHint": "Check the spelling or try another term.",
  "search.failed": "The search failed",
  "search.loadMore": "Load more",
  "search.filterAll": "All",
  "search.filterSongs": "Songs",
  "search.filterAlbums": "Albums",
  "search.filterArtists": "Artists",
  "search.filterPlaylists": "Playlists",
  "common.tracks": "{count} tracks",

  "collection.loadingFailed": "Could not open this collection",
  "collection.loadingFailedHint": "Check the connection and try again.",
  "collection.tracksFailed": "Could not load the tracks.",
  "collection.empty": "This collection has no tracks yet.",
  "collection.play": "Play {title}",
  "collection.shuffle": "Shuffle",
  "collection.like": "Like collection",
  "collection.unlike": "Remove from liked",
  "collection.download": "Download collection",
  "collection.downloading": "Downloading collection",
  "collection.downloadFailed": "{count} track(s) could not be downloaded.",

  "format.album": "Album",
  "format.ep": "EP",
  "format.single": "Single",
  "format.playlist": "Playlist",
  "format.artist": "Artist",

  "track.index": "#",
  "track.title": "Title",
  "track.album": "Album",
  "track.plays": "Plays",
  "track.duration": "Duration",
  "track.table": "Tracks",
  "track.play": "Play {title}",
  "track.like": "Like {title}",
  "track.unlike": "Remove {title} from liked",
  "track.download": "Download {title}",
  "track.downloaded": "{title} is already downloaded",
  "track.empty": "Nothing here yet.",
  "track.downloadFailed": "Could not download {title}.",

  "player.nothing": "No track selected",
  "player.nothingHint": "Pick something from your library",
  "player.like": "Like",
  "player.unlike": "Remove from liked",
  "player.showLyrics": "Show lyrics",
  "player.hideLyrics": "Hide lyrics",
  "player.showQueue": "Show queue",
  "player.hideQueue": "Hide queue",
  "player.shuffle": "Shuffle",
  "player.previous": "Previous track",
  "player.pause": "Pause",
  "player.play": "Play",
  "player.next": "Next track",
  "player.repeatOne": "Repeat: one track",
  "player.repeatAll": "Repeat: all",
  "player.repeatOff": "Repeat: off",
  "player.position": "Track position",
  "player.volume": "Volume",
  "player.unmute": "Unmute",
  "player.mute": "Mute",
  "player.engineReal": "real audio",
  "player.engineSim": "simulated",
  "player.engineRealTitle": "Playing real audio resolved by yt-dlp",
  "player.engineSimTitle": "Simulated transport: no real audio is playing",
  "player.likeFailed": "Could not save the like to your account.",

  "queue.title": "Play queue",
  "queue.close": "Close queue",
  "queue.autoplay": "Autoplay",
  "queue.autoplayOn": "Continues with the radio when the queue ends",
  "queue.autoplayOff": "Stops at the end of the queue",
  "queue.now": "Now playing",
  "queue.next": "Up next",
  "queue.empty": "The queue is empty.",
  "queue.nothingNext": "Nothing queued. Turn on shuffle or pick another collection.",

  "lyrics.title": "Lyrics",
  "lyrics.close": "Close lyrics",
  "lyrics.empty": "Pick a track to see its lyrics.",
  "lyrics.synced": "Synced",
  "lyrics.plain": "Not synced",
  "lyrics.source": "Lyrics via LRCLIB (lrclib.net) — the artist, title and album are sent for the lookup.",

  "artist.topTracks": "{count} featured track(s)",
  "artist.empty": "No featured songs.",

  "downloads.title": "Downloads",
  "downloads.count": "{count} track(s) · {size} on disk",
  "downloads.empty": "Nothing downloaded yet. Use the download button on a track to listen without the internet.",
  "downloads.remove": "Remove {title} from downloads",
  "downloads.removeFailed": "Could not remove {title}.",

  "cookie.title": "Connect the YouTube Music library",
  "cookie.intro":
    "Search and the catalogue already work. To see your playlists, likes and saved albums, the private YouTube Music API needs the browser Cookie — it does not accept the sign-in token.",
  "cookie.browserHeading": "Read straight from the browser",
  "cookie.browserHint":
    "Uses yt-dlp to read the cookies of a signed-in session. On Chrome/Edge, close the browser first — it locks the cookie database while open; Firefox reads directly.",
  "cookie.readFromBrowser": "Read from browser",
  "cookie.manual": "Or paste the cookie manually",
  "cookie.manualHint":
    "Copy the Cookie header from any request to music.youtube.com in a signed-in tab.",
  "cookie.save": "Save cookie",
  "cookie.connected": "Connected",
  "cookie.disconnect": "Disconnect",
  "cookie.footnote":
    "The value lives in the OS credential vault, never in localStorage. On Chrome/Edge, close the browser for the automatic read; Firefox works while open.",

  "signin.title": "Sign in to YTM Desktop",
  "signin.intro":
    "Connect your Google account to load playlists, likes and history. No password is typed into this app.",
  "signin.failed": "Could not sign in",
  "signin.continue": "Continue with Google",
  "signin.or": "or",
  "signin.demo": "Explore in demo mode",
  "signin.scope": "Requested scope:",
  "signin.storage": "The token lives in the OS credential vault, never in localStorage",
  "signin.awaiting": "Waiting for authorisation",
  "signin.confirm": "Confirm in the browser",
  "signin.confirmHint":
    "We opened Google in a tab. Type the code below to authorise this device.",
  "signin.deviceCode": "Device code",
  "signin.copy": "Copy",
  "signin.copied": "Copied",
  "signin.expires": "Expires in {time} · poll interval {interval}s",
  "signin.open": "Open {host}",
  "signin.cancel": "Cancel",
  "signin.granted": "Account connected",
  "signin.grantedHint": "Loading your library…",
  "signin.hero": "Your music, in an app that is yours.",
  "signin.heroIntro":
    "A native player built with Tauri 2, React 19 and Tailwind 4. The same YouTube Music library, without a browser tab.",
  "signin.feature1": "Library, playlists and likes loaded from your account",
  "signin.feature2": "Google sign-in with a device code — no password in the app",
  "signin.feature3": "Background playback with native system controls",
  "signin.footer": "~8 MB binary · no Electron · the system WebView2",
  "signin.simulated":
    "Browser preview: the device flow is simulated. In the Tauri app the same calls reach the Rust backend.",

  "app.loading": "Loading the player",
  "app.noAudio": "Real audio unavailable:",
  "app.noAudioBody":
    "yt-dlp was not found, so the transport is simulated (no sound). Install it with winget install yt-dlp.yt-dlp and reopen the app to play for real.",
  "app.playing": "Playing {title}, by {artist}",
  "app.dismiss": "Dismiss notice",
  "app.language": "Language",
};

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { pt, en };

const STORAGE_KEY = "ytm-desktop:locale";

export type I18nApi = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nApi | null>(null);

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") return stored;
  } catch {
    // Private mode: fall through to the default.
  }
  return "pt";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preferences are a nicety, never a failure.
    }
  }, []);

  // The catalogue language follows the interface language.
  useEffect(() => {
    void setDataLocale(locale).catch(() => {});
  }, [locale]);

  const api = useMemo<I18nApi>(() => {
    const dictionary = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        const template = dictionary[key] ?? key;
        if (!vars) return template;
        return template.replace(/\{(\w+)\}/g, (match, name: string) =>
          name in vars ? String(vars[name]) : match,
        );
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
