/**
 * Testa o backend novo (Vercel + Supabase) sem rede e sem chave.
 *
 * Substitui só a camada de acesso ao Postgres por um banco falso em memória; o roteador
 * (`api/index.js`), as regras (`api/_logica.js`) e a tradução snake_case são os de produção.
 * O cenário é o mesmo do `teste_backend.js` do Apps Script — se os dois passam, a migração
 * não mudou nenhuma conta.
 *
 *   node teste/teste_api.js
 */
'use strict';
const path = require('path');

/* ---------- banco falso ---------- */

const tabelas = {
  locais: [
    { id: 'L001', tipo: 'GALPAO', nome: 'Galpão de Distribuição', responsavel: '', telefone: '', limite_caixas: null, dias_prazo: null, token: 'a69uisz7uv', ativo: true, obs: '' },
    { id: 'L002', tipo: 'FILIAL', nome: 'Filial (exemplo — renomeie)', responsavel: '', telefone: '', limite_caixas: null, dias_prazo: null, token: 'xrr7yuy3x4', ativo: true, obs: '' },
    { id: 'L003', tipo: 'CLIENTE', nome: 'Cliente Exemplo', responsavel: '', telefone: '', limite_caixas: 200, dias_prazo: 7, token: 'b6p8xwmqr6', ativo: true, obs: '' }
  ],
  tipos_caixa: [
    { id: 'T001', nome: 'Caixa Banana', ativo: true },
    { id: 'T002', nome: 'Caixa Plástica Grande', ativo: true }
  ],
  usuarios: [
    { id: 'U001', nome: 'Administrador', perfil: 'ADMIN', pin: '1234', telefone: '', local_padrao: 'L001', ativo: true, usuario: 'admin', email: 'admin@qdelicia.com.br', senha_hash: null, acesso_painel: true },
    { id: 'U002', nome: 'Conferente Galpão', perfil: 'GALPAO', pin: '1111', telefone: '', local_padrao: 'L001', ativo: true, acesso_painel: true },
    { id: 'U003', nome: 'Motorista Exemplo', perfil: 'MOTORISTA', pin: '2222', telefone: '', local_padrao: 'L001', ativo: true },
    { id: 'U004', nome: 'Promotor Exemplo', perfil: 'PROMOTOR', pin: '3333', telefone: '', local_padrao: null, ativo: true }
  ],
  // O bootstrap ja rodou neste banco falso, e as migracoes antigas estao registradas.
  migracoes: [],
  locais_padrao: [
    { id: 'P001', nome: 'Escritório Central', ativo: true }
  ],
  motoristas: [
    { id: 'D001', nome: 'Arilson', telefone: '81 9', cpf: '111', cnh: '222',
      cnh_categoria: 'E', cnh_validade: '2030-01-01', placa: 'ABC1D23', obs: '', ativo: true }
  ],
  movimentos: [],
  pedidos_senha: [],
  config: [
    { chave: 'empresa', valor: 'Qdelícia Frutas' },
    { chave: 'diasPrazoPadrao', valor: '7' }
  ]
};

// Carrega o módulo real primeiro: os tradutores (LOCAL/TIPO/USUARIO/MOV) são puros e queremos
// testar exatamente os de produção. Só as funções de rede são trocadas.
const caminhoSupabase = require.resolve(path.join(__dirname, '..', 'api', '_supabase.js'));
const real = require(caminhoSupabase);

function erroUnique(coluna) {
  const e = new Error('duplicate key value violates unique constraint "movimentos_' + coluna + '_key"');
  e.status = 409;
  e.corpo = '{"code":"23505","message":"duplicate key"}';
  return e;
}

const falso = Object.assign({}, real, {
  configurado: () => true,
  subirArquivo: async () => 'https://fake/arquivo.png',
  selectAll: async (t) => tabelas[t].map((r) => Object.assign({}, r)),
  insert: async (t, linhas) => {
    return linhas.map((l) => {
      if (tabelas[t].some((r) => r.id === l.id)) throw erroUnique('pkey');
      if (t === 'movimentos' && l.client_key &&
          tabelas[t].some((r) => r.client_key === l.client_key)) throw erroUnique('client_key');
      const linha = Object.assign({ cancelado: false }, l);
      tabelas[t].push(linha);
      return Object.assign({}, linha);
    });
  },
  update: async (t, id, patch) => {
    const alvo = tabelas[t].find((r) => r.id === id);
    if (!alvo) throw new Error('linha inexistente: ' + t + '/' + id);
    Object.assign(alvo, patch);
    return [Object.assign({}, alvo)];
  },
  rpc: async (nome, args) => {
    if (nome !== 'aplicar_migracao') throw new Error('rpc desconhecida: ' + nome);
    if (tabelas.migracoes.some((m) => m.id === args.id_migracao)) return 'ja-aplicada';
    if (/FALHA_PROPOSITAL/.test(args.sql_migracao)) throw new Error('erro de sintaxe simulado');
    tabelas.migracoes.push({ id: args.id_migracao, sql: args.sql_migracao });
    return 'aplicada';
  },
  salvarConfig: async (chave, valor) => {
    const linha = tabelas.config.find((r) => r.chave === chave);
    if (linha) linha.valor = valor; else tabelas.config.push({ chave, valor });
    return [{ chave, valor }];
  },
  remover: async (t, id) => {
    const i = tabelas[t].findIndex((r) => r.id === id);
    if (i >= 0) tabelas[t].splice(i, 1);
    return null;
  },
  carregarTudo: async () => {
    const config = {};
    tabelas.config.forEach((r) => { config[r.chave] = r.valor; });
    return {
      locais: tabelas.locais.map(real.LOCAL.de),
      tipos: tabelas.tipos_caixa.map(real.TIPO.de),
      usuarios: tabelas.usuarios.map(real.USUARIO.de),
      movimentos: tabelas.movimentos.map(real.MOV.de),
      motoristas: tabelas.motoristas.map(real.MOTORISTA.de),
      locaisPadrao: tabelas.locais_padrao.map(real.LOCAL_PADRAO.de),
      pedidosSenha: tabelas.pedidos_senha.filter((r) => r.atendido !== true),
      config: config
    };
  }
});

