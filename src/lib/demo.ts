import type { HistoricoItem, MaratonaData } from "./maratona";
import type { Series } from "./types";

/** Dados de exemplo (com títulos reais do catálogo) para a prévia da Minha maratona. */
export function demoMaratona(series: Series[], agora = Date.now()): MaratonaData {
  const s = (slug: string) => series.find((x) => x.slug === slug);
  const ep = (slug: string, i: number) => s(slug)?.episodios[i]?.youtubeId;
  const h = (min: number) => new Date(agora - min * 60_000).toISOString();
  const pick = <T,>(xs: (T | undefined | "" | false)[]) => xs.filter(Boolean) as T[];
  const historico = pick<HistoricoItem>([
    ep("quando-eu-encontrar-a-lua", 3) && { serie_slug: "quando-eu-encontrar-a-lua", youtube_id: ep("quando-eu-encontrar-a-lua", 3)!, aberto_em: h(35) },
    ep("o-melhor-de-tudo", 1) && { serie_slug: "o-melhor-de-tudo", youtube_id: ep("o-melhor-de-tudo", 1)!, aberto_em: h(60 * 20) },
    ep("a-oliveira-branca", 4) && { serie_slug: "a-oliveira-branca", youtube_id: ep("a-oliveira-branca", 4)!, aberto_em: h(60 * 26) },
    ep("quando-eu-encontrar-a-lua", 2) && { serie_slug: "quando-eu-encontrar-a-lua", youtube_id: ep("quando-eu-encontrar-a-lua", 2)!, aberto_em: h(60 * 27) },
  ]);
  const assistidos = pick([
    ...[0, 1, 2].map((i) => ep("quando-eu-encontrar-a-lua", i)),
    ep("o-melhor-de-tudo", 0),
    ...[0, 1, 2, 3, 4].map((i) => ep("a-oliveira-branca", i)),
  ]);
  return {
    favoritos: ["amor-fora-de-controle", "a-oliveira-branca"].filter((x) => s(x)),
    assistidos,
    seguindo: ["quando-eu-encontrar-a-lua", "o-melhor-de-tudo"].filter((x) => s(x)),
    historico,
    listas: [
      { id: "demo-1", nome: "Para o fim de semana", posicao: 0, itens: ["genius-girlfriend", "o-destino-te-chama"].filter((x) => s(x)) },
      { id: "demo-2", nome: "Com Zhang Linghe", posicao: 1, itens: ["amor-fora-de-controle", "o-melhor-de-tudo", "em-busca-do-jade"].filter((x) => s(x)) },
    ],
    avisos: ep("quando-eu-encontrar-a-lua", 4)
      ? [{ id: -1, serie_slug: "quando-eu-encontrar-a-lua", youtube_id: ep("quando-eu-encontrar-a-lua", 4)!, criado_em: h(90), lido: false }]
      : [],
  };
}
