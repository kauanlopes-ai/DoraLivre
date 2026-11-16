/* Carregador mínimo da API oficial do IFrame Player do YouTube. */

export type YTPlayer = {
  loadVideoById: (id: string) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  getPlayerState: () => number;
  getVideoData?: () => { video_id?: string };
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5; UNSTARTED: -1 };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(timeoutMs = 15000): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loading = null;
      reject(new Error("Tempo esgotado ao carregar a API do YouTube"));
    }, timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.clearTimeout(timer);
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        window.clearTimeout(timer);
        loading = null;
        s.remove();
        reject(new Error("Falha ao carregar a API do YouTube"));
      };
      document.head.appendChild(s);
    }
  });
  return loading;
}

/** Códigos de erro do player: 2 parâmetro inválido, 5 erro HTML5, 100 não encontrado/privado, 101/150 incorporação bloqueada (inclui restrição de região). */
export const YT_ERROR_TEXT: Record<number, string> = {
  2: "ID de vídeo inválido",
  5: "erro de reprodução no navegador",
  100: "vídeo removido ou privado",
  101: "o canal não permite reprodução incorporada ou há restrição de região",
  150: "o canal não permite reprodução incorporada ou há restrição de região",
};

export const thumb = (id: string, q: "hqdefault" | "mqdefault" | "maxresdefault" = "hqdefault") =>
  `https://i.ytimg.com/vi/${id}/${q}.jpg`;
