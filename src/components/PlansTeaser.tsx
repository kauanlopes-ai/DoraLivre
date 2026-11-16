"use client";

import Link from "next/link";
import { brl, PRODUTOS } from "@/lib/products";
import { useAccount } from "./AccountProvider";

/** Faixa discreta na home: o catálogo é grátis; os planos liberam recursos da conta. */
export default function PlansTeaser() {
  const acc = useAccount();
  if (!acc?.info?.contasAtivas || acc.plano === "premium") return null;
  const basico = acc.plano === "basico";
  return (
    <section className="plans-teaser" aria-label="Planos DoraLivre">
      <div>
        <p className="eyebrow">Assistir continua grátis</p>
        <h2>{basico ? "Leve sua maratona para o Premium" : "Salve favoritos e acompanhe o que você já viu"}</h2>
        <p>
          {basico
            ? `Continuar assistindo, progresso por série, listas, recomendações e avisos de novos episódios: upgrade por ${brl(PRODUTOS.upgrade.centavos)}, pagamento único.`
            : `Básico ${brl(PRODUTOS.basico.centavos)} ou Premium ${brl(PRODUTOS.premium.centavos)}, pagamento único. O catálogo e o player continuam abertos para todos.`}
        </p>
      </div>
      <Link className="btn btn-primary" href={basico ? "/conta#upgrade" : "/planos"}>
        {basico ? "Ver upgrade" : "Conhecer os planos"}
      </Link>
    </section>
  );
}
