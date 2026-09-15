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
const fs = require('fs');
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

  console.log('');
  console.log('== PIN nulo nao pode virar a palavra null ==');
  // String(null) da o texto "null", e loginPorPin compara texto com texto: quem
  // digitasse a palavra null entraria como quem esta sem PIN no banco.
  tabelas.usuarios.push({ id: 'U099', nome: 'Sem Pin', perfil: 'PROMOTOR', pin: null,
                          telefone: '', local_padrao: null, ativo: true });
  ok((await POST({ acao: 'login', identificador: 'Sem Pin', pin: 'null' })).ok === false,
     'a palavra null nao entra como quem esta sem PIN');
  ok((await POST({ acao: 'login', identificador: 'Sem Pin', pin: '' })).ok === false,
     'PIN vazio tambem nao entra');
  const uSemPin = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.ID === 'U099')[0];
  ok(uSemPin.TemPin === false, 'a equipe diz que esta pessoa nao tem senha de campo', uSemPin);
  const comPin = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.Nome === 'Motorista Exemplo')[0];
  ok(comPin.TemPin === true, 'e diz que esta tem', comPin);
  ok(!('PIN' in uSemPin) && !('PIN' in comPin), 'sem entregar o PIN em nenhum dos dois');

  console.log('');
  console.log('== tirar o acesso ao painel leva a senha do painel junto ==');
  // Hash que fica sem ninguem poder usar nao e so sujeira: acharPorIdentificador casa
  // pelo NOME e loginPorSenha nao olha acesso ao painel, entao a senha velha continuaria
  // autenticando na API.
  const novoP = await POST({ acao: 'salvarUsuario', registro: {
    Nome: 'Com Painel', Perfil: 'CONFERENTE', PIN: '112233',
    Usuario: 'compainel', Senha: 'senhadopainel1', AcessoPainel: 'SIM' } });
  ok(novoP.ok === true, 'usuario com acesso ao painel criado', novoP);
  const idP = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.Nome === 'Com Painel')[0].ID;
  ok((await POST({ acao: 'login', identificador: 'compainel', senha: 'senhadopainel1' })).ok === true,
     'ele entra no painel com a senha dele');

  await POST({ acao: 'salvarUsuario', registro: { ID: idP, Nome: 'Com Painel', AcessoPainel: 'NAO' } });
  const semAcesso = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.ID === idP)[0];
  ok(semAcesso.AcessoPainel === false, 'o acesso saiu', semAcesso);
  ok(semAcesso.TemSenha === false, 'e a senha do painel saiu junto', semAcesso);
  ok(semAcesso.SenhaProvisoria === false, 'a marca de provisoria tambem', semAcesso);
  ok((await POST({ acao: 'login', identificador: 'compainel', senha: 'senhadopainel1' })).ok === false,
     'a senha velha nao autentica mais na API');
  ok((await POST({ acao: 'login', identificador: 'Com Painel', pin: '112233' })).ok === true,
     'e o app de campo continua funcionando para ele');

  // O admin nao pode perder a senha por causa desta chave: para ele o acesso vem do perfil.
  const idAdmin = 'U001';
  await POST({ acao: 'salvarUsuario', registro: { ID: idAdmin, Senha: 'senhadoadmin1' } });
  await POST({ acao: 'salvarUsuario', registro: { ID: idAdmin, AcessoPainel: 'NAO' } });
  const admPainel = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.ID === idAdmin)[0];
  ok(admPainel.TemSenha === true, 'admin nao perde a senha do painel', admPainel);

  console.log('\n== senha do app de campo: 6 numeros ==');
  // A regra vale para DEFINIR. Barrar no login trancaria para fora quem cadastrou
  // senha antes dela existir — a equipe inteira, de uma vez, no galpao.
  ok((await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '2222' })).ok,
     'senha antiga de 4 digitos continua entrando');
  const curto = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Curto', Perfil: 'PROMOTOR', PIN: '1234' } });
  ok(curto.ok === false && /6 n[uú]meros/.test(curto.erro || ''), 'cadastrar com 4 digitos e recusado', curto);
  const longo = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Longo', Perfil: 'PROMOTOR', PIN: '1234567' } });
  ok(longo.ok === false, 'cadastrar com 7 digitos e recusado', longo);
  const letra = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Letra', Perfil: 'PROMOTOR', PIN: '12a456' } });
  ok(letra.ok === false, 'letra no meio e recusada', letra);
  const certo = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Seis Digitos', Perfil: 'PROMOTOR', PIN: '123456' } });
  ok(certo.ok === true, 'seis digitos e aceito', certo);
  ok((await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '123456' })).ok,
     'e a pessoa entra com ela');

  console.log('\n== primeiro acesso: senha do admin e trocada por quem usa ==');
  // 'Seis Digitos' acabou de ser criado pelo admin logo acima.
  const ent1 = await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '123456' });
  ok(ent1.trocarSenha === true, 'login com a senha do admin pede a troca', ent1);
  // Quem ja usava o app antes disto nao e incomodado.
  const ent0 = await POST({ acao: 'login', identificador: 'Motorista Exemplo', pin: '2222' });
  ok(!ent0.trocarSenha, 'senha antiga, de antes da regra, nao pede troca', ent0);

  // Trocar provando a atual.
  ok((await POST({ acao: 'definirPin', identificador: 'Seis Digitos',
                   pinAtual: '000000', novoPin: '654321' })).ok === false,
     'trocar o PIN com a senha atual errada e recusado');
  const igual = await POST({ acao: 'definirPin', identificador: 'Seis Digitos',
                             pinAtual: '123456', novoPin: '123456' });
  ok(igual.ok === false && /diferente/.test(igual.erro || ''), 'a senha nova tem de ser diferente', igual);
  ok((await POST({ acao: 'definirPin', identificador: 'Seis Digitos',
                   pinAtual: '123456', novoPin: '12345' })).ok === false,
     'a senha nova tambem precisa ter 6 numeros');
  ok((await POST({ acao: 'definirPin', identificador: 'Seis Digitos',
                   pinAtual: '123456', novoPin: '654321' })).ok === true, 'troca aceita');

  const ent2 = await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '654321' });
  ok(ent2.ok === true && !ent2.trocarSenha, 'depois de trocar, entra direto', ent2);
  ok((await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '123456' })).ok === false,
     'a senha do admin nao vale mais');

  // Admin define outra: volta a pedir troca. E o caminho do "esqueci a senha".
  const idSeis = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Seis Digitos')[0].ID;
  await POST({ acao: 'salvarUsuario', registro: { ID: idSeis, Nome: 'Seis Digitos', PIN: '777777' } });
  const ent3 = await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '777777' });
  ok(ent3.trocarSenha === true, 'reset pelo admin volta a pedir a troca', ent3);

  // Editar sem tocar na senha nao pode reacender a marca.
  await POST({ acao: 'definirPin', identificador: 'Seis Digitos', pinAtual: '777777', novoPin: '888888' });
  await POST({ acao: 'salvarUsuario', registro: { ID: idSeis, Nome: 'Seis Digitos', Telefone: '81 9' } });
  const ent4 = await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '888888' });
  ok(!ent4.trocarSenha, 'editar outro campo nao reacende a marca', ent4);

  // O navegador nao pode desligar a marca sozinho.
  await POST({ acao: 'salvarUsuario', registro: { ID: idSeis, Nome: 'Seis Digitos', PIN: '999999',
                                                  PinProvisorio: false } });
  const ent5 = await POST({ acao: 'login', identificador: 'Seis Digitos', pin: '999999' });
  ok(ent5.trocarSenha === true, 'marca vinda do navegador e ignorada', ent5);

  // O painel precisa enxergar quem ainda nao trocou.
  const naEquipe = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.ID === idSeis)[0];
  ok(naEquipe.PinProvisorio === true, 'a equipe mostra quem esta com senha provisoria', naEquipe);
  ok(!('PIN' in naEquipe) && !('SenhaHash' in naEquipe), 'e continua sem PIN nem hash', naEquipe);

  // Mesmo ciclo na senha do painel.
  await POST({ acao: 'salvarUsuario', registro: { ID: idSeis, Nome: 'Seis Digitos',
                                                  Usuario: 'seisd', Senha: 'provisoria123' } });
  const pn1 = await POST({ acao: 'login', identificador: 'seisd', senha: 'provisoria123' });
  ok(pn1.ok === true && pn1.trocarSenha === true, 'painel: senha do admin pede troca', pn1);
  ok((await POST({ acao: 'definirSenha', identificador: 'seisd',
                   senhaAtual: 'provisoria123', novaSenha: 'minhasenha456' })).ok === true,
     'painel: troca aceita');
  const pn2 = await POST({ acao: 'login', identificador: 'seisd', senha: 'minhasenha456' });
  ok(pn2.ok === true && !pn2.trocarSenha, 'painel: depois de trocar, entra direto', pn2);
  // Editar sem tocar na senha nao pode exigir a senha de novo.
  const semPin = await POST({ acao: 'salvarUsuario', registro: { ID: certo.id || certo.ID, Nome: 'Seis Digitos', Perfil: 'MOTORISTA' } });
  ok(semPin.ok !== false || !/6 n[uú]meros/.test(semPin.erro || ''),
     'editar sem mexer na senha nao esbarra na regra', semPin);

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
  const novoU = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Ajudante Temporário', Perfil: 'PROMOTOR', PIN: '444444' } });
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
  const admin2 = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Admin Reserva', Perfil: 'ADMIN', PIN: '555555', Usuario: 'reserva' } });
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
  // Rota sem fixo cai em quem cobre qualquer uma — aqui, o C, que não tem rota marcada.
  // Antes isto devolvia os quatro; com Fixo/Volante, arrastar o fixo de outra rota deixou
  // de fazer sentido. O beco continua fechado: sem nenhum curinga, devolve todos.
  ok(nomes(Lm.motoristasDaRota(rotasM, 'L099')) === 'C',
    'rota sem fixo cai em quem cobre qualquer uma', nomes(Lm.motoristasDaRota(rotasM, 'L099')));
  ok(nomes(Lm.motoristasDaRota([{ Nome: 'X', Rotas: ['L010'] }], 'L099')) === 'X',
    'e sem nenhum curinga devolve todos, para não travar a saída');
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

  console.log('== perfis novos ==');

  ok(Lm.PERFIS.join(',') === 'Admin,Gestor,Gerente,Conferente,Motorista,Promotor',
    'a lista de perfis é a combinada', Lm.PERFIS);

  ['ADMIN', 'CONFERENTE'].forEach((pf) => ok(Lm.podeConferir(pf), pf + ' confere'));
  ok(Lm.podeConferir('GALPAO'), 'GALPAO continua conferindo — sessão antiga no celular');
  ['GESTOR', 'GERENTE', 'MOTORISTA', 'PROMOTOR', '', null].forEach(
    (pf) => ok(!Lm.podeConferir(pf), JSON.stringify(pf) + ' não confere'));

  // A regra central, agora pela negativa: quem não confere gera contagem que espera.
  const CL = (await GET({ acao: 'dados' })).locais.find((l) => l.Tipo === 'CLIENTE');
  const TP = (await GET({ acao: 'dados' })).tipos[0];
  async function devolveComo(perfil) {
    const r = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: CL.ID,
      destinoId: (await GET({ acao: 'dados' })).locais.find((l) => l.Tipo === 'GALPAO').ID,
      itens: [{ tipoCaixaId: TP.ID, qtd: 1 }], dataRef: dia(0), usuarioId: 'U001', perfil: perfil });
    const mov = (await GET({ acao: 'movimentos' })).movimentos.find((m) => m.id === r.criados[0].id);
    return mov.status;
  }
  ok(await devolveComo('GESTOR') === 'AGUARDANDO',
    'devolução de GESTOR nasce AGUARDANDO');
  ok(await devolveComo('GERENTE') === 'AGUARDANDO',
    'devolução de GERENTE nasce AGUARDANDO');
  ok(await devolveComo('CONFERENTE') === 'CONFIRMADO',
    'devolução de CONFERENTE já nasce CONFIRMADA');
  ok(await devolveComo('PROMOTOR') === 'AGUARDANDO',
    'e o promotor continua como sempre foi');

  console.log('== empresa do motorista ==');
  await POST({ acao: 'salvarMotorista', registro: { ID: 'D001', Empresa: '  Qdelícia Frutas  ' } });
  const emp = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === 'D001');
  ok(emp.Empresa === 'Qdelícia Frutas', 'empresa grava sem espaço sobrando', emp.Empresa);
  ok(emp.Nome === 'Arilson', 'e não apaga o resto do cadastro');
  ok(!('Empresa' in (await GET({ acao: 'dados' })).motoristas[0]),
    'empresa não vaza na rota pública — o celular não precisa');

  console.log('== tradutores: ler e gravar batem ==');

  /* Um campo novo foi parar no tradutor de LOCAIS em vez do de MOTORISTAS, por engano de
     substituição de texto — a mesma armadilha que já tinha acontecido no painel. O sintoma
     é mudo: salvar responde ok e o valor simplesmente não vai. A invariante é simples:
     campo que o `de` sabe ler, o `para` precisa saber gravar. */
  {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
    const nomes = ['LOCAL', 'TIPO', 'USUARIO', 'MOTORISTA', 'LOCAL_PADRAO'];
    nomes.forEach((nome) => {
      const ini = fonte.indexOf('var ' + nome + ' = {');
      const corte = fonte.indexOf('\n};', ini);
      const bloco = fonte.slice(ini, corte);
      const iPara = bloco.indexOf('para: function');
      const le = new Set(), grava = new Set();
      let m;
      const reLe = /([A-Z][A-Za-z]*):\s*r\./g;
      while ((m = reLe.exec(bloco.slice(0, iPara)))) le.add(m[1]);
      const rePara = /o\.([A-Z][A-Za-z]*) !== undefined/g;
      while ((m = rePara.exec(bloco.slice(iPara)))) grava.add(m[1]);
      // SenhaHash sai do `de` mas nunca volta ao navegador; Token o backend gera sozinho.
      const ignorar = new Set(['TemSenha']);
      const faltando = [...le].filter((c) => !grava.has(c) && !ignorar.has(c));
      ok(faltando.length === 0, nome + ': todo campo lido tem como ser gravado', faltando);
    });
  }

  console.log('== perfil escrito à mão ==');

  ok(Lm.normalizarPerfil('  supervisor  de   área ') === 'Supervisor de Área',
    'perfil digitado vira Inicial Maiúscula, com conector em minúscula',
    Lm.normalizarPerfil('  supervisor  de   área '));
  ok(Lm.normalizarPerfil('GESTOR') === 'Gestor', 'e MAIÚSCULO digitado também volta ao normal');
  ok(Lm.normalizarPerfil('   ') === '', 'só espaço vira vazio');
  ok(Lm.normalizarPerfil(null) === '', 'nulo não quebra');

  const novoPf = await POST({ acao: 'salvarUsuario', registro: {
    Nome: 'Supervisor Teste', Perfil: '  supervisor de área ', PIN: '432109' } });
  ok(novoPf.ok, 'perfil que não está na lista é aceito', novoPf);
  const gravPf = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === novoPf.id);
  ok(gravPf.Perfil === 'Supervisor de Área', 'e chega normalizado ao cadastro', gravPf.Perfil);

  // O ponto inteiro: cargo inventado não pode virar permissão inventada.
  ok(!Lm.podeConferir('Supervisor de Área'), 'perfil novo NÃO confere');
  ok(Lm.podeConferir('conferente') && Lm.podeConferir('Conferente') && Lm.podeConferir('CONFERENTE'),
    'e a permissão não depende da caixa em que o perfil foi escrito');
  ok(!Lm.podeVerPainel({ Perfil: 'Supervisor de Área', Ativo: true }),
    'perfil novo NÃO entra no painel sozinho — depende da chave');
  ok(Lm.podeVerPainel({ Perfil: 'Supervisor de Área', Ativo: true, AcessoPainel: true }),
    'mas entra se o admin ligar a chave');

  ok((await POST({ acao: 'salvarUsuario', registro: { ID: novoPf.id, Perfil: '   ' } })).ok === false,
    'perfil vazio é recusado');
  const bicho = await POST({ acao: 'salvarUsuario', registro: { ID: novoPf.id, Perfil: 'ADMIN<script>' } });
  ok(bicho.ok === false, 'perfil com símbolo estranho é recusado', bicho);
  ok((await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === novoPf.id).Perfil === 'Supervisor de Área',
    'e a recusa não deixou meio gravado');

  const sugestoes = (await GET({ acao: 'equipe' })).perfis;
  ok(sugestoes.slice(0, 6).join(',') === 'Admin,Gestor,Gerente,Conferente,Motorista,Promotor',
    'os perfis de fábrica vêm primeiro, na ordem pensada', sugestoes);
  ok(sugestoes.indexOf('Supervisor de Área') >= 5,
    'e o escrito à mão entra na sugestão para não virar três grafias', sugestoes);

  await POST({ acao: 'excluir', aba: 'Usuarios', id: novoPf.id });

  console.log('== motorista fixo ou volante ==');

  const eq = [
    { Nome: 'Fixo10',  Tipo: 'Fixo',    Rotas: ['L010'] },
    { Nome: 'Fixo11',  Tipo: 'Fixo',    Rotas: ['L011'] },
    { Nome: 'Volante', Tipo: 'Volante', Rotas: [] },
    { Nome: 'VolMarc', Tipo: 'Volante', Rotas: ['L012'] },
    { Nome: 'Antigo',  Tipo: '',        Rotas: [] }
  ];
  const nm = (l) => l.map((m) => m.Nome).join(',');

  ok(Lm.ehVolante({ Tipo: 'Volante' }) && Lm.ehVolante({ Tipo: ' volante ' }),
    'volante é reconhecido em qualquer caixa e com espaço');
  ok(!Lm.ehVolante({ Tipo: 'Fixo' }) && !Lm.ehVolante({}) && !Lm.ehVolante(null),
    'fixo, vazio e nulo não são volante');

  ok(nm(Lm.motoristasDaRota(eq, 'L010')) === 'Fixo10,Volante,VolMarc,Antigo',
    'a rota traz o fixo dela, os volantes e quem não tem rota', nm(Lm.motoristasDaRota(eq, 'L010')));
  ok(nm(Lm.motoristasDaRota(eq, 'L011')) === 'Fixo11,Volante,VolMarc,Antigo',
    'o fixo de outra rota fica de fora, o volante não');
  // Volante com rota marcada não pode ficar preso a ela: volante roda qualquer uma.
  ok(nm(Lm.motoristasDaRota(eq, 'L012')) === 'VolMarc,Volante,Antigo',
    'volante com rota marcada aparece nela e nas outras', nm(Lm.motoristasDaRota(eq, 'L012')));
  ok(nm(Lm.motoristasDaRota(eq, 'L099')) === 'Volante,VolMarc,Antigo',
    'rota sem fixo cai nos volantes, sem arrastar os fixos alheios');

  // O beco continua fechado: todos fixos e nenhum serve a rota escolhida.
  const sofixos = [{ Nome: 'A', Tipo: 'Fixo', Rotas: ['L010'] }, { Nome: 'B', Tipo: 'Fixo', Rotas: ['L011'] }];
  ok(nm(Lm.motoristasDaRota(sofixos, 'L099')) === 'A,B',
    'sem ninguém possível devolve todos, para não travar a saída');

  await POST({ acao: 'salvarMotorista', registro: { ID: 'D001', Tipo: 'Volante' } });
  const tm = (await GET({ acao: 'equipe' })).motoristas.find((m) => m.ID === 'D001');
  ok(tm.Tipo === 'Volante', 'o tipo grava no cadastro', tm.Tipo);
  ok(tm.CPF === '999' || tm.Nome === 'Arilson', 'e não apaga o resto');

  const pubT = (await GET({ acao: 'dados' })).motoristas.find((m) => m.ID === 'D001');
  ok(pubT.Tipo === 'Volante', 'o celular recebe o tipo, que é quem filtra a lista', pubT);

  await POST({ acao: 'salvarMotorista', registro: { ID: 'D001', Tipo: '' } });


  console.log('\n== fluxo por origem (painel de retornos) ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const DESDE = D('2026-09-01');
    const cen = {
      config: {},
      usuarios: [{ ID: 'U1', Nome: 'Natanias' }],
      locais: [
        { ID: 'L001', Nome: 'Galpão', Tipo: 'GALPAO' },
        { ID: 'R01', Nome: 'João Pessoa', Tipo: 'ROTA', MotoristaId: 'U1' },
        { ID: 'C01', Nome: 'CEASA', Tipo: 'CLIENTE', Responsavel: 'Antônio', RotaId: 'R01' },
        { ID: 'C02', Nome: 'Natal', Tipo: 'CLIENTE', Responsavel: '' },
        { ID: 'C03', Nome: 'Parado', Tipo: 'CLIENTE', Responsavel: 'Zé' }
      ],
      movimentos: [
        // rota: saiu 1000, voltou 400 -> saldo -600, desvio 60% (ruim)
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 1000, DataRef: D('2026-09-02') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R01', DestinoID: 'L001', Qtd: 400, DataRef: D('2026-09-05') },
        // cliente que devolve mais do que levou -> ok
        { Tipo: 'SAIDA', OrigemID: 'R01', DestinoID: 'C01', Qtd: 700, DataRef: D('2026-09-03') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'C01', DestinoID: 'R01', Qtd: 770, DataRef: D('2026-09-06') },
        // cliente com devolução AINDA NÃO conferida: não pode virar retorno
        { Tipo: 'SAIDA', OrigemID: 'R01', DestinoID: 'C02', Qtd: 600, DataRef: D('2026-09-03') },
        { Tipo: 'DEVOLUCAO', Status: 'AGUARDANDO', OrigemID: 'C02', DestinoID: 'R01', Qtd: 500, DataRef: D('2026-09-07') },
        // fora da janela e cancelado: nenhum dos dois conta
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 9000, DataRef: D('2026-08-20') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 5000, DataRef: D('2026-09-04'), Cancelado: true }
      ]
    };
    const f = F.fluxoPorOrigem(cen, DESDE, 90);
    const por = {};
    f.linhas.forEach((l) => { por[l.id] = l; });

    ok(!por.L001, 'galpão fica de fora: ele é a casa, não quem segura a caixa');
    ok(f.linhas.length === 4, 'entram as rotas, filiais e clientes', f.linhas.length);

    ok(por.R01.saida === 1000 && por.R01.retorno === 400,
      'saída é o que CHEGOU no local e retorno é o que ELE devolveu', [por.R01.saida, por.R01.retorno]);
    ok(por.R01.saldo === -600 && por.R01.desvio === 60 && por.R01.situacao === 'ruim',
      'saldo e desvio do período, e acima de 40% a linha é ruim', por.R01);
    ok(por.R01.responsavel === 'Natanias', 'na rota quem responde é o motorista', por.R01.responsavel);

    ok(por.C01.saldo === 70 && por.C01.situacao === 'ok' && por.C01.desvio === -10,
      'devolveu mais do que levou: situação ok', por.C01);
    ok(por.C01.responsavel === 'Antônio', 'no cliente vale o responsável do cadastro');
    ok(por.C01.sub.indexOf('João Pessoa') >= 0, 'o cliente mostra a rota que o atende', por.C01.sub);

    ok(por.C02.retorno === 0 && por.C02.saldo === -600,
      'devolução ainda não conferida NÃO vira retorno', por.C02);
    ok(por.C02.responsavel === '', 'sem responsável cadastrado devolve vazio, não o id');

    ok(por.C03.situacao === 'parado' && por.C03.desvio === null,
      'sem saída e sem retorno não vira 0% de retorno', por.C03);

    ok(f.totais.saida === 2300 && f.totais.retorno === 1170,
      'os totais ignoram cancelado e o que é de antes da janela', f.totais);
    ok(f.totais.deficit === 1200, 'déficit soma só quem está devendo, sem abater quem sobrou', f.totais.deficit);
    ok(f.totais.linhas === 3, 'quem não teve movimento não entra na conta de linhas', f.totais.linhas);
    ok(f.totais.taxaRetorno === 50.9, 'taxa de retorno do conjunto', f.totais.taxaRetorno);
    ok(f.linhas[0].id === 'R01' || f.linhas[0].id === 'C02',
      'quem deve mais aparece primeiro', f.linhas.map((l) => l.id));

    // a quantidade CONFERIDA manda: é ela que entra no razão
    const cen2 = JSON.parse(JSON.stringify(cen));
    cen2.movimentos = [
      { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 100, DataRef: D('2026-09-02') },
      { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R01', DestinoID: 'L001', Qtd: 90, QtdConferida: 80, DataRef: D('2026-09-05') }
    ];
    cen2.locais = cen.locais;
    const f2 = F.fluxoPorOrigem(cen2, DESDE, 90);
    const r2 = f2.linhas.filter((l) => l.id === 'R01')[0];
    ok(r2.retorno === 80, 'vale a quantidade conferida, não a declarada', r2.retorno);

    // meta: conta quem ficou abaixo dela
    ok(f.totais.foraDaMeta === 2, 'duas das três linhas com movimento ficaram abaixo de 90%', f.totais.foraDaMeta);
  }


  console.log('\n== filtro por quem lançou (Movimentos) ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [{ ID: 'L1', Nome: 'Galpão' }, { ID: 'L2', Nome: 'Caruaru' }];
    const tipos = [{ ID: 'T1', Nome: 'CX G' }];
    const users = [{ ID: 'U1', Nome: 'Nestor Neto' }, { ID: 'U2', Nome: 'Ramos' }];
    const mv = (u, d) => ({
      ID: 'M' + u + d, Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'L2', TipoCaixaID: 'T1',
      Qtd: 10, Status: 'CONFIRMADO', UsuarioID: u, DataRef: D(d), DataHora: D(d)
    });
    const movs = [mv('U1', '2026-09-10'), mv('U2', '2026-09-11'), mv('U1', '2026-09-12')];

    const todos = F.listaMovimentos(movs, locais, tipos, users, {});
    ok(todos.length === 3, 'sem filtro vêm todos', todos.length);

    const so1 = F.listaMovimentos(movs, locais, tipos, users, { usuario: 'U1' });
    ok(so1.length === 2 && so1.every((m) => m.usuario === 'Nestor Neto'),
      'filtra pelo id de quem lançou', so1.map((m) => m.usuario));

    ok(F.listaMovimentos(movs, locais, tipos, users, { usuario: 'U9' }).length === 0,
      'usuário sem lançamento devolve lista vazia, não a lista toda');

    // O motivo de o filtro ser no servidor: o corte do limite vem DEPOIS dele.
    const muitos = [];
    for (let i = 0; i < 40; i++) muitos.push(mv('U2', '2026-09-20'));
    muitos.push(mv('U1', '2026-08-01'));   // o mais antigo, cai no fim da ordenação
    const comLimite = F.listaMovimentos(muitos, locais, tipos, users, { usuario: 'U1', limit: 5 });
    ok(comLimite.length === 1,
      'o limite corta DEPOIS do filtro: o lançamento antigo da pessoa não se perde', comLimite.length);
  }


  console.log('\n== fluxo por pessoa (motoristas e usuários) ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const DESDE = D('2026-09-01');
    const cen = {
      usuarios: [
        { ID: 'U1', Nome: 'Nestor Neto', Perfil: 'Conferente' },
        { ID: 'U2', Nome: 'Ivanilda', Perfil: 'Gestor' }
      ],
      movimentos: [
        // Ramos levou 580 na rota Caruaru e nao trouxe nada: deficit inteiro
        { Tipo: 'SAIDA', Qtd: 580, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U1', DataRef: D('2026-09-05') },
        // Wesley levou 300 e trouxe 300: quitado
        { Tipo: 'SAIDA', Qtd: 300, Motorista: 'Wesley', Rota: 'Maceió', UsuarioID: 'U1', DataRef: D('2026-09-06') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', Qtd: 300, Motorista: 'Wesley', Rota: 'Maceió', UsuarioID: 'U2', DataRef: D('2026-09-09') },
        // devolucao sem conferencia nao conta para ninguem
        { Tipo: 'DEVOLUCAO', Status: 'AGUARDANDO', Qtd: 500, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U2', DataRef: D('2026-09-10') },
        // perda nao e fluxo de ida e volta
        { Tipo: 'PERDA', Qtd: 40, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U1', DataRef: D('2026-09-11') },
        // fora da janela
        { Tipo: 'SAIDA', Qtd: 9000, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U1', DataRef: D('2026-08-20') },
        // cancelado
        { Tipo: 'SAIDA', Qtd: 7000, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U1', DataRef: D('2026-09-12'), Cancelado: true }
      ]
    };
    const p = F.fluxoPorPessoa(cen, DESDE);
    const mot = {}; p.motoristas.forEach((x) => { mot[x.nome] = x; });
    const usu = {}; p.usuarios.forEach((x) => { usu[x.nome] = x; });

    ok(p.motoristas.length === 2, 'um por motorista que aparece nos movimentos', p.motoristas.map((x) => x.nome));
    ok(mot.Ramos.saida === 580 && mot.Ramos.retorno === 0,
      'cancelado, fora da janela, perda e devolução não conferida ficam todos de fora', mot.Ramos);
    ok(mot.Ramos.saldo === -580 && mot.Ramos.desvio === 100 && mot.Ramos.situacao === 'ruim',
      'levou e não trouxe: desvio de 100%', mot.Ramos);
    ok(mot.Ramos.responsavel === 'Caruaru',
      'a quinta coluna do motorista traz as rotas dele, não o nome repetido', mot.Ramos.responsavel);
    ok(mot.Wesley.saldo === 0 && mot.Wesley.situacao === 'ok', 'quem trouxe tudo fica ok', mot.Wesley);
    ok(p.motoristas[0].nome === 'Ramos', 'quem deve mais aparece primeiro', p.motoristas.map((x) => x.nome));

    // usuario e quem LANCOU: a devolucao do Wesley foi lancada pela Ivanilda
    ok(usu['Nestor Neto'].saida === 880 && usu['Nestor Neto'].retorno === 0,
      'o usuário soma o que ELE lançou de saída', usu['Nestor Neto']);
    ok(usu.Ivanilda.retorno === 300 && usu.Ivanilda.saida === 0,
      'e o que ELE lançou de devolução, ainda que a carga seja de outro', usu.Ivanilda);
    ok(usu['Nestor Neto'].responsavel === 'Conferente' && usu.Ivanilda.responsavel === 'Gestor',
      'na visão de usuário a quinta coluna é o perfil', [usu['Nestor Neto'].responsavel, usu.Ivanilda.responsavel]);
    ok(mot.Wesley.sub === '2 lançamentos',
      'a linha de baixo conta lançamentos, sem repetir a coluna ao lado', mot.Wesley.sub);
    ok(mot.Ramos.sub === '1 lançamento', 'e no singular quando é um só', mot.Ramos.sub);
    // A Ivanilda lançou duas devoluções, mas uma ainda espera conferência e vale 0.
    // A contagem segue os números da linha: conta o que entrou na conta.
    ok(usu.Ivanilda.sub === '1 lançamento',
      'lançamento que não entrou na conta também não entra na contagem', usu.Ivanilda.sub);

    // motorista em branco no movimento nao pode virar uma linha "sem nome"
    const semMot = F.fluxoPorPessoa({
      usuarios: [{ ID: 'U1', Nome: 'A' }],
      movimentos: [{ Tipo: 'SAIDA', Qtd: 10, Motorista: '', UsuarioID: 'U1', DataRef: D('2026-09-05') }]
    }, DESDE);
    ok(semMot.motoristas.length === 0, 'movimento sem motorista não cria linha vazia', semMot.motoristas);
    ok(semMot.usuarios.length === 1, 'mas continua contando para quem lançou');
  }


  console.log('\n== responsável e detalhe da linha (Painel de Ativos) ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const DESDE = D('2026-09-01');
    const cen = {
      config: {},
      tipos: [{ ID: 'T1', Nome: 'CX P' }, { ID: 'T2', Nome: 'CX G' }],
      usuarios: [{ ID: 'U9', Nome: 'Motorista do Cadastro', Perfil: 'Motorista' }],
      locais: [
        { ID: 'L1', Nome: 'Galpão', Tipo: 'GALPAO' },
        // rota SEM motorista no cadastro: o nome tem de vir do lançamento
        { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' },
        // rota COM motorista no cadastro: o cadastro manda, mesmo com outro dirigindo
        { ID: 'R2', Nome: 'Recife', Tipo: 'ROTA', MotoristaId: 'U9' },
        // cliente sem responsável: NÃO pode herdar o motorista que entregou
        { ID: 'C1', Nome: 'CEASA', Tipo: 'CLIENTE' }
      ],
      movimentos: [
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T1', Qtd: 50,
          Motorista: 'Ramos', DataRef: D('2026-09-05') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T2', Qtd: 530,
          Motorista: 'Ramos', DataRef: D('2026-09-06') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R2', TipoCaixaID: 'T1', Qtd: 100,
          Motorista: 'Outro Qualquer', DataRef: D('2026-09-06') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'C1', TipoCaixaID: 'T1', Qtd: 30,
          Motorista: 'Ramos', DataRef: D('2026-09-07') }
      ]
    };
    const f = F.fluxoPorOrigem(cen, DESDE, 90);
    const por = {}; f.linhas.forEach((l) => { por[l.id] = l; });

    ok(por.R1.responsavel === 'Ramos',
      'rota sem motorista no cadastro pega quem dirigiu no lançamento', por.R1.responsavel);
    ok(por.R1.respDoCadastro === false,
      'e a linha avisa que o nome não veio do cadastro', por.R1.respDoCadastro);

    ok(por.R2.responsavel === 'Motorista do Cadastro' && por.R2.respDoCadastro === true,
      'com motorista no cadastro, o cadastro manda — ele é a designação oficial', por.R2);

    ok(por.C1.responsavel === '',
      'cliente NÃO herda o motorista: quem entregou não responde pelas caixas do cliente',
      por.C1.responsavel);

    ok(por.R1.sub === 'rota · 2 lançamentos · CX G, CX P',
      'a linha de baixo traz lançamentos e os tipos de caixa somados ali', por.R1.sub);
    ok(por.R1.caixas.join(',') === 'CX G,CX P' && por.R1.lancamentos === 2,
      'e os mesmos dados vêm soltos, para quem quiser montar outra tela', por.R1);

    // dois motoristas na mesma rota aparecem os dois, e sem repetir
    const cen2 = JSON.parse(JSON.stringify(cen));
    cen2.movimentos = cen.movimentos.map((m) => Object.assign({}, m, { DataRef: D('2026-09-05') }));
    cen2.movimentos[1].Motorista = 'Wesley';
    cen2.movimentos.push(Object.assign({}, cen.movimentos[0], { Motorista: 'Ramos', DataRef: D('2026-09-08') }));
    const f2 = F.fluxoPorOrigem(cen2, DESDE, 90);
    const r1 = f2.linhas.filter((l) => l.id === 'R1')[0];
    ok(r1.responsavel === 'Ramos, Wesley',
      'dois motoristas na rota aparecem os dois, em ordem e sem repetir', r1.responsavel);
  }


  console.log('\n== ciclo da carga: Enviada, Parcial, Devolvida ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [{ ID: 'L1', Nome: 'Galpão' }, { ID: 'R1', Nome: 'Caruaru' }];
    const tipos = [{ ID: 'P', Nome: 'CX P' }, { ID: 'G', Nome: 'CX G' }];
    const users = [{ ID: 'U1', Nome: 'Nestor' }];
    const sai = (id, cx, q, dia) => ({
      ID: id, Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: cx, Qtd: q,
      UsuarioID: 'U1', DataRef: D(dia), DataHora: D(dia)
    });
    const volta = (id, cx, q, dia, st) => ({
      ID: id, Tipo: 'DEVOLUCAO', Status: st || 'CONFIRMADO', OrigemID: 'R1', DestinoID: 'L1',
      TipoCaixaID: cx, Qtd: q, UsuarioID: 'U1', DataRef: D(dia), DataHora: D(dia)
    });
    const rot = (movs) => {
      const r = {};
      F.listaMovimentos(movs, locais, tipos, users, {}).forEach((x) => { r[x.id] = x.situacao; });
      return r;
    };

    ok(rot([sai('S1', 'P', 50, '2026-09-01')]).S1 === 'Enviada',
      'saída sem nenhuma devolução fica Enviada');

    ok(rot([sai('S1', 'P', 50, '2026-09-01'), volta('D1', 'P', 50, '2026-09-05')]).S1 === 'Devolvida',
      'voltou tudo: Devolvida');

    ok(rot([sai('S1', 'P', 50, '2026-09-01'), volta('D1', 'P', 20, '2026-09-05')]).S1 === 'Parcial',
      'voltou parte: Parcial');

    // o abatimento é do MAIS ANTIGO primeiro
    let r = rot([sai('S1', 'P', 50, '2026-09-01'), sai('S2', 'P', 80, '2026-09-03'),
                 volta('D1', 'P', 50, '2026-09-05')]);
    ok(r.S1 === 'Devolvida' && r.S2 === 'Enviada',
      'o que volta abate a remessa mais antiga, não a última', r);

    // tipo de caixa não se mistura: CX G que volta não quita CX P
    r = rot([sai('S1', 'P', 50, '2026-09-01'), sai('S2', 'G', 50, '2026-09-01'),
             volta('D1', 'G', 50, '2026-09-05')]);
    ok(r.S1 === 'Enviada' && r.S2 === 'Devolvida',
      'CX G que volta não quita a remessa de CX P', r);

    // local não se mistura: devolução de outro lugar não abate esta rota
    r = rot([sai('S1', 'P', 50, '2026-09-01'),
             { ID: 'D9', Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'L9', DestinoID: 'L1',
               TipoCaixaID: 'P', Qtd: 50, UsuarioID: 'U1', DataRef: D('2026-09-05'), DataHora: D('2026-09-05') }]);
    ok(r.S1 === 'Enviada', 'devolução vinda de outro local não abate esta remessa', r);

    // devolução ainda não conferida NÃO quita: é o mesmo critério do saldo
    ok(rot([sai('S1', 'P', 50, '2026-09-01'),
            volta('D1', 'P', 50, '2026-09-05', 'AGUARDANDO')]).S1 === 'Enviada',
      'devolução esperando conferência não quita a remessa');

    // cancelada não conta
    const canc = volta('D1', 'P', 50, '2026-09-05');
    canc.Cancelado = true;
    ok(rot([sai('S1', 'P', 50, '2026-09-01'), canc]).S1 === 'Enviada',
      'devolução cancelada não quita a remessa');

    // a quantidade CONFERIDA é que abate, não a declarada
    const parcialConf = volta('D1', 'P', 50, '2026-09-05');
    parcialConf.QtdConferida = 30;
    r = rot([sai('S1', 'P', 50, '2026-09-01'), parcialConf]);
    ok(r.S1 === 'Parcial', 'vale a quantidade conferida: 30 de 50 é Parcial', r);

    // os outros tipos dizem o que são, já que a coluna Tipo deixou de existir
    r = rot([{ ID: 'X1', Tipo: 'PERDA', OrigemID: 'R1', TipoCaixaID: 'P', Qtd: 5, UsuarioID: 'U1', DataRef: D('2026-09-02'), DataHora: D('2026-09-02') },
             { ID: 'X2', Tipo: 'AJUSTE', DestinoID: 'L1', TipoCaixaID: 'P', Qtd: 5, UsuarioID: 'U1', DataRef: D('2026-09-02'), DataHora: D('2026-09-02') },
             { ID: 'X3', Tipo: 'TRANSFERENCIA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'P', Qtd: 5, UsuarioID: 'U1', DataRef: D('2026-09-02'), DataHora: D('2026-09-02') }]);
    ok(r.X1 === 'Perda' && r.X2 === 'Ajuste' && r.X3 === 'Transferida',
      'perda, ajuste e transferência continuam se identificando na coluna', r);

    // o corte do filtro não pode inventar "Enviada"
    const movs = [sai('S1', 'P', 50, '2026-08-01'), volta('D1', 'P', 50, '2026-08-20')];
    const soSetembro = F.listaMovimentos(movs, locais, tipos, users, { de: '2026-08-01', ate: '2026-08-10' });
    ok(soSetembro.length === 1 && soSetembro[0].situacao === 'Devolvida',
      'devolução fora da janela filtrada ainda quita a remessa que aparece', soSetembro[0]);
  }

  console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TODOS OS TESTES PASSARAM\n');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
