/**
 * Qdelícia Frutas — Controle de Caixas
 * Aba Saldo por rota, e o aviso de saldo da devolução.
 *
 * POR QUE ISTO EXISTE
 * `painel()` monta `locais` só com CLIENTE e FILIAL, e devolve as rotas à parte,
 * em `rotas`. Duas telas liam a fonte errada:
 *
 *  - a aba Saldo listava `locais`, então nunca mostrou rota nenhuma;
 *  - `mostrarSaldoDoOrigem` procurava a origem da devolução em `locais`, mas
 *    `dvOrigem` lista ROTAS. Nunca achava. A caixa de saldo e o alerta de
 *    "você contou mais do que o saldo" ficavam mudos — e esse alerta é uma das
 *    guardas do app contra saída não lançada.
 *
 * O teste fixa a fonte certa de cada uma, e a regra de não somar as duas contas
 * da rota: `saldo` é o que está no caminhão, `saldoClientes` é o que está nos
 * pontos dela. Somar esconde onde a caixa está.
 *
 * Não roda navegador: lê as funções do index.html e executa com DOM de mentira.
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
var els = { buscaSaldo: el(), listaSaldos: el(), dvOrigem: el(), dvSaldoAtual: el() };
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

eval(corpo('desenharSaldos') + '\n' + corpo('mostrarSaldoDoOrigem') +
     '\nglobal.desenharSaldos = desenharSaldos; global.mostrarSaldoDoOrigem = mostrarSaldoDoOrigem;');

console.log('\n== Saldo por rota ==');

/* ---- 1. a lista é de rotas, não de clientes ---- */
els.buscaSaldo.value = '';
desenharSaldos();
var h = els.listaSaldos.innerHTML;
ok(h.indexOf('Caruaru') >= 0 && h.indexOf('Petrolina') >= 0, 'as rotas aparecem');
ok(h.indexOf('Mercado Bom Preço') === -1, 'cliente não entra mais nesta lista');
ok(h.indexOf('<th>Rota</th>') >= 0, 'a coluna se chama Rota');

/* ---- 2. as duas contas ficam separadas ---- */
ok(h.indexOf('>120<') >= 0, 'mostra o que está no caminhão');
// O numero vem seguido da etiqueta com quantos clientes a rota atende.
ok(/>300 /.test(h), 'mostra o que está com os clientes');
ok(/class="tag cinza">7</.test(h), 'e quantos clientes a rota atende');
ok(h.indexOf('>420<') === -1, 'NÃO soma as duas: somar esconde onde a caixa está');
ok(h.indexOf('No caminhão') >= 0 && h.indexOf('Com os clientes') >= 0, 'as colunas dizem qual é qual');

/* ---- 3. o motorista aparece junto ---- */
ok(h.indexOf('Ramos') >= 0, 'a rota mostra o motorista dela');

/* ---- 4. busca acha por rota e por motorista ---- */
els.buscaSaldo.value = 'caruaru';
desenharSaldos();
ok(els.listaSaldos.innerHTML.indexOf('Petrolina') === -1, 'busca filtra pelo nome da rota');
els.buscaSaldo.value = 'jorge';
desenharSaldos();
h = els.listaSaldos.innerHTML;
ok(h.indexOf('Petrolina') >= 0 && h.indexOf('Caruaru') === -1, 'busca acha pelo motorista');
els.buscaSaldo.value = 'zzz';
desenharSaldos();
ok(/Nenhuma rota encontrada/.test(els.listaSaldos.innerHTML), 'vazio fala em rota, não em local');
els.buscaSaldo.value = '';

/* ---- 5. o extrato continua alcançável ---- */
desenharSaldos();
ok(els.listaSaldos.innerHTML.indexOf('data-extrato="R1"') >= 0, 'dá para abrir o extrato da rota');

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
