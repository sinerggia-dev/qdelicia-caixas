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
    id: '2026-09-15-senha-provisoria',
    nota: 'senha dada pelo admin e trocada no primeiro acesso; duas marcas, uma por credencial',
    sql: [
      "alter table public.usuarios add column if not exists pin_provisorio boolean not null default false;",
      "alter table public.usuarios add column if not exists senha_provisoria boolean not null default false;"
    ].join('\n')
  },
  {
    id: '2026-09-15-limpa-senha-sem-acesso',
    nota: 'senha de painel guardada para quem nao entra no painel: hash inutil que ainda autenticava na API',
    sql: [
      "update public.usuarios set senha_hash = null, senha_provisoria = false",
      " where coalesce(acesso_painel, false) = false",
      "   and upper(coalesce(perfil, '')) <> 'ADMIN'",
      "   and senha_hash is not null;"
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
  },
  {
    id: '2026-09-06-perfil-inicial-maiuscula',
    nota: 'desfaz o MAIÚSCULO que eu havia imposto sem ninguém pedir',
    sql: "update public.usuarios set perfil = initcap(lower(perfil)) "
       + "where perfil is not null and perfil <> initcap(lower(perfil));"
  },
  {
    id: '2026-09-07-tipo-motorista',
    nota: 'motorista fixo na rota ou volante',
    sql: "alter table public.motoristas add column if not exists tipo text not null default '';"
  },
  {
    id: '2026-09-16-motoristas-por-usuario',
    nota: 'quais motoristas a pessoa pode escolher; vazio segue querendo dizer TODOS',
    sql: "alter table public.usuarios add column if not exists motoristas jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-16-tipos-por-usuario',
    nota: 'quais tipos de caixa a pessoa pode lançar; vazio segue querendo dizer TODOS',
    sql: "alter table public.usuarios add column if not exists tipos_caixa jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-16-base-de-teste',
    nota: 'usuário de teste e lançamento de teste: ensaio não encosta no saldo real',
    sql: "alter table public.usuarios add column if not exists teste boolean not null default false;"
       + "alter table public.movimentos add column if not exists teste boolean not null default false;"
  },
  {
    id: '2026-09-16-local-fornecedor',
    nota: 'FORNECEDOR vira o quinto tipo de local: de onde a caixa vem e para onde ela volta',
    sql: "alter table public.locais drop constraint if exists locais_tipo_check;"
       + "alter table public.locais add constraint locais_tipo_check "
       + "check (tipo in ('GALPAO','FILIAL','CLIENTE','ROTA','FORNECEDOR'));"
  },
  {
    id: '2026-09-16-operacoes-por-usuario',
    nota: 'quais operações a pessoa lança no campo; vazia segue querendo dizer TODAS',
    sql: "alter table public.usuarios add column if not exists operacoes jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-17-abas-por-usuario',
    nota: 'quais abas do painel a pessoa vê; vazia segue querendo dizer TODAS',
    sql: "alter table public.usuarios add column if not exists abas jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-20-painel-so-proprios',
    nota: 'painel restrito: entra no painel, mas só enxerga os lançamentos que ela mesma fez',
    sql: "alter table public.usuarios add column if not exists so_proprios boolean not null default false;"
  },
  {
    id: '2026-09-20-ver-lancamentos',
    nota: 'se a pessoa vê lançamentos, e de quais usuários; lista vazia segue querendo dizer TODOS',
    sql: "alter table public.usuarios add column if not exists ver_lancamentos boolean not null default true;"
       + "alter table public.usuarios add column if not exists usuarios_vistos jsonb not null default '[]'::jsonb;"
       // Quem estava em "só os próprios" passa a ver só a si mesmo pela lista nova — a
       // mesma coisa, dita do jeito novo. Sem isto a escolha antiga sumiria calada.
       + "update public.usuarios set usuarios_vistos = jsonb_build_array(id) "
       + "where so_proprios = true and usuarios_vistos = '[]'::jsonb;"
  },
  {
    id: '2026-09-22-ajustes-por-local',
    nota: 'em quais locais a pessoa lança ajuste e perda; vazia segue querendo dizer TODOS',
    // Sem `update` nenhum de propósito: todo mundo nasce com a lista vazia, que quer dizer
    // TODOS, e é exatamente o que já valia antes desta coluna. Quem quiser restringir
    // marca; quem não mexer não perde nada no dia do deploy.
    sql: "alter table public.usuarios add column if not exists ajustes jsonb not null default '[]'::jsonb;"
  },
  {
    id: '2026-09-22-marcar-o-que-ja-valia',
    nota: 'a convenção virou (nada marcado = nada liberado); grava em cada um o que ele já via',
    /* A CONVENÇÃO das listas de permissão passou a ser "nada marcado = nada liberado".
       Até aqui, lista vazia queria dizer TODOS — e nove dos dez cadastros estavam com
       tudo vazio. Virar a chave sem mais nada tiraria o painel, o app e o lançamento de
       praticamente toda a operação no mesmo instante.

       Então esta migração escreve, em cada pessoa, EXATAMENTE o que ela já enxergava.
       Depois dela ninguém perde nada, e daí em diante desmarcar passa a tirar.

       Só mexe em quem está com a lista VAZIA (`= '[]'::jsonb`): quem já tinha marcação
       escolheu aquilo, e sobrescrever seria desfazer uma decisão do administrador.

       O ADMIN fica de fora das abas de propósito: ele entra em todas por exceção no
       código, e gravar a lista dele aqui congelaria o conjunto de hoje — uma aba nova
       amanhã não apareceria para quem concede as abas. */
    sql:
      // Abas: todas menos as que dão poder, que é o que a regra do vazio dava a quem não
      // é admin. Escrito à mão, e não lido de uma tabela, porque o catálogo de abas mora
      // no código (`ABAS`, em `_logica.js`) e não no banco.
      "update public.usuarios set abas = " +
      "'[\"pgRetornos\",\"pgPainel\",\"pgExtrato\",\"pgMovimentos\",\"pgColunas\"]'::jsonb " +
      "where abas = '[]'::jsonb and upper(coalesce(perfil,'')) <> 'ADMIN';" +

      // Operações: as duas, ou só RETORNO para o promotor — que era o atalho por perfil
      // que existia no app de campo e saiu junto com a convenção antiga.
      "update public.usuarios set operacoes = '[\"RETORNO\"]'::jsonb " +
      "where operacoes = '[]'::jsonb and upper(coalesce(perfil,'')) like '%PROMOTOR%';" +
      "update public.usuarios set operacoes = '[\"SAIDA\",\"RETORNO\"]'::jsonb " +
      "where operacoes = '[]'::jsonb;" +

      // Locais, tipos de caixa e motoristas: tudo o que existe hoje. As listas de saída e
      // destino recebem TODOS os locais porque o filtro por tipo acontece antes delas, na
      // tela — restringir aqui mudaria o que a pessoa vê.
      "update public.usuarios set saidas = coalesce(" +
      "(select jsonb_agg(l.id order by l.id) from public.locais l), '[]'::jsonb) " +
      "where saidas = '[]'::jsonb;" +
      "update public.usuarios set destinos = coalesce(" +
      "(select jsonb_agg(l.id order by l.id) from public.locais l), '[]'::jsonb) " +
      "where destinos = '[]'::jsonb;" +
      "update public.usuarios set ajustes = coalesce(" +
      "(select jsonb_agg(l.id order by l.id) from public.locais l), '[]'::jsonb) " +
      "where ajustes = '[]'::jsonb;" +
      "update public.usuarios set tipos_caixa = coalesce(" +
      "(select jsonb_agg(t.id order by t.id) from public.tipos_caixa t), '[]'::jsonb) " +
      "where tipos_caixa = '[]'::jsonb;" +
      "update public.usuarios set motoristas = coalesce(" +
      "(select jsonb_agg(m.id order by m.id) from public.motoristas m), '[]'::jsonb) " +
      "where motoristas = '[]'::jsonb;" +

      // De quem vê os lançamentos: todo mundo, que era o que a lista vazia dava. Só para
      // quem VÊ lançamento — para os outros a lista não muda nada, e enchê-la esconderia
      // que eles estão desligados pelo interruptor.
      "update public.usuarios set usuarios_vistos = coalesce(" +
      "(select jsonb_agg(x.id order by x.id) from public.usuarios x), '[]'::jsonb) " +
      "where usuarios_vistos = '[]'::jsonb and ver_lancamentos = true;"
  },
  {
    id: '2026-09-22-lixeira-de-lancamentos',
    nota: 'excluir passa a marcar a linha em vez de apagá-la, e por isso tem volta',
    /* EXCLUIR APAGAVA DE VEZ. A tela avisava ("isto não tem volta") e pedia o nome da
       caixa escrito à mão, mas quem escreve o nome certo por engano continua sem ter
       para onde correr — e o "Apagar o que está no filtro" leva centenas de uma vez.

       Duas colunas, e o registro passa a sair de vista sem sair do banco. QUEM apagou
       fica junto de QUANDO, porque numa lixeira a primeira pergunta é essa.

       `excluido_em` nulo é o normal: a coluna nasce vazia em tudo que já existe, então
       nada desaparece por causa desta migração. O índice é para a lixeira, que pergunta
       exatamente pelo que não é nulo. */
    sql: [
      "alter table public.movimentos add column if not exists excluido_em timestamptz;",
      "alter table public.movimentos add column if not exists excluido_por text;",
      "create index if not exists movimentos_excluido_idx " +
      "on public.movimentos (excluido_em) where excluido_em is not null;",
      "comment on column public.movimentos.excluido_em is " +
      "'Quando o lançamento foi mandado para a lixeira. Nulo = está valendo. " +
      "Preenchido, ele não conta em saldo, painel, extrato nem lista.';"
    ].join('\n')
  },
  {
    id: '2026-09-23-foto-do-usuario',
    nota: 'a foto do cadastro, que aparece no lugar das iniciais',
    /* UMA COLUNA DE TEXTO, e não a imagem. O que fica aqui é o ENDEREÇO do arquivo no
       mesmo balde que já guarda canhoto e foto de lançamento; o byte da imagem não entra
       na tabela de usuários, que é lida inteira a cada visita ao painel.

       Nula é o normal: quem não tem foto continua aparecendo pelas iniciais, e nada muda
       para os cadastros que já existem. */
    sql: [
      "alter table public.usuarios add column if not exists foto text;",
      "comment on column public.usuarios.foto is " +
      "'Endereço público da foto do cadastro, no balde canhotos. " +
      "Nulo = sem foto, e a tela mostra as iniciais do nome.';"
    ].join('\n')
  }
];
