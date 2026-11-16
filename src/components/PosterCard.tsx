"use client";

import type { Series } from "@/lib/types";

// Paletas próprias para os cards tipográficos (sem capa autorizada)
const PALETTES = [
  ["#2b1d5c", "#f08a6c"],
  ["#14324a", "#7fd1c7"],
  ["#3a1534", "#ff8fb1"],
  ["#1c2a1f", "#c9e27a"],
  ["#2a1a10", "#ffc56b"],
  ["#161a3d", "#9ab4ff"],
  ["#331c1c", "#ff9a7a"],
  ["#10282b", "#ffe3a3"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Ex.: [1,2,3,7,8–10] -> "1–3, 7, 8–10" (não esconde lacunas). */
export function episodeRanges(series: Series) {
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  const flush = () => {
    if (start === null || prev === null) return;
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
  };
  for (const e of series.episodios) {
    if (e.intervalo || Number.isNaN(parseInt(e.numero, 10))) {
      flush();
      start = prev = null;
      parts.push(e.rotulo);
      continue;
    }
    if (prev !== null && e.ordem === prev + 1) prev = e.ordem;
    else {
      flush();
      start = prev = e.ordem;
    }
  }
  flush();
  return parts.join(", ");
}

export function countLabel(n: number) {
  return `${n} ${n === 1 ? "ep. disponível" : "eps. disponíveis"}`;
}

export default function PosterCard({ series, onOpen }: { series: Series; onOpen: (s: Series) => void }) {
  const [bg, accent] = PALETTES[hash(series.slug) % PALETTES.length];
  const n = series.episodios.length;
  const range = `${n > 1 ? "Eps." : "Ep."} ${episodeRanges(series)}`;
  return (
    <button
      className="poster"
      onClick={() => onOpen(series)}
      aria-label={`${series.titulo} — ${countLabel(n)}. Assistir`}
      style={{ ["--p-bg" as string]: bg, ["--p-accent" as string]: accent }}
    >
      <span className="poster-art">
        {series.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={series.poster} alt="" loading="lazy" />
        ) : (
          <span className="poster-type" aria-hidden>
            <span className="poster-moon" />
            <span className="poster-title">{series.titulo}</span>
            {series.tituloOriginal && <span className="poster-orig">{series.tituloOriginal}</span>}
            <span className="poster-range">{range}</span>
          </span>
        )}
        <span className="poster-badge">DUB PT-BR</span>
        <span className="poster-play" aria-hidden>
          ▶
        </span>
      </span>
      <span className="poster-caption">
        <span className="poster-name">{series.titulo}</span>
        <span className="poster-meta">
          {countLabel(n)}
          {series.generos?.length ? ` · ${series.generos.slice(0, 2).join(" · ")}` : ""}
        </span>
      </span>
    </button>
  );
}
