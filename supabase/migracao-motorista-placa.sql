-- Qdelícia Frutas — Controle de Caixas
-- Migração: motorista e placa na saída do galpão (setembro/2026)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.

alter table public.movimentos add column if not exists motorista text;
alter table public.movimentos add column if not exists placa     text;

comment on column public.movimentos.motorista is 'Quem levou a carga - preenchido na saida do galpao';
comment on column public.movimentos.placa is 'Placa do veiculo que levou a carga';
