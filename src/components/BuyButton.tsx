"use client";

import { useEffect, useRef, useState } from "react";
import type { ProdutoId } from "@/lib/products";
import { postJson } from "./AccountProvider";

/**
 * Cria o pedido no servidor (vinculado à conta autenticada) e abre o checkout.
 * Sem sessão, leva para /entrar e volta com ?comprar= para continuar a compra.
 */
export default function BuyButton({
  produto,
  children,
  className = "btn btn-primary btn-lg",
  autoStart = false,
  voltaBase = "/planos",
}: {
  produto: ProdutoId;
  children: React.ReactNode;
  className?: string;
  autoStart?: boolean;
  voltaBase?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const started = useRef(false);

  const comprar = async () => {
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/checkout", { produto });
    if (r.status === 401) {
      window.location.assign(`/entrar?volta=${encodeURIComponent(`${voltaBase}?comprar=${produto}`)}`);
      return;
    }
    if (!r.ok) {
      setBusy(false);
      return setMsg(String(r.data.erro ?? "Não foi possível abrir o checkout."));
    }
    window.location.assign(String(r.data.checkoutUrl));
  };

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      comprar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="buy">
      <button className={className} onClick={comprar} disabled={busy} data-produto={produto}>
        {busy ? "Abrindo checkout…" : children}
      </button>
      {msg && (
        <p className="nudge nudge-error" role="alert">
          {msg}
        </p>
      )}
    </div>
  );
}
