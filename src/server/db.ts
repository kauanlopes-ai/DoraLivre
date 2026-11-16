import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { syncCatalog } from "./catalog-sync";

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __dlSql?: Sql; __dlReady?: Promise<void> };

function client(): Sql {
  if (!g.__dlSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__dlSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: false, // compatível com o pooler do Supabase (porta 6543)
      onnotice: () => {},
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    });
  }
  return g.__dlSql;
}

/** Garante o esquema e sincroniza o catálogo (uma vez por instância do servidor). */
export async function db(): Promise<Sql> {
  const sql = client();
  if (!g.__dlReady) {
    g.__dlReady = (async () => {
      const schema = fs.readFileSync(path.join(process.cwd(), "supabase/schema.sql"), "utf8");
      // Trava para que instâncias simultâneas não criem o esquema ao mesmo tempo
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(724201)`;
        await tx.unsafe(schema);
        await syncCatalog(tx as unknown as Sql);
      });
    })().catch((err) => {
      g.__dlReady = undefined;
      throw err;
    });
  }
  await g.__dlReady;
  return sql;
}
