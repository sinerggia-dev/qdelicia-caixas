/* Testa a lógica do Code.gs fora do Google, com uma planilha falsa em memória. */
const fs = require('fs');
const path = require('path');

/* ---------- stubs do ambiente Apps Script ---------- */
function Sheet(nome) {
  this.nome = nome; this.dados = [];
  this.getName = () => this.nome;
  this.getLastRow = () => this.dados.length;
  this.getMaxColumns = () => 26;
  this.setFrozenRows = () => this;
  this.deleteColumns = () => this;
  this.appendRow = (linha) => { this.dados.push(linha.slice()); };
  this.deleteRow = (i) => { this.dados.splice(i - 1, 1); };
  this.getRange = (r, c, nr, nc) => {
    nr = nr || 1; nc = nc || 1;
    const self = this;
    return {
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          const li = r - 1 + i;
          while (self.dados.length <= li) self.dados.push([]);
          for (let j = 0; j < vals[i].length; j++) self.dados[li][c - 1 + j] = vals[i][j];
        }
        return this;
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const linha = self.dados[r - 1 + i] || [];
          const l = [];
          for (let j = 0; j < nc; j++) l.push(linha[c - 1 + j] === undefined ? '' : linha[c - 1 + j]);
          out.push(l);
        }
        return out;
      },
      setValue(v) {
        while (self.dados.length < r) self.dados.push([]);
        self.dados[r - 1][c - 1] = v; return this;
      },
      getValue() { return (self.dados[r - 1] || [])[c - 1]; },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }
    };
  };
}
const abas = {};
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (n) => abas[n] || null,
    insertSheet: (n) => (abas[n] = new Sheet(n)),
    getSheets: () => Object.values(abas),
    deleteSheet: (s) => { delete abas[s.getName()]; }
  })
};
global.Utilities = {
  getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
  base64Decode: () => [1, 2, 3],
  newBlob: () => ({}),
  formatDate: (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
};
global.Session = { getScriptTimeZone: () => 'America/Recife' };
global.DriveApp = {
  Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
  createFolder: () => ({ getId: () => 'pasta123', setSharing: () => { }, createFile: () => ({ getId: () => 'arq1', setSharing: () => { } }) }),
  getFolderById: () => ({ getId: () => 'pasta123', createFile: () => ({ getId: () => 'arq1', setSharing: () => { } }) })
};
global.LockService = { getScriptLock: () => ({ waitLock: () => { }, releaseLock: () => { } }) };
global.ContentService = {
  MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
  createTextOutput: (t) => ({ texto: t, setMimeType() { return this; }, getContent() { return this.texto; } })
};

/* ---------- carrega o Code.gs ---------- */
const codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
eval(codigo);

/* ---------- utilidades do teste ---------- */
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const POST = (p) => JSON.parse(doPost({ postData: { contents: JSON.stringify(p) } }).getContent());
const GET = (p) => JSON.parse(doGet({ parameter: p }).getContent());
let falhas = 0;
function ok(cond, msg, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '   <<< ' + JSON.stringify(extra)));
  if (!cond) falhas++;
}

/* ---------- cenário ---------- */
console.log('\n== setup ==');
console.log('  ' + setup());
const locais = GET({ acao: 'dados' }).locais;
const G = locais.find(l => l.Tipo === 'GALPAO').ID;
const F = locais.find(l => l.Tipo === 'FILIAL').ID;
const C = locais.find(l => l.Tipo === 'CLIENTE').ID;
const T = GET({ acao: 'dados' }).tipos[0].ID;
console.log(`  galpão=${G} filial=${F} cliente=${C} tipoCaixa=${T}`);

console.log('\n== lançamentos ==');
ok(POST({ acao: 'movimento', tipo: 'AJUSTE', destinoId: G, itens: [{ tipoCaixaId: T, qtd: 1000 }], dataRef: dia(-60), usuarioId: 'U001', perfil: 'ESCRITORIO' }).ok, 'ajuste inicial galpão 1000');
ok(POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 100 }], dataRef: dia(-20), usuarioId: 'U003', perfil: 'MOTORISTA' }).ok, 'saída 100 p/ cliente (20 dias atrás)');
ok(POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 50 }], dataRef: dia(-3), usuarioId: 'U003', perfil: 'MOTORISTA' }).ok, 'saída 50 p/ cliente (3 dias atrás)');

let p = GET({ acao: 'painel' }).painel;
let cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 150, 'saldo do cliente = 150', cli.saldo);

console.log('\n== devolução contada pelo promotor (não pode baixar saldo ainda) ==');
const dev = POST({ acao: 'movimento', tipo: 'DEVOLUCAO', origemId: C, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 80 }], dataRef: dia(-1), usuarioId: 'U004', perfil: 'PROMOTOR' });
ok(dev.status === 'AGUARDANDO', 'devolução do promotor fica AGUARDANDO', dev.status);
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 150, 'saldo do cliente continua 150 antes da conferência', cli.saldo);
ok(cli.emConferencia === 80, 'mostra 80 em conferência', cli.emConferencia);
ok(GET({ acao: 'pendentes' }).movimentos.length === 1, '1 item na fila de conferência');

console.log('\n== conferência no galpão: chegaram 75 ==');
const conf = POST({ acao: 'conferir', id: dev.criados[0].id, qtdConferida: 75, obs: 'faltaram 5', usuarioId: 'U002' });
ok(conf.ok && conf.divergencia === -5, 'divergência de -5 registrada', conf);
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 75, 'saldo do cliente = 75 (150 - 75 conferidas)', cli.saldo);
ok(cli.emConferencia === 0, 'nada mais em conferência', cli.emConferencia);
ok(p.kpis.divergenciaMes === -5, 'KPI divergência do mês = -5', p.kpis.divergenciaMes);

