/**
 * Qdelícia Frutas — Controle de Caixas
 * Migrações do banco, aplicadas pelo próprio app.
 *
 * COMO FUNCIONA
 * A API compara esta lista com a tabela `migracoes` e aplica o que falta, em ordem, na
 * primeira chamada depois de um deploy. Quem executa o DDL é a função `aplicar_migracao`,
 * criada uma única vez pelo `supabase/bootstrap.sql` — o PostgREST sozinho não faz DDL.
 *
 * COMO ACRESCENTAR UMA
 * Ponha um item novo NO FIM do array, com id novo. Regras que não são negociáveis:
 *
 *   1. Nunca edite nem remova um item já publicado. Quem já aplicou não vai reaplicar,
 *      e o banco de outra pessoa ficaria diferente do seu sem ninguém perceber.
 *   2. Escreva sempre de forma repetível — `if not exists`, `on conflict do nothing`.
 *      A trava por id já evita repetição, mas um banco restaurado de backup pode
 *      reencontrar o mesmo id em outro estado.
 *   3. Nada de dado de cliente aqui. Isto é estrutura, não conteúdo.
 *
 * O `sql` vai literalmente para o banco. Ele nunca é montado com dado que veio do
 * navegador — o que chega pela API não passa por aqui em hipótese alguma.
 */
'use strict';

