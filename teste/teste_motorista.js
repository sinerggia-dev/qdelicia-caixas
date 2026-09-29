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
/* O `app.js` entra porque a regra de COMO SE CHAMA mora la, e e compartilhada com o
   painel. Escrita de novo aqui, ela seria um duble MAIS FRACO que o original — e a
   prova mediria o duble. */
var appjs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
var falhas = 0;

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

function corpoEm(txt, nome) {
  var i = txt.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  var d = 0, fim = -1;
  for (var k = txt.indexOf('{', i); k < txt.length; k++) {
    if (txt[k] === '{') d++;
    else if (txt[k] === '}') { d--; if (!d) { fim = k + 1; break; } }
  }
  return txt.slice(i, fim);
}
function corpo(nome) { return corpoEm(html, nome); }

/* ---- cadastro de mentira: cada motorista na sua rota ---- */
var DADOS = { motoristas: [
  { ID: 'D1', Nome: 'Ramos',   Rotas: ['R-CARUARU'] },
  { ID: 'D2', Nome: 'Jorge',   Rotas: ['R-PETROLINA'] },
  { ID: 'D3', Nome: 'Sebastião', Rotas: ['R-RECIFE'] },
  /* A VAL TEM ROTA PRÓPRIA, e é de propósito. Com `Rotas: []` ela entrava na
     primeira lista por NÃO TER rota, não por ser volante — os dois caminhos levam
     ao mesmo lugar no código, e a asserção não distinguia um do outro. Medido:
     apagar a cláusula do VOLANTE passava, porque a cláusula do sem-rota respondia
     por ela. R-GARANHUNS não é escolhida por nenhum caso, então aqui a Val só
     pode aparecer pelo que este teste diz que ela é. */
  { ID: 'D4', Nome: 'Val',     Rotas: ['R-GARANHUNS'], Tipo: 'VOLANTE' },
  /* O DO APELIDO. Rota so' dele e SEM ser volante: assim ele nao entra em nenhum grupo
     dos casos 1 a 9 — nem como atribuido, nem como cobertura — e nao mexe em nenhuma
     contagem ja escrita. Ele so' aparece no caso SEM ROTA, que e onde a lista e a equipe
     inteira, e e la que se ve por qual nome ele e oferecido. */
  { ID: 'D5', Nome: 'Isaque Sobrenome', Apelido: 'Isaque', Rotas: ['R-SERTAO'] }
]};

/* A PENEIRA DE PERMISSÃO entrou entre este teste e a tela: hoje `motoristas()`
   passa por `meusMotoristas()`, que passa por `permitidos()`, que pergunta à
   sessão quais IDs esta pessoa pode escolher. Ela não existia quando o teste
   foi escrito, e foi por isso que ele parou de rodar — `meusMotoristas is not
   defined`, no carregamento, antes da primeira asserção.

   Aqui a sessão libera TODOS: o que este arquivo mede é a ORDEM da lista, e
   quem mede a peneira é o `teste_permissoes.js`. Dois testes cobrando a mesma
   regra discordam no primeiro dia em que ela muda. */

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
global.Q = {
  /* O MESMO `esc` do app.js, e nao uma versao curta dele. A daqui escapava so `&`
     e `<`, e a aspa passava — o dublê era mais FRACO que o original, entao o teste
     nao podia enxergar a injecao pelo atributo nem se ela existisse. */
  esc: function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  /* LIBERA TODOS, e LE O CADASTRO NA HORA. Uma lista de IDs escrita a mao aqui
     faria o motorista que um caso empurra no meio do teste — o Neto, do caso 4 —
     ser peneirado fora sem dizer nada, e a assercao mediria a peneira achando que
     media a ordem. Foi exatamente o que aconteceu na primeira tentativa. */
  sessao: function () {
    return { motoristas: DADOS.motoristas.map(function (m) {
      if (!m.ID) throw new Error('motorista de mentira sem ID: ' + m.Nome);
      return m.ID;
    }) };
  },
  /* A REGRA VERDADEIRA, lida do `app.js` e nao reescrita: e ela que decide se a lista
     mostra 'Isaque' ou 'Isaque Sobrenome'. Copiada a mao, o dia em que alguem mudasse a
     regra no app este teste continuaria aprovando a regra antiga. */
  comoChamar: eval('(function(){' + corpoEm(appjs, 'comoChamar') + 'return comoChamar;})()')
};
global.DADOS = DADOS;