console.log('\n== baixa de perda de 5 caixas ==');
ok(POST({ acao: 'movimento', tipo: 'PERDA', origemId: C, itens: [{ tipoCaixaId: T, qtd: 5 }], dataRef: dia(0), obs: 'quebradas', usuarioId: 'U001', perfil: 'ESCRITORIO' }).ok, 'perda lançada');
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 70, 'saldo do cliente = 70', cli.saldo);
ok(cli.aging.d16_30 === 20 && cli.aging.d0_7 === 50, 'aging FIFO: 20 caixas com 16-30 dias + 50 com até 7 dias', cli.aging);
ok(cli.aging.maisAntiga === 20, 'caixa mais antiga tem 20 dias', cli.aging.maisAntiga);
ok(cli.vencidas === 20, 'vencidas (prazo 7 dias) = 20', cli.vencidas);
ok(p.kpis.perdasMes === 5, 'KPI perdas do mês = 5', p.kpis.perdasMes);

console.log('\n== caminho galpão → filial → cliente ==');
ok(POST({ acao: 'movimento', tipo: 'TRANSFERENCIA', origemId: G, destinoId: F, itens: [{ tipoCaixaId: T, qtd: 200 }], dataRef: dia(-10), usuarioId: 'U001', perfil: 'ESCRITORIO' }).ok, 'transferência 200 p/ filial');
ok(POST({ acao: 'movimento', tipo: 'SAIDA', origemId: F, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 30 }], dataRef: dia(-2), usuarioId: 'U003', perfil: 'MOTORISTA' }).ok, 'saída 30 da filial p/ cliente');
p = GET({ acao: 'painel' }).painel;
const fil = p.locais.find(l => l.id === F); cli = p.locais.find(l => l.id === C);
ok(fil.saldo === 170, 'filial fica com 170', fil.saldo);
ok(cli.saldo === 100, 'cliente sobe para 100', cli.saldo);
const galp = p.galpoes.find(g => g.id === G);
ok(galp.saldo === 1000 - 100 - 50 + 75 - 200, 'estoque do galpão = 725', galp.saldo);

console.log('\n== idempotência (reenvio da fila offline) ==');
const ck = 'K-teste-fila';
POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 40 }], clientKey: ck, dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' });
const r2 = POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 40 }], clientKey: ck, dataRef: dia(0), usuarioId: 'U003', perfil: 'MOTORISTA' });
ok(r2.criados[0].duplicado === true, 'reenvio com o mesmo clientKey não duplica', r2);
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 140, 'saldo do cliente = 140 (só uma vez os 40)', cli.saldo);

console.log('\n== extrato do cliente ==');
const ex = GET({ acao: 'extrato', local: C });
ok(ex.ok && ex.saldo === 140, 'saldo do extrato bate com o painel', ex.saldo);
ok(ex.linhas.length === 6, '6 linhas no extrato', ex.linhas.length);
ok(ex.linhas[ex.linhas.length - 1].saldo === 140, 'última linha fecha em 140', ex.linhas[ex.linhas.length - 1].saldo);
const divLinha = ex.linhas.find(l => l.divergencia);
ok(divLinha && divLinha.divergencia === -5, 'extrato mostra a divergência de -5', divLinha && divLinha.divergencia);
const tokenCliente = GET({ acao: 'dados' }).locais.find(l => l.ID === C).Token;
ok(GET({ acao: 'extratoToken', t: tokenCliente }).ok, 'link do cliente (token) funciona');
ok(GET({ acao: 'extratoToken', t: 'xxx' }).ok === false, 'token inválido é recusado');

console.log('\n== cancelamento ==');
const alvo = GET({ acao: 'movimentos', limit: 100 }).movimentos.find(m => m.tipo === 'SAIDA' && m.qtd === 40);
ok(POST({ acao: 'cancelar', id: alvo.id, motivo: 'lançado em dobro', usuarioId: 'U001' }).ok, 'movimento cancelado');
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 100, 'saldo volta para 100 após cancelar', cli.saldo);

console.log('\n== login ==');
ok(POST({ acao: 'login', usuarioId: 'U001', pin: '1234' }).ok, 'login com PIN correto');
ok(POST({ acao: 'login', usuarioId: 'U001', pin: '9999' }).ok === false, 'login com PIN errado é recusado');

console.log('\n== validações ==');
ok(POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: G, itens: [{ tipoCaixaId: T, qtd: 5 }] }).ok === false, 'origem igual ao destino é recusado');
ok(POST({ acao: 'movimento', tipo: 'SAIDA', origemId: G, destinoId: C, itens: [{ tipoCaixaId: T, qtd: 0 }] }).ok === false, 'quantidade zero é recusada');
ok(POST({ acao: 'movimento', tipo: 'AJUSTE', destinoId: C, itens: [{ tipoCaixaId: T, qtd: -10 }], usuarioId: 'U001' }).ok, 'ajuste negativo é aceito');
p = GET({ acao: 'painel' }).painel; cli = p.locais.find(l => l.id === C);
ok(cli.saldo === 90, 'ajuste negativo baixou o saldo para 90', cli.saldo);

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TODOS OS TESTES PASSARAM\n');
process.exit(falhas ? 1 : 0);
