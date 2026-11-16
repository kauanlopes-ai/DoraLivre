import raw from "../../data/catalogo.json";
import metaRaw from "../../data/series-meta.json";
import type { Catalog, Episode, Series } from "./types";

type RawEpisode = Episode & { publicado: boolean };
type RawSeries = {
  slug: string;
  titulo: string;
  tituloOriginal: string | null;
  ordem: number;
  publicado: boolean;
  episodios: RawEpisode[];
};
type Meta = Partial<Pick<Series, "sinopse" | "generos" | "elenco" | "ano" | "nota" | "poster" | "destaque">>;

const meta = metaRaw as unknown as Record<string, Meta>;

function cleanMeta(m: Meta | undefined): Meta {
  if (!m) return {};
  const out: Meta = {};
  if (typeof m.sinopse === "string" && m.sinopse.trim()) out.sinopse = m.sinopse.trim();
  if (Array.isArray(m.generos)) {
    const g = m.generos.filter((x) => typeof x === "string" && x.trim());
    if (g.length) out.generos = g;
  }
  if (Array.isArray(m.elenco)) {
    const e = m.elenco.filter((x) => typeof x === "string" && x.trim());
    if (e.length) out.elenco = e;
  }
  if (typeof m.ano === "number") out.ano = m.ano;
  if (typeof m.nota === "number") out.nota = m.nota;
  if (typeof m.poster === "string" && m.poster.trim()) out.poster = m.poster.trim();
  if (m.destaque === true) out.destaque = true;
  return out;
}

export function getCatalog(): Catalog {
  const data = raw as unknown as { atualizadoEm: string; series: RawSeries[] };
  const series: Series[] = data.series
    .filter((s) => s.publicado)
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => {
      const episodios: Episode[] = s.episodios
        .filter((e) => e.publicado)
        .map(({ numero, rotulo, ordem, intervalo, canal, youtubeId }) => ({
          numero,
          rotulo,
          ordem,
          intervalo,
          canal,
          youtubeId,
        }));
      return {
        slug: s.slug,
        titulo: s.titulo,
        tituloOriginal: s.tituloOriginal,
        canais: [...new Set(episodios.map((e) => e.canal))],
        episodios,
        ...cleanMeta(meta[s.slug]),
      };
    })
    .filter((s) => s.episodios.length > 0);
  return { atualizadoEm: data.atualizadoEm, series };
}
