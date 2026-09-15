/**
 * Qdelícia Frutas — Controle de Caixas
 * Primeiro acesso: a senha que o admin passou vira uma senha da pessoa.
 *
 * COMO FUNCIONA
 * O admin cadastra com uma senha provisória. O banco guarda duas marcas
 * independentes — `pin_provisorio` (app de campo) e `senha_provisoria`
 * (painel) —, porque cada pessoa pode ter as duas credenciais e o admin pode
 * mexer só numa. O login devolve `trocarSenha`, e a tela troca o cartão de
 * entrada pelo de troca antes de deixar entrar.
 *
 * POR QUE ESTE TESTE EXISTE
 * O fluxo visual precisa de navegador e não roda aqui. O que dá para proteger
 * é o desvio: se alguém tirar o `if (r.trocarSenha)` do login, a senha
 * provisória passa a valer para sempre e ninguém percebe — o app continua
 * funcionando, só que a troca nunca é pedida. O comportamento do servidor está
 * em teste_api.js, no bloco "primeiro acesso".
 *
 * Não roda navegador: lê o HTML das duas telas.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var raiz = path.join(__dirname, '..');
var campo = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
var painel = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
var falhas = 0;

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

console.log('\n== Primeiro acesso: troca obrigatória ==');

[
  { onde: 'campo ', fonte: campo, acao: 'definirPin', atual: 'pinAtual' },
  { onde: 'painel', fonte: painel, acao: 'definirSenha', atual: 'senhaAtual' }
].forEach(function (t) {
  var f = t.fonte, onde = t.onde + ': ';

  // O desvio. É esta linha que impede a senha provisória de valer para sempre.
  ok(f.indexOf('if (r.trocarSenha)') >= 0, onde + 'o login desvia quando a senha é provisória');
  ok(f.indexOf('abrirTrocaSenha(') >= 0, onde + 'e abre a tela de troca');

  // O desvio precisa vir ANTES de entrar, senão a pessoa já estaria dentro.
  var iDesvio = f.indexOf('if (r.trocarSenha)');
  var iEntrar = f.indexOf('Q.entrar(r.usuario)');
  ok(iDesvio >= 0 && iEntrar >= 0 && iDesvio < iEntrar, onde + 'o desvio vem antes de entrar');

  ok(f.indexOf('id="cardTroca"') >= 0, onde + 'tem o cartão de troca');
  ok(f.indexOf('id="inNova"') >= 0 && f.indexOf('id="inNova2"') >= 0,
     onde + 'pede a senha nova duas vezes');
  ok(f.indexOf("acao:'" + t.acao + "'") >= 0, onde + 'chama ' + t.acao);
  ok(f.indexOf(t.atual + ': trocaPendente.') >= 0, onde + 'prova a senha atual ao trocar');
  ok(f.indexOf('não são iguais') >= 0, onde + 'confere a repetição');
  ok(f.indexOf('diferente da que o') >= 0, onde + 'exige senha diferente da provisória');
  ok(f.indexOf("querySelector('#telaLogin .card').hidden = true") >= 0,
     onde + 'esconde o cartão de entrada ao abrir a troca');

  // Sem escapatória: senha provisória que se pode adiar não é trocada nunca,
  // e a do admin costuma ser a mesma para todo mundo.
  var i = f.indexOf('id="cardTroca"');
  var trecho = f.slice(i, i + 1400);
  ok(!/>\s*(depois|pular|agora n)/i.test(trecho), onde + 'não oferece adiar a troca');

  // A sessão que entra é a do login, não uma refeita depois da troca.
  ok(f.indexOf('trocaPendente.usuario') >= 0, onde + 'reaproveita a sessão do login');
});

/* ---- a marca nunca pode vir do navegador ---- */
var api = fs.readFileSync(path.join(raiz, 'api', 'index.js'), 'utf8');
ok(api.indexOf('delete dados.PinProvisorio') >= 0 && api.indexOf('delete dados.SenhaProvisoria') >= 0,
   'servidor: apaga as marcas que chegarem do navegador');
ok(api.indexOf('dados.PinProvisorio = true') >= 0 && api.indexOf('dados.SenhaProvisoria = true') >= 0,
   'servidor: levanta a marca quando o admin define a senha');
ok(api.indexOf('pin_provisorio: false') >= 0 && api.indexOf('senha_provisoria: false') >= 0,
   'servidor: derruba a marca quando a pessoa troca');

/* ---- a migração que cria as colunas ---- */
var migr = fs.readFileSync(path.join(raiz, 'api', '_migracoes.js'), 'utf8');
ok(/pin_provisorio boolean not null default false/.test(migr) &&
   /senha_provisoria boolean not null default false/.test(migr),
   'migração cria as duas colunas, com padrão falso');
ok(/add column if not exists pin_provisorio/.test(migr), 'migração é repetível');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> PRIMEIRO ACESSO OK');
