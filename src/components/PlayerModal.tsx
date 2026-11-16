"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode, Series } from "@/lib/types";
import { loadYouTubeApi, thumb, YT_ERROR_TEXT, type YTPlayer } from "@/lib/youtube";
import { IconClose, IconExpand, IconNext, IconPrev, IconPlay } from "./Icons";

type Props = {
  series: Series;
  episode: Episode;
  failed: Set<string>;
  onFail: (youtubeId: string) => void;
  onOk: (youtubeId: string) => void;
  onSelect: (ep: Episode) => void;
  onClose: () => void;
};

type PlayerError = { code: number; youtubeId: string } | null;

export function epLabel(e: Episode) {
  return e.intervalo ? `Episódios ${e.rotulo}` : `Episódio ${e.rotulo}`;
}

export default function PlayerModal({ series, episode, failed, onFail, onOk, onSelect, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const currentIdRef = useRef(episode.youtubeId);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [error, setError] = useState<PlayerError>(null);
  const [loadingApi, setLoadingApi] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [isFs, setIsFs] = useState(false);

  const eps = series.episodios;
  const idx = eps.findIndex((e) => e.youtubeId === episode.youtubeId);
  const prev = idx > 0 ? eps[idx - 1] : null;
  const next = idx < eps.length - 1 ? eps[idx + 1] : null;

  /** Próximo episódio que ainda não falhou (procura à frente, depois para trás). */
  const findAlternative = useCallback(
    (fromId: string) => {
      const i = eps.findIndex((e) => e.youtubeId === fromId);
      const ahead = eps.slice(i + 1).find((e) => !failed.has(e.youtubeId) && e.youtubeId !== fromId);
      if (ahead) return ahead;
      return [...eps.slice(0, Math.max(i, 0))].reverse().find((e) => !failed.has(e.youtubeId) && e.youtubeId !== fromId) ?? null;
    },
    [eps, failed],
  );

  // Refs estáveis para callbacks do player (criado uma vez por janela)
  const handlers = useRef({ onFail, onOk, onSelect, autoNext, next: next as Episode | null });
  handlers.current = { onFail, onOk, onSelect, autoNext, next };

  // Cria o player oficial do YouTube uma única vez
  useEffect(() => {
    let cancelled = false;
    const host = document.createElement("div");
    mountRef.current?.appendChild(host);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        setLoadingApi(false);
        playerRef.current = new YT.Player(host, {
          videoId: currentIdRef.current,
          host: "https://www.youtube.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            hl: "pt-BR",
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              readyRef.current = true;
              // Se o usuário trocou de episódio antes do player ficar pronto
              const vid = e.target.getVideoData?.().video_id;
              if (vid && vid !== currentIdRef.current) e.target.loadVideoById(currentIdRef.current);
            },
            onStateChange: (e) => {
              if (e.data === 1) {
                setError(null);
                handlers.current.onOk(currentIdRef.current);
              }
              if (e.data === 0 && handlers.current.autoNext && handlers.current.next) {
                handlers.current.onSelect(handlers.current.next);
              }
            },
            onError: (e) => {
              // Atribui o erro ao vídeo que realmente falhou (evita marcar o episódio errado após uma troca rápida)
              const id = e.target.getVideoData?.().video_id || currentIdRef.current;
              stageRef.current?.setAttribute("data-yt-error", `${e.data}:${id}`);
              setError({ code: e.data, youtubeId: id });
              handlers.current.onFail(id);
            },
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingApi(false);
        setError({ code: -1, youtubeId: currentIdRef.current });
      });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignora */
      }
      playerRef.current = null;
      readyRef.current = false;
      host.remove();
    };
  }, []);

  // Troca de episódio: atualiza o vídeo dentro da mesma janela
  useEffect(() => {
    if (currentIdRef.current === episode.youtubeId) return;
    currentIdRef.current = episode.youtubeId;
    setError(null);
    if (playerRef.current && readyRef.current) playerRef.current.loadVideoById(episode.youtubeId);
  }, [episode.youtubeId]);

  // Mantém o episódio atual visível na lista
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [episode.youtubeId]);

  // Teclado, foco e rolagem da página
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !document.fullscreenElement) onClose();
    };
    const onFs = () => setIsFs(document.fullscreenElement === stageRef.current);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const toggleFullscreen = () => {
    const el = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  };

  const retry = () => {
    setError(null);
    if (playerRef.current && readyRef.current) playerRef.current.loadVideoById(episode.youtubeId);
    else window.location.reload();
  };

  const showError = error && error.youtubeId === episode.youtubeId;
  const alternative = showError ? findAlternative(episode.youtubeId) : null;
  const headingId = "player-title";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className="modal-bar">
          <div className="modal-bar-title">
            <span className="eyebrow">Assistindo</span>
            <strong>{series.titulo}</strong>
            <span className="modal-bar-ep">· {epLabel(episode)}</span>
          </div>
          <button ref={closeRef} className="icon-btn close-btn" onClick={onClose} aria-label="Fechar player">
            <IconClose />
          </button>
        </header>

        <div className="modal-body">
          <section className="player-col">
            <div className={`stage${showError ? " has-error" : ""}`} ref={stageRef}>
              <div className="stage-mount" ref={mountRef} />
              {loadingApi && !showError && (
                <div className="stage-loading" aria-hidden>
                  <span className="spinner" />
                </div>
              )}
              {showError && (
                <div className="stage-error" role="alert">
                  <p className="stage-error-title">Episódio indisponível no momento</p>
                  <p className="stage-error-text">
                    {error.code === -1
                      ? "Não foi possível carregar o player do YouTube. Verifique sua conexão."
                      : `Não conseguimos reproduzir ${epLabel(episode).toLowerCase()} aqui (${YT_ERROR_TEXT[error.code] ?? `código ${error.code}`}).`}{" "}
                    Escolha outro episódio na lista.
                  </p>
                  <div className="stage-error-actions">
                    {alternative && (
                      <button className="btn btn-primary" onClick={() => onSelect(alternative)}>
                        <IconPlay /> Assistir {epLabel(alternative).toLowerCase()}
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={retry}>
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="player-controls">
              <button className="btn btn-ghost btn-sm" disabled={!prev} onClick={() => prev && onSelect(prev)}>
                <IconPrev /> <span>Anterior</span>
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!next} onClick={() => next && onSelect(next)}>
                <span>Próximo</span> <IconNext />
              </button>
              <label className="toggle">
                <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
                <span>Próximo automático</span>
              </label>
              <button className="btn btn-ghost btn-sm push-right" onClick={toggleFullscreen}>
                <IconExpand /> <span>{isFs ? "Sair da tela cheia" : "Tela cheia"}</span>
              </button>
            </div>

            <div className="player-info">
              <h2 id={headingId} className="player-title">
                {series.titulo}
              </h2>
              <p className="meta-line">
                {series.tituloOriginal && <span>{series.tituloOriginal}</span>}
                {series.ano && <span>{series.ano}</span>}
                {typeof series.nota === "number" && <span>★ {series.nota.toFixed(1)}</span>}
                <span>
                  {eps.length} {eps.length === 1 ? "episódio disponível" : "episódios disponíveis"}
                </span>
                <span>Dublado · {series.canais.join(", ")}</span>
              </p>
              {series.generos && (
                <div className="chips">
                  {series.generos.map((g) => (
                    <span key={g} className="chip">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {series.sinopse && <p className="synopsis">{series.sinopse}</p>}
              <p className="fineprint">
                Vídeos do canal oficial no YouTube, reproduzidos pelo player oficial. A seleção inclui apenas os episódios
                listados aqui; a dublagem é informada pelo próprio canal.
              </p>
            </div>
          </section>

          <aside className="episodes-col" aria-label="Episódios">
            <div className="episodes-head">
              <h3>Episódios</h3>
              <span>{eps.length} disponíveis</span>
            </div>
            <ol className="episode-list" ref={listRef}>
              {eps.map((e) => {
                const active = e.youtubeId === episode.youtubeId;
                const bad = failed.has(e.youtubeId);
                return (
                  <li key={e.youtubeId}>
                    <button
                      className={`episode-item${active ? " is-active" : ""}${bad ? " is-failed" : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => onSelect(e)}
                    >
                      <span className="episode-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb(e.youtubeId, "mqdefault")} alt="" loading="lazy" />
                        {active && <span className="now-playing">{bad ? "Indisponível" : "Tocando"}</span>}
                      </span>
                      <span className="episode-text">
                        <span className="episode-num">{epLabel(e)}</span>
                        <span className="episode-sub">{bad ? "Indisponível no momento" : e.canal}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>

        <button className="mobile-close" onClick={onClose}>
          <IconClose /> Fechar e voltar ao catálogo
        </button>
      </div>
    </div>
  );
}
