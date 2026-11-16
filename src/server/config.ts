/**
 * Modos de operação, decididos só por variáveis de ambiente do servidor.
 *
 * - Real: SUPABASE_URL + SUPABASE_ANON_KEY (login) e MP_ACCESS_TOKEN + MP_WEBHOOK_SECRET (pagamento).
 * - Teste: DORALIVRE_MODO_TESTE=1 (ou `next dev`). Login e Mercado Pago são simulados localmente,
 *   pelo mesmo código de produção; nenhum dinheiro real circula.
 * - Sem configuração em produção: catálogo e player seguem públicos; recursos da conta ficam indisponíveis.
 */

const env = (k: string) => (process.env[k] ?? "").trim();

export const isTestMode = () => env("DORALIVRE_MODO_TESTE") === "1" || process.env.NODE_ENV === "development";

export type Modes = {
  db: boolean;
  auth: "supabase" | "simulado" | null;
  pagamento: "mercadopago" | "simulado" | null;
  teste: boolean;
};

export function modes(): Modes {
  const teste = isTestMode();
  const db = Boolean(env("DATABASE_URL"));
  const auth = env("SUPABASE_URL") && env("SUPABASE_ANON_KEY") ? "supabase" : teste ? "simulado" : null;
  const pagamento = env("MP_ACCESS_TOKEN") && env("MP_WEBHOOK_SECRET") ? "mercadopago" : teste ? "simulado" : null;
  return { db, auth: db ? auth : null, pagamento: db ? pagamento : null, teste };
}

export const accountsEnabled = () => {
  const m = modes();
  return Boolean(m.db && m.auth);
};

export const paymentsEnabled = () => {
  const m = modes();
  return Boolean(m.db && m.auth && m.pagamento);
};

export const SIM_WEBHOOK_SECRET = "segredo-webhook-somente-teste";

export function supabaseConfig() {
  return { url: env("SUPABASE_URL").replace(/\/$/, ""), anonKey: env("SUPABASE_ANON_KEY") };
}

export function mercadoPagoConfig() {
  if (modes().pagamento === "mercadopago") {
    return { simulado: false, accessToken: env("MP_ACCESS_TOKEN"), webhookSecret: env("MP_WEBHOOK_SECRET") };
  }
  return { simulado: true, accessToken: "TEST-simulado", webhookSecret: SIM_WEBHOOK_SECRET };
}

/** URL pública do site (usada em back_urls e notification_url). */
export function siteUrl(fallbackOrigin?: string) {
  const fromEnv = env("SITE_URL") || (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : "");
  return (fromEnv || fallbackOrigin || "http://localhost:3000").replace(/\/$/, "");
}
