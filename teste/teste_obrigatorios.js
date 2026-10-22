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
    eventos: {}, focado: false, rolou: false, atrib: {},
    /* ATRIBUTOS DE VERDADE no elemento de mentira. Todo elemento do navegador tem
       `getAttribute`, e sem ele aqui a prova rebenta no primeiro campo que se declare
       opcional — que e' o caminho novo do veiculo sem carro vinculado. */
    getAttribute: function (a) { return el.atrib[a] === undefined ? null : el.atrib[a]; },
    setAttribute: function (a, v) { el.atrib[a] = String(v); },
    removeAttribute: function (a) { delete el.atrib[a]; },
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
/* AS REGRAS DE PLACA SAEM DO `app.js`, recortadas. Reescritas aqui, elas seriam um
   duble mais fraco que o original: no dia em que o formato mudasse num dos dois, esta
   prova continuaria verde medindo a regra que ninguem usa. */
var Q_REAL = (function () {
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  function corpoQ(nome) {
    var i = app.indexOf('function ' + nome + '(');
    if (i < 0) return '';
    var d = 0, k = app.indexOf('{', i);
    for (; k < app.length; k++) {
      if (app[k] === '{') d++;
      else if (app[k] === '}' && --d === 0) return app.slice(i, k + 1);
    }
    return '';
  }
  /* O FORMATO VEM JUNTO: ele e' uma `var` ao lado das duas funcoes, e sem ele o
     recorte estoura. E' o mesmo principio — a regra de verdade, e nao uma copia. */
  var iRE = app.indexOf('  var PLACA_RE = ');
  var fonteQ = app.slice(iRE, app.indexOf(';', iRE) + 1) + String.fromCharCode(10) +
    corpoQ('placaLimpa') + String.fromCharCode(10) + corpoQ('placaValida');
  if (!/placaLimpa/.test(fonteQ) || !/placaValida/.test(fonteQ)) {
    throw new Error('nao achei as regras de placa no app.js');
  }
  return new Function(fonteQ +
    ' return { placaLimpa: placaLimpa, placaValida: placaValida };')();
})();
global.Q = { toast: function (m, t) { toasts.push({ msg: m, tipo: t }); },
             placaLimpa: Q_REAL.placaLimpa, placaValida: Q_REAL.placaValida };
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
/* O VEICULO FALTAVA NESTA TELA, e por isso nunca foi exercitado: `podeEnviar` pula o
   campo que nao existe, e a regra dele passava por aqui sem ser medida uma vez.
   JA PREENCHIDO POR OMISSAO, como os outros: esta funcao monta a tela COMPLETA, e cada
   prova esvazia UM campo para ver o que acontece. */
