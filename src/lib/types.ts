export type Episode = {
  /** Número como está no arquivo (ex.: "01" ou "01–03"). */
  numero: string;
  /** Rótulo curto mostrado no player (ex.: "1" ou "1–3"). */
  rotulo: string;
  ordem: number;
  intervalo: [number, number] | null;
  canal: string;
  youtubeId: string;
};

export type Series = {
  slug: string;
  titulo: string;
  tituloOriginal: string | null;
  canais: string[];
  episodios: Episode[];
  // Metadados opcionais — só aparecem quando preenchidos em data/series-meta.json
  sinopse?: string;
  generos?: string[];
  elenco?: string[];
  ano?: number;
  nota?: number;
  poster?: string;
  destaque?: boolean;
};

export type Catalog = {
  atualizadoEm: string;
  series: Series[];
};
