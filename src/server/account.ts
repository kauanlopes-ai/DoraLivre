import crypto from "node:crypto";
import { getCatalog } from "@/lib/catalog";
import type { Plano } from "@/lib/products";
import type { MaratonaData } from "@/lib/maratona";
import { ordersOf, planFromOrders, type Pedido } from "./billing";
import { currentUser, type SessionUser } from "./auth";
import { accountsEnabled } from "./config";
import { db } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validação de acesso no servidor: exige sessão e, se pedido, o plano mínimo. */
export async function requireAccess(min: "conta" | "basico" | "premium" = "conta", opts = { refresh: true }) {
  if (!accountsEnabled()) throw new HttpError(503, "Contas ainda não configuradas neste ambiente.");
  const user = await currentUser(opts);
  if (!user) throw new HttpError(401, "Entre com seu e-mail para continuar.");
  const pedidos = await ordersOf(user.id);
  const plano = planFromOrders(pedidos);
  if (min === "basico" && plano === "nenhum") throw new HttpError(403, "Recurso do DoraLivre Básico.");
  if (min === "premium" && plano !== "premium") throw new HttpError(403, "Recurso do DoraLivre Premium.");
  return { user, plano, pedidos };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return Response.json({ erro: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ erro: "Erro interno." }, { status: 500 });
}

// ---------- Catálogo (somente títulos e episódios disponíveis) ----------
export function catalogIndex() {
  const series = getCatalog().series;
  const bySlug = new Map(series.map((s) => [s.slug, s]));
  const byEp = new Map(series.flatMap((s) => s.episodios.map((e) => [e.youtubeId, { serie: s, ep: e }] as const)));
  return { series, bySlug, byEp };
}

// ---------- Estado da conta ----------
export type PedidoResumo = Pick<Pedido, "id" | "produto" | "valor_centavos" | "status"> & { criado_em: string; atualizado_em: string };

export type AccountState = {
  user: { id: string; email: string };
  plano: Plano;
  pedidos: PedidoResumo[];
  pagamentoEmConfirmacao: boolean;
  favoritos: string[];
  assistidos: string[];
  seguindo: string[];
  listas: { id: string; nome: string }[];
  avisosNaoLidos: number;
};

export const resumo = (p: Pedido): PedidoResumo => ({
  id: p.id,
  produto: p.produto,
  valor_centavos: p.valor_centavos,
  status: p.status,
  criado_em: new Date(p.criado_em).toISOString(),
  atualizado_em: new Date(p.atualizado_em).toISOString(),
});

export async function accountState(user: SessionUser, plano: Plano, pedidos: Pedido[]): Promise<AccountState> {
  const sql = await db();
  const [fav, ass, seg, lis, av] = await Promise.all([
    sql`select serie_slug from favoritos where user_id = ${user.id} order by criado_em`,
    sql`select youtube_id from assistidos where user_id = ${user.id}`,
    plano === "premium" ? sql`select serie_slug from seguindo where user_id = ${user.id}` : Promise.resolve([]),
    plano === "premium" ? sql`select id, nome from listas where user_id = ${user.id} order by posicao, criado_em` : Promise.resolve([]),
    plano === "premium"
      ? sql`select count(*)::int as n from avisos where user_id = ${user.id} and lido_em is null`
      : Promise.resolve([{ n: 0 }]),
  ]);
  return {
    user: { id: user.id, email: user.email },
    plano,
    pedidos: pedidos.map(resumo),
    pagamentoEmConfirmacao: pedidos.some((p) => p.status === "pendente"),
    favoritos: fav.map((r) => r.serie_slug),
    assistidos: ass.map((r) => r.youtube_id),
    seguindo: seg.map((r) => r.serie_slug),
    listas: lis.map((r) => ({ id: r.id, nome: r.nome })),
    avisosNaoLidos: av[0]?.n ?? 0,
  };
}

// ---------- Básico ----------
export async function setFavorito(userId: string, slug: string, on: boolean) {
  if (!catalogIndex().bySlug.has(slug)) throw new HttpError(404, "Série não encontrada no catálogo.");
  const sql = await db();
  if (on) await sql`insert into favoritos (user_id, serie_slug) values (${userId}, ${slug}) on conflict do nothing`;
  else await sql`delete from favoritos where user_id = ${userId} and serie_slug = ${slug}`;
}

