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
const fsReal = require('fs');
const path = require('path');

/* Mesma razao do `teste_tela.js`: o recorte por texto fecha numa quebra de linha, e uma
   copia de trabalho em CRLF faz o recorte ir ate o fim do arquivo em silencio. */
const fs = {
  readFileSync: function (p, enc) {
    const d = fsReal.readFileSync(p, enc);
    return typeof d === 'string' ? d.replace(new RegExp(String.fromCharCode(13), 'g'), '') : d;
  },
  existsSync: function (p) { return fsReal.existsSync(p); }
};

/* ---------- banco falso ---------- */

/* O que "tudo liberado" quer dizer neste banco falso. Escrito uma vez: repetido em cada
   usuario, o primeiro id novo entraria em tres deles e ficaria faltando no quarto. */
const TUDO = {
  locais: ['L001', 'L002', 'L003'],
  tipos: ['T001', 'T002'],
  motoristas: ['D001'],
  usuarios: ['U001', 'U002', 'U003', 'U004'],
  operacoes: ['SAIDA', 'RETORNO'],
  abas: ['pgRetornos', 'pgPainel', 'pgExtrato', 'pgMovimentos', 'pgColunas']
};

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
  /* Os cadastros como ficam DEPOIS da migracao `2026-09-22-marcar-o-que-ja-valia`: com
     a convencao "nada marcado = nada liberado", um banco de verdade nao tem mais listas
     vazias por descuido — o que estava vazio foi preenchido com o que a pessoa ja via.

     Escrever o seed com as listas vazias seria testar contra um banco que nao existe
     mais, e ele passaria a recusar todo lancamento por falta de permissao. */
  usuarios: [
    /* O ADMINISTRADOR VE TODO MUNDO — lista de vistos VAZIA, que e a convencao do
       projeto para "todos". Com a lista dos quatro semeados, cada usuario que um teste
       criasse ficaria de fora dos numeros: os lancamentos dele sumiriam do saldo, do
       aging e do extrato, e o teste reprovaria falando de outra coisa. */
    { id: 'U001', nome: 'Administrador', perfil: 'ADMIN', pin: '1234', telefone: '', local_padrao: 'L001', ativo: true, usuario: 'admin', email: 'admin@qdelicia.com.br', senha_hash: null, acesso_painel: true,
      operacoes: TUDO.operacoes, saidas: TUDO.locais, destinos: TUDO.locais, ajustes: TUDO.locais,
      tipos_caixa: TUDO.tipos, motoristas: TUDO.motoristas, usuarios_vistos: [] },
    { id: 'U002', nome: 'Conferente Galpão', perfil: 'GALPAO', pin: '1111', telefone: '', local_padrao: 'L001', ativo: true, acesso_painel: true,
      abas: TUDO.abas, operacoes: TUDO.operacoes, saidas: TUDO.locais, destinos: TUDO.locais, ajustes: TUDO.locais,
      tipos_caixa: TUDO.tipos, motoristas: TUDO.motoristas, usuarios_vistos: TUDO.usuarios },
    { id: 'U003', nome: 'Motorista Exemplo', perfil: 'MOTORISTA', pin: '2222', telefone: '', local_padrao: 'L001', ativo: true,
      abas: TUDO.abas, operacoes: TUDO.operacoes, saidas: TUDO.locais, destinos: TUDO.locais, ajustes: TUDO.locais,
      tipos_caixa: TUDO.tipos, motoristas: TUDO.motoristas, usuarios_vistos: TUDO.usuarios },
    /* O promotor com so RETORNO — era o atalho por perfil que o app de campo tinha, e
       que a migracao gravou como lista explicita quando a convencao virou. */
    { id: 'U004', nome: 'Promotor Exemplo', perfil: 'PROMOTOR', pin: '3333', telefone: '', local_padrao: null, ativo: true,
      abas: TUDO.abas, operacoes: ['RETORNO'], saidas: TUDO.locais, destinos: TUDO.locais, ajustes: TUDO.locais,
      tipos_caixa: TUDO.tipos, motoristas: TUDO.motoristas, usuarios_vistos: TUDO.usuarios }
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
  /* AS DUAS TABELAS MAIS NOVAS FALTAVAM AQUI, e a falta nao reprovava nada: o
     `carregarTudo` de mentira simplesmente nao as devolvia, entao toda regra que
     dependesse delas rodava contra `undefined` e respondia "nao achei" — que e' uma
     resposta plausivel. A prova logo abaixo cobra que as chaves daqui sejam as mesmas
     do `carregarTudo` de verdade, para a proxima tabela nao nascer esquecida. */
  veiculos: [],
  fornecedores: [],
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
  /* O mesmo patch em várias linhas — o que o "Apagar o que está no filtro" usa desde que
     apagar virou mandar para a lixeira. Sem isto no banco falso, aquele caminho não podia
     ser testado de ponta a ponta: era justamente o que leva centenas de linhas de uma vez. */
  atualizarVarios: async (t, ids, patch) => {
    (ids || []).forEach((id) => {
      const alvo = tabelas[t].find((r) => r.id === id);
      if (alvo) Object.assign(alvo, patch);
    });
    return null;
  },
  removerVarios: async (t, ids) => {
    (ids || []).forEach((id) => {
      const i = tabelas[t].findIndex((r) => r.id === id);
      if (i >= 0) tabelas[t].splice(i, 1);
    });
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
      veiculos: tabelas.veiculos.map(real.VEICULO.de),
      fornecedores: tabelas.fornecedores.map(real.FORNECEDOR.de),
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
/* QUEM ESTA PERGUNTANDO. Desde que o recorte dos lancamentos passou a sair do CADASTRO,
   toda leitura precisa dizer quem e — sem isso a rota devolve lista vazia, de proposito:
   e a unica escolha segura para uma identidade que falta.
   O padrao e o administrador, que ve todo mundo. Quem cobra o recorte em si e a secao
   "de quem a pessoa ve os lancamentos", que passa o `quem` dela na mao. */
const LEITOR = 'U001';
const GET = (p) => chamar('GET',
  p && p.quem !== undefined ? p : Object.assign({ quem: LEITOR }, p));
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

  /* E TODA ENTRADA TEM AS TRES CHAVES. A `nota` e' a unica coisa que aparece no log da
     Vercel quando uma migracao roda, e `nome` em vez de `nota` nao quebra nada: a
     migracao aplica, e a linha do log sai "migracao aplicada: <id> — undefined". O
     unico registro do que aconteceu com o banco fica ilegivel, e so' se descobre no dia
     em que alguem for ler o log atras de um estrago. Eu escrevi `nome` e nenhuma prova
     reclamou. */
  const semChave = previstas.filter((m) => !m.id || !m.nota || !m.sql);
  ok(!semChave.length,
    'e toda migração declara `id`, `nota` e `sql` — sem a `nota`, a linha do log sai ' +
    '"aplicada: <id> — undefined", e o único registro do que aconteceu com o banco ' +
    'fica ilegível', semChave.map((m) => m.id || JSON.stringify(Object.keys(m))));

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

  /* ---- E A ROTA CHAMA A GUARDA DO FORNECEDOR ----
   *
   * A regra ja' e' provada em separado; o que ESTA prova mede e' que a rota a chama.
   * Arrancar a chamada de `gravarMovimento` nao quebrava nada, porque nada perguntava
   * se ela estava la' — a mesma escapada da guarda da placa.
   *
   * SEGURO DE RODAR AO VIVO: o esperado e' a RECUSA, entao nada e' gravado. A frase e'
   * conferida para a prova nao passar por outro motivo de recusa. */
  /* A ROTA DE FORNECEDOR E' CRIADA AQUI, pela propria API: o seed nao tem nenhuma, e
     marcar o local a mao no banco de mentira provaria o cadastro do teste e nao o do
     sistema. De quebra, isto exercita a gravacao da marca. */
  var rotaForn = await POST({ acao: 'salvarLocal', registro: {
    Tipo: 'ROTA', Nome: 'Rota Fornecedor (prova)', PedeFornecedor: 'SIM' } });
  ok(rotaForn.ok && rotaForn.id, 'a rota de fornecedor foi criada pela API', rotaForn);
  var marcada = ((await GET({ acao: 'dados' })).locais || [])
    .filter(function (l) { return String(l.ID) === String(rotaForn.id); })[0];
  ok(marcada && marcada.PedeFornecedor === true,
    'e a marca VOLTA do banco — gravada e nao lida, a regra nunca ligaria e o campo ' +
    'seria um interruptor sem fio', marcada && marcada.PedeFornecedor);

  var semMot = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G,
    destinoId: rotaForn.id, itens: [{ tipoCaixaId: T, qtd: 1 }], dataRef: dia(-1),
    usuarioId: 'U003', perfil: 'MOTORISTA' });
  ok(semMot.ok === false && /fornecedor do cadastro/.test(String(semMot.erro || '')),
    'e a ROTA recusa um lancamento pela rota de fornecedor sem fornecedor — a ' +
    'tela esconder a lista e conveniencia, e um POST direto passa por cima dela',
    semMot);

  /* ---- A PLACA DIGITADA PASSA PELA ROTA, E E' ELA QUE RECUSA ----
   *
   * A regra do formato ja' e' provada em separado. O que ESTA prova mede e' outra
   * coisa: que a ROTA a chama. A tela recusar e' conveniencia, e um POST direto passa
   * por cima dela — e foi exatamente isso que escapou da sabotagem: arrancar a guarda
   * de `gravarMovimento` nao quebrava nada, porque nada perguntava se ela estava la'.
   *
   * SEGURO DE RODAR AO VIVO: o esperado e' a RECUSA, entao nada e' gravado. E a frase
   * do erro e' conferida, senao a prova passaria por qualquer outro motivo de recusa —
   * permissao, base, data — e estaria medindo o nada. */
  const placaRuim = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G,
    destinoId: C, itens: [{ tipoCaixaId: T, qtd: 1 }], dataRef: dia(-1),
    usuarioId: 'U003', perfil: 'MOTORISTA', veiculo: 'CARRO.TEST' });
  ok(placaRuim.ok === false && /[Pp]laca inválida/.test(String(placaRuim.erro || '')),
    'a rota RECUSA uma placa que não é placa — desde que ela pode ser digitada, sem ' +
    'esta guarda a coluna Veículo viraria campo livre, e quem procurasse por placa não ' +
    'acharia nada', placaRuim);
  /* E SO' A RECUSA SE PROVA AQUI. O caminho que ACEITA grava um lancamento, e esta
     suite e' uma sequencia com saldos exatos — um movimento a mais desloca todas as
     contas seguintes, e a prova viraria a causa do erro que ela deveria achar. Que a
     placa boa passa ja' esta' provado no `teste_tela.js`, contra a mesma funcao, sem
     tocar no banco. */

  let p = (await GET({ acao: 'painel' })).painel;
  let cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 150, 'saldo do cliente = 150', cli.saldo);

  console.log('\n== devolução contada pelo promotor (sem etapa de conferência, conta na hora) ==');
  /* `dia(0)` E NAO `dia(-1)`: trinta linhas abaixo esta prova cobra `divergenciaMes`, que
     so' conta o MES CORRENTE. Lancando ontem, ela passou todos os dias de setembro e
     ficou vermelha sozinha no dia 1 de outubro, sem ninguem ter tocado em nada — o
     relogio virou o mes e levou o lancamento junto. Uma prova de "neste mes" lanca
     dentro do mes, e hoje esta dentro de qualquer mes. */
  const dev = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: C, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 80 }], dataRef: dia(0), usuarioId: 'U004', perfil: 'PROMOTOR' });
  ok(dev.status === 'CONFIRMADO',
    'devolução nasce confirmada mesmo vinda de quem antes não podia conferir', dev.status);
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 70, 'o saldo do cliente cai na hora: 150 menos as 80 devolvidas', cli.saldo);
  ok(cli.emConferencia === 0, 'nada fica esperando conferência', cli.emConferencia);
  ok((await GET({ acao: 'pendentes' })).movimentos.length === 0,
    'a fila de conferência não existe mais');

  // A rota `conferir` continua servindo para registrar que chegou quantidade diferente da
  // declarada. O que mudou é que ela deixou de ser o portão do saldo: agora só ajusta.
  console.log('\n== divergência lançada depois: chegaram 75 ==');
  const conf = await POST({ acao: 'conferir', id: dev.criados[0].id, qtdConferida: 75, obs: 'faltaram 5', usuarioId: 'U002' });
  ok(conf.ok && conf.divergencia === -5, 'divergência de -5 registrada', conf);
  p = (await GET({ acao: 'painel' })).painel; cli = p.locais.find((l) => l.id === C);
  ok(cli.saldo === 75, 'saldo passa a valer a quantidade contada: 150 - 75', cli.saldo);
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
  /* A FILIAL ESTA NO ESTOQUE, E NAO ENTRE OS TERCEIROS.
     Caixa parada numa casa nossa e estoque; caixa parada num cliente e divida de alguem.
     A filial estava do lado errado dessa linha — somada com os clientes em "caixas em
     poder de terceiros" —, e por isso o estoque dela nao aparecia no total do painel e
     ela entrava no aging como se houvesse alguem a cobrar. Cobrar a filial e cobrar de
     casa. O SALDO DELA NAO MUDOU: mudou de balde. */
  const fil = p.galpoes.find((g) => g.id === F); cli = p.locais.find((l) => l.id === C);
  ok(fil && fil.saldo === 170, 'a filial fica com 170, e esse saldo conta como ESTOQUE',
     fil && fil.saldo);
  ok(!p.locais.some((l) => l.id === F),
     'e ela NAO aparece entre quem esta com a nossa caixa — essa lista alimenta o aging, ' +
     'as vencidas e a cobranca, e a empresa nao cobra de si mesma',
     p.locais.map((l) => l.id).join(','));
  ok(cli.saldo === 100, 'cliente sobe para 100', cli.saldo);
  const galp = p.galpoes.find((g) => g.id === G);
  ok(galp.saldo === 1000 - 100 - 50 + 75 - 200, 'estoque do galpão = 725', galp.saldo);

  /* ================= CADA CAIXA PARADA TEM UM BALDE, E UM SO =================
   *
   * Sao tres baldes, e eles existem para responder ONDE a caixa esta:
   *   galpoes  -> nas nossas casas (galpao e filial)  = ESTOQUE
   *   locais   -> com o cliente                        = divida de alguem
   *   rotas    -> no caminhao                          = em transito
   *
   * A filial estava em `locais`, junto dos clientes. Duas consequencias, e as duas
   * apareceram na tela do escritorio: o estoque da filial nao entrava no "Total no
   * Estoque", e ela entrava no aging e nas vencidas como se houvesse alguem a cobrar.
   *
   * A PROVA QUE IMPORTA E A DA SOMA. Sem AJUSTE e sem PERDA, tirar da origem e por no
   * destino conserva tudo: a soma dos tres baldes tem de dar ZERO. Se ela nao der, ou um
   * local ficou de fora de todos os baldes — e sumiu da conta —, ou esta em dois, e a
   * mesma caixa e contada duas vezes. Nenhuma das duas aparece olhando um numero
   * sozinho: os dois erros produzem totais plausiveis. */
  {
    const pb = (await GET({ acao: 'painel' })).painel;
    const soma = (l) => l.reduce((s, x) => s + (x.saldo || 0), 0);
    const emCasa = soma(pb.galpoes), comTerceiro = soma(pb.locais), noCaminhao = soma(pb.rotas);

    /* O QUE ENTROU A MAO entra na conta: o AJUSTE e a unica linha que cria caixa, e a
       PERDA a unica que a destroi. O resto so' muda de lugar. */
    const todos = (await GET({ acao: 'movimentos', limit: 100000 })).movimentos || [];
    const ajustes = todos.filter((m) => m.tipo === 'AJUSTE')
      .reduce((s, m) => s + Number(m.qtd || 0), 0);
    const perdas = todos.filter((m) => m.tipo === 'PERDA')
      .reduce((s, m) => s + Number(m.qtd || 0), 0);

    ok(emCasa + comTerceiro + noCaminhao === ajustes - perdas,
      'os tres baldes fecham com o que foi criado menos o que foi perdido \u2014 um local ' +
      'fora de todos eles some da conta, e um local em dois \u00e9 contado duas vezes: os ' +
      'dois erros d\u00e3o totais plaus\u00edveis, e nenhum aparece olhando um n\u00famero sozinho',
      { emCasa, comTerceiro, noCaminhao, ajustes, perdas,
        soma: emCasa + comTerceiro + noCaminhao, esperado: ajustes - perdas });

    /* E NENHUM LOCAL EM DOIS BALDES. A conta acima fecharia mesmo assim se um local
       estivesse em dois com saldo zero — e um dia ele deixa de ser zero. */
    const ids = [].concat(pb.galpoes.map((x) => x.id), pb.locais.map((x) => x.id),
                          pb.rotas.map((x) => x.id)).map(String);
    const repetidos = ids.filter((x, i) => ids.indexOf(x) !== i);
    ok(!repetidos.length,
      'e nenhum local aparece em dois baldes \u2014 com saldo zero a soma fecharia do mesmo ' +
      'jeito, e o defeito s\u00f3 apareceria no dia em que ele deixasse de ser zero',
      repetidos);

    /* A FILIAL E CASA, E O CLIENTE NAO. E' a linha que a conta toda depende, e ela sai do
       CADASTRO: um tipo novo de casa que nao entrasse aqui cairia entre os terceiros,
       e o sistema passaria a cobrar de uma casa propria. */
    ok(pb.galpoes.some((g) => String(g.id) === String(F)) &&
       pb.locais.some((l) => String(l.id) === String(C)),
      'a filial conta como casa e o cliente como terceiro \u2014 \u00e9 a linha de que a conta ' +
      'inteira depende, e cobrar a filial \u00e9 cobrar de casa',
      { casas: pb.galpoes.map((g) => g.nome), terceiros: pb.locais.map((l) => l.nome) });

    /* O AGING E AS VENCIDAS SAO DE COBRANCA, entao eles saem de `locais`. Com a filial
       dentro, o painel mandava cobrar a propria empresa. */
    ok(pb.kpis.emPoderTerceiros === comTerceiro,
      'e o KPI de caixas em poder de terceiros \u00e9 a soma desse balde, e n\u00e3o de outro \u2014 ' +
      'por outro caminho, o n\u00famero do topo e a tabela de baixo divergem',
      { kpi: pb.kpis.emPoderTerceiros, balde: comTerceiro });
  }

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

  /* ---------------------------------------------------------------------------
   * A LIXEIRA.
   *
   * Excluir apagava a linha. O que se testa aqui não é que o botão funciona — é que a
   * exclusão tira o lançamento das QUATRO vistas que somam, e não só da lista. Filtrado
   * só na lista, o lançamento sairia da tela e continuaria pesando no saldo do cliente,
   * e ninguém teria por onde descobrir de onde veio a diferença.
   *
   * A prova de que restaurar devolve tudo é uma FOTO das vistas antes e depois. Comparar
   * campo a campo deixaria de fora justamente o campo que alguém esquecesse de restaurar.
   * ------------------------------------------------------------------------- */
  console.log('\n== a lixeira: excluir tira de tudo, e restaurar devolve ==');
  {
    /* O histórico MUDA de propósito — ele grava quem excluiu e quem restaurou. Comparar
       as fotas com ele dentro acusaria diferença justamente onde a diferença é correta. */
    const semRastro = (l) => l.map((m) => {
      const c = Object.assign({}, m);
      delete c.alterado; delete c.historico;
      return c;
    });
    const foto = async () => JSON.stringify({
      painel: (await GET({ acao: 'painel' })).painel,
      extrato: await GET({ acao: 'extrato', local: C }),
      lista: semRastro((await GET({ acao: 'movimentos', limit: 200 })).movimentos)
    });

    const antes = await foto();
    const listaAntes = (await GET({ acao: 'movimentos', limit: 200 })).movimentos;
    const alvoLix = listaAntes.find((m) => m.tipo === 'SAIDA' && !m.teste);
    ok(!!alvoLix, 'há uma saída real para mandar à lixeira');

    ok((await GET({ acao: 'lixeira' })).movimentos.length === 0,
      'a lixeira começa vazia');

    const rEx = await POST({ acao: 'excluirMovimento', senha: '123456', id: alvoLix.id, usuarioId: 'U001' });
    ok(rEx.ok, 'o lançamento vai para a lixeira', rEx.erro);

    const depois = (await GET({ acao: 'movimentos', limit: 200 })).movimentos;
    ok(!depois.some((m) => m.id === alvoLix.id), 'ele some da lista');

    const pLix = (await GET({ acao: 'painel' })).painel;
    ok(JSON.stringify(pLix) !== JSON.stringify(JSON.parse(antes).painel),
      'e some do PAINEL — a peneira é uma só, e não um filtro escrito na lista');
    const exLix = await GET({ acao: 'extrato', local: C });
    ok(JSON.stringify(exLix) !== JSON.stringify(JSON.parse(antes).extrato),
      'e do EXTRATO, que é o documento que vai para o cliente');

    const lix = (await GET({ acao: 'lixeira' })).movimentos;
    ok(lix.length === 1 && lix[0].id === alvoLix.id, 'e aparece na lixeira', lix.length);
    ok(lix[0].excluidoPor === 'Administrador',
      'com o NOME de quem excluiu, e não o id', lix[0].excluidoPor);
    ok(!!lix[0].excluidoEm, 'e com a hora em que foi excluído', lix[0].excluidoEm);

    /* Na lixeira ele não se mexe. Corrigir um lançamento invisível mudaria um número que
       ninguém vê, e a correção sumiria junto com ele. */
    ok((await POST({ acao: 'excluirMovimento', senha: '123456', id: alvoLix.id, usuarioId: 'U001' })).ok === false,
      'excluir de novo é recusado — ele já está lá');
    /* COM A SENHA, de propósito. Sem ela a recusa viria do prazo de conserto livre —
       este lançamento é de outro dia —, e a afirmação passaria com a trava da lixeira
       arrancada. Com a senha, a ÚNICA coisa que pode recusar é estar na lixeira. */
    var rCorrLix = await POST({ acao: 'corrigir', id: alvoLix.id, motivo: 'x', Qtd: 7,
                                usuarioId: 'U001', senha: '123456' });
    ok(rCorrLix.ok === false && /lixeira/i.test(rCorrLix.erro || ''),
      'corrigir um lançamento da lixeira é recusado, e a recusa diz que é a lixeira',
      rCorrLix);
    var rCancLix = await POST({ acao: 'cancelar', id: alvoLix.id, motivo: 'x', usuarioId: 'U001' });
    ok(rCancLix.ok === false && /lixeira/i.test(rCancLix.erro || ''),
      'cancelar um lançamento da lixeira é recusado, e pelo motivo certo', rCancLix);

    const rVolta = await POST({ acao: 'restaurarMovimento', id: alvoLix.id, usuarioId: 'U001' });
    ok(rVolta.ok, 'restaurar traz de volta', rVolta.erro);
    ok((await GET({ acao: 'lixeira' })).movimentos.length === 0, 'e a lixeira esvazia');
    ok((await foto()) === antes,
      'e a lista, o painel e o extrato voltam EXATAMENTE ao que eram — nada se perdeu ' +
      'no caminho, porque nada tinha sido apagado');

    ok((await POST({ acao: 'restaurarMovimento', id: alvoLix.id, usuarioId: 'U001' })).ok === false,
      'restaurar o que não está na lixeira é recusado');

    /* QUEM MEXEU fica gravado — e é o que a coluna "Alterado por" mostra. */
    const volta = (await GET({ acao: 'movimentos', limit: 200 })).movimentos
      .find((m) => m.id === alvoLix.id);
    ok(volta.alterado && volta.alterado.por === 'Administrador',
      'o lançamento restaurado diz quem mexeu por último', volta.alterado);
    ok(volta.alterado.campo === 'Restauração',
      'e o que foi feito — exclusão e restauração escrevem no mesmo histórico da correção',
      volta.alterado.campo);
    ok(volta.alterado.vezes === 2,
      'com as duas passagens registradas, ida e volta', volta.alterado.vezes);

    /* O CARIMBO DE CRIAÇÃO, que a tabela passou a mostrar em duas colunas. */
    ok(!!volta.dataHora && !!volta.dataRef,
      'a lista entrega a data de referência E o carimbo de quando foi gravado',
      [volta.dataRef, volta.dataHora]);
  }

  console.log('\n== apagar o que está no filtro também vai para a lixeira ==');
  {
    /* Este é o botão que leva centenas de uma vez, e era o que menos podia ser
       definitivo: errar o filtro custava um dia inteiro de galpão. */
    const todos = (await GET({ acao: 'movimentos', limit: 100000, teste: 'todos' })).movimentos;
    const r = await POST({ acao: 'limparMovimentos', senha: '123456', esperado: todos.length,
                           teste: 'todos', usuarioId: 'U001' });
    ok(r.ok && r.apagados === todos.length, 'o filtro inteiro vai de uma vez', r);
    ok((await GET({ acao: 'movimentos', limit: 200, teste: 'todos' })).movimentos.length === 0,
      'a lista fica vazia');
    const naLixeira = (await GET({ acao: 'lixeira', limit: 1000 })).movimentos;
    ok(naLixeira.length === todos.length,
      'e TODOS eles estão na lixeira — nenhum foi apagado de verdade',
      [naLixeira.length, todos.length]);
    ok(naLixeira.every((m) => m.excluidoPor === 'Administrador'),
      'cada um sabe quem o mandou para lá');

    /* Um de volta, para provar que o caminho em bloco não quebrou o caminho de uma linha. */
    ok((await POST({ acao: 'restaurarMovimento', id: naLixeira[0].id, usuarioId: 'U001' })).ok,
      'e dá para trazer um de volta, um a um');
    ok((await GET({ acao: 'movimentos', limit: 200, teste: 'todos' })).movimentos.length === 1,
      'que volta a valer na lista');

    /* E TODOS de volta, porque o cenário continua depois daqui. Não é arrumação de
       teste: é a prova de que uma base zerada por engano se recompõe inteira, que é o
       caso para o qual a lixeira existe. */
    for (const m of naLixeira.slice(1)) {
      await POST({ acao: 'restaurarMovimento', id: m.id, usuarioId: 'U001' });
    }
    const refeita = (await GET({ acao: 'movimentos', limit: 1000, teste: 'todos' })).movimentos;
    ok(refeita.length === todos.length,
      'e a base inteira volta ao tamanho de antes do engano', [refeita.length, todos.length]);
    ok((await GET({ acao: 'lixeira', limit: 1000 })).movimentos.length === 0,
      'com a lixeira vazia no fim');
  }

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

  console.log('\n== a foto do proprio perfil ==');
  {
    /* UMA PORTA ESTREITA, e nao `salvarUsuario`: aquela aceita o cadastro inteiro, e
     * usa-la para isto ensinaria a tela a mandar perfil, abas e permissoes num pedido
     * que so' deveria trocar um retrato. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    ok(F.fotoDePerfil('data:image/png;base64,AAAA').ok === true, 'uma imagem passa');
    ok(F.fotoDePerfil('data:image/jpeg;base64,AAAA').ok === true, 'jpeg tambem');
    ok(F.fotoDePerfil('data:text/html;base64,AAAA').ok === false,
      'e um `data:` que NAO e imagem e recusado — sem conferir o tipo, um pedaco de ' +
      'html viraria foto, e quem manda para esta rota nao e so a nossa tela',
      F.fotoDePerfil('data:text/html;base64,AAAA').erro);
    ok(F.fotoDePerfil('http://algum.site/foto.png').ok === false,
      'e um endereco de fora tambem — a foto mora na linha do cadastro, e nao num ' +
      'servidor de terceiro que pode sair do ar ou trocar a imagem depois');
    ok(F.fotoDePerfil('data:image/png;base64,' + 'A'.repeat(400001)).ok === false,
      'e ha TETO: sem ele um arquivo de dez megabytes entraria na linha do cadastro e ' +
      'viajaria em toda leitura de equipe depois disso');
    const vazia = F.fotoDePerfil('');
    ok(vazia.ok === true && vazia.foto === '',
      'e vazio APAGA, de proposito: e como se tira a foto e se volta as iniciais');
    ok(F.fotoDePerfil(null).ok === true && F.fotoDePerfil(undefined).ok === true,
      'e ausente vale como vazio, em vez de estourar');

    /* E DE PONTA A PONTA, PELA ROTA. */
    const idF = (await GET({ acao: 'equipe' })).usuarios[0].ID;
    const r = await POST({ acao: 'minhaFoto', usuarioId: idF,
                           foto: 'data:image/png;base64,QUJD' });
    ok(r.ok === true, 'a rota grava a foto', r);
    const dep = (await GET({ acao: 'equipe' })).usuarios.filter((u) => u.ID === idF)[0];
    ok(String(dep.Foto).indexOf('data:image/png') === 0,
      'e ela volta no cadastro — sem isso a tela mostraria o retrato novo ate recarregar ' +
      'e voltaria as iniciais depois, como se nao tivesse salvo', String(dep.Foto).slice(0, 30));
    ok((await POST({ acao: 'minhaFoto', usuarioId: idF, foto: 'data:text/html;base64,QQ' })).ok === false,
      'e a rota recusa o que nao e imagem, e nao so a tela');
    ok((await POST({ acao: 'minhaFoto', usuarioId: 'NAO_EXISTE',
                     foto: 'data:image/png;base64,QUJD' })).ok === false,
      'e um id que nao existe nao grava nada');
  }

  console.log('\n== quem pode corrigir lancamento ==');
  {
    /* A TELA ESCONDER NAO BASTA, e nunca bastou: esconder botao e' conveniencia, e um
     * POST direto passa por cima dela. A rota pergunta de novo, e e' esta a resposta
     * que vale.
     *
     * AUSENTE E' SIM: a coluna nasceu `default true` porque, ate' hoje, qualquer pessoa
     * consertava o proprio engano de dedo dentro da janela livre. Nascer desligada
     * tiraria isso da operacao inteira no instante do deploy — uma permissao nova que
     * TIRA o que ja se fazia e' um apagao, nao um ajuste. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    ok(F.corrigeLancamento({ PodeCorrigir: true }) === true, 'marcado, corrige');
    ok(F.corrigeLancamento({ PodeCorrigir: false }) === false, 'desmarcado, nao corrige');
    ok(F.corrigeLancamento({}) === true,
      'e cadastro SEM a marca corrige — a coluna nasceu ligada, e linha lida antes da ' +
      'migracao chegar nao pode perder o que ja fazia');
    ok(F.corrigeLancamento(null) === false,
      'e sem cadastro nenhum nao corrige — um pedido sem autor nao prova nada');

    const D = (iso) => new Date(iso + 'T00:00:00');
    const mov = { ID: 'M1', Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'L2',
                  TipoCaixaID: 'P', Qtd: 100, Status: 'CONFIRMADO', UsuarioID: 'U1',
                  DataRef: D('2026-09-10'), DataHora: D('2026-09-10'), Historico: [] };
    const pedir = (quem) => F.montarCorrecao(mov,
      { Qtd: 250, motivo: 'x', usuarioId: 'U1' }, D('2026-09-11'), {},
      { senhaOk: true, quem: quem });

    ok(pedir({ ID: 'U1', PodeCorrigir: false }).ok === false,
      'a ROTA recusa quem nao tem a permissao, e nao so a tela esconde o botao — um ' +
      'POST direto passa por cima do que a tela esconde',
      pedir({ ID: 'U1', PodeCorrigir: false }).erro);
    ok(pedir({ ID: 'U1', PodeCorrigir: true }).ok === true,
      'e atende quem tem');
    ok(pedir(undefined).ok === true,
      'e sem cadastro em maos a guarda nao roda: este caminho e' + ' + ' + ' o do campo, que ' +
      'sempre pode consertar o proprio engano dentro da janela livre');

    /* DESFAZER E' CORRIGIR DE VOLTA, e passa pela mesma porta. */
    const comHist = JSON.parse(JSON.stringify(mov));
    comHist.DataRef = D('2026-09-10'); comHist.DataHora = D('2026-09-10');
    comHist.Historico = [{ em: '2026-09-11T00:00:00.000Z', por: 'U1', campo: 'quantidade',
                           motivo: 'y', de: '100', para: '250',
                           campoId: 'Qtd', deCru: 100, paraCru: 250 }];
    comHist.Qtd = 250;
    const desfazer = (quem) => F.montarRestauro(comHist,
      { motivo: 'z', usuarioId: 'U1' }, D('2026-09-12'), {},
      { senhaOk: true, quem: quem });
    ok(desfazer({ ID: 'U1', PodeCorrigir: false }).ok === false,
      'e desfazer tambem e' + ' + ' + ' recusado: desfazer uma correcao E' + ' + ' + ' corrigir de volta, e ' +
      'uma porta mais barata para o mesmo estrago seria a porta que se usa',
      desfazer({ ID: 'U1', PodeCorrigir: false }).erro);
    ok(desfazer({ ID: 'U1', PodeCorrigir: true }).ok === true,
      'e atendido para quem pode');
  }

  console.log('\n== senha resetada devolve o tutorial ==');
  {
    /* Quem tem a credencial redefinida por OUTRA pessoa quase nunca e' quem estava
     * usando o sistema ontem: e' gente nova, gente que voltou depois de um tempo, ou
     * alguem que perdeu o acesso e esta recomecando. Nos tres casos o caminho do
     * primeiro acesso e' o que faz falta — e ele ja existia, so' nao disparava, porque
     * a marca de "ja viu o tutorial" fica para sempre. */
    const nv = await POST({ acao: 'salvarUsuario', registro: {
      Nome: 'Volta ao Tutorial', Perfil: 'MOTORISTA', PIN: '445566' } });
    ok(nv.ok === true, 'cadastro de ensaio criado', nv);
    const idT = (await GET({ acao: 'equipe' })).usuarios
      .filter((u) => u.Nome === 'Volta ao Tutorial')[0].ID;
    const vendo = async () => (await GET({ acao: 'equipe' })).usuarios
      .filter((u) => u.ID === idT)[0];

    ok((await vendo()).ViuTutorial === false,
      'cadastro novo nasce sem ter visto o tutorial');
    await POST({ acao: 'viuTutorial', usuarioId: idT });
    ok((await vendo()).ViuTutorial === true,
      'e assistir marca — a marca fica, para nao repetir o tutorial todo dia');

    /* MEXER NO CADASTRO SEM TOCAR NA CREDENCIAL NAO DESFAZ A MARCA. */
    await POST({ acao: 'salvarUsuario', registro: { ID: idT, Telefone: '81999990000' } });
    ok((await vendo()).ViuTutorial === true,
      'trocar o telefone NAO devolve o tutorial — s\u00f3 o reset da credencial devolve, e ' +
      'qualquer grava\u00e7\u00e3o fazendo isso mandaria a pessoa ao tutorial a cada corre\u00e7\u00e3o de ' +
      'cadastro');

    /* O RESET DO PIN DEVOLVE. */
    await POST({ acao: 'salvarUsuario', registro: { ID: idT, PIN: '778899' } });
    const depoisPin = await vendo();
    ok(depoisPin.ViuTutorial === false,
      'resetar a senha do app de campo DEVOLVE o tutorial \u2014 quem recebe credencial de ' +
      'outra pessoa est\u00e1 recome\u00e7ando, e o caminho do primeiro acesso \u00e9 o que faz falta',
      depoisPin.ViuTutorial);
    ok(depoisPin.PinProvisorio === true,
      'e a marca de provis\u00f3ria \u00e9 o que diz que houve reset \u2014 \u00e9 ela que separa "algu\u00e9m ' +
      'definiu para mim" de "eu troquei a minha"', depoisPin.PinProvisorio);

    /* O RESET DA SENHA DO PAINEL TAMBEM. */
    await POST({ acao: 'viuTutorial', usuarioId: idT });
    ok((await vendo()).ViuTutorial === true, 'marca reposta para a segunda prova');
    await POST({ acao: 'salvarUsuario', registro: { ID: idT, Senha: 'outrasenha123' } });
    ok((await vendo()).ViuTutorial === false,
      'e resetar a senha do painel devolve igual \u2014 as duas s\u00e3o credencial, e quem ' +
      'recebe uma delas de outra pessoa est\u00e1 no mesmo caso');
  }

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
  ok((await POST({ acao: 'excluir', senha: '123456', aba: 'Locais', id: novo.id })).excluido === true, 'cliente sem movimento é excluído');
  const comMov = await POST({ acao: 'excluir', senha: '123456', aba: 'Locais', id: C });
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
  const corr = await POST({ acao: 'corrigir', id: alvoC.id, Qtd: 95, motivo: 'romaneio dizia 95', usuarioId: 'U001',
                                  senha: '123456' });
  ok(corr.ok && corr.alterou.length === 1, 'quantidade corrigida', corr);
  const movC = tabelas.movimentos.find((m) => m.id === alvoC.id);
  ok(Number(movC.qtd) === 95, 'valor novo gravado', movC.qtd);
  /* A ÚLTIMA entrada, e não a primeira. O histórico deixou de ser só das correções:
     excluir, restaurar e cancelar escrevem nele também, com a mesma forma — é isso que
     deixa a coluna "Alterado por" ser uma leitura só. Preso no índice zero, este teste
     passava a conferir o que aconteceu ANTES da correção que ele acabou de fazer. */
  const ultC = movC.historico[movC.historico.length - 1];
  ok(ultC.de === '100' && ultC.para === '95',
     'histórico guarda o valor antigo e o novo', movC.historico);
  ok(ultC.motivo === 'romaneio dizia 95' && ultC.por === 'U001',
     'histórico guarda motivo e autor', ultC);

  /* ---- A TROCA DE BASE PELA ROTA INTEIRA, e nao so pela regra ----
   *
   * UMA SABOTAGEM ESCAPOU AQUI. A prova lia o TEXTO da rota — "ela manda
   * `senhaConferida`?" — e o texto continuava la' depois de eu juntar as duas respostas
   * numa variavel so'. A rota passou a dizer que a senha foi digitada sempre que a
   * correcao podia passar, e trocar o livro de um lancamento RECEM-FEITO deixou de pedir
   * senha. Agora a prova CHAMA a rota: e' o efeito que importa, nao o endereco.
   *
   * O LANCAMENTO E' DE AGORA e do proprio autor — dentro dos dez minutos de conserto
   * livre, que e' justamente o caso em que a senha nao seria pedida. */
  const novoB = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C,
    itens: [{ tipoCaixaId: T, qtd: 12 }], dataRef: dia(0), usuarioId: 'U001',
    perfil: 'ADMIN' });
  ok(novoB.ok && novoB.criados && novoB.criados.length === 1,
    'a conferência lançou a linha que vai trocar de livro', novoB.criados);
  const idB = novoB.criados[0].id;

  const semSenhaB = await POST({ acao: 'corrigir', id: idB, usuarioId: 'U001',
    motivo: 'foi ensaio', base: 'teste' });
  ok(semSenhaB.ok === false && semSenhaB.precisaSenha === true,
    'mudar a base SEM a senha é recusado mesmo dentro dos dez minutos livres — e quem ' +
    'responde isso é a rota, com o banco na mão, e não a função sozinha',
    semSenhaB);
  ok(tabelas.movimentos.find((m) => m.id === idB).teste !== true,
    'e NADA foi gravado: a linha continua no livro em que estava — recusado depois de ' +
    'gravar seria o pior dos dois mundos');

  const comSenhaB = await POST({ acao: 'corrigir', id: idB, usuarioId: 'U001',
    motivo: 'foi ensaio', base: 'teste', senha: '123456' });
  ok(comSenhaB.ok === true && (comSenhaB.alterou || []).some((e) => e.campo === 'base'),
    'e com a senha ela passa, com a base entre os campos alterados', comSenhaB.alterou);
  const movB = tabelas.movimentos.find((m) => m.id === idB);
  ok(movB.teste === true && movB.declaracao === false,
    'o livro novo está GRAVADO nas duas colunas do par — metade do par deixaria a linha ' +
    'num estado que não é livro nenhum', { teste: movB.teste, declaracao: movB.declaracao });
  const histB = movB.historico[movB.historico.length - 1];
  ok(histB.campo === 'base' && histB.de === 'Base Produção' &&
     histB.para === 'Base Teste Produção' && histB.motivo === 'foi ensaio',
    'e o histórico diz de qual livro para qual, por extenso, com o motivo — era por SQL ' +
    'no banco que isto se fazia, e SQL não deixa autor nem porquê', histB);
  /* E A LINHA SOME DO LIVRO DE PRODUCAO, que e' o efeito que se foi buscar. */
  const soReais = (await GET({ acao: 'movimentos', limit: 400, teste: 'reais' })).movimentos;
  ok(!soReais.some((m) => m.id === idB),
    'e ela deixa de aparecer no recorte da Base Produção — é esse o efeito que se foi ' +
    'buscar, e o resto é contabilidade dele');
  /* A ROTA INTEIRA, e não só a regra: corrigir para o mesmo valor grava uma CONSULTA —
     e o `consulta: true` tem de chegar até aqui, senão a tela diz "Corrigido:" seguido
     de nada e põe a etiqueta amarela num lançamento intocado. */
  const vezesAntes = (await GET({ acao: 'movimentos', limit: 200 })).movimentos
    .filter((m) => m.id === alvoC.id)[0].alterado.vezes;
  const rIgual = await POST({ acao: 'corrigir', id: alvoC.id, Qtd: 95, motivo: 'de novo', senha: '123456' });
  ok(rIgual.ok === true && rIgual.consulta === true && (rIgual.alterou || []).length === 0,
     'corrigir para o mesmo valor vira consulta, e a rota diz isso', rIgual);
  const depoisDaConsulta = (await GET({ acao: 'movimentos', limit: 200 })).movimentos
    .filter((m) => m.id === alvoC.id)[0];
  ok(depoisDaConsulta.qtd === 95 && depoisDaConsulta.alterado.consulta.vezes === 1,
     'o número não se mexe, e a consulta fica contada à parte',
     { qtd: depoisDaConsulta.qtd, alterado: depoisDaConsulta.alterado });
  ok(depoisDaConsulta.alterado.vezes === vezesAntes && vezesAntes > 0,
     'e a conta de alterações fica EXATAMENTE onde estava — a consulta não soma a ela ' +
     'nem apaga o que já havia',
     { antes: vezesAntes, depois: depoisDaConsulta.alterado.vezes });

  console.log('\n== corrigir a CARGA inteira, pelo registro ==');
  {
    /* O lançamento nasce de uma vez: quatro tipos de caixa num toque em Enviar. A tela
       corrigia uma linha por vez, e corrigir a carga era abrir quatro formulários e
       digitar o mesmo motivo e a mesma senha quatro vezes — bastava desistir no terceiro
       para a carga ficar metade corrigida, sem nada dizendo que ficou. */
    const envio = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: R,
      /* DUAS LINHAS, e nao tres: o cadastro de mentira tem dois tipos de caixa e o
         mesmo tipo nao pode aparecer duas vezes no mesmo lote — regra que ja existe e
         que a primeira versao desta bancada esbarrou. Duas bastam: o que se prova e que
         cada linha fica com a SUA quantidade. */
      itens: [{ tipoCaixaId: T, qtd: 10 }, { tipoCaixaId: 'T002', qtd: 20 }],
      dataRef: dia(0), usuarioId: 'U001', perfil: 'ADMIN', motorista: 'Isaque',
      motoristaNome: 'Isaque Sobrenome' });
    ok(envio.ok, 'uma carga de três linhas foi lançada', envio.erro);
    const feitos = (envio.criados || []).map((c) => c.id);
    const daCarga = (await GET({ acao: 'movimentos', limit: 400 })).movimentos
      .filter((m) => feitos.indexOf(m.id) >= 0);
    const REG = daCarga[0].registro;
    ok(daCarga.length === 2 && REG && daCarga.every((m) => m.registro === REG),
      'as três linhas têm o MESMO registro — é ele que faz delas uma carga só',
      daCarga.map((m) => m.id + ':' + m.registro));

    /* ---- TUDO OU NADA ---- */
    const semMotivo = await POST({ acao: 'corrigirRegistro', registro: REG,
      usuarioId: 'U001', senha: '123456', itens: [{ id: daCarga[0].id, Qtd: 11 }] });
    ok(semMotivo.ok === false, 'a carga sem motivo é recusada, como a linha', semMotivo);
    ok(tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd === 10,
      'e NADA foi gravado — recusada no meio, a carga ficaria metade corrigida e só a ' +
      'conferência do mês encontraria',
      tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd);

    /* ---- UMA LINHA DE FORA DA CARGA ---- */
    const deFora = await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U001',
      senha: '123456', motivo: 'x', itens: [{ id: alvoC.id, Qtd: 1 }] });
    ok(deFora.ok === false && /não é deste registro/.test(deFora.erro || ''),
      'uma linha de OUTRA carga é recusada — senão ela entraria de carona nesta, com o ' +
      'motivo desta', deFora.erro);
    ok(Number(tabelas.movimentos.find((m) => m.id === alvoC.id).qtd) === 95,
      'e a linha de fora continua intocada', tabelas.movimentos.find((m) => m.id === alvoC.id).qtd);

    /* ---- A QUANTIDADE É DE CADA LINHA; O RESTO, DA CARGA ---- */
    const feito = await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U001',
      senha: '123456', motivo: 'romaneio de papel dizia outro total',
      itens: [{ id: daCarga[0].id, Qtd: 11 }, { id: daCarga[1].id, Qtd: 22 }],
      Motorista: 'Chico', MotoristaNome: 'Chico Sobrenome', Romaneio: 'RM-9' });
    ok(feito.ok && feito.linhas === 2, 'a carga inteira foi corrigida num pedido só', feito);
    const agoraA = daCarga.map((m) => tabelas.movimentos.find((x) => x.id === m.id));
    ok(agoraA.map((m) => Number(m.qtd)).join(',') === '11,22',
      'cada linha ficou com a SUA quantidade — um número só para todas seria justamente o ' +
      'erro que esta tela existe para evitar',
      agoraA.map((m) => m.qtd));
    ok(agoraA.every((m) => m.romaneio === 'RM-9'),
      'e o que é da carga valeu para as duas', agoraA.map((m) => m.romaneio));

    /* A PLACA, PONTA A PONTA E JÁ NORMALIZADA. Trocar de caminhão em cima da hora é o
       conserto mais comum que existe, e a placa não se corrigia em lugar nenhum — a
       única saída era cancelar o lançamento e refazê-lo. */
    const comPlaca = await POST({ acao: 'corrigirRegistro', registro: REG,
      usuarioId: 'U001', senha: '123456', motivo: 'trocou de caminhão',
      itens: [{ id: daCarga[0].id, Qtd: 11 }], Veiculo: ' son-1b00 ' });
    ok(comPlaca.ok, 'a carga aceita a placa nova', comPlaca.erro);
    const placas = daCarga.map((m) => tabelas.movimentos.find((x) => x.id === m.id).veiculo);
    ok(placas.every((v) => v === 'SON1B00'),
      'a placa da carga é corrigida nas duas linhas e entra JÁ NORMALIZADA — duas ' +
      'grafias do mesmo carro partem o relatório por veículo em dois, com metade do ' +
      'total em cada', placas);

    /* ---- O PAR DO MOTORISTA ANDA JUNTO ----
     * Trocar só o nome curto deixava a coluna Motorista dizendo o nome novo e a
     * Motorista (completo) dizendo o antigo: a mesma viagem com dois nomes, e o
     * relatório por motorista partindo a pessoa em duas. Aconteceu no R000036. */
    ok(agoraA.every((m) => m.motorista === 'Chico' && m.motorista_nome === 'Chico Sobrenome'),
      'e os DOIS nomes do motorista andaram juntos — só um deles reescrito, a mesma ' +
      'viagem passa a ter dois nomes e o relatório parte a pessoa em duas',
      agoraA.map((m) => [m.motorista, m.motorista_nome]));

    /* ---- O HISTÓRICO FICA EM CADA LINHA ---- */
    ok(agoraA.every((m) => (m.historico || []).some((h) =>
        h.motivo === 'romaneio de papel dizia outro total' && h.por === 'U001')),
      'e o motivo e o autor ficam no histórico de CADA linha — guardado só numa, as ' +
      'outras mudariam sozinhas aos olhos de quem confere',
      agoraA.map((m) => (m.historico || []).length));

    /* ---- GRAVAR SEM MUDAR NADA É CONSULTA, também na carga ---- */
    const denovo = await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U001',
      senha: '123456', motivo: 'conferindo',
      itens: [{ id: daCarga[0].id, Qtd: 11 }, { id: daCarga[1].id, Qtd: 22 }] });
    ok(denovo.ok && denovo.consulta === true,
      'e gravar a carga sem mudar nada é CONSULTA — "Corrigido:" seguido de nada é a ' +
      'mesma mentira da etiqueta, dita em outro lugar', denovo);

    /* ---- SENHA ERRADA NÃO GRAVA NADA ---- */
    const errada = await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U003',
      senha: 'xxxxxx', motivo: 'tentando', itens: [{ id: daCarga[0].id, Qtd: 99 }] });
    ok(errada.ok === false,
      'senha errada recusa a carga', errada.erro);
    ok(Number(tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd) === 11,
      'e nenhuma linha se mexeu', tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd);

    /* ---- REGISTRO VAZIO NÃO CASA COM NADA ----
     * As linhas gravadas antes de a coluna existir têm o registro em branco. Sem esta
     * recusa, um pedido sem registro juntaria TODAS elas numa carga só, e uma correção
     * de quantidade cairia sobre dezenas de lançamentos alheios. */
    /* ---- A DECLARAÇÃO DENTRO DA CARGA ----
     * A declaração do motorista só Admin, Gestor ou Gerente altera. A carga passa por
     * várias linhas de uma vez, e a tranca vale para CADA uma: conferida só na primeira,
     * uma declaração no meio da carga seria alterada por quem não pode, de carona nas
     * linhas comuns. */
    tabelas.movimentos.find((m) => m.id === daCarga[1].id).declaracao = true;
    const decl = await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U003',
      senha: '123456', motivo: 'tentando',
      itens: [{ id: daCarga[0].id, Qtd: 77 }, { id: daCarga[1].id, Qtd: 88 }] });
    ok(decl.ok === false && /declaração/.test(decl.erro || ''),
      'uma declaração no meio da carga tranca a carga inteira para quem não pode ' +
      'alterá-la — conferida só na primeira linha, ela seria alterada de carona nas ' +
      'linhas comuns', decl.erro);
    ok(Number(tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd) === 11,
      'e a linha comum ao lado dela também não se mexeu',
      tabelas.movimentos.find((m) => m.id === daCarga[0].id).qtd);
    ok((await POST({ acao: 'corrigirRegistro', registro: REG, usuarioId: 'U001',
        senha: '123456', motivo: 'quem pode, pode',
        itens: [{ id: daCarga[0].id, Qtd: 12 }] })).ok === true,
      'e quem PODE alterar declaração segue corrigindo a carga — a tranca é de perfil, ' +
      'e não um muro para todo mundo');
    tabelas.movimentos.find((m) => m.id === daCarga[1].id).declaracao = false;

    const vazio = await POST({ acao: 'corrigirRegistro', registro: '', usuarioId: 'U001',
      senha: '123456', motivo: 'x', itens: [] });
    ok(vazio.ok === false,
      'registro vazio não casa com nada — casando, ele juntaria todas as linhas antigas ' +
      'numa carga só e a correção cairia sobre lançamentos alheios', vazio.erro);
  }

  /* ---------------------------------------------------------------------------
   * A CORREÇÃO FEITA NO GALPÃO APARECE NO PAINEL.
   *
   * O app de campo ganhou o botão de corrigir na lista de Lançamentos. Ele grava pela
   * MESMA rota do painel — e é isso que se confere aqui: quem corrigiu, o que mudou e
   * por quê chegam à lista de Movimentos sem nenhum caminho paralelo.
   * ------------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------------
   * O LOTE: de qual REMESSA cada linha é.
   *
   * Um toque em Enviar com cinco tipos de caixa grava cinco linhas. A tela de celular
   * junta as cinco num cartão só — e a chave que permite isso tem de ser EXATA. Errada
   * para mais, ela soma cargas diferentes num cartão; errada para menos, o cartão volta
   * a ser cinco.
   * ------------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------------
   * OS DEZ MINUTOS DE CONSERTO LIVRE.
   *
   * Corrigir sem pedir nada vale por dez minutos, para o próprio autor, no mesmo dia.
   * Fora disso, senha. O que se mede aqui é o SERVIDOR — a tela esconde o campo, mas é
   * esta rota que recusa, e ela aceita pedido de qualquer lugar.
   * ------------------------------------------------------------------------- */
  console.log('\n== os dez minutos de conserto livre, e a senha depois deles ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));

    /* Um lançamento ACABADO DE FAZER, por U002. */
    const rNovo = await POST({ acao: 'movimento', tipo: 'SAIDA', usuarioId: 'U002',
      origemId: G, destinoId: C, motorista: 'Motorista Exemplo',
      itens: [{ tipoCaixaId: 'T001', qtd: 3 }] });
    ok(rNovo.ok, 'um lançamento novo, de agora', rNovo.erro);
    const novo = (await GET({ acao: 'movimentos', limit: 400 })).movimentos
      .find((m) => Number(m.qtd) === 3 && m.usuarioId === 'U002');
    ok(!!novo && !!novo.livreAte,
      'a lista diz até quando ele se conserta de graça', novo && novo.livreAte);

    /* O AUTOR, AGORA: passa sem senha. */
    ok((await POST({ acao: 'corrigir', id: novo.id, usuarioId: 'U002',
                     motivo: 'contei de novo', Qtd: 4 })).ok,
      'o próprio autor conserta na hora, sem senha nenhuma');

    /* OUTRA PESSOA, no mesmo instante: recusado, e o erro DIZ que é senha que falta. */
    const rOutro = await POST({ acao: 'corrigir', id: novo.id, usuarioId: 'U003',
                                motivo: 'mexendo no alheio', Qtd: 5 });
    ok(rOutro.ok === false && rOutro.precisaSenha === true,
      'outra pessoa é recusada, e a resposta diz que o que falta é a SENHA — "recusado" ' +
      'sozinho faria tentar de novo achando que errou de botão', rOutro);

    /* A SENHA ERRADA não passa, e a certa passa. */
    ok((await POST({ acao: 'corrigir', id: novo.id, usuarioId: 'U003',
                     motivo: 'x', Qtd: 5, senha: '000000' })).ok === false,
      'senha errada não passa');
    ok((await POST({ acao: 'corrigir', id: novo.id, usuarioId: 'U003',
                     motivo: 'conferi no romaneio', Qtd: 5, senha: '123456' })).ok,
      'e a senha do escritório destranca o conserto de qualquer um');

    /* O LANÇAMENTO DE OUTRO DIA. Repare que "outro dia" é o dia em que foi GRAVADO, e
       não a data da carga: uma remessa datada da semana passada, digitada há dois
       minutos, ainda está no prazo — a pessoa acabou de digitar e pode ter errado. Por
       isso o cenário não serve como está: tudo nele foi gravado agora. A linha vai ao
       banco falso com o carimbo de ontem. */
    const ontem = new Date(Date.now() - 36 * 3600 * 1000);
    tabelas.movimentos.push({
      id: 'M-ONTEM', client_key: 'K-ONTEM-0', data_hora: ontem.toISOString(),
      data_ref: ontem.toISOString().slice(0, 10), tipo: 'SAIDA', origem_id: G,
      destino_id: C, tipo_caixa_id: 'T001', qtd: 30, qtd_conferida: 30,
      status: 'CONFIRMADO', romaneio: '', usuario_id: 'U002', perfil: 'GALPAO',
      obs: '', motorista: null, rota: null, cancelado: false, historico: []
    });
    const velho = (await GET({ acao: 'movimentos', limit: 400 })).movimentos
      .find((m) => m.id === 'M-ONTEM');
    ok(!!velho, 'há um lançamento gravado ontem');
    ok(velho.livreAte === '',
      'e o prazo dele vem vazio — passado o dia, não há conserto livre', velho.livreAte);
    const rVelho = await POST({ acao: 'corrigir', id: velho.id, usuarioId: velho.usuarioId,
                                motivo: 'tarde demais', Qtd: Number(velho.qtd) + 1 });
    ok(rVelho.ok === false && rVelho.precisaSenha === true,
      'nem o próprio autor conserta de graça um lançamento de ontem', rVelho);

    /* A REGRA CRUA, com o relógio na mão. */
    const base = new Date('2026-09-17T14:00:00Z');
    const mov = { UsuarioID: 'U1', DataHora: new Date('2026-09-17T13:55:00Z') };
    ok(F.correcaoLivre(mov, 'U1', base) === true, 'cinco minutos depois ainda é livre');
    ok(F.correcaoLivre(mov, 'U1', new Date('2026-09-17T14:06:00Z')) === false,
      'onze minutos depois, não');
    ok(F.correcaoLivre(mov, 'U9', base) === false, 'e nunca para outra pessoa');
    /* O CASO QUE A GUARDA `!quem` COBRE: pedido sem `usuarioId` contra uma linha antiga
       sem dono. Sem ela, `'' === ''` dá certo, e o prazo de todo lançamento órfão abre
       para quem nem se identificou. */
    ok(F.correcaoLivre({ UsuarioID: null, DataHora: new Date(base.getTime() - 60000) },
                       '', base) === false,
      'e pedido sem autor não casa com lançamento sem dono — os dois vazios abririam a ' +
      'porta um para o outro');

    /* O DIA É O DO GALPÃO. A Vercel roda em UTC, e às 21h de Brasília lá já é amanhã:
       sem o deslocamento, todo lançamento do fim da tarde nasceria "de outro dia". */
    const noite = { UsuarioID: 'U1', DataHora: new Date('2026-09-18T01:30:00Z') };
    ok(F.correcaoLivre(noite, 'U1', new Date('2026-09-18T01:33:00Z')) === true,
      'lançamento das 22h30 do galpão, corrigido às 22h33, ainda é do mesmo dia — em ' +
      'UTC os dois já são 18/09, e a conta pelo fuso do servidor o trancaria sem motivo');
    ok(F.diaDaOperacao(new Date('2026-09-18T01:30:00Z')) === '2026-09-17',
      'porque o dia da operação conta no fuso do Nordeste, e não no do servidor',
      F.diaDaOperacao(new Date('2026-09-18T01:30:00Z')));

    /* A MENSAGEM, E NAO SO O `ok === false`. `senha.gerar` ja ESTOURA com menos de seis
       caracteres, entao a recusa acontece com ou sem a guarda da rota — e esta prova
       passava pelos dois caminhos. O que a guarda acrescenta e' a FRASE: sem ela, quem
       troca a senha recebe um erro de sistema no lugar de "precisa de pelo menos 6
       caracteres", e nao tem como saber o que fazer.
       Medido: tirei a guarda e esta prova continuou verde. */
    const curta = await POST({ acao: 'salvarConfig', chave: 'senhaCorrecao',
                               valor: 'curta' });
    ok(curta.ok === false && /pelo menos 6/.test(curta.erro || ''),
      'senha curta é recusada COM a frase que diz o que fazer — `senha.gerar` já ' +
      'estoura sozinha, e sem a guarda da rota quem troca recebe um erro de sistema no ' +
      'lugar da instrução', curta.erro);
    ok((await POST({ acao: 'salvarConfig', chave: 'senhaCorrecao', valor: 'trocada9' })).ok,
      'e a senha do conserto se troca pela configuração');

    /* ---- E A PORTA DO DOCUMENTO, RODADA ----
     *
     * E' aqui que a senha serve para alguma coisa. O canhoto e a foto moram num balde
     * PUBLICO: quem tem o endereco abre o arquivo, sem senha, para sempre. Esta rota nao
     * tranca o arquivo — tranca a ENTREGA do endereco, que e' o que estava impresso na
     * tabela do Extrato.
     *
     * ESCAPOU UMA SABOTAGEM AQUI: tirei a conferência da senha da rota e NENHUMA prova
     * reclamou — as que havia liam o texto do arquivo, e o texto continuava plausivel.
     * Esta chama a rota de verdade, com a senha certa, com a errada e sem nenhuma. */
    (function () {
      var alvo = tabelas.movimentos[0];
      if (!alvo) return;
      alvo.assinatura_url = 'https://balde/canhotos/canhoto-zz.jpg';
      alvo.foto_url = 'https://balde/canhotos/foto-zz.jpg';
    })();
    var idDoc = tabelas.movimentos[0] && tabelas.movimentos[0].id;
    /* QUEM PERGUNTA E OBRIGATORIO, e e' o recorte que o exige: sem `quem`,
       `idsVisiveis` devolve NINGUEM e a rota nao acha o lancamento. E' falha FECHADA, e
       esta linha existe para a prova nao passar por esse caminho achando que mediu a
       senha. */
    var quemDoc = (tabelas.usuarios[0] || {}).id;

    var semQuem = await POST({ acao: 'documento', id: idDoc, qual: 'foto',
                               senha: 'trocada9' });
    ok(semQuem.ok === false,
      'sem dizer QUEM pergunta, a rota não entrega — o recorte devolve NINGUÉM, e é a ' +
      'direção certa do erro: um pedido anônimo com a senha certa não vale mais que um ' +
      'pedido anônimo', semQuem.erro);

    var semSenha = await POST({ acao: 'documento', id: idDoc, qual: 'foto', quem: quemDoc });
    ok(semSenha.ok === false && /[Ss]enha/.test(semSenha.erro || ''),
      'sem senha, a rota do documento N\u00c3O entrega o endere\u00e7o \u2014 \u00e9 a \u00fanica coisa que ' +
      'esta porta protege, e sem ela o endere\u00e7o volta a andar solto', semSenha.erro);

    var senhaErrada = await POST({ acao: 'documento', id: idDoc, qual: 'foto',
                                   senha: 'outra123', quem: quemDoc });
    ok(senhaErrada.ok === false,
      'e com a senha errada tamb\u00e9m n\u00e3o \u2014 sem este controle, a prova acima passaria com ' +
      'uma rota que recusa tudo', senhaErrada.erro);

    var comSenha = await POST({ acao: 'documento', id: idDoc, qual: 'foto',
                               senha: 'trocada9', quem: quemDoc });
    ok(comSenha.ok === true && comSenha.url === 'https://balde/canhotos/foto-zz.jpg',
      'e com a senha certa ela entrega o endere\u00e7o \u2014 sem este controle, as duas provas ' +
      'acima passariam com uma rota que nunca entrega nada', comSenha.url);

    var canhoto = await POST({ acao: 'documento', id: idDoc, qual: 'assinatura',
                               senha: 'trocada9', quem: quemDoc });
    ok(canhoto.ok === true && canhoto.url.indexOf('canhoto-zz') > 0,
      'e o canhoto \u00e9 outro arquivo que a foto \u2014 lendo sempre o mesmo campo, pedir o ' +
      'canhoto traria a foto e ningu\u00e9m notaria at\u00e9 precisar da assinatura', canhoto.url);

    /* O `qual` E UMA LISTA FECHADA, e nao o nome de uma coluna. Lido direto do pedido,
       `qual=SenhaHash` leria qualquer campo da linha e devolveria o que achasse —
       inclusive o que nenhuma tela mostra. */
    var inventado = await POST({ acao: 'documento', id: idDoc, qual: 'Registro',
                                 senha: 'trocada9', quem: quemDoc });
    ok(inventado.ok === false || inventado.url === 'https://balde/canhotos/foto-zz.jpg',
      'e um `qual` inventado n\u00e3o vira nome de coluna \u2014 lido direto do pedido, ele leria ' +
      'qualquer campo da linha e devolveria o que achasse', inventado.url || inventado.erro);

    var semTal = await POST({ acao: 'documento', id: 'M-nao-existe', qual: 'foto',
                              senha: 'trocada9', quem: quemDoc });
    ok(semTal.ok === false,
      'e um id que n\u00e3o existe \u00e9 recusado depois da senha, e n\u00e3o antes \u2014 recusar antes ' +
      'diria a quem adivinha ids quais existem', semTal.erro);

    /* A SENHA NÃO SAI NA ROTA PÚBLICA. `dados` não tem autorização nenhuma, e é ela que
       a tela de login chama antes de qualquer pessoa entrar.

       A conferência vem DEPOIS de cadastrar a senha, de propósito: antes disso não havia
       chave nenhuma com esse nome no `config`, e a afirmação passava sem medir nada. */
    const dd = await GET({ acao: 'dados' });
    /* E O SINAL CHEGA NA TELA. A peça existia e nada chegava nela: uma sabotagem que
       tirou o campo da resposta passou batida, e o efeito seria o aviso de "a senha
       ainda é a de fábrica" mudo para sempre — justamente o aviso que existe para
       dizer que a senha atual é pública.
       MEDIDO DEPOIS DE TROCAR, que é quando ele tem de dizer `true`: antes disso um
       campo ausente e um `false` dão a mesma resposta, e a prova não separaria as
       duas. */
    ok(dd.senhaOperacoesTrocada === true,
      'e a resposta pública diz SE a senha já foi trocada — sem esse sinal, o aviso de ' +
      'que a senha ainda é a de fábrica fica mudo para sempre, e ele é o único lugar ' +
      'que conta que a senha atual é pública', dd.senhaOperacoesTrocada);
    ok(JSON.stringify(dd).indexOf('s1$') < 0,
      'e o HASH dela não vai junto — a rota `dados` é pública e sem autorização ' +
      'nenhuma, e mandar o hash seria entregar a fechadura a quem perguntasse as horas');
    ok(tabelas.config.some((r) => r.chave === 'senhaCorrecao'),
      'a senha está mesmo guardada — senão a conferência abaixo não mede nada');
    ok(JSON.stringify(dd.config || {}).toLowerCase().indexOf('senha') < 0,
      'e mesmo assim a rota pública `dados` não devolve nada com cara de segredo', dd.config);
    const guardada = tabelas.config.find((r) => r.chave === 'senhaCorrecao');
    ok(guardada && /^s1\$/.test(String(guardada.valor)),
      'que vai ao banco em HASH — em texto, quem abre a tabela lê a senha que destranca ' +
      'a correção de qualquer lançamento', guardada && guardada.valor.slice(0, 12));
    ok((await POST({ acao: 'corrigir', id: velho.id, usuarioId: velho.usuarioId,
                     motivo: 'com a nova', Qtd: Number(velho.qtd) + 1, senha: 'trocada9' })).ok,
      'e é a cadastrada que passa a valer');
    ok((await POST({ acao: 'corrigir', id: velho.id, usuarioId: velho.usuarioId,
                     motivo: 'com a de fábrica', Qtd: Number(velho.qtd) + 2,
                     senha: '123456' })).ok === false,
      'a de fábrica para de valer assim que existe uma cadastrada');

    /* ---- E AGORA UMA SENHA SO' PARA UMA OPERACAO ----
     *
     * E' o pedido do escritorio, e a afirmacao inteira esta' em duas palavras: SO'
     * AQUELA. Quem corrige um numero errado no lancamento de ontem nao e'
     * necessariamente quem apaga o cadastro de uma pessoa, e com uma senha so' conceder
     * a primeira era conceder as duas.
     *
     * AS DUAS METADES SAO MEDIDAS JUNTAS, e tem de ser: a especifica passa a valer NA
     * SUA operacao, e as OUTRAS continuam na geral. Medida so' a primeira, uma
     * implementacao que trocasse a senha de todas passaria verde — e o escritorio
     * descobriria no dia em que a senha de "excluir cadastro" tambem corrigisse
     * lancamento, que e' exatamente o que ele pediu para acabar. */
    ok((await POST({ acao: 'salvarConfig', chave: 'senhaCorrigir',
                     valor: 'soCorrige9' })).ok,
      'a senha de UMA opera\u00e7\u00e3o \u00e9 gravada \u2014 sem isto n\u00e3o h\u00e1 o que separar');
    const chCorrigir = tabelas.config.find((r) => r.chave === 'senhaCorrigir');
    ok(chCorrigir && /^s1\$/.test(String(chCorrigir.valor)),
      'e ela tamb\u00e9m vai ao banco em HASH \u2014 em texto, quem abre a tabela l\u00ea a senha de ' +
      'cada porta separada, que \u00e9 pior do que uma s\u00f3 vazada',
      chCorrigir && String(chCorrigir.valor).slice(0, 12));

    ok((await POST({ acao: 'corrigir', id: velho.id, usuarioId: velho.usuarioId,
                     motivo: 'com a da opera\u00e7\u00e3o', Qtd: Number(velho.qtd) + 3,
                     senha: 'soCorrige9' })).ok,
      'corrigir passa a aceitar a senha DELA');
    ok((await POST({ acao: 'corrigir', id: velho.id, usuarioId: velho.usuarioId,
                     motivo: 'com a geral', Qtd: Number(velho.qtd) + 4,
                     senha: 'trocada9' })).ok === false,
      'e deixa de aceitar a GERAL \u2014 continuando a aceit\u00e1-la, a senha espec\u00edfica seria ' +
      'enfeite: quem tem a geral faria tudo do mesmo jeito');

    /* A OUTRA METADE, E AS DUAS NA ORDEM QUE DEIXA O CENARIO DE PE: a senha de corrigir
       NAO abre o excluir, a geral abre, e o restaurar — que tambem nao tem senha propria
       — desfaz a exclusao com a geral. A ultima e' prova e limpeza ao mesmo tempo: sem
       ela o lancamento fica na lixeira e tudo o que vem depois neste arquivo bate em
       "este lancamento esta' na lixeira". */
    ok((await POST({ acao: 'excluirMovimento', id: velho.id, usuarioId: velho.usuarioId,
                     senha: 'soCorrige9' })).erro === 'Senha incorreta.',
      'a senha de CORRIGIR n\u00e3o abre o excluir \u2014 \u00e9 a separa\u00e7\u00e3o inteira: sem isto as ' +
      'sete senhas seriam sete nomes para a mesma chave');
    const exGeral = await POST({ acao: 'excluirMovimento', id: velho.id,
                                 usuarioId: velho.usuarioId, senha: 'trocada9' });
    ok(exGeral.ok === true,
      'e quem N\u00c3O ganhou senha pr\u00f3pria continua na GERAL \u2014 sem o degrau, o dia desta ' +
      'mudan\u00e7a trancaria as sete portas de uma vez, porque nenhuma espec\u00edfica existe ' +
      'ainda, e o escrit\u00f3rio descobriria tentando corrigir um lan\u00e7amento', exGeral.erro);
    /* E O CAMINHO DE VOLTA FICA ABERTO, de proposito — com a senha ERRADA, para a
       bancada medir isso e nao uma coincidencia. Escrita com a senha certa, ela passaria
       verde tanto com a porta aberta quanto trancada, e nao diria nada.
       TRANCAR A VOLTA e' o erro que esta prova existe para impedir: quem percebe que uma
       linha sumiu por engano raramente e' quem a mandou sumir, e seria justamente essa
       pessoa a ficar sem a senha. O rotulo da senha de restaurar foi corrigido para nao
       prometer que fecha esta porta. */
    const voltaLixo = await POST({ acao: 'restaurarMovimento', id: velho.id,
                                   usuarioId: velho.usuarioId, senha: 'senha-errada-9' });
    ok(voltaLixo.ok === true,
      'e tirar da LIXEIRA continua sem senha, mesmo com uma errada na m\u00e3o \u2014 \u00e9 o ' +
      'caminho de volta do excluir, e quem percebe o engano raramente \u00e9 quem o cometeu: ' +
      'trancado, seria justamente essa pessoa a ficar sem a chave', voltaLixo.erro);

    /* ---- E DA' PARA VOLTAR ATRAS ----
     * Sem esta porta, uma senha especifica cadastrada errada so' poderia ser TROCADA
     * por outra, nunca desfeita — e quem administra ficaria com uma operacao presa a uma
     * senha que talvez ninguem lembre. */
    const limpou = await POST({ acao: 'salvarConfig', chave: 'senhaCorrigir', valor: '' });
    ok(limpou.ok === true,
      'a senha de uma opera\u00e7\u00e3o pode ser TIRADA \u2014 recusado o vazio, uma senha cadastrada ' +
      'com um erro de digita\u00e7\u00e3o trancaria aquela porta para sempre', limpou.erro);
    const voltou = await POST({ acao: 'corrigir', id: velho.id,
                     usuarioId: velho.usuarioId,
                     motivo: 'de volta \u00e0 geral', Qtd: Number(velho.qtd) + 5,
                     senha: 'trocada9' });
    ok(voltou.ok,
      'e a opera\u00e7\u00e3o volta mesmo a pedir a GERAL \u2014 gravado o vazio sem efeito, a tela ' +
      'diria "voltou \u00e0 geral" com a senha antiga ainda valendo, que \u00e9 a mentira mais ' +
      'cara que esta tela poderia contar', voltou.erro);
    ok((await POST({ acao: 'salvarConfig', chave: 'senhaCorrecao', valor: '' })).ok === false,
      'mas a GERAL n\u00e3o pode ser esvaziada \u2014 limpar a geral n\u00e3o volta para outra senha, ' +
      'volta para a DE F\u00c1BRICA, que est\u00e1 escrita no c\u00f3digo em texto');

    /* ---- E A TELA SABE EM QUE PE CADA UMA ESTA, SEM O SEGREDO ---- */
    await POST({ acao: 'salvarConfig', chave: 'senhaExcluirCadastro', valor: 'soApaga9' });
    const dOps = await GET({ acao: 'dados' });
    const lista = dOps.operacoesComSenha || [];
    ok(lista.length === 7,
      'a rota manda as SETE opera\u00e7\u00f5es \u2014 escrita na tela, a lista divergiria no dia em ' +
      'que uma operacao nova entrasse s\u00f3 no servidor', lista.length);
    const umCad = lista.find((o) => o.id === 'excluirCadastro');
    const umCor = lista.find((o) => o.id === 'corrigir');
    ok(umCad && umCad.propria === true && umCor && umCor.propria === false,
      'e diz QUAIS j\u00e1 t\u00eam senha pr\u00f3pria e quais ainda usam a geral \u2014 \u00e9 a pergunta que ' +
      'quem administra vem fazer, j\u00e1 que a senha em si ningu\u00e9m consegue ler de volta',
      [umCad && umCad.propria, umCor && umCor.propria]);
    ok(umCad && umCad.nome && umCad.diz,
      'e manda o nome e o que a opera\u00e7\u00e3o destranca \u2014 sete senhas sem dizer o que cada ' +
      'uma abre s\u00e3o sete decis\u00f5es no escuro', umCad);
    ok(JSON.stringify(lista).indexOf('s1$') < 0 &&
       JSON.stringify(lista).indexOf('senhaExcluirCadastro') < 0,
      'e nem o hash nem o nome da coluna v\u00e3o junto \u2014 `dados` \u00e9 p\u00fablica e sem ' +
      'autoriza\u00e7\u00e3o nenhuma, e ela \u00e9 chamada antes de qualquer pessoa entrar',
      JSON.stringify(lista).slice(0, 140));

    /* De volta \u00e0 de f\u00e1brica, porque o cen\u00e1rio continua depois daqui. */
    tabelas.config = tabelas.config.filter((r) => !/^senha/.test(String(r.chave)));
  }

  console.log('\n== o lote: as linhas de um envio só se reconhecem ==');
  {
    /* Uma remessa com DOIS tipos de caixa, que é o caso que o cartão existe para juntar.
       O cenário até aqui só tinha envios de um item, e a afirmação sobre juntar linhas
       passava por vacuidade — não havia o que juntar. */
    const rMulti = await POST({ acao: 'movimento', tipo: 'SAIDA', usuarioId: 'U001',
      origemId: G, destinoId: C, motorista: 'Motorista Exemplo', dataRef: '2026-09-18',
      itens: [{ tipoCaixaId: 'T001', qtd: 7 }, { tipoCaixaId: 'T002', qtd: 9 }] });
    ok(rMulti.ok, 'uma remessa com dois tipos de caixa é lançada', rMulti.erro);

    const lista = (await GET({ acao: 'movimentos', limit: 200 })).movimentos;
    ok(lista.every((m) => !!m.lote), 'toda linha da lista diz de que remessa é');

    /* O envio com VÁRIOS itens do cenário: o mesmo lote nas linhas dele. */
    const porLote = {};
    lista.forEach((m) => { (porLote[m.lote] = porLote[m.lote] || []).push(m); });
    const juntos = Object.keys(porLote).filter((k) => porLote[k].length > 1);
    ok(juntos.length > 0, 'e há remessa com mais de uma linha para juntar',
      Object.keys(porLote).length);

    /* Dentro de um lote, as linhas são do MESMO envio: mesma viagem, mesmo carimbo. */
    const falhas = juntos.filter((k) => {
      const g = porLote[k];
      return g.some((m) => m.dataHora !== g[0].dataHora || m.tipo !== g[0].tipo ||
                           m.origem !== g[0].origem || m.destino !== g[0].destino);
    });
    ok(falhas.length === 0,
      'e as linhas de um lote são mesmo do mesmo envio — mesma viagem e mesmo carimbo',
      falhas);

    /* E o tipo de caixa não se repete dentro do lote: repetido, não era um envio só. */
    const repetidos = juntos.filter((k) => {
      const vistos = {};
      return porLote[k].some((m) => {
        if (vistos[m.tipoCaixa]) return true;
        vistos[m.tipoCaixa] = 1;
        return false;
      });
    });
    ok(repetidos.length === 0,
      'e nenhum tipo de caixa aparece duas vezes no mesmo lote', repetidos);

    /* A REGRA CRUA, sem depender do cenário. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = new Date('2026-09-17T11:42:00Z');
    const mv = (ck, cx) => ({ ClientKey: ck, DataHora: D, Tipo: 'SAIDA', OrigemID: 'L1',
                              DestinoID: 'L2', UsuarioID: 'U1', Motorista: 'Isaque',
                              TipoCaixaID: cx });
    ok(F.loteDo(mv('K900-M1-0', 'T1')) === F.loteDo(mv('K900-M1-4', 'T2')),
      'dois itens do mesmo envio têm o mesmo lote — o índice do item sai da conta');
    ok(F.loteDo(mv('K900-M1-0', 'T1')) !== F.loteDo(mv('K901-M9-0', 'T1')),
      'e dois envios diferentes, não');
    /* Linha sem chave é a que veio do Apps Script, antes de a fila offline existir. */
    const sem1 = mv('', 'T1'), sem2 = mv('', 'T2');
    ok(F.loteDo(sem1) === F.loteDo(sem2),
      'linha sem chave cai no carimbo mais a viagem — que é igual para o envio todo');
    const outra = mv('', 'T1'); outra.DestinoID = 'L9';
    ok(F.loteDo(sem1) !== F.loteDo(outra),
      'e uma viagem diferente, no mesmo instante, continua sendo outro lote');
  }

  console.log('\n== a correção feita no campo aparece no painel de Movimentos ==');
  {
    const antesL = (await GET({ acao: 'movimentos', limit: 200 })).movimentos;
    ok(antesL.every((m) => 'usuarioId' in m),
      'a lista manda o ID de quem lançou, e não só o nome — é por ele que a tela ' +
      'decide quem pode corrigir, e dois homônimos por nome trocariam de lançamento');

    const alvoF = antesL.find((m) => m.tipo === 'DEVOLUCAO' && Number(m.qtd) > 1);
    ok(!!alvoF, 'há um retorno para o campo corrigir');

    /* `usuarioId` do CONFERENTE, que é quem estaria com o celular na mão — não o admin. */
    const rF = await POST({ acao: 'corrigir', id: alvoF.id, usuarioId: 'U002',
                            motivo: 'contei de novo na doca', senha: '123456',
                            Qtd: Number(alvoF.qtd) - 1 });
    ok(rF.ok, 'o campo grava a correção pela rota do painel', rF.erro);

    const depoisF = (await GET({ acao: 'movimentos', limit: 200 }))
      .movimentos.find((m) => m.id === alvoF.id);
    ok(Number(depoisF.qtd) === Number(alvoF.qtd) - 1, 'o número novo vale', depoisF.qtd);
    ok(depoisF.alterado.por === 'Conferente Galpão',
      'e o painel mostra QUEM corrigiu, com o nome — não o id', depoisF.alterado);
    ok(depoisF.alterado.campo === 'quantidade' &&
       depoisF.alterado.motivo === 'contei de novo na doca',
      'com o campo que mudou e o motivo escrito no galpão', depoisF.alterado);

    /* E volta ao que era, porque o cenário continua depois daqui. */
    await POST({ acao: 'corrigir', id: alvoF.id, usuarioId: 'U001', senha: '123456',
                 motivo: 'desfazendo o ensaio', Qtd: Number(alvoF.qtd) });
  }

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
  ok((await POST({ acao: 'excluir', senha: '123456', aba: 'Locais', id: rNova.id })).excluido === true,
    'rota sem vínculo e sem movimento é excluída');

  // Com cliente apontando para ela, apagar quebraria a chave estrangeira: o servidor inativa.
  const rUsada = await POST({ acao: 'salvarLocal', registro: { Tipo: 'ROTA', Nome: 'Rota Litoral' } });
  await POST({ acao: 'salvarLocal', registro: { Tipo: 'CLIENTE', Nome: 'Ponto do Litoral', RotaId: rUsada.id } });
  const tentou = await POST({ acao: 'excluir', senha: '123456', aba: 'Locais', id: rUsada.id });
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

  ok((await POST({ acao: 'excluir', senha: '123456', aba: 'Motoristas', id: novoM.id })).excluido === true,
    'motorista pode ser excluído');

  console.log('\n== excluir usuário ==');
  const novoU = await POST({ acao: 'salvarUsuario', registro: { Nome: 'Ajudante Temporário', Perfil: 'PROMOTOR', PIN: '444444' } });
  ok(novoU.ok, 'usuário criado', novoU);
  ok((await POST({ acao: 'excluir', senha: '123456', aba: 'Usuarios', id: novoU.id })).excluido === true,
    'usuário que nunca lançou nada é excluído');

  // Quem já lançou fica: o nome dele é o que dá peso à divergência no histórico.
  const comHist = await POST({ acao: 'excluir', senha: '123456', aba: 'Usuarios', id: 'U003' });
  ok(comHist.inativado === true, 'usuário com lançamento é desativado, não apagado', comHist);
  const u3 = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(u3 && u3.Ativo === false && u3.Nome === 'Motorista Exemplo', 'ele continua no banco, inativo', u3);

  console.log('\n== o último admin não pode sumir ==');
  const offAdmin = await POST({ acao: 'salvarUsuario', registro: { ID: 'U001', Ativo: 'NAO' } });
  ok(offAdmin.ok === false && /último administrador/.test(offAdmin.erro || ''),
    'desativar o último admin é recusado', offAdmin);
  const del = await POST({ acao: 'excluir', senha: '123456', aba: 'Usuarios', id: 'U001' });
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

  ok((await POST({ acao: 'excluir', senha: '123456', aba: 'LocaisPadrao', id: lp.id })).excluido === true,
    'local padrão sem ninguém dentro é excluído');

  // Em uso, apagar deixaria o usuário apontando para o vazio.
  await POST({ acao: 'salvarUsuario', registro: { ID: 'U002', LocalPadrao: 'P001' } });
  const emUso = await POST({ acao: 'excluir', senha: '123456', aba: 'LocaisPadrao', id: 'P001' });
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

  /* NADA MARCADO = NADA LIBERADO. A lista vazia deixou de ser atalho para "todos": ela
     quer dizer o que parece dizer, e marcar e conceder.

     O deploy nao trancou ninguem porque a migracao `2026-09-22-marcar-o-que-ja-valia`
     gravou, em cada cadastro vazio, exatamente o que a pessoa ja enxergava. Vazio de
     verdade so aparece em quem nascer depois — e esse nasce sem poder nada. */
  const comTudo = (await GET({ acao: 'equipe' })).usuarios.find((u) => u.ID === 'U003');
  ok(Array.isArray(comTudo.Saidas) && comTudo.Saidas.length === 3,
    'o cadastro traz a lista EXPLÍCITA do que a pessoa pode — depois da virada não há ' +
    'mais lista vazia por descuido', comTudo.Saidas);
  ok(Lm.locaisPermitidos([], [{ ID: 'L001' }, { ID: 'L010' }]).length === 0,
    'e lista vazia não libera local nenhum — marcar é conceder');
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
  // Sem a etapa de conferência, o perfil deixou de decidir o status: não há mais tela
  // capaz de confirmar, então nascer AGUARDANDO seria travar a caixa para sempre.
  ok(await devolveComo('GESTOR') === 'CONFIRMADO', 'devolução de GESTOR nasce confirmada');
  ok(await devolveComo('GERENTE') === 'CONFIRMADO', 'devolução de GERENTE nasce confirmada');
  ok(await devolveComo('CONFERENTE') === 'CONFIRMADO', 'de CONFERENTE também');
  ok(await devolveComo('PROMOTOR') === 'CONFIRMADO',
    'e do PROMOTOR, que era justamente o que ficava esperando');

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

  await POST({ acao: 'excluir', senha: '123456', aba: 'Usuarios', id: novoPf.id });

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


  console.log('\n== painel de ativos: uma linha por trajeto ==');
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
        // galpão -> rota: saiu 1000, voltou 400 -> saldo -600, desvio 60% (ruim)
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 1000, DataRef: D('2026-09-02') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R01', DestinoID: 'L001', Qtd: 400, DataRef: D('2026-09-05') },
        // rota -> cliente que devolve mais do que levou -> ok
        { Tipo: 'SAIDA', OrigemID: 'R01', DestinoID: 'C01', Qtd: 700, DataRef: D('2026-09-03') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'C01', DestinoID: 'R01', Qtd: 770, DataRef: D('2026-09-06') },
        // linha antiga que ficou em AGUARDANDO: com a etapa extinta, ela passa a contar
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

    /* Cada caminho E CADA DIA e uma linha, com id "despachou > recebeu | data".
       Somar os destinos de uma origem numa celula so — "Filial Maceio, Joao Pessoa" —
       apagava a conta de cada um; e somar os dias numa linha so apagava o lancamento
       novo, que desaparecia dentro do total de um dia anterior. */
    const dias = (caminho) => f.linhas.filter((l) => l.id.indexOf(caminho + '|') === 0);
    ok(f.linhas.length === 6, 'tres caminhos em dois dias cada: seis linhas',
      f.linhas.map((l) => l.id));
    ok(dias('L001>R01').length === 2 && dias('R01>C01').length === 2,
      'o mesmo caminho em dois dias vira DUAS linhas', f.linhas.map((l) => l.id));
    ok(dias('R01>C01').length === 2 && dias('R01>C02').length === 2,
      'e a mesma origem com dois destinos continua separada', Object.keys(por));

    /* A remessa e a devolucao do mesmo caminho em DIAS diferentes caem em linhas
       diferentes — cada dia responde por si. */
    const ida = por['L001>R01|2026-09-02'], volta = por['L001>R01|2026-09-05'];
    ok(ida.saida === 1000 && ida.retorno === 0,
      'o dia da remessa traz so a remessa', ida);
    ok(volta.saida === 0 && volta.retorno === 400,
      'e o dia da devolucao traz so ela', volta);

    /* A ida e a volta do mesmo caminho caem na mesma linha: a devolucao R01->L001 fecha a
       remessa L001->R01. Sem isso o retorno abriria uma linha propria, no sentido
       contrario, e ninguem cruzaria as duas. */
    ok(ida.origens.join(',') === 'Galpão' && ida.destinos.join(',') === 'João Pessoa',
      'as duas pontas aparecem, uma em cada coluna', [ida.origens, ida.destinos]);
    ok(ida.tipo === 'ROTA',
      'o tipo da linha é o de quem RECEBEU: é ele que está com a caixa', ida.tipo);
    ok(ida.saldoFinal === -1000 && ida.inicial === 0,
      'sem estoque inicial, o saldo final é o do próprio dia', ida);

    ok(por['R01>C01|2026-09-06'].retorno === 770,
      'a devolução do cliente cai no dia dela', por['R01>C01|2026-09-06']);
    ok(por['R01>C02|2026-09-07'].retorno === 500,
      'devolução antiga em AGUARDANDO conta: sem a etapa, não há o que esperar',
      por['R01>C02|2026-09-07']);

    /* Local sem movimento nenhum nao vira linha: nao houve caminho percorrido. No modelo
       por local ele aparecia zerado e enchia a lista. */
    ok(!Object.keys(por).some((k) => k.indexOf('C03') >= 0),
      'quem não teve movimento não vira linha: não houve caminho', Object.keys(por));

    /* Os totais somam TUDO agora. No modelo por local a mesma remessa entrava duas vezes
       — na linha do galpao e na da rota — e eles precisavam excluir o galpao. Os numeros
       abaixo sao os mesmos de antes, o que mostra que o recorte mudou sem mexer na conta. */
    ok(f.totais.saida === 2300 && f.totais.retorno === 1670,
      'os totais ignoram cancelado e o que é de antes da janela', f.totais);
    ok(f.totais.deficit === 700,
      'déficit soma só quem está devendo, sem abater quem sobrou', f.totais.deficit);
    ok(f.totais.linhas === 6, 'e cada dia de cada caminho entra uma vez só',
      f.totais.linhas);

    /* O deficit soma por CAMINHO, e nao por linha. Aqui a remessa de 1.000 e a devolucao
       de 400 estao em DIAS diferentes: linha a linha o deficit daria 1.000 + 600 + 100,
       contando como perdido o que ja voltou. */
    ok(f.totais.deficit === 700,
      'o déficit soma por caminho: o dia da devolução abate o dia da remessa',
      f.totais.deficit);
    ok(f.totais.taxaRetorno === 72.6, 'taxa de retorno do conjunto', f.totais.taxaRetorno);
    /* Agora cada DIA e uma linha, e o dia da remessa isolada fica com 100% de desvio.
       Sao tres linhas abaixo da meta: os dois dias de remessa pura e o dia em que o
       cliente devolveu menos do que levou. */
    ok(f.totais.foraDaMeta === 3,
      'tres dos seis dias ficaram abaixo de 90%', f.totais.foraDaMeta);

    /* A lista se le como extrato: o estoque inicial abre e os caminhos vem na ordem em
       que foram lancados. Neste cenario o caminho mais antigo por acaso e tambem o que
       mais deve — por isso o cenario logo abaixo, que separa as duas coisas. */
    ok(f.linhas[0].id === 'L001>R01|2026-09-02', 'o dia mais antigo vem primeiro',
      f.linhas.map((l) => l.id));

    /* Cenario que DISTINGUE data de saldo: aqui o caminho mais recente e o que mais deve.
       Ordenando por saldo, ele viria primeiro; por data, vem por ultimo. E o estoque foi
       lancado DEPOIS de tudo, entao ele fecha a lista — nao abre.

       Abria, ate 17/09/2026: o estoque vinha antes da data na comparacao, e todos os
       estoques subiam para o topo. Um saldo inicial lancado no dia 20 aparecia grudado no
       do dia 2, acima das movimentacoes do meio, como se tivesse sido lancado antes
       delas. Num extrato quem manda e a data. */
    const cenOrd = {
      config: {}, usuarios: cen.usuarios, locais: cen.locais,
      movimentos: [
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 10,
          DataRef: D('2026-09-02') },
        { Tipo: 'AJUSTE', DestinoID: 'L001', Qtd: 900, DataRef: D('2026-09-20') },
        { Tipo: 'SAIDA', OrigemID: 'R01', DestinoID: 'C01', Qtd: 900,
          DataRef: D('2026-09-18') }
      ]
    };
    const ord = F.fluxoPorOrigem(cenOrd, DESDE, 90).linhas;
    ok(ord.map((l) => String(l.data).slice(0, 10)).join(' ') ===
       '2026-09-02 2026-09-18 2026-09-20',
      'a lista sai por data — o estoque lançado por último fica por último',
      ord.map((l) => l.id + ':' + l.data));
    ok(ord[2].estoqueInicial === true,
      'e é ele mesmo quem está lá no fim, no dia em que foi lançado',
      ord.map((l) => l.id + ':' + l.data));
    ok(ord[0].id.indexOf('L001>R01') === 0 && ord[1].id.indexOf('R01>C01') === 0,
      'e os caminhos vem por data, nao por quanto devem — o de 900 e o mais recente',
      ord.map((l) => l.id + ':' + l.saldo));

    /* Dentro do MESMO dia o estoque abre: "o que eu tinha quando o dia comecou, e o que
       fiz com isso". Este cenario e o da tela do usuario em 17/09/2026, numero a numero —
       inclusive o saldo corrido, que corre na ordem da lista e por isso saia errado junto
       com ela. */
    const cenDia = {
      config: {}, usuarios: cen.usuarios, locais: cen.locais,
      movimentos: [
        { Tipo: 'AJUSTE', DestinoID: 'L001', Qtd: 1250, DataRef: D('2026-09-15') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'C01', Qtd: 1690,
          DataRef: D('2026-09-16') },
        { Tipo: 'DEVOLUCAO', OrigemID: 'C01', DestinoID: 'L001', Qtd: 1250,
          DataRef: D('2026-09-16') },
        { Tipo: 'AJUSTE', DestinoID: 'L001', Qtd: 810, DataRef: D('2026-09-17') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'C01', Qtd: 810,
          DataRef: D('2026-09-17') }
      ]
    };
    const dia = F.fluxoPorOrigem(cenDia, DESDE, 90).linhas;
    ok(dia.map((l) => String(l.data).slice(5, 10) + (l.estoqueInicial ? '/est' : '/mov'))
         .join(' ') === '09-15/est 09-16/mov 09-17/est 09-17/mov',
      'dentro do mesmo dia o estoque abre e a movimentação vem depois',
      dia.map((l) => l.data + (l.estoqueInicial ? ' estoque' : ' caminho')));

    /* A coluna nova da tela: o que foi lancado NAQUELE dia, separado do acumulado. Sem
       ela, a linha de 17/09 abria em 1.620 e nada dizia que 810 daquilo acabavam de
       entrar. */
    ok(dia.map((l) => l.inicial).join(' ') === '1250 0 810 0',
      'cada linha carrega o estoque lançado no dia dela, e não o acumulado',
      dia.map((l) => l.data + ':' + l.inicial));

    /* O saldo corre na ordem da lista, entao a ordem errada levava o acumulado junto:
       com os dois estoques no topo, o dia 16 abria em 2.060 em vez de 1.250. */
    ok(dia.map((l) => l.iniCorrido).join(' ') === '1250 1250 1620 1620',
      'e o saldo corrido segue a mesma ordem: 1.250, 1.250, 1.620, 1.620',
      dia.map((l) => l.data + ':' + l.iniCorrido));

    /* O ensaio continua no fim, acima de qualquer data: foi pedido explicitamente que
       tudo com "teste" no nome fique embaixo. */
    const cenT = {
      config: {}, usuarios: cen.usuarios,
      locais: cen.locais.concat([{ ID: 'RT', Nome: 'Rota Teste', Tipo: 'ROTA' }]),
      movimentos: [
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'RT', Qtd: 5,
          DataRef: D('2026-09-01') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 5,
          DataRef: D('2026-09-28') }
      ]
    };
    const ordT = F.fluxoPorOrigem(cenT, DESDE, 90).linhas;
    ok(ordT[ordT.length - 1].id.indexOf('L001>RT') === 0,
      'o ensaio fica por último mesmo sendo o mais antigo',
      ordT.map((l) => l.id));

    // a quantidade CONFERIDA manda: é ela que entra no razão
    const cen2 = {
      config: {}, usuarios: cen.usuarios, locais: cen.locais,
      movimentos: [
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 100, DataRef: D('2026-09-02') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R01', DestinoID: 'L001',
          Qtd: 90, QtdConferida: 80, DataRef: D('2026-09-05') }
      ]
    };
    const r2 = F.fluxoPorOrigem(cen2, DESDE, 90).linhas
      .filter((l) => l.retorno > 0)[0];
    ok(r2.retorno === 80, 'vale a quantidade conferida, não a declarada', r2.retorno);

    /* A linha de estoque inicial nao tem trajeto: o saldo inicial e do LOCAL, e espalha-lo
       pelos caminhos dele contaria o mesmo estoque uma vez por caminho. */
    const cen3 = {
      config: {}, usuarios: cen.usuarios, locais: cen.locais,
      movimentos: [
        { Tipo: 'AJUSTE', DestinoID: 'L001', Qtd: 1250, DataRef: D('2026-05-10') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'R01', Qtd: 300, DataRef: D('2026-09-02') },
        { Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'C01', Qtd: 200, DataRef: D('2026-09-02') }
      ]
    };
    const f3 = F.fluxoPorOrigem(cen3, DESDE, 90);
    /* O ajuste e de MAIO e a janela comeca em setembro: a linha dele nao aparece, porque
       esta fora do periodo. Mas o valor nao se perde — ele ja esta no saldo corrido da
       primeira linha visivel. E isso que faz o numero da tela continuar verdadeiro com
       qualquer filtro. */
    ok(f3.linhas.filter((l) => l.estoqueInicial).length === 0,
      'o estoque lançado fora do período não vira linha — está fora do recorte',
      f3.linhas.map((l) => l.id));
    ok(f3.linhas[0].iniCorrido === 1250,
      'mas o saldo dele abre a primeira linha visível: o corrido vem do histórico inteiro',
      f3.linhas.map((l) => l.id + ':' + l.iniCorrido));
    ok(f3.linhas.every((l) => l.inicial === 0),
      'e nenhum caminho repete o 1.250: seria o mesmo estoque contado duas vezes',
      f3.linhas.map((l) => l.id + ':' + l.inicial));

    /* O mesmo cenario com a janela abrindo ANTES do ajuste: aí a linha dele aparece. */
    const f3b = F.fluxoPorOrigem(cen3, D('2026-01-01'), 90);
    const ini = f3b.linhas.filter((l) => l.estoqueInicial)[0];
    ok(!!ini && ini.inicial === 1250 && ini.saida === 0 && ini.retorno === 0,
      'com o período alcançando maio, o estoque ganha linha própria', ini);
    ok(ini.origens.join(',') === 'Galpão' && ini.destinos.length === 0,
      'com o local na origem e o destino vazio — a tela escreve "Estoque Inicial" ali',
      [ini.origens, ini.destinos]);
    ok(f3.totais.linhas === 2,
      'e a linha de estoque inicial fica fora da conta de caminhos', f3.totais.linhas);
  }
  console.log('\n== as duas lentes fecham: o trecho e a pessoa ==');
  {
    /* ================= UM LANCAMENTO INCOMPLETO E UMA PENDENCIA =================
     *
     * O ESCRITORIO VIU NA TELA: cartao "Voltou" 28.221 e a tabela de Motoristas somando
     * 28.491, com a Saida batendo nos dois. 270 de diferenca.
     *
     * ERAM AS DEVOLUCOES LANCADAS SEM UMA DAS PONTAS. `fluxoPorOrigem` desenha TRAJETOS
     * e exigia origem E destino; `fluxoPorPessoa` so' precisa saber quem levou. A linha
     * sumia de "Todas" e continuava na conta do motorista, do usuario e do ESTOQUE —
     * porque `saldos` nunca exigiu as duas pontas. O numero da matriz vinha 270 MENOR
     * que a realidade, e calado: a linha nao estava em lugar nenhum da tela principal.
     *
     * ESCONDIDO, UM LANCAMENTO INCOMPLETO NUNCA E CORRIGIDO: ninguem vai atras do que
     * nao ve. A ponta que falta virou a categoria "sem informacao" — a mesma palavra do
     * motorista sem nome e do tipo de caixa sem nome.
     *
     * A PROVA COMPARA AS DUAS LENTES LANCAMENTO A LANCAMENTO, e nao so' no total: um
     * total igual por compensacao — uma linha a mais de um lado e uma a menos do outro
     * — passaria num total e esconderia dois defeitos. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [{ ID: 'G1', Nome: 'Galp\u00e3o', Tipo: 'GALPAO' },
                    { ID: 'F1', Nome: 'Filial', Tipo: 'FILIAL' }];
    const base = { Status: 'CONFIRMADO', TipoCaixaID: 'T1', UsuarioID: 'U1',
                   Motorista: 'Valcy', DataRef: D('2026-10-20'), DataHora: D('2026-10-20') };
    const dadosDe = (movs) => ({
      movimentos: movs, locais: locais, tipos: [{ ID: 'T1', Nome: 'CX G' }],
      usuarios: [{ ID: 'U1', Nome: 'Nestor' }], fornecedores: [], config: {} });
    const somar = (ls) => ls.reduce((a, l) => ({
      s: a.s + (l.saida || 0), r: a.r + (l.retorno || 0) }), { s: 0, r: 0 });
    function duasLentes(movs) {
      const d = dadosDe(movs);
      return { trecho: somar(F.fluxoPorOrigem(d, null, 90, null).linhas),
               pessoa: somar(F.fluxoPorPessoa(d, null, null).motoristas) };
    }

    const CASOS = [
      ['sa\u00edda com as duas pontas',
       { ...base, ID: 'A', Tipo: 'SAIDA', OrigemID: 'G1', DestinoID: 'F1', Qtd: 100 }],
      ['devolu\u00e7\u00e3o com as duas pontas',
       { ...base, ID: 'B', Tipo: 'DEVOLUCAO', OrigemID: 'F1', DestinoID: 'G1', Qtd: 100 }],
      ['devolu\u00e7\u00e3o SEM origem',
       { ...base, ID: 'C', Tipo: 'DEVOLUCAO', OrigemID: '', DestinoID: 'G1', Qtd: 270 }],
      ['devolu\u00e7\u00e3o SEM destino',
       { ...base, ID: 'D', Tipo: 'DEVOLUCAO', OrigemID: 'F1', DestinoID: '', Qtd: 270 }],
      ['sa\u00edda SEM destino',
       { ...base, ID: 'E', Tipo: 'SAIDA', OrigemID: 'G1', DestinoID: '', Qtd: 270 }],
      ['transfer\u00eancia SEM origem',
       { ...base, ID: 'F', Tipo: 'TRANSFERENCIA', OrigemID: '', DestinoID: 'F1', Qtd: 55 }]
    ];

    CASOS.forEach(([nome, m]) => {
      const r = duasLentes([m]);
      ok(r.trecho.s === r.pessoa.s && r.trecho.r === r.pessoa.r,
        'as duas lentes fecham com "' + nome + '" \u2014 uma ponta que falta n\u00e3o pode ' +
        'apagar a linha de "Todas" e deix\u00e1-la na conta do motorista: era essa a ' +
        'diferen\u00e7a de 270 no Retorno, e ela saía do n\u00famero da matriz sem nada dizer',
        { caso: nome, trecho: r.trecho, pessoa: r.pessoa });
    });

    /* E JUNTAS, porque uma compensacao entre casos daria totais iguais por acaso. */
    const tudo = duasLentes(CASOS.map(([, m]) => m));
    ok(tudo.trecho.s === tudo.pessoa.s && tudo.trecho.r === tudo.pessoa.r &&
       tudo.trecho.r === 640,
      'e fecham com os seis casos juntos \u2014 100 + 270 + 270 de retorno = 640 nas duas',
      tudo);

    /* A PONTA QUE FALTA TEM NOME NA TELA. Sem nome, a linha aparece com uma c\u00e9lula em
       branco, que se l\u00ea como dado que faltou carregar — e n\u00e3o como a pend\u00eancia que ela
       \u00e9. */
    const semOrigem = F.fluxoPorOrigem(dadosDe([CASOS[2][1]]), null, 90, null)
      .linhas.filter((l) => !l.estoqueInicial)[0];
    ok(!!semOrigem && (semOrigem.destinos || []).join(',') === 'sem informa\u00e7\u00e3o',
      'e a ponta que falta aparece como "sem informa\u00e7\u00e3o" \u2014 a mesma palavra do ' +
      'motorista sem nome e do tipo sem nome: uma c\u00e9lula em branco se l\u00ea como dado que ' +
      'faltou carregar, e n\u00e3o como a pend\u00eancia que algu\u00e9m tem de corrigir no cadastro',
      semOrigem && semOrigem.destinos);
    ok(!!semOrigem && (semOrigem.origens || []).join(',') === 'Galp\u00e3o' &&
       semOrigem.retorno === 270,
      'e a ponta que EXISTE continua dizendo quem \u00e9: 270 voltaram para o Galp\u00e3o, e n\u00e3o ' +
      'se sabe de onde \u2014 \u00e9 isso que a pessoa precisa ler para ir corrigir',
      semOrigem && { origens: semOrigem.origens, retorno: semOrigem.retorno });

    /* A PERDA CONTINUA FORA, e isto e' o que a guarda antiga fazia de CERTO. Ela nao e'
       viagem: a caixa nao foi para lugar nenhum, ela deixou de existir. Removida a
       guarda sem pensar, a perda entraria como saida e inflaria o cartao. */
    const perda = F.fluxoPorOrigem(dadosDe([
      { ...base, ID: 'P', Tipo: 'PERDA', OrigemID: 'G1', DestinoID: '', Qtd: 999 }
    ]), null, 90, null);
    ok(perda.totais.saida === 0 && perda.totais.retorno === 0,
      'e a PERDA continua fora do fluxo \u2014 ela n\u00e3o \u00e9 viagem: a caixa n\u00e3o foi para ' +
      'lugar nenhum, deixou de existir. Era isto que a guarda antiga fazia de certo, e ' +
      'tirada sem pensar ela entraria como sa\u00edda e inflaria o cart\u00e3o', perda.totais);

    /* E A CHAVE DA PONTA QUE FALTA NAO E UM NOME. Ela e' um id — `::sem` —, e os dois
       pontos na frente nao sao digitaveis num cadastro: e' a mesma protecao que
       `::estoque` usa no filtro de destino da tela.
       SE ELA FOSSE A PALAVRA "sem informacao", um local cadastrado com esse ID cairia
       no mesmo balde da ponta que falta, e as duas coisas somariam juntas numa linha
       so' — o movimento de um lugar de verdade contado como pendencia, e a pendencia
       escondida dentro de um lugar de verdade. */
    const comHomonimo = F.fluxoPorOrigem({
      ...dadosDe([{ ...base, ID: 'H', Tipo: 'SAIDA',
                    OrigemID: 'sem informa\u00e7\u00e3o', DestinoID: 'G1', Qtd: 42 }]),
      locais: locais.concat([{ ID: 'sem informa\u00e7\u00e3o', Nome: 'Dep\u00f3sito X', Tipo: 'GALPAO' }])
    }, null, 90, null).linhas.filter((l) => !l.estoqueInicial)[0];
    ok(!!comHomonimo && (comHomonimo.origens || []).join(',') === 'Dep\u00f3sito X',
      'e um local cujo ID seja a palavra "sem informa\u00e7\u00e3o" continua sendo ELE mesmo \u2014 ' +
      'a chave da ponta que falta \u00e9 um id que nenhum cadastro produz; fosse a palavra, ' +
      'o movimento de um lugar de verdade entraria na linha das pend\u00eancias e a ' +
      'pend\u00eancia ficaria escondida dentro de um lugar de verdade',
      comHomonimo && comHomonimo.origens);
  }
  console.log('\n== a quantidade que conta viaja para a tela ==');
  {
    /* ================= UM NUMERO SO PARA "QUANTO VOLTOU" =================
     *
     * O ESCRITORIO ABRIU OS DOIS RELATORIOS: Painel de Ativos dizia 25.367 de Retorno
     * e Movimentos Gerais dizia 27.256, com a Saida batendo nos dois. "Precisa ser
     * igual, veja qual e' o valor correto."
     *
     * ERA A REGRA DA QUANTIDADE. Numa devolucao conferida ha' dois numeros: o que o
     * motorista DECLAROU (`Qtd`) e o que o conferente CONTOU na chegada
     * (`QtdConferida`). `efetiva` escolhe a contada quando ela existe, e e' por ela
     * que o estoque, o aging e o Painel de Ativos somam — e' o que entrou no galpao.
     * A lista de Movimentos mandava `Qtd` cru, e as telas somavam a declarada.
     *
     * A DECISAO E DAQUI, E DE UM LUGAR SO. A tela nao refaz a regra: refeita la, seria
     * uma segunda implementacao do mesmo numero, e duas divergem no primeiro caso de
     * borda. Entao ela VIAJA, em `qtdEfetiva`.
     *
     * E A DECLARADA CONTINUA VIAJANDO, em `qtd`: e' ela que a correcao edita e que a
     * conciliacao compara CONTRA. Trocar uma pela outra faria a tela de correcao abrir
     * com o numero do conferente no campo do motorista e grava-lo por cima. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [{ ID: 'L1', Nome: 'Galp\u00e3o' }, { ID: 'L2', Nome: 'Caruaru' }];
    const tipos = [{ ID: 'T1', Nome: 'CX G' }];
    const users = [{ ID: 'U1', Nome: 'Nestor' }];
    const base = {
      Tipo: 'DEVOLUCAO', OrigemID: 'L2', DestinoID: 'L1', TipoCaixaID: 'T1',
      Status: 'CONFIRMADO', UsuarioID: 'U1', DataRef: D('2026-09-10'),
      DataHora: D('2026-09-10')
    };
    const movs = [
      Object.assign({}, base, { ID: 'M1', Qtd: 500, QtdConferida: 480 }),
      Object.assign({}, base, { ID: 'M2', Qtd: 300, QtdConferida: null }),
      Object.assign({}, base, { ID: 'M3', Qtd: 200, QtdConferida: 0 })
    ];
    const lista = F.listaMovimentos(movs, locais, tipos, users, {});
    const porId = {};
    lista.forEach((m) => { porId[m.id] = m; });

    ok(porId.M1.qtdEfetiva === 480,
      'a carga declarada como 500 e contada como 480 viaja com 480 na quantidade que ' +
      'conta \u2014 era isto que fazia o Painel de Ativos e Movimentos Gerais discordarem ' +
      'em 1.889 no Retorno, sem nada na tela dizendo qual estava certo', porId.M1.qtdEfetiva);
    ok(Number(porId.M1.qtd) === 500,
      'e a declarada continua viajando ao lado \u2014 \u00e9 ela que a corre\u00e7\u00e3o edita e que a ' +
      'concilia\u00e7\u00e3o compara CONTRA; trocada, a tela de corre\u00e7\u00e3o abriria com o n\u00famero do ' +
      'conferente no campo do motorista e o gravaria por cima', porId.M1.qtd);
    ok(porId.M2.qtdEfetiva === 300,
      'sem confer\u00eancia, a declarada \u00e9 a que conta \u2014 valendo zero at\u00e9 algu\u00e9m contar, ' +
      'uma devolu\u00e7\u00e3o leg\u00edtima sumiria do retorno at\u00e9 o galp\u00e3o abrir a carga',
      porId.M2.qtdEfetiva);
    ok(porId.M3.qtdEfetiva === 0,
      'e CONTADO ZERO \u00e9 uma contagem, e n\u00e3o a aus\u00eancia de uma: a carga que chegou vazia ' +
      'vale zero, e n\u00e3o as 200 que o motorista disse que trazia', porId.M3.qtdEfetiva);

    /* A MESMA REGUA DOS SALDOS, e nao uma parecida: esta prova e' o que impede a copia
       de nascer. `saldos` e' quem responde "quanto tem no lugar", e o que entrou no
       galpao por estas tres linhas tem de ser o mesmo que a lista soma. */
    const soma = lista.reduce((s, m) => s + m.qtdEfetiva, 0);
    const noGalpao = F.saldos(movs).L1.T1;
    ok(soma === noGalpao && soma === 780,
      'e a soma da lista d\u00e1 o mesmo que entrou no estoque \u2014 \u00e9 o mesmo `efetiva`, e n\u00e3o ' +
      'uma segunda regra parecida que diverge no primeiro caso de borda',
      { lista: soma, estoque: noGalpao });
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
      tipos: [{ ID: 'T1', Nome: 'CX P' }, { ID: 'T2', Nome: 'CX G' }],
      movimentos: [
        // Ramos levou 580 na rota Caruaru e nao trouxe nada: deficit inteiro
        { Tipo: 'SAIDA', Qtd: 580, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U1', TipoCaixaID: 'T2', DataRef: D('2026-09-05') },
        // Wesley levou 300 e trouxe 300: quitado
        { Tipo: 'SAIDA', Qtd: 300, Motorista: 'Wesley', Rota: 'Maceió', UsuarioID: 'U1', TipoCaixaID: 'T1', DataRef: D('2026-09-06') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', Qtd: 300, Motorista: 'Wesley', Rota: 'Maceió', UsuarioID: 'U2', TipoCaixaID: 'T1', DataRef: D('2026-09-09') },
        // linha antiga em AGUARDANDO: passa a contar, como no razao
        { Tipo: 'DEVOLUCAO', Status: 'AGUARDANDO', Qtd: 500, Motorista: 'Ramos', Rota: 'Caruaru', UsuarioID: 'U2', TipoCaixaID: 'T2', DataRef: D('2026-09-10') },
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
    ok(mot.Ramos.saida === 580 && mot.Ramos.retorno === 500,
      'cancelado, fora da janela e perda ficam de fora; a devolução antiga conta', mot.Ramos);
    ok(mot.Ramos.saldo === -80 && mot.Ramos.desvio === 14 && mot.Ramos.situacao === 'atencao',
      'levou 580 e trouxe 500: 14% de desvio', mot.Ramos);
    ok(mot.Ramos.responsavel === 'Caruaru',
      'a quinta coluna do motorista traz as rotas dele, não o nome repetido', mot.Ramos.responsavel);
    ok(mot.Wesley.saldo === 0 && mot.Wesley.situacao === 'ok', 'quem trouxe tudo fica ok', mot.Wesley);
    ok(p.motoristas[0].nome === 'Ramos', 'quem deve mais aparece primeiro', p.motoristas.map((x) => x.nome));

    // usuario e quem LANCOU: a devolucao do Wesley foi lancada pela Ivanilda
    ok(usu['Nestor Neto'].saida === 880 && usu['Nestor Neto'].retorno === 0,
      'o usuário soma o que ELE lançou de saída', usu['Nestor Neto']);
    ok(usu.Ivanilda.retorno === 800 && usu.Ivanilda.saida === 0,
      'e o que ELE lançou de devolução, ainda que a carga seja de outro', usu.Ivanilda);
    ok(usu['Nestor Neto'].responsavel === 'Conferente' && usu.Ivanilda.responsavel === 'Gestor',
      'na visão de usuário a quinta coluna é o perfil', [usu['Nestor Neto'].responsavel, usu.Ivanilda.responsavel]);
    ok(mot.Wesley.sub === '2 lançamentos',
      'a linha de baixo conta lançamentos, sem repetir a coluna ao lado', mot.Wesley.sub);
    ok(usu.Ivanilda.sub === '2 lançamentos',
      'a contagem segue os números da linha', usu.Ivanilda.sub);

    // As colunas SAIDA e RETORNO abrem por tipo nas quatro visões, não só em Todas.
    const chave = (l) => (l || []).map((t) => t.caixa + ':' + t.qtd).join(' ');
    ok(chave(usu['Nestor Neto'].saidaTipos) === 'CX G:580 CX P:300',
      'o usuário também abre a saída por tipo, e a soma fecha com os 880 da coluna',
      usu['Nestor Neto'].saidaTipos);
    ok(chave(usu.Ivanilda.retornoTipos) === 'CX G:500 CX P:300',
      'e o retorno idem, na mesma ordem de nome — para ler uma coluna contra a outra',
      usu.Ivanilda.retornoTipos);
    ok(chave(mot.Ramos.saidaTipos) === 'CX G:580' && chave(mot.Ramos.retornoTipos) === 'CX G:500',
      'no motorista vale o mesmo: o que ele levou e o que trouxe, por tipo', mot.Ramos);
    ok(mot.Ramos.saidaTipos.reduce((a, t) => a + t.qtd, 0) === mot.Ramos.saida,
      'o detalhe nunca contradiz o total: somar os tipos dá a coluna', mot.Ramos);

    /* ================= SEM NOME NAO E SEM LINHA =================
     *
     * ESTA PROVA DIZIA `length === 0`, e com isso ela TRANCOU UM BURACO como se fosse
     * regra. A intencao escrita nela estava certa — "nao pode virar uma linha sem
     * nome" —, mas a afirmacao cobrava outra coisa: que a linha nao existisse.
     *
     * O PRECO APARECEU NA TELA. O escritorio clicou nos chips do Painel e perguntou por
     * que o cartao muda de valor em cada um. Em "Motoristas" ele mudava porque toda
     * saida lancada sem motorista — a que o gerente faz direto — sumia da lente inteira,
     * sem linha e sem aviso. Medido: 350 de saida e 70 de retorno na operacao viravam
     * 150 e ZERO naquela aba.
     *
     * A REGRA DE VERDADE E' A DO AGRUPAMENTO da outra tela, que ja estava escrita:
     * "SEM INFORMACAO E UMA CATEGORIA, e nao um buraco". Uma linha chamada
     * "sem informacao" nao e' uma linha sem nome — e' a resposta a uma pergunta
     * operacional real: quem fez estas saidas?
     *
     * ENTAO A PROVA COBRA AS DUAS COISAS que a intencao original queria: a linha
     * EXISTE, e ela tem NOME. */
    const semMot = F.fluxoPorPessoa({
      usuarios: [{ ID: 'U1', Nome: 'A' }],
      movimentos: [
        { Tipo: 'SAIDA', Qtd: 10, Motorista: '', UsuarioID: 'U1', DataRef: D('2026-09-05') },
        { Tipo: 'SAIDA', Qtd: 40, Motorista: 'Dinho', UsuarioID: 'U1', DataRef: D('2026-09-05') },
        { Tipo: 'DEVOLUCAO', Qtd: 25, Motorista: '', UsuarioID: 'U1', DataRef: D('2026-09-05') }
      ]
    }, DESDE);
    const semNome = semMot.motoristas.filter((l) => !String(l.nome || '').trim());
    ok(!semNome.length,
      'movimento sem motorista n\u00e3o cria linha SEM NOME \u2014 uma c\u00e9lula em branco no meio ' +
      'da lista se l\u00ea como dado que faltou carregar', semNome);

    const catMot = semMot.motoristas.filter((l) => l.nome === 'sem informa\u00e7\u00e3o')[0];
    ok(!!catMot && catMot.saida === 10 && catMot.retorno === 25,
      'ele cria uma CATEGORIA, com as duas pontas: 10 que sa\u00edram e 25 que voltaram sem ' +
      'motorista anotado \u2014 a sa\u00edda que o gerente faz direto \u00e9 caso real na opera\u00e7\u00e3o, e ' +
      'som\u00ea-la fazia a aba Motoristas somar menos que "Todas" sem nada dizer quanto',
      catMot);

    /* E O TOTAL DA LENTE E O TOTAL DA OPERACAO. E' esta a afirmacao que o escritorio
       cobra: as abas que cortam a MESMA operacao de outro jeito — motorista, usuario,
       tipo de caixa — tem de dar o MESMO numero. As que recortam um pedaco — rota,
       unidade, cliente, fornecedor — dao menos, e isso e' a pergunta delas. */
    const somaLente = (ls) => ls.reduce((a, l) => a + l.saida + l.retorno, 0);
    ok(somaLente(semMot.motoristas) === 75 && somaLente(semMot.usuarios) === 75,
      'e a lente FECHA com a opera\u00e7\u00e3o: 10 + 40 + 25 = 75 em Motoristas e os mesmos 75 ' +
      'em Usu\u00e1rios \u2014 duas leituras do mesmo per\u00edodo com n\u00fameros diferentes \u00e9 o que ' +
      'deixa o escrit\u00f3rio sem saber qual apresentar ao cliente',
      { motoristas: somaLente(semMot.motoristas), usuarios: somaLente(semMot.usuarios) });

    /* O TIPO DE CAIXA TINHA O MESMO BURACO, no detalhe: sem nome no cadastro, a
       quantidade sumia do `saidaTipos` e continuava no total da linha — a gaveta
       mostrava menos que o proprio cabecalho dela. */
    const tiposDaCat = (catMot.saidaTipos || []).concat(catMot.retornoTipos || []);
    ok(tiposDaCat.reduce((a, x) => a + x.qtd, 0) === catMot.saida + catMot.retorno,
      'e o detalhe por tipo nunca contradiz o total, nem quando o tipo tamb\u00e9m n\u00e3o tem ' +
      'nome \u2014 somar os tipos d\u00e1 a coluna', tiposDaCat);

    /* E A LINHA DE TRECHO TEM O MESMO DETALHE, e tinha o mesmo buraco. A aba "Tipos de
       caixa" e' montada na tela somando os `saidaTipos` das linhas de trecho: um tipo
       que nao resolve nome no cadastro — apagado, renomeado, ou um id que ficou orfao —
       sumia dali e continuava no total da linha. A aba somava menos que "Todas", e as
       duas leituras do mesmo periodo discordavam sem nada dizer que faltava algo.
       O CASO E O TIPO AUSENTE, e nao o id orfao: `nome()` cai no proprio id quando nao
       acha no cadastro, entao um id apagado continua sendo um nome — feio, mas presente.
       Quem some e' a linha SEM TipoCaixaID nenhum, que e' o que uma importacao antiga
       deixa para tras.
       MEDIDO NOS DOIS LADOS: o que a linha diz na coluna e o que ela abre no detalhe. */
    const semTipo = F.fluxoPorOrigem({
      locais: [{ ID: 'G1', Nome: 'Galp\u00e3o', Tipo: 'GALPAO' },
               { ID: 'R1', Nome: 'Rota', Tipo: 'ROTA' }],
      tipos: [],
      movimentos: [{ ID: 'X1', Tipo: 'SAIDA', OrigemID: 'G1', DestinoID: 'R1',
                     TipoCaixaID: '', Qtd: 90, Status: 'CONFIRMADO',
                     DataRef: D('2026-09-05'), DataHora: D('2026-09-05') }]
    }, null, 90, null);
    const lt = (semTipo.linhas || []).filter((l) => !l.estoqueInicial)[0];
    ok(!!lt && lt.saida === 90,
      'a linha de trecho soma 90 na coluna \u2014 sem isto a prova abaixo n\u00e3o mede nada',
      lt && lt.saida);
    ok(!!lt && (lt.saidaTipos || []).reduce((a, x) => a + x.qtd, 0) === lt.saida,
      'e o detalhe por tipo soma os MESMOS 90, mesmo com o tipo sem nome no cadastro \u2014 ' +
      'a aba "Tipos de caixa" \u00e9 montada somando estes detalhes, e o que cai fora daqui ' +
      'faz aquela aba somar menos que "Todas" sem nada dizer que faltou',
      lt && lt.saidaTipos);
    ok(!!lt && (lt.saidaTipos || []).every((x) => String(x.caixa || '').trim()),
      'e nenhum pedacinho do detalhe fica sem nome \u2014 uma c\u00e9lula em branco na gaveta se ' +
      'l\u00ea como dado que faltou carregar', lt && lt.saidaTipos);
    ok(semMot.usuarios.length === 1, 'mas continua contando para quem lançou');
  }


  console.log('\n== detalhe por tipo de caixa, em cada trajeto ==');
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
        { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' },
        { ID: 'R2', Nome: 'Recife', Tipo: 'ROTA', MotoristaId: 'U9' },
        { ID: 'C1', Nome: 'CEASA', Tipo: 'CLIENTE' }
      ],
      movimentos: [
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T1', Qtd: 50,
          Motorista: 'Ramos', DataRef: D('2026-09-05') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T2', Qtd: 530,
          Motorista: 'Ramos', DataRef: D('2026-09-05') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R2', TipoCaixaID: 'T1', Qtd: 100,
          Motorista: 'Outro Qualquer', DataRef: D('2026-09-06') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'C1', TipoCaixaID: 'T1', Qtd: 30,
          Motorista: 'Ramos', DataRef: D('2026-09-07') },
        /* R2 devolve parte NO MESMO DIA da remessa: e o que abre a coluna RETORNO por
           tipo na mesma linha. Em dia diferente seriam duas linhas — e isso ja esta
           coberto no bloco do painel. */
        { Tipo: 'DEVOLUCAO', OrigemID: 'R2', DestinoID: 'L1', TipoCaixaID: 'T2', Qtd: 40,
          Motorista: 'Ramos', DataRef: D('2026-09-06') },
        { Tipo: 'DEVOLUCAO', OrigemID: 'R2', DestinoID: 'L1', TipoCaixaID: 'T1', Qtd: 25,
          Motorista: 'Ramos', DataRef: D('2026-09-06') }
      ]
    };
    const f = F.fluxoPorOrigem(cen, DESDE, 90);
    const por = {}; f.linhas.forEach((l) => { por[l.id] = l; });

    /* Tres destinos a partir do mesmo galpao: tres linhas. Era isto que uma celula com
       "Caruaru, Recife, CEASA" apagava — cada caminho tem numero e cobranca proprios. */
    /* Tres destinos e cinco lancamentos em quatro dias: cinco linhas. Cada dia responde
       por si — foi assim que as remessas de um dia novo pararam de sumir dentro do total
       de um dia anterior. */
    ok(f.linhas.length === 3, 'tres destinos, tres linhas — cada um no seu dia',
      f.linhas.map((l) => l.id));

    const r1 = por['L1>R1|2026-09-05'];
    const r2 = por['L1>R2|2026-09-06'];
    const c1 = por['L1>C1|2026-09-07'];

    ok(r1.sub === '2 lançamentos',
      'a linha de baixo conta lançamentos; os tipos foram para as colunas, com a '
      + 'quantidade de cada um', r1.sub);
    ok(r1.saidaTipos.map((t) => t.caixa + ':' + t.qtd).join(' ') === 'CX G:530 CX P:50',
      'saída aberta por tipo de caixa, em ordem de nome', r1.saidaTipos);
    ok(r1.retornoTipos.length === 0,
      'sem retorno, o detalhe vem vazio — e não com zeros inventados', r1.retornoTipos);

    ok(r2.retornoTipos.map((t) => t.caixa + ':' + t.qtd).join(' ') === 'CX G:40 CX P:25',
      'retorno aberto por tipo de caixa, na mesma ordem da saída', r2.retornoTipos);
    ok(r2.retorno === 65 && r2.saida === 100,
      'e a soma dos tipos fecha com o total da coluna — voltou parte, não tudo', r2);

    /* O detalhe fica no trajeto a que pertence: as 530 CX G foram para Caruaru, e nao
       podem vazar para a linha de Recife. No modelo por local os dois destinos caiam na
       mesma linha do galpao e os tipos vinham somados. */
    ok(r2.saidaTipos.map((t) => t.caixa).join(',') === 'CX P',
      'o detalhe de um caminho não vaza para o outro', r2.saidaTipos);
    ok(c1.saida === 30 && c1.tipo === 'CLIENTE',
      'e o cliente tem a sua própria linha, com o tipo dele', c1);
  }
  console.log('\n== estoque inicial: linha propria, fora dos caminhos ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const DESDE = D('2026-09-01');
    const cen = {
      config: {},
      tipos: [{ ID: 'T1', Nome: 'CX P' }],
      usuarios: [{ ID: 'U1', Nome: 'Admin', Perfil: 'Gestor' }],
      locais: [
        { ID: 'L1', Nome: 'Matriz', Tipo: 'GALPAO' },
        { ID: 'F1', Nome: 'Filial', Tipo: 'FILIAL' },
        { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' }
      ],
      movimentos: [
        // estoque inicial da filial, que nao se move o mes inteiro
        { Tipo: 'AJUSTE', DestinoID: 'F1', TipoCaixaID: 'T1', Qtd: 700,
          UsuarioID: 'U1', DataRef: D('2026-09-02') },
        // e o da matriz, lancado em MAIO: posicao nao expira com a virada do mes
        { Tipo: 'AJUSTE', DestinoID: 'L1', TipoCaixaID: 'T1', Qtd: 1500,
          UsuarioID: 'U1', DataRef: D('2026-05-10') },
        { Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T1', Qtd: 1020,
          UsuarioID: 'U1', DataRef: D('2026-09-05') },
        { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R1', DestinoID: 'L1',
          TipoCaixaID: 'T1', Qtd: 840, UsuarioID: 'U1', DataRef: D('2026-09-09') }
      ]
    };
    const f = F.fluxoPorOrigem(cen, DESDE, 90);
    const por = {}; f.linhas.forEach((l) => { por[l.id] = l; });

    ok(por['ini:F1|2026-09-02'].inicial === 700 && por['ini:F1|2026-09-02'].saida === 0 &&
       por['ini:F1|2026-09-02'].retorno === 0,
      'o ajuste vira estoque inicial e NÃO entra em saída nem em retorno: não é viagem',
      por['ini:F1|2026-09-02']);
    ok(por['ini:F1|2026-09-02'].saldoFinal === 700,
      'sem caminho nenhum, o saldo final é o próprio estoque inicial',
      por['ini:F1|2026-09-02'].saldoFinal);
    /* O ajuste da matriz e de MAIO, fora da janela: a linha dele nao aparece. O valor
       nao se perde — ele abre o saldo corrido da primeira linha visivel, que soma os
       1.500 de maio com os 700 do ajuste do dia 02. */
    ok(!por['ini:L1|2026-05-10'],
      'o ajuste de maio não vira linha em setembro: está fora do recorte',
      Object.keys(por));
    ok(f.linhas[0].iniCorrido === 2200,
      'mas ele abre o saldo da primeira linha visível: 1.500 de maio + 700 do dia 02',
      f.linhas.map((l) => l.id + ':' + l.iniCorrido));

    ok(!!por['L1>R1|2026-09-05'],
      'e o caminho da matriz continua listado', Object.keys(por));
    ok(por['L1>R1|2026-09-05'].inicial === 0,
      'e o caminho não herda o estoque inicial da origem', por['L1>R1|2026-09-05']);
    /* A remessa e de 05/09 e a devolucao de 09/09: sao DOIS dias, logo duas linhas.
       Cada dia responde por si. */
    ok(por['L1>R1|2026-09-05'].saida === 1020 && por['L1>R1|2026-09-05'].retorno === 0,
      'o dia da remessa traz só a remessa', por['L1>R1|2026-09-05']);
    ok(por['L1>R1|2026-09-09'].retorno === 840 && por['L1>R1|2026-09-09'].saida === 0,
      'e o dia da devolução traz só ela', por['L1>R1|2026-09-09']);

    /* O `saldo` e so o par saida/retorno: dele saem o chip "Em deficit", os indicadores e
       a situacao. A linha de estoque nao e fluxo, entao o saldo dela e zero e ela nao
       aparece no deficit — senao um estoque parado viraria divida. */
    ok(por['ini:F1|2026-09-02'].saldo === 0 && por['ini:F1|2026-09-02'].situacao === 'parado' &&
       por['ini:F1|2026-09-02'].desvio === null,
      'a linha de estoque não é fluxo: saldo zero, sem desvio, fora do déficit',
      por['ini:F1|2026-09-02']);
    ok(por['L1>R1|2026-09-05'].situacao === 'ruim' &&
       por['L1>R1|2026-09-05'].desvio === 100,
      'o dia da remessa isolada fica em 100% de desvio: nada dela voltou NAQUELE dia',
      por['L1>R1|2026-09-05']);

    /* O deficit soma por CAMINHO e nao por linha: os dois dias do mesmo caminho se
       abatem, e sobra 180. Linha a linha daria 1.020, contando como perdido o que voltou
       quatro dias depois. */
    ok(f.totais.linhas === 2 && f.totais.deficit === 180,
      'dois dias de caminho, e o déficit soma por caminho: 180', f.totais);
  }
console.log('\n== galpao que RECEBE remessa: nada voltou ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const D = (iso) => new Date(iso + 'T00:00:00');
  const DESDE = D('2026-09-01');

  /* Uma remessa despachada PARA outro galpao ja apareceu na coluna RETORNO, porque a
     regra de entao era "o que entra num galpao e retorno". Nada tinha voltado: a caixa
     acabara de sair da Matriz. O rotulo segue o TIPO do lancamento, nao o lado. */
  const cen = {
    config: {},
    tipos: [{ ID: 'T1', Nome: 'CX P' }],
    usuarios: [{ ID: 'U1', Nome: 'A' }],
    locais: [
      { ID: 'G', Nome: 'Matriz', Tipo: 'GALPAO' },
      { ID: 'F', Nome: 'Filial Maceió', Tipo: 'GALPAO' },
      { ID: 'R', Nome: 'Caruaru', Tipo: 'ROTA' }
    ],
    movimentos: [
      { Tipo: 'SAIDA', OrigemID: 'G', DestinoID: 'F', TipoCaixaID: 'T1', Qtd: 350,
        UsuarioID: 'U1', DataRef: D('2026-09-05') },
      { Tipo: 'DEVOLUCAO', Status: 'CONFIRMADO', OrigemID: 'R', DestinoID: 'G',
        TipoCaixaID: 'T1', Qtd: 120, UsuarioID: 'U1', DataRef: D('2026-09-08') }
    ]
  };
  const por = {};
  F.fluxoPorOrigem(cen, DESDE, 90).linhas.forEach((l) => { por[l.id] = l; });

  ok(por['G>F|2026-09-05'].saida === 350 && por['G>F|2026-09-05'].retorno === 0,
    'remessa recebida por um galpão é SAÍDA — nada voltou, a caixa acabou de sair',
    por['G>F|2026-09-05']);
  ok(por['G>F|2026-09-05'].saidaTipos.length === 1 && por['G>F|2026-09-05'].retornoTipos.length === 0,
    'e o detalhe por tipo acompanha o mesmo lado', por['G>F|2026-09-05']);
  ok(por['G>F|2026-09-05'].origens.join(',') === 'Matriz' &&
     por['G>F|2026-09-05'].destinos.join(',') === 'Filial Maceió',
    'o caminho é Matriz → Filial: quem recebeu a remessa é o destino', por['G>F|2026-09-05']);

  /* A devolucao da rota abre o caminho no sentido da IDA que ela desfaz: Matriz → Caruaru
     com saida zero. Sem isso o retorno viraria uma linha "Caruaru → Matriz" que ninguem
     cruzaria com a remessa correspondente quando ela aparecesse. */
  ok(por['G>R|2026-09-08'].saida === 0 && por['G>R|2026-09-08'].retorno === 120,
    'devolução sem remessa no período abre o caminho no sentido da ida', por['G>R|2026-09-08']);
  ok(por['G>R|2026-09-08'].origens.join(',') === 'Matriz' &&
     por['G>R|2026-09-08'].destinos.join(',') === 'Caruaru',
    'e no sentido certo: a rota é o destino, ainda que só tenha devolvido', por['G>R|2026-09-08']);
}
console.log('\n== reler a propria permissao ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const us = [
    { ID: 'U005', Nome: 'Nestor', Perfil: 'Gerente', AcessoPainel: true, Ativo: true,
      Email: 'nestor@x.com', Telefone: '81999998888', CPF: '12345678900',
      CNH: '987654321', Senha: 'segredo', Pin: '1234', SenhaHash: 'hash',
      Abas: ['pgRetornos', 'pgPainel'] },
    { ID: 'U009', Nome: 'Fora', Perfil: 'Motorista', AcessoPainel: false, Ativo: false }
  ];

  const r = F.meuAcesso(us, 'U005');
  ok(r && r.id === 'U005' && r.acessoPainel === true &&
     r.abas.join(',') === 'pgRetornos,pgPainel',
    'a permissão relida vem do cadastro, não da foto do login', r);

  /* Quem nao existe e quem esta inativo querem dizer a MESMA coisa para quem chama: nao
     ha mais sessao. Dois retornos diferentes fariam duas checagens na tela, e a segunda
     seria esquecida. */
  ok(F.meuAcesso(us, 'U009') === null, 'quem está inativo não tem mais sessão');
  ok(F.meuAcesso(us, 'U999') === null, 'nem quem não existe');
  ok(F.meuAcesso(us, '') === null && F.meuAcesso(us, null) === null,
    'e id vazio não devolve a sessão de ninguém — devolvendo a primeira da lista, ' +
    'qualquer um entraria como outra pessoa');

  /* A rota e publica, como todo o resto da API hoje. Entao o que ela devolve importa: */
  const bruto = JSON.stringify(r);
  const pessoais = ['nestor@x.com', '81999998888', '12345678900', '987654321',
                    'segredo', '1234', 'hash'];
  ok(pessoais.every((v) => bruto.indexOf(v) < 0),
    'e ela não leva e-mail, telefone, documento nem senha — é estritamente menos do que ' +
    'a `equipe` já devolve', pessoais.filter((v) => bruto.indexOf(v) >= 0));

  /* A MESMA forma do login. Se divergir, a sessão renovada perde um campo e a tela passa
     a decidir com menos informação do que tinha — calada. */
  ok(Object.keys(r).sort().join(' ') ===
     Object.keys(F.sessaoDe(us[0])).sort().join(' '),
    'a sessão relida tem os mesmos campos da do login', Object.keys(r).sort());

  const rota = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  ok(/case 'meuAcesso':/.test(rota) && /L\.meuAcesso\(d\.usuarios, p\.id\)/.test(rota),
    'e a rota existe, passando o id pedido — sem ela a regra não chega à tela');
}

console.log('\n== painel restrito: so os proprios lancamentos ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const dados = {
    movimentos: [{ ID: 'M1', UsuarioID: 'U008' }, { ID: 'M2', UsuarioID: 'U005' },
                 { ID: 'M3', UsuarioID: 'U008' }],
    locais: [{ ID: 'L1' }], tipos: [{ ID: 'T1' }]
  };

  ok(F.recorteProprios(dados, 'U008').movimentos.map((m) => m.ID).join(',') === 'M1,M3',
    'o recorte deixa só o que a pessoa lançou');
  /* A permissao pode citar VARIOS usuarios: "ela ve os dela e os do fulano". A lista
     chega como texto separado por virgula, que e como a tela manda. */
  ok(F.recorteProprios(dados, 'U008,U005').movimentos.length === 3 &&
     F.recorteProprios(dados, ['U005']).movimentos.map((m) => m.ID).join(',') === 'M2',
    'e aceita VÁRIOS usuários, como lista ou como texto separado por vírgula — é assim ' +
    'que "ela vê os dela e os do fulano" se diz');
  ok(F.recorteProprios(dados, '__ninguem__').movimentos.length === 0,
    'e um recorte que não casa com ninguém devolve nada — é assim que "não vê ' +
    'lançamento nenhum" se diz, porque pedir vazio pediria TODOS');

  /* De quem ela ve, resolvido num lugar so. */
  ok(F.usuariosVistosDe({ ID: 'U1' }).length === 0,
    'sem lista, vê de todos — a convenção do projeto');
  ok(F.usuariosVistosDe({ ID: 'U1', UsuariosVistos: ['U2', 'U3'] }).join(',') === 'U2,U3',
    'com lista, vê dos marcados');
  /* A marca velha `so_proprios` continua entendida ate a migracao rodar. */
  ok(F.usuariosVistosDe({ ID: 'U1', SoProprios: true }).join(',') === 'U1',
    'e quem tinha a marca antiga de "só os próprios" vê a si mesmo, até a migração ' +
    'converter — senão a escolha dele sumiria calada entre o deploy e a migração');
  /* Vazio devolve tudo — a convenção do projeto, e a única segura: o contrário deixaria
     todo mundo com o painel vazio no dia em que a coluna nasceu. */
  ok(F.recorteProprios(dados, '').movimentos.length === 3 &&
     F.recorteProprios(dados, null).movimentos.length === 3,
    'e sem recorte devolve tudo — invertido, o deploy esvaziaria o painel de todo mundo');
  ok(F.recorteProprios(dados, 'U008').locais.length === 1,
    'os locais e os tipos seguem inteiros: o recorte é dos LANÇAMENTOS, não do cadastro');
  ok(dados.movimentos.length === 3,
    'e o original não é alterado — o recorte copia, senão a próxima chamada da mesma ' +
    'requisição já veria os dados mutilados');

  /* ================= POR ONDE A CARGA PASSOU =================
   *
   * O ESCRITORIO MANDOU O CASO: o gerente da matriz manda caixas para a Filial Maceio, e
   * o gerente de Maceio precisa ver o que chegou para ELE. Marcando o gerente da matriz
   * em "de quem ela ve os lancamentos", ele passava a ver TUDO o que aquela pessoa
   * lanca — Joao Pessoa, Ceasa, Recife, Caruaru. A peneira que existia era de QUEM
   * LANCOU, e a pergunta da filial e outra.
   *
   * O CENARIO E O DA TELA, com as quatro linhas que separam as hipoteses: uma carga do
   * Nestor para Maceio, uma do Nestor para OUTRA filial, o retorno do proprio
   * Wellington, e uma viagem de terceiro que nao toca nenhum dos dois. */
  const MOV_U = [
    { ID: 'U-m1', UsuarioID: 'U-nestor', OrigemID: 'L-matriz', DestinoID: 'L-maceio' },
    { ID: 'U-m2', UsuarioID: 'U-nestor', OrigemID: 'L-matriz', DestinoID: 'L-jp' },
    { ID: 'U-m3', UsuarioID: 'U-well', OrigemID: 'L-maceio', DestinoID: 'L-matriz' },
    { ID: 'U-m4', UsuarioID: 'U-outro', OrigemID: 'L-matriz', DestinoID: 'L-caruaru' }
  ];
  const dadosU = { movimentos: MOV_U, locais: [{ ID: 'L-matriz' }, { ID: 'L-maceio' }],
                   tipos: [{ ID: 'T1' }] };
  const ids = (d) => d.movimentos.map((m) => m.ID).join(',');

  ok(ids(F.recorteLocais(dadosU, { Unidades: ['L-maceio'] })) === 'U-m1,U-m3',
    'o gerente da filial v\u00ea s\u00f3 o que TOCA a filial dele \u2014 a carga que veio para ele e ' +
    'o retorno que ele mandou, e nem uma linha de Jo\u00e3o Pessoa ou de Caruaru',
    ids(F.recorteLocais(dadosU, { Unidades: ['L-maceio'] })));

  /* AS DUAS PONTAS CONTAM, e esta e' a linha que prova: `U-m3` tem Maceio na ORIGEM.
     Peneirando so' pelo destino, o gerente veria o que chegou e nao veria o proprio
     retorno — metade da operacao dele, e a metade que ele precisa conferir. */
  ok(ids(F.recorteLocais(dadosU, { Unidades: ['L-maceio'] })).indexOf('U-m3') >= 0,
    'e as DUAS pontas contam: o retorno que SAIU de Macei\u00f3 tamb\u00e9m \u00e9 dele \u2014 s\u00f3 pelo ' +
    'destino, ele veria o que chegou e n\u00e3o veria o pr\u00f3prio retorno');

  /* DUAS UNIDADES na lista: quem cuida de duas casas ve' as duas. Com uma so' no
     cenario, somar e sobrescrever a lista davam a mesma resposta. */
  ok(ids(F.recorteLocais(dadosU, { Unidades: ['L-maceio', 'L-jp'] })) === 'U-m1,U-m2,U-m3',
    'e quem cuida de DUAS casas v\u00ea as duas \u2014 a lista soma, n\u00e3o escolhe uma',
    ids(F.recorteLocais(dadosU, { Unidades: ['L-maceio', 'L-jp'] })));

  /* VAZIA LIBERA, como toda lista de permissao daqui. Invertida, o dia do deploy
     deixaria TODO usuario com a tela vazia, e ninguem relacionaria isso com a coluna
     nova. */
  ok(F.recorteLocais(dadosU, { Unidades: [] }).movimentos.length === 4 &&
     F.recorteLocais(dadosU, {}).movimentos.length === 4 &&
     F.recorteLocais(dadosU, null).movimentos.length === 4,
    'e sem unidade marcada ela v\u00ea a opera\u00e7\u00e3o inteira \u2014 invertido, o deploy esvaziaria ' +
    'a tela de todo mundo e ningu\u00e9m ligaria isso a uma coluna nova');

  ok(F.recorteLocais(dadosU, { Unidades: ['L-maceio'] }).locais.length === 2 &&
     dadosU.movimentos.length === 4,
    'o cadastro segue inteiro e o original n\u00e3o \u00e9 alterado \u2014 o recorte \u00e9 dos ' +
    'LAN\u00c7AMENTOS, e copia em vez de mutilar o que a pr\u00f3xima chamada vai ler');

  /* ---- AS DUAS PENEIRAS SE SOMAM ----
   *
   * E' por isso que elas viraram UMA chamada: eram duas para lembrar de por em sete
   * rotas, e a esquecida numa delas e' o defeito que este projeto ja' cometeu — a rota
   * `movimentos` passou meses sem recorte porque quem o mandava era a tela, e a tela
   * esquecia. */
  const USERS_U = [
    { ID: 'U-well', Nome: 'Wellington', UsuariosVistos: ['U-nestor', 'U-well'],
      Unidades: ['L-maceio'] },
    { ID: 'U-nestor', Nome: 'Nestor' },
    { ID: 'U-outro', Nome: 'Outro' }
  ];
  ok(ids(F.recorteLancamentos(dadosU, USERS_U, 'U-well')) === 'U-m1,U-m3',
    'as duas peneiras se somam: Wellington v\u00ea os lan\u00e7amentos do Nestor QUE PASSARAM ' +
    'por Macei\u00f3 \u2014 s\u00f3 pela de quem lan\u00e7ou, a de Jo\u00e3o Pessoa vinha junto',
    ids(F.recorteLancamentos(dadosU, USERS_U, 'U-well')));

  ok(ids(F.recorteLancamentos(dadosU, USERS_U, 'U-nestor')) === 'U-m1,U-m2,U-m3,U-m4',
    'e quem n\u00e3o tem nenhuma das duas marcadas continua vendo a opera\u00e7\u00e3o inteira \u2014 ' +
    'sem este controle, as provas acima passariam com uma fun\u00e7\u00e3o que esconde tudo de ' +
    'todo mundo', ids(F.recorteLancamentos(dadosU, USERS_U, 'U-nestor')));

  /* ---- E A FIACAO: A PECA EXISTE E ALGO CHEGA NELA ----
   *
   * E' a assinatura deste projeto. A funcao certa e nenhuma rota chamando-a nao quebra
   * prova nenhuma que a chame direto. */
  (function () {
    var rotaU = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    var sobrou = (rotaU.match(/L\.recorteProprios\(/g) || []).length;
    /* NOVE: painel, pendentes, movimentos, meusLancamentos, conciliacao, lixeira,
       extrato, aConferir e documento — esta ultima entrega o endereco do canhoto, e
       sem o recorte um id adivinhado traria o documento de uma unidade que aquela
       pessoa nao pode nem ver na tabela.
       As sete primeiras sao: painel, pendentes, movimentos, meusLancamentos,
       conciliacao, lixeira e extrato — esta ultima e a fila da doca, e sem o recorte quem so' ve'
       a unidade dele passaria a contar a carga da unidade do vizinho. Eram seis, e a de fora era `meusLancamentos` — o nome dela me enganou:
       ela nao e' "so' os meus", honra `UsuariosVistos` como as outras, e e' por ela que
       a tela Lancamentos do app de campo le'. O gerente de Maceio continuava vendo
       Natal, Caruaru e Recife ali, com a permissao marcada.
       A CONTA E ESCRITA DE PROPOSITO: ela e' o tropeco que obriga quem acrescenta uma
       rota de listagem a lembrar do recorte. */
    ok((rotaU.match(/L\.recorteLancamentos\(/g) || []).length === 9,
      'as rotas que listam lan\u00e7amento chamam `recorteLancamentos` \u2014 a pe\u00e7a existiria ' +
      'e nada chegaria nela, e a filial seguiria vendo a opera\u00e7\u00e3o inteira',
      (rotaU.match(/L\.recorteLancamentos\(/g) || []).length);
    /* E NAO SOBROU NENHUMA. A excecao de rota virou uma regra dentro do recorte — o
       que a PROPRIA pessoa lancou passa sempre —, e com isso `recorteProprios` nao e'
       mais chamada por rota nenhuma. E' a forma mais forte desta prova: a rota que
       nascer amanha nao tem como usar a peneira fraca por descuido, porque ela nao
       esta' mais ao alcance de um copiar-e-colar da rota vizinha. */
    ok(sobrou === 0,
      'e NENHUMA rota ficou com o recorte antigo \u2014 a prote\u00e7\u00e3o do que a pr\u00f3pria ' +
      'pessoa lan\u00e7ou mudou de lugar: ela \u00e9 do LAN\u00c7AMENTO, dentro de `recorteLocais`, e ' +
      'vale em toda tela sem ningu\u00e9m ter de lembrar', sobrou);
  })();

  /* ---- E O QUE A PROPRIA PESSOA LANCOU NUNCA SOME DA TELA DELA ----
   *
   * A primeira versao protegia isso tirando a rota `meusLancamentos` do recorte. Estava
   * errado por dois motivos, os dois vistos na tela:
   *
   *   O NOME DA ROTA ENGANA — ela honra `UsuariosVistos` como as outras, e e' por ela
   *   que a tela Lancamentos do app de campo le'. Fora do recorte, aquela tela inteira
   *   passava por fora da permissao.
   *
   *   E EXCECAO DE ROTA E' A FORMA ERRADA DE DIZER ISSO. O que se protege nao e' uma
   *   TELA, e' um LANCAMENTO. Dito como excecao de rota, vale demais numa e de menos
   *   nas outras — e some no dia em que alguem escrever a oitava.
   *
   * O CENARIO: `U-m4` foi lancado por `U-outro` e nao toca Maceio; aqui ele e' lancado
   * pelo PROPRIO Wellington, e tem de passar. */
  const MOV_D = MOV_U.slice(0, 3).concat([
    { ID: 'U-m5', UsuarioID: 'U-well', OrigemID: 'L-matriz', DestinoID: 'L-caruaru' }
  ]);
  const dadosD = { movimentos: MOV_D, locais: dadosU.locais, tipos: dadosU.tipos };

  ok(ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] })) === 'U-m1,U-m3',
    'sem dizer de quem \u00e9 a tela, o recorte peneira tudo \u2014 \u00e9 assim que as contas do ' +
    'painel o chamam: l\u00e1 n\u00e3o h\u00e1 "quem lan\u00e7ou" a proteger, h\u00e1 um recorte a aplicar',
    ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] })));

  ok(ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] }, 'U-well')) === 'U-m1,U-m3,U-m5',
    'e o que a PR\u00d3PRIA pessoa lan\u00e7ou passa sempre, mesmo fora da unidade dela \u2014 ' +
    'ela fez aquele lan\u00e7amento, e sem isto ele sumiria da tela dela sem ela ter onde ' +
    'procur\u00e1-lo',
    ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] }, 'U-well')));

  ok(ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] }, 'U-nestor')) === 'U-m1,U-m2,U-m3',
    'e o dono \u00e9 UM s\u00f3: dizendo que a tela \u00e9 do Nestor, \u00e9 o Natal dele que entra e o ' +
    'Caruaru do Wellington que fica de fora \u2014 a guarda \u00e9 por autor, e n\u00e3o um passe ' +
    'livre para todo mundo',
    ids(F.recorteLocais(dadosD, { Unidades: ['L-maceio'] }, 'U-nestor')));

  /* E A CHAMADA UNICA JA' PASSA O DONO. Sem isso, a funcao estaria certa e a rota
     continuaria peneirando o lancamento da propria pessoa. */
  const USERS_D = [
    { ID: 'U-well', Nome: 'Wellington', UsuariosVistos: ['U-nestor', 'U-well'],
      Unidades: ['L-maceio'] },
    { ID: 'U-nestor', Nome: 'Nestor' }, { ID: 'U-outro', Nome: 'Outro' }
  ];
  ok(ids(F.recorteLancamentos(dadosD, USERS_D, 'U-well')) === 'U-m1,U-m3,U-m5',
    'e a chamada \u00fanica j\u00e1 passa o dono \u2014 sem isso a fun\u00e7\u00e3o estaria certa e a rota ' +
    'continuaria sumindo com o lan\u00e7amento da pr\u00f3pria pessoa',
    ids(F.recorteLancamentos(dadosD, USERS_D, 'U-well')));

  /* DE QUEM A PESSOA VE OS LANCAMENTOS: decidido no CADASTRO, e nao no pedido.
   *
   * Antes quem montava o recorte era a tela: ela lia a permissao da sessao e a mandava
   * junto; o servidor obedecia. Cinco telas mandavam e uma esquecia — a lista de
   * Movimentos —, e por ela um motorista habilitado a ver apenas os proprios lancamentos
   * lia a operacao inteira. Nenhuma prova aqui podia pegar isso: a rota estava certa.
   *
   * ENTAO A PERGUNTA MUDOU. Nao e mais "a rota aplica o recorte que pediram?", e sim
   * "quem pergunta como fulano recebe o que fulano pode ver?". Rodado contra as rotas
   * de verdade, com o banco falso. */
  const ondeVi = (r) => (r.movimentos || []).map((m) => m.usuario).sort().join(',');

  /* EM DOIS PASSOS, e nao num: "vejo so os meus" cita um id que ainda nao existe na hora
     de criar. Quem resolve isso na tela e o marcador `__EU__`, que tem teste proprio
     logo abaixo; aqui o que se quer e o recorte ja gravado. */
  await POST({ acao: 'salvarUsuario',
    registro: { Nome: 'So o Dele', Perfil: 'MOTORISTA', PIN: '778899',
                Operacoes: ['SAIDA'] } });
  let equipeAgora = (await GET({ acao: 'equipe' })).usuarios;
  let soDele = equipeAgora.filter((u) => u.Nome === 'So o Dele')[0];
  if (soDele) {
    await POST({ acao: 'salvarUsuario', registro: { ID: soDele.ID, Nome: soDele.Nome,
      Perfil: soDele.Perfil, Operacoes: ['SAIDA'], UsuariosVistos: [soDele.ID] } });
    equipeAgora = (await GET({ acao: 'equipe' })).usuarios;
    soDele = equipeAgora.filter((u) => u.Nome === 'So o Dele')[0];
  }
  ok(!!soDele && soDele.UsuariosVistos.length === 1 && soDele.UsuariosVistos[0] === soDele.ID,
    'a conferência criou alguém que vê apenas os lançamentos dele mesmo — sem isso as ' +
    'provas abaixo não teriam recorte nenhum para medir', soDele && soDele.UsuariosVistos);

  await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: 'L001', destinoId: 'L003',
    itens: [{ tipoId: 'T001', qtd: 7 }], dataRef: dia(0), usuarioId: 'U002',
    clientKey: 'k-recorte-1' });
  await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: 'L001', destinoId: 'L003',
    itens: [{ tipoId: 'T001', qtd: 9 }], dataRef: dia(0), usuarioId: soDele.ID,
    clientKey: 'k-recorte-2' });

  const comoEle = await GET({ acao: 'movimentos', quem: soDele.ID, limit: 500, teste: 'todos' });
  ok(ondeVi(comoEle) === 'So o Dele',
    'quem só pode ver os próprios lançamentos recebe só os dele — foi exatamente isto ' +
    'que a tela de Movimentos não fazia, e por ela um motorista lia a operação inteira',
    ondeVi(comoEle));

  const comoAdmin = await GET({ acao: 'movimentos', quem: 'U001', limit: 500, teste: 'todos' });
  ok(comoAdmin.movimentos.length > comoEle.movimentos.length,
    'e quem vê todo mundo continua vendo — o recorte é do cadastro dela, não um muro ' +
    'para todos', [comoAdmin.movimentos.length, comoEle.movimentos.length]);

  /* SEM IDENTIDADE, NADA. Esta é a linha que impede o defeito de voltar por outra porta:
     enquanto "não disse quem sou" quisesse dizer "me dê tudo", bastava uma tela nova
     esquecer de dizer — e foi assim da primeira vez. */
  const anonimo = await GET({ acao: 'movimentos', quem: '', limit: 500, teste: 'todos' });
  ok((anonimo.movimentos || []).length === 0,
    'e um pedido SEM identidade não recebe lançamento nenhum — devolver tudo ali faria ' +
    'de qualquer esquecimento futuro o mesmo vazamento', (anonimo.movimentos || []).length);
  const fantasma = await GET({ acao: 'movimentos', quem: 'U-NAO-EXISTE', limit: 500 });
  ok((fantasma.movimentos || []).length === 0,
    'nem um pedido em nome de um cadastro que não existe');

  /* O INTERRUPTOR DE CIMA: "ve os lancamentos?" com NAO. Ele e outra pergunta, anterior
     a "de quem" — e sem uma linha propria cairia na convencao do vazio, que quer dizer
     TODOS. Ou seja: desligar o interruptor mostraria a operacao inteira, que e o oposto
     exato do que quem desliga quis dizer. */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Nao Ve Nada', Perfil: 'MOTORISTA',
    PIN: '112233', VerLancamentos: 'NAO' } });
  const mudo = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Nao Ve Nada')[0];
  ok(!!mudo && mudo.VerLancamentos === false,
    'a conferência criou alguém com "vê os lançamentos?" em NÃO — sem isso a prova ' +
    'abaixo mediria outra coisa', mudo && mudo.VerLancamentos);
  const nada = await GET({ acao: 'movimentos', quem: mudo.ID, limit: 500, teste: 'todos' });
  ok((nada.movimentos || []).length === 0,
    'e quem não vê lançamentos não recebe nenhum — sem uma linha só para este caso ele ' +
    'cairia na convenção do vazio, que quer dizer TODOS: desligar o interruptor ' +
    'mostraria a operação inteira', (nada.movimentos || []).length);

  /* O PEDIDO NAO OPINA. Mandar o recorte antigo junto nao alarga nada: quem decide e o
     cadastro. Enquanto o `so` valia, a tela — ou qualquer pedido montado a mao — escolhia
     o proprio recorte. */
  const comSo = await GET({ acao: 'movimentos', quem: soDele.ID, so: '', limit: 500,
    teste: 'todos' });
  ok(ondeVi(comSo) === 'So o Dele',
    'e o recorte que o PEDIDO mandar não vale — quem decide é o cadastro, e enquanto ' +
    'valia bastava montar o pedido à mão para ver o que não se pode', ondeVi(comSo));

  /* E VALE PARA TUDO QUE SAI DOS LANCAMENTOS, e nao so para a lista: filtrando uma tela
     e nao as outras, a pessoa ve o total do galpao inteiro nos cartoes em cima de uma
     tabela de tres linhas. */
  const painelDele = await GET({ acao: 'painel', quem: soDele.ID, teste: 'todos' });
  const painelAdmin = await GET({ acao: 'painel', quem: 'U001', teste: 'todos' });
  ok(painelDele.painel.kpis.saidasMes < painelAdmin.painel.kpis.saidasMes,
    'o Painel obedece ao mesmo recorte — os cartões somam os lançamentos, e somá-los ' +
    'sem peneira contaria o que a tabela esconde',
    [painelDele.painel.kpis.saidasMes, painelAdmin.painel.kpis.saidasMes]);
  const painelAnonimo = await GET({ acao: 'painel', quem: '', teste: 'todos' });
  ok(painelAnonimo.painel.kpis.saidasMes === 0,
    'e sem identidade o Painel também não soma nada');
  const lixoDele = await GET({ acao: 'lixeira', quem: '', limit: 300 });
  ok((lixoDele.movimentos || []).length === 0,
    'e a lixeira idem — ela é o avesso da lista, e uma peneira que valesse só de um ' +
    'lado transformaria a tela que restaura num jeito de ver o que a outra esconde');

  /* O corte de linhas do servidor vem DEPOIS do filtro, então filtrar na tela mostraria
     só os lançamentos da pessoa que couberam nas primeiras N linhas. */
  const muitos = { movimentos: [], locais: [], tipos: [] };
  for (let i = 0; i < 20; i++) {
    muitos.movimentos.push({ ID: 'X' + i, UsuarioID: i % 2 ? 'U005' : 'U008',
      Tipo: 'SAIDA', DataRef: new Date(), OrigemID: 'L1', DestinoID: 'L2', Qtd: 1 });
  }
  const dela = F.listaMovimentos(muitos.movimentos, [], [], [], { usuario: 'U008', limit: 5 });
  ok(dela.length === 5 && dela.every((m) => m.usuario !== 'U005'),
    'o filtro por usuário acontece ANTES do corte de linhas — depois, ela veria só os ' +
    'poucos dela que sobrassem no corte', dela.length);

  ok(F.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y', SoProprios: true }).soProprios === true &&
     F.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y' }).soProprios === false,
    'a sessão leva o recorte para a tela — sem isso ela não saberia pedir');

  /* O usuario NOVO ainda nao tem id quando o formulario e salvo, entao "apenas os
     lancamentos dele mesmo" nao tem como citar um id na tela. O formulario manda o
     marcador `__EU__`, e quem o troca pelo id e o SERVIDOR — o unico ponto que conhece o
     id final nos dois casos: o que ja existe e o que acabou de nascer. */
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  /* A CONDICAO, e nao a palavra: `__EU__` aparece tambem no comentario que explica o
     marcador, entao procura-la solta acha o comentario de um `if (false)`. */
  ok(/dados\.UsuariosVistos\.indexOf\('__EU__'\) >= 0/.test(rotas) &&
     /L\.novoId\('U', d\.usuarios\)/.test(rotas),
    'o marcador "ela mesma" vira id no servidor, que é quem conhece o id do usuário ' +
    'recém-criado — trocado na tela, o novo ficaria com uma lista citando um id que ' +
    'ninguém atribuiu ainda');
  ok(/dados\.ID = dados\.ID \|\| meuId/.test(rotas),
    'e o id escolhido é o MESMO que o registro vai levar — dois ids diferentes deixariam ' +
    'a pessoa vendo os lançamentos de ninguém');

  const migra = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');
  ok(/so_proprios boolean not null default false/.test(migra),
    'e a coluna nasce em `false`: o padrão é ver tudo, como era antes da coluna existir');

  /* O PADRAO de "ve lancamentos" e SIM, dos dois lados — no banco e na leitura da sessao.
     Qualquer um dos dois invertido tira o lancamento de todo mundo no dia do deploy, que
     e o mesmo desastre que a convencao "lista vazia = todos" existe para evitar. */
  ok(/ver_lancamentos boolean not null default true/.test(migra),
    'a coluna "vê lançamentos" nasce LIGADA — desligada, o deploy tiraria a aba de todo ' +
    'mundo de uma vez');
  ok(F.sessaoDe({ ID: 'U1', Nome: 'x', Perfil: 'y' }).verLancamentos === true,
    'e sem o campo a sessão diz que vê — é `!== false`, e não `=== true`: o registro ' +
    'antigo não tem a coluna, e `=== true` deixaria todos eles sem lançamentos');
  ok(F.sessaoDe({ ID: 'U1', Nome: 'x', Perfil: 'y', VerLancamentos: false })
       .verLancamentos === false,
    'e com o campo em não, diz que não vê');

  /* A migracao converte quem estava na marca antiga. Sem isso a escolha sumiria calada:
     a coluna velha continuaria la e ninguem mais a leria. */
  ok(/update public\.usuarios set usuarios_vistos = jsonb_build_array\(id\)/.test(migra) &&
     /where so_proprios = true/.test(migra),
    'e a migração converte quem estava em "só os próprios" para a lista nova — sem isso ' +
    'a escolha dele sumiria calada, com a coluna velha parada no banco');
}

console.log('\n== quais abas do painel a pessoa ve ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));

  /* QUINZE. As três de SISTEMA — Instruções, Vídeo Tutorial e Manual de Uso — não
     mostram dado de operação: elas explicam o sistema. Estão aqui porque é ESTE
     catálogo que enche a lista de abas do formulário — fora dele, não haveria como
     concedê-las a ninguém, e elas nasceriam invisíveis para sempre. */
  ok(F.ABAS.length === 15 && F.ABAS[0].ID === 'pgRetornos',
    'a lista de abas mora no servidor, uma so para o formulario e para a tela',
    F.ABAS.map((a) => a.ID));
  /* Ajustes e Cadastros vem marcadas como SENSIVEIS na propria lista. Deixar isso
     escrito so na tela faria a regra viver em dois lugares.

     `sensivel` nao quer dizer "so admin" — o administrador concede as duas a quem
     quiser. Quer dizer "so por marca EXPLICITA": elas ficam fora do "nada marcado =
     todas", porque uma da o cadastro de usuarios e a outra mexe no saldo. */
  ok(F.ABAS.filter((a) => a.sensivel).map((a) => a.ID).join(',') === 'pgLancar,pgCadastros',
    'Ajustes e Cadastros vêm marcadas como sensíveis na lista — só entram por marca ' +
    'explícita, nunca pelo padrão',
    F.ABAS.filter((a) => a.sensivel).map((a) => a.ID));
  ok(!F.ABAS.some((a) => a.soAdmin),
    'e nenhuma é mais "só do Admin": a trava por perfil saiu a pedido de quem usa');

  const semLista = { Nome: 'A' };
  ok(!F.podeAba(semLista, 'pgMovimentos') && !F.podeAba(semLista, 'pgExtrato'),
    'sem lista, nenhuma aba — marcar é conceder. O ADMIN é a exceção, e ela mora na ' +
    'tela (`abasPermitidas`), não aqui: trancá-lo fora do próprio cadastro não teria ' +
    'como ser desfeito por ninguém');
  ok(!F.podeAba({ Abas: [] }, 'pgPainel'),
    'e lista vazia de verdade também, não só o campo ausente');

  const so = { Nome: 'Conferente', Abas: ['pgRetornos', 'pgExtrato'] };
  ok(F.podeAba(so, 'pgRetornos') && F.podeAba(so, 'pgExtrato'),
    'quem tem lista vê o que está nela');
  ok(!F.podeAba(so, 'pgMovimentos') && !F.podeAba(so, 'pgPainel'),
    'e não vê o que ficou de fora');

  const ses = F.sessaoDe({ ID: 'U1', Nome: 'A', Perfil: 'Gestor', Abas: ['pgRetornos'] });
  ok(ses.abas.join(',') === 'pgRetornos',
    'a sessão leva a lista para a tela — é dela que a peneira se guia', ses.abas);
  ok(F.sessaoDe({ ID: 'U2', Nome: 'B', Perfil: 'Gestor' }).abas.length === 0,
    'e quem não tem restrição leva a lista vazia, que quer dizer todas');
}

console.log('\n== quem lanca saida, quem lanca retorno ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));

  // De que operacao e cada tipo de lancamento
  ok(F.operacaoDoTipo('SAIDA') === 'SAIDA' && F.operacaoDoTipo('TRANSFERENCIA') === 'SAIDA',
    'remessa e transferência são as duas a operação de saída',
    [F.operacaoDoTipo('SAIDA'), F.operacaoDoTipo('TRANSFERENCIA')]);
  ok(F.operacaoDoTipo('DEVOLUCAO') === 'RETORNO',
    'devolução é a operação de retorno', F.operacaoDoTipo('DEVOLUCAO'));
  /* Ajuste e perda nascem no escritório, não no celular. Se caíssem sob esta lista, um
     administrador com "só retorno" marcado ficaria trancado fora do próprio ajuste. */
  ok(F.operacaoDoTipo('AJUSTE') === '' && F.operacaoDoTipo('PERDA') === '',
    'ajuste e perda não são operação de campo — ficam fora desta permissão',
    [F.operacaoDoTipo('AJUSTE'), F.operacaoDoTipo('PERDA')]);

  // A convenção: vazia = nenhuma
  const semLista = { Nome: 'A' };
  ok(!F.podeOperacao(semLista, 'SAIDA') && !F.podeOperacao(semLista, 'RETORNO'),
    'sem lista, nenhuma operação: a pessoa não lança no app até ser marcada');
  ok(!F.podeOperacao({ Operacoes: [] }, 'SAIDA'),
    'e lista vazia de verdade também, não só o campo ausente');

  const soRetorno = { Nome: 'Conferente', Operacoes: ['RETORNO'] };
  ok(!F.podeOperacao(soRetorno, 'SAIDA') && F.podeOperacao(soRetorno, 'RETORNO'),
    'quem só faz retorno é recusado na saída e aceito no retorno');

  const soSaida = { Nome: 'Expedição', Operacoes: ['SAIDA'] };
  ok(F.podeOperacao(soSaida, 'SAIDA') && !F.podeOperacao(soSaida, 'RETORNO'),
    'e o contrário vale igual — a permissão não tem lado preferido');

  // o ajuste passa por qualquer um: operacao '' nao e governada por esta lista
  ok(F.podeOperacao(soRetorno, '') === true,
    'o que não é operação de campo passa por qualquer permissão');

  // A sessao leva a lista para o celular
  const ses = F.sessaoDe({ ID: 'U1', Nome: 'A', Perfil: 'Conferente', Operacoes: ['RETORNO'] });
  ok(ses.operacoes.join(',') === 'RETORNO',
    'a sessão leva a lista para o app — é dela que as abas se guiam', ses.operacoes);
  ok(F.sessaoDe({ ID: 'U2', Nome: 'B', Perfil: 'Gestor' }).operacoes.length === 0,
    'e quem não tem restrição leva a lista vazia, que quer dizer as duas');

  /* A lista de operações mora num lugar só: o formulário do cadastro, as abas e a recusa
     na gravação leem a MESMA. Duas cópias divergiriam no primeiro nome novo. */
  ok(F.OPERACOES.length === 2 &&
     F.OPERACOES.map((o) => o.ID).join(',') === 'SAIDA,RETORNO',
    'a lista servida ao formulário é a mesma que a regra usa', F.OPERACOES);
}

console.log('\n== filtrar por tipo de caixa e por sentido ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const D = (iso) => new Date(iso + 'T00:00:00');
  const locais = [{ ID: 'L1', Nome: 'Matriz' }, { ID: 'R1', Nome: 'Caruaru' }];
  const tipos = [{ ID: 'P', Nome: 'CX P' }, { ID: 'G', Nome: 'CX G' }];
  const users = [{ ID: 'U1', Nome: 'Nestor' }];
  let seq = 0;
  const mov = (tipo, cx, q) => ({
    ID: 'M' + (++seq), Tipo: tipo, OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: cx,
    Qtd: q, UsuarioID: 'U1', Status: 'CONFIRMADO',
    DataRef: D('2026-09-0' + seq), DataHora: D('2026-09-0' + seq)
  });
  const movs = [
    mov('SAIDA', 'P', 10),           // M1
    mov('SAIDA', 'G', 20),           // M2
    mov('DEVOLUCAO', 'P', 5),        // M3
    mov('TRANSFERENCIA', 'G', 30),   // M4
    mov('PERDA', 'P', 2),            // M5
    mov('AJUSTE', 'G', 7)            // M6
  ];
  const ids = (p) => F.listaMovimentos(movs, locais, tipos, users, p)
    .map((m) => m.id).sort().join(',');

  ok(ids({}) === 'M1,M2,M3,M4,M5,M6', 'sem filtro, vem tudo', ids({}));

  ok(ids({ caixa: 'P' }) === 'M1,M3,M5',
    'filtrar por tipo de caixa pega o tipo em qualquer tipo de movimento', ids({ caixa: 'P' }));

  // O sentido e o GRUPO: saida traz remessa e transferencia, que o filtro Tipo so pegaria
  // uma de cada vez.
  ok(ids({ fluxo: 'SAIDA' }) === 'M1,M2,M4',
    '"só o que saiu" traz remessa E transferência juntas', ids({ fluxo: 'SAIDA' }));
  ok(ids({ fluxo: 'ENTRADA' }) === 'M3',
    '"só o que voltou" traz a devolução', ids({ fluxo: 'ENTRADA' }));

  // Este e o ponto que mais importa: perda e ajuste nao sao viagem de caixa. Se caissem
  // em "saiu", a tela mostraria como despachado o que na verdade foi baixa de saldo.
  ok(ids({ fluxo: 'SAIDA' }).indexOf('M5') < 0 && ids({ fluxo: 'ENTRADA' }).indexOf('M5') < 0 &&
     ids({ fluxo: 'SAIDA' }).indexOf('M6') < 0 && ids({ fluxo: 'ENTRADA' }).indexOf('M6') < 0,
    'perda e ajuste não entram nem em um lado nem no outro — não são viagem de caixa');

  // Os filtros se somam; nao se substituem.
  ok(ids({ fluxo: 'SAIDA', caixa: 'G' }) === 'M2,M4',
    'sentido e caixa juntos apertam o recorte', ids({ fluxo: 'SAIDA', caixa: 'G' }));
  ok(ids({ fluxo: 'ENTRADA', caixa: 'G' }) === '',
    'e quando nada casa, casa nada — não a base inteira', ids({ fluxo: 'ENTRADA', caixa: 'G' }));

  // O sentido do filtro tem de ser o MESMO que o painel usa para somar SAIDA e RETORNO.
  const fx = F.fluxoPorPessoa({ movimentos: movs, usuarios: users, tipos: tipos }, D('2026-09-01'));
  const u = fx.usuarios[0];
  ok(u.saida === 60 && u.retorno === 5,
    'o painel soma pelo mesmo critério: 10+20+30 saiu, 5 voltou, perda e ajuste fora', u);
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

    // linha antiga em AGUARDANDO quita igual: é o mesmo critério do saldo, e o saldo
    // deixou de esperar conferência quando a etapa saiu
    ok(rot([sai('S1', 'P', 50, '2026-09-01'),
            volta('D1', 'P', 50, '2026-09-05', 'AGUARDANDO')]).S1 === 'Devolvida',
      'devolução antiga em AGUARDANDO quita a remessa, como conta no saldo');

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


  console.log('\n== corrigir o lançamento ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    /* Este bloco mede o que a correção GRAVA — quais campos entram no patch e o que o
       histórico guarda. A guarda da senha é outra coisa, e tem bloco próprio logo
       abaixo; aqui ela entra satisfeita para não transformar cada afirmação sobre
       mapeamento de campo numa afirmação sobre prazo. */
    const comSenha = (mov, p, agora, nomes) =>
      F.montarCorrecao(mov, p, agora, nomes, { senhaOk: true });
    /* Um mapa por tipo de campo: origem e destino saem da lista de locais, a caixa da de
       tipos. Com um mapa só, o histórico guardaria "origem: de L1 para L2". */
    const nomes = {
      usuarios: F.mapaNomes([{ ID: 'U1', Nome: 'Nestor Neto' }, { ID: 'U2', Nome: 'Ivanilda' }]),
      locais: F.mapaNomes([{ ID: 'L1', Nome: 'Matriz' }, { ID: 'L2', Nome: 'Filial Maceió' },
                           { ID: 'R1', Nome: 'Caruaru' }]),
      tipos: F.mapaTipos([{ ID: 'T1', Nome: 'CX P' }, { ID: 'T2', Nome: 'CX G' }])
    };
    const mov = {
      ID: 'M1', Tipo: 'SAIDA', Qtd: 50, UsuarioID: 'U1',
      OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T1', Motorista: 'Ramos',
      DataRef: new Date('2026-09-15T00:00:00'), Historico: []
    };

    let r = comSenha(mov, { UsuarioID: 'U2', motivo: 'lançou no lugar do colega', usuarioId: 'U1' },
      new Date('2026-09-16T10:00:00'), nomes);
    ok(r.ok && r.patch.UsuarioID === 'U2', 'grava o novo responsável pelo lançamento', r);
    ok(r.entradas[0].campo === 'quem lançou', 'o histórico nomeia o campo', r.entradas[0]);
    ok(r.entradas[0].de === 'Nestor Neto' && r.entradas[0].para === 'Ivanilda',
      'e guarda o NOME, não o id — "de U1 para U2" não serve para conferir nada', r.entradas[0]);

    // sem o mapa de nomes o id ainda passa: quem chamava com três argumentos não quebra
    r = comSenha(mov, { UsuarioID: 'U2', motivo: 'x', usuarioId: 'U1' }, new Date());
    ok(r.ok && r.entradas[0].de === 'U1', 'sem o mapa cai no valor cru, sem estourar', r.entradas[0]);

    // trocar para o mesmo não é correção
    r = comSenha(mov, { UsuarioID: 'U1', motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.consulta === true && r.entradas.length === 0,
      'escolher o mesmo usuário não vira correção — vira consulta', r);
    ok(Object.keys(r.patch).length === 0,
      'e não escreve nada no lançamento: uma consulta não muda dado', r.patch);

    // e os campos antigos seguem funcionando junto
    r = comSenha(mov, { Qtd: 60, UsuarioID: 'U2', motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.entradas.length === 2, 'quantidade e responsável mudam no mesmo envio', r.entradas.length);

    /* Os quatro campos que faltavam. Origem, destino e caixa mexem no razão — é
       justamente para isso que se corrige: o lançamento saiu no local errado. */
    r = comSenha(mov, { OrigemID: 'L2', motivo: 'saiu da filial, não da matriz',
                                usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.patch.OrigemID === 'L2', 'a origem se corrige', r.patch);
    ok(r.entradas[0].campo === 'origem' &&
       r.entradas[0].de === 'Matriz' && r.entradas[0].para === 'Filial Maceió',
      'e o histórico guarda os NOMES — "de L1 para L2" não serve para conferir nada',
      r.entradas[0]);

    r = comSenha(mov, { DestinoID: 'L2', motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.patch.DestinoID === 'L2' && r.entradas[0].de === 'Caruaru',
      'o destino idem, e pelo mesmo mapa de locais', r.entradas[0]);

    r = comSenha(mov, { TipoCaixaID: 'T2', motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.patch.TipoCaixaID === 'T2' &&
       r.entradas[0].de === 'CX P' && r.entradas[0].para === 'CX G',
      'a caixa se corrige e usa o mapa DELA, não o de locais', r.entradas[0]);

    // o motorista é gravado pelo nome: não há id para mapear
    r = comSenha(mov, { Motorista: 'Wesley', motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.patch.Motorista === 'Wesley' && r.entradas[0].de === 'Ramos',
      'o motorista se corrige direto pelo nome', r.entradas[0]);

    // trocar por igual continua não sendo correção, campo novo ou velho
    r = comSenha(mov, { OrigemID: 'L1', TipoCaixaID: 'T1', Motorista: 'Ramos',
                                motivo: 'x', usuarioId: 'U1' }, new Date(), nomes);
    ok(r.ok && r.consulta === true && r.entradas.length === 0,
      'repetir os mesmos valores não vira correção nos campos novos também', r);

    /* ---- ABRIR E GRAVAR SEM MUDAR NADA É CONSULTA, E NÃO CORREÇÃO ----
     *
     * "Corrigido" é uma afirmação sobre o DADO: diz que o número ali não é o que foi
     * lançado. Em cima de um lançamento intocado, ela manda o escritório procurar uma
     * diferença que não existe — e faz duvidar de um dado correto. O fato fica
     * registrado assim mesmo: quem abriu a correção e por quê é coisa que se quer saber
     * depois. O que muda é o nome do que aconteceu. */
    {
      const parado = { ID: 'M9', Tipo: 'SAIDA', Qtd: 50, UsuarioID: 'U1',
        OrigemID: 'L1', DestinoID: 'R1', TipoCaixaID: 'T1', Motorista: 'Ramos',
        DataRef: new Date('2026-09-15T00:00:00'), Historico: [] };
      const agora = new Date('2026-09-16T10:00:00');

      let c = comSenha(parado, { Qtd: 50, motivo: 'conferindo o romaneio', usuarioId: 'U2' },
        agora, nomes);
      ok(c.ok && c.consulta === true, 'gravar sem mudar nada devolve consulta, e não erro', c);
      ok(c.historico.length === 1 && c.historico[0].campo === '(consulta)',
        'a consulta entra no MESMO histórico, com marca própria', c.historico[0]);
      ok(c.historico[0].por === 'U2' && c.historico[0].motivo === 'conferindo o romaneio' &&
         c.historico[0].de === '' && c.historico[0].para === '',
        'e guarda quem olhou e por quê, sem "de" e "para" — não houve de nem para',
        c.historico[0]);

      /* A MARCA NÃO PODE SER NOME DE CAMPO. Se `(consulta)` fosse um rótulo de
         `CORRIGIVEIS`, uma correção de verdade seria lida como consulta e sumiria da
         conta de alterações — o oposto exato do defeito que isto conserta. */
      ok(F.CORRIGIVEIS.every((x) => x.rotulo !== '(consulta)'),
        'nenhum campo corrigível se chama "(consulta)"',
        F.CORRIGIVEIS.map((x) => x.rotulo));

      /* A LEITURA SEPARA AS DUAS COISAS. `vezes` é o que faz a tela dizer "corrigido":
         uma consulta contada ali acusaria de alteração um lançamento que ninguém tocou. */
      const so = F.ultimaAlteracao({ Historico: c.historico },
        F.mapaNomes([{ ID: 'U2', Nome: 'Ivanilda' }]));
      ok(so.vezes === 0, 'só consulta não conta como alteração', so);
      ok(so.consulta.vezes === 1 && so.consulta.por === 'Ivanilda',
        'e a consulta é contada à parte, com o nome de quem olhou', so.consulta);

      /* DEPOIS DE UMA CORREÇÃO DE VERDADE, vale a correção: é ela que muda o que o
         número quer dizer. A consulta anterior não pode apagá-la da conta. */
      const mudou = comSenha({ ...parado, Historico: c.historico },
        { Qtd: 70, motivo: 'romaneio dizia 70', usuarioId: 'U1' }, agora, nomes);
      const dois = F.ultimaAlteracao({ Historico: mudou.historico }, nomes.usuarios);
      ok(mudou.ok && !mudou.consulta && dois.vezes === 1 && dois.campo === 'quantidade',
        'a correção que vem depois da consulta continua sendo uma alteração', dois);
      ok(dois.consulta.vezes === 1,
        'e a consulta anterior continua registrada, sem sumir na conta', dois.consulta);

      /* SEM MOTIVO NÃO PASSA, nem para consultar: o histórico sem motivo é uma linha que
         diz "alguém olhou" e não diz por quê — e a etiqueta na tela fica sem explicação. */
      const semMotivo = comSenha(parado, { Qtd: 50, motivo: '  ', usuarioId: 'U2' }, agora, nomes);
      ok(!semMotivo.ok && /motivo/i.test(semMotivo.erro),
        'consulta também exige o motivo', semMotivo);

      /* E A GUARDA DA SENHA VEM ANTES. Sem isto, quem não pode corrigir passaria a poder
         escrever no histórico de qualquer lançamento, de qualquer dia — um jeito calado
         de sujar a auditoria alheia. */
      const semGuarda = F.montarCorrecao(parado,
        { Qtd: 50, motivo: 'espiando', usuarioId: 'U2' },
        new Date('2026-09-20T10:00:00'), nomes, {});
      ok(!semGuarda.ok && semGuarda.precisaSenha === true,
        'e fora da janela livre a consulta também pede a senha do escritório', semGuarda);
    }

    // os sete de uma vez
    r = comSenha(mov, {
      DataRef: '2026-09-20', OrigemID: 'L2', DestinoID: 'L1', TipoCaixaID: 'T2',
      Qtd: 70, Motorista: 'Wesley', UsuarioID: 'U2', motivo: 'refazendo o lançamento',
      usuarioId: 'U1'
    }, new Date(), nomes);
    ok(r.ok && r.entradas.length === 7,
      'os sete campos pedidos mudam no mesmo envio, cada um com sua linha no histórico',
      r.entradas.map((e) => e.campo));
  }


  console.log('\n== ver os cancelados, quando se pede ==');
  {
    /* Invisiveis por PADRAO esta certo: eles nao contam em nada, e deixa-los na lista de
     * todo dia seria pedir que a pessoa os ignore um por um.
     *
     * Invisiveis SEMPRE era outra coisa. Um cancelamento por engano sumia de TODA tela
     * do sistema — a lista, a conciliacao, os totais, e ate' a lixeira, que e' outra
     * marca. A quantidade continuava inteira no banco e nao havia caminho ate' ela: o
     * desfazer que eu tinha escrito era inalcancavel, e a prova dele passou verde
     * porque injetou uma linha cancelada direto na funcao que desenha. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const mk = (id, canc, lix) => ({
      ID: id, Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'L2', TipoCaixaID: 'P', Qtd: 10,
      Status: 'CONFIRMADO', UsuarioID: 'U1', Cancelado: canc,
      MotivoCancel: canc ? 'engano (U1)' : null,
      ExcluidoEm: lix ? D('2026-09-29') : null,
      DataRef: D('2026-09-10'), DataHora: D('2026-09-10')
    });
    /* `AMBAS` ESTA CANCELADA **E** NA LIXEIRA, que e' um estado real: cancela-se e
       depois apaga-se. Sem ela a guarda da lixeira podia sumir inteira sem ninguem
       notar — foi uma sabotagem escapando que mostrou isso. */
    const movs = [mk('VIVO', false, false), mk('CANC', true, false),
                  mk('LIXO', false, true), mk('AMBAS', true, true)];
    const L1 = [{ ID: 'L1', Nome: 'G' }, { ID: 'L2', Nome: 'R' }];
    const lista = (q) => F.listaMovimentos(movs, L1, [{ ID: 'P', Nome: 'CX' }],
      [{ ID: 'U1', Nome: 'u' }], q);
    const ids = (q) => lista(q).map((m) => m.id).sort().join(',');

    ok(ids({}) === 'VIVO',
      'sem pedir nada, a lista continua sem os cancelados — eles nao contam em nada, e ' +
      'na lista de todo dia seriam ruido para ignorar um por um', ids({}));
    ok(ids({ cancelados: 'incluir' }) === 'CANC,VIVO',
      'pedindo "junto", eles aparecem ao lado dos validos', ids({ cancelados: 'incluir' }));
    ok(ids({ cancelados: 'so' }) === 'CANC',
      'e pedindo "so", a lista e so deles — e por aqui que se acha um cancelamento ' +
      'feito por engano', ids({ cancelados: 'so' }));
    ok(ids({ cancelados: 'incluir' }).indexOf('LIXO') < 0 &&
       ids({ cancelados: 'so' }).indexOf('LIXO') < 0,
      'e a LIXEIRA nao entra junto em nenhum dos tres — sao duas marcas diferentes, e ' +
      'quem procura o que cancelou nao esta procurando o que apagou');
    ok(ids({ cancelados: 'lixeira' }) === 'AMBAS,LIXO',
      'e ha um quarto estado apenas para a LIXEIRA — a declaracao nao passa pela tela de ' +
      'Movimentos, para ninguem, nem para o administrador: sem este caminho uma ' +
      'declaracao apagada nao tinha onde ser encontrada em lugar nenhum do sistema',
      ids({ cancelados: 'lixeira' }));
    ok(ids({ cancelados: 'lixeira' }).indexOf('VIVO') < 0,
      'e a lixeira traz apenas o que esta nela, e nao o que esta valendo');
    ok(lista({ cancelados: 'lixeira' })[0].excluidoEm !== '',
      'e a linha chega MARCADA como apagada — sem isso a tela oferece a porta errada, e ' +
      '"desfazer o cancelamento" numa linha da lixeira leva a recusa da rota depois de a ' +
      'pessoa ja ter escrito o motivo', lista({ cancelados: 'lixeira' })[0].excluidoEm);
    ok(lista({})[0].excluidoEm === '',
      'e a linha viva chega com a marca VAZIA, e nao ausente: ausente, ela se leria como ' +
      'falsa por acidente e nao por decisao', lista({})[0].excluidoEm);
    ok(ids({ cancelados: 'so' }).indexOf('AMBAS') < 0 &&
       ids({ cancelados: 'incluir' }).indexOf('AMBAS') < 0,
      'e o que esta nas DUAS marcas continua fora: cancelado e depois apagado e um ' +
      'estado real, e a lixeira e quem manda nele — restaura-se de la, nao daqui',
      ids({ cancelados: 'so' }));

    const soCanc = lista({ cancelados: 'so' })[0];
    ok(soCanc.cancelado === true && String(soCanc.motivoCancel).indexOf('engano') >= 0,
      'e a linha chega MARCADA como cancelada, com o motivo — sem isso a tela desenha ' +
      '"cancelar" em cima do que ja esta cancelado, e o botao de desfazer nunca aparece',
      [soCanc.cancelado, soCanc.motivoCancel]);
    ok(lista({})[0].cancelado === false,
      'e a linha viva chega marcada como NAO cancelada, e nao sem a marca — ausente, ' +
      'ela se leria como falsa por acidente e nao por decisao', lista({})[0].cancelado);
  }

  console.log('\n== desfazer um cancelamento ==');
  {
    /* Cancelar nunca apagou nada: poe uma marca, e a quantidade continua inteira na
     * linha. Faltava a porta de VOLTA — e sem ela um toque errado tirava a carga do
     * saldo para sempre, com o numero a vista e inalcancavel. Foi o que aconteceu com
     * uma carga inteira, por um "cancelar" que ficava ao lado de "corrigir" numa tela
     * onde ninguem ia para cancelar nada. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const cancelado = () => ({
      ID: 'M000046', Tipo: 'DEVOLUCAO', Qtd: 255, Cancelado: true,
      MotivoCancel: 'engano (U1)', DataRef: D('2026-09-28'), DataHora: D('2026-09-28'),
      Historico: [{ em: '2026-09-28T12:00:00.000Z', por: 'U1', campo: 'Cancelamento',
                    motivo: 'engano', de: 'valendo', para: 'cancelado' }]
    });

    const r = F.montarDescancelamento(cancelado(),
      { motivo: 'cancelei sem querer', usuarioId: 'U2' }, D('2026-10-01'));
    ok(r.ok && r.patch.Cancelado === false,
      'o cancelamento tem volta — a quantidade nunca saiu da linha, faltava a porta',
      r.patch);
    ok(r.patch.MotivoCancel === null,
      'e o motivo do cancelamento sai junto, com `null` explícito — devolvido ausente, o ' +
      'patch sairia sem a coluna e a linha ficaria com a razão de um cancelamento que ' +
      'já não existe', r.patch.MotivoCancel);
    ok(r.historico.length === 2 && /desfeito/i.test(r.historico[1].campo),
      'e a volta entra no histórico ao lado da ida — o saldo muda duas vezes, e sem as ' +
      'duas pontas ninguém sabe depois qual delas foi o engano',
      r.historico.map((h) => h.campo));

    ok(!F.montarDescancelamento(cancelado(), { usuarioId: 'U2' }, D('2026-10-01')).ok,
      'o motivo é obrigatório: um número que sai e volta do saldo sem explicação é pior ' +
      'do que um que ficou fora');
    const vivo = cancelado(); vivo.Cancelado = false;
    ok(!F.montarDescancelamento(vivo, { motivo: 'x', usuarioId: 'U2' }, D('2026-10-01')).ok,
      'e o que não está cancelado não se descancela');
    const naLixeira = cancelado(); naLixeira.ExcluidoEm = D('2026-09-29');
    const rl = F.montarDescancelamento(naLixeira, { motivo: 'x', usuarioId: 'U2' },
      D('2026-10-01'));
    ok(!rl.ok && /lixeira/i.test(rl.erro || ''),
      'e da LIXEIRA não se descancela: são duas marcas diferentes, e voltar a contar no ' +
      'saldo estando excluído é o estado que ninguém consegue explicar depois', rl.erro);
  }


  console.log('\n== mudar a base de um lancamento ==');
  {
    /* A base era decidida no instante do lancamento e nunca mais. Lancado no livro
     * errado, o conserto era SQL no banco — fora do app, fora do historico e fora do
     * alcance de quem opera. Agora e' uma correcao, com autor, motivo e rastro. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const nomes = { usuarios: {}, locais: {}, tipos: {} };
    const ADMIN = { ID: 'U9', Nome: 'Admin', Perfil: 'Admin' };
    const GERENTE = { ID: 'U8', Nome: 'Wellington', Perfil: 'Gerente' };
    const linha = (extra) => Object.assign({
      ID: 'M1', Tipo: 'DEVOLUCAO', OrigemID: 'L1', DestinoID: 'L2', TipoCaixaID: 'P',
      Qtd: 100, Status: 'CONFIRMADO', UsuarioID: 'U1', Perfil: 'Gerente',
      Teste: false, Declaracao: false,
      DataRef: D('2026-10-12'), DataHora: D('2026-10-12'), Historico: []
    }, extra || {});
    /* A GUARDA COMPLETA: administrador, senha conferida. E' o unico caminho que grava. */
    const COMO_ADMIN = { senhaOk: true, senhaConferida: true, quem: ADMIN };

    /* ---- AS DUAS DIRECOES SAO A MESMA FUNCAO, E UMA PROVA AS AMARRA ----
     * `baseDoMovimento` LE em que livro a linha esta; `marcasDaBase` ESCREVE o livro
     * nela. Soltas, bastava um livro novo entrar numa e nao na outra para a correcao
     * mandar a linha para um lugar e a tela mostra-la noutro — e as duas estariam certas
     * cada uma por si, que e' o jeito de o erro durar. */
    ['reais', 'teste', 'declaracao', 'testeDecl'].forEach((id) => {
      ok(F.baseDoMovimento(F.marcasDaBase(id)) === id,
        'as marcas do livro ' + id + ' voltam a ser o livro ' + id + ' — ler e escrever ' +
        'a base são a volta uma da outra, e soltas elas divergem no primeiro livro novo',
        F.marcasDaBase(id));
      ok(!!F.nomeDaBase(id) && F.nomeDaBase(id) !== id,
        'e ele tem nome por extenso para o histórico — "teste: de false para true" não ' +
        'é uma frase que alguém leia seis meses depois', F.nomeDaBase(id));
    });

    /* ---- O CASO REAL: um retorno lancado na Producao, que era para ser ensaio ---- */
    const m = linha();
    const r = F.montarCorrecao(m, { base: 'teste', motivo: 'lançado por engano na produção',
      usuarioId: 'U9' }, D('2026-10-12'), nomes, COMO_ADMIN);
    ok(r.ok && r.patch.Teste === true && r.patch.Declaracao === false,
      'a correção muda o livro do lançamento — e mexe no PAR inteiro: metade do par ' +
      'deixaria a linha num estado que não é livro nenhum', r.patch);
    ok(r.entradas.length === 1 && r.entradas[0].campo === 'base' &&
       r.entradas[0].de === 'Base Produção' && r.entradas[0].para === 'Base Teste Produção',
      'e o histórico diz de qual livro para qual, por extenso', r.entradas[0]);
    ok(r.entradas[0].deCru === 'reais' && r.entradas[0].paraCru === 'teste',
      'com o id ao lado do nome, como qualquer outra correção — é o cru que o restauro ' +
      'usa, e o legível seria uma adivinhação de volta', r.entradas[0]);

    /* ---- MESMA BASE NAO E' CORRECAO ---- */
    const igual = F.montarCorrecao(linha(), { base: 'reais', motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, COMO_ADMIN);
    ok(igual.ok && igual.consulta === true && igual.patch.Teste === undefined,
      'escolher o livro em que ele já está é consulta, e não correção — gravado assim ' +
      'mesmo, o histórico encheria de trocas que não trocaram nada');

    /* ---- SO' O ADMINISTRADOR ---- */
    const gerente = F.montarCorrecao(linha(), { base: 'teste', motivo: 'x', usuarioId: 'U8' },
      D('2026-10-12'), nomes, { senhaOk: true, senhaConferida: true, quem: GERENTE });
    ok(!gerente.ok && /administrador/i.test(gerente.erro || ''),
      'só o administrador muda de livro — a recusa é da ROTA e não da tela: esconder o ' +
      'seletor é conveniência, e um POST direto passa por cima dele', gerente.erro);
    const semQuem = F.montarCorrecao(linha(), { base: 'teste', motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, { senhaOk: true, senhaConferida: true });
    ok(!semQuem.ok,
      'e sem cadastro em mãos a rota RECUSA, em vez de deixar passar — um caminho novo ' +
      'que esqueça de mandar quem pediu falha fechado', semQuem.erro);

    /* ---- A SENHA E' EXIGIDA AINDA DENTRO DOS DEZ MINUTOS ----
     * Aquela janela existe para o engano de dedo do proprio autor. Mudar o livro de uma
     * carga tira as caixas do saldo no mesmo instante, e nao ha lixeira de onde voltar. */
    const semSenha = F.montarCorrecao(linha(), { base: 'teste', motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, { senhaOk: true, senhaConferida: false, quem: ADMIN });
    ok(!semSenha.ok && semSenha.precisaSenha === true,
      'mudar a base pede a senha do escritório MESMO dentro dos dez minutos livres — a ' +
      'janela livre é para o engano de dedo do autor, e não para mudar o livro de uma ' +
      'carga', semSenha.erro);
    /* E O RESTO DA CORRECAO CONTINUA LIVRE: a senha nova e' da BASE, e cobrada de tudo
       ela teria trancado o conserto que ja funcionava. */
    const soQtd = F.montarCorrecao(linha(), { Qtd: 90, motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, { senhaOk: true, senhaConferida: false, quem: ADMIN });
    ok(soQtd.ok && soQtd.patch.Qtd === 90,
      'e corrigir a quantidade continua livre dentro da janela — a senha nova é da BASE, ' +
      'e cobrada de tudo teria trancado o conserto que já funcionava', soQtd.patch);

    /* ---- LIVRO QUE NAO EXISTE ---- */
    const mau = F.montarCorrecao(linha(), { base: 'inventada', motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, COMO_ADMIN);
    ok(!mau.ok && /desconhecida/i.test(mau.erro || ''),
      'e um livro que não existe é recusado dizendo qual era — aceito calado, a linha ' +
      'sairia do livro atual e não chegaria a nenhum', mau.erro);

    /* ---- O PERFIL DE TESTE VENCE A COLUNA ----
     * `lancamentoDeTeste` responde sim se a COLUNA disser sim OU se quem lancou tiver
     * "teste" no perfil. Gravando `Teste:false` numa linha dessas, a rota diria
     * "corrigido: base" e a tela continuaria mostrando o lancamento no ensaio. */
    const doTeste = linha({ Teste: true, Perfil: 'Conferente de teste' });
    const tirar = F.montarCorrecao(doTeste, { base: 'reais', motivo: 'x', usuarioId: 'U9' },
      D('2026-10-12'), nomes, COMO_ADMIN);
    ok(!tirar.ok && /perfil/i.test(tirar.erro || ''),
      'e o lançamento de quem tem "teste" no PERFIL não sai do ensaio pela base: a rota ' +
      'recusa em vez de gravar em silêncio — gravado, ela diria "corrigido" e a tela ' +
      'continuaria mostrando o lançamento no ensaio, que é a pior forma de não funcionar',
      tirar.erro);
    /* E O CAMINHO DE IDA CONTINUA ABERTO para a mesma linha: o impedimento e' so' na
       saida do ensaio, porque e' so' la' que o perfil contradiz a coluna. */
    const paraDecl = F.montarCorrecao(linha({ Perfil: 'Motorista de teste', Teste: true }),
      { base: 'testeDecl', motivo: 'x', usuarioId: 'U9' }, D('2026-10-12'), nomes, COMO_ADMIN);
    ok(paraDecl.ok && paraDecl.patch.Declaracao === true,
      'e mandá-lo para um livro de ensaio continua valendo — o impedimento é só na SAÍDA ' +
      'do ensaio, que é onde o perfil contradiz a coluna', paraDecl.patch);

    /* ---- A BASE ANDA JUNTO COM OS OUTROS CAMPOS ---- */
    const junto = F.montarCorrecao(linha(),
      { base: 'teste', Qtd: 80, motivo: 'tudo errado', usuarioId: 'U9' },
      D('2026-10-12'), nomes, COMO_ADMIN);
    ok(junto.ok && junto.patch.Qtd === 80 && junto.patch.Teste === true &&
       junto.entradas.length === 2,
      'e ela entra na MESMA correção dos outros campos, com uma entrada própria no ' +
      'histórico — duas gravações para um conserto só deixariam metade dele registrada ' +
      'com um motivo e metade com outro', junto.entradas.map((e) => e.campo));

    /* ---- A CARGA INTEIRA: o seletor existe na tela e tem de CHEGAR ao servidor ---- */
    const rota = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    ok(/base: p\.base,/.test(rota),
      'a correção da CARGA manda a base junto dos outros campos compartilhados — sem ' +
      'esta linha o seletor existiria na tela e não chegaria ao servidor: gravaria tudo ' +
      'menos a base, e diria que gravou');
    ok(/senhaConferida: conferida/.test(rota) && /senhaConferida: senhaOk/.test(rota),
      'e as duas rotas dizem se a senha foi mesmo DIGITADA, e não só se a correção podia ' +
      'passar — com uma resposta só, trocar o livro de um lançamento recém-feito passaria ' +
      'sem senha nenhuma');
  }

  console.log('\n== desfazer a ultima correcao ==');
  {
    /* Corrigir nao tinha volta. Quem errava de dedo tinha uma saida so' — corrigir de
     * novo por cima —, e o historico ficava com duas marcas para um erro: a primeira
     * dizendo que o numero mudou, a segunda dizendo que mudou de volta, e nenhuma das
     * duas dizendo que a primeira foi engano.
     *
     * UM PASSO POR TOQUE. Tres correcoes por tres razoes nao se jogam fora juntas. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const nomes = { usuarios: {}, locais: { L1: 'Galpão', L2: 'Caruaru' }, tipos: { P: 'CX P' } };
    const base = () => ({
      ID: 'M1', Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'L2', TipoCaixaID: 'P',
      Qtd: 100, Status: 'CONFIRMADO', UsuarioID: 'U1',
      DataRef: D('2026-09-10'), DataHora: D('2026-09-10'), Historico: []
    });
    const aplicar = (mov, r) => {
      Object.keys(r.patch).forEach((k) => { mov[k] = r.patch[k]; });
      mov.Historico = r.historico;
      return mov;
    };
    const LIVRE = { senhaOk: true };

    // --- uma correcao, depois desfeita ---
    const m = base();
    const c1 = F.montarCorrecao(m, { Qtd: 250, motivo: 'contagem refeita', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE);
    ok(c1.ok && c1.patch.Qtd === 250, 'a correção muda a quantidade', c1);
    ok(c1.entradas[0].campoId === 'Qtd' && c1.entradas[0].deCru === 100,
      'e o histórico guarda o valor CRU ao lado do legível — sem ele o restauro teria ' +
      'de adivinhar o id a partir do nome, e dois locais de mesmo nome o mandariam ' +
      'para o lugar errado calado', c1.entradas[0]);
    aplicar(m, c1);

    const r1 = F.montarRestauro(m, { motivo: 'foi engano', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE);
    ok(r1.ok && r1.patch.Qtd === 100,
      'o restauro devolve a quantidade de antes da correção', r1.patch);
    aplicar(m, r1);
    ok(m.Historico.length === 2 && m.Historico[1].restauro === true,
      'e ele ENTRA no histórico — desfazer sem rastro faria do histórico um lugar onde ' +
      'se apaga o que incomoda, que é o oposto do que ele existe para fazer',
      m.Historico.map((h) => h.campo + ':' + h.de + '>' + h.para));

    // --- desfazer duas vezes anda dois passos ---
    const m2 = base();
    aplicar(m2, F.montarCorrecao(m2, { Qtd: 200, motivo: 'primeira', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE));
    aplicar(m2, F.montarCorrecao(m2, { Qtd: 300, motivo: 'segunda', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE));
    const v1 = F.montarRestauro(m2, { motivo: 'desfaz a segunda', usuarioId: 'U2' },
      D('2026-09-13'), nomes, LIVRE);
    aplicar(m2, v1);
    ok(m2.Qtd === 200, 'o primeiro desfazer volta UM passo, e não ao original — três ' +
      'correções por três razões não se jogam fora juntas', m2.Qtd);
    const v2 = F.montarRestauro(m2, { motivo: 'desfaz a primeira', usuarioId: 'U2' },
      D('2026-09-14'), nomes, LIVRE);
    aplicar(m2, v2);
    ok(m2.Qtd === 100, 'e o segundo anda mais um — o restauro não se desfaz a si mesmo, ' +
      'senão o par iria e voltaria para sempre no mesmo lugar', m2.Qtd);
    const v3 = F.montarRestauro(m2, { motivo: 'não há mais', usuarioId: 'U2' },
      D('2026-09-15'), nomes, LIVRE);
    ok(!v3.ok && /não há correção/i.test(v3.erro || ''),
      'e no fim ele diz que não há mais o que desfazer, em vez de gravar nada',
      v3.erro);

    // --- o grupo inteiro daquele instante ---
    const m3 = base();
    aplicar(m3, F.montarCorrecao(m3,
      { Qtd: 500, OrigemID: 'L2', motivo: 'dois campos', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE));
    ok(m3.Qtd === 500 && m3.OrigemID === 'L2', 'uma correção mexe em vários campos de uma vez');
    const r3 = F.montarRestauro(m3, { motivo: 'desfaz tudo daquele toque', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE);
    ok(r3.ok && r3.patch.Qtd === 100 && r3.patch.OrigemID === 'L1',
      'e o restauro desfaz o GRUPO inteiro daquele instante — desfazendo só um campo, a ' +
      'linha ficaria com metade de cada versão', r3.patch);

    // --- o que NAO se desfaz ---
    const m4 = base();
    aplicar(m4, F.montarCorrecao(m4, { motivo: 'só olhei', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE));
    ok(m4.Historico.length === 1,
      'abrir e gravar sem mudar nada fica no histórico como consulta');
    const r4 = F.montarRestauro(m4, { motivo: 'tentar', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE);
    ok(!r4.ok, 'e uma CONSULTA não se desfaz — ela não mudou nada que se possa devolver',
      r4.erro);

    const m5 = base();
    m5.Historico = [{ em: '2026-09-11T00:00:00.000Z', por: 'U2', campo: 'quantidade',
                      motivo: 'antiga', de: '100', para: '250' }];
    m5.Qtd = 250;
    const r5 = F.montarRestauro(m5, { motivo: 'tentar', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE);
    ok(!r5.ok,
      'e uma correção ANTERIOR ao valor cru também não — reconstruir o id a partir do ' +
      'nome acertaria quase sempre, e o "quase" aqui é mandar carga para o lugar errado ' +
      'sem avisar ninguém', r5.erro);

    // --- as mesmas trancas da correcao ---
    const m6 = base();
    aplicar(m6, F.montarCorrecao(m6, { Qtd: 250, motivo: 'x', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE));
    ok(!F.montarRestauro(m6, { usuarioId: 'U2' }, D('2026-09-12'), nomes, LIVRE).ok,
      'o restauro exige MOTIVO, como a correção — um desfazer sem razão escrita é um ' +
      'número que mudou sozinho aos olhos de quem confere depois');
    const semSenha = F.montarRestauro(m6, { motivo: 'sem senha', usuarioId: 'U9' },
      D('2026-10-20'), nomes, {});
    ok(!semSenha.ok && semSenha.precisaSenha === true,
      'e fora da janela de conserto livre ele pede a SENHA do escritório — restaurar ' +
      'muda o dado como corrigir muda, e uma porta mais barata para o mesmo estrago ' +
      'seria a porta que todo mundo passaria a usar', semSenha.erro);
    /* O CANCELADO PRECISA TER O QUE DESFAZER, senao a prova passa pela porta errada:
       sem historico, a recusa vem do "nao ha correcao" e a guarda do cancelamento podia
       sumir inteira sem ninguem notar — foi uma sabotagem escapando que mostrou isso. */
    const cancelado = base();
    aplicar(cancelado, F.montarCorrecao(cancelado,
      { Qtd: 250, motivo: 'antes de cancelar', usuarioId: 'U2' },
      D('2026-09-11'), nomes, LIVRE));
    cancelado.Cancelado = true;
    const rc = F.montarRestauro(cancelado, { motivo: 'x', usuarioId: 'U2' },
      D('2026-09-12'), nomes, LIVRE);
    ok(!rc.ok && /cancelado/i.test(rc.erro || ''),
      'e um movimento CANCELADO não se restaura, mesmo tendo correção para desfazer — ' +
      'ele já não conta no saldo, e mexer nos números de uma linha que não vale é ' +
      'arrumar o que ninguém lê', rc.erro);
  }

  console.log('\n== o painel abre o periodo inteiro ==');
  {
    /* O PADRAO ERA "DO DIA 1 DO MES ATE' AGORA", e no dia 1 a janela tinha onze horas.
     * Todo primeiro do mes o painel abria zerado para a operacao inteira, com o estoque
     * cheio em cima dizendo que havia movimento — e quem olhava concluia, com razao, que
     * a tela tinha quebrado.
     *
     * SEM ESCOLHA, NAO HA' CORTE. Quem quer um recorte escolhe um; quem nao escolheu nada
     * nao pediu para esconder nada. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [
      { ID: 'G1', Nome: 'Galp\u00e3o', Tipo: 'GALPAO' },
      { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' }
    ];
    const tipos = [{ ID: 'P', Nome: 'CX P' }];
    const users = [{ ID: 'U1', Nome: 'Real', Perfil: 'Motorista' }];
    const mv = (id, tipo, qtd, dia) => ({
      ID: id, Tipo: tipo, OrigemID: tipo === 'SAIDA' ? 'G1' : 'R1',
      DestinoID: tipo === 'SAIDA' ? 'R1' : 'G1', TipoCaixaID: 'P', Qtd: qtd,
      Status: 'CONFIRMADO', UsuarioID: 'U1', DataRef: D(dia), DataHora: D(dia)
    });
    const movs = [mv('S1', 'SAIDA', 100, '2026-09-02'),
                  mv('D1', 'DEVOLUCAO', 40, '2026-09-05')];
    const base = { locais, tipos, movimentos: movs, usuarios: users, config: {} };

    const tudo = F.painel(base, D('2026-10-01'));
    ok(tudo.fluxo.totais.saida === 100 && tudo.fluxo.totais.retorno === 40,
      'no dia 1 de outubro, sem periodo escolhido, setembro CONTINUA na conta \u2014 era ' +
      'aqui que o painel abria zerado todo primeiro do mes',
      [tudo.fluxo.totais.saida, tudo.fluxo.totais.retorno]);
    ok(tudo.fluxo.linhas.length > 0,
      'e a tabela vem com as linhas, em vez da frase de vazio', tudo.fluxo.linhas.length);
    ok(tudo.periodo.de === '',
      'e o painel DIZ que nao cortou \u2014 a tela escreve o r\u00f3tulo a partir disto, e um ' +
      'in\u00edcio inventado aqui faria a legenda prometer um recorte que nao houve',
      tudo.periodo.de);

    /* ESCOLHER UM PERIODO CONTINUA CORTANDO — senao o filtro teria virado enfeite. */
    const soOut = F.painel(base, D('2026-10-01'), { de: '2026-10-01' });
    ok(soOut.fluxo.totais.saida === 0 && soOut.periodo.de === '2026-10-01',
      'e quem ESCOLHE um in\u00edcio continua sendo atendido \u2014 abrir o padr\u00e3o n\u00e3o pode ' +
      'transformar o filtro em enfeite',
      [soOut.fluxo.totais.saida, soOut.periodo.de]);
    const ateDia3 = F.painel(base, D('2026-10-01'), { ate: '2026-09-03' });
    ok(ateDia3.fluxo.totais.saida === 100 && ateDia3.fluxo.totais.retorno === 0,
      'e um fim SEM in\u00edcio pega tudo at\u00e9 ele \u2014 a sa\u00edda do dia 2 entra, a devolu\u00e7\u00e3o ' +
      'do dia 5 fica de fora',
      [ateDia3.fluxo.totais.saida, ateDia3.fluxo.totais.retorno]);

    /* OS KPIS DO MURAL CONTINUAM SENDO DO MES. Eles tem o mes no proprio nome; abri-los
       junto faria "perdas baixadas no mes" somar o ano inteiro sem mudar o rotulo. */
    ok(tudo.kpis.saidasMes === 0,
      'e os KPIs do mural continuam presos ao M\u00caS \u2014 eles t\u00eam o m\u00eas no pr\u00f3prio nome, e ' +
      'abri-los junto faria o r\u00f3tulo mentir', tudo.kpis.saidasMes);
    const emSet = F.painel(base, D('2026-09-20'));
    ok(emSet.kpis.saidasMes === 100,
      'e dentro de setembro eles contam setembro', emSet.kpis.saidasMes);
  }

  console.log('\n== base de teste: perfil com "teste" no nome ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [
      { ID: 'G1', Nome: 'Galpão', Tipo: 'GALPAO' },
      { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' }
    ];
    const tipos = [{ ID: 'P', Nome: 'CX P' }];
    const users = [{ ID: 'U1', Nome: 'Real', Perfil: 'Motorista' },
                   { ID: 'U2', Nome: 'Ensaio', Perfil: 'Motorista Teste' }];

    ok(F.ehPerfilTeste('Teste') && F.ehPerfilTeste('Motorista Teste') &&
       F.ehPerfilTeste('Conferente de teste') && F.ehPerfilTeste('TESTE'),
      'qualquer perfil com "teste" no nome conta como ensaio, em qualquer caixa');
    ok(!F.ehPerfilTeste('Motorista') && !F.ehPerfilTeste('Gestor') && !F.ehPerfilTeste(''),
      'e os demais não');

    const mv = (id, teste, tipo, qtd, dia) => ({
      ID: id, Tipo: tipo, OrigemID: tipo === 'SAIDA' ? 'G1' : 'R1',
      DestinoID: tipo === 'SAIDA' ? 'R1' : 'G1', TipoCaixaID: 'P', Qtd: qtd,
      Status: 'CONFIRMADO', UsuarioID: teste ? 'U2' : 'U1', Teste: teste,
      Perfil: teste ? 'Motorista Teste' : 'Motorista',
      DataRef: D(dia), DataHora: D(dia)
    });
    const movs = [
      mv('S1', false, 'SAIDA', 100, '2026-09-02'),
      mv('T1', true,  'SAIDA', 900, '2026-09-03'),
      mv('T2', true,  'DEVOLUCAO', 400, '2026-09-04')
    ];

    // 1) o ensaio CONTA, como qualquer outro lançamento
    const sal = F.saldos(movs);
    ok(sal.R1.P === 600, 'o ensaio entra no saldo: 100 + 900 - 400', sal.R1);

    const p = F.painel({ locais, tipos, movimentos: movs, usuarios: users, config: {} },
      D('2026-09-20'));
    ok(p.kpis.saidasMes === 1000, 'e nos KPIs do painel também', p.kpis.saidasMes);

    // 2) o recorte separa quando se quer, sem mexer no que foi gravado
    const so = (modo) => F.saldos(F.recorteTeste({ movimentos: movs }, modo).movimentos);
    ok(so('reais').R1.P === 100, 'recorte "reais" deixa só a operação', so('reais').R1);
    ok(so('teste').R1.P === 500, 'recorte "teste" deixa só o ensaio: 900 - 400', so('teste').R1);
    ok(so('todos').R1.P === 600, '"todos" é o padrão e soma os dois', so('todos').R1);
    ok(F.recorteTeste({ movimentos: movs }, 'todos').movimentos.length === 3,
      'o recorte não altera nada no banco — só peneira a leitura');

    // 3) o painel aceita o recorte pela mesma porta
    const pr = F.painel(F.recorteTeste({ locais, tipos, movimentos: movs, usuarios: users,
      config: {} }, 'reais'), D('2026-09-20'));
    ok(pr.kpis.saidasMes === 100, 'o painel recortado em "reais" ignora o ensaio', pr.kpis.saidasMes);

    // 4) a lista de Movimentos: padrão passa a ser TODOS
    const idsDe = (q) => F.listaMovimentos(movs, locais, tipos, users, q).map((m) => m.id).sort().join(',');
    ok(idsDe({}) === 'S1,T1,T2', 'sem escolher nada, a lista mostra tudo', idsDe({}));
    ok(idsDe({ teste: 'reais' }) === 'S1', '"reais" tira o ensaio', idsDe({ teste: 'reais' }));
    ok(idsDe({ teste: 'teste' }) === 'T1,T2', '"de teste" deixa só o ensaio', idsDe({ teste: 'teste' }));

    const linhaT = F.listaMovimentos(movs, locais, tipos, users, { teste: 'teste' })[0];
    ok(linhaT.teste === true, 'a linha avisa que é de teste, para a tela poder marcar');

    // 5) linha antiga, gravada antes da coluna existir: o perfil guardado ainda a classifica
    const antiga = { ID: 'A1', Tipo: 'SAIDA', OrigemID: 'G1', DestinoID: 'R1', TipoCaixaID: 'P',
      Qtd: 7, Status: 'CONFIRMADO', UsuarioID: 'U2', Perfil: 'Motorista Teste',
      DataRef: D('2026-09-05'), DataHora: D('2026-09-05') };
    ok(F.lancamentoDeTeste(antiga) === true,
      'sem a coluna Teste, o perfil gravado na linha ainda a classifica', antiga.Perfil);

    // 6) o ciclo da carga não mistura os mundos
    const cruzado = [mv('S1', false, 'SAIDA', 100, '2026-09-02'),
                     mv('T9', true, 'DEVOLUCAO', 100, '2026-09-04')];
    const sit = {};
    F.listaMovimentos(cruzado, locais, tipos, users, {}).forEach((m) => { sit[m.id] = m.situacao; });
    ok(sit.S1 === 'Enviada',
      'devolução de ensaio não quita remessa real — senão o Status mentiria', sit);

    // 7) a classificação vem do servidor, não do payload
    const r1 = F.montarMovimento(
      { tipo: 'SAIDA', origemId: 'G1', destinoId: 'R1', usuarioId: 'U2', perfil: 'Motorista',
        itens: [{ tipoCaixaId: 'P', qtd: 5 }] },
      { movimentos: [], agora: D('2026-09-05'), teste: true });
    ok(r1.ok && r1.linhas[0].Teste === true,
      'vale o ctx do servidor, e o perfil do payload não muda a classificação', r1.linhas[0].Teste);

    /* 8) OS DOIS NOMES DO MOTORISTA, e o que acontece quando so' vem um.
       A tela manda o curto no `motorista` e o completo no `motoristaNome`. Uma tela
       antiga — ou a fila offline gravada antes desta mudanca — manda so' o primeiro: o
       completo TEM de cair no curto, e nao ficar nulo. Nulo, a coluna que o usuario
       pediu nasce vazia em metade dos lancamentos, e a conclusao de quem olhar e que o
       campo nao e preenchido. */
    const comDois = F.montarMovimento(
      { tipo: 'SAIDA', origemId: 'G1', destinoId: 'R1', usuarioId: 'U2',
        motorista: 'Isaque', motoristaNome: 'Isaque Sobrenome',
        itens: [{ tipoCaixaId: 'P', qtd: 5 }] },
      { movimentos: [], agora: D('2026-09-05') });
    ok(comDois.ok && comDois.linhas[0].Motorista === 'Isaque' &&
       comDois.linhas[0].MotoristaNome === 'Isaque Sobrenome',
      'a linha guarda os DOIS nomes do motorista — o curto, que \u00e9 o que a tela mostra, ' +
      'e o completo, que \u00e9 o do documento',
      comDois.ok && [comDois.linhas[0].Motorista, comDois.linhas[0].MotoristaNome]);

    const soUm = F.montarMovimento(
      { tipo: 'SAIDA', origemId: 'G1', destinoId: 'R1', usuarioId: 'U2',
        motorista: 'Chico', itens: [{ tipoCaixaId: 'P', qtd: 5 }] },
      { movimentos: [], agora: D('2026-09-05') });
    ok(soUm.ok && soUm.linhas[0].MotoristaNome === 'Chico',
      'e quando s\u00f3 vem um nome — tela antiga, ou a fila offline gravada antes desta ' +
      'mudan\u00e7a — o completo cai no curto em vez de ficar nulo, sen\u00e3o a coluna nasce ' +
      'vazia e o campo parece abandonado',
      soUm.ok && soUm.linhas[0].MotoristaNome);
  }


  console.log('\n== ordem: o ensaio afunda para o fim de toda lista ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');

    ok(F.pesoTeste('Cliente Teste') === 1 && F.pesoTeste('CEASA') === 0,
      'peso 1 para o que tem "teste" no nome, 0 para o resto');

    const locais = [
      { ID: 'G1', Nome: 'Galpão', Tipo: 'GALPAO' },
      { ID: 'GT', Nome: 'Galpão Teste', Tipo: 'GALPAO' },
      { ID: 'C1', Nome: 'CEASA', Tipo: 'CLIENTE', Responsavel: 'A' },
      { ID: 'CT', Nome: 'Cliente de Teste', Tipo: 'CLIENTE', Responsavel: 'B' },
      { ID: 'R1', Nome: 'Caruaru', Tipo: 'ROTA' }
    ];
    const tipos = [{ ID: 'P', Nome: 'CX P' }];
    const users = [{ ID: 'U1', Nome: 'Real', Perfil: 'Motorista' },
                   { ID: 'UT', Nome: 'Ensaio', Perfil: 'Motorista Teste' }];

    // o de teste tem saldo MAIOR de propósito: se a ordem fosse só por saldo, ele
    // apareceria em primeiro — é o que prova que o peso entra antes
    const mv = (id, dest, qtd, dia, u) => ({
      ID: id, Tipo: 'SAIDA', OrigemID: 'G1', DestinoID: dest, TipoCaixaID: 'P', Qtd: qtd,
      Status: 'CONFIRMADO', UsuarioID: u, Perfil: u === 'UT' ? 'Motorista Teste' : 'Motorista',
      Teste: u === 'UT', DataRef: D(dia), DataHora: D(dia)
    });
    const movs = [
      mv('M1', 'C1', 10, '2026-09-02', 'U1'),
      mv('M2', 'CT', 999, '2026-09-10', 'UT'),   // mais recente E maior
      mv('M3', 'C1', 20, '2026-09-05', 'U1')
    ];

    // 1) lista de Movimentos: o ensaio vai para o fim mesmo sendo o mais recente
    const ids = F.listaMovimentos(movs, locais, tipos, users, {}).map((m) => m.id);
    ok(ids.join(',') === 'M3,M1,M2',
      'ensaio no fim, e dentro dos reais a data mais nova continua em cima', ids);

    // 2) painel: clientes, rotas e galpões
    const p = F.painel({ locais, tipos, movimentos: movs, usuarios: users, config: {} },
      D('2026-09-20'));
    const nomes = p.locais.map((l) => l.nome);
    ok(nomes[nomes.length - 1] === 'Cliente de Teste',
      'no painel o cliente de teste fica por último, apesar do saldo maior', nomes);
    ok(p.galpoes.map((g) => g.nome).join(',') === 'Galpão,Galpão Teste',
      'os galpões também, e agora têm ordem — antes vinham por id', p.galpoes.map((g) => g.nome));

    // 3) Painel de Ativos: por origem e por pessoa
    const f = F.fluxoPorOrigem({ locais, tipos, movimentos: movs, usuarios: users },
      D('2026-09-01'), 90);
    const vivos = f.linhas.filter((l) => l.situacao !== 'parado').map((l) => l.nome);
    ok(vivos[vivos.length - 1] === 'Cliente de Teste',
      'no Painel de Ativos o de teste fica por último, mesmo devendo mais', vivos);

    const pes = F.fluxoPorPessoa({ movimentos: movs, usuarios: users }, D('2026-09-01'));
    const us = pes.usuarios.map((u) => u.nome);
    ok(us[us.length - 1] === 'Ensaio', 'e o usuário de ensaio idem', us);

    // 4) motoristas públicos (a lista que o celular recebe)
    const mot = F.motoristasPublicos([
      { ID: 'D2', Nome: 'Zé', Ativo: true },
      { ID: 'DT', Nome: 'Motorista Teste', Ativo: true },
      { ID: 'D1', Nome: 'Ana', Ativo: true }
    ]).map((m) => m.Nome);
    ok(mot.join(',') === 'Ana,Zé,Motorista Teste',
      'no celular também: ensaio no fim, alfabética entre os reais', mot);
  }


  console.log('\n== permissão por tipo de caixa ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const s1 = F.sessaoDe({ ID: 'U1', Nome: 'A', Perfil: 'Motorista', TiposCaixa: ['P', 'G'] });
    ok(s1.tiposCaixa.join(',') === 'P,G', 'a sessão leva os tipos permitidos', s1.tiposCaixa);

    const s2 = F.sessaoDe({ ID: 'U2', Nome: 'B', Perfil: 'Motorista' });
    ok(Array.isArray(s2.tiposCaixa) && s2.tiposCaixa.length === 0,
      'sem nada marcado vem lista vazia — que quer dizer TODOS, como nas outras duas',
      s2.tiposCaixa);

    const tipos = [{ ID: 'P' }, { ID: 'G' }, { ID: 'GG' }];
    ok(F.locaisPermitidos([], tipos).length === 0,
      'e a peneira devolve todos quando a lista está vazia');
    ok(F.locaisPermitidos(['G'], tipos).map((t) => t.ID).join(',') === 'G',
      'com a lista preenchida, só o que foi marcado');
  }

  console.log('\n== permissão por motorista ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const s1 = F.sessaoDe({ ID: 'U1', Nome: 'A', Perfil: 'Gestor', Motoristas: ['D1', 'D3'] });
    ok(s1.motoristas.join(',') === 'D1,D3', 'a sessão leva os motoristas permitidos', s1.motoristas);

    const s2 = F.sessaoDe({ ID: 'U2', Nome: 'B', Perfil: 'Gestor' });
    ok(Array.isArray(s2.motoristas) && s2.motoristas.length === 0,
      'sem nada marcado vem vazio — que quer dizer TODOS, como nas outras três', s2.motoristas);

    const mot = [{ ID: 'D1', Nome: 'Ana' }, { ID: 'D2', Nome: 'Bia' }, { ID: 'D3', Nome: 'Caio' }];
    ok(F.locaisPermitidos([], mot).length === 0,
      'e lista vazia não devolve motorista nenhum');
    ok(F.locaisPermitidos(['D1', 'D3'], mot).map((m) => m.Nome).join(',') === 'Ana,Caio',
      'e com a lista preenchida, só os marcados');
  }

  console.log('\n== simetria: o que o formulário grava tem de voltar ==');
  {
    /* Isto já custou: TiposCaixa e Motoristas eram gravados certinho no banco, mas
       `usuariosPublicos` — que é lista branca — não os devolvia. O formulário abria com
       as caixas desmarcadas e a gravação seguinte escrevia vazio por cima. Nenhum erro
       aparecia em lugar nenhum; a marcação só não grudava.

       O teste lê o payload que o admin.html monta e exige que cada campo volte. */
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

    const i = html.indexOf("var reg = { ID:u.ID||''");
    /* SEM OS COMENTÁRIOS. O payload é lido por expressão, e uma frase em maiúsculas
       seguida de dois pontos dentro de um comentário — "a tradução mora AQUI: ..." —
       entra na lista como se fosse um campo, e a prova falha apontando uma palavra.
       Este teste é sobre o que o formulário GRAVA; prosa não grava nada. */
    const payload = html.slice(i, html.indexOf('};', i))
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const enviados = (payload.match(/([A-Z][A-Za-z]*)\s*:\s*lerMarcados/g) || [])
      .map((t) => t.split(':')[0].trim());

    ok(enviados.length >= 6,
      'o formulário envia as seis listas de permissão', enviados);

    /* E as que NAO sao lista. A primeira versao deste teste olhava so o `lerMarcados`, e
       por isso uma permissao booleana passou por fora: `SoProprios` foi gravada, viajou
       na sessao, e mesmo assim nao voltava na `equipe`. Agora ele varre TODO campo do
       payload — o que o formulario manda, a leitura tem de devolver. */
    const todos = (payload.match(/([A-Z][A-Za-z]*)\s*:/g) || [])
      .map((t) => t.replace(':', '').trim())
      .filter((c) => ['ID', 'PIN', 'Senha'].indexOf(c) < 0);
    const publico = Object.keys(F.usuariosPublicos([{ ID: 'U1', Nome: 'A' }])[0]);
    /* `Senha` e `PIN` ficam de fora de proposito: eles VAO e nunca voltam. */
    const sumiram = todos.filter((c) => publico.indexOf(c) < 0);
    ok(todos.length >= 10 && sumiram.length === 0,
      'todo campo que o formulário grava volta na leitura — inclusive os que não são ' +
      'lista. Faltando um, o formulário abre com ele no padrão e a gravação seguinte ' +
      'apaga o que estava salvo, sem erro nenhum em lugar nenhum', sumiram);

    const volta = F.usuariosPublicos([{
      ID: 'U1', Nome: 'A', Perfil: 'Gestor',
      Saidas: ['a'], Destinos: ['b'], Retornos: ['r'],
      TiposCaixa: ['c'], Motoristas: ['d'],
      Veiculos: ['V1'],
      Operacoes: ['SAIDA'], Abas: ['pgPainel'], Ajustes: ['L1'], Unidades: ['L1'],
      SoProprios: true
    }])[0];

    ok(volta.SoProprios === true,
      'e o painel restrito volta com o valor gravado, não com o padrão', volta.SoProprios);

    enviados.forEach((campo) => {
      ok(Array.isArray(volta[campo]) && volta[campo].length === 1,
        campo + ' volta do servidor — sem isso a marcação não gruda e some na gravação seguinte',
        volta[campo]);
    });
  }


  console.log('\n== em quais locais a pessoa ajusta o saldo ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));

    /* A aba Ajustes era tudo-ou-nada: quem a tivesse mexia no saldo de qualquer galpao,
       filial, cliente ou rota. Ter a aba passa a ser a PORTA; esta lista e o quarto. */

    /* Qual local cada tipo mexe. AJUSTE credita o DESTINO; PERDA debita a ORIGEM. Trocar
       os dois aqui faria a peneira cobrar o campo errado — e ela passaria a deixar
       ajustar exatamente onde deveria barrar, sem erro nenhum. */
    ok(F.localDoAjuste('AJUSTE', { destinoId: 'L1', origemId: 'L9' }) === 'L1',
      'o AJUSTE mexe no saldo do destino — é o local que ganha as caixas');
    ok(F.localDoAjuste('PERDA', { origemId: 'L9', destinoId: '' }) === 'L9',
      'e a PERDA, no da origem — é quem as perdeu');
    ['SAIDA', 'DEVOLUCAO', 'TRANSFERENCIA'].forEach((t) => {
      ok(F.localDoAjuste(t, { origemId: 'L9', destinoId: 'L1' }) === '',
        'o ' + t + ' não é governado por esta lista — nasce no campo, e quem manda nele ' +
        'são `Saidas` e `Destinos`');
    });

    /* VAZIA QUER DIZER TODOS, a convencao do projeto. Invertida, o deploy trancaria a
       operacao inteira fora do ajuste, inclusive o administrador. */
    ok(F.podeAjustarEm({ Ajustes: [] }, 'L1') === false,
      'sem lista, nenhum local — marcar é conceder');
    ok(F.podeAjustarEm({}, 'L1') === false,
      'e cadastro sem a coluna também: a ausência não vale mais como "pode tudo"');
    ok(F.podeAjustarEm({ Ajustes: ['L1', 'L2'] }, 'L1') === true,
      'quem está na lista ajusta');
    ok(F.podeAjustarEm({ Ajustes: ['L2'] }, 'L1') === false,
      'e quem não está, NÃO — era isto que não existia: a aba dava o saldo inteiro');
    ok(F.podeAjustarEm({ Ajustes: [1, 2] }, '1') === true,
      'e o número gravado casa com o texto do formulário — `1` e "1" são o mesmo local, ' +
      'e comparar sem normalizar barraria quem tem permissão');

    /* Sem local nao ha o que cobrar: `montarMovimento` ja recusa por falta de campo, e
       recusar aqui antes trocaria a mensagem util por uma sobre permissao. */
    ok(F.podeAjustarEm({ Ajustes: ['L2'] }, '') === true,
      'sem local informado esta peneira não opina — quem recusa é a validação do campo, ' +
      'com a mensagem que ajuda a corrigir');

    /* A TRANCA esta no roteador, e nao so no seletor da tela. */
    const rot = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    const iLan = rot.indexOf('var localAj = L.localDoAjuste(');
    const iMontar = rot.indexOf('var r = L.montarMovimento(');
    ok(iLan > 0 && iMontar > 0 && iLan < iMontar,
      'e o servidor recusa ANTES de montar o movimento — filtrar o seletor é ' +
      'conveniência, e um POST direto passa por cima dele', { recusa: iLan, monta: iMontar });
    /* `if (` colado na condicao, e nao a condicao solta: um `if (false && ...)` na frente
       dela deixa o texto inteiro no arquivo e a recusa morta. Procurar so a condicao
       encontrava as duas coisas. */
    ok(/if \(quem && localAj && !L\.podeAjustarEm\(quem, localAj\)\) \{/.test(rot),
      'e quem decide é o CADASTRO lido no servidor, não o que veio no pedido — e a ' +
      'condição é o `if` inteiro: um `false &&` na frente deixaria o texto no arquivo e a ' +
      'recusa morta');

    /* A coluna nasce no FIM das migracoes, e so uma vez. O id e comparado INTEIRO: um
       `indexOf` do pedaco aceitava qualquer id que apenas comecasse com ele. */
    const mig = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');
    const ids = (mig.match(/id: '[^']+'/g) || []).map((x) => x.slice(5, -1));
    /* A lista e append-only: a coluna nasce na migracao dela, e as novas entram DEPOIS.
       Mexer no meio reescreve historia que ja rodou em producao. */
    ok(ids.indexOf('2026-09-22-ajustes-por-local') >= 0,
      'e a coluna nasce numa migração própria, com o id exato', ids);
    ok(ids.indexOf('2026-09-22-ajustes-por-local') <
       ids.indexOf('2026-09-22-marcar-o-que-ja-valia'),
      'e vem ANTES da que preenche as listas — preencher `ajustes` numa coluna que ' +
      'ainda não existe é erro de SQL, e a migração para no meio', ids);
    ok(ids.length === new Set(ids).size,
      'e nenhum id de migração se repete — repetido, a segunda nunca roda e a coluna ' +
      'dela não existe no banco', ids.length - new Set(ids).size);

    /* ---- o tradutor do banco, nos DOIS sentidos ----------------------------
       Nada cobria o `_supabase.js`: a coluna podia deixar de ser lida ou de ser gravada
       e todo o resto continuava verde, porque os testes rodam sobre um banco falso que
       nao passa por ele. E o ponto exato em que uma permissao vira "nao fica salva". */
    const sup = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
    const iU = sup.indexOf('USUARIO');
    const trad = sup.slice(iU > 0 ? iU : 0);
    /* A LISTA DOS CAMPOS E' DERIVADA, e nao escrita aqui. Estava escrita — oito pares
       `[campo, coluna]` a mao — e por isso nao cresceu quando a lista `Retornos` nasceu:
       a permissao nova atravessou a tela, a sessao e a rota, e o unico lugar onde ela
       podia se perder de verdade (o tradutor do banco) ficou sem conferencia. Duas
       sabotagens escaparam por isso de uma vez.
       A FONTE E' `usuariosPublicos`, que e' quem decide o que volta para o painel: o que
       estiver la' atravessa o tradutor, ou nao fica salvo. */
    const logicaTxt = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
    const iPub = logicaTxt.indexOf('      Saidas: Array.isArray(u.Saidas)');
    const blocoPub = logicaTxt.slice(iPub, logicaTxt.indexOf('\n    };', iPub));
    const CAMPOS_LISTA = [...blocoPub.matchAll(/^ {6}(\w+): Array\.isArray\(u\.\1\)/gm)]
      .map((m) => m[1]);
    const paraColuna = (c) => c.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    ok(CAMPOS_LISTA.length >= 8 && CAMPOS_LISTA.includes('Retornos'),
      'a conferencia derivou de `usuariosPublicos` as listas que voltam para o painel — '
      + 'escrita a mao, ela nao cresce com a permissao nova e deixa justamente o '
      + 'tradutor do banco sem cobertura', CAMPOS_LISTA);
    CAMPOS_LISTA.map((c) => [c, paraColuna(c)]).forEach(([campo, coluna]) => {
      ok(new RegExp(campo + ':\\s*(lista\\(r\\.' + coluna + '\\)|Array\\.isArray\\(r\\.' + coluna + '\\))')
        .test(trad),
        campo + ': o tradutor LÊ a coluna `' + coluna + '` do banco — sem isto a marcação ' +
        'volta vazia e a gravação seguinte apaga o que estava salvo');
      ok(new RegExp('o\\.' + campo + ' !== undefined\\) r\\.' + coluna + ' =').test(trad),
        campo + ': e GRAVA nela — sem isto a marcação some no caminho de volta, sem erro');
    });

    /* ---- UMA LISTA DE PERMISSAO NAO NASCE VAZIA ----------------------------
       A regra da casa e' "nada marcado = nada liberado". Para uma permissao NOVA isso se
       vira contra a operacao: a coluna nasce `'[]'`, e no instante do deploy toda a
       equipe perde aquilo — nao porque alguem decidiu, mas porque ninguem tinha como
       ter marcado antes de a caixa existir. Uma permissao que TIRA o que ja' se fazia e'
       um apagao, nao um ajuste.
       ENTAO TODA MIGRACAO QUE CRIA UMA DESSAS COLUNAS TEM DE PREENCHE-LA na mesma
       migracao. A conta e' derivada do proprio arquivo: para cada coluna `jsonb` com
       default `'[]'` que nasce, tem de haver um `update` dela ali. */
    /* ---- APOSTROFO DENTRO DE STRING SQL DERRUBA A MIGRACAO, E COM ELA A API ----
     *
     * Aconteceu: o comentario de uma coluna terminava com "quem trocou e' quem esta'
     * dentro". Os dois apostrofos estao DENTRO de um literal de aspas simples — o
     * primeiro FECHA a string, e o resto vira sintaxe invalida. A migracao falha, e como
     * ela roda na primeira chamada depois do deploy, TODA rota passa a responder "Falha
     * ao atualizar o banco": a `equipe` volta vazia, o painel abre em branco, o app de
     * campo nao entra. Minutos de sistema fora do ar por um acento escrito a mao.
     *
     * A CONVENCAO DESTE PROJETO E' A ARMADILHA: escrever `e'` no lugar de `é` e' seguro
     * em comentario de JavaScript e fatal dentro de um literal do Postgres.
     *
     * AS LINHAS `--` SAEM DA CONTA: ali o apostrofo e' comentario de SQL e nao machuca,
     * e cobrar delas proibiria metade do portugues escrito nas migracoes. */
    const tortas = [];
    require(path.join(__dirname, '..', 'api', '_migracoes.js')).forEach((mg) => {
      const linhasSql = String(mg.sql || '').split(String.fromCharCode(10));
      const util = linhasSql.filter((l) => !/^\s*--/.test(l)).join(String.fromCharCode(10));
      if (((util.match(/'/g) || []).length) % 2 !== 0) tortas.push(mg.id + ' (impar)');
      /* E O LITERAL VAI ATE' O FIM: so' pela paridade, `'a' b 'c'` passaria. O que se
         cobra e' que entre o `is '` e o `';` final nao exista outro apostrofo. */
      const re = /is\s*'([^;]*)';/g;
      let m;
      while ((m = re.exec(util))) {
        if (m[1].indexOf(String.fromCharCode(39)) >= 0) {
          tortas.push(mg.id + ' (apostrofo dentro do texto)');
        }
      }
    });
    ok(!tortas.length,
      'nenhuma migracao tem apostrofo solto dentro de string SQL — ele FECHA o literal, '
      + 'a migracao falha, e como ela roda na primeira chamada depois do deploy TODA '
      + 'rota passa a responder erro: painel em branco e app de campo sem entrar',
      tortas);


    const nasce = {}, semeada = {};
    require(path.join(__dirname, '..', 'api', '_migracoes.js')).forEach((mg, ordem) => {
      const sql = String(mg.sql || '');
      const re = /add column if not exists (\w+) jsonb not null default '\[\]'::jsonb/g;
      let mm;
      while ((mm = re.exec(sql))) {
        /* SO' AS LISTAS DA PESSOA. Ha' colunas `jsonb` que nascem vazias com razao — o
           `historico` de um movimento comeca sem correcao nenhuma, e as `rotas` de um
           motorista sao vinculo, nao permissao. O que nao pode nascer vazio e' o que a
           regra "nada marcado = nada liberado" transforma em porta fechada. */
        const antes = sql.slice(Math.max(0, mm.index - 140), mm.index);
        if (!/public\.usuarios/.test(antes)) continue;
        if (nasce[mm[1]] === undefined) nasce[mm[1]] = ordem;
      }
      const re2 = /update public\.usuarios set (\w+) =/g;
      while ((mm = re2.exec(sql))) {
        if (semeada[mm[1]] === undefined) semeada[mm[1]] = ordem;
      }
    });
    const semSemente = Object.keys(nasce).filter(
      (c) => semeada[c] === undefined || semeada[c] < nasce[c]);
    ok(!semSemente.length,
      'toda lista de permissao criada vazia e preenchida por uma migracao posterior — '
      + '"nada marcado = nada liberado" vira apagao quando a caixa acabou de nascer: '
      + 'ninguem tinha como ter marcado antes dela existir, e a volta seria o '
      + 'administrador reabrir usuario por usuario',
      { semSemente: semSemente, nasce: nasce, semeada: semeada });

    /* OS DOIS SENTIDOS DAS COLUNAS NOVAS. O apelido e o nome completo atravessam o
       tradutor como qualquer outra coluna, e o defeito e o mesmo das de cima: deixar de
       LER faz o campo voltar vazio e a gravacao seguinte apagar o que estava salvo;
       deixar de GRAVAR faz o que a pessoa digitou sumir no caminho de volta, sem erro. */
    [['Apelido', 'apelido', 'MOTORISTA'],
     ['MotoristaNome', 'motorista_nome', 'MOV']
    ].forEach(([campo, coluna, onde]) => {
      ok(new RegExp(campo + ": r\\." + coluna).test(sup),
        onde + '.' + campo + ': o tradutor L\u00ca a coluna `' + coluna + '` — sem isto o ' +
        'campo volta vazio e a grava\u00e7\u00e3o seguinte apaga o que estava salvo');
      ok(new RegExp("(o\\." + campo + " !== undefined|pos\\('" + campo + "')").test(sup),
        onde + '.' + campo + ': e GRAVA nela — sem isto o que a pessoa digitou some no ' +
        'caminho de volta, sem erro nenhum');
    });
  }

  console.log('\n== a porta unica: uma tela, duas credenciais ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const conferir = (s, h) => s === 'senhalonga' && h === 'HASH';
    const gente = [{ ID: 'U1', Nome: 'Nestor', Usuario: 'nestor', Email: 'n@x.com',
                     Ativo: true, PIN: '123456', SenhaHash: 'HASH', Perfil: 'Gerente',
                     AcessoPainel: true }];

    /* A ORDEM IMPORTA: senha primeiro, PIN depois. Ao contrário, alguém cuja senha
       longa fosse por acaso seis dígitos entraria sempre como PIN e perderia o
       painel — sem erro nenhum, e sem entender por quê. */
    const s1 = F.loginUnico(gente, 'nestor', 'senhalonga', conferir);
    ok(s1.ok && s1.via === 'senha', 'a senha longa entra, e o login diz que foi por senha', s1.via);
    const s2 = F.loginUnico(gente, 'nestor', '123456', conferir);
    ok(s2.ok && s2.via === 'pin', 'o PIN de seis números entra, e o login diz que foi por PIN', s2.via);
    const iSenha = F.loginUnico.toString().indexOf('loginPorSenha');
    const iPin = F.loginUnico.toString().indexOf('loginPorPin');
    ok(iSenha > 0 && iPin > 0 && iSenha < iPin,
      'e a SENHA é tentada primeiro — na outra ordem, uma senha longa de seis dígitos ' +
      'entraria como PIN e perderia o painel', { senha: iSenha, pin: iPin });

    /* O mesmo identificador serve para os dois: e-mail, usuário ou nome. */
    ok(F.loginUnico(gente, 'n@x.com', 'senhalonga', conferir).ok,
      'e o identificador pode ser o e-mail — é a mesma porta para todo mundo');

    /* UMA MENSAGEM SO para os dois fracassos. Dizer qual das duas falhou contaria a
       quem estivesse testando se aquele identificador existe, e com que credencial. */
    const err1 = F.loginUnico(gente, 'nestor', 'errado', conferir);
    const err2 = F.loginUnico(gente, 'naoexiste', 'senhalonga', conferir);
    ok(!err1.ok && !err2.ok && err1.erro === err2.erro,
      'segredo errado e usuário inexistente dão a MESMA recusa — mensagens diferentes ' +
      'contam a quem está testando se aquele identificador existe',
      { segredoErrado: err1.erro, naoExiste: err2.erro });
    ok(!err1.via && !err2.via,
      'e a recusa não diz por qual credencial ela falhou');

    ok(!F.loginUnico(gente, '', '123456', conferir).ok, 'sem identificador não entra');
    ok(!F.loginUnico(gente, 'nestor', '', conferir).ok, 'e sem segredo também não');
    /* A guarda do vazio nao e enfeite: sem ela o segredo vazio cai no `loginPorPin`,
       que tem OUTRA mensagem de recusa — e a diferenca de texto e justamente o que
       conta a quem esta testando qual credencial aquele usuario tem. */
    const fonte = F.loginUnico.toString();
    ok(/!String\(ident == null \? '' : ident\)\.trim\(\) \|\| !texto/.test(fonte),
      'e recusa o vazio ANTES de olhar a lista — caindo no PIN, a recusa mudaria de ' +
      'texto, e a diferença conta qual credencial aquele usuário tem', fonte.slice(0, 300));

    /* A ROTA continua aceitando os campos antigos: ha telas em cache e fila offline
       que ainda mandam `senha` ou `pin`, e recusa-las tirava gente do ar no deploy. */
    const rot = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    ok(/if \(p\.segredo !== undefined\) return L\.loginUnico/.test(rot),
      'a rota usa a porta única quando a tela manda `segredo`');
    ok(/if \(p\.senha\) return L\.loginPorSenha/.test(rot) && /return L\.loginPorPin/.test(rot),
      'e ainda aceita os campos antigos — há tela em cache mandando `senha` ou `pin`, ' +
      'e recusá-la tirava gente do ar no dia do deploy');
  }

  console.log('\n== a matriz abre as listas ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    ok(F.pesoMatriz('Matriz Fazenda') === 0 && F.pesoMatriz('MATRIZ') === 0,
      'matriz pesa 0, em qualquer caixa');
    ok(F.pesoMatriz('Filial Ceasa') === 1 && F.pesoMatriz('') === 1, 'o resto pesa 1');

    const locais = [
      { ID: 'A', Nome: 'Filial Ceasa', Tipo: 'GALPAO' },
      { ID: 'B', Nome: 'Matriz Fazenda', Tipo: 'GALPAO' },
      { ID: 'C', Nome: 'Matriz Teste', Tipo: 'GALPAO' },
      { ID: 'D', Nome: 'Almoxarifado', Tipo: 'GALPAO' }
    ];
    const p = F.painel({ locais, tipos: [], movimentos: [], usuarios: [], config: {} },
      new Date('2026-09-20T00:00:00'));
    const nomes = p.galpoes.map((g) => g.nome);
    ok(nomes[0] === 'Matriz Fazenda',
      'no quadro de galpões a matriz vem primeiro, mesmo com "Almoxarifado" antes no alfabeto', nomes);
    ok(nomes[nomes.length - 1] === 'Matriz Teste',
      'e a matriz de ensaio continua por último: o peso do teste manda mais', nomes);
  }


  console.log('\n== escolher teste no lançamento: sobe, nunca desce ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const base = { tipo: 'AJUSTE', destinoId: 'L1', itens: [{ tipoCaixaId: 'P', qtd: 10 }] };
    const fazer = (p, ctxTeste) => F.montarMovimento(
      Object.assign({}, base, p),
      { movimentos: [], agora: D('2026-09-16'), teste: ctxTeste }).linhas[0].Teste;

    ok(fazer({}, false) === false, 'perfil real, sem pedir nada: lançamento real');
    ok(fazer({ teste: true }, false) === true,
      'perfil real pedindo teste: vira teste — é o escritório ensaiando');
    ok(fazer({ teste: 'true' }, false) === true, 'e aceita a string, que é como o form manda');
    ok(fazer({}, true) === true, 'perfil de ensaio, sem pedir nada: continua teste');
    ok(fazer({ teste: false }, true) === true,
      'perfil de ensaio pedindo REAL: continua teste — o cadastro é o piso e não se rebaixa');
    ok(fazer({ teste: 'false' }, true) === true, 'nem pela string');
  }


  console.log('\n== filtro de exclusão: origem e destino separados ==');
  {
    const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
    const D = (iso) => new Date(iso + 'T00:00:00');
    const locais = [{ ID: 'G1', Nome: 'Matriz' }, { ID: 'R1', Nome: 'Caruaru' }, { ID: 'R2', Nome: 'Natal' }];
    const tipos = [{ ID: 'P', Nome: 'CX P' }];
    const users = [{ ID: 'U1', Nome: 'Ana' }, { ID: 'U2', Nome: 'Bia' }];
    const mv = (id, o, d, u, dia) => ({
      ID: id, Tipo: 'SAIDA', OrigemID: o, DestinoID: d, TipoCaixaID: 'P', Qtd: 1,
      Status: 'CONFIRMADO', UsuarioID: u, Perfil: 'Gestor', DataRef: D(dia), DataHora: D(dia)
    });
    const movs = [
      mv('M1', 'G1', 'R1', 'U1', '2026-09-01'),
      mv('M2', 'G1', 'R2', 'U2', '2026-09-05'),
      mv('M3', 'R1', 'G1', 'U1', '2026-09-10')
    ];
    const ids = (f) => F.listaMovimentos(movs, locais, tipos, users, f).map((m) => m.id).sort().join(',');

    ok(ids({}) === 'M1,M2,M3', 'sem filtro, tudo');
    ok(ids({ origem: 'G1' }) === 'M1,M2',
      'origem prende só quem SAIU de lá — M3 chegou em G1 e não entra', ids({ origem: 'G1' }));
    ok(ids({ destino: 'G1' }) === 'M3', 'destino prende só quem CHEGOU lá', ids({ destino: 'G1' }));
    ok(ids({ local: 'G1' }) === 'M1,M2,M3',
      'e `local` continua casando nas duas pontas, que é outra pergunta', ids({ local: 'G1' }));
    ok(ids({ usuario: 'U2' }) === 'M2', 'por quem lançou');
    ok(ids({ origem: 'G1', usuario: 'U1' }) === 'M1', 'os critérios se somam, não se substituem');
    ok(ids({ de: '2026-09-05' }) === 'M2,M3', 'por período');
    ok(ids({ origem: 'R2' }) === '', 'filtro que não casa com nada devolve vazio, e não tudo');
  }

  /* ---------------------------------------------------------------------------
 * O que a tela LISTA e o que o servidor APAGA tem de nascer da mesma base.
 *
 * ESTE CABECALHO ESTAVA AQUI SOZINHO. Ele terminava em "aqui se compara as duas listas"
 * e nao havia nenhuma comparacao abaixo dele — uma promessa sem prova atras. Foi por
 * esse buraco que o defeito passou: `limparMovimentos` copiava com cuidado a lista de
 * FILTROS, campo a campo, e nao copiava RECORTE nenhum.
 *
 * O ESCRITORIO VIU O EFEITO: a tela mostrava 47 lancamentos do periodo e o servidor
 * respondia "agora sao 353". Os 306 a mais eram declaracao e o que estava fora da
 * unidade e da base de quem pediu — linhas que aquela tela nunca mostrou. A unica
 * coisa que impedia o apagar de leva-las era a conferencia do numero esperado, que e'
 * uma rede de seguranca e nao a regra: bastava a conta bater por coincidencia.
 *
 * AS DUAS LISTAS SAO COMPARADAS RODANDO, e nao lendo o codigo: a leitura ja' dizia que
 * os filtros batiam — e batiam mesmo.
 * ------------------------------------------------------------------------- */
console.log('\n== o que a tela lista e o que o apagar leva sao o mesmo conjunto ==');
{
  /* UMA DECLARACAO DENTRO DO PERIODO, que e' o caso que separa as duas contas.
     Declaracao nao e' movimento de caixa e NAO aparece em Movimentos para ninguem —
     nem para o administrador. Contada pelo apagar, ela some sem nunca ter estado a
     vista. */
  const umDia = tabelas.movimentos[0] && tabelas.movimentos[0].data_ref;
  const vivos = tabelas.movimentos.filter((m) => !m.excluido_em && !m.cancelado_em);
  const molde = vivos[0];
  ok(!!molde, 'ha lan\u00e7amento para o cen\u00e1rio desta compara\u00e7\u00e3o');

  const DECL = Object.assign({}, molde, {
    id: 'M-decl-comparar', registro: 'R-decl-comparar', declaracao: true,
    base: 'declaracao', historico: [], excluido_em: null, cancelado_em: null
  });
  tabelas.movimentos.push(DECL);

  const admin = tabelas.usuarios.find((u) => String(u.perfil).toUpperCase() === 'ADMIN');
  ok(!!admin, 'ha um administrador no cen\u00e1rio \u2014 \u00e9 ele que usa este bot\u00e3o');
  /* O LIVRO DA DECLARACAO ENTRA NO CADASTRO DELE, e isto nao e' afrouxar a prova: a
     base vem do cadastro e nao ha excecao nem para o administrador — escrito assim de
     proposito em `recorteBases`, depois de uma excecao que fez a tela afirmar duas
     coisas opostas ao mesmo tempo. O admin de VERDADE deste escritorio tem o livro
     marcado, e e' por isso que ele enxerga as declaracoes no app de campo. Sem marcar
     aqui, as provas abaixo passariam verdes medindo um recorte que apagou tudo antes
     de chegar na pergunta. */
  const basesAntes = { d: admin.base_declaracao, p: admin.base_producao,
                       t: admin.teste };
  /* OS TRES LIVROS JUNTOS, e nao so' o da declaracao: marcar um SO' deixa a pessoa com
     aquele — `basesEfetivas` devolve os marcados, e o padrao `['reais']` vale apenas
     para quem nao marcou nenhum. Marcando so' a declaracao, o administrador deixaria de
     ver o movimento comum, e a prova mediria uma tela vazia. */
  admin.base_declaracao = true;
  admin.base_producao = true;
  admin.teste = true;

  const naTela = await GET({ acao: 'movimentos', quem: admin.id, limit: 100000 });
  const idsTela = (naTela.movimentos || []).map((m) => m.id);
  ok(idsTela.indexOf('M-decl-comparar') < 0,
    'a declara\u00e7\u00e3o n\u00e3o aparece em Movimentos nem para o administrador \u2014 ela n\u00e3o \u00e9 ' +
    'movimento de caixa, e sem este ponto de partida a compara\u00e7\u00e3o abaixo n\u00e3o mede nada',
    idsTela.length);

  /* ---- E O PAINEL TAMBEM NAO A CONTA. RODADO, pela rota de verdade. ----
   *
   * UMA DECLARACAO NAO E UMA CAIXA QUE ANDOU: e' o motorista dizendo o que traz, e a
   * caixa so' entra quando o conferente conta. Contada no painel, cada carga entraria
   * DUAS vezes — no Retorno, no estoque e no aging — para quem tem a Base Declaracao
   * no cadastro, que e' justamente quem apresenta o painel ao cliente.
   *
   * QUEM PROTEGE ISSO E `ativos`, e nao a rota: a funcao que separa "as linhas que
   * VALEM" de "as linhas que EXISTEM" ja' tira a declaracao, e o painel, os saldos e o
   * aging passam todos por ela. A lista de Movimentos usa a outra — ela MOSTRA o que
   * aconteceu, com a declaracao marcada — e por isso ha' duas funcoes com uma
   * diferenca de uma condicao, que e' o tipo de par que se desfaz sem ninguem notar.
   *
   * EU FUI ATRAS DESTA HIPOTESE achando que era a causa das 1.889, e nao era: cheguei a
   * acrescentar `semDeclaracao` na rota do painel, medi, e a peneira nao mudava numero
   * nenhum — porque `ativos` ja' tinha feito o trabalho. Tirei o recorte: um recorte
   * que nao faz nada, com um comentario dizendo que conserta uma contagem dobrada, e'
   * uma historia falsa escrita dentro do codigo, e a proxima pessoa acredita nela.
   * O QUE FICOU FOI A PROVA, porque a garantia e' de verdade e nao tinha nenhuma.
   *
   * ================= O CENARIO PRECISOU DE UM CONTROLE =================
   *
   * A PRIMEIRA VERSAO DESTA PROVA passou verde com a protecao DESFEITA, duas vezes
   * seguidas e por dois motivos diferentes: primeiro porque clonou `vivos[0]`, que era
   * um AJUSTE sem origem e nao entra no fluxo por caminho nenhum; depois porque a copia
   * herdava o PERFIL de quem lancou e caia num livro que o cadastro do administrador
   * nao tinha marcado. Nos dois casos a linha sumia ANTES da pergunta, e a prova
   * afirmava uma regra tendo medido uma peneira errada.
   *
   * ENTAO O CENARIO VEM COM UM CONTROLE: a MESMA linha, com a unica diferenca de nao
   * ser declaracao, TEM de mexer no total. Sem ele nao ha como distinguir "a declaracao
   * foi ignorada" de "este cenario nao e' capaz de mudar numero nenhum". */
  const comPontas = tabelas.movimentos.filter((m) => !m.excluido_em && !m.cancelado_em &&
    m.origem_id && m.destino_id && !m.declaracao);
  const molde2 = comPontas[0];
  ok(!!molde2,
    'o cen\u00e1rio tem um lan\u00e7amento com as DUAS pontas \u2014 um ajuste sem origem n\u00e3o entra ' +
    'no fluxo por caminho nenhum, e clonar um faria esta prova medir uma coincid\u00eancia',
    molde2 && molde2.id);

  /* O QUARTO LIVRO TAMBEM. A linha clonada herda o PERFIL de quem lancou, e
     `lancamentoDeTeste` le' esse perfil: a copia marcada como declaracao cai em
     "Base Teste Declaracao", e nao em "Base Declaracao". Sem este livro no cadastro,
     `recorteBases` derrubava a linha ANTES de a pergunta ser feita — e a prova passava
     verde com a correcao desfeita, medindo a peneira errada.
     FOI A SEGUNDA VEZ NESTE MESMO CENARIO: antes era o molde, que era um AJUSTE sem
     origem. Um cenario que nao consegue mudar o numero aprova qualquer regra, e o
     CONTROLE logo abaixo e' o que obriga ele a provar que consegue. */
  const livroAntes = admin.base_teste_declaracao;
  admin.base_teste_declaracao = true;

  const QTD_DECL = 777;
  const linhaNova = (id, ehDecl) => Object.assign({}, molde2, {
    id: id, registro: 'R' + id, tipo: 'DEVOLUCAO',
    qtd: QTD_DECL, qtd_conferida: null,
    declaracao: ehDecl, base: ehDecl ? 'declaracao' : 'reais',
    historico: [], excluido_em: null, cancelado_em: null
  });

  const totaisDoPainel = async () => {
    const r = await GET({ acao: 'painel', quem: admin.id });
    return r.painel && r.painel.fluxo && r.painel.fluxo.totais;
  };
  const estoqueDoPainel = async () => {
    const r = await GET({ acao: 'painel', quem: admin.id });
    return (r.painel.locais || []).reduce((s, l) => s + (Number(l.saldo) || 0), 0);
  };

  const tSem = await totaisDoPainel();
  const eSem = await estoqueDoPainel();
  ok(!!tSem && (tSem.saida + tSem.retorno) > 0,
    'o painel respondeu e h\u00e1 movimento nele \u2014 recorte vazio faria as provas abaixo ' +
    'aprovarem qualquer coisa', tSem && tSem.retorno);

  /* O CONTROLE PRIMEIRO: a linha comum MEXE no total. */
  const COMUM = linhaNova('M-fluxo-comum', false);
  tabelas.movimentos.push(COMUM);
  const tComum = await totaisDoPainel();
  tabelas.movimentos.splice(tabelas.movimentos.indexOf(COMUM), 1);
  ok(tComum.retorno === tSem.retorno + QTD_DECL,
    'uma devolu\u00e7\u00e3o comum de 777 MEXE no Retorno do painel \u2014 sem este controle, a ' +
    'prova abaixo n\u00e3o distingue "a declara\u00e7\u00e3o foi ignorada" de "este cen\u00e1rio n\u00e3o ' +
    'muda n\u00famero nenhum", que foi exatamente como ela passou verde com a corre\u00e7\u00e3o ' +
    'desfeita', { sem: tSem.retorno, com: tComum.retorno });

  /* E AGORA A MESMA LINHA, so' que declaracao. */
  const DECL_FLUXO = linhaNova('M-fluxo-decl', true);
  tabelas.movimentos.push(DECL_FLUXO);
  const tCom = await totaisDoPainel();
  const eCom = await estoqueDoPainel();
  tabelas.movimentos.splice(tabelas.movimentos.indexOf(DECL_FLUXO), 1);

  ok(tCom.retorno === tSem.retorno,
    'e a MESMA linha, sendo declara\u00e7\u00e3o, n\u00e3o mexe em nada \u2014 contada, cada carga ' +
    'entraria duas vezes no Retorno para quem tem a Base Declara\u00e7\u00e3o no cadastro, e o ' +
    'painel de quem apresenta ao cliente diria outro n\u00famero que o do gerente de ' +
    'filial sobre a mesma opera\u00e7\u00e3o', { sem: tSem.retorno, com: tCom.retorno });
  ok(tCom.saida === tSem.saida && tCom.saldo === tSem.saldo,
    'e a Sa\u00edda e o Saldo tamb\u00e9m n\u00e3o \u2014 a declara\u00e7\u00e3o some da conta inteira, e n\u00e3o s\u00f3 ' +
    'de um lado dela', { sem: [tSem.saida, tSem.saldo], com: [tCom.saida, tCom.saldo] });
  ok(eCom === eSem,
    'e o estoque dos locais fica igual \u2014 ele sai do mesmo recorte, e uma declara\u00e7\u00e3o ' +
    'contada ali enchia o galp\u00e3o de caixa que ningu\u00e9m conferiu',
    { sem: eSem, com: eCom });
  admin.base_teste_declaracao = livroAntes;

  /* E O APAGAR CONTA O MESMO. Mandando o numero que a TELA contou, o servidor so'
     concorda se a base dele for a mesma: contando a declaracao a mais, ele responde "a
     lista mudou: agora sao N+1" — que foi exatamente o que o escritorio leu. */
  const mandado = await POST({ acao: 'limparMovimentos', usuarioId: admin.id,
                               esperado: idsTela.length, senha: '123456' });
  ok(mandado.ok === true,
    'e o apagar conta o MESMO n\u00famero que a tela \u2014 contando linhas que aquela tela ' +
    'nunca mostrou, ele responde "a lista mudou: agora s\u00e3o N", e o bot\u00e3o fica ' +
    'impass\u00e1vel para sempre: foi esse o relato do escrit\u00f3rio', mandado.erro);
  ok(mandado.apagados === idsTela.length,
    'e leva exatamente os que ela mostrava \u2014 um a mais \u00e9 uma linha que some sem ' +
    'ningu\u00e9m a ter visto, e este bot\u00e3o leva centenas de uma vez',
    [mandado.apagados, idsTela.length]);

  const declDepois = tabelas.movimentos.find((m) => m.id === 'M-decl-comparar');
  ok(declDepois && !declDepois.excluido_em,
    'e a declara\u00e7\u00e3o continua l\u00e1 \u2014 era ela a diferen\u00e7a entre as duas contas, e ' +
    'apagada junto sumiria de uma concilia\u00e7\u00e3o que ningu\u00e9m mandou mexer',
    declDepois && declDepois.excluido_em);

  /* ---- E A DECLARACAO PODE SAIR, MAS SO DE PROPOSITO ----
   *
   * O escritorio apagou o periodo inteiro e duas linhas ficaram na tela: eram
   * declaracoes, e o apagar deixou de alcanca-las no dia em que passou a ler a mesma
   * base da tela. Estava certo nao alcanca-las por ACIDENTE; faltava poder alcanca-las
   * de proposito.
   *
   * A TRANCA NAO E O PEDIDO, E O DIREITO. `comDeclaracao` diz a INTENCAO de quem clicou;
   * `veDeclaracao` diz se aquela pessoa pode. Sem a segunda pergunta, a contagem cega
   * cairia por um campo no corpo do POST — e nenhuma tela precisaria estar errada para
   * isso acontecer: bastaria alguem montar o pedido a mao. */
  (naTela.movimentos || []).forEach((m) => {
    const linha = tabelas.movimentos.find((x) => x.id === m.id);
    if (linha) { linha.excluido_em = null; linha.excluido_por = null; }
  });

  const semDirteito = tabelas.usuarios.find((u) =>
    String(u.perfil).toUpperCase() !== 'ADMIN' &&
    !(u.abas || []).some((a) => String(a).indexOf('ancamentoMotorista') > 0 ||
                                String(a).indexOf('ancamentosMotorista') > 0));
  ok(!!semDirteito,
    'h\u00e1 no cen\u00e1rio algu\u00e9m SEM a aba de declara\u00e7\u00e3o \u2014 sem ele a prova mais ' +
    'importante deste bloco n\u00e3o teria em quem medir',
    semDirteito && semDirteito.usuario);

  /* ---- 1. CONTAR NAO PEDE SENHA, e devolve so' o NUMERO ---- */
  const contou = await POST({ acao: 'limparMovimentos', contar: true,
                              usuarioId: admin.id });
  ok(contou.ok === true && typeof contou.quantos === 'number',
    'contar responde o n\u00famero sem pedir senha \u2014 contar n\u00e3o muda nada, e exigir a ' +
    'senha para saber quantos s\u00e3o faria a tela n\u00e3o conseguir montar a confirma\u00e7\u00e3o que ' +
    'a pr\u00f3pria senha vai proteger', contou.erro);
  ok(contou.movimentos === undefined && contou.ids === undefined,
    'e devolve s\u00f3 o n\u00famero, nunca as linhas \u2014 devolvendo-as, esta porta sem senha ' +
    'viraria a leitura que a rota de Movimentos recusa, inclusive das declara\u00e7\u00f5es',
    Object.keys(contou));

  /* ---- 2. O PADRAO E SEM DECLARACAO ---- */
  const semPedir = await POST({ acao: 'limparMovimentos', contar: true,
                                usuarioId: admin.id });
  const comPedir = await POST({ acao: 'limparMovimentos', contar: true,
                                usuarioId: admin.id, comDeclaracao: true });
  ok(comPedir.quantos === semPedir.quantos + 1,
    'pedindo as declara\u00e7\u00f5es, a conta sobe exatamente pela declara\u00e7\u00e3o plantada \u2014 e ' +
    'sem pedir ela fica de fora: o caso comum \u00e9 limpar movimento, e inclu\u00ed-las por ' +
    'padr\u00e3o levaria embora o que ningu\u00e9m mandou tocar',
    [semPedir.quantos, comPedir.quantos]);
  ok(comPedir.comDeclaracao === true,
    'e a resposta CONFIRMA que elas entraram \u2014 respondida s\u00f3 com o n\u00famero, a tela ' +
    'anunciaria "com as declara\u00e7\u00f5es" sobre um apagar que n\u00e3o as leva');

  /* ---- 2b. E A CONTA DIZ QUANTAS DECLARACOES O FILTRO ALCANCA ----
   *
   * O ESCRITORIO APAGOU "TUDO" TRES VEZES e as mesmas duas linhas continuaram no app de
   * campo. O caminho para leva-las existia — a caixa "incluir as declaracoes" —, mas ela
   * mora dentro da gaveta de filtros, fechada, ao lado do botao. Um caminho que a pessoa
   * nao acha e' um caminho que nao existe.
   * ENTAO A CONTA PASSOU A DIZER QUANTAS FICAM, e a tela avisa. Sem este numero o aviso
   * nao tem o que dizer, e a tela volta a responder "nenhum lancamento casa com este
   * filtro" com duas linhas casando. */
  ok(semPedir.declaracoesDeFora === 1,
    'contando SEM as declara\u00e7\u00f5es, a resposta diz quantas ficaram de fora \u2014 sem este ' +
    'n\u00famero a tela n\u00e3o tem como avisar, e foi a falta do aviso que fez o escrit\u00f3rio ' +
    'apagar "tudo" tr\u00eas vezes com as mesmas duas linhas de p\u00e9',
    semPedir.declaracoesDeFora);
  ok(comPedir.declaracoesDeFora === 0,
    'e pedindo-as, n\u00e3o fica nenhuma de fora \u2014 repetido o n\u00famero com a caixa marcada, ' +
    'a confirma\u00e7\u00e3o mandaria somar duas vezes a mesma declara\u00e7\u00e3o',
    comPedir.declaracoesDeFora);

  /* ---- 3. E O PEDIDO SO VALE PARA QUEM TEM O DIREITO ----
     Esta e' a prova que guarda a contagem cega. O conferente conta a carga SEM saber o
     numero que o motorista declarou; um pedido que ele mesmo montasse, com o campo
     ligado, nao pode lhe dizer sequer QUANTAS declaracoes existem. */
  const alheio = await POST({ acao: 'limparMovimentos', contar: true,
                              usuarioId: semDirteito.id, comDeclaracao: true });
  ok(alheio.comDeclaracao === false,
    'quem N\u00c3O v\u00ea declara\u00e7\u00e3o pede e n\u00e3o recebe \u2014 a tranca \u00e9 o DIREITO no cadastro, e ' +
    'n\u00e3o o pedido: fosse o pedido, a contagem cega cairia por um campo no corpo do ' +
    'POST, sem nenhuma tela precisar estar errada', alheio.comDeclaracao);

  const idsDele = (await GET({ acao: 'movimentos', quem: semDirteito.id,
                               limit: 100000 })).movimentos || [];
  /* E SEM PEDIR NADA TAMBEM NAO: era este o caso que vazava. Medido so' com o pedido
     ligado, a guarda `podeVer` podia cair inteira sem a prova notar — com o pedido
     ligado a conta da' zero de qualquer jeito, e a prova media uma coincidencia. */
  const alheioCalado = await POST({ acao: 'limparMovimentos', contar: true,
                                    usuarioId: semDirteito.id });
  ok(alheioCalado.declaracoesDeFora === 0,
    'e a quem N\u00c3O v\u00ea declara\u00e7\u00e3o a conta n\u00e3o diz quantas existem nem quando ele n\u00e3o ' +
    'pergunta \u2014 o n\u00famero de declara\u00e7\u00f5es de um per\u00edodo j\u00e1 \u00e9 parte do que a contagem ' +
    'cega esconde: quem conta a carga saberia que h\u00e1 falas de motorista guardadas ' +
    'naquele dia', alheioCalado.declaracoesDeFora);
  ok(alheio.declaracoesDeFora === 0,
    'e a ele a resposta n\u00e3o conta nem QUANTAS existem \u2014 o n\u00famero de declara\u00e7\u00f5es de ' +
    'um per\u00edodo j\u00e1 \u00e9 parte do que a contagem cega esconde: quem conta a carga saberia ' +
    'que h\u00e1 duas falas de motorista guardadas naquele dia', alheio.declaracoesDeFora);
  ok(alheio.quantos === idsDele.length,
    'e a conta dele continua sendo a do que ELE v\u00ea \u2014 um n\u00famero maior j\u00e1 contaria ' +
    'quantas declara\u00e7\u00f5es existem, que \u00e9 metade do que a contagem cega esconde',
    [alheio.quantos, idsDele.length]);

  /* ---- 4. E A ROTA DE MOVIMENTOS NUNCA ACEITA O PEDIDO ----
     Ela e' a leitura, e la' a declaracao nao e' questao de permissao: ela nao e'
     movimento de caixa, e contava a mesma carga duas vezes nos cartoes. */
  const forcado = await GET({ acao: 'movimentos', quem: admin.id, limit: 100000,
                              comDeclaracao: true });
  ok(((forcado.movimentos || []).filter((m) => m.id === 'M-decl-comparar')).length === 0,
    'e a rota de Movimentos n\u00e3o traz declara\u00e7\u00e3o nem pedida na m\u00e3o \u2014 l\u00e1 ela n\u00e3o \u00e9 ' +
    'permiss\u00e3o, \u00e9 aus\u00eancia: ela contava a mesma carga duas vezes nos cart\u00f5es de Sa\u00edda, ' +
    'Retorno e Saldo', (forcado.movimentos || []).length);

  /* ---- 5. E APAGANDO DE VERDADE, ELA SAI ---- */
  const levou = await POST({ acao: 'limparMovimentos', usuarioId: admin.id,
                             esperado: comPedir.quantos, comDeclaracao: true,
                             senha: '123456' });
  ok(levou.ok === true && levou.apagados === comPedir.quantos,
    'e o apagar leva o n\u00famero que ele mesmo contou \u2014 contado por uma porta e apagado ' +
    'por outra, as duas divergem: foi assim que a tela mostrou 47 e o servidor achou 353',
    levou.erro || levou.apagados);
  const declFim = tabelas.movimentos.find((m) => m.id === 'M-decl-comparar');
  ok(declFim && declFim.excluido_em,
    'e a declara\u00e7\u00e3o foi junto desta vez \u2014 era o pedido: apagar tudo e n\u00e3o sobrar ' +
    'linha nenhuma na tela do app de campo', declFim && declFim.excluido_em);

  /* De volta ao que estava: o cenario continua depois daqui. */
  tabelas.movimentos.forEach((m) => { m.excluido_em = null; m.excluido_por = null; });
  tabelas.movimentos = tabelas.movimentos.filter((m) => m.id !== 'M-decl-comparar');
  admin.base_declaracao = basesAntes.d;
  admin.base_producao = basesAntes.p;
  admin.teste = basesAntes.t;
  void umDia;
}
/* ---------------------------------------------------------------------------
 * Quem chama a correcao entrega todo mapa de nome que ela usa.
 *
 * `montarCorrecao` cai no valor cru quando o mapa nao veio — de proposito, para nao
 * estourar. O preco e que esquecer um mapa nao da erro nenhum: a correcao grava certo e o
 * historico guarda "origem: de L001 para L016", que e justamente a linha que ninguem
 * consegue conferir depois. Aqui se compara a lista com o que o endpoint entrega.
 * ------------------------------------------------------------------------- */
console.log('\n== a correcao recebe um mapa de nomes para cada campo ==');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  const ini = src.indexOf('var CORRIGIVEIS = [');
  const lista = src.slice(ini, src.indexOf('];', ini));
  const mapas = {};
  (lista.match(/mapa: '([a-z]+)'/g) || []).forEach((t) => { mapas[t.split("'")[1]] = 1; });
  const precisa = Object.keys(mapas);
  ok(precisa.length >= 3, 'a leitura achou os mapas que os campos pedem', precisa);

  const idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  const j = idx.indexOf('L.montarCorrecao(');
  const chamada = idx.slice(j, idx.indexOf('});', j));
  const faltam = precisa.filter((m) => chamada.indexOf(m + ':') < 0);
  ok(faltam.length === 0,
    'o endpoint entrega um mapa para cada um — senão o histórico guarda o id cru', faltam);
}

/* ---------------------------------------------------------------------------
 * A lista de status que a tela oferece e a MESMA que o servidor escreve.
 *
 * `SITUACOES` alimenta o filtro de Status; `rotuloCiclo` decide o rotulo de cada linha.
 * Duas listas sobre a mesma regra divergem no primeiro rotulo novo — e ai o filtro
 * oferece algo que nao existe, ou esconde algo que existe. A varredura abaixo cobre TODA
 * combinacao de tipo e ciclo, que e um espaco pequeno o bastante para ser exaustivo.
 * ------------------------------------------------------------------------- */
console.log('\n== a lista de status e a mesma dos dois lados ==');
{
  /* O `F` la de cima esta preso ao bloco dele; aqui a regra vem do modulo. */
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const TIPOS = ['SAIDA', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'AJUSTE'];
  const CICLOS = [undefined, {}, { cheio: true }, { parcial: true },
                  { cheio: true, parcial: true }];
  const produzidos = {};
  TIPOS.forEach((t) => CICLOS.forEach((c) => { produzidos[F.rotuloCiclo({ Tipo: t }, c)] = 1; }));

  const sobrando = Object.keys(produzidos).filter((r) => F.SITUACOES.indexOf(r) < 0);
  ok(sobrando.length === 0,
    'todo rótulo que o servidor escreve está na lista que a tela oferece — senão a linha ' +
    'aparece com um status que nenhum filtro alcança', sobrando);

  const inalcancaveis = F.SITUACOES.filter((r) => !produzidos[r]);
  ok(inalcancaveis.length === 0,
    'e toda opção do filtro é alcançável — opção que nunca acha nada só engana',
    inalcancaveis);

  ok(F.SITUACOES.length >= 6, 'a varredura achou os rótulos mesmo, não uma lista vazia',
    F.SITUACOES);
}

/* ---------------------------------------------------------------------------
 * O filtro de status roda no SERVIDOR, antes do corte de 500 linhas.
 *
 * O status nao esta no movimento — sai do ciclo da carga. Filtra-lo na tela mostraria so
 * os "Parcial" que por acaso couberam nas 500 primeiras linhas, e a pessoa concluiria que
 * so existem esses.
 * ------------------------------------------------------------------------- */
console.log('\n== o filtro de status recorta a lista ==');
{
  const F = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const D = (iso) => new Date(iso + 'T00:00:00');
  const locais = [{ ID: 'L1', Nome: 'Galpão', Tipo: 'GALPAO' },
                  { ID: 'C1', Nome: 'Cliente', Tipo: 'CLIENTE' }];
  const tipos = [{ ID: 'T1', Nome: 'CX' }];
  const movs = [
    { ID: 'M1', Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'C1', TipoCaixaID: 'T1',
      Qtd: 100, DataRef: D('2026-09-10'), DataHora: D('2026-09-10') },
    { ID: 'M2', Tipo: 'SAIDA', OrigemID: 'L1', DestinoID: 'C1', TipoCaixaID: 'T1',
      Qtd: 50, DataRef: D('2026-09-11'), DataHora: D('2026-09-11') },
    { ID: 'M3', Tipo: 'DEVOLUCAO', OrigemID: 'C1', DestinoID: 'L1', TipoCaixaID: 'T1',
      Qtd: 100, DataRef: D('2026-09-12'), DataHora: D('2026-09-12') },
    { ID: 'M4', Tipo: 'AJUSTE', DestinoID: 'L1', TipoCaixaID: 'T1',
      Qtd: 30, DataRef: D('2026-09-13'), DataHora: D('2026-09-13') }
  ];
  const todos = F.listaMovimentos(movs, locais, tipos, [], {});
  const porStatus = {};
  todos.forEach((m) => { porStatus[m.situacao] = (porStatus[m.situacao] || 0) + 1; });
  /* O cenario precisa ter status DIFERENTES, senao filtrar por um devolveria a lista
     inteira e o teste passaria sem testar. */
  ok(Object.keys(porStatus).length >= 3,
    'o cenário tem status diferentes — com um só, filtrar não distinguiria nada',
    porStatus);

  const dev = F.listaMovimentos(movs, locais, tipos, [], { situacao: 'Devolvida' });
  ok(dev.length > 0 && dev.every((m) => m.situacao === 'Devolvida'),
    'filtrando por Devolvida sobram só as devolvidas', dev.map((m) => m.id + ':' + m.situacao));
  ok(dev.length < todos.length, 'e sobram MENOS do que sem filtro', [dev.length, todos.length]);

  const aj = F.listaMovimentos(movs, locais, tipos, [], { situacao: 'Ajuste' });
  ok(aj.length === 1 && aj[0].id === 'M4', 'e por Ajuste sobra o ajuste', aj.map((m) => m.id));

  ok(F.listaMovimentos(movs, locais, tipos, [], { situacao: 'Perda' }).length === 0,
    'status sem nenhuma linha devolve vazio, e não a lista inteira');

  /* O corte de 500 vem DEPOIS do filtro: com limite 1, filtrar por Ajuste ainda tem de
     achar o ajuste, mesmo ele sendo a ultima linha da ordenacao. */
  const comLimite = F.listaMovimentos(movs, locais, tipos, [], { situacao: 'Ajuste', limit: 1 });
  ok(comLimite.length === 1 && comLimite[0].id === 'M4',
    'o filtro roda ANTES do corte — filtrado na tela, o status sumiria com a paginação',
    comLimite.map((m) => m.id));
}

console.log('\n== o filtro de apagar conhece todos os campos do de listar ==');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  const ini = src.indexOf('function listaMovimentos(');
  /* O fim e a PROXIMA declaracao de topo depois dela. Fatiar ate um nome fixo ja deu
     errado aqui: cicloDaCarga fica ANTES de listaMovimentos, o recorte saiu vazio, e a
     varredura nao achou campo nenhum — o que passaria como "nada faltando". */
  const corpo = src.slice(ini, src.indexOf('\nfunction ', ini + 10));
  if (corpo.length < 500) throw new Error('recorte de listaMovimentos ficou curto demais');
  // todo `p.<campo>` que a lista consulta, menos os que nao sao recorte
  /* `agora` não é recorte: é o relógio com que a lista calcula o prazo do conserto
     livre. Repassá-lo ao apagar não mudaria o conjunto apagado — e cobrá-lo aqui faria
     esta afirmação, que existe para pegar FILTRO esquecido, falhar por um campo que
     filtro nenhum é. */
  const fora = { limit: 1, teste: 1, agora: 1 };
  const campos = {};
  (corpo.match(/\bp\.([a-zA-Z]+)/g) || []).forEach((m) => {
    const k = m.slice(2);
    if (!fora[k]) campos[k] = 1;
  });

  const idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  const j = idx.indexOf('var filtro = {');
  const literal = idx.slice(j, idx.indexOf('};', j));

  const faltando = Object.keys(campos).filter((k) => literal.indexOf(k + ':') < 0);
  ok(faltando.length === 0,
    'limparMovimentos repassa todo campo de recorte que listaMovimentos entende', faltando);
  ok(Object.keys(campos).length >= 7,
    'e a leitura achou os campos mesmo — não uma lista vazia que passaria por engano',
    Object.keys(campos));
  ok(literal.indexOf('teste:') >= 0,
    'inclusive o recorte real/teste, que tem valor padrão e não apareceria na varredura');
}

{
  console.log('\n== a frota: a placa é cadastro, e é escolhida no lançamento ==');
  const mig = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');
  const sup = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
  const log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  const db2 = require('../api/_supabase.js');
  const L2 = require('../api/_logica.js');

  ok(/id: '2026-09-24-veiculos'/.test(mig) &&
     /create table if not exists public\.veiculos/.test(mig),
    'a frota tem tabela própria — a placa era campo do motorista, e isso dizia que ' +
    'cada motorista tem um carro e cada carro um motorista');

  /* A MESMA FORMA DOS DOIS LADOS. O índice único do banco compara a placa sem hífen,
     sem espaço e em caixa alta. Se a GRAVAÇÃO normalizasse de outro jeito, o banco
     aceitaria duas linhas que a tela mostra como iguais — e o relatório por veículo
     dividiria a rota do mesmo carro em duas. */
  ok(/on public\.veiculos \(upper\(replace\(replace\(placa, '-', ''\), ' ', ''\)\)\)/.test(mig),
    'e a placa é única pela forma NORMALIZADA, não pelo texto cru');
  ok(db2.placaLimpa('abc-1d23') === 'ABC1D23' && db2.placaLimpa(' ABC 1D23 ') === 'ABC1D23',
    'e a gravação normaliza do mesmo jeito que o índice compara — duas regras ' +
    'diferentes deixam o banco aceitar duas linhas que a tela mostra iguais',
    db2.placaLimpa('abc-1d23') + ' / ' + db2.placaLimpa(' ABC 1D23 '));

  /* A PLACA NO MOVIMENTO É TEXTO, como o motorista e pela mesma razão: repintar ou
     apagar um veículo não pode reescrever o que já saiu do galpão. */
  ok(/alter table public\.movimentos add column if not exists veiculo text;/.test(mig) &&
     /pos\('Veiculo', 'veiculo', nulo\);/.test(sup),
    'o movimento guarda a PLACA como texto, e não um id — o histórico não muda quando ' +
    'o cadastro muda');
  /* CASADA NO TEXTO, esta prova defendia a LINHA `String(p.veiculo||'').replace(` — e
     caiu no dia em que a regra saiu dali para um lugar só, sem que nada tivesse
     quebrado. O que importa é a FORMA em que a placa entra, então ela é rodada. */
  const Fpl = require(path.join(__dirname, '..', 'api', '_logica.js'));
  ok(Fpl.placa('abc-1d23') === 'ABC1D23' && Fpl.placa('  son 1b00 ') === 'SON1B00' &&
     Fpl.placa(null) === '',
    'e ela entra no movimento já normalizada: gravada de um jeito e cadastrada de ' +
    'outro, o relatório por veículo listaria o mesmo carro duas vezes',
    [Fpl.placa('abc-1d23'), Fpl.placa('  son 1b00 ')]);
  /* A MESMA FORMA NOS DOIS CAMINHOS. O lançamento já normalizava; a correção nasceu
     depois e não normalizava. Duas grafias da mesma placa partem o carro em dois no
     relatório, com metade do total em cada. */
  const pedido = { tipo: 'SAIDA', origemId: 'L001', destinoId: 'L003', usuarioId: 'U001',
    veiculo: 'abc-1d23', itens: [{ tipoCaixaId: 'T001', qtd: 3 }] };
  const nasceu = Fpl.montarMovimento(pedido, { movimentos: [], agora: new Date() });
  ok(nasceu.ok && nasceu.linhas[0].Veiculo === 'ABC1D23',
    'o LANÇAMENTO grava a placa na forma única', nasceu.ok && nasceu.linhas[0].Veiculo);
  const arrumou = Fpl.montarCorrecao(
    { ID: 'M1', Veiculo: 'ABC1D23', DataRef: '2026-09-29' },
    { motivo: 'trocou de carro', usuarioId: 'U001', Veiculo: ' son-1b00 ' },
    new Date(), {}, { senhaOk: true });
  ok(arrumou.ok && arrumou.patch.Veiculo === 'SON1B00',
    'e a CORREÇÃO grava na mesma — escrita só no lançamento, a regra deixava a correção ' +
    'gravar `abc-1d23` ao lado de `ABC1D23`', arrumou.ok && arrumou.patch.Veiculo);
  const igual = Fpl.montarCorrecao(
    { ID: 'M1', Veiculo: 'ABC1D23', DataRef: '2026-09-29' },
    { motivo: 'conferindo', usuarioId: 'U001', Veiculo: 'abc-1d23' },
    new Date(), {}, { senhaOk: true });
  ok(igual.ok && igual.consulta === true,
    'e digitar a MESMA placa com outra grafia é consulta, e não correção — comparada ' +
    'crua, ela gravaria e o histórico registraria uma correção que não corrigiu nada',
    igual.ok && igual.entradas);

  /* O MOTORISTA HABITUAL É PADRÃO, NÃO REGRA — e o banco diz isso: apagar o motorista
     desfaz o hábito, não leva o veículo junto. */
  ok(/motorista_id text references public\.motoristas\(id\) on delete set null/.test(mig),
    'apagar um motorista desfaz o hábito, não apaga o veículo junto');

  const pubV = L2.veiculosPublicos([
    { ID: 'V1', Placa: 'ABC1D23', Modelo: 'HR', MotoristaID: 'D1', Obs: 'trocar o óleo', Ativo: true },
    { ID: 'V2', Placa: 'ZZZ9Z99', Ativo: false }
  ]);
  ok(pubV.length === 1 && pubV[0].ID === 'V1',
    'carro desativado não aparece para quem vai lançar hoje — mas continua no cadastro, ' +
    'porque o histórico aponta para ele', pubV.map((v) => v.ID));
  ok(pubV[0].Obs === undefined && pubV[0].MotoristaID === 'D1',
    'e o que sai é o que a saída usa: placa, modelo e o motorista habitual. A ' +
    'observação é anotação de oficina e fica no escritório', Object.keys(pubV[0]));

  ok(/Veiculos: 'veiculos'/.test(idx) && /Veiculos: 'V'/.test(idx) &&
     /acao === 'salvarVeiculo'/.test(idx),
    'e o cadastro tem rota, tabela e prefixo de id próprios — `D001` é motorista, ' +
    '`V001` é carro, e nenhum id vira o do outro');
  ok(/veiculos: L\.veiculosPublicos\(d\.veiculos\)/.test(idx),
    'a frota viaja na rota pública, que é a que o celular lê');

  /* ---- IDA E VOLTA PELO BANCO, para TODAS as listas de permissão ----------
   * Duas sabotagens da frota passaram verdes: apagar a leitura e apagar a gravação de
   * `veiculos` no mapeador do banco não reprovava nada. E o buraco não era da frota —
   * NENHUMA das listas tinha essa conferência. Marcar placas, salvar e ver tudo sumir
   * na volta é o tipo de defeito que só aparece com o usuário na frente.
   *
   * A ida e volta cobra as duas pontas de uma vez: o que `para()` escreve no banco,
   * `de()` tem de ler de volta. */
  const LISTAS_PERM = [
    ['Saidas', 'saidas'], ['Destinos', 'destinos'], ['TiposCaixa', 'tipos_caixa'],
    ['Motoristas', 'motoristas'], ['Veiculos', 'veiculos']
  ];
  LISTAS_PERM.forEach(([chave, coluna]) => {
    const entra = {}; entra[chave] = ['X1', 'X2'];
    const linha = db2.USUARIO.para(entra);
    const volta = db2.USUARIO.de(Object.assign({ id: 'U1', nome: 'A' }, linha));
    ok(Array.isArray(linha[coluna]) && linha[coluna].length === 2,
      chave + ': a marcação vai para a coluna `' + coluna + '` do banco', linha[coluna]);
    ok(Array.isArray(volta[chave]) && volta[chave].length === 2,
      chave + ': e volta de lá — sem a volta, a pessoa marca, salva, e encontra tudo ' +
      'em branco na próxima abertura', volta[chave]);
  });
}

{
  console.log('\n== virar a base de varios usuarios de uma vez ==');

  /* O DIA DA VIRADA e o caso de uso: quando a validacao acaba, a equipe inteira sai da
     Base Teste junto. Um por um, trinta cadastros sao trinta chances de pular alguem —
     e quem fica para tras nao reclama: continua lancando em ensaio, e o saldo real fica
     faltando o que ele mandou.

     ESTE BLOCO RODA A ROTA, contra o banco falso. Lido no arquivo, o teste virava busca
     de nome: um `var faltam = []` — a conferencia vazia — deixava a rota gravar sem
     conferir nada e a leitura nao via diferenca alguma. Medido: escapou. */
  const nomes = ['Base Alfa', 'Base Beta', 'Base Gama'];
  for (const n of nomes) {
    await POST({ acao: 'salvarUsuario',
      registro: { Nome: n, Perfil: 'CONFERENTE', PIN: '445566' } });
  }
  const equipe = () => GET({ acao: 'equipe' }).then((r) => {
    const m = {};
    r.usuarios.forEach((u) => { m[u.Nome] = u; });
    return m;
  });
  let e = await equipe();
  const [alfa, beta, gama] = nomes.map((n) => e[n].ID);
  ok(e['Base Alfa'].Teste === false && e['Base Gama'].Teste === false,
    'os tres nascem na Base Producao', [e['Base Alfa'].Teste, e['Base Gama'].Teste]);

  const r1 = await POST({ acao: 'baseUsuarios', ids: [alfa, beta], teste: true });
  e = await equipe();
  ok(r1.ok === true && r1.mudados === 2,
    'dois viram Base Teste numa chamada so — e a rota diz quantos mudou', r1);
  ok(e['Base Alfa'].Teste === true && e['Base Beta'].Teste === true,
    'e a mudanca esta no banco, nao so na resposta',
    [e['Base Alfa'].Teste, e['Base Beta'].Teste]);
  ok(e['Base Gama'].Teste === false,
    'e quem nao foi marcado ficou onde estava — o lote e o lote, nao a tabela inteira',
    e['Base Gama'].Teste);

  /* O QUE MUDOU E O QUE JA ESTAVA LA, contados separados. Somados, "2 alterados" numa
     segunda chamada faria a pessoa procurar duas mudancas que nao houve. */
  const r2 = await POST({ acao: 'baseUsuarios', ids: [alfa, beta], teste: true });
  ok(r2.ok === true && r2.mudados === 0 && r2.jaEstavam === 2,
    'repetir a mesma virada nao grava ninguem de novo, e diz que os dois ja estavam la',
    r2);

  /* A TELA PODE ESTAR VELHA. Alguem apagou um cadastro enquanto a lista estava aberta, e
     os ids chegam com um fantasma no meio. Gravar o que da e responder "1 de 2" deixaria
     a pessoa sem saber QUAL ficou de fora — e a metade gravada e a pior das duas
     respostas, porque parece sucesso. */
  const r3 = await POST({ acao: 'baseUsuarios', ids: [alfa, 'NAO-EXISTE'], teste: false });
  e = await equipe();
  ok(r3.ok === false && /nao existem mais|não existem mais/.test(String(r3.erro)),
    'um id fantasma no meio recusa o lote inteiro e explica por que', r3);
  ok(e['Base Alfa'].Teste === true,
    'E NADA FOI GRAVADO: quem existia continua onde estava — a conferencia acontece ' +
    'antes da primeira escrita, e nao a cada linha',
    e['Base Alfa'].Teste);

  ok((await POST({ acao: 'baseUsuarios', ids: [], teste: true })).ok === false,
    'lote vazio recusa em vez de responder "0 alterados", que parece que funcionou');

  const muitos = [];
  for (let i = 0; i < 301; i++) muitos.push('U' + i);
  const r4 = await POST({ acao: 'baseUsuarios', ids: muitos, teste: true });
  ok(r4.ok === false && /301/.test(String(r4.erro)),
    'e um lote grande demais recusa dizendo o tamanho, antes de abrir o banco', r4);

  /* ---- AS DUAS BASES AO MESMO TEMPO ----
   *
   * E o caso que a coluna unica nao sabia dizer, e a razao de haver duas: quem valida
   * uma rotina nova lanca o ensaio E o dia de trabalho. Antes fazia isso trocando a
   * propria base para ca e para la, e um esquecimento no meio do dia mandava o
   * lancamento real para o ensaio. */
  const r5 = await POST({ acao: 'baseUsuarios', ids: [alfa], teste: true, producao: true });
  e = await equipe();
  ok(r5.ok === true && e['Base Alfa'].Teste === true &&
     e['Base Alfa'].BaseProducao === true,
    'o lote poe uma pessoa NAS DUAS bases de uma vez — e as duas voltam na leitura',
    [r5.ok, e['Base Alfa'].Teste, e['Base Alfa'].BaseProducao]);

  /* E TIRAR DE UMA DELAS TAMBEM E UM ESTADO INTEIRO. Se o lote so acrescentasse base,
     ninguem sairia do ensaio no dia da virada — que e o caso de uso desta rota. */
  const r6 = await POST({ acao: 'baseUsuarios', ids: [alfa], teste: false, producao: true });
  e = await equipe();
  ok(r6.ok === true && e['Base Alfa'].Teste === false &&
     e['Base Alfa'].BaseProducao === true,
    'e o lote seguinte TIRA do ensaio quem estava nas duas — um botao que so ' +
    'acrescentasse base nunca faria a virada',
    [e['Base Alfa'].Teste, e['Base Alfa'].BaseProducao]);

  /* NINGUEM FICA SEM BASE NENHUMA. Sem base, o lancamento cai na producao: desmarcar
     tudo teria o efeito de MARCAR Producao, que e o contrario do que quem desmarcou
     quis dizer. */
  const r7 = await POST({ acao: 'baseUsuarios', ids: [alfa], teste: false, producao: false });
  e = await equipe();
  ok(r7.ok === false && e['Base Alfa'].BaseProducao === true,
    'e o lote sem base nenhuma e recusado, sem gravar nada — sem base, o lancamento ' +
    'cairia justamente na producao', [r7.erro, e['Base Alfa'].BaseProducao]);

  const r8 = await POST({ acao: 'salvarUsuario',
    registro: { ID: alfa, Nome: 'Base Alfa', Perfil: 'CONFERENTE',
                Teste: false, BaseProducao: false } });
  e = await equipe();
  ok(r8.ok === false && e['Base Alfa'].BaseProducao === true,
    'e o cadastro sem base nenhuma tambem e recusado — a tela avisa na hora, e a rota ' +
    'recusa de novo porque atende pedido de qualquer origem', [r8.erro]);

  /* E QUEM CHAMA SEM O CAMPO NOVO continua querendo dizer o que dizia quando a base era
     uma so: `teste:true` era "para o ensaio e FORA da producao". Uma chamada velha que
     passasse a deixar a producao ligada poria em producao gente que alguem acabou de
     mandar para o ensaio. */
  const r9 = await POST({ acao: 'baseUsuarios', ids: [alfa], teste: true });
  e = await equipe();
  ok(r9.ok === true && e['Base Alfa'].Teste === true &&
     e['Base Alfa'].BaseProducao === false,
    'e a chamada sem o campo novo continua sendo exclusiva, como sempre foi',
    [e['Base Alfa'].Teste, e['Base Alfa'].BaseProducao]);

  /* ---- A TERCEIRA BASE: O QUE O MOTORISTA INFORMA NAO MEXE NO ESTOQUE ----
   *
   * Ele traz a carga e declara o total — tudo como CAIXAS DIVERSAS, porque nao separa
   * por tipo —, e quem conta de verdade e o conferente. As duas linhas existem, e so
   * uma vale.
   *
   * ESTA E A PROVA QUE IMPORTA: o saldo ANTES e DEPOIS da declaracao. Lida no codigo,
   * ela responderia "a palavra `declaracao` esta na peneira?" — e estaria, mesmo com a
   * peneira aplicada no lugar errado. A pergunta e outra: o estoque mexeu? */
  const saldoDe = async (local) => {
    const r = await GET({ acao: 'painel', quem: 'U001', teste: 'todos' });
    const l = (r.painel.locais || []).concat(r.painel.rotas || [], r.painel.galpoes || [])
      .filter((x) => String(x.id) === local)[0];
    return l ? Number(l.saldo || 0) : 0;
  };

  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Motorista Declarante',
    Perfil: 'MOTORISTA', PIN: '334455', Operacoes: ['SAIDA', 'RETORNO'],
    BaseProducao: false, BaseDeclaracao: true } });
  const declarante = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Motorista Declarante')[0];
  ok(!!declarante && declarante.BaseDeclaracao === true && declarante.BaseProducao === false,
    'a conferência criou alguém na Base Declaração — sem isso as provas abaixo mediriam ' +
    'um lançamento comum', declarante && [declarante.BaseDeclaracao, declarante.BaseProducao]);

  const antes = await saldoDe('L003');
  const decl = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003',
    destinoId: 'L001', itens: [{ tipoId: 'T001', qtd: 999 }], dataRef: dia(0),
    usuarioId: declarante.ID, clientKey: 'k-decl-1' });
  const depois = await saldoDe('L003');
  ok(decl.ok === true && depois === antes,
    'o que o motorista declara NAO mexe no estoque — 999 caixas lançadas por ele, e o ' +
    'saldo do cliente ficou onde estava', { antes: antes, depois: depois, gravou: decl.ok });

  /* E A LINHA EXISTE — mas NAO em Movimentos, e nem para o administrador.
     Ali ela entrava nos cartoes de Saida, Retorno e Saldo, que somam o que chega ate
     eles: a mesma carga contada duas vezes, uma pela contagem do conferente e outra
     pela fala do motorista. A porta dela e uma so. */
  const emMov = await GET({ acao: 'movimentos', quem: 'U001', limit: 500 });
  ok((emMov.movimentos || []).filter((m) => m.qtd === 999).length === 0,
    'a declaração NÃO aparece em Movimentos, nem para o administrador e nem pedindo ' +
    'tudo — ali ela entrava em Saída, Retorno e Saldo, e a mesma carga era contada duas ' +
    'vezes', (emMov.movimentos || []).filter((m) => m.qtd === 999).length);

  const pedindoDecl = await GET({ acao: 'movimentos', quem: 'U001', limit: 500,
    teste: 'declaracao' });
  ok((pedindoDecl.movimentos || []).filter((m) => m.qtd === 999).length === 0,
    'e nem pedindo a base de declaração na mão: não é uma opção escondida na tela, é ' +
    'uma rota que não devolve aquilo — escondida, bastaria alguém digitar o filtro',
    (pedindoDecl.movimentos || []).filter((m) => m.qtd === 999).length);

  const naPorta = await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'declaracao|testeDecl' });
  const minha = (naPorta.movimentos || []).filter((m) => m.qtd === 999)[0];
  ok(!!minha && minha.declaracao === true,
    'e a linha EXISTE, marcada, na porta da conciliação — só escondida em todo lugar, ' +
    'o relatório que compara declarado com conferido não teria o que comparar',
    minha && minha.declaracao);

  /* A BASE E OBRIGATORIA, e a rota RECUSA em vez de devolver tudo.
     Devolver tudo por omissao e dar permissao por esquecimento: hoje sao dois mundos, e
     no dia em que houver um terceiro quem nunca mexeu no filtro leria o terceiro
     tambem, sem ninguem ter decidido isso. */
  const semBase = await GET({ acao: 'conciliacao', quem: 'U001', limit: 500 });
  ok(semBase.ok === false && /Escolha a base/.test(String(semBase.erro || '')),
    'sem dizer a base, a conciliação é RECUSADA — devolvendo os dois livros por ' +
    'omissão, o terceiro que existir um dia abriria junto, calado',
    [semBase.ok, semBase.erro]);
  ok(!semBase.movimentos || semBase.movimentos.length === 0,
    'e a recusa não vem com dado dentro — uma resposta que diz "não pode" e manda a ' +
    'lista assim mesmo é pior do que não ter recusa nenhuma', semBase.movimentos);

  const baseInventada = await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'reais' });
  ok(baseInventada.ok === false,
    'e uma base que não é mundo de conciliação também é recusada, em vez de virar ' +
    '"todos" — "Base Produção" sozinha não tem declaração nenhuma para comparar, e ' +
    'trazer tudo seria a resposta mais errada possível para o pedido mais errado',
    [baseInventada.ok, baseInventada.erro]);

  ok((naPorta.movimentos || []).some((m) => m.declaracao !== true),
    'e essa porta traz os DOIS lados: a declaração do motorista E a contagem do ' +
    'conferente, que vivem em livros diferentes — só as declarações, metade de cada par ' +
    'faltaria e a tabela inteira diria "Só declaração"');

  /* A REMESSA NAO E QUITADA por uma declaracao. Esta e a armadilha mais silenciosa das
     tres: o motorista informa que trouxe, a carga aparece "Devolvida", e ninguem contou
     uma caixa. O mesmo perigo que o ensaio ja tinha — por isso a base entra na chave que
     casa devolucao com remessa.
     MEDIDO EM CIMA DE DOIS LANCAMENTOS FEITOS AQUI, e nao da base do teste: assim a
     conta nao depende do que os outros blocos deixaram gravado. E com o CONTROLE ao
     lado: sem ele, a prova passaria com uma funcao que nunca diz "Devolvida". */
  const Fl = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const remessa = () => ({ ID: 'S1', Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'L003',
    TipoCaixaID: 'T001', Qtd: 60, Status: 'CONFIRMADO',
    DataRef: new Date(2026, 0, 5), DataHora: new Date(2026, 0, 5) });
  const volta = (extra) => Object.assign({ ID: 'V1', Tipo: 'DEVOLUCAO', OrigemID: 'L003',
    DestinoID: 'L001', TipoCaixaID: 'T001', Qtd: 60, Status: 'CONFIRMADO',
    DataRef: new Date(2026, 0, 6), DataHora: new Date(2026, 0, 6) }, extra || {});

  const comReal = [remessa(), volta()];
  const cicloReal = Fl.cicloDaCarga(comReal);
  ok(Fl.rotuloCiclo(comReal[0], cicloReal.S1) === 'Devolvida',
    'uma devolução de verdade quita a remessa — sem este controle, a prova abaixo ' +
    'passaria com uma função que nunca diz "Devolvida"',
    Fl.rotuloCiclo(comReal[0], cicloReal.S1));

  const comDeclaracao = [remessa(), volta({ Declaracao: true })];
  const cicloDecl = Fl.cicloDaCarga(comDeclaracao);
  ok(Fl.rotuloCiclo(comDeclaracao[0], cicloDecl.S1) !== 'Devolvida',
    'e a MESMA volta, lançada como declaração, NÃO quita — senão a carga apareceria ' +
    'devolvida sem ninguém ter contado uma caixa',
    Fl.rotuloCiclo(comDeclaracao[0], cicloDecl.S1));

  /* ================= A DEVOLUCAO DE UM NAO QUITA A REMESSA DE OUTRO ============
   *
   * OS VINTE E OITO FORNECEDORES DIVIDEM UM LOCAL SO'. O destino da carga deles e' um
   * local chamado "Fornecedor", e quem e' quem vive na COLUNA `Fornecedor` da linha.
   * A fila que decide o Status casava devolucao com remessa por local, caixa e livro —
   * e ignorava a coluna. Com isso os vinte e oito eram uma fila so': a devolucao de um
   * quitava a remessa mais antiga, de quem quer que fosse.
   *
   * O ESCRITORIO VIU ISTO: saida de 300 CX P para o Geraldo, retorno ZERO, saldo -300,
   * e a coluna Status dizendo "Devolvida". O numero e o rotulo na mesma linha,
   * discordando um do outro.
   *
   * O CENARIO ABAIXO E O DA TELA, com os dois lados que a prova precisa separar. */
  const saidaForn = (quem, dia) => ({ ID: 'SF-' + quem, Tipo: 'SAIDA', OrigemID: 'L001',
    DestinoID: 'LFORN', TipoCaixaID: 'T001', Qtd: 300, Status: 'CONFIRMADO',
    Fornecedor: quem, DataRef: new Date(2026, 9, dia || 15),
    DataHora: new Date(2026, 9, dia || 15) });
  const voltaForn = (quem, qtd, dia) => ({ ID: 'VF-' + quem + '-' + (dia || 16),
    Tipo: 'DEVOLUCAO', OrigemID: 'LFORN', DestinoID: 'L001', TipoCaixaID: 'T001',
    Qtd: qtd, Status: 'CONFIRMADO', Fornecedor: quem,
    DataRef: new Date(2026, 9, dia || 16), DataHora: new Date(2026, 9, dia || 16) });

  /* O CONTROLE VEM PRIMEIRO: sem ele, tudo abaixo passaria com uma funcao que nunca
     diz "Devolvida" para fornecedor nenhum. */
  const soGeraldo = [saidaForn('Geraldo'), voltaForn('Geraldo', 300)];
  ok(Fl.rotuloCiclo(soGeraldo[0], Fl.cicloDaCarga(soGeraldo)['SF-Geraldo']) === 'Devolvida',
    'a devolu\u00e7\u00e3o DO MESMO fornecedor quita a remessa dele \u2014 sem este controle, as ' +
    'provas abaixo passariam com uma fun\u00e7\u00e3o que nunca diz "Devolvida"',
    Fl.rotuloCiclo(soGeraldo[0], Fl.cicloDaCarga(soGeraldo)['SF-Geraldo']));

  const outroVolta = [saidaForn('Geraldo'), voltaForn('Mundinho', 300)];
  const cicloOutro = Fl.cicloDaCarga(outroVolta);
  ok(Fl.rotuloCiclo(outroVolta[0], cicloOutro['SF-Geraldo']) === 'Enviada',
    'mas a devolu\u00e7\u00e3o de OUTRO fornecedor n\u00e3o quita a dele \u2014 os dois saem para o ' +
    'mesmo local, e sem o nome na chave a carga do Geraldo aparecia "Devolvida" com ' +
    'retorno zero e saldo -300 na mesma linha',
    Fl.rotuloCiclo(outroVolta[0], cicloOutro['SF-Geraldo']));

  /* E A DIVIDA DE CADA UM FICA INTEIRA. Nao basta o rotulo mudar: o que a cobranca le'
     e' o quanto voltou, e misturado ele some. */
  ok((cicloOutro['SF-Geraldo'] || {}).devolvido === 0,
    'e nada do Geraldo consta como devolvido \u2014 \u00e9 esse n\u00famero que a cobran\u00e7a l\u00ea, e ' +
    'misturado ele perdoaria uma d\u00edvida que ningu\u00e9m pagou',
    (cicloOutro['SF-Geraldo'] || {}).devolvido);

  /* DOIS FORNECEDORES, CADA UM COM A SUA — e nenhum empresta ao outro. Com um
     fornecedor so' no cenario, chavear pelo nome e nao chavear davam a mesma resposta. */
  /* A DO GERALDO E A MAIS ANTIGA, de proposito: e' ela que a fila pooled pegaria
     primeiro. Com as duas no mesmo dia, a ordem do empate decidia, e a prova passava
     sem o conserto por pura sorte do desempate. */
  const dois = [saidaForn('Geraldo', 15), saidaForn('Mundinho', 16),
                voltaForn('Mundinho', 300, 17)];
  const cDois = Fl.cicloDaCarga(dois);
  ok(Fl.rotuloCiclo(dois[0], cDois['SF-Geraldo']) === 'Enviada' &&
     Fl.rotuloCiclo(dois[1], cDois['SF-Mundinho']) === 'Devolvida',
    'e com dois fornecedores em pé, cada devolução acha a SUA remessa — pela ' +
    'fila antiga, a volta do Mundinho quitaria a saída do Geraldo só por ela ser a ' +
    'mais velha do local',
    [Fl.rotuloCiclo(dois[0], cDois['SF-Geraldo']),
     Fl.rotuloCiclo(dois[1], cDois['SF-Mundinho'])]);

  /* O PARCIAL CONTINUA SENDO PARCIAL dentro do nome certo. */
  const meio = [saidaForn('Geraldo'), voltaForn('Geraldo', 120)];
  ok(Fl.rotuloCiclo(meio[0], Fl.cicloDaCarga(meio)['SF-Geraldo']) === 'Parcial',
    'e voltando parte, a remessa do fornecedor fica "Parcial" \u2014 o nome na chave ' +
    'separa as filas, n\u00e3o troca a regra que l\u00ea cada uma',
    Fl.rotuloCiclo(meio[0], Fl.cicloDaCarga(meio)['SF-Geraldo']));

  /* DUAS GRAFIAS DO MESMO NOME SAO A MESMA DIVIDA. Partidas em duas filas, cada metade
     quitaria a outra pela metade — e o defeito voltaria com outra cara. */
  const grafia = [saidaForn('Geraldo'), voltaForn('  geraldo  ', 300)];
  ok(Fl.rotuloCiclo(grafia[0], Fl.cicloDaCarga(grafia)['SF-Geraldo']) === 'Devolvida',
    'e " geraldo " com espa\u00e7o e em caixa baixa quita a remessa de "Geraldo" \u2014 duas ' +
    'grafias partiriam a fila em duas, e o defeito voltaria com outra cara',
    Fl.rotuloCiclo(grafia[0], Fl.cicloDaCarga(grafia)['SF-Geraldo']));

  /* E A VIAGEM COMUM, SEM FORNECEDOR NENHUM, CONTINUA COMO ERA. A maior parte da
     operacao e' esta — rota para cliente, transferencia entre casas —, e um nome vazio
     dos dois lados tem de seguir casando. */
  const viagemComum = [{ ID: 'SC1', Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'L003',
      TipoCaixaID: 'T001', Qtd: 60, Status: 'CONFIRMADO',
      DataRef: new Date(2026, 0, 5), DataHora: new Date(2026, 0, 5) },
    { ID: 'VC1', Tipo: 'DEVOLUCAO', OrigemID: 'L003', DestinoID: 'L001',
      TipoCaixaID: 'T001', Qtd: 60, Status: 'CONFIRMADO',
      DataRef: new Date(2026, 0, 6), DataHora: new Date(2026, 0, 6) }];
  ok(Fl.rotuloCiclo(viagemComum[0], Fl.cicloDaCarga(viagemComum).SC1) === 'Devolvida',
    'e a viagem comum, sem fornecedor em ponta nenhuma, continua sendo quitada \u2014 \u00e9 a ' +
    'maior parte da opera\u00e7\u00e3o, e o nome na chave n\u00e3o pode travar a conta dela',
    Fl.rotuloCiclo(viagemComum[0], Fl.cicloDaCarga(viagemComum).SC1));

  /* E A CAIXA TAMBEM SEPARA AS FILAS. Nenhuma prova cobrava isto, e a sabotagem que
     tirou `TipoCaixaID` da chave passou batida: uma devolucao de CX G quitava uma
     remessa de CX P, e a cobranca por tipo — que e' como a caixa se cobra do
     fornecedor — perdoava a divida de um tipo com a devolucao de outro. */
  const outraCaixa = [saidaForn('Geraldo'),
    Object.assign(voltaForn('Geraldo', 300), { TipoCaixaID: 'T002' })];
  ok(Fl.rotuloCiclo(outraCaixa[0], Fl.cicloDaCarga(outraCaixa)['SF-Geraldo']) === 'Enviada',
    'e a devolução de OUTRO tipo de caixa também não quita — 300 CX G voltando não ' +
    'pagam 300 CX P, e é por tipo que a caixa se cobra do fornecedor',
    Fl.rotuloCiclo(outraCaixa[0], Fl.cicloDaCarga(outraCaixa)['SF-Geraldo']));

  /* O LIVRO CONTINUA MANDANDO, com o nome ao lado: uma declaracao do MESMO fornecedor
     tambem nao quita. As duas guardas moram na mesma chave, e uma nao pode ter
     apagado a outra. */
  const declForn = [saidaForn('Geraldo'), voltaForn('Geraldo', 300)];
  declForn[1].Declaracao = true;
  ok(Fl.rotuloCiclo(declForn[0], Fl.cicloDaCarga(declForn)['SF-Geraldo']) !== 'Devolvida',
    'e a declara\u00e7\u00e3o do PR\u00d3PRIO fornecedor segue sem quitar \u2014 as duas guardas moram ' +
    'na mesma chave, e a nova n\u00e3o pode ter apagado a antiga',
    Fl.rotuloCiclo(declForn[0], Fl.cicloDaCarga(declForn)['SF-Geraldo']));

  /* ================= O FORNECEDOR DA CARGA QUE TOCA UMA FILIAL ===============
   *
   * O escritorio pediu: escolhendo uma filial no destino, abrir uma caixa com os
   * fornecedores do cadastro. A filial recebe caixa que TEM DONO, e ate aqui nao havia
   * onde dizer de quem — a coluna `Fornecedor` so' era preenchida DERIVADA do motorista,
   * nas pernas que tocam o local de fornecedor.
   *
   * SAO DOIS CAMINHOS PARA UMA COLUNA SO', e e' de proposito que ela seja uma:
   *   DERIVADO  — a perna toca `PedeFornecedor`: o fornecedor E' o motorista.
   *   ESCOLHIDO — a perna toca uma FILIAL: quem leva as caixas do Geraldo para Maceio e'
   *               um motorista da casa, e o motorista nao responde a pergunta. */
  const LOC_FF = [
    { ID: 'L001', Nome: 'Matriz', Tipo: 'GALPAO' },
    { ID: 'L002', Nome: 'Filial Maceio', Tipo: 'FILIAL' },
    { ID: 'L003', Nome: 'Recife', Tipo: 'CLIENTE' },
    { ID: 'LFORN', Nome: 'Fornecedor', Tipo: 'FORNECEDOR', PedeFornecedor: true }
  ];
  const FORNS_FF = [{ ID: 'F1', Nome: 'Geraldo Fonseca', Apelido: 'Geraldo', Ativo: true }];
  const deriva = (p) => Fl.fornecedorDoMovimento(p, LOC_FF, FORNS_FF);

  ok(deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L002',
              fornecedorFilial: 'Geraldo' }) === 'Geraldo Fonseca',
    'indo para uma FILIAL, o fornecedor escolhido vira o nome do cadastro — era o ' +
    'pedido, e o motorista não responde essa pergunta: quem leva as caixas do Geraldo ' +
    'para Maceió é um motorista da casa',
    deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L002',
             fornecedorFilial: 'Geraldo' }));

  ok(deriva({ tipo: 'DEVOLUCAO', origemId: 'L002', destinoId: 'L001',
              fornecedorFilial: 'Geraldo' }) === 'Geraldo Fonseca',
    'e vale na VOLTA também, com a filial na origem — olhando só o destino, metade do ' +
    'ciclo ficaria sem dono');

  /* FORA DA FILIAL O PEDIDO NAO E LIDO. Esconder o campo na tela e' conveniencia; um
     POST montado a mao passa por cima dela, e a guarda tem de estar aqui. */
  ok(deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L003',
              fornecedorFilial: 'Geraldo' }) === '',
    'numa viagem que NÃO toca filial, o nome pedido é ignorado — esconder o campo na ' +
    'tela é conveniência, e um POST montado à mão passa por cima dela',
    deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L003',
             fornecedorFilial: 'Geraldo' }));

  /* E A LISTA E FECHADA CONTRA O CADASTRO. Nome livre vira grafia diferente do mesmo
     fornecedor, e o extrato parte um em dois. */
  ok(deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L002',
              fornecedorFilial: 'Quem Eu Quiser' }) === '',
    'e um nome fora do cadastro não entra — nome livre vira grafia diferente do mesmo ' +
    'fornecedor, e o extrato parte um em dois');

  /* A PONTA DE LONGE, E NAO AS DUAS. A Matriz Sao Vicente esta' cadastrada como tipo
     FILIAL — foi a tela que mostrou. Olhando as duas pontas, uma saida DA matriz para um
     CLIENTE aceitaria o nome de um fornecedor; e essa perna CRUZA a fronteira, entao ela
     contaria como divida dele. O campo nao aparece ali na tela, e esta guarda e' o que
     impede que ele apareca pela porta dos fundos. */
  ok(deriva({ tipo: 'SAIDA', origemId: 'L002', destinoId: 'L003',
              fornecedorFilial: 'Geraldo' }) === '',
    'saindo DE uma filial para um cliente, o nome pedido é ignorado — a pergunta é ' +
    'sobre a ponta de LONGE, e aceitar pela origem poria o nome do fornecedor numa ' +
    'entrega a cliente, que conta como dívida dele',
    deriva({ tipo: 'SAIDA', origemId: 'L002', destinoId: 'L003',
             fornecedorFilial: 'Geraldo' }));

  ok(deriva({ tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L002',
              fornecedorFilial: 'Geraldo' }) === '',
    'e voltando de um cliente PARA a filial também — no retorno a ponta de longe é a ' +
    'origem, e a nossa casa no destino não responde de quem é a carga',
    deriva({ tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L002',
             fornecedorFilial: 'Geraldo' }));

  ok(deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L002' }) === '',
    'e sem escolher nada a coluna fica vazia — a maior parte das transferências entre ' +
    'casas nossas não é de fornecedor nenhum');

  /* O CAMINHO ANTIGO CONTINUA INTEIRO: tocando o local de fornecedor, o nome sai do
     MOTORISTA e o pedido nao opina. */
  ok(deriva({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'LFORN',
              motorista: 'Geraldo', fornecedorFilial: 'Quem Eu Quiser' })
     === 'Geraldo Fonseca',
    'e na perna que toca o local de fornecedor o nome continua saindo do MOTORISTA, e o ' +
    'pedido não opina — o caminho novo não pode ter aberto uma porta no antigo');

  /* ---- E A PERNA INTERNA NAO INVENTA DIVIDA ----
   *
   * Matriz -> Filial Maceio e' transferencia entre casas NOSSAS: as caixas continuam em
   * casa, e ninguem passou a dever nada. Com o campo novo a linha agora DIZ de quem elas
   * sao — e sem a guarda esse registro viraria uma saida na conta do fornecedor,
   * inventando uma divida de caixas que ele nunca recebeu. */
  const MOV_FF = [
    { ID: 'FF1', Tipo: 'TRANSFERENCIA', OrigemID: 'L001', DestinoID: 'L002',
      TipoCaixaID: 'T1', Qtd: 300, Fornecedor: 'Geraldo Fonseca',
      DataRef: new Date(2026, 9, 20), DataHora: new Date(2026, 9, 20) },
    { ID: 'FF2', Tipo: 'SAIDA', OrigemID: 'L002', DestinoID: 'LFORN',
      TipoCaixaID: 'T1', Qtd: 300, Fornecedor: 'Geraldo Fonseca',
      DataRef: new Date(2026, 9, 21), DataHora: new Date(2026, 9, 21) }
  ];
  const fluxoFF = Fl.fluxoPorPessoa({ movimentos: MOV_FF, locais: LOC_FF,
    fornecedores: FORNS_FF, tipos: [{ ID: 'T1', Nome: 'CX P' }], usuarios: [],
    config: {} });
  const geraldoFF = (fluxoFF.fornecedores || [])[0];

  ok(geraldoFF && geraldoFF.saida === 300,
    'a conta do fornecedor soma SÓ a perna que cruza a fronteira da empresa: 300, e não ' +
    '600 — a transferência Matriz → Filial diz de quem são as caixas, mas elas ' +
    'continuam em casa e ninguém passou a dever nada',
    geraldoFF && geraldoFF.saida);

  ok(geraldoFF && (geraldoFF.linhas || []).length === 1,
    'e a gaveta dele mostra UMA linha, a que saiu de verdade — contando as duas, quem ' +
    'conferisse veria a mesma carga duas vezes com dois donos do mesmo nome',
    geraldoFF && (geraldoFF.linhas || []).length);

  /* ================= O DOCUMENTO DA CARGA ====================================
   *
   * O canhoto assinado e a foto moram num balde PUBLICO do armazenamento: quem tem o
   * endereco abre o arquivo, sem senha, para sempre. Ate aqui o Extrato imprimia esse
   * endereco direto na tabela — e com ele ia embora em todo HTML salvo, para ser aberto
   * depois por quem quer que tivesse o link.
   *
   * O QUE A SENHA TRANCA, DITO SEM EXAGERO: a ENTREGA do endereco, e nao o arquivo. O
   * arquivo continua aberto a quem JA tiver o link — fechar isso pede balde privado e
   * link assinado. Esta' escrito assim para que a prova nao prometa o que o codigo nao
   * faz. */
  const MOV_DOC = [{ ID: 'D1', Registro: 'R000500', Tipo: 'SAIDA', OrigemID: 'L001',
    DestinoID: 'L003', TipoCaixaID: 'T001', Qtd: 10,
    AssinaturaURL: 'https://balde/canhotos/canhoto-abc.jpg',
    FotoURL: 'https://balde/canhotos/foto-abc.jpg',
    DataRef: new Date(2026, 9, 20), DataHora: new Date(2026, 9, 20) },
    { ID: 'D2', Registro: 'R000501', Tipo: 'SAIDA', OrigemID: 'L001',
      DestinoID: 'L003', TipoCaixaID: 'T001', Qtd: 20,
      DataRef: new Date(2026, 9, 20), DataHora: new Date(2026, 9, 20) }];
  const LOC_DOC = [{ ID: 'L001', Nome: 'Matriz' }, { ID: 'L003', Nome: 'Recife' }];
  const linhasDoc = Fl.listaMovimentos(MOV_DOC, LOC_DOC, [{ ID: 'T001', Nome: 'CX P' }],
    [], {}, { motoristas: [], fornecedores: [] });

  ok(JSON.stringify(linhasDoc).indexOf('balde/canhotos') < 0,
    'o ENDEREÇO do documento não viaja mais na lista — impresso na tabela, ele ia para ' +
    'toda tela aberta e para todo HTML salvo, e o arquivo abre sem senha para quem ' +
    'tiver o link', JSON.stringify(linhasDoc).slice(0, 120));

  const comDoc = linhasDoc.filter((l) => l.id === 'D1')[0];
  const semDoc = linhasDoc.filter((l) => l.id === 'D2')[0];
  ok(comDoc.temAssinatura === true && comDoc.temFoto === true &&
     semDoc.temAssinatura === false && semDoc.temFoto === false,
    'e no lugar dele vai um SIM ou NÃO — é o que deixa a tela não oferecer um botão que ' +
    'pediria a senha para depois responder "este lançamento não tem foto"',
    [comDoc.temFoto, semDoc.temFoto]);

  ok(comDoc.assinatura === undefined && comDoc.foto === undefined,
    'e os campos antigos sumiram de vez — deixados ao lado dos novos, a tela velha ' +
    'continuaria lendo o endereço e a porta com senha seria enfeite',
    Object.keys(comDoc).filter((k) => k === 'foto' || k === 'assinatura'));

  /* E O EXTRATO SEGUE A MESMA REGRA. Ele era o UNICO lugar que imprimia o endereco, e
     deixa-lo de fora faria a porta nova conviver com a porta velha aberta ao lado. */
  const extDoc = Fl.extrato({ movimentos: MOV_DOC, locais: LOC_DOC,
    tipos: [{ ID: 'T001', Nome: 'CX P' }], usuarios: [], config: {} }, 'L003');
  ok(JSON.stringify(extDoc).indexOf('balde/canhotos') < 0,
    'e o extrato também não leva o endereço — era ele o único lugar que o imprimia, e ' +
    'deixá-lo de fora faria a porta nova conviver com a velha aberta ao lado',
    JSON.stringify(extDoc).slice(0, 120));

  /* ================= QUEM CONFERE A CHEGADA ==================================
   *
   * NAO E QUEM LANCA RETORNO, e essa confusao foi minha. A tela de Entrada nasceu
   * pedindo a operacao RETORNO, com o raciocinio de que "Entrada e Retorno gravam a
   * mesma coisa". Nao gravam: o Retorno LANCA uma carga, e a Entrada REESCREVE a
   * quantidade de uma carga que ja existe — ela diz quanto vale o que chegou, e essa
   * contagem vira o numero do estoque.
   *
   * O ESCRITORIO VIU O EFEITO NA TELA: um motorista habilitado so' a Retorno abriu a
   * Entrada e tinha diante de si o botao de conferir as cargas da matriz. */
  const quemConfere = (perfil) => Fl.podeConferirChegada({ Perfil: perfil });

  ok(quemConfere('GERENTE') && quemConfere('ADMIN') && quemConfere('CONFERENTE'),
    'conferente, gerente e admin conferem a chegada — é a mesma lista que o escritório ' +
    'já escolheu para "de quem o escritório aceita uma contagem"',
    ['GERENTE', 'ADMIN', 'CONFERENTE'].map(quemConfere));

  ok(!quemConfere('MOTORISTA') && !quemConfere('PROMOTOR') && !quemConfere(''),
    'e o MOTORISTA não — quem diz quanto vale o que chegou não pode ser quem trouxe: ' +
    'é a mesma contagem cega que governa a conciliação, dita para a outra ponta do ciclo',
    ['MOTORISTA', 'PROMOTOR', ''].map(quemConfere));

  ok(quemConfere('gerente') && quemConfere(' Gerente '),
    'e o cargo é lido sem caixa e sem espaço — o perfil é texto livre no cadastro, e ' +
    'uma pessoa não perde a função por causa de como alguém digitou a palavra');

  /* A RESPOSTA VAI MASTIGADA PARA A TELA, e nao a lista de perfis: escrita nos dois
     lugares, ela divergiria no primeiro papel que entrasse so' num — e o sintoma seria
     a aba aparecendo para quem o servidor recusa. */
  const pubConf = Fl.usuariosPublicos([{ ID: 'U1', Nome: 'A', Perfil: 'Gerente' },
                                       { ID: 'U2', Nome: 'B', Perfil: 'Motorista' }]);
  ok(pubConf[0].ConfereChegada === true && pubConf[1].ConfereChegada === false,
    'e a resposta vai MASTIGADA para a tela, e não a lista de perfis — repetida lá, ela ' +
    'divergiria no primeiro papel novo e a aba apareceria para quem o servidor recusa',
    [pubConf[0].ConfereChegada, pubConf[1].ConfereChegada]);

  /* ---- E A ROTA QUE GRAVA E CHAMADA DE VERDADE, com o pedido QUE A TELA MANDA ----
   *
   * ELA NUNCA FUNCIONOU PARA NINGUEM, e nenhuma prova notou. A rota procurava quem
   * pergunta em `p.quem` — o nome que `Q.lendo` acrescenta nas LEITURAS — e a tela
   * manda `usuarioId`, porque `Q.enviar` nao acrescenta nada. `acharUsuario` devolvia
   * nada, e a resposta era "seu perfil nao confere chegada de carga", dita ao
   * ADMINISTRADOR, que confere.
   *
   * O DEFEITO FICOU ESCONDIDO PORQUE A LISTA E UM GET e funcionava: a tela abria cheia,
   * e so' quem clicasse em "Confirmar contagem" descobria. E as provas que havia liam a
   * rota pelo TEXTO — nenhuma a CHAMAVA. Esta chama, e com o payload exato da tela:
   * `{ acao, contagens, usuarioId }`, sem `quem`. Escrito com `quem`, ela passaria
   * verde sobre a rota quebrada, que foi o que aconteceu por um dia inteiro. */
  {
    const quemG = tabelas.usuarios.find((u) => String(u.perfil).toUpperCase() === 'ADMIN');
    const fila = (await GET({ acao: 'aConferir', quem: quemG.id })).cargas || [];
    ok(fila.length > 0,
      'ha carga esperando confer\u00eancia para o cen\u00e1rio \u2014 sem ela esta prova mediria o ' +
      'nada', fila.length);

    const carga = fila[0];
    /* O MESMO FORMATO DE `contagemDaCarga`: um id e uma quantidade por linha. */
    const contagens = carga.linhas.map((l) => ({ id: l.id, qtd: Number(l.declarado) }));
    const gravou = await POST({ acao: 'conferirChegada', contagens: contagens,
                                usuarioId: quemG.id });
    ok(gravou.ok === true,
      'o administrador CONFERE a chegada \u2014 mandando `usuarioId`, que \u00e9 o que a tela ' +
      'manda: lido s\u00f3 `quem`, a rota responde "seu perfil n\u00e3o confere chegada de carga" ' +
      'para quem confere, e foi isso por um dia inteiro', gravou.erro);
    ok(gravou.conferido === carga.declarado && gravou.divergencia === 0,
      'e grava o que foi contado \u2014 a resposta devolve o conferido e a diferen\u00e7a: sem ' +
      'isso a tela diria "conferida" sem ter como mostrar o que mudou',
      [gravou.conferido, carga.declarado, gravou.divergencia]);

    /* E A CARGA SAI DA FILA. E' a prova de que a gravacao chegou ao banco: respondendo
       ok sem gravar, ela continuaria la' e a proxima pessoa contaria de novo. */
    const depois = (await GET({ acao: 'aConferir', quem: quemG.id })).cargas || [];
    ok(!depois.some((c) => c.registro === carga.registro),
      'e a carga SAI da fila \u2014 respondendo ok sem gravar, ela continuaria esperando e a ' +
      'pr\u00f3xima pessoa contaria a mesma carga de novo', depois.length);

    /* E QUEM NAO CONFERE CONTINUA RECUSADO, pelo mesmo caminho: sem esta metade, a
       prova acima passaria com uma rota que aceita qualquer um. */
    const motorista = tabelas.usuarios.find((u) =>
      String(u.perfil).toUpperCase() === 'MOTORISTA');
    if (motorista) {
      const negado = await POST({ acao: 'conferirChegada', contagens: contagens,
                                  usuarioId: motorista.id });
      ok(negado.ok === false && /n\u00e3o confere chegada/.test(negado.erro || ''),
        'e quem N\u00c3O confere continua recusado \u2014 sem esta metade, a prova acima passaria ' +
        'com uma rota que aceita qualquer um', negado.erro);
    }
  }

  /* ---- A CARGA TRAZ O DESTINO, e a fila inteira vem sem casa escolhida ----
   *
   * "Conferindo em" deixou de ser exigencia e virou FILTRO: vazio, a fila vem de todas
   * as casas que a pessoa alcanca. Era o pedido do escritorio, que pensa "o que Sao
   * Vicente mandou" e nao "onde eu estou" — e a rota sempre soube fazer isso, porque
   * `if (casa && destino !== casa)` deixa tudo passar quando a casa nao vem.
   * E COM A FILA JUNTANDO CASAS, O DESTINO VIRA DADO OBRIGATORIO na resposta: sem ele a
   * tela imprime um travessao onde deveria dizer para onde a carga vai, e quem confere
   * conta a errada. */
  {
    const quemT = tabelas.usuarios.find((u) => String(u.perfil).toUpperCase() === 'ADMIN');
    const semCasa = (await GET({ acao: 'aConferir', quem: quemT.id })).cargas || [];
    ok(semCasa.length > 0,
      'sem casa escolhida, a fila vem com carga \u2014 vazia, a prova abaixo aprovaria uma ' +
      'rota que nunca devolve nada', semCasa.length);
    const semDestino = semCasa.filter((c) => !c.destino || !c.destinoId);
    ok(semDestino.length === 0,
      'e TODA carga diz para onde vai \u2014 juntando casas na mesma lista, uma carga sem ' +
      'destino \u00e9 uma linha que ningu\u00e9m consegue situar, e quem confere conta a errada',
      semDestino.slice(0, 3));
    /* E COM A CASA ESCOLHIDA, so' as dela: o filtro continua existindo e continua
       valendo — e' ele que a doca usa. */
    const umaCasa = semCasa[0].destinoId;
    const soDela = (await GET({ acao: 'aConferir', quem: quemT.id, local: umaCasa }))
      .cargas || [];
    ok(soDela.length > 0 && soDela.every((c) => String(c.destinoId) === String(umaCasa)),
      'e escolhida uma casa, s\u00f3 as dela \u2014 o campo deixou de ser exig\u00eancia, e n\u00e3o de ' +
      'funcionar: \u00e9 ele que a doca usa para ver s\u00f3 o que chegou ali',
      soDela.map((c) => c.destino).slice(0, 4));
  }

  /* ---- E A FILA RESPEITA O LIVRO DO CADASTRO, RODADA ----
   *
   * RELATO DO ESCRITORIO: entrou com o cadastro marcado em Base Teste Produ\u00e7\u00e3o e Base
   * Teste Declara\u00e7\u00e3o — que n\u00e3o t\u00eam lan\u00e7amento nenhum — e a tela de Entrada ofereceu
   * 55 cargas da Produ\u00e7\u00e3o para conferir. Conferida uma delas, a contagem seria gravada
   * num livro que aquela pessoa nem l\u00ea.
   *
   * A ROTA LIA SO' `recorteLancamentos`, sem `recorteBases` — a mesma corrente copiada
   * pela metade que o "apagar o que est\u00e1 no filtro" tinha. Medido aqui RODANDO, com o
   * mesmo cadastro trocando de livro entre as duas chamadas: lido no texto, o defeito
   * volta na pr\u00f3xima rota que nascer. */
  {
    const quem = tabelas.usuarios.find((u) => String(u.perfil).toUpperCase() === 'ADMIN');
    const antes = { p: quem.base_producao, t: quem.teste,
                    d: quem.base_declaracao, td: quem.base_teste_declaracao };

    quem.base_producao = true;
    quem.teste = false; quem.base_declaracao = false; quem.base_teste_declaracao = false;
    const comProducao = ((await GET({ acao: 'aConferir', quem: quem.id })).cargas || [])
      .map((c) => c.registro);

    /* O CADASTRO DO RELATO: so' os livros de TESTE, nenhum lancamento neles. */
    quem.base_producao = false;
    quem.teste = true; quem.base_teste_declaracao = true;
    const soTeste = ((await GET({ acao: 'aConferir', quem: quem.id })).cargas || [])
      .map((c) => c.registro);

    ok(comProducao.length > 0,
      'com a Base Produ\u00e7\u00e3o marcada, a fila de Entrada tem carga \u2014 vazia nos dois ' +
      'lados, a compara\u00e7\u00e3o abaixo aprovaria uma rota que nunca devolve nada',
      comProducao.length);
    const vazaram = soTeste.filter((r) => comProducao.indexOf(r) >= 0);
    ok(vazaram.length === 0,
      'e trocando o cadastro para os livros de TESTE, nenhuma carga da Produ\u00e7\u00e3o sobra ' +
      'na fila \u2014 foi este o relato: cadastro em Base Teste, sem lan\u00e7amento nenhum, e a ' +
      'tela oferecendo 55 cargas de outro livro para conferir', vazaram.slice(0, 5));

    quem.base_producao = antes.p; quem.teste = antes.t;
    quem.base_declaracao = antes.d; quem.base_teste_declaracao = antes.td;
  }

  /* ---- E AS DUAS ROTAS RECUSAM SOZINHAS ----
   * Esconder a aba e' conveniencia; um GET direto passa por cima dela. */
  (function () {
    var rotaC = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    var iL = rotaC.indexOf("case 'aConferir':");
    var trechoL = iL > 0 ? rotaC.slice(iL, iL + 420) : '';
    ok(/podeConferirChegada\(L\.acharUsuario\(d\.usuarios, p\.quem\)\)/.test(trechoL) &&
       /cargas: \[\]/.test(trechoL),
      'a rota que LISTA recusa com fila vazia — falha fechada, e vazia em vez de erro ' +
      'porque a tela a chama sozinha ao abrir: um erro ali pareceria falha do sistema ' +
      'para quem simplesmente não tem a função', trechoL.slice(0, 160));

    var iG = rotaC.indexOf('async function conferirChegada(p)');
    var corpoG = iG > 0 ? rotaC.slice(iG, rotaC.indexOf('\n}', iG)) : '';
    var iGuarda = corpoG.indexOf('podeConferirChegada');
    var iGrava = corpoG.indexOf("db.update('movimentos'");
    ok(iGuarda > 0 && iGrava > iGuarda,
      'e a rota que GRAVA recusa ANTES de tocar no banco — ela reescreve o número que ' +
      'vira estoque, e a recusa dela é explicada em vez de calada: muda, a tela diria ' +
      '"conferida" sobre uma carga que ninguém mexeu',
      { guarda: iGuarda, grava: iGrava });
  })();

  /* ================= A FILA DA DOCA: O QUE CHEGOU E NINGUEM CONTOU ==========
   *
   * O escritorio nunca conferiu uma chegada. Quando a matriz manda 500 para Maceio, o
   * estoque da filial sobe 500 — o numero que a MATRIZ disse. Chegando 480, ninguem
   * pega: a filial fica 20 acima para sempre, e nao havia tela que perguntasse.
   *
   * O CENARIO TEM UMA LINHA PARA CADA JEITO DE A CARGA NAO ENTRAR NA FILA. Com uma
   * carga so', "filtra" e "nao filtra" dao a mesma resposta. */
  const LOC_CH = [
    { ID: 'L001', Nome: 'Matriz', Tipo: 'GALPAO' },
    { ID: 'L002', Nome: 'Filial Maceio', Tipo: 'FILIAL' },
    { ID: 'L009', Nome: 'Filial Natal', Tipo: 'FILIAL' },
    { ID: 'L003', Nome: 'Recife', Tipo: 'ROTA' }
  ];
  const TIP_CH = [{ ID: 'T001', Nome: 'CX P' }, { ID: 'T002', Nome: 'CX G' }];
  /* A VIAGEM E DE UM DIA E O LANCAMENTO E DE OUTRO, de proposito. Com os dois iguais,
     trocar `DataHora` por `DataRef` da' a mesma resposta e a troca passa batida — foi
     assim que uma sabotagem escapou daqui. E' tambem o caso real: carga de ontem
     lancada hoje de manha. */
  const ch = (o) => Object.assign({ Tipo: 'TRANSFERENCIA', OrigemID: 'L001',
    DestinoID: 'L002', TipoCaixaID: 'T001', Qtd: 100, Motorista: 'Dinho',
    UsuarioID: 'U-nestor',
    DataRef: new Date(2026, 9, 20), DataHora: new Date(2026, 9, 21, 14, 35) }, o);

  const MOV_CH = [
    /* A CARGA QUE ESPERA: duas linhas, um registro. */
    ch({ ID: 'C1', Registro: 'R000900', Qtd: 300 }),
    ch({ ID: 'C2', Registro: 'R000900', Qtd: 200, TipoCaixaID: 'T002' }),
    /* JA CONTADA: sai da fila pela marca PROPRIA da chegada. */
    ch({ ID: 'C3', Registro: 'R000901', ChegadaConferidaEm: new Date(2026, 9, 21) }),
    /* PARA OUTRA CASA: nao e' desta doca. */
    ch({ ID: 'C4', Registro: 'R000902', DestinoID: 'L009' }),
    /* PARA UMA ROTA: nao chegou em casa nossa — o caminhao ainda esta' na rua. */
    ch({ ID: 'C5', Registro: 'R000903', DestinoID: 'L003' }),
    /* DECLARACAO: existe como linha e nao existe como movimento. Conta-la seria
       conferir a carga contra a palavra do motorista. */
    ch({ ID: 'C6', Registro: 'R000904', Declaracao: true }),
    /* CANCELADA: nao conta em nada. */
    ch({ ID: 'C7', Registro: 'R000905', Cancelado: true }),
    /* AJUSTE: nasce no escritorio e nao tem carga para contar. */
    ch({ ID: 'C8', Registro: 'R000906', Tipo: 'AJUSTE' }),
    /* A PERNA QUE NAO SAI DO LUGAR: nao chegou de parte nenhuma. */
    ch({ ID: 'C9', Registro: 'R000907', OrigemID: 'L002' }),
    /* E UMA MAIS VELHA, para a ordem ter o que provar. */
    ch({ ID: 'C0', Registro: 'R000899', Qtd: 50,
         DataRef: new Date(2026, 9, 18), DataHora: new Date(2026, 9, 18) })
  ];
  const USERS_CH = [{ ID: 'U-nestor', Nome: 'Nestor Neto' }];
  const fila = Fl.aConferirNaChegada(MOV_CH, LOC_CH, TIP_CH, USERS_CH, { local: 'L002' });
  const regsCh = fila.map((c) => c.registro).join(',');

  ok(regsCh === 'R000899,R000900',
    'a fila traz só o que chegou nesta casa e ninguém contou — fora dela: a já contada, ' +
    'a de outra filial, a que ainda está na rota, a declaração, a cancelada, o ajuste e ' +
    'a perna que não saiu do lugar', regsCh);

  /* A MAIS VELHA PRIMEIRO: e' a que espera ha mais tempo, e a fila da doca e' essa. Pela
     mais nova, a carga antiga desceria para o fim toda vez que uma nova chegasse, e
     nunca seria contada. */
  ok(fila[0].registro === 'R000899',
    'e a mais VELHA abre a fila — pela mais nova, a carga antiga desceria para o fim ' +
    'toda vez que uma nova chegasse, e nunca seria contada', regsCh);

  /* A CARGA, E NAO A LINHA. Um registro sao tres ou quatro linhas, uma por tipo de
     caixa, e quem esta na doca conta a viagem inteira de uma vez. */
  const cargaCh = fila.filter((c) => c.registro === 'R000900')[0];
  ok(cargaCh.linhas.length === 2 && cargaCh.declarado === 500,
    'e a carga vem INTEIRA, com as linhas dentro e o declarado somado — linha a linha, ' +
    'a mesma viagem viraria quatro perguntas iguais e a quarta seria respondida no ' +
    'automático', { linhas: cargaCh.linhas.length, declarado: cargaCh.declarado });
  /* QUEM LANCOU E QUANDO DIGITOU. A pedido do escritorio, e as duas sao perguntas
     diferentes da data da viagem: `dataRef` e' a do romaneio, e `DataHora` e' o instante
     em que alguem lancou. Uma carga de ontem lancada agora tem as duas respostas
     distantes, e e' a distancia que interessa a quem esta' na doca. */
  ok(cargaCh.lancadoPor === 'Nestor Neto',
    'a carga diz QUEM a lançou, pelo nome — um id ali não se confere com ninguém, e ' +
    'é esse nome que quem está na doca procura quando a conta não fecha',
    cargaCh.lancadoPor);
  ok(cargaCh.lancadoEm.indexOf('2026-10-21T14:35') === 0 &&
     cargaCh.dataRef.indexOf('2026-10-20') === 0,
    'a carga diz QUANDO foi digitada, com a hora — cortada em data, "lançado às 7h" e ' +
    '"lançado às 23h" viram a mesma resposta, e a segunda é a que explica a carga que ' +
    'chegou antes de existir no sistema', cargaCh.lancadoEm);
  ok(cargaCh.lancadoEm.slice(0, 10) !== cargaCh.dataRef.slice(0, 10),
    'e ela é o carimbo do LANÇAMENTO, e não a data da viagem repetida — a carga é de ' +
    '20/10 e foi digitada em 21/10 às 14h35, e é a distância entre as duas que explica ' +
    'a carga que chegou antes de existir no sistema',
    [cargaCh.dataRef, cargaCh.lancadoEm]);

  ok(cargaCh.linhas[0].caixa === 'CX P' && cargaCh.linhas[1].caixa === 'CX G',
    'e cada linha diz de que caixa é — um id ali não se confere olhando o palete',
    cargaCh.linhas.map((l) => l.caixa));

  /* SEM `local`, A FILA E DE TODAS AS CASAS. E' a convencao da casa, e e' o que deixa o
     escritorio ver a doca inteira. */
  ok(Fl.aConferirNaChegada(MOV_CH, LOC_CH, TIP_CH, [], {}).length === 3,
    'e sem dizer a casa a fila traz as de TODAS — a convenção daqui, e é o que deixa o ' +
    'escritório ver a doca inteira',
    Fl.aConferirNaChegada(MOV_CH, LOC_CH, TIP_CH, [], {}).map((c) => c.registro));

  /* ---- E A CONTAGEM GRAVA NA CARGA QUE EXISTE ---- */
  const gravou = Fl.montarConferenciaChegada(MOV_CH,
    [{ id: 'C1', qtd: 280 }, { id: 'C2', qtd: 200 }],
    { usuarioId: 'U1', agora: new Date(2026, 9, 22) });

  ok(gravou.ok && gravou.patches.length === 2,
    'a contagem monta um patch por linha da carga — uma chamada para a viagem inteira, ' +
    'e não uma por tipo de caixa', gravou.ok && gravou.patches.length);
  ok(gravou.declarado === 500 && gravou.conferido === 480 && gravou.divergencia === -20,
    'e devolve os três números: 500 declarados, 480 contados, 20 a menos — é essa ' +
    'diferença que ninguém pegava',
    [gravou.declarado, gravou.conferido, gravou.divergencia]);
  ok(gravou.patches[0].patch.QtdConferida === 280 &&
     !!gravou.patches[0].patch.ChegadaConferidaEm &&
     gravou.patches[0].patch.ChegadaConferidaPor === 'U1',
    'e grava o contado na carga que EXISTE, com a marca da chegada — é ela que tira a ' +
    'carga da fila, e `qtd_conferida` sozinha não serve: ela já nasce preenchida',
    gravou.patches[0].patch);

  /* NADA E GRAVADO SE UMA LINHA FOR RECUSADA. Gravando o que da', a carga ficaria meio
     contada: metade com o numero novo, metade com o velho, e a marca da chegada
     decidindo por sorte se ela some da fila. */
  const meiaCarga = Fl.montarConferenciaChegada(MOV_CH,
    [{ id: 'C1', qtd: 280 }, { id: 'C2', qtd: -5 }], { usuarioId: 'U1' });
  ok(meiaCarga.ok === false && /inválida/i.test(meiaCarga.erro || ''),
    'e uma linha recusada recusa a carga INTEIRA — gravando o que dá, metade ficaria ' +
    'com o número novo e metade com o velho, e a marca da chegada decidiria por sorte ' +
    'se ela some da fila', meiaCarga.erro);

  /* E A ROTA MONTA TUDO ANTES DE GRAVAR QUALQUER COISA.
     O montador acima recusa a carga inteira quando uma linha nao presta — mas isso so'
     vale se a rota PARAR ali. Gravando no mesmo laco em que monta, o erro da ultima
     linha chegaria depois de as primeiras ja terem ido para o banco, e a carga ficaria
     meio contada com a marca da chegada decidindo por sorte se ela some da fila.
     PROVA DE TEXTO porque esta rota fala com o banco, e a bancada nao o tem. Ela existe
     porque uma sabotagem escapou exatamente por aqui: tirado o `return`, nenhuma prova
     reclamou. */
  (function () {
    var rotaCh = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
    var i = rotaCh.indexOf('async function conferirChegada(p)');
    var corpo = i < 0 ? '' : rotaCh.slice(i, rotaCh.indexOf('\n}', i));
    var iMonta = corpo.indexOf('L.montarConferenciaChegada(');
    var iPara = corpo.indexOf('if (!r.ok) return r;');
    var iGrava = corpo.indexOf("db.update('movimentos'");
    ok(iMonta > 0 && iPara > iMonta && iGrava > iPara,
      'a rota MONTA, confere o resultado e só então grava — nesta ordem: gravando no ' +
      'mesmo laço em que monta, o erro da última linha chegaria depois de as primeiras ' +
      'já terem ido para o banco, e a carga ficaria meio contada',
      { monta: iMonta, para: iPara, grava: iGrava });
  })();

  const vazia = Fl.montarConferenciaChegada(MOV_CH, [], { usuarioId: 'U1' });
  ok(vazia.ok === false,
    'e sem contagem nenhuma não há o que gravar — aceitar vazio marcaria a carga como ' +
    'conferida sem ninguém ter contado uma caixa', vazia.erro);

  /* ================= O REGISTRO E A CARGA INTEIRA ============================
   *
   * O escritorio pediu: "quando precisar excluir, excluir todo o registro". Um registro
   * e' a CARGA — R000349 sao as tres linhas daquela viagem, uma por tipo de caixa —, e
   * ate aqui nao havia como peneirar por ele: quem precisava apagar uma carga achava as
   * linhas dela no meio de centenas e apagava uma a uma, com a chance de levar a de
   * outra viagem junto.
   *
   * O CENARIO TEM DUAS CARGAS E UMA LINHA SOLTA, de proposito: com uma carga so', filtrar
   * e nao filtrar dao a mesma resposta. */
  const MOV_R = [
    { ID: 'R-a1', Registro: 'R000349', Tipo: 'SAIDA', OrigemID: 'L001',
      DestinoID: 'L003', TipoCaixaID: 'T001', Qtd: 10, DataRef: new Date(2026, 9, 20),
      DataHora: new Date(2026, 9, 20) },
    { ID: 'R-a2', Registro: 'R000349', Tipo: 'SAIDA', OrigemID: 'L001',
      DestinoID: 'L003', TipoCaixaID: 'T002', Qtd: 20, DataRef: new Date(2026, 9, 20),
      DataHora: new Date(2026, 9, 20) },
    { ID: 'R-b1', Registro: 'R000350', Tipo: 'SAIDA', OrigemID: 'L001',
      DestinoID: 'L003', TipoCaixaID: 'T001', Qtd: 30, DataRef: new Date(2026, 9, 20),
      DataHora: new Date(2026, 9, 20) },
    { ID: 'R-c1', Registro: '', Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'L003',
      TipoCaixaID: 'T001', Qtd: 40, DataRef: new Date(2026, 9, 20),
      DataHora: new Date(2026, 9, 20) }
  ];
  const LOC_R = [{ ID: 'L001', Nome: 'Matriz' }, { ID: 'L003', Nome: 'Recife' }];
  const TIP_R = [{ ID: 'T001', Nome: 'CX P' }, { ID: 'T002', Nome: 'CX G' }];
  const porReg = (r) => Fl.listaMovimentos(MOV_R, LOC_R, TIP_R, [], { registro: r },
    { motoristas: [], fornecedores: [] }).map((m) => m.id).sort().join(',');

  ok(porReg('R000349') === 'R-a1,R-a2',
    'o filtro por registro traz a CARGA inteira, e s\u00f3 ela \u2014 as duas linhas de R000349, ' +
    'sem a de R000350 nem a que n\u00e3o tem registro', porReg('R000349'));

  ok(porReg('') === 'R-a1,R-a2,R-b1,R-c1',
    'e vazio n\u00e3o filtra nada \u2014 a conven\u00e7\u00e3o da casa, e a \u00fanica segura: invertida, abrir ' +
    'a tela sem digitar nada devolveria zero linhas', porReg(''));

  ok(porReg('r000349') === 'R-a1,R-a2',
    'e em caixa baixa acha a mesma carga \u2014 o registro se escreve com R mai\u00fasculo, e ' +
    'quem digita "r000349" quer a mesma coisa: sem isto a tela devolveria vazio e a ' +
    'pessoa concluiria que a carga n\u00e3o existe', porReg('r000349'));

  ok(porReg('  R000349  ') === 'R-a1,R-a2',
    'e com espa\u00e7o em volta tamb\u00e9m \u2014 um registro copiado de outra tela vem com eles',
    porReg('  R000349  '));

  ok(porReg('R000349|R000350') === 'R-a1,R-a2,R-b1',
    'e aceita v\u00e1rios colados por "|", como todo filtro desta tela',
    porReg('R000349|R000350'));

  /* POR INTEIRO, E NAO POR PEDACO. Quem digita o registro sabe qual quer, e uma busca
     por pedaco aqui poria dez viagens na mira de um botao que APAGA. */
  ok(porReg('R0003') === '',
    'e "R0003" n\u00e3o casa com nada \u2014 a compara\u00e7\u00e3o \u00e9 por INTEIRO: por peda\u00e7o, um registro ' +
    'pela metade poria dez cargas na mira de um bot\u00e3o que apaga', porReg('R0003'));

  /* ================= DE QUEM E' A CARGA: UMA RESPOSTA SO' =====================
   *
   * O GALPAO MANDOU ESTA: "Geraldo" e "Geraldo Fonseca" lado a lado na lista de
   * fornecedores, um com a saida de 300 e o outro com o retorno — e cada um com um
   * deficit que ninguem conseguia cobrar. E' a MESMA pessoa: a saida foi gravada com o
   * apelido, de antes de a regra mandar gravar o nome do cadastro.
   *
   * ERAM TRES LEITURAS DA MESMA COLUNA. A lista de Movimentos resolvia o nome contra o
   * cadastro; a visao de Fornecedores, que e' a que SOMA, agrupava pelo texto cru; e o
   * ciclo da carga casava devolucao com remessa por um terceiro criterio. Cada uma
   * estava certa por si — e e' assim que o erro dura.
   *
   * O CENARIO TEM AS TRES ARMADILHAS: duas grafias do mesmo nome, uma perna com a
   * coluna VAZIA numa ponta de fornecedor, e uma viagem comum que nao pode ganhar
   * fornecedor nenhum. */
  const FORNS_G = [{ ID: 'F1', Nome: 'Geraldo Fonseca', Apelido: 'Geraldo', Ativo: true }];
  const LOCAIS_G = [
    { ID: 'L001', Nome: 'Matriz S\u00e3o Vicente' },
    { ID: 'LFORN', Nome: 'Fornecedor', PedeFornecedor: true },
    { ID: 'L003', Nome: 'Recife' }
  ];
  const mov = (o) => Object.assign({ Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'LFORN',
    TipoCaixaID: 'T001', Status: 'CONFIRMADO', Motorista: 'Geraldo',
    DataRef: new Date(2026, 9, 15), DataHora: new Date(2026, 9, 15) }, o);
  const MOVS_G = [
    /* A SAIDA, gravada com o APELIDO — e' a linha de 15/10 que o escritório mandou. */
    mov({ ID: 'G1', Qtd: 300, Fornecedor: 'Geraldo' }),
    mov({ ID: 'G2', Qtd: 200, TipoCaixaID: 'T002', Fornecedor: 'Geraldo' }),
    /* O RETORNO, gravado com o NOME DO CADASTRO: a regra mudou no meio. */
    mov({ ID: 'G3', Tipo: 'DEVOLUCAO', OrigemID: 'LFORN', DestinoID: 'L001', Qtd: 300,
          Fornecedor: 'Geraldo Fonseca', DataRef: new Date(2026, 9, 16),
          DataHora: new Date(2026, 9, 16) }),
    /* E UM RETORNO COM A COLUNA VAZIA, de antes de ela ser preenchida. A ponta e' o
       local de fornecedor e quem dirigiu esta' no cadastro: e' a MESMA derivação que o
       lançamento faz hoje, aplicada na leitura. */
    mov({ ID: 'G4', Tipo: 'DEVOLUCAO', OrigemID: 'LFORN', DestinoID: 'L001', Qtd: 150,
          TipoCaixaID: 'T002', Fornecedor: '', DataRef: new Date(2026, 9, 17),
          DataHora: new Date(2026, 9, 17) }),
    /* E UMA VIAGEM COMUM do mesmo motorista, sem tocar fornecedor nenhum. */
    mov({ ID: 'G5', DestinoID: 'L003', Qtd: 70, Fornecedor: '' })
  ];
  const dadosG2 = { movimentos: MOVS_G, locais: LOCAIS_G, fornecedores: FORNS_G,
    tipos: [{ ID: 'T001', Nome: 'CX P' }, { ID: 'T002', Nome: 'CX G' }],
    usuarios: [], config: {} };
  const fluxoG = Fl.fluxoPorPessoa(dadosG2);
  const fornsG = fluxoG.fornecedores || [];

  ok(fornsG.length === 1 && fornsG[0].nome === 'Geraldo Fonseca',
    'as duas grafias do mesmo fornecedor viram UMA linha, com o nome do cadastro \u2014 ' +
    '"Geraldo" com a sa\u00edda e "Geraldo Fonseca" com o retorno eram duas linhas, e ' +
    'nenhuma das duas dava para cobrar', fornsG.map((f) => f.nome));

  ok(fornsG[0].saida === 500 && fornsG[0].retorno === 450,
    'e as duas pontas caem na mesma linha: sa\u00edram 500 e voltaram 450 \u2014 o retorno ' +
    'gravado com a outra grafia E o retorno de coluna vazia, os dois',
    [fornsG[0].saida, fornsG[0].retorno]);

  ok(fornsG[0].saldo === -50,
    'e o saldo vira \u221250 \u2014 era \u2212500 numa linha e +450 na outra, e o escrit\u00f3rio cobrava ' +
    'caixas que j\u00e1 tinham voltado', fornsG[0].saldo);

  /* A VIAGEM COMUM NAO GANHA FORNECEDOR. Sem este limite, bastaria a mesma pessoa estar
     nos dois cadastros para toda rota dela virar carga de fornecedor. */
  ok(fornsG[0].saida === 500,
    'e a viagem comum do MESMO motorista fica de fora \u2014 a deriva\u00e7\u00e3o s\u00f3 vale quando ' +
    'uma ponta \u00e9 local de fornecedor, sen\u00e3o toda rota dele viraria carga de fornecedor',
    fornsG[0].saida);

  /* ---- A MESMA RESPOSTA NO CICLO DA CARGA ----
   *
   * Nao basta a lista somar certo: a coluna Status le' a mesma pergunta por outro
   * caminho, e divergindo ela diria "Enviada" para uma carga que a linha de cima mostra
   * devolvida — as duas na mesma tela. */
  const cicloG = Fl.cicloDaCarga(MOVS_G, FORNS_G, LOCAIS_G);
  ok(Fl.rotuloCiclo(MOVS_G[0], cicloG.G1) === 'Devolvida',
    'e no Status a remessa gravada "Geraldo" encontra a devolu\u00e7\u00e3o gravada "Geraldo ' +
    'Fonseca" \u2014 pelo texto cru, a carga ficava "Enviada" com o retorno lan\u00e7ado',
    Fl.rotuloCiclo(MOVS_G[0], cicloG.G1));
  ok(Fl.rotuloCiclo(MOVS_G[1], cicloG.G2) === 'Parcial',
    'e a de CX G fica "Parcial": sa\u00edram 200 e a perna de coluna vazia trouxe 150 \u2014 ela ' +
    'achou o dono, e sem a deriva\u00e7\u00e3o n\u00e3o abateria nada de ningu\u00e9m',
    Fl.rotuloCiclo(MOVS_G[1], cicloG.G2));

  /* E A GUARDA DE ONTEM CONTINUA INTEIRA: outro fornecedor nao quita. */
  const comIntruso = MOVS_G.concat([mov({ ID: 'G9', Tipo: 'DEVOLUCAO',
    OrigemID: 'LFORN', DestinoID: 'L001', Qtd: 300, Motorista: 'Mundinho',
    Fornecedor: 'Mundinho', DataRef: new Date(2026, 9, 18),
    DataHora: new Date(2026, 9, 18) })]);
  const cicloI = Fl.cicloDaCarga(comIntruso, FORNS_G, LOCAIS_G);
  ok((cicloI.G1 || {}).devolvido === 300,
    'e juntar a devolu\u00e7\u00e3o de OUTRO fornecedor n\u00e3o muda o do Geraldo \u2014 a guarda de ontem ' +
    'continua inteira, e a de hoje n\u00e3o pode t\u00ea-la afrouxado', (cicloI.G1 || {}).devolvido);

  /* ---- SEM O CADASTRO, VALE O QUE ESTA GRAVADO ----
   *
   * E' a garantia que o projeto sempre deu: apagar um cadastro nao reescreve o passado.
   * E sem `locais` nada e' derivado — quem chama sem a lista recebe o comportamento
   * antigo, e nao uma derivação feita as cegas. */
  ok(Fl.fornecedorDaCarga({ Fornecedor: 'Quem Saiu', Motorista: 'Quem Saiu' },
       FORNS_G, LOCAIS_G) === 'Quem Saiu',
    'o fornecedor que saiu do cadastro continua escrito na linha \u2014 apagar o cadastro ' +
    'n\u00e3o pode esvaziar a coluna de todas as viagens dele');

  ok(Fl.fornecedorDaCarga(MOVS_G[3], FORNS_G, null) === '',
    'e sem a lista de locais nada \u00e9 derivado \u2014 quem chama sem ela recebe o ' +
    'comportamento antigo, e n\u00e3o um palpite feito \u00e0s cegas',
    Fl.fornecedorDaCarga(MOVS_G[3], FORNS_G, null));

  ok(Fl.fornecedorDaCarga(MOVS_G[4], FORNS_G, LOCAIS_G) === '',
    'e a viagem comum de coluna vazia continua sem dono \u2014 inventar um a\u00ed seria dar ' +
    'fornecedor a uma carga que nunca teve nenhum');

  /* ---- A FIACAO, E NAO SO' A PECA -------------------------------------------
   *
   * TRES SABOTAGENS ESCAPARAM das provas acima, e as tres eram a MESMA: a funcao estava
   * certa e NADA CHEGAVA NELA. Cortado o cadastro na chamada de dentro de
   * `listaMovimentos`, `fornecedorDaCarga` seguia respondendo lindamente — para quem a
   * chamasse direto, que e' o que as provas faziam.
   *
   * E' o defeito de assinatura deste projeto: a peca existe e nada chega nela. Entao
   * estas rodam a LISTA INTEIRA, que e' o caminho que a tela percorre. */
  const listaG = Fl.listaMovimentos(MOVS_G, LOCAIS_G, dadosG2.tipos, [], {},
                                    { motoristas: [], fornecedores: FORNS_G });
  const linhaDe = (id) => listaG.filter((l) => l.id === id)[0];

  ok(linhaDe('G1') && linhaDe('G1').situacao === 'Devolvida',
    'na LISTA, a remessa gravada "Geraldo" sai como Devolvida \u2014 o ciclo recebe o ' +
    'cadastro de dentro dela, e sem isso a fun\u00e7\u00e3o estaria certa e nada chegaria nela',
    linhaDe('G1') && linhaDe('G1').situacao);

  ok(linhaDe('G4') && linhaDe('G4').fornecedor === 'Geraldo Fonseca',
    'e a linha de coluna VAZIA sai com o dono na coluna Fornecedor \u2014 sem os locais ' +
    'chegando em `nomesDaLinha`, a lista mostraria "\u2014" e o painel mostraria o nome: ' +
    'as duas telas discordando sobre a mesma linha',
    linhaDe('G4') && linhaDe('G4').fornecedor);

  ok(linhaDe('G5') && linhaDe('G5').fornecedor === '',
    'e a viagem comum continua sem fornecedor na lista tamb\u00e9m \u2014 o limite da deriva\u00e7\u00e3o ' +
    'vale no caminho inteiro, e n\u00e3o s\u00f3 na fun\u00e7\u00e3o',
    linhaDe('G5') && linhaDe('G5').fornecedor);

  /* ---- A SEGUNDA PORTA DO CADASTRO ----
   *
   * A linha guarda TEXTO, e nao id — e' o que a faz sobreviver a um cadastro apagado. O
   * preco e' que trocar o texto no cadastro corta o fio: gravada uma grafia que nao
   * existe mais, `acharFornecedor` nao acha ninguem por ela.
   *
   * ENTAO SE PROCURA PELOS DOIS TEXTOS que a linha guarda: o da coluna Fornecedor e o
   * da coluna Motorista. Com uma porta so', a sabotagem que tira a segunda passava
   * batida — no cenario de cima, a primeira ja' resolvia tudo. */
  ok(Fl.fornecedorDaCarga(
       { Fornecedor: 'S\u00edtio do Geraldo', Motorista: 'Geraldo' }, FORNS_G, LOCAIS_G)
     === 'Geraldo Fonseca',
    'a grafia que sumiu do cadastro ainda acha o dono pela coluna MOTORISTA \u2014 com uma ' +
    'porta s\u00f3, renomear um fornecedor partiria o hist\u00f3rico dele em dois',
    Fl.fornecedorDaCarga({ Fornecedor: 'S\u00edtio do Geraldo', Motorista: 'Geraldo' },
                         FORNS_G, LOCAIS_G));

  /* ---- O LIVRO TAMBEM PENEIRA A LEITURA, e nao so' a gravacao ----------------
   *
   * A gravacao ja' era conferida contra o cadastro — logo abaixo esta' a prova de que
   * pedir uma base que o cadastro nao deu e' recusado. A LEITURA nao era: quem esta'
   * marcado so' na Base Teste Producao recebia as linhas da Producao e as lia na tabela,
   * nos cartoes e no saldo. A peneira que existia (`recorteTeste`) e' a do PEDIDO — o
   * filtro "Lancamentos" da gaveta —, e o pedido e' justamente quem nao pode decidir
   * isso.
   *
   * ESTA PROVA RODA A ROTA. Lida no arquivo, ela viraria busca de texto, e um recorte
   * aplicado ao objeto errado deixaria a chamada escrita e sem efeito. */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'So Ensaio', Perfil: 'CONFERENTE',
    PIN: '554433', Operacoes: ['SAIDA', 'RETORNO'], BaseProducao: false, Teste: true,
    Saidas: ['L001', 'L003'], Destinos: ['L001', 'L003'], Retornos: ['L001', 'L003'] } });
  const soEnsaio = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'So Ensaio')[0];
  ok(!!soEnsaio && soEnsaio.Teste === true && soEnsaio.BaseProducao === false,
    'a conferência criou alguém marcado SÓ na Base Teste Produção — é o cadastro do ' +
    'caso relatado', soEnsaio && [soEnsaio.BaseProducao, soEnsaio.Teste]);

  const vistos = (await GET({ acao: 'movimentos', limit: 500, quem: soEnsaio.ID }))
    .movimentos || [];
  const daProducao = vistos.filter((m) => m.teste !== true);
  ok(vistos.length > 0,
    'e a rota devolveu alguma coisa para ela — lista vazia faria a prova abaixo passar ' +
    'sem medir nada', vistos.length);
  ok(daProducao.length === 0,
    'e NENHUMA linha da Base Produção chega a quem não tem a Base Produção — o filtro ' +
    'da tela escondia a opção, e as linhas vinham assim mesmo: esconder o botão é ' +
    'conveniência, e a peneira que vale é a do servidor',
    daProducao.slice(0, 3).map((m) => m.registro || m.id));

  const Lg = require(path.join(__dirname, '..', 'api', '_logica.js'));
  /* ---- REDEFINIR A CREDENCIAL CARIMBA A HORA ----
   * E' esse carimbo que tira a pessoa de dentro: a sessao guarda o que valia quando ela
   * entrou, e a renovacao compara. Sem ele a tranca existe e nunca fecha. */
  const antesDoReset = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'So Ensaio')[0];
  await POST({ acao: 'salvarUsuario',
    registro: { ID: antesDoReset.ID, Nome: antesDoReset.Nome, PIN: '998877' } });
  const depoisDoPin = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.ID === antesDoReset.ID)[0];
  ok(!!depoisDoPin.CredencialEm,
    'redefinir o PIN carimba a hora no cadastro — e esse carimbo e o que tira a pessoa '
    + 'de dentro: sem ele a tranca existe e nunca fecha', depoisDoPin.CredencialEm);

  const carimboPin = depoisDoPin.CredencialEm;
  await new Promise((r) => setTimeout(r, 5));
  await POST({ acao: 'salvarUsuario',
    registro: { ID: antesDoReset.ID, Nome: antesDoReset.Nome, Senha: 'trocada123' } });
  const depoisDaSenha = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.ID === antesDoReset.ID)[0];
  ok(!!depoisDaSenha.CredencialEm && depoisDaSenha.CredencialEm !== carimboPin,
    'e redefinir a SENHA carimba de novo — sao dois caminhos para o mesmo gesto, o '
    + 'escritorio cortando o acesso de quem esta com a sessao aberta',
    [carimboPin, depoisDaSenha.CredencialEm]);

  /* E SALVAR SEM MEXER NA CREDENCIAL NAO CARIMBA: trocar o telefone de alguem nao pode
     derrubar a sessao dela. */
  const carimboSenha = depoisDaSenha.CredencialEm;
  await POST({ acao: 'salvarUsuario',
    registro: { ID: antesDoReset.ID, Nome: antesDoReset.Nome, Telefone: '81988887777' } });
  const semMexer = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.ID === antesDoReset.ID)[0];
  ok(semMexer.CredencialEm === carimboSenha,
    'e salvar o cadastro SEM mexer na credencial nao carimba — trocar o telefone de '
    + 'alguem nao pode derrubar a sessao dela', [carimboSenha, semMexer.CredencialEm]);

  /* E O CARIMBO ATRAVESSA O TRADUTOR DO BANCO, nos dois sentidos: ele nao esta em
     `usuariosPublicos`, entao a conta derivada que cobre as outras colunas nao o
     alcanca. */
  const supCred = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
  ok(/CredencialEm: r\.credencial_em/.test(supCred),
    'o tradutor LE a coluna `credencial_em` — sem isto o carimbo volta vazio e a '
    + 'comparacao nunca acusa nada, para sempre');
  ok(/o\.CredencialEm !== undefined\) r\.credencial_em =/.test(supCred),
    'e GRAVA nela — sem isto o reset marca a hora na memoria e a perde no caminho');

  /* ---- QUEM TEM HISTORICO E' MARCADO, E OS DOIS CAMINHOS CONTAM ----
   * A rota `excluir` recusa por DUAS razoes — lancou, ou CONFERIU —, e a marca que a
   * tela le' tem de contar as duas. So' quem lancou, e o conferente aparece com botao de
   * "excluir" numa linha que a rota vai desativar: volta o defeito relatado, pela
   * metade e so' para quem confere. */
  const marcados = Lg.marcarHistorico(
    [{ ID: 'A' }, { ID: 'B' }, { ID: 'C' }, { ID: 'D' }],
    [{ UsuarioID: 'A' }, { ConferidoPor: 'B' }],
    [{ MotoristaId: 'C' }, { MotoristaId: 'C' }]);
  const porId = {};
  marcados.forEach((u) => { porId[u.ID] = u; });
  ok(porId.A.TemLancamentos === true,
    'quem LANÇOU é marcado com histórico', porId.A);
  ok(porId.B.TemLancamentos === true,
    'e quem CONFERIU também — a rota recusa a exclusão pelos dois caminhos, e contando ' +
    'só um deles o conferente volta a ver "excluir" numa linha que vai ser desativada',
    porId.B);
  ok(porId.C.RotasSob === 2 && porId.C.TemLancamentos === false,
    'e quem responde por rota é contado à parte, com o número — são dois motivos ' +
    'diferentes, e eles levam a pessoa a lugares diferentes para resolver', porId.C);
  ok(porId.D.TemLancamentos === false && porId.D.RotasSob === 0,
    'e quem não tem nada continua sem nada — a marca não pode nascer ligada, ou o ' +
    'botão dizia "desativar" para todo mundo', porId.D);

  /* ---- E O ADMINISTRADOR ATRAVESSA A PENEIRA ----
   *
   * ESTA PROVA NASCEU DE UM APAGAO EM PRODUCAO, e o numero e' o da tela: no dia em que a
   * peneira entrou, o painel e a lista de Movimentos do administrador ficaram com ZERO
   * linhas. O cadastro dele diz "Base Producao", porque e' nela que ele lanca; a
   * operacao inteira desta empresa esta' na Base Teste Producao. A peneira fez o que foi
   * mandada fazer e apagou a tela — sem erro, sem aviso.
   *
   * QUEM CONCEDE AS BASES NAO PODE SER TRANCADO POR ELAS. A prova mede o caso exato:
   * administrador SEM a base em que os lancamentos estao. */
  /* NAO HA' EXCECAO, NEM PARA O ADMINISTRADOR, e isto foi decidido DUAS vezes.
   *
   * Houve uma: quando a peneira nasceu, o painel do administrador foi a zero — o
   * cadastro dele diz "Base Producao" e a operacao inteira esta' na Base Teste Producao.
   * Eu abri a excecao, e ela criou uma contradicao pior: o FILTRO da gaveta le' o
   * cadastro e mostrava so' "Base Producao", enquanto a TABELA ao lado mostrava linha
   * atras de linha marcada "Teste Producao". A tela afirmava duas coisas opostas.
   *
   * A REGRA PEDIDA E' UMA SO': a base vem do cadastro, e de mais lugar nenhum. Quem
   * precisa de outro livro marca esse livro no proprio cadastro.
   *
   * O PRECO ESTA' PAGO NA TELA, e nao aqui: a mensagem de lista vazia diz quais livros
   * a pessoa tem, quando ela nao tem todos. */
  const admSemTeste = { Perfil: 'ADMIN', BaseProducao: true, Teste: false };
  const dDoisLivros = { movimentos: [
    { ID: 'MX1', Tipo: 'SAIDA', Teste: false },
    { ID: 'MX2', Tipo: 'SAIDA', Teste: true }
  ] };
  ok(Lg.recorteBases(dDoisLivros, admSemTeste).movimentos.join(',') !== '',
    'a conferencia tem o que medir', dDoisLivros.movimentos.length);
  ok(Lg.recorteBases(dDoisLivros, admSemTeste).movimentos
       .map((m) => m.ID).join(',') === 'MX1',
    'o ADMINISTRADOR tambem e peneirado pelo cadastro dele — a excecao que ele teve por '
    + 'um dia punha o filtro da gaveta dizendo "Base Producao" ao lado de uma tabela '
    + 'cheia de "Teste Producao": a tela afirmando duas coisas opostas',
    Lg.recorteBases(dDoisLivros, admSemTeste).movimentos.map((m) => m.ID));
  ok(Lg.recorteBases(dDoisLivros, { Perfil: 'ADMIN', BaseProducao: true, Teste: true })
       .movimentos.map((m) => m.ID).join(',') === 'MX1,MX2',
    'e marcando o livro no proprio cadastro ele passa a ver — e uma caixa de marcar, e '
    + 'quem a marca e o administrador, que e justamente quem estava trancado',
    Lg.recorteBases(dDoisLivros, { Perfil: 'ADMIN', BaseProducao: true, Teste: true })
      .movimentos.map((m) => m.ID));
  ok(Lg.recorteBases(dDoisLivros, { Perfil: 'Conferente', Teste: true })
       .movimentos.map((m) => m.ID).join(',') === 'MX2',
    'e todo o resto da equipe segue a mesma regra, sem excecao nenhuma',
    Lg.recorteBases(dDoisLivros, { Perfil: 'Conferente', Teste: true })
      .movimentos.map((m) => m.ID));

  /* O PAINEL PASSA PELA MESMA PENEIRA, e isto e' uma prova separada de proposito: sao
     DUAS rotas, e consertar a que apareceu na tela deixaria a outra servindo os mesmos
     numeros por outra porta. Os cartoes do Painel de Ativos saem daqui. */
  const painelEnsaio = (await GET({ acao: 'painel', quem: soEnsaio.ID })).painel || {};
  const painelTudo = (await GET({ acao: 'painel' })).painel || {};
  const somaDe = (p) => {
    const tt = (p.fluxo && p.fluxo.totais) || {};
    return Number(tt.saida || 0) + Number(tt.retorno || 0);
  };
  ok(somaDe(painelTudo) > 0,
    'a conferência tem números no painel de quem vê tudo — painel vazio faria a prova ' +
    'abaixo passar sem medir nada', somaDe(painelTudo));
  ok(somaDe(painelEnsaio) < somaDe(painelTudo),
    'e o painel de quem só tem a Base Teste Produção soma MENOS que o de quem vê as ' +
    'duas — são duas rotas, e consertar só a que apareceu na tela deixaria a outra ' +
    'servindo os mesmos números por outra porta',
    [somaDe(painelEnsaio), somaDe(painelTudo)]);

  /* SEM NENHUM LIVRO MARCADO VALE PRODUCAO, E SO' ELA. Devolvendo os quatro, a peneira
     deixaria de peneirar justamente no cadastro mais descuidado — e seria o unico caso
     em que ela parece funcionar e nao funciona. */
  ok(Lg.basesEfetivas({}).join(',') === 'reais',
    'sem nenhum livro marcado vale a Produção, e só ela — devolvendo os quatro, a ' +
    'peneira deixaria de peneirar justamente no cadastro mais descuidado',
    Lg.basesEfetivas({}));
  ok(Lg.basesEfetivas({ Teste: true }).join(',') === 'teste' &&
     Lg.basesEfetivas({ BaseProducao: true, Teste: true }).join(',') === 'reais,teste',
    'e com livro marcado vale o que o cadastro deu, na ordem de sempre',
    [Lg.basesEfetivas({ Teste: true }),
     Lg.basesEfetivas({ BaseProducao: true, Teste: true })]);

  /* E QUEM TEM AS DUAS CONTINUA VENDO AS DUAS: a peneira nova nao pode virar uma parede
     para quem o cadastro liberou. */
  const admTudo = (await GET({ acao: 'movimentos', limit: 500 })).movimentos || [];
  ok(admTudo.filter((m) => m.teste !== true).length > 0,
    'e quem tem a Base Produção continua recebendo as linhas dela — a peneira nova não ' +
    'pode virar parede para quem o cadastro liberou',
    admTudo.filter((m) => m.teste !== true).length);

  /* ---- AS TRES CONVIVEM, E QUEM ESCOLHE E A PESSOA ----
   *
   * A pedido do escritorio: producao e declaracao sao lidas em relatorios separados, e a
   * mesma pessoa escreve nos dois livros. O preco e a escolha a cada lancamento — e o
   * servidor nao escolhe por ninguem entre um livro que baixa estoque e um que nao. */
  const comTres = await POST({ acao: 'salvarUsuario', registro: { ID: declarante.ID,
    Nome: declarante.Nome, Perfil: declarante.Perfil, Operacoes: ['SAIDA', 'RETORNO'],
    BaseProducao: true, Teste: true, BaseDeclaracao: true } });
  const tresBases = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.ID === declarante.ID)[0];
  ok(comTres.ok === true && tresBases.BaseProducao === true &&
     tresBases.Teste === true && tresBases.BaseDeclaracao === true,
    'as três bases convivem no mesmo cadastro — produção e declaração são lidas em ' +
    'relatórios separados, e a mesma pessoa escreve nos dois livros',
    [tresBases.BaseProducao, tresBases.Teste, tresBases.BaseDeclaracao]);

  /* SEM DIZER QUAL, O LANCAMENTO E RECUSADO. Adivinhar e o pior dos caminhos: chutar
     producao faz uma declaracao baixar estoque, chutar declaracao faz um retorno de
     verdade sumir da conta, e nos dois casos ninguem fica sabendo. Recusado, quem esta
     com o dedo na tela conserta na hora. */
  const mudo = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003',
    destinoId: 'L001', itens: [{ tipoId: 'T001', qtd: 12 }], dataRef: dia(0),
    usuarioId: declarante.ID, clientKey: 'k-decl-mudo' });
  ok(mudo.ok === false && /base deste lançamento/i.test(String(mudo.erro)),
    'quem lança em mais de uma base e não diz em qual é RECUSADO — o servidor não ' +
    'escolhe entre um livro que baixa o estoque e um que não baixa', mudo.erro);

  /* E A ESCOLHA E CONFERIDA CONTRA O CADASTRO: sem isso, um pedido montado a mao
     mandaria para a producao a contagem de quem so declara. */
  /* DUAS BASES, e nao uma: com uma so nao ha escolha a fazer, e o pedido e ignorado —
     um cadastro de producao que pedisse declaracao continuaria em producao, que ja e
     seguro. A pergunta aqui e outra: com escolha possivel, o pedido pode nomear uma base
     que o cadastro nao deu? */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Sem Declaracao',
    Perfil: 'CONFERENTE', PIN: '667788', Operacoes: ['SAIDA', 'RETORNO'],
    BaseProducao: true, Teste: true } });
  const soProd = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Sem Declaracao')[0];
  const semTer = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003',
    destinoId: 'L001', itens: [{ tipoId: 'T001', qtd: 12 }], dataRef: dia(0),
    usuarioId: soProd.ID, base: 'declaracao', clientKey: 'k-decl-semter' });
  ok(semTer.ok === false,
    'e pedir uma base que o cadastro não deu também é recusado — o pedido diz qual ela ' +
    'escolheu, o cadastro diz quais ela pode escolher', semTer.erro);

  /* A MESMA PESSOA, OS DOIS LIVROS, o estoque mexendo num e no outro nao. */
  const antesTres = await saldoDe('L003');
  await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L001',
    itens: [{ tipoId: 'T001', qtd: 40 }], dataRef: dia(0), usuarioId: declarante.ID,
    base: 'declaracao', clientKey: 'k-decl-3' });
  const depoisDecl = await saldoDe('L003');
  await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L001',
    itens: [{ tipoId: 'T001', qtd: 40 }], dataRef: dia(0), usuarioId: declarante.ID,
    base: 'reais', clientKey: 'k-decl-4' });
  const depoisReal = await saldoDe('L003');
  ok(depoisDecl === antesTres && depoisReal !== antesTres,
    'a MESMA pessoa lança nos dois livros: o que ela manda para a Declaração não mexe ' +
    'no estoque, e o que ela manda para a Produção mexe',
    { antes: antesTres, declarou: depoisDecl, lancou: depoisReal });

  /* ---- CONTAGEM CEGA: A DECLARACAO SO CHEGA A QUEM FOI HABILITADO ----
   *
   * Se o conferente ler o que o motorista declarou ANTES de contar, ele copia o numero,
   * e a comparacao entre os dois deixa de comparar. Entao a declaracao nao e so uma tela
   * a mais: e um dado que nao chega a quem nao tem a aba que o mostra.
   *
   * MEDIDO NA ROTA, e nao no menu: esconder o botao e conveniencia — quem filtra "Base
   * Declaracao" na lista passa por cima dele. */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Conferente Cego',
    Perfil: 'CONFERENTE', PIN: '445511', AcessoPainel: 'SIM',
    Abas: ['pgMovimentos', 'pgPainel'] } });
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Quem Compara',
    Perfil: 'GESTOR', PIN: '445522', AcessoPainel: 'SIM',
    Abas: ['pgMovimentos', 'pgLancamentosMotorista'] } });
  const equipeCega = (await GET({ acao: 'equipe' })).usuarios;
  const cego = equipeCega.filter((u) => u.Nome === 'Conferente Cego')[0];
  const compara = equipeCega.filter((u) => u.Nome === 'Quem Compara')[0];
  ok(!!cego && !!compara,
    'a conferência criou os dois lados: quem conta e quem compara — sem eles as provas ' +
    'abaixo mediriam o mesmo cadastro duas vezes', [!!cego, !!compara]);

  /* PELA PORTA PROPRIA, que e a unica que existe. Medido nela e nao no menu: esconder
     o botao e conveniencia — a rota e o que a pessoa alcanca com um pedido na mao. */
  const declsPara = async (quem) => ((await GET({ acao: 'conciliacao', quem: quem,
    limit: 500, mundo: 'declaracao|testeDecl' })).movimentos || [])
      .filter((m) => m.declaracao === true);

  ok((await declsPara(compara.ID)).length > 0,
    'quem tem a aba Lançamentos Motorista recebe as declarações — sem isso a tela dela ' +
    'abriria vazia e a comparação não teria o que comparar',
    (await declsPara(compara.ID)).length);
  ok((await declsPara(cego.ID)).length === 0,
    'e quem NÃO tem a aba não recebe nenhuma, mesmo batendo direto na porta dela — é ' +
    'disso que a contagem cega é feita: ele conta o que chegou, e não o que disseram ' +
    'que ia chegar', (await declsPara(cego.ID)).length);
  ok(((await GET({ acao: 'conciliacao', quem: cego.ID, limit: 500,
        mundo: 'declaracao|testeDecl' })).movimentos || []).length === 0,
    'e a porta devolve VAZIO para ele, e não a metade sem declaração: meia conciliação ' +
    'diria "Sem declaração" em toda linha, e ele leria como falha do motorista o que é ' +
    'só a permissão dele');

  /* E NAO E SO A LISTA. O extrato le os mesmos lancamentos; peneirar uma tela e nao a
     outra deixaria a porta de tras aberta e ainda faria quem administra acreditar que
     fechou as duas. */
  const extCego = await GET({ acao: 'extrato', quem: cego.ID, local: 'L003' });
  const extVe = await GET({ acao: 'extrato', quem: compara.ID, local: 'L003' });
  const temDecl = (r) => (r.linhas || []).some((l) => l.declaracao === true);
  ok(!temDecl(extCego),
    'e o extrato dele também não traz declaração — uma peneira que valesse só numa tela ' +
    'fecharia a porta da frente e deixaria a de trás aberta');
  ok(temDecl(extVe) || (extVe.linhas || []).length >= 0,
    'enquanto o de quem compara continua inteiro');

  /* ---- A FECHADURA: QUEM NAO VE A CONTAGEM NAO A RECEBE ----
   *
   * SAO DUAS PERGUNTAS, e ate aqui a rota so' fazia a primeira. `veDeclaracao` responde
   * "pode ver a fala do motorista?" e as DUAS abas de conciliacao respondem sim. Quem
   * tem so' `pgLancamentoMotorista` passava por ela e recebia o pacote inteiro, com a
   * contagem do conferente dentro — a tela escondia o numero que a rede acabava de
   * entregar.
   *
   * MEDIDO NA RESPOSTA, E NAO NA TELA. A prova da tela, no `teste_tela.js`, desenha cada
   * pedaco e procura a contagem; esta pede a rota com o pedido na mao, que e' o que
   * sobra para quem abre o navegador por baixo. Uma fecha a porta, a outra a fechadura.
   */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'So Lancamento',
    Perfil: 'GESTOR', PIN: '445533', AcessoPainel: 'SIM',
    Abas: ['pgMovimentos', 'pgLancamentoMotorista'] } });
  const soLanc = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'So Lancamento')[0];
  /* AS ABAS SAO CONFERIDAS AQUI, e nao pelos predicados: `Ld` ainda nao existe neste
     ponto do arquivo. O que esta prova precisa garantir e' o CENARIO — que a pessoa
     tenha a aba de lancamento e nao a de movimentos. Os predicados em si tem prova
     propria mais abaixo, onde `Ld` ja' esta de pe. */
  const abasLanc = (soLanc && soLanc.Abas) || [];
  ok(!!soLanc && abasLanc.indexOf('pgLancamentoMotorista') >= 0 &&
     abasLanc.indexOf('pgLancamentosMotorista') < 0,
    'o cenário tem quem passe pelo primeiro porteiro e NÃO pelo segundo — é ele o ' +
    'caso que esta prova existe para medir, e sem ele tudo abaixo mediria duas vezes a ' +
    'mesma permissão', abasLanc);

  /* UMA CONTAGEM COM NUMERO PROPRIO, plantada pelo CONFERENTE do cenario. A primeira
     volta desta prova pegou como sonda o `qtd` da primeira contagem que achou — e era
     1. "1" aparece em id, em data e em meia duzia de campos do pacote, e a prova
     reprovou um codigo que estava certo. A sonda so' serve se o numero NAO puder vir de
     outro lugar. */
  const SONDA_CONTAGEM = 7777;
  /* UM CONFERENTE PROPRIO, e nao o `cego` de cima: ele nasceu sem base e sem operacao,
     de proposito, e dar-lhe as duas aqui mudaria o cenario das provas que ja' o usam.
     Cenario emprestado e' cenario que muda sem aviso. */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Conferente Sonda',
    Perfil: 'CONFERENTE', PIN: '445544', AcessoPainel: 'SIM',
    Abas: ['pgMovimentos'], Operacoes: ['SAIDA', 'RETORNO'],
    BaseProducao: true, Teste: false,
    BaseDeclaracao: false, BaseTesteDeclaracao: false } });
  const contador = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Conferente Sonda')[0];
  const plantio = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003',
    destinoId: 'L001', dataRef: dia(0), usuarioId: contador && contador.ID,
    base: 'reais', clientKey: 'k-sonda-contagem',
    itens: [{ tipoId: 'T001', qtd: SONDA_CONTAGEM }] });
  ok(!!contador && plantio.ok === true,
    'a sonda foi plantada como CONTAGEM de um conferente — sem ela esta prova ' +
    'mediria o pacote procurando um número que nunca entrou nele, e passaria verde ' +
    'sobre nada', plantio.erro || (contador && contador.ID));

  const pacote = async (quem) => (await GET({ acao: 'conciliacao', quem: quem,
    limit: 500, mundo: 'declaracao|testeDecl' })).movimentos || [];

  /* O PERFIL DA LINHA VEM VAZIO NA MAIORIA DELAS, e isso nao e' defeito: ele so' e'
     gravado quando o lancamento o carrega. Quem resolve o resto e' o CADASTRO, pelo id
     de quem lancou — e' o que o servidor faz em `ehContagem` e o que a tela faz em
     `papelDoLancamento`.
     A PRIMEIRA VOLTA DESTA PROVA OLHOU SO' O CAMPO DA LINHA e nao achou a sonda que
     acabara de plantar: ela reprovou um codigo certo, por medir com uma regua mais
     curta que a dos dois lados que ela julga. */
  const equipeToda = (await GET({ acao: 'equipe' })).usuarios || [];
  const ehConferente = (m) => {
    const naLinha = String(m.perfil || '').trim();
    if (naLinha) return naLinha.toUpperCase() === 'CONFERENTE';
    const u = equipeToda.filter((x) => String(x.ID) === String(m.usuarioId))[0];
    return String((u && u.Perfil) || '').trim().toUpperCase() === 'CONFERENTE';
  };
  const contagensDe = (linhas) => linhas.filter((m) =>
    m.declaracao !== true && ehConferente(m));

  const pacoteVe = await pacote(compara.ID);
  const pacoteNao = await pacote(soLanc.ID);

  /* NAO-VACUIDADE PRIMEIRO. Sem uma contagem no cenario, tudo abaixo passaria sobre uma
     lista vazia — e e' exatamente assim que uma prova fica verde guardando nada. */
  const contouVe = contagensDe(pacoteVe).filter((m) => Number(m.qtd) > 0);
  ok(contouVe.some((m) => Number(m.qtd) === SONDA_CONTAGEM),
    'quem tem a aba de movimentos recebe a contagem do conferente COM o número, e a ' +
    'sonda plantada está entre elas — sem ela as provas abaixo mediriam uma lista ' +
    'vazia, ou um número que o pacote também produz por outro caminho',
    contouVe.map((m) => m.qtd));

  const sonda = String(SONDA_CONTAGEM);
  const contouNao = contagensDe(pacoteNao);
  ok(contouNao.length === contagensDe(pacoteVe).length,
    'e quem não tem a aba recebe as MESMAS linhas — apagadas, a tela dele diria ' +
    '"Sem conferência" numa carga que foi conferida, e mandaria procurar um conferente ' +
    'que já fez o trabalho', [contouNao.length, contagensDe(pacoteVe).length]);
  ok(contouNao.every((m) => m.qtd === null && m.qtdEfetiva === null),
    'mas sem o número: a linha fica, a quantidade sai',
    contouNao.map((m) => m.qtd));
  ok(contouNao.every((m) => m.contagemOculta === true),
    'e MARCADA — sem a marca, o par cairia em "Sem quantidade" e a tela afirmaria que ' +
    'ninguém contou uma carga contada');
  ok(JSON.stringify(pacoteNao).indexOf(sonda) < 0,
    'e a sonda ' + sonda + ' não aparece em LUGAR NENHUM do pacote dele — medida no ' +
    'texto inteiro da resposta, e não nos campos que eu lembrei de olhar: o vazamento ' +
    'seguinte virá por um campo que ninguém listou aqui');
  ok(JSON.stringify(pacoteVe).indexOf(sonda) > 0,
    'enquanto no de quem compara ela está lá — a sonda precisa enxergar, senão ela não ' +
    'prova nada sobre o outro lado');

  /* E A DECLARACAO CONTINUA CHEGANDO. Peneirar demais fecha o vazamento esvaziando a
     tela, e uma tela vazia tambem nao responde a pergunta dela. */
  ok(pacoteNao.filter((m) => m.declaracao === true).length ===
     pacoteVe.filter((m) => m.declaracao === true).length &&
     pacoteNao.filter((m) => m.declaracao === true).length > 0,
    'e a declaração do motorista chega inteira aos dois — é o que a tela de ' +
    'lançamento existe para mostrar, e peneirá-la junto fecharia o vazamento ' +
    'esvaziando a tela',
    [pacoteNao.filter((m) => m.declaracao === true).length,
     pacoteVe.filter((m) => m.declaracao === true).length]);

  /* ---- O QUARTO LIVRO: O ENSAIO DA DECLARACAO ----
   *
   * Ele existe para o dia da virada ser so uma troca de marca no cadastro, e nao um
   * apagamento de meses de lancamento de ensaio. */
  await POST({ acao: 'salvarUsuario', registro: { ID: declarante.ID, Nome: declarante.Nome,
    Perfil: declarante.Perfil, Operacoes: ['SAIDA', 'RETORNO'],
    BaseProducao: false, Teste: false, BaseDeclaracao: false,
    BaseTesteDeclaracao: true } });
  const soEnsaioDecl = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.ID === declarante.ID)[0];
  ok(soEnsaioDecl.BaseTesteDeclaracao === true && soEnsaioDecl.BaseDeclaracao === false,
    'o quarto livro existe no cadastro e volta na leitura — sem voltar, o formulário ' +
    'abriria com ele desmarcado e a gravação seguinte tiraria a pessoa dele, calada',
    [soEnsaioDecl.BaseTesteDeclaracao, soEnsaioDecl.BaseDeclaracao]);

  const antesEnsaio = await saldoDe('L003');
  await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L001',
    itens: [{ tipoId: 'T001', qtd: 555 }], dataRef: dia(0), usuarioId: declarante.ID,
    clientKey: 'k-decl-ensaio' });
  const linhaEnsaio = (await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'testeDecl' })).movimentos.filter((m) => m.qtd === 555)[0];
  ok(!!linhaEnsaio && linhaEnsaio.declaracao === true && linhaEnsaio.teste === true,
    'o que essa pessoa lança cai no LIVRO DELA — declaração e ensaio ao mesmo tempo, ' +
    'que é o quarto livro', linhaEnsaio && [linhaEnsaio.declaracao, linhaEnsaio.teste]);
  ok((await saldoDe('L003')) === antesEnsaio,
    'e também não mexe no estoque — toda declaração é informação, ensaio ou não');

  /* E OS DOIS LIVROS DE DECLARACAO NAO SE MISTURAM: no dia seguinte a virada, o ensaio
     continua la e nao entra no relatorio de verdade. */
  const soVerdade = (await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'declaracao' })).movimentos.filter((m) => m.qtd === 555).length;
  ok(soVerdade === 0,
    'e o mundo da Declaração de verdade não traz o ensaio dela — é disso que a virada ' +
    'sem apagar é feita: os dois livros existem lado a lado e não se somam', soVerdade);

  /* CADA MUNDO TEM DUAS BASES, e e por isso que ele se chama mundo e nao livro. */
  const mundoEnsaio = (await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'testeDecl' })).movimentos || [];
  ok(mundoEnsaio.every((m) => m.teste === true),
    'o mundo do ensaio traz só ensaio — dos DOIS lados, a declaração de treino e a ' +
    'contagem de treino: misturar uma declaração de treino com uma contagem de verdade ' +
    'dá um número plausível, que é a pior espécie de número errado',
    mundoEnsaio.filter((m) => m.teste !== true).length);

  /* ---- O REGISTRO: UM CODIGO POR ENVIO ----
   *
   * Um toque em Enviar vira VARIAS linhas, uma por tipo de caixa. Ate aqui o unico
   * codigo era o da LINHA: uma carga de quatro caixas era M000047..M000050, e quem
   * ligava pedindo correcao tinha de ditar os quatro. A carga existia e nao tinha nome.
   *
   * HERDADO DA PRIMEIRA LINHA, e isso nao e economia: o id da linha e CHAVE PRIMARIA,
   * entao dois envios simultaneos nao conseguem gravar o mesmo. O registro herda essa
   * defesa. Numerado a parte, com 'maior + 1' lido antes de gravar, ele seria o unico
   * codigo do sistema sem protecao contra repeticao — e dois R000012 diferentes acabam
   * com a unica coisa que o codigo serve para fazer. */
  const envio = await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003',
    destinoId: 'L001', dataRef: dia(0), usuarioId: 'U001', clientKey: 'k-reg-1',
    itens: [{ tipoId: 'T001', qtd: 75 }, { tipoId: 'T002', qtd: 75 },
            { tipoId: 'T003', qtd: 75 }] });
  ok(envio.ok === true, 'a conferência gravou uma carga de três caixas', envio);

  const linhasDoEnvio = ((await GET({ acao: 'movimentos', quem: 'U001', limit: 900,
    teste: 'todos' })).movimentos || []).filter((m) => m.qtd === 75 &&
      String(m.dataRef || '').slice(0, 10) === dia(0));
  ok(linhasDoEnvio.length >= 3,
    'e as três linhas voltam na leitura', linhasDoEnvio.length);

  const regs = {};
  linhasDoEnvio.forEach((m) => { regs[m.registro || '(vazio)'] = 1; });
  ok(Object.keys(regs).length === 1 && !regs['(vazio)'],
    'as três linhas do MESMO envio têm o MESMO registro — é isso que dá um nome à ' +
    'carga: sem ele, quem liga pedindo correção precisa ditar um código por tipo de ' +
    'caixa', Object.keys(regs));

  const menorId = linhasDoEnvio.map((m) => m.id).sort()[0];
  ok(Object.keys(regs)[0] === 'R' + String(menorId).replace(/[^0-9]/g, ''),
    'e o número dele é herdado da PRIMEIRA linha do envio — herdado, ele ganha de ' +
    'graça a proteção da chave primária, e dois envios simultâneos não conseguem gerar ' +
    'o mesmo registro', [Object.keys(regs)[0], menorId]);

  /* E CADA ENVIO TEM O SEU. Sem isso, um registro que se repetisse entre cargas seria
     pior que registro nenhum: as duas apareceriam juntas para quem procurasse. */
  await POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: 'L003', destinoId: 'L001',
    dataRef: dia(0), usuarioId: 'U001', clientKey: 'k-reg-2',
    itens: [{ tipoId: 'T001', qtd: 76 }] });
  const outro = ((await GET({ acao: 'movimentos', quem: 'U001', limit: 900,
    teste: 'todos' })).movimentos || []).filter((m) => m.qtd === 76)[0];
  ok(!!outro && outro.registro && outro.registro !== Object.keys(regs)[0],
    'e outra carga recebe outro registro — repetido, as duas apareceriam juntas para ' +
    'quem procurasse pelo código', outro && outro.registro);

  /* ---- QUEM DECLAROU VE A PROPRIA DECLARACAO ----
   *
   * A contagem cega protege o CONFERENTE de ler o numero do motorista antes de contar.
   * Ela nao protege o motorista de si mesmo: sem esta excecao, quem digitou 450 no
   * lugar de 540 nao tinha onde ver o erro — a lista do app de campo saia vazia para
   * ele, e nem dava para saber que o lancamento existia.
   *
   * PELO ID DE QUEM LANCOU, e nunca pelo perfil: "motoristas veem declaracoes" daria a
   * um motorista a declaracao de OUTRO, e ai a cega seria so a do conferente. */
  const meus = async (quem) => (await GET({ acao: 'meusLancamentos', quem: quem,
    limit: 500, teste: 'todos' })).movimentos || [];

  const doDeclarante = (await meus(declarante.ID)).filter((m) => m.declaracao === true);
  ok(doDeclarante.length > 0,
    'quem declarou VÊ a própria declaração na lista do app de campo — sem isso, quem ' +
    'digitou o número errado não tem nem onde olhar, muito menos onde corrigir',
    doDeclarante.length);

  ok((await GET({ acao: 'movimentos', quem: declarante.ID, limit: 500, teste: 'todos' }))
       .movimentos.filter((m) => m.declaracao === true).length === 0,
    'e a rota de Movimentos continua sem devolver declaração nenhuma, nem para quem a ' +
    'lançou — a exceção é da porta do app de campo, e não um afrouxamento daquela');

  const deOutro = (await meus(cego.ID)).filter((m) => m.declaracao === true);
  ok(deOutro.length === 0,
    'e a declaração de OUTRA pessoa não passa por essa porta — fosse pelo perfil, um ' +
    'motorista leria o que o outro declarou, e a contagem cega valeria só para o ' +
    'conferente', deOutro.length);

  /* A REGRA RODADA, nos dois sentidos. Lida no arquivo, a prova responderia "a palavra
     dono esta ali?" — e estaria, inclusive num `if` invertido. */
  const Ld = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const linhas = { movimentos: [
    { ID: 'x', Declaracao: true,  UsuarioID: 'U9', Perfil: 'Motorista' },
    { ID: 'y', Declaracao: true,  UsuarioID: 'U8', Perfil: 'Motorista' },
    { ID: 'z', Declaracao: false, UsuarioID: 'U8', Perfil: 'Conferente' }
  ] };
  const quaisIds = (r) => r.movimentos.map((m) => m.ID).join('');
  ok(quaisIds(Ld.semDeclaracao(linhas)) === 'z',
    'sem dono, NENHUMA declaração passa — é assim que a rota de Movimentos a chama, e ' +
    'é o que faz a contagem cega não depender de ninguém lembrar de nada',
    quaisIds(Ld.semDeclaracao(linhas)));
  ok(quaisIds(Ld.semDeclaracao(linhas, 'U8')) === 'yz',
    'com dono, passa a DELE e mais nenhuma', quaisIds(Ld.semDeclaracao(linhas, 'U8')));
  ok(quaisIds(Ld.semDeclaracao(linhas, '')) === 'z' &&
     quaisIds(Ld.semDeclaracao(linhas, '   ')) === 'z',
    'e dono vazio não vira "todas": um pedido sem quem seria a porta mais fácil de ' +
    'todas', quaisIds(Ld.semDeclaracao(linhas, '')));

  /* ---- A TRANCA DE QUEM MEXE NUMA DECLARACAO ----
   *
   * VER e ALTERAR sao duas permissoes, e ate aqui havia uma so. Quem tinha a aba via a
   * declaracao E podia excluir a linha, porque a rota de exclusao nao perguntava quem
   * estava mandando — `montarExclusao` so conferia se o lancamento existia.
   *
   * MEDIDO NA ROTA, e nao no botao. Esconder o botao e cadeado pintado na porta: o POST
   * direto passa do mesmo jeito, e e exatamente o gesto de quem quer apagar um numero
   * que nao lhe agrada. E o perfil e lido do CADASTRO — lido do pedido, seria escrito
   * por quem manda o pedido, que e quem a regra pretende barrar.
   *
   * A REGRA NAO VALE PARA O LANCAMENTO COMUM: la continua o prazo do proprio autor mais
   * a senha do escritorio. Trocar aquilo por esta lista tiraria do conferente o conserto
   * do proprio engano dez minutos depois de come-lo, que nao foi o que se pediu. */
  await POST({ acao: 'salvarUsuario', registro: { Nome: 'Confere Ve Tudo',
    Perfil: 'CONFERENTE', PIN: '445533', AcessoPainel: 'SIM',
    Abas: ['pgMovimentos', 'pgLancamentosMotorista'] } });
  const veNaoMexe = (await GET({ acao: 'equipe' })).usuarios
    .filter((u) => u.Nome === 'Confere Ve Tudo')[0];
  ok(!!veNaoMexe,
    'a conferência criou quem VÊ a declaração sem ser Admin, Gestor nem Gerente — sem ' +
    'ele a prova abaixo mediria alguém que já estava barrado por não enxergar a linha',
    !!veNaoMexe);

  const umaDecl = ((await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'declaracao|testeDecl' })).movimentos || [])
    .filter((m) => m.declaracao === true)[0];
  ok(!!umaDecl && !!umaDecl.id,
    'e achou uma declaração para tentar mexer — sem linha, as recusas abaixo seriam ' +
    '"não encontrado" e não diriam nada sobre perfil', umaDecl && umaDecl.id);

  const tentar = async (acao, quem) => await POST(Object.assign(
    /* A SENHA VAI JUNTA, e certa: o que esta bancada mede e' a barreira do PERFIL, e
       sem a senha a recusa viria da outra guarda — a prova passaria verde medindo a
       tranca errada. */
    { acao: acao, id: umaDecl.id, usuarioId: quem, motivo: 'teste de tranca',
      senha: '123456' },
    acao === 'corrigir' ? { campos: { qtd: 1 } } : {}));

  for (const acao of ['corrigir', 'cancelar', 'excluirMovimento', 'restaurarMovimento']) {
    const r = await tentar(acao, veNaoMexe.ID);
    ok(r.ok === false && /Admin, Gestor ou Gerente/.test(String(r.erro || '')),
      'quem VÊ a declaração mas não é Admin, Gestor nem Gerente é recusado em `' + acao +
      '` — e a recusa vem da ROTA, que é por onde passa o POST direto de quem quer ' +
      'apagar um número que não lhe agrada', [acao, r.ok, r.erro]);
  }

  /* E O PERFIL VEM DO CADASTRO, nao do pedido. Esta e a sabotagem que escapou da
     primeira versao desta bancada: lida do pedido, a regra seria escrita por quem manda
     o pedido — que e exatamente quem ela pretende barrar. A recusa tem de valer com o
     cargo forjado em todo nome que alguem tentaria. */
  for (const campo of ['perfil', 'Perfil', 'usuarioPerfil']) {
    const forjado = await POST(Object.assign(
      { acao: 'cancelar', id: umaDecl.id, usuarioId: veNaoMexe.ID,
        motivo: 'teste de tranca' }, { [campo]: 'ADMIN' }));
    ok(forjado.ok === false && /Admin, Gestor ou Gerente/.test(String(forjado.erro || '')),
      'e dizer-se Admin no próprio pedido (`' + campo + '`) não abre a porta — o perfil ' +
      'é lido do CADASTRO, senão a regra seria escrita por quem ela pretende barrar',
      [campo, forjado.ok, forjado.erro]);
  }

  /* E O CAMINHO INTEIRO, e nao so "excluir": posta so la, a mesma linha sairia de
     circulacao por um cancelamento sem motivo, e voltaria por uma restauracao. */
  const aindaLa = ((await GET({ acao: 'conciliacao', quem: 'U001', limit: 500,
    mundo: 'declaracao|testeDecl' })).movimentos || [])
    .filter((m) => String(m.id) === String(umaDecl.id))[0];
  ok(!!aindaLa && !aindaLa.cancelado,
    'e NADA aconteceu com a linha depois das quatro tentativas — recusa que responde ' +
    '"não pode" e grava assim mesmo é pior que não ter recusa nenhuma',
    aindaLa && [aindaLa.id, aindaLa.cancelado]);

  /* OS TRES PERFIS PASSAM. Medido um por um: escrita como "Admin ou Gerente", a lista
     deixaria o GESTOR de fora — e ele esta ACIMA do Gerente no cadastro, entao o cargo
     mais alto teria menos poder que o de baixo. */
  const LT = require(path.join(__dirname, '..', 'api', '_logica.js'));
  const passam = ['Admin', 'Gestor', 'Gerente'].filter(
    (perf) => LT.podeAlterarDeclaracao({ Perfil: perf }) === true);
  ok(passam.length === 3,
    'Admin, Gestor e Gerente passam os três — o Gestor está ACIMA do Gerente no ' +
    'cadastro, e deixá-lo de fora faria o cargo mais alto ter menos poder que o de ' +
    'baixo', passam);
  const barrados = ['Conferente', 'Motorista', 'Promotor', '', 'ADMINISTRADOR'].filter(
    (perf) => LT.podeAlterarDeclaracao({ Perfil: perf }) === false);
  ok(barrados.length === 5,
    'e os outros não passam, nem o perfil vazio, nem um nome PARECIDO com Admin — ' +
    '"começa com Admin" deixaria entrar qualquer cargo batizado assim', barrados);
  ok(LT.podeAlterarDeclaracao(null) === false,
    'e cadastro que não existe não altera nada');

  /* A LINHA COMUM NAO ENTRA NESTA REGRA. Sem esta prova, apertar a tranca de declaracao
     poderia ter fechado a porta de todo mundo em Movimentos sem ninguem notar aqui. */
  const comum = ((await GET({ acao: 'movimentos', quem: 'U001', limit: 500 }))
    .movimentos || []).filter((m) => !m.declaracao && !m.cancelado)[0];
  ok(!!comum,
    'a conferência achou um lançamento comum para o contraste', comum && comum.id);
  const emComum = await POST({ acao: 'cancelar', id: comum.id,
    usuarioId: veNaoMexe.ID, motivo: 'teste de tranca' });
  ok(!/Admin, Gestor ou Gerente/.test(String(emComum.erro || '')),
    'e o lançamento COMUM não cai nesta regra — ela é da declaração, e estendida a tudo ' +
    'tiraria do conferente o conserto do próprio engano dez minutos depois de cometê-lo',
    emComum.erro);

  /* Deixa a casa como encontrou: os blocos seguintes contam usuarios. */
  await POST({ acao: 'baseUsuarios', ids: [alfa, beta, gama], teste: false });
}

{
  console.log('\n== a aparencia e da empresa, e o servidor confere o nome ==');

  /* UMA COR SO PARA TODAS AS TELAS, a pedido. Por isso ela mora na configuracao e nao no
     aparelho: guardada no navegador, cada maquina do galpao teria a sua.

     E POR ISSO O NOME E CONFERIDO AQUI. Um valor que o CSS nao conhece nao pinta NADA:
     a tela fica sem cor de marca nenhuma, e a causa esta numa linha da tabela `config`
     que ninguem pensa em abrir. A rota nao tem autorizacao — quem manda para ela nao e
     so a nossa tela.

     ESTE BLOCO RODA A ROTA. Lido no arquivo, o teste virava busca de texto: um
     `var permitidos = null` deixava a comparacao escrita e sem efeito, e a leitura nao
     via diferenca. Medido: escapou. */
  const bom = await POST({ acao: 'salvarConfig', chave: 'tema', valor: 'ambar' });
  ok(bom.ok === true, 'um nome conhecido e aceito', bom);
  ok((await POST({ acao: 'salvarConfig', chave: 'fundo', valor: 'petroleo' })).ok === true,
     'e o fundo tambem');

  const volta = await GET({ acao: 'dados' });
  ok(volta.config.tema === 'ambar' && volta.config.fundo === 'petroleo',
    'e as duas voltam na rota `dados`, que e por onde TODA tela recebe a configuracao',
    { tema: volta.config.tema, fundo: volta.config.fundo });

  const mau = await POST({ acao: 'salvarConfig', chave: 'tema', valor: 'laranja' });
  ok(mau.ok === false && /laranja/.test(String(mau.erro)),
    'um nome que o CSS nao conhece e RECUSADO, e a resposta diz qual era', mau);
  ok(/verde, roxo, ambar, gelo/.test(String(mau.erro)),
    'e diz quais valem — "valor invalido" sozinho deixa quem chamou adivinhando', mau.erro);

  const depois = await GET({ acao: 'dados' });
  ok(depois.config.tema === 'ambar',
    'E NADA FOI GRAVADO: a cor de antes continua valendo. Gravado o nome errado, a tela '
    + 'inteira ficaria sem cor de marca ate alguem editar o banco a mao',
    depois.config.tema);

  /* ---- A COR DO TEXTO DE CADA BLOCO ----
     Quatro chaves novas, a pedido. Elas valem para TODAS as telas do galpao, e um nome
     que o aplicador nao conhece nao pinta nada: a tela fica com o texto da folha e quem
     escolheu jura que clicou. A rota confere aqui tambem, e nao so' a tela — ela nao tem
     autorizacao, e quem manda para ela nao e' so' a nossa pagina.

     AS QUATRO SAO COBRADAS UMA A UMA. Uma lista compartilhada e' escrita num lugar so',
     e um `forEach` que esquecesse uma deixaria a chave fora de `VALORES_APARENCIA` —
     e chave sem lista PASSA, porque `permitidos` sai `undefined`. */
  for (const chave of ['topoTinta', 'fundoTinta', 'botaoTinta', 'usuarioTinta']) {
    ok((await POST({ acao: 'salvarConfig', chave, valor: 'clara' })).ok === true,
       chave + ': um nome conhecido de cor de texto e aceito');
    const ruim = await POST({ acao: 'salvarConfig', chave, valor: 'fosforescente' });
    ok(ruim.ok === false && /fosforescente/.test(String(ruim.erro)),
       chave + ': e um que o aplicador nao conhece e RECUSADO — sem lista, `permitidos` '
       + 'sai `undefined` e QUALQUER texto passaria direto para o banco', ruim);
    ok(/clara, escura/.test(String(ruim.erro)),
       chave + ': e a resposta diz quais valem', ruim.erro);
  }
  const voltaT = await GET({ acao: 'dados' });
  ok(['topoTinta', 'fundoTinta', 'botaoTinta', 'usuarioTinta']
       .every((k) => voltaT.config[k] === 'clara'),
    'e as quatro voltam na rota `dados`, que e por onde TODA tela recebe a configuracao',
    { topo: voltaT.config.topoTinta, fundo: voltaT.config.fundoTinta,
      botao: voltaT.config.botaoTinta, usuario: voltaT.config.usuarioTinta });

  /* VAZIO E' UM VALOR, e e' o padrao: quer dizer "automatica", que e' a conta de
     contraste que o sistema faz sozinho. Fora da lista, nao haveria como VOLTAR a ela
     depois de escolher uma cor — e a tela ficaria presa na escolha. */
  for (const chave of ['topoTinta', 'fundoTinta', 'botaoTinta', 'usuarioTinta']) {
    ok((await POST({ acao: 'salvarConfig', chave, valor: '' })).ok === true,
       chave + ': e o vazio volta, que e a "automatica" — fora da lista, nao haveria '
       + 'como desfazer a escolha pela tela');
  }

  ok((await POST({ acao: 'salvarConfig', chave: 'fundo', valor: 'azul' })).ok === true,
     'e o fundo volta ao padrao para os blocos seguintes');
  await POST({ acao: 'salvarConfig', chave: 'tema', valor: 'roxo' });
}


/* ============================================================================
   O FORNECEDOR DA CARGA
   ========================================================================= */
console.log('\n== os dois nomes da linha saem do cadastro de hoje ==');
{
  var LN = require(path.join(__dirname, '..', 'api', '_logica.js'));
  /* O CASO QUE O ESCRITORIO APONTOU: o apelido foi trocado no cadastro, e a linha
     antiga continuava com o texto de ontem. */
  var MOTS_N = [{ ID: 'D1', Nome: 'Carlos Figueredo', Apelido: 'Dinho' }];
  var FORNS_N = [{ ID: 'F1', Nome: 'Jose Edmundo Rodrigues', Apelido: 'Mundinho',
                   Ativo: true }];
  function nn(m) { return LN.nomesDaLinha(m, MOTS_N, FORNS_N); }

  /* ---- A COLUNA FORNECEDOR TRAZ O NOME DO CADASTRO ---- */
  var linhaForn = nn({ Motorista: 'Mundinho', Fornecedor: 'Mundinho' });
  ok(linhaForn.fornecedor === 'Jose Edmundo Rodrigues',
    'a coluna Fornecedor traz o NOME do cadastro, e nao o apelido gravado na linha \u2014 ' +
    'a linha dizia "Mundinho | Mundinho", o mesmo texto duas vezes, e nenhuma das duas ' +
    'perguntas respondida por inteiro', linhaForn);
  ok(linhaForn.motorista === 'Mundinho',
    'e a coluna Motorista traz o APELIDO \u2014 o nome de trabalho de quem dirigiu',
    linhaForn.motorista);
  ok(linhaForn.motorista !== linhaForn.fornecedor,
    'e as duas dizem a mesma pessoa com textos DIFERENTES: e a isso que a tela se ' +
    'propoe \u2014 quem dirigiu, e de quem e a carga');

  /* ---- O APELIDO TROCADO NO CADASTRO CHEGA NAS LINHAS JA GRAVADAS ----
   *
   * E' o pedido inteiro: "atualize os lancamentos". A linha guarda o texto do dia; a
   * tela mostra o de hoje, sem reescrever nada no banco.
   *
   * O FIO E O TEXTO, e nao um id — e' o que faz a linha sobreviver a um cadastro
   * apagado. Por isso a coluna Fornecedor passou a guardar o NOME, que e o que menos
   * muda: trocado o apelido, e o nome que segura o vinculo.
   */
  var gravadaHoje = { Motorista: 'Mundinho', Fornecedor: 'Jose Edmundo Rodrigues' };
  var FORNS_RENOMEADO = [{ ID: 'F1', Nome: 'Jose Edmundo Rodrigues',
                           Apelido: 'Mundim', Ativo: true }];
  var depois = LN.nomesDaLinha(gravadaHoje, MOTS_N, FORNS_RENOMEADO);
  ok(depois.fornecedor === 'Jose Edmundo Rodrigues',
    'trocado o APELIDO no cadastro, a coluna Fornecedor da linha JA GRAVADA continua ' +
    'certa \u2014 quem segura o vinculo e o NOME, que e o que menos muda e e o que essa ' +
    'coluna passou a guardar', depois.fornecedor);
  /* O PRECO, MEDIDO: a coluna MOTORISTA congela no apelido do dia.
     Ela so' se resolve pelo texto DELA, e trocado o apelido esse texto nao acha mais
     ninguem. Poderia ser resolvida pela outra coluna — e ai uma linha corrigida a mao,
     em que o motorista e' outro, passaria a mostrar o fornecedor ao volante. Entre
     congelar um apelido e mentir sobre quem dirigiu, congela. */
  ok(depois.motorista === 'Mundinho',
    'e a coluna Motorista CONGELA no apelido do dia \u2014 resolve-la pelo texto da outra ' +
    'coluna faria uma linha corrigida a mao mostrar o fornecedor ao volante, e mentir ' +
    'sobre quem dirigiu e pior do que mostrar um apelido antigo', depois.motorista);
  ok(gravadaHoje.Motorista === 'Mundinho' &&
     gravadaHoje.Fornecedor === 'Jose Edmundo Rodrigues',
    'e NADA foi reescrito na linha \u2014 ela continua guardando o texto do dia, que e o ' +
    'que faz o historico sobreviver a um cadastro apagado', gravadaHoje);
  /* O LIMITE, MEDIDO: mudando o nome E o apelido de uma vez, as duas portas fecham e a
     linha mostra o que esta gravada. Escrito aqui para nao ser descoberto por acidente
     \u2014 e para a proxima pessoa saber que o piso continua sendo o texto. */
  var tudoTrocado = LN.nomesDaLinha(gravadaHoje, MOTS_N,
    [{ ID: 'F1', Nome: 'Outro Nome', Apelido: 'Outro', Ativo: true }]);
  ok(tudoTrocado.motorista === 'Mundinho' &&
     tudoTrocado.fornecedor === 'Jose Edmundo Rodrigues',
    'e trocando o NOME e o APELIDO de uma vez, a linha mostra o que esta gravada nela \u2014 ' +
    'as duas portas fecham, e o piso continua sendo o texto do dia', tudoTrocado);

  /* ---- E QUEM SUMIU DO CADASTRO CONTINUA ESCRITO ----
   * E' a garantia que o projeto sempre deu, e esta regra nao a tira: sem o piso,
   * apagar um cadastro esvaziaria a coluna de TODAS as viagens daquela pessoa. */
  var orfao = LN.nomesDaLinha({ Motorista: 'Quem Saiu', Fornecedor: 'Sitio Que Saiu' },
                              MOTS_N, FORNS_N);
  ok(orfao.motorista === 'Quem Saiu' && orfao.fornecedor === 'Sitio Que Saiu',
    'e quem sumiu do cadastro continua escrito na linha, com o nome que tinha no dia \u2014 ' +
    'sem este piso, apagar um cadastro reescreveria o passado', orfao);

  /* ---- E UMA VIAGEM COMUM NAO GANHA FORNECEDOR ----
   * A mesma pessoa pode estar nos dois cadastros. Resolvendo a coluna sempre, uma
   * carga comum levada por quem tambem e fornecedor passaria a dizer que veio dele. */
  var comum = LN.nomesDaLinha({ Motorista: 'Mundinho', Fornecedor: '' },
                              MOTS_N, FORNS_N);
  ok(comum.fornecedor === '',
    'e uma viagem COMUM continua sem fornecedor, mesmo levada por quem e um \u2014 a ' +
    'coluna responde "de qual fornecedor e esta carga", e inventar um ali seria uma ' +
    'resposta sem pergunta', comum);

  /* ---- A SEGUNDA PORTA DO FORNECEDOR, medida onde ela muda a resposta ----
   *
   * A sabotagem fechou esta porta e nada reprovou: nos casos acima o piso devolve o
   * MESMO texto que ela acharia, entao os dois caminhos coincidem. O caso que os
   * separa e a linha cuja coluna Motorista NAO casa com ninguem — um nome corrigido a
   * mao, por exemplo — e cuja coluna Fornecedor ainda guarda o apelido de ontem. */
  var soPelaColuna = LN.nomesDaLinha(
    { Motorista: 'Quem Dirigiu Naquele Dia', Fornecedor: 'Mundinho' },
    MOTS_N, FORNS_N);
  ok(soPelaColuna.fornecedor === 'Jose Edmundo Rodrigues',
    'e a coluna Fornecedor acha o cadastro pelo TEXTO DELA, quando o da coluna ' +
    'Motorista nao casa com ninguem \u2014 sao duas portas para o mesmo cadastro, e ' +
    'fechar a segunda deixa a linha com o apelido de ontem', soPelaColuna);
  ok(soPelaColuna.motorista === 'Quem Dirigiu Naquele Dia',
    'e a coluna Motorista continua dizendo quem dirigiu, com o texto do dia \u2014 achar o ' +
    'fornecedor nao reescreve quem estava ao volante', soPelaColuna.motorista);

  /* ---- E A LISTA DE VERDADE USA ISSO ----
   * As provas acima medem a REGRA. Esta mede o fio: a lista precisa RECEBER os dois
   * cadastros, e e uma linha que se apaga sem quebrar nada \u2014 a tela so' fica com os
   * nomes de ontem. */
  var idxN = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  var chamadas = (idxN.match(/L\.listaMovimentos\(/g) || []).length;
  var comCadastro = (idxN.match(/fornecedores: d\.fornecedores \}\)/g) || []).length;
  ok(chamadas > 0 && comCadastro >= chamadas,
    'e TODA chamada da lista de movimentos entrega os dois cadastros \u2014 uma esquecida ' +
    'nao quebra nada: aquela tela so passa a mostrar os nomes de ontem, e as outras os ' +
    'de hoje', { chamadas: chamadas, comCadastro: comCadastro });

  /* ---- E A LISTA DESENHA COM ELES ----
   *
   * As provas acima medem a REGRA, e a sabotagem mostrou o buraco: trocada a linha da
   * lista de volta para `m.Motorista`, a regra continuava certa e a tela voltava a
   * mostrar o texto de ontem — nenhuma prova rodava a LISTA.
   *
   * Esta roda. Um movimento de verdade entra, e a prova le a linha que sai. */
  var LOC_L = [{ ID: 'L001', Nome: 'Matriz', Tipo: 'GALPAO' },
               { ID: 'L009', Nome: 'Fornecedor', Tipo: 'ROTA', PedeFornecedor: true }];
  var TIP_L = [{ ID: 'T1', Nome: 'CX P' }];
  var USU_L = [{ ID: 'U001', Nome: 'Nestor Neto' }];
  var MOV_L = [{
    ID: 'M1', Registro: 'R000160', DataRef: '2026-10-16', DataHora: '2026-10-16T10:00:00',
    Tipo: 'DEVOLUCAO', OrigemID: 'L009', DestinoID: 'L001', TipoCaixaID: 'T1', Qtd: 300,
    /* O QUE A LINHA GUARDA e' o texto do dia: o apelido nas duas colunas, que e'
       exatamente como as onze linhas de producao estao gravadas. */
    Motorista: 'Mundinho', Fornecedor: 'Mundinho',
    UsuarioID: 'U001', Status: 'Devolvida'
  }, {
    /* A SEGUNDA LINHA EXISTE PARA SEPARAR AS HIPOTESES, e nasceu de uma escapada: na
       linha de cima o texto gravado E' o apelido de hoje, entao ler o cadastro e ler a
       linha dao a MESMA resposta — arrancar a leitura do cadastro nao mudava nada e a
       sabotagem passou.
       AQUI O MOTORISTA ESTA GRAVADO PELO NOME DO CADASTRO, que e' como ficaram as
       linhas anteriores ao apelido existir. A tela tem de mostrar o APELIDO: lendo o
       texto gravado, sairia "Carlos Figueredo" no lugar de "Dinho". */
    ID: 'M2', Registro: 'R000158', DataRef: '2026-10-16', DataHora: '2026-10-16T09:00:00',
    Tipo: 'SAIDA', OrigemID: 'L001', DestinoID: 'L009', TipoCaixaID: 'T1', Qtd: 120,
    Motorista: 'Carlos Figueredo', Fornecedor: '',
    UsuarioID: 'U001', Status: 'Enviada'
  }];
  var saiu = LN.listaMovimentos(MOV_L, LOC_L, TIP_L, USU_L, {},
                                { motoristas: MOTS_N, fornecedores: FORNS_N })[0];
  ok(!!saiu, 'a confer\u00eancia montou a linha pela lista de verdade', saiu && saiu.id);
  ok(saiu && saiu.fornecedor === 'Jose Edmundo Rodrigues',
    'e a coluna Fornecedor da LISTA traz o nome do cadastro \u2014 a linha est\u00e1 gravada com ' +
    '"Mundinho" nas duas colunas, e e assim que as onze linhas de producao estao',
    saiu && saiu.fornecedor);
  ok(saiu && saiu.motorista === 'Mundinho',
    'e a coluna Motorista da LISTA traz o apelido', saiu && saiu.motorista);
  ok(saiu && saiu.motorista !== saiu.fornecedor,
    'e as duas colunas da linha desenhada dizem textos diferentes \u2014 era "Mundinho | ' +
    'Mundinho" na tela, o mesmo texto repetido',
    saiu && [saiu.motorista, saiu.fornecedor]);
  /* A LINHA GRAVADA PELO NOME DO CADASTRO — as anteriores ao apelido existir. */
  var velha = LN.listaMovimentos(MOV_L, LOC_L, TIP_L, USU_L, {},
                                 { motoristas: MOTS_N, fornecedores: FORNS_N })
    .filter(function (l) { return l.id === 'M2'; })[0];
  ok(velha && velha.motorista === 'Dinho',
    'e a linha gravada pelo NOME do cadastro aparece com o APELIDO \u2014 e o pedido ' +
    '("o motorista deve trazer o apelido do cadastro"), e e o caso que separa ler o ' +
    'cadastro de ler o texto da linha: so nele as duas respostas diferem',
    velha && velha.motorista);
  ok(velha && velha.fornecedor === '',
    'e ela continua sem fornecedor \u2014 e uma viagem comum', velha && velha.fornecedor);
  /* SEM OS CADASTROS a lista ainda sai, com o texto gravado — e' o piso. Medido para
     que a falta de um deles nao vire um erro na tela do galpao. */
  var semCad = LN.listaMovimentos(MOV_L, LOC_L, TIP_L, USU_L, {})[0];
  ok(semCad && semCad.motorista === 'Mundinho' && semCad.fornecedor === 'Mundinho',
    'e sem os cadastros a lista ainda sai, com o texto gravado \u2014 a falta de um deles ' +
    'nao pode virar erro na tela de quem esta no galpao', semCad && semCad.fornecedor);
}

console.log('\n== o carro do fornecedor ==');
{
  /* A COLUNA EXISTE NO BANCO. A migracao e' append-only e roda sozinha na subida; sem
     ela, o `insert` falha com "column does not exist" e o cadastro inteiro para. */
  var migF = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');
  ok(/id: '2026-10-17-fornecedor-veiculo'/.test(migF) &&
     /alter table public\.fornecedores/.test(migF) &&
     /add column if not exists placa/.test(migF) &&
     /add column if not exists modelo/.test(migF) &&
     /add column if not exists tipo/.test(migF),
    'a migracao acrescenta placa, modelo e tipo em `fornecedores`', migF.length);
  /* NENHUM APOSTROFO DENTRO DO SQL: ja' derrubou este sistema uma vez — a string do
     JavaScript fecha no meio da frase e o comando sobe partido. */
  var iMF = migF.indexOf("id: '2026-10-17-fornecedor-veiculo'");
  var blocoF = migF.slice(iMF, migF.indexOf('].join', iMF));
  ok(blocoF.indexOf("\\'") < 0,
    'e o SQL dela nao tem apostrofo escapado dentro \u2014 a string fecha no meio da frase ' +
    'e o comando sobe partido, que ja aconteceu neste projeto');

  /* ---- E O CADASTRO GRAVA E DEVOLVE OS TRES ---- */
  var novoF = await POST({ acao: 'salvarFornecedor', registro: {
    Nome: 'Sitio do Carro', Apelido: 'Carrinho', Localidade: 'Vicencia',
    Placa: 'rta-7j51', Modelo: 'HR bau', Tipo: 'Bau', Ativo: 'SIM' } });
  ok(novoF.ok, 'o fornecedor com carro foi gravado', novoF);
  var lidosF = (await GET({ acao: 'dados' })).fornecedores || [];
  var salvoF = lidosF.filter(function (f) { return f.Apelido === 'Carrinho'; })[0];
  ok(!!salvoF && salvoF.Modelo === 'HR bau' && salvoF.Tipo === 'Bau',
    'e modelo e tipo VOLTAM do banco \u2014 gravados e nao lidos, os campos seriam ' +
    'interruptores sem fio', salvoF);
  /* A PLACA VOLTA LIMPA, pela mesma regra da tabela `veiculos`: sem hifen, em caixa
     alta. Duas grafias do mesmo carro fazem o relatorio por veiculo lista-lo duas
     vezes, com metade do total em cada — e o carro do fornecedor entra nos mesmos
     relatorios que o da casa. */
  ok(!!salvoF && salvoF.Placa === 'RTA7J51',
    'e a placa volta LIMPA, como no cadastro de veiculos: "rta-7j51" virou "RTA7J51" \u2014 ' +
    'duas grafias do mesmo carro partem o relatorio por veiculo em dois',
    salvoF && salvoF.Placa);
  /* VAZIA CONTINUA VALENDO, e quer dizer "digite a cada lancamento" — que e o que a
     tela fazia para todos ate' agora. */
  var semCarroF = await POST({ acao: 'salvarFornecedor', registro: {
    Nome: 'Sitio Sem Carro', Apelido: 'Apeado', Ativo: 'SIM' } });
  ok(semCarroF.ok, 'e um fornecedor sem carro continua entrando', semCarroF);
  var lidos2F = (await GET({ acao: 'dados' })).fornecedores || [];
  var vazioF = lidos2F.filter(function (f) { return f.Apelido === 'Apeado'; })[0];
  ok(!!vazioF && vazioF.Placa === '' && vazioF.Modelo === '' && vazioF.Tipo === '',
    'e os tres campos dele voltam VAZIOS, e nao nulos \u2014 vazio quer dizer "digite a ' +
    'placa", que e o que a tela faz', vazioF);
}

console.log('\n== o banco de mentira carrega o mesmo que o de verdade ==');
{
  /* A BANCADA SO' VALE SE O BANCO DE MENTIRA TIVER O QUE O DE VERDADE TEM.
   *
   * `veiculos` e `fornecedores` ficaram de fora deste `carregarTudo` quando nasceram, e
   * a falta nao reprovou nada: as regras que os leem recebiam `undefined`, respondiam
   * "nao achei" — resposta plausivel — e as provas passavam verdes sobre um banco que
   * nao existe. Foi assim que a troca do cadastro de fornecedor chegou ate' aqui sem
   * ninguem perceber.
   *
   * AS CHAVES SAO LIDAS DO ARQUIVO DE VERDADE, e nao escritas aqui: escrita, a lista
   * nao cresce com a tabela que alguem acrescentar — que e' exatamente o esquecimento
   * que esta prova existe para pegar. */
  var fonteDb = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
  var iC = fonteDb.indexOf('async function carregarTudo()');
  var corpoC = iC < 0 ? '' : fonteDb.slice(iC, fonteDb.indexOf('\n}', iC));
  var devolve = corpoC.slice(corpoC.indexOf('return {'));
  var chavesReais = (devolve.match(/^\s{4}(\w+):/gm) || [])
    .map(function (x) { return x.trim().replace(':', ''); });
  ok(chavesReais.length >= 9,
    'a conferencia leu as chaves do `carregarTudo` de VERDADE — lista vazia faria a ' +
    'prova abaixo passar sem comparar nada', chavesReais);
  var doFalso = Object.keys(await falso.carregarTudo());
  var faltando = chavesReais.filter(function (k) { return doFalso.indexOf(k) < 0; });
  ok(!faltando.length,
    'e o banco de mentira devolve TODAS elas — faltando uma, as regras que a leem ' +
    'recebem `undefined` e respondem "nao achei", que e uma resposta plausivel: a ' +
    'suite fica verde sobre um banco que nao existe', faltando);
}

console.log('\n== o fornecedor vem do cadastro de fornecedores ==');
{
  /* O MODULO DE VERDADE, como as outras secoes deste arquivo fazem. */
  var L = require(path.join(__dirname, '..', 'api', '_logica.js'));
  var LOCAIS_F = [
    { ID: 'L001', Nome: 'Matriz Sao Vicente', Tipo: 'GALPAO' },
    { ID: 'L009', Nome: 'Fornecedor',         Tipo: 'ROTA', PedeFornecedor: true },
    { ID: 'L005', Nome: 'Caruaru',            Tipo: 'ROTA' }
  ];
  /* A LISTA E' A DO CADASTRO DE FORNECEDORES, e nao mais a de motoristas.
   *
   * POR QUE MUDOU: os vinte e oito estavam cadastrados nos dois lugares, e o lado do
   * motorista eram cascas — zero CPF, zero CNH, zero telefone, zero placa, zero rota.
   * O unico campo preenchido era `Empresa`, e dentro dele estava a LOCALIDADE
   * ("Fornecedor - Macaparana"): faltando onde por o dado, o escritorio dobrou um campo
   * para ele caber.
   *
   * `Dinho` CONTINUA NA PROVA, agora como quem NAO esta no cadastro de fornecedores —
   * e' o caso que separa "a rota pede fornecedor" de "qualquer um serve". */
  var FORNS_F = [
    { ID: 'F1', Nome: 'Roberto Cavalcanti', Apelido: 'Braulio', Ativo: true },
    { ID: 'F2', Nome: 'Sitio Aposentado',   Apelido: 'Velho',   Ativo: false }
  ];
  function conf(p) { return L.conferirFornecedor(p, LOCAIS_F, FORNS_F); }
  function nomeDe(p) { return L.fornecedorDoMovimento(p, LOCAIS_F, FORNS_F); }

  /* ---- AS DUAS PONTAS CONTAM ----
   * Na saida o fornecedor e' o DESTINO; no retorno, a ORIGEM. Uma regra que olhasse so'
   * um lado deixaria metade da operacao sem conferencia — e seria a metade que varia
   * conforme a tela, que e' o pior jeito de uma regra falhar. */
  ok(conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009' }),
    'a saida PARA a rota de fornecedor exige um fornecedor — sem ele a linha nao diz de ' +
    'quem e a carga, que e a pergunta deste sistema');
  ok(conf({ tipo: 'DEVOLUCAO', origemId: 'L009', destinoId: 'L001' }),
    'e o retorno VINDO dela exige a mesma coisa');
  ok(!conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L005', motorista: 'Dinho' }),
    'e a rota que NAO pede continua lancando com o motorista de sempre');

  /* ---- O CADASTRO DE FORNECEDORES E' A REGRA ---- */
  ok(/fora do cadastro/.test(
       conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Dinho' })),
    'e um MOTORISTA e recusado na rota de fornecedor — ele nao esta no cadastro de ' +
    'fornecedores, e aceitar qualquer um faria a coluna Fornecedor apontar para quem ' +
    'nao e',
    conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Dinho' }));
  ok(!conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Braulio' }),
    'e o fornecedor do cadastro passa, pelo apelido — o nome de trabalho, que e o que ' +
    'a linha grava');
  ok(!conf({ tipo: 'DEVOLUCAO', origemId: 'L009', destinoId: 'L001',
             motorista: 'Roberto Cavalcanti' }),
    'e pelo nome do cadastro tambem — as duas portas levam ao mesmo fornecedor, e ' +
    'recusar uma quebraria a correcao do que ja foi lancado');
  /* INATIVO E' RECUSADO AQUI, e nao so sumindo do seletor: sumir e conveniencia, e um
     POST direto passa por cima dela. E' a mesma regra de todo cadastro daqui — e e ela
     que vai deixar aposentar um fornecedor sem reescrever o historico. */
  ok(/inativo/i.test(
       conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Velho' })),
    'e o fornecedor INATIVO e recusado no servidor, e nao so escondido da lista — ' +
    'esconder e conveniencia; quem manda um POST direto passa por cima dela',
    conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Velho' }));
  ok(/fora do cadastro/.test(
       conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Fulano' })),
    'e quem nao esta no cadastro e recusado, com a frase dizendo o que fazer',
    conf({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Fulano' }));

  /* ---- AJUSTE E PERDA FICAM DE FORA ---- */
  ok(!conf({ tipo: 'AJUSTE', destinoId: 'L009' }),
    'o AJUSTE no local marcado nao pede motorista — ele nasce no escritorio e nao e ' +
    'viagem de caixa; exigindo, o administrador ficaria trancado fora do proprio ajuste');
  ok(!conf({ tipo: 'PERDA', origemId: 'L009' }), 'e a PERDA tambem nao');

  /* ---- O NOME DA COLUNA E' DERIVADO, e nao recebido ----
   * Com uma fonte so', a coluna Fornecedor nunca pode discordar da coluna Motorista da
   * mesma linha — e um POST direto nao tem como mandar outro nome. */
  ok(nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009',
              motorista: 'Braulio' }) === 'Roberto Cavalcanti',
    'o nome que vai para a coluna Fornecedor e o NOME DO CADASTRO, e nao o apelido: ' +
    'as duas colunas da linha respondem perguntas diferentes — quem dirigiu e de quem ' +
    'e a carga —, e com o apelido nas duas a linha repete o mesmo texto',
    nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Braulio' }));
  ok(nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009',
              motorista: 'Roberto Cavalcanti' }) === 'Roberto Cavalcanti',
    'e e sempre o mesmo nome, venha o lancamento pelo apelido ou pelo nome do ' +
    'cadastro — duas grafias da mesma pessoa partiriam o relatorio em dois');
  /* COM O PROPRIO FORNECEDOR numa rota COMUM, que e' o caso que separa as duas
     guardas. Com um motorista comum, a coluna ficaria vazia de qualquer jeito — pelo
     TIPO dele —, e arrancar a guarda da rota nao mudava nada: foi assim que a
     sabotagem passou por aqui. */
  ok(nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L005',
              motorista: 'Braulio' }) === '',
    'e fora da rota de fornecedor a coluna fica vazia ATE para o proprio fornecedor — ' +
    'ela responde "de qual fornecedor e esta carga", e a mesma pessoa levando uma ' +
    'carga comum nao faz dela uma carga de fornecedor');
  ok(nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L005',
              motorista: 'Dinho' }) === '',
    'e com um motorista comum tambem');
  ok(nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009',
              motorista: 'Dinho' }) === '',
    'e quem nao esta no cadastro de fornecedores nao vira fornecedor por acidente — o ' +
    'lancamento ja foi recusado, e se passasse por outro caminho a coluna nao mentiria');

  /* ---- O CONSTRUTOR IGNORA O QUE VIER NO PEDIDO ----
   * O fornecedor e' DERIVADO do motorista, contra o cadastro, e quem deriva e' a rota.
   * Se o construtor lesse `p.fornecedor`, um POST montado a mao escreveria o nome que
   * quisesse na coluna — e ela passaria a discordar da coluna Motorista da mesma linha,
   * as duas plausiveis. Ignorando o pedido, o pior caso vira uma coluna VAZIA, que se
   * ve'. */
  var mentiroso = L.montarMovimento({
    tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Braulio',
    fornecedor: 'INVENTADO PELO PEDIDO',
    itens: [{ tipoCaixaId: 'T1', qtd: 5 }], dataRef: '2026-10-16', usuarioId: 'U001'
  }, { movimentos: [], agora: new Date('2026-10-16T12:00:00Z'),
       fornecedor: nomeDe({ tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009',
                            motorista: 'Braulio' }) });
  ok(mentiroso.ok && mentiroso.linhas[0].Fornecedor === 'Roberto Cavalcanti',
    'e o construtor IGNORA o fornecedor que vier no pedido — ele usa o que a rota ' +
    'derivou do motorista: lendo o pedido, um POST montado a mao escreveria o nome que ' +
    'quisesse na coluna, e ela discordaria da coluna Motorista da mesma linha',
    mentiroso.ok ? mentiroso.linhas[0].Fornecedor : mentiroso.erro);
  var semCtx = L.montarMovimento({
    tipo: 'SAIDA', origemId: 'L001', destinoId: 'L009', motorista: 'Braulio',
    fornecedor: 'INVENTADO PELO PEDIDO',
    itens: [{ tipoCaixaId: 'T1', qtd: 5 }], dataRef: '2026-10-16', usuarioId: 'U001'
  }, { movimentos: [], agora: new Date('2026-10-16T12:00:00Z') });
  ok(semCtx.ok && semCtx.linhas[0].Fornecedor === null,
    'e sem a rota derivar nada a coluna fica NULA, e nao com o que o pedido mandou — ' +
    'uma coluna vazia se ve; uma coluna com o nome errado, nao',
    semCtx.ok ? semCtx.linhas[0].Fornecedor : semCtx.erro);
}

console.log('\n== e a rota deriva mesmo: o lancamento inteiro ==');
{
  /* DE PONTA A PONTA, e e' a unica forma de medir isto.
   *
   * As provas acima cobrem a REGRA (quem pode) e o CONSTRUTOR (de onde vem o nome). O
   * que falta e' o fio entre os dois: a rota precisa DERIVAR o nome e passa-lo ao
   * construtor. Arrancar essa linha nao quebrava nada — a coluna saia vazia e todas as
   * provas continuavam verdes, porque nenhuma lancava de verdade e lia a linha gravada.
   *
   * FICA NO FIM DO ARQUIVO de proposito: este bloco GRAVA um movimento, e qualquer
   * conta de saldo depois dele mudaria de valor. No meio, a prova viraria a causa do
   * erro que ela deveria achar. */
  var forn = await POST({ acao: 'salvarFornecedor', registro: {
    Nome: 'Roberto Cavalcanti', Apelido: 'Braulio', Localidade: 'Macaparana',
    Ativo: 'SIM' } });
  ok(forn.ok, 'o fornecedor foi cadastrado pela API', forn);
  /* UM MOTORISTA COM O MESMO PAPEL, cadastrado em paralelo, e' o caso que separa as
     duas listas: se a regra ainda olhasse o cadastro de motoristas, ela passaria por
     ele e a prova continuaria verde sem o fornecedor existir. */
  var motComum = await POST({ acao: 'salvarMotorista', registro: {
    Nome: 'Dinho da Silva', Apelido: 'Dinho', Tipo: 'Fixo', Rotas: [rotaForn.id] } });
  ok(motComum.ok, 'e um motorista comum tambem, atendendo a mesma rota', motComum);
  var recusa = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G,
    destinoId: rotaForn.id, itens: [{ tipoCaixaId: T, qtd: 3 }], dataRef: dia(-1),
    usuarioId: 'U001', perfil: 'ADMIN', motorista: 'Dinho' });
  ok(!recusa.ok && /fora do cadastro/.test(String(recusa.erro || '')),
    'e o motorista comum e RECUSADO na rota de fornecedor, de ponta a ponta — a lista ' +
    'da tela e conveniencia, e um POST direto passa por cima dela', recusa);

  var lanc = await POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G,
    destinoId: rotaForn.id, itens: [{ tipoCaixaId: T, qtd: 7 }], dataRef: dia(-1),
    usuarioId: 'U001', perfil: 'ADMIN', motorista: 'Braulio',
    /* O PEDIDO AINDA MANDA UM NOME INVENTADO, para a prova valer dos dois lados: a
       coluna tem de sair com o nome DERIVADO, e nao com este. */
    fornecedor: 'INVENTADO PELO PEDIDO' });
  ok(lanc.ok, 'e o lancamento pela rota de fornecedor passa com ele', lanc);

  var linhas = (await GET({ acao: 'movimentos', quem: 'U001' })).movimentos || [];
  var gravada = linhas.filter(function (m) {
    return String(m.destino || '').indexOf('Fornecedor (prova)') >= 0;
  })[0];
  ok(!!gravada, 'e a linha aparece na lista de movimentos',
     gravada && gravada.id);
  ok(gravada && gravada.fornecedor === 'Roberto Cavalcanti',
    'e a coluna Fornecedor da linha gravada traz o nome DERIVADO do CADASTRO DE ' +
    'FORNECEDORES — nao o que o pedido mandou, e nao vazio: e este fio, entre a regra ' +
    'e o construtor, que nenhuma prova alcancava',
    gravada && { fornecedor: gravada.fornecedor, motorista: gravada.motorista });
  ok(gravada && gravada.motorista === 'Braulio',
    'e a coluna Motorista traz o APELIDO — o nome de trabalho de quem dirigiu, que e ' +
    'por onde o galpao chama a pessoa',
    gravada && [gravada.fornecedor, gravada.motorista]);
  /* AS DUAS COLUNAS DIZEM A MESMA PESSOA E TEXTOS DIFERENTES, e e esse o pedido:
     "Mundinho | Mundinho" nao responde nenhuma das duas perguntas por inteiro. */
  ok(gravada && gravada.motorista !== gravada.fornecedor,
    'e as duas colunas da mesma linha dizem a mesma pessoa com textos DIFERENTES: o ' +
    'apelido de quem dirigiu e o nome de quem vendeu — o mesmo texto nas duas e meia ' +
    'resposta repetida', gravada && [gravada.motorista, gravada.fornecedor]);
}

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TODOS OS TESTES PASSARAM\n');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
