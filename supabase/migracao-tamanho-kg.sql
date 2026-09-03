-- Qdelícia Frutas — Controle de Caixas
-- Migração: tamanho e peso no tipo de caixa (setembro/2026)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.

alter table public.tipos_caixa add column if not exists tamanho text;
alter table public.tipos_caixa add column if not exists kg      numeric(10,3);

do $$ begin
  alter table public.tipos_caixa add constraint tipos_caixa_tamanho_check
    check (tamanho is null or tamanho in ('PP','P','M','G','GG'));
exception when duplicate_object then null;
end $$;

comment on column public.tipos_caixa.tamanho is 'PP, P, M, G ou GG — classificação comercial';
comment on column public.tipos_caixa.kg is 'Capacidade da caixa em quilos';
