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

/* ---- 6. A CAIXA AZUL SAIU, e o silêncio é a garantia ----
 *
 * Estas três asserções cobravam o nome da rota, o saldo do caminhão e a idade da mais
 * antiga dentro de uma caixa que o escritório mandou tirar: ela ficava acesa o tempo
 * todo, entre o formulário e a contagem, dizendo um número que quem está no pátio não
 * usa para lançar. Tirada a caixa, elas ficaram vermelhas cobrando o que já não devia
 * existir — e uma suíte que pede de volta o que foi removido para de ser lida.
 *
 * O SILÊNCIO É MEDIDO DE VERDADE, com `=== ''`. "Não tem a palavra `contou`" deixaria a
 * caixa voltar inteira sem ninguém reclamar. */
els.dvOrigem.value = 'R1';
CONTAGEM = [{ tipo: 'CX P', qtd: 10 }];
mostrarSaldoDoOrigem();
ok(els.dvSaldoAtual.innerHTML === '',
  'origem escolhida e contagem dentro do saldo não escrevem NADA — a caixa de "Saldo ' +
  'atual de…" saiu a pedido do escritório', els.dvSaldoAtual.innerHTML);

/* ---- 7. O ALERTA, que é o que ficou ----
 *
 * Ele não é a caixa com outro nome: só aparece quando a contagem passa do saldo, e aí o
 * número deixa de ser informação e vira pergunta — "voltou mais do que saiu?". É uma das
 * guardas contra saída não lançada.
 *
 * E É AQUI QUE A BUSCA NAS ROTAS CONTINUA SENDO COBRADA: `dvOrigem` lista rotas, e o
 * painel devolve rota FORA de `locais`. Procurando só em `locais`, o alerta nunca
 * dispararia — foi o defeito que fez este arquivo nascer, e sem a caixa ele só aparece
 * por aqui. */
CONTAGEM = [{ tipo: 'CX P', qtd: 500 }];
mostrarSaldoDoOrigem();
var aviso = els.dvSaldoAtual.innerHTML;
ok(/contou/.test(aviso),
  'contar mais do que o saldo avisa — e avisa numa ROTA, que o painel devolve fora de ' +
  '`locais`: procurando só ali, esta guarda ficaria muda', aviso);
/* OS DOIS NÚMEROS NA FRASE. Sem eles o alerta diz que algo está errado e não diz o quê,
   e quem está no pátio não tem como decidir se conta de novo ou chama o escritório. */
ok(aviso.indexOf('500') >= 0 && aviso.indexOf('120') >= 0,
  'e a frase traz o que a pessoa contou E o saldo do caminhão — sem os dois ela diz ' +
  'que algo está errado sem dizer o quê', aviso);
CONTAGEM = [{ tipo: 'CX P', qtd: 10 }];
mostrarSaldoDoOrigem();
ok(!/contou/.test(els.dvSaldoAtual.innerHTML), 'contagem dentro do saldo não avisa à toa');

/* ---- 8. cliente como origem ainda funciona ---- */
els.dvOrigem.value = 'C1';
CONTAGEM = [{ tipo: 'CX P', qtd: 100 }];
mostrarSaldoDoOrigem();
ok(/contou/.test(els.dvSaldoAtual.innerHTML) &&
   els.dvSaldoAtual.innerHTML.indexOf('40') >= 0,
  'e o alerta vale também para um CLIENTE como origem, que mora na outra lista',
  els.dvSaldoAtual.innerHTML);
CONTAGEM = [{ tipo: 'CX P', qtd: 10 }];

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