export async function setAssistido(userId: string, youtubeId: string, on: boolean) {
  const hit = catalogIndex().byEp.get(youtubeId);
  if (!hit) throw new HttpError(404, "Episódio não encontrado no catálogo.");
  const sql = await db();
  if (on)
    await sql`insert into assistidos (user_id, youtube_id, serie_slug) values (${userId}, ${youtubeId}, ${hit.serie.slug}) on conflict do nothing`;
  else await sql`delete from assistidos where user_id = ${userId} and youtube_id = ${youtubeId}`;
}

// ---------- Premium ----------
export async function registrarAbertura(userId: string, youtubeId: string) {
  const hit = catalogIndex().byEp.get(youtubeId);
  if (!hit) throw new HttpError(404, "Episódio não encontrado no catálogo.");
  const sql = await db();
  // Evita linhas repetidas quando o mesmo episódio é reaberto em sequência
  const [last] = await sql`select youtube_id, aberto_em from historico where user_id = ${userId} order by aberto_em desc limit 1`;
  if (last && last.youtube_id === youtubeId && Date.now() - new Date(last.aberto_em).getTime() < 10 * 60_000) {
    await sql`update historico set aberto_em = now() where user_id = ${userId} and youtube_id = ${youtubeId} and aberto_em = ${last.aberto_em}`;
    return;
  }
  await sql`insert into historico (user_id, serie_slug, youtube_id) values (${userId}, ${hit.serie.slug}, ${youtubeId})`;
}

export async function setSeguindo(userId: string, slug: string, on: boolean) {
  if (!catalogIndex().bySlug.has(slug)) throw new HttpError(404, "Série não encontrada no catálogo.");
  const sql = await db();
  if (on) await sql`insert into seguindo (user_id, serie_slug) values (${userId}, ${slug}) on conflict do nothing`;
  else await sql`delete from seguindo where user_id = ${userId} and serie_slug = ${slug}`;
}

const nomeValido = (nome: unknown) => {
  const n = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!n || n.length > 60) throw new HttpError(400, "Dê um nome de 1 a 60 caracteres para a lista.");
  return n;
};

async function listaDoUsuario(userId: string, listaId: string) {
  const sql = await db();
  if (!/^[0-9a-f-]{36}$/i.test(listaId)) throw new HttpError(404, "Lista não encontrada.");
  const [l] = await sql`select * from listas where id = ${listaId} and user_id = ${userId}`;
  if (!l) throw new HttpError(404, "Lista não encontrada.");
  return l;
}

export async function criarLista(userId: string, nome: unknown) {
  const sql = await db();
  const [{ n }] = await sql`select count(*)::int as n from listas where user_id = ${userId}`;
  if (n >= 30) throw new HttpError(400, "Limite de 30 listas.");
  const [l] = await sql`insert into listas (id, user_id, nome, posicao) values (${crypto.randomUUID()}, ${userId}, ${nomeValido(nome)}, ${n})
    returning id, nome, posicao`;
  return l;
}

export async function renomearLista(userId: string, listaId: string, nome: unknown) {
  await listaDoUsuario(userId, listaId);
  const sql = await db();
  await sql`update listas set nome = ${nomeValido(nome)} where id = ${listaId}`;
}

export async function excluirLista(userId: string, listaId: string) {
  await listaDoUsuario(userId, listaId);
  const sql = await db();
  await sql`delete from listas where id = ${listaId}`;
  await normalizarPosicoesListas(userId);
}

async function normalizarPosicoesListas(userId: string) {
  const sql = await db();
  const ls = await sql`select id from listas where user_id = ${userId} order by posicao, criado_em`;
  for (const [i, l] of ls.entries()) await sql`update listas set posicao = ${i} where id = ${l.id}`;
}

