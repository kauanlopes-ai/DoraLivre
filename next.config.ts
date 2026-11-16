import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O servidor lê o esquema do banco em tempo de execução
  outputFileTracingIncludes: { "/**": ["./supabase/schema.sql"] },
};

export default nextConfig;
