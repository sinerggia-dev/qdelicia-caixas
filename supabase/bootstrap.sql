-- Qdelícia Frutas — Controle de Caixas
-- BOOTSTRAP — rode UMA VEZ. Depois disso o app aplica as migrações sozinho.
--
--   Supabase > SQL Editor > New query > colar > Run
--   (desligue a tradução automática do navegador antes)
--
-- O que isto faz: cria um registro do que já foi aplicado e ensina o banco a aplicar uma
-- migração. A partir daqui, quando eu publicar código que precisa de coluna nova, a própria
-- API aplica na primeira chamada — sem você abrir o SQL Editor de novo.

-- ============================================================ registro
create table if not exists public.migracoes (
  id          text primary key,
  aplicada_em timestamptz not null default now()
);

alter table public.migracoes enable row level security;

comment on table public.migracoes is 'O que já foi aplicado. O app consulta antes de rodar qualquer coisa.';

-- ============================================================ aplicador
-- `security definer` faz a função rodar com o dono dela (postgres), que pode fazer DDL.
-- Sem isso, nem a service_role conseguiria criar tabela por aqui.
--
-- O `id` dentro da função é o que torna a coisa segura de repetir: se já foi aplicada,
-- ela retorna sem executar nada. Duas chamadas ao mesmo tempo não aplicam duas vezes.
create or replace function public.aplicar_migracao(id_migracao text, sql_migracao text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.migracoes where id = id_migracao) then
    return 'ja-aplicada';
  end if;

  execute sql_migracao;

  insert into public.migracoes (id) values (id_migracao)
  on conflict (id) do nothing;

  return 'aplicada';
end;
$$;

-- Quem pode chamar: só quem já tem a chave secreta, que vive na Vercel.
-- As chaves públicas (anon) e de usuário logado (authenticated) ficam de fora.
revoke all on function public.aplicar_migracao(text, text) from public;
revoke all on function public.aplicar_migracao(text, text) from anon;
revoke all on function public.aplicar_migracao(text, text) from authenticated;

-- ============================================================ o que já existe hoje
-- Marca como aplicadas as migrações que você já rodou à mão, para o app não repetir.
-- Todas são idempotentes, então repetir também não quebraria — isto é só higiene.
insert into public.migracoes (id) values
  ('2026-09-01-rotas'),
  ('2026-09-03-acesso'),
  ('2026-09-03-correcao-movimento'),
  ('2026-09-03-motorista-placa'),
  ('2026-09-03-peso-caixa'),
  ('2026-09-03-rota-na-carga'),
  ('2026-09-03-rotas-da-operacao')
on conflict (id) do nothing;
