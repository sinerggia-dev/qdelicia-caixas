-- Qdelícia Frutas — Controle de Caixas
-- MIGRAÇÃO ÚNICA — rode este arquivo e pronto.
--
-- Junta tudo que o banco precisa desde a criação inicial (schema.sql + seed.sql).
-- É idempotente do começo ao fim: rodar de novo não estraga nada e não duplica linha.
-- Se você não sabe quais migrações já rodou, rode esta.
--
--   Supabase > SQL Editor > New query > colar > Run
--
-- Desligue a tradução automática do navegador antes de colar: ela chega a traduzir o
-- próprio SQL na tela ("alter table" vira "Mesa de mudança").

-- ============================================================ 1. rotas
-- A rota é o caminhão em circulação e guarda caixa como qualquer outro local. É o que
-- impede o que subiu no caminhão e não foi entregue de aparecer na conta do cliente.

alter table public.locais drop constraint if exists locais_tipo_check;
alter table public.locais add constraint locais_tipo_check
  check (tipo in ('GALPAO','FILIAL','CLIENTE','ROTA'));

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

-- ============================================================ 2. acesso do escritório
-- Login por e-mail ou nome de usuário, com senha em hash. O PIN continua para o campo.

alter table public.usuarios add column if not exists email       text;
alter table public.usuarios add column if not exists usuario     text;
alter table public.usuarios add column if not exists senha_hash  text;

comment on column public.usuarios.senha_hash is 'scrypt no formato s1$N$salt$hash. Nunca guarde senha em texto.';

-- Únicos ignorando maiúsculas: "Natanael" e "natanael" não podem coexistir.
create unique index if not exists usuarios_email_unico
  on public.usuarios (lower(email))   where email   is not null and email   <> '';
create unique index if not exists usuarios_usuario_unico
  on public.usuarios (lower(usuario)) where usuario is not null and usuario <> '';

update public.usuarios
   set usuario = coalesce(nullif(usuario, ''), 'admin')
 where id = 'U001';

-- ============================================================ 3. correção de movimento
-- O livro-razão continua só acrescentando: corrigir não sobrescreve em silêncio, empilha
-- aqui o que mudou. Cada item: {em, por, campo, de, para, motivo}.

alter table public.movimentos add column if not exists historico jsonb not null default '[]'::jsonb;

-- ============================================================ 4. carga saindo do galpão
alter table public.movimentos add column if not exists motorista text;
alter table public.movimentos add column if not exists placa     text;

comment on column public.movimentos.motorista is 'Quem levou a carga - preenchido na saida do galpao';
comment on column public.movimentos.placa is 'Placa do veiculo que levou a carga';

-- ============================================================ 5. peso do tipo de caixa
alter table public.tipos_caixa add column if not exists kg numeric(10,3);
comment on column public.tipos_caixa.kg is 'Capacidade da caixa em quilos';

-- Houve uma versão que criava também `tamanho`. O campo foi retirado do app antes de
-- entrar em uso; isto limpa quem chegou a rodá-la.
alter table public.tipos_caixa drop constraint if exists tipos_caixa_tamanho_check;
alter table public.tipos_caixa drop column     if exists tamanho;

-- ============================================================ 6. rota na carga
alter table public.movimentos add column if not exists rota text;
comment on column public.movimentos.rota is 'Nome da rota em que a carga saiu do galpao';

-- ============================================================ 7. as rotas da operacao
-- Cadastradas como locais tipo ROTA: cada uma guarda caixa (o caminhao) e tem saldo proprio.
-- IDs na faixa L010+ para nao colidir com o que ja existe nem com o que o app criar depois.
insert into public.locais (id, tipo, nome, token) values
  ('L010','ROTA','Caruaru',     substr(md5(random()::text||'caruaru'),     1, 10)),
  ('L011','ROTA','João Pessoa', substr(md5(random()::text||'joaopessoa'),  1, 10)),
  ('L012','ROTA','Maceió',      substr(md5(random()::text||'maceio'),      1, 10)),
  ('L013','ROTA','Natal',       substr(md5(random()::text||'natal'),       1, 10)),
  ('L014','ROTA','Recife',      substr(md5(random()::text||'recife'),      1, 10)),
  ('L015','ROTA','Russas',      substr(md5(random()::text||'russas'),      1, 10))
on conflict (id) do nothing;

-- ============================================================ 8. motoristas da operacao
-- Um nome por linha, em config. Motorista aqui e quem leva a carga, nao quem usa o app:
-- por isso nao vira usuario com PIN.
insert into public.config (chave, valor) values
  ('motoristas', E'Arilson
Chico
Dinho
Isaque
Paulino
Plínio
Ramos
Valcy
Valcy (Jr.)
Vando
Welison')
on conflict (chave) do nothing;

-- ============================================================ 9. sobras antigas
-- O app não trabalha mais com valor em dinheiro.
alter table public.tipos_caixa drop column if exists valor_unit;
