/**
 * Integração com o Mercado Pago (Checkout Pro + webhooks).
 * - Preferência criada no servidor com external_reference = ID do pedido (vinculado à conta).
 * - Webhook: valida x-signature (HMAC-SHA256), busca o pagamento na API oficial e confere
 *   pedido, moeda BRL, valor esperado e status antes de liberar o plano.
 * No modo de teste, as chamadas vão para o simulador local com o mesmo formato da API.
 */
import crypto from "node:crypto";
import { PRODUTOS } from "@/lib/products";
import type { Pedido, StatusPedido } from "./billing";
import { mercadoPagoConfig } from "./config";
import { db } from "./db";
import { simMercadoPago } from "./sim/mercadopago";

const API = "https://api.mercadopago.com";

async function mp(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = mercadoPagoConfig();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${cfg.accessToken}`);
  headers.set("content-type", "application/json");
  if (cfg.simulado) return simMercadoPago(path, { ...init, headers });
  return fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
}

export async function createPreference(pedido: Pedido, email: string, site: string) {
  const produto = PRODUTOS[pedido.produto];
  const volta = `${site}/entrar?pedido=${pedido.id}`;
  const r = await mp("/checkout/preferences", {
    method: "POST",
    headers: { "x-idempotency-key": pedido.id },
    body: JSON.stringify({
      items: [
        {
          id: produto.id,
          title: produto.nome,
          quantity: 1,
          currency_id: "BRL",
          unit_price: pedido.valor_centavos / 100,
        },
      ],
      payer: { email },
      external_reference: pedido.id,
      metadata: { pedido_id: pedido.id, user_id: pedido.user_id, produto: pedido.produto },
      notification_url: `${site}/api/webhooks/mercadopago`,
      back_urls: { success: volta, pending: volta, failure: volta },
      auto_return: "approved",
      statement_descriptor: "DORALIVRE",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Mercado Pago recusou a preferência (${r.status})`);
  return { preferenciaId: String(j.id), url: String(mercadoPagoConfig().simulado ? j.init_point : j.init_point) };
}

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  currency_id?: string;
  transaction_amount?: number;
  date_last_updated?: string;
};

export async function getPayment(id: string): Promise<MpPayment | null> {
  const r = await mp(`/v1/payments/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return (await r.json()) as MpPayment;
}

/** Valida o cabeçalho x-signature do Mercado Pago: "ts=...,v1=<hmac>". */
export function verifySignature(opts: { xSignature: string | null; xRequestId: string | null; dataId: string; secret: string }) {
  if (!opts.xSignature || !opts.secret) return false;
  const parts = Object.fromEntries(
    opts.xSignature.split(",").map((kv) => {
      const [k, ...v] = kv.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  let manifest = `id:${id};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", opts.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signFor(dataId: string, requestId: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${crypto.createHmac("sha256", secret).update(manifest).digest("hex")}`;
}

const mapStatus = (s: string): StatusPedido => {
  switch (s) {
    case "approved":
      return "aprovado";
    case "pending":
    case "in_process":
    case "authorized":
    case "in_mediation":
      return "pendente";
    case "refunded":
      return "reembolsado";
    case "charged_back":
      return "contestado";
    default:
      return "recusado"; // rejected, cancelled
  }
};

/** Status do pedido a partir de todas as tentativas de pagamento válidas dele. */
function orderStatusFrom(pagamentos: { status: string }[]): StatusPedido {
  const st = pagamentos.map((p) => p.status as StatusPedido);
  for (const s of ["aprovado", "pendente", "contestado", "reembolsado"] as const) if (st.includes(s)) return s;
  return st.length ? "recusado" : "criado";
}

export type WebhookResult = { http: number; resultado: string; pedidoId?: string };

/** Processa uma notificação de pagamento já com a assinatura validada. Idempotente. */
export async function processPayment(paymentId: string): Promise<WebhookResult> {
  const pay = await getPayment(paymentId);
  if (!pay) return { http: 404, resultado: "pagamento não encontrado no provedor" };
  const sql = await db();
  const chave = `${pay.id}:${pay.status}:${pay.date_last_updated ?? ""}`;
  const pedidoId = String(pay.external_reference ?? "");

  return sql.begin(async (tx) => {
    // Idempotência: a mesma mudança de estado só é processada uma vez
    const ins = await tx`
      insert into eventos_webhook (provedor, chave, pedido_id, resultado)
      values ('mercadopago', ${chave}, ${/^[0-9a-f-]{36}$/i.test(pedidoId) ? pedidoId : null}, 'processando')
      on conflict (provedor, chave) do nothing returning id`;
    if (!ins.length) return { http: 200, resultado: "duplicado (já processado)", pedidoId };
    const evId = ins[0].id;
    const fim = async (r: WebhookResult) => {
      await tx`update eventos_webhook set resultado = ${r.resultado} where id = ${evId}`;
      return r;
    };

    const [pedido] = /^[0-9a-f-]{36}$/i.test(pedidoId)
      ? await tx`select * from pedidos where id = ${pedidoId} for update`
      : [];
    if (!pedido) return fim({ http: 200, resultado: "ignorado: pedido inexistente" });

    const centavos = Math.round(Number(pay.transaction_amount ?? -1) * 100);
    if (pay.currency_id !== "BRL" || centavos !== pedido.valor_centavos) {
      await tx`update pedidos set status = 'divergente', atualizado_em = now() where id = ${pedido.id} and status <> 'aprovado'`;
      return fim({
        http: 200,
        resultado: `recusado: moeda/valor divergente (${pay.currency_id} ${centavos} ≠ BRL ${pedido.valor_centavos})`,
        pedidoId: pedido.id,
      });
    }

    await tx`
      insert into pagamentos (provedor, pagamento_id, pedido_id, status, status_detalhe, valor_centavos, moeda, atualizado_no_provedor)
      values ('mercadopago', ${String(pay.id)}, ${pedido.id}, ${mapStatus(pay.status)}, ${pay.status_detail ?? null}, ${centavos}, 'BRL', ${pay.date_last_updated ?? null})
      on conflict (provedor, pagamento_id) do update set status = excluded.status, status_detalhe = excluded.status_detalhe,
        atualizado_no_provedor = excluded.atualizado_no_provedor, registrado_em = now()`;
    const pags = await tx`select status from pagamentos where pedido_id = ${pedido.id}`;
    const novo = orderStatusFrom(pags as unknown as { status: string }[]);
    if (novo !== pedido.status) {
      await tx`update pedidos set status = ${novo}, atualizado_em = now(),
        aprovado_em = case when ${novo} = 'aprovado' then coalesce(aprovado_em, now()) else aprovado_em end
        where id = ${pedido.id}`;
      await tx`insert into historico_acesso (pedido_id, status) values (${pedido.id}, ${novo}) on conflict do nothing`;
    }
    return fim({ http: 200, resultado: `pedido ${pedido.status} → ${novo}`, pedidoId: pedido.id });
  });
}
