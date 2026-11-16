import { mercadoPagoConfig, paymentsEnabled } from "@/server/config";
import { processPayment, verifySignature } from "@/server/mercadopago";

/**
 * Webhook oficial do Mercado Pago (notificações de pagamento).
 * 1) valida a assinatura x-signature; 2) busca o pagamento na API do provedor;
 * 3) confere pedido, moeda BRL, valor esperado e status; 4) idempotente para eventos repetidos.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) return Response.json({ erro: "pagamentos desativados" }, { status: 503 });
  const url = new URL(req.url);
  const payload = await req.json().catch(() => ({}));
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? payload?.type;
  const dataId = String(url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? payload?.data?.id ?? "");
  if (!dataId) return Response.json({ erro: "data.id ausente" }, { status: 400 });

  const ok = verifySignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
    secret: mercadoPagoConfig().webhookSecret,
  });
  if (!ok) return Response.json({ erro: "assinatura inválida" }, { status: 401 });
  if (tipo !== "payment") return Response.json({ resultado: `ignorado: tipo ${tipo}` });

  const r = await processPayment(dataId);
  return Response.json({ resultado: r.resultado, pedidoId: r.pedidoId }, { status: r.http });
}
