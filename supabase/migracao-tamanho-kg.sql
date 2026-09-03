-- Qdelícia Frutas — Controle de Caixas
-- Migração: peso (kg) no tipo de caixa (setembro/2026)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.
--
-- Houve uma versão desta migração que criava também uma coluna `tamanho`. O campo foi
-- retirado do app antes de entrar em uso; os drops abaixo limpam quem chegou a rodá-la.

alter table public.tipos_caixa add column if not exists kg numeric(10,3);
comment on column public.tipos_caixa.kg is 'Capacidade da caixa em quilos';

alter table public.tipos_caixa drop constraint if exists tipos_caixa_tamanho_check;
alter table public.tipos_caixa drop column     if exists tamanho;
