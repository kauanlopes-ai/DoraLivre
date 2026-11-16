"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { brl, PRODUTOS } from "@/lib/products";
import type { Episode, Series } from "@/lib/types";
import { useAccount } from "./AccountProvider";

type Nudge = { need: "basico" | "premium"; acao: string } | { erro: string } | { ok: string };

const NUDGE_EVENT = "dl-nudge";
const emit = (n: Nudge) => window.dispatchEvent(new CustomEvent<Nudge>(NUDGE_EVENT, { detail: n }));

function voltaAtual() {
  return encodeURIComponent(window.location.pathname + window.location.search);
}

/** Favoritar, seguir e listas — dentro do player. Valores e acesso são validados no servidor. */
export default function SeriesActions({ series }: { series: Series }) {
  const acc = useAccount();
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [novaLista, setNovaLista] = useState("");

  useEffect(() => {
    const on = (e: Event) => setNudge((e as CustomEvent<Nudge>).detail);
    window.addEventListener(NUDGE_EVENT, on);
    return () => window.removeEventListener(NUDGE_EVENT, on);
  }, []);
  useEffect(() => {
    setNudge(null);
    setListOpen(false);
  }, [series.slug]);

  if (!acc?.info?.contasAtivas) return null;
  const { conta, plano } = acc;
  const fav = conta?.favoritos.includes(series.slug) ?? false;
  const seg = conta?.seguindo.includes(series.slug) ?? false;

  const run = async (need: "basico" | "premium", acao: string, fn: () => Promise<string | null>) => {
    const ok = need === "basico" ? plano !== "nenhum" : plano === "premium";
    if (!conta || !ok) return setNudge({ need, acao });
    const err = await fn();
    setNudge(err ? { erro: err } : null);
  };

  const addToList = async (listaId: string) => {
    const err = await acc.adicionarALista(listaId, series.slug);
    const nome = conta?.listas.find((l) => l.id === listaId)?.nome;
    setNudge(err ? { erro: err } : { ok: `Adicionada à lista “${nome}”.` });
    setListOpen(false);
  };

  const createAndAdd = async () => {
    if (!novaLista.trim()) return;
    const r = await acc.criarLista(novaLista.trim());
    if (typeof r === "string") return setNudge({ erro: r });
    setNovaLista("");
    await addToList(r.id);
  };

  return (
    <div className="series-actions">
      <div className="series-actions-row">
        <button
          className={`pill-btn${fav ? " is-on" : ""}`}
          aria-pressed={fav}
          onClick={() => run("basico", "salvar favoritos", () => acc.toggleFavorito(series.slug))}
        >
          <span aria-hidden>{fav ? "♥" : "♡"}</span> {fav ? "Favorita" : "Favoritar"}
        </button>
        <button
          className={`pill-btn${seg ? " is-on" : ""}`}
          aria-pressed={seg}
          onClick={() => run("premium", "seguir séries e receber avisos de novos episódios", () => acc.toggleSeguir(series.slug))}
        >
          <span aria-hidden>{seg ? "🔔" : "🔕"}</span> {seg ? "Seguindo" : "Seguir"}
          {plano !== "premium" && <span className="lock-tag">Premium</span>}
        </button>
        <div className="list-picker">
          <button
            className="pill-btn"
            aria-expanded={listOpen}
            onClick={() => (plano === "premium" && conta ? setListOpen((o) => !o) : setNudge({ need: "premium", acao: "criar listas personalizadas" }))}
          >
            <span aria-hidden>＋</span> Lista
            {plano !== "premium" && <span className="lock-tag">Premium</span>}
          </button>
          {listOpen && conta && (
            <div className="list-menu" role="menu">
              {conta.listas.length === 0 && <p className="list-menu-empty">Você ainda não tem listas.</p>}
              {conta.listas.map((l) => (
                <button key={l.id} role="menuitem" onClick={() => addToList(l.id)}>
                  {l.nome}
                </button>
              ))}
              <form
                className="list-menu-new"
                onSubmit={(e) => {
                  e.preventDefault();
                  createAndAdd();
                }}
              >
                <input value={novaLista} onChange={(e) => setNovaLista(e.target.value)} placeholder="Nova lista" maxLength={60} aria-label="Nome da nova lista" />
                <button type="submit" className="btn btn-primary btn-sm">
                  Criar
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      {nudge && <NudgeBox nudge={nudge} />}
    </div>
  );
}

function NudgeBox({ nudge }: { nudge: Nudge }) {
  const acc = useAccount();
  if ("erro" in nudge) return <p className="nudge nudge-error" role="alert">{nudge.erro}</p>;
  if ("ok" in nudge) return <p className="nudge nudge-ok" role="status">{nudge.ok}</p>;
  const conta = acc?.conta;
  const pend = conta?.pagamentoEmConfirmacao;
  if (!conta)
    return (
      <p className="nudge" role="status">
        Entre na sua conta para {nudge.acao}. Assistir continua grátis.{" "}
        <Link href={`/entrar?volta=${voltaAtual()}`}>Entrar</Link> · <Link href="/planos">Ver planos</Link>
      </p>
    );
  if (pend)
    return (
      <p className="nudge" role="status">
        Seu pagamento está em confirmação. O recurso será liberado assim que ele for aprovado. <Link href="/conta">Ver status</Link>
      </p>
    );
  if (nudge.need === "premium" && conta.plano === "basico")
    return (
      <p className="nudge" role="status">
        Para {nudge.acao}, faça o upgrade para o Premium por {brl(PRODUTOS.upgrade.centavos)}. Seus favoritos e episódios marcados continuam salvos.{" "}
        <Link href="/conta#upgrade">Fazer upgrade</Link>
      </p>
    );
  return (
    <p className="nudge" role="status">
      Para {nudge.acao}, escolha um plano: Básico {brl(PRODUTOS.basico.centavos)} ou Premium {brl(PRODUTOS.premium.centavos)}, pagamento único.{" "}
      <Link href="/planos">Ver planos</Link>
    </p>
  );
}

/** Botão "marcar como assistido" ao lado de cada episódio. */
export function WatchedToggle({ episode, label }: { episode: Episode; label: string }) {
  const acc = useAccount();
  if (!acc?.info?.contasAtivas) return null;
  const on = acc.conta?.assistidos.includes(episode.youtubeId) ?? false;
  const can = acc.conta && acc.plano !== "nenhum";
  return (
    <button
      className={`watched-toggle${on ? " is-on" : ""}`}
      aria-pressed={on}
      aria-label={on ? `${label}: assistido (desmarcar)` : `Marcar ${label.toLowerCase()} como assistido`}
      title={on ? "Assistido" : "Marcar como assistido"}
      onClick={async () => {
        if (!can) return emit({ need: "basico", acao: "marcar episódios como assistidos" });
        const err = await acc.toggleAssistido(episode.youtubeId);
        if (err) emit({ erro: err });
      }}
    >
      ✓
    </button>
  );
}
