import Home from "@/components/Home";
import { getCatalog } from "@/lib/catalog";

export default function Page() {
  return <Home catalog={getCatalog()} />;
}
