/**
 * Qdelícia Frutas — Controle de Caixas
 * O aviso de saldo na devolução.
 *
 * POR QUE ISTO EXISTE
 * `painel()` monta `locais` só com CLIENTE e FILIAL, e devolve as rotas à parte,
 * em `rotas`. `mostrarSaldoDoOrigem` procurava a origem da devolução em
 * `locais`, mas `dvOrigem` lista ROTAS. Nunca achava. A caixa de saldo e o
 * alerta de "você contou mais do que o saldo" ficavam mudos — e esse alerta é
 * uma das guardas do app contra saída não lançada.
 *
 * A METADE QUE SAIU DAQUI, e por quê: este arquivo também cobrava a aba "Saldo
 * de Caixas por Rota", que foi trocada por Lançamentos em `0787829` — de
 * propósito, porque respondia uma pergunta só e não deixava conferir
 * lançamento nenhum. As treze asserções dela ficaram apontando para uma
 * `desenharSaldos` que não existe mais, e a suíte inteira passou a morrer no
 * carregamento: as nove que AINDA guardam alguma coisa não rodavam havia
 * semanas por causa das treze que já não guardavam nada. Suíte vermelha que
 * todo mundo aprendeu a ignorar é pior que suíte nenhuma, porque ocupa o lugar
 * de uma que falaria.
 *
 * Não roda navegador: lê a função do index.html e executa com DOM de mentira.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var falhas = 0;

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

function corpo(nome) {
  var i = html.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  var d = 0, fim = -1;
  for (var k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}

/* ---- DOM de mentira ---- */
function el() {
  return {
    value: '', innerHTML: '',
    querySelectorAll: function () { return []; }
  };
}
var els = { dvOrigem: el(), dvSaldoAtual: el() };
global.document = { getElementById: function (id) { return els[id] || null; } };
global.Q = {
  esc: function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
  num: function (n) { return String(n); }
};

/* Painel de mentira: uma rota com caixa no caminhão E nos clientes. */
global.PAINEL = {
  locais: [ { id: 'C1', nome: 'Mercado Bom Preço', tipo: 'CLIENTE', saldo: 40, aging: { d31: 0 } } ],
  rotas: [
    { id: 'R1', nome: 'Caruaru', motorista: 'Ramos', saldo: 120, saldoClientes: 300,
      clientes: 7, aging: { d31: 15, maisAntiga: 44 }, emConferencia: 20 },
    { id: 'R2', nome: 'Petrolina', motorista: 'Jorge', saldo: 0, saldoClientes: 0,
      clientes: 0, aging: { d31: 0, maisAntiga: null }, emConferencia: 0 }
  ]
};
global.coletarItens = function () { return CONTAGEM; };
var CONTAGEM = [];

eval(corpo('mostrarSaldoDoOrigem') +
     '\nglobal.mostrarSaldoDoOrigem = mostrarSaldoDoOrigem;');

console.log('\n== Aviso de saldo na devolução (estava mudo) ==');

/* ---- 6. a origem é uma ROTA: precisa ser achada ---- */
els.dvOrigem.value = 'R1';
CONTAGEM = [{ tipo: 'CX P', qtd: 10 }];
mostrarSaldoDoOrigem();
var aviso = els.dvSaldoAtual.innerHTML;
ok(aviso.indexOf('Caruaru') >= 0, 'acha a rota e mostra o saldo dela');
ok(aviso.indexOf('120') >= 0, 'o número é o do caminhão');
ok(aviso.indexOf('44 dias') >= 0, 'mostra há quanto tempo está a mais antiga');

/* ---- 7. contar mais do que o saldo dispara o alerta ---- */
CONTAGEM = [{ tipo: 'CX P', qtd: 500 }];
mostrarSaldoDoOrigem();
ok(/contou/.test(els.dvSaldoAtual.innerHTML), 'contagem acima do saldo avisa');
CONTAGEM = [{ tipo: 'CX P', qtd: 10 }];
mostrarSaldoDoOrigem();
ok(!/contou/.test(els.dvSaldoAtual.innerHTML), 'contagem dentro do saldo não avisa à toa');

/* ---- 8. cliente como origem ainda funciona ---- */
els.dvOrigem.value = 'C1';
mostrarSaldoDoOrigem();
ok(els.dvSaldoAtual.innerHTML.indexOf('Mercado Bom Preço') >= 0, 'cliente como origem segue funcionando');

/* ---- 9. origem desconhecida não quebra ---- */
els.dvOrigem.value = 'XX';
mostrarSaldoDoOrigem();
ok(els.dvSaldoAtual.innerHTML === '', 'origem sem cadastro não mostra nada nem estoura');
els.dvOrigem.value = '';
mostrarSaldoDoOrigem();
ok(els.dvSaldoAtual.innerHTML === '', 'sem origem escolhida, nada');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> SALDO OK');
