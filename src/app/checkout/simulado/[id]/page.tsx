import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/Icons";
import { brl } from "@/lib/products";
import { modes } from "@/server/config";
import { pagarSimulado } from "@/server/sim/actions";
import { simPreference } from "@/server/sim/mercadopago";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout de teste — DoraLivre", robots: { index: false } };

/** Checkout simulado (modo de teste). Em produção, o cliente vai para o Checkout Pro do Mercado Pago. */
export default async function CheckoutSimulado({ params }: { params: Promise<{ id: string }> }) {
  if (modes().pagamento !== "simulado") notFound();
  const { id } = await params;
  const pref = await simPreference(id);
  if (!pref) notFound();
  const item = pref.items[0];
  const pagar = pagarSimulado.bind(null, id);
  return (
    <main className="sim-checkout">
      <div className="sim-card">
        <div className="sim-head">
          <Logo />
          <span className="sim-tag">Checkout de teste · Mercado Pago simulado</span>
        </div>
        <h1>{item.title}</h1>
        <p className="price">{brl(Math.round(item.unit_price * 100))}</p>
        <p className="fineprint">
          Pedido <code>{pref.external_reference}</code> · {pref.payer?.email} · moeda {item.currency_id}. Nenhum valor é
          cobrado. O resultado gera um webhook assinado para o site, como no Mercado Pago.
        </p>
        <form action={pagar} className="sim-actions">
          <button className="btn btn-primary btn-lg" name="resultado" value="approved">
            Aprovar pagamento
          </button>
          <button className="btn btn-ghost btn-lg" name="resultado" value="pending">
            Deixar pendente (Pix aguardando)
          </button>
          <button className="btn btn-ghost btn-lg" name="resultado" value="rejected">
            Recusar
          </button>
          <label className="toggle">
            <input type="checkbox" name="divergente" value="1" /> <span>Simular valor divergente (teste de segurança)</span>
          </label>
        </form>
      </div>
    </main>
  );
}
