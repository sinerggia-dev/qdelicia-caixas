-- Qdelícia Frutas — Controle de Caixas
-- Esquema do banco no Supabase (Postgres).
--
-- COMO USAR: painel do Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- É idempotente: pode rodar de novo sem estragar o que já existe.
--
-- SEGURANÇA: o RLS fica LIGADO e SEM POLÍTICA em todas as tabelas. Isso é intencional.
-- Com RLS ligado e nenhuma política, a chave pública (anon) não lê nem escreve nada.
-- Quem acessa é a função no servidor, com a chave service_role, que ignora RLS.
-- Nunca coloque a service_role no código do site — ela vive só na variável de ambiente da Vercel.

-- ============================================================ locais
-- Galpões, filiais e clientes: todos são "nós" que guardam caixas.
create table if not exists public.locais (
  id             text primary key,
  tipo           text        not null check (tipo in ('GALPAO','FILIAL','CLIENTE')),
  nome           text        not null,
  responsavel    text        not null default '',
  telefone       text        not null default '',
  limite_caixas  integer,
  dias_prazo     integer,
  token          text        not null unique,
  ativo          boolean     not null default true,
  obs            text        not null default '',
  criado_em      timestamptz not null default now()
);

comment on column public.locais.token is 'Código do link só-leitura do cliente (extrato.html?t=...)';
comment on column public.locais.limite_caixas is 'Teto contratado; acima disso o painel marca o cliente';
comment on column public.locais.dias_prazo is 'Prazo de devolução; nulo usa o padrão de Config';

-- ============================================================ tipos_caixa
create table if not exists public.tipos_caixa (
  id          text primary key,
  nome        text          not null,
  valor_unit  numeric(12,2) not null default 0,
  ativo       boolean       not null default true
);

comment on column public.tipos_caixa.valor_unit is 'Transforma caixa perdida em R$ no painel';

-- ============================================================ usuarios
create table if not exists public.usuarios (
  id            text primary key,
  nome          text    not null,
  perfil        text    not null check (perfil in ('ADMIN','GALPAO','MOTORISTA','PROMOTOR')),
  pin           text    not null,
  telefone      text    not null default '',
  local_padrao  text    references public.locais(id),
  ativo         boolean not null default true
);

comment on column public.usuarios.pin is 'PIN curto de operação, não é senha. A proteção real é a função no servidor.';

-- ============================================================ movimentos
-- O livro-razão. Só acrescenta: movimento errado é cancelado, nunca apagado.
create table if not exists public.movimentos (
  id              text primary key,
  client_key      text unique,
  data_hora       timestamptz not null default now(),
  data_ref        date        not null,
  tipo            text        not null check (tipo in ('SAIDA','DEVOLUCAO','TRANSFERENCIA','PERDA','AJUSTE')),
  origem_id       text        references public.locais(id),
  destino_id      text        references public.locais(id),
  tipo_caixa_id   text        not null references public.tipos_caixa(id),
  qtd             integer     not null,
  qtd_conferida   integer,
  status          text        not null default 'CONFIRMADO' check (status in ('CONFIRMADO','AGUARDANDO')),
  romaneio        text        not null default '',
  usuario_id      text        references public.usuarios(id),
  perfil          text,
  obs             text        not null default '',
  assinatura_url  text,
  foto_url        text,
  conferido_em    timestamptz,
  conferido_por   text,
  cancelado       boolean     not null default false,
  motivo_cancel   text,
  -- origem e destino iguais nunca fazem sentido
  constraint mov_origem_destino_diferentes check (origem_id is distinct from destino_id)
);

comment on column public.movimentos.client_key is
  'Chave gerada no celular. O UNIQUE aqui é o que impede a fila offline de lançar duas vezes.';
comment on column public.movimentos.qtd_conferida is
  'Contagem do galpão na chegada. Quando preenchida, é ela que vale no saldo — a diferença para qtd é a divergência.';
comment on column public.movimentos.status is
  'AGUARDANDO = contado no cliente, ainda não confere no saldo. Só CONFIRMADO move saldo.';

create index if not exists movimentos_data_ref_idx    on public.movimentos (data_ref);
create index if not exists movimentos_origem_idx      on public.movimentos (origem_id);
create index if not exists movimentos_destino_idx     on public.movimentos (destino_id);
-- a tela de conferência busca exatamente por isto
create index if not exists movimentos_pendentes_idx   on public.movimentos (tipo, status)
  where cancelado = false;

-- ============================================================ config
create table if not exists public.config (
  chave text primary key,
  valor text not null default ''
);

-- ============================================================ RLS
-- Ligado e sem política: fecha a porta para a chave pública.
alter table public.locais      enable row level security;
alter table public.tipos_caixa enable row level security;
alter table public.usuarios    enable row level security;
alter table public.movimentos  enable row level security;
alter table public.config      enable row level security;

-- ============================================================ storage
-- Canhotos (assinatura) e fotos de romaneio, no lugar da pasta do Drive.
insert into storage.buckets (id, name, public)
values ('canhotos', 'canhotos', true)
on conflict (id) do nothing;