function telaSaida(vals, doGalpao) {
  campos = {}; toasts = [];
  campo('sdData', vals.data);
  campo('sdOrigem', vals.origem);
  campo('sdRota', vals.rota, !doGalpao);
  campo('sdDestino', vals.destino, doGalpao);
  campo('sdMotorista', vals.motorista, !doGalpao);
  campo('sdVeiculo', vals.veiculo === undefined ? 'ABC1D23' : vals.veiculo);
  campo('sdItens', '');
  campo('sdObs', '');            // nunca exigido
}
function telaDevolucao(vals) {
  campos = {}; toasts = [];
  campo('dvData', vals.data);
  campo('dvOrigem', vals.origem);
  campo('dvDestino', vals.destino);
  campo('dvMotorista', vals.motorista);
  campo('dvVeiculo', vals.veiculo === undefined ? 'ABC1D23' : vals.veiculo);
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
/* AS TRES TELAS DE LANCAMENTO: Saida, Entrada e Retorno. A varredura le os prefixos
   dos ids, e uma tela nova fora deles passaria inteira por fora desta conferencia —
   com estrelas na tela e nenhuma guarda atras delas. */
var naLista = [].concat(
  (html.match(/id:'(sd|en|dv)[A-Za-z]+'/g) || []).map(function (x) { return x.slice(4, -1); })
);
/* O ROTULO INTEIRO, e nao "texto puro seguido da estrela": o rotulo do motorista ganhou
   um <span> dentro, porque a palavra dele troca para "Fornecedor" quando a ponta pede
   fornecedor. O padrao antigo exigia que nada viesse antes da estrela, e reprovou uma
   mudanca que nao tem nada a ver com o que ele mede — a estrela continuava la'.
   O QUE IMPORTA E' A PERGUNTA: o rotulo deste campo tem a marca de obrigatorio? */
var comEstrela = (html.match(/<label for="([a-zA-Z]+)"[^>]*>[\s\S]*?<\/label>/g) || [])
  .filter(function (x) { return x.indexOf('class="obrig"') > 0; })
  .map(function (x) { return x.match(/for="([a-zA-Z]+)"/)[1]; });
var faltaEstrela = naLista.filter(function (id) { return comEstrela.indexOf(id) < 0; });
/* `crMotivo` é obrigatório por OUTRA guarda: ele não é campo de lançamento, é o motivo
   da correção, e quem o exige é o botão de gravar mais a regra do servidor. Entra aqui
   nomeado, e não por um filtro esperto — e as duas guardas dele são conferidas logo
   abaixo. Sem isso, a estrela seria uma promessa que ninguém cumpre. */
var FORA_DO_ENVIO = ['crMotivo', 'crSenha'];
var estrelaSobrando = comEstrela.filter(function (id) {
  return naLista.indexOf(id) < 0 && FORA_DO_ENVIO.indexOf(id) < 0;
});
ok(faltaEstrela.length === 0, 'todo campo obrigatório tem * na tela', faltaEstrela);
ok(estrelaSobrando.length === 0, 'todo * na tela está na lista', estrelaSobrando);

/* ---- 11. o motivo da correção é exigido dos DOIS lados ---- */
ok(/crMotivo'\)\.value\.trim\(\);\s*\n\s*if \(!motivo\) return Q\.toast/.test(html),
   'a tela recusa a correção sem motivo, com o texto ainda digitado');
var logica = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
ok(/if \(!motivo\) return \{ ok: false, erro: 'Descreva o motivo da correção\.' \}/.test(logica),
   'e o servidor recusa de novo — a API aceita pedido de qualquer lugar, e a tela ' +
   'sozinha seria enfeite');

/* ---- 12. a senha do conserto fora de prazo, dos dois lados ---- */
ok(/if \(!livre && !senha\) return Q\.toast\('Informe a senha do escritório\.'/.test(html),
   'a tela recusa o conserto trancado sem senha, com o que foi digitado ainda na tela');
ok(/if \(!correcaoLivre\(mov, p\.usuarioId, agora\) && guarda\.senhaOk !== true\)/.test(logica),
   'e o servidor confere de novo — esconder o campo é conveniência, e um POST direto ' +
   'passa por cima dela');
ok(/guarda\.senhaOk !== true/.test(logica),
   'a guarda é pelo SIM explícito: um caminho novo que esqueça de passá-la cai no lado ' +
   'que pede senha, e não no que abre');
ok(/Quantas caixas<span class="obrig">/.test(html), 'as quantidades também são marcadas');
ok(!/for="(sdObs|dvObs)">[^<]*<span class="obrig">/.test(html), 'observação não recebeu *');

/* ============ O VEICULO SO' E' COBRADO QUANDO HA' CARRO VINCULADO ============
 *
 * O escritorio mandou o caso: os vinte e oito fornecedores nao tem placa no cadastro, e
 * o campo era obrigatorio mesmo assim. A lista deles abre com uma opcao so' — "digitar"
 * —, e a pessoa ficava presa pedindo uma placa que ela nao tem como saber. Campo
 * obrigatorio que ninguem consegue preencher nao e' validacao, e' um beco: ou o
 * lancamento nao acontece, ou acontece com uma placa inventada, que e' pior.
 *
 * QUEM POE A MARCA E QUEM MONTA A LISTA — `marcarOpcional`, no `montarVeiculos`. Ela e'
 * a unica que sabe se ha' carro vinculado. Aqui se mede a OUTRA metade: que o botao de
 * salvar respeita a marca. */
console.log('\n== o ve\u00edculo sem carro vinculado ==');

telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos',
            veiculo: '' }, true);
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false && marcado('sdVeiculo'),
  'com carro vinculado, o ve\u00edculo em branco barra o lan\u00e7amento \u2014 sem este controle, ' +
  'a prova abaixo passaria com uma regra que nunca cobra o ve\u00edculo de ningu\u00e9m');

telaSaida({ data: '2026-09-15', origem: 'G1', rota: 'R1', motorista: 'Ramos',
            veiculo: '' }, true);
campos.sdVeiculo.setAttribute('data-opcional', '1');
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === true && !marcado('sdVeiculo'),
  'e o campo que se declarou OPCIONAL passa em branco \u2014 \u00e9 o fornecedor sem placa no ' +
  'cadastro, e cobr\u00e1-la dele trancaria o lan\u00e7amento numa pergunta sem resposta');

telaDevolucao({ data: '2026-09-15', origem: 'R1', destino: 'G1', motorista: 'Ramos',
                veiculo: '' });
