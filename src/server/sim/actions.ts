"use server";

import { redirect } from "next/navigation";
import { modes } from "../config";
import { simPay, simPreference, simSendWebhook, simSetStatus, type SimOutcome } from "./mercadopago";

function guard() {
  if (modes().pagamento !== "simulado") throw new Error("Simulador desativado");
}

export async function pagarSimulado(prefId: string, form: FormData) {
  guard();
  const outcome = String(form.get("resultado")) as SimOutcome;
  if (!["approved", "pending", "rejected"].includes(outcome)) throw new Error("resultado inválido");
  const pref = await simPreference(prefId);
  if (!pref) throw new Error("preferência inexistente");
  await simPay(prefId, outcome, { valorDivergente: form.get("divergente") === "1" });
  // Volta para o site, como o Checkout Pro faz com back_urls
  redirect(outcome === "approved" ? pref.back_urls.success : outcome === "pending" ? pref.back_urls.pending : pref.back_urls.failure);
}

export async function alterarPagamentoSimulado(form: FormData) {
  guard();
  const id = String(form.get("pagamento"));
  const acao = String(form.get("acao"));
  if (acao === "reenviar") await simSendWebhook(id);
  else if (acao === "approved" || acao === "refunded" || acao === "charged_back") await simSetStatus(id, acao);
  redirect(String(form.get("volta") ?? "/teste/pagamentos"));
}
