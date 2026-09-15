/**
 * Qdelícia Frutas — Controle de Caixas
 * Lista de motoristas na saída E na devolução: rota em cima, cobertura embaixo.
 *
 * POR QUE ISTO EXISTE
 * A lista era filtrada pela rota: Caruaru oferecia só o Ramos. No dia em que
 * outro motorista levasse aquela carga não havia como registrar, e a saída ia
 * lançada no nome do Ramos assim mesmo — o extrato passava a mentir sobre quem
 * saiu com as caixas.
 *
 * Agora a rota decide a ORDEM, não quem pode aparecer. O que este teste
 * protege: todo motorista continua alcançável, o da rota segue vindo posto, e
 * trocar de rota não deixa para trás o motorista da rota anterior.
 *
 * A devolução usa a MESMA função, com os seletores dela — a rota ali é o
 * caminhão de onde a carga volta. Os casos 8 a 10 provam que as duas telas
 * seguem a regra por construção e não se atrapalham.
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

/* ---- cadastro de mentira: cada motorista na sua rota ---- */
var DADOS = { motoristas: [
  { Nome: 'Ramos',   Rotas: ['R-CARUARU'] },
  { Nome: 'Jorge',   Rotas: ['R-PETROLINA'] },
  { Nome: 'Sebastião', Rotas: ['R-RECIFE'] },
  { Nome: 'Val',     Rotas: [], Tipo: 'VOLANTE' }     // volante roda qualquer rota
]};

/* ---- DOM de mentira: só os dois seletores ---- */
function selFalso() {
  return {
    value: '', innerHTML: '', attrs: {},
    getAttribute: function (n) { return n in this.attrs ? this.attrs[n] : null; },
    setAttribute: function (n, v) { this.attrs[n] = v; }
  };
}
var elMotorista = selFalso(), elRota = selFalso();
var elDvMotorista = selFalso(), elDvOrigem = selFalso();
var POR_ID = { sdMotorista: elMotorista, sdRota: elRota,
               dvMotorista: elDvMotorista, dvOrigem: elDvOrigem };
global.document = { getElementById: function (id) { return POR_ID[id] || null; } };
global.Q = { esc: function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } };
global.DADOS = DADOS;

var F = eval('(function(){' + corpo('motoristas') + corpo('motoristasDaRota') + corpo('montarMotoristas') +
             'return { montar: montarMotoristas, daRota: motoristasDaRota };})()');

/** Lê o HTML gerado: nomes por grupo, na ordem. */
function lido(el) {
  el = el || elMotorista;
  var h = el.innerHTML;
  var grupos = [];
  var re = /<optgroup label="([^"]*)">([\s\S]*?)<\/optgroup>/g, m;
  while ((m = re.exec(h))) {
    grupos.push({ rotulo: m[1], nomes: (m[2].match(/value="([^"]*)"/g) || [])
      .map(function (x) { return x.slice(7, -1); }) });
  }
  var todos = (h.match(/value="([^"]*)"/g) || []).map(function (x) { return x.slice(7, -1); })
    .filter(function (x) { return x !== ''; });
  return { grupos: grupos, todos: todos, escolhido: el.value };
}

function escolherRota(id) { elRota.value = id; F.montar('sdMotorista', 'sdRota'); return lido(); }
function escolherRotaDv(id) {
  elDvOrigem.value = id; F.montar('dvMotorista', 'dvOrigem'); return lido(elDvMotorista);
}

console.log('\n== Motorista: rota em cima, cobertura embaixo ==');

/* ---- 1. a rota decide a ordem, não quem aparece ---- */
var r = escolherRota('R-CARUARU');
ok(r.grupos.length === 2, 'sai em dois grupos', r.grupos.map(function (g) { return g.rotulo; }));
ok(r.grupos[0].rotulo === 'Motorista da rota', '1º grupo é o da rota');
ok(r.grupos[1].rotulo === 'Outros motoristas', '2º grupo é a cobertura');
ok(r.grupos[0].nomes.indexOf('Ramos') === 0, 'Ramos vem primeiro, é a rota dele');
ok(r.grupos[0].nomes.indexOf('Val') >= 0, 'o volante conta como da rota');
ok(r.todos.length === 4, 'todo motorista continua alcançável', r.todos);
ok(r.grupos[1].nomes.indexOf('Jorge') >= 0 && r.grupos[1].nomes.indexOf('Sebastião') >= 0,
   'os de outra rota aparecem em Outros');

/* ---- 2. dá para escolher a cobertura e ela fica ---- */
elMotorista.value = 'Jorge';
F.montar('sdMotorista', 'sdRota');            // redesenho sem trocar de rota
ok(lido().escolhido === 'Jorge', 'cobertura escolhida à mão sobrevive ao redesenho');

/* ---- 3. trocar de rota volta para o motorista da rota nova ---- */
r = escolherRota('R-PETROLINA');
ok(r.escolhido === 'Jorge', 'rota nova traz o motorista dela posto');
elMotorista.value = 'Ramos';                  // cobertura na rota do Jorge
F.montar('sdMotorista', 'sdRota');
ok(lido().escolhido === 'Ramos', 'cobertura vale também aqui');
r = escolherRota('R-RECIFE');
ok(r.escolhido === 'Sebastião', 'a cobertura não atravessa a troca de rota');

/* ---- 4. rota com mais de um não escolhe por ninguém ---- */
DADOS.motoristas.push({ Nome: 'Neto', Rotas: ['R-RECIFE'] });
elRota.value = '';                            // força a rota a "mudar" de novo
F.montar('sdMotorista', 'sdRota');
r = escolherRota('R-RECIFE');
ok(r.escolhido === '', 'dois na mesma rota: pede a escolha');
DADOS.motoristas.pop();

/* ---- 5. sem rota escolhida, lista simples ---- */
r = escolherRota('');
ok(r.grupos.length === 0, 'sem rota não inventa rótulo de grupo');
ok(r.todos.length === 4, 'sem rota mostra todo mundo');

/* ---- 6. rota sem ninguém atribuído não trava a saída ---- */
r = escolherRota('R-FANTASMA');
ok(r.todos.length === 4, 'rota sem cadastro ainda oferece a lista inteira');

/* ---- 7. o nome sai escapado ---- */
DADOS.motoristas.push({ Nome: 'A & <b>B</b>', Rotas: [] });
elRota.value = '';
r = escolherRota('R-CARUARU');
ok(elMotorista.innerHTML.indexOf('<b>B</b>') === -1, 'nome com HTML não é injetado');
DADOS.motoristas.pop();

/* ---- 8. a devolução segue a mesma regra, pela rota de onde a carga vem ---- */
var d = escolherRotaDv('R-PETROLINA');
ok(d.grupos.length === 2, 'devolução também sai em dois grupos');
ok(d.grupos[0].nomes.indexOf('Jorge') >= 0, 'devolução: motorista da rota em cima');
ok(d.todos.length === 4, 'devolução: ninguém fica inalcançável');
ok(d.escolhido === 'Jorge', 'devolução: motorista da rota já vem posto');

/* ---- 9. as duas telas não se atrapalham ---- */
escolherRota('R-CARUARU');
ok(lido(elDvMotorista).escolhido === 'Jorge', 'mexer na saída não mexe na devolução');
ok(lido().escolhido === 'Ramos', 'e a saída fica com o motorista dela');

/* ---- 10. devolução sem rota volta à lista simples ---- */
d = escolherRotaDv('');
ok(d.grupos.length === 0, 'devolução sem rota: lista simples');
ok(d.todos.length === 4, 'devolução sem rota: equipe inteira');

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> MOTORISTA OK');
