"use client";

import { useCallback, useMemo, useState } from "react";
import { continuarAssistindo, progressoPorSerie, recomendar, type MaratonaData } from "@/lib/maratona";
import type { Episode, Series } from "@/lib/types";
import { thumb } from "@/lib/youtube";
import { postJson, useAccount } from "./AccountProvider";
import { IconPlay } from "./Icons";
import PlayerModal from "./PlayerModal";

type Props = { series: Series[]; initial: MaratonaData; demo?: boolean };

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmtDia = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });

export default function MaratonaView({ series, initial, demo = false }: Props) {
  const acc = useAccount();
  const [data, setData] = useState<MaratonaData>(initial);
  const [open, setOpen] = useState<{ slug: string; youtubeId: string } | null>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [novaLista, setNovaLista] = useState("");
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);

  const bySlug = useMemo(() => new Map(series.map((s) => [s.slug, s])), [series]);
  const byEp = useMemo(() => new Map(series.flatMap((s) => s.episodios.map((e) => [e.youtubeId, { s, e }] as const))), [series]);

  // Assistidos vêm do contexto (atualizam ao marcar no player) quando disponível
  const assistidosArr = demo ? data.assistidos : (acc?.conta?.assistidos ?? data.assistidos);
  const assistidos = useMemo(() => new Set(assistidosArr), [assistidosArr]);
  const favoritos = demo ? data.favoritos : (acc?.conta?.favoritos ?? data.favoritos);

  const reload = useCallback(async () => {
    if (demo) return;
    const r = await fetch("/api/maratona", { cache: "no-store" });
    if (r.ok) setData(await r.json());
    acc?.refresh();
  }, [demo, acc]);

  const act = async (url: string, payload: unknown) => {
    if (demo) return;
    const r = await postJson(url, payload);
    setErro(r.ok ? null : String(r.data.erro ?? "Não foi possível salvar."));
    await reload();
  };

  const play = (slug: string, youtubeId?: string) => {
    if (demo) return;
    const s = bySlug.get(slug);
    if (!s) return;
    setOpen({ slug, youtubeId: youtubeId ?? s.episodios[0].youtubeId });
  };

  const continuar = continuarAssistindo(data.historico).filter((h) => byEp.has(h.youtube_id));
  const progresso = progressoPorSerie(series, assistidos);
  const recs = recomendar(series, { favoritos, historico: data.historico, assistidos: assistidosArr });
  const naoLidos = data.avisos.filter((a) => !a.lido);
  const temGeneros = series.some((s) => s.generos?.length);

  const historicoPorDia = data.historico.slice(0, 40).reduce<Record<string, typeof data.historico>>((acc2, h) => {
    const k = fmtDia(h.aberto_em);
    (acc2[k] ||= []).push(h);
    return acc2;
  }, {});

  const openSeries = open ? bySlug.get(open.slug) : null;
  const openEp = openSeries?.episodios.find((e) => e.youtubeId === open?.youtubeId);

  return (
    <div className={`maratona${demo ? " is-demo" : ""}`} {...(demo ? { inert: true, "aria-hidden": true } : {})}>
      <header className="maratona-head">
        <div>
          <p className="eyebrow">DoraLivre Premium</p>
          <h1>Minha maratona</h1>
        </div>
        <dl className="stats">
          <div>
            <dt>Em andamento</dt>
            <dd>{progresso.filter((p) => p.assistidos < p.disponiveis).length}</dd>
          </div>
          <div>
            <dt>Episódios vistos</dt>
            <dd>{assistidosArr.filter((id) => byEp.has(id)).length}</dd>
          </div>
          <div>
            <dt>Listas</dt>
            <dd>{data.listas.length}</dd>
          </div>
          <div>
            <dt>Avisos novos</dt>
            <dd>{naoLidos.length}</dd>
          </div>
        </dl>
      </header>

      {erro && (
        <p className="nudge nudge-error" role="alert">
          {erro}
        </p>
      )}

      {/* ---------- Avisos ---------- */}
      <section className="m-section" aria-labelledby="m-avisos">
        <div className="section-head">
          <h2 id="m-avisos">Avisos de novos episódios</h2>
          {naoLidos.length > 0 && (
            <button className="link-btn" onClick={() => act("/api/maratona/avisos", { ids: "todos" })}>
              Marcar todos como lidos
            </button>
          )}
        </div>
        {data.avisos.length ? (
          <ul className="avisos">
            {data.avisos.slice(0, 10).map((a) => {
              const hit = byEp.get(a.youtube_id);
              if (!hit) return null;
              return (
                <li key={a.id} className={a.lido ? "is-read" : ""}>
                  <span className="aviso-dot" aria-hidden />
                  <span className="aviso-text">
                    <strong>{hit.s.titulo}</strong> ganhou o episódio {hit.e.rotulo} no DoraLivre
                    <small>{fmtData(a.criado_em)}</small>
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      play(hit.s.slug, a.youtube_id);
                      if (!a.lido) act("/api/maratona/avisos", { ids: [a.id] });
                    }}
                  >
                    <IconPlay size={14} /> Assistir
                  </button>
                  {!a.lido && (
                    <button className="link-btn" onClick={() => act("/api/maratona/avisos", { ids: [a.id] })}>
                      Lido
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-inline">
            {data.seguindo.length
              ? "Nenhum episódio novo nas séries que você segue desde que começou a segui-las."
              : "Siga séries para ser avisado aqui quando novos episódios entrarem no DoraLivre."}
          </p>
        )}
      </section>

      {/* ---------- Continuar assistindo ---------- */}
      <section className="m-section" aria-labelledby="m-continuar">
        <div className="section-head">
          <h2 id="m-continuar">Continuar assistindo</h2>
          <span>Último episódio aberto de cada série</span>
        </div>
        {continuar.length ? (
          <ul className="continue-row">
            {continuar.slice(0, 8).map((h) => {
              const { s, e } = byEp.get(h.youtube_id)!;
              const vistos = s.episodios.filter((x) => assistidos.has(x.youtubeId)).length;
              return (
                <li key={s.slug} className="continue-card">
                  <button className="continue-thumb" onClick={() => play(s.slug, e.youtubeId)} aria-label={`Continuar ${s.titulo}, episódio ${e.rotulo}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(e.youtubeId, "mqdefault")} alt="" loading="lazy" />
                    <span className="continue-play" aria-hidden>
                      <IconPlay />
                    </span>
                  </button>
                  <div className="continue-info">
                    <strong>{s.titulo}</strong>
                    <span>
                      Ep. {e.rotulo} · aberto {fmtData(h.aberto_em)}
                    </span>
                    <Bar value={vistos} max={s.episodios.length} />
                    <button className="btn btn-primary btn-sm" onClick={() => play(s.slug, e.youtubeId)}>
                      <IconPlay size={14} /> Continuar ep. {e.rotulo}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-inline">Abra qualquer episódio e ele aparece aqui para você retomar.</p>
        )}
      </section>

      {/* ---------- Progresso ---------- */}
      <section className="m-section" aria-labelledby="m-progresso">
        <div className="section-head">
          <h2 id="m-progresso">Progresso por série</h2>
          <span>Episódios marcados ✓ sobre os disponíveis no DoraLivre</span>
        </div>
        {progresso.length ? (
          <ul className="progress-list">
            {progresso.map((p) => {
              const s = bySlug.get(p.slug)!;
              return (
                <li key={p.slug}>
                  <div className="progress-top">
                    <button className="link-strong" onClick={() => play(s.slug)}>
                      {s.titulo}
                    </button>
                    <span className="progress-num">
                      {p.assistidos}/{p.disponiveis} · {p.pct}%
                    </span>
                  </div>
                  <Bar value={p.assistidos} max={p.disponiveis} />
                  <p className="progress-note">
                    {p.assistidos === p.disponiveis ? "Você viu todos os episódios disponíveis. " : ""}
                    Catálogo parcial: o DoraLivre tem {p.disponiveis === 1 ? "o" : "os"} {p.recorte} desta série; o progresso considera
                    só esse recorte.
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-inline">Marque episódios com ✓ no player para acompanhar seu progresso.</p>
        )}
      </section>

      {/* ---------- Listas ---------- */}
      <section className="m-section" aria-labelledby="m-listas">
        <div className="section-head">
          <h2 id="m-listas">Minhas listas</h2>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!novaLista.trim()) return;
              act("/api/maratona/listas", { acao: "criar", nome: novaLista });
              setNovaLista("");
            }}
          >
            <input value={novaLista} onChange={(e) => setNovaLista(e.target.value)} placeholder="Nome da nova lista" maxLength={60} aria-label="Nome da nova lista" />
            <button className="btn btn-primary btn-sm" type="submit">
              Criar lista
            </button>
          </form>
        </div>
        {data.listas.length ? (
          <div className="lists">
            {data.listas.map((l, i) => (
              <article key={l.id} className="list-card" data-lista={l.nome}>
                <header className="list-card-head">
                  {renomeando?.id === l.id ? (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("/api/maratona/listas", { acao: "renomear", listaId: l.id, nome: renomeando.nome });
                        setRenomeando(null);
                      }}
                    >
                      <input value={renomeando.nome} onChange={(e) => setRenomeando({ id: l.id, nome: e.target.value })} maxLength={60} aria-label="Novo nome da lista" autoFocus />
                      <button className="btn btn-primary btn-sm" type="submit">
                        Salvar
                      </button>
                    </form>
                  ) : (
                    <h3>{l.nome}</h3>
                  )}
                  <div className="mini-actions">
                    <button className="icon-mini" disabled={i === 0} onClick={() => act("/api/maratona/listas", { acao: "subir", listaId: l.id })} aria-label={`Mover lista ${l.nome} para cima`}>
                      ↑
                    </button>
                    <button
                      className="icon-mini"
                      disabled={i === data.listas.length - 1}
                      onClick={() => act("/api/maratona/listas", { acao: "descer", listaId: l.id })}
                      aria-label={`Mover lista ${l.nome} para baixo`}
                    >
                      ↓
                    </button>
                    <button className="link-btn" onClick={() => setRenomeando({ id: l.id, nome: l.nome })}>
                      Renomear
                    </button>
                    <button
                      className="link-btn danger"
                      onClick={() => {
                        if (window.confirm(`Excluir a lista “${l.nome}”?`)) act("/api/maratona/listas", { acao: "excluir", listaId: l.id });
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </header>
                {l.itens.length ? (
                  <ol className="list-items">
                    {l.itens.map((slug, j) => {
                      const s = bySlug.get(slug);
                      if (!s) return null;
                      return (
                        <li key={slug}>
                          <button className="link-strong" onClick={() => play(slug)}>
                            {s.titulo}
                          </button>
                          <span className="list-item-meta">{s.episodios.length} eps.</span>
                          <span className="mini-actions">
                            <button className="icon-mini" disabled={j === 0} onClick={() => act("/api/maratona/listas", { acao: "item", itemAcao: "subir", listaId: l.id, slug })} aria-label={`Subir ${s.titulo}`}>
                              ↑
                            </button>
                            <button
                              className="icon-mini"
                              disabled={j === l.itens.length - 1}
                              onClick={() => act("/api/maratona/listas", { acao: "item", itemAcao: "descer", listaId: l.id, slug })}
                              aria-label={`Descer ${s.titulo}`}
                            >
                              ↓
                            </button>
                            <button className="icon-mini" onClick={() => act("/api/maratona/listas", { acao: "item", itemAcao: "remover", listaId: l.id, slug })} aria-label={`Remover ${s.titulo} da lista`}>
                              ✕
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="empty-inline">Lista vazia.</p>
                )}
                <label className="add-to-list">
                  <span className="sr-only">Adicionar série à lista {l.nome}</span>
                  <select
                    value=""
                    onChange={(e) => e.target.value && act("/api/maratona/listas", { acao: "item", itemAcao: "adicionar", listaId: l.id, slug: e.target.value })}
                  >
                    <option value="">＋ Adicionar série…</option>
                    {series
                      .filter((s) => !l.itens.includes(s.slug))
                      .map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.titulo}
                        </option>
                      ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-inline">Crie listas como “Para o fim de semana” e organize as séries na ordem que quiser.</p>
        )}
      </section>

      {/* ---------- Recomendações ---------- */}
      <section className="m-section" aria-labelledby="m-recs">
        <div className="section-head">
          <h2 id="m-recs">Recomendações para você</h2>
          <span>
            Com base nas suas favoritas{temGeneros ? " e nos gêneros" : ", no elenco e no canal"}, só com títulos do DoraLivre
          </span>
        </div>
        {recs.length ? (
          <ul className="recs">
            {recs.map((r) => {
              const s = bySlug.get(r.slug)!;
              return (
                <li key={r.slug} className="rec-card">
                  <button className="rec-thumb" onClick={() => play(s.slug)} aria-label={`Assistir ${s.titulo}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(s.episodios[0].youtubeId, "mqdefault")} alt="" loading="lazy" />
                  </button>
                  <strong>{s.titulo}</strong>
                  <span className="rec-why">{r.motivo}</span>
                  <span className="rec-meta">{s.episodios.length} eps. disponíveis</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-inline">Favorite séries (♡ no player) para receber recomendações.</p>
        )}
      </section>

      {/* ---------- Séries seguidas ---------- */}
      <section className="m-section" aria-labelledby="m-seguindo">
        <div className="section-head">
          <h2 id="m-seguindo">Séries seguidas</h2>
          <label className="add-to-list compact">
            <span className="sr-only">Seguir uma série</span>
            <select value="" onChange={(e) => e.target.value && act("/api/maratona/seguir", { slug: e.target.value, on: true })}>
              <option value="">＋ Seguir série…</option>
              {series
                .filter((s) => !data.seguindo.includes(s.slug))
                .map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.titulo}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {data.seguindo.length ? (
          <ul className="follow-chips">
            {data.seguindo.map((slug) => {
              const s = bySlug.get(slug);
              if (!s) return null;
              return (
                <li key={slug}>
                  <span>🔔 {s.titulo}</span>
                  <small>{s.episodios.length} eps. hoje</small>
                  <button className="icon-mini" onClick={() => act("/api/maratona/seguir", { slug, on: false })} aria-label={`Deixar de seguir ${s.titulo}`}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-inline">Siga séries para receber avisos quando novos episódios forem adicionados.</p>
        )}
      </section>

      {/* ---------- Histórico ---------- */}
      <section className="m-section" aria-labelledby="m-hist">
        <div className="section-head">
          <h2 id="m-hist">Histórico</h2>
          <span>{data.historico.length} episódios abertos</span>
        </div>
        {data.historico.length ? (
          <div className="history">
            {Object.entries(historicoPorDia).map(([dia, itens]) => (
              <div key={dia} className="history-day">
                <h3>{dia}</h3>
                <ul>
                  {itens.map((h, i) => {
                    const hit = byEp.get(h.youtube_id);
                    if (!hit) return null;
                    return (
                      <li key={h.youtube_id + h.aberto_em + i}>
                        <time>{new Date(h.aberto_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</time>
                        <span>
                          {hit.s.titulo} · ep. {hit.e.rotulo}
                          {assistidos.has(h.youtube_id) && <em className="seen"> ✓ assistido</em>}
                        </span>
                        <button className="link-btn" onClick={() => play(hit.s.slug, h.youtube_id)}>
                          Assistir de novo
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-inline">Seu histórico aparece aqui conforme você assiste.</p>
        )}
      </section>

      {openSeries && openEp && (
        <PlayerModal
          series={openSeries}
          episode={openEp}
          failed={failed}
          onFail={(id) => setFailed((f) => new Set(f).add(id))}
          onOk={(id) =>
            setFailed((f) => {
              const n = new Set(f);
              n.delete(id);
              return n;
            })
          }
          onSelect={(ep: Episode) => setOpen({ slug: openSeries.slug, youtubeId: ep.youtubeId })}
          onClose={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={`${value} de ${max} episódios`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
