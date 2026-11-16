export const STATUS_PEDIDO: Record<string, { label: string; tone: "ok" | "wait" | "warn" }> = {
  criado: { label: "Checkout iniciado, sem confirmação", tone: "wait" },
  pendente: { label: "Pagamento em confirmação", tone: "wait" },
  aprovado: { label: "Aprovado", tone: "ok" },
  recusado: { label: "Não aprovado", tone: "warn" },
  reembolsado: { label: "Reembolsado", tone: "warn" },
  contestado: { label: "Contestado (chargeback)", tone: "warn" },
  divergente: { label: "Em análise (valor divergente)", tone: "warn" },
};
