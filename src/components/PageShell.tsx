import SiteHeader from "./SiteHeader";
import { Logo } from "./Icons";

export default function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <SiteHeader />
      <main className={`page ${className}`}>{children}</main>
      <footer className="footer">
        <Logo />
        <p>
          O catálogo e o player são públicos e gratuitos. Os planos DoraLivre liberam recursos da conta (favoritos,
          episódios assistidos e a área Minha maratona). Os vídeos são exibidos pelo player oficial do YouTube, a partir
          dos canais oficiais.
        </p>
      </footer>
    </>
  );
}
