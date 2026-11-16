/**
 * Simulador local do Mercado Pago — SOMENTE modo de teste.
 * Responde como a API (POST /checkout/preferences, GET /v1/payments/:id) e envia webhooks
 * assinados (x-signature) para a notification_url, exatamente como o provedor real.
 */
import crypto from "node:crypto";
import { SIM_WEBHOOK_SECRET } from "../config";
import { db } from "../db";

const json = (body: unknown, status = 200) => Response.json(body, { status });

type Pref = {
  id: string;
  items: { title: string; unit_price: number; currency_id: string }[];
  external_reference: string;
  notification_url: string;
  back_urls: { success: string; pending: string; failure: string };
  payer?: { email?: string };
  init_point: string;
};

export async function simMercadoPago(path: string, init: RequestInit): Promise<Response> {
  const sql = await db();
  const auth = new Headers(init.headers).get("authorization");
  if (auth !== "Bearer TEST-simulado") return json({ message: "invalid access token" }, 401);

  if (path === "/checkout/preferences" && init.method === "POST") {
    const body = JSON.parse(String(init.body));
    const id = `sim-pref-${crypto.randomUUID()}`;
    const origin = new URL(body.notification_url).origin;
    const pref: Pref = { ...body, id, init_point: `${origin}/checkout/simulado/${id}` };
    await sql`insert into sim_mp_preferencias (id, dados) values (${id}, ${sql.json(pref)})`;
    return json(pref, 201);
  }

  const m = path.match(/^\/v1\/payments\/([^/?]+)$/);
  if (m) {
    const [p] = await sql`select dados from sim_mp_pagamentos where id = ${decodeURIComponent(m[1])}`;
    return p ? json(p.dados) : json({ message: "Payment not found" }, 404);
  }
  return json({ message: "not found" }, 404);
}

export async function simPreference(id: string): Promise<Pref | null> {
  const sql = await db();
  const [p] = await sql`select dados from sim_mp_preferencias where id = ${id}`;
  return (p?.dados as Pref) ?? null;
}

export async function simPaymentsFor(prefId: string) {
  const sql = await db();
  const rows = await sql`select dados from sim_mp_pagamentos where preferencia_id = ${prefId} order by (dados->>'id')::bigint`;
  return rows.map((r) => r.dados as Record<string, unknown>);
}

/** Envia o webhook assinado para a notification_url (como o Mercado Pago faria). */
export async function simSendWebhook(paymentId: string, opts: { requestId?: string; secret?: string } = {}) {
  const sql = await db();
  const [p] = await sql`select dados, preferencia_id from sim_mp_pagamentos where id = ${paymentId}`;
  if (!p) throw new Error("pagamento simulado inexistente");
  const pref = await simPreference(p.preferencia_id);
  if (!pref) throw new Error("preferência simulada inexistente");
  const requestId = opts.requestId ?? crypto.randomUUID();
  const ts = Math.floor(Date.now() / 1000);
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", opts.secret ?? SIM_WEBHOOK_SECRET).update(manifest).digest("hex");
  const url = `${pref.notification_url}?data.id=${paymentId}&type=payment`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
    body: JSON.stringify({ action: "payment.updated", api_version: "v1", type: "payment", data: { id: paymentId } }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export type SimOutcome = "approved" | "pending" | "rejected";

export async function simPay(prefId: string, outcome: SimOutcome, opts: { valorDivergente?: boolean } = {}) {
  const sql = await db();
  const pref = await simPreference(prefId);
  if (!pref) throw new Error("preferência inexistente");
  const id = String(Date.now()) + String(crypto.randomInt(100, 999));
  const item = pref.items[0];
  const now = new Date().toISOString();
  const dados = {
    id: Number(id),
    status: outcome,
    status_detail: outcome === "approved" ? "accredited" : outcome === "pending" ? "pending_waiting_transfer" : "cc_rejected_other_reason",
    external_reference: pref.external_reference,
    currency_id: item.currency_id,
    transaction_amount: opts.valorDivergente ? Math.max(1, item.unit_price - 5) : item.unit_price,
    payer: pref.payer ?? {},
    payment_method_id: outcome === "pending" ? "pix" : "visa",
    date_created: now,
    date_last_updated: now,
  };
  await sql`insert into sim_mp_pagamentos (id, preferencia_id, dados) values (${id}, ${prefId}, ${sql.json(dados)})`;
  const webhook = await simSendWebhook(id);
  return { paymentId: id, webhook };
}

/** Muda o estado de um pagamento simulado (aprovar pendente, reembolsar, contestar) e notifica. */
export async function simSetStatus(paymentId: string, status: "approved" | "refunded" | "charged_back") {
  const sql = await db();
  const detail = { approved: "accredited", refunded: "refunded", charged_back: "settled" }[status];
  await sql`update sim_mp_pagamentos set dados = dados || ${sql.json({
    status,
    status_detail: detail,
    date_last_updated: new Date().toISOString(),
  })} where id = ${paymentId}`;
  return simSendWebhook(paymentId);
}
