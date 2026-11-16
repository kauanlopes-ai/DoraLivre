/** Produtos e preços definidos no servidor, em centavos (BRL). O cliente nunca envia valores. */
export const PRODUTOS = {
  basico: { id: "basico", nome: "DoraLivre Básico", centavos: 1090 },
  premium: { id: "premium", nome: "DoraLivre Premium", centavos: 1990 },
  upgrade: { id: "upgrade", nome: "Upgrade DoraLivre Básico → Premium", centavos: 900 },
} as const;

export type ProdutoId = keyof typeof PRODUTOS;
export type Plano = "nenhum" | "basico" | "premium";

export const isProdutoId = (x: unknown): x is ProdutoId => typeof x === "string" && x in PRODUTOS;

export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
