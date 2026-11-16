/**
 * Testes ponta a ponta dos planos (modo de teste: Supabase Auth e Mercado Pago simulados).
 * Uso:
 *   DATABASE_URL=... node tests/planos.e2e.cjs parte1   # compras, link encaminhado, pendente, duplicado, Premium
 *   (alterar o catálogo, reimportar, rebuild, reiniciar)
 *   DATABASE_URL=... node tests/planos.e2e.cjs parte2   # avisos reais, reembolso do upgrade, chargeback
 */
const { chromium, devices } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = process.env.SHOTS || path.join(__dirname, "screenshots") + "/";
const STATE = path.join(OUT, "estado-teste.json");
fs.mkdirSync(OUT, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const SECRET = "segredo-webhook-somente-teste";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const RUN = Date.now().toString(36);
const emails = { A: `ana.${RUN}@teste.dev`, B: `bruno.${RUN}@teste.dev`, C: `carla.${RUN}@teste.dev`, D: `davi.${RUN}@teste.dev`, E: `eva.${RUN}@teste.dev` };

async function codeFor(email) {
  for (let i = 0; i < 20; i++) {
    const [r] = await sql`select corpo from sim_emails where para = ${email} order by id desc limit 1`;
    if (r) return r.corpo.match(/\b(\d{6})\b/)[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("código não chegou para " + email);
}

async function login(page, email, startUrl) {
  if (startUrl) await page.goto(BASE + startUrl);
  await page.waitForURL(/\/entrar/);
  await page.getByLabel("Seu e-mail").fill(email);
  await sql`delete from sim_emails where para = ${email}`;
  await page.getByRole("button", { name: "Receber código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(await codeFor(email));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForLoadState("networkidle");
}

const userId = async (email) => (await sql`select user_id from contas where email = ${email}`)[0]?.user_id;
const ordersOf = async (email) => sql`select p.* from pedidos p join contas c on c.user_id = p.user_id where c.email = ${email} order by p.criado_em`;
const api = (page, url, body) =>
  page.evaluate(
    async ([u, b]) => {
      const r = await fetch(u, { method: b ? "POST" : "GET", headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [url, body],
  );
const planOf = async (page) => (await api(page, "/api/conta")).body?.conta?.plano;

async function signedWebhook(paymentId, { secret = SECRET, requestId = crypto.randomUUID() } = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`id:${paymentId};request-id:${requestId};ts:${ts};`).digest("hex");
  const r = await fetch(`${BASE}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
    body: JSON.stringify({ action: "payment.updated", type: "payment", data: { id: paymentId } }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function payOnSimCheckout(page, resultado, { divergente = false } = {}) {
  await page.waitForURL(/\/checkout\/simulado\//);
  const info = { titulo: await page.locator("h1").innerText(), preco: await page.locator(".price").innerText() };
  if (divergente) await page.getByLabel(/valor divergente/).check();
  const label = { approved: "Aprovar pagamento", pending: /Deixar pendente/, rejected: "Recusar" }[resultado];
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/entrar\?pedido=/);
  await page.waitForLoadState("networkidle");
  return info;
}

async function simPaymentFor(email, produto) {
  const [r] = await sql`
    select p.id, p.dados from sim_mp_pagamentos p join pedidos pe on pe.id::text = p.dados->>'external_reference'
    join contas c on c.user_id = pe.user_id where c.email = ${email} and pe.produto = ${produto} order by (p.dados->>'id')::bigint desc limit 1`;
  return r;
}

async function panelAction(page, paymentId, acao) {
  await page.goto(BASE + "/teste/pagamentos");
  await page.locator(`tr[data-pagamento="${paymentId}"] button`, { hasText: acao }).click();
  await page.waitForURL(/\/teste\/pagamentos/);
  await page.waitForLoadState("networkidle");
}

async function parte1(browser) {
  // ===================== 1. Compra do Básico (Ana) =====================
  const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  const a = await ctxA.newPage();
  await a.goto(BASE + "/planos", { waitUntil: "networkidle" });
  await a.screenshot({ path: OUT + "p1-planos.png", fullPage: true });
  check("Planos: preços R$ 10,90 e R$ 19,90", (await a.locator(".plans").innerText()).match(/R\$\s10,90/) && (await a.locator(".plans").innerText()).match(/R\$\s19,90/));
  check("Planos: Premium em destaque e prévia da Minha maratona", (await a.locator(".plan-card.is-featured").count()) === 1 && (await a.locator(".preview-frame .maratona").count()) === 1);
  await a.getByRole("button", { name: "Começar com o Básico" }).click();
  await login(a, emails.A);
  const ck1 = await payOnSimCheckout(a, "approved");
  check("Básico: checkout mostra R$ 10,90", ck1.preco.includes("10,90"), ck1.titulo + " " + ck1.preco);
  check("Básico: /entrar mostra pagamento aprovado e plano Básico", (await a.getByTestId("pedido-status").innerText()).includes("aprovado") && (await a.locator("h1").innerText()) === "DoraLivre Básico");
  await a.screenshot({ path: OUT + "p2-entrega-basico.png" });
  let oa = await ordersOf(emails.A);
  check("Básico: pedido vinculado ao ID da conta, 1090 centavos BRL, aprovado", oa.length === 1 && oa[0].user_id === (await userId(emails.A)) && oa[0].valor_centavos === 1090 && oa[0].moeda === "BRL" && oa[0].status === "aprovado", JSON.stringify(oa.map((o) => [o.produto, o.valor_centavos, o.status])));
  const pedidoA = oa[0].id;

  // Recursos do Básico no player
  await a.goto(BASE + "/?assistir=amor-fora-de-controle&ep=01", { waitUntil: "networkidle" });
  await a.getByRole("button", { name: "Favoritar" }).click();
  await a.getByRole("button", { name: "Favorita" }).waitFor();
  await a.goto(BASE + "/?assistir=quando-eu-encontrar-a-lua&ep=01", { waitUntil: "networkidle" });
  await a.getByRole("button", { name: "Favoritar" }).click();
  await a.getByRole("button", { name: /Marcar episódio 1 como assistido/ }).click();
  await a.getByRole("button", { name: /Marcar episódio 2 como assistido/ }).click();
  await a.waitForTimeout(600);
  await a.getByRole("button", { name: /Seguir/ }).click();
  const nudge = await a.locator(".nudge").innerText();
  check("Básico: Seguir mostra oferta de upgrade por R$ 9,00", nudge.match(/R\$\s9,00/) && nudge.includes("upgrade"), nudge.slice(0, 90));
  await a.screenshot({ path: OUT + "p3-player-basico.png" });
  let r = await api(a, "/api/maratona/listas", { acao: "criar", nome: "x" });
  check("Básico: ação Premium bloqueada no servidor (403)", r.status === 403, JSON.stringify(r));
  r = await api(a, "/api/maratona");
  check("Básico: rota Premium /api/maratona bloqueada (403)", r.status === 403);
  await a.goto(BASE + "/minha-maratona", { waitUntil: "networkidle" });
  check("Básico: /minha-maratona mostra prévia + upgrade R$ 9,00", (await a.locator(".locked").innerText()).match(/R\$\s9,00/) && (await a.locator(".preview-frame").count()) === 1);

  // Outro dispositivo
  const ctxA2 = await browser.newContext({ ...devices["Pixel 7"], locale: "pt-BR" });
  const a2 = await ctxA2.newPage();
  await login(a2, emails.A, "/entrar?volta=/conta");
  await a2.waitForURL(/\/conta/);
  const contaTxt = await a2.locator(".conta").innerText();
  check("Outro dispositivo: favoritos e assistidos disponíveis na conta", contaTxt.includes("Amor Fora de Controle") && contaTxt.includes("Quando Eu Encontrar a Lua") && /2 de 5 disponíveis/.test(contaTxt));
  await a2.screenshot({ path: OUT + "p4-conta-outro-dispositivo.png", fullPage: true });
  await ctxA2.close();

  // ===================== 2. Link encaminhado aberto por outra conta (Bruno) =====================
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await ctxB.newPage();
  await b.goto(`${BASE}/entrar?pedido=${pedidoA}`, { waitUntil: "networkidle" });
  await login(b, emails.B);
  await b.waitForURL(/\/entrar\?pedido=/);
  const warn = await b.getByTestId("pedido-outra-conta").innerText();
  const bodyB = await b.locator("main").innerText();
  check("Link encaminhado: outra conta vê aviso e nenhum plano", warn.includes("não pertence") && (await b.locator("h1").innerText()) === "Nenhum plano ativo");
  check("Link encaminhado: não revela produto/valor do pedido alheio", !bodyB.match(/R\$\s10,90/) && !bodyB.includes("Pagamento aprovado") && (await b.getByTestId("pedido-status").count()) === 0);
  check("Link encaminhado: plano de Bruno = nenhum; Ana continua Básico", (await planOf(b)) === "nenhum" && (await planOf(a)) === "basico");
  await b.screenshot({ path: OUT + "p5-link-encaminhado.png" });
  r = await api(b, "/api/checkout", { produto: "upgrade" });
  check("Upgrade negado para conta sem Básico (403)", r.status === 403, JSON.stringify(r.body));
  r = await api(b, "/api/conta/favoritos", { slug: "fool-in-love", on: true });
  check("Favoritos negados para conta sem plano (403)", r.status === 403);
  await ctxB.close();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(BASE);
  r = await api(anon, "/api/conta/favoritos", { slug: "fool-in-love", on: true });
  check("Favoritos sem login (401)", r.status === 401);

  // ===================== 3. Pagamento pendente (Davi) =====================
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const d = await ctxD.newPage();
  await login(d, emails.D, "/entrar?volta=/planos");
  await d.getByRole("button", { name: "Começar com o Básico" }).click();
  await payOnSimCheckout(d, "pending");
  check("Pendente: /entrar mostra 'Pagamento em confirmação'", (await d.getByTestId("pedido-status").innerText()).includes("em confirmação"));
  await d.goto(BASE + "/conta", { waitUntil: "networkidle" });
  check("Pendente: conta mostra status claro e sem acesso", (await d.getByTestId("pagamento-em-confirmacao").isVisible()) && (await planOf(d)) === "nenhum");
  await d.screenshot({ path: OUT + "p6-pendente.png", fullPage: true });
  r = await api(d, "/api/checkout", { produto: "basico" });
  check("Pendente: nova compra bloqueada enquanto confirma (409)", r.status === 409, r.body?.erro);
  const payD = await simPaymentFor(emails.D, "basico");
  await panelAction(d, payD.id, "Aprovar");
  check("Pendente → aprovado libera o Básico", (await planOf(d)) === "basico");
  await ctxD.close();

  // ===================== 4. Webhook duplicado =====================
  const payA = await simPaymentFor(emails.A, "basico");
  const antes = (await sql`select count(*)::int n from historico_acesso where pedido_id = ${pedidoA}`)[0].n;
  const w1 = await signedWebhook(payA.id);
  const w2 = await signedWebhook(payA.id);
  const depois = (await sql`select count(*)::int n from historico_acesso where pedido_id = ${pedidoA}`)[0].n;
  check("Webhook duplicado: respondido 200 como duplicado", w1.status === 200 && w2.status === 200 && /duplicado/.test(w1.body.resultado) && /duplicado/.test(w2.body.resultado), `${w1.body.resultado} | ${w2.body.resultado}`);
  check("Webhook duplicado: liberação não duplicada", antes === 1 && depois === 1 && (await ordersOf(emails.A)).length === 1 && (await planOf(a)) === "basico");
  const bad = await signedWebhook(payA.id, { secret: "segredo-errado" });
  check("Webhook com assinatura inválida rejeitado (401)", bad.status === 401);

  // ===================== 5. Upgrade (Ana) =====================
  await a.goto(BASE + "/conta", { waitUntil: "networkidle" });
  const up = a.locator("#upgrade");
  check("Conta Básico mostra upgrade por R$ 9,00", (await up.innerText()).match(/R\$\s9,00/));
  await a.screenshot({ path: OUT + "p7-conta-upgrade.png", fullPage: true });
  await up.getByRole("button", { name: /Fazer upgrade/ }).click();
  const ck2 = await payOnSimCheckout(a, "approved");
  check("Upgrade: checkout cobra R$ 9,00", ck2.preco.includes("9,00") && ck2.titulo.includes("Upgrade"), ck2.titulo + " " + ck2.preco);
  oa = await ordersOf(emails.A);
  check("Upgrade: pedido 900 centavos aprovado; Ana Premium", oa.some((o) => o.produto === "upgrade" && o.valor_centavos === 900 && o.status === "aprovado") && (await planOf(a)) === "premium");
  const contaA = (await api(a, "/api/conta")).body.conta;
  check("Upgrade: favoritos e assistidos preservados", contaA.favoritos.length === 2 && contaA.assistidos.length === 2, JSON.stringify([contaA.favoritos, contaA.assistidos.length]));
  r = await api(a, "/api/checkout", { produto: "upgrade" });
  check("Upgrade não oferecido de novo para Premium (409)", r.status === 409);

  // ===================== 6. Premium direto (Carla) =====================
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const c = await ctxC.newPage();
  await c.goto(BASE + "/planos", { waitUntil: "networkidle" });
  await c.getByRole("button", { name: "Escolher Premium" }).click();
  await login(c, emails.C);
  const ck3 = await payOnSimCheckout(c, "approved");
  check("Premium direto: checkout cobra R$ 19,90", ck3.preco.includes("19,90"), ck3.preco);
  const oc = await ordersOf(emails.C);
  check("Premium direto: pedido 1990 centavos aprovado; plano Premium", oc.length === 1 && oc[0].produto === "premium" && oc[0].valor_centavos === 1990 && (await planOf(c)) === "premium");
  await ctxC.close();

  // ===================== 7. Valor divergente (Eva) =====================
  const ctxE = await browser.newContext();
  const e = await ctxE.newPage();
  await login(e, emails.E, "/entrar?volta=/planos");
  await e.getByRole("button", { name: "Começar com o Básico" }).click();
  await payOnSimCheckout(e, "approved", { divergente: true });
  const oe = await ordersOf(emails.E);
  check("Valor divergente: pagamento 'aprovado' com valor errado não libera acesso", oe[0].status === "divergente" && (await planOf(e)) === "nenhum", oe[0].status);
  await ctxE.close();

  // ===================== 8. Premium com dados reais (Ana) =====================
  await a.goto(BASE + "/?assistir=quando-eu-encontrar-a-lua&ep=02", { waitUntil: "networkidle" });
  await a.waitForTimeout(800);
  await a.locator(".episode-item", { hasText: "Episódio 3" }).click();
  await a.waitForTimeout(800);
  await a.getByRole("button", { name: /^.{0,3}Seguir/ }).click();
  await a.waitForTimeout(400);
  await a.goto(BASE + "/?assistir=o-melhor-de-tudo&ep=01", { waitUntil: "networkidle" });
  await a.waitForTimeout(800);
  await a.goto(BASE + "/minha-maratona", { waitUntil: "networkidle" });
  const cont = a.locator(".continue-card");
  const first = await cont.first().innerText();
  check("Continuar assistindo: último episódio aberto por série", (await cont.count()) === 2 && first.includes("O Melhor de Tudo") && (await cont.nth(1).innerText()).includes("Ep. 3"), first.replace(/\n/g, " "));
  const prog = await a.locator(".progress-list").innerText();
  check("Progresso: 2/5 · 40% com indicação de catálogo parcial", prog.includes("2/5 · 40%") && prog.includes("Catálogo parcial") && prog.includes("eps. 1–5"));
  const recs = await a.locator(".recs").innerText();
  check("Recomendações: só títulos disponíveis, com motivo (elenco)", recs.includes("Com ") && /O Melhor de Tudo|Em Busca do Jade|Como Você Pôde/.test(recs), recs.split("\n").slice(0, 3).join(" | "));
  // Listas
  await a.getByLabel("Nome da nova lista").fill("Fim de semana");
  await a.getByRole("button", { name: "Criar lista" }).click();
  await a.locator('.list-card[data-lista="Fim de semana"]').waitFor();
  await a.getByLabel("Nome da nova lista").fill("Chorar à noite");
  await a.getByRole("button", { name: "Criar lista" }).click();
  await a.locator('.list-card[data-lista="Chorar à noite"]').waitFor();
  const card = a.locator('.list-card[data-lista="Fim de semana"]');
  await card.locator("select").selectOption("genius-girlfriend");
  await a.waitForTimeout(500);
  await card.locator("select").selectOption("o-destino-te-chama");
  await a.waitForTimeout(500);
  await card.getByRole("button", { name: "Descer Genius Girlfriend" }).click();
  await a.waitForTimeout(500);
  await card.getByRole("button", { name: "Renomear" }).click();
  await card.getByLabel("Novo nome da lista").fill("Fim de semana 🌙");
  await card.getByRole("button", { name: "Salvar" }).click();
  await a.locator('.list-card[data-lista="Fim de semana 🌙"]').waitFor();
  await a.getByRole("button", { name: "Mover lista Chorar à noite para cima" }).click();
  await a.waitForTimeout(600);
  const listas = (await api(a, "/api/maratona")).body.listas;
  check(
    "Listas: criar, renomear, adicionar, reordenar itens e listas (persistido)",
    listas[0].nome === "Chorar à noite" && listas[1].nome === "Fim de semana 🌙" && listas[1].itens.join() === "o-destino-te-chama,genius-girlfriend",
    JSON.stringify(listas.map((l) => [l.nome, l.itens])),
  );
  check("Séries seguidas: Quando Eu Encontrar a Lua", (await a.locator(".follow-chips").innerText()).includes("Quando Eu Encontrar a Lua"));
  check("Histórico registra episódios abertos", (await a.locator(".history").innerText()).includes("Quando Eu Encontrar a Lua · ep. 3"));
  await a.screenshot({ path: OUT + "p8-minha-maratona.png", fullPage: true });
  // Continuar abre o player na própria página
  await cont.nth(1).getByRole("button", { name: /Continuar ep\. 3/ }).click();
  await a.getByRole("dialog").waitFor();
  const src = await a.locator(".stage iframe").getAttribute("src", { timeout: 20000 });
  check("Continuar abre o player na própria página (iframe do YouTube)", a.url().endsWith("/minha-maratona") && /youtube\.com\/embed\/x2HbyeMYvdk/.test(src), src.slice(0, 60));
  await a.screenshot({ path: OUT + "p9-continuar-player.png" });
  await a.keyboard.press("Escape");

  fs.writeFileSync(STATE, JSON.stringify({ emails, pedidoA }));
  await ctxA.close();

  // ===================== 9. Reprodução pública no celular =====================
  const m = await (await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR" })).newPage();
  await m.goto(BASE, { waitUntil: "networkidle" });
  await m.getByRole("button", { name: /Assistir agora/ }).click();
  await m.getByRole("dialog").waitFor();
  const msrc = await m.locator(".stage iframe").getAttribute("src", { timeout: 20000 });
  check("Celular anônimo: episódio toca no player incorporado sem login", /youtube\.com\/embed\//.test(msrc) && new URL(m.url()).origin === new URL(BASE).origin);
  await m.locator(".episode-item", { hasText: "Episódio 2" }).click();
  check("Celular anônimo: troca de episódio na mesma janela", (await m.locator('.episode-item[aria-current="true"] .episode-num').innerText()) === "Episódio 2");
  await m.getByRole("button", { name: "Favoritar" }).click();
  check("Celular anônimo: recurso de conta pede login, player segue aberto", (await m.locator(".nudge").innerText()).includes("Entre") && (await m.getByRole("dialog").count()) === 1);
  await m.screenshot({ path: OUT + "p10-celular-publico.png" });
}

async function parte2(browser) {
  const { emails: em } = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const a = await ctx.newPage();
  await login(a, em.A, "/entrar?volta=/minha-maratona");
  await a.waitForURL(/minha-maratona/);
  const avisos = (await a.locator(".avisos").innerText()).replace(/\s+/g, " ");
  check("Aviso real: novo episódio 6 em série seguida", avisos.includes("Quando Eu Encontrar a Lua ganhou o episódio 6"), avisos.slice(0, 80));
  const naoSeguida = (await sql`select count(*)::int n from avisos a join contas c on c.user_id=a.user_id where c.email = ${em.C}`)[0].n;
  check("Aviso só para quem segue a série", naoSeguida === 0);
  await a.screenshot({ path: OUT + "p11-aviso-novo-episodio.png", fullPage: true });
  await a.getByRole("button", { name: "Marcar todos como lidos" }).click();
  await a.waitForTimeout(600);
  check("Avisos marcados como lidos", (await api(a, "/api/conta")).body.conta.avisosNaoLidos === 0);

  // Reembolso do upgrade → volta ao Básico
  const pay = await simPaymentFor(em.A, "upgrade");
  await panelAction(a, pay.id, "Reembolsar");
  const contaA = (await api(a, "/api/conta")).body.conta;
  check("Reembolso do upgrade: conta volta ao Básico", contaA.plano === "basico", contaA.plano);
  check("Reembolso do upgrade: favoritos e assistidos mantidos", contaA.favoritos.length === 2 && contaA.assistidos.length === 2);
  check("Reembolso do upgrade: rota Premium bloqueada (403)", (await api(a, "/api/maratona")).status === 403);
  await a.goto(BASE + "/conta", { waitUntil: "networkidle" });
  check("Reembolso do upgrade: conta mostra 'Reembolsado' e oferta de upgrade de novo", (await a.locator(".orders").innerText()).includes("Reembolsado") && (await a.locator("#upgrade").count()) === 1);
  await a.screenshot({ path: OUT + "p12-reembolso-upgrade.png", fullPage: true });

  // Chargeback do Premium direto (Carla)
  const payC = await simPaymentFor(em.C, "premium");
  await panelAction(a, payC.id, "Chargeback");
  const [oc] = await sql`select p.status from pedidos p join contas c on c.user_id = p.user_id where c.email = ${em.C}`;
  check("Chargeback do Premium: pedido contestado e acesso removido", oc.status === "contestado");
  await ctx.close();
}

(async () => {
  const stage = process.argv[2] || "parte1";
  const browser = await chromium.launch();
  // Mesmo esquema que o servidor aplica (idempotente), para o teste poder ler a caixa de entrada
  await sql.unsafe(fs.readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8"));
  try {
    if (stage === "parte1") await parte1(browser);
    else await parte2(browser);
  } catch (err) {
    console.error(err);
    results.push({ name: "execução", ok: false });
  }
  await browser.close();
  await sql.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram (${stage})`);
  process.exit(failed.length ? 1 : 0);
})();
