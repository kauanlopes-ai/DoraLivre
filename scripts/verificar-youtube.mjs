#!/usr/bin/env node
/**
 * Verifica os vídeos do catálogo no YouTube e grava data/verificacao-youtube.json.
 *
 * Sempre: oEmbed oficial (existe? pode ser incorporado? canal e título).
 * Com YT_API_KEY definida: YouTube Data API v3 (videos.list) para
 *   status.embeddable, status.privacyStatus e contentDetails.regionRestriction (BR).
 *
 * Uso: node scripts/verificar-youtube.mjs        (ou YT_API_KEY=... npm run catalogo:verificar)
 *
 * Atenção: isto NÃO confirma a faixa de áudio PT-BR nem a reprodução até o fim a partir do Brasil.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/catalogo.json"), "utf8"));
const key = process.env.YT_API_KEY;

const eps = catalog.series.flatMap((s) =>
  s.episodios.filter((e) => e.publicado).map((e) => ({ serie: s.titulo, numero: e.numero, canal: e.canal, id: e.youtubeId })),
);

async function oembed(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { status: r.status };
    const j = await r.json();
    return { status: r.status, canal: j.author_name, titulo: j.title };
  } catch (err) {
    return { status: 0, erro: String(err) };
  }
}

async function dataApi(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${chunk.join(",")}&key=${key}`,
    );
    const j = await r.json();
    for (const it of j.items ?? []) {
      const rr = it.contentDetails?.regionRestriction;
      const brOk = rr?.allowed ? rr.allowed.includes("BR") : rr?.blocked ? !rr.blocked.includes("BR") : true;
      out.set(it.id, { embeddable: it.status?.embeddable, privacy: it.status?.privacyStatus, brasilPermitido: brOk });
    }
  }
  return out;
}

const results = [];
for (const e of eps) {
  const o = await oembed(e.id);
  const alerts = [];
  if (o.status !== 200) alerts.push(o.status === 401 ? "incorporação bloqueada" : `oEmbed ${o.status}`);
  if (o.canal && !o.canal.startsWith(e.canal)) alerts.push(`canal diferente: ${o.canal}`);
  const n = parseInt(e.numero, 10);
  const nums = [...(o.titulo ?? "").matchAll(/(?:EP|Episódio)\s*0*(\d+)/gi)].map((m) => parseInt(m[1], 10));
  if (nums.length && !nums.includes(n)) alerts.push(`número no título (${nums.join("/")}) difere de ${e.numero}`);
  if (new Set(nums).size > 1) alerts.push(`título cita números diferentes (${nums.join("/")})`);
  results.push({ ...e, oembed: o, alertas: alerts });
}

if (key) {
  const api = await dataApi(eps.map((e) => e.id));
  for (const r of results) {
    const a = api.get(r.id);
    r.dataApi = a ?? null;
    if (!a) r.alertas.push("não retornado pela Data API");
    else {
      if (a.embeddable === false) r.alertas.push("status.embeddable = false");
      if (!a.brasilPermitido) r.alertas.push("bloqueado no Brasil (regionRestriction)");
      if (a.privacy !== "public") r.alertas.push(`privacidade: ${a.privacy}`);
    }
  }
}

const out = { verificadoEm: new Date().toISOString(), usouDataApi: Boolean(key), resultados: results };
fs.writeFileSync(path.join(root, "data/verificacao-youtube.json"), JSON.stringify(out, null, 2) + "\n");
const ok = results.filter((r) => r.oembed.status === 200).length;
console.log(`[verificação] ${ok}/${results.length} respondem no oEmbed${key ? " · Data API consultada" : " · sem YT_API_KEY (Data API não consultada)"}`);
for (const r of results.filter((r) => r.alertas.length)) console.log(` ! ${r.serie} ep ${r.numero} (${r.id}): ${r.alertas.join("; ")}`);
