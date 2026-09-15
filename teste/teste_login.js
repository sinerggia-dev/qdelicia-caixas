/**
 * Qdelícia Frutas — Controle de Caixas
 * Aviso de administrador depois de senha errada seguida.
 *
 * POR QUE ISTO EXISTE
 * A tela de entrada do galpão não tinha saída nenhuma: errou a senha, lia
 * "Nome ou senha incorretos." e acabou. Quem erra três vezes não está com o
 * dedo trocado — esqueceu a senha, ou o nome cadastrado não é o que ele digita.
 * Da terceira em diante o aviso passa a dizer o que fazer, e fica fixo no
 * cartão porque o toast some em cinco segundos.
 *
 * O que este teste protege: a contagem (nem antes nem depois da terceira), a
 * volta ao normal depois de entrar, e o zeramento quando outra pessoa usa o
 * mesmo aparelho.
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

/** Recorta do `var NOME` até o fim da função `contarErroLogin`. */
function trechoLogin() {
  var i = html.indexOf('var LOGIN_AVISA_ADMIN');
  if (i < 0) throw new Error('não achei o bloco de contagem de erro no index.html');
  var marca = 'function contarErroLogin';
  var j = html.indexOf(marca, i);
  var d = 0, fim = -1;
  for (var k = html.indexOf('{', j); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (!d) { fim = k + 1; break; } }
  }
  return html.slice(i, fim);
}

/* ---- DOM e Q de mentira ---- */
var caixa = { innerHTML: '' };
var toasts = [];
global.document = { getElementById: function (id) { return id === 'erroLogin' ? caixa : null; } };
global.Q = {
  esc: function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
  toast: function (msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); }
};

// Em 'use strict' o eval nao vaza as funcoes para fora: devolvo as duas.
var LOGIN = eval(trechoLogin() +
  '; ({ zerar: zerarErrosLogin, contar: contarErroLogin })');
var zerarErrosLogin = LOGIN.zerar, contarErroLogin = LOGIN.contar;

var MSG = 'Entre em contato com o administrador do sistema.';
var ERRO_SERVIDOR = 'Nome ou senha incorretos.';

function limpar() { toasts = []; caixa.innerHTML = ''; }
function ultimoToast() { return toasts.length ? toasts[toasts.length - 1].msg : null; }

console.log('\n== Aviso de administrador na terceira senha errada ==');

/* ---- 1. as duas primeiras seguem normais ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, '1ª tentativa: mensagem normal');
ok(caixa.innerHTML === '', '1ª tentativa: nada fixo no cartão');

contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, '2ª tentativa: ainda a mensagem normal');
ok(caixa.innerHTML === '', '2ª tentativa: nada fixo no cartão');

/* ---- 2. a terceira troca o aviso ---- */
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, '3ª tentativa: manda procurar o administrador');
ok(caixa.innerHTML.indexOf(MSG) !== -1, '3ª tentativa: aviso fica fixo no cartão');
ok(caixa.innerHTML.indexOf('aviso-box erro') !== -1, '3ª tentativa: usa a caixa de aviso do app');

/* ---- 3. da quarta em diante continua avisando ---- */
limpar();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, '4ª tentativa: continua no aviso de administrador');
ok(caixa.innerHTML.indexOf(MSG) !== -1, '4ª tentativa: aviso segue fixo');

/* ---- 4. entrar limpa tudo ---- */
zerarErrosLogin();
ok(caixa.innerHTML === '', 'entrar apaga o aviso do cartão');
limpar();
contarErroLogin('Nestor', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, 'depois de entrar, a contagem recomeça');

/* ---- 5. outra pessoa no mesmo aparelho começa do zero ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
limpar();
contarErroLogin('Marcia', ERRO_SERVIDOR);
ok(ultimoToast() === ERRO_SERVIDOR, 'outro nome: volta a contar do começo');
ok(caixa.innerHTML === '', 'outro nome: não herda o aviso do anterior');
contarErroLogin('Marcia', ERRO_SERVIDOR);
contarErroLogin('Marcia', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, 'outro nome: chega ao aviso na terceira dela');

/* ---- 6. o nome não distingue maiúscula de minúscula ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('nestor', ERRO_SERVIDOR);
contarErroLogin('NESTOR', ERRO_SERVIDOR);
ok(ultimoToast() === MSG, 'mesma pessoa em caixas diferentes conta junto');

/* ---- 7. a mensagem do servidor não é injetada como HTML ---- */
limpar(); zerarErrosLogin();
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', ERRO_SERVIDOR);
contarErroLogin('Nestor', '<img src=x onerror=alert(1)>');
ok(caixa.innerHTML.indexOf('<img') === -1, 'cartão não recebe HTML vindo do servidor');

/* ---- 8. não trava o acesso: é só aviso ---- */
ok(trechoLogin().indexOf('disabled') === -1 && trechoLogin().indexOf('localStorage') === -1,
   'a contagem não bloqueia o botão nem grava nada');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> LOGIN OK');
