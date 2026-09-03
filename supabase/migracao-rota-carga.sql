-- Qdelícia Frutas — Controle de Caixas
-- Migração: rota na carga que sai do galpão + as seis rotas da operação (setembro/2026)
-- Rode no SQL Editor do Supabase. É seguro rodar de novo.
-- (Já incluída em migracao.sql — use aquele arquivo se não souber o que já rodou.)

alter table public.movimentos add column if not exists rota text;
comment on column public.movimentos.rota is 'Nome da rota em que a carga saiu do galpao';

insert into public.locais (id, tipo, nome, token) values
  ('L010','ROTA','Caruaru',     substr(md5(random()::text||'caruaru'),     1, 10)),
  ('L011','ROTA','João Pessoa', substr(md5(random()::text||'joaopessoa'),  1, 10)),
  ('L012','ROTA','Maceió',      substr(md5(random()::text||'maceio'),      1, 10)),
  ('L013','ROTA','Natal',       substr(md5(random()::text||'natal'),       1, 10)),
  ('L014','ROTA','Recife',      substr(md5(random()::text||'recife'),      1, 10)),
  ('L015','ROTA','Russas',      substr(md5(random()::text||'russas'),      1, 10))
on conflict (id) do nothing;
