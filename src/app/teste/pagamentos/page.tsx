import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { brl } from "@/lib/products";
import { modes } from "@/server/config";
import { db } from "@/server/db";
import { alterarPagamentoSimulado } from "@/server/sim/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pagamentos de teste — DoraLivre", robots: { index: false } };

/** Painel do provedor simulado: aprovar pendentes, reembolsar, contestar e reenviar webhooks. */
export default async function PagamentosTeste() {
  if (modes().pagamento !== "simulado") notFound();
  const sql = await db();
  const rows = await sql`
    select p.id, p.dados, pe.produto, pe.status as pedido_status, c.email
    from sim_mp_pagamentos p
    left join pedidos pe on pe.id::text = p.dados->>'external_reference'
    left join contas c on c.user_id = pe.user_id
    order by (p.dados->>'id')::bigint desc limit 50`;
  const eventos = await sql`select * from eventos_webhook order by id desc limit 20`;
  return (
    <PageShell className="wide">
      <h1>Pagamentos de teste</h1>
      <p className="lead">Simula ações do Mercado Pago. Cada ação envia um webhook assinado para /api/webhooks/mercadopago.</p>
      <table className="orders">
        <thead>
          <tr>
            <th>Pagamento</th>
            <th>Conta</th>
            <th>Produto</th>
            <th>Valor</th>
            <th>Status no provedor</th>
            <th>Pedido</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-pagamento={r.id} data-email={r.email} data-produto={r.produto}>
              <td>
                <code>{r.id}</code>
              </td>
              <td>{r.email}</td>
              <td>{r.produto}</td>
              <td>{brl(Math.round(Number(r.dados.transaction_amount) * 100))}</td>
              <td>{r.dados.status}</td>
              <td>{r.pedido_status}</td>
              <td>
                <form action={alterarPagamentoSimulado} className="sim-row-actions">
                  <input type="hidden" name="pagamento" value={r.id} />
                  <input type="hidden" name="volta" value="/teste/pagamentos" />
                  {r.dados.status === "pending" && (
                    <button className="btn btn-ghost btn-sm" name="acao" value="approved">
                      Aprovar
                    </button>
                  )}
                  {r.dados.status === "approved" && (
                    <>
                      <button className="btn btn-ghost btn-sm" name="acao" value="refunded">
                        Reembolsar
                      </button>
                      <button className="btn btn-ghost btn-sm" name="acao" value="charged_back">
                        Chargeback
                      </button>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm" name="acao" value="reenviar">
                    Reenviar webhook
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Últimos webhooks processados</h2>
      <ul className="events">
        {eventos.map((e) => (
          <li key={e.id}>
            <code>{e.chave}</code> → {e.resultado}
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
