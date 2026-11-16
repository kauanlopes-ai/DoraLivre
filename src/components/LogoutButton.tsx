"use client";

import { postJson } from "./AccountProvider";

export default function LogoutButton({ label = "Sair", volta = "/", className = "btn btn-ghost btn-sm" }: { label?: string; volta?: string; className?: string }) {
  return (
    <button
      className={className}
      onClick={async () => {
        await postJson("/api/auth/sair", {});
        window.location.assign(volta);
      }}
    >
      {label}
    </button>
  );
}
