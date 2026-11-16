import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/Icons";
import { modes } from "@/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Google de teste — DoraLivre", robots: { index: false } };

/** Substitui a tela do Google no modo de teste. Em produção, quem autentica é o Google via Supabase Auth. */
export default async function GoogleTeste({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (modes().auth !== "simulado") notFound();
  const sp = await searchParams;
  const redirectTo = sp.redirect_to ?? "";
  const challenge = sp.code_challenge ?? "";

  return (
    <main className="sim-checkout">
      <div className="sim-card">
        <div className="sim-head">
          <Logo />
          <span className="sim-tag">Google de teste · Supabase Auth simulado</span>
        </div>
        <h1>Escolha uma conta</h1>
        <p className="fineprint">para continuar no DoraLivre. Em produção, esta tela é a do Google.</p>
        <form method="post" action="/api/teste/google" className="sim-actions">
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <input type="hidden" name="code_challenge" value={challenge} />
          <label className="field">
            <span>E-mail da conta Google de teste</span>
            <input type="email" name="email" required placeholder="voce@gmail.com" autoComplete="off" />
          </label>
          <button className="btn btn-primary btn-lg" name="acao" value="continuar">
            Continuar
          </button>
          <button className="btn btn-ghost" name="acao" value="cancelar" formNoValidate>
            Cancelar
          </button>
        </form>
      </div>
    </main>
  );
}
