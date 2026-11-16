"use client";

import Link from "next/link";
import { brl, PRODUTOS } from "@/lib/products";
import { STATUS_PEDIDO } from "@/lib/status";
import type { Series } from "@/lib/types";
import { thumb } from "@/lib/youtube";
import { useAccount, type ContaCliente } from "./AccountProvider";
import BuyButton from "./BuyButton";
import LogoutButton from "./LogoutButton";

const PLANO = { nenhum: "Sem plano", basico: "DoraLivre Básico", premium: "DoraLivre Premium" } as const;

export default function ContaView({ estado, series, pagamentos }: { estado: ContaCliente; series: Series[]; pagamentos: boolean }) {
  const acc = useAccount();
  const conta = acc?.conta ?? estado;
  const bySlug = new Map(series.map((s) => [s.slug, s]));
  const plano = conta.plano;
  const favoritas = conta.favoritos.map((s) => bySlug.get(s)).filter(Boolean) as Series[];
  const assistidos = new Set(conta.assistidos);
  const porSerie = series
    .map((s) => ({ s, eps: s.episodios.filter((e) => assistidos.has(e.youtubeId)) }))
    .filter((x) => x.eps.length);

  return (
    <div className="conta">
      <header className="conta-head">
        <div>
          <p className="eyebrow">Minha conta</p>
          <h1>{conta.user.email}</h1>
          <p className="conta-plan">
            <span className={`plan-tag plan-${plano}`}>{PLANO[plano]}</span>
            {plano === "premium" && <span>Favoritos, assistidos e Minha maratona liberados</span>}
            {plano === "basico" && <span>Favoritos e episódios assistidos liberados</span>}
            {plano === "nenhum" && <span>O catálogo e o player continuam livres</span>}
          </p>
        </div>
        <div className="row-actions">
          {plano === "premium" && (
            <Link className="btn btn-primary" href="/minha-maratona">
              Minha maratona
              {conta.avisosNaoLidos > 0 && <span className="dot-badge">{conta.avisosNaoLidos}</span>}
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      {conta.pagamentoEmConfirmacao && (
        <div className="status-box status-wait" role="status" data-testid="pagamento-em-confirmacao">
          <strong>Pagamento em confirmação</strong>
          <p>
            Recebemos seu pedido e o provedor ainda está processando o pagamento. O acesso é liberado automaticamente
            assim que ele for aprovado; não é preciso comprar de novo.
          </p>
        </div>
      )}

      {plano === "basico" && pagamentos && (
        <section className="upgrade-box" id="upgrade" aria-labelledby="upgrade-title">
          <div>
            <p className="eyebrow">Exclusivo para quem tem o Básico</p>
            <h2 id="upgrade-title">Upgrade para o Premium por {brl(PRODUTOS.upgrade.centavos)}</h2>
            <p>
              Pagamento único. Libera a área Minha maratona: continuar assistindo, progresso por série, histórico,
              listas, recomendações e avisos de novos episódios. Seus {conta.favoritos.length} favoritos e{" "}
              {conta.assistidos.length} episódios marcados continuam na conta.
            </p>
            <Link href="/minha-maratona" className="link-inline">
              Ver prévia da Minha maratona
            </Link>
          </div>
          <BuyButton produto="upgrade" voltaBase="/conta">
            Fazer upgrade por {brl(PRODUTOS.upgrade.centavos)}
          </BuyButton>
        </section>
      )}

      {plano === "nenhum" && (
        <section className="upgrade-box">
          <div>
            <h2>Escolha um plano para salvar sua maratona</h2>
            <p>
              Básico {brl(PRODUTOS.basico.centavos)} ou Premium {brl(PRODUTOS.premium.centavos)}, pagamento único.
            </p>
          </div>
          <Link className="btn btn-primary btn-lg" href="/planos">
            Ver planos
          </Link>
        </section>
      )}

      <section className="conta-section" aria-labelledby="fav-title">
        <div className="section-head">
          <h2 id="fav-title">Favoritos</h2>
          <span>{plano === "nenhum" ? "Disponível no Básico e no Premium" : `${favoritas.length} séries`}</span>
        </div>
        {favoritas.length ? (
          <ul className="mini-grid">
            {favoritas.map((s) => (
              <li key={s.slug} className="mini-card">
                <Link href={`/?assistir=${s.slug}&ep=${s.episodios[0].numero}`} className="mini-card-link">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(s.episodios[0].youtubeId, "mqdefault")} alt="" loading="lazy" />
                  <span className="mini-card-title">{s.titulo}</span>
                  <span className="mini-card-sub">{s.episodios.length} eps. disponíveis</span>
                </Link>
                {plano !== "nenhum" && (
                  <button className="link-btn" onClick={() => acc?.toggleFavorito(s.slug)} aria-label={`Remover ${s.titulo} dos favoritos`}>
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">
            {plano === "nenhum" ? "Com um plano, use ♡ Favoritar no player." : "Abra uma série e toque em ♡ Favoritar."}
          </p>
        )}
      </section>

      <section className="conta-section" aria-labelledby="ass-title">
        <div className="section-head">
          <h2 id="ass-title">Episódios assistidos</h2>
          <span>{conta.assistidos.length} marcados</span>
        </div>
        {porSerie.length ? (
          <ul className="watched-list">
            {porSerie.map(({ s, eps }) => (
              <li key={s.slug}>
                <Link href={`/?assistir=${s.slug}&ep=${eps[eps.length - 1].numero}`} className="watched-series">
                  {s.titulo}
                </Link>
                <span className="watched-count">
                  {eps.length} de {s.episodios.length} disponíveis
                </span>
                <span className="watched-eps">
                  {eps.map((e) => (
                    <button
                      key={e.youtubeId}
                      className="ep-chip is-on"
                      onClick={() => plano !== "nenhum" && acc?.toggleAssistido(e.youtubeId)}
                      title="Desmarcar"
                      aria-label={`Desmarcar episódio ${e.rotulo} de ${s.titulo}`}
                    >
                      ✓ {e.rotulo}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inline">Marque episódios com ✓ na lista de episódios do player.</p>
        )}
      </section>

      <section className="conta-section" aria-labelledby="ped-title">
        <div className="section-head">
          <h2 id="ped-title">Compras</h2>
          <span>Pagamento único, sem renovação</span>
        </div>
        {conta.pedidos.length ? (
          <table className="orders">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {conta.pedidos.map((p) => (
                <tr key={p.id} data-status={p.status}>
                  <td>{PRODUTOS[p.produto as keyof typeof PRODUTOS]?.nome ?? p.produto}</td>
                  <td>{brl(p.valor_centavos)}</td>
                  <td>
                    <span className={`status-pill tone-${STATUS_PEDIDO[p.status]?.tone ?? "wait"}`}>{STATUS_PEDIDO[p.status]?.label ?? p.status}</span>
                  </td>
                  <td>{new Date(p.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-inline">Nenhuma compra ainda.</p>
        )}
      </section>
    </div>
  );
}
