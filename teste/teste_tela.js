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

var fs = require('fs');
var path = require('path');

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
  ok(/colspan="'\+cs\.length\+'"/.test(corpo),
    'o aviso de tabela vazia usa o tamanho dessa lista, nao um numero fixo');

  // toda coluna declarada tem titulo e como preencher
  var defs = corpo.slice(corpo.indexOf('var DEFS = {'), corpo.indexOf('DEFS.quem.t'));
  var ids = (defs.match(/^\s{6}(\w+):\s*\{/gm) || []).map(function (t) {
    return t.trim().split(':')[0];
  });
  ok(ids.length >= 8, 'a leitura achou as colunas declaradas', ids);
  ok(ids.every(function (id) {
    var bloco = defs.slice(defs.indexOf(id + ':'),
                           defs.indexOf('\n      ', defs.indexOf(id + ':') + 60));
    return /t:\s*'/.test(bloco) || id === 'quem';
  }), 'toda coluna tem titulo');

  /* A linha de estoque inicial se identifica no DESTINO, e nao numa coluna propria: o
     local dela ja esta na Origem, e uma coluna a mais so para repeti-lo ficava vazia em
     todas as outras linhas. */
  ok(defs.indexOf('localIni') < 0,
    'nao ha coluna separada para o local do saldo — ele ja esta na Origem');
  ok(/Estoque Inicial/.test(corpo) && /marca-estoque/.test(corpo),
    'a linha de estoque se identifica no Destino, com marca propria', corpo.indexOf('Estoque'));

  // a ordem salva convive com mudancas na lista de fabrica
  var j = adm.indexOf('function ordemColunas()');
  var fonteOrdem = adm.slice(adm.indexOf('var COLS_PADRAO'), adm.indexOf('\n  }', j) + 4);
  var loja = {};
  var localStorage = {
    getItem: function (k) { return loja[k] === undefined ? null : loja[k]; },
    setItem: function (k, v) { loja[k] = String(v); }
  };
  var ordemColunas = new Function('localStorage',
    fonteOrdem + ' return ordemColunas;')(localStorage);

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

  ok(csv.indexOf('ordemColunas()') > 0,
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
  var j = adm.indexOf('function larguras()');
  var fonte = adm.slice(adm.indexOf('var LARG_CHAVE'), adm.indexOf('\n  }', j) + 4);
  var loja = {};
  var localStorage = {
    getItem: function (k) { return loja[k] === undefined ? null : loja[k]; },
    setItem: function (k, v) { loja[k] = String(v); }
  };
  var larguras = new Function('localStorage', fonte + ' return larguras;')(localStorage);

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
  ok(/#tabelaFluxo table\.fixa\{table-layout:fixed\}/.test(css),
    'a tabela usa layout fixo, senao a largura pedida nao e obedecida');
  ok(adm.indexOf('<table class="fixa">') > 0,
    'e a tabela do painel pede essa classe');
  ok(/style="width:'\+\(LARG\[c\.id\]/.test(adm),
    'cada <th> sai com a largura guardada');

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
  var padrao = adm.slice(adm.indexOf('var COLS_PADRAO'), adm.indexOf(';', adm.indexOf('var COLS_PADRAO')));
  var cols = (padrao.match(/'(\w+)'/g) || []).map(function (t) { return t.slice(1, -1); });
  ok(cols.indexOf('lancado') > 0, 'a coluna esta na lista de fabrica', cols);
  ok(defs.indexOf("t: 'Estoque'") > 0, 'e o titulo dela na tela é "Estoque"');

  var semDef = cols.filter(function (id) { return defs.indexOf('\n      ' + id + ':') < 0; });
  ok(semDef.length === 0, 'toda coluna de fábrica tem definição — sem ela o <td> sai vazio',
    semDef);

  var larg = adm.slice(adm.indexOf('var LARG_PADRAO'), adm.indexOf('};', adm.indexOf('var LARG_PADRAO')));
  var semLarg = cols.filter(function (id) { return larg.indexOf(id + ':') < 0; });
  ok(semLarg.length === 0,
    'e toda coluna tem largura — `larguras()` só conhece as chaves de LARG_PADRAO, e ' +
    'com table-layout:fixed a que faltar recebe width:undefinedpx e some', semLarg);

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

  /* --- um ponto so acende e apaga ----------------------------------------- */
  var toggles = adm.split("bl.disabled = !algumFiltroFluxo()").length - 1;
  ok(toggles === 1,
    'so um lugar liga e desliga o botao — espalhar isso deixa o botao aceso depois de limpo',
    toggles);
  var dF = adm.indexOf('function desenharFluxo()');
  var corpoF = adm.slice(dF, adm.indexOf("\n  /* Três frases diferentes", dF));
  ok(corpoF.indexOf('bl.disabled = !algumFiltroFluxo()') > 0,
    'e esse lugar e o desenho do fluxo, por onde TUDO que mexe em filtro passa');

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
  var i = adm.indexOf("      final:    { t: 'Saldo final'");
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
