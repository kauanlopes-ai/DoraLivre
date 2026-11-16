"use client";

import { useState } from "react";
import { postJson } from "./AccountProvider";

/** Login por código de uso único enviado por e-mail (Supabase Auth). */
export default function LoginForm({ volta, teste }: { volta: string; teste: boolean }) {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enviar = async () => {
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/auth/codigo", { email });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.data.erro ?? "Não foi possível enviar o código."));
    setEtapa("codigo");
  };

  const verificar = async () => {
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/auth/verificar", { email, codigo });
    if (!r.ok) {
      setBusy(false);
      return setMsg(String(r.data.erro ?? "Código inválido."));
    }
    window.location.assign(volta);
  };

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (etapa === "email") enviar();
        else verificar();
      }}
    >
      {etapa === "email" ? (
        <>
          <label className="field">
            <span>Seu e-mail</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Enviando…" : "Receber código"}
          </button>
          <p className="fineprint">Sem senha: enviamos um código de 6 dígitos para o seu e-mail. A conta é criada no primeiro acesso.</p>
        </>
      ) : (
        <>
          <p className="auth-sent">
            Enviamos um código para <strong>{email}</strong>.{" "}
            {teste && (
              <>
                No ambiente de teste, ele aparece na{" "}
                <a href="/teste/caixa-de-entrada" target="_blank" rel="noreferrer">
                  caixa de entrada de teste
                </a>
                .
              </>
            )}
          </p>
          <label className="field">
            <span>Código de 6 dígitos</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={8}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="000000"
              autoFocus
            />
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" className="link-btn" onClick={() => { setEtapa("email"); setCodigo(""); }}>
            Usar outro e-mail
          </button>
        </>
      )}
      {msg && <p className="nudge nudge-error" role="alert">{msg}</p>}
    </form>
  );
}