module.exports = [
  {
    id: '2026-09-01-rotas',
    nota: 'ROTA vira tipo de local; vínculo com motorista e com a rota que atende',
    sql: [
      "alter table public.locais drop constraint if exists locais_tipo_check;",
      "alter table public.locais add constraint locais_tipo_check check (tipo in ('GALPAO','FILIAL','CLIENTE','ROTA'));",
      "alter table public.locais add column if not exists motorista_id text;",
      "alter table public.locais add column if not exists rota_id text;",
      "create index if not exists locais_rota_idx on public.locais (rota_id);"
    ].join('\n')
  },
  {
    id: '2026-09-03-acesso',
    nota: 'login do escritório por e-mail ou usuário, com senha em hash',
    sql: [
      "alter table public.usuarios add column if not exists email text;",
      "alter table public.usuarios add column if not exists usuario text;",
      "alter table public.usuarios add column if not exists senha_hash text;",
      "create unique index if not exists usuarios_email_unico on public.usuarios (lower(email)) where email is not null and email <> '';",
      "create unique index if not exists usuarios_usuario_unico on public.usuarios (lower(usuario)) where usuario is not null and usuario <> '';",
      "update public.usuarios set usuario = coalesce(nullif(usuario,''),'admin') where id = 'U001';"
    ].join('\n')
  },
  {
    id: '2026-09-03-correcao-movimento',
    nota: 'histórico de correção: o livro-razão continua só acrescentando',
    sql: "alter table public.movimentos add column if not exists historico jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-03-motorista-placa',
    nota: 'quem levou a carga',
    sql: [
      "alter table public.movimentos add column if not exists motorista text;",
      "alter table public.movimentos add column if not exists placa text;"
    ].join('\n')
  },
  {
    id: '2026-09-03-peso-caixa',
    nota: 'peso do tipo de caixa; limpa o tamanho e o valor, que saíram do app',
    sql: [
      "alter table public.tipos_caixa add column if not exists kg numeric(10,3);",
      "alter table public.tipos_caixa drop constraint if exists tipos_caixa_tamanho_check;",
      "alter table public.tipos_caixa drop column if exists tamanho;",
      "alter table public.tipos_caixa drop column if exists valor_unit;"
    ].join('\n')
  },
  {
    id: '2026-09-03-rota-na-carga',
    nota: 'nome da rota em que a carga saiu',
    sql: "alter table public.movimentos add column if not exists rota text;"
  },
  {
    id: '2026-09-03-rotas-da-operacao',
    nota: 'as seis rotas, como locais com saldo próprio',
    sql: [
      "insert into public.locais (id, tipo, nome, token) values",
      "  ('L010','ROTA','Caruaru',     substr(md5(random()::text||'caruaru'),1,10)),",
      "  ('L011','ROTA','João Pessoa', substr(md5(random()::text||'joaopessoa'),1,10)),",
      "  ('L012','ROTA','Maceió',      substr(md5(random()::text||'maceio'),1,10)),",
      "  ('L013','ROTA','Natal',       substr(md5(random()::text||'natal'),1,10)),",
      "  ('L014','ROTA','Recife',      substr(md5(random()::text||'recife'),1,10)),",
      "  ('L015','ROTA','Russas',      substr(md5(random()::text||'russas'),1,10))",
      "on conflict (id) do nothing;"
    ].join('\n')
  },
  {
    id: '2026-09-04-motoristas',
    nota: 'cadastro de motorista com documento, separado de usuários',
    sql: [
      "create table if not exists public.motoristas (",
      "  id text primary key,",
      "  nome text not null,",
      "  telefone text not null default '',",
      "  cpf text not null default '',",
      "  cnh text not null default '',",
      "  cnh_categoria text not null default '',",
      "  cnh_validade date,",
      "  placa text not null default '',",
      "  obs text not null default '',",
      "  ativo boolean not null default true,",
      "  criado_em timestamptz not null default now()",
      ");",
      "alter table public.motoristas enable row level security;",
      "insert into public.motoristas (id, nome) values",
      "  ('D001','Arilson'), ('D002','Chico'),   ('D003','Dinho'),",
      "  ('D004','Isaque'),  ('D005','Paulino'), ('D006','Plínio'),",
      "  ('D007','Ramos'),   ('D008','Valcy'),   ('D009','Valcy (Jr.)'),",
      "  ('D010','Vando'),   ('D011','Welison')",
      "on conflict (id) do nothing;",
      "delete from public.config where chave = 'motoristas';"
    ].join('\n')
  },
  {
    id: '2026-09-04-locais-padrao',
    nota: 'posto de trabalho vira cadastro próprio, fora dos nós que guardam caixa',
    sql: [
      "create table if not exists public.locais_padrao (",
      "  id text primary key,",
      "  nome text not null,",
      "  ativo boolean not null default true",
      ");",
      "alter table public.locais_padrao enable row level security;",
      // Copia os galpões e filiais mantendo o id: ninguém perde o vínculo já gravado.
      "insert into public.locais_padrao (id, nome, ativo)",
      "  select id, nome, ativo from public.locais where tipo in ('GALPAO','FILIAL')",
      "on conflict (id) do nothing;",
      "alter table public.usuarios drop constraint if exists usuarios_local_padrao_fkey;"
    ].join('\n')
  },
  {
    id: '2026-09-05-pedidos-senha',
    nota: 'quem esqueceu a senha e não tem PIN pede redefinição ao escritório',
    sql: [
      "create table if not exists public.pedidos_senha (",
      "  id text primary key,",
      "  identificador text not null,",
      "  criado_em timestamptz not null default now(),",
      "  atendido boolean not null default false",
      ");",
      "alter table public.pedidos_senha enable row level security;"
    ].join('\n')
  },
  {
    id: '2026-09-05-acesso-painel',
    nota: 'acesso ao painel vira chave por usuário, não consequência do perfil',
    sql: [
      "alter table public.usuarios add column if not exists acesso_painel boolean not null default false;",
      // Quem já entrava continua entrando: o perfil era a regra até aqui.
      "update public.usuarios set acesso_painel = true where upper(perfil) in ('ADMIN','GALPAO');"
    ].join('\n')
  },
  {
    id: '2026-09-06-locais-do-usuario',
    nota: 'admin escolhe de onde e para onde cada pessoa pode lançar',
    sql: [
      "alter table public.usuarios add column if not exists saidas jsonb not null default '[]'::jsonb;",
      "alter table public.usuarios add column if not exists destinos jsonb not null default '[]'::jsonb;"
    ].join('\n')
  },
  {
    id: '2026-09-06-rotas-do-motorista',
    nota: 'quais rotas cada motorista atende; vazio = todas',
    sql: "alter table public.motoristas add column if not exists rotas jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-06-perfis',
    nota: 'GALPAO vira CONFERENTE; entram GESTOR e GERENTE',
    sql: [
      "alter table public.usuarios drop constraint if exists usuarios_perfil_check;",
      "update public.usuarios set perfil = 'CONFERENTE' where upper(perfil) = 'GALPAO';",
      "alter table public.usuarios add constraint usuarios_perfil_check check (upper(perfil) in ('ADMIN','GESTOR','GERENTE','CONFERENTE','MOTORISTA','PROMOTOR'));"
    ].join('\n')
  },
  {
    id: '2026-09-06-empresa-motorista',
    nota: 'de qual empresa é o motorista',
    sql: "alter table public.motoristas add column if not exists empresa text not null default '';"
  },
  {
    id: '2026-09-06-perfil-livre',
    nota: 'perfil deixa de ser lista fechada; a trava passa a ser da aplicação',
    sql: "alter table public.usuarios drop constraint if exists usuarios_perfil_check;"
  }
];
