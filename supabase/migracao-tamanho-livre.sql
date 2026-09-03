-- Qdelícia Frutas — Controle de Caixas
-- Migração: tamanho do tipo de caixa passa a aceitar texto livre (setembro/2026)
--
-- A lista fechada PP/P/M/G/GG travava o cadastro quando aparecia um tamanho fora dela.
-- Agora PP a GG são apenas sugestões na tela; o banco só limita o comprimento.
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.

alter table public.tipos_caixa drop constraint if exists tipos_caixa_tamanho_check;

do $$ begin
  alter table public.tipos_caixa add constraint tipos_caixa_tamanho_check
    check (tamanho is null or length(tamanho) <= 12);
exception when duplicate_object then null;
end $$;

comment on column public.tipos_caixa.tamanho is 'Texto livre; PP a GG sao sugestoes na tela';
