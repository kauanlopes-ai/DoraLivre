/** Lógica pura da área Minha maratona — usada pela área real e pela prévia da página de vendas. */
import type { Series } from "./types";

export type HistoricoItem = { serie_slug: string; youtube_id: string; aberto_em: string };
export type Lista = { id: string; nome: string; posicao: number; itens: string[] };
export type Aviso = { id: number; serie_slug: string; youtube_id: string; criado_em: string; lido: boolean };

export type MaratonaData = {
  favoritos: string[];
  assistidos: string[];
  seguindo: string[];
  historico: HistoricoItem[];
  listas: Lista[];
  avisos: Aviso[];
};

export type Progresso = {
  slug: string;
  assistidos: number;
  disponiveis: number;
  pct: number;
  recorte: string; // ex.: "eps. 1–5"
  parcial: boolean; // a série tem episódios fora do DoraLivre (ou não sabemos o total)
};

export function progressoPorSerie(series: Series[], assistidos: Set<string>): Progresso[] {
  return series
    .map((s) => {
      const disp = s.episodios.length;
      const vistos = s.episodios.filter((e) => assistidos.has(e.youtubeId)).length;
      const nums = s.episodios.map((e) => e.rotulo);
      return {
        slug: s.slug,
        assistidos: vistos,
        disponiveis: disp,
        pct: disp ? Math.round((vistos / disp) * 100) : 0,
        recorte: disp > 1 ? `eps. ${nums[0]}–${nums[nums.length - 1]}` : `ep. ${nums[0]}`,
        parcial: true, // o catálogo informa só os episódios publicados no DoraLivre
      };
    })
    .filter((p) => p.assistidos > 0);
}

/** Último episódio aberto de cada série, do mais recente para o mais antigo. */
export function continuarAssistindo(historico: HistoricoItem[]) {
  const seen = new Set<string>();
  const out: HistoricoItem[] = [];
  for (const h of [...historico].sort((a, b) => b.aberto_em.localeCompare(a.aberto_em))) {
    if (seen.has(h.serie_slug)) continue;
    seen.add(h.serie_slug);
    out.push(h);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export type Recomendacao = { slug: string; motivo: string; score: number };

/**
 * Recomenda só títulos disponíveis no catálogo, a partir das favoritas (ou, sem favoritas, das séries vistas).
 * Pesos: elenco em comum > gênero em comum (quando houver gêneros cadastrados) > mesmo canal.
 */
export function recomendar(series: Series[], data: Pick<MaratonaData, "favoritos" | "historico" | "assistidos">, limite = 6): Recomendacao[] {
  const bySlug = new Map(series.map((s) => [s.slug, s]));
  let sementes = data.favoritos.filter((s) => bySlug.has(s));
  if (!sementes.length) sementes = [...new Set(data.historico.map((h) => h.serie_slug))].filter((s) => bySlug.has(s));
  if (!sementes.length) return [];
  const assistidos = new Set(data.assistidos);
  const out: Recomendacao[] = [];
  for (const c of series) {
    if (sementes.includes(c.slug)) continue;
    if (c.episodios.every((e) => assistidos.has(e.youtubeId))) continue; // já terminou
    let best: Recomendacao | null = null;
    for (const slug of sementes) {
      const s = bySlug.get(slug)!;
      const elenco = (c.elenco ?? []).filter((a) => (s.elenco ?? []).some((b) => norm(a) === norm(b)));
      const generos = (c.generos ?? []).filter((g) => (s.generos ?? []).includes(g));
      const canal = c.canais.some((x) => s.canais.includes(x));
      const score = elenco.length * 3 + generos.length * 2 + (canal ? 1 : 0);
      if (!score) continue;
      const motivo = elenco.length
        ? `Com ${elenco.join(" e ")}, como em ${s.titulo}`
        : generos.length
          ? `${generos.join(" · ")}, como ${s.titulo}`
          : `Do mesmo canal de ${s.titulo} (${c.canais[0]})`;
      if (!best || score > best.score) best = { slug: c.slug, motivo, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limite);
}
