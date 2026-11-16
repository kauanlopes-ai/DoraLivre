import type postgres from "postgres";
import { getCatalog } from "@/lib/catalog";

type Sql = ReturnType<typeof postgres>;

/**
 * Compara o catálogo publicado com os episódios já conhecidos pelo banco.
 * Episódios novos geram avisos para quem segue a série. Na primeira execução
 * (tabela vazia) o catálogo vira a linha de base e nenhum aviso é criado.
 */
export async function syncCatalog(sql: Sql) {
  const eps = getCatalog().series.flatMap((s) =>
    s.episodios.map((e) => ({ youtube_id: e.youtubeId, serie_slug: s.slug, numero: e.numero })),
  );
  if (!eps.length) return { novos: 0, avisos: 0 };
  const [{ n }] = await sql`select count(*)::int as n from catalogo_episodios`;
  const inserted = await sql`
    insert into catalogo_episodios ${sql(eps, "youtube_id", "serie_slug", "numero")}
    on conflict (youtube_id) do nothing
    returning youtube_id, serie_slug`;
  if (n === 0 || inserted.length === 0) return { novos: inserted.length, avisos: 0 };
  let avisos = 0;
  for (const row of inserted) {
    const r = await sql`
      insert into avisos (user_id, serie_slug, youtube_id)
      select user_id, ${row.serie_slug}, ${row.youtube_id} from seguindo where serie_slug = ${row.serie_slug}
      on conflict (user_id, youtube_id) do nothing`;
    avisos += r.count;
  }
  return { novos: inserted.length, avisos };
}
