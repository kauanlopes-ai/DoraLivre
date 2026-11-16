-- DoraLivre — esquema do banco (Postgres / Supabase).
-- Idempotente: o servidor executa este arquivo na primeira conexão.
-- O acesso é feito só pelo servidor (DATABASE_URL); o navegador nunca fala com o banco.

create table if not exists contas (
  user_id uuid primary key,              -- ID do usuário no Supabase Auth
  email text not null,
  criado_em timestamptz not null default now()
);

-- Pedidos: sempre vinculados ao ID da conta autenticada ANTES do checkout.
create table if not exists pedidos (
  id uuid primary key,
  user_id uuid not null references contas(user_id),
  produto text not null check (produto in ('basico', 'premium', 'upgrade')),
  valor_centavos integer not null,
  moeda text not null default 'BRL',
  status text not null default 'criado'
    check (status in ('criado', 'pendente', 'aprovado', 'recusado', 'reembolsado', 'contestado', 'divergente')),
  provedor text not null,
  preferencia_id text,
  checkout_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aprovado_em timestamptz
);
create index if not exists pedidos_user_idx on pedidos(user_id);

-- Pagamentos informados pelo provedor (um pedido pode ter várias tentativas).
create table if not exists pagamentos (
  provedor text not null,
  pagamento_id text not null,
  pedido_id uuid not null references pedidos(id),
  status text not null,
  status_detalhe text,
  valor_centavos integer not null,
  moeda text not null,
  atualizado_no_provedor text,
  registrado_em timestamptz not null default now(),
  primary key (provedor, pagamento_id)
);

-- Notificações recebidas (idempotência e auditoria).
create table if not exists eventos_webhook (
  id bigserial primary key,
  provedor text not null,
  chave text not null,                    -- pagamento:status:data_ultima_atualizacao
  pedido_id uuid,
  resultado text not null,
  recebido_em timestamptz not null default now(),
  unique (provedor, chave)
);

-- Histórico de mudanças de acesso (uma linha por transição de status de pedido).
create table if not exists historico_acesso (
  id bigserial primary key,
  pedido_id uuid not null references pedidos(id),
  status text not null,
  registrado_em timestamptz not null default now(),
  unique (pedido_id, status)
);

-- Básico
create table if not exists favoritos (
  user_id uuid not null references contas(user_id),
  serie_slug text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, serie_slug)
);
create table if not exists assistidos (
  user_id uuid not null references contas(user_id),
  youtube_id text not null,
  serie_slug text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, youtube_id)
);

-- Premium
create table if not exists historico (
  id bigserial primary key,
  user_id uuid not null references contas(user_id),
  serie_slug text not null,
  youtube_id text not null,
  aberto_em timestamptz not null default now()
);
create index if not exists historico_user_idx on historico(user_id, aberto_em desc);

create table if not exists listas (
  id uuid primary key,
  user_id uuid not null references contas(user_id),
  nome text not null,
  posicao integer not null default 0,
  criado_em timestamptz not null default now()
);
create table if not exists lista_itens (
  lista_id uuid not null references listas(id) on delete cascade,
  serie_slug text not null,
  posicao integer not null default 0,
  primary key (lista_id, serie_slug)
);

create table if not exists seguindo (
  user_id uuid not null references contas(user_id),
  serie_slug text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, serie_slug)
);

-- Episódios conhecidos pelo DoraLivre: detecta alterações reais no catálogo.
create table if not exists catalogo_episodios (
  youtube_id text primary key,
  serie_slug text not null,
  numero text not null,
  adicionado_em timestamptz not null default now()
);
create table if not exists avisos (
  id bigserial primary key,
  user_id uuid not null references contas(user_id),
  serie_slug text not null,
  youtube_id text not null,
  criado_em timestamptz not null default now(),
  lido_em timestamptz,
  unique (user_id, youtube_id)
);

-- ===== Somente modo de teste (simuladores locais de Supabase Auth e Mercado Pago) =====
create table if not exists sim_auth_usuarios (
  id uuid primary key,
  email text not null unique
);
create table if not exists sim_auth_codigos (
  email text primary key,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0
);
create table if not exists sim_auth_tokens (
  token_hash text primary key,
  user_id uuid not null,
  tipo text not null,                     -- access | refresh
  expira_em timestamptz not null,
  revogado boolean not null default false
);
create table if not exists sim_auth_pkce (
  codigo text primary key,
  user_id uuid not null,
  desafio text not null,
  expira_em timestamptz not null
);
create table if not exists sim_emails (
  id bigserial primary key,
  para text not null,
  assunto text not null,
  corpo text not null,
  enviado_em timestamptz not null default now()
);
create table if not exists sim_mp_preferencias (
  id text primary key,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);
create table if not exists sim_mp_pagamentos (
  id text primary key,
  preferencia_id text not null,
  dados jsonb not null
);

-- Supabase expõe o schema public pela API REST com a chave anônima.
-- RLS ligado e SEM políticas: a chave pública não lê nem grava nada; só o servidor (dono das tabelas, via DATABASE_URL) acessa.
alter table contas enable row level security;
alter table pedidos enable row level security;
alter table pagamentos enable row level security;
alter table eventos_webhook enable row level security;
alter table historico_acesso enable row level security;
alter table favoritos enable row level security;
alter table assistidos enable row level security;
alter table historico enable row level security;
alter table listas enable row level security;
alter table lista_itens enable row level security;
alter table seguindo enable row level security;
alter table catalogo_episodios enable row level security;
alter table avisos enable row level security;
alter table sim_auth_usuarios enable row level security;
alter table sim_auth_codigos enable row level security;
alter table sim_auth_tokens enable row level security;
alter table sim_auth_pkce enable row level security;
alter table sim_emails enable row level security;
alter table sim_mp_preferencias enable row level security;
alter table sim_mp_pagamentos enable row level security;
