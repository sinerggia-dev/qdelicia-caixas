/**
 * Qdelícia Frutas — Controle de Caixas
 * Campos obrigatórios das telas de lançamento.
 *
 * POR QUE ISTO EXISTE
 * A cobrança era uma fila de `if` dentro de cada botão, e o aviso um toast no
 * rodapé que não dizia QUAL campo faltava. Agora a regra é uma lista, e a mesma
 * lista marca o campo com * e cobra no envio — não podem divergir.
 *
 * O que este teste protege, por ordem de importância:
 *  1. campo escondido NÃO é exigido. Na saída do galpão aparecem Rota e
 *     Motorista; da rota para o cliente aparece Destino. Cobrar o que não está
 *     na tela travaria o lançamento sem explicação possível.
 *  2. basta um tipo de caixa preenchido.
 *  3. observação e foto nunca entram na conta.
 *  4. todo campo da lista tem `*` no HTML, e todo `*` está na lista.
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

function recorte(de, ate) {
  var i = html.indexOf(de), f = html.indexOf(ate, i);
  if (i < 0 || f < 0) throw new Error('não achei o trecho ' + de);
  return html.slice(i, f);
}

/* ---- DOM de mentira ---- */
var campos = {};
function campo(id, valor, escondido) {
  var el = {
    id: id, value: valor || '', style: {}, classes: {}, parentNode: null,
    eventos: {}, focado: false, rolou: false,
    classList: {
      add: function (c) { el.classes[c] = true; },
      remove: function (c) { delete el.classes[c]; }
    },
    addEventListener: function (ev, fn) { el.eventos[ev] = fn; },
    removeEventListener: function (ev) { delete el.eventos[ev]; },
    focus: function () { el.focado = true; },
    scrollIntoView: function () { el.rolou = true; }
  };
  if (escondido) el.parentNode = { style: { display: 'none' }, parentNode: null };
  campos[id] = el;
  return el;
}

var toasts = [];
global.Q = { toast: function (m, t) { toasts.push({ msg: m, tipo: t }); } };
global.document = {
  getElementById: function (id) { return campos[id] || null; },
  querySelectorAll: function () {
    return Object.keys(campos).map(function (k) { return campos[k]; })
      .filter(function (el) { return el.classes['campo-erro']; });
  }
};
var MOTORISTAS = ['Ramos'];
global.motoristas = function () { return MOTORISTAS; };

var F = eval('(function(){' +
  recorte('  var OBRIGATORIOS = {', '  /* ---------------- gravar saída ---------------- */') +
  'return { podeEnviar: podeEnviar, OBRIGATORIOS: OBRIGATORIOS, limparErros: limparErros };})()');

function marcado(id) { return !!(campos[id] && campos[id].classes['campo-erro']); }
function ultimoToast() { return toasts.length ? toasts[toasts.length - 1].msg : null; }

/** Monta a tela de saída. `doGalpao` decide quais campos existem. */
function telaSaida(vals, doGalpao) {
  campos = {}; toasts = [];
  campo('sdData', vals.data);
  campo('sdOrigem', vals.origem);
  campo('sdRota', vals.rota, !doGalpao);
  campo('sdDestino', vals.destino, doGalpao);
  campo('sdMotorista', vals.motorista, !doGalpao);
  campo('sdItens', '');
  campo('sdObs', '');            // nunca exigido
}
function telaDevolucao(vals) {
  campos = {}; toasts = [];
  campo('dvData', vals.data);
  campo('dvOrigem', vals.origem);
  campo('dvDestino', vals.destino);
  campo('dvMotorista', vals.motorista);
  campo('dvItens', '');
  campo('dvObs', '');
}
var UM_ITEM = [{ tipo: 'CX P', qtd: 10 }];

console.log('\n== Campos obrigatórios ==');

/* ---- 1. saída do galpão: tudo preenchido passa ---- */
telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === true, 'saída do galpão completa é aceita');

/* ---- 2. o campo escondido não é exigido ---- */
// Destino está escondido (saída do galpão) e vazio: não pode barrar.
ok(!marcado('sdDestino'), 'Destino escondido não é cobrado na saída do galpão');
// Agora o contrário: da rota para o cliente, Rota e Motorista somem.
telaSaida({ data: '2026-09-15', origem: 'R1', destino: 'C1' }, false);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === true, 'saída da rota para o cliente é aceita');
ok(!marcado('sdRota') && !marcado('sdMotorista'), 'Rota e Motorista escondidos não são cobrados');

