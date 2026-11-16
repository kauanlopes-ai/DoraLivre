import { isProdutoId } from "@/lib/products";
import { errorResponse, HttpError, requireAccess } from "@/server/account";
import { createOrder, offerFor } from "@/server/billing";
import { modes, paymentsEnabled, siteUrl } from "@/server/config";
import { db } from "@/server/db";
import { createPreference } from "@/server/mercadopago";
import { body, originOf } from "@/server/http";

/**
 * Cria o pedido JÁ vinculado ao ID da conta autenticada e só então abre o checkout.
 * O produto e o valor são decididos aqui (preços em centavos no servidor).
 */
export async function POST(req: Request) {
  try {
    const b = await body(req);
    if (!paymentsEnabled()) throw new HttpError(503, "Pagamentos ainda não configurados neste ambiente.");
    const { user, plano, pedidos } = await requireAccess("conta");
    if (!isProdutoId(b.produto)) throw new HttpError(400, "Produto inválido.");
    const oferta = offerFor(plano, b.produto, pedidos);
    if (!oferta.ok) throw new HttpError(oferta.status, oferta.motivo);

    // Reaproveita um checkout aberto (não pago) do mesmo produto nas últimas 24 h
    const aberto = pedidos.find(
      (p) => p.produto === oferta.produto && p.status === "criado" && p.checkout_url && Date.now() - new Date(p.criado_em).getTime() < 86400_000,
    );
    if (aberto) return Response.json({ pedidoId: aberto.id, produto: aberto.produto, centavos: aberto.valor_centavos, checkoutUrl: aberto.checkout_url, convertido: oferta.convertido ?? false });

    const provedor = modes().pagamento === "mercadopago" ? "mercadopago" : "mercadopago-simulado";
    const pedido = await createOrder(user.id, oferta.produto, provedor);
    const site = modes().pagamento === "simulado" ? originOf(req) : siteUrl(originOf(req));
    const pref = await createPreference(pedido, user.email, site);
    const sql = await db();
    await sql`update pedidos set preferencia_id = ${pref.preferenciaId}, checkout_url = ${pref.url}, atualizado_em = now() where id = ${pedido.id}`;
    return Response.json({ pedidoId: pedido.id, produto: pedido.produto, centavos: pedido.valor_centavos, checkoutUrl: pref.url, convertido: oferta.convertido ?? false });
  } catch (err) {
    return errorResponse(err);
  }
}
