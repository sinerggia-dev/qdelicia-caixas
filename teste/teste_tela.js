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

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var falhas = 0;

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
  var reId = /id="(f[A-Za-z0-9]+)"/g;
  while ((r = reId.exec(trecho))) criados[r[1]] = true;
  // caixaLocais() desenha o campo em nome do formulário, então conta como criar aqui.
  var reCaixa = /caixaLocais\('(f[A-Za-z0-9]+)'/g;
  while ((r = reCaixa.exec(trecho))) criados[r[1]] = true;

  var lidos = {};
  var reLe = /getElementById\('(f[A-Za-z0-9]+)'\)/g;
  while ((r = reLe.exec(trecho))) lidos[r[1]] = true;
  // lerMarcados() lê pelo id sem passar por getElementById: sem isto, um quadro de
  // marcar no formulário errado escaparia exatamente como o campo que originou o teste.
  var reMarc = /lerMarcados\('(f[A-Za-z0-9]+)'\)/g;
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
                        mvUsuario: 'usuario', mvTeste: 'teste', mvDe: 'de', mvAte: 'ate' };
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

  var k = adm.indexOf("getElementById('btnLimparMov')");
  var limpar = adm.slice(k, adm.indexOf('});', k));
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

  // o deficit conta a partir da lista comum, nunca de todasAsLinhas
  var def = corpoDe('linhasDeficit');
  ok(def.indexOf('saldo < 0') >= 0,
    'o chip "Em deficit" conta quem tem saldo negativo', def.trim());

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
  var mont = new Function('localStorage', 'desenharFluxo',
    fonteOrdem + ' return { fn: ordemColunas, t: TAB_ATIVOS };')(localStorage, function(){});
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
 * precisa continuar querendo dizer TODAS: invertida, ninguem lanca nada no dia do deploy.
 * ------------------------------------------------------------------------- */