campos.dvVeiculo.setAttribute('data-opcional', '1');
ok(F.podeEnviar('dv', 'dvItens', UM_ITEM) === true,
  'e vale igual no RETORNO \u2014 escrita s\u00f3 na sa\u00edda, a regra pararia na metade da ' +
  'opera\u00e7\u00e3o, e seria a metade que o fornecedor mais usa');

/* E A MARCA NAO ABRE AS OUTRAS PORTAS: campo opcional e' um campo, e nao a validacao
   inteira. */
telaSaida({ data: '', origem: 'G1', rota: 'R1', motorista: 'Ramos', veiculo: '' }, true);
campos.sdVeiculo.setAttribute('data-opcional', '1');
ok(F.podeEnviar('sd', 'sdItens', UM_ITEM) === false && marcado('sdData'),
  'e a marca vale s\u00f3 para o campo que a tem: a data continua sendo cobrada \u2014 um ' +
  '`continue` no lugar errado soltaria a valida\u00e7\u00e3o inteira');

/* ---- A OUTRA METADE: A PLACA DIGITADA, RODADA ----
 *
 * Sem isto o campo opcional abriria um beco novo pela outra porta: a pessoa escolhe
 * "digitar" e nao digita nada, o seletor nao reclama — e o texto reclama.
 *
 * ESTA PROVA ERA DE TEXTO, e uma sabotagem passou por ela: ela cobrava que
 * `placaValida` viesse DEPOIS de `data-opcional` no arquivo, e um `return true` posto
 * entre as duas nao mexe nessa ordem. Agora ela RODA a funcao. */
var placaOk = (function () {
  var iP = html.indexOf('  function placaOk(');
  var corpoP = html.slice(iP, html.indexOf('\n  }', iP) + 4);
  var iC = html.indexOf('  function campoTextoDaPlaca(');
  var corpoC = html.slice(iC, html.indexOf('\n  }', iC) + 4);
  var iO = html.indexOf('var OUTRA_PLACA = ');
  return new Function('document', 'Q',
    html.slice(iO, html.indexOf(';', iO) + 1) + String.fromCharCode(10) +
    corpoC + corpoP + ' return placaOk;')(
    { getElementById: function (id) { return campos[id] || null; } },
    { toast: function (m, tp) { toasts.push({ msg: m, tipo: tp }); },
      /* AS REGRAS DE VERDADE, recortadas do `app.js`: reescritas aqui, elas seriam um
         duble mais fraco que o original, e o dia em que a regra mudasse num dos dois a
         prova continuaria verde medindo a outra. */
      placaLimpa: Q_REAL.placaLimpa, placaValida: Q_REAL.placaValida });
})();

function telaPlaca(valorSel, texto, opcional) {
  campos = {}; toasts = [];
  var sel = campo('sdVeiculo', valorSel);
  campo('sdVeiculoTexto', texto);
  if (opcional) sel.setAttribute('data-opcional', '1');
  return sel;
}

telaPlaca('ABC1D23', '', false);
ok(placaOk('sdVeiculo') === true,
  'placa escolhida na lista passa sem olhar o campo de texto \u2014 ele nem est\u00e1 na tela');

telaPlaca('__outra', '', false);
ok(placaOk('sdVeiculo') === false && /Digite a placa/i.test(ultimoToast()),
  'e quem escolheu DIGITAR e n\u00e3o digitou nada \u00e9 barrado \u2014 sem este controle, as duas ' +
  'provas abaixo passariam com uma fun\u00e7\u00e3o que aceita tudo', ultimoToast());

telaPlaca('__outra', '', true);
ok(placaOk('sdVeiculo') === true,
  'mas no campo OPCIONAL o texto em branco passa \u2014 \u00e9 o fornecedor sem placa, e cobr\u00e1-la ' +
  'aqui devolveria pela outra porta o beco que o campo opcional acabou de abrir');

telaPlaca('__outra', 'ABC', true);
ok(placaOk('sdVeiculo') === false && /inv\u00e1lida/i.test(ultimoToast()),
  'e a placa ERRADA continua recusada mesmo no campo opcional \u2014 opcional \u00e9 campo que ' +
  'pode ficar VAZIO, e n\u00e3o campo sem regra', ultimoToast());

telaPlaca('__outra', 'abc1d23', true);
ok(placaOk('sdVeiculo') === true,
  'e a placa certa digitada em caixa baixa passa \u2014 a regra \u00e9 a mesma do cadastro, e ela ' +
  'nunca dependeu de como algu\u00e9m digitou');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> OBRIGATÓRIOS OK');
