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
    { id: 'U001', nome: 'Administrador', perfil: 'ADMIN', pin: '1234', telefone: '', local_padrao: 'L001', ativo: true, usuario: 'admin', email: 'admin@qdelicia.com.br', senha_hash: null },
    { id: 'U002', nome: 'Conferente Galpão', perfil: 'GALPAO', pin: '1111', telefone: '', local_padrao: 'L001', ativo: true },
    { id: 'U003', nome: 'Motorista Exemplo', perfil: 'MOTORISTA', pin: '2222', telefone: '', local_padrao: 'L001', ativo: true },
    { id: 'U004', nome: 'Promotor Exemplo', perfil: 'PROMOTOR', pin: '3333', telefone: '', local_padrao: null, ativo: true }
  ],
  movimentos: [],
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

const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let falhas = 0;
function ok(cond, msg, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '   <<< ' + JSON.stringify(extra)));
  if (!cond) falhas++;
}

/* ---------- cenário ---------- */

async function main() {
  console.log('\n== ligação ==');
  const ping = await GET({ acao: 'ping' });
  ok(ping.ok && ping.motor === 'supabase', 'ping responde com o motor novo', ping);

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

  console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TODOS OS TESTES PASSARAM\n');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
