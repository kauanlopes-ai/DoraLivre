"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog, Episode, Series } from "@/lib/types";
import { thumb } from "@/lib/youtube";
import PosterCard, { countLabel } from "./PosterCard";
import PlayerModal from "./PlayerModal";
import { IconList, IconNext, IconPlay, IconPrev, IconSearch, Logo } from "./Icons";

type Open = { slug: string; youtubeId: string } | null;
const PROGRESS_KEY = "lua:progresso";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function readProgress(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function Row({ title, subtitle, items, onOpen }: { title: string; subtitle?: string; items: Series[]; onOpen: (s: Series) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
  if (!items.length) return null;
  return (
    <section className="row">
      <div className="row-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="row-arrows">
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label={`Rolar ${title} para a esquerda`}>
            <IconPrev />
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label={`Rolar ${title} para a direita`}>
            <IconNext />
          </button>
        </div>
      </div>
      <div className="row-track" ref={ref}>
        {items.map((s) => (
          <PosterCard key={s.slug} series={s} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function Home({ catalog }: { catalog: Catalog }) {
  const { series } = catalog;
  const bySlug = useMemo(() => new Map(series.map((s) => [s.slug, s])), [series]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<Record<string, string>>({});
  const catalogRef = useRef<HTMLElement>(null);

  const featured = series.find((s) => s.destaque) ?? series[0];
  const genres = useMemo(() => [...new Set(series.flatMap((s) => s.generos ?? []))].sort(), [series]);
  const channels = useMemo(() => [...new Set(series.flatMap((s) => s.canais))].sort(), [series]);
  const totalEps = series.reduce((n, s) => n + s.episodios.length, 0);

  // ---------- Abrir / trocar / fechar (sempre dentro do site) ----------
  const urlFor = (slug: string, ep: Episode) => `?assistir=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep.numero)}`;

  const openSeries = useCallback(
    (s: Series, ep?: Episode) => {
      const saved = s.episodios.find((e) => e.youtubeId === readProgress()[s.slug]);
      const target = ep ?? saved ?? s.episodios[0];
      setOpen({ slug: s.slug, youtubeId: target.youtubeId });
      window.history.pushState({ lua: true }, "", urlFor(s.slug, target));
    },
    [],
  );

  const openRef = useRef<Open>(null);
  openRef.current = open;
  const selectEpisode = useCallback((ep: Episode) => {
    const o = openRef.current;
    if (!o) return;
    window.history.replaceState(window.history.state, "", urlFor(o.slug, ep));
    setOpen({ ...o, youtubeId: ep.youtubeId });
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    if (window.history.state?.lua) window.history.back();
    else window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const markFailed = useCallback((id: string) => setFailed((f) => (f.has(id) ? f : new Set(f).add(id))), []);
  const markOk = useCallback(
    (id: string) =>
      setFailed((f) => {
        if (!f.has(id)) return f;
        const n = new Set(f);
        n.delete(id);
        return n;
      }),
    [],
  );

  // Lê ?assistir= na carga e responde ao botão "voltar"
  useEffect(() => {
    setProgress(readProgress());
    const sync = () => {
      const p = new URLSearchParams(window.location.search);
      const s = bySlug.get(p.get("assistir") ?? "");
      if (!s) return setOpen(null);
      const ep = s.episodios.find((e) => e.numero === p.get("ep")) ?? s.episodios[0];
      setOpen({ slug: s.slug, youtubeId: ep.youtubeId });
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [bySlug]);

  // Guarda o último episódio aberto por série (só neste navegador)
  useEffect(() => {
    if (!open) return;
    setProgress((p) => {
      const nextP = { ...p, [open.slug]: open.youtubeId };
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextP));
      } catch {
        /* armazenamento indisponível */
      }
      return nextP;
    });
  }, [open]);

  // ---------- Busca e filtros ----------
  const q = norm(query.trim());
  const filtered = series.filter(
    (s) =>
      (!q || norm(s.titulo).includes(q) || (s.tituloOriginal && norm(s.tituloOriginal).includes(q))) &&
      (!genre || s.generos?.includes(genre)) &&
      (!channel || s.canais.includes(channel)),
  );
  const searching = q.length > 0;

  const onSearch = (v: string) => {
    setQuery(v);
    if (v && !query) requestAnimationFrame(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // ---------- Fileiras ----------
  const continueRow = series.filter((s) => progress[s.slug]);
  const marathon = series.filter((s) => s.episodios.length >= 5);
  const shortOnes = series.filter((s) => s.episodios.length <= 2);
  const byChannel = channels
    .map((c) => ({ c, items: series.filter((s) => s.canais.includes(c)) }))
    .filter((g) => g.items.length >= 3);
  const smallChannels = channels.filter((c) => !byChannel.some((g) => g.c === c));
  const otherChannelItems = series.filter((s) => s.canais.some((c) => smallChannels.includes(c)));

  const openSeriesObj = open ? bySlug.get(open.slug) : null;
  const openEp = openSeriesObj?.episodios.find((e) => e.youtubeId === open?.youtubeId) ?? null;
  const featuredResume = featured.episodios.find((e) => e.youtubeId === progress[featured.slug]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#inicio" className="brand">
            <Logo />
          </a>
          <nav className="topnav" aria-label="Principal">
            <a href="#inicio">Início</a>
            <a href="#maratona">Maratona</a>
            <a href="#catalogo">Catálogo</a>
          </nav>
          <label className="search">
            <IconSearch size={16} />
            <input
              type="search"
              placeholder="Buscar dorama…"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              aria-label="Buscar dorama por título"
            />
          </label>
        </div>
      </header>

      <main id="inicio">
        {!searching && (
          <section className="hero">
            <div className="hero-bg" aria-hidden>
              {/* Miniatura oficial do episódio 1 no YouTube */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb(featured.episodios[0].youtubeId, "maxresdefault")}
                alt=""
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.fallback) {
                    img.dataset.fallback = "1";
                    img.src = thumb(featured.episodios[0].youtubeId, "hqdefault");
                  }
                }}
              />
            </div>
            <div className="hero-content">
              <span className="pill">Em destaque · Dublado em português</span>
              <h1 className="hero-title">{featured.titulo}</h1>
              {featured.tituloOriginal && <p className="hero-orig">{featured.tituloOriginal}</p>}
              <p className="meta-line">
                {typeof featured.nota === "number" && <span>★ {featured.nota.toFixed(1)}</span>}
                {featured.ano && <span>{featured.ano}</span>}
                <span>{countLabel(featured.episodios.length)}</span>
                {featured.generos?.length ? <span>{featured.generos.join(" · ")}</span> : null}
                <span>{featured.canais.join(", ")}</span>
              </p>
              {featured.sinopse && <p className="hero-synopsis">{featured.sinopse}</p>}
              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" onClick={() => openSeries(featured)}>
                  <IconPlay /> {featuredResume ? `Continuar · Ep. ${featuredResume.rotulo}` : "Assistir agora"}
                </button>
                <a className="btn btn-ghost btn-lg" href="#catalogo">
                  <IconList /> Ver catálogo
                </a>
              </div>
              <p className="hero-note">
                {series.length} séries · {totalEps} episódios dublados de canais oficiais · reprodução aqui mesmo, sem
                cadastro
              </p>
            </div>
          </section>
        )}

        <div className={`content${searching ? " is-searching" : ""}`}>
          {!searching && (
            <>
              <Row title="Continuar assistindo" items={continueRow} onOpen={openSeries} />
              <div id="maratona">
                <Row
                  title="Para maratonar"
                  subtitle="Séries com 5 episódios disponíveis aqui"
                  items={marathon}
                  onOpen={openSeries}
                />
              </div>
              {byChannel.map((g) => (
                <Row key={g.c} title={`Do canal ${g.c}`} subtitle="Dublagem informada pelo canal oficial" items={g.items} onOpen={openSeries} />
              ))}
              <Row
                title={`Dos canais ${smallChannels.join(" e ")}`}
                subtitle="Dublagem informada pelos canais oficiais"
                items={otherChannelItems}
                onOpen={openSeries}
              />
              <Row title="Para experimentar" subtitle="Primeiros episódios para conhecer a história" items={shortOnes} onOpen={openSeries} />
            </>
          )}

          <section className="catalog" id="catalogo" ref={catalogRef}>
            <div className="catalog-head">
              <div>
                <h2>{searching ? `Resultados para “${query.trim()}”` : "Catálogo completo"}</h2>
                <p>
                  {filtered.length} de {series.length} séries · a contagem mostra os episódios disponíveis aqui, não o
                  total da série
                </p>
              </div>
              <label className="search search-inline">
                <IconSearch size={16} />
                <input
                  type="search"
                  placeholder="Buscar por título"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar no catálogo"
                />
              </label>
            </div>

            <div className="filters" role="group" aria-label="Filtros">
              {genres.length > 0 && (
                <div className="filter-group">
                  <span className="filter-label">Gênero</span>
                  <button className={`chip-btn${!genre ? " is-on" : ""}`} onClick={() => setGenre(null)}>
                    Todos
                  </button>
                  {genres.map((g) => (
                    <button key={g} className={`chip-btn${genre === g ? " is-on" : ""}`} onClick={() => setGenre(genre === g ? null : g)}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <div className="filter-group">
                <span className="filter-label">Canal</span>
                <button className={`chip-btn${!channel ? " is-on" : ""}`} onClick={() => setChannel(null)}>
                  Todos
                </button>
                {channels.map((c) => (
                  <button key={c} className={`chip-btn${channel === c ? " is-on" : ""}`} onClick={() => setChannel(channel === c ? null : c)}>
                    {c.replace(" Portuguese", "")}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length ? (
              <div className="grid">
                {filtered.map((s) => (
                  <PosterCard key={s.slug} series={s} onOpen={openSeries} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <p>Nenhum dorama encontrado.</p>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setQuery("");
                    setGenre(null);
                    setChannel(null);
                  }}
                >
                  Limpar busca
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="footer">
        <Logo />
        <p>
          Os vídeos são exibidos pelo player oficial do YouTube, a partir dos canais oficiais das plataformas. A
          disponibilidade pode variar por região. Catálogo atualizado em{" "}
          {new Date(catalog.atualizadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
        </p>
      </footer>

      {openSeriesObj && openEp && (
        <PlayerModal
          series={openSeriesObj}
          episode={openEp}
          failed={failed}
          onFail={markFailed}
          onOk={markOk}
          onSelect={selectEpisode}
          onClose={close}
        />
      )}
    </>
  );
}
