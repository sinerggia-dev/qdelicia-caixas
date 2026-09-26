/**
 * Qdelícia Frutas — Controle de Caixas
 * Conferência estática das telas de lançamento.
 *
 * POR QUE ISTO EXISTE
 * O botão "Limpar" já nasceu quebrado uma vez: campos novos entraram no formulário
 * (`sdRota`, `sdMotorista`) e ninguém lembrou de limpá-los. Na tela isso não grita — o
 * seletor escondido guarda o valor velho e reaparece quando a origem muda. Aqui grita.
 *
 * A regra: todo campo do formulário de saída e de devolução precisa ser tocado pela
 * função de limpar correspondente — menos a data, que é justamente a que fica.
 *
 * Não roda navegador: lê o HTML e o texto da função. É grosseiro de propósito, porque
 * o que se quer pegar aqui é esquecimento, não lógica.
 */
'use strict';

var fsReal = require('fs');
var path = require('path');

/* TODA leitura passa por aqui, e toda leitura vem sem retorno de carro.

   Esta conferencia recorta o codigo por TEXTO, e muitos recortes fecham numa quebra de
   linha — `";" + 
` ou `
` mais dois espacos e a chave. Numa copia de trabalho em CRLF o
   `indexOf` nao acha nada, o recorte vai ate o fim do arquivo, e o teste passa a medir o
   ARQUIVO INTEIRO em vez do trecho. Sem avisar: um recorte grande demais tem tamanho e
   tem o texto procurado, entao as guardas de tamanho nao veem nada de errado.

   Foi o que aconteceu depois de um `git stash pop` com `core.autocrlf=true`: duas
   afirmacoes sobre os cartoes do painel comecaram a falhar sem ninguem ter tocado no
   codigo delas.

   O `.gitattributes` resolve para quem faz checkout depois dele. Isto resolve sempre. */
var fs = {
  readFileSync: function (p, enc) {
    var d = fsReal.readFileSync(p, enc);
    return typeof d === 'string' ? d.replace(new RegExp(String.fromCharCode(13), 'g'), '') : d;
  },
  existsSync: function (p) { return fsReal.existsSync(p); }
};

/* SEM OS COMENTÁRIOS, para as afirmações que cobram uma CHAMADA.
 *
 * Esta conferência lê o código por texto, e texto não distingue código de comentário.
 * Pego numa sabotagem: `Q.relogioETempo()` foi comentada com `//` e a afirmação de que
 * "os dois apps chamam" continuou verde — a chamada estava lá, morta, e o regex a
 * encontrou. É a mesma família do defeito que já escapou três vezes aqui, o de a
 * afirmação casar com o comentário que eu mesmo escrevi explicando a regra.
 *
 * O `[^:]` antes do `//` é para não decepar `https://` dentro de uma string. É um corte
 * grosseiro e sabe-se disso: serve para cobrar que uma linha EXISTA viva, não para
 * analisar o arquivo. */
function semComentarios(txt) {
  return String(txt)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var falhas = 0;

/* A REGRA DO PAINEL, de verdade, recortada do `app.js`.
   Ela decide duas coisas em telas diferentes — se o app de campo MOSTRA a porta e se
   o painel DEIXA ENTRAR —, e por isso mora num lugar só. Vários blocos deste arquivo
   rodam código que a chama pelo `Q`, e todos usam esta, e não uma imitação: imitar a
   regra faria o teste medir a cópia escrita aqui em vez da que vai para o galpão. */
var REGRA_PAINEL = (function () {
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var i = js.indexOf('function podePainel(s)');
  if (i < 0) throw new Error('não achei o `podePainel` no app.js');
  var d = 0;
  for (var k = js.indexOf('{', i); k < js.length; k++) {
    if (js[k] === '{') d++;
    else if (js[k] === '}') { d--; if (!d) break; }
  }
  return eval('(' + js.slice(i, k + 1).replace('function podePainel', 'function') + ')');
})();

function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

/** Corpo de uma função declarada no nível do IIFE (indentação de dois espaços). */
function corpo(nome) {
  var i = html.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('função não encontrada: ' + nome);
  var fim = html.indexOf('\n  }', i);
  return html.slice(i, fim);
}

/** Ids de input/select/textarea dentro de uma <section>, na ordem em que aparecem. */
function camposDa(secao) {
  var i = html.indexOf('id="' + secao + '"');
  var fim = html.indexOf('</section>', i);
  var trecho = html.slice(i, fim);
  var re = /<(?:input|select|textarea)\b[^>]*\bid="([A-Za-z0-9_]+)"/g;
  var ids = [], m;
  while ((m = re.exec(trecho))) ids.push(m[1]);
  return ids;
}

console.log('\n== o botão Limpar alcança todo campo do formulário ==');

[
  { secao: 'pgSaida',     fn: 'limparSaida',     data: 'sdData' },
  { secao: 'pgDevolucao', fn: 'limparDevolucao', data: 'dvData' }
].forEach(function (t) {
  var texto = corpo(t.fn);
  var campos = camposDa(t.secao);

  ok(campos.length > 3, t.secao + ': achei os campos do formulário', campos);

  var esquecidos = campos.filter(function (id) {
    if (id === t.data) return false;
    return texto.indexOf("'" + id + "'") < 0;
  });
  ok(esquecidos.length === 0, t.fn + ' limpa todos os campos da tela', esquecidos);

  ok(texto.indexOf("'" + t.data + "'") < 0,
    t.fn + ' NÃO mexe na data — ela é a única que fica');

  // Zerar as quantidades é o motivo principal de existir o botão.
  ok(/zerarItens\(/.test(texto), t.fn + ' zera as quantidades contadas');
});

/* ------------------------------------------------------------------ *
 * Cada formulário do painel só pode ler campo que ele mesmo desenha.
 *
 * POR QUE ISTO EXISTE
 * Um campo novo foi parar no `formLocalPadrao` em vez do `formUsuario`, por engano de
 * substituição de texto. Resultado duplo e silencioso: a opção do usuário nunca era
 * enviada, e salvar um local padrão passou a estourar em `null.value`. Nada disso
 * aparece até alguém clicar em Salvar na tela certa.
 * ------------------------------------------------------------------ */
var admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

console.log('== formulário só lê campo que ele mesmo cria ==');

// Cada `function formXxx(` até a próxima declaração no mesmo nível de indentação.
var reForm = /\n  function (form[A-Za-z]+)\(/g;
var achados = [], m;
while ((m = reForm.exec(admin))) achados.push({ nome: m[1], i: m.index });

ok(achados.length >= 4, 'achei os formulários do painel', achados.map(function (f) { return f.nome; }));

achados.forEach(function (f, k) {
  var fim = k + 1 < achados.length ? achados[k + 1].i : admin.length;
  var trecho = admin.slice(f.i, fim);

  var criados = {}, r;
  var reId = /id="(f[A-Z][A-Za-z0-9]*)"/g;
  while ((r = reId.exec(trecho))) criados[r[1]] = true;
  // caixaLocais() desenha o campo em nome do formulário, então conta como criar aqui.
  var reCaixa = /caixaLocais\('(f[A-Z][A-Za-z0-9]*)'/g;
  while ((r = reCaixa.exec(trecho))) criados[r[1]] = true;

  var lidos = {};
  /* `f` mais MAIUSCULA, que e a convencao dos campos (`fNome`, `fEmpresa`). Com
     `f[A-Za-z0-9]+` a conferencia pegava `folhaUserT`, que nao e campo de formulario. */
  var reLe = /getElementById\('(f[A-Z][A-Za-z0-9]*)'\)/g;
  while ((r = reLe.exec(trecho))) lidos[r[1]] = true;
  // lerMarcados() lê pelo id sem passar por getElementById: sem isto, um quadro de
  // marcar no formulário errado escaparia exatamente como o campo que originou o teste.
  var reMarc = /lerMarcados\('(f[A-Z][A-Za-z0-9]*)'\)/g;
  while ((r = reMarc.exec(trecho))) lidos[r[1]] = true;

  var orfaos = Object.keys(lidos).filter(function (id) { return !criados[id]; });
  ok(orfaos.length === 0, f.nome + ' não lê campo de outro formulário', orfaos);
});

/* ---------------------------------------------------------------------------
 * Cada seletor tem de ser filtrado pela lista CERTA do cadastro.
 *
 * Isto já custou: o destino da devolução estava filtrado por 'saidas'. Quem tivesse a
 * Saída restrita a uma ROTA ficava com a lista de galpões vazia — nenhuma rota é galpão,
 * então o filtro não deixava nada passar — e não conseguia registrar devolução nenhuma.
 * Na tela não grita: o seletor só aparece vazio.
 * ------------------------------------------------------------------------- */
console.log('\n== cada seletor usa a lista certa de permissão ==');
(function () {
  var trecho = html.slice(html.indexOf('var comRota = locaisPor('),
                          html.indexOf("document.getElementById('sdOrigem').innerHTML"));

  function listaDe(nomeVar) {
    var i = trecho.indexOf('var ' + nomeVar + ' ');
    if (i < 0) i = trecho.indexOf('var ' + nomeVar + '=');
    if (i < 0) return '(variável não encontrada)';
    var linha = trecho.slice(i, trecho.indexOf(';', i));
    // guloso de propósito: o primeiro argumento pode ter vírgulas dentro, como em
    // locaisPor(['GALPAO','FILIAL']) — com [^,]+ o casamento falhava justo nessa linha
    var m = linha.match(/permitidos\(.*,\s*'([a-z]+)'\)/);
    return m ? m[1] : '(sem permitidos)';
  }

  ok(listaDe('minhasSaidas') === 'saidas',
    'origem da saída vem da lista de Saída', listaDe('minhasSaidas'));
  /* O destino da saída passou a ser montado em ajustarCamposSaida, porque depende da
     origem escolhida — então a variável mudou de lugar e de nome. */
  var ajuste = corpo('ajustarCamposSaida');
  var mPode = ajuste.match(/podeReceber\s*=\s*permitidos\(.*,\s*'([a-z]+)'\)/);
  ok(mPode && mPode[1] === 'destinos',
    'destino da saída vem da lista de Destino', mPode && mPode[1]);
  ok(/l\.ID\) !== String\(origem\)/.test(ajuste),
    'e a própria origem sai da lista, para não oferecer origem igual a destino');
  /* Cada lista do cadastro governa o campo de MESMO NOME, nos dois formularios. E a
     leitura literal dos rotulos: "Saida — de onde as caixas saem" e "Destino — para onde
     as caixas vao". No retorno, quem devolve e de onde a caixa sai.

     Ja esteve cruzado, por uma inferencia esperta demais ("na ida a rota e destino, logo
     vale a permissao de destino"): as duas pontas do retorno liam a MESMA lista, e nao
     havia marcacao capaz de separa-las. */
  ok(listaDe('minhasOrigensDv') === 'saidas',
    'quem devolve vem da lista de Saída: no retorno é de lá que a caixa sai',
    listaDe('minhasOrigensDv'));

  /* Os tipos do retorno moram numa constante, e as DUAS pontas bebem dela.
     Isto ja custou duas vezes: primeiro a origem listava so ROTA e as filiais sumiam;
     depois, corrigida a origem, o destino continuou preso a galpao e filial, e quem tinha
     rota marcada no cadastro nao a via. Duas listas para a mesma pergunta divergem. */
  var i = html.indexOf('var TIPOS_RETORNO');
  var constante = html.slice(i, html.indexOf(';', i));
  ['GALPAO', 'FILIAL', 'ROTA'].forEach(function (t) {
    ok(constante.indexOf("'" + t + "'") > 0,
      'o retorno inclui ' + t + ' — quem tem caixa pode devolver, e recebe de volta',
      constante);
  });
  ok(constante.indexOf("'CLIENTE'") < 0 && constante.indexOf("'FORNECEDOR'") < 0,
    'e nao inclui cliente nem fornecedor: aquele caminho e o da saida', constante);

  ok(trecho.indexOf('locaisPor(TIPOS_RETORNO)') > 0,
    'a origem do retorno bebe da constante');
  ok(corpo('ajustarDestinoRetorno').indexOf('locaisPor(TIPOS_RETORNO)') > 0,
    'e o destino bebe da MESMA — foi separa-las que deixou o destino mais estreito');

  /* O destino do retorno saiu de montarFormularios e virou funcao propria, porque agora
     depende da origem escolhida: com galpao nas duas pontas, a Matriz podia devolver para
     a Matriz. */
  var ajDv = corpo('ajustarDestinoRetorno');
  var mDv = ajDv.match(/todos\s*=\s*permitidos\(.*,\s*'([a-z]+)'\)/);
  ok(mDv && mDv[1] === 'destinos',
    'e para onde ela volta vem da lista de Destino — as duas pontas leem listas '
    + 'DIFERENTES, senão nenhuma marcação consegue separá-las', mDv && mDv[1]);
  ok(listaDe('minhasOrigensDv') !== mDv[1],
    'e são mesmo listas diferentes: é isso que permite "recebo de todas, devolvo só para '
    + 'a Matriz"', [listaDe('minhasOrigensDv'), mDv[1]]);

  /* Com um unico local marcado em Destino, tirar a origem esvaziava o campo e o
     lancamento ficava impossivel, sem nada na tela dizendo por que. */
  ok(/if \(!podem\.length\) podem = todos;/.test(ajDv),
    'e o campo nunca fica vazio: sem alternativa, a própria origem volta para a lista',
    ajDv.trim());
  ok(/l\.ID\) !== String\(origem\)/.test(ajDv),
    'e a própria origem sai da lista: sem isso a Matriz devolvia para a Matriz');

  /* A ordem importa: montar o destino ANTES de escolher a origem deixaria a origem
     escolhida ainda na lista. */
  var mf = corpo('montarFormularios');
  ok(mf.indexOf("preencherSozinho('dvOrigem'") < mf.indexOf('ajustarDestinoRetorno()'),
    'a origem se escolhe antes de montar o destino, senão ela continua na lista dele');

  // E o cadastro precisa oferecer o galpão em Destino, senão o filtro acima não tem o
  // que filtrar: a pessoa não teria como marcar o galpão que recebe a devolução.
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf("caixaLocais('fDestinos'");
  var bloco = adm.slice(i, adm.indexOf('u.Destinos)+', i));
  ok(bloco.indexOf('GALPAO') >= 0,
    'o cadastro oferece GALPAO na lista de Destino', bloco.slice(0, 120));
})();

/* ---------------------------------------------------------------------------
 * A lista de motoristas do app de campo passa por UMA peneira só.
 *
 * Se `motoristas()` ou `motoristasDaRota()` lerem DADOS.motoristas direto, a permissão
 * do cadastro deixa de valer naquele caminho — e a tela oferece um motorista que a
 * pessoa não pode escolher. O lançamento seria aceito, e só o cadastro saberia que
 * está errado.
 * ------------------------------------------------------------------------- */
console.log('\n== motorista: a permissão é aplicada na fonte ==');
(function () {
  var fonte = corpo('meusMotoristas');
  ok(/permitidos\(/.test(fonte) && /'motoristas'/.test(fonte),
    'meusMotoristas peneira por permissão');

  ['motoristas', 'motoristasDaRota'].forEach(function (nome) {
    var c = corpo(nome);
    ok(c.indexOf('meusMotoristas()') >= 0, nome + ' bebe da peneira');
    ok(!/DADOS\s*\|\|\s*\{\}\)\.motoristas/.test(c),
      nome + ' não lê DADOS.motoristas direto, o que puliria a permissão');
  });
})();

/* ---------------------------------------------------------------------------
 * app.js repete a ordenacao porque o celular nao carrega _logica.js. As duas copias
 * tem de andar juntas: se uma ganhar um criterio e a outra nao, a mesma lista aparece
 * em ordens diferentes no painel e no campo, e ninguem sabe qual esta certa.
 * ------------------------------------------------------------------------- */
console.log('\n== ordenacao do navegador acompanha a do servidor ==');
(function () {
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var i = app.indexOf('function ordenarLocais(');
  var corpoOrdena = app.slice(i, app.indexOf('\n  }', i));
  ['pesoTeste', 'pesoMatriz'].forEach(function (chave) {
    ok(corpoOrdena.indexOf(chave) >= 0, 'ordenarLocais usa ' + chave);
  });
  ok(corpoOrdena.indexOf('pesoTeste') < corpoOrdena.indexOf('pesoMatriz'),
    'e nesta ordem: o ensaio manda mais que a matriz, senao "Matriz Teste" abriria a lista');
})();

/* ---------------------------------------------------------------------------
 * A ordem das listas de local tem de nascer no PONTO DE USO.
 *
 * Isto ja custou: a ordenacao morava em quem guardava DADOS, e dois caminhos trocavam
 * DADOS sem reordenar — entre eles o evento `dadosAtualizados`. Por eles a lista chegava
 * na ordem crua do banco, que e ordem de cadastro, com as filiais no fim.
 * ------------------------------------------------------------------------- */
console.log('\n== a ordem do local nasce no ponto de uso ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  function corpoAdm(nome) {
    var i = adm.indexOf('function ' + nome + '(');
    return adm.slice(i, adm.indexOf('\n  }', i));
  }
  ok(corpoAdm('locaisPor').indexOf('ordenarLocais') >= 0,
    'locaisPor ordena, entao nenhum seletor depende de quem guardou DADOS');
  ok(corpoAdm('desenharCadastros').indexOf('ordenarLocais') >= 0,
    'a tabela de locais idem');
})();

/* ---------------------------------------------------------------------------
 * SAIDA e RETORNO abrem por tipo de caixa.
 *
 * A lista de tipos morava na linha de baixo do nome, sem quantidade nenhuma. Agora mora
 * debaixo de cada total, com a quantidade — mas so quando ha mais de um tipo: repetir o
 * mesmo numero embaixo dele nao acrescenta, e o nome sozinho ja e o que faltava saber.
 *
 * Aqui a funcao roda de verdade, extraida do admin.html, porque o que se quer garantir e
 * o texto que cai na celula — nao que a palavra certa exista em algum lugar do arquivo.
 * ------------------------------------------------------------------------- */
console.log('\n== saida e retorno abertos por tipo de caixa ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var j = adm.indexOf('function detalheCaixas(');
  var fonte = adm.slice(j, adm.indexOf('\n  }', j) + 4);
  var Q = { esc: String, num: function (n) { return String(n); } };
  var detalheCaixas = new Function('Q', fonte + ' return detalheCaixas;')(Q);

  ok(detalheCaixas([{ caixa: 'CX G', qtd: 530 }, { caixa: 'CX P', qtd: 50 }]) ===
     '<span class="fsub tipos">CX G 530 · CX P 50</span>',
    'com varios tipos, cada um vem com a sua quantidade',
    detalheCaixas([{ caixa: 'CX G', qtd: 530 }, { caixa: 'CX P', qtd: 50 }]));
  ok(detalheCaixas([{ caixa: 'CX G', qtd: 530 }]) === '<span class="fsub tipos">CX G</span>',
    'com um tipo so, vem o nome — sem repetir o total que esta logo acima',
    detalheCaixas([{ caixa: 'CX G', qtd: 530 }]));
  ok(detalheCaixas([]) === '' && detalheCaixas(null) === '',
    'sem movimento daquele lado, nao sobra nem rotulo vazio');
})();

/* ---------------------------------------------------------------------------
 * A barra de Movimentos: todo campo desenhado tem de ser lido, recarregar e limpar.
 *
 * Um campo que fica na tela mas ninguem le e pior do que um campo que falta: a pessoa
 * escolhe, a lista nao muda, e a conclusao natural e que o filtro esta quebrado. Pior
 * ainda no botao de apagar, que le exatamente estes campos — um esquecido ali significa
 * apagar mais do que se viu.
 * ------------------------------------------------------------------------- */
console.log('\n== a barra de Movimentos nao esquece campo ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  var i = adm.indexOf('<div class="grid-filtros">', adm.indexOf('id="pgMovimentos"'));
  var barra = adm.slice(i, adm.indexOf('<div class="linha-btn">', i));
  var campos = (barra.match(/id="(mv[A-Za-z]+)"/g) || [])
    .map(function (m) { return m.slice(4, -1); });

  ok(campos.length >= 9, 'a leitura achou os campos da barra', campos);

  var leitura = adm.slice(adm.indexOf('function filtroExclusao()'),
                          adm.indexOf('function descreveFiltro('));
  ok(campos.filter(function (c) { return leitura.indexOf("'" + c + "'") < 0; }).length === 0,
    'todo campo da barra entra no filtro que lista E apaga',
    campos.filter(function (c) { return leitura.indexOf("'" + c + "'") < 0; }));

  var j = adm.indexOf("['mvOrigem', 'mvDestino'");
  var ouvintes = adm.slice(j, adm.indexOf('});', j));
  ok(campos.filter(function (c) { return ouvintes.indexOf("'" + c + "'") < 0; }).length === 0,
    'e todo campo recarrega a lista sozinho ao mudar',
    campos.filter(function (c) { return ouvintes.indexOf("'" + c + "'") < 0; }));

  /* E todo campo tem de VIAJAR no pedido. Faltava este teste, e por isso `mvFluxo` e
     `mvCaixa` passaram a existir sem efeito nenhum: o servidor sabia filtrar, a tela so
     nao pedia. Escolher uma caixa nao mudava nada na tabela.

     Pior que inofensivo: o "Apagar o que esta no filtro" mandava os dois campos, entao a
     tela e o apagar recortavam conjuntos diferentes — o que sobrava contra isso era a
     conferencia do numero esperado. */
  var p = adm.indexOf("Q.get({acao:'movimentos'");
  var pedido = adm.slice(p, adm.indexOf('})', p));
  var campoDoPedido = { mvOrigem: 'origem', mvDestino: 'destino', mvFluxo: 'fluxo',
                        mvTipo: 'tipo', mvCaixa: 'caixa', mvStatus: 'situacao',
                        mvUsuario: 'usuario', mvTeste: 'teste', mvDe: 'de', mvAte: 'ate',
                        /* Os dois que nasceram do clique no grafico. O `mvTrecho` nao
                           tem campo a vista, e e justamente por isso que ele precisa
                           estar aqui: um filtro invisivel que nao viajasse no pedido
                           recortaria a tela sem recortar o apagar. */
                        mvMotorista: 'motorista', mvTrecho: 'trecho' };
  var semMapa = campos.filter(function(c){ return !campoDoPedido[c]; });
  ok(semMapa.length === 0,
    'todo campo da barra tem um nome conhecido no pedido — campo novo entra aqui também',
    semMapa);
  var naoViaja = campos.filter(function(c){
    return pedido.indexOf(campoDoPedido[c] + ':f.') < 0;
  });
  ok(naoViaja.length === 0,
    'e todo campo da barra viaja no pedido: filtro que não chega ao servidor não filtra',
    naoViaja);

  /* O CORPO DA FUNÇÃO, e não mais o do ouvinte: o "Limpar" virou `limparFiltrosMov()`
     porque o X da pílula, no celular, chama a MESMA coisa — copiada, a segunda cópia
     esqueceria um campo no dia em que um campo novo entrasse. Ancorado no ouvinte, este
     recorte passou a pegar uma linha só e a afirmação reprovou sem nada ter piorado. */
  var limpar = (function () {
    var i = adm.indexOf('function limparFiltrosMov()');
    var d = 0, j = adm.indexOf('{', i);
    for (; j < adm.length; j++) {
      if (adm[j] === '{') d++;
      else if (adm[j] === '}' && --d === 0) return adm.slice(i, j + 1);
    }
    return '';
  })();
  // as duas datas voltam pelo periodoPadraoMov, nao uma a uma
  var faltam = campos.filter(function (c) {
    if (c === 'mvDe' || c === 'mvAte') return limpar.indexOf('periodoPadraoMov') < 0;
    return limpar.indexOf("'" + c + "'") < 0;
  });
  ok(faltam.length === 0, 'e todo campo volta ao padrao no botao Limpar', faltam);
})();

/* ---------------------------------------------------------------------------
 * Painel de Ativos: cabecalho, celulas e colspan contam a mesma historia.
 *
 * A tabela monta duas formas: com Saldo inicial (locais) e sem (motorista/usuario, que
 * nao tem estoque proprio). Se o <th> aparecer e o <td> nao — ou o contrario — a tabela
 * desalinha inteira e cada numero passa a ser lido na coluna do vizinho. E o colspan do
 * aviso de vazio tem de acompanhar, senao a mensagem quebra a largura da tabela.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * Matriz e galpoes ficam num chip proprio.
 *
 * A mesma remessa aparece duas vezes na tabela: como saida da matriz e como saida para a
 * rota. Se as duas caissem na mesma lista, o deficit do mes contaria 180 duas vezes e o
 * numero do rodape passaria a ser 360 sem nada ter mudado na operacao.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * Cada numero diz a sua outra ponta, e a preposicao inverte no galpao.
 *
 * O cabecalho dizia "Origem / destino" e a coluna trazia UM nome: nao dava para saber se
 * aquele local era de onde a caixa saiu ou para onde ela foi. Agora o titulo diz so o que
 * a linha e, e cada numero carrega "de X" / "para X" embaixo.
 * ------------------------------------------------------------------------- */
console.log('\n== as colunas Origem e Destino ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));

  // o valor, nao o texto: o comentario ali do lado explica por que o titulo velho saiu,
  // e procurar a frase solta acusaria o proprio comentario.
  ok(/FLUXO_COLUNAS\[FLUXO_FILTRO\] \|\| \[.Local.\]/.test(corpo),
    'o titulo padrao passou a ser "Local" — prometer "Origem / destino" e mostrar um nome so era o engano');

  /* As colunas viraram dados: a ordem e arrastavel, entao "lado a lado" deixou de ser
     garantia. O que continua valendo e que as duas existem e leem campos diferentes. */
  ok(/origem:\s*\{/.test(corpo) && /destino:\s*\{/.test(corpo),
    'Origem e Destino sao colunas declaradas');
  ok(/lugares\(l\.origens\)/.test(corpo) && /lugares\(l\.destinos\)/.test(corpo),
    'e cada uma le o seu campo — trocar os dois inverteria a tabela inteira');
  /* A linha de estoque inicial nao tem destino: nao houve caminho. Deixar o travessao ali
     nao diria o que aquele numero e. */
  ok(/l\.estoqueInicial\s*$/m.test(corpo) || corpo.indexOf('l.estoqueInicial') > 0,
    'a linha de estoque inicial escreve "estoque inicial" no lugar do destino', corpo.indexOf('estoqueInicial'));

  // a funcao que monta a celula
  var j = adm.indexOf('function lugares(');
  var fonte = adm.slice(j, adm.indexOf('\n  }', j) + 4);
  var Q = { esc: String };
  var lugares = new Function('Q', fonte + ' return lugares;')(Q);

  ok(lugares(['Matriz Fazenda']) === 'Matriz Fazenda',
    'um so aparece limpo, sem preposicao: quem diz a direcao e o titulo da coluna',
    lugares(['Matriz Fazenda']));
  /* Nao ha mais nome em negrito: cada linha e UM trajeto, e cada celula traz um nome so.
     O destaque existia porque a linha era de um local e era preciso dizer qual dos dois
     nomes era o dono. */
  ok(lugares(['Matriz', 'Joao Pessoa']) === 'Matriz, Joao Pessoa',
    'sem dono a destacar: a celula so escreve o que recebeu',
    lugares(['Matriz', 'Joao Pessoa']));
  ok(lugares([]).indexOf('—') > 0 && lugares(null).indexOf('—') > 0,
    'vazio vira travessao — celula em branco parece falha de carregamento');
  ok(lugares(['A','B','C','D']) === 'A, B <span class="fraco">+2</span>',
    'com muitos, os dois primeiros e um "+N" — a lista inteira esticaria a coluna',
    lugares(['A','B','C','D']));
})();

console.log('\n== filial e galpao dividem um chip, fora de Todas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  function corpoDe(nome){
    var i = adm.indexOf('function ' + nome + '(');
    return i < 0 ? '' : adm.slice(i, adm.indexOf('\n  }', i));
  }

  /* Com uma linha por trajeto acabou a contagem dobrada: "Todas" e todas mesmo. No
     modelo por local a mesma remessa aparecia duas vezes e o galpao ficava de fora. */
  ok(corpoDe('linhasVivas').indexOf("tipo !== 'GALPAO'") < 0,
    'a lista de "Todas" nao exclui mais o galpao: nao ha mais contagem dobrada',
    corpoDe('linhasVivas').trim());
  /* Os dois tipos no MESMO chip: na operacao filial e galpao sao a casa, e separa-los
     obrigava a procurar a Filial Maceio em duas listas. */
  var lfi = corpoDe('linhasFiliais');
  ok(/tipo === 'GALPAO'/.test(lfi) && /tipo === 'FILIAL'/.test(lfi),
    'o chip Filiais junta filial e galpao', lfi.trim());

  /* O CHIP CONTA E PENEIRA PELO MESMO NÚMERO QUE A TABELA MOSTRA.
   *
   * Relatado da operação: "Em déficit 2", e uma das duas linhas com `+810` no Saldo
   * final. Não era erro de conta — a peneira olhava o `saldo` da linha (retorno menos
   * saída) e a coluna mostrava o corrido (inicial − saída + retorno). Dois números
   * certos, e só um na tela: não havia como conferir o filtro olhando.
   * Esta asserção cobra o ACORDO, e não uma fórmula: as três leituras — a contagem do
   * chip, a peneira e a célula — passam pela mesma função. */
  var def = corpoDe('linhasDeficit');
  ok(/saldoFinalDaLinha\(l, false\) < 0/.test(def),
    'o chip "Em déficit" conta pelo Saldo final, que é o número que a tabela mostra',
    def.trim());
  var peneira = adm.slice(adm.indexOf("if (FLUXO_FILTRO === 'deficit')"),
                          adm.indexOf("if (FLUXO_FILTRO === 'deficit')") + 220);
  ok(/saldoFinalDaLinha\(l, false\) < 0/.test(peneira),
    'e peneira pelo mesmo — contado por uma regra e peneirado por outra, o número no ' +
    'chip promete uma coisa e o clique entrega outra', peneira.slice(0, 90));

  var lf = corpoDe('linhasFluxo');
  ok(/FLUXO_FILTRO === 'FILIAL'/.test(lf) && lf.indexOf('linhasFiliais') >= 0,
    'e o chip Filiais tem a sua propria lista na tabela', lf.trim());
  ok(lf.indexOf("'GALPAO'") < 0,
    'nao sobrou chip de galpao a parte — um lugar so decide onde a casa aparece', lf.trim());

  /* O numero do chip sai da MESMA lista que a tabela mostra. Contar por `tipo ===
     'FILIAL'` como os outros diria "Filiais 0" com duas filiais listadas abaixo. */
  var i = adm.indexOf("{ v:'FILIAL'");
  ok(adm.slice(i, i + 120).indexOf('linhasFiliais().length') > 0,
    'e o numero do chip sai dessa lista, nao de uma contagem por tipo',
    adm.slice(i, i + 90));
})();

/* ---------------------------------------------------------------------------
 * Painel de Ativos: as colunas sao DADOS, e o cabecalho e as celulas saem da mesma lista.
 *
 * Antes eram duas strings montadas lado a lado — um <th> a mais sem o <td> correspondente
 * desalinhava a tabela inteira, e cada numero passava a ser lido na coluna do vizinho. A
 * garantia agora e estrutural: quem monta as duas percorre a MESMA lista.
 * ------------------------------------------------------------------------- */
console.log('\n== Painel de Ativos: as colunas fecham ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));

  // uma lista so alimenta o <thead> e o <tbody>
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,200}<th/.test(corpo),
    'o cabecalho percorre a lista de colunas');
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,120}<td/.test(corpo),
    'e as celulas percorrem a MESMA lista — nao ha duas strings para lembrar de casar');
  /* `cs.length + 1` e nao um numero escrito: o +1 e a coluna de folga, que existe para a
     largura pedida ser obedecida. Numero fixo, o aviso apareceria torto no dia em que uma
     coluna fosse escondida. */
  ok(/colspan="'\+\(cs\.length\+1\)\+'"/.test(corpo),
    'o aviso de tabela vazia usa o tamanho dessa lista mais a folga, nao um numero fixo');

  // toda coluna declarada tem titulo e como preencher
  var defs = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('DEFS.quem.t'));
  var ids = (defs.match(/^\s{6}(\w+):\s*\{/gm) || []).map(function (t) {
    return t.trim().split(':')[0];
  });
  ok(ids.length >= 8, 'a leitura achou as colunas declaradas', ids);
  /* O titulo mora no DESCRITOR da tabela, e a celula o le de la: a aba Colunas precisa
     dos nomes sem desenhar a tabela, e escreve-los duas vezes seria duas listas sobre a
     mesma coisa — elas divergem no primeiro renome. */
  ok(ids.every(function (id) {
    var bloco = defs.slice(defs.indexOf(id + ':'),
                           defs.indexOf('\n      ', defs.indexOf(id + ':') + 60));
    return /t:\s*TIT\[/.test(bloco) || id === 'quem';
  }), 'toda coluna tem titulo, e ele vem do descritor da tabela');

  /* A linha de estoque inicial se identifica no DESTINO, e nao numa coluna propria: o
     local dela ja esta na Origem, e uma coluna a mais so para repeti-lo ficava vazia em
     todas as outras linhas. */
  ok(defs.indexOf('localIni') < 0,
    'nao ha coluna separada para o local do saldo — ele ja esta na Origem');
  /* A coluna Destino ja trouxe a marca "Estoque Inicial" escrita, a pedido, e saiu a
     pedido tambem. A linha de estoque NAO TEM destino, e a celula passa a dizer isso com
     o mesmo travessao das outras celulas vazias do painel.

     O que a linha e continua legivel em dois lugares, e o teste cobra os dois: a coluna
     Estoque traz o valor lancado, e o Saldo inicial sai em verde so nessas linhas. Sem
     nenhum dos dois, elas viravam quatro linhas iguais com numeros diferentes. */
  var defsD = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('DEFS.quem.t'));
  var blocoD = defsD.slice(defsD.indexOf('\n      destino:'), defsD.indexOf('\n      quem:'));
  ok(blocoD.indexOf('Estoque Inicial') < 0 && blocoD.indexOf('marca-estoque') < 0,
    'a coluna Destino não escreve mais "Estoque Inicial"', blocoD);
  ok(/l\.estoqueInicial\s*\?\s*'<span class="fraco">—<\/span>'/.test(blocoD),
    'e diz que a linha não tem destino, com o mesmo travessão das outras células vazias',
    blocoD);
  var cssD = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  ok(cssD.indexOf('.marca-estoque') < 0,
    'nem o estilo dela ficou para trás — CSS sem dono é o que ninguém ousa apagar depois');

  ok(/lancado:  \{ t: TIT\['lancado'\]/.test(defsD) &&
     /l\.estoqueInicial \? ' val-ok' : ''/.test(defsD),
    'o que a linha É continua legível: a coluna Estoque traz o valor, e o Saldo inicial ' +
    'sai em verde só nessas linhas');

  /* A chave de classificacao acompanhou: vazia, `compararValores` manda essas linhas para
     o fim — que e onde ficam as linhas sem o dado pelo qual se ordena. */
  ok(/k: function\(l\)\{ return \(l\.destinos \|\| \[\]\)\.join\(', '\); \}/.test(blocoD),
    'e a chave de classificação acompanha: sem destino, a linha vai para o fim', blocoD);

  /* E o CSV, pela regra de sempre: exportar e conferir na tela tem de bater. Deixado
     para tras, o arquivo escreveria "Estoque Inicial" numa coluna que a tela mostra
     vazia — e quem comparasse os dois acharia que faltou dado num dos lados. */
  var jc = adm.indexOf("Q.csv('retornos'");
  var csvD = adm.slice(adm.lastIndexOf('var VAL =', jc), adm.indexOf('};', adm.lastIndexOf('var VAL =', jc)));
  var linhaD = csvD.slice(csvD.indexOf('destino:'), csvD.indexOf('\n', csvD.indexOf('destino:')));
  ok(linhaD.indexOf('Estoque Inicial') < 0 && linhaD.indexOf('estoqueInicial') < 0,
    'o CSV acompanha a tela: sem destino nos dois, ou com o rótulo nos dois', linhaD);

  /* A ordem salva convive com mudancas na lista de fabrica.

     A funcao passou a receber a TABELA de quem sao as colunas: mover, esconder e
     redimensionar sao a mesma maquinaria para qualquer tabela do painel, e copia-la por
     tabela divergiria no primeiro conserto que so uma recebesse. A bancada monta a
     descricao da tabela de ativos e exercita a funcao com ela. */
  var j = adm.indexOf('function ordemColunas(t)');
  var fonteOrdem = adm.slice(adm.indexOf('var TAB_ATIVOS'), adm.indexOf('\n  }', j) + 4);
  ok(j > 0 && /function ordemColunas\(t\)/.test(fonteOrdem) && /kOrdem:/.test(fonteOrdem),
    'a ordem das colunas é da TABELA que se pede, e não de uma só');
  var loja = {};
  var localStorage = {
    getItem: function (k) { return loja[k] === undefined ? null : loja[k]; },
    setItem: function (k, v) { loja[k] = String(v); }
  };
  /* O PORTÃO ENTRA NA BANCADA como interruptor, e não como verdade fixa: é assim que os
     dois estados — admin e não-admin — podem ser exercitados na MESMA função, que é a
     única maneira de provar que a de fábrica volta. */
  var EH_ADMIN = true;
  /* O `Q`, e NÃO o `podeArranjarColunas`: o recorte já traz a função de verdade, e uma
     declaração dentro do corpo sombreia o parâmetro de mesmo nome — o portão injetado
     nunca seria chamado, e as duas asserções abaixo estariam medindo o nada.
     Injetando `Q.ehAdmin`, quem roda é o portão do arquivo. */
  /* E a TRAVA entra junto. Ser admin virou condição necessária e não suficiente: o
     arranjo nasce travado a cada abertura, e destravar pede a senha. A bancada mexe na
     MESMA variável que o portão lê — um portão de mentira provaria só a si mesmo. */
  var mont = new Function('localStorage', 'desenharFluxo', 'Q',
    fonteOrdem + ' return { fn: ordemColunas, t: TAB_ATIVOS,' +
    ' liberar: function(ms){ COLUNAS_ATE = Date.now() + ms; },' +
    ' travado: function(){ return !colunasDestravadas(); } };')(
      localStorage, function(){}, { ehAdmin: function(){ return EH_ADMIN; } });
  ok(mont.travado(), 'o arranjo NASCE travado, mesmo para o admin — a liberação não ' +
    'sobrevive a recarregar a página, que é o caso do computador compartilhado');
  mont.liberar(60000);
  var TAB = mont.t;
  var ordemColunas = function () { return mont.fn(TAB); };

  ok(ordemColunas().length >= 8, 'sem nada salvo, vem a ordem de fabrica', ordemColunas());

  loja.qdc_cols_ativos_v1 = JSON.stringify(['final', 'saida']);
  var r = ordemColunas();
  ok(r.indexOf('final') < r.indexOf('saida'),
    'a ordem salva manda: o que ela cita mantem a ordem relativa dela', r);

  /* A coluna que falta entra ao lado do vizinho de fabrica dela, e nao no fim. Jogada no
     fim, uma coluna nova aparecia depois do Saldo final para quem ja tinha arrastado —
     longe de onde faz sentido, e sem explicacao. */
  ok(r.indexOf('data') === 0,
    'coluna nova entra no lugar dela, nao no fim da fila', r);
  ok(r.indexOf('inicial') === r.indexOf('data') + 1,
    'e cada uma ao lado de quem a precede de fabrica', r);
  ok(r.length >= 8, 'e nenhuma se perde no caminho', r);

  /* Coluna que saiu do sistema some da ordem salva sem quebrar nada. Foi o caso do
     'localIni', que existiu por um dia e sai das preferencias de quem ja arrastou. */
  loja.qdc_cols_ativos_v1 = JSON.stringify(['localIni','data','inicial']);
  ok(ordemColunas().indexOf('localIni') < 0 && ordemColunas()[0] === 'data',
    'coluna aposentada some da ordem salva, e as outras seguem na ordem delas',
    ordemColunas());

  // uma so faltando: o caso real depois de um deploy
  loja.qdc_cols_ativos_v1 = JSON.stringify(['inicial','origem','destino',
                                            'quem','saida','retorno','final']);
  ok(ordemColunas()[0] === 'data',
    'so a coluna nova faltando, ela entra na posicao de fabrica dela', ordemColunas());

  loja.qdc_cols_ativos_v1 = JSON.stringify(['coluna_que_nao_existe', 'final']);
  ok(ordemColunas().indexOf('coluna_que_nao_existe') < 0,
    'coluna que saiu do sistema e descartada, nao quebra a tabela', ordemColunas());

  loja.qdc_cols_ativos_v1 = '{lixo';
  ok(ordemColunas().length >= 8,
    'e lixo no armazenamento cai na ordem de fabrica, sem estourar', ordemColunas());

  /* ---- SÓ O ADMINISTRADOR ARRANJA -------------------------------------
   * O portão está na LEITURA, e não só nos gestos. Bloquear apenas o arrastar deixaria
   * de pé o caso que mais importa: quem ERA admin, arrumou as colunas, e teve o perfil
   * trocado — a tela continuaria com o arranjo antigo, e com colunas escondidas que a
   * pessoa não tem mais como trazer de volta. O mesmo vale para o computador do
   * escritório onde o admin mexeu e o conferente senta depois. */
  loja.qdc_cols_ativos_v1 = JSON.stringify(['final', 'saida', 'data']);
  EH_ADMIN = true;
  var comoAdmin = ordemColunas();
  EH_ADMIN = false;
  var comoOutro = ordemColunas();
  ok(comoAdmin[0] === 'final',
    'o admin continua vendo o arranjo que ele salvou', comoAdmin);
  ok(comoOutro.join(',') === TAB.padrao.join(','),
    'e quem NÃO é admin vê a ordem de fábrica, ainda que haja arranjo guardado neste ' +
    'navegador — é o caso de quem deixou de ser admin, e do computador compartilhado',
    comoOutro);
  /* O QUE ESTÁ GUARDADO NÃO É APAGADO: a preferência volta a valer no dia em que a
     pessoa voltar a ser admin. Ignorar é diferente de destruir. */
  EH_ADMIN = true;
  ok(ordemColunas()[0] === 'final',
    'e o arranjo guardado não foi apagado — volta a valer quando o perfil volta',
    ordemColunas());
})();

/* ---------------------------------------------------------------------------
 * O CSV sai na mesma ordem de colunas da tela.
 * ------------------------------------------------------------------------- */
console.log('\n== o CSV do painel acompanha as colunas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var j = adm.indexOf("Q.csv('retornos'");
  var csv = adm.slice(adm.lastIndexOf('var cs =', j), adm.indexOf('}));', j));

  ok(csv.indexOf('ordemColunas(TAB_ATIVOS)') > 0,
    'o CSV le a MESMA ordem que a tela usa, inclusive a que a pessoa arrastou');
  ok(/TIT\[id\]/.test(csv) && /VAL\[id\]\(l\)/.test(csv),
    'e monta cabecalho e linha a partir dessa lista, nao de duas listas soltas');

  // todo id que o CSV pode receber tem titulo E valor
  var titulos = (csv.slice(csv.indexOf('var TIT'), csv.indexOf('var VAL')).match(/(\w+):/g) || [])
    .map(function (t) { return t.slice(0, -1); });
  var valores = (csv.slice(csv.indexOf('var VAL')).match(/^\s{6}(\w+):\s*function/gm) || [])
    .map(function (t) { return t.trim().split(':')[0]; });
  ok(titulos.length >= 7 && valores.length >= 7,
    'a leitura achou os dois mapas', [titulos, valores]);
  var semValor = titulos.filter(function (t) { return valores.indexOf(t) < 0; });
  ok(semValor.length === 0,
    'toda coluna do CSV tem titulo E valor — faltando um, a linha desalinha do cabecalho',
    semValor);
})();

/* ---------------------------------------------------------------------------
 * As abas do app obedecem ao cadastro.
 *
 * A aba que a pessoa nao pode usar tem de SUMIR, e a primeira que sobrou tem de virar a
 * ativa — senao o app abre numa pagina escondida e mostra tela em branco. E a lista vazia
 * quer dizer NENHUMA: marcar e conceder.
 * ------------------------------------------------------------------------- */
console.log('\n== o app so mostra a aba que a pessoa pode usar ==');
(function () {
  var i = html.indexOf('function operacoesDe(s)');
  var fonte = html.slice(i, html.indexOf('\n  function ajustarAbas', i));
  var operacoesDe = new Function(fonte + ' return operacoesDe;')();

  ok(operacoesDe({ perfil: 'Gestor' }).length === 0,
    'sem marca a lista vem vazia — e vazia quer dizer NENHUMA: marcar é conceder');
  ok(operacoesDe({ perfil: 'Conferente', operacoes: ['RETORNO'] }).join(',') === 'RETORNO',
    'o cadastro manda', operacoesDe({ perfil: 'Conferente', operacoes: ['RETORNO'] }));
  /* O ATALHO POR PERFIL SAIU. "Promotor sem marca ganha RETORNO" era um padrao
     escondido, e padrao escondido e exatamente a surpresa que a convencao nova veio
     tirar: o administrador nao marcava nada e a pessoa lancava assim mesmo.

     A migracao `2026-09-22-marcar-o-que-ja-valia` gravou ['RETORNO'] nos promotores que
     dependiam dele, entao ninguem perdeu a aba na virada. */
  ok(operacoesDe({ perfil: 'PROMOTOR' }).length === 0,
    'o promotor sem marca também não lança nada — o atalho por perfil saiu junto com a ' +
    'convenção antiga, e a migração gravou RETORNO em quem dependia dele');
  ok(operacoesDe({ perfil: 'PROMOTOR', operacoes: ['SAIDA'] }).join(',') === 'SAIDA',
    'e o cadastro manda, como manda para todo mundo');

  /* E a ABA obedece a peneira. O `!pode.length ||` que havia aqui era a convencao antiga
     escrita de novo, um nivel abaixo: a lista podia dizer "nenhuma" e a aba aparecia
     assim mesmo. */
  var fonteAbas = html.slice(html.indexOf('function ajustarAbas(s)'),
                             html.indexOf('\n  }', html.indexOf('function ajustarAbas(s)')));
  ok(/var liberada = !op \|\| pode\.indexOf\(op\) >= 0;/.test(fonteAbas),
    'e a aba obedece à peneira sem atalho — um `!pode.length ||` aqui é a convenção ' +
    'antiga escrita de novo um nível abaixo, e a aba apareceria para quem não tem marca',
    fonteAbas);
  ok(!/PROMOTOR/.test(fonte),
    'e o perfil não aparece mais na peneira: quem decide é o cadastro, e uma regra por ' +
    'perfil escondida ao lado dela acabaria discordando', fonte);

  // as abas carregam a operacao a que respondem
  ok(/data-pagina="pgSaida" data-operacao="SAIDA"/.test(html) &&
     /data-pagina="pgDevolucao" data-operacao="RETORNO"/.test(html),
    'cada aba de lancamento diz de que operacao ela e');
  ok(!/data-pagina="pgSaldo"[^>]*data-operacao/.test(html),
    'e a de saldo nao: e consulta, fica para todo mundo');

  var aj = html.slice(html.indexOf('function ajustarAbas(s)'),
                      html.indexOf("document.getElementById('chipSair')"));
  ok(aj.indexOf("style.display = liberada ? '' : 'none'") > 0,
    'a aba proibida some, nao fica so desabilitada');
  ok(aj.indexOf('primeira.click()') > 0,
    'e a primeira que sobrou vira a ativa — senao o app abre numa pagina escondida');
})();

/* ---------------------------------------------------------------------------
 * A correcao: o que o servidor aceita, o formulario oferece — e envia.
 *
 * Sao tres listas que precisam concordar: CORRIGIVEIS no servidor, os campos desenhados
 * no modal e as chaves do payload. Um campo que existe no servidor e falta no formulario
 * simplesmente nunca se corrige; um desenhado e nao enviado e pior — a pessoa muda o
 * seletor, grava, e nada acontece, sem erro nenhum na tela.
 * ------------------------------------------------------------------------- */
console.log('\n== a correcao oferece tudo que o servidor aceita ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var src = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');

  var ini = src.indexOf('var CORRIGIVEIS = [');
  var lista = src.slice(ini, src.indexOf('];', ini));
  var campos = (lista.match(/campo: '([A-Za-z]+)'/g) || [])
    .map(function (t) { return t.split("'")[1]; });
  ok(campos.length >= 10, 'a leitura achou os campos corrigiveis', campos);

  // o payload que o botao Gravar correcao monta
  var j = adm.indexOf("Q.post({acao:'corrigir'");
  var payload = adm.slice(j, adm.indexOf('}).then(', j));

  var faltam = campos.filter(function (c) { return payload.indexOf(c + ':') < 0; });
  ok(faltam.length === 0,
    'todo campo corrigivel do servidor viaja no payload do formulario', faltam);

  /* E cada um le um campo que existe no modal. Um getElementById para um id que nao foi
     desenhado estoura na hora de gravar — e a correcao inteira se perde. */
  var k = adm.indexOf("modal('<h2>Corrigir lançamento</h2>'");
  var modal = adm.slice(k, adm.indexOf("document.getElementById('cSalvar')", k));
  var ids = (payload.match(/getElementById\('(c[A-Za-z]+)'\)/g) || [])
    .map(function (t) { return t.split("'")[1]; });
  var semCampo = ids.filter(function (id) { return modal.indexOf('id="' + id + '"') < 0; });
  ok(semCampo.length === 0,
    'e cada id lido no envio foi desenhado no modal — senao a gravacao estoura', semCampo);

  ok(ids.length >= 10, 'o envio le os campos todos, nao dois ou tres', ids);
})();

/* ---------------------------------------------------------------------------
 * Painel de Ativos: filtros de origem/destino e largura das colunas.
 * ------------------------------------------------------------------------- */
console.log('\n== filtros de origem e destino, e largura das colunas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  function corpoDe(nome){
    var i = adm.indexOf('function ' + nome + '(');
    return i < 0 ? '' : adm.slice(i, adm.indexOf('\n  }', i));
  }

  /* A peneira fica na FONTE. Os chips, os indicadores e o CSV bebem de todasAsLinhas;
     filtrar so na tabela faria o chip dizer "Rotas 3" com uma linha listada embaixo. */
  var t = corpoDe('todasAsLinhas');
  ok(t.indexOf("valor('rtOrigem')") > 0 && t.indexOf("valor('rtDestino')") > 0,
    'os filtros de origem e destino moram na fonte de onde tudo bebe', t.trim());
  ok(/origens \|\| \[\]\)\.indexOf\(o\) < 0/.test(t) &&
     /destinos \|\| \[\]\)\.indexOf\(d\) < 0/.test(t),
    'e cada um compara com o seu campo — trocados, o filtro mentiria em silencio');

  /* A linha de estoque inicial nao tem destino: ela nao e um caminho, e o ponto de
     partida da conta. Sujeita ao filtro de destino ela caia fora, e o Saldo inicial da
     primeira linha abria em ZERO — filtrar por uma rota apagava as caixas disponiveis na
     Matriz e o saldo final passava a mentir.

     Pelo filtro de ORIGEM ela continua passando: olhar a conta de uma unidade nao deve
     trazer o estoque de outra junto. */
  ok(/if \(d && !l\.estoqueInicial/.test(t),
    'o filtro de destino nao derruba o estoque inicial: ele nao tem destino', t.trim());
  ok(/if \(o && \(l\.origens/.test(t) && t.indexOf('o && !l.estoqueInicial') < 0,
    'mas o de origem continua valendo para ele — origem ele tem', t.trim());

  /* A regra roda de verdade, para nao ficar so na leitura do texto. */
  var fonte = t.slice(t.indexOf('return f.linhas.filter'));
  fonte = fonte.slice(fonte.indexOf('function(l){') + 'function(l){'.length,
                      fonte.lastIndexOf('});'));
  fonte = fonte.slice(0, fonte.lastIndexOf('}'));
  /* O valor reservado vem do CODIGO, e nao escrito de novo aqui: repetido, o teste
     continuaria verde depois de alguem trocar o token no admin.html. */
  var ESTQ = (adm.match(/var DESTINO_ESTOQUE = '([^']+)'/) || [])[1];
  ok(!!ESTQ && /^[^A-Za-zÀ-ÿ0-9]/.test(ESTQ),
    'o valor reservado do filtro não começa como um nome de local começaria', ESTQ);

  /* `b` e `alvoBusca` entram como PARÂMETROS porque a regra passou a peneirar também
     pela busca: sem eles o corpo extraído estoura em `b is not defined`, e é assim que
     este teste avisa que a peneira mudou em vez de continuar medindo a de ontem. */
  var passa = new Function('l', 'o', 'd', 'DESTINO_ESTOQUE', 'b', 'alvoBusca',
    'FLUXO_TIPO', fonte).bind(null);
  var semBusca = function (l, o, d, e) {
    return passa(l, o, d, e, '', function () { return ''; }, 'todos');
  };

  /* O RECORTE DE MOVIMENTO, exercitado rodando. A linha de estoque inicial não é saída
     nem retorno — é o ponto de partida da conta —, e mantê-la em "só saída" faria a
     lista misturar o que saiu com o que já estava lá. */
  var comSaida = { inicial: 0, saida: 300, retorno: 0, situacao: 'atencao',
                   origens: ['Matriz Fazenda'], destinos: ['João Pessoa'] };
  var soVolta  = { inicial: 0, saida: 0, retorno: 120, situacao: 'atencao',
                   origens: ['Matriz Fazenda'], destinos: ['João Pessoa'] };
  var abertura = { estoqueInicial: true, inicial: 1250, saida: 0, retorno: 0,
                   situacao: 'parado', origens: ['Matriz Fazenda'], destinos: [] };
  function mov(l, tipo) {
    return passa(l, '', '', ESTQ, '', function () { return ''; }, tipo);
  }
  ok(mov(comSaida, 'saida') === true && mov(soVolta, 'saida') === false,
    '"só saída" fica com os dias em que saiu alguma coisa');
  ok(mov(soVolta, 'retorno') === true && mov(comSaida, 'retorno') === false,
    'e "só retorno", com os dias em que voltou');
  ok(mov(abertura, 'saida') === false && mov(abertura, 'retorno') === false &&
     mov(abertura, 'todos') === true,
    'a linha de estoque inicial cai fora dos dois: ela não é saída nem retorno, é o ' +
    'ponto de partida da conta');
  var estoque = { estoqueInicial: true, inicial: 1250, situacao: 'parado',
                  origens: ['Matriz Fazenda'], destinos: [] };
  var caminho = { inicial: 0, situacao: 'atencao',
                  origens: ['Matriz Fazenda'], destinos: ['João Pessoa'] };

  ok(semBusca(estoque, '', 'João Pessoa', ESTQ) === true,
    'filtrando por destino, o estoque da Matriz continua na lista');
  ok(semBusca(caminho, '', 'João Pessoa', ESTQ) === true, 'e o caminho filtrado tambem');
  ok(semBusca(estoque, 'Filial Maceió', '', ESTQ) === false,
    'mas filtrando por OUTRA origem ele sai: a conta e de outra unidade');
  ok(semBusca(estoque, 'Matriz Fazenda', '', ESTQ) === true,
    'e pela origem dele, fica');

  /* A opcao propria: ver SO os lancamentos de estoque. Ela nao cabia no filtro de destino
     pelo nome, porque estoque nao e um lugar — a linha nem destino tem. */
  ok(semBusca(estoque, '', ESTQ, ESTQ) === true,
    'escolhendo "Estoque Inicial" no destino, as linhas de estoque ficam');
  ok(semBusca(caminho, '', ESTQ, ESTQ) === false,
    'e os caminhos saem — é o único caso em que o estoque não é a exceção, mas a regra');
  ok(semBusca(estoque, 'Matriz Fazenda', ESTQ, ESTQ) === true &&
     semBusca(estoque, 'Filial Maceió', ESTQ, ESTQ) === false,
    'e a origem continua somando com ele: os dois filtros valem juntos');

  /* Este caso parece artificial e e o unico que separa a regra da sorte.
     Hoje o token funcionaria SEM a linha que o trata: a linha de estoque passa pela
     isencao do filtro de destino, e nenhum caminho tem destino chamado "::estoque". Ou
     seja, apagar a linha nao muda nada — e um teste que nao usasse um caminho com esse
     destino ficaria verde com a regra removida.

     Um caminho cujo destino se chame exatamente como o token separa as duas coisas: com
     a linha, ele sai (nao e estoque); sem ela, entraria por coincidencia de nome. E o que
     mantem o token RESERVADO em vez de so improvavel. */
  var homonimo = { inicial: 0, situacao: 'atencao',
                   origens: ['Matriz Fazenda'], destinos: [ESTQ] };
  ok(semBusca(homonimo, '', ESTQ, ESTQ) === false,
    'um caminho cujo destino fosse o próprio token ainda assim sai: o valor é reservado, '
    + 'e não um nome que se compara com os outros', semBusca(homonimo, '', ESTQ, ESTQ));

  /* As opcoes saem do fluxo CRU. Monta-las a partir da lista ja filtrada faria escolher
     uma origem apagar as outras opcoes, sem caminho de volta. */
  var mf = corpoDe('montarFiltrosFluxo');
  ok(mf.indexOf('PAINEL.fluxo') > 0 && mf.indexOf('todasAsLinhas') < 0,
    'as opcoes saem do fluxo cru, nao da lista ja filtrada', mf.trim());
  ok(/opcoes\.some\(function\(o\)\{ return o\.v === antes; \}\)/.test(mf),
    'e a escolha sobrevive ao recarregar, quando ainda existe — inclusive a de estoque');

  /* A opcao so aparece quando ha estoque no periodo: oferecer um filtro que nao acha nada
     e mandar a pessoa procurar o que nao existe. */
  var monta = new Function('PAINEL', 'document', 'Q', 'DESTINO_ESTOQUE',
    /* corpoDe corta no fecha-chaves da funcao, entao ele volta aqui. */
    mf + '} return montarFiltrosFluxo;');
  function selects(){
    var els = { rtOrigem: { value: '', innerHTML: '' },
                rtDestino: { value: '', innerHTML: '' } };
    return { els: els, doc: { getElementById: function(id){ return els[id] || null; } } };
  }
  var Qesc = { esc: function(v){ return String(v); } };

  var comEstoque = selects();
  monta({ fluxo: { linhas: [estoque, caminho] } }, comEstoque.doc, Qesc, ESTQ)();
  ok(comEstoque.els.rtDestino.innerHTML.indexOf('>Estoque Inicial<') > 0 &&
     comEstoque.els.rtDestino.innerHTML.indexOf('value="' + ESTQ + '"') > 0,
    'havendo estoque no período, a opção entra no filtro de destino',
    comEstoque.els.rtDestino.innerHTML);
  ok(comEstoque.els.rtDestino.innerHTML.indexOf('Estoque Inicial') <
     comEstoque.els.rtDestino.innerHTML.indexOf('João Pessoa'),
    'e vem no topo: no meio dos nomes em ordem alfabética ela pareceria mais um local');
  ok(comEstoque.els.rtOrigem.innerHTML.indexOf('Estoque Inicial') < 0,
    'no filtro de ORIGEM ela não entra: a origem do estoque é o local, e ele já está lá',
    comEstoque.els.rtOrigem.innerHTML);

  var semEstoque = selects();
  monta({ fluxo: { linhas: [caminho] } }, semEstoque.doc, Qesc, ESTQ)();
  ok(semEstoque.els.rtDestino.innerHTML.indexOf('Estoque Inicial') < 0,
    'sem estoque no período, a opção não aparece — filtro que não acha nada só engana',
    semEstoque.els.rtDestino.innerHTML);

  // ---- largura ----
  var j = adm.indexOf('function larguras(t)');
  /* Idem: a largura e da tabela que se pede. O recorte comeca em `TAB_ATIVOS` porque e
     dele que saem as larguras de fabrica. */
  var fonte = adm.slice(adm.indexOf('var TAB_ATIVOS'), adm.indexOf('\n  }', j) + 4);
  var loja = {};
  var localStorage = {
    getItem: function (k) { return loja[k] === undefined ? null : loja[k]; },
    setItem: function (k, v) { loja[k] = String(v); }
  };
  var LARG_ADMIN = true;
  var mm = new Function('localStorage', 'desenharFluxo', 'Q',
    fonte + ' return { fn: larguras, t: TAB_ATIVOS,' +
    ' liberar: function(ms){ COLUNAS_ATE = Date.now() + ms; } };')(
      localStorage, function(){}, { ehAdmin: function(){ return LARG_ADMIN; } });
  mm.liberar(60000);
  var TABL = mm.t;
  var larguras = function () { return mm.fn(TABL); };

  var d = larguras();
  ok(d.saida > 0 && d.inicial > 0, 'sem nada salvo, vem a largura de fabrica', d);

  loja.qdc_larg_ativos_v1 = JSON.stringify({ saida: 300 });
  ok(larguras().saida === 300, 'a largura salva manda', larguras().saida);
  ok(larguras().inicial === d.inicial,
    'e as outras seguem a de fabrica — salvar uma nao zera as demais', larguras());

  /* Largura minima: sem ela, um arrasto ate a esquerda some com a coluna e nao ha como
     pega-la de volta, porque a alcinha vai junto. */
  loja.qdc_larg_ativos_v1 = JSON.stringify({ saida: 2 });
  ok(larguras().saida >= 70, 'largura absurda cai no minimo, nao some com a coluna',
    larguras().saida);

  loja.qdc_larg_ativos_v1 = '{lixo';
  ok(larguras().saida === d.saida, 'lixo no armazenamento cai na largura de fabrica');

  /* A LARGURA SEGUE A MESMA REGRA DA ORDEM: sem permissão, a de fábrica. Uma coluna
     que alguém deixou em 70px continuaria espremida para quem não tem como alargá-la. */
  loja.qdc_larg_ativos_v1 = JSON.stringify({ saida: 320 });
  LARG_ADMIN = false;
  ok(larguras().saida === d.saida,
    'quem não é admin vê a largura de fábrica, ainda que haja uma guardada neste ' +
    'navegador — senão uma coluna espremida fica espremida sem ter como alargar',
    larguras().saida);
  LARG_ADMIN = true;
  ok(larguras().saida === 320, 'e a guardada volta a valer quando o perfil volta');

  /* Layout fixo: em layout automatico o navegador trata `width` como sugestao, e a
     coluna volta sozinha ao soltar. */
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  /* O estilo do cabecalho ajustavel tem de seguir a CLASSE `fixa`, e nao um id. Preso a
     um id, a proxima tabela ganha o arrasto no JavaScript e nao ganha onde clicar — foi
     o que aconteceu com Movimentos, que ficou meses com a alcinha de 0px de largura e
     `table-layout:auto`, tudo ligado e nada funcionando. Nenhuma afirmacao olhava para o
     estilo, so para o codigo, e por isso passou. */
  ok(/(^|\n)table\.fixa\{table-layout:fixed\}/.test(css),
    'a tabela usa layout fixo, senao a largura pedida nao e obedecida');
  [['th[data-col]', /table\.fixa th\[data-col\]\{cursor:grab/],
   ['.puxador',     /table\.fixa th \.puxador\{position:absolute/],
   ['th.alvo',      /table\.fixa th\.alvo\{/]].forEach(function (par) {
    ok(par[1].test(css),
      'e o estilo de ' + par[0] + ' segue a classe `fixa`, valendo para toda tabela que ' +
      'entra na maquinaria — preso a um id, a tabela seguinte arrasta no código e não na tela');
  });
  ok(!/#tabelaFluxo th|#tabelaFluxo table/.test(css),
    'e nenhuma regra do cabeçalho ficou presa ao id do Painel de Ativos',
    (css.match(/#tabelaFluxo[^{]*\{/g) || []));
  ok(adm.indexOf('<table class="fixa">') > 0,
    'e a tabela do painel pede essa classe');
  ok(/style="width:'\+\(LARG\[c\.id\]/.test(adm),
    'cada <th> sai com a largura guardada');

  /* A COLUNA DE FOLGA. Medido no Chrome: em `table-layout:fixed` com a tabela a 100%, o
     que sobra e repartido entre as colunas — pedir 95px devolvia 435px sempre que as
     colunas nao enchiam a janela, e esconder uma so esticava as outras em vez de devolver
     a tela. Com uma coluna sem largura no fim, a sobra tem onde ficar.

     Toda tabela da maquinaria precisa de uma. Em Movimentos e Usuarios ela e a coluna dos
     botoes, que ja nao tem largura; no Painel de Ativos foi preciso criar. */
  [['tabelaFluxo', /<th class="folga"><\/th>'\+/],
   ['tabelaMov',   /'<th><\/th><\/tr><\/thead><tbody>'\+/],
   ['tabelaUsuarios', /'<th><\/th><\/tr><\/thead><tbody>'\+/]].forEach(function (par) {
    ok(par[1].test(adm),
      par[0] + ': o cabeçalho termina numa coluna SEM largura, onde a sobra fica — sem ' +
      'ela o px pedido na aba Colunas não é o px que aparece, e esconder estica as outras');
  });
  ok(/colspan="'\+\(cs\.length\+1\)\+'"/.test(adm),
    'e a linha de "nada aqui" conta a folga no `colspan` — a menos, ela deixaria de ' +
    'ocupar a largura toda e o aviso apareceria torto');

  // o gesto da alcinha nao pode arrastar a coluna de lugar
  var ll = corpoDe('ligarLarguraColunas');
  ok(ll.indexOf("'dragstart'") > 0 && ll.indexOf('preventDefault') > 0,
    'a alcinha cancela o arrasto de posicao: sao dois gestos na mesma borda', ll.trim());
})();

/* ---------------------------------------------------------------------------
 * O saldo corrido vem PRONTO do servidor — a tela nao refaz a conta.
 *
 * Ela ja fez, e estava errado: recalculado sobre a lista FILTRADA, o saldo de uma linha
 * passava a ignorar tudo que o filtro escondia. Filtrando 17/09, a linha abria no saldo
 * de 15/09 e as movimentacoes do dia 16 sumiam da conta. O acumulado de uma linha depende
 * do que veio antes dela, inclusive de fora da janela — e so o servidor tem isso.
 * ------------------------------------------------------------------------- */
console.log('\n== o saldo corrido vem do servidor ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  ok(adm.indexOf('comSaldoCorrido') < 0,
    'a tela nao tem mais funcao de saldo corrido: quem corre a conta e o servidor');

  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));
  ok(/Q\.num\(l\.iniCorrido \|\| 0\)/.test(corpo),
    'a coluna Saldo inicial mostra o corrido que veio pronto');
  /* O Saldo final le o MESMO corrido, um passo adiante: inicial − saida + retorno. E o
     que faz a cadeia fechar — o final de uma linha e o inicial da de baixo, mais o que
     tiver sido lancado naquele dia. A formula esta testada no bloco proprio dela. */
  ok(/var fim = saldoFinalDaLinha\(l, gente\);/.test(corpo),
    'e o Saldo final vem do mesmo corrido — nas visões de gente, do saldo da pessoa');
  /* A FÓRMULA MORA NUM LUGAR SÓ. Ela estava copiada em três — a célula, a chave de
     ordenação e o cartão do extrato — e uma quarta leitura, a do déficit, usava outra.
     Foi assim que a tela passou a dizer uma coisa e a peneira outra. */
  ok((adm.match(/gente \? l\.saldo : l\.fimCorrido/g) || []).length === 1,
    'e a fórmula do Saldo final existe uma vez só, dentro do `saldoFinalDaLinha` — ' +
    'copiada, é uma das cópias que se esquece de atualizar',
    (adm.match(/gente \? l\.saldo : l\.fimCorrido/g) || []).length);

  var j = adm.indexOf("Q.csv('retornos'");
  var csv = adm.slice(adm.lastIndexOf('var cs =', j), adm.indexOf('}));', j));
  ok(csv.indexOf('iniCorrido') > 0,
    'o CSV usa os mesmos campos: numero diferente no arquivo e o pior dos casos');

  /* A conta em si esta testada no teste_api, sobre o historico inteiro — inclusive o
     caso que originou isto: filtrar um dia e a linha continuar abrindo no saldo certo. */
})();

/* ---------------------------------------------------------------------------
 * "Estoque": o que entrou NAQUELE dia, ao lado do acumulado do Saldo inicial.
 *
 * O Saldo inicial e o acumulado — tudo que ja entrou menos tudo que ja saiu. Sozinho ele
 * nao deixa ver o lancamento: a linha de 17/09 abria em 1.620 e nada na tela dizia que
 * 810 daquilo tinham acabado de ser lancados.
 *
 * E a simetria das colunas: toda coluna de fabrica precisa de DEFS, de largura e do par
 * titulo+valor no CSV. Uma coluna sem largura nao cai num padrao — com `table-layout:
 * fixed` ela recebe `width:undefinedpx` e some.
 * ------------------------------------------------------------------------- */
console.log('\n== a coluna "Estoque", e o peso visual das duas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));
  var defs = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('DEFS.quem.t'));

  /* --- o que a celula mostra --------------------------------------------- */
  /* O corpo da funcao se acha contando chaves. Recortar por `lastIndexOf('}')` pegava o
     fim do MAPA inteiro, e a funcao saia com as colunas seguintes dentro. */
  var v = defs.indexOf('v: function(l){', defs.indexOf('lancado:'));
  var a = defs.indexOf('{', v), b = a + 1, abertas = 1;
  while (abertas > 0 && b < defs.length) {
    if (defs[b] === '{') abertas++; else if (defs[b] === '}') abertas--;
    b++;
  }
  var f = defs.slice(a + 1, b - 1);
  ok(v > 0 && /l\.inicial/.test(f) && f.indexOf('lancado:') < 0,
    'o recorte pegou só o corpo da célula — sem isto o teste abaixo exercita outra coisa');
  var Q = { num: function (n) { return String(n); } };
  var celula = new Function('Q', 'l', f);

  var lancou = celula(Q, { estoqueInicial: true, inicial: 810, iniCorrido: 1620 });
  ok(lancou.indexOf('810') >= 0 && lancou.indexOf('1620') < 0,
    'o dia que teve lançamento mostra 810, o do dia — nunca o acumulado 1.620', lancou);

  /* Texto comum: nem cor nem negrito. O destaque e do Saldo inicial, ao lado — duas
     colunas de numero com o mesmo peso competem entre si e nenhuma conduz a leitura. */
  ok(!/val-ok|val-ruim|<b[ >]/.test(lancou),
    'em texto comum, sem cor e sem negrito — quem se destaca é o Saldo inicial', lancou);

  /* E o Saldo inicial e o oposto: negrito sempre. Sao a mesma decisao, entao ficam no
     mesmo teste — separadas, uma podia perder o contraste sem a outra notar. */
  var vi = defs.indexOf('v: function(l){', defs.indexOf('inicial:'));
  var va = defs.indexOf('{', vi), vb = va + 1, vn = 1;
  while (vn > 0 && vb < defs.length) {
    if (defs[vb] === '{') vn++; else if (defs[vb] === '}') vn--;
    vb++;
  }
  var celIni = new Function('Q', 'l', defs.slice(va + 1, vb - 1));

  /* O verde e so da linha de Estoque Inicial. Chegou a ser a coluna inteira, e ai nao
     distinguia nada: cor que aparece em todas as linhas deixa de ser sinal e vira fundo. */
  var estoque = celIni(Q, { iniCorrido: 1620, inicial: 810, estoqueInicial: true });
  ok(estoque.indexOf('1620') > 0 && /class="val val-ok"/.test(estoque),
    'na linha de Estoque Inicial o Saldo inicial sai em verde e negrito', estoque);

  var caminho = celIni(Q, { iniCorrido: 1620, inicial: 0, saida: 810 });
  ok(caminho.indexOf('1620') > 0 && /class="val"/.test(caminho) &&
     !/val-ok|val-ruim/.test(caminho),
    'nas demais linhas, negrito na cor normal — o verde marca onde a conta começa',
    caminho);

  /* O zero FICA. Ja se tentou travessao noutra coluna de valor e o usuario pediu os
     numeros de volta — buraco no meio da coluna se le como dado faltando. Cinza basta
     para o olho ir aos dias que tiveram entrada. */
  var semLancamento = celula(Q, { inicial: 0, iniCorrido: 1620, saida: 810 });
  ok(semLancamento.indexOf('0') > 0 && /fraco/.test(semLancamento) &&
     !/val-ok/.test(semLancamento),
    'dia sem lançamento mostra o zero, em cinza — o número fica, sem disputar atenção',
    semLancamento);

  /* --- simetria: nenhuma coluna pela metade ------------------------------- */
  /* A lista de fabrica mora dentro do descritor da tabela desde que a maquinaria passou
     a servir mais de uma. O recorte vai do `padrao:` ate o fecha-colchetes dele. */
  var ip = adm.indexOf('padrao: [', adm.indexOf('var TAB_ATIVOS'));
  var padrao = adm.slice(ip, adm.indexOf(']', ip));
  var cols = (padrao.match(/'(\w+)'/g) || []).map(function (t) { return t.slice(1, -1); });
  ok(cols.indexOf('lancado') > 0, 'a coluna esta na lista de fabrica', cols);
  var titAtivos = adm.slice(adm.indexOf('titulos: {', adm.indexOf('var TAB_ATIVOS')),
                            adm.indexOf('}', adm.indexOf('titulos: {', adm.indexOf('var TAB_ATIVOS'))));
  ok(/lancado:'Estoque'/.test(titAtivos), 'e o titulo dela é "Estoque"', titAtivos);

  var semDef = cols.filter(function (id) { return defs.indexOf('\n      ' + id + ':') < 0; });
  ok(semDef.length === 0, 'toda coluna de fábrica tem definição — sem ela o <td> sai vazio',
    semDef);

  /* As larguras de fabrica moram dentro do descritor da tabela. */
  var il = adm.indexOf('larg: {', adm.indexOf('var TAB_ATIVOS'));
  var larg = adm.slice(il, adm.indexOf('}', il));
  var semLarg = cols.filter(function (id) { return larg.indexOf(id + ':') < 0; });
  ok(semLarg.length === 0,
    'e toda coluna tem largura — `larguras()` só conhece as chaves declaradas na tabela, ' +
    'e com table-layout:fixed a que faltar recebe width:undefinedpx e some', semLarg);

  var j = adm.indexOf("Q.csv('retornos'");
  var csv = adm.slice(adm.lastIndexOf('var cs =', j), adm.indexOf('}));', j));
  var semCsv = cols.filter(function (id) {
    return id !== 'quem' && (csv.indexOf(id + ':') < 0 ||
                             csv.slice(csv.indexOf('var VAL')).indexOf(id + ':') < 0);
  });
  ok(semCsv.length === 0,
    'e vai ao CSV com titulo e valor: exportar e conferir na tela têm de bater', semCsv);
})();

/* ---------------------------------------------------------------------------
 * Recolher a barra de filtros — sem esconder que ha filtro ligado.
 *
 * O risco todo desta funcao e esse: a tabela mostra um recorte e o motivo fica invisivel,
 * e quem chega depois conclui que faltam lancamentos. Por isso o botao recolhido carrega a
 * CONTAGEM dos filtros ligados e troca de cor — deixa de ser um controle neutro e passa a
 * ser um aviso.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * Recolher o trilho — sem esconder qual grupo esta escolhido.
 *
 * O grupo peneira a tabela. Recolhido o trilho, ele sai da tela junto, e a pessoa fica
 * olhando quatro usuarios onde ha dezenas de linhas sem saber por que. Por isso o botao
 * passa a carregar o NOME do grupo, e so fica mudo em "Todas" — o estado em que nada esta
 * escondido.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * As abas do painel viram lista suspensa — sem mexer no app de campo.
 *
 * `Q.abas('#abas')` liga o trocador de pagina em TODO botao dentro de `#abas`, e a mesma
 * funcao e a mesma classe servem as duas telas. Duas armadilhas saem dai: um gatilho posto
 * dentro do <nav> viraria uma aba sem pagina, e um CSS solto em `.abas` levaria a barra do
 * celular junto.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * Classificar a tabela pelo titulo da coluna.
 *
 * O <th> ja arrastava de lugar e ja tinha alcinha de largura. Sao tres gestos na mesma
 * peca, e o teste cuida de que um nao dispare o outro.
 *
 * Classificar NAO recalcula nada: o saldo corrido de cada linha veio pronto do servidor,
 * preso a linha. O que se perde e a leitura de extrato — fora da ordem por data, o Saldo
 * final de uma linha deixa de ser o Saldo inicial da de baixo.
 * ------------------------------------------------------------------------- */
console.log('\n== classificar pelo titulo da coluna ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- toda coluna se descreve num lugar so ------------------------------- */
  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));
  var defs = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('DEFS.quem.t'));
  var ids = (defs.match(/^\s{6}(\w+):\s*\{/gm) || []).map(function (t) {
    return t.trim().split(':')[0];
  });
  ok(ids.length === 9, 'a leitura achou as nove colunas', ids);
  var semChave = ids.filter(function (id) {
    var bloco = defs.slice(defs.indexOf('\n      ' + id + ':'));
    bloco = bloco.slice(0, bloco.indexOf('v: function(l){'));
    return bloco.indexOf('k: function(l){') < 0;
  });
  ok(semChave.length === 0,
    'toda coluna diz por onde se classifica, junto da célula — em lista à parte, as duas ' +
    'divergiriam na primeira coluna nova', semChave);

  /* --- a comparacao, rodando ---------------------------------------------
     `semValor` entra junto: a resposta de "o que é vazio" saiu para uma função própria
     porque a ordenação precisa da MESMA pergunta, fora da inversão do decrescente. Duas
     definições de vazio divergiriam no dia em que zero ou `false` entrassem numa coluna. */
  var sv = adm.indexOf('function semValor(v)');
  var svFim = adm.indexOf('\n', sv);
  var c = adm.indexOf('function compararValores(x, y)');
  var k = adm.indexOf('{', c), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var cmp = new Function(adm.slice(sv, svFim) + adm.slice(c, k) +
                         '\n return compararValores;')();

  /* Numero como NUMERO. Comparado como texto, "1620" vem antes de "810" — e esse e o erro
     que ninguem confere, porque a coluna "parece ordenada". */
  ok(cmp(810, 1620) < 0 && cmp(1620, 810) > 0,
    'número se compara como número: como texto, 1.620 viria antes de 810',
    [cmp(810, 1620), cmp(1620, 810)]);
  ok(cmp(-80, 810) < 0, 'e negativo vem antes de positivo', cmp(-80, 810));
  ok(cmp('João Pessoa', 'Matriz Fazenda') < 0 && cmp('Ária', 'Azul') < 0,
    'texto se compara em português — senão "Ária" cairia depois de "Azul"',
    [cmp('João Pessoa', 'Matriz Fazenda'), cmp('Ária', 'Azul')]);

  /* Vazio para o fim nos DOIS sentidos: linha sem dado nao e a menor nem a maior, e no
     meio ela atrapalha a leitura das que tem. */
  ok(cmp('', 'x') > 0 && cmp('x', '') < 0 && cmp('', '') === 0,
    'vazio vai para o fim, e dois vazios empatam', [cmp('', 'x'), cmp('x', ''), cmp('', '')]);
  ok(cmp(null, 5) > 0 && cmp(undefined, 5) > 0, 'nulo e indefinido idem');

  /* --- os tres cliques ----------------------------------------------------
   * A REGRA VIROU UMA MÁQUINA SÓ, `trocarOrdem`, porque agora são DUAS tabelas que
   * classificam: o Painel de Ativos e Movimentos. Cada uma tem o estado dela — ordenar
   * uma não pode reordenar a outra —, mas a regra dos três cliques escrita duas vezes
   * divergiria no primeiro conserto que só uma recebesse.
   * Por isso a bancada exercita `trocarOrdem` direto, e não mais o invólucro de uma das
   * tabelas: é a máquina que precisa estar certa. */
  var f = adm.indexOf('function trocarOrdem(estado, col)');
  var k2 = adm.indexOf('{', f), a2 = 0;
  do {
    if (adm[k2] === '{') a2++; else if (adm[k2] === '}') a2--;
    k2++;
  } while (a2 > 0 && k2 < adm.length);
  var trocarOrdem = new Function(adm.slice(f, k2) + '\n return trocarOrdem;')();

  /* Uma FOTO a cada clique. Guardando a referencia do estado, os tres itens da lista
     apontariam para o mesmo objeto e mostrariam o valor final tres vezes — o teste
     passaria a comparar o ultimo passo com ele mesmo. */
  function ciclo() {
    var estado = { col: '', desc: false };
    return [1, 2, 3].map(function () {
      trocarOrdem(estado, 'saida');
      return estado.col + (estado.col ? (estado.desc ? ':desc' : ':asc') : '');
    });
  }
  ok(ciclo().join(' → ') === 'saida:asc → saida:desc → ',
    'três cliques na mesma coluna: crescente, decrescente, e de volta ao padrão — sem ' +
    'essa volta não haveria como recuperar a ordem de extrato sem recarregar', ciclo());

  var estado2 = { col: 'saida', desc: true };
  trocarOrdem(estado2, 'retorno');
  ok(estado2.col === 'retorno' && estado2.desc === false,
    'e trocar de coluna começa de novo no crescente', estado2);
  /* AS DUAS TABELAS PELA MESMA MÁQUINA, e cada uma com o estado dela: um estado só
     faria classificar Movimentos reordenar o Painel de Ativos por tabela. */
  ok(/function classificarPor\(col\)\{ trocarOrdem\(ORDEM_FLUXO, col\); desenharFluxo\(\); \}/.test(adm) &&
     /function classificarMovPor\(col\)\{ trocarOrdem\(ORDEM_MOV, col\); desenharMovimentos\(\); \}/.test(adm),
    'e as duas tabelas usam a MESMA máquina com estados separados — todo clique ' +
    'redesenha a tabela dele, e só a dele');

  /* --- os tres gestos no mesmo <th> --------------------------------------- */
  ok(/c\.d\.k \? 'ordenavel ' : ''/.test(corpo),
    'só a coluna com chave ganha a classe de clicável — as outras não prometem o que ' +
    'não fazem', corpo.slice(corpo.indexOf('<th draggable'), corpo.indexOf('<th draggable') + 300));
  /* O OUVINTE TAMBÉM VIROU UMA FUNÇÃO SÓ, `ligarOrdemColunas`, pela mesma razão da
     máquina acima: duas tabelas clicáveis, e a guarda do puxador escrita duas vezes
     seria esquecida numa delas. `ligarClassificacao` passou a ser a chamada dela para
     a tabela do Painel de Ativos. */
  var lc = adm.indexOf('function ligarOrdemColunas(alvo, aoClicar)');
  var ouv = adm.slice(lc, adm.indexOf('\n  }', lc));
  ok(/th\.ordenavel/.test(ouv) &&
     /ligarOrdemColunas\('#tabelaFluxo', classificarPor\);/.test(adm),
    'e o ouvinte só é ligado nelas');
  ok(/if \(e\.target\.classList\.contains\('puxador'\)\) return;/.test(ouv),
    'a alcinha de largura não classifica: soltar a borda dispara um clique no <th>');
  ok(/p\.addEventListener\('click', function\(e\)\{ e\.stopPropagation\(\); \}\);/.test(adm),
    'e o clique nela nem chega ao título');

  ok(/table\.fixa th\.ordenavel\{cursor:pointer;user-select:none\}/.test(css),
    'o cursor de mão marca o que é clicável, e a seleção de texto sai do caminho');
  ok(/table\.fixa th\.ordenado\{color:var\(--ambar-forte\)\}/.test(css),
    'e a coluna pela qual se classificou muda de cor');

  /* --- a ordem sai sobre uma COPIA ---------------------------------------- */
  /* A CÓPIA mora no `aplicarOrdem`, que as duas tabelas chamam. A lista vem de dentro
     do PAINEL ou de MOVS, e ordenar no lugar mudaria a ordem para quem a lê depois —
     inclusive o CSV, que tem a ordem própria dele. */
  ok(/return lista\.slice\(\)\.sort\(function\(a, b\)\{/.test(adm) &&
     /lista = aplicarOrdem\(lista, DEFS, ORDEM_FLUXO\);/.test(corpo),
    'ordena sobre uma cópia: a lista vem de dentro do PAINEL, e ordenar no lugar mudaria ' +
    'a ordem para quem a lê depois — inclusive o CSV, que tem a ordem própria dele');
  /* A ORDEM VEM ANTES DOS TOTAIS. As duas âncoras são a CHAMADA, e não a declaração:
     `aplicarOrdem` agora é compartilhada e vive lá em cima, e ancorar na declaração
     passaria a responder sobre a ordem em que as funções foram escritas — coisa que
     não diz nada sobre o que acontece quando a tabela é desenhada.
     `corpo` não serve aqui: ele termina no primeiro `\n  }`, e os totais ficam depois. */
  var iOrd = adm.indexOf('lista = aplicarOrdem(lista, DEFS, ORDEM_FLUXO);');
  var iTot = adm.indexOf('var t = totaisDe(lista);');
  ok(iOrd > 0 && iTot > iOrd,
    'e os totais são somados depois, sem se importar com a ordem — somar não depende dela',
    [iOrd, iTot]);

  /* Nao se guarda: e um recorte para responder uma pergunta, nao um jeito de trabalhar.
     A busca deixou de ser pela palavra `qdc_ordem` solta: a ordem dos FILTROS na barra
     lateral também é guardada, com uma chave que começa igual, e ela é outra coisa —
     arranjo da tela, e não recorte de leitura. O que não pode ser guardado é o estado
     da CLASSIFICAÇÃO, e é por ele que se pergunta agora. */
  ok(/var ORDEM_FLUXO = \{ col: '', desc: false \};/.test(adm) &&
     /var ORDEM_MOV = \{ col: '', desc: false \};/.test(adm) &&
     adm.indexOf('qdc_ordem_fluxo') < 0 && adm.indexOf('qdc_ordem_mov') < 0 &&
     !/setItem\([^)]*,\s*JSON\.stringify\(ORDEM_/.test(adm),
    'a classificação não fica guardada: a tela volta na ordem de extrato');
})();

console.log('\n== o app shell: navegacao na lateral, gaveta no celular ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var telas = {
    'index.html': fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
    'admin.html': fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
  };

  /* O esqueleto, igual nas duas telas. Uma so com shell e outra sem seria duas
     linguagens no mesmo produto: quem passa do app para o painel reaprende a navegar. */
  Object.keys(telas).forEach(function (arq) {
    var t = telas[arq];
    [['<div id="app" class="shell"', 'o invólucro do app shell'],
     ['<header class="topo">', 'a barra de app do celular'],
     ['<aside class="lateral" id="lateral">', 'a navegação lateral'],
     ['<div class="veu" id="veu"', 'o véu que escurece a página com a gaveta aberta'],
     ['<div class="cab-pagina">', 'o cabeçalho de página'],
     ['id="tituloPagina"', 'o título que diz onde se está'],
     ['<div class="corpo-pagina">', 'o corpo da página']
    ].forEach(function (par) {
      ok(t.indexOf(par[0]) > 0, arq + ': tem ' + par[1]);
    });
  });

  /* `.lateral`, e NAO `.barra`. `.barra` ja existia — e a barra de aging, `height:10px`,
     declarada mais abaixo no arquivo. Ela vencia por vir depois, e a lateral inteira era
     espremida a dez pixels: a navegacao, a rede e o rodape continuavam la, medindo
     certo, e transbordavam para fora de uma caixa de 10px. */
  ok(/\.lateral\{\s*width:var\(--lateral-larg\)/.test(css),
    'a lateral tem classe própria, e não `.barra` — `.barra` já é a barra de aging, com ' +
    '`height:10px`, e ela vencia por vir depois no arquivo');
  ok(/\.barra\{display:flex;height:10px/.test(css),
    'e a `.barra` de aging continua existindo, intacta — é ela que dá o nome ao conflito');
  Object.keys(telas).forEach(function (arq) {
    ok(telas[arq].indexOf('class="barra"') < 0,
      arq + ': e nenhum pedaço do shell usa `class="barra"`');
  });

  /* O contrato de dados NAO mudou: as paginas continuam sendo `<button data-pagina>`
     dentro de `#abas`, com `.ativa` na aberta. E o que `Q.abas()` liga e o que
     `ajustarAbasPainel()` esconde — trocar isso por `<a href>` levaria junto a peneira
     de permissao, calada. */
  Object.keys(telas).forEach(function (arq) {
    var t = telas[arq];
    var i = t.indexOf('<nav class="abas" id="abas"');
    var nav = t.slice(i, t.indexOf('</nav>', i));
    var botoes = (nav.match(/<button[^>]*data-pagina="/g) || []).length;
    var todas = (nav.match(/data-pagina="/g) || []).length;
    ok(i > 0 && botoes >= 3 && botoes === todas,
      arq + ': TODA página é um `<button data-pagina>` dentro de `#abas` — é o contrato ' +
      'que `Q.abas()` liga e que a peneira de permissão esconde. Uma só virar `<a>` já ' +
      'sai da peneira, calada', { botoes: botoes, comDataPagina: todas });
    /* Toda pagina da navegacao tem secao. Um `data-pagina` sem `<section>` abre a tela
       em branco, e o teste nao precisa de navegador para ver isso. */
    var faltando = [];
    (nav.match(/data-pagina="([a-zA-Z]+)"/g) || []).forEach(function (m) {
      var id = m.slice(13, -1);
      if (t.indexOf('id="' + id + '"') < 0) faltando.push(id);
    });
    ok(faltando.length === 0,
      arq + ': e cada página da navegação tem a sua seção — sem ela a aba abre em branco',
      faltando);
  });

  /* As portas para a OUTRA tela ficam FORA do <nav>. `Q.abas()` liga o trocador de
     pagina em todo botao de dentro: la dentro, a porta viraria uma aba sem pagina, e
     clicar nela apagaria a ativa e deixaria a tela em branco. */
  [['index.html', 'chipPainel'], ['admin.html', 'chipCampo']].forEach(function (par) {
    var t = telas[par[0]];
    var fimNav = t.indexOf('</nav>', t.indexOf('<nav class="abas"'));
    ok(fimNav > 0 && t.indexOf('id="' + par[1] + '"') > fimNav,
      par[0] + ': a porta para a outra tela fica FORA do <nav> — dentro dela viraria uma ' +
      'aba sem página, e clicar apagaria a ativa deixando a tela em branco');
  });

  /* O que o `app.js` escreve continua tendo onde morar. Estes tres ids sao escritos por
     `atualizarBadge()`, `Q.sair` e `Q.quemEsta()`: some um, e a funcao falha calada. */
  Object.keys(telas).forEach(function (arq) {
    ['chipRede', 'chipSair', 'cabUsuario'].forEach(function (id) {
      ok(telas[arq].indexOf('id="' + id + '"') > 0,
        arq + ': `#' + id + '` sobreviveu à mudança — o `app.js` escreve nele');
    });
  });

  /* UM corte, 1024px, e as duas pontas dele. Sem a de cima, a barra de app do celular
     aparece no desktop em cima de uma lateral que ja esta la. */
  ok(/@media \(min-width:1024px\)\{[^}]*\.topo\{display:none\}/.test(css.replace(/\s+/g, ' ')
      .replace(/@media \(min-width:1024px\)\{/g, '@media (min-width:1024px){')) ||
     /@media \(min-width:1024px\)\{\s*\.topo\{display:none\}/.test(css),
    'no desktop a barra de app some — a navegação já está fixa na lateral, e uma barra ' +
    'em cima dela repetiria o que se vê');
  /* O BLOCO ESTREITO QUE TRATA DA GAVETA, e não o primeiro do arquivo. O `indexOf`
     pegava qualquer `@media (max-width:1023.98px){`, e no dia em que outro apareceu
     antes dele a afirmação ficou vermelha por uma regra que não é a que ela cobra.
     Agora a busca parte da própria regra da lateral e volta até a abertura. */
  var iLat = css.indexOf('position:fixed;inset:0 auto 0 0;z-index:60');
  var iEstreito = iLat > 0 ? css.lastIndexOf('@media (max-width:1023.98px){', iLat) : -1;
  var estreito = iEstreito > 0 ? css.slice(iEstreito, css.indexOf('\n}', iLat)) : '';
  ok(iEstreito > 0 && /\.lateral\{[^}]*position:fixed/.test(estreito),
    'e no estreito a lateral vira gaveta — em fluxo, ela comeria a largura da tela');
  ok(/transform:translateX\(-100%\)/.test(estreito),
    'e nasce fora da tela: sem isto a gaveta fica aberta o tempo todo');
  ok(/body\.gaveta-aberta\{overflow:hidden\}/.test(estreito),
    'e com ela aberta a página atrás não rola — rolar o que está coberto move o que a ' +
    'pessoa não está vendo');

  /* A gaveta mora no `app.js`, e nao em cada tela: e a mesma gaveta nas duas, e duas
     copias divergem no primeiro ajuste. */
  ok(/function gaveta\(\)/.test(js) && /gaveta: gaveta/.test(js),
    'a gaveta mora no `app.js`, uma vez só para as duas telas');
  Object.keys(telas).forEach(function (arq) {
    ok(/Q\.gaveta\(\)/.test(telas[arq]), arq + ': e a tela liga a gaveta');
  });

  /* Tres coisas que a gaveta precisa fazer, e cada uma tranca alguem para fora se
     faltar. */
  ok(/e\.key === 'Escape' && gavetaAberta\(\)\) fecharGaveta\(\)/.test(js),
    'o Esc fecha a gaveta — e a busca é pela linha DA GAVETA: `Escape` aparece duas ' +
    'vezes no arquivo, e a outra fecha o modal');
  ok(/veu\.addEventListener\('click'/.test(js),
    'e clicar fora fecha também — véu que escurece sem fechar é uma tela travada');
  ok(/focusin/.test(js),
    'e o foco não escapa dela: sem isto quem navega por teclado abre um painel em que ' +
    'não consegue entrar');
  ok(/if \(mqLargo\.matches\) fecharGaveta\(false\)/.test(js),
    'e ao passar para o desktop o estado é limpo — a classe esquecida no `body` deixaria ' +
    'a página travada sem rolagem');

  /* Trocar de pagina fecha a gaveta: no celular ela cobre a tela, e deixa-la aberta
     esconderia justamente a pagina que a pessoa acabou de pedir. */
  var iAbas = js.indexOf('function abas(seletor)');
  var corpoAbas = js.slice(iAbas, js.indexOf('\n  }', js.indexOf('});', iAbas)));
  ok(iAbas > 0 && /fecharGaveta\(false\)/.test(corpoAbas),
    'escolher uma página fecha a gaveta — aberta, ela taparia a página recém-pedida');

  /* O titulo da pagina. No desktop a lateral ja diz onde se esta; no CELULAR a gaveta
     esta fechada, e sem o titulo a tela nao tem pista nenhuma. */
  ok(/function tituloDaPagina\(botao\)/.test(js) && /tituloDaPagina\(b\)/.test(corpoAbas),
    'e o título da página acompanha a troca — no celular a gaveta está fechada, e sem ' +
    'ele nada na tela diz que página está aberta');
  ok(/botao\.dataset\.titulo \|\| botao\.textContent/.test(js),
    'e o texto sai do próprio botão — uma lista de títulos à parte discordaria da ' +
    'navegação no primeiro rename');
})();

console.log('\n== a peneira de abas nunca devolve vazio ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function abasPermitidas(s)');
  var fonte = adm.slice(i, adm.indexOf('\n  }', i)) + '\n  }';
  var ABAS = [{ ID: 'pgRetornos', Nome: 'Painel de Ativos' },
              { ID: 'pgPainel', Nome: 'Painel' },
              { ID: 'pgLancar', Nome: 'Ajustes', sensivel: true },
              { ID: 'pgCadastros', Nome: 'Cadastros', sensivel: true },
              /* As duas que o PERFIL governa entram no catálogo de teste: é com elas
                 que o caso relatado acontece. */
              { ID: 'pgColunas', Nome: 'Colunas' },
              { ID: 'pgAparencia', Nome: 'Aparência' }];

  function pode(ehAdmin, marcadas) {
    /* `PAGINAS_DO_ADMIN` entra na bancada porque a peneira a LÊ. Nenhuma das abas de
       teste está nela, então as contas abaixo não mudam — o que muda é que a função
       roda em vez de estourar. */
    var fn = new Function('ABAS_PAINEL', 'Q', 'PAGINAS_DO_ADMIN',
      fonte + ' return abasPermitidas;')(
      ABAS, { ehAdmin: function () { return ehAdmin; } }, ['pgColunas', 'pgAparencia']);
    return fn({ abas: marcadas }).join(',');
  }

  ok(pode(false, []) === '',
    'sem marca, nenhuma aba — marcar é conceder', pode(false, []));
  ok(pode(true, []) === 'pgRetornos,pgPainel,pgLancar,pgCadastros,pgColunas,pgAparencia',
    'para o admin, todas — trancá-lo fora do próprio cadastro não teria como ser desfeito',
    pode(true, []));
  ok(pode(false, ['pgPainel']) === 'pgPainel',
    'com marca que alcança, vale a marca', pode(false, ['pgPainel']));

  /* ---- O CASO RELATADO: o grupo SISTEMA sumiu da tela ----
   *
   * A Aparência nasceu depois de as pessoas já terem abas marcadas no cadastro. Com
   * "marcar é conceder", página nova não está na marca de NINGUÉM — nem do
   * administrador. O botão dela ficava escondido, e como era o único do módulo, o
   * título SISTEMA sumia junto: da tela, o que se via é que o grupo tinha sido
   * removido.
   *
   * Para estas duas a marca nunca decidiu nada — o menu já escondia o botão do Colunas
   * para quem não é admin, marcado ou não. O que faltava era a peneira concordar com o
   * menu em vez de pedir uma senha para uma porta que o perfil já tinha trancado. */
  ok(pode(true, ['pgPainel']).split(',').indexOf('pgAparencia') >= 0,
    'o ADMIN com abas já marcadas enxerga a Aparência — página nova não está na marca ' +
    'de ninguém, e sem isto o módulo SISTEMA nasce vazio e o título some com ele',
    pode(true, ['pgPainel']));
  ok(pode(true, ['pgPainel']).split(',').indexOf('pgColunas') >= 0,
    'e o Colunas junto, pela mesma razão', pode(true, ['pgPainel']));
  /* E NÃO É "admin vê tudo": a marca continua mandando no resto. */
  ok(pode(true, ['pgPainel']).split(',').indexOf('pgCadastros') < 0,
    'e o resto continua valendo pela marca — o administrador pode se restringir de ' +
    'propósito, e continua podendo', pode(true, ['pgPainel']));
  /* DO OUTRO LADO: marcá-las para quem não é admin não abre nada, porque o menu esconde
     o botão de qualquer jeito. Conceder o caminho para uma porta trancada é pior que
     não oferecer — e a peneira agora diz a mesma coisa que o menu faz. */
  ok(pode(false, ['pgAparencia', 'pgPainel']) === 'pgPainel',
    'e marcá-las para quem não é admin não concede nada — a peneira passa a dizer o ' +
    'mesmo que o menu já fazia, em vez de conceder e o menu esconder depois',
    pode(false, ['pgAparencia', 'pgPainel']));

  /* O PEDIDO: o administrador concede qualquer aba a qualquer pessoa. */
  ok(pode(false, ['pgCadastros']) === 'pgCadastros',
    'e quem NÃO é admin recebe Cadastros se o administrador marcar — a trava por perfil ' +
    'saiu, quem decide é quem cadastra', pode(false, ['pgCadastros']));
  ok(pode(false, ['pgPainel', 'pgLancar']) === 'pgPainel,pgLancar',
    'e recebe Ajustes do mesmo jeito, junto com as comuns',
    pode(false, ['pgPainel', 'pgLancar']));

  /* MARCA QUEBRADA NAO CONCEDE NADA. Antes ela caia no padrao e a pessoa via tudo menos
     as sensiveis — coerente com a convencao de entao, e o oposto desta: uma marca que
     nao alcanca nada e uma marca que nao concede nada.

     Acontece quando a marca guarda o id de uma aba renomeada ou que saiu do app. Quem
     diz o que houve e a lateral, em `ajustarAbasPainel()`. */
  ok(pode(false, ['pgAntiga']) === '',
    'id de aba que não existe mais não concede nada — trocar marca quebrada por acesso ' +
    'amplo é o contrário do que o administrador pediu ao marcar',
    pode(false, ['pgAntiga']));
  ok(pode(false, ['pgAntiga']).indexOf('pgCadastros') < 0,
    'e muito menos as que dão poder: uma marca quebrada não pode virar a porta de ' +
    'entrada para o cadastro de usuários', pode(false, ['pgAntiga']));

  /* A escolha e deliberada, e o comentario diz por que. Sem o `\s+` a afirmacao depende
     de ONDE o comentario quebra de linha, e passa a falhar quando alguem so reescreve o
     paragrafo. Foi o que aconteceu uma vez. */
  ok(/marca que nao alcanca nada nao concede nada/.test(fonte.replace(/\s+/g, ' ')),
    'e o código registra a escolha: marca quebrada não concede', fonte.slice(-600));

  /* Uma peneira so, e nao duas. As duas regras — o padrao das sensiveis e a lista
     marcada — moram juntas de proposito: separadas, acabam discordando sobre a mesma
     aba. E nenhuma delas olha para o PERFIL: essa era a trava, e ela saiu. */
  ok((adm.match(/function abasPermitidas/g) || []).length === 1 &&
     /Q\.ehAdmin\(\)/.test(fonte) &&
     /marcadas\.map\(String\)\.indexOf/.test(fonte),
    'a peneira é uma só — a marca e a exceção do admin moram juntas. Separadas, acabam ' +
    'discordando sobre a mesma aba');
  ok(!/a\.soAdmin/.test(fonte),
    'e a trava por perfil não existe mais na peneira — era ela que impedia o ' +
    'administrador de conceder Cadastros a quem quisesse', fonte);
})();

console.log('\n== as abas de admin travam no cadastro ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- a caixa sabe travar item ------------------------------------------- */
  var i = adm.indexOf('function caixaLocais(');
  var fonte = adm.slice(i, adm.indexOf('\n  }', i)) + '\n  }';
  ok(/function caixaLocais\(id, rotulo, itens, marcados, vazio, trava\)/.test(fonte),
    'a caixa de marcar aceita uma trava por item');

  /* E a CHAMADA das abas passa uma. A bancada abaixo monta a sua propria trava, entao
     sozinha ela nao veria o dia em que o argumento sumisse da chamada real — e ai a caixa
     saberia travar sem nunca travar nada. */
  var chamada = adm.slice(adm.indexOf("caixaLocais('fAbas'"));
  chamada = chamada.slice(0, chamada.indexOf(')+'));
  ok(/a\.sensivel \? 'dá poder' : ''/.test(chamada),
    'e a chamada das abas marca as que dão poder — a etiqueta AVISA, e não trava: ' +
    'travar era o que o pedido tirou', chamada);

  var Q = { esc: function (v) { return String(v); }, ativo: function () { return true; } };
  var caixa = new Function('Q', fonte + ' return caixaLocais;')(Q);
  var ABAS = [{ ID: 'pgRetornos', Nome: 'Painel de Ativos' },
              { ID: 'pgLancar', Nome: 'Ajustes', sensivel: true },
              { ID: 'pgCadastros', Nome: 'Cadastros', sensivel: true }];
  var html = caixa('fAbas', 'Abas', ABAS, ['pgRetornos', 'pgLancar'], 'vazio',
                   function (a) { return a.sensivel ? 'dá poder' : ''; });

  ok((html.match(/data-trava="1"/g) || []).length === 2,
    'as duas que dão poder saem marcadas, e só elas',
    (html.match(/data-trava="1"/g) || []).length);
  ok((html.match(/dá poder/g) || []).length === 2,
    'e cada uma diz por que — a etiqueta fica ao lado do nome, avisando sem travar');

  /* A marca guardada CONTINUA la. Desmarcar apagaria uma escolha que volta a valer se o
     perfil mudar; sumir com a linha esconderia que a opcao existe, e e justamente ela que
     a pessoa procura quando estranha o que o painel do outro mostra. */
  var lancar = html.slice(html.indexOf('value="pgLancar"'));
  lancar = lancar.slice(0, lancar.indexOf('</label>'));
  ok(lancar.indexOf('checked') >= 0,
    'a marca já gravada continua visível: some-la apagaria uma escolha que volta a valer ' +
    'se o perfil mudar', lancar);
  var retornos = html.slice(html.indexOf('value="pgRetornos"'));
  retornos = retornos.slice(0, retornos.indexOf('</label>'));
  ok(retornos.indexOf('data-trava') < 0,
    'e a aba comum não trava', retornos);

  /* --- a trava acompanha o campo Perfil ----------------------------------- */
  var a = adm.indexOf('function ajustarPainel()');
  var k = adm.indexOf('{', a), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var corpoAjuste = adm.slice(a, k);
  var av = adm.indexOf('function avisar(id, texto)');
  var avk = adm.indexOf('{', av), avn = 0;
  do {
    if (adm[avk] === '{') avn++; else if (adm[avk] === '}') avn--;
    avk++;
  } while (avn > 0 && avk < adm.length);
  var corpoAvisar = adm.slice(av, avk);
  function recorta2(assinatura) {
    var i = adm.indexOf(assinatura);
    var k = adm.indexOf('{', i), n = 0;
    do { if (adm[k] === '{') n++; else if (adm[k] === '}') n--; k++; } while (n > 0);
    return adm.slice(i, k);
  }
  var corpoResumo = recorta2('function resumoDaLista()');
  var corpoAplicar = recorta2('function aplicarResumo(valor)');
  ok(corpoResumo.length > 120 && corpoAplicar.length > 120,
    'o recorte pegou o resumo e o aplicador', [corpoResumo.length, corpoAplicar.length]);
  ok(av > 0 && corpoAvisar.indexOf("'Aviso'") > 0,
    'o recorte pegou o escritor de avisos', corpoAvisar.length);
  /* A trava por PERFIL saiu a pedido: o administrador concede qualquer aba a qualquer
     pessoa. O que sobrou e o desabilitar por INATIVA, que vale para todas. */
  ok(/#fAbas input\[data-trava\]/.test(corpoAjuste) &&
     /ch\.disabled = !ativo/.test(corpoAjuste) &&
     !/ch\.disabled = !ehAdmin/.test(corpoAjuste),
    'as abas que dão poder não travam mais por perfil — quem decide é o administrador, ' +
    'e o que resta é o desabilitar de quem está inativa', corpoAjuste.slice(-400));

  /* --- as TRES pre-condicoes do formulario -------------------------------- */
  /* A varredura das permissoes mostrou que nenhuma corrente esta quebrada entre o
     formulario e a tela: tudo o que se marca, o servidor grava, a sessao carrega e alguma
     tela usa. O erro estava no formulario, que aceitava tres combinacoes INERTES:

       - abas marcadas com "Pode entrar no painel?" em NAO;
       - qualquer permissao para quem esta inativo;
       - acesso ao painel ligado para quem nao tem SENHA de painel.

     Marca que nao faz nada e pior do que marca ausente: ela diz que fez, e quem marcou
     vai embora achando que resolveu. Foi o que aconteceu com cinco abas marcadas para
     alguem que nao entrava no painel.

     A bancada roda o corpo de `ajustarPainel` de verdade, com um DOM de mentira. */
  function bancada(o) {
    o = o || {};
    /* Quem esta marcado na lista de "de quem ela ve os lancamentos". */
    var vistos = (o.vistos || []).map(String);
    var caixasVistos = ['U008', 'U005', 'U001'].map(function (id) {
      return { value: id, checked: vistos.indexOf(id) >= 0, disabled: false,
               dataset: {}, parentNode: { classList: { toggle: function () {} } } };
    });
    var opEscolhidos = { hidden: false };
    var abas = [{ disabled: false, checked: o.marcouPoder === true, dataset: { trava: '1' },
                  parentNode: { classList: { toggle: function () {} } } },
                { disabled: false, checked: false, dataset: {},
                  parentNode: { classList: { toggle: function () {} } } }];
    var classe = {};
    var avisos = {};
    function lista(id) {
      return { classList: { toggle: function (c, v) { classe[id] = !!v; } },
               querySelectorAll: function () {
                 if (id === 'fAbas') return abas;
                 if (id === 'fUsuariosVistos') return caixasVistos;
                 return [];
               } };
    }
    /* O elemento de aviso de cada quadro, com o mesmo nome que a tela usa. */
    ['fAbas', 'fOperacoes', 'fSaidas', 'fDestinos', 'fTiposCaixa', 'fMotoristas']
      .forEach(function (q) { avisos[q] = { textContent: '', hidden: true }; });
    var els = {
      fPainel: { disabled: false, value: o.painel === false ? 'NAO' : (o.painel || 'TODOS'),
                 querySelector: function () { return opEscolhidos; } },
      fAtivo: { value: o.ativo === false ? 'NAO' : 'SIM' },
      fSenha: { value: o.senhaDigitada || '' },
      fPainelNota: { textContent: '' }, fAbasNota: { textContent: '' },
      fAtivoNota: { textContent: '' }, fPerfilNota: { textContent: '' },
      fAbas: lista('fAbas'), fOperacoes: lista('fOperacoes'), fSaidas: lista('fSaidas'),
      fDestinos: lista('fDestinos'), fTiposCaixa: lista('fTiposCaixa'),
      fMotoristas: lista('fMotoristas'),
      fVerLanc: { value: o.verLanc === false ? 'NAO' : 'SIM', disabled: false },
      /* A lista de "de quem", com tres pessoas: ela mesma (U008) e duas outras. E o
         minimo para distinguir os tres resumos — todos, so ela, escolhidos. */
      fVerLancNota: { textContent: '' }, fVistosNota: { textContent: '' },
      fUsuariosVistos: lista('fUsuariosVistos'),
      fUsuariosVistosAviso: (avisos.fUsuariosVistos = { textContent: '', hidden: true }),
      fAbasAviso: avisos.fAbas, fOperacoesAviso: avisos.fOperacoes,
      fSaidasAviso: avisos.fSaidas, fDestinosAviso: avisos.fDestinos,
      fTiposCaixaAviso: avisos.fTiposCaixa, fMotoristasAviso: avisos.fMotoristas
    };
    var botoes = [{ disabled: false }];
    /* Um botao POR QUADRO, e nao um so para todos: com um unico objeto, destravar o
       "marcar todos" de um quadro destravava o do outro, e a bancada dizia que a trava
       das abas tinha sido desfeita quando na tela ela nao e. */
    var botaoDe = {};
    var doc = {
      getElementById: function (id) { return els[id] || null; },
      querySelectorAll: function (sel) {
        if (sel.indexOf('data-trava') > 0) return abas;
        if (sel.indexOf('data-marcatudo') >= 0) return botoes;
        return [];
      },
      querySelector: function (sel) {
        var m = /data-marcatudo="(\w+)"/.exec(sel || '');
        var chave = m ? m[1] : 'qualquer';
        if (chave === 'fAbas') return botoes[0];
        return botaoDe[chave] || (botaoDe[chave] = { disabled: false });
      }
    };
    new Function('document', 'perfilDigitado', 'PERFIS', 'COM_PODER', 'TEM_SENHA_PAINEL',
      'u', 'lerMarcados',
      corpoAvisar + '\n' + corpoResumo + '\n' + corpoAplicar + '\n' + corpoAjuste +
      '\n ajustarPainel();' +
      '\n if (arguments[7]) aplicarResumo(arguments[7]);')(
      doc, function () { return o.perfil || 'Gerente'; }, ['Gerente'], { ADMIN: 'x' },
      o.temSenha === true, { ID: 'U008' },
      function () {
        return caixasVistos.filter(function (c) { return c.checked; })
          .map(function (c) { return c.value; });
      },
      o.escolher);
    return {
      travadas: abas.filter(function (c) { return c.disabled; }).length,
      notaAbas: els.fAbasNota.textContent,
      notaPainel: els.fPainelNota.textContent,
      notaAtivo: els.fAtivoNota.textContent,
      abasBloqueadas: !!classe.fAbas,
      saidasBloqueadas: !!classe.fSaidas,
      marcarTudo: botoes[0].disabled,
      avisoAbas: avisos.fAbas.hidden ? '' : avisos.fAbas.textContent,
      avisoSaidas: avisos.fSaidas.hidden ? '' : avisos.fSaidas.textContent,
      vistosBloqueados: !!classe.fUsuariosVistos,
      avisoVistos: avisos.fUsuariosVistos && !avisos.fUsuariosVistos.hidden
        ? avisos.fUsuariosVistos.textContent : '',
      notaVer: els.fVerLancNota.textContent,
      notaVistos: els.fVistosNota.textContent,
      seletor: els.fPainel.value,
      escolhidosVisivel: !opEscolhidos.hidden,
      marcadosDepois: caixasVistos.filter(function (c) { return c.checked; })
        .map(function (c) { return c.value; }).join(',')
    };
  }

  /* --- a trava de admin, que ja existia ----------------------------------- */
  /* Nem para um Gerente nem para um Admin: ninguem trava mais por perfil. A nota diz o
     que muda — que as que dao poder ficam fora do padrao. */
  var ger = bancada({ perfil: 'Gerente', temSenha: true });
  ok(ger.travadas === 0 && /marcar é conceder/.test(ger.notaAbas),
    'para um Gerente nenhuma aba trava, e a nota diz que as que dão poder só entram por ' +
    'marca', ger);
  var adm2 = bancada({ perfil: 'Admin', temSenha: true });
  ok(adm2.travadas === 0,
    'e para um Admin também não', adm2);

  /* Marcar uma aba que da poder AVISA o que aquilo da. A trava saiu; o aviso e o que
     ficou no lugar dela, e sem ele conceder Cadastros e um clique igual aos outros. */
  var comPoder = bancada({ perfil: 'Gerente', temSenha: true, marcouPoder: true });
  ok(/ATENÇÃO/.test(comPoder.notaAbas) && /criar e editar usuários/.test(comPoder.notaAbas),
    'marcar uma aba que dá poder avisa o que ela permite — sem isso conceder Cadastros ' +
    'é um clique igual aos outros, e ele deixa a pessoa se tornar administradora',
    comPoder.notaAbas);
  ok(!/ATENÇÃO/.test(ger.notaAbas),
    'e o aviso só aparece quando alguma está marcada — sempre aceso, vira paisagem');

  /* --- o atalho do seletor, e a lista --------------------------------------- */
  /* O seletor voltou a oferecer "apenas os lancamentos dele mesmo", a pedido. Ele e um
     ATALHO: escreve na MESMA lista de quem, e le dela. As duas direcoes sao mantidas em
     dia, entao as duas nao podem discordar — que e o risco de ter dois controles para a
     mesma coisa. */
  /* "TODOS" passou a ser a lista CHEIA, e nao a vazia. Com marcar-e-conceder, vazia
     quer dizer NINGUEM — e o seletor tem de dizer o que a lista de fato faz, senao ele
     e o proximo lugar a mentir sobre a marcacao. */
  var selVazio = bancada({ perfil: 'Gerente', temSenha: true, vistos: [] });
  ok(selVazio.seletor === 'ESCOLHIDOS',
    'lista vazia não é mais "todos": ela é a lista, e está vazia', selVazio.seletor);
  var selTodos = bancada({ perfil: 'Gerente', temSenha: true,
                           vistos: ['U001', 'U005', 'U008'] });
  ok(selTodos.seletor === 'TODOS',
    'e "vê os lançamentos de todos" é a lista CHEIA — com todo mundo marcado',
    selTodos.seletor);
  var selEu = bancada({ perfil: 'Gerente', temSenha: true, vistos: ['U008'] });
  ok(selEu.seletor === 'EU',
    'lista só com ela: o seletor diz "apenas os dele mesmo" — é o atalho que o usuário ' +
    'pediu de volta', selEu.seletor);
  var selVarios = bancada({ perfil: 'Gerente', temSenha: true, vistos: ['U008', 'U005'] });
  ok(selVarios.seletor === 'ESCOLHIDOS',
    'lista com mais gente: o seletor diz "de pessoas escolhidas" — sem esse quarto ' +
    'estado ele teria de mentir sobre a lista', selVarios.seletor);

  /* A quarta opcao so existe quando e o caso. Sempre visivel, ela ofereceria um estado
     que a lista nao esta, e escolhe-la nao faria nada. */
  ok(selVarios.escolhidosVisivel && !selEu.escolhidosVisivel && !selTodos.escolhidosVisivel,
    'e essa quarta opção só aparece quando a lista realmente diz isso',
    { varios: selVarios.escolhidosVisivel, eu: selEu.escolhidosVisivel,
      todos: selTodos.escolhidosVisivel });

  /* E a direcao contraria: escolher no seletor MEXE na lista. */
  var mexeuTodos = bancada({ perfil: 'Gerente', temSenha: true, vistos: ['U008'],
                             escolher: 'TODOS' });
  ok(mexeuTodos.marcadosDepois.split(',').filter(Boolean).length >= 3,
    'escolher "todos" MARCA todo mundo — antes ele limpava, porque vazio queria dizer ' +
    'todos; agora vazio quer dizer ninguém, e limpar seria o oposto do rótulo',
    mexeuTodos.marcadosDepois);
  var mexeuEu = bancada({ perfil: 'Gerente', temSenha: true, vistos: ['U005', 'U001'],
                          escolher: 'EU' });
  ok(mexeuEu.marcadosDepois === 'U008',
    'e escolher "apenas ele mesmo" marca só ela, e desmarca o resto',
    mexeuEu.marcadosDepois);
  var mexeuEscolhidos = bancada({ perfil: 'Gerente', temSenha: true, vistos: ['U005'],
                                  escolher: 'ESCOLHIDOS' });
  ok(mexeuEscolhidos.marcadosDepois === 'U005',
    'e "de pessoas escolhidas" não mexe: aí quem manda é a lista',
    mexeuEscolhidos.marcadosDepois);

  /* --- 1. abas sem o painel: O CASO QUE ACONTECEU ------------------------- */
  var semPainel = bancada({ perfil: 'Conferente', painel: false, temSenha: true });
  ok(semPainel.abasBloqueadas && semPainel.travadas === 2,
    'com "Pode entrar no painel?" em NÃO, as abas ficam TRAVADAS — foi assim que cinco ' +
    'abas acabaram marcadas para quem não chega ao painel, e nada na tela dizia por quê',
    semPainel);
  ok(/Ligue "Pode entrar no painel\?"/.test(semPainel.notaAbas) &&
     /não faz efeito/.test(semPainel.notaAbas),
    'e a nota diz QUAL chave ligar, não só que está bloqueado', semPainel.notaAbas);
  ok(semPainel.marcarTudo === true,
    'e o "marcar todos" das abas também desliga — senão ele reintroduziria em um clique ' +
    'tudo o que a trava acabou de recusar');

  var comPainel = bancada({ perfil: 'Conferente', painel: true, temSenha: true });
  ok(!comPainel.abasBloqueadas && /marcar é conceder/.test(comPainel.notaAbas),
    'e ligando a chave, as abas voltam a valer na hora', comPainel);

  /* --- 2. inativo: NENHUMA permissao vale --------------------------------- */
  var inativo = bancada({ perfil: 'Conferente', ativo: false, temSenha: true });
  ok(inativo.saidasBloqueadas && inativo.abasBloqueadas,
    'quem está INATIVO tem todos os quadros travados: ela não entra em lugar nenhum, ' +
    'então nenhuma permissão vale', inativo);
  ok(/Inativo/.test(inativo.notaAtivo) && /nenhuma permissão/.test(inativo.notaAtivo),
    'e a nota diz isso onde a pessoa está olhando', inativo.notaAtivo);

  /* --- 3. acesso ligado sem senha de painel ------------------------------- */
  /* O painel entra por SENHA; o PIN de seis numeros e do app de campo. Liberar o acesso
     sem senha e ligar uma chave para uma porta que continua recusando. */
  var semSenha = bancada({ perfil: 'Conferente', painel: true, temSenha: false });
  ok(/NÃO tem senha do painel/.test(semSenha.notaPainel),
    'ligar o acesso para quem não tem senha de painel avisa na hora — sem isso a chave ' +
    'fica ligada e o login recusa, e ninguém entende por quê', semSenha.notaPainel);
  ok(/PIN de seis números é do app de campo/.test(semSenha.notaPainel),
    'e diz por que o PIN do app não serve — é a confusão natural entre as duas senhas');
  var digitou = bancada({ perfil: 'Conferente', painel: true, temSenha: false,
                          senhaDigitada: 'nova123' });
  ok(!/NÃO tem senha/.test(digitou.notaPainel),
    'e o aviso some assim que uma senha é digitada, sem precisar salvar para descobrir',
    digitou.notaPainel);

  /* --- os gatilhos -------------------------------------------------------- */
  /* Faltando um, a tela mente justamente no instante em que a pessoa mexe naquele campo.
     Foi o `fPainel` que faltou: ele mudava e as abas seguiam marcáveis e mudas. */
  [['fPerfil', 'input'], ['fAtivo', 'change'], ['fSenha', 'input'], ['fVerLanc', 'change']]
    .forEach(function (par) {
      var re = new RegExp("getElementById\\('" + par[0] + "'\\)\\.addEventListener\\('" +
                          par[1] + "', ajustarPainel\\)");
      ok(re.test(adm),
        'o campo ' + par[0] + ' reavalia as pré-condições (`' + par[1] + '`) — sem isso a ' +
        'tela mente no instante em que a pessoa mexe nele');
    });
  /* O `fPainel` tem corpo proprio porque ele MEXE na lista antes de reavaliar: e o atalho
     escrevendo no que o quadro de baixo mostra. */
  ok(/getElementById\('fPainel'\)\.addEventListener\('change', function\(\)\{/.test(adm) &&
     /aplicarResumo\(this\.value\);[\s\S]{0,120}ajustarPainel\(\);/.test(adm),
    'e o seletor do painel mexe na lista e SÓ ENTÃO reavalia — na outra ordem, o ajuste ' +
    'leria a lista velha e o rótulo voltaria sozinho ao estado anterior');
  /* A GUARDA junto: `if (false) caixaVistosEl.addEventListener(...)` deixa o texto do
     ouvinte intacto e nao liga nada. Procurar so o `addEventListener` nao distingue os
     dois — foi assim que esta afirmacao passou sabotada. */
  ok(/if \(caixaVistosEl\) caixaVistosEl\.addEventListener\('change', ajustarPainel\)/
      .test(adm),
    'e mexer na lista reavalia o seletor, com a guarda que de fato liga o ouvinte — ' +
    'sem isso, marcar um terceiro nome deixava o rótulo dizendo "apenas ele mesmo" ' +
    'sobre uma lista de três');

  /* --- ver lancamentos: o interruptor manda na lista --------------------- */
  var comLanc = bancada({ perfil: 'Conferente', temSenha: true });
  ok(!comLanc.vistosBloqueados && /Nada marcado = <b>ninguém<\/b>/.test(comLanc.notaVistos),
    'com "Vê os lançamentos?" em SIM, a lista de quem fica livre', comLanc);
  var semLanc = bancada({ perfil: 'Conferente', temSenha: true, verLanc: false });
  ok(semLanc.vistosBloqueados,
    'e em NÃO ela trava — não há de quem ver, e deixar marcar ali seria oferecer uma ' +
    'escolha sem efeito', semLanc);
  ok(/Vê os lançamentos\?" está em NÃO/.test(semLanc.avisoVistos || ''),
    'e o motivo aparece dentro do quadro', semLanc.avisoVistos);
  ok(/some do app dela/.test(semLanc.notaVer),
    'e o interruptor diz o que acontece na tela dela', semLanc.notaVer);

  /* A ORDEM dentro de `ajustarPainel` importa, e foi ela que falhou na primeira versao:
     o laco que destrava os quadros quando a pessoa esta ativa roda DEPOIS, e desfazia a
     trava desta lista. Medido na epoca: 3 de 3 continuavam clicaveis com o interruptor
     em NAO. Entao a afirmacao e sobre a posicao. */
  var iLaco = corpoAjuste.indexOf("var quadros = ['fAbas'");
  var iTrava = corpoAjuste.indexOf("caixaVistos.classList.toggle('bloqueada'");
  ok(iLaco > 0 && iTrava > 0 && iTrava > iLaco,
    'a trava da lista vem DEPOIS do laço que destrava os quadros — antes dele, o laço a ' +
    'desfaz e o interruptor não trava nada', { laco: iLaco, trava: iTrava });

  ok(/\.marcalista\.bloqueada\{opacity/.test(css),
    'e o quadro bloqueado fica apagado — apagado, e não sumido: sumir esconderia que a ' +
    'permissão existe, e é justamente ela que a pessoa procura');

  /* --- o motivo tem de estar ACIMA da lista ------------------------------- */
  /* A trava funcionava e mesmo assim o cadastro parecia quebrado: o motivo estava numa
     nota DEPOIS da lista, e a lista rola em 210px. Medido, a nota caía 226px abaixo do
     topo — ou seja, fora da caixa. Quem abria o cadastro via um quadro morto e nenhuma
     razão, e a leitura natural foi "inativou tudo".

     A ordem no HTML é o que decide isso, então é a ordem que a afirmação olha. */
  var caixaFonte = adm.slice(adm.indexOf('function caixaLocais('),
                             adm.indexOf('function ligarMarcaTudo('));
  var posAviso = caixaFonte.indexOf("'Aviso\" hidden>");
  var posLista = caixaFonte.indexOf('<div class="marcalista"');
  ok(posAviso > 0 && posLista > 0 && posAviso < posLista,
    'o aviso da trava vem ANTES da lista — depois dela ele cai fora da caixa que rola, ' +
    'e um motivo invisível não explica nada', { aviso: posAviso, lista: posLista });
  ok(/\.aviso-trava\{/.test(css) && /\[hidden\]\{display:none!important\}/.test(css),
    'e tem estilo próprio, inclusive o `hidden` — sem essa regra a faixa vazia ocuparia ' +
    'espaço em todo quadro destravado');

  /* E o texto dele diz QUAL chave ligar, e nao so "bloqueado". */
  ok(/Pode entrar no painel\?" está em NÃO/.test(semPainel.avisoAbas),
    'o aviso dentro do quadro nomeia a chave que falta', semPainel.avisoAbas);
  ok(comPainel.avisoAbas === '',
    'e some quando a chave é ligada, em vez de ficar uma faixa vazia');
  ok(/INATIVA/.test(inativo.avisoSaidas) && /INATIVA/.test(inativo.avisoAbas),
    'com a pessoa inativa, TODOS os quadros dizem o motivo — não só o das abas, porque ' +
    'é em cada quadro que a pessoa está olhando quando estranha', inativo.avisoSaidas);

  /* --- "marcar todos" nao pode desfazer a trava --------------------------- */
  ok(/input\[type=checkbox\]:not\(:disabled\)/.test(adm),
    '"marcar todos" pula as travadas: reintroduzir a marca que a caixa recusa seria o ' +
    'formulário se contradizendo em dois cliques');

  ok(/\.marca\.travada\{opacity/.test(css),
    'e a linha travada fica apagada — apagada, e não sumida: sumir esconderia que a ' +
    'opção existe');
})();

/* ---------------------------------------------------------------------------
 * A tabela de Movimentos ganha mover, esconder e redimensionar coluna.
 *
 * A MESMA maquinaria do Painel de Ativos, recebendo outra tabela — nao uma copia. Duas
 * copias de arrastar-e-soltar divergem no primeiro conserto que so uma recebe, e o
 * sintoma e mudo: a tabela que ficou para tras apenas para de obedecer.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * OS SEIS TOTAIS DO RECORTE, em Movimentos.
 *
 * A tabela responde "o que aconteceu"; os cartões respondem "quanto deu". Antes era
 * preciso exportar o CSV e somar na planilha para saber quanto saiu no filtro que se
 * acabou de aplicar.
 *
 * O que estas afirmações guardam não é a aparência — é a CONTA fechar e os números
 * virem do MESMO lugar que a tabela. Dois totais diferentes na mesma tela é o defeito
 * que ninguém consegue explicar depois.
 * ------------------------------------------------------------------------- */
console.log('\n== os seis totais do recorte, em Movimentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  ok(/<div class="tot" id="totMov"><\/div>/.test(adm) &&
     adm.indexOf('id="totMov"') < adm.indexOf('id="tabelaMov"'),
    'os totais existem e ficam ACIMA da tabela — embaixo, seria preciso rolar a lista ' +
    'inteira para chegar no total dela');

  /* --- SEM TÍTULO DENTRO DO QUADRO ----------------------------------------
   * O cabeçalho da página já diz "Consulta · Movimentos". Um título repetido três
   * centímetros abaixo do outro não informa — só empurra a tabela para baixo, e esta é
   * a tela que menos pode fazer isso: ela divide a altura com seis cartões e cinco
   * gráficos. Medido: tudo subiu 49px, e numa janela de 800 os gráficos passaram a
   * aparecer INTEIROS, contra 92% antes.
   *
   * E O SUBTÍTULO ESTAVA VELHO: definia "Divergência", que deixou de ser coluna desta
   * tabela quando a etapa de conferência saiu. Explicar um campo que não está na tela é
   * pior que não explicar nada — manda procurar o que não existe. */
  var iSec = adm.indexOf('<section id="pgMovimentos"');
  /* SEM OS COMENTÁRIOS: o comentário que explica a remoção CITA o texto removido, e a
     afirmação passou a ser respondida pela própria justificativa dela. `semComentarios`
     não trata comentário de HTML, então este corte é feito aqui. */
  var secMov = adm.slice(iSec, adm.indexOf('</section>', iSec))
    .replace(/<!--[\s\S]*?-->/g, '');
  ok(secMov.indexOf('<h2>') < 0,
    'a tela de Movimentos não repete o próprio nome dentro do quadro — o cabeçalho da ' +
    'página já o diz, e o espaço vai para os gráficos');
  ok(secMov.indexOf('Divergência =') < 0,
    'e o subtítulo que definia Divergência saiu com ele: a coluna não existe mais nesta ' +
    'tabela, e explicar um campo ausente manda procurar o que não está lá');
  /* MAS A DEFINIÇÃO NÃO SE PERDEU: ela continua onde a coluna continua viva. */
  ok(/<th class="num">Divergência<\/th>/.test(adm),
    'e a coluna Divergência continua no Extrato, que é onde ela existe');

  /* O MESMO `MOVS` QUE DESENHA A TABELA. Um número vindo de outra consulta discordaria
     da lista logo abaixo dele, e quem visse os dois não saberia em qual acreditar. */
  var i0 = adm.indexOf('function desenharMovimentos()');
  var dm = adm.slice(i0, adm.indexOf('\n  }', i0));
  /* A LISTA DEIXOU DE SER `MOVS` CRU: a busca do celular peneira antes, e `L` é o
     resultado. A garantia não mudou — uma lista só alimenta os cartões, os gráficos, a
     tabela e os cartões do celular. Peneirando só a lista, os números continuariam
     mostrando o recorte inteiro ao lado de três linhas, que é a contradição mais cara
     de explicar que esta tela pode ter. Esta afirmação pedia o NOME `MOVS` e reprovou
     sem nada ter piorado. */
  ok(/var L = peneirarMov\(MOVS \|\| \[\]\);/.test(dm) &&
     /desenharTotaisMov\(L\);/.test(dm),
    'e são recalculados da lista já peneirada pela busca, a mesma que desenha a tabela');
  ok(/desenharGraficosMov\(L\);/.test(dm),
    'e os gráficos recebem essa MESMA lista — dois recortes na mesma tela dariam dois ' +
    'totais para o mesmo filtro');

  /* --- A BUSCA DO CELULAR -------------------------------------------------
   * SEM ACENTO E SEM MAIÚSCULA DOS DOIS LADOS. Quem digita "joao" no teclado do celular
   * espera achar "João", e quem digita "JOÃO" também. Dobrar a regra só de um lado é o
   * erro clássico: a busca acha metade e a pessoa conclui que o lançamento sumiu. */
  /* O EXTRATOR É LOCAL a este bloco: há um `corpoDe` mais abaixo no arquivo, noutro
     escopo, e usá-lo daqui derruba a suíte inteira com "not a function" — que é uma
     QUEBRA, não uma reprovação, e esconde as afirmações que vinham depois. */
  var corpoDaFn = function (nome) {
    var i = adm.indexOf('function ' + nome + '(');
    if (i < 0) return '';
    var d = 0, k = adm.indexOf('{', i);
    for (; k < adm.length; k++) {
      if (adm[k] === '{') d++;
      else if (adm[k] === '}' && --d === 0) return adm.slice(i, k + 1);
    }
    return '';
  };
  var fChato = corpoDaFn('chato');
  ok(/normalize\('NFD'\)/.test(fChato) && /toLowerCase\(\)/.test(fChato),
    'a busca tira acento E maiúscula dos dois lados — "joao" acha "João", e o ' +
    'contrário também', fChato.slice(0, 140));

  /* ELA OLHA O QUE O CARTÃO MOSTRA, e não todos os campos do movimento: achar por um
     campo que não está na tela devolve linha que a pessoa não reconhece. */
  var fAlvo = corpoDaFn('alvoDaBusca');
  ['origem', 'destino', 'motorista', 'usuario', 'tipoCaixa'].forEach(function (c) {
    ok(fAlvo.indexOf('m.' + c) >= 0,
      'e ela procura em ' + c + ', que é o que o cartão mostra', fAlvo.slice(0, 120));
  });
  ok(/Q\.dataBR\(m\.dataRef\)/.test(fAlvo),
    'e na data COMO SE LÊ, não só na forma do banco — ninguém digita 2026-09-17');

  /* --- A TARJA DO DIA ----------------------------------------------------
   * A LINHA DE GRUDE NÃO É O TOPO DA CAIXA. `.corpo-pagina` tem respiro no topo, e
   * `position:sticky` encaixa a tarja NELE. Medindo contra o topo puro, a marca acendia
   * na tarja que já tinha subido além do encaixe — o dia ANTERIOR ao que estava preso.
   * Medido: com 800px de rolagem, a presa era 16/09 e a acesa continuava 17/09. */
  var fMarcar = corpoDaFn('marcarDiaMov');
  ok(/getComputedStyle\(caixa\)\.paddingTop/.test(fMarcar),
    'a marca da tarja conta a partir do respiro da área que rola, e não do topo puro — ' +
    'medido, com o topo puro ela acendia um dia atrás do que está preso na tela');
  ok(/querySelector\('\.corpo-pagina'\)/.test(fMarcar),
    'e quem rola é `.corpo-pagina`, não a janela — um ouvinte na janela não receberia ' +
    'evento nenhum e a marca ficaria parada na primeira tarja');
  ok(/scrollTop \+ caixa\.clientHeight >= caixa\.scrollHeight/.test(fMarcar),
    'e no fim da lista a última acende mesmo sem alcançar o encaixe — com um grupo ' +
    'curto a rolagem acaba antes, e o dia que se está lendo jamais acenderia');

  /* OS TOTAIS DO DIA SAEM DAS LINHAS, não dos lotes: um lote tem várias linhas de
     caixa, e somar o lote uma vez perderia as outras. E pelo MESMO `sentidoDoMov` dos
     cartões de cima — dois jeitos de decidir "isto é saída?" divergem no primeiro tipo
     novo, e o dia passaria a não fechar com o total. */
  var fCartoes = corpoDaFn('cartoesMov');
  ok(/lista\.forEach\(/.test(fCartoes) && /sentidoDoMov\(m\)/.test(fCartoes),
    'e os totais do dia somam as LINHAS, pelo mesmo `sentidoDoMov` dos cartões de ' +
    'cima — somados de outro jeito, o dia não fecharia com o total da tela');
  /* FORA DO CORTE DA LISTA VAZIA. Deixados depois do `return`, ficariam com os números
     do filtro ANTERIOR ao lado de "nenhum movimento" — a contradição mais difícil de
     explicar que uma tela pode mostrar. */
  /* OS GRÁFICOS ENTRARAM NO MEIO, e pela mesma razão: um recorte sem resultado tem uma
     resposta — seis zeros e cinco painéis vazios —, e ela é diferente de a tela não ter
     desenhado nada. Deixados depois do `return`, os dois ficariam com o filtro ANTERIOR
     na tela ao lado de "nenhum movimento". */
  ok(/desenharTotaisMov\(L\);\s*\n\s*desenharGraficosMov\(L\);\s*\n\s*if \(!L\.length\)\{/.test(dm),
    'e são desenhados ANTES do corte da lista vazia — depois dele, um filtro sem ' +
    'resultado mostraria os números do filtro anterior ao lado de "nenhum movimento"');

  /* O SENTIDO SAI DO TIPO, não da situação: `situacao` é o rótulo do ciclo da carga e
     muda com o tempo — "Enviada" vira "Devolvida" quando a carga volta. Somar por ela
     faria a mesma remessa trocar de coluna sozinha. */
  ok(/function sentidoDoMov\(m\)\{[\s\S]{0,200}String\(m\.tipo \|\| ''\)\.toUpperCase\(\)/.test(adm) &&
     !/sentidoDoMov[\s\S]{0,200}m\.situacao/.test(adm),
    'o sentido sai do TIPO do lançamento, não da situação — a situação muda com o ' +
    'ciclo da carga, e a mesma remessa trocaria de coluna sozinha');
  /* TRÊS SENTIDOS, não dois. Ajuste e perda não são viagem de caixa: empurrá-las para
     saída ou retorno inflaria os dois, e ignorá-las faria a soma não fechar com a
     contagem de linhas. */
  ok(/if \(t === 'SAIDA' \|\| t === 'TRANSFERENCIA'\) return 'saida';/.test(adm) &&
     /return 'acerto';/.test(adm),
    'e são TRÊS sentidos: transferência conta como saída, e ajuste e perda têm o ' +
    'cartão delas — nos dados de hoje são 10 das 40 linhas');
  /* A BASE DA PROPORÇÃO são os três. Com saída+retorno só, as fatias passariam de 100%
     assim que houvesse um ajuste no recorte. */
  ok(/var base = t\.saida \+ t\.retorno \+ t\.acerto;/.test(adm),
    'e a proporção tem os três no denominador — sem o acerto, as fatias passam de 100%');
  /* O LOTE é quem diz quantos MOVIMENTOS existem: cinco linhas podem ser um movimento
     só, com cinco tipos de caixa. */
  ok(/t\.lotes\[m\.lote \|\| m\.id\] = 1;/.test(adm),
    'e "Movimentos" conta LOTES, não linhas — cinco linhas podem ser uma remessa só');
  /* CANCELADAS NÃO TÊM CARTÃO: o servidor devolve esta lista por `naoCancelados()`, e
     um cartão que mostra zero para sempre é pior que ausência — ele AFIRMA que não há
     nenhuma. */
  var log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  ok(/return naoCancelados\(movimentos\)\.filter/.test(log) &&
     !/'Canceladas'/.test(adm),
    'e não há cartão de canceladas: o servidor as filtra antes, e um zero permanente ' +
    'afirma que não existe nenhuma');

  /* A VARREDURA atravessa a fileira UMA vez, e cada cartão recebe a fatia dele. Com um
     degradê gigante deslocado por `background-position` não funciona: porcentagem ali
     é alinhamento proporcional à SOBRA, e com a imagem maior que a caixa a conta
     inverte — só o primeiro cartão mostrava a cor certa. */
  ok(/--c1:'\+tomDeg\(i \/ n\)\+';--c2:'\+tomDeg\(\(i \+ 1\) \/ n\)/.test(adm),
    'a varredura de cor emenda entre os cartões: o fim de um é o começo do outro, e a ' +
    'costura some');
  /* `isolation:isolate` com `z-index:-1`: a cor pinta ACIMA do fundo e ABAIXO do texto.
     Sem isso ela cobre os números. */
  ok(/\.tot__c\{position:relative;isolation:isolate/.test(css) &&
     /\.tot__c::before\{[^}]*z-index:-1/.test(css),
    'e ela fica entre o fundo e o texto — sem o `isolation`, cobre os números');
  /* A faixa vazia de 18px no rodapé é medida, não gosto: sem ela a cor batia com força
     total onde fica o texto cinza e o contraste caía para 3,7:1. */
  ok(/\.tot__c\{[^}]*padding:10px clamp\(8px,\.85vw,13px\) 18px\}/.test(css),
    'e o cartão tem rodapé vazio de 18px só para ela — medido, sem ele o texto do ' +
    'rodapé caía para 3,7:1 de contraste');

  /* SETE NUMA LINHA, e a linha não quebra por largura: quem encolhe é o TEXTO. Medido
     no navegador: uma fileira só de 1280 a 2560px, com o cartão indo de 156 a 339px, e
     nenhum rótulo cortado em largura nenhuma. */
  var colsTot = (css.match(/\.tot\{display:grid;grid-template-columns:repeat\((\d+),minmax\(0,1fr\)\)/) || [])[1];
  ok(colsTot === '7', 'os sete ficam numa linha só', colsTot);

  /* A GRADE E A VARREDURA DE COR CONTAM A MESMA FILEIRA. `cartaoTot(i, n, ...)` recebe
     `n` para saber que fatia do degradê é a dele; com `n` menor que a grade, o último
     cartão repete a cor do vizinho e a emenda aparece. São dois números em arquivos
     diferentes que precisam concordar — exatamente o tipo de par que se separa na
     primeira mexida e ninguém vê, porque a tela continua funcionando. */
  /* O CORPO INTEIRO DA FUNÇÃO, contando chaves. Estava como uma fatia de 2600
     caracteres a partir do nome, e ela cortava a função no meio: encontrava cinco das
     sete chamadas e acusava um erro que não existia. Fatia de tamanho fixo é âncora que
     envelhece — basta um comentário a mais para ela passar a medir outra coisa. */
  var corpoDe = function (txt, nome) {
    var i = txt.indexOf('function ' + nome + '(');
    if (i < 0) return '';
    var d = 0, k = txt.indexOf('{', i);
    for (; k < txt.length; k++) {
      if (txt[k] === '{') d++;
      else if (txt[k] === '}' && --d === 0) return txt.slice(i, k + 1);
    }
    return '';
  };
  /* A POSIÇÃO E O TAMANHO DA FILEIRA SAEM DA LISTA, e não estão escritos em cada
     chamada. Eram sete `cartaoTot(0, 7, …)` … `cartaoTot(6, 7, …)` com a posição na
     mão — e posição escrita na mão não se reordena. Agora quem manda é a ordem
     guardada, e a varredura de cor recebe o índice do laço. */
  var desenho = corpoDe(adm, 'desenharTotaisMov');
  ok(/ordemColunas\(CARTOES_MOV\)/.test(desenho),
    'a fileira de cartões é montada a partir da ordem guardada, e não de uma sequência ' +
    'fixa de chamadas');
  ok(/cartaoTot\(i,\s*ordem\.length,/.test(desenho),
    'e a varredura de cor recebe a POSIÇÃO NA TELA e o tamanho da fileira desenhada — ' +
    'com a posição de fábrica, a cor andaria embaralhada junto com os cartões e as ' +
    'emendas entre eles apareceriam');
  ok(!/cartaoTot\(\d/.test(desenho),
    'e não sobrou nenhuma chamada com a posição escrita à mão, que a ordem guardada ' +
    'não teria como mover', (desenho.match(/cartaoTot\(\d[^)]{0,20}/g) || []));

  /* OS SETE NOMES EM DOIS LUGARES: a lista de fábrica e as fichas que desenham. Um id
     só na lista é uma posição que não desenha nada — um buraco na fileira. Um id só nas
     fichas é um cartão que nunca aparece. Os dois falham em silêncio. */
  var descCart = adm.slice(adm.indexOf('var CARTOES_MOV = {'));
  descCart = descCart.slice(0, descCart.indexOf('\n  };'));
  /* SÓ O QUE ESTÁ DENTRO DE `padrao: [...]`. Varrendo o descritor inteiro, o valor de
     `kOrdem` entrava na lista como se fosse um cartão. */
  var listaCart = descCart.slice(descCart.indexOf('padrao: ['),
                                 descCart.indexOf(']', descCart.indexOf('padrao: [')));
  var idsPadrao = (listaCart.match(/'(\w+)'/g) || []).map(function (s) { return s.slice(1, -1); });
  var idsFicha = (desenho.slice(desenho.indexOf('var FICHAS = {'),
                                desenho.indexOf('var ordem =')).match(/^\s{6}(\w+):\s*\{/gm) || [])
    .map(function (s) { return s.trim().replace(':', '').replace('{', '').trim(); });
  ok(idsPadrao.length === Number(colsTot),
    'há um cartão de fábrica para cada coluna da grade', [idsPadrao.length, colsTot]);
  ok(idsPadrao.slice().sort().join() === idsFicha.slice().sort().join(),
    'e a lista de fábrica e as fichas que desenham falam dos MESMOS sete cartões — ' +
    'um id só de um lado é um buraco na fileira ou um cartão que nunca aparece',
    [idsPadrao, idsFicha]);

  /* A CHAVE É PRÓPRIA. Repetindo a das colunas ou a dos filtros, mover um cartão
     embaralharia a tabela — e ninguém procuraria a causa nos cartões. */
  var chaveCart = (descCart.match(/kOrdem: '([^']+)'/) || [])[1];
  var chaveFil = (adm.match(/var FILTROS_MOV = \{[\s\S]*?kOrdem: '([^']+)'/) || [])[1];
  var chaveTab = (adm.match(/var TAB_MOV = \{[\s\S]*?kOrdem: '([^']+)'/) || [])[1];
  ok(chaveCart && chaveCart !== chaveFil && chaveCart !== chaveTab,
    'e a ordem dos cartões tem chave própria — dividindo com as colunas ou com os ' +
    'filtros, mexer num embaralharia o outro', [chaveCart, chaveFil, chaveTab]);

  /* O DESCRITOR VEM ANTES DE QUEM O LÊ. `var` iça a declaração e NÃO o valor: declarado
     depois, `CARTOES_MOV.padrao` é `undefined.padrao`, estoura, e o erro PARA o arquivo
     inteiro — inclusive a última linha, que é a que decide entre abrir o app e pedir
     login. Foi exatamente assim que o painel foi ao ar sem tela de entrada. */
  ok(adm.indexOf('var CARTOES_MOV = {') < adm.indexOf('function desenharTotaisMov'),
    'e o descritor dos cartões é declarado ANTES da função que o lê — declarado ' +
    'depois, ele é `undefined` na hora da chamada e o erro para o arquivo inteiro');

  /* O ARRASTO PASSA PELO MESMO CADEADO das colunas e dos filtros. Preso só ao perfil,
     o cartão seria arrastável sem a senha; preso a nada, por qualquer um. */
  var arrastaCart = corpoDe(adm, 'ligarArrastarCartoes');
  ok(/div\.draggable = podeArranjarColunas\(\);/.test(arrastaCart),
    'e o cartão só vira alça com o mesmo cadeado das colunas e dos filtros — perfil ' +
    'de administrador E a senha conferida');
  ok(/guardarOrdem\(CARTOES_MOV, ordem\);/.test(arrastaCart),
    'e o que se arrasta fica guardado, na chave dos cartões');

  /* --- "LANÇADOS HOJE", RODADO ------------------------------------------
   * O que este cartão conta é uma DECISÃO, não um detalhe: neste sistema "lançar" é o
   * ATO de registrar — é o que a coluna "Criado em" mostra —, então o carimbo responde
   * por ele, e não a data do movimento. Pela data do movimento, o cartão diria "cargas
   * datadas de hoje", que é outra pergunta e a que o filtro por dia já responde.
   * Uma busca por `dataHora` no texto não distingue as duas: `totaisMov` cita os dois
   * campos. Então a função sai do arquivo e é EXECUTADA, com os dois casos que separam
   * uma leitura da outra. */
  var fonteTot = (function () {
    var i = adm.indexOf('function totaisMov(');
    var d = 0, k = adm.indexOf('{', i);
    for (; k < adm.length; k++) {
      if (adm[k] === '{') d++;
      else if (adm[k] === '}' && --d === 0) return adm.slice(i, k + 1);
    }
  })();
  /* O `diaOperacao` DE VERDADE, tirado de `app.js`. É ele quem decide o dia, e um dublê
     aqui responderia pelo que eu escrevi em vez de pelo que roda no painel. */
  var nucleo = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var fonteDia = ['comoUTC', 'diaOperacao', 'diaLocal', 'hojeOperacao']
    .map(function (n) { return corpoDe(nucleo, n); }).join('\n');
  /* O FUSO VEM DO ARQUIVO, e não escrito aqui: com o valor repetido, mudar o fuso da
     operação deixaria esta medição olhando para o fuso antigo e continuando verde. */
  var fuso = (nucleo.match(/var FUSO_OPERACAO = '([^']+)'/) || [])[1];
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  /* `hoje` ENTRA NA BANCADA mesmo sem nenhuma afirmação usá-lo. Sem ele, trocar
     `Q.hojeOperacao()` por `Q.hoje()` na conta derruba a suíte com "Q.hoje is not a
     function" — e a sabotagem registra isso como defeito PEGO. Não foi pego: a bancada
     é que estava incompleta, e um dia em que ela estivesse completa o defeito passaria.
     Quebrar não é reprovar. */
  var Qdia = new Function('FUSO_OPERACAO', 'pad', 'window', fonteDia + '\n' +
    corpoDe(nucleo, 'hoje') +
    ' return {diaOperacao: diaOperacao, hojeOperacao: hojeOperacao, hoje: hoje};')(
      fuso, pad2, { Intl: global.Intl });
  var totaisMov = new Function('Q', 'sentidoDoMov', fonteTot + ' return totaisMov;')(
    Qdia, function (m) { return m.sentido; });

  var carimbo = function (diasAtras) {
    var d = new Date(); d.setUTCDate(d.getUTCDate() - diasAtras);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  var tHoje = totaisMov([
    { id: 'a1', lote: 'L1', qtd: 100, sentido: 'saida', dataHora: carimbo(0) },
    { id: 'a2', lote: 'L1', qtd: 50,  sentido: 'saida', dataHora: carimbo(0) },
    { id: 'b1', lote: 'L2', qtd: 30,  sentido: 'retorno', dataRef: '2020-01-01',
      dataHora: carimbo(0) },
    { id: 'c1', lote: 'L3', qtd: 999, sentido: 'saida', dataHora: carimbo(1) },
    { id: 'd1', lote: 'L4', qtd: 7,   sentido: 'saida', dataHora: '' }
  ]);
  ok(tHoje.hoje === 2,
    'o cartão conta LANÇAMENTOS e não linhas — duas linhas do mesmo lote são um ' +
    'lançamento só, a mesma regra do cartão "Movimentos" ao lado', tHoje.hoje);
  ok(tHoje.hojeLinhas === 3 && tHoje.hojeQtd === 180,
    'e a nota dele traz as linhas e as caixas de hoje', [tHoje.hojeLinhas, tHoje.hojeQtd]);
  ok(tHoje.movimentos === 4 && tHoje.hoje < tHoje.movimentos,
    'o de ontem sai de "hoje" e continua no total do recorte — os dois cartões contam ' +
    'a mesma coisa em recortes diferentes', [tHoje.hoje, tHoje.movimentos]);

  /* OS DOIS CASOS QUE DEFINEM O CARTÃO, e é só por eles que se distingue "lançado" de
     "movimentado". Trocar `dataHora` por `dataRef` na conta passa por todas as
     afirmações acima e reprova nestas duas. */
  ok(totaisMov([{ id: 'x', lote: 'LX', qtd: 5, sentido: 'saida',
                  dataRef: '2020-01-01', dataHora: carimbo(0) }]).hoje === 1,
    'carga de data antiga DIGITADA hoje conta — "lançar" é o ato de registrar');
  ok(totaisMov([{ id: 'y', lote: 'LY', qtd: 5, sentido: 'saida',
                  dataRef: Qdia.hojeOperacao(), dataHora: carimbo(1) }]).hoje === 0,
    'e carga DATADA de hoje, digitada ontem, não conta — essa é a pergunta que o ' +
    'filtro por dia já responde');

  /* O DIA VEM DO GALPÃO, não do relógio de quem abre o painel. Um carimbo de 02:00 UTC
     ainda é ONTEM em Recife (−3). Lido pelo fuso errado, o lançamento pula de dia — é o
     mesmo erro do `toISOString()`, e é na virada da noite que ele aparece. */
  var duasUTC = new Date(); duasUTC.setUTCHours(2, 0, 0, 0);
  ok(Qdia.diaOperacao(duasUTC.toISOString().slice(0, 19).replace('T', ' ')) !==
     duasUTC.toISOString().slice(0, 10),
    'e o dia sai do fuso da operação: às 02:00 UTC o galpão ainda está no dia anterior');

  /* ESTA É TEXTUAL, e é a exceção que se justifica: `Q.hoje()` devolve o dia da máquina
     e `Q.hojeOperacao()` o dia do galpão, e numa máquina que já está em −3 os dois dão
     a MESMA resposta. Nenhuma execução aqui distingue os dois — quem os distingue é o
     gerente conferindo de outro fuso, e esse caso não roda nesta suíte. Sem ela, trocar
     um pelo outro passa por tudo. O mesmo par já é cobrado assim nos atalhos de período. */
  ok(/var HOJE = Q\.hojeOperacao\(\);/.test(fonteTot) && !/Q\.hoje\(\)/.test(fonteTot),
    'e o "hoje" do cartão é o do GALPÃO, não o do computador de quem abre o painel — ' +
    'numa máquina no mesmo fuso os dois coincidem, e é por isso que isto se cobra na ' +
    'letra: a diferença só aparece para quem confere de fora');
  /* NENHUM PONTO DE QUEBRA, e é isso que se cobra agora. A fileira de sete existe só
     acima de 1023px; abaixo, a faixa fina do modelo B toma o lugar dela e é `flex`, que
     ignora `grid-template-columns`. Meia fileira deixou de ser possível porque não há
     fileira para partir — e não porque alguém escolheu bem os cortes.
     A afirmação continua valendo a pena: um corte novo aqui, em 1180px por exemplo,
     faria 3+3 numa janela de 1100 e meia fileira lê como se a outra metade tivesse
     sumido. É esse retorno que ela impede. */
  var corte = (css.match(/@media[^{]*\{\.tot\{grid-template-columns/g) || []);
  ok(corte.length === 0,
    'e a fileira não tem ponto de quebra nenhum — abaixo de 1024px quem desenha é a ' +
    'faixa fina, e meia fileira não acontece porque não há fileira para partir',
    corte);
  /* E A TARJA DE TRÊS EXISTE. Sem esta, apagar o bloco do telefone deixaria a afirmação
     acima verde — sem cortes e sem tarja, os sete cartões cairiam em três fileiras e
     meia num celular, que é exatamente o estrago que ela diz impedir. */
  ok(/\.faixa3\{display:flex/.test(semComentarios(css)),
    'e abaixo de 1024px os números viram uma tarja fina de três células');

  /* A TARJA FICA FORA DAS ABAS, e é isso que a faz sobreviver à troca. Dentro de uma
     delas, abrir a Lista apagaria o resumo inteiro e a pessoa teria de voltar ao Resumo
     só para lembrar quanto saiu. No documento ela vem ANTES da fileira de abas. */
  ok(adm.indexOf('id="totMov3"') < adm.indexOf('id="abasMov"') &&
     adm.indexOf('id="abasMov"') > 0,
    'e a tarja fica ACIMA das abas, fora delas — por isso os três números continuam ' +
    'na tela com a Lista aberta',
    [adm.indexOf('id="totMov3"'), adm.indexOf('id="abasMov"')]);

  /* AS TRÊS SÃO ESCOLHIDAS PELO NOME, e lidas das MESMAS fichas que desenham os
     cartões grandes. Por posição, a fileira é reordenável e quem arrastasse o Saldo
     para o início perderia o Retorno; por um cálculo próprio, a tela mostraria dois
     "Saída" diferentes, um acima do outro, no dia em que um deles fosse corrigido. */
  var tarja = desenho.slice(desenho.indexOf("var tarja ="), desenho.indexOf('box.innerHTML'));
  ok(/\['movimentos','saida','retorno'\]/.test(tarja.replace(/\s/g, '')),
    'e as três células da tarja são escolhidas pelo NOME do cartão — por posição, ' +
    'reordenar a fileira no computador trocaria quem aparece no telefone', tarja.slice(0, 160));
  ok(/FICHAS\[id\]/.test(tarja),
    'e saem das MESMAS fichas dos cartões grandes — dois cálculos sobre o mesmo ' +
    'recorte divergem no dia em que um deles for corrigido sozinho');

  /* AS DUAS PEÇAS NOVAS SÓ EXISTEM NO CELULAR. No computador os sete cartões estão na
     tela inteiros, logo abaixo: uma tarja repetindo três deles seria o mesmo número
     duas vezes, e abas para esconder o que já cabe seriam um clique para chegar onde
     já se está.
     ESTA É TEXTUAL PORQUE A OUTRA MEDIÇÃO NÃO ALCANÇA — e é a segunda vez que este
     mesmo buraco deixa um defeito passar. A sonda do navegador monta a marcação à mão,
     para variar a largura sem depender do login: ela mede o CSS, não o que o
     `admin.html` escreve. Medido: tirar o `so-celular` daqui não muda um pixel do que
     ela desenha. */
  [['totMov3', 'a tarja de três'], ['abasMov', 'a fileira de abas'],
   ].forEach(function (p) {
    var tag = (adm.match(new RegExp('<[^>]*id="' + p[0] + '"[^>]*>')) || [])[0] || '';
    ok(/\bso-celular\b/.test(tag),
      'e ' + p[1] + ' só existe no celular — no computador os sete cartões já estão ' +
      'na tela, e repeti-los numa tarja seria o mesmo número duas vezes', tag.slice(0, 110));
  });

  /* --- O X QUE LIMPA, E O CHIP "HOJE" -------------------------------------
   * O X É UM BOTÃO AO LADO, e não um elemento clicável DENTRO do botão de filtros.
   * Focável dentro de botão é marcação inválida: o leitor de tela anuncia os dois como
   * um só, e o Tab passa por um alvo que não se anuncia. Encostados — medido, 0px de
   * vão e 0px de degrau —, eles leem como uma peça só assim mesmo. */
  /* ATÉ O FECHAMENTO DA PÍLULA, e não até o primeiro `</span>`: o primeiro é o do
     contador que mora DENTRO do botão, e o recorte parava antes de chegar no X. */
  var iPil = adm.indexOf('<span class="pilula-filtros');
  var pilula = iPil < 0 ? '' : adm.slice(iPil, adm.indexOf('</span>', adm.indexOf('btnLimparFiltrosMov', iPil)) + 7);
  ok(/<button[^>]*id="btnLimparFiltrosMov"/.test(pilula),
    'o X que limpa é um <button> de verdade ao lado do de filtros — focável dentro de ' +
    'botão é marcação inválida, e o Tab passaria por um alvo que não se anuncia');
  ok(!/id="btnAbrirFiltrosMov"[\s\S]{0,400}?(role="button"|tabindex=)[\s\S]{0,60}?<\/button>/
     .test(adm),
    'e não há nada focável DENTRO do botão de filtros');

  /* UMA FUNÇÃO DE LIMPAR, chamada dos dois lugares. Copiada para o segundo, ela
     esqueceria um campo no dia em que um campo novo entrasse — foi exatamente o que já
     aconteceu com o motorista e o trecho, e está dito dentro dela. */
  ok(/function limparFiltrosMov\(\)/.test(adm),
    'e o "Limpar" é uma função, não o corpo de um ouvinte');
  ok((adm.match(/limparFiltrosMov\b/g) || []).length >= 3,
    'e os dois botões chamam ELA — o "Limpar" da folha e o X da pílula',
    (adm.match(/limparFiltrosMov\b/g) || []).length);

  /* O DIA DO "HOJE" VEM DO GALPÃO. Um atalho decide sozinho o que vai ser somado: com o
     celular em outro fuso — ou com a hora errada — ele traria outro dia, e ninguém teria
     como desconfiar. É o mesmo `Q.hojeOperacao()` do cartão "Lançados hoje"; dois
     caminhos para a mesma pergunta divergem na virada da meia-noite.
     TEXTUAL pela razão de sempre: numa máquina que já está em −3 os dois coincidem. */
  var fHoje = corpoDe(adm, 'ehHojeMov');
  ok(/Q\.hojeOperacao\(\)/.test(fHoje) && !/Q\.hoje\(\)/.test(fHoje),
    'e o "Hoje" conta pelo dia do GALPÃO, não pelo relógio do aparelho', fHoje.slice(0, 160));

  /* DESLIGAR VOLTA AO PADRÃO, e não a um período vazio: vazio traria a base inteira,
     que é o contrário do que quem desliga um atalho espera. */
  var cliqueHoje = adm.slice(adm.indexOf("var b = document.getElementById('btnHojeMov')"));
  cliqueHoje = cliqueHoje.slice(0, cliqueHoje.indexOf('})();'));
  ok(/if \(ehHojeMov\(\)\) \{\s*periodoPadraoMov\(\);/.test(cliqueHoje),
    'e desligá-lo volta ao período padrão, não a um período vazio — vazio traria a ' +
    'base inteira, que é o contrário do que quem desliga um atalho espera',
    cliqueHoje.slice(0, 200));

  /* OS TRÊS ESTADOS SAEM DA MESMA CONTA: o número do botão, o X e o "Hoje" aceso. Um
     estado próprio para cada um daria três respostas para "há filtro aplicado?". */
  var pinta = corpoDe(adm, 'pintarFiltrosMov');
  /* COM O `if (x)` JUNTO. `x.hidden` sozinho e SUBSTRING de `cx.hidden`, e existe um
     `cx.hidden = !l.length;` duas linhas abaixo, do bloco de pilulas — a afirmacao
     estava sendo satisfeita pela linha do vizinho, e um defeito no X passava inteiro.
     Pego na sabotagem; e a familia de sempre: uma ocorrencia respondendo pela outra. */
  ok(/if \(x\) x\.hidden = !l\.length;/.test(pinta) && /ehHojeMov\(\)/.test(pinta),
    'e o X e o "Hoje" leem da MESMA conta que o número do botão — três estados ' +
    'próprios dariam três respostas para "há filtro aplicado?"');

  /* A ABA QUE ABRE É A LISTA. Abrir no Resumo esconde justamente o que a pessoa veio
     buscar, e a aba inicial tem de ser a do uso mais frequente. */
  var nav = (adm.match(/<nav class="abas-mov[\s\S]*?<\/nav>/) || [''])[0];
  ok(/data-aba="lista"[^>]*aria-selected="true"/.test(nav),
    'e a aba que abre é a LISTA — abrir no Resumo esconde o que se veio buscar', nav.slice(0, 200));
  ok(/abaMov\('lista'\)/.test(adm),
    'e o script começa por ela também, senão a marcação diria uma coisa e a tela outra');

  /* QUEM MOSTRA E ESCONDE É A FOLHA DE ESTILO, dentro do bloco do telefone. Um script
     escondendo blocos por conta própria teria de ser desfeito a cada giro do aparelho —
     e no computador as três coisas aparecem juntas, sem aba nenhuma. */
  ok(/html\[data-aba-mov="lista"\] #totMov/.test(semComentarios(css)),
    'e quem esconde por aba é o CSS, no bloco do celular — no computador o atributo ' +
    'é ignorado por inteiro e as três coisas ficam na tela');

  /* AS GAVETAS DO CELULAR FECHAM POR UMA REGRA SÓ. Com o seletor pelo nome de uma
     delas, a segunda que aparecesse ficaria fora do X, do véu e do Esc — a única que
     não fecha, e ninguém consegue explicar por quê. */
  var fechar = corpoDe(adm, 'fecharFolhas');
  ok(/\[data-gaveta\]\.aberta/.test(fechar) && !/\.filtros-caixa\.aberta/.test(fechar),
    'e as gavetas do celular fecham por `[data-gaveta]`, não pelo nome de uma delas — ' +
    'a segunda gaveta entra sozinha no X, no véu e no Esc', fechar.slice(0, 200));
  /* A MARCA CONTINUA NA CAIXA DE FILTROS, que é a gaveta que restou. A dos gráficos
     deixou de existir: eles viraram uma aba, e não uma folha que sobe.
     Isto era uma CONTAGEM — `>= 3` marcas no arquivo —, e contagem é proxy: tirar a
     marca de uma delas deixava três e a afirmação passava, com o X e o Esc já não
     alcançando aquela gaveta. Pego na sabotagem, e por isso é pelo nome. */
  var tagFiltros = (adm.match(/<[^>]*id="caixaFiltrosMov"[^>]*>/) || [])[0] || '';
  ok(/data-gaveta/.test(tagFiltros),
    'e a caixa de filtros carrega a marca que o X, o véu e o Esc procuram — sem ela, ' +
    'é a única que não fecha, e ninguém consegue explicar por quê', tagFiltros.slice(0, 120));

  /* A GAVETA DOS GRÁFICOS FOI EMBORA INTEIRA, e o nome foi junto. Ficasse a classe
     `gaveta-graficos` num bloco que já é aba, o próximo leitor procuraria um botão de
     abrir que não existe mais — e um nome que mente custa mais caro que um nome feio. */
  ['gaveta-graficos', 'btnAbrirGraficosMov', 'folhaGraficosMov'].forEach(function (morto) {
    ok(adm.indexOf(morto) < 0 && css.indexOf(morto) < 0,
      'e não sobrou nada chamado `' + morto + '` — os gráficos são uma aba, não uma ' +
      'gaveta, e o nome tem de dizer isso');
  });
  ok(/\.painel-graficos \.graficos\{grid-template-columns:1fr\}/.test(semComentarios(css)),
    'e na aba deles os cinco EMPILHAM — há tela inteira, e um trilho que desliza de ' +
    'lado dentro de uma página que rola para baixo faz o dedo competir consigo mesmo');
  /* ESTA AFIRMAÇÃO PRENDIA OS NÚMEROS — `clamp(16px,1.42vw,21px)` e
     `clamp(10px,.82vw,11.5px)` — e reprovava a cada mexida de tamanho, que é decisão de
     quem desenha, não regra. A garantia que ela anuncia é outra: o texto é FLUIDO, então
     quem cede à largura é a letra e não a grade. Quem cobra a grade são as duas
     afirmações acima. Aqui fica só a forma: piso, meio em `vw`, teto — e piso menor que
     teto, senão o `clamp` é um tamanho fixo escrito de um jeito complicado. */
  ['tot__v', 'tot__r', 'tot__n'].forEach(function (cl) {
    var r = new RegExp('\\.' + cl + '\\{[\\s\\S]{0,160}?font-size:' +
                       'clamp\\(([\\d.]+)px,([\\d.]+)vw,([\\d.]+)px\\)');
    var m = css.match(r);
    ok(m && parseFloat(m[1]) < parseFloat(m[3]),
      'o texto do cartão (.' + cl + ') encolhe pelo `clamp`, com piso e teto — quem ' +
      'cede à largura é a letra, e a grade de seis não quebra',
      m && m.slice(1));
  });

  /* E O DETALHE NÃO É A MENOR LETRA DA TELA. Ele é quem diz o que o número grande
     conta — "40 linhas de caixa" embaixo de um "8" que, sozinho, não diz 8 de quê.
     Estava em 10px, menor que o rótulo e menor que a legenda dos gráficos; ninguém
     escolheu isso, foi o que sobrou de encolher tudo para os gráficos caberem. */
  var teto = function (cl) {
    var m = css.match(new RegExp('\\.' + cl + '\\{[\\s\\S]{0,160}?font-size:' +
                                 'clamp\\([\\d.]+px,[\\d.]+vw,([\\d.]+)px\\)'));
    return m ? parseFloat(m[1]) : -1;
  };
  ok(teto('tot__n') >= 12,
    'e a nota do cartão chega a 12px — é ela que diz o que o número grande conta, e ' +
    'era a menor letra da tela inteira', teto('tot__n'));
  /* A COR IDENTIFICA UMA VEZ SÓ: num quadradinho junto do rótulo, com o número branco.
     Colorindo o número também, a cor dizia a mesma coisa duas vezes e os seis valores
     deixavam de ter o mesmo peso. */
  ok(/\.tot__v\{[^}]*color:var\(--txt\)/.test(css) &&
     /\.tot__r i\{[^}]*background:var\(--cor/.test(css),
    'e a cor aparece uma vez só, no quadradinho — o número fica branco, e os seis ' +
    'valores têm o mesmo peso');
})();

/* ---------------------------------------------------------------------------
 * CLASSIFICAR E A JANELA DE LINHAS, em Movimentos.
 *
 * A tabela já arrastava, escondia e alargava colunas. Faltava o gesto que se tenta
 * primeiro em qualquer tabela: clicar no título. E faltava a lista caber na tela — com
 * quinhentas linhas no filtro, os seis totais e o rodapé da página ficavam a uma rolagem
 * de distância que ninguém faz.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * OS CINCO RECORTES EM GRÁFICO, em Movimentos.
 *
 * Cinco painéis do MESMO conjunto filtrado, cada barra dividida em saída e retorno — só
 * o total escondia o que interessa: motorista que leva e nunca traz aparecia igual a um
 * que fecha o ciclo.
 *
 * E a barra é um BOTÃO: clicar filtra a tela inteira. É aí que mora o risco desta peça,
 * e é o que a maior parte destas afirmações guarda.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * O TRILHO DE FILTROS, em Movimentos.
 *
 * No computador a caixa de filtros vira uma barra de 56px na borda direita, que abre ao
 * passar o mouse e EMPURRA a lista em vez de cobri-la.
 *
 * O RISCO DESTA PEÇA NÃO É O COMPUTADOR — é o CELULAR. A caixa mudou de lugar no
 * documento, e lá ela é a folha que sobe de baixo. Quebrada, ninguém mais filtra no
 * telefone, e a tela continua parecendo certa para quem só olha no monitor.
 * ------------------------------------------------------------------------- */
console.log('\n== o trilho de filtros, em Movimentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* UM NÓ SÓ nas duas larguras. Duas cópias dos mesmos campos seriam dois ids
     repetidos, e `getElementById` passaria a ler sempre o primeiro: a tela filtraria
     pelo que a outra cópia tem, e ninguém entenderia por quê. */
  ['mvOrigem', 'mvDestino', 'mvCaixa', 'mvUsuario', 'mvDe', 'mvAte'].forEach(function (id) {
    ok((adm.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1,
      'o campo ' + id + ' existe uma vez só — duas cópias, e `getElementById` leria ' +
      'sempre a primeira');
  });

  /* A CAIXA FICA DEPOIS DO CONTEÚDO no documento, porque no computador ela é a segunda
     coluna da grade. No celular ela é `position:fixed`, então a ordem não muda nada lá —
     foi o que permitiu movê-la. */
  ok(adm.indexOf('id="graficosMov"') < adm.indexOf('id="caixaFiltrosMov"') &&
     /<div class="mov-tela" id="movTela">/.test(adm) &&
     /<div class="mov-conteudo">/.test(adm),
    'a grade existe e a caixa é a segunda coluna dela');
  ok(/<aside class="filtros-caixa" id="caixaFiltrosMov"/.test(adm),
    'e ela é um `aside`: a barra de filtros não é o conteúdo da página');

  /* EMPURRA, NÃO COBRE. Medido no Chrome a 1440px: fechada, a tabela tem 1318px;
     aberta, 1106 — e as duas caixas nunca se sobrepõem. Filtro por cima do dado faz a
     pessoa fechar o filtro para conferir o que acabou de filtrar. */
  /* O TRILHO FICA A ESQUERDA, a pedido — a coluna dele e a PRIMEIRA. Mas a caixa
     continua DEPOIS do conteudo no documento, e as duas coisas juntas sao a afirmacao:
     a ordem visual e escolha de leitura, e a ordem do documento e a ordem do Tab.
     Invertidas as duas, quem navega de teclado passaria pelos dez campos do filtro
     antes de chegar na lista — dez tabulacoes de pedagio em toda visita. */
  ok(/\.mov-tela\{display:grid;grid-template-columns:56px minmax\(0,1fr\);/.test(css) &&
     /\.mov-tela\.aberta\{grid-template-columns:248px minmax\(0,1fr\)\}/.test(css) &&
     /\.mov-tela \.filtros-caixa\{grid-column:1;grid-row:1\}/.test(css),
    'o trilho EMPURRA a lista e fica a ESQUERDA: 56px fechado, 248 aberto — e a tabela ' +
    'encolhe junto, em vez de ficar debaixo do filtro');
  ok(adm.indexOf('id="graficosMov"') < adm.indexOf('id="caixaFiltrosMov"'),
    'e a caixa continua DEPOIS do conteudo no documento: a ordem do Tab e a da leitura, ' +
    'e nao a da tela — senao sao dez campos de pedagio antes da lista');
  /* A LARGURA É DECLARADA NOS DOIS ESTADOS, e não numa variável: propriedade
     personalizada não anima sem `@property`, e o trilho abriria de um salto. */
  /* A checagem é da PRÓPRIA regra, e não do arquivo: `--trilho-larg` já existe há muito
     para o menu lateral do app, e procurar a palavra solta acusava aquele. */
  var regraAberta = (css.match(/\.mov-tela\.aberta\{[^}]*\}/) || [''])[0];
  ok(/transition:grid-template-columns \.22s/.test(css) &&
     /248px/.test(regraAberta) && regraAberta.indexOf('var(') < 0,
    'e a transição é do próprio `grid-template-columns`, com a largura escrita — por ' +
    'variável ela não anima sem `@property`, e a barra abriria de um salto', regraAberta);
  /* `min-width:0` na coluna do conteúdo: sem ele a tabela larga estica a coluna, a
     grade deixa de caber e o trilho vai para fora da tela. */
  ok(/\.mov-conteudo\{min-width:0\}/.test(css),
    'e a coluna do conteúdo pode encolher — sem isso a tabela larga empurra o trilho ' +
    'para fora da tela');
  /* ACOMPANHA A ROLAGEM: com 500 linhas na tabela, um filtro preso no topo obriga a
     subir a página inteira para mexer num campo. */
  ok(/\.filtros-caixa\{position:sticky;top:10px/.test(css),
    'e ele acompanha a rolagem — com 500 linhas, um filtro preso no topo obriga a ' +
    'subir a página toda para mexer num campo');

  /* FECHADO, O MIOLO NÃO EXISTE PARA O TAB. Um campo invisível que recebe foco arrasta
     a tela para um lugar que não está na tela — e a pessoa não vê o que está editando. */
  ok(/\.filtros-caixa \.filtros-caixa__corpo\{display:none\}/.test(css) &&
     /\.mov-tela\.aberta \.filtros-caixa__corpo\{display:block/.test(css),
    'fechado, os campos não são alcançáveis pelo Tab — foco numa coisa que não se vê ' +
    'arrasta a tela para fora dela');
  /* A FAIXA FECHADA diz que ali há filtros. Só o ícone não diz o que ele abre, e
     "Filtros" deitado não cabe em 56px — daí o rótulo em pé. */
  ok(/\.trilho__t\{writing-mode:vertical-rl/.test(css) &&
     /<span class="trilho__t">Filtros<\/span>/.test(adm),
    'e a faixa fechada leva o rótulo em pé — em 56px ele não cabe deitado, e só o ' +
    'ícone não diz o que ele abre');
  /* A CONTAGEM na faixa fechada é a única pista de que a lista está recortada quando o
     trilho está encolhido. E sai do MESMO `l` da outra contagem. */
  ok(/var chipT = document\.getElementById\('mvFiltrosQtdTrilho'\);/.test(adm) &&
     /chipT\.hidden = !l\.length;/.test(adm),
    'e a contagem aparece na faixa fechada, do mesmo `l` da outra — duas contagens ' +
    'discordariam no dia em que um campo entrasse só numa delas');

  /* --- o comportamento --- */
  var it = adm.indexOf('function trilhoFiltros()');
  var tr = it > 0 ? adm.slice(it, adm.indexOf('\n  })();', it)) : '';
  /* OS DOIS ATRASOS, e os dois por um motivo. 130ms para abrir: o cursor atravessa a
     borda direita dezenas de vezes por dia a caminho da barra de rolagem. 260 para
     fechar: dá tempo de voltar quando o mouse sai por um instante. */
  ok(/abrirT = setTimeout\(abrir, 130\);/.test(tr) &&
     /fecharT = setTimeout\(fechar, 260\);/.test(tr),
    'abre em 130ms e fecha em 260 — sem a espera de abrir, ela abriria toda vez que o ' +
    'cursor passasse a caminho da barra de rolagem');
  ok(/function fechar\(\)\{\s*\n\s*if \(presa\) return;/.test(tr),
    'e presa pelo alfinete, o mouse não fecha mais — quem vai mexer em vários campos ' +
    'não quer que ela feche ao esbarrar o cursor fora');
  ok(/caixa\.addEventListener\('focusin', abrir\);/.test(tr) &&
     /if \(!caixa\.contains\(e\.relatedTarget\)\) fechar\(\);/.test(tr),
    'e pelo teclado ela abre ao receber foco e fecha ao perdê-lo');
  ok(/e\.key === 'Escape'/.test(tr),
    'e o Esc fecha, inclusive presa');
  /* NO TOQUE não há "passar o mouse": um tablet em 1024px cai no computador e a barra
     seria inalcançável sem o clique. */
  ok(/caixa\.addEventListener\('click', function\(e\)\{/.test(tr) &&
     /if \(!tela\.classList\.contains\('aberta'\)\) prender\(true\);/.test(tr),
    'e o clique na faixa fechada abre — num tablet não há mouse a passar, e sem isso a ' +
    'barra seria inalcançável');
  /* A LARGURA É PERGUNTADA AO CSS, e não adivinhada: duas respostas para "estamos no
     computador?" divergiriam no dia em que o ponto de corte mudasse. */
  ok(/window\.matchMedia\('\(min-width:1024px\)'\)/.test(tr) &&
     /function abrir\(\)\{\s*\n\s*if \(!noComputador\.matches\) return;/.test(tr),
    'e quem responde "estamos no computador?" é o CSS, pelo `matchMedia` — adivinhar a ' +
    'largura no JS criaria duas verdades que divergem no dia em que o corte mudar');
  /* GIRAR O TABLET não pode deixar a classe `aberta` presa numa tela que virou celular:
     lá ela não quer dizer nada, e a folha passaria a abrir já aberta. */
  ok(/noComputador\.addEventListener\('change', function\(ev\)\{/.test(tr) &&
     /if \(!ev\.matches\) \{ presa = false; tela\.classList\.remove\('aberta'\);/.test(tr),
    'e girar o tablet solta o estado do trilho — deixado aceso, a folha do celular ' +
    'passaria a abrir já aberta');

  /* --- O CELULAR CONTINUA INTEIRO ---
     Medido no Chrome a 390px: a caixa é `position:fixed`, a folha sobe com os campos
     alcançáveis, e as duas peças do trilho ficam fora do caminho. */
  ok(/@media \(max-width:1023px\)\{\s*\n\s*\.trilho-fechado,\.trilho__cab\{display:none\}/.test(css),
    'no celular as peças do trilho somem — a caixa volta a ser a folha que sobe de baixo');
  ok(/\.filtros-caixa\{position:fixed;left:0;right:0;bottom:0/.test(css) &&
     /\.filtros-caixa\.aberta\{display:flex\}/.test(css),
    'e a folha continua sendo a folha: `fixed`, subindo de baixo, aberta pela classe');
  /* O BOTÃO CONTINUA LÁ, e só no celular — mas a classe `so-celular` passou para a
     PÍLULA que o envolve, junto com o X que limpa. Esta afirmação pedia a classe no
     próprio botão e reprovou sem nada ter piorado: o que ela guarda é que o botão exista
     e não vaze para o computador, e isso a pílula continua garantindo. */
  /* AS DUAS PASTILHAS SUBIRAM PARA A LINHA DO TÍTULO, e com isso saíram do corpo da
     página: agora moram no cabeçalho, que é COMPARTILHADO pelas sete telas. Esta
     afirmação pedia `so-celular` na pílula e reprovou sem nada ter piorado — a garantia
     (existir, e não vazar para o computador) mudou de dono, não de conteúdo. */
  var iAc = adm.indexOf('id="acoesMovCab"');
  var acoes = iAc < 0 ? '' :
    adm.slice(iAc, adm.indexOf('</div>', adm.indexOf('btnLimparFiltrosMov', iAc)));
  ok(/id="btnAbrirFiltrosMov"/.test(acoes) && /id="btnHojeMov"/.test(acoes),
    'e as duas pastilhas moram na linha do título, dentro das ações do cabeçalho — ' +
    'numa linha própria custavam três dedos de altura à lista, que é o que se veio ver');

  /* E NÃO USAM `so-celular`, o que parece descuido e é o contrário. Aquela classe
     declara `display:flex!important` no celular, e `!important` venceria a regra de
     página: as duas apareceriam em Cadastros, no Extrato, nas sete telas. A
     visibilidade é escrita inteira no bloco próprio, justamente para aceitar exceção. */
  ok(!/\bso-celular\b/.test(acoes),
    'e NÃO carregam `so-celular` — aquela classe usa `!important` e atropelaria a ' +
    'regra de página, fazendo as duas aparecerem nas sete telas', acoes.slice(0, 120));
  var semCom = semComentarios(css);
  ok(/\.cab-pagina__acoes\{display:none/.test(semCom) &&
     /html\[data-pagina="pgMovimentos"\] \.cab-pagina__acoes\{display:flex\}/.test(semCom),
    'e quem as mostra é a folha, só no celular e só em Movimentos — o cabeçalho é um ' +
    'só para as sete telas');
  var nucleoNav = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  ok(/document\.documentElement\.dataset\.pagina = botao\.dataset\.pagina/.test(nucleoNav),
    'e a página aberta vira atributo no <html>, escrito pela navegação que já tem essa ' +
    'informação — cada tela inventando o próprio jeito de se descobrir seria sete jeitos');

  /* --- O CABEÇALHO DA FOLHA VAZAVA PARA O COMPUTADOR ----------------------
   * `.folha__cab{display:flex}` vem DEPOIS de `.so-celular{display:none}` na folha de
   * estilo, e com a mesma especificidade a última ganha. O resultado era "FILTROS"
   * escrito duas vezes no trilho, com dois botões de fechar — visível no print, e o
   * tipo de coisa que faz a tela parecer montada por engano.
   * Medido depois do conserto: a palavra aparece UMA vez, e as duas peças da folha
   * ficam em `display:none` no computador. */
  /* --- `so-celular` PASSOU A VALER SEMPRE ---------------------------------
   * Sem `!important`, `display:none` perde para QUALQUER regra de `display` escrita
   * depois na folha — mesma especificidade, a última ganha. Três peças já tinham essa
   * regra, e as três apareciam no computador com a classe que diz "só no celular"
   * escrita nelas: `.aplicados`, `.folha__cab` e `.folha__pe`.
   *
   * O sintoma foi saindo aos poucos e cada vez parecia um caso isolado — o cabeçalho da
   * folha duplicando o "FILTROS" do trilho, a tira de pílulas aparecendo embaixo do
   * subtítulo. Consertados um a um, o terceiro ainda estaria lá esperando.
   *
   * Esta afirmação não olha o remendo: ela varre a folha inteira atrás de QUALQUER
   * classe que conviva com `so-celular` na marcação e declare `display` depois. É o
   * teste que encontra a próxima antes de ela aparecer numa tela. */
  ok(/\.so-celular\{display:none!important\}/.test(css),
    '`so-celular` esconde de verdade: sem o `!important` ela perde para qualquer regra ' +
    'de `display` escrita depois, e a peça aparece no computador');
  ok(/\.so-celular\{display:flex!important\}/.test(css) &&
     /button\.so-celular\{display:inline-flex!important\}/.test(css),
    'e quem LIGA a peça no celular também precisa dele — senão a regra de fora vence ' +
    'dentro da media query e nada apareceria no telefone');
  /* O PUXADOR DO TRILHO tem a classe na marcação, então a regra de raiz basta — e
     a afirmação cobra que ela BASTE. Enquanto `so-celular` não escondia de verdade,
     ele precisava de uma regra local; essa regra virou redundância no momento do
     conserto, e redundância é exatamente o que este conserto veio tirar. */
  ok(/<div class="folha__puxador so-celular" aria-hidden="true"><\/div>\s*\n\s*<div class="folha__cab so-celular">/
       .test(adm) && !/\.mov-tela \.folha__puxador\{/.test(css),
    'e o puxador do trilho sai pela própria classe, sem regra local — uma regra por ' +
    'peça descoberta é o hábito que criou este defeito');
  (function () {
    var i = css.indexOf('.so-celular{display:none!important}');
    var depois = css.slice(i);
    var juntas = {};
    (adm.match(/class="[^"]*so-celular[^"]*"/g) || []).forEach(function (m) {
      m.slice(7, -1).split(/\s+/).forEach(function (c) {
        if (c && c !== 'so-celular') juntas[c] = 1;
      });
    });
    var vazam = Object.keys(juntas).filter(function (c) {
      var r = new RegExp('(?:^|\\n)\\.' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                         '\\{([^}]*)\\}');
      var m = depois.match(r);
      return m && /display:/.test(m[1]) && !/!important/.test(m[1]);
    });
    ok(vazam.length === 0 || /\.so-celular\{display:none!important\}/.test(css),
      'e nenhuma classe que conviva com ela declara `display` depois sem ser vencida — ' +
      'eram três, e cada uma parecia um caso isolado até a terceira', vazam);
  })();

  /* --- CAMPOS MENORES, a pedido -------------------------------------------
   * Dez campos em corpo de formulário comum passam da altura da tela, e o de baixo fica
   * fora do alcance sem rolar. O piso de 44px do alvo de dedo NÃO se aplica aqui: ele
   * vale para o app de campo, usado de luva; isto é teclado e mouse de escritório.
   * E a letra do campo fica em 13px, não menos: abaixo disso o Safari do iPad dá zoom
   * sozinho ao focar, e a tela salta. */
  var regraCampo = (css.match(/\.mov-tela \.filtros-caixa select,\s*\n\s*\.mov-tela \.filtros-caixa input\{[^}]*\}/) || [''])[0];
  var tam = (regraCampo.match(/font-size:([\d.]+)px/) || [])[1];
  ok(tam && Number(tam) >= 13,
    'os campos do trilho encolheram, mas a letra não desce de 13px — abaixo disso o ' +
    'Safari do iPad dá zoom sozinho ao focar, e a tela salta', regraCampo);
  ok(/\.mov-tela \.filtros-caixa label\{font-size:11px/.test(css),
    'e o rótulo encolhe junto — é ele que empilha dez vezes');

  /* --- A TABELA APERTA, mas o ALVO não ------------------------------------
   * Quem define a altura da linha não é o recuo da célula: é o botão de ação. Apertar
   * só o recuo é o que deixa a linha mais baixa sem encolher o alvo de quem corrige um
   * lançamento. Medido: a linha foi de 41 para 32px. */
  ok(/#tabelaMov th,#tabelaMov td\{padding:4px 8px\}/.test(css),
    'a tabela de Movimentos aperta o recuo — é ela que divide a tela com os cartões em ' +
    'cima e os gráficos embaixo');
  var mini = (css.match(/#tabelaMov \.mini\{[^}]*\}/) || [''])[0];
  ok(/padding:3px 8px/.test(mini) && /font-size:12px/.test(mini),
    'e o botão encolhe o RECUO, não a altura útil — ele é quem manda na altura da linha',
    mini);
})();

console.log('\n== os cinco recortes em gráfico, em Movimentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

  ok(/<div class="graficos" id="graficosMov"><\/div>/.test(adm) &&
     adm.indexOf('id="tabelaMov"') < adm.indexOf('id="graficosMov"'),
    'os cinco painéis existem e ficam ABAIXO da tabela — quem chega nesta tela vem ver ' +
    'uma linha, e o resumo é o segundo olhar');
  ['Total por dia', 'Por trecho', 'Por motorista', 'Por quem lançou',
   'Por tipo de caixa'].forEach(function (t) {
    ok(adm.indexOf("'" + t + "'") > 0, 'existe o painel ' + t);
  });

  /* ---- O CLIQUE ESCREVE NO MESMO FILTRO QUE A PESSOA USARIA À MÃO ----------
   * Este é o ponto perigoso da peça. O "Apagar o que está no filtro" lê
   * `filtroExclusao()`; se o clique no gráfico criasse um recorte à parte, a tela
   * mostraria dez linhas e o apagar levaria quinhentas. A suíte já pegou isso uma vez
   * nesta mesma leva — `limparMovimentos` não repassava os dois campos novos. */
  /* ESCOPADO NO TRATADOR DO CLIQUE, e não procurado no arquivo: `var el =
     document.getElementById(campo);` aparece duas vezes no admin.html — a outra está no
     `gLigado`, que só pergunta se a barra já está ligada. Apagar a linha do CLIQUE
     passava, porque a do `gLigado` respondia por ela. Foi a sabotagem que mostrou isso,
     e era justamente o defeito mais grave da peça. */
  var iCl = adm.indexOf(".closest('.gb[data-gcampo]')");
  /* O FIM DA FATIA É O FIM DO TRATADOR, e não a chamada que se quer testar. Cortando em
     `carregarMovimentos();`, a fatia terminava exatamente na linha cobrada — e apagando
     a linha o corte ia parar na PRÓXIMA chamada do arquivo, lá adiante, trazendo um
     trecho grande o bastante para a afirmação passar. Âncora circular: ela media a si
     mesma. A sabotagem mostrou isso. */
  var trat = iCl > 0 ? adm.slice(iCl, adm.indexOf('\n  });', iCl) + 6) : '';
  ok(/var el = document\.getElementById\(campo\);\s*\n\s*if \(!el\) return;/.test(trat) &&
     /el\.value = ligado \? '' : v;/.test(trat) &&
     /carregarMovimentos\(\);/.test(trat),
    'o clique na barra escreve no MESMO campo do filtro e recarrega — um recorte à ' +
    'parte faria a tela mostrar dez linhas e o "apagar" levar quinhentas', trat.length);
  /* E a data escreve nos DOIS campos do período, senão clicar num dia deixaria o outro
     lado da janela aberto e o recorte seria "daquele dia em diante". */
  ok(/document\.getElementById\('mvDe'\)\.value = d;\s*\n\s*document\.getElementById\('mvAte'\)\.value = d;/
       .test(trat),
    'e o clique num dia fecha os DOIS lados do período — só um, e o recorte viraria ' +
    '"daquele dia em diante"');
  ok(/motorista: document\.getElementById\('mvMotorista'\)\.value,/.test(adm) &&
     /trecho:  document\.getElementById\('mvTrecho'\)\.value,/.test(adm),
    'e os dois campos novos entram no `filtroExclusao()`, que é o que a lista, o CSV e ' +
    'o apagar leem');
  ok(/situacao: p\.situacao, motorista: p\.motorista, trecho: p\.trecho,/.test(idx),
    'e o `limparMovimentos` repassa os dois — sem isso o apagar recorta um conjunto ' +
    'maior do que o que está na tela');
  ok(/if \(f\.motorista\) p\.push\('com o motorista/.test(adm) &&
     /if \(f\.trecho\)    p\.push\('no trecho/.test(adm),
    'e os dois aparecem na frase da confirmação do apagar — um filtro que recorta e ' +
    'não é dito faria alguém confirmar o apagamento de um recorte que não está lendo');
  ok(/document\.getElementById\('mvMotorista'\)\.value = '';/.test(adm) &&
     /document\.getElementById\('mvTrecho'\)\.value = '';/.test(adm),
    'e o "Limpar" limpa os dois — esquecido ali, ficaria de pé justamente o filtro que ' +
    'não tem campo à vista para conferir');

  /* ---- O SERVIDOR SABE FILTRAR pelos dois ---------------------------------
   * Eram os dois únicos recortes do gráfico que o servidor não entendia; sem eles, três
   * dos cinco painéis nasceriam sem clique. */
  ok(/if \(p\.motorista && String\(m\.Motorista \|\| ''\) !== String\(p\.motorista\)\) return false;/.test(log),
    'o servidor filtra por motorista — e por TEXTO exato, porque o lançamento guarda o ' +
    'nome e não um id: "Chico" não pode trazer "Francisco Chico" junto');
  /* O TRECHO É O PAR SEM DIREÇÃO, e por ID. Ordenar os dois lados é o que faz a ida e a
     volta casarem com o mesmo filtro; por nome, uma correção de grafia no cadastro
     quebraria o filtro no dia seguinte. */
  ok(/var par = String\(p\.trecho\)\.split\('\|'\)[\s\S]{0,80}\.sort\(\);/.test(log) &&
     /var deste = \[String\(m\.OrigemID \|\| ''\), String\(m\.DestinoID \|\| ''\)\]\.sort\(\);/.test(log),
    'e por trecho: o par de pontas ordenado, por ID — assim a ida e a volta casam com o ' +
    'mesmo filtro, e uma correção de grafia no cadastro não o quebra');

  /* ---- o que a barra mostra ---------------------------------------------- */
  ok(/var pode = campo && g\.v != null && g\.v !== '';/.test(adm),
    '"sem informação" e "Outros" continuam desenhados, mas não viram filtro: o servidor ' +
    'não tem um valor para "nenhum", e o agregado precisaria mandar sete de uma vez');
  ok(/var lig = pode && gLigado\(campo, g\);/.test(adm) &&
     /aria-pressed="'\+\(lig \? 'true' : 'false'\)/.test(adm),
    'e a barra já filtrada fica marcada, e o clique nela DESLIGA — senão a pessoa fica ' +
    'presa no filtro que acabou de aplicar');
  /* A BARRA É UM <button>, e não um <div> com ouvinte: chega pelo teclado e é anunciada
     como botão por quem usa leitor de tela. */
  ok(/<button class="gb" type="button"/.test(adm),
    'a barra é um botão de verdade — pelo teclado e para o leitor de tela');
  /* A PROPORÇÃO É DA PRÓPRIA COLUNA: cada painel responde "quem é o maior AQUI".
     Comparar entre painéis pela largura seria errado, e por isso o número está escrito. */
  ok(/var maior = lista\.reduce\(function\(a, g\)\{ return Math\.max\(a, g\.total\); \}, 0\);/.test(adm),
    'e a largura é proporcional ao maior da PRÓPRIA coluna — entre painéis, quem se ' +
    'compara é o número escrito');
  ok(/var TETO_G = 6;/.test(adm) && /resto\.k = 'Outros \(' \+ resto\.n \+ '\)';/.test(adm),
    'no máximo seis categorias, e o resto vira "Outros" — barra de dois pixels não é ' +
    'leitura, e quarenta nomes empurram a tabela para fora da tela');
  /* O DIA VAI EM ORDEM DE DATA, não de tamanho: tempo tem ordem própria. */
  ok(/\.sort\(function\(a, b\)\{ return a\.v < b\.v \? -1 : 1; \}\);/.test(adm) &&
     /if \(dias\.length > TETO_G\) dias = dias\.slice\(dias\.length - TETO_G\);/.test(adm),
    'e o painel do dia vai em ordem de DATA, ficando com os mais recentes — embaralhar ' +
    'o tempo por valor destrói a leitura');

  /* ---- A LEGENDA CONCORDA COM A BARRA ------------------------------------
   * Isto quase saiu errado: a legenda veio do desenho com saída em VERDE, e as barras
   * pintam saída em AZUL — que é como o resto do sistema já marca SAIDA e DEVOLUCAO.
   * Legenda que discorda da barra é pior que legenda nenhuma: ela ensina a ler errado, e
   * quem confere não tem como desconfiar. A afirmação compara os dois tokens. */
  /* TODAS AS LEGENDAS, e não a primeira que aparecer. Escrita com `.match` simples,
     esta linha lia UMA ocorrência — e no dia em que nasceu uma segunda legenda, num
     cartão mais acima do arquivo, foi essa que passou a ser medida. Por sorte a nova
     estava errada e a suíte reprovou; estivesse certa, a do gráfico teria ficado sem
     ninguém olhando, e o defeito que esta asserção existe para pegar passaria. */
  function corDaLegenda(rotulo) {
    var achados = [];
    var re = new RegExp('<i style="background:var\\((--[\\w-]+)\\)"><\\/i>' + rotulo, 'g');
    var m;
    while ((m = re.exec(adm))) if (achados.indexOf(m[1]) < 0) achados.push(m[1]);
    /* Duas legendas com tokens DIFERENTES para o mesmo rótulo já é o defeito: devolve as
       duas, e a comparação abaixo reprova. */
    return achados.length === 1 ? achados[0] : achados.join('+');
  }
  var swSaida = corDaLegenda('Saída');
  var swRet   = corDaLegenda('Retorno');
  var fillS   = (css.match(/\.gb__s\{background:var\((--[\w-]+)\)\}/) || [])[1];
  var fillR   = (css.match(/\.gb__d\{background:var\((--[\w-]+)\)\}/) || [])[1];
  ok(swSaida && swSaida === fillS && swRet && swRet === fillR,
    'a legenda usa exatamente os tokens que pintam as barras — discordando, ela ensina ' +
    'a ler errado e quem confere não tem como desconfiar',
    { legenda: [swSaida, swRet], barras: [fillS, fillR] });
  /* E O AVISO SOME quando não há o que avisar: aviso permanente vira ruído, e ruído
     constante é o que faz ninguém reparar no dia em que ele muda. */
  ok(/function pintarLegendaMov\(L\)\{/.test(adm) &&
     /\.legenda-g em:empty\{display:none\}/.test(css),
    'e o aviso de linhas de teste some quando não há nenhuma — aviso permanente vira ' +
    'ruído, e ruído constante faz ninguém reparar no dia em que ele muda');

  /* CINCO COLUNAS FIXAS: com `auto-fit` o quinto painel caía sozinho para a segunda
     linha e sobrava meia tela vazia. */
  ok(/\.graficos\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(css),
    'os cinco ficam lado a lado, e quem encolhe é o texto');
  var q = (css.match(/@media \(max-width:(\d+)px\)\{\.graficos\{/g) || []);
  ok(q.length === 1 && /520px/.test(q[0]),
    'com uma única quebra, em 520px — cinco colunas ali dariam 85px cada e nenhum ' +
    'rótulo caberia', q);
})();

console.log('\n== classificar e a janela de linhas, em Movimentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i0 = adm.indexOf('function desenharMovimentos()');
  var dm = adm.slice(i0, adm.indexOf('\n  function ajustarJanelaMov()'));

  /* A CHAVE ORDENA PELO VALOR CRU, nunca pelo HTML da célula: a célula da data traz a
     etiqueta "teste" dentro, e ordenar pelo desenho poria todas as de teste juntas como
     se fossem a mesma data. */
  var comChave = (dm.match(/\n      \w+: *\{ t: TIT\[[^\]]+\],(?: num: true,)?\s*\n?\s*k: function/g) || []).length +
                 (dm.match(/\n      \w+: *\{ t: TIT\[[^\]]+\], k: function/g) || []).length;
  ok(comChave >= 12, 'as doze colunas de Movimentos têm chave de ordenação', comChave);
  ok(/k: function\(m\)\{ return m\.dataRef \|\| ''; \}/.test(dm),
    'e a data ordena pelo CARIMBO ISO, não pelo texto "17/09" — como texto, "9/09" ' +
    'cairia depois de "17/09"');
  ok(/k: function\(m\)\{ return Number\(m\.qtd\) \|\| 0; \}/.test(dm),
    'e a quantidade ordena como NÚMERO — como texto, "1.620" vem antes de "810", e é o ' +
    'erro que ninguém confere porque a coluna "parece ordenada"');
  ok(/hora:      \{ t: TIT\['hora'\], k: function\(m\)\{ return m\.dataHora \|\| ''; \}/.test(dm),
    'e a hora ordena pelo carimbo inteiro: duas cargas de dias diferentes na mesma ' +
    'hora empatariam, e o desempate cairia na ordem em que vieram');

  /* ---- A COLUNA DO VEÍCULO ------------------------------------------------
   * A placa era gravada no movimento e NÃO chegava à tela: `listaMovimentos` montava a
   * linha sem ela. Uma coluna posta antes disso nasceria vazia em todas as linhas, e a
   * conclusão natural de quem olhasse seria que ninguém preenche o campo — um dado que
   * existe parecendo um campo abandonado. */
  var log2 = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  ok(/motorista: m\.Motorista \|\| '', veiculo: m\.Veiculo \|\| '', rota: m\.Rota \|\| '',/.test(log2),
    'a placa viaja do servidor até a tela — sem isso a coluna nasce vazia e o dado ' +
    'gravado parece campo que ninguém preenche');
  /* A LIXEIRA MOSTRA OS MESMOS LANÇAMENTOS. Sem a placa lá, quem confere o que foi
     excluído perde a referência de que carro era — justamente no momento em que está
     procurando uma linha específica. */
  ok(/usuario: nome\(mUsers, m\.UsuarioID\), motorista: m\.Motorista \|\| '',\s*\n\s*veiculo: m\.Veiculo \|\| '',/.test(log2),
    'e na lixeira também: é lá que se procura uma linha específica, e a placa é parte ' +
    'de como ela se reconhece');
  /* AO LADO DO MOTORISTA: as duas respondem "quem levou", e no dia em que a carga não
     bate é o par que se procura. Separadas por seis colunas, a conferência teria de
     rolar de lado para juntar as duas metades da resposta. */
  var ordemCols = (adm.match(/padrao: \['data','hora'[^\]]*\]/) || [''])[0];
  ok(ordemCols.indexOf("'veiculo'") === ordemCols.indexOf("'motorista'") + "'motorista',".length,
    'e a placa fica ao lado do motorista — as duas respondem "quem levou", e separadas ' +
    'a conferência rolaria de lado para juntar as duas metades', ordemCols);
  /* VAZIO É RESPOSTA: lançamento antigo, de antes de o veículo existir no cadastro, não
     tem placa. O travessão fraco diz isso; a célula em branco não se distingue de uma
     coluna que não soube responder. */
  ok(/veiculo:   \{ t: TIT\['veiculo'\], k: function\(m\)\{ return m\.veiculo \|\| ''; \}/.test(dm) &&
     /: '<span class="fraco">—<\/span>'; \} \},\s*\n\s*motorista:/.test(dm),
    'e lançamento sem placa mostra o travessão fraco — branco não se distingue de uma ' +
    'coluna que não soube responder');
  /* O CSV LEVA A MESMA COLUNA: tela e arquivo discordando sobre as mesmas linhas fazem
     a conferência de escritório chegar a um número que a tela não explica. */
  ok(/'Rota','Motorista','Veiculo','Quem'/.test(adm) && /m\.veiculo\|\|'',/.test(adm),
    'e o CSV leva a mesma coluna — arquivo e tela discordando fazem a conferência ' +
    'chegar a um número que a tela não explica');

  /* A SETA e o `aria-sort`: a coluna ordenada precisa dizer que está, e dizer também a
     quem usa leitor de tela — sem isso ela é uma coluna qualquer. */
  ok(/var seta = ord \? \(ORDEM_MOV\.desc \? ' ▾' : ' ▴'\) : '';/.test(dm) &&
     /aria-sort="'\+\(ord \? \(ORDEM_MOV\.desc \? 'descending' : 'ascending'\)/.test(dm),
    'a coluna ordenada mostra a seta e diz `aria-sort` — e a seta vira no decrescente');
  ok(/\(c\.d\.k \? 'ordenavel ' : ''\)/.test(dm),
    'e só a coluna com chave promete o clique — as outras não dizem o que não fazem');
  ok(/ligarOrdemColunas\('#tabelaMov', classificarMovPor\);/.test(adm),
    'e o clique é ligado pela mesma função das outras tabelas');
  /* A ORDEM VEM DEPOIS DE `DEFS` e sobre uma cópia; os totais ficam de fora, porque
     somar não depende da ordem e recalcular aqui criaria um segundo caminho para o
     mesmo número. */
  ok(/var linhas = aplicarOrdem\(L, DEFS, ORDEM_MOV\);/.test(dm) &&
     /linhas\.map\(function\(m\)\{/.test(dm),
    'a tabela desenha a lista ORDENADA, e a ordem sai da mesma máquina do Painel');

  /* ---- a janela de linhas ----
     Não é paginação: nenhuma linha some, a tabela rola dentro do quadro com o cabeçalho
     grudado no topo. */
  /* DEZ. O número já foi doze e já foi oito, e cada mudança teve uma medida atrás:
     com DOZE os gráficos nasciam abaixo da dobra — existiam e ninguém via (50% à
     mostra numa janela de 800px); com OITO sobrava folga (92%); e DEZ coube porque o
     título repetido e o subtítulo velho saíram do quadro no caminho, devolvendo 49px.
     A 1456x800 os gráficos começam em 533px e aparecem 87%, inteiros a partir de 850px
     de altura — e o que se comprou com os 5% foram duas linhas de lista, que é o que se
     veio ler.
     O QUE A AFIRMAÇÃO GUARDA não é o número: é que ele more num lugar só, e que a
     função que mede a altura continue existindo. O número é decisão, e muda. */
  ok(/var LINHAS_JANELA_MOV = 10;/.test(adm) &&
     /* TRES vezes: a declaracao, o corte de "poucas linhas" e a conta da altura.
        O que a contagem guarda e o numero nao ser repetido a mao num quarto lugar,
        onde ficaria para tras na proxima mudanca. */
     (adm.match(/LINHAS_JANELA_MOV/g) || []).length === 3 &&
     /function ajustarJanelaMov\(\)\{/.test(adm),
    'a tabela vira uma janela de DEZ linhas, e o número mora num lugar só — mudar ' +
    'quantas aparecem é mexer numa linha',
    (adm.match(/LINHAS_JANELA_MOV/g) || []).length);
  /* E NENHUM NÚMERO SOLTO dentro da função que mede. A contagem acima pega a troca do
     nome por um literal, mas não pega a DUPLICATA — alguém escrever `<= 10` ao lado do
     `<= LINHAS_JANELA_MOV`, que passa a contagem e fica para trás na mudança seguinte.
     Foi a sabotagem que mostrou esse furo.
     O único literal permitido aqui é o `2` da borda: qualquer outro é um segundo lugar
     guardando a mesma decisão. */
  var iAj = adm.indexOf('function ajustarJanelaMov()');
  var aj = iAj > 0 ? adm.slice(iAj, adm.indexOf('\n  }', iAj)) : '';
  var soltos = (aj.replace(/\/\*[\s\S]*?\*\//g, '').match(/(?:^|[^\w.])(\d+)/g) || [])
    .map(function (x) { return x.replace(/\D/g, ''); })
    .filter(function (x) { return x !== '2' && x !== '0'; });
  ok(iAj > 0 && soltos.length === 0,
    'e a função que mede a altura não tem número solto — um `10` escrito ao lado da ' +
    'constante passa pela contagem e fica para trás na mudança seguinte', soltos);
  /* A ALTURA É MEDIDA, e não escrita: ela muda com o zoom, com a fonte do sistema e com
     a etiqueta "teste" dentro da célula da data. Número chutado erra para MENOS, e
     cortar a décima linha pela metade é o jeito mais convincente de a tabela parecer
     quebrada. */
  ok(/var alt = tr\.getBoundingClientRect\(\)\.height;/.test(adm) &&
     /cab\.getBoundingClientRect\(\)\.height \+ alt \* LINHAS_JANELA_MOV/.test(adm),
    'e a altura é MEDIDA da linha real, não escrita no CSS — ela muda com o zoom e com ' +
    'a etiqueta "teste" dentro da célula');
  /* ALTURA ZERO acontece com a aba em segundo plano ou antes de a tela ser pintada.
     Medir nessa hora daria uma janela de 0px e a tabela sumiria. */
  ok(/if \(!alt\) return;/.test(adm),
    'e com altura zero — aba em segundo plano — ela não mede, em vez de fixar a janela ' +
    'em 0px e sumir com a tabela');
  /* Com menos linhas que a janela não há o que limitar: fixar a altura assim mesmo
     deixaria um vazio abaixo da última linha, dentro de uma caixa que não rola. */
  ok(/if \(total <= LINHAS_JANELA_MOV\) \{ wrap\.style\.maxHeight = ''; return; \}/.test(adm),
    'e com poucas linhas ela não limita nada — senão sobraria um vazio embaixo da ' +
    'última, dentro de uma caixa com barra que não rola');
  ok(/window\.addEventListener\('resize', ajustarJanelaMov\);/.test(adm),
    'e remede ao redimensionar: um Ctrl+ deixaria a janela com doze linhas e meia');
})();

console.log('\n== as colunas da tabela de Movimentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* --- a tabela se descreve num lugar so ---------------------------------- */
  var i = adm.indexOf('var TAB_MOV = {');
  var desc = adm.slice(i, adm.indexOf('};', i));
  ok(i > 0, 'a tabela de Movimentos tem um descritor');
  ['padrao', 'larg', 'kOrdem', 'kLarg', 'kOcultas', 'alvo', 'redesenha'].forEach(function (k) {
    ok(desc.indexOf(k + ':') > 0, 'o descritor traz ' + k, desc.slice(0, 120));
  });

  /* As chaves de armazenamento sao OUTRAS. Repetindo as da tabela de ativos, esconder uma
     coluna aqui sumiria com outra la — e as duas listas de colunas nem se parecem. */
  var da = adm.slice(adm.indexOf('var TAB_ATIVOS = {'), adm.indexOf('};', adm.indexOf('var TAB_ATIVOS = {')));
  ['kOrdem', 'kLarg', 'kOcultas'].forEach(function (k) {
    var a = (da.match(new RegExp(k + ": '([^']+)'")) || [])[1];
    var m = (desc.match(new RegExp(k + ": '([^']+)'")) || [])[1];
    ok(a && m && a !== m, 'a chave ' + k + ' é própria de cada tabela', [a, m]);
  });

  /* --- toda coluna de fabrica existe, tem largura e celula ----------------- */
  var ip = desc.indexOf('padrao: [');
  var cols = (desc.slice(ip, desc.indexOf(']', ip)).match(/'(\w+)'/g) || [])
    .map(function (t) { return t.slice(1, -1); });
  ok(cols.length === 15, 'são quinze colunas de fábrica', cols);

  /* AS SETE QUE FORAM SENDO ACRESCENTADAS. Contar quinze não diz QUAIS são quinze:
     trocar `hora` por outra coluna qualquer manteria a conta de pé. Elas respondem
     perguntas que a tabela não respondia — quando isto entrou no sistema, quem mexeu
     depois, quando, em que carro a carga foi, por que rota, e o que foi escrito à mão. */
  [['hora', 'a hora em que o lançamento foi gravado'],
   ['criado', 'o dia em que foi gravado, que nem sempre é o dia da carga'],
   ['alterado', 'quem mexeu por último — sem ela, um número corrigido e um número ' +
                'original são a mesma célula'],
   ['alteradoEm', 'QUANDO mexeram — correção no mesmo dia é acerto de digitação, e ' +
                  'seis dias depois do romaneio é outra conversa'],
   ['veiculo', 'em que CARRO a carga foi — no dia em que ela não bate, é o par ' +
               'motorista-e-placa que se procura'],
   ['rota', 'a ROTA, que estava só na exportação — e dado que só existe no arquivo é ' +
            'dado que ninguém revisa antes de mandar para fora'],
   ['obs', 'a OBSERVAÇÃO, o único texto livre do lançamento: é onde está o porquê de ' +
           'uma linha estranha, e ela também só saía no CSV']].forEach(function (c) {
    ok(cols.indexOf(c[0]) >= 0, 'a tabela de Movimentos traz ' + c[1], cols);
  });

  /* --- AS DUAS CÉLULAS NOVAS, RODADAS, e não lidas ------------------------
   * Procurar `class="corta"` no texto do arquivo prova que a letra está lá, e não que a
   * célula a produz: basta a Obs vir por outro ramo do `? :` para a busca continuar
   * verde e a tabela quebrar. Então as funções saem do arquivo e são EXECUTADAS. */
  var iTit = adm.indexOf('var TIT = TAB_MOV.titulos;');
  var iDefs = adm.indexOf('var DEFS = {', iTit);
  var fimDefs = adm.indexOf('\n    };', iDefs);
  /* O `Q.esc` DE VERDADE, copiado de `app.js`. Um dublê mais fraco — `esc: String`, que
     esta suíte usa noutros lugares — deixaria a asserção de injeção cega: ela procura
     uma aspa que o dublê nunca teria removido. Foi esse o engano da vez passada. */
  var Qesc = { esc: function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  } };
  var DEFS = new Function('Q', 'TIT', adm.slice(iDefs, fimDefs + 7) + ' return DEFS;')(
    Qesc, { rota: 'Rota', obs: 'Observação' });

  ok(DEFS.rota && DEFS.obs, 'as colunas Rota e Observação têm célula própria',
    Object.keys(DEFS || {}));
  ok(DEFS.rota.v({ rota: 'João Pessoa' }).indexOf('João Pessoa') >= 0,
    'a célula da Rota escreve a rota que recebeu');
  ok(DEFS.rota.v({}).indexOf('—') >= 0 && DEFS.obs.v({}).indexOf('—') >= 0,
    'e as duas põem travessão quando não há valor — célula em branco não se distingue ' +
    'de uma coluna que não soube responder');

  /* O CORTE. Sem a classe, `table-layout:fixed` segura a LARGURA da coluna e o texto
     passa por cima da célula vizinha — medido no navegador: a frase pedia 969px numa
     coluna de 224px úteis. E o texto inteiro no `title`, senão cortar vira esconder. */
  var cel = DEFS.obs.v({ obs: 'Deixado no portão dos fundos, conferido com o Seu Joaquim' });
  ok(/class="corta"/.test(cel),
    'a observação sai com a classe que a corta na largura da coluna — sem ela o texto ' +
    'longo atravessa por cima da célula vizinha');
  ok(/title="[^"]*Seu Joaquim/.test(cel),
    'e o texto inteiro fica no `title`: cortar sem deixar como ler é esconder o dado');

  /* INJEÇÃO PELO TEXTO LIVRE. A Obs é digitada por quem lança, e vai para dentro de um
     ATRIBUTO — é o único lugar da tabela onde isso acontece. A busca é por uma aspa DE
     VERDADE: a forma escapada `&quot;` contém as mesmas letras, e procurar sem a aspa
     seria satisfeito pelo próprio escape. */
  var mau = DEFS.obs.v({ obs: 'x" onmouseover="alerta(1)' });
  ok(mau.indexOf('onmouseover="') < 0,
    'e uma observação com aspas não escapa do atributo `title` — ela é texto que o ' +
    'motorista digita, e vai parar dentro de um atributo');

  /* ORDENAR PELO VALOR CRU, nunca pelo HTML: a célula da Obs traz `<span>` e o `title`
     inteiro dentro, e classificar por isso ordenaria pela marcação. */
  ok(DEFS.obs.k({ obs: 'zebra' }) === 'zebra' && DEFS.obs.k({}) === '' &&
     DEFS.rota.k({ rota: 'Recife' }) === 'Recife',
    'e as duas classificam pelo valor cru, não pelo HTML da célula');

  /* --- O NOME DA DATA, e por que não é "Lançamento" ----------------------
   * Três colunas de data seguidas, uma chamada só "Data", não distinguem nada — foi
   * olhando para elas que veio a pergunta "o que são essas duas datas?". O nome batiza
   * o FATO: o dia em que as caixas se moveram.
   * E NÃO "Lançamento": neste sistema "lançar" já quer dizer o ATO de registrar, em
   * quase trinta lugares. A coluna chamada assim soaria como a vizinha "Criado em", e o
   * balão do âmbar — que diz "foi lançado em" — contradiria o cabeçalho na mesma linha.
   * A asserção cobra as duas metades: o nome que entrou E o que não pode entrar. */
  ok(/data:'Movimento'/.test(desc),
    'a coluna da data da operação se chama "Movimento" — "Data", sozinha, não ' +
    'distingue nada de "Criado em" nem de "Hora", e "Data do movimento" repete a ' +
    'palavra que as três colunas já têm em comum');
  ok(!/data:'Lançamento'/.test(desc) && !/data:'Data do lançamento'/.test(desc),
    'e não "Lançamento": aqui lançar é o ATO de registrar, e o nome colidiria com a ' +
    'coluna vizinha e com o balão que diz "foi lançado em"');
  /* O CAMPO DO FORMULÁRIO CONTINUA "Data do movimento", e a diferença é de propósito.
     Um CABEÇALHO rotula uma coluna que a pessoa está lendo, ao lado de "Hora" e "Criado
     em" — ali "Data" é a palavra que as três têm em comum, e repeti-la não distingue
     nada. Um RÓTULO DE FORMULÁRIO pede um valor: "Movimento *" em cima de um seletor de
     data não diz o que se espera dali.
     São dois trabalhos diferentes, e por isso dois nomes. O que não pode é a MESMA
     pergunta ter dois nomes — e os quatro campos de formulário continuam iguais entre
     si, que é o que esta afirmação guarda. */
  var campo = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok((campo.match(/>Data do movimento<span class="obrig">/g) || []).length === 2 &&
     /<label for="crData">Data do movimento<\/label>/.test(campo) &&
     /<label>Data do movimento<\/label><input type="date" id="cData"/.test(adm) &&
     /<label for="lcData">Data do movimento<\/label>/.test(adm),
    'e os quatro campos que a pessoa PREENCHE continuam com o nome inteiro — na Saída, ' +
    'no Retorno, nas duas correções e nos ajustes: um rótulo pede um valor, e ' +
    '"Movimento" sozinho não diz o que se espera dali');

  /* --- A ETIQUETA "teste" SAIU DA LINHA ------------------------------------
   * Ela repetia em CADA linha uma informação já dita duas vezes acima: no cartão "De
   * teste", que conta quantas são, e na legenda, que avisa que elas estão dentro dos
   * números. Quarenta etiquetas âmbar numa coluna de datas é ruído constante — e ruído
   * constante é o que faz ninguém reparar no dia em que ele muda.
   *
   * O QUE SE PERDE: num recorte que misture ensaio e operação real, a linha deixa de
   * dizer qual é qual. Quem precisa separar tem o filtro "Lançamentos", que recorta a
   * lista inteira — e é a ferramenta certa para essa pergunta. */
  ok(!/m\.teste \? ' <span class="tag amarela">teste<\/span>' : ''/.test(adm),
    'a etiqueta "teste" saiu das linhas da tabela — quarenta delas numa coluna de datas ' +
    'repetem o que o cartão e a legenda já dizem');
  /* MAS NÃO DO CSV: lá não há problema de largura, e é onde a conferência de escritório
     separa uma coisa da outra. Tirá-la do arquivo junto seria perder o dado, e não o
     ruído. */
  ok(/'Movimento','Hora','Criado em','Teste',/.test(adm) &&
     /m\.teste\?'SIM':''/.test(adm),
    'mas continua no CSV: lá não há aperto de largura, e é onde a conferência separa ' +
    'ensaio de operação');
  /* E O FILTRO CONTINUA SENDO O CAMINHO para a pergunta "quais são de teste?". */
  ok(/<div><label for="mvTeste">Lançamentos<\/label>/.test(adm),
    'e o filtro "Lançamentos" continua lá — é ele que responde "quais são de teste?" ' +
    'agora que a linha não responde');
  /* A LIXEIRA MOSTRA OS MESMOS LANÇAMENTOS, e o cabeçalho dela é escrito à mão — ela
     não entrou na maquinaria de colunas. Discordar ali é o tipo de coisa que ninguém
     confere, porque quase ninguém abre a lixeira: quem abre está procurando uma linha
     específica, e ler "Data" onde a tabela diz "Movimento" é uma dúvida a mais no pior
     momento possível. */
  ok(/<th style="width:120px">Movimento<\/th><th style="width:70px">Hora<\/th>/.test(adm),
    'e a lixeira chama a coluna pelo mesmo nome, com a mesma largura — ela mostra os ' +
    'mesmos lançamentos, e o cabeçalho dela é escrito à mão');
  /* O BALÃO FALA A MESMA LÍNGUA da coluna: "a carga é de…" ficou de fora porque num
     Retorno as caixas estão voltando, e "carga" lê como se estivessem saindo. */
  ok(/o movimento é de '\+Q\.esc\(Q\.dataBR\(m\.dataRef\)\)/.test(adm) &&
     !/a carga é de/.test(adm),
    'e o balão do âmbar usa a mesma palavra da coluna — "o movimento é de X e foi ' +
    'lançado em Y"');
  /* A LARGURA ACOMPANHA O CABEÇALHO: "Data do movimento" é quatro vezes "Data", e a
     etiqueta "teste" continua dividindo a célula com a data. */
  /* A LARGURA ACOMPANHOU O NOME NOS DOIS SENTIDOS: foi de 150 para 170 quando o título
     virou "Data do movimento", e voltou para 120 quando encurtou para "Movimento" e a
     etiqueta "teste" saiu da célula. Coluna larga demais é espaço roubado das outras
     onze, num cabeçalho que já rola de lado. */
  ok(/data:120/.test(desc),
    'e a largura acompanhou o nome mais curto — larga demais, ela rouba espaço das ' +
    'outras onze colunas');

  var il = desc.indexOf('larg: {');
  var larg = desc.slice(il, desc.indexOf('}', il));
  var semLarg = cols.filter(function (c) { return larg.indexOf(c + ':') < 0; });
  ok(semLarg.length === 0,
    'toda coluna tem largura — `larguras()` só conhece as chaves declaradas, e com ' +
    'table-layout:fixed a que faltar recebe width:undefinedpx e some', semLarg);

  var d = adm.indexOf('function desenharMovimentos()');
  var corpo = adm.slice(d, adm.indexOf('\n    box.querySelectorAll', d));
  var defs = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('var LARG = larguras'));
  var semDef = cols.filter(function (c) { return defs.indexOf('\n      ' + c + ':') < 0; });
  ok(semDef.length === 0, 'e toda coluna tem célula — sem ela o <td> sai vazio', semDef);

  /* --- QUEM mexeu e QUANDO são DUAS colunas -------------------------------
   * O dado sempre existiu em `alterado.em`, e estava só no `title`: é preciso parar o
   * mouse em cima para ver, e no celular não existe balão nenhum. A tela ficava dizendo
   * que mexeram e não dizendo quando — e essa é a pergunta inteira de uma conferência:
   * correção no mesmo dia do lançamento é acerto de digitação, e seis dias depois do
   * romaneio é outra conversa. */
  var iAE = defs.indexOf('\n      alteradoEm:');
  var celAE = iAE > 0 ? defs.slice(iAE, defs.indexOf('\n      origem:', iAE)) : '';
  /* DEPOIS do `'">'`, e não dentro do `title`. Calcular a data não é mostrá-la: a
     primeira versão desta asserção cobrava só a chamada de `Q.dataHoraBR(a.em)`, e a
     sabotagem que devolvia a data para o balão — deixando a célula com "···" na tela —
     passou limpa, porque a chamada continuava lá. O que distingue um do outro é o
     `Q.esc(quando)` estar FORA das aspas do atributo. */
  ok(/Q\.dataHoraBR\(a\.em\)/.test(celAE) &&
     /\+'">'\+\s*\n\s*Q\.esc\(quando\)\+'<\/span>'/.test(celAE),
    'a coluna Alterado em mostra data E hora da última alteração no TEXTO da célula — ' +
    'no balão ela exigia parar o mouse em cima, e no celular não há balão');
  /* Vazio é RESPOSTA: ninguém mexeu. Célula em branco não se distingue de uma coluna
     que não soube responder. */
  ok((celAE.match(/<span class="fraco">—<\/span>/g) || []).length === 2,
    'e vazia ela diz "—" fraco nos dois caminhos — sem alteração e sem data gravada — ' +
    'porque branco não se distingue de coluna que não soube responder');
  /* SÓ CONSULTA NÃO É ALTERAÇÃO, pela mesma regra da coluna ao lado: a data de quem
     abriu e gravou sem mudar nada faria a conferência procurar uma diferença que não
     existe naquela data. */
  ok(/if \(!a\.vezes\) \{[\s\S]{0,300}\(consulta\)/.test(celAE),
    'e a data de quem só consultou vem dita pelo que é — senão a conferência procura ' +
    'uma diferença que não existe naquela data');
  /* A TELA E O ARQUIVO CONTAM A MESMA COISA. O CSV já levava "Alterado em" quando a
     tela não levava, e tela e arquivo discordando sobre as mesmas linhas fazem a
     conferência de escritório chegar a um número que a tela não explica. */
  ok(/'Alterado por','Alterado em'/.test(adm) &&
     /a\.em\?Q\.dataHoraBR\(a\.em\):''/.test(adm),
    'e o CSV leva a mesma coluna, com o mesmo formato — arquivo e tela discordando ' +
    'fazem a conferência chegar a um número que a tela não explica');
  /* NO CELULAR NÃO HÁ BALÃO, e é no celular que o conferente está. */
  ok(/alterado por <b>'\+Q\.esc\(alt\.por\|\|'—'\)\+'<\/b>'\+\s*\n\s*\(alt\.em \? ' em <b>'\+Q\.esc\(Q\.dataHoraBR\(alt\.em\)\)/
       .test(adm),
    'e o cartão do celular diz a data junto com o nome — lá o balão não existe, e é ' +
    'lá que o conferente está');

  /* --- cabecalho e celulas saem da MESMA lista ----------------------------
     A folga subiu de 260 para 460 porque o `<th>` ganhou a seta e o `aria-sort` da
     classificação — e o que a afirmação guarda é que o cabeçalho sai da lista `cs`, não
     o tamanho do trecho entre uma coisa e outra. */
  /* O ORÇAMENTO DE DISTÂNCIA MEDE CÓDIGO, e não prosa. Ele já tinha sido inflado de 260
     para 460 uma vez, e reprovou de novo quando um comentário de três linhas entrou
     entre a lista e a célula — sem que nada da garantia mudasse. Número que só cresce é
     número medindo a coisa errada: os comentários saem antes da conta, e o que sobra é
     a distância entre o `cs.map` e a marcação que ele monta. */
  var corpoSem = semComentarios(corpo);
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,320}<th/.test(corpoSem),
    'o cabeçalho percorre a lista de colunas');
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,120}<td/.test(corpoSem),
    'e as células percorrem a MESMA lista — não há duas strings para lembrar de casar');
  ok(/<table class="fixa">/.test(corpo),
    'a tabela é de layout fixo: em layout automático a largura pedida vira sugestão, e ' +
    'arrastar a borda não muda quase nada');

  /* --- a coluna de acoes fica FORA do sistema ----------------------------- */
  ok(corpo.indexOf("'<th></th></tr></thead>") > 0,
    'a coluna de ações é um <th> à parte, sem data-col', corpo.slice(corpo.indexOf('<th></th>') - 120, corpo.indexOf('<th></th>') + 40));
  ok(cols.indexOf('acoes') < 0,
    'e não está na lista de fábrica: escondível, alguém a esconderia sem querer e ' +
    'perderia o único jeito de corrigir um lançamento; arrastável, cairia no meio da leitura');
  ok(/data-corrigir=/.test(corpo) && /data-cancelar=/.test(corpo) && /data-excluir=/.test(corpo),
    'e os três botões continuam nela');

  /* --- a maquinaria e a mesma, com a outra tabela -------------------------- */
  ['ligarArrastarColunas(TAB_MOV)', 'ligarLarguraColunas(TAB_MOV)',
   'larguras(TAB_MOV)', 'ordemColunas(TAB_MOV)', 'colunasOcultas(TAB_MOV)',
   ].forEach(function (c) {
    ok(adm.indexOf(c) > 0, 'usa a mesma função: ' + c);
  });

  /* --- desenhar e buscar sao coisas diferentes ---------------------------- */
  /* Arrastar uma coluna nao pode custar uma ida de rede — e, pior, os 500 lancamentos
     voltariam noutra ordem se alguem tivesse lancado no meio, e a linha sob o cursor
     mudaria de dono. */
  ok(adm.indexOf('function desenharMovimentos()') > 0 &&
     /redesenha: function\(\)\{ desenharMovimentos\(\); \}/.test(desc),
    'redesenhar não refaz a busca: o desenho é função própria, e é ela que o arrasto chama');
  var cm = adm.indexOf('function carregarMovimentos()');
  var busca = adm.slice(cm, adm.indexOf('\n  }', cm));
  ok(/MOVS = r\.movimentos;\s*\n\s*desenharMovimentos\(\);/.test(busca),
    'a busca guarda o resultado e manda desenhar', busca.slice(-200));

  /* O painel proprio desta barra foi embora: esconder, mover e expandir mudaram para a
     aba Colunas, onde se gerencia todos os modulos de uma vez. A tabela continua
     obedecendo, porque le o mesmo armazenamento — e isso esta testado no bloco da aba. */
  ok(adm.indexOf('btnColunasMov') < 0 && adm.indexOf('colunasMovPop') < 0,
    'e a barra não tem mais painel próprio de colunas: elas mudaram para a aba Colunas');

})();

console.log('\n== a tabela de Usuários entrou na maquinaria de colunas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  var d = adm.indexOf('function desenharUsuarios(digitando){');
  var dk = adm.indexOf('{', d), dn = 0;
  do {
    if (adm[dk] === '{') dn++; else if (adm[dk] === '}') dn--;
    dk++;
  } while (dn > 0 && dk < adm.length);
  var fonte = adm.slice(d, dk);
  ok(d > 0 && fonte.length > 1200 && fonte.indexOf('</tbody></table>') > 0,
    'o recorte pegou a função inteira', fonte.length);

  /* AS DEFINIÇÕES DE COLUNA saíram de dentro do `desenharUsuarios` e viraram
     `colunasUsuarios()`. Não foi arrumação: era por estarem escondidas ali dentro que
     só a tabela as enxergava, e a busca tinha a lista de campos DELA, escrita à parte.
     Duas listas para a mesma tabela divergem na primeira coluna nova — e divergiram:
     a busca ficou procurando em três colunas de nove. */
  var c0 = adm.indexOf('function colunasUsuarios(){');
  var ck = adm.indexOf('{', c0), cn = 0;
  do {
    if (adm[ck] === '{') cn++; else if (adm[ck] === '}') cn--;
    ck++;
  } while (cn > 0 && ck < adm.length);
  var cols = adm.slice(c0, ck);
  ok(c0 > 0 && cols.length > 2000, 'as colunas moram numa função própria', cols.length);
  ok(/var DEFS = colunasUsuarios\(\);/.test(fonte),
    'e a tabela lê dela — não tem cópia própria');
  ok(/var DEFS = colunasUsuarios\(\);/.test(
       adm.slice(adm.indexOf('function usuariosNaTela(){'),
                 adm.indexOf('function usuariosNaTela(){') + 900)),
    'e a BUSCA lê da mesma: é isso que faz coluna nova nascer encontrável, sem ' +
    'ninguém lembrar de mexer numa segunda lista');

  /* O cabecalho escrito a mao nao pode sobrar em lugar nenhum: sobrando, seriam duas
     listas de colunas para a mesma tabela, e a escondida continuaria aparecendo. */
  ok(adm.indexOf('montarTabelaUsuarios') < 0,
    'a montagem antiga, com o cabeçalho escrito à mão, não ficou para trás');
  ok(fonte.indexOf('<th>Nome</th>') < 0 && fonte.indexOf('<th>Perfil</th>') < 0,
    'e o cabeçalho sai da lista de colunas, não de HTML escrito à mão');

  /* Cabecalho e celula saem da MESMA lista. Duas listas divergem na primeira coluna nova:
     uma ganha titulo sem celula, ou celula sem titulo, e a tabela desalinha inteira. */
  ok((fonte.match(/cs\.map\(function\(c\)/g) || []).length === 2,
    'cabeçalho e células iteram a mesma lista `cs` — duas listas desalinhariam a tabela ' +
    'inteira na primeira coluna nova', (fonte.match(/cs\.map\(/g) || []).length);

  ok(/<table class="fixa">/.test(fonte),
    'a tabela pede a classe `fixa` — sem ela a largura pedida vira sugestão');
  ok(/ligarArrastarColunas\(TAB_USUARIOS\)/.test(fonte) &&
     /ligarLarguraColunas\(TAB_USUARIOS\)/.test(fonte),
    'e liga arrastar e redimensionar, com o descritor dela');
  /* A alcinha passou a sair de `puxador()`, que é quem decide se ela existe: sem
     permissão o <th> sai sem ela, sem `draggable` e sem o convite no balão. O `data-col`
     fica em todas — é por ele que a aba Colunas e a classificação se agarram, e os dois
     valem para quem não arranja nada. */
  ok(/data-col="'\+c\.id\+'"/.test(fonte) && /puxador\(\)\+'<\/th>'/.test(fonte) &&
     /<th'\+arrastavel\(\)\+' data-col=/.test(fonte),
    'cada título sai com o `data-col`, e a alcinha e o `draggable` vêm das funções que ' +
    'conhecem a permissão — é por eles que as duas se agarram');

  /* A coluna de acoes fica FORA. Escondivel, alguem a esconde sem querer e perde o unico
     jeito de editar, desativar ou excluir um cadastro. */
  var i0 = fonte.indexOf('padrao:');
  var ids = ['nome', 'perfil', 'usuario', 'email', 'senha', 'painel', 'local',
             'veiculo', 'telefone', 'ativo'];
  var descr = adm.slice(adm.indexOf('var TAB_USUARIOS = {'),
                        adm.indexOf('\n  };', adm.indexOf('var TAB_USUARIOS = {')));
  /* AS TRÊS PARTES, SEPARADAS — e não o descritor inteiro. Procurando `veiculo:` no
     bloco todo, o `larg` e o `titulos` respondiam pelo `padrao`, e é o `padrao` que faz
     a coluna EXISTIR: é dele que o `ordemColunas` tira a lista, e o que não está lá
     não é desenhado. Medido: arrancar 'veiculo' do `padrao` — a coluna some da tela —
     passava por esta asserção, e passava pelas dez, porque o furo nunca foi do
     `veiculo`, foi da forma de perguntar. */
  function parte(de, ate) {
    return descr.slice(descr.indexOf(de + ':'), descr.indexOf(ate + ':'));
  }
  var PARTES = [
    ['padrao',  parte('padrao', 'larg'),      'é dele que sai a lista de colunas a desenhar'],
    ['larg',    parte('larg', 'titulos'),     'sem largura de fábrica a coluna nasce com a genérica'],
    ['titulos', parte('titulos', 'kOrdem'),   'é daqui que a aba Colunas tira o NOME dela']
  ];
  ids.forEach(function (id) {
    PARTES.forEach(function (p) {
      ok(p[1].indexOf("'" + id + "'") > 0 || new RegExp('\\b' + id + ':').test(p[1]),
        'a coluna ' + id + ' está em `' + p[0] + '` — ' + p[2]);
    });
  });
  ok(descr.indexOf('editar') < 0 && descr.indexOf('acoes') < 0,
    'e a coluna dos botões fica FORA do sistema: escondível, alguém a esconderia sem ' +
    'querer e perderia o único jeito de mexer num cadastro');
  ok(/data-editar-user/.test(fonte) && /data-excluir-user/.test(fonte) &&
     /data-ativar/.test(fonte),
    'os três botões continuam na linha');

  /* A busca e o redesenho tem de passar pelo MESMO caminho. Foi a separacao entre montar
     a tabela e religar os botoes que ja deixou a busca com editar/excluir mortos. */
  ok(/ligarBotoesUsuarios\(\);/.test(fonte),
    'desenhar a tabela religa os botões dela — separados, digitar na busca deixava ' +
    'editar, ativar e excluir sem efeito, e a tela parecia funcionar');
  /* A busca chama um INVÓLUCRO, e não `desenharUsuarios` direto — o `input` passa o
     evento como primeiro argumento, e um evento é sempre verdadeiro: ligada direto, ela
     desligaria a entrada dos cartões em todo redesenho, inclusive nos que não vêm de
     digitação. O invólucro existe por causa disso, e chama o mesmo caminho. */
  ok(/getElementById\('buscaUsuarios'\)\.addEventListener\('input', desenharUsuariosDigitando\)/
      .test(adm) &&
     /function desenharUsuariosDigitando\(\)\{ desenharUsuarios\(true\); \}/.test(adm),
    'e a busca chama esse mesmo caminho, em vez de montar a tabela por fora');

  /* O subtitulo do cabecalho NAO entra em `titulos`: a aba Colunas precisa do nome da
     coluna, e "entra no app e no painel" e explicacao, nao nome. */
  ok(/sub: 'entra no app e no painel'/.test(cols),
    'o subtítulo do cabeçalho mora na definição da célula');
  ok(descr.indexOf('entra no app') < 0 && /usuario:'Usuário'/.test(descr.replace(/\s+/g, '')),
    'e não no `titulos`, que é de onde a aba Colunas tira o NOME da coluna', descr);
})();

console.log('\n== a porta para o painel, no app de campo ==');
(function () {
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* O LINK existia so na tela de entrada, e sumia no instante em que a pessoa entrava.
     Quem tinha o painel liberado nao tinha por onde chegar nele: era preciso sair, ou
     saber o endereco de cor. As abas do painel estavam certas o tempo todo — a pessoa e
     que nunca chegava la. */
  /* A porta mora na NAVEGACAO LATERAL agora, e nao mais num chip do cabecalho — o
     cabecalho deixou de existir. O recorte segue a lateral. */
  var iH = idx.indexOf('<aside class="lateral"');
  var cab = idx.slice(iH, idx.indexOf('</aside>', iH));
  ok(iH > 0 && cab.indexOf('chipSair') > 0, 'o recorte pegou a navegação lateral', cab.length);
  ok(/id="chipPainel"/.test(cab),
    'quem já entrou tem por onde chegar ao painel — sem isto, o link só existe na tela ' +
    'de entrada e some assim que a pessoa entra');
  ok(/<a class="nav-link nav-saida" id="chipPainel" href="admin\.html"/.test(cab),
    'e é um link de verdade, com href: abre em aba nova pelo clique do meio, como todo link');
  ok(/id="chipPainel"[^>]*\shidden/.test(cab),
    'nasce escondida — quem decide é o cadastro, não o HTML');

  /* QUEM a ve. Porta que leva a uma recusa e pior do que porta nenhuma. */
  var ia = idx.indexOf('function aplicarSessao(s)');
  var ik = idx.indexOf('{', ia), inn = 0;
  do {
    if (idx[ik] === '{') inn++; else if (idx[ik] === '}') inn--;
    ik++;
  } while (inn > 0 && ik < idx.length);
  var fonte = idx.slice(ia, ik);
  ok(ia > 0 && fonte.indexOf('chipPainel') > 0 && fonte.indexOf('ajustarAbas') > 0,
    'o recorte pegou a função que aplica a sessão na tela', fonte.length);

  /* Roda a funcao de verdade, com um `document` de mentira: o que interessa e a DECISAO,
     e ela tem de sair do arquivo, nao de uma copia da regra escrita aqui. */
  function porta(s) {
    var alvo = {};
    /* `querySelector` devolve null de proposito: e por ele que a aba Lancamentos some, e
       este recorte e sobre a PORTA do painel. Null e o caso real de quem abre o app sem
       a aba na tela, entao o codigo tem de aguentar sem estourar. */
    /* `Q` de mentira tambem: `aplicarSessao` escreve quem esta logado pelo `Q.quemEsta()`,
       e sem ele a funcao estoura antes de chegar na decisao que se quer medir.

       Mas o `Q.podePainel` NAO e de mentira: e a funcao de verdade, recortada do
       `app.js`. Imita-la aqui mediria a minha copia da regra, e nao a regra — que e
       exatamente o defeito que este bloco existe para pegar. */
    return new Function('s', 'document', 'ajustarAbas', 'Q',
      fonte + '\n aplicarSessao(s); return !document.getElementById("chipPainel").hidden;')(
      s, { getElementById: function (id) { return alvo[id] || (alvo[id] = {}); },
           querySelector: function () { return null; } },
      function () {}, { quemEsta: function () {}, podePainel: REGRA_PAINEL });
  }

  [['o ADMIN vê, mesmo com a chave desligada — `podeVerPainel()` é a autoridade, e vale ' +
    'mais que a coluna', { nome: 'a', perfil: 'Admin', acessoPainel: false }, true],
   ['quem tem a chave ligada vê', { nome: 'b', perfil: 'Gerente', acessoPainel: true }, true],
   ['quem não tem, não vê — porta que leva a uma recusa é pior que porta nenhuma',
    { nome: 'c', perfil: 'Gerente', acessoPainel: false }, false],
   ['o motorista não vê', { nome: 'd', perfil: 'Motorista', acessoPainel: false }, false],
   /* Sessao de antes de a chave existir: vale a regra antiga por perfil, para nao tirar
      a porta de quem ja a tinha no dia do deploy. */
   ['o conferente de sessão antiga continua vendo', { nome: 'e', perfil: 'Conferente' }, true],
   ['e o motorista de sessão antiga continua sem ver', { nome: 'f', perfil: 'Motorista' },
    false]
  ].forEach(function (c) {
    ok(porta(c[1]) === c[2], c[0], { perfil: c[1].perfil, viu: porta(c[1]) });
  });

  /* Tudo o que a sessao manda na tela passa por UMA funcao. Espalhado entre a abertura e
     a renovacao, a renovacao esquece alguma coisa — e esquece calada. */
  ok((idx.match(/aplicarSessao\(/g) || []).length >= 3,
    'abertura e renovação aplicam a sessão pelo mesmo caminho',
    (idx.match(/aplicarSessao\(/g) || []).length);
  ok(!/document\.getElementById\('chipPainel'\)/.test(idx.replace(fonte, '')),
    'e só ela mexe na porta — um segundo lugar decidindo o mesmo acaba discordando');

  /* --- a releitura da permissao ------------------------------------------- */
  var ir = idx.indexOf('function renovarSessao()');
  var rk = idx.indexOf('{', ir), rn = 0;
  do {
    if (idx[rk] === '{') rn++; else if (idx[rk] === '}') rn--;
    rk++;
  } while (rn > 0 && rk < idx.length);
  var rec = idx.slice(ir, rk);
  ok(ir > 0 && rec.indexOf('meuAcesso') > 0, 'o recorte pegou a releitura', rec.length);
  ok(/Q\.get\(\{acao:'meuAcesso', id:s\.id\}\)/.test(rec),
    'o app de campo relê a própria permissão — sem isto, liberar o painel para quem está ' +
    'com o app aberto não muda nada na tela dele até ele sair e entrar');
  ok(/Q\.entrar\(r\.usuario\)/.test(rec) && /aplicarSessao\(r\.usuario\)/.test(rec),
    'e o que voltou é gravado E aplicado — gravar sem aplicar só valeria na próxima visita');
  /* Nao basta o `catch` existir: o que importa e ele nao FAZER nada. Um `catch` que
     encerra a sessao poe a pessoa para fora sempre que a rede falha — e no campo a rede
     falha o tempo todo. Procurar so a palavra `catch` nao distingue os dois. */
  var iC = rec.indexOf('.catch(');
  var corpoCatch = rec.slice(iC, rec.indexOf('}', rec.indexOf('{', iC)) + 1);
  ok(iC > 0 && !/Q\.sair|Q\.entrar|aplicarSessao/.test(corpoCatch),
    'sem rede não mexe em nada: fica o que já estava, que é o que valia até agora — um ' +
    '`catch` que encerra a sessão poria a pessoa para fora a cada falha de rede, e no ' +
    'campo a rede falha o tempo todo', corpoCatch);
  ok(/if \(!r \|\| r\.ok === false\) return;/.test(rec),
    'e resposta ruim também não');
  ok(/if \(!r\.usuario\)\{/.test(rec) && /Q\.sair/.test(rec),
    'mas cadastro apagado ou desativado encerra a sessão, com aviso — ficar dentro só ' +
    'adiaria a descoberta para o próximo lançamento recusado');

  /* Ela roda DEPOIS de a tela estar montada: e um retoque, nao uma tranca. Rodando antes,
     uma rede lenta seguraria a tela inteira. */
  var ab = idx.indexOf('function abrirApp()');
  var corpoAb = idx.slice(ab, idx.indexOf('\n  }', ab));
  /* Ela e a ULTIMA coisa de `abrirApp`, depois do que monta a tela e do que busca os
     dados. Comparar so com `aplicarSessao` nao dizia nada: ele e a primeira linha, e
     qualquer ordem passava. O que interessa e que nada dependa dela para aparecer. */
  var passos = ['aplicarSessao(', 'Q.carregarDados(', 'carregarPainel()', 'renovarSessao()']
    .map(function (p) { return { p: p, i: corpoAb.indexOf(p) }; });
  ok(passos.every(function (x) { return x.i > 0; }),
    'os quatro passos da abertura estão lá', passos);
  ok(passos[3].i === Math.max.apply(null, passos.map(function (x) { return x.i; })),
    'e a releitura é a ÚLTIMA — ela é um retoque, não uma tranca: na frente, uma rede ' +
    'lenta seguraria a tela inteira de quem só quer lançar',
    passos.map(function (x) { return x.p; }));

  ok(/a\.chip\{/.test(css) && /\[hidden\]\{display:none!important\}/.test(css),
    'e o estilo do link existe, inclusive o `hidden` — sem essa regra o `display` do ' +
    'chip venceria o `hidden` e a porta apareceria para todo mundo');
})();

console.log('\n== o formulario de usuario abre mostrando o que esta gravado ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* O corpo de `formUsuario`, e dentro dele o PEDACO QUE MONTA O HTML: da chamada
     `modal(` ate o `);` que a fecha. Tudo o que esse pedaco interpola ja precisa valer
     quando ele roda. */
  var iFn = adm.indexOf('function formUsuario(u){');
  var corpo = adm.slice(iFn, adm.indexOf('\n  function salvar(', iFn));
  var iAbre = corpo.indexOf("modal('<h2>'+(u.ID?'Editar':'Novo')+' usuário</h2>'");
  var iFecha = corpo.indexOf("id=\"fSalvar\">Salvar</button></div>');");
  ok(iFn > 0 && iAbre > 0 && iFecha > iAbre,
    'dá para achar o trecho que monta o formulário de usuário', [iFn, iAbre, iFecha]);
  var html = corpo.slice(iAbre, iFecha);
  var depois = corpo.slice(iFecha);

  /* `inicial` diz qual das quatro opcoes de "Pode entrar no painel?" nasce escolhida.
     Calculado DEPOIS do HTML que o le, `var` e icado: o nome existe, vale `undefined`,
     nenhuma das quatro comparacoes bate, nenhuma opcao nasce `selected` — e o navegador
     escolhe a primeira, que e "nao".

     Medido no navegador, com a resposta real do servidor: Nestor Neto tinha
     `AcessoPainel:true` gravado e o formulario abria em "nao — so o app de campo", com
     as abas travadas e um aviso dizendo que a culpa era de uma chave que ELE tinha
     ligada. Salvar qualquer outra coisa dali tirava o acesso dele. Nao dava erro
     nenhum; so mentia — e por isso a configuracao "nunca ficava salva". */
  ok(corpo.indexOf('var inicial = (function(){') > 0 &&
     corpo.indexOf('var inicial = (function(){') < iAbre,
    'o `inicial` é calculado ANTES do HTML que o lê — calculado depois ele vale ' +
    '`undefined`, nenhuma opção nasce `selected`, e o navegador escolhe a primeira, ' +
    'que é "não"',
    { inicial: corpo.indexOf('var inicial = (function(){'), html: iAbre });

  /* As quatro opcoes, e cada uma sabe quando e a escolhida. Faltando o `selected` numa
     delas, o formulario de quem esta naquele estado abre dizendo outra coisa. */
  ['NAO', 'TODOS', 'EU', 'ESCOLHIDOS'].forEach(function (v) {
    ok(html.indexOf("'<option value=\"" + v + "\"'+(inicial==='" + v + "'?' selected':'')") > 0,
      'a opção ' + v + ' nasce escolhida quando é ela que está gravada');
  });

  /* Cada pergunta na secao que corresponde ao que ela faz.

     "Ve os lancamentos?" e "De quem ela ve os lancamentos" estavam embaixo de "O que ele
     pode lancar", onde liam como permissao de LANCAR. As duas dizem o que APARECE para a
     pessoa — igualzinho ao quadro das abas do painel, que fica logo acima. Agora as tres
     estao juntas em "O que ele ve no painel", e "O que ele pode lancar" comeca no que ela
     de fato faz: a operacao. */
  function onde(t) { return html.indexOf(t); }
  var oVe = onde('>O que ele vê no painel</h3>');
  var oAbas = onde("caixaLocais('fAbas'");
  var oLanc = onde('>Lançamentos</h3>');
  var oVistos = onde("caixaLocais('fUsuariosVistos'");
  var oPode = onde('>O que ele pode lançar</h3>');
  var oOper = onde("caixaLocais('fOperacoes'");
  ok(oVe > 0 && oAbas > oVe && oLanc > oAbas && oVistos > oLanc && oPode > oVistos &&
     oOper > oPode,
    'as perguntas sobre o que a pessoa VÊ ficam juntas em "O que ele vê no painel" — ' +
    'abas, depois lançamentos —, e "O que ele pode lançar" só começa na operação',
    { ve: oVe, abas: oAbas, lancamentos: oLanc, vistos: oVistos, podeLancar: oPode,
      operacoes: oOper });

  /* O seletor e a lista sao encadeados: a lista so faz sentido depois da pergunta. */
  ok(onde("id=\"fVerLanc\"") > 0 && onde("id=\"fVerLanc\"") < oVistos,
    'e "Vê os lançamentos?" vem antes da lista de quem ela vê — a lista só faz sentido ' +
    'depois da pergunta que a liga');

  /* A REGRA, e nao so este caso: NENHUM nome que o HTML interpola pode ser declarado
     depois dele. Tirando os literais entre aspas, o que sobra do trecho sao as
     expressoes JavaScript — e nenhuma delas pode apontar para um `var` de baixo.

     Sem esta verificacao, a proxima conta escrita no lugar errado volta a mentir do
     mesmo jeito, e de novo sem erro nenhum para denunciar. */
  /* Comentarios PRIMEIRO: a prosa deles tem palavras que sao nomes validos
     ('ativo', 'quadros', 'caixa'), e deixadas ali elas viram acusacao falsa. */
  var expressoes = html.replace(/\/\*[\s\S]*?\*\//g, ' ')
                       .replace(/\/\/[^\n]*/g, ' ')
                       .replace(/'[^']*'/g, ' ')
                       /* E o que vem depois de um ponto é propriedade, não variável:
                          `Q.ativo(...)` não fala do `var ativo` de baixo. */
                       .replace(/\.\s*[A-Za-z_$][\w$]*/g, ' ');
  var declaradosDepois = {};
  (depois.match(/\bvar\s+([A-Za-z_$][\w$]*)/g) || []).forEach(function (m) {
    declaradosDepois[m.replace(/\bvar\s+/, '')] = true;
  });
  var tarde = [];
  (expressoes.match(/[A-Za-z_$][\w$]*/g) || []).forEach(function (n) {
    if (declaradosDepois[n] && tarde.indexOf(n) < 0) tarde.push(n);
  });
  ok(tarde.length === 0,
    'e nenhum nome que o formulário interpola é declarado depois dele — `var` é içado, ' +
    'e o nome vale `undefined` sem dar erro: o campo abre errado calado', tarde);
})();

console.log('\n== o painel nasce fechado, e so abre o que a pessoa pode ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* O DEFEITO: ao entrar, as sete abas apareciam por segundos e so depois a peneira
     rodava — ela precisa do catalogo de abas, que chega pela rede. Nesse intervalo a
     pessoa via Ajustes e Cadastros e podia CLICAR: as paginas existem no HTML e a API
     nao tem autorizacao nenhuma.

     Errar para o lado de MOSTRAR se corrige no cadastro; errar aqui entrega a tela. */
  var iNav = adm.indexOf('<nav class="abas" id="abas"');
  var nav = adm.slice(iNav, adm.indexOf('</nav>', iNav));
  var botoes = nav.match(/<button[^>]*data-pagina="[^"]+"/g) || [];
  var visiveis = botoes.filter(function (b) { return b.indexOf('display:none') < 0; });
  ok(botoes.length >= 7 && visiveis.length === 0,
    'nenhuma aba do painel nasce visível — enquanto a peneira não roda, quem tem menos ' +
    'permissão veria (e poderia clicar) as abas dos outros',
    { abas: botoes.length, visiveis: visiveis });

  /* `style="display:none"`, e nao o atributo `hidden`: ha seletores em producao que
     procuram `:not([style*="none"])` para achar a primeira aba liberada, e trocar o
     mecanismo aqui os deixaria achando abas escondidas. */
  ok(adm.indexOf(':not([style*="none"])') > 0,
    'e o mecanismo é o mesmo que a peneira já usa — `hidden` deixaria os seletores de ' +
    '"primeira aba liberada" achando aba escondida');

  /* Nenhuma PAGINA nasce aberta, pelo mesmo motivo: o conteudo aparecia junto com as
     abas, e o Painel de Ativos ficava a vista para quem nao tem a aba dele. */
  var paginas = adm.match(/<section id="pg[A-Za-z]+" class="pagina[^"]*"/g) || [];
  var abertas = paginas.filter(function (p) { return p.indexOf('ativa') >= 0; });
  ok(paginas.length >= 6 && abertas.length === 0,
    'e nenhuma página nasce aberta — o conteúdo aparecia junto com as abas, e quem abre ' +
    'a primeira é a peneira, depois de saber o que a pessoa pode ver', abertas);

  /* Navegacao em branco parece tela quebrada, e a pessoa recarrega. Ela diz o que esta
     acontecendo enquanto nao sabe. */
  ok(adm.indexOf('id="abasCarregando"') > 0,
    'o lugar das abas diz que está carregando — em branco, parece tela quebrada');
  var iF = adm.indexOf('function ajustarAbasPainel(s)');
  var fn = adm.slice(iF, adm.indexOf('\n  }', iF));
  ok(iF > 0 && /carregando\.hidden = true/.test(fn),
    'e o aviso sai quando a peneira roda — deixado ali, diria que ainda está carregando ' +
    'sobre uma navegação pronta');

  /* Ninguem pode acabar num painel mudo. */
  ok(/if \(!primeira && carregando\)/.test(fn),
    'e quem não tem página nenhuma liberada recebe a frase, em vez de um painel vazio ' +
    'sem explicação', fn);

  /* SE A REDE FALHAR a peneira nunca roda, e as abas ficam escondidas para sempre. O
     `toast` some em segundos; quem chegar depois dele so ve o vazio. */
  var iC = adm.indexOf('function carregarEquipe()');
  var ce = adm.slice(iC, adm.indexOf('\n  }', iC));
  /* A CONDICAO, e nao o texto: um `if (false)` na frente dela deixa a frase inteira no
     arquivo e o aviso morto. Procurar a mensagem encontrava as duas coisas. */
  ok(iC > 0 &&
     /if \(carregando && !document\.querySelector\('#abas button\.ativa'\)\) \{/.test(ce) &&
     /Não consegui carregar suas permissões/.test(ce),
    'e se a `equipe` falhar a lateral explica, em vez de ficar vazia para sempre — o ' +
    '`toast` some em segundos e quem chegar depois dele só vê o branco', ce);

  /* O `return` que causava tudo continua la, e agora ele e o COMPORTAMENTO CERTO: sem
     catalogo, nao mostra nada. Antes ele era inofensivo so porque as abas nasciam
     visiveis. */
  ok(/if \(!ABAS_PAINEL\.length\) return;/.test(fn),
    'sem o catálogo a peneira não mostra nada — o mesmo `return` de antes, que só era ' +
    'inofensivo porque as abas nasciam visíveis');
})();

console.log('\n== quem esta logado e a rede, na barra de app ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var telas = {
    'index.html': fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
    'admin.html': fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
  };

  /* Ao levar os chips para dentro da gaveta, quem esta logado e o estado da rede sumiram
     do celular: com a gaveta fechada nao havia como saber nenhum dos dois. E "3 na fila"
     e justamente o aviso que nao pode esperar um toque — quem esta no galpao precisa
     saber que o lancamento nao saiu. */
  Object.keys(telas).forEach(function (arq) {
    var t = telas[arq];
    var i = t.indexOf('<header class="topo">');
    var topo = t.slice(i, t.indexOf('</header>', i));
    ok(i > 0 && topo.indexOf('id="avatarTopo"') > 0,
      arq + ': a barra de app diz quem está logado — na gaveta fechada, é a única pista');

    /* O GATILHO DA GAVETA FICA A DIREITA, e e o ultimo da barra: e o canto que o polegar
       alcanca com o celular na mao, e o app e usado de pe, no galpao, de luva. A ordem e
       marca -> conta -> gatilho. */
    ok(topo.indexOf('id="btnMenu"') > topo.indexOf('class="topo__conta"') &&
       topo.indexOf('class="topo__conta"') > topo.indexOf('class="topo__marca"'),
      arq + ': o gatilho da gaveta é o ÚLTIMO da barra — é o canto que o polegar alcança ' +
      'com o celular na mão, e a marca abre a linha',
      { marca: topo.indexOf('class="topo__marca"'),
        conta: topo.indexOf('class="topo__conta"'),
        menu: topo.indexOf('id="btnMenu"') });
    ok(topo.indexOf('id="pontoRede"') > 0,
      arq + ': e tem o ponto de estado da rede');
    ok(topo.indexOf('id="avisoRede"') > 0,
      arq + ': e onde escrever o aviso quando houver o que avisar');
    /* O ponto mora DENTRO do circulo. A forma inteira, e nao "um vem depois do outro":
       fechar o circulo antes do ponto deixa os dois na ordem certa e o ponto solto na
       barra, sem dono e sem a borda que o descola do fundo. */
    ok(/<span class="avatar" id="avatarTopo"[^>]*>[^<]*<span class="ponto" id="pontoRede"><\/span><\/span>/
      .test(topo),
      arq + ': e o ponto mora dentro do círculo — fechado antes dele, vira uma bolinha ' +
      'solta na barra, sem dono');

    /* E o grupo inteiro nao pode nascer escondido: um `hidden` nele apaga as tres coisas
       de uma vez, e o HTML continua tendo todos os ids que os testes procuram. */
    ok(!/<div class="topo__conta"[^>]*\shidden/.test(topo),
      arq + ': e o canto direito não nasce escondido — um `hidden` nele apaga as três ' +
      'peças de uma vez, e os ids continuam todos no arquivo');
  });

  /* UMA CONTA SO para os tres lugares. Tres contas sobre o estado da rede discordam no
     primeiro ajuste, e a que discordar mente calada: alguem veria ponto verde com
     lancamento preso na fila. */
  var iB = js.indexOf('function atualizarBadge()');
  var badge = js.slice(iB, js.indexOf('\n  }', iB));
  ok(iB > 0 && /var estado, texto;/.test(badge),
    'o estado da rede é calculado UMA vez', badge);
  ['chipRede', 'pontoRede', 'avisoRede'].forEach(function (id) {
    ok(badge.indexOf("getElementById('" + id + "')") > 0,
      'e escrito em `#' + id + '` — três contas sobre a mesma coisa discordam no ' +
      'primeiro ajuste, e a que discordar mente calada');
  });
  /* Nenhum dos tres pode ter conta PROPRIA: a conta e a de cima, e mais nada. */
  ok((badge.match(/navigator\.onLine/g) || []).length === 1,
    'e `navigator.onLine` é lido uma vez só ali dentro — relido por peça, duas delas ' +
    'podem discordar no mesmo instante',
    (badge.match(/navigator\.onLine/g) || []).length);

  /* O AVISO SO APARECE QUANDO HA O QUE AVISAR. Um chip dizendo "Online" o tempo todo
     vira ruido, e ruido constante e o que faz ninguem reparar no dia em que ele muda. */
  ok(/aviso\.hidden = !estado/.test(badge),
    'o aviso da barra some quando está tudo bem — um "Online" permanente vira ruído, e ' +
    'ruído constante é o que faz ninguém reparar no dia em que ele muda');

  /* E `hidden` PRECISA ganhar do `display`. Esta e a quarta vez que o projeto tropeca
     nisso: `.chip{display:inline-flex}` vencia o atributo, e o aviso ficava na tela. */
  ok(/\[hidden\]\{display:none!important\}/.test(css),
    'e `hidden` vence o `display` para qualquer elemento — sem esta regra o ' +
    '`display:inline-flex` do chip ganha do atributo, e o aviso fica na tela o tempo todo');
  /* COMENTARIO NAO E REGRA. Este filtro nasceu porque a assercao reprovou uma LINHA DE
     TEXTO que explicava, dentro de um `/* *\/`, por que a regra global existe — e o
     conserto obvio seria reescrever a explicacao para enganar a peneira. Uma peneira
     que obriga a prosa a se desviar dela esta medindo o arquivo, e nao o CSS. */
  var porElemento = (css.match(/^[^\n@]*\[hidden\]\{/gm) || [])
    .filter(function (r) { return r.trim().indexOf('[hidden]{') !== 0; })
    .filter(function (r) { return !/^\s*(\/\*|\*)/.test(r); });
  ok(porElemento.length === 0,
    'e é UMA regra, não uma por elemento descoberto — eram três (`.ret-pop`, ' +
    '`.aviso-trava` e a porta do painel), cada uma escrita depois de a peça aparecer ' +
    'onde não devia', porElemento);

  /* A cor do ponto sai do MESMO estado, e nao de uma segunda leitura. */
  ok(/ponto\.className = estado \? 'ponto ' \+ estado : 'ponto'/.test(badge),
    'a cor do ponto sai do mesmo estado do texto — verde é "está tudo bem", e nada mais');
  ok(/\.avatar \.ponto\{[^}]*background:var\(--verde\)/.test(css) &&
     /\.avatar \.ponto\.alerta\{background:var\(--ambar\)/.test(css) &&
     /\.avatar \.ponto\.off\{background:var\(--vermelho\)/.test(css),
    'e as três cores existem: verde, âmbar para a fila, vermelho para sem rede');

  /* Quem ve o aviso no celular e quem esta com lancamento preso — e era o unico que nao
     tinha onde tocar para tentar de novo. */
  ok(/\['chipRede', 'avisoRede'\]\.forEach/.test(js),
    'os dois mandam a fila ao toque — quem vê o aviso no celular é justamente quem está ' +
    'com lançamento preso');

  /* Escrever as iniciais NAO pode apagar o ponto, que mora dentro do mesmo elemento. */
  var iQ = js.indexOf('function quemEsta(nome, perfil, foto)');
  var quem = js.slice(iQ, js.indexOf('\n  }', iQ));
  var iPC = js.indexOf('function pintarCirculo(el, nome, foto)');
  var circulo = js.slice(iPC, js.indexOf('\n  }', iPC));
  ok(iQ > 0 && (quem.match(/pintarCirculo\(/g) || []).length === 2,
    'o retrato entra nos dois círculos, pela mesma função — dois desenhos do mesmo ' +
    'rosto acabam discordando no primeiro ajuste');
  ok(!/avatarTopo'\);\s*if \(t\) t\.textContent/.test(js) &&
     /nodeValue|createTextNode/.test(circulo),
    'e o de cima é escrito sem apagar o ponto — `textContent` levaria o ponto junto, e a ' +
    'rede ficaria sem indicador nenhum depois do primeiro login', circulo);
  ok(/t\.title = /.test(quem),
    'e o círculo leva o nome inteiro — duas letras identificam pouco quando há dois Josés');

  /* ---- "Olá, Fulano" na barra de app -------------------------------------- *
   * Ela só existe abaixo de 1024px, onde a lateral está fechada e este canto é a única
   * pista de quem entrou. O nome do app é constante e já está no logo ao lado; quem
   * está logado é o que muda — e o aparelho roda de mão em mão no galpão. */
  /* OS DOIS, e não um no lugar do outro. A saudação já substituiu o nome do app, com o
     argumento de que ele é constante e ela é o que muda. Verdade — e não era preciso
     escolher: o nome do app é a única peça ELÁSTICA da barra, então quando falta espaço
     é ele que corta e a saudação fica inteira. */
  /* O NOME INTEIRO, agora que cabe. Na barra só o primeiro cabia — "Olá, Melkezedeque
     Soares" cortava no meio do sobrenome, que é justamente o que separa dois Josés no
     mesmo galpão. Fora da barra sobra linha. */
  ok(/olaN\.textContent = nome \? String\(nome\)\.trim\(\) : '—';/.test(js),
    'a saudação usa o nome INTEIRO — fora da barra do app sobra linha para ele, e o ' +
    'sobrenome é o que separa dois Josés no mesmo galpão');
  ok(/ola\.hidden = !nome;/.test(js),
    'e some enquanto não há nome: "Olá, —" durante o carregamento é pior que a barra ' +
    'sem a saudação');
  ok(!/mn\.dataset\.app/.test(js) && !/'Painel de Caixas'/.test(js),
    'o nome do app não é mais reescrito: com elemento próprio para a saudação, não há ' +
    'o que guardar nem o que repor');
  ok(/id="olaUsuario"/.test(telas['admin.html']) && /id="olaUsuario"/.test(telas['index.html']),
    'e os dois apps têm o elemento — é a mesma função que escreve nos dois');
  ok((telas['index.html'].match(/id="olaUsuario"/g) || []).length === 1 &&
     (telas['index.html'].match(/id="marcaNome"/g) || []).length === 1,
    'uma vez só em cada: o app de campo tem DOIS `.marca-nome` — o da barra e o da ' +
    'lateral —, e o id nos dois faria a saudação cair no título da gaveta');
  /* A SAUDAÇÃO VOLTOU PARA A BARRA, mas numa SEGUNDA LINHA dela. Na sobrancelha
     ("Operação") custava zero de altura — e era esse o argumento —, mas ali encostava
     no título da página e lia-se como parte DELE, não da conta. E rolava junto com o
     miolo: sumia da tela.

     Debaixo da foto ela divide fundo, sombra e barra de acento com o rosto, e as duas
     leem como uma coisa só. O preço são ~20px de altura, medidos: a barra foi de 54
     para 76px. */
  /* O BLOCO `.topo{...}` inteiro, fatiado: as regras dele vêm depois de um comentário
     longo, e janelas `[\s\S]{0,N}` quebravam a cada linha de comentário nova — o teste
     ficava vermelho por uma mudança que não era a que ele cobra. */
  var iTopo = css.indexOf('.topo{');
  var barra = css.slice(iTopo, css.indexOf('\n}', iTopo));
  ok(iTopo > 0, 'a barra de app tem bloco próprio', iTopo);
  var i0 = css.indexOf('.topo::before{'), i1 = css.indexOf('.topo::after{');
  var barra0 = css.slice(i0, css.indexOf('}', i0) + 1);
  var barra1 = css.slice(i1, css.indexOf('}', i1) + 1);
  ok(i0 > 0 && i1 > 0, 'e as duas bordas vivas dela também', i0 + '/' + i1);

  var iOla = telas['admin.html'].indexOf('id="olaUsuario"');
  var iCab = telas['admin.html'].indexOf('</header>');
  ok(iOla > 0 && iCab > 0 && iOla < iCab,
    'a saudação mora DENTRO da barra do app — junto da foto, e não na sobrancelha da ' +
    'página, que rola e some', iOla + '/' + iCab);
  var iOlaC = telas['index.html'].indexOf('id="olaUsuario"');
  var iCabC = telas['index.html'].indexOf('</header>');
  ok(iOlaC > 0 && iCabC > 0 && iOlaC < iCabC,
    'e nos dois apps — é a mesma função que escreve, e um só dos dois seria pior que ' +
    'nenhum', iOlaC + '/' + iCabC);
  ok(!/cab-pagina__linha/.test(telas['admin.html']) && !/cab-pagina__linha/.test(telas['index.html']),
    'e a sobrancelha voltou a ser só a sobrancelha: linha que sobrou de arranjo antigo ' +
    'vira estilo morto que ninguém sabe remover');
  /* DUAS LINHAS, e não uma fila. A saudação já dividiu a linha de cima com a marca, e
     as duas se cortavam. Em linha própria nenhuma cede largura. */
  ok(/display:grid;grid-template-columns:minmax\(0,1fr\) auto auto;/.test(barra),
    'a barra é uma grade — a primeira coluna come a sobra, e a conta e o gatilho ficam ' +
    'colados à direita sem `margin-left:auto`');
  /* AS LINHAS DECLARADAS, e não implícitas. `grid-row:1/-1` na marca não fazia NADA
     enquanto elas eram implícitas: o `-1` conta as linhas do grid EXPLÍCITO, que estava
     vazio, então `1/-1` virava `1/1`. Medido antes e depois: a marca ficou nos mesmos
     28px de altura até esta linha entrar — a regra existia e não valia. */
  ok(/grid-template-rows:auto auto;/.test(barra),
    'e as duas linhas são declaradas — sem isso o `1/-1` da marca não conta linha ' +
    'nenhuma, e a regra que a centraliza fica escrita sem efeito');
  /* O bloco `.ola{...}` inteiro, e não uma janela de N caracteres: as regras dele
     também vêm depois de comentário, e a janela quebrava por comentário novo. */
  var iA = css.indexOf('.ola{'), fatiaOla = css.slice(iA, css.indexOf('}', iA) + 1);
  ok(iA > 0 && /grid-column:1\/-1;grid-row:2;justify-self:end/.test(fatiaOla),
    'e a saudação ocupa a linha de baixo inteira, encostada à direita — debaixo da foto, ' +
    'e não no meio da barra', fatiaOla.slice(0, 90));
  ok(/max-width:100%;min-width:0;/.test(fatiaOla) && /text-overflow:ellipsis\}/.test(fatiaOla),
    'e quando o nome é longo demais quem corta é ELA — medido a 360px com um nome de ' +
    '58 letras: a saudação perdeu 80px no fim e a marca ficou inteira');
  /* O RECUO À ESQUERDA guarda o lugar do logo. A marca atravessa as duas linhas, e sem
     isto uma saudação longa crescia por baixo dela: medido a 360px, a saudação chegava
     a x=12, o mesmo x do logo. Os textos ficam em alturas diferentes e não se tocam,
     mas o corte passa a acontecer ANTES de encostar — e "quase colidiu" é o estado de
     onde saem os defeitos que aparecem com um nome a mais. */
  ok(/padding-left:48px;/.test(fatiaOla),
    'e ela nunca cresce por baixo do logo: corta antes de chegar nele');
  ok(!/\.ola\{flex:0 0 auto/.test(css) && !/@media \(max-width:379px\)\{ \.ola\{display:none\} \}/.test(css),
    'e sem o remendo de escondê-la em tela estreita: em linha própria, ela não disputa ' +
    'largura com ninguém');
  /* MAIOR E MAIS CLARA, a pedido: ela estava em 12,5px com `--txt3`, a tinta mais
     apagada da paleta — feita para legenda, não para o nome do sistema. Num galpão sob
     luz forte, um cinza fraco de 12px na barra some. */
  ok(/\.marca-nome\{[\s\S]{0,20}font-size:14px;font-weight:700;[\s\S]{0,20}color:var\(--txt\)/
    .test(css),
    'o nome do sistema está maior e na tinta cheia — `--txt3` é legenda, e sumia');
  /* MAIOR NA BARRA E COM ANEL: é o único lugar em que um rosto aparece no celular, e a
     32px ele virava uma mancha. O anel o separa do fundo escuro da barra. */
  ok(/\.topo__conta \.avatar\{width:36px;height:36px[\s\S]{0,120}box-shadow:0 0 0 2px var\(--campo\)/
    .test(css),
    'o círculo da barra de app é maior que o da lateral, e tem anel');
  /* O anel é SOMBRA, e não borda: borda entra na conta do tamanho, e o alvo cairia de
     42px para 42 menos a borda dos dois lados. */
  ok(!/\.topo__conta \.avatar\{[^}]*border:/.test(css),
    'e o anel é sombra, não borda — borda comeria o alvo de toque por dentro');
  /* A BARRA GANHA O MESMO TRATAMENTO DA FAIXA DO DIA, um tom mais escura: ela é a
     moldura do app, e as faixas de dia são conteúdo. */
  ok(/background:linear-gradient\(90deg,var\(--verde-claro\)/.test(barra) &&
     /\.topo::before\{content:"";position:absolute;left:0/.test(css),
    'a barra tem o degradê e a barra de acento da faixa do dia');
  /* A BARRA NÃO ENCOLHE. Ela é item de um flex em coluna, e sem `flex:0 0 auto` cedia
     espaço para o miolo: medido, os 58px declarados viravam 45 na tela, e o círculo de
     40px ficava a dois pixels de encostar nas bordas. */
  ok(/flex:0 0 auto;/.test(barra) && /min-height:var\(--topo-alt\)/.test(barra),
    'e a barra guarda a altura que declara, em vez de ceder ao que vem embaixo');
  ok(/--topo-alt:75px/.test(css),
    'com altura declarada para as DUAS linhas — medido, é exatamente o que a barra ' +
    'ocupa cheia, e é o que reserva o lugar enquanto a sessão não carregou e a ' +
    'saudação está `hidden`: sem isso a barra nasceria com 56px e pularia para 75');
  ok(/\.foto-campo__r\{[^}]*width:84px;height:84px/.test(css),
    'e o retrato do formulário é grande: é o único lugar em que se CONFERE a foto antes ' +
    'de gravá-la — pequeno demais, a conferência não se faz e o erro só aparece depois, ' +
    'espalhado por todas as listas');

  /* A FOTO POR CIMA DAS LETRAS, e não no lugar delas: o `onerror` devolve as iniciais
     quando o endereço quebra — arquivo apagado do balde, rede fora. Como imagem de
     FUNDO não haveria esse evento, e o círculo ficaria vazio, que diz menos que duas
     letras. */
  ok(/img\.addEventListener\('error', function \(\) \{ img\.remove\(\); \}\);/.test(circulo),
    'a foto que não carrega se retira, e as iniciais voltam sozinhas');
  ok(/if \(!foto\) \{ if \(img\) img\.remove\(\); return; \}/.test(circulo),
    'e tirar a foto no cadastro tira a imagem do círculo, sem recarregar a página');
  ok(/\.avatar__foto\{position:absolute;inset:0/.test(css),
    'ela cobre o círculo em vez de ficar ao lado dele');
  ok(/foto: u\.Foto \|\| '',/.test(fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8')),
    'e a sessão carrega a foto de quem está logada — sem ela, a lateral mostraria as ' +
    'iniciais de quem acabou de pôr foto, e a pessoa concluiria que não salvou');

  /* A MARCA ENCOLHE, o canto direito NAO. Medido a 390px com "Offline · 2 na fila": sem
     isto o avatar era empurrado para fora da barra, e quem estava sem rede perdia de
     vista justamente o aviso e a propria identificacao. */
  ok(/\.topo__marca\{[\s\S]{0,140}min-width:0;overflow:hidden\}/.test(css),
    'a marca vive na coluna elástica, e com `min-width:0` ela de fato encolhe — sem ' +
    'isso um item de grade recusa ficar menor que o próprio conteúdo e empurra o resto ' +
    'para fora');
  /* E ATRAVESSA AS DUAS LINHAS. À direita há uma PILHA — rosto em cima, saudação
     embaixo —, e o rosto ficar acima do meio da barra está certo: ele é o topo de uma
     coluna de dois. À esquerda não há nada embaixo, e a marca presa na linha de cima
     ficava 10px acima do meio ótico da barra, lendo-se como solta. Medido: meio da
     barra em 37,5; a marca em 28 antes, 37 depois. */
  ok(/\.topo__marca\{grid-column:1;grid-row:1\/-1;/.test(css),
    'e atravessa as DUAS linhas, para cair no meio ótico da barra e fazer peso contra ' +
    'a pilha da direita — presa na linha de cima ela flutuava 10px alto');
  ok(/padding:6px 4px 6px 12px/.test(barra),
    'e o respiro de cima é IGUAL ao de baixo — com 6 e 7 a marca centrada caía fora do ' +
    'meio; à esquerda ele é maior, que é onde a marca abre a barra, e à direita menor, ' +
    'onde o gatilho já tem os seus 44px de alvo');
  ok(/\.topo__conta\{grid-column:2;grid-row:1/.test(css) &&
     /\.topo > \.btn-icone\{grid-column:3;grid-row:1\}/.test(css),
    'e a conta e o gatilho ficam na linha de CIMA, ao lado da marca — soltos na grade ' +
    'eles cairiam para a linha da saudação');

  /* ---- A BARRA ESTÁ VIVA -------------------------------------------------
   * O app fica aberto o dia inteiro num aparelho de galpão, e uma tela inteiramente
   * parada não distingue "carregando", "travado" e "em dia". Quatro sinais, todos na
   * MOLDURA e nenhum em cima de um número: a luz que desce pela barra de acento, o
   * brilho que varre a linha de baixo, o anel que abre em volta do rosto e o ponto de
   * rede que respira. Como moram no `.topo`, que é um só por app e fica fora do corpo
   * que troca, eles valem para TODOS os módulos dos dois apps. */
  ok(/animation:descer 7s ease-in-out infinite\}/.test(barra0) &&
     /@keyframes descer\{/.test(css),
    'uma luz desce pela barra de acento — o sinal mais barato de que o app está vivo');
  /* O QUE FAZ ANDAR, e não o que está escrito. `animation` sem `background-size` roda
     e não move NADA: o degradê cabe inteiro nos 4px e cada quadro é igual ao anterior.
     Medido com o instante de cada animação fixado a mão — sem `background-size`, a
     posição no instante 0 e no instante 2,6s é a mesma. */
  ok(/background-size:100% 300%;animation:descer/.test(barra0),
    'e o degradê é TRÊS VEZES a altura da barra, que é o que dá à luz para onde ir — ' +
    'sem isso a animação roda e a barra fica parada, e nenhuma conferência de texto vê');
  ok(/animation:varrer 8s ease-in-out infinite\}/.test(barra1) &&
     /background-size:42% 100%;background-repeat:no-repeat;/.test(barra1) &&
     /@keyframes varrer\{/.test(css),
    'e um brilho varre a linha de baixo — com largura e sem repetir, senão a linha ' +
    'inteira acende de uma vez e não varre coisa nenhuma');
  /* O ANEL ABRE. As DUAS primeiras sombras são o contorno fixo e estão nos DOIS
     quadros: elas são a razão de o anel existir — separar o rosto do fundo escuro. */
  var iAnel = css.indexOf('@keyframes anel{');
  var quadrosAnel = css.slice(iAnel, css.indexOf('}}', iAnel));
  /* O DA BARRA, dito por inteiro. Escrito só como `animation:anel 5s`, quem respondia
     por esta afirmação era a regra do rosto da LATERAL, que tem o mesmo texto: apagar
     a animação da barra deixava tudo verde. Pego quando o gêmeo de computador criou a
     segunda cópia — antes dela a afirmação era honesta por acidente. */
  ok(/\.topo__conta \.avatar\{[^}]*animation:anel 5s ease-out infinite\}/.test(css),
    'o anel do rosto DA BARRA abre e se dissolve');
  ok(iAnel > 0 &&
     (quadrosAnel.match(/0 0 0 2px var\(--campo\),0 0 0 3px rgba\(53,214,160,\.45\)/g) || []).length === 2,
    'e o contorno FIXO está nos dois quadros — anel que some junto com a animação é um ' +
    'contorno que depende de enfeite para existir', quadrosAnel.length);
  ok(/\.topo__conta \.avatar:hover,\.topo__conta \.avatar:focus-visible\{animation-play-state:paused\}/.test(css),
    'e para sob o dedo: quem foi tocar na conta não quer o alvo respirando embaixo dele');
  /* RESPIRA, NUNCA PISCA — e só o verde. */
  ok(/\.avatar \.ponto\{animation:respirar 4s ease-in-out infinite\}/.test(css) &&
     /@keyframes respirar\{0%,100%\{opacity:1\}50%\{opacity:\.55\}\}/.test(css),
    'o ponto de rede respira em vez de piscar — piscar lê como alerta, e ponto verde é ' +
    'o contrário de alerta');
  ok(/\.avatar \.ponto\.alerta\{background:var\(--ambar\);animation:none\}/.test(css) &&
     /\.avatar \.ponto\.off\{background:var\(--vermelho\);animation:none\}/.test(css),
    'e amarelo e vermelho NÃO respiram: um ponto de alerta que esmaece e volta parece ' +
    'estar se resolvendo sozinho, e não está');
  /* QUEM PEDIU MENOS MOVIMENTO RECEBE NENHUM. Medido com o Chrome em movimento
     reduzido: zero animações vivas na barra. */
  /* O bloco de movimento reduzido QUE TRATA DA BARRA. O arquivo tem quatro deles, e
     tanto `lastIndexOf` quanto `indexOf` pegariam um bloco qualquer — a afirmação
     ficaria vermelha ou verde por causa de um bloco que não é o que ela cobra. */
  var iAfter = css.indexOf('.topo::after{display:none}');
  var iRed = css.lastIndexOf('@media (prefers-reduced-motion:reduce){', iAfter);
  var reduzido = iAfter > 0 ? css.slice(iRed, css.indexOf('\n}', iRed)) : '';
  ok(iRed > 0 && /\.topo::after\{display:none\}/.test(reduzido) &&
     /\.topo__conta \.avatar,[^}]*\.avatar \.ponto\{animation:none!important\}/.test(reduzido),
    'e quem pede menos movimento não recebe nenhum dos quatro — medido: zero animações ' +
    'vivas na barra', reduzido.length);
  /* A BARRA DE ACENTO VOLTA CHEIA, e não é o degradê congelado: parada num quadro
     qualquer, a luz viraria uma mancha clara no meio dela. */
  ok(/\.topo::before\{background:var\(--verde\);animation:none!important\}/.test(reduzido),
    'e a barra de acento volta a ser CHEIA, em vez do degradê congelado num quadro');

  /* ---- O GÊMEO DE COMPUTADOR ---------------------------------------------
   * Os quatro sinais moram no `.topo`, e o `.topo` some acima de 1024px: no
   * computador o app não tinha sinal de vida nenhum — e é lá que a tela fica aberta o
   * dia inteiro num monitor de galpão. O equivalente é o `.cab-pagina`, que também é
   * um só para o app inteiro e também fica fora do corpo que troca. */
  var iCabAntes = css.indexOf('.cab-pagina::before{');
  var iCabDepois = css.indexOf('.cab-pagina::after{');
  ok(iCabAntes > 0 && iCabDepois > 0,
    'o cabeçalho de página também tem barra de acento e linha varrida — no computador ' +
    'a barra do app não existe, e sem isto nada na tela dizia que o app está vivo',
    iCabAntes + '/' + iCabDepois);
  ok(/\.cab-pagina::before\{[^}]*background-size:100% 300%;animation:descer 7s/.test(css),
    'e a luz desce por ela com o mesmo desenho e o mesmo `background-size` do celular');
  /* O QUE ANCORA OS DOIS. Pego numa sabotagem: sem `position:relative` as duas regras
     continuam escritas e o `position:absolute` delas sobe até achar um ancestral
     posicionado — não há nenhum, então caem no bloco inicial e a barra de acento vira
     um risco de 4px descendo a JANELA inteira, por cima da lateral. O `.topo` nunca
     precisou disto porque já é `position:sticky`, que também posiciona. */
  ok(/\.cab-pagina\{position:relative;/.test(css),
    'e o cabeçalho é posicionado — sem isso a barra de acento ancora na janela e ' +
    'desce por cima da lateral inteira, e as regras continuam todas escritas');
  /* 9s, e não os 8s do celular: um monitor é o triplo da largura, e no mesmo tempo o
     brilho cruzaria rápido demais para ler como varredura. */
  ok(/\.cab-pagina::after\{[^}]*background-size:28% 100%;background-repeat:no-repeat;[^}]*animation:varrer 9s/.test(css),
    'e o brilho varre mais devagar que o do celular, porque a largura é o triplo');

  /* UMA LUZ, NUNCA DUAS — e é por isso que a regra vive DENTRO do `@media
   * (min-width:1024px)`. Abaixo de 1024 o `.topo` está na tela com a sua própria barra
   * de acento, e as duas juntas dariam duas luzes descendo, uma embaixo da outra.
   *
   * A conferência é ESTRUTURAL, e não de texto: confere que não há fechamento de bloco
   * entre a abertura da media query e a regra. Escrita fora dela, a regra continuaria
   * existindo no arquivo e a afirmação acima continuaria verde.
   *
   * Medido a 1280px e a 390px: uma luz viva em cada, e as duas nunca ao mesmo tempo —
   * a 390px o `.cab-pagina::before` nem chega a ter `content`. */
  var iMq = css.lastIndexOf('@media (min-width:1024px){', iCabAntes);
  var entre = iCabAntes > 0 && iMq > 0 ? css.slice(iMq, iCabAntes) : '}';
  ok(iMq > 0 && entre.indexOf('\n}') === -1,
    'e ela vale SÓ no computador: no celular a barra do app já tem a dela, e as duas ' +
    'juntas dariam DUAS luzes descendo, uma embaixo da outra');

  /* O ROSTO DA LATERAL, pela mesma razão do da barra: no computador ele é o ÚNICO
     rosto na tela, e a lateral tem o mesmo `--campo` de fundo. */
  ok(/\.conta \.avatar\{[^}]*box-shadow:0 0 0 2px var\(--campo\),0 0 0 3px rgba\(53,214,160,\.45\);[^}]*animation:anel 5s ease-out infinite\}/.test(css),
    'o rosto da lateral ganhou o mesmo anel — e o contorno FIXO está na regra base, ' +
    'para existir com a animação desligada');
  ok(/\.conta:hover \.avatar,\.conta:focus-within \.avatar\{animation-play-state:paused\}/.test(css),
    'e ele também para sob o dedo');
  /* OS TRÊS ROSTOS: o da barra do app, o da lateral e o da pílula do tempo. A lista
     cresceu de dois para três e vai crescer de novo — por isso a afirmação cobra os
     extremos dela e não o texto inteiro, que quebraria a cada rosto novo sem que nada
     de errado tivesse acontecido. */
  ok(/\.topo__conta \.avatar,[^}]*\.tempo__conta \.avatar,[^}]*\.avatar \.ponto\{animation:none!important\}/.test(reduzido) &&
     /\.cab-pagina::before\{background:var\(--verde\);animation:none!important\}/.test(reduzido) &&
     /\.cab-pagina::after\{display:none\}/.test(reduzido),
    'e quem pede menos movimento não recebe nenhum dos dois lados — medido a 1280px: ' +
    'zero animações vivas, o brilho sumido e a barra de acento cheia');
})();

console.log('\n== a frota: cadastro no painel, e a placa no lançamento ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  /* ---- o cadastro, DEPOIS do de motoristas ---- */
  var iMot = adm.indexOf('data-cad="motoristas"');
  var iVei = adm.indexOf('data-cad="veiculos"');
  ok(iMot > 0 && iVei > 0 && iVei > iMot,
    'o cartão de Veículos existe e vem DEPOIS do de Motoristas — é a ordem em que os ' +
    'dois são preenchidos, e a que foi pedida', iMot + '/' + iVei);
  ok(/function formVeiculo\(v\)/.test(adm) && /function desenharVeiculos\(\)/.test(adm) &&
     /btnNovoVeiculo'\)\.addEventListener/.test(adm),
    'e ele tem lista, formulário e botão de novo, como os outros cadastros');
  /* DESATIVAR é o caminho normal para carro vendido; excluir some do cadastro mas os
     lançamentos guardam a placa como TEXTO e continuam legíveis. */
  ok(/data-ativar-vei/.test(adm) && /data-excluir-vei/.test(adm),
    'e dá para desativar sem excluir: carro vendido sai da lista do celular e continua ' +
    'legível no que ele já levou');

  /* O MOTORISTA HABITUAL É PADRÃO, e a tela diz isso em português. A promessa importa
     tanto quanto o código: quem cadastra precisa saber que não está travando nada. */
  ok(/É um <b>padrão<\/b>, não uma regra/.test(adm),
    'a tela diz que o motorista habitual é um padrão, não uma regra — quem cadastra ' +
    'precisa saber que não está travando a troca de carro');
  /* O habitual pode ter sido apagado depois. Mostrar `D007` cru é pior que dizer que
     não foi encontrado. */
  ok(/motorista não encontrado/.test(adm),
    'e o vínculo órfão se anuncia, em vez de aparecer como código cru na coluna');

  /* ---- a permissão por usuário, como a do motorista ---- */
  var iPm = adm.indexOf("caixaLocais('fMotoristas'");
  var iPv = adm.indexOf("caixaLocais('fVeiculos'");
  ok(iPm > 0 && iPv > 0 && iPv > iPm,
    'o usuário ganha a lista "quais placas ela pode escolher", logo depois da de ' +
    'motorista', iPm + '/' + iPv);
  ok(/Veiculos:lerMarcados\('fVeiculos'\)/.test(adm),
    'e a marcação é lida ao salvar — a lista que aparece e não grava é pior que lista ' +
    'nenhuma, porque parece ter funcionado');
  /* A CAIXA DE MARCAR LÊ `Nome`, e o veículo tem PLACA. Em vez de ensinar a caixa a
     falar de veículo — ela serve a quatro listas —, o veículo se apresenta. */
  ok(/Nome: v\.Placa \+ \(v\.Modelo \? ' — ' \+ v\.Modelo : ''\)/.test(adm),
    'e o veículo se apresenta com placa e modelo numa linha, em vez de a caixa de ' +
    'marcar aprender um quinto formato');

  /* ---- o campo no lançamento ---- */
  ok(/id="sdVeiculo"/.test(idx) && /id="dvVeiculo"/.test(idx),
    'Saída e Retorno têm o campo Veículo');
  ok(/\{ id:'sdVeiculo',   msg:'Escolha o veículo que vai levar a carga\.' \}/.test(idx) &&
     /\{ id:'dvVeiculo',   msg:'Informe em que veículo as caixas voltaram\.' \}/.test(idx),
    'e ele é obrigatório nos dois, como o motorista');
  ok(/veiculo: document\.getElementById\('sdVeiculo'\)\.value\.trim\(\)/.test(idx) &&
     /veiculo: document\.getElementById\('dvVeiculo'\)\.value/.test(idx),
    'e a placa VIAJA no pedido: campo que a pessoa preenche e não chega ao servidor é ' +
    'trabalho jogado fora, e ninguém descobre até o relatório');
  ok(/function meusVeiculos\(\)\s*\{\s*return permitidos\(\(DADOS\|\|\{\}\)\.veiculos \|\| \[\], 'veiculos'\);/
      .test(idx.replace(/\s+/g, ' ').replace(/ \{ /g, '{').replace(/; /g, ';')) ||
     /permitidos\(\(DADOS\|\|\{\}\)\.veiculos \|\| \[\], 'veiculos'\)/.test(idx),
    'e a frota passa pela MESMA peneira de permissão dos motoristas — nada marcado = ' +
    'nenhum');

  /* A PLACA É O VALOR, não o id: o movimento guarda texto. */
  ok(/'<option value="'\+Q\.esc\(v\.Placa\)\+'" data-mot="'/.test(idx),
    'o valor do seletor é a PLACA, e o motorista habitual viaja no próprio option — ' +
    'sem uma segunda busca na hora de preencher');

  /* ---- O VEÍCULO DO MOTORISTA EM CIMA, NUM GRUPO PRÓPRIO -------------------
   * Onze placas todas parecidas numa lista só, com o carro certo no meio, é escolher no
   * olho: `SON1B00` e `SON5E11` diferem em dois caracteres, e quem lança está de luva,
   * no pátio. A placa errada não avisa que está errada — entra no movimento e só
   * aparece semanas depois, quando alguém for conferir de que carro as caixas voltaram.
   * É a mesma regra que a rota já aplica à lista de motoristas. */
  var iMV = idx.indexOf('function montarVeiculos(');
  var fnMV = iMV > 0 ? idx.slice(iMV, idx.indexOf('\n  }', iMV)) : '';
  ok(/grupo\('Veículo de ' \+ nome, dele\) \+ grupo\('Outros veículos', outros\)/.test(fnMV),
    'o veículo do motorista sai num grupo próprio, em cima, e o resto embaixo');
  /* O RESTO CONTINUA ALCANÇÁVEL: carro quebra, alguém cobre a rota do outro, e uma
     lista que só ofereça o carro de fábrica trava o lançamento no dia em que a
     realidade não obedece ao cadastro. */
  ok(/var outros = frota\.filter\(function\(v\)\{ return dele\.indexOf\(v\) < 0; \}\);/.test(fnMV),
    'e todo veículo liberado continua na lista — separar não é esconder');
  /* Sem veículo do motorista não há o que separar: rótulo de grupo sozinho é rótulo
     para ler à toa. Mesma regra da lista de motoristas. */
  ok(/\? grupo\('Veículo de[\s\S]{0,90}: itens\(frota\)\);/.test(fnMV),
    'e sem veículo do motorista a lista sai simples, sem rótulo de grupo sozinho');
  /* A PONTE ENTRE OS DOIS CAMPOS é o cadastro: o seletor de motorista guarda o NOME — é
     ele que vai para o movimento — e o vínculo do veículo é por ID. Comparar texto com
     texto faria "Chico" bater com outro Chico. */
  ok(/meusMotoristas\(\)\.filter\(function\(x\)\{ return x\.Nome === nome; \}\)\[0\]/.test(fnMV) &&
     /String\(v\.MotoristaID\|\|''\) === motId/.test(fnMV),
    'e o vínculo é por ID, com o nome do campo passando pelo cadastro — o seletor ' +
    'guarda nome, o veículo guarda id');
  /* MOTORISTA NOVO, VEÍCULO NOVO. Trocar o motorista e deixar a placa do anterior é o
     erro mais difícil de ver: o campo fica preenchido, com jeito de conferido. */
  ok(/if \(motId !== anterior\) \{\s*\n\s*sel\.value = dele\.length === 1 \? dele\[0\]\.Placa : '';/.test(fnMV),
    'trocar de motorista não deixa a placa do anterior no campo — e com UM carro só ' +
    'ele já vem posto, que é um toque a menos por lançamento');
  ok(/sel\.setAttribute\('data-mot-lista', motId\);/.test(fnMV),
    'e o seletor lembra de qual motorista era a lista — sem isso, todo redesenho ' +
    'contaria como troca e limparia a placa escolhida');
  /* O PAR DO VÍNCULO. Sem ele o agrupamento só valeria para o estado em que a tela
     nasceu: escolher o motorista depois deixaria a lista agrupada em volta de quem não
     está mais no campo. */
  ok(/function motoristaPuxaVeiculo\(idMotorista, idVeiculo\)\{/.test(idx) &&
     (idx.match(/motoristaPuxaVeiculo\('/g) || []).length === 2,
    'e escolher o MOTORISTA reagrupa a frota — nas duas telas, e ligado uma vez só');
  /* E o caminho de volta reagrupa também: senão a lista continuaria dizendo "Outros
     veículos" sobre o carro que, depois do preenchimento, É o do motorista no campo. */
  ok(/sv\.setAttribute\('data-mot-lista', String\(m\.ID\)\);\s*\n\s*montarVeiculos\(idVeiculo, idMotorista\);/
       .test(idx),
    'e escolher a PLACA reagrupa a lista em volta do motorista que ela preencheu — ' +
    'acertando a lembrança ANTES, para a remontagem não limpar a placa recém-escolhida');

  /* ESCOLHER A PLACA PREENCHE O MOTORISTA, e o campo continua aberto. */
  var iV = idx.indexOf('function veiculoPuxaMotorista');
  var fnV = iV > 0 ? idx.slice(iV, idx.indexOf('\n  }', iV)) : '';
  ok(iV > 0 && /sv\.addEventListener\('change'/.test(fnV) && /sm\.value = m\.Nome;/.test(fnV),
    'escolher a placa preenche o motorista habitual', fnV.length);
  ok(!/disabled/.test(fnV) && !/readOnly/.test(fnV),
    'e NÃO trava o campo: carro quebra, alguém cobre a rota do outro, e o cadastro não ' +
    'pode mandar mais que a realidade');
  /* Pôr um nome que o seletor não tem deixa o campo em branco com jeito de preenchido. */
  ok(/var tem = Array\.prototype\.some\.call\(sm\.options/.test(fnV),
    'e só preenche se o motorista estiver na lista que ESTA pessoa pode escolher — um ' +
    'nome que o seletor não tem deixaria o campo vazio com jeito de preenchido');
  /* ================= RODANDO OS DOIS SELETORES =================
   *
   * Tudo acima LÊ o arquivo. Isso responde "a regra está escrita?" e não responde a
   * única pergunta que importa no pátio: QUEM fica no campo motorista depois de a pessoa
   * mexer. Foi por falta desta bancada que um defeito relatado atravessou a suíte
   * inteira sem um único ✗ — escolher outro carro trocava o motorista pelo dono
   * habitual da placa, e o lançamento saía no nome de quem não estava dirigindo.
   *
   * Os seletores são de mentira; as três funções são as de produção, recortadas do
   * arquivo. O que a bancada precisa saber fazer é o que o código realmente usa:
   * `innerHTML` virando lista de opções, `selectedIndex` e o `change`. */
  (function () {
    var fonte = ['function montarVeiculos(', 'function motoristaPuxaVeiculo(',
                 'function veiculoPuxaMotorista(']
      .map(function (a) {
        var i = idx.indexOf('  ' + a);
        return i < 0 ? '' : idx.slice(i, idx.indexOf('\n  }', i) + 4);
      }).join('\n');
    ok(/function montarVeiculos/.test(fonte) && /function veiculoPuxaMotorista/.test(fonte),
      'o recorte pegou as três peças — sem isto a bancada abaixo exercita outro código');

    function Sel() { this._a = {}; this._h = ''; this.value = ''; this._ouve = []; }
    Sel.prototype.setAttribute = function (k, v) { this._a[k] = String(v); };
    Sel.prototype.getAttribute = function (k) { return k in this._a ? this._a[k] : null; };
    Sel.prototype.addEventListener = function (tipo, f) {
      if (tipo === 'change') this._ouve.push(f);
    };
    /* O `change` do navegador não dispara quando o código escreve no `value` — só
       quando a PESSOA escolhe. A bancada separa as duas coisas de propósito: `escolher`
       é a pessoa, e atribuir `.value` é o código. */
    Sel.prototype.escolher = function (v) {
      this.value = v;
      this._ouve.forEach(function (f) { f(); });
    };
    Object.defineProperty(Sel.prototype, 'innerHTML', {
      get: function () { return this._h; },
      set: function (h) {
        this._h = h;
        var re = /<option value="([^"]*)"(?: data-mot="([^"]*)")?/g, m;
        this.options = [];
        while ((m = re.exec(h))) {
          (function (val, mot) {
            this.options.push({ value: val,
              getAttribute: function (k) { return k === 'data-mot' ? (mot || '') : null; } });
          }).call(this, m[1], m[2]);
        }
      }
    });
    Object.defineProperty(Sel.prototype, 'selectedIndex', {
      get: function () {
        var v = this.value;
        for (var i = 0; i < (this.options || []).length; i++) {
          if (this.options[i].value === v) return i;
        }
        return -1;
      }
    });

    /* Dinho tem o KGD9976; o SON1B00 é do Chico. É o caso do relato. */
    var MOTS = [{ ID: 'D1', Nome: 'Dinho' }, { ID: 'D2', Nome: 'Chico' }];
    var FROTA = [{ Placa: 'KGD9976', Modelo: 'Baú', MotoristaID: 'D1' },
                 { Placa: 'SON1B00', Modelo: 'Baú', MotoristaID: 'D2' },
                 { Placa: 'UHP', Modelo: 'UHP', MotoristaID: '' }];

    function bancada() {
      var sv = new Sel(), sm = new Sel();
      /* O seletor de motorista tem os dois nomes, porque quem lança pode escolher os
         dois — é o que o `veiculoPuxaMotorista` confere antes de preencher. */
      sm.innerHTML = '<option value=""></option><option value="Dinho"></option>' +
                     '<option value="Chico"></option>';
      var doc = { getElementById: function (id) {
        return id === 'v' ? sv : (id === 'm' ? sm : null); } };
      var api = new Function('document', 'meusVeiculos', 'meusMotoristas', 'Q',
        fonte + '\n return { montar: montarVeiculos, ligarV: veiculoPuxaMotorista,' +
        '\n          ligarM: motoristaPuxaVeiculo };')(
        doc, function () { return FROTA; }, function () { return MOTS; },
        { esc: function (s) { return String(s == null ? '' : s); } });
      api.ligarV('v', 'm');
      api.ligarM('m', 'v');
      api.montar('v', 'm');
      return { sv: sv, sm: sm, api: api };
    }

    /* ---- O DEFEITO RELATADO ---- */
    var b = bancada();
    b.sm.escolher('Dinho');
    ok(b.sv.value === 'KGD9976',
      'escolhido o motorista, o carro dele já vem posto — ele tem um só', b.sv.value);
    ok(/Veículo de Dinho/.test(b.sv.innerHTML) && /Outros veículos/.test(b.sv.innerHTML),
      'e a lista sai agrupada: o carro dele em cima, o resto embaixo');

    b.sv.escolher('SON1B00');
    ok(b.sm.value === 'Dinho',
      'COM O MOTORISTA JÁ ESCOLHIDO, pegar outro carro NÃO troca o motorista — quem ' +
      'dirige hoje é quem a pessoa escolheu, e o cadastro só diz de quem o carro ' +
      'costuma ser', b.sm.value);
    ok(b.sv.value === 'SON1B00',
      'e a placa escolhida fica — trocar o motorista por baixo reagruparia a lista e ' +
      'limparia a placa que ela acabou de escolher', b.sv.value);

    /* ---- O CASO QUE A REGRA EXISTE PARA RESOLVER ---- */
    var c = bancada();
    c.sv.escolher('SON1B00');
    ok(c.sm.value === 'Chico',
      'com o motorista VAZIO, a placa preenche o dono habitual — preencher o que está ' +
      'em branco é ajuda; trocar o que a pessoa escolheu é discordar dela em silêncio',
      c.sm.value);
    /* E A PLACA SOBREVIVE AO PREENCHIMENTO. Preencher o motorista faz a lista se
       reagrupar em volta dele; sem acertar a lembrança ANTES, a remontagem lê "trocou de
       motorista" e limpa a placa que a pessoa acabou de escolher — o campo volta a
       "Selecione…" sozinho, e ela escolhe de novo, e limpa de novo. */
    ok(c.sv.value === 'SON1B00',
      'e a placa que preencheu o motorista continua no campo — o reagrupamento não pode ' +
      'limpar a escolha que o disparou', c.sv.value);

    /* ---- Um carro sem dono não preenche nada, e não apaga o que havia ---- */
    var d = bancada();
    d.sv.escolher('UHP');
    ok(d.sm.value === '',
      'carro sem motorista habitual não inventa ninguém', d.sm.value);

    /* ---- Trocar de motorista continua limpando a placa do anterior ---- */
    var e = bancada();
    e.sm.escolher('Dinho');
    e.sm.escolher('Chico');
    ok(e.sv.value === 'SON1B00',
      'e trocar de motorista traz o carro DELE, em vez de deixar a placa do anterior — ' +
      'campo preenchido com o dado errado é o erro mais difícil de ver', e.sv.value);
  })();

  /* UM ouvinte, e não um por redesenho: os seletores são refeitos a cada troca de rota. */
  ok((idx.match(/veiculoPuxaMotorista\('/g) || []).length === 2 &&
     !/montarVeiculos[\s\S]{0,200}veiculoPuxaMotorista/.test(idx),
    'e o vínculo é ligado UMA vez, fora do redesenho: os seletores são refeitos a cada ' +
    'troca de rota, e um ouvinte por redesenho empilharia dezenas no mesmo `change`');

  /* A FROTA É MONTADA ONDE O MOTORISTA É, e DEPOIS dele. Um caminho que redesenha um e
     esquece o outro deixa o seletor com a frota de antes.
     A ORDEM passou a importar: é o motorista no campo que decide o agrupamento da
     frota, então montar a frota primeiro a agruparia em volta de quem acabou de sair.
     Contar ocorrências não diria nada disso — e nem serve mais, porque `montarVeiculos`
     agora aparece também dentro dos dois vínculos, com variável no lugar do id. */
  /* O TRECHO É O QUE VEM DEPOIS de cada chamada — 220 caracteres, o bastante para a
     linha seguinte e um comentário no meio. Com expressão regular preguiçosa o trecho
     terminava no PRIMEIRO `;`, que é o fim da própria chamada do motorista: cinco
     trechos, cinco sem a frota, e a asserção acusaria sempre. */
  var pares = [];
  for (var pi = idx.indexOf("montarMotoristas('"); pi >= 0;
       pi = idx.indexOf("montarMotoristas('", pi + 1)) {
    pares.push(idx.slice(pi, pi + 220));
  }
  ok(pares.length >= 5 && pares.every(function (p) {
       return /montarVeiculos\('/.test(p);
     }),
    'e a frota é remontada em todo ponto em que o motorista é — um caminho que ' +
    'redesenha um e esquece o outro deixa o seletor com a lista velha',
    pares.length + ' trechos, ' +
    pares.filter(function (p) { return !/montarVeiculos\('/.test(p); }).length + ' sem a frota');
  ok((idx.match(/montarVeiculos\('/g) || []).length ===
     (idx.match(/montarMotoristas\('/g) || []).length,
    'e nenhuma sobra dos dois lados: frota montada onde o motorista NÃO é fica ' +
    'agrupada em volta de um campo que ninguém acabou de mexer',
    (idx.match(/montarMotoristas\('/g) || []).length + ' vs ' +
    (idx.match(/montarVeiculos\('/g) || []).length);
  ok(/nenhum veículo liberado para você/.test(idx),
    'e sem frota liberada o campo diz POR QUE está vazio — um seletor só com ' +
    '"Selecione…" e nada dentro lê como tela quebrada');
})();

console.log('\n== o cadastro novo avisa que o item nasce negado ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* O PRECO da convencao, dito na hora de criar. Com a lista explicita, item novo nasce
     NEGADO: ninguem pode usa-lo ate ser marcado, pessoa por pessoa. Descoberto dias
     depois — por um motorista que nao acha o cliente novo na lista — parece bug. */
  var iF = adm.indexOf('function avisoItemNovo(jaExiste, oQue, onde)');
  var fn = adm.slice(iF, adm.indexOf('\n  }', iF));
  ok(iF > 0, 'existe um aviso para o cadastro novo', iF);
  ok(/if \(jaExiste\) return '';/.test(fn),
    'e ele aparece SÓ no cadastro novo — editar item que já existe não muda permissão ' +
    'de ninguém, e o aviso ali seria ruído', fn);
  ok(/não aparece para \*?<b>?ninguém/.test(fn) || /não aparece para/.test(fn),
    'e diz o que acontece: o item não aparece para ninguém', fn);
  ok(/Cadastros/.test(fn),
    'e onde se resolve — aviso que descreve o problema e cala é metade do recado');

  /* Nos CINCO formularios que criam coisa que alguem precisa enxergar. */
  var chamadas = (adm.match(/avisoItemNovo\(/g) || []).length;
  ok(chamadas >= 6,
    'e está nos cinco formulários de cadastro — faltando num, aquele item vira a ' +
    'surpresa que todos os outros avisos existem para evitar', chamadas);
})();

console.log('\n== o seletor de Ajuste obedece a lista de locais ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* A peneira entra nos DOIS campos, e nao so no do ajuste: PERDA mexe no saldo da
     ORIGEM. Peneirar so o destino deixaria a perda como porta dos fundos — a mesma
     pessoa, barrada no ajuste, dando baixa no mesmo local pela outra opcao do seletor. */
  ok(/t==='AJUSTE'\)\{[^\n]*lcDestino[^\n]*opcoes\(soOsQueAjusto\(todos\)\)/.test(adm),
    'o seletor do AJUSTE só oferece os locais liberados');
  ok(/t==='PERDA'\)\{[^\n]*lcOrigem[^\n]*opcoes\(soOsQueAjusto\(todos\)\)/.test(adm),
    'e o da PERDA também — peneirar só o ajuste deixaria a perda como porta dos fundos, ' +
    'baixando o saldo do mesmo local pela outra opção do seletor');

  /* Os outros tipos NAO sao peneirados: eles nascem no campo e ja tem as listas deles. */
  ['SAIDA', 'TRANSFERENCIA', 'DEVOLUCAO'].forEach(function (t) {
    var i = adm.indexOf("t==='" + t + "'");
    var linha = adm.slice(i, adm.indexOf('\n', i));
    ok(i > 0 && linha.indexOf('soOsQueAjusto') < 0,
      'e o ' + t + ' não é peneirado por ela — quem manda nele são `Saidas` e `Destinos`');
  });

  /* A lista sai da SESSAO, que o servidor manda — a mesma que a gravacao usa para
     recusar. Lida do cadastro por fora, seriam duas copias da mesma regra. */
  var iF = adm.indexOf('function locaisQueAjusto()');
  var corpo = adm.slice(iF, adm.indexOf('\n  }', iF));
  ok(iF > 0 && /Q\.sessao\(\)/.test(corpo) && /ses\.ajustes/.test(corpo),
    'e a lista vem da sessão, que é a mesma que o servidor usa para recusar', corpo);
  ok(/if \(!meus\.length\) return lista;/.test(adm),
    'vazia quer dizer TODOS também na tela — invertido aqui, quem pode tudo veria um ' +
    'seletor vazio');

  /* A PENEIRA ANUNCIA QUE PENEIROU. Uma lista curta e muda parece cadastro faltando, e
     manda a pessoa procurar em Cadastros um local que esta la e continua nao aparecendo.
     Marca que esconde sem dizer que escondeu e pior do que marca nenhuma. */
  ok(adm.indexOf('id="lcRestrito"') > 0,
    'a tela tem onde dizer que a lista foi peneirada');
  var iA = adm.indexOf('function avisarAjusteRestrito(tipo, oferecidos)');
  var aviso = adm.slice(iA, adm.indexOf('\n  }', iA));
  ok(iA > 0 && /el\.hidden = !vale/.test(aviso),
    'e o aviso só aparece para quem está restrito — para quem pode tudo ele seria ruído');

  /* "RESTRITO" É TER ALGO ESCONDIDO, e não ter uma lista.
     Antes bastava a pessoa TER lista, e desde que a convenção virou "marcar é
     conceder" todo mundo tem: a migração encheu as vazias com tudo. Medido no cadastro
     real: as 13 pessoas tinham os 11 locais, e as 13 liam "os outros locais não
     aparecem" quando não havia outros. O aviso não estava sobrando — estava mentindo. */
  ok(/var escondidos = lista\.length - liberados\.length;/.test(aviso),
    'e "restrito" é ter algo ESCONDIDO, não ter uma lista — com marcar-é-conceder todo ' +
    'mundo tem lista, e o aviso passou a anunciar um recorte que não existia', aviso);
  ok(/escondidos > 0/.test(aviso),
    'nada escondido, nada a anunciar');
  /* E só em Ajuste e Perda: a peneira entra nesses dois campos e em mais nenhum.
     Sem a guarda do tipo, o aviso apareceria em Saída e Transferência, onde o seletor
     NÃO foi peneirado — a mesma mentira, na direção contrária. */
  ok(/\(tipo === 'AJUSTE' \|\| tipo === 'PERDA'\) && escondidos > 0/.test(aviso),
    'e só nos dois tipos em que a peneira entra — em Saída o seletor não é peneirado, ' +
    'e anunciar um recorte ali é a mesma mentira ao contrário', aviso);
  ok(/nomes\.join/.test(aviso),
    'e o aviso DIZ QUAIS são os locais — "você está restrito" sem dizer a quê deixa a ' +
    'pessoa sem saber se falta cadastro ou falta permissão');
  ok(/Cadastros/.test(aviso),
    'e diz onde se resolve — aviso que descreve o problema e cala é metade do recado');
  ok(/avisarAjusteRestrito\(t, todos\)/.test(adm),
    'e ele é reescrito a cada troca de tipo, junto com o seletor que ele explica — e ' +
    'recebe a MESMA lista que o seletor oferece, senão compararia com outra coisa');

  /* A sessao RENOVADA remonta o seletor. Ela chega depois do primeiro desenho: sem isto,
     a permissao mudada no cadastro so valeria no proximo recarregamento, e ate la a
     pessoa veria os locais antigos e levaria a recusa do servidor sem entender. */
  var iAp = adm.indexOf('function aplicarSessao(s)');
  var corpoAp = adm.slice(iAp, adm.indexOf('\n  }', iAp));
  ok(iAp > 0 && /ajustarLancamento\(\)/.test(corpoAp),
    'e a sessão renovada remonta o seletor — sem isto a permissão mudada no cadastro só ' +
    'valeria no próximo recarregamento', corpoAp);
  ok(/if \(DADOS\) ajustarLancamento\(\)/.test(corpoAp),
    'e só depois de os cadastros chegarem — a abertura passa por ali antes deles, e o ' +
    'seletor não teria o que listar');

  /* O quadro do cadastro. Sem ele, a coluna existe e ninguem tem como preenche-la. */
  ok(/caixaLocais\('fAjustes'/.test(adm),
    'o cadastro tem o quadro para escolher os locais');
  ok(/Nada marcado = <b>nenhum<\/b>/.test(adm.slice(adm.indexOf("caixaLocais('fAjustes'"),
      adm.indexOf("caixaLocais('fAjustes'") + 800)),
    'e diz em voz alta que nada marcado quer dizer NENHUM — é a convenção do projeto, e ' +
    'quem marca precisa saber que deixar vazio não libera nada');
})();

console.log('\n== a porta unica: a mesma tela nos dois apps ==');
(function () {
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* AS DUAS TELAS SAO A MESMA, palavra por palavra. Eram duas quase iguais — "Area do
     Usuario" e "Area Admin" —, cada uma mandando para a outra por um link no rodape;
     quem errava a porta levava "usuario ou senha incorretos", uma mensagem que nao
     falava do erro de verdade, que era o endereco. */
  function entrada(t) {
    var i = t.indexOf('<div id="telaLogin" class="login">');
    return i < 0 ? '' : t.slice(i, t.indexOf('  </div>\n</div>', i) + 15);
  }
  var eCampo = entrada(idx), ePainel = entrada(adm);
  ok(eCampo.length > 3000 && eCampo === ePainel,
    'a tela de entrada é a MESMA nos dois apps, palavra por palavra — divergindo, uma ' +
    'delas passa a pedir outra coisa e a pessoa descobre isso levando uma recusa',
    { campo: eCampo.length, painel: ePainel.length });

  /* UM campo de segredo, e nao dois. Dois campos obrigariam a pessoa a saber que o
     PIN e a senha sao coisas diferentes — que e justamente o que ela nao precisa
     saber. */
  ok((eCampo.match(/id="inSegredo"/g) || []).length === 1,
    'e tem UM campo de segredo — dois obrigariam a pessoa a saber que PIN e senha são ' +
    'coisas diferentes, que é o que ela não precisa saber');
  ok(eCampo.indexOf('id="inPin"') < 0 && eCampo.indexOf('id="inSenha"') < 0,
    'e os dois campos antigos sumiram');
  ok(/6 números, ou a sua senha do painel/.test(eCampo),
    'e a dica diz que os dois servem — sem ela, quem tem senha longa não tenta');

  /* O CAMPO USUÁRIO NÃO TEM DICA DENTRO DELE, a pedido. A etiqueta logo acima já diz o
     que entra ali, e texto cinza dentro da caixa se confunde com valor já digitado —
     mais de uma pessoa toca em Entrar achando que o campo está preenchido.
     A dica da SENHA fica, e não é a mesma coisa: ela está FORA da caixa, embaixo do
     rótulo, e responde uma pergunta que a etiqueta não responde — que o PIN de seis
     números e a senha do painel servem os dois. */
  ok(!/id="inUsuario"[^>]*placeholder=/.test(eCampo.replace(/\n/g, ' ')),
    'e o campo Usuário não leva dica dentro dele — texto cinza dentro da caixa se ' +
    'confunde com campo já preenchido');

  /* UM OLHO, NÃO DOIS — E NÃO NENHUM.
     O campo já teve os dois: o botão do app E o `::-ms-reveal`, que o Edge desenha
     sozinho em todo `input type=password`. Medido na época: o do app centrado em x=550
     e o do Edge em x=510, dois controles iguais lado a lado. A conclusão foi tirar o do
     app e ficar com o do navegador.

     O ERRO ESTAVA NO "NAVEGADOR": o Chrome não desenha nenhum. Quem entra por ele
     digitava a senha às cegas, e a única resposta a um dedo errado era "usuário ou
     senha incorretos". A saída certa é a inversa da de então — cala-se o do navegador,
     que só existe em alguns, e fica o do app, que existe em todos. */
  var folha = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  ok(/input\[type="password"\]::-ms-reveal,\s*\n?input\[type="password"\]::-ms-clear\{display:none\}/
    .test(folha),
    'o olho que o Edge desenha sozinho é calado — é ele que fazia a dupla');
  var jsApp = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  ok(/function olhoDeSenha\(input\)/.test(jsApp) && /olhosDeSenha\(document\);/.test(jsApp),
    'e o olho do app entra em TODOS os campos de senha da tela de entrada — a de trocar '+
    'pede a senha nova duas vezes, e conferir duas digitações às cegas é onde a pessoa '+
    'trava no primeiro acesso');
  ok((jsApp.match(/function olhoDeSenha\(/g) || []).length === 1,
    'de um lugar só: dois botões de mostrar senha acabam discordando sobre o que o '+
    'olho aberto quer dizer');
  ok(/if \(!input \|\| input\.dataset\.olho\) return;/.test(jsApp),
    'e ele não se duplica quando a tela é desenhada de novo');
  /* NASCE OCULTO e o foco volta para onde estava: senha revelada que sobrevive a uma
     troca de tela fica aberta nas costas de quem foi buscar café, e tocar no olho no
     meio da digitação não pode jogar o cursor para o fim do campo. */
  ok(/var i = input\.selectionStart, f = input\.selectionEnd;/.test(jsApp) &&
     /input\.setSelectionRange\(i, f\)/.test(jsApp),
    'tocar no olho devolve o foco e o cursor ao lugar em que estavam');
  ok(/b\.tabIndex = -1;/.test(jsApp),
    'e ele fica fora da ordem do Tab: quem navega pelo teclado vai do campo para '+
    '"Entrar", sem parar num enfeite no meio');
  ok(/\.com-olho > input\{width:100%;padding-right:50px!important\}/.test(folha),
    'o campo abre espaço para o botão — sem isso a senha longa passa por baixo dele, e '+
    'os últimos caracteres somem justo quando se quer conferi-los');
  ok(/\.olho\[aria-pressed="true"\]\{color:var\(--marca-txt\)\}/.test(folha),
    'e revelada, ela acende: senha à mostra não pode virar um estado em que se esquece');
  /* `type="button"`: dentro de um formulário o padrão de um `<button>` é ENVIAR, e
     tocar no olho mandaria a tentativa de login com a senha pela metade. */
  ok(/b\.type = 'button';/.test(jsApp),
    'o botão não envia o formulário — o padrão de `<button>` é enviar, e tocar no olho ' +
    'mandaria a senha pela metade');
  ok(/aria-label', ver \? 'Ocultar a senha' : 'Mostrar a senha'/.test(jsApp),
    'e o rótulo diz o que o toque VAI fazer, e não o nome do campo');
  ok(/b\.setAttribute\('aria-pressed', ver \? 'true' : 'false'\);/.test(jsApp),
    'com o estado chegando a quem ouve a tela: sem ele, o leitor anuncia um botão que ' +
    'nunca muda de situação');
  /* 44px é o mínimo do projeto — "o app é usado de luva, e alvo pequeno custa
     lançamento" —, e a altura não passa do campo: em formulário de painel o campo tem
     uns 45px, e um botão maior que ele escaparia por cima e por baixo. */
  ok(/\.olho\{[\s\S]{0,200}width:44px;height:44px;max-height:calc\(100% - 4px\);/.test(folha),
    'o alvo tem os 44px do projeto, e não estoura a altura do campo');
  ok(/\.olho\{\s*\n\s*position:absolute;right:3px;top:50%/.test(folha),
    'e ele fica DENTRO do campo, à direita — fora dele, vira um botão solto que não se ' +
    'liga ao que ele revela');
  /* OS CAMPOS DE SENHA DO PAINEL também: a senha nova que o admin define para alguém e
     a do escritório na correção. Ligado no `modal`, nenhum formulário novo precisa
     lembrar de pedir. */
  ok(/Q\.olhosDeSenha\(document\.getElementById\('modalBox'\)\);/.test(adm),
    'todo formulário do painel ganha o olho ao abrir — os dois campos de senha de lá ' +
    'também eram digitados às cegas');

  /* Nenhuma das duas manda para a outra: o destino e decidido depois de autenticar. */
  ok(eCampo.indexOf('painel administrativo') < 0 && eCampo.indexOf('app de lançamento') < 0,
    'e nenhuma delas manda a pessoa para a outra — o destino é decidido depois de ' +
    'autenticar, e não pelo link que ela clicou');

  /* O CODIGO TAMBEM E UM SO, e mora no `app.js`: duas copias de uma tela de login
     divergem, e o dia em que uma pedir outra coisa a pessoa descobre levando recusa. */
  ok(/function portaUnica\(aqui, abrir, aviso\)/.test(js),
    'o código da entrada mora no `app.js`, uma vez só');
  [['index.html', idx, "Q.portaUnica('campo'"], ['admin.html', adm, "Q.portaUnica('painel'"]]
    .forEach(function (p) {
      ok(p[1].indexOf(p[2]) > 0, p[0] + ': chama a porta única');
      ok(p[1].indexOf("acao:'login'") < 0 && p[1].indexOf("acao: 'login'") < 0,
        p[0] + ': e não tem login próprio nenhum');
    });

  /* O DESTINO, RODADO DE VERDADE. Comparar o texto da função dizia só que ela está
     escrita de um certo jeito; o que importa é onde cada pessoa CAI.

     QUEM NÃO É ADMIN CAI NA OPERAÇÃO. Bastava ter a chave do painel para o login já
     abrir lá, e gerente, conferente e promotor entravam num painel de números quando
     o que vêm fazer é registrar caixa saindo e voltando. */
  var iD = js.indexOf('function destinoDa(s)');
  var dest = js.slice(iD, js.indexOf('\n  }', iD));
  ok(iD > 0, 'o destino sai de uma função só');
  var destinoDa = new Function('s', 'podePainel',
    dest.replace(/^function destinoDa\(s\)\s*\{/, '') + '\n');
  function cai(perfil, acesso, via) {
    var s = { perfil: perfil, acessoPainel: acesso, temPin: true };
    if (via) s.via = via;
    return destinoDa(s, REGRA_PAINEL);
  }
  var matriz = [
    ['ADMIN', true, 'senha', 'admin.html'],
    ['ADMIN', true, 'pin', 'index.html'],
    /* Sem `via`: é o que a rota LEGADA devolve, para as telas em cache que ainda
       mandam `senha` ou `pin` soltos. Nesse caso o login não manda ninguém para o
       painel — não dá para saber por qual credencial a pessoa entrou, e chutar a
       favor rebaixaria a tranca do escritório à do galpão. Quem tem o painel chega
       nele pela porta, que aí sim deixa a sessão antiga passar. */
    ['ADMIN', true, undefined, 'index.html'],
    /* Os cinco casos reais: gente com o painel liberado que NÃO administra. */
    ['GERENTE', true, 'senha', 'index.html'],
    ['CONFERENTE', true, 'senha', 'index.html'],
    ['PROMOTOR', true, 'senha', 'index.html'],
    ['GERENTE', false, 'senha', 'index.html'],
    ['MOTORISTA', false, 'pin', 'index.html']
  ];
  var erradas = matriz.filter(function (c) { return cai(c[0], c[1], c[2]) !== c[3]; })
    .map(function (c) {
      return c[0] + (c[1] ? ' com chave' : ' sem chave') + ' por ' + c[2] +
        ' → ' + cai(c[0], c[1], c[2]) + ' (devia ser ' + c[3] + ')';
    });
  ok(erradas.length === 0,
    'só o ADMIN cai no painel ao entrar; todo o resto cai na OPERAÇÃO, que é onde se ' +
    'lança. Ter a chave do painel dá a PORTA, não o ponto de partida', erradas);

  ok(/podePainel\(s\)/.test(dest),
    'e o destino PERGUNTA ao `podePainel` em vez de reler a chave: seriam três lugares ' +
    'decidindo sobre a mesma porta, e a terceira cópia divergiria como as duas ' +
    'primeiras divergiram', dest);

  /* O DESVIO acontece: a pessoa e MANDADA para o destino. Sem esta linha, `destinoDa`
     vira um calculo que ninguem usa, e cada pagina abre o proprio app — que e o que a
     porta unica veio desfazer. */
  var iS = js.indexOf('function seguir(usuario, via)');
  var seg = js.slice(iS, js.indexOf('\n    }', iS));
  ok(iS > 0 && /if \(destino !== pagina\) \{ location\.href = destino; return; \}/.test(seg),
    'e quem não está no destino É MANDADO para lá — sem isto `destinoDa` vira um ' +
    'cálculo que ninguém usa, e cada página abre o próprio app', seg);
  /* E o `via` entra na sessao AQUI: e o unico lugar que sabe por onde a pessoa entrou. */
  ok(/sessao\.via = via;/.test(seg),
    'e o `via` entra na sessão neste ponto — é o único lugar do sistema que sabe por ' +
    'qual credencial a pessoa autenticou', seg);

  /* A REGRA DO PIN MORA NO `podePainel`, e as duas telas a consultam. Ela estava
     escrita nas duas, e as duas cópias divergiam noutro ponto — o do ADMIN com a chave
     desligada —, fazendo a porta aparecer no app de campo e cair no login. */
  var iR = js.indexOf('function podePainel(s)');
  var reg = js.slice(iR, js.indexOf('\n  }', iR));
  ok(iR > 0 && /if \(s\.via === 'pin'\) return false;/.test(reg),
    'a sessão de PIN é recusada no painel — mandar para o outro app é conveniência, e ' +
    'quem digita o endereço passa por cima dela', reg);

  /* E CADA TELA PERGUNTA, em vez de recalcular: é recalculando que as cópias nascem. */
  ok(/function podeEntrar\(s\)\{ return Q\.podePainel\(s\); \}/.test(adm),
    'e o painel pergunta a ela, sem recalcular nada');
  ok(/getElementById\('chipPainel'\)\.hidden = !Q\.podePainel\(s\);/.test(idx),
    'e o app de campo esconde a porta pela MESMA resposta — assim a porta que aparece ' +
    'é exatamente a porta que abre');

  /* `via` SOBREVIVE A RENOVACAO. Ela e propriedade da SESSAO, nao do cadastro: o
     servidor so a sabe no login, e `meuAcesso` devolve o registro sem ela. Como a
     renovacao chama `entrar()` com esse registro, sem isto o `via` sumia segundos
     depois — e o login por PIN passava a abrir o painel. Medido no navegador. */
  var iE = js.indexOf('function entrar(u)');
  var ent = js.slice(iE, js.indexOf('\n  }', iE));
  ok(iE > 0 && /if \(novo\.via === undefined\)/.test(ent) && /antes\.via/.test(ent),
    '`via` sobrevive à renovação da sessão — ela é propriedade da SESSÃO, não do ' +
    'cadastro, e sem isto o login por PIN passava a abrir o painel segundos depois', ent);

  /* Sessao de ANTES da porta unica nao tem `via`: essa passa, porque derrubar quem ja
     estava logado no dia do deploy e pior, e o proximo login corrige. */
  ok(/s\.via === 'pin'/.test(reg) && !/s\.via !== 'senha'/.test(reg),
    'e a sessão antiga, sem `via`, continua entrando — derrubar quem já estava logado ' +
    'no dia do deploy é pior, e o próximo login corrige');
})();

console.log('\n== o contraste de cada par que a tela usa ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* "Refaca a conta antes de mexer" estava escrito no CLAUDE.md e nao era cobrado por
     nada. Quando a paleta trocou inteira, a unica coisa entre um tom ilegivel e o galpao
     era alguem lembrar de medir. Agora e isto aqui.

     Os tokens saem do PROPRIO arquivo: uma tabela de cores escrita no teste discordaria
     do `styles.css` no primeiro ajuste, e a medicao passaria a falar de um tema que nao
     existe mais — passando verde justamente quando deveria falhar. */
  var raiz = css.slice(css.indexOf(':root{'), css.indexOf('\n}', css.indexOf(':root{')));
  var TOK = { branco: '#ffffff' };
  (raiz.match(/--[a-z0-9-]+:\s*#[0-9a-fA-F]{6}/g) || []).forEach(function (m) {
    var p = m.split(':');
    TOK[p[0].trim()] = p[1].trim();
  });

  function lum(h) {
    function c(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * c(parseInt(h.slice(1, 3), 16)) +
           0.7152 * c(parseInt(h.slice(3, 5), 16)) +
           0.0722 * c(parseInt(h.slice(5, 7), 16));
  }
  function razao(a, b) {
    if (!TOK[a] || !TOK[b]) return null;
    var x = lum(TOK[a]), y = lum(TOK[b]);
    if (x < y) { var t = x; x = y; y = t; }
    return (x + 0.05) / (y + 0.05);
  }

  /* Cada par e um lugar de VERDADE da tela, e nao uma combinacao teorica. O app e lido
     no celular, no galpao, sob luz forte: o minimo e o AA de 4,5:1. */
  var PARES = [
    ['--txt', '--bg', 'o texto no chão da página'],
    ['--txt', '--surface', 'o texto no cartão'],
    ['--txt', '--campo', 'o que se digita'],
    ['--txt2', '--surface', 'o rótulo e o subtítulo no cartão'],
    ['--txt2', '--surface-2', 'o cabeçalho de tabela'],
    ['--txt2', '--campo', 'o item da navegação lateral'],
    ['--txt3', '--surface', 'a etiqueta apagada no cartão'],
    ['--txt3', '--bg', 'a etiqueta apagada no chão'],
    ['--txt3', '--campo', 'o nome da marca na lateral'],
    ['--verde', '--campo', 'o título do módulo na lateral'],
    ['--marca-txt', '--surface', 'o link no cartão'],
    ['--marca-txt', '--bg', 'o link no chão'],
    ['--roxo-txt', '--brand-soft', 'as iniciais no círculo, em roxo'],
    /* A TINTA SOBRE O ACENTO DEIXOU DE SER BRANCA, e por isso deixou de ser cravada
       aqui. Com a cor da marca trocável, a tinta em cima dela troca junto: o roxo
       clareou para passar contra o cartão (3,24:1) e, clareando, parou de aceitar
       branco (3,57:1). Cravado, este par mediria uma cor que a tela não usa mais — e
       mediria a mesma em todos os temas, que é o contrário do que o tema faz. */
    ['--sobre-brand', '--ambar-btn', 'o BOTÃO PRINCIPAL'],
    ['--sobre-brand', '--brand-hover', 'o botão principal sob o mouse'],
    ['--sobre-brand', '--brand', 'a página aberta na navegação'],
    ['--verde', '--surface', 'o número bom'],
    ['--verde', '--verde-claro', 'a etiqueta verde'],
    ['--vermelho', '--surface', 'o número ruim'],
    ['--vermelho', '--vermelho-claro', 'a etiqueta vermelha e a rede fora'],
    ['--ambar', '--surface', 'o aviso no cartão'],
    ['--ambar-forte', '--ambar-claro', 'o chip da fila por enviar'],
    ['--laranja', '--surface', 'o número em atenção'],
    ['--azul', '--azul-claro', 'a etiqueta azul'],
    ['--txt-fraco', '--campo', 'o texto de exemplo dentro do campo, na entrada'],
    ['--vermelho-txt', '--surface-2', 'o aviso de erro da entrada'],
    ['--sobre-verde', '--marca-verde', 'o BOTAO ENTRAR: tinta escura sobre o verde do logo'],
    ['--sobre-verde', '--verde-hover', 'o botão Entrar sob o mouse'],
    ['--txt3', '--bg', 'o texto de apoio da tela de entrada'],
    ['--txt2', '--marinho', 'o rótulo no card da entrada'],
    ['--txt', '--campo', 'o que se digita na entrada'],
    ['--marca-txt', '--marinho', 'o link da tela de entrada'],
    ['branco', '--marinho', 'o aviso flutuante']
  ];

  var fracos = [];
  PARES.forEach(function (p) {
    var r = razao(p[0], p[1]);
    if (r === null || r < 4.5) {
      fracos.push(p[2] + ': ' + (r === null ? 'TOKEN AUSENTE' : r.toFixed(2) + ':1') +
        ' (' + p[0] + ' sobre ' + p[1] + ')');
    }
  });
  ok(fracos.length === 0,
    'os ' + PARES.length + ' pares de cor da tela passam em WCAG AA (4,5:1) — o app é ' +
    'lido no celular, no galpão, sob luz forte, e tom escolhido a olho não se defende lá',
    fracos);

  /* O par mais apertado, dito em voz alta: e o numero que a proxima troca de tema tem de
     bater. Sem ele, "passa em AA" esconde se a folga e de dois pontos ou de um centesimo. */
  var pior = null;
  PARES.forEach(function (p) {
    var r = razao(p[0], p[1]);
    if (r !== null && (pior === null || r < pior.r)) pior = { r: r, nome: p[2] };
  });
  ok(pior && pior.r >= 4.5,
    'e o mais apertado deles tem folga declarada: ' +
    (pior ? pior.nome + ', em ' + pior.r.toFixed(2) + ':1' : '—'));

  /* Nenhuma cor solta. Foi assim que a troca de tema inteira coube num bloco: se voltar a
     escrever `#fff` numa regra, o proximo que mexer no tema paga a conta de novo — e esta
     medicao aqui deixa de ver a cor que a tela de fato usa. */
  var corpo = css.slice(css.indexOf('\n}', css.indexOf(':root{')));
  var soltas = (corpo.match(/(?:color|background)(?:-color)?:\s*#[0-9a-fA-F]{3,8}/g) || [])
    .filter(function (m) { return !/#fff\b|#ffffff/i.test(m); });
  /* FUNDO NUNCA E TINTA. A medicao acima compara PARES de token; ela nao sabe qual
     token cada regra escolheu. Foi por ai que passou o link da tela de entrada: ele
     usava `--ambar-btn`, que era ambar, virou azul e hoje e o ROXO da marca — tinta escura sobre o
     card azul da entrada, e nenhum par da lista falava desse uso.

     Entao a regra e por TOKEN, e nao por par: estes existem para ser fundo, e escrever
     qualquer um deles como `color:` e o mesmo erro, onde quer que seja. Onde a marca
     precisa ser tinta, e `--marca-txt`. */
  var soFundo = ['--bg', '--surface', '--surface-2', '--campo', '--marinho',
                 '--marinho-esc', '--marinho-claro', '--brand', '--brand-hover',
                 '--brand-soft', '--ambar-btn'];
  var comoTinta = soFundo.filter(function (t) {
    return new RegExp('[^-]color:\\s*var\\(' + t + '\\)').test(css);
  });
  ok(comoTinta.length === 0,
    'e nenhum token de FUNDO é usado como tinta — sobre a própria família ele some, e ' +
    'onde a marca precisa ser letra o token é `--marca-txt`', comoTinta);

  /* O ACENTO É UM SÓ. `--brand` (item aberto do menu, grupo escolhido no Painel de
     Ativos) e `--ambar-btn` (botão principal) têm de valer o mesmo, porque dividem o
     `--brand-hover`: trocando só um, o botão passa a mudar de cor sob o mouse — sai
     azul e volta roxo. Foi exatamente o que quase aconteceu ao trocar o rosa. */
  function tok(nome) {
    var m = new RegExp('\\' + nome + ':\\s*(#[0-9a-fA-F]{6})').exec(css);
    return m ? m[1].toLowerCase() : null;
  }
  ok(tok('--brand') && tok('--brand') === tok('--ambar-btn'),
    'o acento é UM só: `--brand` e `--ambar-btn` valem o mesmo — separados, o botão ' +
    'muda de cor sob o mouse, porque os dois dividem o `--brand-hover`',
    { brand: tok('--brand'), botao: tok('--ambar-btn') });
  ok(tok('--marca-roxo') === tok('--brand'),
    'e a cor da marca na tela de entrada é a MESMA — duas, e a faixa do logo discorda ' +
    'do menu logo depois de entrar',
    { marca: tok('--marca-roxo'), brand: tok('--brand') });

  ok(soltas.length === 0,
    'e NENHUMA cor é escrita solta fora dos tokens — cor solta é a que escapa desta ' +
    'medição e chega ao galpão sem passar por ela. Eram sete (a tela de entrada e o ' +
    'aviso flutuante), e uma delas era um link azul-escuro sobre o card azul da entrada',
    soltas);
})();

console.log('\n== os dois tipos de cartao andam juntos ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* Sao DUAS familias de cartao — `.kpi`, com caixa e sombra, na aba Painel; e `.ftile`,
     com filete a esquerda, no Painel de Ativos e nos Lancamentos. Elas aparecem em telas
     diferentes, mas a pessoa troca de aba e compara: um numero de 26px ao lado de um de
     20px faz a mesma informacao parecer de importancia diferente.

     Entao a afirmacao nao e sobre um tamanho especifico — e sobre os dois serem IGUAIS.
     Quem mexer num vai ter de mexer no outro, que e o que se quer. */
  function tamanho(sel) {
    var i = css.indexOf(sel + '{');
    var m = /font-size:([\d.]+)px/.exec(css.slice(i, i + 160));
    return m ? Number(m[1]) : null;
  }
  var kv = tamanho('.kpi .v'), fv = tamanho('.ftile .v');
  ok(kv !== null && fv !== null && kv === fv,
    'o número dos dois tipos de cartão tem o mesmo tamanho — lado a lado, tamanhos ' +
    'diferentes fazem a mesma informação parecer de importância diferente',
    { kpi: kv, ftile: fv });

  var kr = tamanho('.kpi .r'), fr = tamanho('.ftile .r');
  ok(kr === fr, 'e o rótulo também', { kpi: kr, ftile: fr });

  /* O rotulo NAO encolheu junto com o numero: ele ja estava no limite do legivel, e e ele
     que diz o que o numero e. Um cartao proporcional seria um cartao ilegivel. */
  ok(kr >= 11 && kv >= 18 && kv > kr,
    'o rótulo continua legível e menor que o número — encolher os dois na mesma ' +
    'proporção daria um cartão proporcional e ilegível', { numero: kv, rotulo: kr });

  /* A entrelinha do rotulo e onde sobrava altura depois de a letra ja ter encolhido. */
  ok(/\.ftile \.r\{[^}]*line-height:1\.3/.test(css) &&
     /\.kpi \.r\{[^}]*line-height:1\.3/.test(css),
    'e a entrelinha do rótulo é curta — no padrão 1.5, cada linha de 11.5px gastava ' +
    '17px, e era aí que estava o resto da altura');
})();

console.log('\n== todo tipo de campo de texto tem estilo ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* A LISTA DE TIPOS da regra de campo e uma armadilha: o que nao esta nela nasce com o
     visual de fabrica do navegador — fundo BRANCO e ~190px de largura — no meio de uma
     tela escura. Nao da erro, nao quebra nada, e so aparece quando alguem olha.

     Aconteceu duas vezes: o `type=search` da busca nova, e o `type=email` do cadastro de
     usuarios, que ficou branco por semanas sem ninguem ligar o defeito a causa.

     Entao a afirmacao nao e sobre os tipos que existem hoje: e sobre TODO tipo que as
     telas usam. O proximo `type=` novo cai aqui no mesmo dia em que for escrito. */
  var iR = css.indexOf('input[type=text]');
  var regra = css.slice(iR, css.indexOf('{', iR));
  ok(iR > 0 && regra.indexOf('input[type=text]') === 0,
    'o recorte pegou a lista de tipos da regra', regra);

  /* Os tipos que NAO sao campo de texto: eles tem visual proprio, e entrar nesta regra os
     estragaria — um `checkbox` com `width:100%` vira uma faixa. */
  var FORA = ['button', 'submit', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color'];

  var usados = {};
  ['index.html', 'admin.html', 'extrato.html'].forEach(function (arq) {
    var texto = fs.readFileSync(path.join(__dirname, '..', arq), 'utf8');
    (texto.match(/type="([a-z]+)"/g) || []).forEach(function (m) {
      var t = m.slice(6, -1);
      if (FORA.indexOf(t) < 0) usados[t] = (usados[t] || 0) + 1;
    });
  });

  var faltando = Object.keys(usados).filter(function (t) {
    return regra.indexOf('input[type=' + t + ']') < 0;
  });
  ok(Object.keys(usados).length >= 5 && faltando.length === 0,
    'todo tipo de campo de texto que as telas usam está na regra — fora dela, o campo ' +
    'nasce branco e estreito no meio da tela escura, sem erro nenhum em lugar nenhum',
    { usados: Object.keys(usados).sort(), faltando: faltando });

  /* E o contrario tambem: tipo na regra que ninguem usa e enfeite que o proximo leitor
     vai tentar entender. Nao falha o teste — so aparece na saida, para nao virar dogma. */
  var naRegra = (regra.match(/input\[type=(\w+)\]/g) || [])
    .map(function (m) { return m.slice(11, -1); });
  var sobrando = naRegra.filter(function (t) { return !usados[t]; });
  ok(true, 'tipos na regra que nenhuma tela usa hoje: ' +
    (sobrando.length ? sobrando.join(', ') : 'nenhum'));

  /* O "x" de limpar do `search` nasce preto no Chrome e some no campo escuro — a mesma
     historia do icone do seletor de data, que ja tem a regra dele logo acima. */
  /* A REGRA que clareia, e nao o seletor solto: ele aparece duas vezes (a regra e o
     `:hover`), entao procurar o seletor acha o `:hover` mesmo com a regra desligada. */
  ok(/input\[type=search\]::-webkit-search-cancel-button\{\s*filter:invert\(1\)/
      .test(css),
    'e o "x" de limpar da busca é clareado — preto, ele some no campo escuro, como o ' +
    'ícone do calendário já sumia antes de ganhar a regra dele');
})();

console.log('\n== a busca da aba Lancamentos ==');
(function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  function corpo(nome) {
    var i = html.indexOf('function ' + nome + '(');
    return i < 0 ? '' : html.slice(i, html.indexOf('\n  }', i) + 4);
  }

  /* Os cinco filtros respondem "quais"; a busca responde "cadê aquele". Com trinta
     linhas e cinco listas suspensas, achar UM lançamento custa quatro cliques. */
  ok(html.indexOf('id="lcBusca"') > 0, 'a aba tem campo de busca');

  /* O que ela procura tem de estar ESCRITO. Buscar em campo que a etiqueta não promete
     devolve resultado que a pessoa não entende de onde veio — é a mesma regra da busca
     de usuários do painel. */
  var iB = html.indexOf('id="lcBusca"');
  var campo = html.slice(html.lastIndexOf('<input', iB), html.indexOf('>', iB) + 1);
  ['origem', 'destino', 'caixa', 'motorista', 'quem lançou'].forEach(function (c) {
    ok(campo.indexOf(c) > 0,
      'e o campo diz que procura em ' + c + ' — buscar no que a etiqueta não promete ' +
      'devolve resultado que ninguém entende de onde veio', campo);
  });

  var fonteBusca = corpo('semAcento') + '\n' + corpo('passaBusca');
  ok(fonteBusca.length > 300 && fonteBusca.indexOf('m.usuario') > 0,
    'o recorte pegou a busca', fonteBusca.length);

  /* Rodando. O que interessa não é existir um campo: é o que ela ACHA. */
  var LINHAS = [
    { origem: 'Matriz São Vicente', destino: 'João Pessoa', tipoCaixa: 'CX P',
      motorista: 'Isaque', usuario: 'Nestor Neto' },
    { origem: 'Matriz São Vicente', destino: 'Caruaru', tipoCaixa: 'CX G',
      motorista: 'Ramos', usuario: 'Nestor Neto' },
    { origem: 'João Pessoa', destino: 'Matriz São Vicente', tipoCaixa: 'CX P',
      motorista: 'Isaque', usuario: 'Melkezedeque Soares' }
  ];
  function acha(q) {
    var fn = new Function('document', fonteBusca + '\n return passaBusca;')(
      { getElementById: function () { return { value: q }; } });
    return LINHAS.filter(fn).length;
  }

  ok(acha('') === 3, 'busca vazia não recorta nada', acha(''));
  /* Acento e caixa nao contam: quem procura "joao" tem de achar "João Pessoa", senao a
     busca so serve para quem lembra a grafia exata. */
  ok(acha('joao') === 2 && acha('JOÃO') === 2,
    'acento e caixa não contam — senão a busca só serve para quem lembra a grafia exata',
    [acha('joao'), acha('JOÃO')]);
  ok(acha('isaque') === 2, 'acha pelo motorista', acha('isaque'));
  ok(acha('cx g') === 1, 'e pelo tipo de caixa', acha('cx g'));
  ok(acha('melke') === 1, 'e por quem lançou, que é a coluna nova', acha('melke'));

  /* Cada palavra em ALGUM campo, e nao todas no mesmo: "isaque joao" e como a pergunta
     se faz — o motorista numa coluna, o destino noutra. */
  ok(acha('isaque joao') === 2,
    'duas palavras casam em campos DIFERENTES — "isaque joao" é como a pergunta se faz, ' +
    'com o motorista numa coluna e o destino noutra', acha('isaque joao'));
  ok(acha('isaque caruaru') === 0,
    'e as duas precisam casar na MESMA linha — senão a busca viraria um "ou" e traria ' +
    'quase tudo', acha('isaque caruaru'));
  ok(acha('   joao   ') === 2, 'espaço em volta não atrapalha', acha('   joao   '));
  ok(acha('zzz') === 0, 'e o que não existe não vem');

  /* --- ela entra na MESMA peneira dos filtros ----------------------------- */
  /* Por fora, ela esconderia linhas e deixaria os cartoes de cima somando as escondidas
     — o resumo tem de concordar com a tabela logo abaixo dele. */
  var pf = corpo('passaFiltro');
  ok(/if \(!passaBusca\(m\)\) return false;/.test(pf),
    'a busca entra na mesma peneira dos filtros — por fora, os cartões de cima somariam ' +
    'linhas que a tabela não mostra', pf);

  /* --- o Limpar leva a busca junto --------------------------------------- */
  var iL = html.indexOf("getElementById('btnLimparLanc')");
  var limpar = html.slice(iL, html.indexOf('});', iL));
  ok(/getElementById\('lcBusca'\)\.value = ''/.test(limpar),
    'e o "Limpar filtros" apaga a busca junto — deixá-la para trás faria o botão dizer ' +
    'que limpou com a tabela ainda recortada', limpar);

  /* --- digitar redesenha ------------------------------------------------- */
  ok(/getElementById\('lcBusca'\)\.addEventListener\('input', desenharLanc\)/.test(html),
    'digitar redesenha na hora: com `change` a lista ficaria parada enquanto a pessoa ' +
    'digita');

  /* --- o vazio diz QUAL recorte não achou nada --------------------------- */
  var dl = corpo('desenharLanc');
  ok(/Nenhum lançamento com/.test(dl) && dl.indexOf('nos filtros de agora') > 0,
    'e quando a busca não acha, a tela diz isso — "Nenhum lançamento" sozinho faz a ' +
    'pessoa procurar no período, quando o que sobrou de fora foi o que ela digitou', dl);
})();

console.log('\n== o recorte vale no app de campo tambem ==');
(function () {
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* A permissao "ve apenas os lancamentos dela" valia so no painel. No app de campo a aba
     Lancamentos mostrava os de todo mundo. Restricao aplicada num lugar e nao no outro
     nao restringe nada: fecha a porta da frente, deixa a de tras aberta, e ainda faz quem
     administra acreditar que fechou as duas. */
  var ir = idx.indexOf('function recorteProprios()');
  var rec = idx.slice(ir, idx.indexOf('\n  }', ir));
  ok(ir > 0 && /s\.usuariosVistos/.test(rec) && /s\.verLancamentos === false/.test(rec),
    'o app de campo sabe quem a pessoa pode ver, e se pode ver alguém', rec);

  /* A MESMA regra dos dois lados. Escrita diferente em cada tela, elas divergem no
     primeiro ajuste e uma passa a mostrar o que a outra esconde. */
  var ia = adm.indexOf('function recorteProprios()');
  var recAdm = adm.slice(ia, adm.indexOf('\n  }', ia));
  /* As duas telas tem de decidir IGUAL. Comparar o texto inteiro seria fragil demais
     (os comentarios diferem de proposito), entao compara o miolo: as mesmas tres linhas
     de decisao, na mesma ordem. */
  function miolo(t) {
    return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  }
  ok(miolo(rec) === miolo(recAdm),
    'e a regra é a MESMA das duas telas, linha por linha — escrita diferente em cada ' +
    'uma, elas divergem no primeiro ajuste e uma passa a mostrar o que a outra esconde',
    { campo: miolo(rec), painel: miolo(recAdm) });

  /* O recorte viaja no PEDIDO. Filtrando a lista depois que ela chega, o corte de 2.000
     linhas do servidor vem antes: ela veria so os dela que couberam, e os cartoes de cima
     somariam o que a tabela nao mostra. */
  var iL = idx.indexOf("Q.get({ acao:'movimentos'");
  var pedido = idx.slice(iL, iL + 260);
  ok(iL > 0 && /so:recorteProprios\(\)/.test(pedido),
    'a aba Lançamentos pede o recorte ao servidor — filtrando depois que a lista chega, ' +
    'o corte de 2.000 linhas vem antes e ela veria só os dela que couberam', pedido);

  /* --- e a EXCECAO, que fica de fora de proposito ------------------------- */
  /* O aviso de saldo do formulario de retorno nao e lista de lancamentos: e quantas
     caixas estao naquele lugar agora, e dele sai o alerta "voce contou mais do que o
     saldo". Recortado, o saldo viria menor que a realidade e o alerta dispararia em toda
     devolucao legitima — a pessoa aprenderia a ignora-lo, e ai ele nao guarda mais nada. */
  var ip = idx.indexOf('function carregarPainel()');
  var painel = idx.slice(ip, idx.indexOf('\n  }', ip));
  ok(ip > 0 && painel.indexOf("acao:'painel'") > 0 && !/so:/.test(painel),
    'o saldo do formulário de retorno fica FORA do recorte — é dele que sai o alerta ' +
    '"você contou mais do que o saldo", e recortado ele dispararia em toda devolução ' +
    'legítima até a pessoa aprender a ignorá-lo', painel);
  ok(/ESTE FICA FORA DO RECORTE, de proposito/.test(idx),
    'e a exceção está escrita no código, não só subentendida — sem isso o próximo ' +
    'leitor a "conserta"');

  /* ---- A CAIXA AZUL SAIU; O ALERTA FICOU ----
   *
   * As duas moravam na mesma função e pareciam a mesma coisa. Não são: a azul ficava
   * acesa o tempo todo dizendo um número que quem está no pátio não usa para lançar —
   * ele conta o que veio no caminhão. O alerta só acende quando a contagem passa do
   * saldo, e aí o mesmo número deixa de ser informação e vira pergunta.
   * Esta asserção cobra as DUAS metades. Sem a segunda, "remover a informação" levaria
   * a guarda junto e ninguém notaria — ela só aparece no dia em que falta lançamento. */
  var iS = idx.indexOf('function mostrarSaldoDoOrigem()');
  var fnS = iS > 0 ? idx.slice(iS, idx.indexOf('\n  }', iS)) : '';
  ok(iS > 0 && !/Saldo atual de/.test(fnS),
    'o formulário de retorno não mostra mais a caixa com o saldo do local', fnS.length);
  /* E A GUARDA CONTINUA ACESSÍVEL, o que não é a mesma coisa que continuar escrita.
     Medido: plantei um `return` logo acima dela e a asserção de texto passou verde — o
     alerta estava no arquivo inteirinho, e nenhum estado o alcançava. Então aqui a
     função RODA, e o que se cobra é o que sai na tela. */
  var rodaSaldo = new Function('document', 'PAINEL', 'coletarItens', 'Q',
    fnS + '\n  }\n return mostrarSaldoDoOrigem;');
  function saldoNaTela(saldo, contado) {
    var el = { innerHTML: '' };
    var doc = { getElementById: function (id) {
      return id === 'dvSaldoAtual' ? el : (id === 'dvOrigem' ? { value: 'R1' } : null); } };
    rodaSaldo(doc, { rotas: [{ id: 'R1', nome: 'João Pessoa', saldo: saldo,
                               aging: { maisAntiga: 9 } }], locais: [] },
      function () { return [{ qtd: contado }]; },
      { num: function (n) { return String(n); },
        esc: function (s) { return String(s == null ? '' : s); } })();
    return el.innerHTML;
  }

  ok(saldoNaTela(2340, 100) === '',
    'com a contagem dentro do saldo, o formulário não mostra NADA ali — a caixa azul ' +
    'ficava acesa o tempo todo dizendo um número que quem está no pátio não usa para ' +
    'lançar', JSON.stringify(saldoNaTela(2340, 100)));
  var passou = saldoNaTela(100, 2340);
  ok(/contou/.test(passou) && /saída não lançada/.test(passou),
    'e passando do saldo o alerta APARECE — é a guarda contra saída não lançada, e ela ' +
    'tem de estar alcançável, não só escrita', passou.slice(0, 80));
  ok(!/Saldo atual de/.test(passou),
    'e nem aí a caixa azul volta: o número entra na pergunta, e não como informação de ' +
    'rodapé', passou.slice(0, 80));

  /* --- a aba SOME para quem nao ve lancamento ----------------------------- */
  /* Some, e nao fica vazia: uma aba que abre sem nada dentro parece quebrada, e a pessoa
     volta nela toda vez achando que nao carregou. */
  var ia2 = idx.indexOf('function aplicarSessao(s)');
  var ik2 = idx.indexOf('{', ia2), in2 = 0;
  do {
    if (idx[ik2] === '{') in2++; else if (idx[ik2] === '}') in2--;
    ik2++;
  } while (in2 > 0 && ik2 < idx.length);
  var apl = idx.slice(ia2, ik2);
  ok(/data-pagina="pgSaldo"/.test(apl) &&
     /abaLanc\.style\.display = ve \? '' : 'none'/.test(apl),
    'a aba Lançamentos some para quem não vê lançamento — some, e não fica vazia: uma ' +
    'aba que abre sem nada dentro parece quebrada', apl.slice(-500));
  ok(/abaLanc\.classList\.contains\('ativa'\)/.test(apl) && /primeira\.click\(\)/.test(apl),
    'e se era ela que estava aberta, outra assume — senão o app fica numa página ' +
    'escondida, mostrando tela em branco');
})();

console.log('\n== o formulario ABRE dizendo a verdade ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* O calculo da escolha inicial e o <select>, os dois recortados do arquivo. */
  var iI = adm.indexOf('var inicial = (function(){');
  var calculo = adm.slice(iI, adm.indexOf('})();', iI) + 5);
  var iS = adm.indexOf("'<select id=\"fPainel\">'+");
  var selecao = adm.slice(iS, adm.indexOf("'</select>'+", iS) + 11);
  ok(iI > 0 && iS > 0 && calculo.length > 150 && selecao.length > 300,
    'o recorte pegou o cálculo e o seletor', [calculo.length, selecao.length]);

  /* TODA opcao tem de saber vir marcada. Faltando `selected` em qualquer uma, o
     navegador cai na primeira — que e "nao". */
  ok((selecao.match(/inicial===/g) || []).length === 4,
    'as QUATRO opções sabem vir marcadas — faltando numa, o navegador cai na primeira, ' +
    'que é "não", e o formulário de quem tem painel abre dizendo que não tem',
    (selecao.match(/inicial===/g) || []).length);

  /* E o que o navegador de fato escolhe, para cada registro real. Nao e o que o codigo
     acha que escolheu: e `sel.value` depois de o HTML virar DOM. */
  /* `EQUIPE` e `Q` de mentira: o cálculo compara o tamanho da lista com o número de
     gente ATIVA para saber se "todos" está marcado, e sem eles ele estoura antes de
     chegar na escolha que se quer medir. Três pessoas, todas ativas. */
  var EQUIPE_FALSA = [{ ID: 'U001', Ativo: true }, { ID: 'U005', Ativo: true },
                      { ID: 'U008', Ativo: true }];
  function abre(u) {
    return new Function('u', 'EQUIPE', 'Q',
      calculo + '\n var html = ' + selecao + ';' +
      '\n var m = /<option value="(\\w+)"[^>]*selected/.exec(html);' +
      '\n return m ? m[1] : "NAO";')(
      u, EQUIPE_FALSA, { ativo: function (v) { return v !== false; } });
  }

  [['sem painel, abre em não', { ID: 'U008', AcessoPainel: false, UsuariosVistos: [] }, 'NAO'],
   /* Lista vazia NAO e mais "todos" — e ninguem, e "ninguem" nao tem opcao propria no
      seletor: quem nao ve ninguem esta em "nao ve os lancamentos", o interruptor logo
      abaixo. Entao a lista vazia cai em ESCOLHIDOS, que e a verdade: a lista manda, e
      ela esta vazia. */
   ['com painel e lista vazia, abre em "escolhidos" — a lista manda, e ela está vazia',
    { ID: 'U001', AcessoPainel: true, UsuariosVistos: [] }, 'ESCOLHIDOS'],
   ['com painel e só ela na lista, abre em "apenas ele mesmo" — o caso do Nestor',
    { ID: 'U005', AcessoPainel: true, UsuariosVistos: ['U005'] }, 'EU'],
   ['com painel e outras pessoas, abre em "escolhidos"',
    { ID: 'U009', AcessoPainel: true, UsuariosVistos: ['U005', 'U001'] }, 'ESCOLHIDOS'],
   ['usuário novo, sem ID, abre em não',
    { AcessoPainel: false, UsuariosVistos: [] }, 'NAO']
  ].forEach(function (c) {
    ok(abre(c[1]) === c[2], c[0], { esperado: c[2], veio: abre(c[1]) });
  });

  /* A armadilha em uma frase: quem TEM painel nunca pode abrir em "NAO". Salvar dali
     grava `AcessoPainel: NAO` e tira o acesso de alguem que ninguem mandou tirar. */
  [{ ID: 'U001', AcessoPainel: true, UsuariosVistos: [] },
   { ID: 'U005', AcessoPainel: true, UsuariosVistos: ['U005'] },
   { ID: 'U009', AcessoPainel: true, UsuariosVistos: ['U005', 'U001'] }
  ].forEach(function (u) {
    ok(abre(u) !== 'NAO',
      'quem TEM painel nunca abre em "não" — salvar dali grava AcessoPainel:NAO e tira ' +
      'o acesso de alguém que ninguém mandou tirar', u);
  });
})();

console.log('\n== painel restrito: a tela pede e anuncia o recorte ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- UM controle para UMA pergunta -------------------------------------- */
  /* Tres valores na mesma chave, e nao um interruptor novo ao lado dela: dois controles
     permitiriam "ve apenas os proprios" com o painel desligado, que nao quer dizer nada. */
  /* O interruptor "ve apenas os proprios" virou INTERRUPTOR + LISTA: a lista diz isso
     (marcar so ela) e diz tambem o que o interruptor nao dizia — "ve os dela e os do
     fulano". A chave do painel voltou a responder so pelo painel. */
  var iS = adm.indexOf("'<select id=\"fPainel\">'+");
  var sel = adm.slice(iS, adm.indexOf("'</select>'+", iS));
  /* Quatro valores: nao, todos, so ele, e o "escolhidos" que so aparece quando a lista
     diz isso. Os tres primeiros sao atalhos; o quarto e o espelho da lista. */
  ok(iS > 0 && (sel.match(/<option value=/g) || []).length === 4 &&
     /value="EU"/.test(sel) && /value="ESCOLHIDOS"/.test(sel),
    'a chave do painel oferece o atalho "apenas os lançamentos dele mesmo", e um quarto ' +
    'estado para quando a lista diz outra coisa', (sel.match(/value="(\w+)"/g) || []));
  ok(/dele mesmo/.test(sel),
    'e o rótulo diz de quem se trata, com as palavras de quem pediu', sel);

  ok(/id="fVerLanc"/.test(adm) && /caixaLocais\('fUsuariosVistos'/.test(adm),
    'e há um quadro de Lançamentos, com o interruptor e a lista de quem');
  ok(/De quem ela vê os lançamentos/.test(adm),
    'e a lista diz, no rótulo, de quem se trata');
  ok(/data-marcatudo="'\+id\+'"/.test(adm),
    'a lista ganha "marcar todos" pela mesma caixa compartilhada dos outros quadros — ' +
    'escrever outro botão aqui seria um segundo lugar para consertar');

  var env = adm.slice(adm.indexOf('VerLancamentos:'), adm.indexOf('Saidas:lerMarcados'));
  ok(/VerLancamentos:document\.getElementById\('fVerLanc'\)\.value/.test(env) &&
     /UsuariosVistos:lerMarcados\('fUsuariosVistos'\)/.test(env),
    'o salvar manda os dois', env);

  /* --- a tela PEDE o recorte ---------------------------------------------- */
  var r = adm.indexOf('function recorteProprios()');
  var rec = adm.slice(r, adm.indexOf('\n  }', r));
  ok(r > 0 && /s\.usuariosVistos/.test(rec),
    'o recorte sai da sessão, numa função só', rec);
  /* "Nao ve lancamento nenhum" tem de pedir um recorte que nao casa com ninguem. Nao
     pedir nada seria pedir TODOS, pela convencao do vazio — o contrario do pedido. */
  ok(/s\.verLancamentos === false\) return '__ninguem__'/.test(rec),
    'quem não vê lançamentos pede um recorte que não casa com ninguém — não pedir nada ' +
    'pediria TODOS, pela convenção do vazio, que é o contrário do que o admin marcou');
  /* Cada rota e conferida DENTRO do proprio pedido. A primeira versao desta afirmacao
     procurava o texto em qualquer lugar do arquivo com um `||`, e por isso continuava
     passando quando o recorte era tirado de um dos tres — ela achava o dos outros. */
  [['painel', "{ acao:'painel'"],
   ['movimentos', "{ acao:'movimentos'"],
   ['extrato', "acao:'extrato'"]].forEach(function (par) {
    var i = adm.indexOf(par[1]);
    var trecho = adm.slice(i, i + 420);
    ok(i > 0 && /(pedido\.so = meuRecorte|so:recorteProprios\(\))/.test(trecho),
      'o pedido de ' + par[0] + ' leva o recorte — sem ele essa tela mostra a todos o ' +
      'que as outras escondem', trecho.slice(0, 180));
  });
  ok((adm.match(/recorteProprios\(\)/g) || []).length >= 4,
    'as três telas pedem pelo mesmo caminho — espalhado, o quarto pedido nasce sem o ' +
    'recorte e mostra a todos o que os outros escondem',
    (adm.match(/recorteProprios\(\)/g) || []).length);

  /* --- a faixa de aviso saiu, a pedido ------------------------------------ */
  /* Ela existia e foi retirada por escolha de quem usa. O que fica testado aqui e a
     RETIRADA COMPLETA: elemento, funcao e estilo. Meio removido deixa um `getElementById`
     procurando o que nao existe a cada abertura, e uma regra de CSS orfa que faz o
     proximo leitor procurar um elemento que ninguem desenha mais. */
  ['avisoRecorte', 'anunciarRecorte'].forEach(function (x) {
    ok(adm.indexOf(x) < 0, 'não sobrou nada da faixa de aviso: ' + x);
  });
  ok(css.indexOf('.aviso-recorte') < 0, 'nem o estilo dela');

  /* --- a sessao renovada nao pode PERDER o recorte ------------------------ */
  /* Perdido na renovacao, a pessoa passaria a ver tudo no primeiro recarregamento —
     calada. Foi o teste de campos iguais que pegou isso enquanto se escrevia. */
  var sr = adm.indexOf('function sessaoDoRegistro(u)');
  var corpoSr = adm.slice(sr, adm.indexOf('\n  }', sr));
  ok(/soProprios: u\.SoProprios === true/.test(corpoSr) &&
     /verLancamentos: u\.VerLancamentos !== false/.test(corpoSr) &&
     /usuariosVistos: /.test(corpoSr),
    'a sessão renovada mantém o recorte — perdido aqui, a pessoa passaria a ver tudo no ' +
    'primeiro recarregamento', corpoSr);
})();

console.log('\n== a porta de volta, do painel para os lancamentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var L = require(path.join(__dirname, '..', 'api', '_logica.js'));

  /* Sem ela, quem chegava ao painel ficava preso: para voltar a lancar era preciso Sair e
     entrar de novo. A ida ganhou porta antes da volta, e uma porta so e um corredor. */
  /* A porta mora na NAVEGACAO LATERAL agora: o cabecalho com chips deixou de existir. */
  var iH = adm.indexOf('<div id="app"');
  var cab = adm.slice(adm.indexOf('<aside class="lateral"', iH), adm.indexOf('</aside>', iH));
  ok(cab.indexOf('chipSair') > 0 && cab.indexOf('id="abas"') > 0,
    'o recorte pegou a navegação lateral do painel', cab.length);
  ok(/<a class="nav-link nav-saida" id="chipCampo" href="index\.html"/.test(cab),
    'do painel dá para voltar aos lançamentos — sem isto, quem chega ao painel fica ' +
    'preso nele e a única saída é o botão Sair');
  ok(/id="chipCampo"[^>]*\shidden/.test(cab),
    'e nasce escondida, como a porta de ida');

  /* As duas portas sao simetricas: cada uma aparece so para quem passa do outro lado. */
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(/href="admin\.html"/.test(idx) && /href="index\.html"/.test(adm),
    'as duas telas apontam uma para a outra — uma porta só é um corredor');

  var ia = adm.indexOf('function aplicarSessao(s)');
  var ik = adm.indexOf('{', ia), inn = 0;
  do {
    if (adm[ik] === '{') inn++; else if (adm[ik] === '}') inn--;
    ik++;
  } while (inn > 0 && ik < adm.length);
  var fonte = adm.slice(ia, ik);
  ok(ia > 0 && fonte.indexOf('chipCampo') > 0,
    'o recorte pegou a função que aplica a sessão no painel', fonte.length);

  function volta(s) {
    var alvo = {};
    /* `Q`, `DADOS` e `ajustarLancamento` de mentira: `aplicarSessao` escreve quem esta
       logado e remonta o seletor de Ajuste, e sem eles a funcao estoura antes de chegar
       na decisao que se quer medir. `DADOS` vai NULO de proposito — e o estado real da
       abertura, antes de os cadastros chegarem, e e por ele que o `if (DADOS)` existe. */
    return new Function('s', 'document', 'Q', 'DADOS', 'ajustarLancamento',
      fonte + '\n aplicarSessao(s); return !document.getElementById("chipCampo").hidden;')(
      s, { getElementById: function (id) { return alvo[id] || (alvo[id] = {}); } },
      { quemEsta: function () {} }, null, function () {});
  }

  /* Quem nao tem senha de lancamento nao passa do login do app de campo: `loginPorPin`
     recusa quem nao tem PIN. Mandar essa pessoa para la e mandar para uma recusa. */
  ok(volta({ nome: 'a', perfil: 'Gerente', temPin: true }) === true,
    'quem tem senha de lançamento vê a volta');
  ok(volta({ nome: 'b', perfil: 'Gestor', temPin: false }) === false,
    'quem não tem, não vê — sem PIN o `loginPorPin` recusa, e a porta levaria a uma recusa');
  /* Sessao de antes deste campo existir: a porta APARECE. Esconder o caminho de volta de
     quem o tinha e pior do que oferece-lo a quem talvez nao passe — e a releitura corrige
     no mesmo carregamento. */
  ok(volta({ nome: 'c', perfil: 'Gerente' }) === true,
    'e sessão antiga, sem o campo, continua vendo: esconder o caminho de volta de quem o ' +
    'tinha é pior do que oferecê-lo a quem talvez não passe');

  /* O `temPin` precisa EXISTIR na sessao, dos dois lados, senao a decisao acima nunca tem
     o que ler e a porta fica sempre visivel por acidente. */
  var comPin = L.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y', PIN: '123456' });
  ok(comPin.temPin === true &&
     L.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y' }).temPin === false,
    'a sessão do servidor diz se há senha de lançamento', comPin.temPin);
  ok(JSON.stringify(comPin).indexOf('123456') < 0,
    'e leva o SIM ou NÃO, nunca o PIN');
  var sr = adm.indexOf('function sessaoDoRegistro(u)');
  ok(/temPin: u\.TemPin === true/.test(adm.slice(sr, adm.indexOf('\n  }', sr))),
    'e a cópia da tela lê o mesmo, do que a `equipe` manda');

  /* Um lugar so mexe no cabecalho, nos dois caminhos — o mesmo desenho do app de campo. */
  ok((adm.match(/aplicarSessao\(/g) || []).length >= 3,
    'abertura e renovação aplicam a sessão pelo mesmo caminho',
    (adm.match(/aplicarSessao\(/g) || []).length);
  ok(!/document\.getElementById\('chipCampo'\)/.test(adm.replace(fonte, '')),
    'e só ela mexe na porta de volta');
})();

console.log('\n== a permissão mudada chega a quem já está logado ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var L = require(path.join(__dirname, '..', 'api', '_logica.js'));

  function recorta(assinatura) {
    var i = adm.indexOf(assinatura);
    if (i < 0) return '';
    var k = adm.indexOf('{', i), n = 0;
    do { if (adm[k] === '{') n++; else if (adm[k] === '}') n--; k++; } while (n > 0);
    return adm.slice(i, k);
  }

  var fontes = ['function podeEntrar(s)', 'function podeVerPainelRegistro(u)',
                'function sessaoDoRegistro(u)', 'function renovarSessao()',
                'function abasPermitidas(s)'].map(recorta);
  /* O `podeEntrar` encolheu: hoje ele so repassa a pergunta para `Q.podePainel()`, no
     `app.js`, onde a regra mora uma vez so. Por isso o piso dele e menor que o das
     outras quatro — e o teste diz isso em vez de esconder o numero. */
  ok(fontes[0].length > 20 && fontes.slice(1).every(function (f) { return f.length > 60; }),
    'o recorte pegou as cinco funções', fontes.map(function (f) { return f.length; }));

  /* Roda as cinco funcoes de verdade, com o mundo delas de mentira: a sessao guardada, o
     relogio (a saida e ADIADA, para a pessoa ler o aviso antes de a pagina recarregar) e
     os avisos. Medir sem adiantar o relogio mede o aviso, e nao a saida. */
  function roda(equipe, chegou, guardada, admin) {
    var estado = { sessao: guardada, saiu: false, aviso: '' };
    var relogio = [];
    var api = new Function('EQUIPE', 'EQUIPE_CHEGOU', 'ABAS_PAINEL', 'PAGINAS_DO_ADMIN',
      'Q', 'setTimeout',
      'return (function(){' + fontes.join('\n') +
      '\n return { renovar: renovarSessao, abas: abasPermitidas }; })();')(
      equipe, chegou, L.ABAS, ['pgColunas', 'pgAparencia'],
      { sessao: function () { return estado.sessao; },
        entrar: function (u) { estado.sessao = u; },
        sair: function () { estado.saiu = true; },
        toast: function (m) { estado.aviso = m; },
        /* A regra do painel de VERDADE, e nao uma imitacao: e ela que o `podeEntrar`
           daqui consulta, e imita-la mediria a copia escrita no teste. */
        podePainel: REGRA_PAINEL,
        ehAdmin: function () { return !!admin; } },
      function (fn) { relogio.push(fn); });
    var nova = api.renovar();
    relogio.forEach(function (fn) { fn(); });
    return { nova: nova, abas: api.abas(nova), estado: estado };
  }

  var NESTOR = {
    ID: 'U005', Nome: 'Nestor Neto', Perfil: 'Gerente', AcessoPainel: true, Ativo: true,
    Abas: ['pgRetornos', 'pgPainel', 'pgExtrato', 'pgLancar', 'pgMovimentos']
  };
  /* A sessao VELHA: de quando ele so tinha o Painel de Ativos marcado. E este o caso
     real — o administrador marcou mais abas, e na tela dele nao mudou nada. */
  var velha = { id: 'U005', nome: 'Nestor Neto', perfil: 'Gerente', acessoPainel: true,
                abas: ['pgRetornos'] };

  var r = roda([NESTOR], true, velha, false);
  ok(r.abas.join(',') === 'pgRetornos,pgPainel,pgExtrato,pgLancar,pgMovimentos',
    'a marca nova do cadastro vale sem a pessoa sair e entrar — a sessão guardada é uma ' +
    'foto do login, e sozinha ela congela a permissão do dia em que a pessoa entrou',
    r.abas);
  /* Ajustes esta na marca dele, e agora VALE: a trava por perfil saiu, e quem decide e
     quem cadastra. Antes esta mesma linha afirmava o contrario. */
  ok(r.abas.indexOf('pgLancar') >= 0,
    'e a marca de Ajustes vale, porque o administrador a colocou lá — a trava por perfil ' +
    'saiu a pedido, e o que ficou no lugar dela foi o padrão fechado');
  ok(r.estado.sessao.abas.length === 5,
    'a sessão guardada foi REESCRITA com o registro — senão o próximo carregamento ' +
    'voltaria à foto velha', r.estado.sessao.abas);

  /* --- e a forma nao pode divergir da do servidor ------------------------- */
  /* Sao duas copias da mesma sessao: uma em `sessaoDe()`, no servidor, e outra aqui. Um
     campo que exista de um lado e nao do outro some no meio do caminho, e some calado. */
  var daTela = Object.keys(roda([NESTOR], true, velha, false).nova).sort();
  var doServidor = Object.keys(L.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y' })).sort();
  ok(daTela.join(' ') === doServidor.join(' '),
    'a sessão montada na tela tem os MESMOS campos da montada no servidor — divergindo, ' +
    'um campo sumiria no meio do caminho e ninguém veria',
    { tela: daTela, servidor: doServidor });

  /* --- ninguem e expulso por engano --------------------------------------- */
  /* Lista vazia pode ser "ainda nao carregou" ou "a resposta falhou". Tratar isso como
     "voce saiu do cadastro" poria todo mundo para fora no primeiro soluco de rede. */
  var semLista = roda([], false, velha, false);
  ok(!semLista.estado.saiu,
    'a lista que ainda não chegou não expulsa ninguém — no primeiro soluço de rede, ' +
    'a tela inteira iria para o login');
  ok(semLista.estado.sessao.abas.join(',') === 'pgRetornos',
    'e a sessão fica como estava, em vez de virar uma sessão vazia');

  /* --- mas quem perdeu o acesso sai de fato ------------------------------- */
  [['foi desativado', Object.assign({}, NESTOR, { Ativo: false })],
   ['perdeu o acesso ao painel', Object.assign({}, NESTOR, { AcessoPainel: false })]
  ].forEach(function (par) {
    var x = roda([par[1]], true, velha, false);
    ok(x.estado.saiu && /acesso/i.test(x.estado.aviso),
      'quem ' + par[0] + ' enquanto estava logado é mandado embora, e sabe por quê',
      x.estado.aviso);
  });
  var apagado = roda([], true, velha, false);
  ok(apagado.estado.saiu && /não existe mais/.test(apagado.estado.aviso),
    'e quem teve o cadastro apagado também — com a lista JÁ carregada, não estar nela ' +
    'quer dizer alguma coisa', apagado.estado.aviso);

  /* --- o ADMIN nao se tranca para fora ------------------------------------ */
  /* `podeVerPainel()` é a autoridade, e vale mais que a coluna. Lendo a coluna crua, o
     primeiro admin com ela desligada perderia o próprio painel. */
  var adminSemColuna = { ID: 'U001', Nome: 'Administrador', Perfil: 'Admin',
                         AcessoPainel: false, Ativo: true, Abas: [] };
  var a = roda([adminSemColuna], true,
    { id: 'U001', perfil: 'Admin', acessoPainel: true, abas: [] }, true);
  ok(!a.estado.saiu && a.nova.acessoPainel === true,
    'o ADMIN entra mesmo com a coluna AcessoPainel em false — é a mesma regra do ' +
    '`podeVerPainel()` do servidor, e não a coluna crua');
  ok(a.abas.length === L.ABAS.length,
    'e continua vendo todas as abas', a.abas);

  /* --- a tela chama isso onde importa ------------------------------------- */
  ok(/carregarEquipe\(\)\.then\(function\(\)\{\s*\n\s*var atual = renovarSessao\(\)/
      .test(adm),
    'abrir o painel renova a sessão antes de peneirar as abas — peneirando a foto do ' +
    'login, a permissão mudada não chegaria nunca');
  ok(/ajustarAbasPainel\(renovarSessao\(\)/.test(adm),
    'e salvar um usuário também: o admin pode restringir a si mesmo');
  /* A marca tem de ser posta DENTRO do `r.ok`, e nao ao lado dele. Posta fora, uma
     resposta ruim marcaria "a lista chegou" com a lista vazia — e a renovacao seguinte
     concluiria que todo mundo saiu do cadastro. Procurar o texto solto nao distingue os
     dois casos: foi assim que a primeira versao desta afirmacao passou sabotada. */
  var ce = adm.indexOf('function carregarEquipe()');
  var corpoEq = adm.slice(ce, adm.indexOf('\n  }', ce));
  ok(corpoEq.length > 200 && corpoEq.indexOf('acao:\'equipe\'') > 0,
    'o recorte pegou o carregamento da equipe', corpoEq.length);
  ok(/if \(r && r\.ok\)\{\s*EQUIPE_CHEGOU = true;/.test(corpoEq) &&
     (corpoEq.match(/EQUIPE_CHEGOU/g) || []).length === 1,
    'e a marca de "a lista chegou" é posta DENTRO da resposta boa, e só ali — fora dela, ' +
    'uma resposta ruim faria a renovação concluir que todo mundo saiu do cadastro',
    corpoEq);
})();

console.log('\n== a aba Colunas: gerenciar por módulo ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- saiu de dentro dos filtros ---------------------------------------- */
  /* As colunas moraram no painel de filtros e na barra de Movimentos. Sairam das duas: o
     ajuste e o mesmo para todos os modulos, e espalhado por tela ele vira uma copia por
     tela. Nada do caminho antigo pode ficar para tras — elemento e ouvinte orfaos ficam
     procurando o que nao existe a cada clique da pagina. */
  ['colunasLista', 'colunasMovLista', 'colunasMovPop', 'btnColunasMov',
   'montarPainelColunas', 'ajustarColunasMov'].forEach(function (x) {
    ok(adm.indexOf(x) < 0, 'não sobrou nada do painel antigo: ' + x);
  });
  ok(css.indexOf('#colunasLista') < 0, 'nem o estilo dele');
  ok(css.indexOf('.chk-col') < 0,
    'nem o da caixa de marcar que esconder deixou de usar — estilo órfão é a pista falsa ' +
    'que faz o próximo leitor procurar um elemento que não existe');

  var g = adm.indexOf('<div class="ret-pop" id="filtrosRet"');
  var pop = (function () {
    var i = g, n = 0;
    while (i < adm.length) {
      if (adm.slice(i, i + 4) === '<div') n++;
      else if (adm.slice(i, i + 6) === '</div>') { n--; if (!n) return adm.slice(g, i + 6); }
      i++;
    }
    return '';
  })();
  ok(pop.length > 200 && pop.indexOf('Colunas da tabela') < 0,
    'o painel de filtros voltou a ser só de filtros', pop.length);

  /* E a contagem do gatilho volta a responder por uma coisa so. */
  var ab = adm.indexOf('function ajustarBarraFiltros()');
  var corpoBarra = adm.slice(ab, adm.indexOf('\n  }', ab));
  ok(corpoBarra.indexOf('colunasOcultas') < 0,
    'e o gatilho dele conta filtros, e só', corpoBarra);

  /* --- a aba existe dos dois lados --------------------------------------- */
  ok(adm.indexOf('id="pgColunas"') > 0 && adm.indexOf('id="listaColunas"') > 0,
    'a página Colunas existe');

  /* --- o registro dos modulos -------------------------------------------- */
  var tg = adm.indexOf('function tabelasGerenciaveis()');
  var reg = adm.slice(tg, adm.indexOf('\n  }', tg));
  ok(/modulo: 'Painel de Ativos',\s+t: TAB_ATIVOS/.test(reg) &&
     /modulo: 'Movimentos',\s+t: TAB_MOV/.test(reg) &&
     /modulo: 'Cadastros · Usuários',\s+t: TAB_USUARIOS/.test(reg),
    'os módulos com tabela de colunas-dado estão registrados — registrar o próximo é ' +
    'acrescentar um item aqui, e não escrever outra tela', reg);

  /* --- toda coluna de fabrica tem NOME ------------------------------------ */
  /* A aba precisa dos nomes sem desenhar a tabela. Faltando um, a linha apareceria com o
     id cru ("lancado") e ninguem saberia que coluna e. */
  [['TAB_ATIVOS'], ['TAB_MOV'], ['TAB_USUARIOS']].forEach(function (par) {
    var i = adm.indexOf('var ' + par[0] + ' = {');
    var desc = adm.slice(i, adm.indexOf('\n  };', i));
    var ip = desc.indexOf('padrao: [');
    var cols = (desc.slice(ip, desc.indexOf(']', ip)).match(/'(\w+)'/g) || [])
      .map(function (t) { return t.slice(1, -1); });
    var it = desc.indexOf('titulos: {');
    var tit = desc.slice(it, desc.indexOf('}', it));
    var sem = cols.filter(function (c) { return tit.indexOf(c + ':') < 0; });
    ok(cols.length > 0 && sem.length === 0,
      par[0] + ': toda coluna de fábrica tem nome — sem ele a aba mostraria o id cru', sem);
  });

  /* --- a tela, rodando ---------------------------------------------------- */
  var d = adm.indexOf('function desenharColunas()');
  var dk = adm.indexOf('{', d), dn = 0;
  do {
    if (adm[dk] === '{') dn++; else if (adm[dk] === '}') dn--;
    dk++;
  } while (dn > 0 && dk < adm.length);
  var fonte = adm.slice(d, dk);
  ok(d > 0 && /data-colver=/.test(fonte) && /data-colsobe=/.test(fonte) &&
     /data-collarg=/.test(fonte),
    'o recorte pegou a tela, e ela traz as três funções: esconder, mover e expandir');

  /* A TELA TEM TRÊS ESTADOS, e o quarto argumento diz qual: quem não é admin, o admin
     com as colunas travadas, e o admin depois de confirmar a senha. Os dois interruptores
     entram separados porque respondem perguntas diferentes — quem é a pessoa, e se ela
     acabou de confirmar que é ela. */
  function tela(ordem, ocultas, larg, quem) {
    quem = quem || {};
    var admin = quem.admin !== false, aberto = quem.destravado !== false;
    var box = { innerHTML: '', querySelectorAll: function () { return []; } };
    /* Um elemento genérico para os ids do formulário de senha: o desenho travado
       procura o campo, o botão e a linha de erro, e `null` estouraria antes da
       asserção poder olhar o HTML. */
    function falso() {
      return { value: '', textContent: '', hidden: false, disabled: false,
               addEventListener: function () {}, focus: function () {} };
    }
    new Function('document', 'Q', 'tabelasGerenciaveis', 'ordemColunas', 'colunasOcultas',
      'larguras', 'LARG_MIN', 'colunasDestravadas', 'horaDaTrava', 'destravarColunas',
      'conferirSenhaDasColunas',
      fonte + '\n desenharColunas();')(
      { getElementById: function (id) { return id === 'listaColunas' ? box : falso(); } },
      { esc: function (v) { return String(v); },
        ehAdmin: function () { return admin; },
        olhosDeSenha: function () {} },
      function () {
        return [{ modulo: 'Painel de Ativos',
                  t: { titulos: { data: 'Data', saida: 'Saída', quem: 'Quem' } } }];
      },
      function () { return ordem; }, function () { return ocultas; },
      function () { return larg; }, 70,
      function () { return aberto; }, function () { return '13:05'; },
      function () {}, function () { return Promise.resolve({ ok: true }); });
    return box.innerHTML;
  }

  var h = tela(['data', 'saida', 'quem'], [], { data: 95, saida: 160, quem: 190 });
  ok((h.match(/data-colver=/g) || []).length === 3, 'uma linha por coluna', h.length);
  ok(h.indexOf('>Data<') > 0 || h.indexOf('> Data<') > 0 || h.indexOf('Data</label>') > 0,
    'com o NOME da coluna, e não o id', h.slice(0, 400));
  ok(/value="95"/.test(h) && /value="190"/.test(h),
    'e a largura de cada uma, em pixels', h);
  ok(/min="70"/.test(h),
    'com o mínimo do projeto — sem ele daria para encolher a coluna até sumir');

  /* A primeira nao sobe e a ultima nao desce: botao que nao faz nada pede a mesma
     leitura de um que faz. */
  var linhas = h.split('col-linha').slice(1);
  ok(/data-colsobe="data"[^>]*disabled/.test(linhas[0]),
    'a primeira coluna não sobe', linhas[0].slice(0, 200));
  ok(/data-coldesce="quem"[^>]*disabled/.test(linhas[2]),
    'e a última não desce', linhas[2].slice(0, 200));

  /* Coluna escondida fica APAGADA, e nao some da lista: some, nao haveria como traze-la
     de volta — e e justamente ela que se procura. */
  var h2 = tela(['data', 'saida', 'quem'], ['saida'], { data: 95, saida: 160, quem: 190 });
  ok((h2.match(/data-colver=/g) || []).length === 3,
    'escondida, a coluna continua na lista — sumindo, não haveria como trazê-la de volta');
  ok(/col-linha apagada/.test(h2) && (h2.match(/col-linha apagada/g) || []).length === 1,
    'e fica apagada, só ela', (h2.match(/col-linha apagada/g) || []).length);
  ok(/1 escondida/.test(h2), 'e a ficha do módulo diz quantas estão fora', h2.slice(0, 300));

  /* --- ESCONDER precisa estar escrito ------------------------------------- */
  /* Esta era uma caixa de marcar sem rotulo. Marcada, ela nao diz o que acontece ao
     desmarcar, e a palavra que a pessoa procura nao aparecia em canto nenhum da tela: o
     usuario abriu a aba e nao achou como esconder coluna. Nada disso quebrava um teste,
     porque todos olhavam para o `data-colver` e nenhum para o que se LE.

     Entao a afirmacao agora e sobre o texto visivel. */
  var visivel = h.replace(/<[^>]+>/g, ' ');
  ok(/esconder/i.test(visivel),
    'a ação de esconder está ESCRITA na linha, e não só implícita numa caixa de marcar',
    visivel.slice(0, 300));
  ok(!/type="checkbox"/.test(h),
    'e não é mais uma caixa de marcar: marcada, ela não diz o que o clique vai fazer');
  ok(/data-acao="esconder"/.test(h),
    'o botão carrega a ação que vai executar');

  /* Escondida, a linha oferece o caminho de VOLTA, com outro nome. Oferecer "esconder"
     numa coluna ja escondida nao diria nada a ninguem. */
  var visivel2 = h2.replace(/<[^>]+>/g, ' ');
  ok(/mostrar/i.test(visivel2) && /data-acao="mostrar"/.test(h2),
    'e a coluna escondida oferece "mostrar" — o caminho de volta, com o nome dele',
    visivel2.slice(0, 300));
  ok((h2.match(/data-acao="mostrar"/g) || []).length === 1,
    'só ela, e não a lista inteira', (h2.match(/data-acao="mostrar"/g) || []).length);

  /* E a tela diz as tres acoes por extenso. As setas e o numero se explicam pela forma
     para quem passa o ponteiro — num celular nao ha ponteiro que passe. */
  ok(/largura em pixels/.test(visivel) && /mudam a ordem/.test(visivel),
    'a tela diz o que cada controle faz, em palavras — no celular não há ponteiro que ' +
    'passe por cima para descobrir', visivel.slice(0, 400));
  ok(!/escondida/.test(h), 'sem nenhuma escondida, a ficha fica muda');

  /* Os modulos que ainda nao entram sao ditos na tela, em vez de simplesmente faltarem. */
  ok(/ainda não aparecem aqui/.test(fonte) && /locais, locais padrão/.test(fonte),
    'e a tela diz quais módulos ainda não entram, em vez de fingir que não existem');

  /* --- mover mexe na ordem COMPLETA --------------------------------------- */
  /* O recorte e da funcao `mover`, e nao da tela inteira: a mesma linha aparece tambem no
     desenho da lista, entao varrer tudo acharia o texto certo ainda que `mover` lesse
     outra lista. Foi assim que a primeira versao desta afirmacao passou sabotada. */
  var mv = fonte.indexOf('function mover(id, passo){');
  var mk = fonte.indexOf('{', mv), mn = 0;
  do {
    if (fonte[mk] === '{') mn++; else if (fonte[mk] === '}') mn--;
    mk++;
  } while (mn > 0 && mk < fonte.length);
  var corpoMover = fonte.slice(mv, mk);
  ok(mv > 0 && corpoMover.length > 120 && corpoMover.indexOf('guardarOrdem(t, ordem)') > 0,
    'o recorte pegou a função `mover` inteira', corpoMover.length);
  ok(/= ordemColunas\(t\)/.test(corpoMover) && !/colunasVisiveis/.test(corpoMover),
    'e ela troca a coluna com a vizinha na ordem COMPLETA — mexendo só no visível, a ' +
    'ordem das escondidas se embaralharia sem ninguém ver, e elas voltariam noutro lugar',
    corpoMover);

  /* --- o mesmo armazenamento da tabela ------------------------------------ */
  /* Se esta tela guardasse noutro lugar, seriam duas verdades sobre a mesma coluna: o que
     se arrasta no cabecalho nao apareceria aqui, e vice-versa. */
  ['guardarOcultas(t,', 'guardarOrdem(t,', 'guardarLargura(t,'].forEach(function (f) {
    ok(fonte.indexOf(f) > 0, 'grava pelo mesmo caminho da tabela: ' + f);
  });
  /* TODO gravar redesenha. Pedir uma ocorrencia so nao distingue nada numa tela que
     grava em quatro lugares — esconder, mover, largura e restaurar: tres redesenhando e
     um nao passa igual, e o quarto e justamente o que deixa a tabela mentindo ate alguem
     trocar de aba. Entao a conta e por gravacao. */
  var gravacoes = fonte.match(/guardar(Ocultas|Ordem|Largura)\(t,|removeItem\(t\.kOrdem\)/g) || [];
  var semRedesenho = [];
  gravacoes.forEach(function (g) {
    var i = fonte.indexOf(g);
    while (i >= 0) {
      /* Da gravacao ate o fim do tratador dela. */
      var fim = fonte.indexOf('});', i);
      if (fonte.slice(i, fim < 0 ? fonte.length : fim).indexOf('t.redesenha()') < 0) {
        semRedesenho.push(g + ' @' + i);
      }
      i = fonte.indexOf(g, i + 1);
    }
  });
  ok(gravacoes.length >= 4 && semRedesenho.length === 0,
    'e TODA gravação manda a tabela se redesenhar — a que não mandasse deixaria a tabela ' +
    'mostrando o ajuste antigo até alguém trocar de aba',
    semRedesenho.length ? semRedesenho : gravacoes.length);

  /* `change`, e nao `input`: digitando "1" antes de "120", o `input` gravaria 1 e a
     coluna encolheria ao minimo no meio da digitacao. */
  ok(/addEventListener\('change', function\(\)\{\s*\n\s*guardarLargura/.test(fonte),
    'a largura grava no `change`, não a cada tecla — digitando "1" antes de "120", a ' +
    'coluna encolheria ao mínimo no meio da digitação');

  /* --- restaurar apaga as TRES -------------------------------------------- */
  ok(/removeItem\(t\.kOrdem\)/.test(fonte) && /removeItem\(t\.kLarg\)/.test(fonte) &&
     /removeItem\(t\.kOcultas\)/.test(fonte),
    'restaurar apaga as três preferências de uma vez — uma só deixaria a tabela num ' +
    'meio-termo que ninguém escolheu');

  /* --- a aba desenha ao abrir --------------------------------------------- */
  var ao = adm.indexOf('window.aoAbrirAba = function(p)');
  var corpoAo = adm.slice(ao, adm.indexOf('\n  };', ao));
  ok(/pgColunas'\) desenharColunas\(\)/.test(corpoAo),
    'e a aba desenha ao abrir', corpoAo);

  ok(/\.col-linha\.apagada\{opacity/.test(css) && /\.mod-colunas\{/.test(css),
    'a tela tem estilo próprio');

  /* ================= SÓ O ADMINISTRADOR ARRANJA AS COLUNAS =================
   *
   * Mover, esconder e alargar passaram a ser do administrador. Não é tranca de
   * segurança — o arranjo mora no `localStorage` de quem olha e nunca saiu de lá —,
   * é decisão sobre quem personaliza a própria vista. O que se ganha é a tela ser a
   * MESMA para todo mundo na hora de conferir um número por telefone.
   *
   * SÃO DOIS PORTÕES, e confundi-los foi um defeito que foi ao ar. VER o arranjo salvo
   * depende do PERFIL; ARRANJAR depende do perfil E da senha.
   *
   * Com um portão só, a trava — que nasce fechada a cada carregamento — fazia a tabela
   * IGNORAR o arranjo guardado: a coluna escondida reaparecia toda vez que se abria
   * Movimentos, sumia depois de a pessoa digitar a senha na aba Colunas, e voltava no
   * carregamento seguinte. O arranjo parecia não salvar.
   *
   * O raciocínio errado foi querer que quem DEIXOU de ser admin não ficasse com o
   * arranjo antigo. Isso continua valendo — e `Q.ehAdmin()` sozinho já resolve, porque
   * quem deixou de ser admin não é admin. A senha nunca teve nada a ver com esse caso:
   * ela existe para impedir alguém de MEXER nas colunas no computador do escritório, e
   * não para impedir alguém de VER a tabela como o dono dela a deixou. */
  ok(/function podeVerArranjo\(\)\{ return Q\.ehAdmin\(\); \}/.test(adm) &&
     /function podeArranjarColunas\(\)\{ return podeVerArranjo\(\) && colunasDestravadas\(\); \}/.test(adm),
    'são dois portões: VER o arranjo depende do perfil, ARRANJAR depende do perfil E ' +
    'da senha — com um só, o arranjo salvo sumia a cada carregamento');
  /* AS TRÊS LEITURAS perguntam pelo PERFIL, e nunca pelo portão inteiro. */
  [['ordemColunas',  /function ordemColunas\(t\)\{[\s\S]{0,260}?if \(!podeVerArranjo\(\)\) return t\.padrao\.slice\(\);/,
    'a ordem de fábrica'],
   ['larguras',      /function larguras\(t\)\{[\s\S]{0,200}?if \(!podeVerArranjo\(\)\) \{/,
    'a largura de fábrica'],
   ['colunasOcultas', /function colunasOcultas\(t\)\{[\s\S]{0,360}?if \(!podeVerArranjo\(\)\) return \[\];/,
    'nenhuma coluna escondida']].forEach(function (p) {
    ok(p[1].test(adm),
      'e `' + p[0] + '` devolve ' + p[2] + ' para quem não é admin — e para o admin vale ' +
      'SEMPRE o que está guardado, com a trava aberta ou fechada');
  });
  /* E NENHUMA DAS TRÊS pergunta pela SENHA: era exatamente isso que fazia o arranjo
     salvo sumir a cada carregamento, e é o defeito que o usuário encontrou. */
  ['ordemColunas', 'larguras', 'colunasOcultas'].forEach(function (f) {
    var iF = adm.indexOf('function ' + f + '(t)');
    var corpoF = adm.slice(iF, adm.indexOf('\n  }', iF));
    ok(iF > 0 && corpoF.indexOf('podeArranjarColunas') < 0,
      'e `' + f + '` não pergunta pela SENHA — pedi-la para ler o que a própria pessoa ' +
      'salvou faz o arranjo parecer que não salvou');
  });
  /* A GRAVAÇÃO TAMBÉM RECUSA, embora nada devesse chegar até ela: um ouvinte que
     sobreviva a uma troca de sessão sem redesenho é o tipo de coisa que ninguém vê. */
  ['guardarOrdem', 'guardarLargura', 'guardarOcultas'].forEach(function (f) {
    var i = adm.indexOf('function ' + f + '(');
    ok(i > 0 && /^[\s\S]{0,120}?if \(!podeArranjarColunas\(\)\) return;/
                  .test(adm.slice(i)),
      'e `' + f + '` se recusa a gravar — defesa no caminho de escrita, não só no gesto');
  });
  /* OS GESTOS NÃO SÃO LIGADOS, e o cabeçalho não os PROMETE: prometer um gesto que não
     acontece é pior que não prometer nada, porque a pessoa insiste achando que errou. */
  ['ligarArrastarColunas', 'ligarLarguraColunas'].forEach(function (f) {
    var i = adm.indexOf('function ' + f + '(t)');
    ok(i > 0 && /^[\s\S]{0,60}?if \(!podeArranjarColunas\(\)\) return;/.test(adm.slice(i)),
      'e `' + f + '` nem se liga');
  });
  ok(/function arrastavel\(\)\{ return podeArranjarColunas\(\) \? ' draggable="true"' : ''; \}/.test(adm) &&
     /function puxador\(\)\{ return podeArranjarColunas\(\) \? '<span class="puxador"><\/span>' : ''; \}/.test(adm),
    'e o cabeçalho sai sem `draggable` e sem alcinha — prometer um gesto que não ' +
    'acontece faz a pessoa insistir achando que errou a mão');
  /* E O CURSOR VAI JUNTO — foi a régua que achou isto, e não o código: com o JS todo
     correto, medido no Chrome com sessão de conferente, o título continuava com
     `cursor:grab`. A mão aberta é uma promessa: a pessoa arrasta, nada se move, e
     conclui que a tela travou. O seletor pergunta pelo PRÓPRIO `draggable` para não
     haver dois lugares dizendo quem arrasta. */
  ok(/table\.fixa th\[data-col\]:not\(\[draggable\]\)\{cursor:default\}/.test(css),
    'e a mão aberta some junto: medido, o cursor continuava `grab` para quem não pode ' +
    'arrastar, prometendo um gesto que não acontece');
  ok(/table\.fixa th\.ordenavel:not\(\[draggable\]\)\{cursor:pointer\}/.test(css),
    'mas a coluna que classifica mantém a mão de clique — classificar vale para todos');
  /* AS TRÊS TABELAS pelas mesmas peças: três cópias divergiriam na primeira mexida. */
  ok((adm.match(/<th'\+arrastavel\(\)\+' data-col=/g) || []).length === 3 &&
     (adm.match(/puxador\(\)\+/g) || []).length === 3,
    'e as TRÊS tabelas usam as mesmas peças — Ativos, Movimentos e Usuários',
    (adm.match(/<th'\+arrastavel\(\)\+' data-col=/g) || []).length);
  /* CLASSIFICAR NÃO É ARRANJAR. Clicar no título para ordenar continua valendo para
     todos: a permissão governa a FORMA da tabela, não a ordem das linhas, e tirar a
     classificação de quem confere seria tirar a única ferramenta de leitura que tem. */
  ok(/dicaColuna\(c\.d\.k \? 'clique para classificar; ' : ''\)/.test(adm) &&
     !/ordenavel[\s\S]{0,60}podeArranjarColunas/.test(adm),
    'mas classificar continua valendo para todos: a permissão governa a FORMA da ' +
    'tabela, não a ordem das linhas');
  /* A TELA RECUSA POR CONTA PRÓPRIA, e não confia em estar escondida no menu: a página
     existe e o endereço dela é alcançável, e tela vazia não se distingue de quebrada. */
  var recusa = tela(['data', 'saida', 'quem'], [], { data: 95, saida: 160, quem: 190 },
                    { admin: false });
  ok(recusa.indexOf('Só o administrador ajusta as colunas') > 0 &&
     recusa.indexOf('data-colver=') < 0,
    'e a aba Colunas recusa por conta própria, dizendo por quê — escondida no menu ' +
    'ela ainda é alcançável, e tela vazia não se distingue de tela quebrada', recusa);
  /* E O CAMINHO ATÉ ELA SOME PARA QUEM NÃO É ADMIN: conceder a porta para uma tela que
     recusa é pior que não oferecer a porta. A palavra do perfil vem ANTES da marcação.
     MAS QUEM PERGUNTA AQUI É O PERFIL, e nunca o `podeArranjarColunas()`, que exige a
     senha já confirmada. A primeira versão desta linha usava o portão completo e
     TRANCOU A PORTA PELO LADO DE FORA: o item só apareceria depois de destravar, e
     destravar é o que se faz dentro dele — a aba sumiu para o próprio administrador, e
     foi ele quem percebeu, não a suíte. A asserção de então cobrava o portão completo:
     ela não deixou o defeito passar, ela o FIXOU, e a sabotagem confirmou o errado.
     São dois degraus: o PERFIL decide se a porta existe; a SENHA decide o que acontece
     depois de entrar. A asserção cobra os dois, e cobra que não se troquem. */
  /* A REGRA VIROU LISTA, e a asserção cobra a LISTA. A Aparência entrou depois e tem o
     mesmo feitio — não mexe em dado nenhum, uma arruma a tabela e a outra pinta a tela.
     Cravada numa página só, esta linha obrigaria um segundo `if` ao lado do primeiro, e
     é assim que a terceira nasce sem nenhum. */
  /* A LISTA VIROU CONSTANTE, e a peneira passou a ler a MESMA. Enquanto o menu escondia
     e a peneira exigia marca, as duas discordavam — e o efeito só apareceu no dia em que
     a Aparência nasceu: página nova não está na lista marcada de ninguém, então ela não
     chegava nem ao administrador, e o título SISTEMA sumia com o único item dele.
     Esta asserção cobra que as duas pontas leiam a mesma constante. */
  var portao = /if \(PAGINAS_DO_ADMIN\.indexOf\(b\.dataset\.pagina\) >= 0 && !Q\.ehAdmin\(\)\) ok = false;/;
  ok(portao.test(adm) &&
     /var PAGINAS_DO_ADMIN = \['pgColunas', 'pgAparencia'\];/.test(adm) &&
     /PAGINAS_DO_ADMIN\.indexOf\(x\) < 0/.test(adm),
    'o botão delas some do menu para quem não é admin, mesmo que a aba tenha sido ' +
    'concedida — oferecer o caminho para uma porta trancada é pior que não oferecer');
  ok(!/pgColunas' && !podeArranjarColunas\(\)/.test(adm),
    'e quem decide isso é o PERFIL, não o portão inteiro: exigir a senha para MOSTRAR ' +
    'o item tranca a porta pelo lado de fora, porque a senha se digita lá dentro');

  /* ================= A SENHA, MESMO SENDO ADMIN =================
   *
   * O arranjo nasce TRAVADO a cada abertura da página, e destravar pede a senha do
   * painel de novo. O caso que isto resolve é o computador do escritório com a sessão
   * do administrador aberta, e alguém sentando nele — que é frequente.
   *
   * O que NÃO resolve, e por isso não se chama tranca: quem abrir as ferramentas do
   * navegador edita o `localStorage` e remonta a tabela sem senha nenhuma. É uma
   * confirmação. Chamá-la de tranca seria pior que não tê-la, porque alguém confiaria
   * nela para uma coisa que ela não faz. */
  ok(/var COLUNAS_ATE = 0;/.test(adm) &&
     !/localStorage[\s\S]{0,60}COLUNAS_ATE/.test(adm) &&
     !/COLUNAS_ATE[\s\S]{0,60}localStorage\.setItem/.test(adm),
    'a liberação vive na MEMÓRIA, e não no armazenamento — guardar "está destravado" ' +
    'onde a própria pessoa escreve é entregar a chave junto com a fechadura');
  ok(/var JANELA_COLUNAS = 15 \* 60 \* 1000;/.test(adm) &&
     /relogioTrava = setTimeout\(function\(\)\{ travarColunas\(true\); \}, JANELA_COLUNAS\);/.test(adm),
    'e ela vence em quinze minutos — o motivo de existir a senha é o computador que ' +
    'fica aberto, e liberar até o fim do dia devolveria exatamente esse caso');
  /* VENCENDO, AS TABELAS SÃO REDESENHADAS. Não basta parar de gravar: o cabeçalho
     continuaria arrastável e o arrasto não faria nada — a pessoa mexe, nada acontece,
     e conclui que a tela travou. É a mesma lição do cursor de mão aberta. */
  ok(/function travarColunas\(porVencimento\)\{[\s\S]{0,200}redesenharArranjaveis\(\);/.test(adm) &&
     /function destravarColunas\(\)\{[\s\S]{0,260}redesenharArranjaveis\(\);/.test(adm),
    'e as duas viradas redesenham as tabelas — é no desenho que o `<th>` ganha ou ' +
    'perde o `draggable`, e sem isso o gesto fica prometido e sem efeito');
  ok(/travarColunas\(true\)[\s\S]{0,400}Q\.toast\(/.test(adm) ||
     /if \(porVencimento\) Q\.toast\(/.test(adm),
    'e o vencimento AVISA — trancar calado deixa a pessoa arrastando sem entender');
  /* ---- MOVER OS FILTROS DE LUGAR ------------------------------------------
   * A MESMA maquinaria das colunas, e de propósito: `ordemColunas` e `guardarOrdem` só
   * precisam de um descritor com `padrao` e `kOrdem`, e não sabem nem se o que estão
   * ordenando é coluna. Uma segunda cópia da regra — inclusive a de "campo novo entra
   * ao lado do vizinho de fábrica" — divergiria no primeiro conserto que só uma
   * recebesse. */
  ok(/var FILTROS_MOV = \{\s*\n\s*padrao: \[/.test(adm) &&
     /kOrdem: 'qdc_ordem_filtros_mov_v1'/.test(adm) &&
     /ordemColunas\(FILTROS_MOV\)/.test(adm) &&
     /guardarOrdem\(FILTROS_MOV, ordem\);/.test(adm),
    'os filtros se movem pela MESMA maquinaria das colunas — a regra de ordem é uma só, ' +
    'e ela nem sabe se o que ordena é coluna ou campo');
  /* E PELA MESMA TRAVA: um cadeado governando uma coisa e não a outra, na mesma tela,
     seria uma regra que ninguém consegue repetir de cabeça. */
  ok(/lab\.draggable = podeArranjarColunas\(\);/.test(adm),
    'e pela MESMA trava — quem arranja as colunas arranja os filtros');
  /* O RÓTULO É A ALÇA. Com a caixinha inteira arrastável, começar um arrasto em cima do
     seletor rouba o clique que abre a lista — e um seletor que não abre é pior que um
     filtro que não se move. */
  ok(/var div = por\[id\], lab = div\.querySelector\('label'\);/.test(adm) &&
     /\.grid-filtros label\[draggable="true"\]\{cursor:grab/.test(css),
    'o rótulo é a alça, e não a caixinha inteira — arrastar de cima do seletor roubaria ' +
    'o clique que abre a lista');
  /* A MÃO PERGUNTA PELO PRÓPRIO `draggable`, e não por uma classe à parte: dois lugares
     dizendo quem arrasta divergem no dia em que só um mudar. É a mesma lição do cursor
     do cabeçalho da tabela. */
  ok(!/\.grid-filtros label\.pode-arrastar/.test(css),
    'e o cursor sai do próprio `draggable` — uma classe à parte seria um segundo lugar ' +
    'dizendo quem arrasta');
  /* `appendChild` MOVE o nó original, então o valor escolhido, o foco e os ouvintes vão
     junto. Refazer a marcação perderia os três, e o filtro se limparia sozinho ao ser
     arrastado — com o agravante de a lista recarregar com outro recorte. */
  ok(/ordemColunas\(FILTROS_MOV\)\.forEach\(function\(id\)\{\s*\n\s*if \(por\[id\]\) g\.appendChild\(por\[id\]\);/.test(adm),
    'e reordenar MOVE o nó, em vez de reescrever a marcação — o valor escolhido, o foco ' +
    'e os ouvintes vão junto');
  /* O CAMPO ESCONDIDO DO TRECHO fica fora: ordenar o que não se vê não quer dizer nada,
     e ele ocuparia uma posição invisível no meio da lista. */
  ok(/if \(c && !div\.hasAttribute\('hidden'\)\) por\[c\.id\] = div;/.test(adm),
    'e o campo escondido do trecho fica de fora — ele ocuparia uma posição invisível no ' +
    'meio da lista');
  /* A CHAVE SAI DO ID DO CONTROLE: um `data-` escrito à mão seria mais um lugar para
     esquecer quando um campo novo entrar, e o id já existe porque o `filtroExclusao()`
     lê por ele. */
  ok(/var c = div\.querySelector\('select,input'\);/.test(adm),
    'e a chave sai do id do controle, que já existe — um atributo à mão seria mais um ' +
    'lugar para esquecer no campo seguinte');
  /* A ORDEM SALVA É A COMPLETA. Mexer só no que está visível embaralharia a posição dos
     escondidos sem ninguém ver — é a mesma razão da regra das colunas. */
  ok(/var ordem = ordemColunas\(FILTROS_MOV\);\s*\n\s*var de = ordem\.indexOf\(arrastado\);/.test(adm),
    'e a ordem gravada é a COMPLETA, e não a visível — mexer só no visível embaralha a ' +
    'posição dos escondidos sem ninguém ver');
  /* A VOLTA AO PADRÃO: sem ela, quem embaralhou onze campos não desfaz a não ser
     arrastando de volta um por um, e nem lembra qual era a ordem. */
  ok(/function restaurarFiltros\(\)\{[\s\S]{0,200}removeItem\(FILTROS_MOV\.kOrdem\)/.test(adm) &&
     /data-restaurar-filtros/.test(adm),
    'e há como voltar ao padrão — sem isso, quem embaralhou onze campos desfaz ' +
    'arrastando um por um, e nem lembra qual era a ordem');
  /* A ORDEM VALE DESDE A PRIMEIRA PINTURA — mas a chamada mora no ARRANQUE, no fim do
     arquivo, e não no meio dele.
     A versão anterior desta afirmação cobrava a posição ERRADA: ela exigia a chamada
     logo acima do `trilhoFiltros`, que fica ACIMA de `var FILTROS_MOV = {…}`. `var` iça
     a declaração e não o valor, então a chamada recebia `undefined` e estourava — e um
     erro no carregamento para tudo o que vem depois dele, inclusive a última linha do
     arquivo, que é a que abre a porta. O painel foi ao ar sem login.
     Mais uma afirmação que FIXOU o defeito em vez de pegá-lo, e a sabotagem confirmou o
     errado. Agora ela cobra o que importa: a chamada DEPOIS da declaração. */
  var iDecl = adm.indexOf('var FILTROS_MOV = {');
  var iUso = adm.indexOf('  aplicarOrdemFiltros();\n  ligarArrastarFiltros();');
  ok(iDecl > 0 && iUso > iDecl,
    'e a ordem salva é aplicada DEPOIS da declaração do descritor — antes dela, `var` ' +
    'entrega `undefined`, a chamada estoura, e o arquivo para antes de abrir a porta',
    [iDecl, iUso]);
  ok(/aplicarOrdemFiltros\(\);\s*\n\s*ligarArrastarFiltros\(\);\s*\n\s*\n\s*if \(podeEntrar\(Q\.sessao\(\)\)\)/.test(adm),
    'e ela roda no arranque, ao lado do que decide entre abrir o app e pedir login — ' +
    'é o lugar de quem precisa do arquivo inteiro montado');

  /* ---- O CADEADO FICA ONDE O GESTO É TENTADO ------------------------------
   * O destravamento morava só na aba "Colunas", e isso estava errado na prática: para
   * mexer numa coluna era preciso SAIR da tabela, atravessar o menu, digitar a senha e
   * voltar. Atrito demais para uma coisa de uso diário — e o efeito real, relatado, foi
   * a pessoa arrastar, nada acontecer, e concluir que o recurso tinha sido tirado.
   * O cadeado agora fica ao lado da tabela, e um clique abre o pedido de senha. */
  /* UM POR TELA QUE TEM TABELA ARRANJÁVEL, e antes da tabela.
   *
   * Esta asserção já existiu cobrando "um cadeado no arquivo inteiro", e a justificativa
   * era boa — dois cadeados na MESMA tela são dois estados a conferir para a mesma
   * coisa. Só que "na mesma tela" virou "no arquivo" na hora de escrever, e o arquivo
   * tem três telas. O efeito: o cadeado ficou só em Movimentos, o Painel de Ativos e os
   * Usuários ficaram com o arrasto travado e NADA dizendo por quê, e a asserção
   * aprovava isso. Depois ela reprovou o conserto.
   *
   * O que ela cobra agora é a garantia de verdade: toda tabela que se pode arranjar tem
   * o cadeado na tela dela, um só, e acima da tabela. A lista das tabelas sai do próprio
   * código — uma quarta tabela arranjável entra nesta conta sozinha, em vez de nascer
   * sem cadeado e sem ninguém reparar. */
  var alvos = (adm.match(/alvo: '#([A-Za-z]+)'/g) || [])
    .map(function (m) { return /alvo: '#([A-Za-z]+)'/.exec(m)[1]; });
  ok(alvos.length >= 3, 'a leitura achou as tabelas arranjáveis mesmo', alvos);
  var telas = adm.split(/(?=<section id="pg)/);
  alvos.forEach(function (id) {
    var tela = telas.filter(function (s) { return s.indexOf('id="' + id + '"') >= 0; })[0];
    var n = (String(tela).match(/<div class="trava-colunas" data-trava-colunas><\/div>/g)
             || []).length;
    ok(n === 1 && tela.indexOf('data-trava-colunas') < tela.indexOf('id="' + id + '"'),
      '#' + id + ': o cadeado fica nesta tela, um só, e acima da tabela — sem ele a ' +
      'pessoa arrasta, nada acontece, e conclui que o recurso quebrou',
      { cadeados: n, antes: tela.indexOf('data-trava-colunas') < tela.indexOf('id="' + id + '"') });
  });
  /* E CADA TABELA PINTA O SEU AO DESENHAR. O elemento no HTML nasce vazio; pintado só
     num lugar de partida, ele ficaria em branco justamente nas telas ainda não abertas —
     e vazio é o estado que fez a tabela parecer quebrada. */
  ['desenharFluxo', 'desenharMovimentos', 'desenharUsuarios'].forEach(function (f) {
    var i = adm.indexOf('function ' + f + '(');
    var corpo = adm.slice(i, adm.indexOf('\n  function ', i + 10));
    ok(i > 0 && corpo.indexOf('pintarTrava();') > 0,
      f + ': pinta o cadeado ao desenhar — no HTML ele nasce vazio', i > 0);
  });
  ok(/function pedirSenhaDasColunas\(\)\{/.test(adm) &&
     /modal\('<h3 style="margin:0 0 4px">Liberar as colunas<\/h3>'\+/.test(adm),
    'e o pedido de senha é um modal, que volta para onde a pessoa estava — a tabela ' +
    'que ela quer arrumar');
  /* ELE DIZ O ESTADO, e não só o que fazer. Sem isso a liberação vence de surpresa e a
     pessoa volta a arrastar no vazio. Medido nos quatro cenários. */
  ok(/colunasDestravadas\(\)\s*\n\s*\? '<span class="trava__on">Colunas e filtros liberados até/.test(adm) &&
     /data-travar>Travar agora<\/button>/.test(adm),
    'e ele diz o ESTADO: travado mostra o cadeado, liberado mostra até que horas vale e ' +
    'o jeito de travar na hora');
  /* SÓ PARA QUEM PODE: oferecer o caminho para uma porta trancada é pior que não
     oferecer. E ele pergunta pelo PERFIL, não pela trava — senão sumiria justamente
     quando é preciso, que é com a trava fechada. */
  ok(/if \(!podeVerArranjo\(\)\) \{ box\.innerHTML = ''; return; \}/.test(adm),
    'e some para quem não é administrador — perguntando pelo PERFIL, porque pela trava ' +
    'ele sumiria justamente quando é preciso');
  ok(/\.trava-colunas:empty\{display:none\}/.test(css),
    'e vazio ele não deixa um buraco na tela — espaço em branco no meio da página ' +
    'parece peça que não carregou');
  /* O CADEADO E OS FILTROS VIRAM JUNTO com as tabelas. Esquecido, o cadeado diria
     "travadas" com a tabela já arrastável, e "liberados até 13:05" quinze minutos
     depois de vencer; e os rótulos dos filtros continuariam arrastáveis sem gravar
     nada, porque `guardarOrdem` recusa — gesto prometido e sem efeito. */
  var iRed = adm.indexOf('function redesenharArranjaveis()');
  var red = iRed > 0 ? adm.slice(iRed, adm.indexOf('\n  }', iRed)) : '';
  ok(/desenharColunas\(\);/.test(red) && /ligarArrastarFiltros\(\);/.test(red) &&
     /pintarTrava\(\);/.test(red),
    'e ele é repintado nas duas viradas da trava — rótulo que mente sobre o próprio ' +
    'estado é pior que rótulo nenhum');
  /* UM OUVINTE SÓ, no documento: os cadeados são redesenhados a cada virada, e um
     ouvinte por desenho empilharia dezenas no mesmo botão. */
  ok(/if \(e\.target\.closest\('\[data-destravar\]'\)\) \{ pedirSenhaDasColunas\(\); return; \}/.test(adm),
    'e o clique é ligado uma vez no documento — por desenho, empilharia dezenas no ' +
    'mesmo botão');

  /* A CONFERÊNCIA MORA NO `app.js`, junto da entrada: a mesma rota, uma vez só. Uma
     segunda cópia divergiria da primeira no dia em que o login mudasse. */
  var nucleo = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  ok(/function conferirSenha\(segredo\) \{/.test(nucleo) &&
     /conferirSenha: conferirSenha,/.test(nucleo) &&
     /Q\.conferirSenha\(segredo\)/.test(adm),
    'e a conferência da senha mora no `app.js`, na mesma rota do login — duas cópias ' +
    'divergiriam no dia em que a entrada mudasse');
  /* MANDA `segredo`, e não `senha`: quem entra por PIN também precisa poder confirmar. */
  ok(/post\(\{ acao: 'login', identificador: s\.nome, segredo: segredo \}\)/.test(nucleo),
    'e manda `segredo`, não `senha` — quem entra por PIN também confirma');
  /* CONFERE QUEM VOLTOU. O servidor acha por nome, usuário ou e-mail e devolve o
     PRIMEIRO que bater: dois cadastros ativos com o mesmo nome fariam a senha de um
     confirmar a sessão do outro. */
  ok(/if \(String\(u\.id\) !== String\(s\.id\)\) \{/.test(nucleo),
    'e confere se voltou a MESMA pessoa — o servidor devolve o primeiro nome que bate, ' +
    'e dois cadastros homônimos deixariam a senha de um valer pela sessão do outro');
  /* E O PERFIL VOLTA DO BANCO: quem deixou de ser admin depois de entrar é pego aqui,
     sem precisar sair e voltar. */
  ok(/String\(\(r\.usuario \|\| \{\}\)\.perfil\)\.toUpperCase\(\) !== 'ADMIN'/.test(adm),
    'e o perfil é relido do servidor: quem deixou de ser admin depois de entrar não ' +
    'destrava coluna nenhuma');
  /* A SENHA NÃO FICA NO CAMPO depois da tentativa, certa ou errada — o formulário
     continua na tela enquanto a pessoa arruma as colunas.
     ESCOPADO no tratador da senha, e não contado no arquivo: `campo.value = ''`
     aparece cinco vezes no admin.html, e três não têm nada a ver com senha — a
     contagem passava com a linha certa apagada, porque as outras respondiam por ela.
     E a limpeza vem ANTES do `if (!r.ok)`: assim ela vale para a tentativa certa e
     para a errada. O `catch` responde pelo terceiro caso, o da rede que cai no meio. */
  /* O `catch` é ancorado no BOTÃO desta tela, e não em `.catch(function(e){` solto:
     há vinte e sete deles no admin.html, e um outro — a 250 mil caracteres daqui —
     tem um `campo.value = ''` logo abaixo e respondia por este. Apagar a linha certa
     passava. */
  ok(/conferirSenhaDasColunas\(v\)\.then\(function\(r\)\{[\s\S]{0,300}?campo\.value = '';\s*\n\s*if \(!r\.ok\)/.test(adm) &&
     /\.catch\(function\(e\)\{\s*\n\s*bt\.disabled = false; bt\.textContent = 'Destravar';\s*\n\s*campo\.value = '';/.test(adm),
    'e o campo é esvaziado depois da tentativa — certa, errada e sem rede');

  /* --- os três estados da tela, desenhados ---------------------------------- */
  var travado = tela(['data', 'saida', 'quem'], [], { data: 95, saida: 160, quem: 190 },
                     { admin: true, destravado: false });
  ok(travado.indexOf('id="senhaColunas"') > 0 &&
     travado.indexOf('type="password"') > 0 &&
     travado.indexOf('data-colver=') < 0,
    'travada, a aba pede a senha ANTES de mostrar o editor — mostrar tudo e recusar no ' +
    'fim faria a pessoa mexer em tudo para levar um não no último passo', travado);
  ok(travado.indexOf('15 minutos') > 0 && travado.indexOf('recarregar') > 0,
    'e diz quanto tempo vale e o que a encerra, em vez de deixar a pessoa descobrir');
  var aberto = tela(['data', 'saida', 'quem'], [], { data: 95, saida: 160, quem: 190 },
                    { admin: true, destravado: true });
  ok(aberto.indexOf('Colunas liberadas até') > 0 &&
     aberto.indexOf('id="btnTravarColunas"') > 0 &&
     aberto.indexOf('data-colver=') > 0,
    'destravada, ela mostra o editor, ATÉ QUANDO vale e um jeito de travar na hora — ' +
    'quem terminou não precisa esperar quinze minutos', aberto);
  /* SEM regra de `[hidden]` própria: já existe UMA para qualquer elemento, e a
     asserção lá de cima cobra exatamente que não se escreva outra por peça descoberta.
     Foi a quarta tentativa do projeto de fazer isso, e a suíte pegou na hora. */
  ok(/\.destrava-colunas\{/.test(css) && /\.destravado-ate\{/.test(css) &&
     /\.erro-destrava\{/.test(css),
    'e os três pedaços têm estilo, sem `[hidden]` próprio — a regra geral já cuida disso');
  /* NADA ESTÁ ERRADO quando a tela pede a senha: vermelho ali faria a pessoa procurar
     um problema que não existe. A cor fica para o erro de verdade, logo abaixo. */
  ok(!/\.destrava-colunas\{[^}]*(--vermelho|--amarelo)/.test(css),
    'e a caixa de destravar não é um alarme — a cor fica para o erro de verdade');
})();

console.log('\n== recolher o trilho ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* O gatilho fica FORA do trilho. Dentro, sumiria junto e nao haveria como trazer a
     coluna de volta — o mesmo erro que o painel de filtros evita. */
  var bt = adm.indexOf('id="btnTrilho"');
  var ini = adm.indexOf('<aside class="ret-rail"');
  var fim = adm.indexOf('</aside>', ini);
  ok(bt > 0 && !(bt > ini && bt < fim),
    'o gatilho fica fora do trilho — dentro, sumiria junto e não haveria como voltar',
    [bt, ini, fim]);
  ok(/aria-controls="retRail"/.test(adm) && /id="retRail"/.test(adm),
    'e diz qual região ele controla, para quem navega por leitor de tela');

  /* Recolhido, o trilho sai da grade inteiro — nao vira faixa de icones. */
  ok(/\.ret-wrap\.sem-trilho\{grid-template-columns:1fr\}/.test(css),
    'recolhido, a tabela ocupa a largura toda');
  ok(/\.ret-wrap\.sem-trilho \.ret-rail\{display:none\}/.test(css),
    'e a coluna some de fato');

  /* --- os nomes dos grupos vem de um lugar so ----------------------------- */
  var i = adm.indexOf('var NOMES_GRUPO = {');
  var mapa = adm.slice(i, adm.indexOf('};', i));
  ok(i > 0 && (mapa.match(/'/g) || []).length >= 14,
    'existe uma lista única de nomes de grupo', mapa.length);
  var j = adm.indexOf('var itens = [');
  var lista = adm.slice(j, adm.indexOf('];', j) + 60);
  ok(/NOMES_GRUPO\[c\.v\]/.test(lista) && lista.indexOf("r:'") < 0,
    'e a lista do trilho lê dela, em vez de repetir os nomes — repetidos, o trilho diria ' +
    '"Unidades" e o botão, "Filiais"', lista);
  ['todas', 'ROTA', 'FILIAL', 'CLIENTE', 'deficit', 'MOTORISTA', 'USUARIO']
    .forEach(function (v) {
      ok(mapa.indexOf(v + ':') > 0, 'o grupo ' + v + ' tem nome na lista');
    });

  /* --- o comportamento, rodando ------------------------------------------- */
  var a = adm.indexOf('var TRILHO_CHAVE');
  var b = adm.indexOf('function ajustarTrilho()');
  var k = adm.indexOf('{', b), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var fonte = adm.slice(a, k);
  ok(a > 0 && /function ajustarTrilho/.test(fonte) && /function trilhoRecolhido/.test(fonte),
    'o recorte pegou as peças — sem isto a bancada abaixo exercita outro código');

  function bancada(grupo, recolhido) {
    var els = {
      retWrap: { className: 'ret-wrap' },
      btnTrilho: { className: '', textContent: '', title: '', attrs: {},
                   setAttribute: function (x, v) { this.attrs[x] = v; } }
    };
    var loja = { qdc_trilho_v1: recolhido ? '1' : '0' };
    var ls = { getItem: function (c) { return loja[c] === undefined ? null : loja[c]; },
               setItem: function (c, v) { loja[c] = String(v); } };
    var doc = { getElementById: function (id) { return els[id] || null; } };
    var NOMES = new Function('return ' + adm.slice(adm.indexOf('{', adm.indexOf('var NOMES_GRUPO')),
                             adm.indexOf('};', adm.indexOf('var NOMES_GRUPO')) + 1) + ';')();
    var api = new Function('document', 'localStorage', 'FLUXO_FILTRO', 'NOMES_GRUPO',
      fonte + '\n return ajustarTrilho;')(doc, ls, grupo, NOMES);
    api();
    return els;
  }

  var aberto = bancada('todas', false);
  ok(aberto.retWrap.className === 'ret-wrap' &&
     aberto.btnTrilho.attrs['aria-expanded'] === 'true',
    'aberto: a coluna aparece, e o leitor de tela sabe', aberto.retWrap.className);

  var recolhido = bancada('todas', true);
  ok(/sem-trilho/.test(recolhido.retWrap.className) &&
     recolhido.btnTrilho.attrs['aria-expanded'] === 'false',
    'recolhido: a coluna some', recolhido.retWrap.className);
  ok(recolhido.btnTrilho.textContent === '☰' &&
     !/alerta/.test(recolhido.btnTrilho.className),
    'em "Todas" o botão fica mudo: não há nada escondido para avisar',
    recolhido.btnTrilho.textContent);

  /* O caso que importa: recolhido COM grupo escolhido. */
  var comGrupo = bancada('USUARIO', true);
  ok(comGrupo.btnTrilho.textContent === '☰ Usuários',
    'recolhido com grupo escolhido, o botão diz QUAL grupo peneira a tabela',
    comGrupo.btnTrilho.textContent);
  ok(/alerta/.test(comGrupo.btnTrilho.className),
    'e troca de cor: deixa de ser controle e vira aviso', comGrupo.btnTrilho.className);
  ok(/Usuários/.test(comGrupo.btnTrilho.title),
    'o título repete o que isso significa para a tabela', comGrupo.btnTrilho.title);

  /* Aberto com grupo escolhido nao avisa: o grupo esta aceso na coluna, a vista. */
  var abertoComGrupo = bancada('USUARIO', false);
  ok(!/alerta/.test(abertoComGrupo.btnTrilho.className) &&
     abertoComGrupo.btnTrilho.textContent === '⟨',
    'aberto, não há aviso — o grupo está aceso na coluna, à vista',
    abertoComGrupo.btnTrilho.textContent + ' | ' + abertoComGrupo.btnTrilho.className);

  /* Um nome de grupo diferente para provar que o rotulo vem do MAPA, e nao de um texto
     fixo: se viesse fixo, "Em déficit" apareceria como "USUARIO" ou como o mesmo de cima. */
  ok(bancada('deficit', true).btnTrilho.textContent === '☰ Em déficit',
    'e o nome sai do mapa, não de um texto fixo',
    bancada('deficit', true).btnTrilho.textContent);

  /* O rotulo tem de ACOMPANHAR o grupo. Recolhido em "Usuários", um clique em Limpar
     devolve a tabela para "Todas" — e sem esta chamada o botao continuaria dizendo
     "Usuários" sobre uma tabela que ja mostra tudo. Rotulo velho mente pior que rotulo
     nenhum, porque parece informacao. */
  var dF = adm.indexOf('function desenharFluxo()');
  var corpoF = adm.slice(dF, adm.indexOf('\n  /* Três frases diferentes', dF));
  ok(corpoF.indexOf('ajustarTrilho()') > 0,
    'o desenho do fluxo reajusta o rótulo — por ele passa tudo que muda o grupo');

  /* Preferencia de quem olha — ao contrario do painel de filtros, esta se guarda: uma
     tela larga com poucos grupos quer o espaco na tabela, e toda visita. */
  ok(/qdc_trilho_v1/.test(adm), 'o estado recolhido fica guardado no navegador');
  var fo = adm.slice(adm.indexOf('function trilhoRecolhido()'));
  fo = fo.slice(0, fo.indexOf('\n  }'));
  ok(/try \{/.test(fo) && /catch/.test(fo),
    'com try/catch: janela anônima e cookies bloqueados fazem o acesso estourar, e uma ' +
    'preferência de layout não pode derrubar o painel');
})();

console.log('\n== os filtros num painel suspenso ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- onde cada coisa mora ----------------------------------------------- */
  var ra = adm.indexOf('<div class="ret-acoes">');
  var trilho = adm.slice(ra, adm.indexOf('</aside>', ra));
  ok(ra > 0, 'existe um bloco de ações no trilho');
  ['btnVerFiltros', 'btnLimparRetornos', 'btnCsvRetornos', 'btnAtualizarRetornos']
    .forEach(function (id) {
      ok(trilho.indexOf('id="' + id + '"') > 0, 'o botão ' + id + ' mora no trilho');
    });

  /* Os cinco filtros sairam do cabecalho e foram para dentro do painel. */
  /* O recorte fecha CONTANDO as marcas, e nao parando no primeiro `</div>`: as duas
     datas passaram a dividir uma fileira dentro de um <div>, e o recorte por primeira
     ocorrencia parou ali — cortando fora os dois ultimos filtros. Verde ele nao ficou,
     mas ficaria se o corte tivesse caido depois do ultimo campo em vez de antes. */
  var g = adm.indexOf('<div class="ret-pop" id="filtrosRet"');
  var pop = (function () {
    var i = g, n = 0;
    while (i < adm.length) {
      if (adm.slice(i, i + 4) === '<div') n++;
      else if (adm.slice(i, i + 6) === '</div>') { n--; if (!n) return adm.slice(g, i + 6); }
      i++;
    }
    return '';
  })();
  ok(g > ra, 'o painel suspenso fica dentro do bloco do trilho');
  ok(pop.length > 200 && /<\/div>$/.test(pop),
    'e o recorte dele pegou a caixa inteira — cortado no meio, os filtros de baixo ' +
    'sumiriam da conferencia abaixo sem nada acusar', pop.length);
  ['rtOrigem', 'rtDestino', 'rtDe', 'rtAte', 'verTesteRetornos'].forEach(function (id) {
    ok(pop.indexOf('id="' + id + '"') > 0, 'o filtro ' + id + ' mora no painel');
  });
  ok(adm.indexOf('class="acoes"') < 0 && adm.indexOf('grupo-filtros') < 0,
    'e a fileira de filtros do cabeçalho não existe mais');
  ok(css.indexOf('.grupo-filtros') < 0 && css.indexOf('.rot-inline') < 0 &&
     css.indexOf('.dt-inline') < 0 && css.indexOf('.sel-inline') < 0,
    'nem o CSS que só ela usava — regra sem dono é o que ninguém ousa apagar depois');

  /* O gatilho fica FORA do painel que ele abre: dentro, sumiria junto e nao haveria como
     reabrir. A conferencia olha o INTERVALO do painel, e nao a ordem no arquivo. */
  var bt = adm.indexOf('id="btnVerFiltros"');
  ok(bt > 0 && !(bt > g && bt < adm.indexOf('</div>', g)),
    'o gatilho fica fora do painel — dentro, sumiria junto e não haveria como reabrir');
  ok(/<div class="ret-menu">/.test(adm) && adm.indexOf('<div class="ret-menu">') < bt,
    'e os dois moram no mesmo invólucro, que é contra quem o painel se posiciona');

  /* --- o posicionamento --------------------------------------------------- */
  ok(/\.ret-menu\{position:relative\}/.test(css),
    'o invólucro é a âncora — contra o trilho, o painel escorregaria quando a lista de ' +
    'grupos mudasse de tamanho');
  ok(/\.ret-pop\{[^}]*position:absolute/.test(css) &&
     /\.ret-pop\{[^}]*bottom:calc\(100% \+ 6px\)/.test(css),
    'e ele SOBE: o gatilho fica no rodapé do trilho, e descendo nasceria fora da tela');
  var mob = css.slice(css.indexOf('@media'));
  /* NO CELULAR ELE NÃO DESCE: VIRA A FOLHA QUE SOBE, a mesma de Movimentos e das
     ações. Como gaveta suspensa de 250px ele espremia sete campos num espaço mais
     estreito que o dedo, pendurada num trilho que ali é uma faixa no topo — e o
     calendário nativo abria por cima dela. */
  ok(/\.ret-pop\{position:fixed;left:0;right:0;bottom:0;top:auto/.test(mob),
    'no celular o painel de filtros vira a folha que sobe, e não uma gaveta de 250px');
  ok(/\.ret-pop\{[^}]*max-height:92dvh!important\}/.test(mob),
    'e o `max-height` que a medição do computador escreve no elemento é anulado — ' +
    'senão a folha nasceria com a altura calculada para o outro arranjo');
  ok(/<div class="folha__puxador so-celular"[\s\S]{0,400}id="filtrosRet"/.test(adm) ||
     /id="filtrosRet"[\s\S]{0,400}<div class="folha__puxador so-celular"/.test(adm),
    'com o mesmo puxador e o mesmo cabeçalho das outras folhas');
  ok(/\[hidden\]\{display:none!important\}/.test(css), 'e fechado ele some de fato — pela regra geral `[hidden]`, que substituiu as três ' +
    'específicas que existiam');

  /* Subir e o padrao, mas o trilho tem a ALTURA DA TABELA: com poucas linhas ele encolhe,
     o gatilho sobe junto, e o painel nasceria acima do topo da tela — sem rolagem que o
     alcance. A direcao e entao decidida medindo, na hora de abrir. */
  /* A direcao tem um LADO PREFERIDO, que depende de onde o gatilho mora: no rodape do
     trilho o painel sobe, porque para baixo so ha a borda da tela; numa barra acima da
     tabela ele desce, senao taparia os filtros que a pessoa acabou de usar. Nao cabendo
     do lado preferido, cai no outro — e nao cabendo em nenhum, volta ao preferido, onde
     a rolagem da pagina alcanca.

     Exercitado rodando, com as duas preferencias e as duas medidas. */
  /* AS DUAS FUNÇÕES: `posicionarPop` agenda a segunda medida, `medirPop` mede. Recortar
     só a primeira deixaria a bancada exercitando o agendador sobre um `medirPop` que
     não existe — e o erro apareceria como "não é função", não como regra errada. */
  function recorte(nome) {
    var i = adm.indexOf('function ' + nome + '(');
    var k = adm.indexOf('{', i), n = 0;
    do {
      if (adm[k] === '{') n++; else if (adm[k] === '}') n--;
      k++;
    } while (n > 0 && k < adm.length);
    return adm.slice(i, k);
  }
  var fontePos = recorte('posicionarPop') + '\n' + recorte('medirPop');
  ok(/preferBaixo/.test(fontePos) && /function medirPop/.test(fontePos),
    'o recorte pegou as duas funções da direção');

  /* A BANCADA. O gatilho fica em `base`, e a área que rola vai de `teto` ao chão da
     janela. Para cima a caixa TERMINA no gatilho; para baixo ela COMEÇA nele — é a
     posição, e não a altura, que responde pelo espaço de cada lado. */
  function medir(preferBaixo, base, janela, teto, altura) {
    var cls = {}, estilo = {};
    var pop = {
      hidden: false, dataset: {}, style: estilo,
      scrollHeight: altura === undefined ? 300 : altura,
      closest: function () { return { getBoundingClientRect: function () {
        return { top: teto === undefined ? 0 : teto, bottom: janela }; } }; },
      classList: {
        toggle: function (c, v) { if (v) cls[c] = 1; else delete cls[c]; },
        add: function (c) { cls[c] = 1; },
        remove: function (c) { delete cls[c]; },
        contains: function (c) { return !!cls[c]; }
      },
      getBoundingClientRect: function () {
        /* HONRA O `top` EM LINHA, como um elemento de verdade. É por aqui que a segunda
           passada era contaminada pela primeira: com `top` e `bottom` os dois postos, o
           `top` ganha, e a medida de "quanto espaço há acima" passa a sair da posição
           que a passada anterior escolheu. Um pop falso que ignora o `top` nunca
           reproduz isso — e a afirmação sobre o zeramento passava sabotada. */
        if (estilo.top) {
          var t = 40 + parseFloat(estilo.top);
          return { top: t, bottom: t + 300 };
        }
        return cls['para-baixo'] ? { top: base, bottom: base + 300 }
                                 : { top: base - 300, bottom: base };
      },
      /* O ancestral POSICIONADO. O `top` que a função escreve é relativo a ele, e sem
         ele na bancada o cálculo seria exercitado só no caso em que a coluna começa no
         zero — que é justamente o caso que não revela um desconto errado. */
      offsetParent: { getBoundingClientRect: function () { return { top: 40 }; } }
    };
    var voltas = 0;
    new Function('pop', 'preferBaixo', 'window', 'requestAnimationFrame',
      fontePos + '\n posicionarPop(pop, preferBaixo);')(
      pop, preferBaixo, { innerHeight: janela },
      /* O AGENDADOR RODA DE VERDADE, uma vez. Com um `function(){}` mudo a bancada
         exercitava só a PRIMEIRA passada — e o defeito que apareceu na tela, o painel
         nascendo em -165px com o topo fora dela, é da SEGUNDA, que herdava a posição
         escrita pela primeira. Uma vez só, e não em laço: `posicionarPop` reagenda, e
         um agendador que executa sempre entraria em recursão infinita. */
      function (fn) { if (voltas++ === 0) fn(); });
    return { lado: cls['para-baixo'] ? 'desce' : 'sobe', teto: estilo.maxHeight || '',
             topo: estilo.top || '', chaoDe: estilo.bottom || '' };
  }

  ok(medir(false, 500, 900, 0).lado === 'sobe',
    'preferindo subir e cabendo acima, sobe');
  ok(medir(false, 250, 900, 0).lado === 'desce',
    'preferindo subir e NÃO cabendo acima, desce');
  ok(medir(true, 300, 900, 0).lado === 'desce',
    'preferindo descer e cabendo abaixo, desce — a barra fica acima da tabela');
  ok(medir(true, 700, 900, 0).lado === 'sobe',
    'preferindo descer e não cabendo abaixo, sobe');

  /* ---- SOLTA A ÂNCORA quando o gatilho é o problema ----------------------
   * O gatilho mora no PÉ de uma coluna alta, e a distância dele até a borda é sempre
   * curta — não é a janela que decide. Medido em quatro alturas, de 700 a 940px, o
   * painel recebeu SEMPRE os mesmos ~370px para um formulário de 629: um terço atrás
   * de uma rolagem interna, num painel de 240px de largura. Foi assim que ele passou
   * por "a rolagem não funciona".
   *
   * E a área inteira tem 769px: o formulário cabe nela com folga. */
  var solto = medir(false, 500, 900, 90, 629);
  /* 223 e não 263: o `top` é relativo ao ancestral POSICIONADO, que na bancada começa
     em 40. Sem descontá-lo, o painel desceria tantos pixels quanto a coluna estivesse
     abaixo do topo — e no computador ela está 90 e tantos. */
  ok(solto.topo === '223px' && solto.teto === '794px' && solto.chaoDe === 'auto',
    'não cabendo em nenhum dos lados do gatilho, o painel se solta dele e encosta no ' +
    'CHÃO da área — medido: 631px inteiros à vista, contra 368 com 263 escondidos',
    solto.topo + ' / ' + solto.teto + ' / ' + solto.chaoDe);
  /* O `bottom:auto` junto com o `top`: postos os dois, um elemento absoluto com altura
     ESTICA entre eles em vez de se posicionar. */
  ok(/pop\.style\.bottom = 'auto';/.test(fontePos),
    'e larga o `bottom` do CSS ao assumir o `top` — com os dois postos ele esticaria ' +
    'entre as duas bordas em vez de se posicionar');
  ok(medir(false, 500, 900, 90, 300).topo === '',
    'e cabendo ao lado do gatilho ele FICA lá: soltar sempre seria afastar o painel do ' +
    'botão que o abriu sem ter ganhado nada com isso');
  /* `area > espaco`, e não `precisa <= area`: numa janela baixa nada comporta o
     formulário inteiro, mas a área ainda dá mais que o lado ancorado. Medido a 780px:
     preso, 368px com 263 escondidos; solto, 578px com 53. */
  var apertado = medir(false, 500, 700, 90, 629);
  ok(apertado.teto === '594px',
    'e mesmo quando NEM a área comporta o formulário ele se solta, porque esconder 53px ' +
    'é melhor que esconder 263 — exigir que coubesse inteiro descartava o ganho ' +
    'justamente nas janelas baixas, onde ele mais importa', apertado.teto);

  /* ZERA A POSIÇÃO ANTES DE MEDIR, e não só o `max-height`. Esta função roda duas
     vezes; na segunda o `top` escrito pela primeira ainda estava lá, e com `top` e
     `bottom` os dois postos o `top` ganha: a medida de "quanto espaço há acima" saía
     da posição que a passada anterior escolheu. Medido, o painel nascia em -165px, com
     o topo fora da tela. Duas chamadas seguidas têm de dar o MESMO resultado. */
  /* Duas chamadas com bancadas NOVAS nunca se distinguem — cada uma nasce limpa, e a
     afirmação que as comparava não media nada. Quem mede é a bancada honrando o `top`:
     ela roda as duas passadas sobre o MESMO pop, e sem o zeramento a segunda mede a
     régua que a primeira escreveu. É o caso `solto` acima que reprova. */
  /* OS TRÊS JUNTOS, como bloco. Escritas soltas, as duas buscas eram satisfeitas pelo
     `pop.style.bottom = '';` do OUTRO ramo da função — apagar o do zeramento deixava a
     afirmação verde. Pego na sabotagem, e é a mesma família de sempre: uma ocorrência
     respondendo pela outra. */
  ok(/pop\.style\.maxHeight = '';\s*pop\.style\.top = '';\s*pop\.style\.bottom = '';/
    .test(fontePos),
    'e o zeramento da posição está escrito JUNTO com o do `max-height`, que existe pela ' +
    'mesma razão — os três zeram a sujeira da passada anterior antes de medir');

  /* A BARRA DE ROLAGEM PINTADA. Quando ele ainda precisa rolar por dentro, a barra
     clara do sistema encostada num painel escuro não lê como parte dele.

     ESTA AFIRMAÇÃO COBRAVA O ENDEREÇO DA REGRA, e não o que ela garante: exigia a
     declaração DENTRO do `.ret-pop{}`. A regra subiu para o `*` — o mesmo problema
     aparecia na tabela de Movimentos, e um remendo por painel conserta um painel de
     cada vez —, e ela reprovou sem nada ter piorado. Agora cobra a garantia: existe
     uma regra que pinta o polegar de QUALQUER coisa que role, com cor da paleta.

     O `[^}]*` continua ali de propósito: ele não atravessa o fim do bloco, então o
     que satisfaz a busca está mesmo dentro da regra do polegar, e não numa outra
     qualquer que por acaso cite o token. */
  var cssSem = semComentarios(css);
  ok(/\*::-webkit-scrollbar-thumb\{[^}]*background:var\(--linha-viva\)/.test(cssSem),
    'e quando ainda sobra conteúdo, a barra de rolagem é pintada com a cor da paleta — ' +
    'a do sistema é clara e não lê como parte de um painel escuro');

  /* O RESPIRO SÓ EXISTE COM AS DUAS. `background-clip:padding-box` sem a borda não
     afasta nada, e a borda sem o `background-clip` é pintada da cor do polegar — nos
     dois casos ele volta a encher os 10px. Medido: 10px pintados em vez de 6. */
  ok(/\*::-webkit-scrollbar-thumb\{[^}]*background-clip:padding-box[^}]*border:2px solid transparent/
     .test(cssSem),
    'e o polegar tem `background-clip:padding-box` E a borda transparente, que é o par ' +
    'que lhe dá o respiro — qualquer um dos dois sozinho não afasta nada');

  /* A ARMADILHA, e é por isto que ela vira afirmação: `scrollbar-color` e
     `scrollbar-width` são as propriedades "certas", de padrão, e a coisa mais natural
     do mundo é alguém acrescentá-las aqui achando que ajuda o Firefox. No Chrome elas
     DESLIGAM as regras `::-webkit-scrollbar` e devolvem a barra nativa recolorida —
     medido: volta a reservar 15px e ganha uma seta de 15px em cada ponta. Por isso
     elas só podem aparecer dentro do `@supports`, onde o Chrome não entra. */
  var forasDoSupports = cssSem
    .replace(/@supports not selector\(::-webkit-scrollbar\)\{[\s\S]*?\n\}/, '');
  ok(!/scrollbar-color/.test(forasDoSupports),
    'e `scrollbar-color` não é declarado fora do `@supports` — no Chrome ele desliga as ' +
    'regras `::-webkit-scrollbar` e traz de volta a barra nativa, com setas');

  /* O TETO DA ÁREA QUE ROLA. O painel é recortado pelo `.corpo-pagina`, que começa
     abaixo do cabeçalho: medindo contra a janela, ele concluía que cabia e o topo dele
     — o campo de busca — ficava escondido atrás dessa borda. */
  ok(medir(false, 500, 900, 400).lado === 'desce',
    'com o cabeçalho ocupando os primeiros 400px, o que caberia na janela já não cabe ' +
    'na área que rola — e ele desce');
  var semLado = medir(false, 500, 520, 90, 900);
  ok(semLado.teto === '414px' && semLado.topo === '58px',
    'não cabendo dos dois lados do gatilho, ele usa a ÁREA inteira — 414px, contra os ' +
    '402 que sobravam acima do gatilho — e encosta no teto dela', semLado);
  /* NUNCA ACIMA DO TETO DA ÁREA. Quando nem a área comporta o formulário, encostar no
     chão colocaria o topo acima dela — fora da tela, e sem rolagem que o alcance, que é
     o mesmo buraco de antes com outra roupa. O `Math.max` prende o topo no teto e deixa
     a rolagem interna resolver o resto. */
  var maiorQueTudo = medir(false, 500, 700, 90, 900);
  ok(maiorQueTudo.topo === '58px',
    'e um formulário maior que a área inteira encosta no TETO dela, não acima — sem ' +
    'isso ele nasceria 248px fora da tela', maiorQueTudo.topo);

  /* A FRESTA, agora ASSUMIDA. A regra antiga deixava de encolher abaixo de 180px, com
     o argumento de que uma fresta não serve para nada e a rolagem da página alcançaria
     o resto. Medido: não alcança — com a tabela vazia ou curta o `.corpo-pagina` não
     tem nada para rolar, e a tabela é curta justamente quando a coluna de grupos é o
     elemento mais alto da tela. Sem teto, o painel transbordava e o fim dele ficava
     fora de alcance. Uma fresta que ROLA chega ao fim do formulário; uma fresta que
     transborda, não. */
  var fresta = medir(false, 150, 250, 90, 900);
  ok(fresta.teto === '144px',
    'e numa janela em que nem a área dá 180px ele vira fresta mesmo assim — fresta que ' +
    'rola alcança o fim do formulário, e transbordar não alcançava nada', fresta);
  /* Uma funcao para os DOIS paineis. Dois lugares decidindo a mesma coisa acabam
     discordando, e o segundo nasceria fora da tela no dia em que o primeiro fosse
     corrigido. */
  /* Ela ficou com um chamador so quando o painel de colunas passou a morar dentro deste.
     Continua separada porque e a unica coisa que decide a direcao — medir em dois lugares
     era como o segundo painel nasceria fora da tela. */
  /* Voltou a um chamador so quando o painel de colunas virou aba. Continua separada
     porque e a unica coisa que decide a direcao: medir em dois lugares e como o segundo
     painel nasceria fora da tela no dia em que o primeiro fosse corrigido. */
  ok((adm.match(/function posicionarPop\(/g) || []).length === 1,
    'e a decisão de subir ou descer mora numa função só',
    (adm.match(/posicionarPop\(/g) || []).length);
  ok(/\.ret-pop\.para-baixo\{bottom:auto;top:calc\(100% \+ 6px\)\}/.test(css),
    'e existe a regra que o faz descer — sem ela a medição não mudaria nada');
  /* O painel encolheu de 417 para 268px. Duas coisas o inflavam, e as duas tem guarda:

     1. Os campos usavam a medida de FORMULARIO do projeto — 12px de recuo e fonte 16 —,
        feita para o dedo de quem lanca de luva no galpao. Metade da altura era espaco em
        volta.
     2. As duas datas ocupavam uma fileira cada, para um campo que nao usa metade da
        largura. */
  ok(/\.ret-pop select,\.ret-pop input\{[^}]*font-size:13px/.test(css),
    'os campos do painel têm medida de painel, e não de formulário de celular');
  ok(/\.ret-pop \.pop-duplo\{display:grid;grid-template-columns:1fr 1fr/.test(css) &&
     /<div class="pop-duplo">/.test(adm),
    'e as duas datas dividem uma fileira');

  /* Item de grade nasce com `min-width:auto` — o minimo INTRINSECO do conteudo. O campo
     de data tem um: ele nao encolhe abaixo de "dd/mm/aaaa" mais o icone. Sem soltar isso,
     o par empurrava a coluna para 274px dentro de um painel de 240, e como a coluna e uma
     so, TODOS os campos iam junto e vazavam pela borda. Medido antes e depois. */
  ok(/\.ret-pop>\*,\.ret-pop \.pop-duplo>\*\{min-width:0\}/.test(css),
    'e os itens de grade podem encolher: sem isso o campo de data alarga a coluna toda e ' +
    'os campos vazam pela borda do painel');

  ok(/\.ret-pop\{[^}]*max-height:calc\(100vh - 24px\)/.test(css) &&
     /\.ret-pop\{[^}]*overflow-y:auto/.test(css),
    'e ele tem rolagem própria: numa janela baixa não cabe em direção nenhuma, e sem ' +
    'isto os últimos campos ficariam fora de alcance');

  /* O CARTAO nao pode recortar. Posicao certa e visibilidade sao coisas diferentes: com
     `overflow:hidden` no `.ret-wrap` o painel nascia no lugar certo e era CORTADO na
     borda do cartao — medido, 283px fora e 1 de 5 campos visiveis. Aparecia com a tabela
     curta, que e quando o trilho encolhe e o painel desce.

     O `overflow` estava la para o fundo escuro do trilho respeitar o canto arredondado.
     O canto continua, so que vindo do proprio trilho — ele e a unica coisa que encosta
     na borda. */
  var wrap = css.slice(css.indexOf('.ret-wrap{'), css.indexOf('}', css.indexOf('.ret-wrap{')));
  ok(wrap.indexOf('overflow') < 0,
    'o cartão não recorta: com overflow escondido, o painel nasce no lugar e é cortado ' +
    'na borda dele', wrap);
  var rail = css.slice(css.indexOf('.ret-rail{'), css.indexOf('}', css.indexOf('.ret-rail{')));
  ok(/border-radius:var\(--raio\) 0 0 var\(--raio\)/.test(rail),
    'e o canto arredondado passa a vir do trilho, que é quem encosta na borda', rail);
  var mob = css.slice(css.indexOf('@media'));
  ok(/\.ret-rail\{padding:10px;border-radius:var\(--raio\) var\(--raio\) 0 0\}/.test(mob),
    'no celular o trilho é faixa no topo, então os cantos passam para cima');

  /* --- os botoes sutis ---------------------------------------------------- */
  /* FORA DO PAINEL DE FILTROS: dentro dele há o rodapé da folha do celular, que é um
     botão de folha e usa o `.btn` como todas as outras. O que esta afirmação cobra são
     os botões DO TRILHO. */
  var iPop = trilho.indexOf('<div class="ret-pop"');
  var iDepois = trilho.indexOf('<button class="ret-acao" id="btnLimparRetornos"');
  var soTrilho = (iPop < 0 || iDepois < 0) ? trilho
    : trilho.slice(0, iPop) + trilho.slice(iDepois);
  ok(soTrilho.indexOf('class="btn') < 0 &&
     (soTrilho.match(/class="ret-acao"/g) || []).length === 4,
    'os quatro botões usam o estilo do trilho, e não o .btn de formulário', soTrilho);
  ok(/\.ret-acao\{[^}]*background:none/.test(css) && /\.ret-acao\{[^}]*border:0/.test(css),
    'texto sem caixa: quatro retângulos cheios pesavam mais que a tabela');
  ok(/\.ret-acao:hover:not\(:disabled\)\{background:/.test(css),
    'o fundo só aparece sob o ponteiro, como nos grupos logo acima');
  ok(/\.ret-acao:disabled\{opacity/.test(css),
    'e desligado ele apaga — sem isso o Limpar parece clicável quando não há o que limpar');
  ok(/\.ret-acoes\{[^}]*margin-top:auto/.test(css),
    'o bloco cola no rodapé do trilho — a folga fica ENTRE os grupos e ele');
  ok(/\.ret-acao\{[^}]*width:100%/.test(css),
    'e ocupam a largura toda: numa coluna estreita, larguras diferentes viram uma escada');

  /* --- o comportamento, rodando ------------------------------------------- */
  /* Comeca na CONTAGEM, e nao no `var FILTROS_ABERTO`: ela vem antes no arquivo, e o
     ajuste depende dela. Recortando so a partir do estado, a bancada montava uma funcao
     que chamava algo que nao existia — e o teste morria em vez de testar. */
  var i = adm.indexOf('function quantosFiltrosFluxo()');
  var j = adm.indexOf('function abrirFiltros(sim)');
  var k = adm.indexOf('{', j), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var fonte = adm.slice(i, k);
  ok(i > 0 && /function ajustarBarraFiltros/.test(fonte) && /function abrirFiltros/.test(fonte),
    'o recorte pegou as peças — sem isto a bancada abaixo exercita outro código');

  function bancada(campos, grupoAtivo, aberto) {
    var els = {
      /* O painel de mentira precisa do que `abrirFiltros` toca nele: a lista de classes
         e a medida. `top: 400` diz "cabe acima", que e o caso comum; o outro caso e
         exercitado logo abaixo. */
      filtrosRet: { hidden: true, classes: {},
                    classList: { remove: function (c) { delete this._d[c]; },
                                 add: function (c) { this._d[c] = 1; },
                                 contains: function (c) { return !!this._d[c]; } },
                    getBoundingClientRect: function () { return { top: 400 }; } },
      btnVerFiltros: { className: '', textContent: '', title: '', attrs: {},
                       setAttribute: function (a, v) { this.attrs[a] = v; } },
      btnLimparRetornos: { disabled: false }
    };
    els.filtrosRet.classList._d = els.filtrosRet.classes;
    var doc = { getElementById: function (id) { return els[id] || null; } };
    /* `posicionarPop` mora fora do recorte: ela e compartilhada com o painel de colunas,
       e so mede onde o painel nasceu. Aqui ela vira um coto — a bancada nao tem layout, e
       a decisao de subir ou descer tem teste proprio logo abaixo. */
    /* `colunasOcultas` entra como coto: o gatilho passou a olhar as colunas escondidas
       para decidir a COR, e a lista delas nao e assunto deste bloco — tem teste proprio. */
    /* `emCartoesPainel` entra como coto devolvendo `false`: esta bancada exercita o
       painel do COMPUTADOR, onde ele é gaveta medida. No celular ele é folha, e quem
       responde por isso é o teste do corte de 1024 logo acima. */
    var api = new Function('document', 'FLUXO_FILTRO', 'FILTROS_FLUXO', 'valor',
      'colunasOcultas', 'TAB_ATIVOS', 'emCartoesPainel', 'FLUXO_TIPO',
      'function posicionarPop(p){ if (!p) return;' +
      ' p.classList.remove("para-baixo");' +
      ' if (p.getBoundingClientRect().top < 8) p.classList.add("para-baixo"); }' +
      fonte + '\n return { abrir: abrirFiltros, ajustar: ajustarBarraFiltros,' +
      '\n          quantos: quantosFiltrosFluxo };')(
      doc, grupoAtivo, ['rtOrigem', 'rtDestino', 'rtDe', 'rtAte', 'rtBusca'],
      function (id) { return campos[id] || ''; }, function () { return []; }, {},
      function () { return false; }, campos.__mov || 'todos');
    api.abrir(aberto);
    api.els = els;
    return api;
  }

  var VAZIO = {};
  var DOIS = { rtOrigem: 'Matriz Fazenda', rtDe: '2026-09-17' };

  var fechado = bancada(VAZIO, 'todas', false);
  ok(fechado.els.filtrosRet.hidden === true &&
     fechado.els.btnVerFiltros.attrs['aria-expanded'] === 'false',
    'fechado: o painel some, e o leitor de tela sabe disso');
  ok(fechado.els.btnVerFiltros.textContent === '▸ Filtros' &&
     fechado.els.btnVerFiltros.className === 'ret-acao',
    'sem filtro ligado ele é só um controle, sem contagem e sem cor',
    fechado.els.btnVerFiltros.textContent + ' | ' + fechado.els.btnVerFiltros.className);

  var aberto = bancada(VAZIO, 'todas', true);
  ok(aberto.els.filtrosRet.hidden === false &&
     aberto.els.btnVerFiltros.attrs['aria-expanded'] === 'true' &&
     aberto.els.btnVerFiltros.textContent.indexOf('▾') === 0,
    'aberto: o painel aparece e a seta vira para baixo',
    aberto.els.btnVerFiltros.textContent);

  /* O caso que importa: fechado COM filtro ligado. O painel esconde os filtros o tempo
     todo, entao sem este aviso a tabela ficaria recortada sem explicacao na tela. */
  var suja = bancada(DOIS, 'todas', false);
  ok(suja.quantos() === 2, 'dois campos preenchidos contam dois', suja.quantos());
  ok(suja.els.btnVerFiltros.textContent === '▸ Filtros (2)',
    'fechado com filtro ligado, o gatilho diz QUANTOS estão escondidos',
    suja.els.btnVerFiltros.textContent);
  ok(/alerta/.test(suja.els.btnVerFiltros.className),
    'e troca de cor: deixa de ser controle e vira aviso', suja.els.btnVerFiltros.className);
  ok(/recortada/.test(suja.els.btnVerFiltros.title),
    'o título diz o que isso significa para a tabela', suja.els.btnVerFiltros.title);

  /* Aberto, a contagem fica, mas o alerta sai: os filtros estao a vista. */
  var sujaAberta = bancada(DOIS, 'todas', true);
  ok(sujaAberta.els.btnVerFiltros.textContent.indexOf('(2)') > 0 &&
     !/alerta/.test(sujaAberta.els.btnVerFiltros.className),
    'aberto, a contagem fica mas o alerta sai — não há mais nada escondido',
    sujaAberta.els.btnVerFiltros.textContent + ' | ' + sujaAberta.els.btnVerFiltros.className);

  /* A direcao, rodando. `top` e o que a medida devolveria: 400 cabe acima, -50 nao. */
  function comTopo(topo) {
    var b = bancada(VAZIO, 'todas', false);
    b.els.filtrosRet.getBoundingClientRect = function () { return { top: topo }; };
    b.abrir(true);
    return b.els.filtrosRet.classList.contains('para-baixo');
  }
  ok(comTopo(400) === false, 'cabendo acima, o painel sobe — que e o padrao');
  ok(comTopo(-50) === true,
    'e nascendo acima do topo da tela, ele desce: la em cima nao ha rolagem que o alcance');

  /* O grupo da coluna da esquerda conta como filtro aqui tambem: ele esconde linhas. */
  var so_grupo = bancada(VAZIO, 'deficit', false);
  ok(so_grupo.quantos() === 1 && so_grupo.els.btnVerFiltros.textContent.indexOf('(1)') > 0,
    'e o grupo "Em déficit" da esquerda conta junto, porque também esconde linhas',
    so_grupo.els.btnVerFiltros.textContent);

  /* A mesma funcao cuida do Limpar: duas contagens sobre a mesma regra divergiriam.
     Ele passou de DESLIGADO a AUSENTE quando não há filtro: um botão permanentemente
     apagado é ruído, e quem tenta clicar conclui que a tela travou. Aparecendo só quando
     há o que limpar, ele vira também o aviso de que a tabela está recortada. */
  ok(fechado.els.btnLimparRetornos.hidden === true &&
     suja.els.btnLimparRetornos.hidden === false,
    'e a mesma função mostra o Limpar — uma contagem só para os dois botões');

  /* --- as tres saidas do painel ------------------------------------------- */
  /* Dentro do ouvinte DO GATILHO, e nao em qualquer lugar do arquivo: `stopPropagation`
     aparece noutros pontos do painel, e procurar no arquivo inteiro deixava o teste verde
     com a chamada apagada justamente daqui. */
  var og = adm.indexOf("getElementById('btnVerFiltros').addEventListener");
  var ouvinte = adm.slice(og, adm.indexOf('\n  });', og));
  ok(og > 0 && /e\.stopPropagation\(\)/.test(ouvinte),
    'o clique no gatilho não vaza para o documento — vazando, fecharia o que acabou de abrir',
    ouvinte);
  /* Um painel so agora — as colunas moram dentro dele. Os ouvintes voltaram a cuidar de
     um, e e isso que se confere: sobrando o segundo, ele ficaria procurando um elemento
     que nao existe mais a cada clique da pagina. */
  ok(/if \(pf && !pf\.contains\(e\.target\)\) abrirFiltros\(false\)/.test(adm),
    'clicar fora fecha: quem clica na tabela atrás espera que o painel saia da frente');
  ok(adm.indexOf('colunasRet') < 0,
    'e não sobrou ouvinte do painel que foi embora');
  var esc = adm.slice(adm.indexOf("if (e.key === 'Escape' && FILTROS_ABERTO)"));
  esc = esc.slice(0, esc.indexOf('\n  });'));
  ok(/abrirFiltros\(false\)/.test(esc),
    'e o Esc também — painel que só fecha no mesmo botão obriga a mirar de volta', esc);

  /* O painel nasce fechado a cada visita. Guardar "aberto" trataria um estado passageiro
     como preferencia, e reabrir sozinho taparia a tabela de quem so queria consultar. */
  ok(/var FILTROS_ABERTO = false;/.test(adm) && adm.indexOf('qdc_filtros_ativos') < 0,
    'e ele nasce fechado a cada visita, sem guardar o estado');
})();

/* ---------------------------------------------------------------------------
 * A fileira de cartoes: quatro respondem ao filtro, um nao — e ele diz isso.
 *
 * "Em circulacao" morava sozinho no rodape do trilho da esquerda. Subiu para a fileira,
 * junto dos outros: numero que se le com os demais nao deve morar noutro canto da tela.
 *
 * Mas ele e de outra natureza. Sai do razao — quanto cada um tem nosso AGORA —, e nao do
 * fluxo do periodo. Filtrar por uma origem nao o estreita, e sem aviso ele pareceria
 * quebrado. Por isso o rodape dele diz "fora do filtro", e este teste cobra esse aviso.
 * ------------------------------------------------------------------------- */
console.log('\n== a fileira de cartoes do Controle de Caixas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* O cartao "Em circulação" morava sozinho no rodape do trilho da esquerda. Subiu para a
     fileira e depois saiu dela, mas o codigo que o preenchia nao pode ficar para tras: um
     `getElementById` orfao estoura em `.innerHTML` de null e derruba o desenho inteiro. */
  ok(adm.indexOf('retResumo') < 0 && adm.indexOf('ret-resumo') < 0,
    'nao sobrou nada do cartao no trilho: elemento orfao derruba o desenho todo');
  ok(css.indexOf('.ret-resumo') < 0, 'e nem o estilo dele ficou para tras');

  /* O recorte da fileira fecha no ponto-e-virgula que encerra a atribuicao, achado a
     partir do INICIO dela. Ja foi ancorado no texto do ultimo cartao: o cartao saiu, o
     indexOf voltou -1, o recorte ficou vazio — e um recorte vazio nao casa com nada, o
     que passaria como "nenhum problema". A conferencia abaixo e a guarda. */
  var i = adm.indexOf("document.getElementById('fluxoTiles').innerHTML");
  var fileira = adm.slice(i, adm.indexOf(";\n", i));
  ok(i > 0 && fileira.length > 200 && fileira.indexOf('tileCor(') > 0,
    'o recorte pegou a fileira inteira — vazio, todo teste abaixo passaria sem testar',
    fileira.length);

  var quantos = fileira.split('tileCor(').length - 1;
  ok(quantos === 5, 'a fileira tem cinco cartões', quantos);

  /* A ORDEM e pedida, entao e conferida. Um cartao novo enfiado no meio nao quebra nada
     no codigo — so a leitura de quem abre a tela todo dia no mesmo lugar. */
  var rotulos = (fileira.match(/'([A-ZÀ-Ý][^']*)'/g) || [])
    .map(function (t) { return t.slice(1, -1); })
    .filter(function (t) { return t.indexOf('<') < 0; });
  ok(rotulos.join(' | ') ===
     'Total no Estoque | Total de Saída | Total de Retorno | ' +
     'Caixas que Saíram e Não Voltaram | Taxa de Retorno do Mês',
    'os cartões saem na ordem pedida: o estoque abre, a taxa fecha', rotulos);

  /* Sairam a pedido: "Em Circulação" dizia o inverso do estoque, e "Origens Abaixo da
     Meta" repetia em contagem o que a taxa de retorno ja diz em porcentagem. */
  ok(fileira.indexOf('Circulação') < 0 && fileira.indexOf('Abaixo da Meta') < 0,
    'e os dois que foram removidos não voltaram', rotulos);
  ok(adm.indexOf('var circulacao =') < 0 && adm.indexOf("FLUXO_FILTRO === 'MOTORISTA' ? 'Motoristas'") < 0,
    'nem o cálculo que só eles usavam — código sem dono é o que ninguém ousa apagar depois');

  ok(rotulos.every(function (r) { return /^[A-ZÀ-Ý]/.test(r); }),
    'todo rótulo começa em maiúscula, com os conectores em minúscula', rotulos);

  /* --- uma cor por indicador ----------------------------------------------
     Pintados por SEVERIDADE, quatro dos cinco ficavam verdes e a faixa virava uma
     mancha. Agora cada um tem cor própria, e ela é identidade: o mesmo tom no risco da
     esquerda, no número e no desenho. */
  var iCor = adm.indexOf('var COR_TILE = {');
  var mapaCor = adm.slice(iCor, adm.indexOf('};', iCor));
  ok(iCor > 0, 'as cinco cores moram num mapa só, e não espalhadas pela montagem');
  ['estoque', 'saida', 'retorno', 'fora', 'taxa'].forEach(function (k) {
    ok(new RegExp(k + ":\\s*'var\\(--[a-z-]+\\)'").test(mapaCor),
      'a cor de ' + k + ' sai de um TOKEN — escrita solta, escaparia da medição de ' +
      'contraste e chegaria ao galpão sem passar por ela', mapaCor);
  });
  var usadas = (mapaCor.match(/var\(--[a-z-]+\)/g) || []);
  ok(usadas.length === 5 && new Set(usadas).size === 5,
    'e as cinco são DIFERENTES entre si — repetida, a cor deixa de identificar o cartão',
    usadas);
  ['COR_TILE.estoque', 'COR_TILE.saida', 'COR_TILE.retorno', 'COR_TILE.fora',
   'COR_TILE.taxa'].forEach(function (c) {
    ok(fileira.indexOf(c) > 0, 'o cartão usa ' + c, fileira.slice(0, 80));
  });

  /* --- os desenhos dizem o que o número diz ------------------------------- */
  ok(/desenho--zero/.test(fileira),
    'o estoque mostra caixa cruzando a linha do zero: é o SINAL, e não a quantidade — ' +
    'não há referência para dizer se −80 é pouco, e barra proporcional a nada seria mentira');
  ok(/desenho desenho--pista">'\+Q\.caminhao\(4\)/.test(fileira),
    'a saída é um caminhão cheio indo');
  ok(/desenho--volta[\s\S]{0,120}Q\.caminhao\(t\.saida \? Math\.max\(0, Math\.min\(4, Math\.round\(t\.retorno \/ t\.saida \* 4\)\)\) : 0\)/
    .test(fileira),
    'e o retorno volta com a carga PROPORCIONAL ao que voltou — cheio sempre, ele ' +
    'desmentiria o número ao lado');
  ok(/desenho--fora/.test(fileira),
    'o que não voltou são caixas paradas no destino, e uma que tenta voltar e some');
  ok(fileira.indexOf('desenho') > 0 &&
     fileira.slice(fileira.indexOf('Taxa de Retorno')).indexOf('desenho') < 0,
    'a taxa NÃO tem desenho — ela já tem a barra de meta, que é uma leitura melhor do ' +
    'que qualquer movimento');

  /* --- a barra de meta ----------------------------------------------------- */
  ok(/class="meta"><i style="width:'\+Math\.min\(100, t\.taxaRetorno\)\+'%"/.test(fileira),
    'a barra enche até a taxa, presa em 100% — acima disso ela vazaria do trilho');
  ok(/class="alvo" style="left:'\+Math\.min\(100, metaFluxo\(\)\)\+'%"/.test(fileira),
    'e o risco marca a meta, da MESMA função que escreve "meta 90%" no rodapé');
  ok(/t\.taxaRetorno===null \? '' :\s*\n\s*'<div class="meta">/.test(fileira),
    'sem taxa não há barra — uma barra vazia diria "zero por cento", e zero por cento é ' +
    'outra coisa que "ainda não saiu nada"');

  /* --- no celular, a tabela vira EXTRATO -----------------------------------
     Nove colunas não se leem num telefone: o saldo final, que é o número que interessa,
     fica sempre fora da tela. O extrato põe a conta na vertical. */
  ok(/function emCartoesPainel\(\)/.test(adm) &&
     /emCartoesPainel[\s\S]{0,140}max-width:1023px/.test(adm),
    'o painel troca de forma em 1024px — o MESMO corte da lista de Lançamentos, e não ' +
    'uma medida própria');
  ok(/var desenhoDaTabela = !emCartoesPainel\(\)/.test(adm),
    'a troca é uma variável, e não um `return` antes da hora');
  /* O `return` ANTES DA HORA foi o defeito de verdade: os cinco indicadores são montados
     mais abaixo na mesma função, e sair antes deixava a faixa vazia no celular. */
  var iDF = adm.indexOf('function desenharFluxo()');
  var corpoDF = adm.slice(iDF, adm.indexOf("\n  /* Três frases diferentes", iDF));
  ok(corpoDF.length > 2000, 'o recorte de desenharFluxo pegou o corpo', corpoDF.length);
  ok(corpoDF.indexOf('emCartoesPainel()') < corpoDF.indexOf("getElementById('fluxoTiles')"),
    'e a decisão vem ANTES dos indicadores, que continuam sendo montados nos dois ' +
    'casos — saindo antes, a faixa nascia vazia no celular');
  ok(!/if \(emCartoesPainel\(\)\) \{[\s\S]{0,200}return;/.test(corpoDF),
    'não há saída antecipada no meio do desenho');

  var iCF = adm.indexOf('function cartaoFluxo(l, gente)');
  var cartao = adm.slice(iCF, adm.indexOf('\n  function fluxoEmCartoes', iCF));
  ok(cartao.length > 800, 'o recorte do cartão do extrato pegou o corpo', cartao.length);
  /* A ORDEM É A DA CONTA: começa no saldo inicial, tira a saída, soma o retorno, fecha
     no final. Fora de ordem, o extrato deixa de explicar de onde veio o número do fim. */
  var ordemExt = ['Saldo inicial', 'Saída', 'Retorno', 'Saldo final']
    .map(function (r) { return cartao.indexOf('>' + r + '<'); });
  ok(ordemExt.every(function (p) { return p > 0; }) &&
     ordemExt[0] < ordemExt[1] && ordemExt[1] < ordemExt[2] && ordemExt[2] < ordemExt[3],
    'o extrato lê na ordem da conta: saldo inicial, saída, retorno, saldo final', ordemExt);
  ok(/<details class="tipos"><summary>Ver por tipo de caixa<\/summary>/.test(cartao),
    'e o detalhe por tipo de caixa fica atrás de um toque — aberto sempre, cada dia ' +
    'ocuparia uma tela inteira');
  /* A CONDIÇÃO É TER TIPO, e não "houve movimento". Quando a abertura deixou de ser um
     dia parado, com `!parado` ela passou a oferecer um "ver por tipo de caixa" que abria
     em nada — um convite para uma gaveta vazia. Pego na foto. */
  ok(/var temDetalhe = \(l\.saidaTipos && l\.saidaTipos\.length\) \|\|\s*\n?\s*\(l\.retornoTipos && l\.retornoTipos\.length\);/
    .test(cartao) && /\(!temDetalhe \? '' :/.test(cartao),
    'o detalhe só é oferecido quando há tipo de caixa atrás dele — não quando "houve ' +
    'movimento"');
  ok(/gente \? '' :[\s\S]{0,120}Saldo inicial/.test(cartao),
    'a visão de gente não tem saldo inicial — ali a linha é uma pessoa, e não um dia');

  /* --- a linha de ABERTURA é um terceiro estado ---------------------------
     Ela tem saída e retorno zerados e caía em "Sem movimento". Mas não é um dia parado:
     é o lançamento que abre a conta, e dizer que nada aconteceu nele é o contrário do
     que aconteceu. */
  ok(/var abertura = l\.estoqueInicial === true;/.test(cartao),
    'a linha de estoque lançado é reconhecida pelo que o servidor manda');
  ok(/var parado = !abertura && !l\.saida && !l\.retorno;/.test(cartao),
    'e não cai mais em "sem movimento" — são três estados, não dois');
  ok(/abertura \? 'azul">Saldo lançado'/.test(cartao) &&
     /parado \? 'cinza">Sem movimento'/.test(cartao) &&
     /'verde">Movimento'/.test(cartao),
    'os três se anunciam com palavras e cores diferentes: saldo lançado, sem movimento, ' +
    'movimento');
  ok(/Saldo lançado<\/span><b>\+'\+\s*\n?\s*Q\.num\(l\.inicial\|\|0\)/.test(cartao),
    'e a linha de abertura mostra O QUE FOI LANÇADO — o extrato escondia justamente o ' +
    'único número daquele dia');

  /* A CONTA FECHA NA TELA. Rodado de verdade: `iniCorrido` já vem com o lançamento
     somado, e escrito cru a linha dizia 1.620 mais 810 dando 1.620. */
  (function () {
    /* `saldoFinalDaLinha` entra no recorte porque o cartão a CHAMA. Posta como coto
       aqui, a bancada mediria a minha cópia da fórmula e não a que vai para a tela — e
       era justamente uma fórmula copiada que fazia o chip de déficit discordar da
       coluna. */
    var fonte = ['function lugares(', 'function saldoFinalDaLinha(', 'function cartaoFluxo(']
      .map(function (a) {
        var i = adm.indexOf('  ' + a);
        return adm.slice(i, adm.indexOf('\n  }', i) + 4);
      }).join('\n');
    var desenhar = new Function('Q', fonte + '\n return cartaoFluxo;')({
      num: function (n) { return String(Number(n) || 0); },
      esc: function (s) { return String(s == null ? '' : s); },
      dataBR: function (d) { return String(d || ''); }
    });
    /* A linha real do dia 17: tinha 810 em caixa, lançou 810, ficou com 1.620. */
    var html = desenhar({ estoqueInicial: true, iniCorrido: 1620, inicial: 810,
                          saida: 0, retorno: 0, fimCorrido: 1620, origens: ['Matriz'],
                          destinos: [], sub: '5 lançamentos', data: '2026-09-17',
                          saidaTipos: [], retornoTipos: [] }, false);
    var nums = (html.match(/<b[^>]*>([+\-−]?\d+)<\/b>/g) || [])
      .map(function (t) { return Number(String(t).replace(/[^\d]/g, '')); });
    ok(nums.length === 3 && nums[0] === 810 && nums[1] === 810 && nums[2] === 1620,
      'a abertura fecha na tela: 810 em caixa, mais 810 lançados, dá 1.620 — com o ' +
      '`iniCorrido` cru seriam 1.620 mais 810 dando 1.620', nums);
    ok(html.indexOf('Saldo lançado') > 0 && html.indexOf('>Saída<') < 0 &&
       html.indexOf('>Retorno<') < 0,
      'e ela não gasta duas linhas dizendo que nada saiu nem voltou');
    ok(html.indexOf('Ver por tipo de caixa') < 0,
      'nem oferece um detalhe que abriria em nada — ela não tem tipo de caixa atrás');

    /* A linha de MOVIMENTO continua como era: os quatro degraus da conta. */
    var mov = desenhar({ iniCorrido: 1250, inicial: 0, saida: 1690, retorno: 1250,
                         fimCorrido: 810, origens: ['Matriz'], destinos: ['João Pessoa'],
                         sub: '15 lançamentos', data: '2026-09-16',
                         saidaTipos: [{ caixa: 'CX P', qtd: 250 }], retornoTipos: [] }, false);
    var numsMov = (mov.match(/<b[^>]*>([+\-−]?\d+)<\/b>/g) || [])
      .map(function (t) { return Number(String(t).replace(/[^\d]/g, '')); });
    ok(numsMov.length === 4 && numsMov[0] === 1250 && numsMov[1] === 1690 &&
       numsMov[2] === 1250 && numsMov[3] === 810,
      'e o dia de movimento fecha também: 1.250 menos 1.690 mais 1.250 dá 810', numsMov);
    ok(mov.indexOf('Saldo lançado') < 0,
      'sem inventar um "saldo lançado" onde não houve lançamento de estoque');
  })();

  /* --- o rótulo em branco, e a cor num risco ------------------------------
     Antes a cor tingia o RÓTULO: "Saída" em cinza de apoio ao lado de um número verde.
     Quem carrega a identidade passou a ser um risco de 4px, e o texto ficou com a
     legibilidade máxima — 9,91:1 contra os 5,26 do cinza. */
  ok(/\.ext__l span\{[^}]*color:var\(--txt\)/.test(css),
    'o rótulo do extrato é branco cheio, e não o cinza de apoio');
  ok(/\.ext__l span::before\{[^}]*background:var\(--marca/.test(css),
    'e a cor virou um risco antes dele — a identidade fica, sem custar leitura');
  [['inicial', '--txt'], ['saida', '--verde'], ['retorno', '--marca-txt']]
    .forEach(function (p) {
      ok(new RegExp('\\.ext__l\\.ext--' + p[0] + '\\{--marca:var\\(' + p[1] + '\\)\\}').test(css),
        'o risco de ' + p[0] + ' sai do token ' + p[1] + ' — o MESMO dos indicadores ' +
        'logo acima, e não uma segunda paleta para a mesma ideia', p[0]);
      ok(new RegExp('\\.ext__l\\.ext--' + p[0] + ' b\\{color:var\\(' + p[1] + '\\)\\}').test(css),
        'e o número dessa linha também', p[0]);
    });
  /* CADA UMA das linhas declara qual é. Procurar `ext--inicial` no cartão inteiro não
     serve desde que a abertura ganhou a linha "Saldo lançado", que usa a MESMA classe:
     arrancada de uma, a outra respondia por ela e a afirmação passava. */
  ok((cartao.match(/class="ext__l ext--inicial"/g) || []).length === 2,
    'as DUAS linhas de saldo declaram a classe — uma respondendo pela outra deixaria ' +
    'o risco nascer cinza sem ninguém ver',
    (cartao.match(/class="ext__l ext--inicial"/g) || []).length);
  ok(/ext--inicial"><span>Saldo inicial<\/span>/.test(cartao) &&
     /ext--inicial"><span>Saldo lançado<\/span>/.test(cartao),
    'e são justamente o saldo inicial e o saldo lançado');
  ok(/class="ext__l ext--saida"/.test(cartao) &&
     /class="ext__l ext--retorno"/.test(cartao),
    'a saída e o retorno também — sem a classe, o risco nasce cinza e a identidade some');

  /* O TEXTO PEQUENO SUBIU DE CINZA. Ele passava em AA no cinza de apoio (5,26:1), então
     isto não é conserto de reprovação: onze pixels de cinza médio, num cartão cujo
     número tem vinte, é a linha que a pessoa pula. */
  ok(/\.ftile \.d\{[^}]*color:var\(--txt2\)/.test(css),
    'o rodapé do indicador está no claro, e não no cinza de apoio');
  ok(/\.ftile \.r\{[^}]*font-weight:500[^}]*color:var\(--txt2\)/.test(css),
    'e o rótulo também, com peso 500 para sustentar a letra pequena');
  ok(/\.tipos__l dt\{[^}]*color:var\(--txt2\)\}/.test(css),
    'o nome da caixa no quadradinho também — em cinza ele some antes do número que explica');

  /* --- a ordem da data, no celular ----------------------------------------
     No computador quem ordena é o clique no cabeçalho da coluna. Sem cabeçalho, o
     extrato não tinha como ser invertido — e "o que aconteceu por último" é justamente a
     pergunta de quem abre o painel no telefone. */
  var iBO = adm.indexOf('function barraOrdem(lista)');
  var barra = adm.slice(iBO, adm.indexOf('\n  function fluxoEmCartoes', iBO));
  ok(iBO > 0 && barra.length > 400, 'o cabeçalho do extrato tem um corpo', barra.length);
  ok(/barraOrdem\(lista\)\+'<div class="extrato">/.test(adm),
    'e ele abre a lista de cartões');
  /* O TÍTULO NÃO SE REPETE. O modelo trazia "Controle de Caixas" nesta barra porque era
     uma página solta; no app ele já está no alto do cartão, com o botão de voltar ao
     lado. Repetido, aparecia duas vezes na mesma tela a dois dedos de distância. */
  /* `<h2>` e não o texto: o comentário logo acima da função EXPLICA por que o título
     saiu, e citá-lo fazia a afirmação encontrar a própria explicação. */
  ok(barra.indexOf('<h2>') < 0,
    'e não repete o título que o cartão já tem duas linhas acima');

  /* O BOTÃO DIZ O ESTADO, E NÃO A AÇÃO. "Mais antigas" quer dizer que a lista ESTÁ
     assim. Anunciando o que vai virar, a pessoa fica sem saber como ela está agora — e
     só descobre invertendo, que é o contrário de um rótulo. */
  ok(/desc \? 'Mais recentes' : 'Mais antigas'/.test(barra),
    'o botão diz o ESTADO da lista, e não o que o toque vai fazer');
  ok(/aria-label="Ordem por data: '\+\s*\n?\s*\(desc \? 'mais recentes' : 'mais antigas'\)/.test(barra),
    'e quem ouve a tela recebe a mesma informação, mais o que o toque faz');
  ok(/data-ordem="'\+\s*\n?\s*\(desc \? 'desc' : 'asc'\)/.test(barra),
    'o estado também vai para o atributo, que é o que vira a seta no CSS');
  ok(/\.ordenar\[data-ordem="asc"\] svg\{transform:rotate\(180deg\)\}/.test(css),
    'e a seta aponta para o lado em que a lista está');

  /* UM ESTADO SÓ para as duas telas. Dois controles de ordem sobre a mesma lista
     discordariam no instante em que alguém girasse o aparelho. */
  var iLO = adm.indexOf('function ligarOrdemExtrato()');
  var ligar = adm.slice(iLO, adm.indexOf('\n  }', iLO));
  ok(/ORDEM_FLUXO = \{ col: 'data', desc: ordemDoExtrato\(\) !== 'desc' \};/.test(ligar),
    'o botão escreve no MESMO `ORDEM_FLUXO` do clique no cabeçalho');
  ok(ligar.indexOf('classificarPor') < 0,
    'e não passa por `classificarPor`: lá o terceiro clique volta ao padrão, e um botão ' +
    'de duas palavras com três estados deixa a pessoa sem saber onde está');
  ok(/function ordemDoExtrato\(\)[\s\S]{0,220}ORDEM_FLUXO\.col === 'data' && ORDEM_FLUXO\.desc/
    .test(adm),
    'e quem responde "em que ordem está" lê esse mesmo estado, e não uma cópia');

  /* O DESEMPATE INVERTE JUNTO. A ordenação do JavaScript é estável: em `-r`, as linhas
     de chave igual ficam como estavam. Num mesmo dia isso deixava o bloco do dia na
     ordem antiga enquanto os dias viravam — a lista vira pela metade, e quem olha
     conclui que ela não ordenou direito. */
  /* A chave é lida uma vez em `x` e `y` no topo do comparador — antes ela era chamada
     duas vezes dentro da mesma linha, e agora a pergunta do vazio precisa do valor. */
  ok(/var r = compararValores\(x, y\) \|\| \(posicao\.get\(a\) - posicao\.get\(b\)\);/
    .test(adm),
    'o desempate entra como segundo critério, dentro da mesma comparação — e por isso ' +
    'inverte junto com o primeiro');
  ok(/return estado\.desc \? -r : r;/.test(adm),
    'e a inversão é do resultado inteiro, empate incluído');

  /* ---- O VAZIO FICA DE FORA DA INVERSÃO -----------------------------------
   * Este é o conserto de um defeito que viveu desde o começo no Painel de Ativos, e
   * que a suíte não via porque estava olhando para o lugar errado.
   *
   * A regra escrita era "linha sem dado não é a menor nem a maior, e no meio ela
   * atrapalha a leitura das que têm" — vazio para o FIM, nos dois sentidos. E havia uma
   * afirmação guardando exatamente isso… no COMPARADOR sozinho, onde a regra sempre
   * esteve certa. O que ninguém media era o resultado ORDENADO: a inversão do
   * decrescente negava o resultado inteiro, o do vazio junto, e no segundo clique as
   * linhas sem dado subiam todas para o topo — empurrando para baixo justamente as que
   * a pessoa clicou para ver.
   *
   * Medido nos 40 movimentos no ar, coluna Origem: no decrescente as linhas de ajuste,
   * que não têm origem, vinham primeiro.
   *
   * Por isso esta afirmação EXECUTA a ordenação, em vez de olhar o texto dela. Era a
   * diferença entre as duas que deixava o defeito passar. */
  var fa = adm.indexOf('function aplicarOrdem(lista, DEFS, estado)');
  var ka = adm.indexOf('{', fa), aa = 0;
  do {
    if (adm[ka] === '{') aa++; else if (adm[ka] === '}') aa--;
    ka++;
  } while (aa > 0 && ka < adm.length);
  var fc = adm.indexOf('function semValor(v)');
  var kc = adm.indexOf('\n  }', adm.indexOf('function compararValores(x, y)')) + 4;
  var aplicarOrdem = new Function(
    adm.slice(fc, kc) + adm.slice(fa, ka) + '\n return aplicarOrdem;')();

  var CAIXA = [{ n: 'b' }, { n: '' }, { n: 'a' }, { n: null }, { n: 'c' }];
  var DEFS_T = { n: { k: function (x) { return x.n; } } };
  var nomes = function (l) {
    return l.map(function (x) { return x.n === null ? '(nulo)' : (x.n || '(vazio)'); }).join(' ');
  };
  var asc  = nomes(aplicarOrdem(CAIXA, DEFS_T, { col: 'n', desc: false }));
  var desc = nomes(aplicarOrdem(CAIXA, DEFS_T, { col: 'n', desc: true  }));
  ok(asc === 'a b c (vazio) (nulo)',
    'ordenado, o vazio vai para o fim no crescente', asc);
  ok(desc === 'c b a (vazio) (nulo)',
    'e TAMBÉM no decrescente — era aqui que a regra se perdia: a inversão levava o ' +
    'vazio junto, e no segundo clique as linhas sem dado subiam todas para o topo',
    desc);
  ok(/var vx = semValor\(x\), vy = semValor\(y\);\s*\n\s*if \(vx \|\| vy\) \{/.test(adm),
    'e os dois lugares perguntam pelo MESMO `semValor` — duas definições de "vazio" ' +
    'divergiriam no dia em que zero ou `false` entrassem numa coluna');

  /* A COLISÃO DE CLASSE que a foto pegou: `.dia` já era o separador de dia dos cartões
     de Lançamentos, e é `display:flex`. O cartão do extrato herdava o flex e saía
     deitado, com a rota ao lado do saldo. */
  ok(/class="ext-dia"/.test(cartao) && !/class="dia"/.test(cartao),
    'o cartão do extrato tem classe própria, e não a do separador de dia dos ' +
    'Lançamentos — com o mesmo nome ele herdava o `display:flex` e saía deitado');
  /* `.dia` virou faixa grudada e ganhou `position:sticky` antes do `display:flex` — o
     que esta afirmação cobra não é a ordem das linhas, é que as DUAS classes existam
     como donas de coisas diferentes. */
  ok(/\n\.dia\{position:sticky[\s\S]{0,120}display:flex/.test(css) &&
     /\n\.ext-dia\{background/.test(css),
    'as duas continuam existindo, e são coisas diferentes');

  /* --- o arranjo do celular ------------------------------------------------ */
  ok(/@media \(max-width:1023px\)\{[\s\S]{0,900}\.ftiles\{grid-template-columns:1fr 1fr/
    .test(css),
    'no celular são DOIS indicadores por linha — `auto-fit` dava um só no aparelho ' +
    'estreito, e um por linha empurra a tabela para fora da primeira dobra');
  ok(/\.ftile:last-child\{grid-column:1\/-1\}/.test(css),
    'e a taxa ocupa a linha toda: é a única com barra, e espremida em meia largura a ' +
    'barra fica curta demais para se ler contra a marca da meta');
  ok(/\.ret-nav\{scrollbar-width:none;[\s\S]{0,200}mask-image:linear-gradient/.test(css),
    'o trilho de chips esmaece na borda em vez de mostrar barra de rolagem — a barra é ' +
    'um risco branco que não se arrasta com o dedo');

  /* O PAINEL INTEIRO ao girar, e não só o extrato: rotas, clientes e estoque trocam de
     forma na MESMA largura, e redesenhar um só deixava a tela metade cartão, metade
     tabela — com a tabela ainda arrastando de lado ao lado dos cartões. */
  ok(/matchMedia\('\(max-width:1023px\)'\)\.addEventListener\('change'[\s\S]{0,260}desenharPainel\(\)/
    .test(adm),
    'girar o aparelho troca tabela por cartão — desenhado só na abertura, o painel ' +
    'ficaria com a forma da largura de quando abriu');
  ok(/function desenharPainel\(\)\{[\s\S]{0,300}desenharFluxo\(\)/.test(adm),
    'e o extrato está nessa mesma sequência');

  /* --- a animação para quando sai da tela ---------------------------------- */
  ok(/vigiarTiles\(\);/.test(adm) && /IntersectionObserver/.test(adm),
    'a faixa para de animar fora da tela — animação escondida gasta bateria do celular ' +
    'do galpão sem ninguém ver');
  ok(/if \(OLHO_TILES\) return;/.test(adm),
    'e o observador é ligado UMA vez: um por redesenho empilharia dezenas no mesmo elemento');
  /* A PAUSA É POR CLASSE PRESENTE, NUNCA AUSENTE. Escrita como `:not(.rodando)`, ela
     vale enquanto o JS não tiver rodado — e um desenho que só aparece se o script
     chegar até o fim some da tela sem erro nenhum no console. Foi assim que a estrada
     da linha do título foi ao ar congelada: ninguém punha `.rodando` no cabeçalho.
     Agora o padrão é ANDAR, e a classe LIGA a pausa. */
  /* SEM OS COMENTÁRIOS: a busca pela AUSÊNCIA de `:not(.rodando)` casava com o
     comentário logo acima da regra, que cita o jeito antigo para explicar por que ele
     saiu. É a mesma família de sempre — a afirmação lendo o que eu escrevi sobre o
     código em vez do código. */
  ok(/\.ftiles\.parado \.desenho \*\{animation-play-state:paused\}/.test(css) &&
     !/:not\(\.rodando\)/.test(semComentarios(css)),
    'quem pausa é o CSS, por uma classe que LIGA a pausa — parado por padrão, o ' +
    'desenho some no dia em que o JS não rodar');
  ok(/faixa\.classList\.toggle\('parado', !e\[0\]\.isIntersecting\);/.test(adm) &&
     /\{ faixa\.classList\.remove\('parado'\); return; \}/.test(adm),
    'e sem observador ele ANDA: a pausa é uma economia, não um requisito');
  ok(/@media \(prefers-reduced-motion:reduce\)[\s\S]{0,600}\.desenho \*,\.desenho::after\{animation:none!important\}/
    .test(css),
    'e quem pediu menos movimento recebe o desenho parado, não o desenho apagado — ' +
    'apagá-lo tiraria a informação junto');

  /* --- o que segue o filtro, e o que nao segue ---------------------------- */
  var j = adm.indexOf('var t = totaisDe(lista);');
  ok(j > 0 && j < i, 'os totais saem da lista já filtrada, e não do período inteiro');
  ok(/tileCor\(Q\.num\(t\.saida\), 'Total de Saída'/.test(fileira),
    'a saída lê esses totais, por isso acompanha o filtro', fileira);
  ok(/tileCor\(Q\.num\(t\.retorno\), 'Total de Retorno'/.test(fileira),
    'e o retorno também', fileira);
  ok(/Q\.num\(t\.saida \+ t\.retorno\)/.test(fileira),
    'a soma dos dois é o rodapé do cartão de retorno');

  /* O estoque e o unico que NAO segue o filtro: sai do razao, e nao do fluxo do periodo.
     Sem o aviso no rodape, ele pareceria travado quando a tabela embaixo muda.

     Ele DEIXOU DE SAIR EM VERDE. Verde ali era o mesmo verde de "tudo certo", para um
     número que pode estar negativo — e com quatro dos cinco cartões verdes a faixa virava
     uma mancha só. Agora tem cor própria, e o rodapé diz quando está abaixo do zero. */
  ok(/tileCor\(Q\.num\(estoque\), 'Total no Estoque',\s*\n\s*estoque < 0 \? 'abaixo do zero' : '[^']*fora do filtro'/
    .test(fileira),
    'o estoque avisa que está fora do filtro, e diz quando passou do zero', fileira);
  ok(/COR_TILE\.estoque/.test(fileira) && !/'Total no Estoque'[^)]*'ok'/.test(fileira),
    'e não usa mais a cor de severidade — verde ali é a cor de "tudo certo"');
  ok(/\.ftile\.ok \.v\{color:var\(--verde\)\}/.test(css),
    'e "ok" é verde de verdade no CSS — o rótulo sozinho não pinta nada');

  /* Ele soma os GALPOES. Somar `locais` traria os clientes junto, e o cartao diria que
     temos em casa o que esta na rua. */
  var k = adm.indexOf('var estoque = ');
  var linhaEst = adm.slice(k, adm.indexOf('\n', k));
  ok(/PAINEL\.galpoes/.test(linhaEst) && linhaEst.indexOf('PAINEL.locais') < 0,
    'e soma os galpões e unidades, não os clientes', linhaEst);
  var soma = new Function('PAINEL', linhaEst.trim() + ' return estoque;');
  ok(soma({ galpoes: [{ saldo: 1620 }, { saldo: 0 }, { saldo: 12 }] }) === 1632,
    'a soma roda: três unidades viram um número só');
  ok(soma({}) === 0 && soma({ galpoes: [{}] }) === 0,
    'e sem galpão nenhum dá zero, não NaN — painel meio carregado não escreve "NaN" na tela',
    [soma({}), soma({ galpoes: [{}] })]);

  /* --- a conta dos totais, rodando --------------------------------------- */
  var m = adm.indexOf('function totaisDe(lista)');
  var totaisDe = new Function('metaFluxo',
    adm.slice(m, adm.indexOf('\n  }', m)) + '\n  } return totaisDe;')(function () { return 90; });

  var linhas = [
    { situacao: 'atencao', saida: 1690, retorno: 1250, saldo: -440, desvio: 26 },
    { situacao: 'atencao', saida: 810, retorno: 0, saldo: -810, desvio: 100 },
    { situacao: 'parado', saida: 0, retorno: 0, saldo: 0, desvio: null }
  ];
  var tudo = totaisDe(linhas);
  ok(tudo.saida === 2500 && tudo.retorno === 1250,
    'sem filtro, os cartões somam as duas linhas com movimento', tudo);

  var so1 = totaisDe([linhas[0]]);
  ok(so1.saida === 1690 && so1.saida < tudo.saida,
    'filtrada uma linha, eles encolhem junto — é o que "responde ao filtro" quer dizer',
    so1);

  /* A linha parada nao entra na conta. Conferir isso pela saida e pelo retorno nao testa
     nada: linha parada TEM saida e retorno zero por definicao — foi assim que ela virou
     parada. O que a guarda protege e a CONTAGEM. */
  ok(totaisDe([linhas[2]]).linhas === 0,
    'a linha parada não entra na contagem: o estoque inicial não é movimentação');
  ok(tudo.linhas === 2,
    'e as duas com movimento contam — não uma lista vazia que passaria por engano',
    tudo.linhas);
})();

/* ---------------------------------------------------------------------------
 * Limpar filtros: uma acao devolve a tela ao estado de quem acabou de abrir.
 *
 * Sao quatro filtros em tres cantos diferentes — origem e destino em cima, o periodo ao
 * lado, o grupo na coluna da esquerda. Desfaze-los um a um e onde se esquece de um e se
 * conclui que a tabela esta errada.
 * ------------------------------------------------------------------------- */
console.log('\n== limpar filtros do Controle de Caixas ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* O recorte fecha contando chaves, e nao procurando uma linha escrita a mao. Procurar
     por texto parecia mais simples ate a hora em que a linha mudou: o indexOf voltou -1,
     o recorte pegou outro pedaco do arquivo, e a bancada inteira passou a exercitar codigo
     que nao era o desta funcao — tudo verde, sem testar nada. A conferencia logo abaixo e
     a guarda: se o recorte errar de novo, ele cai aqui, e nao em silencio. */
  var i = adm.indexOf('  function valor(id){');
  var j = adm.indexOf('function limparFiltrosFluxo(){', i);
  var k = adm.indexOf('{', j), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var fonte = adm.slice(i, k);

  ok(i > 0 && j > i && /function algumFiltroFluxo/.test(fonte) &&
     /function limparFiltrosFluxo/.test(fonte) && /FILTROS_FLUXO =/.test(fonte),
    'o recorte pegou as tres pecas — sem isto a bancada abaixo exercitaria outro codigo');

  /* Monta a bancada com o codigo REAL: campos de formulario de mentira, e as duas saidas
     (recarregar / so redesenhar) anotadas em vez de executadas. */
  function bancada(campos, grupo) {
    var chamou = { carregou: 0, desenhou: 0 };
    var botao = { disabled: false };
    var doc = { getElementById: function (id) {
      return id === 'btnLimparRetornos' ? botao : (campos[id] || null);
    } };
    var faz = new Function('document', 'FLUXO_FILTRO', 'chamou', 'FLUXO_TIPO',
      fonte +
      '\n return { ativo: algumFiltroFluxo, limpar: limparFiltrosFluxo,' +
      '\n          grupo: function(){ return FLUXO_FILTRO; },' +
      '\n          movimento: function(){ return FLUXO_TIPO; } };' +
      '\n function carregarPainel(){ chamou.carregou++; }' +
      '\n function desenharFluxo(){ chamou.desenhou++; }' +
      /* O atalho de período aceso é enfeite que ACOMPANHA o campo de data: limpo o
         campo e deixado o botão marcado, o painel mostraria "7 dias" ligado sobre um
         período vazio. Aqui ele é anotado para a afirmação abaixo poder cobrá-lo. */
      '\n function marcarAtalhoFluxo(q){ chamou.atalho = q; }' +
      /* O recorte de MOVIMENTO volta junto: deixado como estava, limpar devolvia a
         lista inteira com "Saída" ainda apertado na folha. */
      '\n function marcarMovimentoFluxo(q){ FLUXO_TIPO = q; chamou.mov = q; }');
    var api = faz(doc, grupo, chamou, campos.__mov || 'todos');
    api.chamou = chamou;
    api.botao = botao;
    return api;
  }

  function campos(o, d, de, ate) {
    return { rtOrigem: { value: o || '' }, rtDestino: { value: d || '' },
             rtDe: { value: de || '' }, rtAte: { value: ate || '' } };
  }

  /* --- quando o botao acende --------------------------------------------- */
  ok(bancada(campos(), 'todas').ativo() === false,
    'tela recem-aberta: nada a limpar, o botao fica apagado');
  ok(bancada(campos('Matriz Fazenda'), 'todas').ativo() === true,
    'uma origem escolhida ja acende o botao');
  ok(bancada(campos('', 'João Pessoa'), 'todas').ativo() === true, 'um destino tambem');
  ok(bancada(campos('', '', '2026-09-17'), 'todas').ativo() === true, 'so a data De tambem');
  ok(bancada(campos('', '', '', '2026-09-17'), 'todas').ativo() === true, 'so a data Ate tambem');
  /* O grupo da coluna da esquerda e filtro como os outros: "Em deficit" esconde linhas.
     Ficou de fora uma vez e o botao aparecia apagado com a tabela visivelmente peneirada. */
  ok(bancada(campos(), 'deficit').ativo() === true,
    'e o grupo da esquerda conta: "Em déficit" esconde linhas como qualquer filtro');

  /* --- o que limpar faz --------------------------------------------------- */
  var a = bancada(campos('Matriz Fazenda', 'João Pessoa', '2026-09-17', '2026-09-17'), 'deficit');
  a.limpar();
  ok(a.ativo() === false, 'depois de limpar nao sobra filtro nenhum');
  ok(a.grupo() === 'todas', 'o grupo da esquerda volta para "Todas"');

  /* --- ir ao servidor so quando precisa ----------------------------------- */
  var comData = bancada(campos('', '', '2026-09-17', ''), 'todas');
  comData.limpar();
  ok(comData.chamou.carregou === 1 && comData.chamou.desenhou === 0,
    'o periodo e o unico que vai ao servidor: limpar data recarrega', comData.chamou);

  var semData = bancada(campos('Matriz Fazenda'), 'deficit');
  semData.limpar();
  ok(semData.chamou.carregou === 0 && semData.chamou.desenhou === 1,
    'sem data, so redesenha: ida de rede para reexibir o que ja veio e desperdicio',
    semData.chamou);

  /* --- o "Só de teste" fica fora ------------------------------------------ */
  ok(fonte.indexOf('verTeste') < 0 && fonte.indexOf('VER_TESTE') < 0,
    'limpar NAO mexe em "Só reais / Só de teste": ele escolhe qual operação se lê, ' +
    'não estreita nada — e zerar junto sumiria com o ensaio da tela de quem o olhava');

  /* --- um ponto so mexe no estado da barra --------------------------------- */
  var toggles = adm.split('ajustarBarraFiltros()').length - 1;
  ok(toggles === 4,
    'a barra tem UMA funcao de estado, chamada do desenho, do botao e da abertura',
    toggles);
  var dF = adm.indexOf('function desenharFluxo()');
  var corpoF = adm.slice(dF, adm.indexOf("\n  /* Três frases diferentes", dF));
  ok(corpoF.indexOf('ajustarBarraFiltros()') > 0,
    'o desenho do fluxo a chama — e e por ele que TUDO que mexe em filtro passa');
  /* Um lugar so liga e desliga o LIMPAR. A busca e dentro da funcao de estado da barra,
     e nao no arquivo inteiro: `disabled` aparece noutros pontos do painel — nas abas de
     admin travadas no cadastro, por exemplo — e contar tudo tornaria o teste refem de
     codigo que nao tem nada a ver com esta regra. */
  var ab = adm.indexOf('function ajustarBarraFiltros()');
  var corpoBarra = adm.slice(ab, adm.indexOf('\n  }', ab));
  ok((corpoBarra.match(/limpar\.hidden = /g) || []).length === 1 &&
     /if \(limpar\) limpar\.hidden = !n;/.test(corpoBarra),
    'e so um lugar mostra e esconde o Limpar — espalhar isso deixa o botao aceso depois ' +
    'de limpo', corpoBarra);

  /* NÃO NASCE DESABILITADO. Ele nasceu assim na época em que ficava sempre na tela;
     quando passou a APARECER só havendo filtro, o atributo ficou para trás — e
     `ajustarBarraFiltros` só mexe no `hidden`. O resultado, ao vivo: um botão que
     surgia exatamente quando havia o que limpar, e não limpava nada.

     Quem esconde antes do primeiro desenho é o `hidden`, que a mesma função controla. */
  var html = adm.slice(adm.indexOf('id="btnLimparRetornos"') - 200,
                       adm.indexOf('id="btnLimparRetornos"') + 200);
  ok(!/disabled/.test(html),
    'o botão de limpar não nasce desabilitado — aparecendo só com filtro, o `disabled` ' +
    'virava um botão que surgia na hora certa e não fazia nada');
})();

/* ---------------------------------------------------------------------------
 * Saldo final = SALDO INICIAL − saida + retorno.
 *
 * A formula e do usuario, escrita duas vezes com os numeros dele: "1.250 − 1.690 + 1.250"
 * da 810. Retorno menos saida daria −440, que e outra pergunta.
 *
 * E ja foi retorno − saida, por um dia em que o final dava zero sem nada ter voltado —
 * 810 de saldo, 810 de saida, e zero se le como "quitado". O que faltava ali nao era
 * mudar a formula: era a coluna "Lancado no dia", que mostra de onde vem cada salto do
 * Saldo inicial. Com ela a cadeia fecha linha a linha. Quem responde "quanto falta
 * voltar" e o cartao de deficit, no alto da tela.
 * ------------------------------------------------------------------------- */
console.log('\n== o Saldo final segue a formula do saldo ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf("      final:    { t: TIT['final']");
  var bloco = adm.slice(i, adm.indexOf('\n    };', i));
  var corpo = bloco.slice(bloco.indexOf('v: function(l){'));
  corpo = corpo.slice(corpo.indexOf('{') + 1, corpo.lastIndexOf('}'));
  corpo = corpo.slice(0, corpo.lastIndexOf('}'));
  ok(/saldoFinalDaLinha\(l, gente\)/.test(corpo) && corpo.indexOf('estoqueInicial') < 0,
    'o recorte pegou a celula certa, e ela nao tem mais excecao para o estoque');
  /* A CÉLULA PASSOU A CHAMAR `saldoFinalDaLinha`, e a função REAL entra na bancada junto.
     Escrita aqui como coto, esta bancada mediria a minha cópia da fórmula — e foi uma
     cópia divergente que fez o chip de déficit discordar desta coluna. */
  var iSF = adm.indexOf('  function saldoFinalDaLinha(');
  var fonteSF = adm.slice(iSF, adm.indexOf('\n  }', iSF) + 4);
  ok(iSF > 0 && /gente \? l\.saldo : l\.fimCorrido/.test(fonteSF),
    'e a função do saldo final veio do arquivo, não de uma cópia escrita no teste');
  var Q = { num: function (n) { return String(n); } };
  var celula = new Function('Q', 'gente', 'l', fonteSF + '\n' + corpo);

  /* Os quatro dias da tela do usuario, com a conta que ele escreveu ao lado. O campo
     `saldo` (retorno − saida) vai junto e DIFERENTE em cada um: se a celula voltar a
     le-lo, todos estes caem. */
  [{ d: '15/09 estoque', l: { iniCorrido: 1250, fimCorrido: 1250, saida: 0, retorno: 0,
                              saldo: 0, inicial: 1250, estoqueInicial: true }, e: '+1250' },
   { d: '16/09', l: { iniCorrido: 1250, fimCorrido: 810, saida: 1690, retorno: 1250,
                      saldo: -440 }, e: '+810' },
   { d: '17/09 estoque', l: { iniCorrido: 1620, fimCorrido: 1620, saida: 0, retorno: 0,
                              saldo: 0, inicial: 810, estoqueInicial: true }, e: '+1620' },
   { d: '17/09', l: { iniCorrido: 1620, fimCorrido: 810, saida: 810, retorno: 0,
                      saldo: -810 }, e: '+810' }
  ].forEach(function (c) {
    var saiu = celula(Q, false, c.l);
    ok(saiu.indexOf(c.e) > 0,
      c.d + ': ' + c.l.iniCorrido + ' − ' + c.l.saida + ' + ' + c.l.retorno + ' = ' + c.e,
      saiu);
  });

  /* A linha de estoque nao precisa de excecao: sem saida nem retorno, a formula ja
     devolve o proprio saldo dela. A excecao existiu enquanto a formula era outra. */
  var est = celula(Q, false, { iniCorrido: 1620, fimCorrido: 1620, saida: 0, retorno: 0,
                               saldo: 0, inicial: 810, estoqueInicial: true });
  ok(est.indexOf('1620') > 0 && est.indexOf('810') < 0,
    'a linha de estoque mostra o saldo dela, e não o que foi lançado — isso é a coluna ' +
    'ao lado', est);

  /* --- as cores ----------------------------------------------------------- */
  ok(/val-ok/.test(celula(Q, false, { fimCorrido: 245 })),
    'saldo positivo em verde, com o sinal de mais',
    celula(Q, false, { fimCorrido: 245 }));
  ok(/val-ruim/.test(celula(Q, false, { fimCorrido: -440 })),
    'saldo negativo em vermelho', celula(Q, false, { fimCorrido: -440 }));
  var zero = celula(Q, false, { fimCorrido: 0 });
  ok(zero.indexOf('0') > 0 && !/val-ok|val-ruim/.test(zero),
    'zero nao e nem sobra nem falta: aparece sem cor', zero);

  /* Nas visoes de gente nao ha conta corrida — cada pessoa responde pelo saldo dela. */
  ok(/val-ruim/.test(celula(Q, true, { saldo: -80, fimCorrido: 999 })),
    'na visao de gente o valor segue o saldo da pessoa, nao o corrido',
    celula(Q, true, { saldo: -80, fimCorrido: 999 }));

  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  ok(/\.val\.val-ok\{color:var\(--verde\)\}/.test(css) &&
     /\.val\.val-ruim\{color:var\(--vermelho\)\}/.test(css),
    'as duas cores sao as mesmas do resto do painel');

  /* O CSV carrega o mesmo numero da tela: exportar e conferir nao podem divergir. */
  var j = adm.indexOf("      final:    function(l){");
  var linhaCsv = adm.slice(j, adm.indexOf('\n', j));
  var csvFinal = new Function('l', 'return (' +
    linhaCsv.slice(linhaCsv.indexOf('return ') + 7, linhaCsv.lastIndexOf('; }')) + ');');
  ok(csvFinal({ fimCorrido: 810, saldo: -440 }) === 810,
    'o CSV leva o mesmo numero da tela: 810, e nao os -440 de retorno menos saida',
    csvFinal({ fimCorrido: 810, saldo: -440 }));
})();

/* ---------------------------------------------------------------------------
 * As abas do painel obedecem ao cadastro — e o admin continua mandando no que e dele.
 *
 * Sao DUAS regras sobre a mesma aba: "Ajustes e Cadastros so para o admin" e a lista
 * marcada no cadastro. Escritas em lugares diferentes elas acabam discordando — foi o que
 * aconteceu com o PROMOTOR no app de campo, onde um `if` a parte escondia a aba que o
 * cadastro mandava mostrar. Aqui as duas moram numa peneira so.
 * ------------------------------------------------------------------------- */
console.log('\n== as abas do painel obedecem ao cadastro ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function abasPermitidas(s)');
  var fonte = adm.slice(i, adm.indexOf('\n  }', i) + 4);

  var ABAS = [
    { ID: 'pgRetornos', Nome: 'Painel de Ativos' },
    { ID: 'pgPainel', Nome: 'Painel' },
    { ID: 'pgExtrato', Nome: 'Extratos' },
    { ID: 'pgLancar', Nome: 'Ajustes', sensivel: true },
    { ID: 'pgMovimentos', Nome: 'Movimentos' },
    { ID: 'pgCadastros', Nome: 'Cadastros', sensivel: true }
  ];
  function monta(ehAdmin) {
    var Q = { ehAdmin: function () { return ehAdmin; } };
    return new Function('Q', 'ABAS_PAINEL', 'PAGINAS_DO_ADMIN',
      fonte + ' return abasPermitidas;')(Q, ABAS, ['pgColunas', 'pgAparencia']);
  }

  var admin = monta(true), gente = monta(false);

  ok(admin({}).length === 6,
    'admin sem restricao ve as seis', admin({}));
  ok(gente({}).length === 0,
    'sem marca, quem nao e admin nao ve NADA — nem Ajustes nem Cadastros, e nem as ' +
    'marca EXPLICITA, porque uma dá o cadastro de usuários e a outra mexe no saldo',
    gente({}));

  ok(gente({ abas: ['pgRetornos'] }).join(',') === 'pgRetornos',
    'a lista do cadastro manda no que sobra', gente({ abas: ['pgRetornos'] }));
  /* O PEDIDO: marcar Cadastros para quem nao e admin ABRE a porta. A trava por perfil
     saiu; quem decide e quem cadastra. */
  ok(gente({ abas: ['pgCadastros', 'pgExtrato'] }).join(',') === 'pgExtrato,pgCadastros',
    'marcar Cadastros para quem nao e admin ABRE a porta — quem decide e o administrador',
    gente({ abas: ['pgCadastros', 'pgExtrato'] }));
  ok(admin({ abas: ['pgCadastros'] }).join(',') === 'pgCadastros',
    'mas o admin pode restringir a si mesmo pela lista');

  // a peneira da tela: a aba some e a primeira que sobrou vira a aberta
  var j = adm.indexOf('function ajustarAbasPainel(s)');
  var aj = adm.slice(j, adm.indexOf('\n  }', j) + 4);
  ok(aj.indexOf("style.display = ok ? '' : 'none'") > 0,
    'a aba proibida some, nao fica so desabilitada');
  ok(aj.indexOf("sec.classList.remove('ativa')") > 0,
    'e a pagina dela deixa de ser a ativa — senao ficaria aberta sem o botao');
  ok(aj.indexOf('primeira.click()') > 0,
    'a primeira que sobrou vira a aberta, senao o painel abre em tela branca');
  ok(/if \(!ABAS_PAINEL\.length\) return;/.test(aj),
    'e sem a lista ainda carregada ela nao esconde nada: a lista chega com a `equipe`');

  // o formulario envia o campo, e ele existe no modal
  ok(adm.indexOf("Abas:lerMarcados('fAbas')") > 0, 'o formulario envia as abas marcadas');
  ok(adm.indexOf("caixaLocais('fAbas'") > 0, 'e desenha a lista para marcar');
})();

/* ---------------------------------------------------------------------------
 * A aba Lancamentos do app de campo.
 *
 * Substituiu o "Saldo por Rota", que respondia uma pergunta so e nao deixava conferir
 * lancamento nenhum. Os quatro filtros sao de MULTIPLA escolha porque a pergunta de campo
 * quase nunca e de um valor so: "o que o Chico e o Ramos levaram para Caruaru e Recife" e
 * uma pergunta, nao quatro.
 * ------------------------------------------------------------------------- */
console.log('\n== a aba Lancamentos filtra e soma ==');
(function () {
  function corpo(nome) {
    var i = html.indexOf('function ' + nome + '(');
    return i < 0 ? '' : html.slice(i, html.indexOf('\n  }', i) + 4);
  }

  /* Ajuste e perda ficam de fora da lista: nao sao viagem de caixa, e sim correcao de
     saldo feita no escritorio. Contados como saida — que e onde caem por nao serem
     devolucao — eles inflavam o cartao. */
  var cl = corpo('carregarLanc');
  ok(/tipo === 'SAIDA' \|\| m\.tipo === 'TRANSFERENCIA' \|\| m\.tipo === 'DEVOLUCAO'/.test(cl),
    'ajuste e perda ficam fora da lista: nao sao viagem de caixa', cl.trim());

  // a peneira roda de verdade
  var pf = corpo('passaFiltro');
  var marcadosFonte = corpo('marcados');
  var marcados = {};
  /* `passaFiltro` passou a chamar `passaBusca`. A bancada entrega uma busca VAZIA — o
     que este bloco mede sao os filtros, e a busca tem bloco proprio. Entregar a de
     verdade faria estas afirmacoes falharem por um motivo que nao e delas. */
  /* `LC_CHIP` entra como PARAMETRO: o recorte rapido — Todos / Saidas / Retornos /
     Corrigidos — substituiu a lista de multipla escolha "Entrada / Saida", que com dois
     valores custava tres toques onde cabe um. A bancada passa 'todos' por padrao,
     porque o que estes casos medem sao as OUTRAS listas. */
  function passa(m, sel, chip) {
    marcados = sel;
    var f = new Function('marcados', 'passaBusca', 'LC_CHIP', 'm',
      pf.slice(pf.indexOf('{') + 1, pf.lastIndexOf('}')));
    return f(function (id) { return marcados[id] || []; },
             function () { return true; }, chip || 'todos', m);
  }
  var saida = { tipo: 'SAIDA', motorista: 'Chico', origem: 'Matriz', destino: 'Caruaru',
                usuario: 'Nestor Neto' };
  var volta = { tipo: 'DEVOLUCAO', motorista: 'Ramos', origem: 'Recife', destino: 'Matriz',
                usuario: 'Melkezedeque Soares' };

  ok(passa(saida, {}) && passa(volta, {}),
    'nada marcado quer dizer TODOS — senao a tela abriria vazia sem dizer por que');
  /* O SENTIDO VIROU CHIP, e saiu da folha. Com dois valores, marcar os dois e o mesmo
     que nao marcar nenhum — e uma lista de multipla escolha para isso era tres toques
     onde cabe um. */
  ok(passa(saida, {}, 'saida') && !passa(volta, {}, 'saida'),
    'o chip de saidas separa saida de retorno');
  ok(passa(volta, {}, 'retorno') && !passa(saida, {}, 'retorno'),
    'e o de retornos, o contrario');
  ok(passa(saida, {}, 'todos') && passa(volta, {}, 'todos'),
    '"Todos" nao recorta nada');
  /* CORRIGIDOS nao existia em lugar nenhum: e o recorte de quem foi conferir o que
     mudou, e sem ele isso se fazia lendo cartao por cartao atras da etiqueta. */
  var mexido = { tipo: 'SAIDA', motorista: 'Chico', origem: 'Matriz', destino: 'Caruaru',
                 usuario: 'Nestor Neto', alterado: { vezes: 2 } };
  ok(passa(mexido, {}, 'corrigido') && !passa(saida, {}, 'corrigido'),
    'e o de corrigidos fica so com o que tem historico de alteracao');

  /* O ponto da multipla escolha: dois valores no mesmo filtro passam os dois. */
  ok(passa(saida, { lcFMotorista: ['Chico', 'Ramos'] }) &&
     passa(volta, { lcFMotorista: ['Chico', 'Ramos'] }),
    'dois motoristas marcados passam os dois — e para isso que o filtro e multiplo');
  ok(!passa(saida, { lcFMotorista: ['Ramos'] }),
    'e quem nao esta marcado sai');

  /* QUEM LANCOU. A aba mostra os lancamentos de mais de uma pessoa quando a permissao
     "de quem ela ve" cita varias — e ai as linhas de duas ficam misturadas sem nenhum
     jeito de separar. O filtro entra na MESMA peneira dos outros quatro. */
  ok(passa(saida, { lcFUsuario: ['Nestor Neto'] }) &&
     !passa(volta, { lcFUsuario: ['Nestor Neto'] }),
    'o filtro de quem lançou separa as pessoas — sem ele, as linhas de duas ficam ' +
    'misturadas e não há como saber de quem é cada uma');
  ok(passa(saida, { lcFUsuario: ['Nestor Neto', 'Melkezedeque Soares'] }) &&
     passa(volta, { lcFUsuario: ['Nestor Neto', 'Melkezedeque Soares'] }),
    'e é múltipla escolha, como os outros quatro');
  ok(passa(saida, {}) && passa(volta, {}),
    'e nada marcado continua querendo dizer TODOS');

  // filtros diferentes se SOMAM
  ok(!passa(saida, { lcFMotorista: ['Chico'], lcFDestino: ['Recife'] }),
    'filtros diferentes se somam: motorista certo e destino errado nao passa');
  ok(!passa(saida, { lcFUsuario: ['Nestor Neto'], lcFDestino: ['Recife'] }),
    'inclusive o de quem lançou: pessoa certa e destino errado não passa');

  /* As opcoes saem dos lancamentos que VIERAM, e nao do cadastro inteiro: uma lista com
     trinta locais dos quais dois tem movimento obriga a procurar. */
  var mf = corpo('montarFiltrosLanc');
  ok(mf.indexOf('LANC.forEach') > 0 && mf.indexOf('DADOS.locais') < 0,
    'as opcoes saem dos lancamentos do periodo, nao do cadastro inteiro', mf.trim());
  ok(mf.indexOf('antes.indexOf(o[0]) >= 0') > 0,
    'e a marcacao sobrevive ao remontar a lista');
  /* Cada um dos quatro que sai do dado tem de PUXAR as opcoes do campo dele. Registrado
     na lista e sem puxar nada, o filtro aparece na tela vazio para sempre — e "Nada no
     periodo" nao distingue "ninguem lancou" de "esqueci de ligar este". */
  [['lcFMotorista', 'm.motorista'], ['lcFOrigem', 'm.origem'],
   ['lcFDestino', 'm.destino'], ['lcFUsuario', 'm.usuario']].forEach(function (par) {
    var trecho = "['" + par[0] + "', valores(function(m){ return " + par[1] + ";";
    ok(mf.indexOf(trecho) > 0,
      'o filtro ' + par[0] + ' puxa as opções do campo dele — registrado sem puxar, ele ' +
      'aparece vazio para sempre, e "Nada no período" não distingue isso de ninguém ' +
      'ter lançado', trecho);
  });

  // os cartoes somam o que esta na TELA, nao o periodo inteiro
  var dl = corpo('desenharLanc');
  ok(dl.indexOf('LANC.filter(passaFiltro)') > 0 && dl.indexOf('lista.forEach') > 0,
    'os cartoes somam a lista JA filtrada — o resumo tem de concordar com a tabela',
    dl.indexOf('lista.forEach'));
  ok(/saiu \+ voltou/.test(dl),
    'e o total geral e saidas mais retornos');

  /* A TABELA MUDOU DE CASA. Ela saiu de dentro de `desenharLanc` para `tabelaLanc`,
     porque no celular a lista virou cartões e o desenho passou a ser dois. As
     afirmações abaixo seguem a tabela para onde ela foi — deixadas em `dl`, todas
     passariam a falhar sem que nada tivesse quebrado. */
  var tl = corpo('tabelaLanc');

  /* "Data do movimento", e não "Data": é a mesma data que o formulário pede e que a
     consulta do escritório mostra, e um nome por tela faria a pessoa achar que são
     coisas diferentes. */
  ['Movimento', 'Origem', 'Destino', 'Caixa', 'Saída', 'Retorno', 'Motorista',
   'Quem lançou'].forEach(function (c) {
    ok(tl.indexOf('>' + c + '<') > 0, 'a tabela tem a coluna ' + c, c);
  });
  /* Cabecalho e celula andam juntos: um <th> sem <td> desalinha a tabela inteira a
     partir dali, e o erro so aparece na coluna seguinte. */
  /* `<th[ >]` e nao `<th`: `<thead>` comeca com `<th` e entrava na conta, fazendo a
     afirmacao acusar 9 cabecalhos para 8 celulas. */
  /* NOVE: as oito de dado mais a das AÇÕES, que é o `<th></th>` vazio no fim e o `<td>`
     do botão de corrigir. Ela não tem título de propósito — a coluna não é um dado, é o
     caminho para consertar a linha, e um título ali seria lido como mais uma informação
     sobre o lançamento. */
  var nTh = (tl.match(/<th[ >]/g) || []).length;
  var nTd = (tl.match(/<td[ >]/g) || []).length;
  ok(nTh === nTd && nTh === 9,
    'e cada cabeçalho tem a célula dele — um <th> sem <td> desalinha a tabela inteira a ' +
    'partir dali, e o erro só aparece na coluna seguinte', [nTh, nTd]);
  ok(/Q\.esc\(m\.usuario \|\| '—'\)/.test(tl),
    'e a célula de quem lançou sai do campo que o servidor manda');

  /* QUATRO, e nao mais cinco: "Entrada / Saida" virou chip no trilho, porque com dois
     valores marcar os dois e o mesmo que nao marcar nenhum. A lista dele so custava
     toques. O chip tem afirmacao propria logo acima, rodando. */
  ok(html.indexOf('id="lcFMotorista"') > 0 &&
     html.indexOf('id="lcFOrigem"') > 0 && html.indexOf('id="lcFDestino"') > 0 &&
     html.indexOf('id="lcFUsuario"') > 0 && html.indexOf('id="lcFSentido"') < 0,
    'os quatro filtros de múltipla escolha existem, e o sentido saiu deles');
  /* O contador de marcados e o "Limpar filtros" tem de alcancar o quinto. O limpar
     alcanca porque varre o container inteiro — e e por isso que o filtro novo mora
     DENTRO de `.filtros-lanc`, e nao ao lado dele. */
  /* A lista antiga e PREFIXO da nova, entao procurar "a antiga sumiu" nunca vale. O que
     distingue e o FECHAMENTO: `'lcFDestino']` contra `'lcFDestino','lcFUsuario']`. */
  /* O contador varre os CINCO. A ordem mudou quando o Usuario foi para o primeiro, entao
     a afirmacao olha o conjunto, e nao a sequencia — assim ela sobrevive a proxima
     reordenacao sem deixar de cobrar o que importa. */
  var iCont = html.indexOf('].forEach(function(id){' + String.fromCharCode(10) + '      var n = marcados(id).length;');
  var listaCont = html.slice(html.lastIndexOf('[', iCont), iCont + 1);
  ['lcFUsuario', 'lcFMotorista', 'lcFOrigem', 'lcFDestino']
    .forEach(function (id) {
      ok(listaCont.indexOf("'" + id + "'") > 0,
        'o contador de marcados conta o ' + id + ' — esquecido, o filtro ficaria ligado ' +
        'sem nada dizer quantos', listaCont);
    });
  var iL = html.indexOf('btnLimparLanc');
  var limpar = html.slice(html.indexOf("getElementById('btnLimparLanc')"),
                          html.indexOf("getElementById('btnLimparLanc')") + 400);
  ok(iL > 0 && /\.filtros-lanc input:checked/.test(limpar),
    'e o Limpar varre o container inteiro, então alcança qualquer filtro novo — um por ' +
    'um, o quinto seria esquecido', limpar.slice(0, 200));
  /* DENTRO do container, medido pelos limites dele — contando as <div> que abrem e
     fecham, e nao chutando uma distancia em caracteres. */
  var iBox = html.indexOf('<div class="filtros-lanc">');
  var fimBox = (function () {
    var i = iBox, n = 0;
    while (i < html.length) {
      if (html.slice(i, i + 4) === '<div') n++;
      else if (html.slice(i, i + 6) === '</div>') { n--; if (!n) return i; }
      i++;
    }
    return -1;
  })();
  var iUsu = html.indexOf('id="lcFUsuario"');
  ok(iBox > 0 && fimBox > iBox && iUsu > iBox && iUsu < fimBox,
    'e o filtro novo mora DENTRO do container — fora dele, o Limpar não o veria, porque ' +
    'ele varre o container e não os filtros um a um',
    { box: iBox, fim: fimBox, usuario: iUsu });

  /* --- o Usuario vem PRIMEIRO -------------------------------------------- */
  /* Com a permissao "de quem ela ve" citando varias pessoas, "de quem e isto" passa a ser
     a primeira pergunta de quem olha a lista, e nao a ultima. */
  var ordem = ['lcFUsuario', 'lcFMotorista', 'lcFOrigem', 'lcFDestino']
    .map(function (id) { return html.indexOf('id="' + id + '"'); });
  ok(ordem.every(function (p, i) { return p > 0 && (i === 0 || p > ordem[i - 1]); }),
    'o filtro de quem lançou vem PRIMEIRO na fileira — é a primeira pergunta de quem ' +
    'olha uma lista com mais de uma pessoa', ordem);
  var mfOrdem = mf.indexOf("['lcFUsuario'");
  ok(mfOrdem > 0 && mfOrdem < mf.indexOf("['lcFMotorista'"),
    'e a montagem das opções segue a mesma ordem — duas ordens diferentes para a mesma ' +
    'fileira é uma delas esperando para ficar errada');

  /* --- a lista é SUSPENSA, e não empurra a tabela ------------------------- */
  /* Este bloco nasceu sem o `css`: ele lia so o HTML, e a lista suspensa e decisao de
     ESTILO — o comportamento inteiro mora no `styles.css`. */
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  /* Aberta no lugar, ela empurrava a tabela para baixo: a fileira inteira crescia para
     caber a mais alta, e os outros quatro filtros viravam caixas vazias de 350px. */
  ok(/\.fchk \.opcoes\{position:absolute/.test(css),
    'a lista de opções é SUSPENSA — aberta no lugar, ela empurra a tabela para baixo e ' +
    'estica os outros filtros junto');
  ok(/\.fchk\{[^}]*position:relative/.test(css),
    'e o filtro é a referência dela — sem isso ela se mediria pela página e nasceria ' +
    'longe do próprio título');
  ok(/\.fchk:not\(\[open\]\) \.opcoes\{display:none\}/.test(css),
    'fechada, ela não ocupa nada — nem o `padding`, que sozinho já desenharia uma faixa');
  ok(/z-index:\s*\d+/.test(css.slice(css.indexOf('.fchk .opcoes{'),
                                     css.indexOf('.fchk .opcoes{') + 400)) &&
     /background:var\(--surface\)/.test(css.slice(css.indexOf('.fchk .opcoes{'),
                                                  css.indexOf('.fchk .opcoes{') + 400)),
    'e ela passa por cima com fundo sólido — translúcida, ela e a tabela se leriam juntas');
  /* A ultima da fileira abre para a esquerda: colada na borda direita da tela, ela sairia
     fora e a pessoa rolaria a pagina de lado. */
  ok(/\.filtros-lanc \.fchk:last-child \.opcoes\{left:auto/.test(css),
    'e a última da fileira abre para a esquerda — colada na borda, ela sairia da tela');

  /* --- uma de cada vez, e fecha ao clicar fora ---------------------------- */
  /* Suspensas, duas abertas se cobrem: sao vizinhas na mesma fileira. */
  /* O CORPO do `toggle`, e nao a existencia dele. A primeira versao desta afirmacao
     procurava as duas pecas em qualquer lugar do arquivo — e o `.fchk[open]` do fechar-ao-
     clicar-fora bastava para ela passar com o corpo do toggle esvaziado. */
  var iT = html.indexOf("addEventListener('toggle', function(){");
  var corpoToggle = html.slice(iT, html.indexOf(String.fromCharCode(10) + '    });', iT));
  ok(iT > 0 && /if \(!d\.open\) return;/.test(corpoToggle) &&
     /if \(o !== d\) o\.open = false;/.test(corpoToggle),
    'abrir uma FECHA as outras — suspensas, duas abertas se cobrem, porque são vizinhas ' +
    'na mesma fileira', corpoToggle);
  ok(/if \(e\.target\.closest && e\.target\.closest\('\.filtros-lanc'\)\) return;/.test(html),
    'e clicar fora fecha, como em todo menu suspenso — sem isso a lista fica por cima da ' +
    'tabela e a pessoa tem de voltar no título para fechá-la');
  ok(html.indexOf('id="lcDe"') > 0 && html.indexOf('id="lcAte"') > 0,
    'e o periodo tambem');

  /* A aba recarrega ao ser aberta: com o app aberto o dia inteiro, uma lista congelada na
     hora do login nao mostraria o que a pessoa acabou de lancar. */
  ok(/pgSaldo'\) carregarLanc\(\)/.test(html),
    'abrir a aba recarrega os lancamentos');
})();

console.log('\n== nenhum id se repete dentro da mesma tela ==');
(function () {
  /* UM ID REPETIDO NÃO DÁ ERRO EM LUGAR NENHUM — ele só entrega o elemento errado.
     Aconteceu: a lateral recolhível ganhou um `#btnTrilho`, e esse nome já era do
     botão que recolhe a coluna do Painel de Ativos. `getElementById` devolve o
     PRIMEIRO do documento, então o script daquele painel passou a mandar no botão
     da lateral: reescreveu a classe dele (`btn.className = 'ret-recolher'`) e trocou
     o conteúdo por um `⟨`. O CSS do trilho parou de casar — a classe tinha sumido —,
     o botão do Painel de Ativos ficou sem dono, e nada disso apareceu como erro.

     É a mesma lição da classe `.barra`, que colidiu com a barra de envelhecimento:
     nome novo em projeto antigo tem de ser PROCURADO, não só pensado. Esta
     verificação é a busca, feita por máquina. */
  ['index.html', 'admin.html', 'extrato.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
    /* SÓ A MARCAÇÃO ESTÁTICA. Dentro do `<script>` os ids se repetem de propósito:
       cada `form*()` monta o seu modal com `id="fNome"`, e só um modal existe no DOM
       por vez — `fNome`, `fAtivo`, `fSalvar`, `fTel` e `fObs` aparecem cinco vezes
       cada um no texto e nunca duas ao mesmo tempo na tela. Contar o arquivo em vez
       da página acusaria cinco defeitos que não existem.

       O que isto NÃO alcança: um id estático que colida com outro criado por script.
       É um buraco mais estreito, e para fechá-lo é preciso navegador. */
    var estatico = txt.replace(/<script[\s\S]*?<\/script>/g, '');
    var vistos = {}, repetidos = [];
    var re = /\sid="([^"]+)"/g, m;
    while ((m = re.exec(estatico))) {
      if (vistos[m[1]]) { if (repetidos.indexOf(m[1]) < 0) repetidos.push(m[1]); }
      else vistos[m[1]] = true;
    }
    ok(repetidos.length === 0,
      nome + ': nenhum id se repete — repetido, o `getElementById` entrega o primeiro ' +
      'e o outro fica sem dono, sem erro nenhum', repetidos);
  });
})();

console.log('\n== a navegação separada por módulo ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* O RISCO SOB A MARCA. Sem ele o logo lia como o primeiro item da lista, e a lista
     parecia começar uma linha acima do que começa. */
  ok(/\.lateral__topo\{[^}]*border-bottom:1px solid var\(--linha\)/.test(css),
    'a marca é separada da navegação por um risco');

  /* CADA ITEM TEM MÓDULO, e cada módulo tem título. */
  ['index.html', 'admin.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
    var nav = txt.slice(txt.indexOf('<nav class="abas"'), txt.indexOf('</nav>'));
    var botoes = (nav.match(/<button[^>]*data-pagina=/g) || []);
    var comGrupo = (nav.match(/<button[^>]*data-grupo=/g) || []);
    ok(botoes.length > 0 && botoes.length === comGrupo.length,
      nome + ': todo item da navegação declara o módulo dele',
      { itens: botoes.length, comGrupo: comGrupo.length });

    var titulos = (nav.match(/class="nav-grupo" data-grupo="([^"]+)"/g) || [])
      .map(function (m) { return /data-grupo="([^"]+)"/.exec(m)[1]; });
    var usados = {};
    (nav.match(/<button[^>]*data-grupo="([^"]+)"/g) || []).forEach(function (m) {
      usados[/data-grupo="([^"]+)"/.exec(m)[1]] = true;
    });
    var semTitulo = Object.keys(usados).filter(function (g) { return titulos.indexOf(g) < 0; });
    ok(semTitulo.length === 0,
      nome + ': e todo módulo usado tem título na lista', semTitulo);
  });

  /* A ORDEM DO MENU DO PAINEL, a pedido — e cada rótulo com a SUA página.
     A ordem é escolha de quem usa: Painel de Ativos abre primeiro porque é a tela do
     dia, e é ela que a navegação abre sozinha quando nenhuma está aberta (a primeira
     visível é a que recebe o clique). Trocar a ordem, aqui, troca a tela inicial.
     O PAR `página > rótulo` é o que esta linha realmente defende. Reordenar o menu na
     mão é mover seis blocos de ícone + texto + `data-pagina`, e o estrago típico não é
     a ordem errada: é um botão ficar com o ícone e a página do vizinho, dizendo
     "Extratos" e abrindo Cadastros. Só a ordem dos rótulos não veria isso. */
  var pnl = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var navA = pnl.slice(pnl.indexOf('<nav class="abas" id="abas"'), pnl.indexOf('</nav>'));
  var pares = (navA.match(/data-pagina="([^"]+)"[\s\S]*?nav-rotulo">([^<]+)</g) || [])
    .map(function (m) {
      var r = /data-pagina="([^"]+)"[\s\S]*?nav-rotulo">([^<]+)</.exec(m);
      return r[1] + '>' + r[2];
    }).join(' | ');
  /* O `data-grupo` DE CADA BOTÃO BATE COM O TÍTULO SOB O QUAL ELE APARECE.
   *
   * São duas coisas separadas: a POSIÇÃO no arquivo (o que se vê) e o ATRIBUTO (o que o
   * código lê). Mover um botão de grupo e esquecer o atributo não quebra nada à vista —
   * ele aparece no lugar certo. Só que quem esconde um título de módulo vazio lê o
   * ATRIBUTO: o título errado fica de pé sem nenhum item embaixo, e o certo some com os
   * itens à vista.
   * Medido: plantei esse defeito duas vezes e ele escapou das duas — a asserção da
   * ordem cobra `página > rótulo`, e o grupo não passa por ela. */
  var grupoAtual = null, fora = [];
  navA.split('\n').forEach(function (linha) {
    var g = /class="nav-grupo" data-grupo="([^"]+)"/.exec(linha);
    if (g) { grupoAtual = g[1]; return; }
    var b = /<button data-grupo="([^"]+)"[^>]*data-pagina="([^"]+)"/.exec(linha);
    if (b && b[1] !== grupoAtual) fora.push(b[2] + ' diz ' + b[1] + ', mas está sob ' + grupoAtual);
  });
  ok(fora.length === 0,
    'e cada botão declara o grupo sob o qual ele aparece — o atributo é o que decide se o ' +
    'título do módulo some quando não sobra item nenhum', fora);

  ok(pares === 'pgRetornos>Painel de Ativos | pgMovimentos>Movimentos | pgPainel>Painel' +
                ' | pgCadastros>Cadastros | pgColunas>Colunas | pgExtrato>Extratos' +
                ' | pgLancar>Ajuste Estoque | pgAparencia>Aparência',
    'o menu do painel está na ordem pedida, e cada rótulo abre a página dele', pares);

  /* O título do módulo é VERDE, e pelo token — cor solta ali escaparia da medição de
     contraste logo abaixo e chegaria ao galpão sem passar por ela. */
  ok(/\.nav-grupo\{[^}]*color:var\(--verde\)/.test(css),
    'o título do módulo é verde, e sai do token — escrito solto, ele escaparia da ' +
    'medição de contraste');

  /* O TÍTULO SOME COM OS ITENS DELE — rodado de verdade, com DOM de mentira. Um
     cabeçalho anunciando uma seção vazia é a forma mais crua de mentir sobre o que a
     pessoa pode fazer, e é o que acontecia sem isto. */
  var iG = js.indexOf('function gruposDaNavegacao(seletor)');
  ok(iG > 0, 'a regra do título mora no `app.js`, uma vez só para as duas telas');
  var corpoG = (function () {
    var d = 0;
    for (var k = js.indexOf('{', iG); k < js.length; k++) {
      if (js[k] === '{') d++;
      else if (js[k] === '}') { d--; if (!d) return js.slice(iG, k + 1); }
    }
    return '';
  })();

  function falsoNav(itens) {
    // itens: [[grupo, visivel], ...]; titulos: um por grupo distinto
    var grupos = [], vistos = {};
    itens.forEach(function (i) { if (!vistos[i[0]]) { vistos[i[0]] = true; grupos.push(i[0]); } });
    var titulos = grupos.map(function (g) {
      return { dataset: { grupo: g }, style: {}, _titulo: true };
    });
    var botoes = itens.map(function (i) {
      return { dataset: { grupo: i[0] }, _vis: i[1] };
    });
    return {
      querySelectorAll: function (sel) {
        var l = sel.indexOf('button') >= 0 ? botoes : titulos;
        l.forEach = Array.prototype.forEach;
        return l;
      },
      _titulos: titulos
    };
  }

  var alvo = null;
  var fn = new Function('document', 'getComputedStyle',
    corpoG + '\n return gruposDaNavegacao;')(
    { querySelector: function () { return alvo; } },
    function (b) { return { display: b._vis ? '' : 'none' }; });

  alvo = falsoNav([['Operação', true], ['Dados', false], ['Sistema', false]]);
  fn('#abas');
  var mostrados = alvo._titulos.filter(function (t) { return t.style.display !== 'none'; })
    .map(function (t) { return t.dataset.grupo; });
  ok(mostrados.length === 1 && mostrados[0] === 'Operação',
    'o título do módulo some quando NENHUM item dele sobrou — cabeçalho sobre seção ' +
    'vazia mente sobre o que a pessoa pode fazer', mostrados);

  alvo = falsoNav([['Operação', false], ['Dados', true]]);
  fn('#abas');
  var volta = alvo._titulos.filter(function (t) { return t.style.display !== 'none'; })
    .map(function (t) { return t.dataset.grupo; });
  ok(volta.length === 1 && volta[0] === 'Dados',
    'e fica quando sobrou pelo menos um', volta);

  /* E AS DUAS TELAS CHAMAM. A regra pode estar perfeita e nunca ser invocada: foi o
     que aconteceu quando se tirou a chamada — o `gruposDaNavegacao` continuava certo,
     os testes dele continuavam verdes, e os títulos voltavam a anunciar seções vazias.
     Tem de ser DEPOIS de esconder os itens, senão ela peneira o estado anterior. */
  ['index.html', 'admin.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
    var iC = txt.indexOf("Q.gruposDaNavegacao('#abas')");
    var iF = txt.search(/b\.style\.display = (liberada|ok) \?/);
    ok(iC > 0, nome + ': a tela chama a peneira dos títulos');
    ok(iC > iF && iF > 0,
      nome + ': e a chama DEPOIS de esconder os itens — antes, ela peneiraria o ' +
      'estado anterior e o título sobreviveria por um ciclo', { chamada: iC, filtro: iF });
  });

  /* ONLINE É VERDE, e o âmbar/vermelho continuam vencendo. O `:not()` está lá porque
     as três regras têm a mesma especificidade: sem ele quem chegasse por último venceria,
     e o chip ficaria verde com lançamento preso na fila. */
  ok(/\.lateral__pe \.chip:not\(\.alerta\):not\(\.off\)\{[^}]*color:var\(--verde\)/.test(css),
    'o estado da rede nasce VERDE quando está tudo bem — a cor diz antes de a pessoa ler');
  ok(/:not\(\.alerta\):not\(\.off\)/.test(css),
    'e o âmbar e o vermelho continuam vencendo, por especificidade e não por ordem');

  /* AS INICIAIS EM ROXO, com o ponto verde ao lado. */
  ok(/\.avatar\{[^}]*color:var\(--roxo-txt\)/.test(css),
    'as iniciais do círculo são roxas, na cor da marca');
  ok(/\.avatar \.ponto\{[^}]*background:var\(--verde\)/.test(css),
    'e o ponto de estado ao lado delas é verde');

  /* DOIS AZUIS: um mais claro e um mais escuro. */
  function bri(hex) {
    var m = new RegExp('\\' + hex + ':\\s*(#[0-9a-fA-F]{6})').exec(css);
    if (!m) return null;
    var h = m[1];
    return parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  }
  ok(bri('--campo') < bri('--bg') && bri('--bg') < bri('--surface'),
    'são dois azuis em volta do chão: o cartão SOBE um degrau e o campo DESCE um — o ' +
    'que se preenche afunda, o que se lê salta',
    { campo: bri('--campo'), chao: bri('--bg'), cartao: bri('--surface') });
})();

console.log('\n== Movimentos no celular: cartão, folha de ações e filtros ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* A TABELA TEM ONZE COLUNAS E TRÊS BOTÕES POR LINHA. No telefone são dezenas de alvos
     de toque numa tela que só se lê arrastando de lado — e o do meio é "cancelar",
     vizinho de "excluir". */
  ok(/if \(emCartoesPainel\(\)\) \{[\s\S]{0,200}barraOrdemMov\(L\)\+cartoesMov\(L\)/
    .test(adm),
    'no celular a lista de Movimentos vira cartão, no MESMO corte de 1024px das outras ' +
    'telas');
  /* Dentro do RECORTE de `cartoesMov`, e não no arquivo inteiro: `barraOrdemMov` também
     chama `Q.agruparLancamentos`, e respondia pela chamada que monta os cartões —
     arrancada dali, a afirmação continuava passando. */
  var iCM = adm.indexOf('function cartoesMov(lista)');
  var cartoes = adm.slice(iCM, adm.indexOf('\n  function cartaoMov', iCM));
  ok(/function cartaoMov\(g\)/.test(adm) && /Q\.agruparLancamentos\(lista\)/.test(cartoes),
    'e o cartão é a REMESSA, agrupada pelo lote que o servidor manda', cartoes.slice(0, 90));

  /* AS TRÊS AÇÕES NUMA FUNÇÃO CADA. Elas eram escritas dentro da ligação dos botões da
     tabela; copiadas para a folha, a confirmação escrita do excluir sairia de dois
     lugares, e o dia em que uma mudasse a outra ficaria como estava. */
  ['acaoCorrigir', 'acaoCancelar', 'acaoExcluir'].forEach(function (f) {
    ok(new RegExp('function ' + f + '\\(m\\)').test(adm),
      'a ação ' + f + ' tem função própria, fora da ligação dos botões');
  });
  var iFolha = adm.indexOf('function abrirAcoesDoLote(lote)');
  var folha = adm.slice(iFolha, adm.indexOf('\n  /* ---------- as folhas', iFolha));
  ok(iFolha > 0 && folha.length > 700, 'a folha de ações tem corpo', folha.length);
  ['acaoCorrigir', 'acaoCancelar', 'acaoExcluir'].forEach(function (f) {
    ok(folha.indexOf(f) > 0, 'e a folha do celular chama a MESMA ' + f);
  });
  ok(/EXCLUIR este lançamento de/.test(adm) &&
     (adm.match(/EXCLUIR este lançamento de/g) || []).length === 1,
    'a confirmação escrita do excluir existe UMA vez — duas, e uma delas envelhece');

  /* O CONTEXTO ANTES DAS OPÇÕES. No celular o cartão sai da vista quando a folha sobe:
     sem dizer em qual movimento se está mexendo, a pessoa confirma de memória. */
  ok(folha.indexOf('ctx.textContent') < folha.indexOf('corpo.innerHTML'),
    'a folha diz QUAL movimento antes de oferecer o que fazer com ele');
  ok(/g\.situacao\+' · '\+Q\.dataBR\(g\.dataRef\)/.test(folha),
    'e o contexto traz situação, data, rota e quantidade', folha.slice(0, 80));

  /* OS FILTROS SÃO O MESMO NÓ nas duas larguras. Duas cópias seriam dois ids iguais, e
     `getElementById` leria sempre o primeiro: a tela filtraria pelo que a outra tem. */
  ['mvOrigem', 'mvDestino', 'mvTipo', 'mvCaixa', 'mvStatus', 'mvUsuario', 'mvDe', 'mvAte']
    .forEach(function (id) {
      ok((adm.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1,
        'o filtro ' + id + ' existe UMA vez no documento');
    });
  ok(/\.filtros-caixa\{position:fixed/.test(css) && /\.filtros-caixa\.aberta\{display:flex\}/.test(css),
    'a caixa de filtros vira folha no celular, e continua bloco comum no computador');
  ok(/@media \(max-width:1023px\)\{[\s\S]{0,900}\.filtros-caixa\{position:fixed/.test(css),
    'e isso vale só abaixo de 1024px');

  /* ESCONDER SEM DIZER é o defeito que este projeto mais persegue: com a folha fechada,
     a lista recortada passaria por lista inteira. */
  ok(/function pintarFiltrosMov\(\)/.test(adm) && /id="mvAplicados"/.test(adm),
    'o que está recortando a lista aparece em pílulas, com o X para tirar cada uma');
  /* E as pílulas saem da LISTA de filtros aplicados. Existir a função e a caixa não
     garante que ela desenhe alguma coisa: com `[].map(...)` a caixa fica vazia e a
     afirmação de cima continuava passando. */
  ok(/cx\.innerHTML = l\.map\(function\(f\)\{/.test(adm),
    'e elas saem da lista do que está aplicado, não de uma lista vazia');
  ok(/data-tirar="'\+f\.id\+'"/.test(adm) && /el\.value = b\.dataset\.tirar === 'mvTeste'/.test(adm),
    'cada pílula sabe qual campo ela limpa — e o recorte de ensaio volta para "só ' +
    'reais", que é o estado que aquele seletor tem');
  ok(/chip\.style\.display = l\.length \? '' : 'none'/.test(adm),
    'e o número no botão só aparece quando há filtro — um "0" pendurado promete que há ' +
    'o que ver');
  /* O PERÍODO PADRÃO NÃO É FILTRO. Sempre preenchido, ele faria o botão dizer "2" desde
     o primeiro segundo, com duas pílulas que ninguém escolheu. */
  ok(/if \(id === 'mvDe' && el\.value === padrao\.de\) return;/.test(adm) &&
     /if \(id === 'mvAte' && el\.value === padrao\.ate\) return;/.test(adm),
    'o período padrão não conta como filtro aplicado');
  ok(/function periodoPadraoValores\(\)/.test(adm) &&
     (adm.match(/d1\.setDate\(d1\.getDate\(\) - 30\)/g) || []).length === 1,
    'e a conta do padrão mora num lugar só — em dois, mudar de 30 para 15 dias faria a ' +
    'barra acusar um recorte que ninguém escolheu');
  ok(/pintarFiltrosMov\(\);/.test(adm) &&
     adm.indexOf('pintarFiltrosMov();') > adm.indexOf('desenharMovimentos();'),
    'a pintura das pílulas sai do MESMO lugar que recarrega a lista — espalhada, a ' +
    'pílula sobra depois de o filtro sair');

  /* A CHAVE DO LOTE é uma só. Escrita duas vezes, a linha sem lote era agrupada por id e
     procurada por lote: o botão de ações não abria nada, e sem erro no console. */
  ok(/function chaveDoLote\(m\)/.test(js),
    'a chave que junta as linhas de uma remessa mora no `app.js`');
  ok(/var chave = chaveDoLote\(m\);/.test(js),
    'o agrupamento usa ela');
  ok(/Q\.chaveDoLote\(x\) === String\(lote\)/.test(adm),
    'e a folha de ações acha as linhas do cartão pela MESMA chave');

  /* TRÊS SAÍDAS da folha: o X, o véu e o Esc. Só o X, e quem abre o teclado fica preso. */
  ok(/veu\.addEventListener\('click', fecharFolhas\)/.test(adm) &&
     /\[data-fechar-folha\]/.test(adm) &&
     /e\.key === 'Escape'\) fecharFolhas\(\)/.test(adm),
    'a folha fecha pelo X, pelo véu e pelo Esc');
})();

console.log('\n== Painel de Ativos: relógio, busca, atalhos e o que está sendo contado ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  /* ---- EM TODOS OS MÓDULOS, e não só no painel ---------------------------
   * A faixa nasceu dentro do `admin.html`, e por isso existia nas sete páginas do
   * escritório e em NENHUMA do app de campo — quem está no pátio, que é justamente
   * quem precisa saber se vai chover, era quem não via. */
  ok(/function relogioETempo\(\)/.test(js) && /relogioETempo: relogioETempo,/.test(js),
    'o relógio e o tempo moram no `app.js`, e os dois apps alcançam pelo `Q`');
  /* SEM OS COMENTÁRIOS: pego numa sabotagem — a chamada foi comentada com `//` e esta
     afirmação continuou verde, porque o texto dela ainda estava no arquivo. */
  ok(/Q\.relogioETempo\(\);/.test(semComentarios(adm)) &&
     /Q\.relogioETempo\(\);/.test(semComentarios(idx)),
    'e OS DOIS o chamam — o do escritório e o do galpão');
  ok(!/class="tempo"/.test(adm) && !/class="tempo"/.test(idx),
    'e nenhum dos dois traz a marcação escrita à mão: duas cópias da mesma estrutura ' +
    'em arquivos diferentes divergem, e a do app menos olhado é a que apodrece');
  /* NO `.cab-pagina`, e não dentro de uma página. O cabeçalho é um só para o app
     inteiro e fica FORA do `.corpo-pagina`, que é quem troca de conteúdo — por isso a
     faixa aparece em todos os módulos sem ser remontada a cada troca de aba. */
  ok(/var cab = document\.querySelector\('\.cab-pagina'\);/.test(js),
    'ela se monta no cabeçalho da página, que fica FORA do corpo que troca — dentro de ' +
    'uma `.pagina` ela existiria só naquele módulo');
  ok(/if \(!cab \|\| cab\.querySelector\('\.tempo'\)\) return null;/.test(js),
    'e chamar duas vezes não empilha duas faixas — medido: a segunda chamada devolve ' +
    '`null` e o documento continua com uma');
  /* AS REFERÊNCIAS SAEM DA PRÓPRIA CAIXA. O app de campo já teve dois elementos com o
     mesmo id — `marcaNome`, na barra e na gaveta — e a busca global entregou o errado. */
  ok(!/document\.getElementById\('tempo/.test(js) &&
     /caixa\.querySelector\('\.tempo__t'\)/.test(js),
    'e as peças saem de dentro da faixa, não de uma busca global por id');

  /* ---- o relógio é o do GALPÃO ------------------------------------------- */
  ok(/var FUSO_OPERACAO = 'America\/Recife';/.test(js) &&
     (js.match(/var FUSO_OPERACAO =/g) || []).length === 1,
    'o fuso da operação mora num lugar só — dois números iguais em arquivos diferentes ' +
    'divergem no dia em que um deles mudar');
  ok(/nome: 'Recife', lat: -8\.0632, lon: -34\.8926, fuso: FUSO_OPERACAO/.test(js) &&
     (js.match(/var UNIDADE =/g) || []).length === 1,
    'e a unidade também: um lugar só para trocar de cidade, valendo para os dois apps');
  /* AS DUAS, e contadas: a data ficou no fuso certo e a HORA voltou para o relógio da
     máquina, e a afirmação continuava verde achando a outra. */
  /* AS DUAS LINHAS, nomeadas. Contar as ocorrências de `timeZone: UNIDADE.fuso` já
     serviu, e deixou de servir quando a hora do "lido às" e o `ehDia()` passaram a usar
     o mesmo fuso: a conta subiu para quatro e a afirmação ficou vermelha por uma
     mudança que não era a que ela cobra. Agora ela olha as duas chamadas que importam. */
  ok(/\{ weekday: 'short', day: 'numeric', month: 'short', timeZone: UNIDADE\.fuso \}/.test(js) &&
     /\{ hour: '2-digit', minute: '2-digit', timeZone: UNIDADE\.fuso \}/.test(js),
    'a data E a hora saem no fuso da unidade: quem confere de outro estado precisa ler ' +
    'a hora do galpão, senão "lançado às 17h" muda de significado');
  /* REAGENDA em vez de `setInterval`: intervalo acumula atraso e o relógio pula
     segundos num painel que fica aberto o dia inteiro. */
  /* SEM SEGUNDOS, na virada do MINUTO. Eles serviam de sinal de que o app estava vivo;
     hoje quem dá esse sinal é a luz que desce pela barra, e nada no sistema precisa
     deles — a janela da correção conta dez MINUTOS. */
  ok(!/second: '2-digit'/.test(js),
    'o relógio não mostra segundos: um temporizador por segundo num aparelho de galpão ' +
    'é trabalho que ninguém pediu, e a janela da correção conta em minutos');
  /* CONTADAS, e a ausência do outro jeito cobrada junto. O agendador da SAUDAÇÃO tem o
     mesmo texto, e a afirmação escrita só como "existe a conta do minuto" passava
     verde com o relógio voltando a bater de segundo em segundo — a saudação respondia
     por ele. Pego na sabotagem; é a mesma família de sempre. */
  ok((js.match(/\(60 - a\.getSeconds\(\)\) \* 1000 - a\.getMilliseconds\(\)/g) || []).length === 2,
    'e o relógio E a saudação se reagendam para a virada do minuto — `setInterval` ' +
    'fixo acumula atraso e a virada chega depois da hora');
  ok(!/1000 - \(Date\.now\(\) % 1000\)/.test(js),
    'e nada mais se reagenda de segundo em segundo: era o relógio, e ele não precisa ' +
    'mais — quem diz que o app está vivo é a luz que desce pela barra');
  ok(/if \(document\.hidden\) clearTimeout\(tique\);/.test(js),
    'e para com a aba escondida — painel de galpão fica aberto o dia inteiro');
  /* NA REGRA DO RELÓGIO: a tabela numérica já usava `tabular-nums` noutra linha, e era
     ela que respondia por esta afirmação. */
  ok(/\.tempo__hora\{[^}]*font-variant-numeric:tabular-nums/.test(css),
    'os dígitos do relógio têm largura fixa: sem isso ele "respira" a cada segundo');

  /* SEM VALOR DE MENTIRA. O modelo trazia uma temperatura fixa no código para
     demonstrar sem internet; num painel publicado isso é um número inventado que
     ninguém desconfia. */
  ok(!/TEMPO_FIXO/.test(js),
    'não há temperatura fixa no código — número inventado no lugar do que não carregou ' +
    'é pior que o campo vazio');
  ok(/\.tempo--sem \.tempo__g\{color:var\(--txt3\)\}/.test(css) &&
     /elT\.classList\.add\('tempo--sem'\);/.test(js),
    'sem resposta, o grau fica apagado em "--°" e a hora continua: relógio que depende ' +
    'de internet é pior que relógio nenhum');
  /* ---- A SAUDAÇÃO PELO HORÁRIO ------------------------------------------
   * "Bom dia" no lugar de "Olá": custa o mesmo espaço e diz que a tela sabe que horas
   * são — num app aberto o dia inteiro, é o sinal mais discreto de que ele não
   * congelou às 8h da manhã. */
  ok(/function saudacaoDe\(h\)/.test(js) && /saudacaoDe: saudacaoDe,/.test(js),
    'a saudação muda com a hora, e mora no `app.js` — vale para os dois apps');
  ok(/id="olaSaudacao"/.test(adm) && /id="olaSaudacao"/.test(idx),
    'e os dois apps têm o lugar dela');
  /* A TABELA INTEIRA, e não uma hora de amostra. As três faixas e as duas viradas —
     medido: 0h boa noite, 7h bom dia, 13h boa tarde, 20h boa noite. */
  /* O RECORTE POR CHAVES, e não por índice de texto. Fatiado até o primeiro `}`
     depois de uma linha escolhida a dedo, o recorte quebrava quando a função mudava de
     forma — e a bancada estourava com `SyntaxError` em vez de reprovar a regra. Erro de
     bancada lido como defeito do código é o pior tipo de teste verde. */
  function fn(nome) {
    var i = js.indexOf('function ' + nome + '('), k = js.indexOf('{', i), n = 0;
    do { if (js[k] === '{') n++; else if (js[k] === '}') n--; k++; } while (n > 0 && k < js.length);
    return js.slice(i, k);
  }
  var saud = new Function(fn('saudacaoDe') + ' return saudacaoDe;')();
  ok(saud(5) === 'Bom dia,' && saud(11) === 'Bom dia,' &&
     saud(12) === 'Boa tarde,' && saud(17) === 'Boa tarde,' &&
     saud(18) === 'Boa noite,' && saud(4) === 'Boa noite,' && saud(0) === 'Boa noite,',
    'e as viradas caem na hora certa: 5h, 12h e 18h — "boa tarde" às 18h01 é o tipo ' +
    'de erro que ninguém reporta e todo mundo nota');
  /* O FUSO DA OPERAÇÃO, e não o do aparelho. Celular de galpão com fuso errado veria
     "bom dia" às 22h — e a saudação errada anuncia que o relógio da tela não vale
     nada, sendo que é o MESMO relógio que decide o dia do lançamento. */
  ok(/timeZone: FUSO_OPERACAO, hour: '2-digit', hour12: false/.test(js),
    'e a hora dela sai do fuso da operação, como a do relógio');
  ok(/return h === 24 \? 0 : h;/.test(js),
    'e meia-noite vindo como "24" vira 0 — sem isso `24 >= 18` daria "boa noite" por ' +
    'acidente às 00h, e a virada das 00h30 já erraria');
  ok(/if \(el\.textContent !== t\) el\.textContent = t;/.test(js),
    'e ela só toca no DOM quando muda — reescrever o mesmo texto a cada minuto ' +
    'atrapalha quem estiver com ele selecionado');
  ok(/function agendarSaudacao\(\)/.test(js) && /agendarSaudacao\(\);   \/\* a virada/.test(js),
    'e vira sozinha no minuto cheio: quem deixa o painel aberto vê "Boa tarde" virar ' +
    '"Boa noite" às 18h sem recarregar');

  /* ---- A FAIXA SOBE, NO CELULAR ------------------------------------------
   * Ela é contexto do AMBIENTE — que horas são, como está o tempo lá fora —, e não da
   * página. Entre o título e o formulário, separava duas coisas que se leem juntas.
   * No computador fica onde está: lá é uma pílula no canto do cabeçalho, ao lado do
   * título, e não uma faixa atravessada no meio. */
  ok(/@media \(max-width:1023\.98px\)\{ \.cab-pagina \.tempo\{order:-1;width:100%\} \}/.test(css),
    'no celular a faixa de tempo sobe para ACIMA de "Operação" — medido a 390px: ' +
    'faixa em 18px, "Operação" em 58');
  ok(!/<div class="tempo"/.test(adm) && !/<div class="tempo"/.test(idx),
    'e é `order`, não uma segunda posição no HTML: a faixa é montada uma vez só, e dois ' +
    'lugares no documento seriam dois elementos para divergirem');

  /* ---- A ESTRADA DA LINHA DO TÍTULO --------------------------------------
   * Saída e Retorno são telas gêmeas — mesmos campos, mesmas travas, mesmo botão. A
   * única coisa que as distingue é o SENTIDO do movimento, e quem abre a errada percebe
   * pela cor e pela direção antes de ler o título. */
  ok(/function pintarEstrada\(pagina\)/.test(js) && /pintarEstrada\(botao\.dataset\.pagina\);/.test(js),
    'a estrada entra na linha do título, e quem decide é a PÁGINA aberta');
  ok(/pgSaida: +\{ volta: false, cor: 'var\(--verde\)', cheios: 4/.test(js) &&
     /pgDevolucao: \{ volta: true, +cor: 'var\(--azul\)', +cheios: 2/.test(js),
    'verde indo na saída, azul voltando no retorno — medido: 4 baús cheios numa, 2 na ' +
    'outra, e o caminhão do retorno espelhado');
  /* SÓ NESSAS DUAS. Movimento que não informa é ruído, e uma faixa animada ao lado de
     "Cadastros" não diria nada. Medido em `pgSaldo`: nenhuma estrada. */
  ok(/var e = ESTRADAS\[pagina\];\s*if \(!e\) return;/.test(js),
    'e nas outras páginas ela some da tela — movimento que não informa é ruído');
  /* AS DUAS CLASSES NA VOLTA. Quem desenha o asfalto tracejado é o `::after` do
     `.desenho--pista`; o `.desenho--volta` sozinho só INVERTE a direção dele — e
     inverter o nada dá nada. Posto como alternativa, o retorno ficou com o caminhão
     andando sobre estrada nenhuma, e foi assim que foi ao ar.
     Medido agora nas duas: asfalto presente, `normal` na saída e `reverse` na volta. */
  ok(/'desenho desenho--titulo desenho--pista' \+\s*\(e\.volta \? ' desenho--volta' : ''\)/.test(js),
    'o retorno leva as DUAS classes da estrada — `desenho--volta` sozinho não tem ' +
    'asfalto para inverter, e o caminhão andava sobre estrada nenhuma');
  /* A REGRA DO OUTRO LADO, para a afirmação acima não depender só da forma de escrever:
     é o `.desenho--pista::after` que tem o desenho, e o `--volta` só a direção. */
  ok(/\.desenho--pista::after\{content:""[^}]*repeating-linear-gradient/.test(css) &&
     /\.desenho--volta::after\{animation-direction:reverse\}/.test(css),
    'e é mesmo o `--pista` que desenha: o `--volta` só tem a direção');

  ok(/var velha = linha\.querySelector\('\.desenho'\);\s*if \(velha\) velha\.remove\(\);/.test(js),
    'e trocar de página tira a anterior: sem isso, ir de Saída para Retorno deixaria os ' +
    'dois caminhões correndo em sentidos opostos na mesma linha');
  /* UM CAMINHÃO SÓ, no `app.js`. Ele nasceu no painel e o app de campo precisou do
     mesmo desenho — copiá-lo seria manter dois que divergem na primeira mexida. */
  ok(/function caminhao\(cheios\)/.test(js) && /caminhao: caminhao,/.test(js) &&
     !/function caminhao\(/.test(adm),
    'e o desenho do caminhão mora num lugar só, de onde os dois apps o pegam');
  ok(/\.cab-pagina__rota\{display:flex;align-items:flex-end/.test(css) &&
     /\.desenho--titulo\{flex:1 1 auto;min-width:0/.test(css),
    'o título toma o que precisa e a estrada fica com a sobra — é o que faz o caminhão ' +
    'nascer na borda da palavra em vez de correr num quadro de largura arbitrária');
  ok(/\.desenho--titulo\.desenho--pista \.caminhao\{animation-duration:30s;animation-delay:-11s\}/.test(css),
    'e ela corre em 30s, não nos 13 dos cartões: atravessa a largura da tela, e no ' +
    'mesmo tempo o caminhão pareceria correndo em vez de carregado');
  /* ATRASO NEGATIVO: com 30s de travessia e começo do zero, quem abre a tela fica onze
     segundos olhando estrada vazia — e conclui que o desenho está quebrado. */
  ok(/\.desenho--titulo\.desenho--volta \.caminhao\{[^}]*animation-delay:-11s\}/.test(css),
    'e nasce no MEIO do caminho: começando do zero, a tela abre com onze segundos de ' +
    'estrada vazia, que se lê como desenho quebrado');
  /* A PAUSA DA ESTRADA, pela mesma regra do resto: classe que LIGA. */
  ok(/\.cab-pagina\.parado \.desenho--titulo \*/.test(css) &&
     /cab\.classList\.toggle\('parado', document\.hidden\);/.test(js),
    'e a aba escondida para a estrada — pela classe que liga a pausa, nunca pela que ' +
    'falta');

  /* ---- A CONTA DENTRO DA PÍLULA DO TEMPO ---------------------------------
   * Uma moldura só, em vez de duas arredondadas encostadas no mesmo canto. A conta, o
   * tempo e a hora se separam pela MESMA divisória que já separava tempo de hora. */
  ok(/class="tempo__conta" id="tempoConta"/.test(js) &&
     /function pintarContaTopo\(\)/.test(js),
    'no computador a conta mora DENTRO da pílula do tempo, e não numa moldura ao lado');
  /* DOIS INTERRUPTORES, e cada um responde por uma coisa: a LARGURA decide se cabe, a
     SESSÃO decide se há o que mostrar. Medido: visível a 1440 e a 1100px, escondida a
     390 — onde a barra do app já tem a foto e a saudação numa linha própria. */
  ok(/\.tempo__conta,\.tempo__div--conta\{display:none\}/.test(css) &&
     /@media \(min-width:1024px\)\{[\s\S]{0,200}\.tempo\.tem-conta \.tempo__conta\{display:flex\}/.test(css),
    'e ela só aparece no computador — no celular seria a segunda vez que a mesma foto ' +
    'e a mesma saudação apareceriam, num espaço que não sobra');
  ok(/faixa\.classList\.toggle\('tem-conta', !!nome\);/.test(js),
    'e só quando há nome: "Olá, —" dentro da moldura do tempo é pior que a pílula sem ' +
    'a conta');
  ok(/\.tempo\.tem-conta \.tempo__div--conta\{display:block\}/.test(css),
    'e a divisória dela acompanha — sozinha, sobraria um risco solto antes do ícone');
  /* SÓ O PRIMEIRO NOME aqui, e o inteiro no balão: a pílula divide a largura com o
     tempo e o relógio. Na barra do celular, que tem uma linha inteira, continua o nome
     completo — dois lugares, dois orçamentos de largura. */
  ok(/var primeiro = nome \? String\(nome\)\.trim\(\)\.split\([^)]*\)\[0\]/.test(js) &&
     /cx\.title = nome \+/.test(js),
    'e mostra o primeiro nome com o inteiro no balão — medido: "Boa noite, Natanael" ' +
    'com as iniciais NS no círculo');
  ok(/\.tempo__conta:hover\{background:var\(--surface-2\)\}/.test(css) &&
     /\.tempo__conta\{[^}]*cursor:pointer\}/.test(css),
    'e sem borda própria ela ganha fundo ao passar o mouse: era a borda que dizia ' +
    '"isto aqui se toca", e ela saiu');
  ok(/@media \(max-width:1180px\)\{ \.tempo__quem\{display:none\}/.test(css),
    'e em tela média fica só a foto, para não espremer o relógio');
  /* AS PEÇAS SAEM DA FAIXA, e não de `getElementById`. A regra vale para esta função
     também — ela roda fora do fecho que montou a faixa, e foi por aí que a busca global
     voltou a entrar. */
  ok(/var cx = faixa && faixa\.querySelector\('\.tempo__conta'\);/.test(js) &&
     !/getElementById\('tempoConta'\)/.test(js),
    'e ela também procura DENTRO da faixa, não por id no documento inteiro');
  /* OS DOIS LUGARES DA SAUDAÇÃO. Hoje `.topo` e a pílula nunca aparecem juntos, mas
     escrever num id fixo é o que a deixaria congelada no outro se um dia aparecessem. */
  ok(/document\.getElementById\('olaSaudacao'\),\s*document\.querySelector\('\.tempo \.tempo__ola'\)/.test(js),
    'e a saudação pinta os DOIS lugares: a barra do app e a pílula');

  /* ---- DUAS FONTES DE TEMPO, EM CADEIA ----------------------------------
   * MEDIDO, e não suposto: as duas respondem com `Access-Control-Allow-Origin: *`, e
   * consultadas no mesmo minuto para Recife CONCORDARAM — WMO 2 e WWO 116 são o mesmo
   * "sol entre nuvens". Reserva que discorda da principal é pior que reserva nenhuma. */
  ok(/nome: 'Open-Meteo'/.test(js) && /nome: 'wttr\.in'/.test(js) &&
     /function tentarTodas\(i\)/.test(js),
    'o tempo tem DUAS fontes em cadeia — a faixa deixa de depender de um serviço só');
  ok(/return pedirA\(ordemFontes\[i\]\)\.catch\(function \(\) \{ return tentarTodas\(i \+ 1\); \}\);/.test(js),
    'e falhando a primeira ela tenta a seguinte, em vez de desistir — medido: com a ' +
    'Open-Meteo caída, o wttr.in respondeu e a faixa pintou');
  ok(/ordemFontes\.sort\(function \(a, b\) \{/.test(js),
    'e a que respondeu vai para a frente da fila: insistir na que acabou de cair é ' +
    'gastar os 8s do corte antes de chegar na que funciona');
  /* O WWO VIRA WMO. Cada fonte traduz para o MESMO formato, senão os desenhos e a
     tabela de palavras precisariam conhecer o vocabulário de cada serviço. */
  ok(/var WWO_WMO = \{/.test(js) && /WWO_WMO\[w\] != null \? WWO_WMO\[w\] : 3/.test(js),
    'e o vocabulário do wttr.in é convertido para WMO na própria fonte — código ' +
    'desconhecido cai em nublado, que é a resposta que não promete nem assusta');
  /* O RECUO. Tentar de 30 em 30 segundos numa rede caída é bater na porta de quem não
     está em casa — e são duas fontes por tentativa. */
  ok(/agendarBusca\(Math\.min\(30000 \* Math\.pow\(2, falhas - 1\), RITMO_MAX\)\);/.test(js),
    'e falhando ela recua — 30s, 1min, 2min, 4min… até o teto, em vez de martelar');
  ok(/falhas = 0;/.test(js) && /agendarBusca\(RITMO_OK\);/.test(js),
    'e voltando a responder, o recuo zera');
  ok(/if \(!document\.hidden\) buscar\(\);/.test(js) &&
     /window\.addEventListener\('online', buscar\);/.test(js),
    'e busca de novo ao voltar para a aba e quando a internet volta — são os dois ' +
    'momentos em que o dado está mais velho E alguém está olhando');
  ok(/if \(!window\.fetch \|\| buscando\) return;/.test(js),
    'e duas buscas nunca correm juntas: voltar para a aba com uma consulta em curso ' +
    'empilharia as duas e a mais velha poderia pintar por último');

  /* ---- A CONDIÇÃO EM PALAVRAS ------------------------------------------- */
  ok(/65: \['chuvaforte', 'chuva forte'/.test(js) && /51: \['garoa', +'garoa fraca'/.test(js),
    'os graus de intensidade viram palavras DIFERENTES — a tabela antiga dizia "chuva" ' +
    'de 51 a 82, e garoa e chuva forte mudam a decisão de quem carrega caminhão');
  /* A PALAVRA SAIU DA LINHA, a pedido, e ficou só no balão. O argumento que a tinha
     posto lá continua valendo — um desenho de 28px não distingue garoa de chuva forte.
     O que pesou contra foi a LARGURA: com grau, palavra e cidade na mesma linha, a
     cidade era a primeira a cortar, e é ela que diz DE ONDE é o tempo mostrado.
     Esta asserção cobra as duas metades — que a peça da linha não voltou, e que a
     palavra não se perdeu no caminho: sair da tela E sair do balão seria jogar fora a
     tabela de intensidades inteira sem ninguém perceber. */
  ok(!/tempo__cond/.test(semComentarios(js)) && !/tempo__cond/.test(semComentarios(css)),
    'a condição em palavras não ocupa mais a linha: ali a cidade cortava primeiro, e ' +
    'tempo certo da cidade errada é pior que tempo vago da certa');
  ok(/caixa\.title = d\[1\] \+ ' em ' \+ UNIDADE\.nome/.test(js),
    'e ela continua no balão, com a cidade e a hora da leitura — a tabela de ' +
    'intensidades segue inteira, só mudou de lugar');

  /* ---- O LOCAL DE VERDADE, PELO GPS -------------------------------------
   * "Recife" é o município do meio de uma região metropolitana. Medido daqui nos dois
   * pontos: a consulta devolve "Recife" para a Ilha do Leite e "São Lourenço da Mata"
   * para um ponto a 20km — que é exatamente a diferença que o rótulo fixo apaga. */
  ok(/function ondeEstou\(\)/.test(js) &&
     /navigator\.geolocation\.getCurrentPosition\(/.test(js),
    'o tempo pode ser lido na coordenada de quem está olhando, e não só na do galpão');
  /* NÃO PEDE NADA SOZINHO — e é isto que a asserção precisa provar, não a existência
     da função. O caminho que pede é `getCurrentPosition`, e o único lugar de onde ele
     pode partir sem toque é a permissão JÁ concedida, que `permissions.query` responde
     sem abrir janela nenhuma. Janela de GPS na cara de quem só abriu a tela é o tipo
     de coisa que faz a pessoa fechar e não voltar. */
  /* E ESTA É A ASSERÇÃO QUE PRECISA MEDIR O EFEITO, não a regra: escrever o desvio
     de `permissions.query` não impede ninguém de chamar `usarGPS()` uma linha acima e
     abrir a janela do mesmo jeito — foi exatamente assim que a versão anterior desta
     asserção passou sabotada, com o desvio intacto dentro de um `if (false)`.
     O que ela cobra agora é a LISTA FECHADA de quem pode chamar: o desvio do
     `granted`, o clique e a tecla. Qualquer quarta chamada — em qualquer lugar do
     arquivo — derruba, porque toda chamada que não parte de um gesto nem de uma
     permissão já concedida é uma janela de GPS na cara de quem só abriu a tela. */
  var chamaGPS = semComentarios(js).split('\n')
    .filter(function (l) {
      return /usarGPS\(\)/.test(l) && !/function usarGPS\(\)/.test(l);
    });
  ok(/navigator\.permissions\.query\(\{ name: 'geolocation' \}\)/.test(js) &&
     /if \(st\.state === 'granted'\) usarGPS\(\)\.catch\(oferecerGPS\);\s*\n\s*else oferecerGPS\(\);/.test(js) &&
     chamaGPS.length === 3 && chamaGPS.every(function (l) {
       return /st\.state === 'granted'/.test(l) ||
              /addEventListener\('click'/.test(l) ||
              /e\.preventDefault\(\);/.test(l);
     }),
    'e ele não é pedido sozinho: as ÚNICAS três chamadas são a permissão já ' +
    'concedida, o clique e a tecla — o resto recebe um convite que pode ignorar');
  ok(/function oferecerGPS\(\)/.test(js) &&
     /elLocal\.setAttribute\('tabindex', '0'\);/.test(js) &&
     /if \(e\.key === 'Enter' \|\| e\.key === ' '\)/.test(js),
    'e o convite é alcançável pelo teclado — sem isso ele existe só para quem tem ' +
    'mouse ou dedo na tela');
  ok(/\.tempo__loc \.pode-gps\{[^}]*cursor:pointer/.test(css) &&
     /\.tempo__loc \.pode-gps::after\{[^}]*height:24px/.test(css),
    'e ele PARECE tocável sem virar botão, com alvo de 24px: 11px de texto é menos ' +
    'da metade do mínimo, e quem usa isso está de luva');
  /* DUAS FONTES DE NOME, as duas medidas daqui. O Nominatim ficou de fora de propósito:
     com cabeçalho `Origin` — o que todo navegador manda — ele devolve 403. Reserva que
     nunca pode ser exercitada é pior que reserva nenhuma, porque parece que existe. */
  ok(/api\.bigdatacloud\.net\/data\/reverse-geocode-client/.test(js) &&
     /d\.nearest_area && d\.nearest_area\[0\]/.test(js),
    'o nome do lugar tem duas fontes: a que distingue município, e o `nearest_area` ' +
    'da MESMA resposta que já traz o grau — sem domínio novo');
  ok(!/nominatim/i.test(semComentarios(js)),
    'e a reserva óbvia ficou de fora medida: o Nominatim devolve 403 para requisição ' +
    'com `Origin`, e reserva que nunca pode rodar só parece que existe');
  /* O RELÓGIO NÃO SEGUE O GPS. A hora é a da OPERAÇÃO — é ela que decide se um
     lançamento é de hoje e é por ela que a janela de dez minutos da correção conta. */
  ok(/UNIDADE\.lat = p\.lat; UNIDADE\.lon = p\.lon;/.test(js) &&
     !/UNIDADE\.fuso *=/.test(js),
    'e o GPS move a COORDENADA e nunca o fuso: a hora continua sendo a da operação, ' +
    'que é quem decide o dia do lançamento');
  /* O PIOR DESFECHO DESTE RECURSO seria o rótulo trocar para a cidade nova com o grau
     da antiga ainda na tela — tempo errado com etiqueta convincente. */
  ok(/ultima = null;\s*\n\s*elGrau\.textContent = '--°';\s*\n\s*elT\.classList\.add\('tempo--sem'\);/.test(js),
    'e ao trocar de lugar o grau volta para "--°": o número da cidade velha sob o ' +
    'nome da nova é mentira com cara de dado');
  /* E A BUSCA QUE ESTÁ NO AR responde pela coordenada VELHA: sem virar a geração, ela
     chegaria depois e repintaria o grau antigo por cima do novo. O `buscando` sozinho
     só a faria ser ignorada na IDA, não na volta. */
  /* OS TRÊS DESFECHOS da busca vencida precisam ser cobrados SEPARADAMENTE: um
     `if (minha !== geracao)` solto no arquivo respondia pelos três, e apagar dois
     deles passava. Ela pode voltar com sucesso (e repintar o grau velho), voltar com
     erro (e recuar o ritmo por culpa de uma consulta que não interessa mais) ou
     apenas terminar (e liberar o `buscando` de uma busca que ainda está no ar). */
  ok(/var minha = geracao;/.test(js) && /geracao\+\+;/.test(js) &&
     /\.then\(function \(v\) \{\n +if \(minha !== geracao\) return;/.test(js) &&
     /\.catch\(function \(\) \{\n +if \(minha !== geracao\) return;\n +falhas\+\+;/.test(js) &&
     /\.then\(function \(\) \{ if \(minha === geracao\) buscando = false; \}\);/.test(js),
    'e a consulta que já estava no ar é descartada nos TRÊS desfechos — ela responde ' +
    'pela coordenada velha e chegaria DEPOIS, pintando por cima da nova');

  /* ---- DIA OU NOITE, quando a fonte não diz ------------------------------
   * O wttr.in não manda `is_day`. Assumir dia mostraria SOL ÀS 22H. */
  ok(/function ehDia\(\)/.test(js) && /v\.dia == null \? ehDia\(\) : v\.dia/.test(js),
    'faltando o dia/noite na resposta, quem decide é o relógio — medido: com o ' +
    'wttr.in respondendo às 22h57, a faixa disse "noite entre nuvens"');
  ok(/return h >= 6 && h < 18;/.test(js),
    'e o corte é 6h–18h: erra por minutos duas vezes por ano, em vez de errar por ' +
    'doze horas todo dia');
  ok(/estrela\(25, 6, 2\.1, 'e1'\)/.test(js) && /\.tempo__ico \.estrela\{animation:cintilar/.test(css),
    'e a noite limpa tem estrelas, que é o que distingue o desenho dela do do dia — ' +
    'medido: três no ícone');
  ok(/\.tempo__ico \.estrela\.e2\{animation-duration:4\.8s;animation-delay:\.9s\}/.test(css),
    'e elas cintilam fora de compasso: piscando juntas leriam como alarme');

  ok(/corta\.abort\(\); \}, 8000\)/.test(js),
    'a consulta corta em 8s — uma rede que aceita a conexão e não responde deixaria a ' +
    'promessa pendurada e a próxima empilharia em cima');
  /* NO CELULAR ELE NÃO SOME: vira uma faixa de uma linha. O cartão de duas colunas
     rouba a altura de um cartão de extrato inteiro em 390px — mas esconder a informação
     para economizar espaço é outra coisa que arranjá-la em menos espaço. */
  ok(/@media \(max-width:860px\)\{[\s\S]{0,40}\.tempo\{width:100%/.test(css) &&
     !/\.tempo\{display:none\}/.test(css),
    'no celular o relógio vira uma faixa de uma linha, em vez de sumir');
  ok(/@media \(max-width:380px\)\{ \.tempo__data\{display:none\} \}/.test(css),
    'e num aparelho bem estreito sai a DATA e fica a hora — é a hora que se consulta');

  /* ---- a busca peneira na FONTE ------------------------------------------ */
  ok(/if \(b && alvoBusca\(l\)\.indexOf\(b\) < 0\) return false;/.test(adm),
    'a busca peneira dentro do `todasAsLinhas`, com os outros filtros');
  ok(/function alvoBusca\(l\)/.test(adm) && /l\.saidaTipos \|\| \[\]/.test(adm),
    'e procura no que a linha MOSTRA, inclusive o detalhe por tipo de caixa — buscar só ' +
    'no que tem seletor deixaria de fora justamente o que não tem');
  var iCh = adm.indexOf('function chato(t)');
  var fChato = adm.slice(iCh, adm.indexOf('\n\n', iCh));
  ok(iCh > 0 && /normalize\('NFD'\)/.test(fChato) && /toLowerCase\(\)/.test(fChato) &&
     fChato.indexOf("replace(/\\./g, '')") > 0,
    'achatando acento e ponto: no galpão ninguém procura acentuando, e o número na tela ' +
    'tem ponto que ninguém digita', fChato);
  ok(/FILTROS_FLUXO = \['rtOrigem', 'rtDestino', 'rtDe', 'rtAte', 'rtBusca'\]/.test(adm),
    'e ela entra na conta de "quantos filtros estão ligados" — fora dela, a tabela ' +
    'ficaria curta com o botão dizendo que não há filtro nenhum');
  ok(/espera = setTimeout\(desenharFluxo, 160\);/.test(adm),
    'a busca espera a pessoa parar de digitar: o fluxo inteiro é peneirado a cada tecla, ' +
    'e é ele que carrega os cinco indicadores junto');

  /* ---- os atalhos de período --------------------------------------------- */
  /* NA LINHA QUE CALCULA, e não no comentário que a explica: `Q.hojeOperacao()` aparece
     duas vezes no arquivo, e uma delas é a explicação logo acima. */
  ok(/function hojeOperacao\(\)/.test(js) &&
     /var hoje = Q\.hojeOperacao\(\);/.test(adm) && !/var hoje = Q\.hoje\(\);/.test(adm),
    'o atalho conta a partir do dia do GALPÃO: um atalho decide sozinho o que vai ser ' +
    'somado, e com o relógio em outro fuso mudaria de significado sem ninguém perceber');
  /* A afirmação pedia `formatToParts(new Date())` literal. O instante passou a entrar
     por parâmetro — `hojeOperacao()` virou o caso de hoje de um `diaOperacao(quando)`,
     porque comparar o carimbo de um lançamento com "hoje" exige os dois na mesma régua.
     O que ela garante não mudou: a data sai do `formatToParts`. */
  ok(/\.formatToParts\([^)]*\)\.forEach/.test(js) &&
     !/toLocaleDateString\('sv-SE'/.test(js),
    'e a data sai de `formatToParts`, não do truque de formatar num locale que por acaso ' +
    'devolve ISO — separador de locale não é contrato de ninguém');
  ok(/if \(b\.getAttribute\('aria-pressed'\) === 'true'\) \{   \/\/ desliga/.test(adm),
    'os atalhos são liga-desliga — sem isso o único caminho de volta seria "Limpar ' +
    'filtros", que apagaria origem, destino e busca junto');
  ok(/de\.value = hoje\.slice\(0, 8\) \+ '01';/.test(adm),
    '"Este mês" começa no dia 1º');

  /* ---- data invertida ----------------------------------------------------- */
  ok(/if \(de\.value && ate\.value && de\.value > ate\.value\) \{[\s\S]{0,300}inverti as duas/
    .test(adm),
    'data inicial maior que a final é avisada e invertida — sozinha, ela devolve lista ' +
    'vazia e a pessoa conclui que o período não teve movimento');

  /* ---- o que está sendo contado ------------------------------------------ */
  ok(/function escreverResumoFluxo\(lista\)/.test(adm) &&
     /escreverResumoFluxo\(lista\);/.test(adm),
    'a tela diz, em português, o que está sendo contado');
  ok(/\.resumo\{position:sticky;top:0/.test(css),
    'e a linha fica grudada: quem rola a tabela perde de vista tanto os indicadores ' +
    'quanto o botão de filtros');
  ok(/if \(!partes\.length\) \{ alvo\.hidden = true;/.test(adm),
    'sem filtro nenhum ela some — linha permanente vira paisagem, e paisagem não avisa ' +
    'nada no dia em que houver um recorte');
  /* O TOTAL É O DE ANTES DE QUALQUER FILTRO, e a comparação só aparece quando há o que
     comparar: "Contando 4 de 4" é ruído. */
  ok(/var base = \(\(\(PAINEL && PAINEL\.fluxo\) \|\| \{\}\)\.linhas \|\| \[\]\)\.filter/.test(adm),
    'o total sai do fluxo inteiro, e não da lista já peneirada');
  ok(/lista\.length === base\.length\s*\n?\s*\? '<b>'\+lista\.length/.test(adm),
    'e o "de N" só aparece quando algum filtro desta tela escondeu linhas');

  /* ---- o botão que aparecia e não limpava --------------------------------- */
  ok(!/id="btnLimparRetornos" type="button" disabled/.test(adm),
    '"Limpar filtros" não nasce desabilitado — ele passou a aparecer só quando há ' +
    'filtro, e o atributo ficou para trás: o botão surgia exatamente quando havia o ' +
    'que limpar, e não limpava nada');
  ok(/marcarAtalhoFluxo\(''\);\s*\n\s*marcarMovimentoFluxo\('todos'\);\s*\n\s*if \(tinhaData\)/
    .test(adm),
    'e limpar apaga também o atalho aceso e o recorte de movimento — senão o painel ' +
    'mostrava "7 dias" ou "Saída" ligado ' +
    'sobre um período vazio');

  /* ---- o painel de filtros cabe ------------------------------------------- */
  ok(/var caixa = pop\.closest\('\.corpo-pagina'\);/.test(adm),
    'o painel de filtros se mede contra o bloco que ROLA, e não contra a janela: é essa ' +
    'borda que recorta um elemento posicionado');
  ok(/pop\.classList\.remove\('para-baixo'\);\s*\n\s*var acima = pop\.getBoundingClientRect\(\)\.bottom - teto;/
    .test(adm),
    'e o espaço de cada lado sai da POSIÇÃO do próprio painel — `.ret-pop` se ancora no ' +
    'ancestral posicionado, que não é o pai, e medir pelo pai dava uma régua errada');
  ok(/requestAnimationFrame\(function\(\)\{\s*\n\s*delete pop\.dataset\.medindo;/.test(adm),
    'a medida se repete no quadro seguinte: a primeira pega o layout de ANTES de a ' +
    'coluna se reacomodar, e sobrava 76px de espaço que não existia');
  ok(/if \(espaco >= 180\) pop\.style\.maxHeight = espaco \+ 'px';/.test(adm),
    'não cabendo, ele encolhe e rola por dentro em vez de ter o topo cortado');
  ok(/pop\.style\.maxHeight = '';/.test(adm),
    'e zera o encolhimento antes de medir de novo — guardado, ele nunca voltaria ao ' +
    'tamanho inteiro numa janela que cresceu');

  /* ---- a classe que faltava ----------------------------------------------- */
  ok(/\.sr\{position:absolute;width:1px;height:1px/.test(css),
    'o texto só para quem ouve a tela tem regra — sem ela, a primeira frase escrita ' +
    'assim apareceu solta no meio do painel de filtros');

  /* ---- no celular o painel de filtros é FOLHA ----------------------------- */
  ok(/if \(veu && emCartoesPainel\(\)\) veu\.hidden = !FILTROS_ABERTO;/.test(adm),
    'a folha sobe com véu: sem o fundo escurecido ela flutua sobre uma tabela que ' +
    'continua parecendo clicável, e o toque fora cai na tabela');
  ok(/if \(!emCartoesPainel\(\)\) posicionarPop\(alvoTopo\);/.test(adm),
    'e a medição é só do computador — no celular quem posiciona é a folha de estilo, e ' +
    'medir ali escreveria a altura de uma gaveta que não existe mais');
  ok(/if \(FILTROS_ABERTO\) abrirFiltros\(false\);/.test(adm),
    'o X, o véu e o Esc alcançam esta folha como as outras — fora do `fecharFolhas`, ' +
    'ela seria a única que o Esc não fecha');
  /* UM CORTE SÓ PARA A PÁGINA. Em 760 o trilho virava faixa e em 1024 a tabela virava
     cartão: entre as duas medidas a tela mostrava os cartões do celular ao lado de um
     trilho de 220px, que é o aperto que os dois arranjos existem para evitar. */
  ok(/@media \(max-width:1023px\)\{\s*\n\s*\.ret-wrap\{grid-template-columns:1fr\}/.test(css) &&
     !/@media \(max-width:760px\)/.test(css),
    'o trilho e a tabela trocam de forma na MESMA largura, e não em duas');

  /* ---- cada recorte tem o seu "✕" ----------------------------------------- */
  ok(/function pilula\(chave, texto\)\{[\s\S]{0,300}data-tirar-f="'\+chave/.test(adm),
    'cada recorte é uma pílula com o próprio ✕: a mesma linha que ANUNCIA o filtro é a ' +
    'que o desfaz');
  ok(/alvo\.querySelectorAll\('button\[data-tirar-f\]'\)\.forEach/.test(adm) &&
     /tirarFiltroFluxo\(b\.dataset\.tirarF\)/.test(adm),
    'e o ✕ está ligado — pílula que não tira nada é pior que pílula nenhuma');
  /* O PERÍODO É O ÚNICO QUE VAI AO SERVIDOR. Tirado com um redesenho local, a tabela
     continuaria com as linhas que o servidor recortou, e o número não voltaria. */
  ok(/if \(chave === 'periodo'\) \{[\s\S]{0,320}return carregarPainel\(\);/.test(adm),
    'tirar o período recarrega do servidor; os outros peneiram o que já veio');
  ok(/if \(chave === 'rtBusca'\) \{[\s\S]{0,160}classList\.remove\('tem'\)/.test(adm),
    'e tirar a busca apaga junto o ✕ do campo — aceso sobre um campo vazio, ele oferece ' +
    'limpar o que já está limpo');

  /* ---- o recorte de Movimento --------------------------------------------- */
  ok(/\(FLUXO_TIPO !== 'todos' \? 1 : 0\)/.test(adm),
    'o movimento entra na contagem de filtros ligados — fora dela, a lista ficaria ' +
    'curta com o botão dizendo que não há filtro');
  ok(/function marcarMovimentoFluxo\(qual\)\{\s*\n\s*FLUXO_TIPO = qual;/.test(adm) &&
     /marcarMovimentoFluxo\(b\.dataset\.mov\);/.test(adm) &&
     !/\n\s*FLUXO_TIPO = b\.dataset\.mov;/.test(adm),
    'o estado e o botão aceso mudam juntos, num lugar só — em separado, a tela mostraria ' +
    '"Saída" apertado com a lista inteira embaixo');
  ok(/pilula\('movimento', 'só '\+\(FLUXO_TIPO === 'saida' \? 'saídas' : 'retornos'\)\)/.test(adm),
    'e ele aparece nas pílulas, com o seu ✕');
  /* COM "SÓ RETORNOS" A TAXA PERDE O SENTIDO: sobram só os dias em que houve retorno, e
     a conta passa a dividir um retorno inteiro por uma saída recortada. */
  ok(/if \(FLUXO_TIPO === 'retorno'\) \{[\s\S]{0,300}resumo__aviso/.test(adm) &&
     /a taxa de retorno perde o sentido/.test(adm),
    'a tela avisa que com "só retornos" o Total de Saída deixa de ser o do período');
  ok(/\.resumo__aviso\{flex:1 0 100%;color:var\(--ambar-forte\)/.test(css),
    'e o aviso ocupa a linha inteira, em âmbar: em linha com as pílulas ele viraria ' +
    'mais uma etiqueta, e o que ele diz é que um dos NÚMEROS acima parou de responder');
  ok(/@media \(max-width:1023px\)\{ \.seg button\{min-height:42px/.test(css),
    'no celular os três botões são alvo de dedo, como o resto da folha');

  /* ---- a fumaça ----------------------------------------------------------- */
  ok(/class="fumaca"/.test(js) && /\.fumaca\{fill:var\(--txt3\)/.test(css),
    'o caminhão solta fumaça pela traseira');
  ok(/animation:fumegar[\s\S]{0,400}transform:translate\(-9px,-11px\) scale\(3\)/.test(css),
    'e ela anima por `transform`, que a placa de vídeo resolve — mexer no raio do ' +
    'círculo obrigaria o navegador a refazer o desenho 60 vezes por segundo');
  ok(/\.caminhao\{[^}]*overflow:visible\}/.test(css),
    'o quadro do caminhão deixa a fumaça passar');
  ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\n\s*\.desenho \*/.test(css),
    'e quem pediu menos movimento não recebe nenhuma delas');
})();

console.log('\n== Lançamentos no celular: barra compacta, trilho e faixa do dia ==');
(function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* ---- a barra compacta ---------------------------------------------------- */
  /* As cinco listas empilhadas gastavam ~250px de altura antes do primeiro lançamento,
     quase sempre sem nada marcado. Agora são um botão de 44px e um trilho. */
  ok(/<div class="barra-f">[\s\S]{0,700}id="btnAbrirFiltrosLanc"/.test(html) &&
     /id="lcChips"/.test(html),
    'os filtros viram um botão e um trilho de recortes rápidos');
  ok(/\.btn-filtros\{[^}]*min-height:44px/.test(css),
    'o botão tem os 44px de alvo — o app é usado de luva');
  ok(/@media \(min-width:1024px\)\{ \.barra-f \.btn-filtros\{display:none\} \}/.test(css),
    'e some no computador, onde os filtros já estão à vista e ele não teria o que abrir');
  ok(/<div class="filtros-caixa" id="caixaFiltrosLanc">/.test(html) &&
     /<div class="folha__puxador so-celular"/.test(html),
    'as listas passam para a folha que sobe, com o puxador das outras');
  /* É O MESMO NÓ nas duas larguras: dois conjuntos dos mesmos campos seriam dois ids
     repetidos, e `getElementById` leria sempre o primeiro. */
  ok((html.match(/id="lcFMotorista"/g) || []).length === 1,
    'e é o MESMO nó do computador — dois conjuntos dos mesmos campos seriam dois ids ' +
    'repetidos, e a tela filtraria pelo que a outra cópia tem');

  /* ---- o sentido virou chip ------------------------------------------------ */
  ok(html.indexOf('id="lcFSentido"') < 0 &&
     /\['todos','Todos'\],\['saida','Saídas'\],\['retorno','Retornos'\]/.test(html),
    '"Entrada / Saída" virou chip: com dois valores, marcar os dois é o mesmo que não ' +
    'marcar nenhum, e a lista custava três toques onde cabe um');
  ok(/\['corrigido','Corrigidos'\]/.test(html) &&
     /LC_CHIP === 'corrigido' && !\(\(m\.alterado \|\| \{\}\)\.vezes\)/.test(html),
    'e "Corrigidos" é novo — é o recorte de quem foi conferir o que mudou, e sem ele ' +
    'isso se fazia lendo cartão por cartão atrás da etiqueta');
  /* A CONTAGEM DE CADA CHIP É SOBRE OS OUTROS FILTROS JÁ APLICADOS: com "Motorista:
     Chico" ligado, um chip dizendo "Retornos 40" sobre uma lista de dois mandaria a
     pessoa procurar trinta e oito que não existem naquele recorte. */
  ok(/function contaChipLanc\(qual\)\{[\s\S]{0,300}LC_CHIP = qual;[\s\S]{0,200}LANC\.filter\(passaFiltro\)/
    .test(html),
    'a contagem do chip respeita os outros filtros — o que ele promete é o que entrega');
  /* E CONTA REMESSAS, não linhas: uma carga de cinco tipos de caixa é UM lançamento
     para quem a fez, e um cartão na tela. */
  ok(/Q\.agruparLancamentos\(LANC\.filter\(passaFiltro\)\)\.length/.test(html),
    'e conta remessas, não linhas: a carga de cinco tipos é um cartão, e contar as ' +
    'cinco faria o chip prometer doze sobre uma lista de três');
  ok(/var remessas = Q\.agruparLancamentos\(lista\)\.length;/.test(html),
    'o rodapé de cima passou a contar igual — era ele que estava fora de passo com a ' +
    'faixa do dia e com a lista');
  /* O TRILHO É REDESENHADO a cada `desenharLanc`, então quem ouve o clique é o
     CONTÊINER: religar os botões a cada redesenho é trabalho que se esquece num
     caminho qualquer, e o chip para de responder sem erro nenhum. */
  ok(/getElementById\('lcChips'\)\.addEventListener\('click'/.test(html),
    'o clique é ouvido no contêiner do trilho, e não em cada botão');

  /* ---- as pílulas ---------------------------------------------------------- */
  /* NA PINTURA, e não só no arquivo: a função podia existir inteira e ninguém chamá-la
     — as pílulas sumiam, a folha fechada voltava a esconder o recorte, e o teste
     continuava verde. */
  ok(/desenharChipsLanc\(\);\s*\n\s*pintarFiltrosLanc\(\);/.test(html) &&
     /function pintarFiltrosLanc\(\)/.test(html) && /data-tirar-lc/.test(html),
    'o que está recortando a lista vira pílula, e cada uma tira o SEU filtro');
  ok(/m\.length === 1 \? m\[0\] : m\.length/.test(html),
    'um valor mostra o nome, vários mostram a contagem — cinco motoristas por extenso ' +
    'viram três linhas de pílula em cima da lista que se quer ver');
  ok(/n\.textContent = pilulas\.length;/.test(html),
    'e o contador do botão conta o MESMO que as pílulas: dois números sobre o mesmo ' +
    'recorte acabam discordando');
  ok(/LC_CHIP = 'todos';\s*\n\s*desenharLanc\(\);\s*\n\s*\}\);/.test(html),
    '"Limpar filtros" leva o recorte rápido junto — senão devolvia a lista com "Só ' +
    'retornos" ainda aceso no trilho');

  /* ---- a faixa do dia ------------------------------------------------------ */
  ok(/<h2 class="dia">/.test(html),
    'a faixa do dia é `<h2>`: quem ouve a tela navega de título em título, e dia a dia ' +
    'é como se percorre esta lista');
  ok(/\.dia\{position:sticky;top:0/.test(css),
    'e fica grudada no topo — num dia com quinze lançamentos, quem rolava até o meio já ' +
    'não sabia de que dia estava olhando');
  ok(/\.dia::before\{[^}]*background:var\(--verde\)/.test(css),
    'com a barra verde que a distingue de um cartão');
  /* NA FAIXA, e não só no arquivo: a função podia continuar existindo e a marcação
     deixar de chamá-la. */
  ok(/<small>'\+Q\.esc\(diaDaSemana\(d\)\)\+'<\/small>/.test(html) &&
     /function diaDaSemana\(iso\)/.test(html) && /weekday: 'long'/.test(html),
    'e o dia da semana embaixo da data: "terça" responde mais rápido que "16/09" a quem ' +
    'procura o dia em que o Chico rodou');
  ok(/new Date\(\+p\[0\], \+p\[1\] - 1, \+p\[2\], 12\)/.test(html),
    'montado com meio-dia na hora: às zero horas um fuso a oeste joga a data para o ' +
    'dia anterior');

  /* ---- a folha fecha por três caminhos ------------------------------------- */
  ok(/<div class="veu-folha" id="veuFolha" hidden><\/div>/.test(html),
    'o app de campo ganhou o véu da folha — ele não tinha, e a folha ficaria flutuando ' +
    'sobre uma lista que continua parecendo clicável');
  ok(/id="veuFolha"[\s\S]{0,200}veu da gaveta|véu da gaveta/.test(html) ||
     /Os dois escurecem a tela, mas fecham/.test(html),
    'separado do véu da gaveta: um véu só com duas responsabilidades fecharia a coisa ' +
    'errada');
  ok(/function fecharFolhaLanc\(\)/.test(html) &&
     /veu\.addEventListener\('click', fecharFolhaLanc\)/.test(html) &&
     /e\.target\.closest\('\[data-fechar-folha\]'\)\) fecharFolhaLanc\(\)/.test(html) &&
     /e\.key === 'Escape'\) fecharFolhaLanc\(\)/.test(html),
    'e ela fecha pelo X, pelo véu e pelo Esc — só pelo botão que a abriu obriga a mirar ' +
    'de volta num alvo pequeno');
})();

console.log('\n== A foto do usuário: do arquivo ao círculo ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var sup = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
  var ix = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  var mig = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');

  /* ---- o caminho do dado --------------------------------------------------- */
  ok(/alter table public\.usuarios add column if not exists foto text;/.test(mig),
    'a coluna nasce por migração — sem ela, gravar a foto devolve erro de coluna ' +
    'inexistente e o cadastro inteiro deixa de salvar');
  /* O ENDEREÇO, e não a imagem: a tabela de usuários é lida inteira a cada visita ao
     painel, e um base64 de retrato ali viajaria em toda abertura de tela. */
  ok(/foto text;/.test(mig) && !/foto bytea/.test(mig),
    'e é uma coluna de texto: o byte da imagem mora no balde, não na tabela');
  /* A LEITURA E A GRAVAÇÃO, as duas. Só a gravação tinha guarda — a de simetria, que
     cobra contrapartida para todo campo LIDO. Apagar a leitura passava por ela sem
     ruído, e o efeito seria a foto salvando no banco e nunca voltando para a tela:
     a pessoa escolheria o rosto, salvaria, e veria as iniciais de novo. */
  ok(/Foto: r\.foto \|\| '',/.test(sup),
    'a coluna é LIDA do banco — gravada e não lida, a foto salva e a tela nunca a mostra');
  ok(/if \(o\.Foto !== undefined\) r\.foto = nulo\(o\.Foto\);/.test(sup),
    'tirar a foto grava NULO, e não string vazia — a tela pergunta "tem foto?", e o ' +
    'vazio responderia que sim');

  /* ---- o servidor é a fronteira ------------------------------------------- */
  var iSU = ix.indexOf('async function salvarUsuario(p)');
  var rota = ix.slice(iSU, ix.indexOf('\nasync function', iSU + 10));
  ok(iSU > 0 && rota.length > 1000, 'o recorte pegou a rota', rota.length);
  ok(/dados\.Foto\.slice\(0, 5\) === 'data:'/.test(rota),
    'só sobe o que veio como imagem nova: regravar o endereço que já existe a cada ' +
    'Salvar encheria o balde de cópias do mesmo rosto');
  ok(/\^data:image\\\/\(png\|jpe\?g\|webp\);base64,/.test(rota),
    'o TIPO é conferido no servidor — um `data:` de outra coisa viraria um arquivo com ' +
    'extensão de foto e conteúdo de qualquer natureza');
  ok(/dados\.Foto\.length > 1500000/.test(rota),
    'e o TAMANHO também: a tela reduz antes de mandar, mas esta rota aceita pedido de ' +
    'qualquer origem, e a tela não é a fronteira');
  ok(/if \(!url\) return \{ ok: false, erro: 'Não consegui guardar a foto/.test(rota),
    'falhando o envio, a gravação PARA — seguir em frente deixaria o cadastro salvo, a ' +
    'foto perdida e nenhum aviso de que ela se perdeu');

  /* ---- a volta quando o endereço quebra ------------------------------------ */
  /* NO RECORTE DA FUNÇÃO, e não no arquivo: `onerror` aparece duas vezes em
     `admin.html` — aqui e no retrato do formulário —, e procurado solto, um respondia
     pelo outro. Arrancado da lista, a afirmação continuava verde. */
  var iR = adm.indexOf('function retrato(u, classe)');
  var retr = adm.slice(iR, adm.indexOf('\n  }', iR));
  ok(iR > 0 && /onerror="this\.remove\(\)"/.test(retr),
    'no retrato da lista, a imagem que não carrega se retira');
  ok(/onerror="this\.remove\(\)"/.test(adm.slice(adm.indexOf('id="fFotoPreview"'),
                                                 adm.indexOf('id="fFotoPreview"') + 400)),
    'e no retrato do formulário também — é o mesmo desenho, e a foto velha pode ter ' +
    'sumido do balde desde o último Salvar');
  ok(iR > 0 && /Q\.esc\(iniciaisDe\(u\.Nome\)\)\+/.test(retr),
    'e as iniciais ficam POR BAIXO dela: quebrado o endereço, o lugar volta a mostrar ' +
    'duas letras em vez de um quadrado vazio');
  ok(/\.retrato__f\{position:absolute;inset:0/.test(css),
    'a foto cobre o quadrado inteiro, em vez de ficar ao lado das letras');
  ok(/\.u__ini\{position:relative;overflow:hidden/.test(css),
    'e o quadrado recorta o que sobra — sem `overflow`, um retrato deitado escapa dele');

  /* ---- os dois lugares da lista -------------------------------------------- */
  ok(/retrato\(u, 'u-linha__r'\)/.test(adm),
    'o retrato entra na coluna NOME da tabela, junto do nome — coluna própria seria ' +
    'uma que se esconde pela aba Colunas, e o rosto sumiria de onde ele serve');
  ok(/retrato\(u, 'u__ini'\)/.test(adm),
    'e no cartão do celular, no lugar das iniciais');
  ok((adm.match(/function retrato\(u, classe\)/g) || []).length === 1,
    'os dois saem da MESMA função: escrita duas vezes, a volta do endereço quebrado ' +
    'existiria num lugar e não no outro');

  /* ---- o formulário -------------------------------------------------------- */
  var iCF = adm.indexOf('function ligarCampoFoto()');
  var campo = adm.slice(iCF, adm.indexOf('\n  function salvar(', iCF));
  ok(iCF > 0 && campo.length > 900, 'o recorte pegou o campo de foto', campo.length);
  ok(/campo\.value = dataUrl;\s*\n\s*mostrar\(dataUrl\);/.test(campo),
    'escolher o arquivo já mostra o rosto ali: sem isso a pessoa escolhe, não vê nada ' +
    'mudar e não sabe se pegou');
  /* 320px É O DOBRO do maior lugar em que ela aparece. Um retrato de celular tem 4 MB e
     4000px de lado; subir isso gastaria os dados de quem está no galpão para guardar um
     arquivo que ninguém vê inteiro — e a rota recusaria depois da espera. */
  ok(/Q\.comprimirFoto\(f, 320, 0\.8\)/.test(campo),
    'a imagem encolhe no navegador antes de subir');
  ok(/if \(!\/\^image\\\/\(png\|jpeg\|webp\)\$\/\.test\(f\.type\)\)/.test(campo),
    'e o tipo é conferido na hora: o `accept` do campo é dica, e o seletor do sistema ' +
    'deixa escolher "todos os arquivos" em quase todo aparelho');
  ok(/Foto:document\.getElementById\('fFoto'\)\.value/.test(adm),
    'o que o campo escondido guarda é o que vai gravado');
  /* O BOTÃO É UM `<label>`, e `button.btn` não alcança `<label>` — a mesma armadilha
     que o `label.btn-foto` da câmera já tinha encontrado. Posto como `class="btn sec"`,
     ele saía como texto solto ao lado de um botão de verdade. */
  ok(/<label class="foto-campo__esc" for="fFotoArq"/.test(adm) &&
     /label\.foto-campo__esc\{/.test(css),
    'o botão que abre o seletor tem regra própria de `label`');
  ok(/id="fFotoArq" accept="image\/png,image\/jpeg,image\/webp" '\+\s*\n?\s*'class="sr"/.test(adm),
    'e o campo de arquivo cru fica escondido — ele não se estiliza, e escrito ' +
    '"Nenhum arquivo selecionado" em inglês fica fora do resto da tela');

  /* ---- o círculo de quem está logada --------------------------------------- */
  ok(/Q\.quemEsta\(s\.nome, s\.perfil, s\.foto\)/.test(adm),
    'a tela manda a foto para o círculo da lateral');
  ok(/pintarCirculo\(document\.getElementById\('avatarUsuario'\), nome, foto\)/.test(js) &&
     /pintarCirculo\(t, nome, foto\)/.test(js),
    'e os dois círculos saem do mesmo desenho — em separado, um mostraria o rosto e o ' +
    'outro as letras da mesma pessoa');
})();

console.log('\n== Corrigir: o que é correção e o que é só consulta ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var lg = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  var ix = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

  /* ---- A CAUSA: um seletor que muda o dado sozinho -------------------------
   *
   * Se o que o lançamento tem não está na lista, o navegador escolhe a PRIMEIRA opção,
   * a tela passa a exibir outra coisa, e gravar torna a mentira verdadeira. Foi assim
   * que um lançamento de CX P virou CX DIVERSAS — a primeira em ordem alfabética — numa
   * correção em que só se queria mexer na quantidade. */
  var iFC = adm.indexOf('function formCorrigir(m)');
  var forma = adm.slice(iFC, adm.indexOf('\n  /* Locais que o admin pode marcar', iFC));
  ok(iFC > 0 && forma.length > 2000, 'o recorte do formulário pegou o corpo', forma.length);

  ok(/function faltando\(atual, tem, rotulo\)\{[\s\S]{0,260}fora do cadastro/.test(forma),
    'o formulário repõe o valor gravado quando ele sumiu do cadastro — e diz que ele ' +
    'está fora, em vez de fingir que é outro');
  ok((forma.match(/faltando\(/g) || []).length === 4,
    'e usa isso nos TRÊS seletores que podiam cair na primeira opção — local (que serve ' +
    'a origem e destino), caixa e quem lançou',
    (forma.match(/faltando\([a-zA-Z.]*/g) || []));
  ok(/faltando\(m\.tipoCaixaId,/.test(forma),
    'a caixa em particular: sem opção vazia, ela caía em CX DIVERSAS, que é a primeira ' +
    'da lista — e gravar trocava o tipo de caixa do lançamento');
  /* PELO ID, e não pelo nome: casar pelo nome dependia de o cadastro nunca ter sido
     renomeado, e num nome que já não bate o seletor caía na primeira pessoa da lista. */
  ok(/\(String\(u\.ID\)===String\(m\.usuarioId\)\?' selected':''\)/.test(forma) &&
     !/String\(u\.Nome\)===String\(m\.usuario\)/.test(forma),
    '"quem fez o envio" casa pelo ID, e não pelo nome — pelo nome, renomear alguém ' +
    'reatribuía o lançamento na primeira correção seguinte');

  /* ---- O QUE A ETIQUETA AFIRMA -------------------------------------------- */
  ok((adm.match(/function seloAlteracao\(alt\)/g) || []).length === 1,
    'a etiqueta de alteração mora num lugar só — escrita duas vezes, a tabela e o ' +
    'cartão passariam a discordar sobre o mesmo lançamento');
  /* NO CARTÃO, e não só na contagem de definições: copiada para dentro do `cartaoMov`,
     a função continuava existindo uma vez e ninguém a chamava mais — o celular voltava
     a dizer "corrigido" para uma consulta, e o teste seguia verde. */
  var iCM = adm.indexOf('function cartaoMov(g)');
  var cmov = adm.slice(iCM, adm.indexOf('\n  function cartoesMov(', iCM));
  ok(iCM > 0 && /seloAlteracao\(alt\)\+/.test(cmov) && !/>corrigido<\/span>/.test(cmov),
    'e o cartão a CHAMA, em vez de escrever a sua própria', cmov.length);
  var iSA = adm.indexOf('function seloAlteracao(alt)');
  var selo = adm.slice(iSA, adm.indexOf('\n  function cartaoMov(g)', iSA));
  ok(/if \(alt\.vezes\) \{[\s\S]{0,300}>corrigido<\/span>/.test(selo),
    '"corrigido" sai só quando algum campo mudou de verdade');
  ok(/if \(c\.vezes\) \{[\s\S]{0,400}>consultado<\/span>/.test(selo) &&
     /tag cinza/.test(selo),
    'e quem abriu a correção sem mexer em nada deixa "consultado", em cinza');
  ok(selo.indexOf('alt.vezes') < selo.indexOf('c.vezes'),
    'havendo as duas coisas vale a correção: é ela que muda o que o número quer dizer');
  ok(/Alguém abriu a correção e gravou sem mudar nada/.test(selo),
    'e a etiqueta diz exatamente o que aconteceu — "consultado" sozinho seria lido ' +
    'como "alguém olhou a tela", que não é o que ficou registrado');

  /* A COLUNA "ALTERADO POR" não pode responder por uma consulta: quem só olhou não
     alterou, e o nome dele ali manda a conferência procurar uma diferença que não há. */
  ok(/if \(!a\.vezes\) \{[\s\S]{0,500}\(só consultou\)/.test(adm),
    'na tabela, quem só consultou aparece dito pelo que é, e não como quem alterou');

  /* ---- O SERVIDOR ---------------------------------------------------------- */
  ok(/var MARCA_CONSULTA = '\(consulta\)';/.test(lg),
    'a consulta entra no MESMO histórico das correções, com marca própria');
  ok(/if \(!entradas\.length\) \{[\s\S]{0,400}consulta: true, patch: \{\}/.test(lg),
    'gravar sem mudar nada devolve consulta e patch vazio — não escreve no dado');
  ok(/function ehConsulta\(u\)/.test(lg) &&
     /var mudancas = h\.filter\(function \(u\) \{ return !ehConsulta\(u\); \}\);/.test(lg),
    '`vezes` conta só o que MUDOU — uma consulta contada ali acusaria de alteração um ' +
    'lançamento que ninguém tocou');
  ok(/consulta: \{\s*\n?\s*por: mUsers \? nome\(mUsers, c\.por\)/.test(lg),
    'e a consulta é lida à parte, com o nome de quem olhou');
  /* A GUARDA DA SENHA VEM ANTES. Sem isso, quem não pode corrigir passaria a poder
     escrever no histórico de qualquer lançamento — um jeito calado de sujar auditoria. */
  ok(lg.indexOf('precisaSenha: true') < lg.indexOf('consulta: true, patch: {}'),
    'a senha é cobrada antes de a consulta ser gravada');
  ok(/return \{ ok: true, alterou: r\.entradas, consulta: !!r\.consulta \};/.test(ix),
    'a rota devolve o que aconteceu de verdade');
  ok(/'Nada mudou — registrei como consulta\.'/.test(adm),
    'e a tela avisa isso — "Corrigido:" seguido de nada é a mesma mentira da etiqueta, ' +
    'dita no momento em que a pessoa mais acredita');
})();

console.log('\n== Painel da Operação no celular: quadros que dobram, rotas e estoque ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- os quatro quadros dobram, pelo MESMO mecanismo dos Cadastros ---------- */
  ['painel_rotas', 'painel_clientes', 'painel_idade', 'painel_estoque'].forEach(function (c) {
    ok(new RegExp('data-cad="' + c + '" data-conta="propria"').test(adm),
      'o quadro ' + c + ' dobra e escreve o próprio resumo');
  });
  /* O SELETOR É O GERAL. Preso a `#pgCadastros`, o mecanismo não alcançava o Painel, e
     seria preciso um SEGUNDO igual ao lado — outro jeito de guardar o estado e outra
     seta na tela fazendo a mesma coisa. */
  ok(/function montarDobras\(\)\{\s*\n\s*var cards = document\.querySelectorAll\('\.card\[data-cad\]'\)/
    .test(adm),
    'quem dobra é o mesmo `montarDobras` das duas telas, e não uma segunda cópia dele');
  ok((adm.match(/function montarDobras\(/g) || []).length === 1,
    'que existe uma vez só');

  /* --- o padrão depende da largura, e o guardado vence os dois --------------- */
  ok(/function abertoPorPadrao\(cad\)\{[\s\S]{0,260}emCartoesPainel\(\) \? !!PADRAO_CELULAR\[cad\] : true/
    .test(adm),
    'no computador os quatro nascem abertos, no celular só os do padrão — os quatro ' +
    'abertos num telefone são sete telas de rolagem');
  ok(/PADRAO_CELULAR = \{ painel_rotas: true, painel_estoque: true,\s*\n?\s*painel_clientes: false, painel_idade: false \}/
    .test(adm),
    'e os que abrem são Rotas e Estoque: "onde estão as caixas" e "quanto há em casa"');
  ok(/guardado === null \? abertoPorPadrao\(card\.dataset\.cad\) : guardado === '1'/.test(adm),
    'o que a pessoa abriu ou fechou VENCE o padrão — reaplicá-lo desfaria na mão dela ' +
    'o que ela acabou de abrir');
  /* O corte é o MESMO das outras telas: uma medida própria faria uma parte da página
     virar cartão numa largura e outra parte noutra. */
  ok(/emCartoesPainel\(\) \? !!PADRAO_CELULAR/.test(adm) &&
     (adm.match(/function emCartoesPainel\(\)/g) || []).length === 1,
    'e o corte é o mesmo `emCartoesPainel` do resto do app');

  ok(/if \(card\.dataset\.conta === 'propria'\) return;/.test(adm),
    'a contagem de linhas não passa por cima do resumo escrito à mão — contar as ' +
    'linhas daria "7" para as Rotas, quando o que se quer saber é quantas têm carga');

  /* --- uma sequência de desenho, e não duas ---------------------------------- */
  ok(/function desenharPainel\(\)\{\s*\n\s*montarDobras\(\);/.test(adm),
    '`montarDobras` vem antes dos desenhos: é ele que cria a aba onde cada quadro ' +
    'escreve o resumo');
  ok((adm.match(/desenharRotas\(\); desenharKpis\(\)/g) || []).length === 1,
    'a sequência do painel é escrita UMA vez — em duas cópias, a do cache já tinha ' +
    'começado a divergir da da rede');
  ok((adm.match(/desenharPainel\(\);/g) || []).length === 3,
    'e as três chamadas dela são: rede, cache e girar o aparelho');

  /* --- rotas: cartão no celular, tabela no computador ----------------------- */
  var iCR = adm.indexOf('function cartaoRota(r)');
  var rota = adm.slice(iCR, adm.indexOf('\n  function numeroRota', iCR));
  ok(iCR > 0 && rota.length > 600, 'o cartão de rota tem corpo', rota.length);
  ok(/if \(emCartoesPainel\(\)\)\{\s*\n[\s\S]{0,200}rotas\.map\(cartaoRota\)/.test(adm),
    'no celular as rotas viram cartão');
  ok(/<th>Rota<\/th><th>Motorista<\/th>/.test(adm),
    'e no computador a tabela de seis colunas continua lá');

  /* "VER CLIENTES" NÃO FOI REESCRITO: o cartão usa o mesmo `data-rota` da tabela, e
     quem liga é a mesma função. Duas cópias discordariam no dia em que o filtro
     mudasse de nome. */
  ok((adm.match(/function ligarVerClientes\(\)/g) || []).length === 1 &&
     (adm.match(/ligarVerClientes\(\);/g) || []).length === 2,
    'o mesmo religar serve à tabela e ao cartão');
  /* NO CARTÃO, e não só na contagem de chamadas: trocando o `data-rota` do cartão por
     outro nome, o religar continuava sendo um só e não achava mais o botão — ele
     deixava de fazer qualquer coisa, sem erro no console. */
  ok(/data-rota="'\+Q\.esc\(r\.id\)\+'">ver clientes/.test(rota),
    'e o botão do cartão carrega o MESMO `data-rota` que a linha da tabela');
  ok(/abrirCard\('painel_clientes'\);/.test(adm),
    'e ele ABRE o quadro dos clientes: no celular ele nasce fechado, e rolar até uma ' +
    'aba dobrada faz concluir que o botão não fez nada');

  /* A ROTA ZERADA CABE NUMA LINHA. Hoje são cinco de sete: com a grade de quatro zeros
     cada uma, o quadro que responde "onde estão as caixas" virava quatro telas para
     dizer "em lugar nenhum". */
  ok(/if \(vazia\) \{[\s\S]{0,220}rt rt--vazia rt--linha/.test(rota),
    'a rota zerada sai numa linha só, e não numa grade de quatro zeros');
  ok(/rt__nada">sem caixa/.test(rota),
    'dizendo que está sem caixa — sumida da lista, alguém a procuraria no cadastro');
  var iLinha = rota.indexOf('rt--linha');
  ok(iLinha > 0 && rota.indexOf('rt-n') > iLinha,
    'e a grade de números fica só para as que têm o que mostrar');
  ok(/\.rt--vazia\{opacity/.test(css),
    'ela fica apagada, e não escondida');

  /* "SEM MOTORISTA" SÓ É ALARME COM CARGA NA ESTRADA. Hoje as sete estão sem motorista:
     sete vermelhos ao lado do único que importa é o jeito mais rápido de ensinar
     alguém a ignorar o vermelho. */
  ok(/<span class="tag '\+\(r\.saldo \? 'vermelha' : 'cinza'\)\+'">sem motorista/.test(rota),
    'o "sem motorista" só fica vermelho na rota que tem carga — numa rota parada é ' +
    'cadastro em branco, não alarme');

  ok(/resumoDoCard\('painel_rotas',\s*\n?\s*rotas\.length\+' · '\+\(comCarga \? comCarga\+' com carga'/
    .test(adm),
    'a aba das Rotas diz quantas estão COM CARGA, e não só quantas existem');

  /* --- clientes: cartão, e a barra de idade é a de sempre -------------------- */
  var iCC = adm.indexOf('function cartaoCliente(l)');
  var cli = adm.slice(iCC, adm.indexOf('\n  function desenharAgingGeral', iCC));
  ok(iCC > 0 && cli.length > 500, 'o cartão de cliente tem corpo', cli.length);
  ok(/Q\.barraAging\(l\.aging\)/.test(cli),
    'a idade sai da MESMA barra do resumo geral — uma segunda barra com outras faixas ' +
    'faria a mesma caixa cair em "16–30" num lugar e em "+30" no outro');
  ok(/href="tel:'\+Q\.esc\(String\(l\.telefone\)\.replace\(\/\[\^0-9\+\]\/g,''\)\)/.test(cli),
    'o telefone disca: com a caixa parada há 40 dias o passo seguinte é ligar, e ' +
    'copiar número à mão no celular é onde a pessoa desiste');
  ok(/var atrasados = lista\.filter/.test(adm),
    'a aba conta sobre a lista FILTRADA — sobre o total, ela e a lista discordariam ' +
    'sobre a mesma pergunta com um filtro ligado');
  ok((adm.match(/function ligarExtratoDoPainel\(\)/g) || []).length === 1 &&
     (adm.match(/ligarExtratoDoPainel\(\);/g) || []).length === 2,
    'o botão de extrato é o mesmo nos dois');
  ok(/data-ex="'\+l\.id\+'">extrato/.test(cli),
    'e o do cartão carrega o mesmo `data-ex` da tabela — com outro nome, o religar ' +
    'continuava único e não achava mais o botão');

  /* --- estoque: o negativo é o achado --------------------------------------- */
  ok(/function tiposNegativos\(g\)/.test(adm) && /function avisoEstoqueNegativo\(n\)/.test(adm),
    'a tela conta os saldos negativos e diz o que eles significam');
  ok(/if \(!n\) return '';/.test(adm),
    'e cala quando não há nenhum — aviso permanente vira paisagem');
  ok(/caixa física não fica abaixo de zero/.test(adm) &&
     /falta o lançamento '\+\s*\n?\s*'de <b>Ajuste inicial<\/b>/.test(adm),
    'o aviso diz a CAUSA — sem saldo de abertura a conta começou do zero — e não só ' +
    'que o número está estranho');
  ok(/o número de caixas na '\+\s*\n?\s*'rua também está errado pelo mesmo tanto/.test(adm),
    'e diz que o erro não para no estoque: a mesma falta desloca as caixas na rua');
  /* O AVISO SAI NAS DUAS LARGURAS: um saldo impossível não deixa de ser impossível numa
     tela grande — e é no computador que alguém vai lançar o ajuste. */
  var iDG = adm.indexOf('function desenharGalpoes()');
  var galp = adm.slice(iDG, adm.indexOf('\n  function cartaoGalpao', iDG));
  /* `> 0 &&` PORQUE `indexOf` DE UM TEXTO AUSENTE É −1, e −1 é menor que qualquer
     índice: apagando a linha, a afirmação de ordem passava sozinha. Foi assim que dois
     defeitos plantados — o aviso sumindo de vez e o aviso indo para dentro do ramo do
     celular — atravessaram este teste. */
  var iAviso = galp.indexOf('var html = avisoEstoqueNegativo(neg)');
  ok(iAviso > 0 && iAviso < galp.indexOf('if (emCartoesPainel())'),
    'o aviso é montado ANTES de escolher cartão ou tabela: dentro do ramo do celular, ' +
    'ele sumiria justo na tela onde se lança o ajuste');
  ok((galp.match(/avisoEstoqueNegativo\(/g) || []).length === 1,
    'e é montado uma vez só, e não uma por largura');
  ok(/<td class="num">'\+\(x\.saldo < 0 \? '<b style="color:var\(--vermelho\)">/.test(galp),
    'e na tabela o saldo negativo também é vermelho');

  var iCG = adm.indexOf('function cartaoGalpao(x, tipos)');
  var gal = adm.slice(iCG, adm.indexOf('\n  /* ---------------- extrato', iCG));
  ok(iCG > 0 && gal.length > 400, 'o cartão de galpão tem corpo', gal.length);
  ok(/if \(\(va < 0\) !== \(vb < 0\)\) return va < 0 \? -1 : 1;/.test(gal),
    'os tipos negativos vêm primeiro: são o que se veio ver');
  ok(/chip-tipo'\+\(v < 0 \? ' chip-tipo--neg' : ''\)/.test(gal),
    'e o negativo tem a borda inteira vermelha');
  ok(/\.chip-tipo--neg\{border-color:var\(--vermelho\)/.test(css),
    'que é o que o distingue de "está acabando"');
  ok(/resumoDoCard\('painel_estoque',\s*\n?\s*Q\.num\(soma\)\+\(neg \? ' · '\+neg\+' negativo'/
    .test(adm),
    'a aba do Estoque leva a contagem de negativos: fechado, é o único lugar onde o ' +
    'alerta ainda aparece');
  ok(/alvo\.classList\.toggle\('alerta', !!alerta\)/.test(adm) &&
     /\.card\.dobra > h2 \.conta\.alerta\{background:var\(--vermelho-claro\)/.test(css),
    'e ela fica vermelha quando o resumo é má notícia');
})();

console.log('\n== Usuários no celular: cartão, acesso à vista e folha de ações ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  ok(/if \(emCartoesPainel\(\)\) \{[\s\S]{0,400}ordenada\.map\(cartaoUser\)/.test(adm),
    'no celular a lista de usuários vira cartão, no mesmo corte das outras telas');

  /* --- a busca e o "Novo" na mesma linha ------------------------------------ */
  ok(/<div class="acoes-topo">[\s\S]{0,400}id="buscaUsuarios"[\s\S]{0,300}id="btnNovoUsuario"/
    .test(adm),
    'a busca e o "Novo" dividem uma linha — numa barra própria, o botão comia uma faixa ' +
    'inteira do celular para uma ação de uma vez por mês');
  ok(/\+ Novo<span class="so-largo"> usuário<\/span>/.test(adm) &&
     /\.so-largo\{display:none\}/.test(css) &&
     /@media \(min-width:1024px\)\{\s*\n\s*\.so-largo\{display:inline\}/.test(css),
    'e a palavra "usuário" só aparece no computador: ao lado de um "+", num cartão ' +
    'chamado Usuários, ela rouba a largura da busca sem acrescentar nada');
  /* A `.busca` nasce com 10px de margem embaixo, e num flex centrado essa margem entra
     na conta: o campo ficava cinco pixels acima do botão, desalinhado sem motivo. */
  ok(/\.acoes-topo \.busca\{flex:1 1 auto;min-width:0;margin-bottom:0\}/.test(css),
    'a margem de baixo da busca é zerada na linha — senão os dois saem desalinhados');
  /* A EXPLICAÇÃO DO TOPO também é só do computador: no celular são quatro linhas antes
     da lista, e o que ela ensina cada cartão já diz em "Entra como <b>". */
  /* `.so-largo` SOZINHA NÃO ESCONDE O PARÁGRAFO: `.card h2 .sub` tem duas classes e um
     elemento, e vence por especificidade — com a regra escrita e o teste verde, ele
     continuava à vista no celular. Foi a sonda que pegou, medindo o `display` em vez
     da regra; a afirmação agora exige o seletor que empata. */
  ok(/<span class="sub so-largo">Admin faz os cadastros/.test(adm) &&
     /\.card h2 \.sub\.so-largo\{display:none\}/.test(css) &&
     /@media \(min-width:1024px\)\{\s*\n\s*\.so-largo\{display:inline\}\s*\n\s*\.card h2 \.sub\.so-largo\{display:block\}/
       .test(css),
    'o parágrafo de explicação fica no computador, e volta a ser bloco lá');

  /* --- o trilho de perfis --------------------------------------------------- */
  ok(/function desenharChipsPerfil\(\)/.test(adm) &&
     /\(EQUIPE \|\| \[\]\)\.forEach\(function\(u\)\{\s*\n?\s*var p = String\(u\.Perfil \|\| '—'\);/
       .test(adm),
    'os chips de perfil saem dos DADOS: hoje há seis perfis em uso, e uma lista escrita ' +
    'à mão esqueceria os que o escritório criar amanhã');
  ok(/chipPerfil\(p, p, conta\[p\]\)/.test(adm),
    'e cada um leva a contagem — sem ela, "Conferente" não diz se há um ou nove');
  ok(/return \(Q\.temTeste\(a\) \? 1 : 0\) - \(Q\.temTeste\(b\) \? 1 : 0\) \|\|/.test(adm),
    'os de teste vêm por último, na MESMA ordem da lista — dois critérios fariam o ' +
    'chip e a lista discordarem sobre quem vem antes');
  /* O FILTRO É DA PENEIRA, e não do desenho: no desenho, ele existiria só numa largura
     e continuaria peneirando quando a outra aparecesse — a lista curta passaria a
     parecer a lista inteira. */
  ok(/if \(PERFIL_FILTRO && String\(u\.Perfil \|\| ''\) !== PERFIL_FILTRO\) return false;/
    .test(adm),
    'quem peneira por perfil é o `usuariosNaTela`, que serve à tabela e aos cartões');
  /* ANTES DO CORTE, e não colado nele. Escrita como duas linhas grudadas, esta
     asserção reprovava qualquer coisa inserida entre elas — inclusive o `pintarTrava()`,
     que também precisa rodar antes dos desvios. Colagem é endereço; o que importa é a
     ORDEM. */
  var fU = adm.slice(adm.indexOf('function desenharUsuarios(digitando)'));
  fU = fU.slice(0, fU.indexOf('\n  function ', 10));
  var iChips = fU.indexOf('desenharChipsPerfil();');
  ok(iChips >= 0 && iChips < fU.indexOf('if (!lista.length)'),
    'e os chips são desenhados ANTES do corte de lista vazia: filtrando um perfil sem ' +
    'ninguém, eles são o único caminho de volta');
  ok(/\.trilho \.chip\{flex:0 0 auto;min-height:38px/.test(css),
    'no trilho o chip vira alvo de dedo — o `.chip` dos Retornos tem 11,5px e serve ' +
    'para ler, não para tocar');
  ok(/\.trilho\{[\s\S]{0,200}mask-image:linear-gradient/.test(css),
    'e o trilho esmaece na borda em vez de mostrar barra de rolagem: seis perfis não ' +
    'cabem em 390px');

  /* --- o que a busca promete ------------------------------------------------
   * A ETIQUETA E O COMPORTAMENTO SÃO A MESMA PROMESSA. Antes ela dizia três campos e
   * procurava nesses três; agora diz todas as colunas, e a asserção cobra que ela
   * procure em TODAS — e que a lista de campos escrita à mão não tenha ficado para
   * trás em lugar nenhum, porque, sobrando, ela é a que a busca continuaria usando. */
  ok(/placeholder="🔍 Buscar em todas as colunas"/.test(adm),
    'a etiqueta promete todas as colunas — e cabe no campo, que em 334px cortava ' +
    '"e-mail" no meio');
  ok(!/\[u\.Nome, u\.Usuario, u\.Email\]\.some/.test(semComentarios(adm)),
    'e a lista de três campos escrita à mão não ficou para trás — sobrando, é ELA que ' +
    'a busca usaria, e a etiqueta prometeria o que a tela não faz');
  ok(/return ids\.some\(function\(id\)\{[\s\S]{0,240}txt\.indexOf\(b\) >= 0;/.test(adm),
    'a busca varre as colunas todas, uma por uma, pela lista que a tabela desenha');
  /* SÓ O TEXTO. As células saem em HTML: procurar em cima dele acharia "span", "tag" e
     "cinza" em toda pessoa da lista, e a busca devolveria a equipe inteira para meia
     dúzia de palavras — com jeito de estar quebrada. */
  ok(/function textoDaCelula\(html\)\{?[\s\S]{0,120}replace\(\/<\[\^>\]\*>\/g, ' '\)/.test(adm),
    'e procura no TEXTO da célula, não na marcação — senão "span" e "tag" achariam ' +
    'todo mundo');
  /* A ORDEM das entidades: o `&amp;` desfeito antes dos outros faria `&amp;lt;` virar
     `<`, e um nome com HTML escapado voltaria a se comportar como HTML na comparação. */
  ok(/replace\(\/&quot;\/g, '"'\)[\s\S]{0,80}replace\(\/&amp;\/g, '&'\)/.test(adm),
    'e desfaz o `&amp;` por ÚLTIMO: antes dos outros, um `&amp;lt;` viraria `<`');
  /* O QUE A CÉLULA MOSTRA E O QUE ELA CONTÉM PODEM DIFERIR — a frota mostra duas placas
     e conta o resto. O que não pode é a busca conhecer só a parte visível.
     E o `busca` ACRESCENTA, não SUBSTITUI: a diferença não é de estilo. Substituindo,
     a própria coluna da frota perdia o aviso "nenhum liberado" — nesse caso não há
     placa nenhuma para a função devolver, e o texto que importa é justamente o que
     está escrito na célula. Medido antes da correção: procurar por "nenhum liberado"
     não achava ninguém, embora a etiqueta estivesse na tela. */
  ok(/var txt = textoDaCelula\(d\.v\(u\)\);\s*\n\s*if \(d\.busca\) txt \+= ' ' \+ String\(d\.busca\(u\)\)\.toLowerCase\(\);/.test(adm),
    'e quando a célula mostra um resumo, a coluna ACRESCENTA o que ficou de fora — o ' +
    '"+5" da frota não pode tornar cinco placas inencontráveis, e o aviso escrito na ' +
    'célula não pode sumir junto');

  /* --- a coluna da frota ----------------------------------------------------
   * O cadastro guarda IDs; a coluna mostra PLACA. Guardar ID e mostrar ID seria pedir
   * ao escritório que decorasse código de veículo. */
  ok(/veiculo:  \{ t: TIT\['veiculo'\]/.test(adm) && /function placasDe\(u\)\{/.test(adm),
    'a tabela de usuários tem coluna de Veículo, com as placas que a pessoa pode escolher');
  ok(/busca: function\(u\)\{ return placasDe\(u\)\.join\(' '\); \}/.test(adm),
    'e a busca enxerga TODAS as placas, inclusive as que o "+N" resumiu');
  /* QUANTAS CABEM É MEDIDA, não gosto. Na régua, com a largura de fábrica: as duas
     etiquetas de placa e o "+3" somam 165px, e com os vãos e os 20px de recheio dão
     192 — contra os 180 que a coluna tinha. A última etiqueta terminava DOIS PIXELS
     fora da célula e entrava na coluna vizinha, porque a tabela é `fixa` e o que não
     cabe não encolhe: transborda. Com 200px sobram 26, e a linha fica da mesma altura
     das outras. As duas metades andam juntas — soltar uma delas devolve o estouro. */
  ok(/veiculo:200/.test(adm) && /placas\.slice\(0, 2\)/.test(adm) &&
     /placas\.length > 2/.test(adm),
    'e a coluna mostra DUAS placas em 200px: medido, três em 180 terminavam fora da ' +
    'célula e entravam na coluna vizinha');
  /* UM VEÍCULO EXCLUÍDO que ficou marcado no cadastro sai da lista em vez de virar
     código cru na tela — o vínculo órfão é assunto do cadastro de Veículos. */
  ok(/return v \? v\.Placa : null;\s*\n\s*\}\)\.filter\(Boolean\);/.test(adm),
    'e placa de veículo que não existe mais some, em vez de aparecer como código');
  /* NADA MARCADO = NENHUM, e o veículo é OBRIGATÓRIO nas duas telas de lançamento:
     quem lança e não tem placa liberada não consegue salvar nada. É o mesmo caso do
     "painel: falta a senha" — permissão que não se exerce —, e o sintoma é a pessoa
     ligando para dizer que o app não deixa. Quem não lança não tem o problema. */
  ok(/return u\.TemPin\s*\n\s*\? '<span class="tag amarela"[\s\S]{0,220}nenhum liberado/.test(adm),
    'e quem lança sem nenhuma placa liberada aparece em âmbar: o veículo é obrigatório ' +
    'na Saída e no Retorno, e essa pessoa não consegue lançar');
  ok(/: '<span class="tag cinza">—<\/span>';/.test(adm),
    'mas quem não lança fica em cinza — para ela é um campo que não usa, e âmbar ali ' +
    'seria alarme sobre coisa nenhuma');

  /* --- a aba do quadro reconta ---------------------------------------------- */
  ok(/card\.querySelectorAll\('\.corpo tbody tr'\)\.length \|\|\s*\n?\s*card\.querySelectorAll\('\.corpo \.users > \.u'\)\.length/
    .test(adm),
    'a aba do quadro conta linhas de tabela OU cartões — contando só `tbody tr`, ela ' +
    'dizia "—" para treze pessoas no celular');
  ok((adm.match(/atualizarContagens\(\);/g) || []).length === 3,
    'e reconta nos três caminhos: ao montar as dobras, e ao redesenhar a lista em ' +
    'cada largura — senão filtrar por perfil deixava a aba com o número de antes');

  /* --- a entrada dos cartões ------------------------------------------------ */
  ok(/var atraso = Math\.min\(\(i \|\| 0\) \* 55, 440\);/.test(adm),
    'os cartões entram escalonados, com teto: sem ele o décimo terceiro entraria depois ' +
    'de setecentos milissegundos, e a lista demoraria a assentar onde ela é mais longa');
  ok(/\.users \.u\{animation:entra-u [^}]*animation-delay:var\(--d,0ms\)\}/.test(css),
    'e o atraso que o cartão carrega é o que a regra lê');
  ok(/\.users\[data-sem-entrada\] \.u\{animation:none\}/.test(css) &&
     /\(digitando === true \? ' data-sem-entrada' : ''\)/.test(adm),
    'enquanto se digita a entrada é desligada — a lista se refaz a cada tecla, e quatro ' +
    'décimos por letra viram tremedeira debaixo do dedo');

  /* --- o que pede providência respira, e só ele ----------------------------- */
  ok(/\.u__acesso \.pilha-selos \.tag\.amarela,\s*\n?\.u__acesso \.pilha-selos \.tag\.vermelha\{animation:respira-selo/
    .test(css),
    'no cartão, só o selo que pede providência pulsa — nos cinco, seria a tela inteira ' +
    'pulsando e não apontaria nada');
  ok(/\.u__acesso \.pilha-selos \.tag::before\{content:"";width:6px/.test(css),
    'e os selos ganham a bolinha que os liga ao estado, em vez de duas etiquetas soltas');
  /* QUEM PEDIU MENOS MOVIMENTO RECEBE NENHUM: a tela diz a mesma coisa parada, e para
     quem tem enxaqueca ou vertigem o enfeite custa caro. */
  ok(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]{0,400}\.users \.u,\.folha,\.veu-folha,[\s\S]{0,200}animation:none!important/
    .test(css),
    'com "menos movimento" ligado, a entrada, a folha e o selo param de animar');
  ok(/\.folha:not\(\[hidden\]\)\{animation:sobe-folha/.test(css),
    'a folha sobe de baixo: aparecendo de uma vez, ela não diz de onde veio');

  var iCU = adm.indexOf('function cartaoUser(u, i)');
  var cartao = adm.slice(iCU, adm.indexOf('\n  function barraOrdemUser', iCU));
  ok(iCU > 0 && cartao.length > 700, 'o cartão de usuário tem corpo', cartao.length);

  /* COM QUE NOME A PESSOA ENTRA é o dado que se vem buscar nesta tela — mais do que o
     e-mail, que na tabela vinha antes dele. */
  ok(cartao.indexOf('Entra como') < cartao.indexOf('u.Email'),
    'o login vem antes do e-mail no cartão: é o dado que se vem buscar aqui');
  ok(/u__d--user b\{font-family:var\(--fonte-mono\)/.test(css),
    'e sai em mono, para não se confundir com o nome da pessoa');

  /* O ESTADO DE ACESSO sai dos MESMOS selos da tabela. Escrito de novo, o dia em que
     "provisória" virasse outra coisa as duas telas discordariam sobre a mesma pessoa. */
  ok(/seloSenha\(u\.TemPin, u\.PinProvisorio, 'lançamento'\)/.test(cartao) &&
     /seloSenha\(u\.TemSenha, u\.SenhaProvisoria, 'painel'\)/.test(cartao),
    'os selos de acesso saem da MESMA função da tabela');
  ok((adm.match(/function seloSenha\(/g) || []).length === 1,
    'que existe uma vez só');

  /* "PAINEL: SEM SENHA" NÃO É NEUTRO. No lançamento, sem senha quer dizer que a pessoa
     não usa o app. No painel, ela TEM a porta liberada e não tem como abri-la: a entrada
     exige senha. Não é buraco de segurança — é permissão que não se exerce, e o sintoma
     é a pessoa ligar dizendo que não entra. */
  ok(/if \(!temSenha && rotulo === 'painel'\)/.test(adm) &&
     /painel: falta a senha/.test(adm),
    'o painel sem senha se anuncia como falta, e não como um fato neutro em cinza');
  ok(/'<span class="tag amarela" title="Tem o painel liberado/.test(adm),
    'em âmbar: pede providência, e não é o vermelho de quem está exposto');

  /* A CONTA DO ACESSO FRÁGIL SOBREVIVEU À TARJA. A tarja vermelha do topo saiu a
     pedido, mas a SOMA não podia sair com ela: é o único lugar que junta o que os selos
     dizem cartão a cartão. Ela foi para a barra de contagem, em texto curto. */
  ok(/contagemAcessoUser\(\)\+'<\/span>'/.test(adm),
    'a barra de contagem diz quantas pessoas estão com o acesso frágil');
  ok((adm.match(/function contagemAcessoUser\(\)/g) || []).length === 1,
    'e a conta existe uma vez só');
  ok(!/aviso-box[^']*">'\+\s*\n?\s*partes\.join/.test(adm) &&
     !/function avisoAcessoUser\(\)/.test(adm),
    'a tarja vermelha do topo saiu — o que ela dizia continua, sem interromper a lista');
  ok(/if \(!partes\.length\) return '';/.test(adm),
    'e some quando não há o que contar — aviso permanente vira paisagem');
  ok(/a entrada do painel exige senha, então elas não conseguem acessar\./.test(adm),
    'a conta diz o que o número QUER DIZER: quem tem o painel liberado sem senha não ' +
    'consegue entrar, e não "está exposto"');
  ok(/Provisória sem prazo é porta aberta permanente\./.test(adm),
    'e separa disso a provisória, que FUNCIONA enquanto ninguém trocar');
  /* Em âmbar, e não em vermelho: pede providência, não anuncia exposição. */
  ok(/\.secao__alerta\{color:var\(--ambar-forte\)\}/.test(css),
    'a conta sai em âmbar na barra — vermelho ali seria um susto por uma permissão ' +
    'que simplesmente não se exerce');

  /* AS TRÊS AÇÕES não foram reescritas: os botões da folha carregam os MESMOS atributos
     da tabela, e quem os liga é o mesmo `ligarBotoesUsuarios()`. */
  var iLA = adm.indexOf('function ligarAcoesUser(box)');
  var folha = adm.slice(iLA, adm.indexOf('\n  function ligarBotoesUsuarios', iLA));
  ok(iLA > 0 && folha.length > 700, 'a folha do usuário tem corpo', folha.length);
  ['data-editar-user', 'data-ativar', 'data-excluir-user'].forEach(function (a) {
    ok(folha.indexOf(a) > 0, 'a folha usa o MESMO ' + a + ' da tabela');
  });
  ok(/ligarBotoesUsuarios\(\);/.test(folha),
    'e é o mesmo `ligarBotoesUsuarios` que as liga — nenhuma ação foi reescrita para o ' +
    'celular');
  ok((adm.match(/acao:'excluir', aba:'Usuarios'/g) || []).length === 1,
    'a chamada que exclui usuário existe uma vez só');

  /* O CONTEXTO antes das opções, como na folha de Movimentos. E o que ele DIZ, não só
     onde está: a linha podia continuar lá, escrevendo vazio, e a folha ofereceria
     "Excluir" sem dizer de quem — dois toques a partir de uma lista de treze nomes. */
  ok(folha.indexOf('ctx.textContent') < folha.indexOf('corpo.innerHTML'),
    'a folha diz QUEM está sendo mexido antes de oferecer o que fazer');
  ok(/ctx\.textContent = \(u\.Usuario \? '@'\+u\.Usuario/.test(folha) &&
     /\(u\.Perfil\|\|''\)\+\(lp \? ' · '\+lp\.Nome : ''\)/.test(folha),
    'e diz quem: o login, o perfil e o local — os três que distinguem dois homônimos');
  ok(/t\.textContent = u\.Nome \|\| 'Usuário';/.test(folha),
    'com o nome no título da folha');
  /* E fecha ao escolher: a ação abre um formulário ou uma confirmação, e a folha por
     cima deles esconde justamente o que se vai confirmar. */
  ok(/corpo\.querySelectorAll\('button'\)\.forEach\(function\(x\)\{\s*\n?\s*x\.addEventListener\('click', fecharFolhas\);/
    .test(folha),
    'e sai da frente quando a ação começa');

  /* SEM `disabled` NO EXCLUIR. O servidor é quem sabe se a pessoa já lançou, e ele já faz
     a coisa certa: inativa em vez de apagar. Desabilitar aqui exigiria um dado que a tela
     não tem, e adivinhar seria pior do que esperar a resposta. */
  /* No BOTÃO, e não no arquivo: o comentário logo acima explica por que não há
     `disabled`, e citá-lo fazia a afirmação encontrar a própria explicação. */
  ok(!/<button class="opcao perigo"[^']*disabled/.test(folha),
    'o excluir não é desabilitado por palpite — quem sabe se a pessoa já lançou é o ' +
    'servidor, e ele responde inativando');
  ok(/quem já lançou é INATIVADO em vez de apagado/.test(folha),
    'e a folha diz isso antes, em vez de deixar a descoberta para depois do toque');
})();

console.log('\n== nome de classe só tem UM dono ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* QUATRO VEZES NUMA SESSÃO o mesmo defeito: uma peça nova nasceu com o nome de uma que
     já existia, herdou o desenho dela e saiu torta na tela.
       `.dia`  — era o separador de dia dos Lançamentos, e é `display:flex`. O cartão do
                 extrato herdou o flex e saiu deitado, com a rota ao lado do saldo.
       `.item` — era a linha de cadastro, com fundo e borda próprios. A linha de caixa do
                 cartão de Movimentos virou uma caixinha cheia.
       `.itens` — a caixa em volta dela, pelo mesmo motivo. Esta foi pega por ESTA
                 conferência, antes de chegar à tela.
     Nenhum dava erro. Os três apareceram na FOTO, e um deles depois de publicado.

     Esta conferência lista as classes das peças novas e cobra que cada uma tenha UM
     bloco de regra. Não pega toda colisão do arquivo — pega a destas famílias, que é
     onde elas vêm acontecendo, e cresce quando a próxima peça entrar na lista. */
  var DONO_UNICO = [
    'ext-dia', 'ext-dia__topo', 'ext-dia__data', 'ext-dia__n',
    'extrato', 'ordenar', 'movs', 'mov', 'mov__topo', 'mov__quando', 'mov__quem',
    'mov__pe', 'mov__total', 'mov-item', 'mov-itens', 'acoes-btn',
    'folha', 'folha__cab', 'folha__corpo', 'folha__t', 'folha__ctx', 'veu-folha',
    'opcao', 'pill', 'aplicados', 'filtros-caixa', 'so-celular',
    'users', 'u', 'u__topo', 'u__ini', 'u-linha', 'u-linha__r', 'retrato__f', 'foto-campo', 'u__nome', 'u__dados', 'u__acesso', 'u__pe',
    'acoes-topo', 'trilho', 'chip__n', 'so-largo', 'secao__alerta',
    /* As do Painel da Operação. `rt` e `cli` são curtas de propósito — e é exatamente
       nome curto que já colidiu quatro vezes aqui. */
    'rotas', 'rt', 'rt__topo', 'rt__nome', 'rt-n', 'rt-n__i', 'rt__pe', 'rt__nada', 'rt--linha',
    'clis', 'cli', 'cli__topo', 'cli__nome', 'cli__saldo', 'cli__contato', 'cli__pe',
    'galps', 'galp', 'galp__topo', 'galp__nome', 'galp__saldo', 'galp__tipos',
    'chip-tipo'
  ];
  /* As ANTIGAS entram na mesma conta. Elas têm um dono legítimo cada — e é justamente
     por cima delas que as peças novas caíram. Renomear a nova de volta para `.item`
     passava despercebido enquanto a lista só olhava os nomes novos. */
  DONO_UNICO = DONO_UNICO.concat(['item', 'itens', 'dia', 'secao']);

  /* UMA REGRA DENTRO DE `@media` É OVERRIDE, NÃO SEGUNDO DONO. `.so-celular` é
     `display:none` na base e `display:flex` no celular de propósito — contá-la como
     colisão faria a conferência acusar justamente o padrão que se quer usar.

     O que ela procura é DOIS DONOS NO MESMO NÍVEL: duas regras base para o mesmo nome,
     que foi o defeito das quatro vezes. */
  function semMedia(texto) {
    var fora = '', i = 0;
    while (i < texto.length) {
      var m = texto.indexOf('@media', i);
      if (m < 0) { fora += texto.slice(i); break; }
      fora += texto.slice(i, m);
      var k = texto.indexOf('{', m), d = 0;
      for (; k < texto.length; k++) {
        if (texto[k] === '{') d++;
        else if (texto[k] === '}') { d--; if (!d) break; }
      }
      i = k + 1;
    }
    return fora;
  }
  var cssBase = semMedia(css);

  function donos(c, onde) {
    /* O seletor no INÍCIO de uma regra, e não em qualquer lugar: `.mov__topo` cita
       `.mov` e não é uma segunda definição dele. `\n\s*` porque dentro de um `@media`
       a regra vem indentada. */
    var re = new RegExp('(^|\\n)\\s*\\.' + c.replace(/[-_]/g, '[-_]') + '(\\{|,|\\s*\\{)', 'g');
    return ((onde || css).match(re) || []).length;
  }
  var repetidas = DONO_UNICO.filter(function (c) { return donos(c, cssBase) > 1; });
  ok(repetidas.length === 0,
    'nenhuma classe destas telas tem dois donos no CSS — com o mesmo nome, a peça ' +
    'herda o desenho da outra e sai torta, sem erro nenhum', repetidas);

  /* E TODAS EXISTEM. Sem isto, apagar uma classe — ou renomeá-la de volta para a que já
     tinha dono — passava como "não tem repetida", que é verdade e não é o que importa. */
  var sumidas = DONO_UNICO.filter(function (c) { return donos(c) === 0; });
  ok(sumidas.length === 0,
    'e todas continuam existindo — a conferência de repetição sozinha aprova uma ' +
    'classe que simplesmente sumiu', sumidas);
  ok(!/class="item"/.test(fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
       .slice(adm.indexOf('function cartaoMov(g)'), adm.indexOf('function barraOrdemMov'))),
    'e o cartão de Movimentos não usa mais o `.item` que é de outra peça');
})();

console.log('\n== os lançamentos em cartão, no celular ==');
(function () {
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var camp = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* A REGRA DE VERDADE, recortada do `app.js`. */
  var i = js.indexOf('  function agruparLancamentos(lista) {');
  ok(i > 0, 'a regra que junta as linhas de uma remessa mora no `app.js`');
  /* `chaveDoLote` vem junto: ela é a chave do agrupamento, e a tela a usa DE NOVO para
     achar as linhas de um cartão. Fora do recorte, o teste rodaria uma versão da regra
     que não existe. */
  var iChave = js.indexOf('  function chaveDoLote(m) {');
  ok(iChave > 0, 'e a chave dela também, num lugar só');
  var agrupar = new Function(
    js.slice(iChave, js.indexOf('\n  }', iChave) + 4) +
    js.slice(i, js.indexOf('\n  }', i) + 4) +
    '\n return agruparLancamentos;')();

  function mv(id, lote, cx, qtd, extra) {
    var m = { id: id, lote: lote, tipo: 'SAIDA', dataRef: '2026-09-17',
              dataHora: '2026-09-17T11:42:00', origem: 'Matriz', destino: 'João Pessoa',
              origemId: 'L1', destinoId: 'L2', motorista: 'Isaque', usuario: 'Nestor',
              usuarioId: 'U1', teste: false, situacao: 'Enviada', obs: '', romaneio: '',
              tipoCaixa: cx, tipoCaixaId: cx, qtd: qtd,
              /* A FORMA QUE O SERVIDOR MANDA para quem nunca foi mexido: o objeto
                 EXISTE, com `vezes: 0`. Fingir `null` aqui fazia a afirmação de baixo
                 passar por outro motivo — o `alterado &&` bastava, e ninguém estava
                 medindo o `vezes`. */
              alterado: { por: '', em: '', campo: '', motivo: '', vezes: 0 } };
    Object.keys(extra || {}).forEach(function (k) { m[k] = extra[k]; });
    return m;
  }

  /* CINCO LINHAS, UMA REMESSA. É o caso da foto: uma carga com cinco tipos de caixa
     ocupava cinco linhas repetindo data, rota e motorista. */
  var um = agrupar([mv('M1', 'k:A', 'P', 300), mv('M2', 'k:A', 'G', 300),
                    mv('M3', 'k:A', 'GG', 300), mv('M4', 'k:A', 'IFCO', 300),
                    mv('M5', 'k:A', 'DIVERSAS', 500)]);
  ok(um.length === 1, 'cinco linhas do mesmo envio viram UM cartão', um.length);
  ok(um[0].itens.length === 5, 'com as cinco caixas dentro dele', um[0].itens.length);
  ok(um[0].total === 1700, 'e o total é a soma delas', um[0].total);
  ok(um[0].origem === 'Matriz' && um[0].motorista === 'Isaque' && um[0].usuarioId === 'U1',
    'o cartão herda a viagem e o dono — é por ele que se decide quem pode corrigir');

  var dois = agrupar([mv('M1', 'k:A', 'P', 300), mv('M9', 'k:B', 'P', 10)]);
  ok(dois.length === 2, 'e dois envios continuam dois cartões', dois.length);

  /* O TIPO DE CAIXA REPETIDO NÃO SOMA. Duas linhas de CX P no mesmo lote são dois
     envios que caíram na mesma chave — acontece com as linhas antigas, sem `ClientKey`,
     gravadas no mesmo segundo. Somadas, virariam uma quantidade que ninguém lançou. */
  var rep = agrupar([mv('M1', 'x:A', 'P', 300), mv('M2', 'x:A', 'P', 40)]);
  ok(rep.length === 2,
    'caixa repetida no mesmo lote abre outro cartão — somada, viraria uma quantidade ' +
    'que ninguém lançou', rep.map(function (g) { return g.total; }));
  ok(rep[0].total === 300 && rep[1].total === 40,
    'e cada um fica com o número que foi lançado mesmo',
    [rep[0].total, rep[1].total]);

  /* A terceira linha da MESMA caixa não pode voltar para o primeiro grupo. */
  var tres = agrupar([mv('M1', 'x:A', 'P', 1), mv('M2', 'x:A', 'P', 2), mv('M3', 'x:A', 'P', 4)]);
  ok(tres.length === 3 && tres[2].total === 4,
    'e a terceira repetição não volta para o primeiro cartão',
    tres.map(function (g) { return g.total; }));

  ok(agrupar([]).length === 0 && agrupar(null).length === 0,
    'lista vazia, ou nenhuma, não estoura');

  /* A ORDEM É A DE CHEGADA. Quem ordena é a lista; reordenar aqui faria a tela
     discordar do servidor sem nenhum motivo visível. */
  var ordem = agrupar([mv('M1', 'k:B', 'P', 1), mv('M2', 'k:A', 'P', 2)]);
  ok(ordem[0].lote === 'k:B' && ordem[1].lote === 'k:A',
    'a ordem de chegada é mantida — quem ordena é a lista',
    ordem.map(function (g) { return g.lote; }));

  /* A CORREÇÃO MAIS RECENTE representa o cartão: corrigir um tipo de caixa corrige o
     lançamento aos olhos de quem olha, e o cartão é o lançamento. */
  var comAlt = agrupar([
    mv('M1', 'k:A', 'P', 1, { alterado: { por: 'Ana', em: '2026-09-17T10:00:00', vezes: 1 } }),
    mv('M2', 'k:A', 'G', 1, { alterado: { por: 'Bia', em: '2026-09-18T10:00:00', vezes: 1 } })
  ]);
  ok(comAlt[0].alterado && comAlt[0].alterado.por === 'Bia',
    'o cartão mostra a correção mais RECENTE do lote', comAlt[0].alterado);
  ok(agrupar([mv('M1', 'k:A', 'P', 1)])[0].alterado === null,
    'e cartão sem correção nenhuma não inventa uma');

  /* ---- a tela troca de forma, e uma de cada vez ---- */
  ok(/function emCartoes\(\)/.test(camp) &&
     /max-width:1023px/.test(camp),
    'a tela troca de forma em 1024px — o mesmo corte em que o menu lateral vira gaveta');
  ok(/emCartoes\(\) \? cartoesLanc\(lista, s\) : tabelaLanc\(lista, s\)/.test(camp),
    'e monta UMA das duas, não as duas com uma escondida — com 2.000 lançamentos, o ' +
    'dobro do trabalho para mostrar metade');
  ok(/matchMedia\('\(max-width:1023px\)'\)\.addEventListener\('change'/.test(camp),
    'girar o celular redesenha — desenhado só na abertura, o app ficaria com a forma ' +
    'da largura de quando abriu');
  ok(/if \(LANC && LANC\.length\) desenharLanc\(\);/.test(camp),
    'e redesenha da cópia em memória: girar o aparelho não custa uma ida de rede');

  /* ---- o cartão mostra o que a tabela mostrava ---- */
  var ic = camp.indexOf('function cartaoLanc(g, s)');
  var cartao = camp.slice(ic, camp.indexOf('\n  function ligarCorrigir', ic));
  ok(cartao.length > 600, 'o recorte do cartão pegou o corpo dele', cartao.length);
  [['g.origem', 'a origem'], ['g.destino', 'o destino'], ['g.motorista', 'o motorista'],
   ['g.usuario', 'quem lançou'], ['g.total', 'o total de caixas'],
   ['Q.horaBR(g.dataHora)', 'a hora']].forEach(function (p) {
    ok(cartao.indexOf(p[0]) > 0, 'o cartão traz ' + p[1], p[0]);
  });
  ok(/i\.tipoCaixa/.test(cartao) && /i\.qtd/.test(cartao),
    'e uma quantidade por tipo de caixa — é disso que a tabela fazia cinco linhas');
  ok(/g\.teste \?/.test(cartao), 'a etiqueta de ensaio não some no celular');
  ok(/alt\.vezes \?/.test(cartao), 'nem a marca de corrigido');
  ok(/Q\.podeCorrigir\(s, g\)/.test(cartao),
    'e o botão de corrigir sai da MESMA regra da tabela');
  ok(/data-corrigir="'\+Q\.esc\(g\.lote\)/.test(cartao),
    'o botão do cartão leva o LOTE, porque o cartão é a remessa inteira');

  ok(/\.cartoes\{/.test(css) && /\.lanc\{/.test(css) && /\.qtds\{/.test(css),
    'o desenho do cartão está no CSS compartilhado, e não solto na tela');
})();

console.log('\n== quem corrige o quê: uma regra, duas telas ==');
(function () {
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var camp = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var lg = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* AS REGRAS DE VERDADE, recortadas do `app.js`. */
  function fn(nome, assinatura) {
    var k = js.indexOf('  function ' + assinatura);
    if (k < 0) throw new Error('não achei: ' + nome);
    return js.slice(k, js.indexOf('\n  }', k) + 4);
  }
  var corpoPode = fn('podeCorrigir', 'podeCorrigir(s, m) {');
  var corpoLivre = fn('correcaoLivre', 'correcaoLivre(s, m, agora) {');
  var corpoUTC = fn('comoUTC', 'comoUTC(carimbo) {');
  var podeCorrigir = new Function(corpoPode + '\n return podeCorrigir;')();
  var correcaoLivre = new Function(corpoUTC + corpoLivre + '\n return correcaoLivre;')();

  var galpao = { id: 'U002', perfil: 'GALPAO', via: 'pin' };
  var adminS = { id: 'U001', perfil: 'ADMIN', via: 'senha' };
  /* O relógio das afirmações é fixo, e os prazos são relativos a ele: com `new Date()`
     solto, a afirmação "ainda dentro do prazo" viraria falsa dez minutos depois de
     alguém rodar o teste devagar. */
  var AGORA = new Date('2026-09-17T14:00:00Z');
  function em(min) { return new Date(AGORA.getTime() + min * 60000).toISOString(); }

  /* TODO LANÇAMENTO TEM O BOTÃO. Antes ele só nascia para o autor e para o admin, e
     quem precisava consertar o lançamento de um colega que já foi embora não tinha nem
     por onde começar — a tela não dizia "peça a senha", simplesmente não mostrava nada. */
  ok(podeCorrigir(galpao, { id: 'M2', usuarioId: 'U003' }) === true &&
     podeCorrigir(galpao, { id: 'M1', usuarioId: 'U002' }) === true,
    'todo lançamento tem o botão de corrigir — o que muda é o que ele PEDE');
  ok(podeCorrigir(null, { id: 'M1' }) === false && podeCorrigir(galpao, null) === false,
    'sem sessão não há quem assine a correção, e o histórico ficaria sem autor');

  /* E O QUE ELE PEDE sai de `correcaoLivre`: próprio autor, dentro do prazo, no mesmo
     dia. Fora disso, a senha do escritório. */
  var meuNoPrazo = { id: 'M1', usuarioId: 'U002', livreAte: em(6) };
  var meuVencido = { id: 'M1', usuarioId: 'U002', livreAte: em(-1) };
  var dela = { id: 'M2', usuarioId: 'U003', livreAte: em(6) };
  var deOutroDia = { id: 'M3', usuarioId: 'U002', livreAte: '' };

  ok(correcaoLivre(galpao, meuNoPrazo, AGORA) === true,
    'o próprio autor conserta de graça enquanto o prazo corre');
  ok(correcaoLivre(galpao, meuVencido, AGORA) === false,
    'passado o prazo, pede senha — o número já foi visto, já entrou num saldo');
  ok(correcaoLivre(galpao, dela, AGORA) === false,
    'o lançamento de outra pessoa pede senha, mesmo dentro do prazo dela');
  ok(correcaoLivre(galpao, deOutroDia, AGORA) === false,
    'e o de outro dia também — `livreAte` vazio é o servidor dizendo que o dia fechou');
  ok(correcaoLivre(adminS, dela, AGORA) === false,
    'nem o ADMIN escapa: a senha é a chave de todo conserto fora de prazo');
  ok(correcaoLivre(null, meuNoPrazo, AGORA) === false &&
     correcaoLivre(galpao, null, AGORA) === false,
    'sem sessão, ou sem lançamento, não há conserto livre');
  ok(correcaoLivre({ perfil: 'GALPAO' }, { id: 'M3', livreAte: em(6) }, AGORA) === false,
    'sessão sem id não casa com lançamento sem dono — `undefined` batendo com ' +
    '`undefined` abriria o prazo de todo lançamento órfão');
  ok(correcaoLivre(galpao, { id: 'M1', usuarioId: 'U002', livreAte: 'não é data' }, AGORA) === false,
    'e prazo ilegível fecha, não abre');

  /* O PRAZO NÃO ESTÁ ESCRITO NA TELA. Os dez minutos no navegador seriam dois números
     sobre a mesma regra, e no dia em que discordassem a tela ofereceria o conserto livre
     para o servidor recusar em seguida. */
  ok(!/10\s*\*\s*60000|600000|JANELA/.test(corpoLivre),
    'a tela não recalcula os dez minutos — ela compara com o prazo que o servidor mandou',
    corpoLivre.slice(-200));
  ok(/livreAte: livreAte\(m, agoraLista\)/.test(lg),
    'e o servidor manda esse prazo pronto em cada lançamento');
  ok(/JANELA_CORRECAO_MIN = 10/.test(lg),
    'o número dos dez minutos mora num lugar só, no servidor');

  /* O ID, E NÃO O NOME. Dois homônimos no cadastro e a comparação por nome daria a um o
     prazo do outro — e o app de campo lista pelo nome, então o engano seria invisível. */
  ok(/m\.usuarioId/.test(corpoLivre) && !/m\.usuario\b(?!Id)/.test(corpoLivre),
    'a comparação é pelo ID de quem lançou, não pelo nome', corpoLivre.slice(-160));
  ok(/usuarioId: m\.UsuarioID/.test(lg),
    'e o servidor manda esse id na lista — sem ele nenhum conserto seria livre');

  /* O CARIMBO PASSA PELO MESMO `comoUTC` da coluna Hora: o prazo vem do servidor sem
     marca de fuso, e lido como hora local ele valeria três horas a mais. */
  ok(/comoUTC\(m\.livreAte\)/.test(corpoLivre),
    'o prazo é lido como UTC, como todo carimbo que vem do servidor');

  /* ---- o campo de senha, nas duas telas --------------------------------------
     Sem ele a correção trancada volta recusada e a tela não diz o que fazer. */
  var iForma = camp.indexOf('function formCorrigirCampo(m, botao)');
  var formaSenha = camp.slice(iForma, camp.indexOf('\n  function porqueTrancado', iForma));
  ok(/var livre = Q\.correcaoLivre\(Q\.sessao\(\), m\)/.test(formaSenha),
    'o app de campo decide livre ou trancado na ABERTURA — a pessoa precisa saber que ' +
    'vai pedir senha antes de preencher sete campos');
  ok(/\(livre \? '' :[\s\S]{0,400}id="crSenha"/.test(formaSenha),
    'e o campo de senha aparece quando o conserto está trancado');
  ok(/porqueTrancado\(m\)/.test(formaSenha) && /function porqueTrancado\(m\)\{/.test(camp),
    'com o MOTIVO ao lado — "não deu certo" sem dizer por quê faz tentar de novo');
  ok(/if \(senha\) pedido\.senha = senha;/.test(camp),
    'a senha vai em TODAS as linhas da remessa: o servidor confere uma por uma, e a ' +
    'segunda voltaria recusada com a primeira já gravada');

  ok(/Q\.correcaoLivre\(s, m\) \? '' :[\s\S]{0,400}id="cSenha"/.test(adm),
    'o painel tem o mesmo campo, pela mesma regra — é a mesma rota que confere os dois');
  ok(/Q\.post\(\{acao:'corrigir', id:m\.id, usuarioId:s\.id, senha:senhaDita,/.test(adm),
    'e o painel manda a senha junto — sem ela, toda correção de escritório volta recusada');

  /* AS DUAS TELAS CHAMAM A MESMA REGRA. Uma delas escrevendo a sua cópia é o defeito que
     já aconteceu neste projeto, com a porta do painel: aparecia numa tela e era recusada
     na outra. */
  ok(/Q\.podeCorrigir\(Q\.sessao\(\), m\)/.test(adm),
    'o painel pergunta à regra quem pode corrigir');
  ok(/Q\.podeCorrigir\(s, m\)/.test(camp),
    'e o app de campo pergunta à MESMA regra');

  /* O CONSERTO DO CAMPO CHAMA A ROTA DO PAINEL. Uma segunda rota faria a correção do
     campo não escrever o mesmo histórico — e o painel não teria como mostrá-la. */
  ok(camp.indexOf("acao:'corrigir'") > 0,
    'o app de campo grava pela mesma rota `corrigir` do painel — é isso que faz a ' +
    'correção feita no galpão aparecer em Movimentos');
  ok(/data-corrigir=/.test(camp), 'há um botão de corrigir por linha');
  ok(/function formCorrigirCampo\(m, botao\)/.test(camp),
    'e um formulário que abre na própria tela');

  /* A TELA QUE DEIXA CORRIGIR MOSTRA QUE FOI CORRIGIDO. Sem a marca, o número da linha
     pode não ser mais o que aquela pessoa digitou, e a coluna "quem lançou" ao lado dele
     vira uma afirmação errada — é a mesma informação que o painel dá em "Alterado por". */
  /* NAS DUAS FORMAS, e conferido em cada uma. Procurando no arquivo inteiro, a marca do
     CARTÃO respondia pela da TABELA: arrancada da tabela, a afirmação continuava
     passando porque a do cartão existia. */
  var tabLanc = corpo('tabelaLanc');
  var cartLanc = corpo('cartaoLanc');
  [['tabelaLanc', tabLanc], ['cartaoLanc', cartLanc]].forEach(function (p) {
    ok(/alt\.vezes \?[\s\S]{0,400}>corrigido<\/span>/.test(p[1]),
      p[0] + ': a linha já corrigida se anuncia, e a marca sai do histórico — não de ' +
      'um palpite', p[1].slice(0, 60));
    ok(/data-corrigir="'\+Q\.esc\(/.test(p[1]),
      p[0] + ': e todo lançamento tem o botão de corrigir', p[1].slice(0, 60));
  });

  var iF = camp.indexOf('function formCorrigirCampo(m, botao)');
  var forma = camp.slice(iF, camp.indexOf('\n  function fecharCorrecoes', iF));
  ok(forma.length > 800, 'o recorte do formulário pegou o corpo dele', forma.length);

  /* O QUE O CAMPO NÃO CORRIGE, e de propósito. Trocar o autor de um lançamento é ato de
     escritório; e o app de campo nem recebe a lista de usuários, que sai da rota
     `equipe` para não expor o nome de todo mundo a quem só abre o endereço. */
  ok(forma.indexOf('crUsuario') < 0 && forma.indexOf('Quem fez o envio') < 0,
    'o app de campo não troca o AUTOR do lançamento — isso é ato de escritório, e a ' +
    'lista de usuários nem chega a esta tela');
  ok(forma.indexOf('UsuarioID:') < 0,
    'e não manda `UsuarioID` no pedido: mandado vazio, ele apagaria o dono da linha');

  /* MOTIVO OBRIGATÓRIO, dos dois lados. Sem ele o histórico ganha uma linha que ninguém
     consegue explicar depois — que é justamente para o que o histórico serve. */
  ok(/if \(!motivo\) return Q\.toast/.test(forma),
    'a tela recusa a correção sem motivo');
  ok(/carregarLanc\(\);/.test(forma),
    'e recarrega do servidor depois de gravar — remendada na tela, a linha mostraria o ' +
    'número novo e os cartões de cima continuariam somando o antigo');

  /* FECHAR ANTES DE ABRIR. Dois formulários abertos têm os MESMOS ids, e o
     `getElementById` passaria a ler o do primeiro — gravando os valores da linha errada. */
  ok(/fecharCorrecoes\(\);\s*\n\s*if \(jaAberta\) return;/.test(forma),
    'abrir um conserto fecha o outro — dois abertos repetem os ids, e gravar leria os ' +
    'campos da linha errada');

  /* FORA DA TABELA. Dentro dela o formulário herda a rolagem horizontal do
     `.tabela-wrap` e nasce com a largura de todas as colunas: medido em 430px, metade
     dos campos ficava fora da tela, inclusive o motivo, que é obrigatório. */
  ok(forma.indexOf('correcaoBox') > 0 && forma.indexOf('<td colspan') < 0,
    'o conserto abre FORA da tabela — dentro dela ele herda a rolagem lateral e não ' +
    'cabe no celular');
  ok(/id="correcaoBox"/.test(camp), 'e a lista reserva o lugar dele');
  ok(/em-correcao/.test(camp) && /tr\.em-correcao/.test(css),
    'a linha que está sendo corrigida fica marcada — fora da tabela, o formulário perde ' +
    'a vizinhança que dizia qual lançamento é');
  ok(/Q\.dataBR\(m\.dataRef\)\+' · '/.test(forma),
    'e o próprio formulário diz qual lançamento está consertando');

  /* ---- o conserto da REMESSA INTEIRA ----------------------------------------
     O cartão é o lançamento todo, então o conserto dele também: uma quantidade por
     tipo de caixa, e uma correção por linha que mudou. */
  ok(/m\.itens\.map\(function\(i\)\{[\s\S]{0,300}id="crQ'\+Q\.esc\(i\.id\)/.test(forma),
    'o conserto tem uma quantidade por tipo de caixa — o cartão é a remessa inteira, ' +
    'e quem contou errado contou uma caixa, não a carga');

  /* SÓ AS LINHAS QUE MUDARAM. O servidor recusa uma correção em que nada mudou — e com
     razão, ela encheria o histórico de entradas vazias. Mandar as cinco para consertar
     uma daria quatro recusas e um erro na cara de quem acertou. */
  ok(/var mudouComum =/.test(forma) && /m\.itens\.filter\(function\(i\)\{/.test(forma),
    'e manda só as linhas que mudaram — o servidor recusa correção sem mudança, e as ' +
    'outras quatro voltariam como erro');
  ok(/if \(!envios\.length\) return Q\.toast\('Nada mudou/.test(forma),
    'nada mudou é dito na tela, e não vira uma volta ao servidor para ouvir isso dele');

  /* EM FILA, uma de cada vez. Disparadas juntas, cinco correções do mesmo lote leem o
     histórico ANTES umas das outras, e a última a gravar apaga as quatro entradas
     anteriores — some o registro de quem mexeu, que é justamente o que se quer guardar. */
  ok(/\.reduce\(function\(fila, pedido\)\{[\s\S]{0,200}fila\.then\(/.test(forma),
    'as correções vão em FILA, uma de cada vez — juntas, a última a gravar apagaria o ' +
    'histórico que as outras escreveram');
  ok(/feitas \? feitas\+' corrigido\(s\), e então: '\+erro : erro/.test(forma),
    'e se uma falhar no meio, a tela diz quantas JÁ foram — "falhou" sozinho faria ' +
    'corrigir de novo o que já estava certo');

  /* O TIPO da caixa só se troca quando a remessa tem um tipo só: com cinco no mesmo
     cartão, um seletor de "Caixa" não diz de qual das cinco se fala. */
  ok(/var umaCaixa = m\.itens\.length === 1;/.test(forma) &&
     /umaCaixa\s*\n?\s*\? '<div><label for="crCaixa">/.test(forma),
    'trocar o TIPO da caixa só aparece quando a remessa tem um tipo só');
})();

console.log('\n== a hora do lançamento: o carimbo vem do servidor, que roda em UTC ==');
(function () {
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* As funções de verdade, recortadas do `app.js`. Reescritas aqui, elas passariam a ser
     uma segunda versão da regra, e seria a segunda que este teste aprovaria. */
  function fn(nome) {
    var i = js.indexOf('  function ' + nome + '(');
    if (i < 0) throw new Error('não achei: ' + nome);
    var fim = js.indexOf('\n  }', i);
    if (fim < 0) throw new Error('não fechei: ' + nome);
    return js.slice(i, fim + 4);
  }
  var fonte = ['pad', 'comoUTC', 'horaBR', 'dataDoCarimboBR', 'dataHoraBR']
    .map(fn).join('\n');
  var F = new Function(fonte +
    '\n return { horaBR: horaBR, dataDoCarimboBR: dataDoCarimboBR, dataHoraBR: dataHoraBR };')();

  /* AS ASSERÇÕES NÃO CITAM NENHUMA HORA. O fuso da máquina que roda o teste entraria na
     conta, e o teste passaria no Recife e falharia em Lisboa — ou, pior, passaria nos
     dois por acaso. O que se compara é o comportamento: o carimbo sem marca de fuso tem
     de ser lido do MESMO jeito que o carimbo marcado como UTC. */
  var cru = '2026-09-17T23:30:00';
  ok(F.horaBR(cru) === F.horaBR(cru + 'Z'),
    'carimbo sem fuso é lido como UTC — o servidor roda em UTC, e lido como hora local ' +
    'um lançamento das 20:30 do galpão apareceria às 23:30',
    [F.horaBR(cru), F.horaBR(cru + 'Z')]);
  ok(F.dataDoCarimboBR(cru) === F.dataDoCarimboBR(cru + 'Z'),
    'e a DATA junto — às 23:30 em UTC a diferença de fuso muda o dia, não só a hora',
    [F.dataDoCarimboBR(cru), F.dataDoCarimboBR(cru + 'Z')]);

  ok(F.horaBR(cru + '-03:00') !== F.horaBR(cru + 'Z'),
    'e um carimbo que JÁ traz fuso passa intocado — marcado de novo, o fuso certo seria ' +
    'trocado por outro',
    [F.horaBR(cru + '-03:00'), F.horaBR(cru + 'Z')]);

  /* Vazio e lixo devolvem vazio. Uma célula em branco numa tabela de conferência se
     entende; "Invalid Date" no meio de trezentas linhas, não. */
  ['', null, undefined, 'não é data'].forEach(function (v) {
    ok(F.horaBR(v) === '' && F.dataDoCarimboBR(v) === '' && F.dataHoraBR(v) === '',
      'carimbo ausente ou inválido vira célula vazia, e não "Invalid Date": ' +
      JSON.stringify(v), [F.horaBR(v), F.dataDoCarimboBR(v)]);
  });

  ok(/^\d{2}:\d{2}$/.test(F.horaBR(cru)), 'a hora sai em HH:MM', F.horaBR(cru));
  ok(/^\d{2}\/\d{2}\/\d{4}$/.test(F.dataDoCarimboBR(cru)),
    'e a data em dd/mm/aaaa', F.dataDoCarimboBR(cru));
  ok(F.dataHoraBR(cru) === F.dataDoCarimboBR(cru) + ' ' + F.horaBR(cru),
    'e as duas juntas são exatamente as duas — não uma terceira formatação',
    F.dataHoraBR(cru));
})();

console.log('\n== a lixeira: o que foi excluído tem por onde voltar ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  var lg = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');

  /* A PENEIRA É UMA SÓ. É o que permitiu a exclusão virar marca sem ter de lembrar de
     filtrar em saldo, painel, extrato, ciclo e lista — cinco lugares, e o esquecido
     deixaria o lançamento "excluído" pesando num saldo que ninguém sabe explicar. */
  ok(/function ativos\(movimentos\)\s*\{[^}]*!m\.Cancelado && !m\.ExcluidoEm/.test(lg),
    'o que está na lixeira sai da MESMA peneira que já tirava o cancelado');
  ok(/function naLixeira\(movimentos\)/.test(lg),
    'e há o avesso dela, para a lixeira listar o que sobrou');

  /* O caminho de volta existe DOS DOIS LADOS: sem a rota, o botão não tem o que chamar;
     sem o botão, a rota é um recurso que ninguém encontra. */
  ok(/acao === 'restaurarMovimento'/.test(idx), 'a API tem a rota que restaura');
  ok(/case 'lixeira':/.test(idx), 'e a rota que lista o que está na lixeira');
  ok(/id="btnLixeira"/.test(adm), 'a tela tem o botão da lixeira');
  ok(/data-restaurar=/.test(adm), 'e um botão de restaurar por linha');
  ok(adm.indexOf("acao:'restaurarMovimento'") > 0,
    'que chama a rota de restaurar — botão sem chamada é enfeite');

  /* EXCLUIR NÃO APAGA MAIS. A linha do `db.remover` era o que tornava o aviso verdadeiro;
     enquanto ela existir, restaurar promete o que não pode cumprir. */
  var iEx = idx.indexOf('async function excluirMovimento');
  var corpoEx = idx.slice(iEx, idx.indexOf('\n}', iEx));
  ok(iEx > 0 && corpoEx.indexOf("db.remover(") < 0,
    'excluir não apaga a linha — marcada e apagada são a mesma palavra na tela, e só ' +
    'uma delas tem volta');
  ok(/montarExclusao/.test(corpoEx), 'ele marca, pela regra que também escreve o histórico');

  var iLim = idx.indexOf('async function limparMovimentos');
  var corpoLim = idx.slice(iLim, idx.indexOf('\n}', iLim));
  ok(iLim > 0 && corpoLim.indexOf('removerVarios') < 0,
    'e o "apagar o que está no filtro" também não apaga — é ele que leva centenas de ' +
    'uma vez, e o que mais precisava de volta');
  ok(/atualizarVarios/.test(corpoLim),
    'ele marca em bloco: linha a linha seriam centenas de idas ao banco numa função ' +
    'com tempo contado, e metade do trabalho ficaria feita quando o tempo acabasse');

  /* O AVISO DIZIA "NÃO TEM VOLTA". Dizia a verdade quando apagava; agora mentiria ao
     contrário, e assustar sem motivo custa o uso do botão certo. */
  var iBot = adm.indexOf("data-excluir]").valueOf();
  var trechoAviso = adm.slice(adm.indexOf('EXCLUIR este lançamento') - 200,
                              adm.indexOf('para confirmar:') + 40);
  ok(iBot > 0 && trechoAviso.indexOf('não tem volta') < 0 &&
     trechoAviso.indexOf('Isto não tem volta') < 0,
    'a confirmação não diz mais "não tem volta" — e tem');
  ok(/LIXEIRA/.test(trechoAviso),
    'ela diz para onde o lançamento vai, que é a pergunta seguinte de quem hesita');
  ok(trechoAviso.indexOf('Escreva') > 0,
    'e a confirmação escrita ficou: o lançamento sai do saldo de alguém no instante do ' +
    'clique, e isso continua valendo mais do que um clique');
})();

console.log('\n== a marca: um desenho só, e do tamanho que ele pede ==');
(function () {
  var raiz = path.join(__dirname, '..');
  var css = fs.readFileSync(path.join(raiz, 'styles.css'), 'utf8');

  /* UM ARQUIVO SÓ. Havia dois com o mesmo desenho, `icone.png` e `logo.png`: trocar a
     marca pedia lembrar dos dois, e o que se esquece de trocar é justamente o que fica
     errado por meses — aqui, o ícone da aba do navegador. */
  ok(!fs.existsSync(path.join(raiz, 'icone.png')),
    'a marca mora num arquivo só — nenhuma segunda cópia do mesmo desenho');

  /* O TAMANHO DECLARADO É O TAMANHO REAL. O `width`/`height` no HTML reserva o espaço
     antes de a imagem chegar; errado, reserva a caixa errada e a tela salta quando o
     download termina — com o dedo já a caminho do botão. */
  var png = fs.readFileSync(path.join(raiz, 'logo.png'));
  ok(png.slice(1, 4).toString() === 'PNG', 'o arquivo da marca é um PNG');
  var larg = png.readUInt32BE(16), alt = png.readUInt32BE(20);

  var usos = 0, errados = [];
  ['index.html', 'admin.html', 'extrato.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(raiz, nome), 'utf8');
    (txt.match(/<img[^>]*src="logo\.png"[^>]*>/g) || []).forEach(function (tag) {
      usos++;
      var w = /width="(\d+)"/.exec(tag), h = /height="(\d+)"/.exec(tag);
      if (!w || !h || +w[1] !== larg || +h[1] !== alt) errados.push(nome + ' ' + tag.slice(0, 64));
    });
    /* Fora dos comentários: o comentário CONTA que o arquivo saiu, e não pode ser
       confundido com alguém ainda apontando para ele. */
    ok(txt.replace(/<!--[\s\S]*?-->/g, '').indexOf('icone.png') < 0,
      nome + ': nada aponta para o arquivo de marca que saiu');
  });
  ok(usos >= 7, 'os lugares da marca carregam o desenho', { usos: usos });
  ok(errados.length === 0,
    'e cada um declara o tamanho REAL do arquivo (' + larg + '×' + alt + ') — declarado ' +
    'errado, o espaço reservado é o errado e a tela salta quando a imagem chega', errados);

  /* O MESMO DESENHO EM TODA PARTE. O painel era a única tela que anunciava outra coisa
     no alto da lateral: quem entrava via o logo no login e, um segundo depois, um cubo
     genérico no mesmo canto. */
  ['index.html', 'admin.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(raiz, nome), 'utf8');
    function trecho(de, ate) {
      var i = txt.indexOf(de);
      return i < 0 ? '' : txt.slice(i, txt.indexOf(ate, i));
    }
    var barra = trecho('<div class="topo__marca">', '</div>');
    var topo = trecho('<div class="lateral__topo">', '<span class="marca-nome"');
    ok(/src="logo\.png"/.test(barra) && !/<svg/.test(barra),
      nome + ': a barra de app mostra o desenho da marca, e não um ícone no lugar dele');
    ok(/src="logo\.png"/.test(topo) && !/<svg/.test(topo),
      nome + ': e o alto da lateral também — era aqui que o painel mostrava um cubo');
    ok(/class="logo-entrada"[^>]*src="logo\.png"|src="logo\.png"[^>]*class="logo-entrada"/
      .test(txt), nome + ': e a tela de entrada, que é onde a marca aparece maior');
  });

  ok(/<img class="ret-marca"[^>]*src="logo\.png"/
    .test(fs.readFileSync(path.join(raiz, 'admin.html'), 'utf8')),
    'a marca do trilho de retornos é o desenho, e não a marca digitada — o texto era ' +
    'uma segunda versão do logo, que envelheceria sozinha');

  /* A MARCA NÃO É UM ÍCONE QUADRADO, e não cabe na caixa de um. */
  var hSelo = /\.selo--marca\{[^}]*height:(\d+)px/.exec(css);
  ok(!!hSelo, 'a marca larga tem altura própria, fora do quadrado de 32px do ícone');
  ok(/\.selo--marca\{[^}]*width:auto/.test(css),
    'e a largura é LIVRE — presa nos 32px do ícone, o desenho encolhe para 32×22 e o ' +
    'nome vira um borrão de dois tons');
  /* E O NOME AO LADO DELA NÃO CABE EM CAIXA ALTA. Medido com a lateral em 236px: com a
     marca desenhada ao lado, o nome tem 104px de linha, e em caixa alta com espaçamento
     ele pede 121 — vira "PAINEL DE CAIX…", e é esse nome que diz em qual dos dois apps
     a pessoa está. */
  ok(!/\.marca-nome\{[^}]*text-transform:uppercase/.test(css),
    'o nome do app ao lado da marca não é em caixa alta — ali ele não caberia inteiro');

  ok(/\.ret-marca\{[^}]*height:auto/.test(css),
    'no trilho de retornos a altura sai da proporção do arquivo, e o espaço dela fica ' +
    'reservado — sem isso a lista de grupos salta quando a imagem chega');

  /* CENTRALIZADA na coluna. `display:block` com `max-width` faz a imagem parar de
     ocupar a largura toda — e ficar ENCOSTADA À ESQUERDA, com a sobra inteira de um
     lado. O `width:100%` engana quem lê a regra: ele diz que a imagem quer a coluna
     inteira, e o `max-width` a impede; sem as margens automáticas ninguém distribui a
     diferença. Medido a 1400px: coluna de 220px, marca de 104 — 58px de cada lado. */
  ok(/\.ret-marca\{[^}]*max-width:104px/.test(css),
    'a marca tem TETO de largura: com `width:100%` e sem ele, o desenho estica até a ' +
    'coluna inteira e empurra a lista de grupos para baixo');
  ok(/\.ret-marca\{[^}]*margin-inline:auto/.test(css),
    'e fica CENTRADA nela: é o teto que cria a sobra, e é a margem automática que a ' +
    'divide — sem ela a sobra fica toda de um lado e o desenho encosta na esquerda');

  /* E CABE NO TRILHO RECOLHIDO. Com a altura presa, a largura que o desenho pede sai da
     proporção do arquivo: chegando um desenho mais largo, é aqui que se descobre, e não
     no galpão com a marca por cima do botão de recolher. */
  var trilho = /--trilho-larg:(\d+)px/.exec(css);
  var folga = /\.lateral__topo,\.lateral__rolagem,\.lateral__pe\s*\)\{padding-left:(\d+)px/
    .exec(css);
  ok(!!trilho && !!folga, 'o trilho declara a largura e a folga dele');
  if (hSelo && trilho && folga) {
    var pede = Math.round(larg * (+hSelo[1]) / alt);
    var cabe = (+trilho[1]) - 2 * (+folga[1]);
    ok(pede <= cabe,
      'e o desenho cabe no trilho recolhido: pede ' + pede + 'px, e há ' + cabe + 'px',
      { pede: pede, cabe: cabe });
  }
})();

console.log('\n== a lateral recolhe num trilho, e o conteúdo é empurrado ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* O MENU EMPURRA, NUNCA COBRE. Aberto por cima, ele esconderia a primeira coluna
     da tabela justamente enquanto a pessoa procura para onde ir. */
  ok(/\.lateral ~ \.main\{margin-left:var\(--lateral-larg\)/.test(css),
    'o conteúdo abre espaço para a lateral — ela empurra, não cobre');
  ok(/\.shell\[data-nav="trilho"\] \.lateral ~ \.main\{margin-left:var\(--trilho-larg\)\}/.test(css),
    'e acompanha quando ela vira trilho');
  ok(/\.lateral\.espiando ~ \.main,[\s\S]{0,120}margin-left:var\(--lateral-larg\)/.test(css),
    'a espiada do mouse também empurra — abrindo por cima, a espiada viraria um ' +
    'painel tapando a tabela');

  /* `.lateral ~ .main`, e não `.main` solto: o extrato do cliente também usa `.main`
     e não tem lateral. Solto, ele ganhava 236px de vazio à esquerda — medido. */
  ok(!/^\s*\.main\{margin-left/m.test(css),
    'e a margem é do `.main` QUE TEM LATERAL — solta, ela caía no extrato do cliente, ' +
    'que usa `.main` e não tem menu nenhum');

  /* A ESPIADA É JS, e não `:hover` puro: sem os 140ms a lateral pisca a cada vez que
     o cursor atravessa a tela, e fechar no clique com o cursor em cima reabriria na
     hora — pareceria que o clique não funcionou. */
  /* O atraso tem de estar NA ESPIADA. Procurar `140` solto casava com qualquer outro
     140 do arquivo, e a sabotagem que tirava o `setTimeout` passava verde. */
  ok(/pointerenter/.test(js) && /espiar\(true\);\s*\},\s*140\)/.test(js),
    'a espiada tem atraso de 140ms — sem ele a lateral pisca quando o cursor só passa');
  ok(/espiadaLiberada = false/.test(js),
    'e fechar no clique trava a espiada até o cursor sair — senão o `:hover` reabriria ' +
    'na hora e o clique pareceria quebrado');
  ok(/pointerType && e\.pointerType !== 'mouse'/.test(js),
    'o dedo não espia: num toque não há "passar por cima", e a lateral abriria sozinha');

  /* O BOTÃO É A DECISÃO. Em tela de toque não existe hover: sem ele o trilho seria
     uma porta que só abre para quem tem mouse. */
  ok(/id="btnLateral"/.test(fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')) &&
     /id="btnLateral"/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')),
    'as duas telas têm o botão que recolhe — em tela de toque não há hover, e sem ele ' +
    'o trilho só abriria para quem tem mouse');
  ok(/localStorage\.setItem\(CHAVE_TRILHO/.test(js),
    'e a escolha fica guardada: recolher é preferência de quem olha, como a ordem das colunas');

  /* O RODAPÉ NÃO SAI DA TELA. Era um `.lateral__folga` empurrando: com a navegação
     cheia, a rede e o "Sair" desciam para fora da lateral. */
  ok(/\.lateral__rolagem\{[^}]*overflow-y:auto/.test(css),
    'a lista de páginas rola sozinha');
  ok(/\.lateral__pe\{[^}]*flex:0 0 auto/.test(css),
    'e o rodapé fica preso embaixo — com a lista crescendo, a rede e o botão de sair ' +
    'saíam da tela e era preciso rolar para achá-los');
  /* A REGRA, e não a menção: o comentário logo acima conta por que a folga saiu, e
     procurar o nome solto acusaria o próprio comentário. */
  ok(!/\.lateral__folga\s*\{/.test(css),
    'e a folga que empurrava sumiu junto');

  /* SÓ O MIOLO ROLA. Com a página inteira rolando, a navegação subia junto e o rodapé
     ia embora com ela. */
  ok(/\.shell\{height:100dvh;overflow:hidden/.test(css),
    'a janela inteira é o app: só o miolo rola');
  ok(/100dvh/.test(css) && !/\.shell\{height:100vh/.test(css),
    'e em `dvh`, não `vh` — no celular a barra do navegador entra e sai, e o `vh` fixo ' +
    'deixa o botão de registrar debaixo dela');
  ok(/\.corpo-pagina\{[^}]*overflow-y:auto/.test(css) && /\.corpo-pagina\{[^}]*min-height:0/.test(css),
    'quem rola é o corpo da página — e com `min-height:0`, senão um filho alto estica o ' +
    'flex e a barra de rolagem volta para a janela inteira');
  ok(!/\.corpo-pagina\{[^}]*max-width/.test(css),
    'e o conteúdo usa a largura toda: os 1800px só apareciam em tela ultralarga, e ali ' +
    'como duas faixas vazias dos lados da tabela');
})();

console.log('\n== a porta do painel: as duas telas nunca discordam ==');
(function () {
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  function corpo(txt, assinatura) {
    var i = txt.indexOf(assinatura);
    if (i < 0) return '';
    var d = 0;
    for (var k = txt.indexOf('{', i); k < txt.length; k++) {
      if (txt[k] === '{') d++;
      else if (txt[k] === '}') { d--; if (!d) return txt.slice(i, k + 1); }
    }
    return '';
  }

  /* A REGRA E UMA SO, e mora no `app.js`. Ela existia duas vezes — a conta que mostra
     a porta no app de campo e a guarda do painel — e divergiam: com `acessoPainel` em
     `false`, o campo deixava o ADMIN passar e o painel o recusava. A porta aparecia e
     caía na tela de entrada, calada.

     Morar no `app.js` também as protege do CACHE: o `app.js` carrega com o hash do
     conteúdo no endereço, o HTML não. Com a regra dentro de cada página, um
     `index.html` velho no celular decide por uma regra e o `admin.html` novo por
     outra — e a pessoa fica no meio. */
  ok(corpo(js, 'function podePainel(s)').length > 0,
    'a regra do painel existe uma vez, no `app.js`');
  ok(/podePainel: podePainel/.test(js), 'e as telas alcançam ela pelo `Q`');

  var Q = { quemEsta: function () {}, podePainel: REGRA_PAINEL };

  /* As duas telas, rodadas de verdade. */
  var pod = corpo(adm, 'function podeEntrar(s)');
  var podeEntrar = new Function('s', 'Q',
    pod.replace(/^function podeEntrar\(s\)\s*\{/, '').replace(/\}$/, ''));

  var apl = corpo(idx, 'function aplicarSessao(s)');
  var marca = "document.getElementById('chipPainel').hidden =";
  var ate = apl.indexOf(marca);
  ok(ate > 0, 'e o app de campo decide a porta numa linha só');
  var portaAparece = new Function('s', 'Q',
    apl.slice(apl.indexOf('{') + 1, ate) +
    '\n return !(' + apl.slice(ate + marca.length, apl.indexOf(';', ate)) + ');');

  var casos = [
    { n: 'Gerente, chave ligada', perfil: 'GERENTE', acesso: true },
    { n: 'Admin, chave ligada', perfil: 'ADMIN', acesso: true },
    { n: 'Conferente, chave ligada', perfil: 'CONFERENTE', acesso: true },
    { n: 'Gerente, chave desligada', perfil: 'GERENTE', acesso: false },
    /* O caso que estava quebrado de verdade. */
    { n: 'ADMIN com a chave DESLIGADA', perfil: 'ADMIN', acesso: false },
    { n: 'ADMIN, sessão velha', perfil: 'ADMIN' },
    { n: 'GALPAO, sessão velha', perfil: 'GALPAO' },
    { n: 'CONFERENTE, sessão velha', perfil: 'CONFERENTE' },
    { n: 'GERENTE, sessão velha', perfil: 'GERENTE' }
  ];
  var discordam = [];
  casos.forEach(function (c) {
    ['pin', 'senha', undefined].forEach(function (via) {
      var s = { id: 'U1', nome: c.n, perfil: c.perfil, temPin: true };
      if ('acesso' in c) s.acessoPainel = c.acesso;
      if (via !== undefined) s.via = via;
      var abre = !!portaAparece(s, Q), entra = !!podeEntrar(s, Q);
      if (abre !== entra) {
        discordam.push(c.n + ' / via=' + (via || 'sem') +
          (abre ? ' → vê a porta e cai no login' : ' → entraria, mas não vê a porta'));
      }
    });
  });
  ok(discordam.length === 0,
    'nas ' + (casos.length * 3) + ' combinações de perfil × chave × credencial, a tela ' +
    'que MOSTRA a porta e a que DEIXA ENTRAR dão a mesma resposta — discordando, a ' +
    'porta leva a uma recusa, e porta que não abre é pior que porta nenhuma', discordam);

  /* E nenhuma das duas recalcula a regra por conta própria: recalcular é como as
     cópias nasceram da primeira vez. */
  [['index.html', idx], ['admin.html', adm]].forEach(function (p) {
    ok(!/\['?ADMIN'?,\s*'?GALPAO'?/.test(p[1]),
      p[0] + ': não tem uma lista de perfis própria decidindo o painel');
  });

  /* A RECUSA SE EXPLICA. Ela era muda: quem tinha o painel liberado clicava na porta,
     via a tela de entrada e não tinha como saber o que houve — parecia defeito, e
     mandava procurar o problema no cadastro, que estava certo. */
  ok(/function motivoDaRecusa\(s\)/.test(adm),
    'o painel sabe dizer POR QUE recusou');
  ok(/iniciarLogin\(motivoDaRecusa\(/.test(adm) &&
     (adm.match(/iniciarLogin\(motivoDaRecusa\(/g) || []).length === 2,
    'e os DOIS caminhos de recusa passam o motivo — um só deles calado deixa metade ' +
    'dos casos sem explicação',
    (adm.match(/iniciarLogin\(motivoDaRecusa\(/g) || []).length);
  ok(/function portaUnica\(aqui, abrir, aviso\)/.test(js) && /if \(aviso\) mostrarErro\(aviso\)/.test(js),
    'e a tela de entrada mostra esse motivo no cartão, que não some como o toast');
  var mot = corpo(adm, 'function motivoDaRecusa(s)');
  ok(/if \(!s\) return '';/.test(mot),
    'sem sessão nenhuma não ganha frase — é a visita normal de quem abriu o endereço, ' +
    'e "sua sessão acabou" para quem nunca entrou seria mentira');
})();

console.log('\n== o contador de caixas cabe na tela, sem encolher o alvo do dedo ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  function regra(sel) {
    var i = css.indexOf(sel + '{');
    return i < 0 ? '' : css.slice(i + sel.length + 1, css.indexOf('}', i));
  }
  function px(decl, prop) {
    var m = new RegExp('(?:^|;)\\s*' + prop + ':\\s*(-?[\\d.]+)px').exec(decl);
    return m ? parseFloat(m[1]) : null;
  }
  /* O vertical do `padding: A B` é o A. */
  function padY(decl) {
    var m = /(?:^|;)\s*padding:\s*([\d.]+)px/.exec(decl);
    return m ? parseFloat(m[1]) : null;
  }

  var campo = regra('.stepper input');
  var botao = regra('button.btn');
  var item = regra('.item');
  var itens = regra('.itens');

  /* O PISO DE TOQUE MORA NO CSS, e não sai por acaso da conta do `padding` com o
     tamanho da letra. Medido no Chrome a 412px: o campo dá 44px de altura e o botão
     46px. Quem encolher a letra amanhã esbarra no `min-height` em vez de entregar um
     alvo de 38px para um dedo de luva. */
  ok(px(campo, 'min-height') >= 44,
    'o campo de quantidade tem piso de 44px declarado — sem ele a altura viria por ' +
    'acaso da conta do `padding` com a letra, e a próxima mexida na letra encolhe o ' +
    'alvo sem ninguém perceber', px(campo, 'min-height'));
  ok(px(botao, 'min-height') >= 44,
    'e o botão principal também — o app é usado de luva, e alvo pequeno custa lançamento',
    px(botao, 'min-height'));

  /* E O RESPIRO EM VOLTA ENCOLHEU, que era o pedido: as cinco linhas de tipo de caixa
     ocupavam 390px num celular de 412 e passaram a ocupar 322 — 68px, que é o que
     faltava para a última linha e o botão caberem juntos. Medido, não estimado. */
  ok(padY(item) !== null && padY(item) <= 8,
    'a linha de tipo de caixa tem respiro curto — era 10px, e as cinco linhas comiam ' +
    '390px dos 412 do celular', padY(item));
  ok(px(itens, 'gap') !== null && px(itens, 'gap') <= 8,
    'e o vão entre elas também', px(itens, 'gap'));
  ok(padY(botao) !== null && padY(botao) <= 12,
    'e o botão encolheu o respiro, não a altura útil', padY(botao));
  ok(px(campo, 'width') !== null && px(campo, 'width') <= 96,
    'e o campo de quantidade estreitou, para sobrar linha ao nome do tipo — ' +
    '"CX DIVERSAS" não cabia', px(campo, 'width'));
})();

/* ============================================================================
 * A BASE DO USUÁRIO — teste ou produção, e já não é o nome do cargo
 *
 * Antes, dizer que alguém era de ensaio exigia escrever "teste" dentro do PERFIL, que é
 * o cargo. Cadastrar trinta pessoas durante uma validação obrigava a sujar o cargo de
 * todas e lembrar de limpar no dia da virada — em todas, sem esquecer nenhuma.
 * ==========================================================================*/
console.log('\n== a base do usuário ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var api = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  var log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  var mig = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');

  /* QUEM CARIMBA É A COLUNA, e o perfil não entra nesta conta. Com o perfil como piso,
     quem tivesse "Conferente de teste" no cargo ficaria preso no ensaio mesmo com a Base
     marcada como Produção no formulário: a tela diria uma coisa e o lançamento faria
     outra. Medido antes de tirar — era exatamente o que acontecia. */
  var ctx = api.slice(api.indexOf('teste: quem') - 900, api.indexOf('teste: quem') + 60);
  ok(/teste: quem && quem\.Teste === true,/.test(api),
    'o lançamento carimba a base pela COLUNA do cadastro');
  ok(!/teste: [^\n]*ehPerfilTeste/.test(api),
    'e o nome do perfil não entra mais nessa conta — com ele, marcar "Base Produção" ' +
    'no formulário não tiraria do ensaio quem tem "teste" escrito no cargo',
    (api.match(/teste: [^\n]*/) || [])[0]);

  /* MAS O PERFIL GRAVADO NA LINHA CONTINUA VALENDO. São duas perguntas com o mesmo nome:
     uma é sobre o cadastro de hoje, a outra sobre o que aconteceu. Tirar esta segunda
     passaria para "real" os movimentos anteriores à coluna `teste` existir. */
  ok(/function lancamentoDeTeste\(m\) \{\s*\n\s*return m\.Teste === true \|\| ehPerfilTeste\(m\.Perfil\);/
     .test(log),
    'e o perfil GRAVADO NO MOVIMENTO continua classificando a história — sem ele, o que ' +
    'foi lançado antes desta coluna viraria real de uma vez');

  /* A MIGRAÇÃO COPIA A REGRA DO PERFIL para a coluna. Sem esse backfill, ligar a coluna
     passaria todos os usuários de ensaio para produção no mesmo instante, e os
     lançamentos do dia seguinte entrariam no saldo real sem ninguém ter pedido. */
  ok(/update public\.usuarios set teste = true/.test(mig) && /perfil ~\* 'teste'/.test(mig),
    'e a migração copia para a coluna exatamente o que a regra do perfil já dizia — ' +
    'sem ela, ligar a coluna passaria a equipe de ensaio para produção de uma vez');

  /* O CAMPO EXISTE E VOLTA. O `teste_api.js` já cobra que todo campo do formulário volte
     na leitura, e foi ele que pegou este: sem o `Teste` na `equipe`, o formulário abriria
     sempre em "Base Produção" e a gravação seguinte apagaria a base de quem estava em
     ensaio, calada, no meio de uma validação. */
  ok(/id="fBase"/.test(adm) && /Teste:\(document\.getElementById\('fBase'\)\.value === 'teste'\)/.test(adm),
    'o formulário tem o campo Base e grava a coluna a partir dele');
  ok(/Teste: u\.Teste === true,/.test(log),
    'e ela volta na leitura da equipe — sem isso, abrir e salvar apagaria a base');

  /* A BASE NA TABELA, e não só no formulário: quem cadastra trinta pessoas precisa
     conferir de relance quem ficou em qual, sem abrir uma por uma. */
  var desc = adm.slice(adm.indexOf('var TAB_USUARIOS = {'));
  desc = desc.slice(0, desc.indexOf('\n  };'));
  ok(/'base'/.test(desc) && /base:'Base'/.test(desc),
    'e a Base é coluna da tabela de Usuários, com largura e título');

  /* AS TRÊS OPÇÕES, nos três seletores. "As duas bases" existe porque a base de
     validação pode ser operação de verdade — mas NÃO é a de fábrica: quem quiser somar
     as duas escolhe, e vê o que escolheu escrito no seletor. */
  ok((adm.match(/<option value="todos">As duas bases<\/option>/g) || []).length === 3,
    'e os três seletores de base oferecem "As duas bases"',
    (adm.match(/As duas bases/g) || []).length);
  ok(!/<select[^>]*>\s*<option value="todos"/.test(adm),
    'e ela não é a opção de fábrica — misturar ensaio com operação numa soma só, sem ' +
    'ninguém ter pedido, dá um número que não responde nem uma pergunta nem a outra');

  /* APAGAR EM BLOCO PEDE DUAS COISAS, e elas respondem a perguntas diferentes: o NÚMERO
     defende do engano (quem escreve 412 leu que são 412), a SENHA defende do computador
     do escritório com a sessão aberta. O número não pergunta QUEM é; a senha não
     pergunta se a pessoa LEU. */
  ok(/id="limparSenha"/.test(adm) && /Q\.conferirSenha\(senha\)/.test(adm),
    'e apagar em bloco pede a senha do painel, além de escrever o número');
  ok(/id="limparDito"/.test(adm) && /dito !== String\(limparN\)/.test(adm),
    'e continua pedindo o número exato — a senha diz quem é, não que a pessoa leu');

  /* ---------------- MARCAR VÁRIOS E VIRAR A BASE DE UMA VEZ ----------------
   *
   * O dia da virada é o caso de uso inteiro: a equipe de validação sai do ensaio junto.
   * Um por um, trinta cadastros são trinta chances de pular alguém — e quem fica para
   * trás não reclama, continua lançando em ensaio, e o saldo real fica faltando o que
   * ele mandou. */

  /* A PODA RODA DE VERDADE, e não só existe escrita. Ela é a peça que sustenta a
     promessa "o que está marcado é o que está na tela": sem ela o botão mexeria em
     gente que a pessoa filtrou para fora e não consegue conferir. */
  var poda = adm.slice(adm.indexOf('function podarSelecaoUser'),
                       adm.indexOf('function barraSelecaoUser'));
  var SEL = { a: true, b: true, c: true };
  new Function('SEL_USERS', poda + ' podarSelecaoUser([{ID:"a"},{ID:"c"}]);')(SEL);
  ok(Object.keys(SEL).join(',') === 'a,c',
    'a marcação é podada para quem está na tela: filtrar solta os que saíram de vista — ' +
    'senão "3 marcados" contaria alguém que ninguém está vendo',
    Object.keys(SEL).join(',') || '(vazio)');

  /* E ela roda ANTES do desenho, não depois. Depois, a tela já teria sido montada com a
     conta velha, e a barra diria um número e a lista mostraria outro. */
  var dU = adm.slice(adm.indexOf('function desenharUsuarios(digitando)'));
  dU = dU.slice(0, dU.indexOf('\n  function ', 10));
  /* O `>= 0` NÃO É ENFEITE. Escrita só como "vem antes", esta linha aprovava o pior
     caso de todos: sem a chamada, `indexOf` devolve -1, e -1 vem antes de qualquer
     coisa. A poda sumia da tela inteira e a asserção continuava verde. */
  var iPoda = dU.indexOf('podarSelecaoUser(lista)');
  ok(iPoda >= 0 && iPoda < dU.indexOf('if (!lista.length)'),
    'e a poda acontece antes de qualquer desenho — depois dele a barra mostraria a ' +
    'conta de antes do filtro', iPoda);

  /* "TODOS" É O QUE ESTÁ NA TELA. Varrendo `EQUIPE`, um clique com um perfil escolhido
     no trilho marcaria a empresa inteira sem mostrar — e o próximo clique viraria a base
     de gente que nunca apareceu. */
  var todos = adm.slice(adm.indexOf("var todos = document.getElementById('userTodos');",
                                    adm.indexOf('function ligarSelecaoUser')));
  todos = todos.slice(0, todos.indexOf('sincronizarSelecaoUser();\n  }'));
  ok(/querySelectorAll\('\[data-marcar-user\]'\)/.test(todos) && !/EQUIPE/.test(todos),
    'e "marcar todos" marca os que estão na tela, e não a equipe inteira — com um perfil ' +
    'filtrado, os dois números são diferentes');

  /* NEM VAZIA NEM CHEIA quando é uma parte: cheia, o clique seguinte DESMARCA tudo em vez
     de completar — que é o contrário do que se espera ao ver marcados no meio. */
  ok(/todos\.indeterminate = vistos > 0 && vistos < caixas\.length/.test(adm),
    'e a caixa de cima fica no tracinho quando só uma parte está marcada');

  /* O QUE VAI PARA O SERVIDOR são os ids marcados — nem a tela inteira, nem os ativos. */
  ok(/acao:'baseUsuarios', ids:ids, teste:teste/.test(adm),
    'e o botão manda os ids marcados para o `baseUsuarios`');
  ok(/if \(Q\.precisaConfirmar\(b, 'Passar '\+ids\.length\+' para a '\+nome/.test(adm),
    'e o segundo clique confirma, dizendo quantos e para qual base — trocar a base não ' +
    'apaga nada, mas desvia todo lançamento seguinte, e o engano só aparece no saldo');

  /* A MARCAÇÃO MORRE COM A AÇÃO FEITA. Viva, o mesmo bloco ficaria armado debaixo do
     dedo para o botão vizinho, e um clique de conferência mandaria todo mundo de volta. */
  var acao = adm.slice(adm.indexOf('function ligarBotoesBaseUser'));
  acao = acao.slice(0, acao.indexOf('\n  }\n'));
  ok(/SEL_USERS = \{\};\s*\n\s*carregarEquipe\(\)/.test(acao),
    'e a marcação é solta depois de feita, antes de recarregar a equipe');

  /* O QUE MUDOU E O QUE JÁ ESTAVA LÁ, separados. Um "12 alterados" com oito já na base
     pedida faria procurar quatro mudanças que não houve. */
  ok(/r\.mudados/.test(acao) && /r\.jaEstavam/.test(acao),
    'e o aviso separa quem mudou de quem já estava na base pedida');

  /* A COLUNA DE MARCAR FICA FORA DO SISTEMA DE COLUNAS. Dentro, a aba Colunas a
     esconderia — e esconder o caminho de marcar é perder o único jeito de virar a base
     em bloco, sem que a tela diga que foi isso que aconteceu. */
  var tab = adm.slice(adm.indexOf('var TAB_USUARIOS = {'));
  tab = tab.slice(0, tab.indexOf('\n  };'));
  ok(!/marcar/.test(tab),
    'e a coluna de marcar não entra no descritor das colunas — a aba Colunas a esconderia');

  /* LARGURA ESCRITA, porque a tabela é `table-layout:fixed`: sem ela, esta coluna e a
     das ações dividem a sobra e os botões de editar/excluir espremem. */
  ok(/<th class="col-marcar" style="width:34px">/.test(adm),
    'e ela tem largura própria — em tabela de layout fixo, sem largura ela roubaria a ' +
    'faixa dos botões de ação');

  /* O LADO DO SERVIDOR NAO SE LE, SE RODA — `teste_api.js`, secao "virar a base de
     vários de uma vez". Escrito aqui, ele virava busca de nome: eu cobrava que a linha
     `faltam.length` existisse, e um `var faltam = []` — a conferência vazia, que aceita
     qualquer id — passava por cima da asserção sem ela piscar. Medido: o defeito
     ESCAPOU. Quem responde "gravou alguma coisa antes de conferir?" é a chamada de
     verdade contra o banco falso, e mais nada. */
})();

console.log('\n== "Em déficit" peneira pelo número que está na tela ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* OS QUATRO DIAS DA TELA DE QUEM RELATOU, com os números que ele viu.
   *
   * O chip dizia "2" e uma das duas linhas mostrava `+810` no Saldo final. As duas
   * contas estavam certas e eram DIFERENTES: a peneira olhava `saldo` (retorno menos
   * saída, −440 e −1.900) e a coluna mostrava o corrido (+810 e −280). Só o segundo
   * estava na tela, então não havia como conferir o filtro olhando.
   *
   * Este bloco RODA a peneira. Lido no arquivo, o teste não responderia a pergunta que
   * importa — "quais linhas aparecem?" —, e é ela que a pessoa faz olhando a tabela. */
  var iLF = adm.indexOf('  function linhasFluxo(){');
  var fonte = adm.slice(adm.indexOf('  function saldoFinalDaLinha('),
                        adm.indexOf('\n  }', adm.indexOf('  function saldoFinalDaLinha(')) + 4) +
              adm.slice(iLF, adm.indexOf('\n  }', iLF) + 4);
  ok(iLF > 0 && /saldoFinalDaLinha/.test(fonte),
    'o recorte pegou a peneira e a função do saldo final — sem isto o bloco abaixo ' +
    'exercitaria outro código');

  var DIAS = [
    { d: '15/09 estoque', saida: 0,    retorno: 0,    saldo: 0,     fimCorrido: 1250 },
    { d: '16/09',         saida: 1690, retorno: 1250, saldo: -440,  fimCorrido: 810 },
    { d: '17/09 estoque', saida: 0,    retorno: 0,    saldo: 0,     fimCorrido: 1620 },
    { d: '17/09',         saida: 2710, retorno: 810,  saldo: -1900, fimCorrido: -280 }
  ];

  function comFiltro(qual) {
    return new Function('FLUXO_FILTRO', 'PAINEL', 'linhasVivas', 'linhasFiliais',
      fonte + '\n return linhasFluxo();')(
      qual, { fluxoPessoas: { motoristas: [], usuarios: [] } },
      function () { return DIAS; }, function () { return []; });
  }

  var todas = comFiltro('todas');
  ok(todas.length === 4, 'sem recorte, os quatro dias aparecem', todas.length);

  var def = comFiltro('deficit');
  ok(def.length === 1 && def[0].d === '17/09',
    'em déficit, só o dia que fechou no vermelho: 1.620 − 2.710 + 810 = −280',
    def.map(function (l) { return l.d + '(' + l.fimCorrido + ')'; }).join(' '));
  ok(def.every(function (l) { return l.fimCorrido < 0; }),
    'e nenhuma linha com Saldo final positivo entra — era o `+810` que fazia o filtro ' +
    'parecer quebrado para quem olhava a tabela',
    def.map(function (l) { return l.fimCorrido; }).join(' '));

  /* O OUTRO NÚMERO NÃO SUMIU NEM ESTAVA ERRADO. Ele é quanto ficou na rua, e é dele que
     sai o cartão "Caixas que Saíram e Não Voltaram": 440 + 1.900 = 2.340, que é o que a
     tela mostrava no alto. O que mudou foi de qual dos dois o CHIP fala. */
  var naRua = DIAS.reduce(function (s, l) { return s + (l.saldo < 0 ? -l.saldo : 0); }, 0);
  ok(naRua === 2340,
    'e o número do cartão de déficit continua sendo o outro: 440 + 1.900 = 2.340 na rua',
    naRua);

  /* A CONTAGEM DO CHIP PROMETE O QUE O CLIQUE ENTREGA. Contada por uma regra e peneirada
     por outra, ela dizia 2 e mostrava algo que não se podia conferir. */
  var iLD = adm.indexOf('  function linhasDeficit(){');
  var conta = new Function('linhasVivas',
    adm.slice(adm.indexOf('  function saldoFinalDaLinha('),
              adm.indexOf('\n  }', adm.indexOf('  function saldoFinalDaLinha(')) + 4) +
    adm.slice(iLD, adm.indexOf('\n  }', iLD) + 4) +
    '\n return linhasDeficit();')(function () { return DIAS; });
  ok(conta === def.length,
    'e o número no chip é exatamente quantas linhas o clique mostra',
    conta + ' vs ' + def.length);

  /* ---- A CHAVE DE ORDENAÇÃO E A CÉLULA DEVOLVEM O MESMO NÚMERO ----
   *
   * Um defeito plantado escapou de todas as outras: a chave lendo `l.saldo` enquanto a
   * célula mostra o corrido. Nada quebra na tela — clicar no título ordena, as linhas se
   * mexem, e a ordem é por um número que não está em coluna nenhuma. Quem confere de
   * olho conclui que a ordenação está quebrada.
   *
   * O comentário ao lado da coluna já avisava desse risco, com essas palavras: "Lendo
   * `fimCorrido` direto, a coluna ordenaria por um numero nas visoes de gente e mostraria
   * outro". Aviso não é guarda — nada cobrava.
   *
   * RODANDO AS DUAS, e não comparando o texto delas: escritas de formas diferentes e com
   * o mesmo resultado, ficam certas; escritas iguais e lidas de campos diferentes, não.
   * A linha de teste tem `saldo` e `fimCorrido` BEM distintos de propósito — iguais, o
   * defeito passaria. */
  var iFim = adm.indexOf("      final:    { t: TIT['final']");
  var blocoFim = adm.slice(iFim, adm.indexOf('\n    };', iFim));
  var col = new Function('Q', 'gente', 'TIT', 'saldoFinalDaLinha',
    'return {' + blocoFim + '};')(
    { num: function (n) { return String(n); } }, false, { final: 'Saldo final' },
    new Function('l', 'gente', 'return gente ? l.saldo : l.fimCorrido;')).final;

  [{ nome: 'local no vermelho', gente: false, l: { saldo: -1900, fimCorrido: -280 } },
   { nome: 'local no azul',     gente: false, l: { saldo: -440,  fimCorrido: 810 } }
  ].forEach(function (c) {
    /* SÓ O TEXTO DENTRO DO `<b>`. Limpando a marcação inteira com um `[^0-9-]`, os
       hífens de `class="val val-ruim"` entravam na conta e `-280` virava `--280`. A
       sonda estava errada, não a coluna. */
    var mostrado = Number(/>([^<]*)</.exec(col.v(c.l))[1].replace(/[^0-9\-]/g, ''));
    ok(col.k(c.l) === mostrado,
      c.nome + ': a coluna ordena pelo MESMO número que imprime — ordenando por outro, ' +
      'as linhas se mexem por um valor que não está na tela',
      'ordena por ' + col.k(c.l) + ', mostra ' + mostrado);
  });
})();

console.log('\n== a aparência: cor da marca e fundo ==');
(function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var api = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

  var TEMAS = ['verde', 'roxo', 'ambar', 'gelo'];
  var FUNDOS = ['azul', 'petroleo', 'cinza', 'roxo', 'gelo'];
  /* O CLARO É O ÚNICO em que a tinta é escura, e o único que mexe nas cores que
     informam. Ele também tem um bloco por marca — o par de seletores pesa mais e ganha
     do bloco do tema. Quem mede tem de ler os dois, senão mede a cor que o claro
     substituiu. */
  var CLARO = 'gelo';

  function bloco(sel) {
    var i = css.indexOf(sel + '{');
    return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i));
  }
  function tokens(sel) {
    var m = {}, re = /(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g, x, b = bloco(sel);
    while ((x = re.exec(b))) m[x[1]] = x[2];
    return m;
  }
  /* O QUE DE FATO VALE numa combinação: o bloco do tema, o do fundo, e por cima o do
     PAR, quando existe. Medir só os dois primeiros mediria a cor que o fundo claro
     substituiu — e é justamente nele que as substituições acontecem. */
  function valendo(tema, fundo) {
    var m = {};
    [tokens('[data-tema="' + tema + '"]'), tokens('[data-fundo="' + fundo + '"]'),
     tokens('[data-fundo="' + fundo + '"][data-tema="' + tema + '"]')
    ].forEach(function (o) {
      Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    });
    return m;
  }

  /* ---- 1. os dois eixos existem, inteiros ----
     Um tema a que falte um token não falha alto: ele HERDA o do `:root`, e a tela fica
     com a cor de outro tema em uma peça só — o botão verde e o chip ainda roxo. */
  var PEDE_TEMA = ['--brand', '--brand-hover', '--brand-soft', '--sobre-brand',
                   '--ambar-btn', '--roxo-txt', '--marca-roxo', '--marca-verde',
                   '--verde-hover', '--sobre-verde'];
  var PEDE_FUNDO = ['--bg', '--surface', '--surface-2', '--campo', '--marinho',
                    '--marinho-esc', '--marinho-claro', '--neutro', '--linha',
                    '--linha-viva', '--txt', '--txt2', '--txt3', '--txt-fraco'];
  TEMAS.forEach(function (k) {
    var tk = tokens('[data-tema="' + k + '"]');
    var faltam = PEDE_TEMA.filter(function (x) { return !tk[x]; });
    ok(faltam.length === 0,
      'o tema ' + k + ' define tudo o que pinta — faltando um, ele herda o do padrão e ' +
      'a tela fica com duas cores de marca ao mesmo tempo', faltam);
  });
  FUNDOS.forEach(function (k) {
    var tk = tokens('[data-fundo="' + k + '"]');
    var faltam = PEDE_FUNDO.filter(function (x) { return !tk[x]; });
    ok(faltam.length === 0,
      'o fundo ' + k + ' traz a escala INTEIRA — trocar só o chão e deixar o texto e as ' +
      'linhas medidos contra o antigo derruba o contraste de tudo o que está em cima',
      faltam);
  });

  /* ---- 2. as cores que INFORMAM ficam fora dos dois eixos ----
     Se o tema pintasse o verde do saldo, escolher "rosa" trocaria o SENTIDO dos números
     na tela, e o galpão leria um saldo negativo como se estivesse tudo certo. */
  var SIGNIFICADO = ['--verde', '--azul', '--ambar', '--vermelho', '--verde-cheio',
                     '--azul-cheio', '--laranja'];
  /* NENHUMA COR DA MARCA toca nelas, e nenhum fundo ESCURO também. Escolher a cor do
     sistema não pode trocar o sentido dos números. */
  TEMAS.forEach(function (k) {
    var invadiu = SIGNIFICADO.filter(function (x) { return !!tokens('[data-tema="' + k + '"]')[x]; });
    ok(invadiu.length === 0,
      'a cor ' + k + ' não toca nas cores que informam — mexendo nelas, escolher uma cor ' +
      'trocaria o sentido dos números', invadiu);
  });
  FUNDOS.filter(function (f) { return f !== CLARO; }).forEach(function (f) {
    var invadiu = SIGNIFICADO.filter(function (x) { return !!tokens('[data-fundo="' + f + '"]')[x]; });
    ok(invadiu.length === 0,
      'o fundo ' + f + ' não toca nelas — os quatro escuros partilham a mesma escala de ' +
      'tinta, e nada ali obriga a mexer', invadiu);
  });
  /* O CLARO É A EXCEÇÃO, e ela é obrigatória, não de conveniência: `--verde` (#35d6a0)
     sobre branco dá 1,9:1. A cor CONTINUA verde e deixa de ser legível, e um saldo que
     ninguém lê não informa nada. O que não muda é o SIGNIFICADO nem a FAMÍLIA — muda o
     tom. Esta asserção cobra as duas metades: que ele mexa, e que o resultado passe. */
  var claroTk = tokens('[data-fundo="' + CLARO + '"]');
  var naoMexeu = SIGNIFICADO.filter(function (x) { return !claroTk[x]; });
  ok(naoMexeu.length === 0,
    'o fundo claro REDEFINE as cores que informam — sem isso elas ficam na tonalidade ' +
    'de fundo escuro e somem no branco, e cor que não se lê não informa', naoMexeu);

  /* ---- 3. O CONTRASTE DAS NOVE COMBINAÇÕES, calculado aqui ----
   * Cor escolhida no olho e cor que some no galpão são a mesma coisa até alguém medir.
   * Com um eixo só, dava para medir uma vez e seguir; com nove combinações, o par que
   * reprova é sempre o que ninguém abriu. Por isso a conta roda a cada suíte, e lê os
   * valores DO ARQUIVO — inventar a paleta aqui seria medir a minha intenção. */
  function lum(h) {
    var v = [1, 3, 5].map(function (i) {
      var c = parseInt(h.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contraste(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  var ruins = [];
  TEMAS.forEach(function (k) {
    var T = tokens('[data-tema="' + k + '"]');
    /* A tinta sobre o acento: 4,5:1, que é texto. */
    [['--sobre-brand', '--brand', 'o texto do botão principal'],
     ['--sobre-brand', '--brand-hover', 'o botão principal sob o mouse'],
     ['--sobre-verde', '--marca-verde', 'a tinta do Entrar']
    ].forEach(function (par) {
      var v = contraste(T[par[0]], T[par[1]]);
      if (v < 4.5) ruins.push(k + ': ' + par[2] + ' = ' + v.toFixed(2) + ' (mínimo 4,5)');
    });
    FUNDOS.forEach(function (f) {
      var V = valendo(k, f);
      /* O acento CHEIO contra o cartão: 3,0:1, que é elemento gráfico — é a forma do
         botão, não o texto dele. Foi aqui que o roxo antigo reprovou, em 2,21:1, e é
         aqui que branco sobre branco daria 1,24:1 se o par não trocasse a cor. */
      var g = contraste(V['--brand'], V['--surface']);
      if (g < 3.0) ruins.push(f + '/' + k + ': o acento contra o cartão = ' +
        g.toFixed(2) + ' (mínimo 3,0)');
      var i = contraste(V['--roxo-txt'], V['--surface']);
      if (i < 4.5) ruins.push(f + '/' + k + ': o acento como tinta = ' +
        i.toFixed(2) + ' (mínimo 4,5)');
      /* A tinta em cima do acento vale POR COMBINAÇÃO: no chão claro ela inverte. */
      var s = contraste(V['--sobre-brand'], V['--brand']);
      if (s < 4.5) ruins.push(f + '/' + k + ': o texto do botão = ' +
        s.toFixed(2) + ' (mínimo 4,5)');
    });
  });
  FUNDOS.forEach(function (f) {
    var F = tokens('[data-fundo="' + f + '"]');
    /* AS QUATRO QUE INFORMAM, em cada fundo. Como TEXTO pedem 4,5; o `--azul-cheio` e o
       `--verde-cheio` são preenchimento de barra e pedem 3,0 — medi-los pela régua do
       texto reprovaria a tela de hoje, que está certa. */
    var base = tokens(':root');
    function vale(nome) { return F[nome] || base[nome]; }
    [['--verde', 4.5, 'o número bom'], ['--vermelho', 4.5, 'o número ruim'],
     ['--ambar', 4.5, 'o aviso'], ['--azul', 4.5, 'a etiqueta azul'],
     ['--azul-cheio', 3.0, 'a barra de saída'], ['--verde-cheio', 3.0, 'a barra de retorno'],
     /* O AZUL DOS LINKS é texto, e estava fora da conta: ele vem do `:root` e não muda
        com o fundo escuro, mas no claro ele PRECISA mudar — azul claro sobre branco
        some. Sem esta linha, o único fundo em que ele reprova é o único que ninguém
        mediu. */
     ['--marca-txt', 4.5, 'o link no cartão']
    ].forEach(function (par) {
      var v = contraste(vale(par[0]), vale('--surface'));
      if (v < par[1]) ruins.push(f + ': ' + par[2] + ' = ' + v.toFixed(2) +
        ' (mínimo ' + par[1].toFixed(1) + ')');
    });
    [['--txt', '--bg', 'a tinta principal no chão'],
     ['--txt2', '--surface', 'a segunda tinta no cartão'],
     ['--txt3', '--surface', 'a etiqueta apagada no cartão'],
     ['--txt', '--campo', 'o que se digita']
    ].forEach(function (par) {
      var v = contraste(F[par[0]], F[par[1]]);
      if (v < 4.5) ruins.push(f + ': ' + par[2] + ' = ' + v.toFixed(2) + ' (mínimo 4,5)');
    });
  });
  ok(ruins.length === 0,
    'as ' + (TEMAS.length * FUNDOS.length) + ' combinações de cor e fundo passam em ' +
    'WCAG — o par que reprova é sempre o que ninguém abriu', ruins);

  /* ---- 3b. AS CINCO PONTAS LISTAM OS MESMOS NOMES ----
   *
   * A lista de cores e de fundos vive em cinco lugares, e por um bom motivo cada um: o
   * CSS pinta, o `app.js` valida e guarda, as TRÊS páginas aplicam antes de pintar, e o
   * servidor recusa o que não conhece. Cinco cópias da mesma lista é cinco chances de
   * uma ficar para trás.
   *
   * E o sintoma de uma ficar para trás não é um erro: é silêncio. Nome que o CSS não
   * conhece não pinta NADA — a tela fica sem cor de marca e a causa está numa lista que
   * ninguém abre. Nome que o CSS tem e o `app.js` não, e a opção simplesmente não
   * aparece. Medido: dois defeitos assim escaparam da suíte inteira.
   *
   * A ORDEM TAMBÉM CONTA, porque ela é a ordem dos botões na tela. */
  function listaDoBloco(texto, re) {
    var m = re.exec(texto);
    return m ? m[1].split(',').map(function (x) { return x.replace(/['\s]/g, ''); }) : [];
  }
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var idxH = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var admH = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var extH = fs.readFileSync(path.join(__dirname, '..', 'extrato.html'), 'utf8');
  var apiJ = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

  /* Do CSS saem os blocos na ordem em que aparecem — e só os de um atributo só: os
     pares `[data-fundo][data-tema]` são ajustes, e não opções da lista. */
  function doCss(attr) {
    var re = new RegExp('^\\[data-' + attr + '="([a-z]+)"\\]\\{', 'gm'), m, v = [];
    while ((m = re.exec(css))) if (v.indexOf(m[1]) < 0) v.push(m[1]);
    return v;
  }

  [['tema', TEMAS, /var TEMAS = \[([^\]]+)\]/, /'data-tema',\s*\[([^\]]+)\]/,
    /tema: \[([^\]]+)\]/],
   ['fundo', FUNDOS, /var FUNDOS = \[([^\]]+)\]/, /'data-fundo',\s*\[([^\]]+)\]/,
    /fundo: \[([^\]]+)\]/]
  ].forEach(function (eixo) {
    var nome = eixo[0], esperado = eixo[1].join(',');
    var pontas = {
      'a folha de estilo': doCss(nome).join(','),
      'o app.js': listaDoBloco(app, eixo[2]).join(','),
      'a partida do app de campo': listaDoBloco(idxH, eixo[3]).join(','),
      'a partida do painel': listaDoBloco(admH, eixo[3]).join(','),
      'a partida do extrato': listaDoBloco(extH, eixo[3]).join(','),
      'o servidor': listaDoBloco(apiJ, eixo[4]).join(',')
    };
    Object.keys(pontas).forEach(function (onde) {
      ok(pontas[onde] === esperado,
        nome + ': ' + onde + ' lista os mesmos nomes, na mesma ordem — uma lista para ' +
        'trás não dá erro, dá silêncio: a cor simplesmente não pinta',
        pontas[onde] + '  ≠  ' + esperado);
    });
  });

  /* ---- 3c. A COR DA MARCA NÃO É UMA DAS QUE INFORMAM ----
   *
   * O âmbar quase entrou como a MESMA cor de "Atenção". O botão principal e o chip de
   * aviso ficariam idênticos, e a cor deixaria de dizer "repare nisto" para dizer só
   * "isto é clicável". Escapou da suíte inteira: nada cobrava a distância entre as duas
   * famílias, porque até então nenhuma marca chegou perto de uma delas.
   *
   * O QUE ISTO PEGA é a igualdade. O limite fica escrito: âmbar (#ef7b2f) e o aviso
   * (#e8a33d) diferem em MATIZ, não em brilho — 1,29:1 de luminância —, e quem não
   * distingue laranja de âmbar vê os dois iguais. Nenhuma conta aqui mede isso; se
   * aparecer na operação, o caminho é outra família de cor, não um laranja mais escuro. */
  var raiz = tokens(':root');
  TEMAS.forEach(function (k) {
    var b = (tokens('[data-tema="' + k + '"]')['--brand'] || '').toLowerCase();
    var bate = SIGNIFICADO.filter(function (s) {
      return (raiz[s] || '').toLowerCase() === b;
    });
    ok(bate.length === 0,
      'a cor ' + k + ' não é igual a nenhuma das que informam — sendo, o botão ' +
      'principal e o aviso ficam da mesma cor e a cor para de avisar', bate);
  });

  /* ---- 3d. NENHUM VÉU BRANCO SOLTO ----
   *
   * Os `rgba(255,255,255,.05)` que desenham trilho de barra e fundo de contador são
   * invisíveis sobre um cartão BRANCO — as barras ficariam boiando sem trilho. Viraram
   * token para inverterem no chão claro, e o branco cru não pode voltar.
   * A conta é UMA ocorrência: a definição do próprio token. */
  /* A CONTA ERRADA ERA MINHA: escrevi "uma ocorrência" e a linha da definição tem DUAS
     — `--veu` e `--veu-forte`. Contar número era cobrar o endereço; o que importa é que
     toda ocorrência esteja DENTRO de uma declaração de véu, e nenhuma solta numa regra. */
  var soltos = (css.match(/(--veu[a-z-]*:\s*)?rgba\(255,\s*255,\s*255/g) || [])
    .filter(function (m) { return m.indexOf('--veu') !== 0; });
  ok(soltos.length === 0,
    'o branco translúcido só aparece definindo um véu — solto numa regra, ele some no ' +
    'fundo claro e a barra fica sem trilho', soltos);
  ok(/\[data-fundo="gelo"\][\s\S]{0,1200}--veu:rgba\(16,32,52/.test(css),
    'e o fundo claro inverte os dois véus — sem isso o token não resolve nada');

  /* ---- 4. a partida, antes de pintar ----
     No fim da página, a tela nasceria na cor de fábrica e piscaria para a escolhida —
     e quem abre o painel trinta vezes por dia vê esse pisca trinta vezes. */
  ['index.html', 'admin.html', 'extrato.html'].forEach(function (nome) {
    var txt = fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
    var cabeca = txt.slice(0, txt.indexOf('</head>'));
    ok(cabeca.indexOf("localStorage.getItem('qdc_tema')") > 0,
      nome + ': a aparência é aplicada no <head>, antes de pintar');
    ok(/indexOf\(t\) < 0 \? 'roxo' : t/.test(cabeca) &&
       /indexOf\(f\) < 0 \? 'azul' : f/.test(cabeca),
      nome + ': e um nome que o CSS não conhece cai no padrão — sem isso a tela fica ' +
      'sem cor de marca nenhuma e a causa está num lugar que ninguém abre');
    ok(/try \{[\s\S]{0,200}localStorage/.test(cabeca),
      nome + ': e o acesso ao armazenamento é protegido — em janela anônima ele estoura, ' +
      'e aqui isso mataria a tela antes de existir onde mostrar o erro');
  });

  /* ---- 5. a verdade é do servidor, o local é cópia ---- */
  ok(/CHAVES_CONFIG = \[[^\]]*'tema', 'fundo'\]/.test(api),
    'o servidor guarda a aparência na configuração da empresa');
  /* A RECUSA NÃO SE LÊ, SE RODA — `teste_api.js`, seção "a aparência é da empresa".
     Escrita aqui, ela virava busca de texto: eu cobrava que a linha da comparação
     existisse, e um `var permitidos = null` — a lista esvaziada, que aceita qualquer
     nome — passava por cima dela sem piscar. Medido: o defeito ESCAPOU. */
  var cd = app.slice(app.indexOf('function carregarDados'),
                     app.indexOf('function carregarDados') + 900);
  ok((cd.match(/aplicarAparencia\(/g) || []).length === 2,
    'e o que vem do servidor é aplicado no `carregarDados` — que é por onde TODA tela ' +
    'recebe a configuração, e não uma cópia por página',
    (cd.match(/aplicarAparencia\(/g) || []).length);

  /* ---- 6. a prévia não é a gravação ----
     Gravando a cada clique, experimentar três cores mandaria três cores para o galpão. */
  var lig = adm.slice(adm.indexOf('function ligarAparencia'),
                      adm.indexOf('function desenharUsuariosDigitando'));
  ok(/Q\.aplicarTema\(b\.dataset\.valor, false\)/.test(lig) &&
     /Q\.aplicarFundo\(b\.dataset\.valor, false\)/.test(lig),
    'clicar numa cor só PREVÊ: não grava no servidor nem na cópia local');
  ok(lig.indexOf("acao:'salvarConfig', chave:'tema'") > 0 &&
     lig.indexOf("acao:'salvarConfig', chave:'fundo'") > 0,
    'e o botão grava as DUAS chaves — gravada uma e falhada a outra, a empresa fica com ' +
    'uma combinação que ninguém escolheu');
  ok(lig.indexOf('Q.aplicarTema(tema); Q.aplicarFundo(fundo);') >
     lig.indexOf("chave:'fundo'"),
    'e a cópia local só é escrita DEPOIS de o servidor aceitar — antes, ela guardaria ' +
    'uma cor que não vingou');

  /* ---- 7. só admin ---- */
  ok(/var pode = Q\.ehAdmin\(\);\s*\n\s*cx\.hidden = !pode;/.test(adm),
    'o cartão de aparência é só de administrador');
  ok(/if \(atalho\) atalho\.hidden = !pode;/.test(adm),
    'e o atalho da lateral some junto — visível e recusado seria pior que ausente');
})();

console.log('\n== a tela de boas-vindas ==');
(function () {
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var api = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
  var log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  var mig = fs.readFileSync(path.join(__dirname, '..', 'api', '_migracoes.js'), 'utf8');
  var sup = fs.readFileSync(path.join(__dirname, '..', 'api', '_supabase.js'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* ---- 1. UMA TELA SÓ PARA OS DOIS APPS ----
     Duas cópias do mesmo texto divergem no dia em que uma é corrigida e a outra não, e
     quem lança no galpão passa a ler uma explicação diferente da que o escritório lê. */
  ok(/function boasVindas\(opts\)/.test(app),
    'a tela de boas-vindas mora no `app.js`, uma só para os dois apps');
  ok(/Q\.boasVindas\(\{/.test(idx) && /Q\.boasVindas\(\{/.test(adm),
    'e os dois apps a chamam — o de lançamento e o painel');
  ok(!/Caixa parada no cliente/.test(idx) && !/Caixa parada no cliente/.test(adm),
    'e o texto não está copiado em nenhum dos dois: ele vive num lugar só');

  /* ---- 2. O QUE A PESSOA PODE, E NÃO UMA LISTA ESCRITA À PARTE ----
     Escrita à parte, ela ofereceria um atalho para uma página que o menu esconde, e o
     toque levaria a lugar nenhum. */
  ok(/pode: abasPermitidas\(s\)/.test(adm),
    'no painel, os atalhos saem das MESMAS abas que a navegação calculou');
  ok(/s\.operacoes/.test(idx),
    'e no app de campo saem das operações liberadas para a pessoa');

  /* ---- 3. O PAPEL, RODADO ----
     Cada frase diz onde a conta depende daquela pessoa. Lido no arquivo, o teste não
     responderia "qual frase esta pessoa vê?", que é a única pergunta que importa. */
  var iP = app.indexOf('  function papelDe(pode)');
  var papel = new Function(app.slice(iP, app.indexOf('\n  }', iP) + 4) +
    '\n return papelDe;')();
  ok(/opera\u00e7\u00e3o inteira/.test(papel(['pgCadastros'])),
    'quem cuida dos cadastros lê que enxerga a operação inteira');
  ok(/feito do que <b>voc\u00ea<\/b> lan\u00e7a/.test(papel(['saida', 'retorno'])),
    'quem lança os dois lê que o saldo da empresa é feito do que ELE lança');
  ok(/contagem sua vira o saldo/.test(papel(['retorno'])),
    'quem só confere o retorno lê que a contagem dele VIRA o saldo');
  ok(/ponto de partida/.test(papel(['saida'])),
    'e quem só lança saída lê que é o ponto de partida da conta');
  ok(/consulta/.test(papel(['pgMovimentos'])),
    'quem só consulta lê que só consulta — e não uma frase que promete mais do que ele pode');
  /* AS CINCO SÃO DIFERENTES. Uma frase repetida em dois papéis não ensina nada a
     ninguém: a pessoa lê o texto do vizinho e conclui que o sistema não a conhece. */
  var frases = [['pgCadastros'], ['saida', 'retorno'], ['retorno'], ['saida'],
                ['pgMovimentos']].map(papel);
  ok(new Set(frases).size === 5,
    'e as cinco frases são diferentes entre si — repetida, ela deixa de falar com quem lê',
    new Set(frases).size);

  /* ---- 4. AS PENDÊNCIAS, RODADAS ----
     Elas saem do que o painel JÁ calcula. O caso que mais importa é o do painel que
     ainda não chegou: zeros na tela leem como "está tudo certo", e nada foi lido. */
  var iQ = app.indexOf('  function pendenciasDo(painel)');
  var pend = new Function('num',
    app.slice(iQ, app.indexOf('\n  }', iQ) + 4) + '\n return pendenciasDo;')(
    function (n) { return String(n); });

  ok(pend(null).length === 0 && pend({}).length === 0,
    'sem painel carregado não há pendência nenhuma — zeros na tela leem como "está ' +
    'tudo certo", e a verdade é que nada foi lido', pend(null));

  var cheio = { totais: { deficit: 2340 },
                rotas: [{ aging: { vencidas: 120, maisAntiga: 9 } }],
                locais: [{ aging: { vencidas: 0, maisAntiga: 3 } }] };
  var r = pend(cheio);
  ok(r.length === 3, 'com movimento, as três perguntas aparecem', r);
  ok(/2340 caixas sa\u00edram e n\u00e3o voltaram/.test(r[0]),
    'o que saiu e não voltou', r[0]);
  ok(/120 passaram do prazo/.test(r[1]), 'o que passou do prazo do local', r[1]);
  ok(/h\u00e1 9 dias/.test(r[2]),
    'e há quantos dias está fora a MAIS antiga — 9, e não os 3 da outra linha', r[2]);

  /* Tudo em dia não inventa pendência: a tarja some. */
  ok(pend({ totais: { deficit: 0 }, rotas: [{ aging: { vencidas: 0, maisAntiga: 0 } }] })
       .length === 0,
    'e com tudo em dia a tarja some, em vez de dizer "0 pendências"');

  /* ---- 5. A MARCA É DA PESSOA, e não do aparelho ----
     No galpão várias usam o mesmo tablet: no aparelho a marca seria de quem entrou
     antes, e a segunda pessoa nunca veria a apresentação. */
  ok(/add column if not exists viu_boas_vindas/.test(mig),
    'a marca de "já viu" é coluna do cadastro');
  ok(/ViuBoasVindas: r\.viu_boas_vindas === true/.test(sup) &&
     /viu_boas_vindas = bool\(o\.ViuBoasVindas\)/.test(sup),
    'e o mapa vai e volta — só de ida, marcar não gravaria; só de volta, nunca leria');
  ok(/viuBoasVindas: u\.ViuBoasVindas === true/.test(log),
    'e ela entra na sessão, que é quem decide o que a tela mostra no instante do login');
  ok(/ViuBoasVindas: u\.ViuBoasVindas === true/.test(log),
    'e volta na leitura da equipe — sem isso, abrir e salvar um cadastro faria a ' +
    'apresentação reaparecer');
  ok(/if \(acao === 'viuBoasVindas'\) return await viuBoasVindas\(p\);/.test(api),
    'a rota existe e está no despacho');
  /* UMA ROTA SÓ PARA A MARCA. O `salvarUsuario` grava o registro inteiro: chamado daqui,
     apagaria perfil, abas e senha — tudo o que esta tela não conhece. */
  var bv = api.slice(api.indexOf('async function viuBoasVindas'));
  bv = bv.slice(0, bv.indexOf('\n}\n'));
  ok(/viu_boas_vindas: true/.test(bv) && !/salvarUsuario/.test(bv),
    'e ela grava SÓ essa coluna — o `salvarUsuario` gravaria o registro inteiro e ' +
    'apagaria o que esta tela não conhece');
  ok(/if \(u\.ViuBoasVindas === true\) return \{ ok: true, jaEstava: true \};/.test(bv),
    'e não vai ao banco quando já estava marcado');

  /* ---- 6. A REDE DO GALPÃO CAI ----
     Ninguém pode ficar preso numa apresentação porque o servidor não respondeu. */
  var fechar = app.slice(app.indexOf('function fechar(){'));
  fechar = fechar.slice(0, fechar.indexOf('\n    }'));
  /* `antesDe` EXISTE POR CAUSA DO -1. Escrita como `indexOf(a) < indexOf(b)`, esta linha
     aprovava o pior caso: sem o `cx.hidden`, o `indexOf` devolve -1, e -1 vem antes de
     qualquer coisa. A tela passaria a esperar o servidor para fechar e a asserção
     continuaria verde. É a terceira vez que este mesmo -1 me pega nesta suíte; daqui em
     diante, ordem se cobra por aqui. */
  function antesDe(texto, a, b) {
    var ia = texto.indexOf(a), ib = texto.indexOf(b);
    return ia >= 0 && ib >= 0 && ia < ib;
  }
  ok(antesDe(fechar, 'cx.hidden = true', "acao: 'viuBoasVindas'"),
    'a tela fecha ANTES de avisar o servidor — esperando a resposta, a rede do galpão ' +
    'prenderia a pessoa na apresentação');
  ok(/\.catch\(function \(\) \{\}\)/.test(fechar),
    'e a falha é engolida: ela reaparece no próximo acesso, que é o erro barato dos dois');

  /* ---- 7. PERMISSÃO DESCONHECIDA NÃO SOME ----
     Sumir faria a pessoa achar que perdeu acesso quando o que está velho é a tela. */
  ok(/bv-acao--nova/.test(app) && /\.bv-acao--nova\{border-style:dashed\}/.test(css),
    'chave que esta versão não conhece aparece com traço pontilhado, em vez de sumir');
  ok(/Seu usu\u00e1rio ainda n\u00e3o tem nenhuma permiss\u00e3o/.test(app),
    'e usuário sem permissão nenhuma lê que é erro de cadastro, em vez de achar uma ' +
    'tela vazia sem explicação');
})();

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TELAS OK\n');
process.exit(falhas ? 1 : 0);