var F = eval('(function(){' + corpo('permitidos') + corpo('meusMotoristas') +
             corpo('motoristas') + corpo('motoristasDaRota') + corpo('montarMotoristas') +
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

/* TODOS SAO QUANTOS O CADASTRO TEM, e nao um numero escrito aqui. Escrito, ele dizia
   'quatro' — e a prova se chama "todo motorista continua alcancavel": acrescentar um
   motorista ao cadastro de mentira fazia quatro provas cairem sem que nada tivesse
   quebrado, e a tentacao e trocar o numero sem olhar o que ele quer dizer. */
var TODOS = DADOS.motoristas.length;
if (TODOS < 4) throw new Error('cadastro de mentira encolheu: ' + TODOS);

console.log('\n== Motorista: rota em cima, cobertura embaixo ==');

/* ---- 1. a rota decide a ordem, não quem aparece ---- */
var r = escolherRota('R-CARUARU');
ok(r.grupos.length === 2, 'sai em dois grupos', r.grupos.map(function (g) { return g.rotulo; }));
ok(r.grupos[0].rotulo === 'Motorista da rota', '1º grupo é o da rota');
ok(r.grupos[1].rotulo === 'Outros motoristas', '2º grupo é a cobertura');
ok(r.grupos[0].nomes.indexOf('Ramos') === 0, 'Ramos vem primeiro, é a rota dele');
ok(r.grupos[0].nomes.indexOf('Val') >= 0, 'o volante conta como da rota');
ok(r.todos.length === TODOS, 'todo motorista continua alcançável', r.todos);
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
DADOS.motoristas.push({ ID: 'D5', Nome: 'Neto', Rotas: ['R-RECIFE'] });
elRota.value = '';                            // força a rota a "mudar" de novo
F.montar('sdMotorista', 'sdRota');
r = escolherRota('R-RECIFE');
ok(r.escolhido === '', 'dois na mesma rota: pede a escolha');
DADOS.motoristas.pop();

/* ---- 5. sem rota escolhida, lista simples ---- */
r = escolherRota('');
ok(r.grupos.length === 0, 'sem rota não inventa rótulo de grupo');
ok(r.todos.length === TODOS, 'sem rota mostra todo mundo', r.todos);

/* ---- 6. rota sem ninguém atribuído não trava a saída ---- */
r = escolherRota('R-FANTASMA');
ok(r.todos.length === TODOS, 'rota sem cadastro ainda oferece a lista inteira', r.todos);

/* ---- 7. o nome sai escapado, NOS DOIS LUGARES ----
   O nome entra no `<option>` duas vezes: como texto entre as tags e como valor do
   atributo. Uma fixture com `<b>` só alcança a primeira — o texto escapado bastava
   para a asserção passar enquanto o ATRIBUTO ia cru, que é justamente por onde se
   sai da aspa e se escreve um `onmouseover`. Medido: arrancar o `Q.esc` do valor
   passava. A aspa dentro do nome é o que separa os dois caminhos. */
DADOS.motoristas.push({ ID: 'D6', Nome: 'A & <b>B</b>" onmouseover="x', Rotas: [] });
elRota.value = '';
r = escolherRota('R-CARUARU');
ok(elMotorista.innerHTML.indexOf('<b>B</b>') === -1,
   'nome com HTML não é injetado no TEXTO da opção');
/* A ASPA DE VERDADE, e nao a palavra: escapada, ela vira `onmouseover=&quot;`, que
   ainda CONTEM o texto "onmouseover=". Procurar so a palavra dava falha com o
   codigo certo. O que distingue um do outro e a aspa aberta logo depois do `=`. */
ok(elMotorista.innerHTML.indexOf('onmouseover="') === -1 &&
   elMotorista.innerHTML.indexOf('&quot;') > 0,
   'nem no ATRIBUTO: sem escapar a aspa, o nome fecha o `value` e escreve evento');
DADOS.motoristas.pop();

/* ---- 8. a devolução segue a mesma regra, pela rota de onde a carga vem ---- */
var d = escolherRotaDv('R-PETROLINA');
ok(d.grupos.length === 2, 'devolução também sai em dois grupos');
ok(d.grupos[0].nomes.indexOf('Jorge') >= 0, 'devolução: motorista da rota em cima');
ok(d.todos.length === TODOS, 'devolução: ninguém fica inalcançável', d.todos);
ok(d.escolhido === 'Jorge', 'devolução: motorista da rota já vem posto');

/* ---- 9. as duas telas não se atrapalham ---- */
escolherRota('R-CARUARU');
ok(lido(elDvMotorista).escolhido === 'Jorge', 'mexer na saída não mexe na devolução');
ok(lido().escolhido === 'Ramos', 'e a saída fica com o motorista dela');

/* ---- 10. devolução sem rota volta à lista simples ---- */
d = escolherRotaDv('');
ok(d.grupos.length === 0, 'devolução sem rota: lista simples');
ok(d.todos.length === TODOS, 'devolução sem rota: equipe inteira', d.todos);

/* ---- 11. a lista oferece o APELIDO, e o cadastro guarda o nome inteiro ----
 * No galpão o motorista é 'Isaque'; na CNH e no relatório ele é 'Isaque Sobrenome'.
 * Quem lança procura numa lista de treze nomes, e procura pelo nome de trabalho.
 * SEM APELIDO É O NOME INTEIRO: a maioria não vai ter apelido, e linha em branco na
 * lista é pior do que nome longo. */
ok(d.todos.indexOf('Isaque') >= 0,
  'quem tem apelido é oferecido pelo APELIDO — é por ele que quem lança procura',
  d.todos);
ok(d.todos.indexOf('Isaque Sobrenome') < 0,
  'e o nome inteiro NÃO aparece na lista: os dois lado a lado seriam duas linhas para a ' +
  'mesma pessoa, e quem lança não teria como saber qual escolher',
  d.todos);
ok(d.todos.indexOf('Ramos') >= 0 && d.todos.indexOf('Val') >= 0,
  'e quem não tem apelido continua pelo nome — a lista não pode ganhar linhas em branco',
  d.todos);

console.log('');
if (falhas) { console.log('>>> ' + falhas + ' FALHA(S)'); process.exit(1); }
console.log('>>> MOTORISTA OK');
