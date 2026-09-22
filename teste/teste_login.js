/**
 * Qdelícia Frutas — Controle de Caixas
 * Aviso de administrador depois de segredo errado seguido.
 *
 * POR QUE ISTO EXISTE
 * A tela de entrada do galpão não tinha saída nenhuma: errou, lia "Nome ou senha
 * incorretos." e acabou. Quem erra três vezes não está com o dedo trocado —
 * esqueceu, ou o nome cadastrado não é o que ele digita. Da terceira em diante o
 * aviso passa a dizer o que fazer, e fica FIXO no cartão porque o toast some em
 * cinco segundos, e uma frase que some é uma frase que ninguém leu.
 *
 * O que este teste protege: a contagem (nem antes nem depois da terceira), a
 * volta ao normal depois de entrar, o zeramento quando outra pessoa usa o mesmo
 * aparelho, e o cartão receber TEXTO — nunca HTML vindo do servidor.
 *
 * ONDE ISTO MORA
 * Vivia dentro do `index.html`, e o `admin.html` tinha a sua própria cópia. Com a
 * porta única, a entrada é uma só e o código mudou para o `app.js`: é o mesmo
 * motivo de sempre — duas cópias da mesma regra divergem, e a diferença aparece
 * na cara de quem levou a recusa.
 *
 * Não roda navegador: lê as funções do app.js e executa com DOM de mentira.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
var falhas = 0;

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

/** Recorta de `function mostrarErro` até o fim de `contarErro`. */
function trechoLogin() {
  var i = app.indexOf('function mostrarErro(texto)');
  if (i < 0) throw new Error('não achei o mostrarErro da entrada no app.js');
  var j = app.indexOf('function contarErro(', i);
  if (j < 0) throw new Error('não achei o bloco de contagem de erro no app.js');
  var d = 0, fim = -1;
  for (var k = app.indexOf('{', j); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) { fim = k + 1; break; } }
  }
  if (fim < 0) throw new Error('não achei o fim do contarErro no app.js');
  return app.slice(i, fim);
}

/* ---- DOM de mentira ----
   `mostrarErro` é do trecho de verdade, não uma imitação: é ele que decide se o
   cartão aparece e por onde o texto entra. Imitá-lo aqui deixaria de fora
   justamente o que o teste 7 protege. */
var cartao = { hidden: true, innerHTML: '' };
var alvo = { textContent: '', innerHTML: '' };
var toasts = [];

function $(id) {
  if (id === 'erroLogin') return cartao;
  if (id === 'erroLoginTexto') return alvo;
  return null;
}
function toast(msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); }

// Em 'use strict' o eval nao vaza as funcoes para fora: devolvo as duas.
// `zerarErrosLogin` nao existe mais como funcao — a entrada zera a contagem em
// linha, ao entrar; aqui reproduzo essas mesmas tres atribuicoes.
var LOGIN = eval(trechoLogin() +
  '; ({ zerar: function () { erros = 0; erroDe = ""; mostrarErro(""); },' +
  '     contar: contarErro })');
var zerarErrosLogin = LOGIN.zerar, contarErroLogin = LOGIN.contar;

var MSG = 'Entre em contato com o administrador do sistema.';
var ERRO_SERVIDOR = 'Nome ou senha incorretos.';

function limpar() { toasts = []; }
function ultimoToast() { return toasts.length ? toasts[toasts.length - 1].msg : null; }
/** O que a pessoa lê no cartão: nada, se o cartão está escondido. */
function fixo() { return cartao.hidden ? '' : alvo.textContent; }

console.log('\n== Aviso de administrador na terceira tentativa errada ==');

/* ---- 1. as duas primeiras seguem normais ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, '1ª tentativa: mensagem normal');
ok(fixo() === '' && cartao.hidden === true,
   '1ª tentativa: nada fixo no cartão — e o cartão vazio fica escondido, senão ' +
   'sobra uma tarja em branco em cima do formulário', { hidden: cartao.hidden });

contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, '2ª tentativa: ainda a mensagem normal');
ok(fixo() === '', '2ª tentativa: nada fixo no cartão');

/* ---- 2. a terceira troca o aviso ---- */
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, '3ª tentativa: manda procurar o administrador');
ok(fixo() === MSG, '3ª tentativa: aviso fica fixo no cartão', fixo());
ok(cartao.hidden === false,
   '3ª tentativa: e o cartão sai do `hidden` — escrever o texto num cartão ' +
   'escondido é a mesma coisa que não escrever nada', cartao.hidden);

/* ---- 3. da quarta em diante continua avisando ---- */
limpar();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, '4ª tentativa: continua no aviso de administrador');
ok(fixo() === MSG, '4ª tentativa: aviso segue fixo');

/* ---- 4. entrar limpa tudo ---- */
zerarErrosLogin();
ok(fixo() === '' && cartao.hidden === true, 'entrar apaga o aviso do cartão');
limpar();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, 'depois de entrar, a contagem recomeça');

/* ---- 5. outra pessoa no mesmo aparelho começa do zero ----
   Inclusive com o aviso já pendurado: chegar na tela e ler "procure o
   administrador" antes de digitar qualquer coisa é acusar a pessoa errada. */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(fixo() === MSG, 'o aviso do anterior está pendurado');
limpar();
contarErroLogin('Marcia', ERRO_SERVIDOR);
ok(fixo() === '',
   'outro nome: a primeira tentativa dela TIRA o aviso do outro — ler "procure o ' +
   'administrador" sem ter errado nada acusa a pessoa errada', fixo());
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
limpar();
contarErroLogin('Marcia', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, 'outro nome: volta a contar do começo');
ok(fixo() === '', 'outro nome: não herda o aviso do anterior');
contarErroLogin('Marcia', ERRO_SERVIDOR);
contarErroLogin('Marcia', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, 'outro nome: chega ao aviso na terceira dela');

/* ---- 6. o nome não distingue maiúscula de minúscula ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('nestor', ERRO_SERVIDOR);
contarErroLogin('NESTOR', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, 'mesma pessoa em caixas diferentes conta junto');

/* ---- 7. a mensagem do servidor não é injetada como HTML ----
   O cartão recebe `textContent`, nunca `innerHTML`: assim o que vier de fora vira
   texto, e não marcação. O teste vigia as duas pontas — que nada foi escrito como
   HTML, e que o caminho usado é mesmo o de texto. */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', '<img src=x onerror=alert(1)>');
ok(cartao.innerHTML === '' && alvo.innerHTML === '',
   'cartão não recebe HTML vindo do servidor', { cartao: cartao.innerHTML, alvo: alvo.innerHTML });
ok(/textContent = texto/.test(trechoLogin()) && trechoLogin().indexOf('innerHTML') === -1,
   'e o texto entra por `textContent` — por `innerHTML`, a mensagem do servidor ' +
   'viraria marcação dentro da tela de entrada');

/* ---- 8. não trava o acesso: é só aviso ---- */
ok(trechoLogin().indexOf('disabled') === -1 && trechoLogin().indexOf('localStorage') === -1,
   'a contagem não bloqueia o botão nem grava nada');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> LOGIN OK');
