import crypto from "node:crypto";
import { PRODUTOS, type Plano, type ProdutoId } from "@/lib/products";
import { db } from "./db";

export type StatusPedido = "criado" | "pendente" | "aprovado" | "recusado" | "reembolsado" | "contestado" | "divergente";

export type Pedido = {
  id: string;
  user_id: string;
  produto: ProdutoId;
  valor_centavos: number;
  moeda: string;
  status: StatusPedido;
  checkout_url: string | null;
  criado_em: Date;
  atualizado_em: Date;
  aprovado_em: Date | null;
};

/**
 * O acesso é sempre recalculado a partir das compras válidas (status "aprovado"):
 * - Premium: Premium aprovado, ou Básico aprovado + upgrade aprovado.
 * - Básico: Básico aprovado.
 * Reembolso/contestação muda o status do pedido e o acesso acompanha automaticamente.
 * Como nada é "somado", eventos repetidos nunca duplicam a liberação.
 */
export function planFromOrders(orders: Pick<Pedido, "produto" | "status">[]): Plano {
  const ok = new Set(orders.filter((o) => o.status === "aprovado").map((o) => o.produto));
  if (ok.has("premium") || (ok.has("basico") && ok.has("upgrade"))) return "premium";
  if (ok.has("basico")) return "basico";
  return "nenhum";
}

export async function ordersOf(userId: string): Promise<Pedido[]> {
  const sql = await db();
  return (await sql`select * from pedidos where user_id = ${userId} order by criado_em desc`) as unknown as Pedido[];
}

export async function planOf(userId: string): Promise<Plano> {
  return planFromOrders(await ordersOf(userId));
}

export type Oferta =
  | { ok: true; produto: ProdutoId; centavos: number; convertido?: boolean }
  | { ok: false; motivo: string; status: number };

/** Decide no servidor qual produto pode ser vendido para esta conta. */
export function offerFor(plano: Plano, pedido: ProdutoId, pendentes: Pedido[]): Oferta {
  if (pendentes.some((p) => p.status === "pendente"))
    return { ok: false, status: 409, motivo: "Você já tem um pagamento em confirmação. Aguarde a aprovação antes de comprar de novo." };
  if (plano === "premium") return { ok: false, status: 409, motivo: "Sua conta já tem o DoraLivre Premium." };
  if (pedido === "basico") {
    if (plano === "basico") return { ok: false, status: 409, motivo: "Sua conta já tem o DoraLivre Básico." };
    return { ok: true, produto: "basico", centavos: PRODUTOS.basico.centavos };
  }
  if (pedido === "premium") {
    // Cliente com Básico ativo recebe o upgrade em vez do Premium cheio
    if (plano === "basico") return { ok: true, produto: "upgrade", centavos: PRODUTOS.upgrade.centavos, convertido: true };
    return { ok: true, produto: "premium", centavos: PRODUTOS.premium.centavos };
  }
  if (pedido === "upgrade") {
    if (plano !== "basico") return { ok: false, status: 403, motivo: "O upgrade é exclusivo para contas com o Básico ativo." };
    return { ok: true, produto: "upgrade", centavos: PRODUTOS.upgrade.centavos };
  }
  return { ok: false, status: 400, motivo: "Produto inválido." };
}

export async function createOrder(userId: string, produto: ProdutoId, provedor: string): Promise<Pedido> {
  const sql = await db();
  const [p] = await sql`
    insert into pedidos (id, user_id, produto, valor_centavos, moeda, status, provedor)
    values (${crypto.randomUUID()}, ${userId}, ${produto}, ${PRODUTOS[produto].centavos}, 'BRL', 'criado', ${provedor})
    returning *`;
  return p as unknown as Pedido;
}

export async function orderById(id: string): Promise<Pedido | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = await db();
  const [p] = await sql`select * from pedidos where id = ${id}`;
  return (p as unknown as Pedido) ?? null;
}
