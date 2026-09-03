-- Qdelícia Frutas — Controle de Caixas
-- Migração: lista de motoristas (setembro/2026)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.
-- (Já incluída em migracao.sql.)

insert into public.config (chave, valor) values
  ('motoristas', E'Arilson\nChico\nDinho\nIsaque\nPaulino\nPlínio\nRamos\nValcy\nValcy (Jr.)\nVando\nWelison')
on conflict (chave) do nothing;
