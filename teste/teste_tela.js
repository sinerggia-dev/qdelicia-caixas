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

  /* A coluna nova: onde o saldo inicial foi lancado. Ela so se preenche nas linhas que
     TEM saldo inicial — nas de caminho a celula fica vazia, porque escrever a origem ali
     sugeriria que aquele caminho carrega o estoque. */
  ok(defs.indexOf('localIni:') > 0 && /localIni[\s\S]{0,200}l\.inicial \? Q\.esc\(l\.nome\)/.test(defs),
    'ha coluna com o local do saldo inicial, preenchida so onde ele existe', defs.indexOf('localIni'));

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
  ok(r.indexOf('localIni') === r.indexOf('data') + 1,
    'e cada uma ao lado de quem a precede de fabrica', r);
  ok(r.length >= 9, 'e nenhuma se perde no caminho', r);

  // uma so faltando: o caso real depois de um deploy
  loja.qdc_cols_ativos_v1 = JSON.stringify(['localIni','inicial','origem','destino',
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

  /* As opcoes saem do fluxo CRU. Monta-las a partir da lista ja filtrada faria escolher
     uma origem apagar as outras opcoes, sem caminho de volta. */
  var mf = corpoDe('montarFiltrosFluxo');
  ok(mf.indexOf('PAINEL.fluxo') > 0 && mf.indexOf('todasAsLinhas') < 0,
    'as opcoes saem do fluxo cru, nao da lista ja filtrada', mf.trim());
  ok(mf.indexOf('lista.indexOf(antes) >= 0') > 0,
    'e a escolha sobrevive ao recarregar, quando ainda existe');

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
 * O saldo corre de uma linha para a proxima.
 *
 * O saldo final de uma linha e o inicial da seguinte, mais o estoque inicial lancado
 * naquele dia. E o que transforma a tabela num extrato em vez de tres contas soltas.
 * ------------------------------------------------------------------------- */
console.log('\n== o saldo corre linha a linha ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function comSaldoCorrido(');
  var fonte = adm.slice(i, adm.indexOf('\n  }', i) + 4);
  var comSaldoCorrido = new Function(fonte + ' return comSaldoCorrido;')();

  // o exemplo, com os numeros que estao no ar
  var r = comSaldoCorrido([
    { inicial: 1250, saida: 0,    retorno: 0    },   // estoque inicial, 15/09
    { inicial: 0,    saida: 350,  retorno: 595  },   // Matriz -> Filial Maceio
    { inicial: 0,    saida: 1690, retorno: 1250 }    // Matriz -> Joao Pessoa
  ]);
  ok(r[0].iniCorrido === 1250 && r[0].fimCorrido === 1250,
    'a linha do estoque abre com ele', [r[0].iniCorrido, r[0].fimCorrido]);
  ok(r[1].iniCorrido === 1250 && r[1].fimCorrido === 1495,
    '1.250 − 350 + 595 = 1.495: o final de uma e o inicial da seguinte',
    [r[1].iniCorrido, r[1].fimCorrido]);
  ok(r[2].iniCorrido === 1495 && r[2].fimCorrido === 1055,
    'e segue: 1.495 − 1.690 + 1.250 = 1.055', [r[2].iniCorrido, r[2].fimCorrido]);

  /* Um estoque inicial lancado mais tarde SOMA no ponto em que aparece — e o "+ o saldo
     inicial do proximo dia se existir". */
  var r2 = comSaldoCorrido([
    { inicial: 100, saida: 0,  retorno: 0 },
    { inicial: 0,   saida: 40, retorno: 0 },
    { inicial: 500, saida: 0,  retorno: 0 },
    { inicial: 0,   saida: 10, retorno: 0 }
  ]);
  ok(r2[2].iniCorrido === 560 && r2[2].fimCorrido === 560,
    'o estoque lancado depois entra na conta no dia dele: 60 + 500',
    [r2[2].iniCorrido, r2[2].fimCorrido]);
  ok(r2[3].fimCorrido === 550, 'e a conta segue dali', r2[3].fimCorrido);

  /* Devolve COPIAS: as linhas vem do painel em cache, e escrever nelas faria o segundo
     desenho da tela partir dos valores ja corridos do primeiro. */
  var orig = [{ inicial: 10, saida: 0, retorno: 0 }];
  comSaldoCorrido(orig);
  comSaldoCorrido(orig);
  ok(orig[0].iniCorrido === undefined,
    'as linhas originais nao sao tocadas — senao o segundo desenho somaria em cima do primeiro',
    orig[0]);

  // a tabela e o CSV leem os campos corridos, nao os do servidor
  var corpo = adm.slice(adm.indexOf('function desenharFluxo()'),
                        adm.indexOf("document.querySelectorAll('[data-fchip]')"));
  ok(/Q\.num\(l\.iniCorrido \|\| 0\)/.test(corpo),
    'a coluna Saldo inicial mostra o corrido, nao o ajuste solto da linha');
  ok(/gente \? l\.saldo : l\.fimCorrido/.test(corpo),
    'e o Saldo final idem — nas visoes de gente segue valendo o saldo da pessoa');
  ok(adm.indexOf('comSaldoCorrido(linhasFluxo())') > 0,
    'o CSV passa pela mesma conta: numero diferente no arquivo e o pior dos casos');

  // a coluna de data existe e vem formatada
  ok(/data:\s*\{ t: 'Data'/.test(corpo) && /Q\.dataBR\(l\.data\)/.test(corpo),
    'ha coluna de Data, em formato brasileiro');
})();

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TELAS OK\n');
process.exit(falhas ? 1 : 0);