require.cache[caminhoSupabase].exports = falso;
const handler = require(path.join(__dirname, '..', 'api', 'index.js'));

/* ---------- ponte req/res ---------- */

function chamar(metodo, dados) {
  return new Promise((resolve, reject) => {
    const res = {
      setHeader() { return this; },
      status() { return this; },
      json(corpo) { resolve(corpo); return this; },
      end() { resolve(null); return this; }
    };
    const req = metodo === 'POST' ? { method: 'POST', body: dados } : { method: 'GET', query: dados };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const GET = (p) => chamar('GET', p);
const POST = (p) => chamar('POST', p);

/* ---------- utilidades ---------- */

/* Hora LOCAL, como toda a produção: `data()` lê AAAA-MM-DD como data local e `iso()`
   formata pelos componentes locais. Este auxiliar usava toISOString(), que é UTC — e a
   partir das 21h em Brasília devolvia a data de amanhã, fazendo dia(-20) valer 19 dias.
   O teste de aging quebrava sozinho toda noite, sem nada ter mudado no código. */
const dia = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const z = (x) => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
};
let falhas = 0;
function ok(cond, msg, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '   <<< ' + JSON.stringify(extra)));
  if (!cond) falhas++;
}

/* ---------- cenário ---------- */

async function main() {
  console.log('\n== migração automática ==');
  const ping = await GET({ acao: 'ping' });
  ok(ping.ok && ping.motor === 'supabase', 'ping responde com o motor novo', ping);

  // A primeira chamada depois do deploy é quem aplica o que falta.
  const previstas = require(path.join(__dirname, '..', 'api', '_migracoes.js'));
  ok(tabelas.migracoes.length === previstas.length,
    'a primeira chamada aplicou as ' + previstas.length + ' migrações',
    tabelas.migracoes.map((m) => m.id));
  ok(tabelas.migracoes.map((m) => m.id).join('|') === previstas.map((m) => m.id).join('|'),
    'aplicadas na ordem em que estão declaradas');

  const antes = tabelas.migracoes.length;
  await GET({ acao: 'ping' });
  await GET({ acao: 'dados' });
  ok(tabelas.migracoes.length === antes, 'chamadas seguintes não reaplicam nada');

  console.log('\n== ligação ==');

  const dados = await GET({ acao: 'dados' });
  const G = dados.locais.find((l) => l.Tipo === 'GALPAO').ID;
  const F = dados.locais.find((l) => l.Tipo === 'FILIAL').ID;
  const C = dados.locais.find((l) => l.Tipo === 'CLIENTE').ID;
  const T = dados.tipos[0].ID;
  ok(dados.usuarios === undefined, 'rota dados não devolve mais a lista de usuários', Object.keys(dados));
  const equipe = (await GET({ acao: 'equipe' })).usuarios;
  ok(equipe.length === 4 && !('PIN' in equipe[0]) && !('SenhaHash' in equipe[0]),
     'rota equipe traz os 4 sem PIN nem hash', equipe[0]);
  console.log(`  galpão=${G} filial=${F} cliente=${C} tipoCaixa=${T}`);

  console.log('\n== lançamentos ==');
  ok((await POST({ acao: 'movimento', tipo: 'AJUSTE', destinoId: G, itens: [{ tipoCaixaId: T, qtd: 1000 }], dataRef: dia(-60), usuarioId: 'U001', perfil: 'ADMIN' })).ok, 'ajuste inicial galpão 1000');
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 100 }], dataRef: dia(-20), usuarioId: 'U003', perfil: 'MOTORISTA' })).ok, 'saída 100 p/ cliente (20 dias atrás)');
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 50 }], dataRef: dia(-3), usuarioId: 'U003', perfil: 'MOTORISTA' })).ok, 'saída 50 p/ cliente (3 dias atrás)');

  let p = (await GET({ acao: 'painel' })).painel;
  let cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 150, 'saldo do cliente = 150', cli.saldo);

  console.log('\n== devolução contada pelo promotor (não pode baixar saldo ainda) ==');
  const dev = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: C, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 80 }], dataRef: dia(-1), usuarioId: 'U004', perfil: 'PROMOTOR' });
  ok(dev.status === 'AGUARDANDO', 'devolução do promotor fica AGUARDANDO', dev.status);
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 150, 'saldo do cliente continua 150 antes da conferência', cli.saldo);
  ok(cli.emConferencia === 80, 'mostra 80 em conferência', cli.emConferencia);
  ok((await GET({ acao: 'pendentes' })).movimentos.length === 1, '1 item na fila de conferência');

  console.log('\n== conferência no galpão: chegaram 75 ==');
  const conf = await POST({ acao: 'conferir', id: dev.criados[0].id, qtdConferida: 75, obs: 'faltaram 5', usuarioId: 'U002' });
  ok(conf.ok && conf.divergencia === -5, 'divergência de -5 registrada', conf);
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 75, 'saldo do cliente = 75 (150 - 75 conferidas)', cli.saldo);
  ok(cli.emConferencia === 0, 'nada mais em conferência', cli.emConferencia);
  ok(p.kpis.divergenciaMes === -5, 'KPI divergência do mês = -5', p.kpis.divergenciaMes);

  console.log('\n== baixa de perda de 5 caixas ==');
  ok((await POST({ acao: 'movimento', tipo: 'PERDA', origemId: C, itens: [{ tipoCaixaId: T, qtd: 5 }], dataRef: dia(0), obs: 'quebradas', usuarioId: 'U001', perfil: 'ADMIN' })).ok, 'perda lançada');
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 70, 'saldo do cliente = 70', cli.saldo);
  ok(cli.aging.d16_30 === 20 && cli.aging.d0_7 === 50, 'aging FIFO: 20 caixas com 16-30 dias + 50 com até 7 dias', cli.aging);
  ok(cli.aging.maisAntiga === 20, 'caixa mais antiga tem 20 dias', cli.aging.maisAntiga);
  ok(cli.vencidas === 20, 'vencidas (prazo 7 dias) = 20', cli.vencidas);
  ok(p.kpis.perdasMes === 5, 'KPI perdas do mês = 5', p.kpis.perdasMes);

  console.log('\n== caminho galpão → filial → cliente ==');
  ok((await POST({ acao: 'movimento', tipo: 'TRANSFERENCIA', origemId: G, destinoId: F, itens: [{ tipoCaixaId: T, qtd: 200 }], dataRef: dia(-10), usuarioId: 'U001', perfil: 'ADMIN' })).ok, 'transferência 200 p/ filial');
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: F, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 30 }], dataRef: dia(-2), usuarioId: 'U003', perfil: 'MOTORISTA' })).ok, 'saída 30 da filial p/ cliente');
  p = (await GET({ acao: 'painel' })).painel;
  const fil = p.locais.find((l) => l.id === F); cli = p.locais.find((l) => l.id === C);
  ok(fil.saldo === 170, 'filial fica com 170', fil.saldo);
  ok(cli.saldo === 100, 'cliente sobe para 100', cli.saldo);
  const galp = p.galpoes.find((g) => g.id === G);
  ok(galp.saldo === 1000 - 100 - 50 + 75 - 200, 'estoque do galpão = 725', galp.saldo);

  console.log('\n== idempotência (reenvio da fila offline) ==');
  const ck = 'K-teste-fila';
  await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 40 }], clientKey: ck, dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' });
  const r2 = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 40 }], clientKey: ck, dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' });
  ok(r2.criados[0] && r2.criados[0].duplicado === true, 'reenvio com o mesmo clientKey não duplica', r2);
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 140, 'saldo do cliente = 140 (só uma vez os 40)', cli.saldo);

  console.log('\n== extrato do cliente ==');
  const ex = await GET({ acao: 'extrato', local: C });
  ok(ex.ok && ex.saldo === 140, 'saldo do extrato bate com o painel', ex.saldo);
  ok(ex.linhas.length === 6, '6 linhas no extrato', ex.linhas.length);
  ok(ex.linhas[ex.linhas.length - 1].saldo === 140, 'última linha fecha em 140', ex.linhas[ex.linhas.length - 1].saldo);
  const divLinha = ex.linhas.find((l) => l.divergencia);
  ok(divLinha && divLinha.divergencia === -5, 'extrato mostra a divergência de -5', divLinha && divLinha.divergencia);
  const tokenCliente = (await GET({ acao: 'dados' })).locais.find((l) => l.ID === C).Token;
  ok((await GET({ acao: 'extratoToken', t: tokenCliente })).ok, 'link do cliente (token) funciona');
  ok((await GET({ acao: 'extratoToken', t: 'xxx' })).ok === false, 'token inválido é recusado');

  console.log('\n== cancelamento ==');
  const alvo = (await GET({ acao: 'movimentos', limit: 100 })).movimentos.find((m) => m.tipo === 'SAIDA' && m.qtd === 40);
  ok((await POST({ acao: 'cancelar', id: alvo.id, motivo: 'lançado em dobro', usuarioId: 'U001' })).ok, 'movimento cancelado');
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 100, 'saldo volta para 100 após cancelar', cli.saldo);

  console.log('\n== login do campo: nome digitado + PIN ==');
  ok((await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '2222' })).ok, 'nome completo + PIN');
  ok((await POST({ acao: 'login', identificador: 'motorista exemplo', pin: '2222' })).ok, 'não diferencia maiúscula');
  ok((await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '9999' })).ok === false, 'PIN errado é recusado');
  ok((await POST({ acao: 'login', identificador: 'Fulano Que Nao Existe', pin: '2222' })).ok === false, 'usuário inexistente é recusado');
  const msgs = [
    (await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '9999' })).erro,
    (await POST({ acao: 'login', identificador: 'Fulano Que Nao Existe', pin: '2222' })).erro
  ];
  ok(msgs[0] === msgs[1], 'mesma mensagem para PIN errado e usuário inexistente (não revela quem existe)', msgs);

  console.log('\n== login do escritório: identificador + senha ==');
  ok((await POST({ acao: 'login', identificador: 'admin', senha: 'qualquer' })).ok === false,
     'sem senha definida, o login por senha é recusado');
  ok((await POST({ acao: 'definirSenha', identificador: 'admin', pin: '9999', novaSenha: 'boa-senha-1' })).ok === false,
     'definir senha com PIN errado é recusado');
  ok((await POST({ acao: 'definirSenha', identificador: 'admin', pin: '1234', novaSenha: '123' })).ok === false,
     'senha curta é recusada');
  ok((await POST({ acao: 'definirSenha', identificador: 'admin', pin: '1234', novaSenha: 'boa-senha-1' })).ok,
     'primeira senha definida provando o PIN');
  ok(String(tabelas.usuarios[0].senha_hash || '').startsWith('s1$'), 'senha vai ao banco como hash, não em texto',
     String(tabelas.usuarios[0].senha_hash || '').slice(0, 12));
  ok((await POST({ acao: 'login', identificador: 'admin', senha: 'boa-senha-1' })).ok, 'entra com usuário + senha');
  ok((await POST({ acao: 'login', identificador: 'admin@qdelicia.com.br', senha: 'boa-senha-1' })).ok, 'entra com e-mail + senha');
  ok((await POST({ acao: 'login', identificador: 'Administrador', senha: 'boa-senha-1' })).ok, 'entra com o nome completo');
  ok((await POST({ acao: 'login', identificador: 'admin', senha: 'errada' })).ok === false, 'senha errada é recusada');
  ok((await POST({ acao: 'definirSenha', identificador: 'admin', pin: '1234', novaSenha: 'outra-senha-2' })).ok === false,
     'com senha já definida, o PIN não serve mais para trocá-la');
  ok((await POST({ acao: 'definirSenha', identificador: 'admin', senhaAtual: 'boa-senha-1', novaSenha: 'outra-senha-2' })).ok,
     'troca de senha exige a senha atual');
  ok((await GET({ acao: 'equipe' })).usuarios.every((u) => !('SenhaHash' in u) && !('PIN' in u)),
     'equipe nunca devolve hash nem PIN');

  console.log('\n== validações ==');
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 5 }] })).ok === false, 'origem igual ao destino é recusado');
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 0 }] })).ok === false, 'quantidade zero é recusada');
  ok((await POST({ acao: 'movimento', tipo: 'AJUSTE', destinoId: C, itens: [{ tipoCaixaId: T, qtd: -10 }], usuarioId: 'U001' })).ok, 'ajuste negativo é aceito');
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 90, 'ajuste negativo baixou o saldo para 90', cli.saldo);

  console.log('\n== cadastros ==');
  const novo = await POST({ acao: 'salvarLocal', registro: { Tipo: 'CLIENTE', Nome: 'Cliente Novo', LimiteCaixas: 50, DiasPrazo: 5 } });
  ok(novo.ok && novo.criado && novo.id, 'cliente novo cadastrado', novo);
  const locaisAgora = (await GET({ acao: 'dados' })).locais;
  const criado = locaisAgora.find((l) => l.ID === novo.id);
  ok(criado && criado.Token && criado.Token.length === 10, 'cliente novo recebe token de 10 caracteres', criado && criado.Token);
  ok((await POST({ acao: 'excluir', aba: 'Locais', id: novo.id })).excluido === true, 'cliente sem movimento é excluído');
  const comMov = await POST({ acao: 'excluir', aba: 'Locais', id: C });
  ok(comMov.inativado === true, 'cliente com movimento é inativado, não excluído', comMov);

  console.log('\n== rotas ==');
  const rota = await POST({ acao: 'salvarLocal', registro: { Tipo: 'ROTA', Nome: 'Rota Centro', MotoristaId: 'U003' } });
  ok(rota.ok && rota.criado, 'rota cadastrada', rota);
  const R = rota.id;

  const cli2 = await POST({ acao: 'salvarLocal', registro: { Tipo: 'CLIENTE', Nome: 'Mercado da Rota', RotaId: R, DiasPrazo: 7 } });
  ok(cli2.ok, 'cliente vinculado à rota', cli2);
  const C2 = cli2.id;

  // carrega o caminhão: 60 saem do galpão para a rota
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: R, itens: [{ tipoCaixaId: T, qtd: 60 }], dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' })).ok, 'carregou 60 no caminhão');
  let pr = (await GET({ acao: 'painel' })).painel;
  let r1 = pr.rotas.find((x) => x.id === R);
  ok(r1 && r1.saldo === 60, 'rota fica com 60 no caminhão', r1 && r1.saldo);
  ok(pr.kpis.emRota === 60, 'KPI caixas em rota = 60', pr.kpis.emRota);

  // entrega 40 ao cliente: sobram 20 no caminhão
  ok((await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: R, destinoId: C2, itens: [{ tipoCaixaId: T, qtd: 40 }], dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' })).ok, 'entregou 40 ao cliente');
  pr = (await GET({ acao: 'painel' })).painel;
  r1 = pr.rotas.find((x) => x.id === R);
  const c2 = pr.locais.find((x) => x.id === C2);
  ok(r1.saldo === 20, 'sobraram 20 no caminhão', r1.saldo);
  ok(c2.saldo === 40, 'cliente da rota ficou com 40', c2.saldo);
  ok(c2.rota === 'Rota Centro', 'cliente mostra o nome da rota', c2.rota);
  ok(r1.clientes === 1 && r1.saldoClientes === 40, 'resumo da rota soma os clientes dela', { clientes: r1.clientes, saldoClientes: r1.saldoClientes });
  ok(r1.motorista === 'Motorista Exemplo', 'rota mostra o motorista', r1.motorista);

  // as 20 que sobraram voltam ao galpão — o caminhão zera
  ok((await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: R, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 20 }], dataRef: dia(0), usuarioId: 'U002', perfil: 'GALPAO' })).ok, 'devolveu 20 ao galpão');
  pr = (await GET({ acao: 'painel' })).painel;
  r1 = pr.rotas.find((x) => x.id === R);
  ok(r1.saldo === 0, 'caminhão zerado no fim do dia', r1.saldo);
  ok(pr.locais.every((x) => x.tipo !== 'ROTA'), 'rota não aparece misturada na lista de clientes');

  console.log('\n== correção de lançamento pelo escritório ==');
  const alvoC = (await GET({ acao: 'movimentos', limit: 200 })).movimentos.find((m) => m.tipo === 'SAIDA' && m.qtd === 100);
  ok((await POST({ acao: 'corrigir', id: alvoC.id, Qtd: 95 })).ok === false, 'correção sem motivo é recusada');
  const corr = await POST({ acao: 'corrigir', id: alvoC.id, Qtd: 95, motivo: 'romaneio dizia 95', usuarioId: 'U001' });
  ok(corr.ok && corr.alterou.length === 1, 'quantidade corrigida', corr);
  const movC = tabelas.movimentos.find((m) => m.id === alvoC.id);
  ok(Number(movC.qtd) === 95, 'valor novo gravado', movC.qtd);
  ok(movC.historico.length === 1 && movC.historico[0].de === '100' && movC.historico[0].para === '95',
     'histórico guarda o valor antigo e o novo', movC.historico);
  ok(movC.historico[0].motivo === 'romaneio dizia 95' && movC.historico[0].por === 'U001',
     'histórico guarda motivo e autor', movC.historico[0]);
  ok((await POST({ acao: 'corrigir', id: alvoC.id, Qtd: 95, motivo: 'de novo' })).ok === false,
     'corrigir para o mesmo valor não gera histórico vazio');

  console.log('\n== ativo: booleano do Postgres e texto antigo da planilha ==');
  const par = (v) => real.LOCAL.para({ Ativo: v }).ativo;
  ok(par(true) === true && par('SIM') === true && par('sim') === true, 'true e SIM viram ativo');
  ok(par(false) === false && par('NAO') === false && par('') === false, 'false, NAO e vazio viram inativo');
  ok(par(undefined) === undefined, 'Ativo ausente não mexe na coluna (atualização parcial)');

  const inat = await POST({ acao: 'salvarLocal', registro: { Tipo: 'CLIENTE', Nome: 'Cliente Desligado', Ativo: 'NAO' } });
  const grav = (await GET({ acao: 'dados' })).locais.find((l) => l.ID === inat.id);
  ok(grav && grav.Ativo === false, 'cliente salvo como NAO volta da API como inativo', grav && grav.Ativo);

  console.log('\n== tipo de caixa: peso ==');
  const tG = await POST({ acao: 'salvarTipo', registro: { Nome: 'Caixa Banana', Kg: 20 } });
  const tPP = await POST({ acao: 'salvarTipo', registro: { Nome: 'Caixa Banana', Kg: 6.5 } });
  ok(tG.ok && tPP.ok, 'dois tipos com o mesmo nome e pesos diferentes', { tG, tPP });

  const tipos = (await GET({ acao: 'dados' })).tipos;
  const g = tipos.find((x) => x.ID === tG.id);
  ok(g && Number(g.Kg) === 20, 'kg volta da API', g);

  // O rótulo é o que separa as duas na tela de conferência — sem ele são a mesma linha.
  ok(real.LOCAL && require('../api/_logica').rotuloTipo(g) === 'Caixa Banana · 20 kg',
    'rótulo junta nome e peso', require('../api/_logica').rotuloTipo(g));

  await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: tG.id, qtd: 7 }], dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' });
  const mv = (await GET({ acao: 'movimentos', limit: 5 })).movimentos.find((m) => m.qtd === 7);
  ok(mv && mv.tipoCaixa === 'Caixa Banana · 20 kg', 'movimento mostra o tipo com o peso', mv && mv.tipoCaixa);

  const semTam = await POST({ acao: 'salvarTipo', registro: { Nome: 'Palete', Kg: '' } });
  const p2 = (await GET({ acao: 'dados' })).tipos.find((x) => x.ID === semTam.id);
  ok(p2 && p2.Kg === '', 'o peso é opcional', p2);

  console.log('\n== motorista e rota na saída do galpão ==');
  const carga = await POST({
    acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C,
    itens: [{ tipoCaixaId: T, qtd: 33 }], dataRef: dia(0),
    usuarioId: 'U003', perfil: 'MOTORISTA',
    motorista: '  joão da silva  ', rota: ' Caruaru '
  });
  ok(carga.ok, 'saída com motorista e rota gravada', carga);

  const mm = (await GET({ acao: 'movimentos', limit: 10 })).movimentos.find((m) => m.qtd === 33);
  ok(mm && mm.motorista === 'joão da silva', 'motorista chega sem espaço sobrando', mm && mm.motorista);
  ok(mm && mm.rota === 'Caruaru', 'rota chega sem espaço sobrando', mm && mm.rota);

  const semCarro = await POST({
    acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C,
    itens: [{ tipoCaixaId: T, qtd: 3 }], dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA'
  });
  const m2 = (await GET({ acao: 'movimentos', limit: 10 })).movimentos.find((m) => m.qtd === 3);
  ok(semCarro.ok && m2 && m2.motorista === '' && m2.rota === '',
    'sem motorista/rota o movimento grava igual (a exigência é da tela)', m2 && [m2.motorista, m2.rota]);

  console.log('\n== rota na carga e usuário ativo/inativo ==');
  const comRota = await POST({
    acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C,
    itens: [{ tipoCaixaId: T, qtd: 11 }], dataRef: dia(0),
    usuarioId: 'U003', perfil: 'MOTORISTA',
    motorista: 'Wesley', rota: '  Caruaru  '
  });
  ok(comRota.ok, 'saída com rota gravada', comRota);
  const mr = (await GET({ acao: 'movimentos', limit: 10 })).movimentos.find((m) => m.qtd === 11);
  ok(mr && mr.rota === 'Caruaru', 'rota chega sem espaço sobrando', mr && mr.rota);

  // Desativar em vez de excluir: o histórico aponta para o usuário.
  const off = await POST({ acao: 'salvarUsuario', registro: { ID: 'U004', Ativo: 'NAO' } });
  ok(off.ok, 'usuário desativado', off);
  const dep = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U004');
  ok(dep && dep.Ativo === false, 'equipe mostra o usuário como inativo', dep && dep.Ativo);
  ok(dep && dep.Nome === 'Promotor Exemplo', 'desativar não apagou os outros campos', dep && dep.Nome);
  ok((await POST({ acao: 'login', identificador: 'Promotor Exemplo', pin: '3333' })).ok === false,
    'usuário inativo não entra mais');

  const on = await POST({ acao: 'salvarUsuario', registro: { ID: 'U004', Ativo: 'SIM' } });
  ok(on.ok && (await POST({ acao: 'login', identificador: 'Promotor Exemplo', pin: '3333' })).ok,
    'reativar devolve o acesso');

  console.log('\n== ativar, desativar e excluir rota ==');
  const rNova = await POST({ acao: 'salvarLocal', registro: { Tipo: 'ROTA', Nome: 'Rota Sertão' } });
  ok(rNova.ok, 'rota criada', rNova);

  ok((await POST({ acao: 'salvarLocal', registro: { ID: rNova.id, Ativo: 'NAO' } })).ok, 'rota desativada');
  let rr = (await GET({ acao: 'dados' })).locais.find((l) => l.ID === rNova.id);
  ok(rr && rr.Ativo === false && rr.Nome === 'Rota Sertão', 'desativar não apagou o nome', rr);
  ok((await POST({ acao: 'salvarLocal', registro: { ID: rNova.id, Ativo: 'SIM' } })).ok, 'rota reativada');

  // Rota sem uso nenhum pode sumir de verdade.
  ok((await POST({ acao: 'excluir', aba: 'Locais', id: rNova.id })).excluido === true,
    'rota sem vínculo e sem movimento é excluída');

  // Com cliente apontando para ela, apagar quebraria a chave estrangeira: o servidor inativa.
  const rUsada = await POST({ acao: 'salvarLocal', registro: { Tipo: 'ROTA', Nome: 'Rota Litoral' } });
  await POST({ acao: 'salvarLocal', registro: { Tipo: 'CLIENTE', Nome: 'Ponto do Litoral', RotaId: rUsada.id } });
  const tentou = await POST({ acao: 'excluir', aba: 'Locais', id: rUsada.id });
  ok(tentou.inativado === true, 'rota com cliente vinculado é inativada, não apagada', tentou);
  ok(/atende 1 ponto/.test(tentou.aviso || ''), 'o aviso diz quantos pontos dependem dela', tentou.aviso);
  const aindaLa = (await GET({ acao: 'dados' })).locais.find((l) => l.ID === rUsada.id);
  ok(aindaLa && aindaLa.Ativo === false, 'a rota continua no banco, inativa', aindaLa && aindaLa.Ativo);

  console.log('\n== cadastro de motorista ==');
  const dm = await GET({ acao: 'dados' });
  ok(dm.motoristas.length === 1 && dm.motoristas[0].Nome === 'Arilson',
    'rota pública traz os motoristas ativos', dm.motoristas);
  ok(!('CPF' in dm.motoristas[0]) && !('CNH' in dm.motoristas[0]) && !('Telefone' in dm.motoristas[0]),
    'rota pública NÃO expõe CPF, CNH nem telefone', Object.keys(dm.motoristas[0]));

  const eqM = await GET({ acao: 'equipe' });
  ok(eqM.motoristas[0].CPF === '111' && eqM.motoristas[0].CNH === '222',
    'rota do escritório traz o cadastro completo', eqM.motoristas[0]);

  const novoM = await POST({ acao: 'salvarMotorista', registro: {
    Nome: ' Valcy (Jr.) ', Telefone: '81 98888', CPF: '999', CNH: '888',
    CNHCategoria: 'e', CNHValidade: '2020-05-10', Placa: ' qdl2e34 ' } });
  ok(novoM.ok && novoM.criado, 'motorista cadastrado', novoM);
  const motGrav = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === novoM.id);
  ok(motGrav.Nome === 'Valcy (Jr.)', 'nome vem sem espaço sobrando', motGrav.Nome);
  ok(motGrav.Placa === 'QDL2E34', 'placa em maiúsculas', motGrav.Placa);
  ok(motGrav.CNHCategoria === 'E', 'categoria em maiúsculas', motGrav.CNHCategoria);

  const Lm = require(path.join(__dirname, '..', 'api', '_logica.js'));
  ok(Lm.cnhVencida(motGrav) === true, 'CNH de 2020 está vencida', motGrav.CNHValidade);
  ok(Lm.cnhVencida({ CNHValidade: '2099-01-01' }) === false, 'CNH de 2099 não está vencida');
  ok(Lm.cnhVencida({}) === false, 'sem validade cadastrada não conta como vencida');

  await POST({ acao: 'salvarMotorista', registro: { ID: novoM.id, Ativo: 'NAO' } });
  ok(((await GET({ acao: 'dados' })).motoristas || []).every((m) => m.ID !== novoM.id),
    'motorista inativo sai da lista de escolha do celular');
  // O botão de desativar manda só { ID, Ativo }. Se o patch não fosse parcial, um clique
  // apagaria CPF, CNH e placa em silêncio — e ninguém veria até precisar do documento.
  const motDes = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === novoM.id);
  ok(motDes.Ativo === false && motDes.CPF === '999' && motDes.CNH === '888' &&
     motDes.Placa === 'QDL2E34' && motDes.Nome === 'Valcy (Jr.)',
    'desativar pelo botão não apaga o resto do cadastro', motDes);

  await POST({ acao: 'salvarMotorista', registro: { ID: novoM.id, Ativo: 'SIM' } });
  const motRe = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === novoM.id);
  ok(motRe.Ativo === true, 'reativar devolve o motorista');
  ok(((await GET({ acao: 'dados' })).motoristas || []).some((m) => m.ID === novoM.id),
    'e ele volta para a lista de escolha do celular');

  ok((await POST({ acao: 'excluir', aba: 'Motoristas', id: novoM.id })).excluido === true,
    'motorista pode ser excluído');

  console.log('\n== excluir usuário ==');
  const novoU = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Ajudante Temporário', Perfil: 'PROMOTOR', PIN: '4444' } });
  ok(novoU.ok, 'usuário criado', novoU);
  ok((await POST({ acao: 'excluir', aba: 'Usuarios', id: novoU.id })).excluido === true,
    'usuário que nunca lançou nada é excluído');

  // Quem já lançou fica: o nome dele é o que dá peso à divergência no histórico.
  const comHist = await POST({ acao: 'excluir', aba: 'Usuarios', id: 'U003' });
  ok(comHist.inativado === true, 'usuário com lançamento é desativado, não apagado', comHist);
  const u3 = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(u3 && u3.Ativo === false && u3.Nome === 'Motorista Exemplo', 'ele continua no banco, inativo', u3);

  console.log('\n== o último admin não pode sumir ==');
  const offAdmin = await POST({ acao: 'salvarUsuario', registro: { ID: 'U001', Ativo: 'NAO' } });
  ok(offAdmin.ok === false && /último administrador/.test(offAdmin.erro || ''),
    'desativar o último admin é recusado', offAdmin);
  const del = await POST({ acao: 'excluir', aba: 'Usuarios', id: 'U001' });
  ok(del.ok === false && /último administrador/.test(del.erro || ''),
    'excluir o último admin é recusado', del);
  ok((await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U001').Ativo === true,
    'e ele continua ativo depois das duas tentativas');

  // Com um segundo admin, o primeiro deixa de ser insubstituível.
  const admin2 = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Admin Reserva', Perfil: 'ADMIN', PIN: '5555', Usuario: 'reserva' } });
  ok(admin2.ok && (await POST({ acao: 'salvarUsuario', registro: { ID: 'U001', Ativo: 'NAO' } })).ok,
    'com outro admin ativo, o primeiro pode ser desativado');
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U001', Ativo: 'SIM' } });

  console.log('\n== cadastro de local padrão ==');
  const eqLP = await GET({ acao: 'equipe' });
  ok(eqLP.locaisPadrao.length === 1 && eqLP.locaisPadrao[0].Nome === 'Escritório Central',
    'a rota do escritório traz os locais padrão', eqLP.locaisPadrao);
  ok(((await GET({ acao: 'dados' })).locaisPadrao) === undefined,
    'não vaza na rota pública: o celular não precisa disso');

  const lp = await POST({ acao: 'salvarLocalPadrao', registro: { Nome: '  Base Recife  ' } });
  ok(lp.ok && lp.criado, 'local padrão cadastrado', lp);
  const lpGrav = (await GET({ acao: 'equipe' })).locaisPadrao.find((x) => x.ID === lp.id);
  ok(lpGrav && lpGrav.Nome === 'Base Recife', 'nome vem sem espaço sobrando', lpGrav && lpGrav.Nome);

  ok((await POST({ acao: 'excluir', aba: 'LocaisPadrao', id: lp.id })).excluido === true,
    'local padrão sem ninguém dentro é excluído');

  // Em uso, apagar deixaria o usuário apontando para o vazio.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U002', LocalPadrao: 'P001' } });
  const emUso = await POST({ acao: 'excluir', aba: 'LocaisPadrao', id: 'P001' });
  ok(emUso.ok === false && /em uso por 1 usuário/.test(emUso.erro || ''),
    'local padrão em uso é recusado, dizendo quantos dependem dele', emUso);

  console.log('\n== pedido de senha ==');
  const semIdent = await POST({ acao: 'pedirSenha', identificador: '   ' });
  ok(semIdent.ok === false, 'pedido sem identificador é recusado', semIdent);

  // A resposta é a mesma para quem existe e para quem não existe: é o que impede
  // usar esta tela para descobrir quem trabalha aqui.
  const existe = await POST({ acao: 'pedirSenha', identificador: 'admin@qdelicia.com.br' });
  const naoExiste = await POST({ acao: 'pedirSenha', identificador: 'ninguem@lugar.nenhum' });
  ok(existe.ok === true && naoExiste.ok === true &&
     JSON.stringify(existe) === JSON.stringify(naoExiste),
    'resposta idêntica exista o identificador ou não', [existe, naoExiste]);

  const eqPS = await GET({ acao: 'equipe' });
  ok(eqPS.pedidosSenha.length === 2, 'os dois pedidos chegam ao escritório', eqPS.pedidosSenha);
  ok(((await GET({ acao: 'dados' })).pedidosSenha) === undefined,
    'pedido não vaza na rota pública');

  await POST({ acao: 'pedirSenha', identificador: 'ADMIN@qdelicia.com.br' });
  ok((await GET({ acao: 'equipe' })).pedidosSenha.length === 2,
    'pedir de novo não duplica a linha, nem com outra caixa alta');

  const alvoPS = eqPS.pedidosSenha[0];
  ok((await POST({ acao: 'resolverPedidoSenha', id: alvoPS.id })).ok === true,
    'escritório marca o pedido como resolvido');
  const sobrouPS = (await GET({ acao: 'equipe' })).pedidosSenha;
  ok(sobrouPS.length === 1 && sobrouPS[0].id !== alvoPS.id,
    'resolvido sai da lista e o outro fica', sobrouPS);

  console.log('== quem entra no painel ==');

  // A chave é por pessoa; o perfil deixou de decidir sozinho.
  const sGalpao = await POST({ acao: 'login', identificador: 'Conferente Galpão', pin: '1111' });
  ok(sGalpao.usuario.acessoPainel === true, 'conferente com a chave ligada entra', sGalpao.usuario);

  // U003 foi desativado lá atrás, no teste de exclusão; aqui ele precisa entrar de novo.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U003', Ativo: 'SIM' } });
  const sMot = await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '2222' });
  ok(sMot.usuario.acessoPainel === false, 'motorista sem a chave não entra', sMot.usuario);

  // Compara com o retrato de antes: outros testes já mexeram neste usuário, e fixar um
  // valor esperado aqui testaria o histórico do arquivo, não a gravação parcial.
  const antesU2 = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U002');
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U002', AcessoPainel: 'NAO' } });
  const sGalpao2 = await POST({ acao: 'login', identificador: 'Conferente Galpão', pin: '1111' });
  ok(sGalpao2.usuario.acessoPainel === false, 'tirar a chave tira o acesso do conferente');
  const u2 = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U002');
  ok(u2.AcessoPainel === false &&
     JSON.stringify(Object.assign({}, u2,    { AcessoPainel: null })) ===
     JSON.stringify(Object.assign({}, antesU2, { AcessoPainel: null })),
    'gravar só a chave não mexe em mais nada do cadastro', [antesU2, u2]);

  await POST({ acao: 'salvarUsuario', registro: { ID: 'U002', AcessoPainel: 'SIM' } });
  ok((await POST({ acao: 'login', identificador: 'Conferente Galpão', pin: '1111' })).usuario.acessoPainel === true,
    'devolver a chave devolve o acesso');

  // Senão dá para trancar o último administrador do lado de fora, e a volta seria por SQL.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U001', AcessoPainel: 'NAO' } });
  const adm = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U001');
  ok(adm.AcessoPainel === true, 'administrador entra sempre, mesmo com a chave desligada', adm.AcessoPainel);

  // Desativado não entra em lugar nenhum, chave ligada ou não.
  const Lp = require(path.join(__dirname, '..', 'api', '_logica.js'));
  ok(Lp.podeVerPainel({ Perfil: 'ADMIN', Ativo: false }) === false, 'usuário desativado não entra nem sendo admin');
  ok(Lp.podeVerPainel({ Perfil: 'PROMOTOR', AcessoPainel: true }) === true, 'promotor com a chave ligada entra');

  console.log('== de onde e para onde cada um lança ==');

  // Lista vazia quer dizer TODOS. Se fosse "nenhum", o deploy trancaria a operação inteira
  // no primeiro dia, porque ninguém tem nada marcado ainda.
  const semRestricao = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(Array.isArray(semRestricao.Saidas) && semRestricao.Saidas.length === 0,
    'usuário antigo nasce sem restrição', semRestricao.Saidas);
  ok(Lm.locaisPermitidos([], [{ ID: 'L001' }, { ID: 'L010' }]).length === 2,
    'lista vazia libera todos os locais');
  ok(Lm.locaisPermitidos(['L010'], [{ ID: 'L001' }, { ID: 'L010' }]).length === 1,
    'lista com um id deixa passar só ele');
  ok(Lm.locaisPermitidos(['sumiu'], [{ ID: 'L001' }]).length === 0,
    'id de local apagado não inventa permissão');

  await POST({ acao: 'salvarUsuario', registro: {
    ID: 'U003', Saidas: ['L001'], Destinos: ['L010', 'L011'] } });
  const restrito = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(JSON.stringify(restrito.Saidas) === JSON.stringify(['L001']) &&
     JSON.stringify(restrito.Destinos) === JSON.stringify(['L010', 'L011']),
    'as duas listas gravam e voltam na ordem', [restrito.Saidas, restrito.Destinos]);

  // A sessão é o que o celular guarda: sem isto o filtro da tela não teria por onde saber.
  const sess = await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '2222' });
  ok(JSON.stringify(sess.usuario.saidas) === JSON.stringify(['L001']) &&
     JSON.stringify(sess.usuario.destinos) === JSON.stringify(['L010', 'L011']),
    'o login devolve as listas para o app de campo', sess.usuario);

  // Guardar o cadastro sem tocar nas listas não pode apagá-las.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U003', Telefone: '81 90000' } });
  const intacto = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(intacto.Saidas.length === 1 && intacto.Destinos.length === 2,
    'salvar outro campo não zera as permissões', [intacto.Saidas, intacto.Destinos]);

  // E dá para soltar de novo.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U003', Saidas: [], Destinos: [] } });
  const solto = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(solto.Saidas.length === 0 && solto.Destinos.length === 0,
    'desmarcar tudo devolve o acesso a todos os locais');

  console.log('== rota do motorista ==');

  const rotasM = [{ Nome: 'A', Rotas: ['L010'] }, { Nome: 'B', Rotas: ['L010', 'L011'] },
                  { Nome: 'C', Rotas: [] }, { Nome: 'D', Rotas: ['L012'] }];
  const nomes = (l) => l.map((m) => m.Nome).join(',');

  ok(nomes(Lm.motoristasDaRota(rotasM, '')) === 'A,B,C,D',
    'sem rota escolhida aparecem todos');
  ok(nomes(Lm.motoristasDaRota(rotasM, 'L010')) === 'A,B,C',
    'a rota traz os atribuídos mais quem serve qualquer uma', nomes(Lm.motoristasDaRota(rotasM, 'L010')));
  ok(nomes(Lm.motoristasDaRota(rotasM, 'L011')) === 'B,C',
    'motorista de outra rota fica de fora');
  // Travar a saída por falta de cadastro seria pior do que oferecer a lista inteira.
  ok(nomes(Lm.motoristasDaRota(rotasM, 'L099')) === 'A,B,C,D',
    'rota sem ninguém atribuído devolve todos');
  ok(Lm.motoristasDaRota([], 'L010').length === 0, 'sem motorista cadastrado não inventa ninguém');

  await POST({ acao: 'salvarMotorista', registro: { ID: 'D001', Rotas: ['L010', 'L011'] } });
  const motRota = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === 'D001');
  ok(JSON.stringify(motRota.Rotas) === JSON.stringify(['L010', 'L011']),
    'as rotas gravam no cadastro do motorista', motRota.Rotas);
  ok(motRota.CPF === '111', 'gravar só as rotas não apaga o documento', motRota.CPF);

  // O celular filtra sozinho, então precisa das rotas na rota pública — e só delas.
  const pub = (await GET({ acao: 'dados' })).motoristas.find((m) => m.ID === 'D001');
  ok(JSON.stringify(pub.Rotas) === JSON.stringify(['L010', 'L011']),
    'a rota pública leva as rotas do motorista', pub);
  ok(!('CPF' in pub) && !('CNH' in pub) && !('Telefone' in pub),
    'e continua sem CPF, CNH nem telefone', Object.keys(pub));

  await POST({ acao: 'salvarMotorista', registro: { ID: 'D001', Rotas: [] } });
  ok((await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === 'D001').Rotas.length === 0,
    'desmarcar tudo devolve o motorista para todas as rotas');

  console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TODOS OS TESTES PASSARAM\n');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
