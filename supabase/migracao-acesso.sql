-- Qdelícia Frutas — Controle de Caixas
-- Migração: acesso por e-mail/usuário + senha, e histórico de correção de movimento
-- Setembro/2026. Rode no SQL Editor do Supabase. É seguro rodar de novo.

-- ============================================================ 1. login do escritório
alter table public.usuarios add column if not exists email       text;
alter table public.usuarios add column if not exists usuario     text;
alter table public.usuarios add column if not exists senha_hash  text;

comment on column public.usuarios.email is 'Login do escritório; aceito junto com `usuario`';
comment on column public.usuarios.usuario is 'Apelido curto de login, para quem não tem e-mail da empresa';
comment on column public.usuarios.senha_hash is 'scrypt no formato s1$N$salt$hash. Nunca guarde senha em texto.';

-- Índice único ignorando maiúsculas: "Natanael" e "natanael" não podem coexistir.
create unique index if not exists usuarios_email_unico
  on public.usuarios (lower(email))   where email   is not null and email   <> '';
create unique index if not exists usuarios_usuario_unico
  on public.usuarios (lower(usuario)) where usuario is not null and usuario <> '';

-- ============================================================ 2. correção de movimento
-- O livro-razão continua só acrescentando: corrigir não sobrescreve em silêncio, empilha
-- o que mudou aqui. Cada item: {em, por, campo, de, para, motivo}.
alter table public.movimentos add column if not exists historico jsonb not null default '[]'::jsonb;

comment on column public.movimentos.historico is
  'Correções feitas pelo escritório. Guarda valor antigo, novo, autor e motivo — nada se perde.';

-- ============================================================ 3. primeiro acesso do admin
-- Dá ao Administrador um e-mail e um usuário para ele conseguir entrar na tela nova.
-- A senha NÃO é definida aqui: rode a ação `definirSenha` pelo app, ou peça para o
-- responsável criar a dele no primeiro acesso. Sem senha, o login por senha é recusado.
update public.usuarios
   set usuario = coalesce(nullif(usuario, ''), 'admin')
 where id = 'U001';
