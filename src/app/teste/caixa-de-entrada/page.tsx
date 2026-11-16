import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { modes } from "@/server/config";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caixa de entrada de teste — DoraLivre", robots: { index: false } };

export default async function CaixaTeste() {
  if (modes().auth !== "simulado") notFound();
  const sql = await db();
  const emails = await sql`select * from sim_emails order by enviado_em desc limit 30`;
  return (
    <PageShell className="narrow">
      <h1>Caixa de entrada de teste</h1>
      <p className="lead">Somente no ambiente de teste. Em produção, o código chega ao e-mail real pelo Supabase Auth.</p>
      <ul className="mailbox">
        {emails.map((e) => (
          <li key={e.id} data-para={e.para}>
            <strong>{e.para}</strong>
            <span>{e.assunto}</span>
            <p className="mail-body">{e.corpo}</p>
            <time>{new Date(e.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