console.log('\n== o app so mostra a aba que a pessoa pode usar ==');
(function () {
  var i = html.indexOf('function operacoesDe(s)');
  var fonte = html.slice(i, html.indexOf('\n  function ajustarAbas', i));
  var operacoesDe = new Function(fonte + ' return operacoesDe;')();

  ok(operacoesDe({ perfil: 'Gestor' }).length === 0,
    'sem restricao a lista vem vazia — e vazia quer dizer as duas');
  ok(operacoesDe({ perfil: 'Conferente', operacoes: ['RETORNO'] }).join(',') === 'RETORNO',
    'o cadastro manda', operacoesDe({ perfil: 'Conferente', operacoes: ['RETORNO'] }));
  /* O promotor entra pela mesma porta, em vez de um `if` a parte escondendo a aba: eram
     duas regras sobre a mesma coisa, e bastava habilitar Saida no cadastro de um promotor
     para a aba continuar sumindo sem explicacao. */
  ok(operacoesDe({ perfil: 'PROMOTOR' }).join(',') === 'RETORNO',
    'o promotor sem cadastro cai em retorno pela MESMA peneira, nao por um if a parte');
  ok(operacoesDe({ perfil: 'PROMOTOR', operacoes: ['SAIDA'] }).join(',') === 'SAIDA',
    'e o cadastro vence o padrao do perfil — senao a aba sumiria sem explicacao');

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

  var passa = new Function('l', 'o', 'd', 'DESTINO_ESTOQUE', fonte);
  var estoque = { estoqueInicial: true, inicial: 1250, situacao: 'parado',
                  origens: ['Matriz Fazenda'], destinos: [] };
  var caminho = { inicial: 0, situacao: 'atencao',
                  origens: ['Matriz Fazenda'], destinos: ['João Pessoa'] };

  ok(passa(estoque, '', 'João Pessoa', ESTQ) === true,
    'filtrando por destino, o estoque da Matriz continua na lista');
  ok(passa(caminho, '', 'João Pessoa', ESTQ) === true, 'e o caminho filtrado tambem');
  ok(passa(estoque, 'Filial Maceió', '', ESTQ) === false,
    'mas filtrando por OUTRA origem ele sai: a conta e de outra unidade');
  ok(passa(estoque, 'Matriz Fazenda', '', ESTQ) === true,
    'e pela origem dele, fica');

  /* A opcao propria: ver SO os lancamentos de estoque. Ela nao cabia no filtro de destino
     pelo nome, porque estoque nao e um lugar — a linha nem destino tem. */
  ok(passa(estoque, '', ESTQ, ESTQ) === true,
    'escolhendo "Estoque Inicial" no destino, as linhas de estoque ficam');
  ok(passa(caminho, '', ESTQ, ESTQ) === false,
    'e os caminhos saem — é o único caso em que o estoque não é a exceção, mas a regra');
  ok(passa(estoque, 'Matriz Fazenda', ESTQ, ESTQ) === true &&
     passa(estoque, 'Filial Maceió', ESTQ, ESTQ) === false,
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
  ok(passa(homonimo, '', ESTQ, ESTQ) === false,
    'um caminho cujo destino fosse o próprio token ainda assim sai: o valor é reservado, '
    + 'e não um nome que se compara com os outros', passa(homonimo, '', ESTQ, ESTQ));

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
  var mm = new Function('localStorage', 'desenharFluxo',
    fonte + ' return { fn: larguras, t: TAB_ATIVOS };')(localStorage, function(){});
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
  ok(/var fim = gente \? l\.saldo : l\.fimCorrido;/.test(corpo),
    'e o Saldo final vem do mesmo corrido — nas visoes de gente, do saldo da pessoa');

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

  /* --- a comparacao, rodando --------------------------------------------- */
  var c = adm.indexOf('function compararValores(x, y)');
  var k = adm.indexOf('{', c), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var cmp = new Function('return ' + adm.slice(c, k) + '; compararValores;')();
  cmp = new Function(adm.slice(c, k) + '\n return compararValores;')();

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

  /* --- os tres cliques ---------------------------------------------------- */
  var f = adm.indexOf('function classificarPor(col)');
  var k2 = adm.indexOf('{', f), a2 = 0;
  do {
    if (adm[k2] === '{') a2++; else if (adm[k2] === '}') a2--;
    k2++;
  } while (a2 > 0 && k2 < adm.length);
  var passos = [];
  var classificar = new Function('ORDEM_FLUXO', 'desenharFluxo',
    'var estado = ORDEM_FLUXO;' +
    adm.slice(f, k2).replace(/ORDEM_FLUXO/g, 'estado') +
    '\n return function(c){ classificarPor(c); return estado; };');
  /* Uma FOTO a cada clique. Guardando a referencia do estado, os tres itens da lista
     apontariam para o mesmo objeto e mostrariam o valor final tres vezes — o teste
     passaria a comparar o ultimo passo com ele mesmo. */
  function ciclo() {
    var estado = { col: '', desc: false };
    var fn = classificar(estado, function () { passos.push(1); });
    return [1, 2, 3].map(function () {
      var e = fn('saida');
      return e.col + (e.col ? (e.desc ? ':desc' : ':asc') : '');
    });
  }
  ok(ciclo().join(' → ') === 'saida:asc → saida:desc → ',
    'três cliques na mesma coluna: crescente, decrescente, e de volta ao padrão — sem ' +
    'essa volta não haveria como recuperar a ordem de extrato sem recarregar', ciclo());

  var estado2 = { col: 'saida', desc: true };
  var fn2 = classificar(estado2, function () {});
  ok(fn2('retorno').col === 'retorno' && fn2('retorno').desc === true,
    'e trocar de coluna começa de novo no crescente');
  ok(passos.length >= 3, 'e todo clique redesenha a tabela', passos.length);

  /* --- os tres gestos no mesmo <th> --------------------------------------- */
  ok(/c\.d\.k \? 'ordenavel ' : ''/.test(corpo),
    'só a coluna com chave ganha a classe de clicável — as outras não prometem o que ' +
    'não fazem', corpo.slice(corpo.indexOf('<th draggable'), corpo.indexOf('<th draggable') + 300));
  var lc = adm.indexOf('function ligarClassificacao()');
  var ouv = adm.slice(lc, adm.indexOf('\n  }', lc));
  ok(/th\.ordenavel/.test(ouv),
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
  ok(/lista = lista\.slice\(\)\.sort\(/.test(corpo),
    'ordena sobre uma cópia: a lista vem de dentro do PAINEL, e ordenar no lugar mudaria ' +
    'a ordem para quem a lê depois — inclusive o CSV, que tem a ordem própria dele');
  /* Os cartoes ficam DEPOIS do fim de `corpo`, entao a busca e no arquivo inteiro —
     recortado, `iTot` daria -1 e a comparacao passaria por acidente. */
  var iOrd = adm.indexOf('lista = lista.slice().sort(');
  var iTot = adm.indexOf('var t = totaisDe(lista);');
  ok(iOrd > 0 && iTot > iOrd,
    'e os totais são somados depois, sem se importar com a ordem — somar não depende dela',
    [iOrd, iTot]);

  /* Nao se guarda: e um recorte para responder uma pergunta, nao um jeito de trabalhar. */
  ok(/var ORDEM_FLUXO = \{ col: '', desc: false \};/.test(adm) &&
     adm.indexOf('qdc_ordem') < 0,
    'a classificação não fica guardada: a tela volta na ordem de extrato');
})();

console.log('\n== as abas do painel viram lista ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  /* --- onde o menu mora --------------------------------------------------- */
  var cab = adm.indexOf('<header>');
  var fimCab = adm.indexOf('</header>', cab);
  var menu = adm.indexOf('<div class="menu-abas"');
  ok(cab > 0 && menu > cab && menu < fimCab,
    'o menu mora no cabeçalho, e não numa faixa própria — a faixa custava uma linha ' +
    'inteira da tela para carregar um botão só', [cab, menu, fimCab]);
  ok(menu < adm.indexOf('id="chipRede"'),
    'e fica à esquerda do "Online", onde a pessoa já olha para saber da sessão');

  /* O gatilho fala a lingua dos chips ao lado. Os tokens de superficie (--linha, --txt)
     sao para o chao cinza da pagina e somem no marinho do cabecalho. */
  ok(/\.aba-atual\{[^}]*background:rgba\(255,255,255,\.18\)/.test(css) &&
     /header \.chip\{[\s\S]{0,80}background:rgba\(255,255,255,\.18\)/.test(css),
    'e usa o mesmo fundo dos chips — os tokens de superfície somem no marinho');

  /* A lista alinha pela DIREITA: o gatilho esta na ponta direita do cabecalho, e pela
     esquerda os 230px dela sairiam pela borda da tela. */
  ok(/\.menu-abas nav\.abas\{[^}]*right:0;left:auto/.test(css),
    'a lista alinha pela direita: pela esquerda, sairia pela borda da tela');
  ok(/\.menu-abas\{position:relative/.test(css),
    'e o invólucro é a âncora dela');

  /* --- o gatilho fica FORA do <nav> --------------------------------------- */
  var ini = adm.indexOf('<nav class="abas" id="abas"');
  var fim = adm.indexOf('</nav>', ini);
  var bt = adm.indexOf('id="btnAbas"');
  ok(bt > 0 && !(bt > ini && bt < fim),
    'o gatilho fica fora do <nav>: dentro, viraria uma aba sem página', [bt, ini, fim]);

  /* E o motivo esta no app.js, nao no admin: e la que o ouvinte e ligado em tudo. */
  ok(/function abas\(seletor\)[\s\S]{0,120}querySelectorAll\(seletor \+ ' button'\)/.test(app),
    'porque o trocador de página se liga a TODO botão de dentro do seletor');

  /* Os botoes e os data-pagina nao mudaram: quem troca a pagina continua sendo o mesmo. */
  var nav = adm.slice(ini, fim);
  ['pgRetornos', 'pgPainel', 'pgExtrato', 'pgLancar', 'pgMovimentos', 'pgCadastros']
    .forEach(function (p) {
      ok(nav.indexOf('data-pagina="' + p + '"') > 0, 'a aba ' + p + ' segue no <nav>');
    });
  /* A aba precisa existir nos DOIS lados: no menu da tela e na lista que o servidor
     manda. So no menu, ela aparece para todo mundo e nao da para tirar de ninguem; so no
     servidor, ela nao aparece para ninguem. */
  var log = fs.readFileSync(path.join(__dirname, '..', 'api', '_logica.js'), 'utf8');
  ok(/\{ ID: 'pgColunas',\s+Nome: 'Colunas' \}/.test(log),
    'e a aba Colunas existe também na lista do servidor, que é o que alimenta a permissão');
  ok(!/pgColunas[^}]*soAdmin/.test(log),
    'e não é só do admin: escolher colunas é preferência de quem olha, não muda saldo nenhum');
  ok(nav.indexOf('data-pagina="pgColunas"') > 0,
    'e a aba Colunas entrou no menu');
  ok((nav.match(/<button/g) || []).length === 7,
    'sao sete botoes, nenhum a mais', (nav.match(/<button/g) || []).length);

  /* --- o app de campo nao pode ter mudado --------------------------------- */
  ok(idx.indexOf('menu-abas') < 0 && idx.indexOf('btnAbas') < 0,
    'o app de campo não ganhou lista suspensa: lá são três abas e a barra cabe');
  ok(/nav\.abas\{[^}]*display:flex/.test(css),
    'e a barra horizontal continua sendo o padrão de `nav.abas`');
  /* O CSS da lista mora TODO sob `.menu-abas`. Solto em `.abas`, ele empilharia as abas
     do celular numa coluna e tiraria a barra do topo de quem lanca de luva. */
  var regras = (css.match(/^[^\n{]*\bnav\.abas\b[^\n{]*\{/gm) || []);
  var soltas = regras.filter(function (r) { return r.indexOf('.menu-abas') < 0; });
  /* A lista EXATA, e nao a contagem: contando, uma regra nova solta poderia entrar no
     lugar de outra removida e o numero continuaria batendo. */
  ok(soltas.join(' ') ===
     'nav.abas{ nav.abas::-webkit-scrollbar{ nav.abas button{ nav.abas button.ativa{ ' +
     '  header,nav.abas,.linha-btn,button{',
    'as regras soltas de `nav.abas` são só as da barra compartilhada e a de impressão — ' +
    'qualquer regra nova tem de vir escopada em `.menu-abas`, senão empilha as abas do ' +
    'celular numa coluna', soltas);
  ok(/\.menu-abas nav\.abas\{[^}]*position:absolute/.test(css),
    'a lista sai do fluxo: empurrando o conteúdo, a página saltaria a cada abertura');
  ok(/\.menu-abas nav\.abas\[hidden\]\{display:none\}/.test(css),
    'e fechada ela some de fato — `display:flex` venceria o `hidden` sozinho');

  /* --- o rotulo do gatilho ------------------------------------------------ */
  var a = adm.indexOf('function ajustarMenuAbas()');
  var k = adm.indexOf('{', a), abertas = 0;
  do {
    if (adm[k] === '{') abertas++; else if (adm[k] === '}') abertas--;
    k++;
  } while (abertas > 0 && k < adm.length);
  var fonte = adm.slice(a, k);
  ok(a > 0 && /ativa/.test(fonte), 'o recorte pegou a função do rótulo');

  function bancada(nomeAtiva, fechado) {
    var btn = { textContent: '', attrs: {},
                setAttribute: function (x, v) { this.attrs[x] = v; } };
    var navEl = { hidden: fechado,
                  querySelector: function () {
                    return nomeAtiva ? { textContent: nomeAtiva } : null; } };
    var doc = { getElementById: function (id) {
      return id === 'btnAbas' ? btn : (id === 'abas' ? navEl : null); } };
    new Function('document', fonte + '\n ajustarMenuAbas();')(doc);
    return btn;
  }

  var fechada = bancada('Movimentos', true);
  ok(fechada.textContent === '☰ Movimentos' && fechada.attrs['aria-expanded'] === 'false',
    'fechada, o gatilho diz QUAL página está aberta — sem isso a única pista de onde se ' +
    'está sumiria junto com a barra', fechada.textContent);

  var aberta = bancada('Movimentos', false);
  ok(aberta.textContent === '✕ Movimentos' && aberta.attrs['aria-expanded'] === 'true',
    'aberta, o mesmo botão fecha', aberta.textContent);

  ok(bancada('Cadastros', true).textContent === '☰ Cadastros',
    'e o nome sai da aba ativa, não de um texto fixo',
    bancada('Cadastros', true).textContent);

  /* --- as saidas ---------------------------------------------------------- */
  var og = adm.indexOf("getElementById('btnAbas').addEventListener");
  var ouvinte = adm.slice(og, adm.indexOf('\n  });', og));
  ok(og > 0 && /e\.stopPropagation\(\)/.test(ouvinte),
    'o clique no gatilho não vaza para o documento — vazando, fecharia o que abriu');
  ok(/if \(nav && !nav\.hidden && !nav\.contains\(e\.target\)\) abrirMenuAbas\(false\)/.test(adm),
    'clicar fora fecha');
  ok(/e\.key === 'Escape' && nav && !nav\.hidden/.test(adm), 'e o Esc também');

  /* Escolher uma pagina fecha a lista: aberta, ela taparia justamente a pagina pedida. */
  var ao = adm.indexOf('window.aoAbrirAba = function(p)');
  var corpo = adm.slice(ao, adm.indexOf('\n  };', ao));
  ok(corpo.indexOf('abrirMenuAbas(false)') > 0,
    'escolher uma página fecha a lista — aberta, taparia a página pedida', corpo);

  /* A peneira de permissao pode trocar a pagina aberta; o rotulo tem de acompanhar. */
  var ap = adm.indexOf('function ajustarAbasPainel(s)');
  var corpoP = adm.slice(ap, adm.indexOf('\n  }', adm.indexOf('primeira.click()', ap)));
  ok(corpoP.indexOf('ajustarMenuAbas()') > 0,
    'e a peneira de permissão reajusta o rótulo: ela pode abrir outra página');
})();

/* ---------------------------------------------------------------------------
 * Escolher as colunas da tabela.
 *
 * Esconder coluna e esconder informacao — o mesmo risco do painel de filtros e do trilho.
 * O gatilho carrega a contagem das escondidas, e o "Mostrar todas" desfaz de uma vez.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * O cadastro nao oferece a aba que a regra nunca honra.
 *
 * "Ajustes" e "Cadastros" sao `soAdmin`, e `abasPermitidas` as descarta para quem nao e
 * Admin. O formulario deixava marca-las assim mesmo — e a pessoa via a permissao ligada
 * no cadastro e a aba ausente na tela, sem nada explicando a diferenca. Aconteceu de
 * verdade com um Gerente que tinha as cinco marcadas e via quatro.
 * ------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 * A peneira de abas nunca deixa o painel vazio.
 *
 * Marca que nao alcanca nenhuma aba visivel deixaria a pessoa num painel sem aba, sem
 * pagina aberta e sem pista do que houve. Acontece de dois jeitos, os dois reais: marca
 * gravada so em Ajustes/Cadastros para quem nao e admin, e id de uma aba que foi
 * renomeada ou saiu do app.
 * ------------------------------------------------------------------------- */
console.log('\n== a peneira de abas nunca devolve vazio ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function abasPermitidas(s)');
  var fonte = adm.slice(i, adm.indexOf('\n  }', i)) + '\n  }';
  var ABAS = [{ ID: 'pgRetornos', Nome: 'Painel de Ativos' },
              { ID: 'pgPainel', Nome: 'Painel' },
              { ID: 'pgLancar', Nome: 'Ajustes', soAdmin: true },
              { ID: 'pgCadastros', Nome: 'Cadastros', soAdmin: true }];

  function pode(ehAdmin, marcadas) {
    var fn = new Function('ABAS_PAINEL', 'Q', fonte + ' return abasPermitidas;')(
      ABAS, { ehAdmin: function () { return ehAdmin; } });
    return fn({ abas: marcadas }).join(',');
  }

  ok(pode(false, []) === 'pgRetornos,pgPainel',
    'sem marca, valem todas as permitidas — e as de admin ficam fora', pode(false, []));
  ok(pode(true, []) === 'pgRetornos,pgPainel,pgLancar,pgCadastros',
    'para o admin, todas', pode(true, []));
  ok(pode(false, ['pgPainel']) === 'pgPainel',
    'com marca que alcança, vale a marca', pode(false, ['pgPainel']));

  /* Os tres casos de tela vazia. */
  ok(pode(false, ['pgLancar']) === 'pgRetornos,pgPainel',
    'marcado só Ajustes, a marca é ignorada em vez de deixar a tela vazia',
    pode(false, ['pgLancar']));
  ok(pode(false, ['pgLancar', 'pgCadastros']) === 'pgRetornos,pgPainel',
    'idem com as duas de admin', pode(false, ['pgLancar', 'pgCadastros']));
  ok(pode(false, ['pgAntiga']) === 'pgRetornos,pgPainel',
    'e id de aba que não existe mais — depois de renomear ou remover uma aba, a marca ' +
    'guardada no banco continua apontando para o nome velho', pode(false, ['pgAntiga']));

  /* A escolha e deliberada, e o comentario diz por que: errar para o lado de MOSTRAR se
     corrige no cadastro; errar para o lado de trancar so se resolve com o admin por
     perto. E a mesma escolha da convencao "lista vazia = TODAS", um nivel acima. */
  ok(/errar para o lado de MOSTRAR/.test(fonte),
    'e o código registra por que erra para o lado de mostrar');

  /* Uma peneira so, e nao duas. As duas regras — soAdmin e a lista marcada — moram
     juntas de proposito: separadas, acabam discordando sobre a mesma aba. */
  ok((adm.match(/function abasPermitidas/g) || []).length === 1 &&
     /a\.soAdmin && !Q\.ehAdmin\(\)/.test(fonte) &&
     /marcadas\.map\(String\)\.indexOf/.test(fonte),
    'as duas regras moram na mesma peneira');
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
  ok(/a\.soAdmin \? 'só admin' : ''/.test(chamada),
    'e a chamada das abas passa a trava do `soAdmin` — sem ela, a caixa saberia travar ' +
    'e nunca travaria nada', chamada);

  var Q = { esc: function (v) { return String(v); }, ativo: function () { return true; } };
  var caixa = new Function('Q', fonte + ' return caixaLocais;')(Q);
  var ABAS = [{ ID: 'pgRetornos', Nome: 'Painel de Ativos' },
              { ID: 'pgLancar', Nome: 'Ajustes', soAdmin: true },
              { ID: 'pgCadastros', Nome: 'Cadastros', soAdmin: true }];
  var html = caixa('fAbas', 'Abas', ABAS, ['pgRetornos', 'pgLancar'], 'vazio',
                   function (a) { return a.soAdmin ? 'só admin' : ''; });

  ok((html.match(/data-trava="1"/g) || []).length === 2,
    'as duas de admin saem marcadas para travar, e só elas',
    (html.match(/data-trava="1"/g) || []).length);
  ok((html.match(/só admin/g) || []).length === 2,
    'e cada uma diz por que — a etiqueta fica ao lado do nome');

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
  ok(av > 0 && corpoAvisar.indexOf("'Aviso'") > 0,
    'o recorte pegou o escritor de avisos', corpoAvisar.length);
  ok(/#fAbas input\[data-trava\]/.test(corpoAjuste) && /ch\.disabled = !ehAdmin/.test(corpoAjuste),
    'a trava é reavaliada junto com o Perfil: escrever "Admin" destrava na hora, e apagar ' +
    'trava de volta', corpoAjuste.slice(-400));

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
    var abas = [{ disabled: false, dataset: { trava: '1' },
                  parentNode: { classList: { toggle: function () {} } } },
                { disabled: false, dataset: {},
                  parentNode: { classList: { toggle: function () {} } } }];
    var classe = {};
    var avisos = {};
    function lista(id) {
      return { classList: { toggle: function (c, v) { classe[id] = !!v; } },
               querySelectorAll: function () { return id === 'fAbas' ? abas : []; } };
    }
    /* O elemento de aviso de cada quadro, com o mesmo nome que a tela usa. */
    ['fAbas', 'fOperacoes', 'fSaidas', 'fDestinos', 'fTiposCaixa', 'fMotoristas']
      .forEach(function (q) { avisos[q] = { textContent: '', hidden: true }; });
    var els = {
      fPainel: { disabled: false, value: o.painel === false ? 'NAO' : 'SIM' },
      fAtivo: { value: o.ativo === false ? 'NAO' : 'SIM' },
      fSenha: { value: o.senhaDigitada || '' },
      fPainelNota: { textContent: '' }, fAbasNota: { textContent: '' },
      fAtivoNota: { textContent: '' }, fPerfilNota: { textContent: '' },
      fAbas: lista('fAbas'), fOperacoes: lista('fOperacoes'), fSaidas: lista('fSaidas'),
      fDestinos: lista('fDestinos'), fTiposCaixa: lista('fTiposCaixa'),
      fMotoristas: lista('fMotoristas'),
      fAbasAviso: avisos.fAbas, fOperacoesAviso: avisos.fOperacoes,
      fSaidasAviso: avisos.fSaidas, fDestinosAviso: avisos.fDestinos,
      fTiposCaixaAviso: avisos.fTiposCaixa, fMotoristasAviso: avisos.fMotoristas
    };
    var botoes = [{ disabled: false }];
    var doc = {
      getElementById: function (id) { return els[id] || null; },
      querySelectorAll: function (sel) {
        if (sel.indexOf('data-trava') > 0) return abas;
        if (sel.indexOf('data-marcatudo') >= 0) return botoes;
        return [];
      },
      querySelector: function () { return botoes[0]; }
    };
    new Function('document', 'perfilDigitado', 'PERFIS', 'COM_PODER', 'TEM_SENHA_PAINEL',
      corpoAvisar + '\n' + corpoAjuste + '\n ajustarPainel();')(
      doc, function () { return o.perfil || 'Gerente'; }, ['Gerente'], { ADMIN: 'x' },
      o.temSenha === true);
    return {
      travadas: abas.filter(function (c) { return c.disabled; }).length,
      notaAbas: els.fAbasNota.textContent,
      notaPainel: els.fPainelNota.textContent,
      notaAtivo: els.fAtivoNota.textContent,
      abasBloqueadas: !!classe.fAbas,
      saidasBloqueadas: !!classe.fSaidas,
      marcarTudo: botoes[0].disabled,
      avisoAbas: avisos.fAbas.hidden ? '' : avisos.fAbas.textContent,
      avisoSaidas: avisos.fSaidas.hidden ? '' : avisos.fSaidas.textContent
    };
  }

  /* --- a trava de admin, que ja existia ----------------------------------- */
  var ger = bancada({ perfil: 'Gerente', temSenha: true });
  ok(ger.travadas === 1 && /travados/.test(ger.notaAbas),
    'para um Gerente a aba de admin trava, e a nota explica', ger);
  var adm2 = bancada({ perfil: 'Admin', temSenha: true });
  ok(adm2.travadas === 0 && !/travados/.test(adm2.notaAbas),
    'e para um Admin nenhuma trava — a nota some junto', adm2);

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
  ok(!comPainel.abasBloqueadas && /Nada marcado = todas/.test(comPainel.notaAbas),
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
  [['fPerfil', 'input'], ['fPainel', 'change'], ['fAtivo', 'change'], ['fSenha', 'input']]
    .forEach(function (par) {
      var re = new RegExp("getElementById\\('" + par[0] + "'\\)\\.addEventListener\\('" +
                          par[1] + "', ajustarPainel\\)");
      ok(re.test(adm),
        'o campo ' + par[0] + ' reavalia as pré-condições (`' + par[1] + '`) — sem isso a ' +
        'tela mente no instante em que a pessoa mexe nele');
    });

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
  ok(/\.aviso-trava\{/.test(css) && /\.aviso-trava\[hidden\]\{display:none\}/.test(css),
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
  ok(cols.length === 8, 'são oito colunas de fábrica', cols);

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

  /* --- cabecalho e celulas saem da MESMA lista ---------------------------- */
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,260}<th/.test(corpo),
    'o cabeçalho percorre a lista de colunas');
  ok(/cs\.map\(function\(c\)\{[\s\S]{0,120}<td/.test(corpo),
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

  var d = adm.indexOf('function desenharUsuarios(){');
  var dk = adm.indexOf('{', d), dn = 0;
  do {
    if (adm[dk] === '{') dn++; else if (adm[dk] === '}') dn--;
    dk++;
  } while (dn > 0 && dk < adm.length);
  var fonte = adm.slice(d, dk);
  ok(d > 0 && fonte.length > 2000 && fonte.indexOf('</tbody></table>') > 0,
    'o recorte pegou a função inteira', fonte.length);

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
  ok(/data-col="'\+c\.id\+'"/.test(fonte) && /<span class="puxador">/.test(fonte),
    'cada título sai com o `data-col` e a alcinha — é por eles que as duas se agarram');

  /* A coluna de acoes fica FORA. Escondivel, alguem a esconde sem querer e perde o unico
     jeito de editar, desativar ou excluir um cadastro. */
  var i0 = fonte.indexOf('padrao:');
  var ids = ['nome', 'perfil', 'usuario', 'email', 'senha', 'painel', 'local',
             'telefone', 'ativo'];
  var descr = adm.slice(adm.indexOf('var TAB_USUARIOS = {'),
                        adm.indexOf('\n  };', adm.indexOf('var TAB_USUARIOS = {')));
  ids.forEach(function (id) {
    ok(descr.indexOf("'" + id + "'") > 0 || descr.indexOf(id + ':') > 0,
      'a coluna ' + id + ' está no descritor');
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
  ok(/getElementById\('buscaUsuarios'\)\.addEventListener\('input', desenharUsuarios\)/
      .test(adm),
    'e a busca chama esse mesmo caminho, em vez de montar a tabela por fora');

  /* O subtitulo do cabecalho NAO entra em `titulos`: a aba Colunas precisa do nome da
     coluna, e "entra no app e no painel" e explicacao, nao nome. */
  ok(/sub: 'entra no app e no painel'/.test(fonte),
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
  var iH = idx.indexOf('<header>');
  var cab = idx.slice(iH, idx.indexOf('</header>', iH));
  ok(iH > 0 && cab.indexOf('chipSair') > 0, 'o recorte pegou o cabeçalho', cab.length);
  ok(/id="chipPainel"/.test(cab),
    'quem já entrou tem por onde chegar ao painel — sem isto, o link só existe na tela ' +
    'de entrada e some assim que a pessoa entra');
  ok(/<a class="chip" id="chipPainel" href="admin\.html"/.test(cab),
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
    return new Function('s', 'document', 'ajustarAbas',
      fonte + '\n aplicarSessao(s); return !document.getElementById("chipPainel").hidden;')(
      s, { getElementById: function (id) { return alvo[id] || (alvo[id] = {}); } },
      function () {});
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

  ok(/a\.chip\{/.test(css) && /a\.chip\[hidden\]\{display:none\}/.test(css),
    'e o estilo do link existe, inclusive o `hidden` — sem essa regra o `display` do ' +
    'chip venceria o `hidden` e a porta apareceria para todo mundo');
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
  ok(ir > 0 && /s\.soProprios === true/.test(rec),
    'o app de campo sabe quando a pessoa é restrita', rec);

  /* A MESMA regra dos dois lados. Escrita diferente em cada tela, elas divergem no
     primeiro ajuste e uma passa a mostrar o que a outra esconde. */
  var ia = adm.indexOf('function recorteProprios()');
  var recAdm = adm.slice(ia, adm.indexOf('\n  }', ia));
  ok(rec.replace(/\s+/g, ' ').indexOf(
       's.soProprios === true && s.id) ? String(s.id)') > 0 &&
     recAdm.replace(/\s+/g, ' ').indexOf(
       's.soProprios === true && s.id) ? String(s.id)') > 0,
    'e a regra é a MESMA das duas telas — escrita diferente em cada uma, elas divergem ' +
    'no primeiro ajuste e uma passa a mostrar o que a outra esconde');

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
})();

console.log('\n== painel restrito: a tela pede e anuncia o recorte ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  /* --- UM controle para UMA pergunta -------------------------------------- */
  /* Tres valores na mesma chave, e nao um interruptor novo ao lado dela: dois controles
     permitiriam "ve apenas os proprios" com o painel desligado, que nao quer dizer nada. */
  var iS = adm.indexOf("'<select id=\"fPainel\">'+");
  var sel = adm.slice(iS, adm.indexOf("'</select>'+", iS));
  ok(iS > 0 && (sel.match(/<option value=/g) || []).length === 3,
    'a chave do painel tem TRÊS valores, e não um interruptor novo ao lado — dois ' +
    'controles para uma pergunta só permitiriam "vê só os próprios" com o painel ' +
    'desligado', (sel.match(/value="(\w+)"/g) || []));
  ok(/value="PROPRIOS"/.test(sel) && /apenas os lançamentos dela/.test(sel),
    'e o terceiro diz o que faz, com as palavras de quem pediu', sel);

  /* A traducao de tres valores para duas colunas mora num lugar so. */
  var env = adm.slice(adm.indexOf('AcessoPainel:('), adm.indexOf('Saidas:lerMarcados'));
  ok(/AcessoPainel:\(document\.getElementById\('fPainel'\)\.value === 'NAO' \? 'NAO' : 'SIM'\)/.test(env) &&
     /SoProprios:\(document\.getElementById\('fPainel'\)\.value === 'PROPRIOS' \? 'SIM' : 'NAO'\)/.test(env),
    'o salvar traduz os três valores nas duas colunas, num lugar só — espalhada, ' +
    '"PROPRIOS" viraria acesso desligado em algum caminho esquecido', env);

  /* "PROPRIOS" e painel LIGADO: as abas valem igual, muda o que aparece dentro delas. */
  var ajuste = adm.slice(adm.indexOf('function ajustarPainel()'));
  ajuste = ajuste.slice(0, ajuste.indexOf('\n    }'));
  ok(/sel\.value !== 'NAO'/.test(ajuste),
    'com "apenas os próprios" as abas continuam valendo — o que muda é o que aparece ' +
    'DENTRO delas, não quais existem');

  /* --- a tela PEDE o recorte ---------------------------------------------- */
  var r = adm.indexOf('function recorteProprios()');
  var rec = adm.slice(r, adm.indexOf('\n  }', r));
  ok(r > 0 && /s\.soProprios === true/.test(rec),
    'o recorte sai da sessão, numa função só', rec);
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
  ok(/soProprios: u\.SoProprios === true/.test(adm.slice(sr, adm.indexOf('\n  }', sr))),
    'a sessão renovada mantém o recorte — perdido aqui, a pessoa passaria a ver tudo no ' +
    'primeiro recarregamento');
})();

console.log('\n== a porta de volta, do painel para os lancamentos ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var L = require(path.join(__dirname, '..', 'api', '_logica.js'));

  /* Sem ela, quem chegava ao painel ficava preso: para voltar a lancar era preciso Sair e
     entrar de novo. A ida ganhou porta antes da volta, e uma porta so e um corredor. */
  var iH = adm.indexOf('<div id="app"');
  var cab = adm.slice(adm.indexOf('<header>', iH), adm.indexOf('</header>', iH));
  ok(cab.indexOf('chipSair') > 0 && cab.indexOf('btnAbas') > 0,
    'o recorte pegou o cabeçalho do painel', cab.length);
  ok(/<a class="chip" id="chipCampo" href="index\.html"/.test(cab),
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
    return new Function('s', 'document',
      fonte + '\n aplicarSessao(s); return !document.getElementById("chipCampo").hidden;')(
      s, { getElementById: function (id) { return alvo[id] || (alvo[id] = {}); } });
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
  ok(fontes.every(function (f) { return f.length > 60; }),
    'o recorte pegou as cinco funções', fontes.map(function (f) { return f.length; }));

  /* Roda as cinco funcoes de verdade, com o mundo delas de mentira: a sessao guardada, o
     relogio (a saida e ADIADA, para a pessoa ler o aviso antes de a pagina recarregar) e
     os avisos. Medir sem adiantar o relogio mede o aviso, e nao a saida. */
  function roda(equipe, chegou, guardada, admin) {
    var estado = { sessao: guardada, saiu: false, aviso: '' };
    var relogio = [];
    var api = new Function('EQUIPE', 'EQUIPE_CHEGOU', 'ABAS_PAINEL', 'Q', 'setTimeout',
      'return (function(){' + fontes.join('\n') +
      '\n return { renovar: renovarSessao, abas: abasPermitidas }; })();')(
      equipe, chegou, L.ABAS,
      { sessao: function () { return estado.sessao; },
        entrar: function (u) { estado.sessao = u; },
        sair: function () { estado.saiu = true; },
        toast: function (m) { estado.aviso = m; },
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
  ok(r.abas.join(',') === 'pgRetornos,pgPainel,pgExtrato,pgMovimentos',
    'a marca nova do cadastro vale sem a pessoa sair e entrar — a sessão guardada é uma ' +
    'foto do login, e sozinha ela congela a permissão do dia em que a pessoa entrou',
    r.abas);
  ok(r.abas.indexOf('pgLancar') < 0,
    'e a marca de Ajustes continua sem efeito para quem não é admin, mesmo vindo do banco');
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

  function tela(ordem, ocultas, larg) {
    var box = { innerHTML: '', querySelectorAll: function () { return []; } };
    new Function('document', 'Q', 'tabelasGerenciaveis', 'ordemColunas', 'colunasOcultas',
      'larguras', 'LARG_MIN',
      fonte + '\n desenharColunas();')(
      { getElementById: function (id) { return id === 'listaColunas' ? box : null; } },
      { esc: function (v) { return String(v); } },
      function () {
        return [{ modulo: 'Painel de Ativos',
                  t: { titulos: { data: 'Data', saida: 'Saída', quem: 'Quem' } } }];
      },
      function () { return ordem; }, function () { return ocultas; },
      function () { return larg; }, 70);
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
  ok(/\.ret-pop\{bottom:auto;top:calc\(100% \+ 6px\)/.test(mob),
    'no celular desce, porque lá o trilho é uma faixa no topo');
  ok(/\.ret-pop\[hidden\]\{display:none\}/.test(css), 'e fechado ele some de fato');

  /* Subir e o padrao, mas o trilho tem a ALTURA DA TABELA: com poucas linhas ele encolhe,
     o gatilho sobe junto, e o painel nasceria acima do topo da tela — sem rolagem que o
     alcance. A direcao e entao decidida medindo, na hora de abrir. */
  /* A direcao tem um LADO PREFERIDO, que depende de onde o gatilho mora: no rodape do
     trilho o painel sobe, porque para baixo so ha a borda da tela; numa barra acima da
     tabela ele desce, senao taparia os filtros que a pessoa acabou de usar. Nao cabendo
     do lado preferido, cai no outro — e nao cabendo em nenhum, volta ao preferido, onde
     a rolagem da pagina alcanca.

     Exercitado rodando, com as duas preferencias e as duas medidas. */
  var ip = adm.indexOf('function posicionarPop(pop, preferBaixo)');
  var pk = adm.indexOf('{', ip), pn = 0;
  do {
    if (adm[pk] === '{') pn++; else if (adm[pk] === '}') pn--;
    pk++;
  } while (pn > 0 && pk < adm.length);
  var fontePos = adm.slice(ip, pk);
  ok(ip > 0 && /preferBaixo/.test(fontePos), 'o recorte pegou a função da direção');

  function direcao(preferBaixo, topo, base, janela) {
    var cls = {};
    var pop = {
      classList: {
        toggle: function (c, v) { if (v) cls[c] = 1; else delete cls[c]; },
        contains: function (c) { return !!cls[c]; }
      },
      getBoundingClientRect: function () {
        /* Para baixo a caixa comeca no gatilho; para cima ela termina nele. A bancada
           devolve a medida que corresponde ao lado em que ela esta no momento. */
        return cls['para-baixo'] ? { top: base - 300, bottom: base }
                                 : { top: topo, bottom: topo + 300 };
      }
    };
    new Function('pop', 'preferBaixo', 'window',
      fontePos + '\n posicionarPop(pop, preferBaixo);')(pop, preferBaixo, { innerHeight: janela });
    return cls['para-baixo'] ? 'desce' : 'sobe';
  }

  ok(direcao(false, 400, 500, 900) === 'sobe',
    'preferindo subir e cabendo acima, sobe');
  ok(direcao(false, -50, 500, 900) === 'desce',
    'preferindo subir e NÃO cabendo acima, desce');
  ok(direcao(true, 400, 700, 900) === 'desce',
    'preferindo descer e cabendo abaixo, desce — a barra fica acima da tabela');
  ok(direcao(true, 400, 1200, 900) === 'sobe',
    'preferindo descer e não cabendo abaixo, sobe');
  ok(direcao(true, -50, 1200, 900) === 'desce',
    'não cabendo em nenhum dos dois, volta ao preferido: lá a rolagem da página alcança');
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
  ok(trilho.indexOf('class="btn') < 0 && (trilho.match(/class="ret-acao"/g) || []).length === 4,
    'os quatro botões usam o estilo do trilho, e não o .btn de formulário', trilho);
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
    var api = new Function('document', 'FLUXO_FILTRO', 'FILTROS_FLUXO', 'valor',
      'colunasOcultas', 'TAB_ATIVOS',
      'function posicionarPop(p){ if (!p) return;' +
      ' p.classList.remove("para-baixo");' +
      ' if (p.getBoundingClientRect().top < 8) p.classList.add("para-baixo"); }' +
      fonte + '\n return { abrir: abrirFiltros, ajustar: ajustarBarraFiltros,' +
      '\n          quantos: quantosFiltrosFluxo };')(
      doc, grupoAtivo, ['rtOrigem', 'rtDestino', 'rtDe', 'rtAte'],
      function (id) { return campos[id] || ''; }, function () { return []; }, {});
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

  /* A mesma funcao cuida do Limpar: duas contagens sobre a mesma regra divergiriam. */
  ok(fechado.els.btnLimparRetornos.disabled === true &&
     suja.els.btnLimparRetornos.disabled === false,
    'e a mesma função acende o Limpar — uma contagem só para os dois botões');

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
  ok(i > 0 && fileira.length > 200 && fileira.indexOf('tile(') > 0,
    'o recorte pegou a fileira inteira — vazio, todo teste abaixo passaria sem testar',
    fileira.length);

  var quantos = fileira.split('tile(').length - 1;
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

  /* --- o que segue o filtro, e o que nao segue ---------------------------- */
  var j = adm.indexOf('var t = totaisDe(lista);');
  ok(j > 0 && j < i, 'os totais saem da lista já filtrada, e não do período inteiro');
  ok(/tile\(Q\.num\(t\.saida\), 'Total de Saída'/.test(fileira),
    'a saída lê esses totais, por isso acompanha o filtro', fileira);
  ok(/tile\(Q\.num\(t\.retorno\), 'Total de Retorno'/.test(fileira),
    'e o retorno também', fileira);
  ok(/Q\.num\(t\.saida \+ t\.retorno\)/.test(fileira),
    'a soma dos dois é o rodapé do cartão de retorno');

  /* O estoque e o unico que NAO segue o filtro: sai do razao, e nao do fluxo do periodo.
     Sem o aviso no rodape, ele pareceria travado quando a tabela embaixo muda. */
  ok(/tile\(Q\.num\(estoque\), 'Total no Estoque', '[^']*fora do filtro', 'ok'\)/.test(fileira),
    'o estoque avisa que está fora do filtro, e sai em verde', fileira);
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
    var faz = new Function('document', 'FLUXO_FILTRO', 'chamou',
      fonte +
      '\n return { ativo: algumFiltroFluxo, limpar: limparFiltrosFluxo,' +
      '\n          grupo: function(){ return FLUXO_FILTRO; } };' +
      '\n function carregarPainel(){ chamou.carregou++; }' +
      '\n function desenharFluxo(){ chamou.desenhou++; }');
    var api = faz(doc, grupo, chamou);
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
  ok((corpoBarra.match(/\.disabled = /g) || []).length === 1 &&
     /if \(limpar\) limpar\.disabled = !n;/.test(corpoBarra),
    'e so um lugar liga e desliga o Limpar — espalhar isso deixa o botao aceso depois ' +
    'de limpo', corpoBarra);

  var html = adm.slice(adm.indexOf('id="btnLimparRetornos"') - 200,
                       adm.indexOf('id="btnLimparRetornos"') + 200);
  ok(/disabled/.test(html),
    'o botao nasce desligado no HTML: antes do primeiro desenho não há o que limpar');
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
  ok(/l\.fimCorrido/.test(corpo) && corpo.indexOf('estoqueInicial') < 0,
    'o recorte pegou a celula certa, e ela nao tem mais excecao para o estoque');
  var Q = { num: function (n) { return String(n); } };
  var celula = new Function('Q', 'gente', 'l', corpo);

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
    { ID: 'pgLancar', Nome: 'Ajustes', soAdmin: true },
    { ID: 'pgMovimentos', Nome: 'Movimentos' },
    { ID: 'pgCadastros', Nome: 'Cadastros', soAdmin: true }
  ];
  function monta(ehAdmin) {
    var Q = { ehAdmin: function () { return ehAdmin; } };
    return new Function('Q', 'ABAS_PAINEL', fonte + ' return abasPermitidas;')(Q, ABAS);
  }

  var admin = monta(true), gente = monta(false);

  ok(admin({}).length === 6,
    'admin sem restricao ve as seis', admin({}));
  ok(gente({}).join(',') === 'pgRetornos,pgPainel,pgExtrato,pgMovimentos',
    'quem nao e admin nunca ve Ajustes nem Cadastros, marcados ou nao', gente({}));

  ok(gente({ abas: ['pgRetornos'] }).join(',') === 'pgRetornos',
    'a lista do cadastro manda no que sobra', gente({ abas: ['pgRetornos'] }));
  /* Marcar Cadastros para quem nao e admin nao abre a porta: a regra do admin vem
     primeiro, e e ela que nao se negocia pelo cadastro. */
  ok(gente({ abas: ['pgCadastros', 'pgExtrato'] }).join(',') === 'pgExtrato',
    'marcar Cadastros para quem nao e admin nao abre a porta',
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
  function passa(m, sel) {
    marcados = sel;
    var f = new Function('marcados', 'm', pf.slice(pf.indexOf('{') + 1, pf.lastIndexOf('}')));
    return f(function (id) { return marcados[id] || []; }, m);
  }
  var saida = { tipo: 'SAIDA', motorista: 'Chico', origem: 'Matriz', destino: 'Caruaru' };
  var volta = { tipo: 'DEVOLUCAO', motorista: 'Ramos', origem: 'Recife', destino: 'Matriz' };

  ok(passa(saida, {}) && passa(volta, {}),
    'nada marcado quer dizer TODOS — senao a tela abriria vazia sem dizer por que');
  ok(passa(saida, { lcFSentido: ['SAIDA'] }) && !passa(volta, { lcFSentido: ['SAIDA'] }),
    'o sentido separa saida de retorno');
  ok(passa(volta, { lcFSentido: ['RETORNO'] }), 'e a devolucao e o retorno');

  /* O ponto da multipla escolha: dois valores no mesmo filtro passam os dois. */
  ok(passa(saida, { lcFMotorista: ['Chico', 'Ramos'] }) &&
     passa(volta, { lcFMotorista: ['Chico', 'Ramos'] }),
    'dois motoristas marcados passam os dois — e para isso que o filtro e multiplo');
  ok(!passa(saida, { lcFMotorista: ['Ramos'] }),
    'e quem nao esta marcado sai');

  // filtros diferentes se SOMAM
  ok(!passa(saida, { lcFMotorista: ['Chico'], lcFDestino: ['Recife'] }),
    'filtros diferentes se somam: motorista certo e destino errado nao passa');

  /* As opcoes saem dos lancamentos que VIERAM, e nao do cadastro inteiro: uma lista com
     trinta locais dos quais dois tem movimento obriga a procurar. */
  var mf = corpo('montarFiltrosLanc');
  ok(mf.indexOf('LANC.forEach') > 0 && mf.indexOf('DADOS.locais') < 0,
    'as opcoes saem dos lancamentos do periodo, nao do cadastro inteiro', mf.trim());
  ok(mf.indexOf('antes.indexOf(o[0]) >= 0') > 0,
    'e a marcacao sobrevive ao remontar a lista');

  // os cartoes somam o que esta na TELA, nao o periodo inteiro
  var dl = corpo('desenharLanc');
  ok(dl.indexOf('LANC.filter(passaFiltro)') > 0 && dl.indexOf('lista.forEach') > 0,
    'os cartoes somam a lista JA filtrada — o resumo tem de concordar com a tabela',
    dl.indexOf('lista.forEach'));
  ok(/saiu \+ voltou/.test(dl),
    'e o total geral e saidas mais retornos');

  // a tabela traz as colunas pedidas
  ['Data', 'Origem', 'Destino', 'Caixa', 'Saída', 'Retorno', 'Motorista'].forEach(function (c) {
    ok(dl.indexOf('>' + c + '<') > 0, 'a tabela tem a coluna ' + c, c);
  });

  ok(html.indexOf('id="lcFSentido"') > 0 && html.indexOf('id="lcFMotorista"') > 0 &&
     html.indexOf('id="lcFOrigem"') > 0 && html.indexOf('id="lcFDestino"') > 0,
    'os quatro filtros existem na tela');
  ok(html.indexOf('id="lcDe"') > 0 && html.indexOf('id="lcAte"') > 0,
    'e o periodo tambem');

  /* A aba recarrega ao ser aberta: com o app aberto o dia inteiro, uma lista congelada na
     hora do login nao mostraria o que a pessoa acabou de lancar. */
  ok(/pgSaldo'\) carregarLanc\(\)/.test(html),
    'abrir a aba recarrega os lancamentos');
})();

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TELAS OK\n');
process.exit(falhas ? 1 : 0);
