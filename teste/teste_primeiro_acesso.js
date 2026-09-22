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
 * Não roda navegador: lê o `app.js`, onde a porta única mora, e as duas páginas.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var raiz = path.join(__dirname, '..');
var campo = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
var painel = fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8');
/* A tela de entrada e UMA so, e mora aqui: as duas paginas a chamam. */
var app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
var falhas = 0;

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

console.log('\n== Primeiro acesso: troca obrigatória ==');

/* A TELA DE ENTRADA VIROU UMA SO, e ela mora no `app.js` (`portaUnica`). Antes este
   bloco lia as duas paginas e cobrava as mesmas coisas em cada uma — o que era o
   jeito certo enquanto eram duas telas, e virou o jeito errado quando passaram a
   ser a mesma. Agora se le o codigo compartilhado, uma vez. */
var porta = app.slice(app.indexOf('function portaUnica(aqui, abrir, aviso)'),
                      app.indexOf('/* ---------------- gaveta de navegacao ----------------'));
ok(porta.length > 2000, 'o recorte pegou a porta única', porta.length);

// O desvio. É esta linha que impede o segredo provisório de valer para sempre.
ok(porta.indexOf('if (r.trocarSenha)') >= 0, 'o login desvia quando o segredo é provisório');
ok(porta.indexOf('abrirTroca(') >= 0, 'e abre a tela de troca');

// O desvio precisa vir ANTES de seguir, senão a pessoa já estaria dentro.
var iDesvio = porta.indexOf('if (r.trocarSenha)');
var iSegue = porta.indexOf('seguir(r.usuario, r.via)');
ok(iDesvio >= 0 && iSegue >= 0 && iDesvio < iSegue, 'o desvio vem antes de entrar');

// AS DUAS ACOES, escolhidas pela CREDENCIAL e nao pela pagina: quem entrou com PIN
// troca um PIN; quem entrou com senha troca uma senha. Fosse pela pagina, a mesma
// pessoa veria regras diferentes conforme o endereco que abriu.
ok(porta.indexOf("acao: 'definirPin'") >= 0, 'quem entrou com PIN chama definirPin');
ok(porta.indexOf("acao: 'definirSenha'") >= 0, 'quem entrou com senha chama definirSenha');
ok(/var ehPin = trocaPendente\.via === 'pin';/.test(porta),
   'e quem escolhe é o `via` do login, não a página — pela página, a mesma pessoa ' +
   'veria regras diferentes conforme o endereço que abriu');
ok(/ehPin && !\/\^\\d\{6\}\$\/\.test\(nova\)/.test(porta),
   'o PIN novo tem de ter seis números');
ok(/!ehPin && nova\.length < 6/.test(porta),
   'e a senha nova, pelo menos seis caracteres');

ok(porta.indexOf('trocaPendente.atual') >= 0, 'prova o segredo atual ao trocar');
ok(porta.indexOf('não são iguais') >= 0, 'confere a repetição');
ok(porta.indexOf('diferente da que o') >= 0, 'exige segredo diferente do provisório');
ok(porta.indexOf("$('cardEntrar').hidden = true") >= 0,
   'esconde o cartão de entrada ao abrir a troca');
// A sessão que entra é a do login, não uma refeita depois da troca.
ok(porta.indexOf('trocaPendente.usuario') >= 0, 'reaproveita a sessão do login');

/* Sem escapatoria: segredo provisorio que se pode adiar nao e trocado nunca, e o do
   escritorio costuma ser o mesmo para todo mundo. */
[['index.html', campo], ['admin.html', painel]].forEach(function (par) {
  var i = par[1].indexOf('id="cardTroca"');
  var trecho = par[1].slice(i, i + 1400);
  ok(i > 0, par[0] + ': tem o cartão de troca');
  ok(!/>\s*(depois|pular|agora n)/i.test(trecho), par[0] + ': não oferece adiar a troca');
  ok(par[1].indexOf('id="inNova"') >= 0 && par[1].indexOf('id="inNova2"') >= 0,
     par[0] + ': pede o segredo novo duas vezes');
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

/* ---- a limpeza das senhas soltas ---- */
/* O banco falso dos testes registra a migração mas não executa o SQL, então o efeito
   desta só aparece no banco de verdade. O que dá para fixar aqui é o alvo: se alguém
   mexer no filtro, o ADMIN pode perder a senha do painel — e aí ninguém entra. */
var limpeza = migr.slice(migr.indexOf('2026-09-15-limpa-senha-sem-acesso'));
limpeza = limpeza.slice(0, limpeza.indexOf('},'));
ok(/update public\.usuarios set senha_hash = null/.test(limpeza), 'a limpeza apaga o hash do painel');
ok(/senha_provisoria = false/.test(limpeza), 'e a marca de provisória junto');
ok(/coalesce\(acesso_painel, false\) = false/.test(limpeza), 'só de quem não entra no painel');
ok(/<> 'ADMIN'/.test(limpeza), 'e nunca do ADMIN, que entra pelo perfil');
ok(/senha_hash is not null/.test(limpeza), 'não toca em quem já está sem senha');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> PRIMEIRO ACESSO OK');