/* ---- 3. cada campo visível que falta é apontado ---- */
telaSaida({ data: '', origem: 'G1', rota: 'R1', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false, 'sem data não envia');
ok(marcado('sdData'), 'a data é marcada');
ok(campos.sdData.focado && campos.sdData.rolou, 'a tela leva a pessoa até o campo');
ok(/data/i.test(ultimoToast()), 'o aviso diz qual campo é', ultimoToast());

telaSaida({ data: '2026-09-15', origem: '', rota: 'R1', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false && marcado('sdOrigem'), 'sem origem não envia');

telaSaida({ data: '2026-09-15', origem: 'G1', rota: '', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false && marcado('sdRota'), 'sem rota não envia');

telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: '' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false && marcado('sdMotorista'), 'sem motorista não envia');

/* ---- 4. sem motorista cadastrado, a mensagem diz onde resolver ---- */
MOTORISTAS = [];
telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: '' }, true);
F.podeEnviar('sd', 'sdItens', UM_ITEM);
ok(/Cadastros/.test(ultimoToast()), 'lista vazia de motorista manda ao escritório', ultimoToast());
MOTORISTAS = ['Ramos'];

/* ---- 5. quantidades: um tipo basta ---- */
telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', []) === false, 'nenhuma caixa não envia');
ok(marcado('sdItens'), 'a lista de caixas é contornada');
ok(/pelo menos um tipo/i.test(ultimoToast()), 'o aviso explica que um tipo basta', ultimoToast());
telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos' }, true);
ok(F.podeEnviar('sd', 'sdItens', [{ tipo: 'CX GG', qtd: 1 }]) === true, 'um tipo só já vale');

/* ---- 6. observação vazia nunca barra ---- */
telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos' }, true);
campos.sdObs.value = '';
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === true && !marcado('sdObs'), 'observação vazia não barra');

/* ---- 7. a marca sai quando a pessoa preenche ---- */
telaSaida({ data: '2026-09-15', origem: '', rota: 'R1', motorista: 'Ramos' }, true);
F.podeEnviar('sd', 'sdItens', UM_ITEM);
ok(marcado('sdOrigem'), 'marcado antes de preencher');
campos.sdOrigem.eventos.change();
ok(!marcado('sdOrigem'), 'a marca sai ao preencher');

/* ---- 8. devolução: mesma regra, motorista incluído ---- */
telaDevolucao({ data: '2026-09-15', origem: 'R1', destino: 'G1', motorista: 'Ramos' });
ok(F.podeEnviar('dv', 'dvItens', UM_ITEM) === true, 'devolução completa é aceita');
telaDevolucao({ data: '2026-09-15', origem: 'R1', destino: 'G1', motorista: '' });
ok(F.podeEnviar('dv', 'dvItens', UM_ITEM) === false && marcado('dvMotorista'),
   'devolução sem motorista não envia');
telaDevolucao({ data: '2026-09-15', origem: '', destino: 'G1', motorista: 'Ramos' });
ok(F.podeEnviar('dv', 'dvItens', UM_ITEM) === false && marcado('dvOrigem'),
   'devolução sem origem não envia');

/* ---- 9. só o primeiro que falta é apontado, para não cobrir a tela de vermelho ---- */
telaSaida({ data: '', origem: '', rota: '', motorista: '' }, true);
F.podeEnviar('sd', 'sdItens', []);
var marcas = Object.keys(campos).filter(marcado);
ok(marcas.length === 1 && marcas[0] === 'sdData', 'aponta um campo por vez, o primeiro', marcas);

/* ---- 10. HTML e lista dizem a mesma coisa ---- */
var naLista = [].concat(
  (html.match(/id:'(sd|dv)[A-Za-z]+'/g) || []).map(function (x) { return x.slice(4, -1); })
);
var comEstrela = (html.match(/<label for="([a-zA-Z]+)">[^<]*<span class="obrig">/g) || [])
  .map(function (x) { return x.match(/for="([a-zA-Z]+)"/)[1]; });
var faltaEstrela = naLista.filter(function (id) { return comEstrela.indexOf(id) < 0; });
var estrelaSobrando = comEstrela.filter(function (id) { return naLista.indexOf(id) < 0; });
ok(faltaEstrela.length === 0, 'todo campo obrigatório tem * na tela', faltaEstrela);
ok(estrelaSobrando.length === 0, 'todo * na tela está na lista', estrelaSobrando);
ok(/Quantas caixas<span class="obrig">/.test(html), 'as quantidades também são marcadas');
ok(!/for="(sdObs|dvObs)">[^<]*<span class="obrig">/.test(html), 'observação não recebeu *');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> OBRIGATÓRIOS OK');
