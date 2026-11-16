import Link from "next/link";
import type { Metadata } from "next";
import BuyButton from "@/components/BuyButton";
import MaratonaView from "@/components/MaratonaView";
import PageShell from "@/components/PageShell";
import { getCatalog } from "@/lib/catalog";
import { demoMaratona } from "@/lib/demo";
import { brl, PRODUTOS } from "@/lib/products";
import { maratonaData } from "@/server/account";
import { pageSession } from "@/server/page-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha maratona — DoraLivre" };

/** Área Premium. O acesso é decidido no servidor; sem Premium, mostra só a prévia com dados de exemplo. */
export default async function MinhaMaratonaPage() {
  const series = getCatalog().series;
  const s = await pageSession("/minha-maratona");
  if (s.ativo && s.user && s.plano === "premium") {
    const data = await maratonaData(s.user.id);
    return (
      <PageShell className="wide">
        <MaratonaView series={series} initial={data} />
      </PageShell>
    );
  }

  const basico = s.ativo && s.user && s.plano === "basico";
  return (
    <PageShell className="wide">
      <section className="locked" aria-labelledby="locked-title">
        <p className="eyebrow">Recurso do DoraLivre Premium</p>
        <h1 id="locked-title">Minha maratona</h1>
        <p className="lead">
          Continuar assistindo, progresso por série, histórico, listas, recomendações e avisos de novos episódios. O
          catálogo e o player continuam livres para todos.
        </p>
        <div className="row-actions">
          {basico ? (
            <BuyButton produto="upgrade" voltaBase="/minha-maratona">
              Fazer upgrade por {brl(PRODUTOS.upgrade.centavos)}
            </BuyButton>
          ) : s.ativo && s.user ? (
            <BuyButton produto="premium" voltaBase="/minha-maratona">
              Escolher Premium · {brl(PRODUTOS.premium.centavos)}
            </BuyButton>
          ) : (
            <Link className="btn btn-primary btn-lg" href="/planos">
              Ver planos
            </Link>
          )}
          {!(s.ativo && s.user) && s.ativo && (
            <Link className="btn btn-ghost btn-lg" href="/entrar?volta=/minha-maratona">
              Já comprei: entrar
            </Link>
          )}
        </div>
        {basico && <p className="fineprint">Pagamento único. Seus favoritos e episódios marcados continuam na conta após o upgrade.</p>}
      </section>
      <div className="preview-frame">
        <span className="preview-label">Prévia com dados de exemplo</span>
        <MaratonaView series={series} initial={demoMaratona(series)} demo />
      </div>
    </PageShell>
  );
}
