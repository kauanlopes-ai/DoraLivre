#!/usr/bin/env node
/**
 * Importa data/catalogo-doramas-pt-br.md -> data/catalogo.json
 *
 * - Cada seção "### Título" vira uma série; cada linha da tabela vira um episódio.
 * - A numeração original é preservada (inclusive lacunas, ex.: 01, 02, 05).
 * - Uma linha com intervalo ("01–03" ou "01-03") vira UMA opção no player.
 * - Se data/catalogo.json já existir, o catálogo é atualizado pelo ID do YouTube:
 *   IDs que saíram do arquivo atual ficam com "publicado": false (despublicados),
 *   e não aparecem no site. Nada da interface precisa ser alterado.
 *
 * Uso: node scripts/importar-catalogo.mjs [arquivo.md]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mdPath = path.resolve(root, process.argv[2] ?? "data/catalogo-doramas-pt-br.md");
const outPath = path.join(root, "data/catalogo.json");

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitTitle(raw) {
  // "O Justiceiro das Sombras (Shadow Punisher)" -> título + título original
  const m = raw.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
  return m ? { titulo: m[1].trim(), tituloOriginal: m[2].trim() } : { titulo: raw.trim(), tituloOriginal: null };
}

function parseEpisodeNumber(cell) {
  const raw = cell.trim();
  const range = raw.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    return { numero: raw, rotulo: `${a}–${b}`, ordem: a, intervalo: [a, b] };
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return { numero: raw, rotulo: raw, ordem: Number.MAX_SAFE_INTEGER, intervalo: null };
  return { numero: raw, rotulo: String(n), ordem: n, intervalo: null };
}

export function parseMarkdown(md) {
  const series = [];
  let current = null;
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      const { titulo, tituloOriginal } = splitTitle(h[1]);
      current = { slug: slugify(titulo), titulo, tituloOriginal, episodios: [] };
      series.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = null; // fim da seção de episódios (ex.: "## Instruções")
      continue;
    }
    if (!current || !line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    const id = cells[2].replace(/`/g, "").trim();
    if (!YT_ID.test(id)) continue; // cabeçalho, separador ou linha inválida
    const ep = parseEpisodeNumber(cells[0]);
    current.episodios.push({ ...ep, canal: cells[1], youtubeId: id });
  }
  return series.filter((s) => s.episodios.length > 0);
}

function main() {
  const md = fs.readFileSync(mdPath, "utf8");
  const parsed = parseMarkdown(md);
  const previous = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
  const now = new Date().toISOString();

  // Índice da versão anterior por ID do YouTube
  const prevById = new Map();
  for (const s of previous?.series ?? []) for (const e of s.episodios) prevById.set(e.youtubeId, { serie: s, ep: e });

  const seen = new Set();
  const duplicates = [];
  const series = parsed.map((s, i) => ({
    slug: s.slug,
    titulo: s.titulo,
    tituloOriginal: s.tituloOriginal,
    ordem: i + 1,
    publicado: true,
    episodios: s.episodios
      .filter((e) => {
        if (seen.has(e.youtubeId)) {
          duplicates.push(e.youtubeId);
          return false;
        }
        seen.add(e.youtubeId);
        return true;
      })
      .map((e) => ({
        ...e,
        publicado: true,
        importadoEm: prevById.get(e.youtubeId)?.ep.importadoEm ?? now,
      }))
      .sort((a, b) => a.ordem - b.ordem),
  }));

  // Despublica o que saiu do arquivo atual (mantém o registro para histórico)
  const removed = [];
  for (const [id, { serie, ep }] of prevById) {
    if (seen.has(id)) continue;
    removed.push(id);
    let target = series.find((s) => s.slug === serie.slug);
    if (!target) {
      target = { ...serie, publicado: false, ordem: series.length + 1, episodios: [] };
      series.push(target);
    }
    target.episodios.push({ ...ep, publicado: false, despublicadoEm: ep.despublicadoEm ?? now });
    target.episodios.sort((a, b) => a.ordem - b.ordem);
  }
  for (const s of series) s.publicado = s.episodios.some((e) => e.publicado);

  const payload = {
    fonte: path.relative(root, mdPath),
    series,
  };
  const same = previous && JSON.stringify({ fonte: previous.fonte, series: previous.series }) === JSON.stringify(payload);
  const out = { atualizadoEm: same ? previous.atualizadoEm : now, ...payload };
  if (!same) fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  const pubSeries = series.filter((s) => s.publicado).length;
  const pubEps = series.reduce((n, s) => n + s.episodios.filter((e) => e.publicado).length, 0);
  console.log(
    `[catálogo] ${pubEps} episódios publicados em ${pubSeries} séries` +
      (removed.length ? ` · ${removed.length} despublicados` : "") +
      (duplicates.length ? ` · IDs duplicados ignorados: ${duplicates.join(", ")}` : "") +
      (same ? " · sem alterações" : ` · gravado em ${path.relative(root, outPath)}`),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