export async function moverLista(userId: string, listaId: string, dir: -1 | 1) {
  await listaDoUsuario(userId, listaId);
  const sql = await db();
  await normalizarPosicoesListas(userId);
  const ls = await sql`select id from listas where user_id = ${userId} order by posicao`;
  const i = ls.findIndex((l) => l.id === listaId);
  const j = i + dir;
  if (j < 0 || j >= ls.length) return;
  await sql`update listas set posicao = ${j} where id = ${ls[i].id}`;
  await sql`update listas set posicao = ${i} where id = ${ls[j].id}`;
}

export async function itemLista(userId: string, listaId: string, slug: string, acao: "adicionar" | "remover" | "subir" | "descer") {
  await listaDoUsuario(userId, listaId);
  if (!catalogIndex().bySlug.has(slug)) throw new HttpError(404, "Série não encontrada no catálogo.");
  const sql = await db();
  const itens = await sql`select serie_slug from lista_itens where lista_id = ${listaId} order by posicao`;
  const slugs = itens.map((r) => r.serie_slug as string);
  const i = slugs.indexOf(slug);
  if (acao === "adicionar" && i < 0) slugs.push(slug);
  if (acao === "remover" && i >= 0) slugs.splice(i, 1);
  if ((acao === "subir" || acao === "descer") && i >= 0) {
    const j = acao === "subir" ? i - 1 : i + 1;
    if (j >= 0 && j < slugs.length) [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
  }
  await sql.begin(async (tx) => {
    await tx`delete from lista_itens where lista_id = ${listaId}`;
    if (slugs.length)
      await tx`insert into lista_itens ${tx(slugs.map((s, posicao) => ({ lista_id: listaId, serie_slug: s, posicao })))}`;
  });
}

export async function marcarAvisosLidos(userId: string, ids: number[] | "todos") {
  const sql = await db();
  if (ids === "todos") await sql`update avisos set lido_em = now() where user_id = ${userId} and lido_em is null`;
  else if (ids.length) await sql`update avisos set lido_em = now() where user_id = ${userId} and id = any(${ids}) and lido_em is null`;
}

export async function maratonaData(userId: string): Promise<MaratonaData> {
  const sql = await db();
  const { bySlug, byEp } = catalogIndex();
  const [fav, ass, seg, hist, listas, itens, avisos] = await Promise.all([
    sql`select serie_slug from favoritos where user_id = ${userId} order by criado_em`,
    sql`select youtube_id from assistidos where user_id = ${userId}`,
    sql`select serie_slug from seguindo where user_id = ${userId} order by criado_em`,
    sql`select serie_slug, youtube_id, aberto_em from historico where user_id = ${userId} order by aberto_em desc limit 200`,
    sql`select id, nome, posicao from listas where user_id = ${userId} order by posicao, criado_em`,
    sql`select i.lista_id, i.serie_slug from lista_itens i join listas l on l.id = i.lista_id where l.user_id = ${userId} order by i.posicao`,
    sql`select id, serie_slug, youtube_id, criado_em, lido_em from avisos where user_id = ${userId} order by criado_em desc limit 50`,
  ]);
  return {
    favoritos: fav.map((r) => r.serie_slug).filter((s) => bySlug.has(s)),
    assistidos: ass.map((r) => r.youtube_id).filter((id) => byEp.has(id)),
    seguindo: seg.map((r) => r.serie_slug).filter((s) => bySlug.has(s)),
    historico: hist
      .filter((r) => byEp.has(r.youtube_id))
      .map((r) => ({ serie_slug: r.serie_slug, youtube_id: r.youtube_id, aberto_em: new Date(r.aberto_em).toISOString() })),
    listas: listas.map((l) => ({
      id: l.id,
      nome: l.nome,
      posicao: l.posicao,
      itens: itens.filter((i) => i.lista_id === l.id && bySlug.has(i.serie_slug)).map((i) => i.serie_slug),
    })),
    avisos: avisos
      .filter((a) => byEp.has(a.youtube_id))
      .map((a) => ({
        id: Number(a.id),
        serie_slug: a.serie_slug,
        youtube_id: a.youtube_id,
        criado_em: new Date(a.criado_em).toISOString(),
        lido: Boolean(a.lido_em),
      })),
  };
}
