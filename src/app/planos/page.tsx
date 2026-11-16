import Link from "next/link";
import type { Metadata } from "next";
import BuyButton from "@/components/BuyButton";
import MaratonaView from "@/components/MaratonaView";
import PageShell from "@/components/PageShell";
import { getCatalog } from "@/lib/catalog";
import { demoMaratona } from "@/lib/demo";
import { brl, isProdutoId, PRODUTOS } from "@/lib/products";
import { paymentsEnabled } from "@/server/config";
import { pageSession } from "@/server/page-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Planos — DoraLivre",
  description: "DoraLivre Básico R$ 10,90 e Premium R$ 19,90, pagamento único. O catálogo e o player continuam grátis.",
};

const COMPARA: { recurso: string; basico: boolean; premium: boolean }[] = [
  { recurso: "Catálogo e player dentro do site", basico: true, premium: true },
  { recurso: "Favoritos salvos na sua conta Google, em qualquer dispositivo", basico: true, premium: true },
  { recurso: "Marcar episódios como assistidos", basico: true, premium: true },
  { recurso: "Continuar assistindo de onde parou", basico: false, premium: true },
  { recurso: "Progresso por série", basico: false, premium: true },
  { recurso: "Histórico e listas personalizadas", basico: false, premium: true },
  { recurso: "Recomendações com títulos do DoraLivre", basico: false, premium: true },
  { recurso: "Seguir séries e receber avisos de novos episódios", basico: false, premium: true },
];

export default async function PlanosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const series = getCatalog().series;
  const s = await pageSession(sp.comprar ? `/planos?comprar=${sp.comprar}` : "/planos");
  const logado = s.ativo && Boolean(s.user);
  const plano = s.ativo && s.user ? s.plano : "nenhum";
  const vendas = paymentsEnabled();
  const auto = logado && isProdutoId(sp.comprar) ? sp.comprar : null;

  return (
    <PageShell className="wide">
      <section className="sales-hero">
        <p className="eyebrow">Planos DoraLivre · pagamento único</p>
        <h1>Assistir é grátis. Sua maratona fica salva.</h1>
        <p className="lead">
          Todo o catálogo e o player continuam abertos para todos, sem cadastro. Os planos liberam recursos da sua conta:
          favoritos e episódios assistidos no Básico; no Premium, também a área Minha maratona. Sem mensalidade e sem
          renovação automática.
        </p>
      </section>

      {!vendas && (
        <p className="status-box status-warn" role="status">
          As vendas ainda não estão ativas neste ambiente.
        </p>
      )}

      <section className="plans" aria-label="Preços">
        <article className="plan-card" aria-labelledby="p-basico">
          <h2 id="p-basico">DoraLivre Básico</h2>
          <p className="price">
            {brl(PRODUTOS.basico.centavos)}
            <small> pagamento único</small>
          </p>
          <ul className="plan-list">
            <li>Favoritos salvos na conta</li>
            <li>Episódios marcados como assistidos</li>
            <li>Disponível em qualquer dispositivo com a sua conta Google</li>
          </ul>
          {plano === "nenhum" ? (
            vendas && (
              <BuyButton produto="basico" className="btn btn-ghost btn-lg btn-block" autoStart={auto === "basico"}>
                Começar com o Básico
              </BuyButton>
            )
          ) : (
            <p className="plan-owned">{plano === "basico" ? "✓ Seu plano atual" : "✓ Incluído no seu Premium"}</p>
          )}
        </article>

        <article className="plan-card is-featured" aria-labelledby="p-premium">
          <span className="ribbon">Mais completo</span>
          <h2 id="p-premium">DoraLivre Premium</h2>
          <p className="price">
            {plano === "basico" ? brl(PRODUTOS.upgrade.centavos) : brl(PRODUTOS.premium.centavos)}
            <small>{plano === "basico" ? " upgrade, pagamento único" : " pagamento único"}</small>
          </p>
          {plano === "basico" && <p className="price-note">Você já tem o Básico: pague só a diferença de upgrade. Seus favoritos e episódios marcados continuam.</p>}
          <ul className="plan-list">
            <li>Tudo do Básico</li>
            <li>Minha maratona: continuar assistindo, progresso, histórico e listas</li>
            <li>Recomendações e avisos de novos episódios nas séries seguidas</li>
          </ul>
          {plano === "premium" ? (
            <p className="plan-owned">✓ Seu plano atual</p>
          ) : (
            vendas && (
              <BuyButton
                produto={plano === "basico" ? "upgrade" : "premium"}
                className="btn btn-primary btn-lg btn-block"
                autoStart={auto === "premium" || auto === "upgrade"}
              >
                {plano === "basico" ? `Fazer upgrade por ${brl(PRODUTOS.upgrade.centavos)}` : "Escolher Premium"}
              </BuyButton>
            )
          )}
        </article>
      </section>

      <section className="compare" aria-labelledby="cmp-title">
        <h2 id="cmp-title">Comparação</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Recurso</th>
              <th scope="col">Grátis</th>
              <th scope="col">Básico</th>
              <th scope="col" className="is-featured">
                Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARA.map((r, i) => (
              <tr key={r.recurso}>
                <th scope="row">{r.recurso}</th>
                <td>{i === 0 ? "✓" : "—"}</td>
                <td>{r.basico ? "✓" : "—"}</td>
                <td className="is-featured">{r.premium ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="preview-section" aria-labelledby="prev-title">
        <div className="section-head">
          <h2 id="prev-title">Prévia da Minha maratona</h2>
          <span>A mesma área que você recebe no Premium, aqui com dados de exemplo e títulos reais do catálogo</span>
        </div>
        <div className="preview-frame">
          <span className="preview-label">Prévia com dados de exemplo</span>
          <MaratonaView series={series} initial={demoMaratona(series)} demo />
        </div>
      </section>

      <section className="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Perguntas rápidas</h2>
        <dl>
          <dt>Preciso pagar para assistir?</dt>
          <dd>Não. O catálogo e o player do YouTube continuam públicos. A compra libera recursos da sua conta.</dd>
          <dt>Como recebo o acesso?</dt>
          <dd>
            Você entra com Google antes de pagar, e o pedido fica ligado à sua conta. Depois do pagamento, acesse{" "}
            <Link href="/entrar">/entrar</Link> com a mesma conta Google: o plano é liberado assim que o provedor confirmar
            o pagamento.
          </dd>
          <dt>Já tenho o Básico. Quanto custa o Premium?</dt>
          <dd>O upgrade custa {brl(PRODUTOS.upgrade.centavos)}, pagamento único, e mantém seus favoritos e episódios marcados.</dd>
        </dl>
      </section>
    </PageShell>
  );
}
