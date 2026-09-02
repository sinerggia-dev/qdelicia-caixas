-- Qdelícia Frutas — Controle de Caixas
-- Migração: rotas (setembro/2026)
--
-- Rode UMA VEZ no SQL Editor do Supabase, em bancos criados antes desta data.
-- Quem criar o banco do zero com o schema.sql já vem com tudo isto.
-- É seguro rodar de novo: cada passo verifica antes.

-- 1. ROTA passa a ser um tipo de local válido
alter table public.locais drop constraint if exists locais_tipo_check;
alter table public.locais add constraint locais_tipo_check
  check (tipo in ('GALPAO','FILIAL','CLIENTE','ROTA'));

-- 2. A rota aponta o motorista; o cliente aponta a rota
alter table public.locais add column if not exists motorista_id text;
alter table public.locais add column if not exists rota_id      text;

do $$ begin
  alter table public.locais
    add constraint locais_motorista_fk foreign key (motorista_id) references public.usuarios(id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.locais
    add constraint locais_rota_fk foreign key (rota_id) references public.locais(id);
exception when duplicate_object then null;
end $$;

create index if not exists locais_rota_idx on public.locais (rota_id);

-- 3. Limpeza pendente da remoção de valor, se ainda não foi feita
alter table public.tipos_caixa drop column if exists valor_unit;
