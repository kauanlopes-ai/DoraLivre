/** Aceita só caminhos internos (evita redirecionamento aberto). */
export function safeVolta(v: string | null | undefined, fallback = "/conta") {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}
