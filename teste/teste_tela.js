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
  ok(listaDe('minhasRotasDv') === 'destinos',
    'origem da devolução (a rota) vem da lista de Destino: na ida a rota é destino',
    listaDe('minhasRotasDv'));
  ok(listaDe('meusGalpoes') === 'destinos',
    'destino da DEVOLUÇÃO vem da lista de Destino — e não da de Saída, que deixava '
    + 'a lista vazia para quem tinha a Saída presa a uma rota', listaDe('meusGalpoes'));

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

  ok(/<th>Origem<\/th><th>Destino<\/th>/.test(corpo),
    'Origem e Destino sao colunas, lado a lado, antes dos numeros');
  ok(/lugares\(l\.origens, l\.nome\)/.test(corpo) &&
     /lugares\(l\.destinos, l\.nome\)/.test(corpo),
    'e cada uma le o seu campo — trocar os dois inverteria a tabela inteira');

  // a funcao que monta a celula
  var j = adm.indexOf('function lugares(');
  var fonte = adm.slice(j, adm.indexOf('\n  }', j) + 4);
  var Q = { esc: String };
  var lugares = new Function('Q', fonte + ' return lugares;')(Q);

  ok(lugares(['Matriz Fazenda'], 'Joao Pessoa') === 'Matriz Fazenda',
    'um so aparece limpo, sem preposicao: quem diz a direcao e o titulo da coluna',
    lugares(['Matriz Fazenda'], 'Joao Pessoa'));
  /* O nome da propria linha em negrito: sem a coluna do local ao lado, e ele que diz de
     quem e a linha. */
  ok(lugares(['Joao Pessoa'], 'Joao Pessoa') === '<b>Joao Pessoa</b>',
    'o nome da propria linha vem destacado', lugares(['Joao Pessoa'], 'Joao Pessoa'));
  ok(lugares(['Matriz', 'Joao Pessoa'], 'Joao Pessoa') === 'Matriz, <b>Joao Pessoa</b>',
    'e so ele, no meio dos outros', lugares(['Matriz', 'Joao Pessoa'], 'Joao Pessoa'));
  /* A sub-linha "rota · 10 lancamentos" descreve a LINHA. Na celula errada ela leria
     como se a Matriz Fazenda fosse uma rota. */
  var k = adm.indexOf('function sub(l, campo)');
  var sub = new Function('Q', adm.slice(k, adm.indexOf('\n  }', k) + 4) + ' return sub;')(Q);
  var linha = { nome: 'Joao Pessoa', sub: 'rota · 10 lancamentos',
                origens: ['Matriz'], destinos: ['Joao Pessoa'] };
  ok(sub(linha, 'origens') === '' && sub(linha, 'destinos').indexOf('rota') > 0,
    'a sub-linha mora na celula que tem o nome da propria linha',
    [sub(linha, 'origens'), sub(linha, 'destinos')]);
  var galpao = { nome: 'Matriz', sub: 'galpão · 20 lancamentos',
                 origens: ['Matriz'], destinos: ['Filial'] };
  ok(sub(galpao, 'origens').indexOf('galpão') > 0 && sub(galpao, 'destinos') === '',
    'e troca de lado junto com ela: no galpao o nome esta na origem',
    [sub(galpao, 'origens'), sub(galpao, 'destinos')]);

  ok(lugares([], 'X').indexOf('—') > 0 && lugares(null, 'X').indexOf('—') > 0,
    'vazio vira travessao — celula em branco parece falha de carregamento');
  ok(lugares(['A','B','C','D'], 'Z') === 'A, B <span class="fraco">+2</span>',
    'com muitos, os dois primeiros e um "+N" — a lista inteira esticaria a coluna',
    lugares(['A','B','C','D'], 'Z'));
})();

console.log('\n== matriz e galpoes nao se misturam com o resto ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  function corpoDe(nome){
    var i = adm.indexOf('function ' + nome + '(');
    return i < 0 ? '' : adm.slice(i, adm.indexOf('\n  }', i));
  }

  ok(/tipo !== 'GALPAO'/.test(corpoDe('linhasVivas')),
    'a lista comum exclui o galpao');
  ok(/tipo === 'GALPAO'/.test(corpoDe('linhasGalpoes')),
    'e a do chip proprio pega so ele');

  // o deficit conta a partir da lista comum, nunca de todasAsLinhas
  var def = corpoDe('linhasDeficit');
  ok(def.indexOf('linhasVivas') >= 0 && def.indexOf('todasAsLinhas') < 0,
    'o chip "Em deficit" conta na lista sem galpao — senao 180 vira 360', def.trim());

  // e a tabela do chip GALPAO existe de fato
  var lf = corpoDe('linhasFluxo');
  ok(/FLUXO_FILTRO === 'GALPAO'/.test(lf) && lf.indexOf('linhasGalpoes') >= 0,
    'o chip de galpao tem a sua propria lista na tabela', lf.trim());

  ok(adm.indexOf("{ v:'GALPAO'") > 0, 'o chip aparece na barra lateral');
})();

console.log('\n== Painel de Ativos: as colunas fecham ==');
(function () {
  var adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  var i = adm.indexOf('function desenharFluxo()');
  var corpo = adm.slice(i, adm.indexOf("document.querySelectorAll('[data-fchip]')", i));

  // /<th[^>]*>/ tambem casa <thead>, e a conta dava 6 numa tabela de 5 colunas.
  /* Seis colunas nas visoes de local (origem, destino, inicial, saida, retorno, final) e
     quatro nas de gente (nome, saida, retorno, final). O <th> do nome e o das tres
     colunas de local estao nos dois lados do MESMO ternario: um so cabecalho pode
     aparecer por vez, senao a tabela ganha uma coluna sem celula embaixo. */
  var ths = (corpo.match(/<th[ >]/g) || []).length;
  ok(ths === 7,
    'sete <th> no fonte: quatro fixos mais os dois lados do ternario', ths);
  ok(/nCols = temLocal \? 6 : 4/.test(corpo),
    'e a contagem usada no colspan acompanha: 6 com local, 4 sem', corpo.indexOf('nCols'));

  ok(corpo.indexOf('Responsável') < 0 && corpo.indexOf('Desvio') < 0,
    'Responsavel e Desvio sairam do cabecalho');
  ok(corpo.indexOf('Saldo inicial') > 0 && corpo.indexOf('Saldo final') > 0,
    'e os dois titulos novos estao la');

  /* Cabecalho e celula trocam de forma sob a MESMA condicao. Se so uma das duas pontas
     mudasse, a tabela ganharia uma coluna sem celula e cada numero passaria a ser lido
     na coluna do vizinho. */
  var thCond = /temLocal\s*\n?\s*\?\s*'<th>Origem<\/th><th>Destino<\/th><th[^']*Saldo inicial/.test(corpo);
  var tdCond = /temLocal\s*\n?\s*\?\s*'<td>'\+lugares\(l\.origens, l\.nome\)/.test(corpo);
  ok(thCond && tdCond,
    'as colunas de local nascem no cabecalho e na celula sob a mesma condicao',
    [thCond, tdCond]);
  // e o outro lado do ternario: a coluna com o nome, so nas visoes de gente
  ok(/: '<th>'\+cols\[0\]\+'<\/th>'/.test(corpo) && /: '<td><b>'\+Q\.esc\(l\.nome\)/.test(corpo),
    'nas visoes de gente sobra a coluna do nome, nos dois lugares');

  ok(/colspan="'\+nCols\+'"/.test(corpo),
    'o aviso de tabela vazia usa o numero de colunas, nao um numero fixo');

  // a visao de gente nao mostra saldo inicial, entao o seu final e o saldo de fluxo
  ok(/temLocal\s*\?\s*l\.saldoFinal\s*:\s*l\.saldo/.test(corpo),
    'sem coluna de inicial, o Saldo final mostra o saldo de fluxo — e nao um campo vazio');

  // quem so tem saldo inicial precisa passar pelo filtro de "parado"
  var lf = adm.slice(adm.indexOf('function linhasFluxo()'),
                     adm.indexOf('function metaFluxo()'));
  ok(/situacao !== 'parado' \|\| l\.inicial/.test(lf),
    'a linha parada COM saldo inicial continua na lista — senao o numero nao aparece');

  // o CSV do painel exporta as colunas da tela
  var j = adm.indexOf("Q.csv('retornos'");
  var csv = adm.slice(j, adm.indexOf('}));', j));
  ok(csv.indexOf('Saldo inicial') > 0 && csv.indexOf('Saldo final') > 0 &&
     csv.indexOf("'Origem'") > 0 && csv.indexOf("'Destino'") > 0 &&
     csv.indexOf('Responsável') < 0 && csv.indexOf('Desvio') < 0,
    'o CSV do painel leva as mesmas colunas que a tabela mostra');
  ok(csv.indexOf('l.inicial') > 0 && csv.indexOf('l.saldoFinal') > 0 &&
     csv.indexOf('l.origens') > 0 && csv.indexOf('l.destinos') > 0,
    'e busca os mesmos campos, nao recalcula a conta por fora');
  // so o que esta DENTRO dos colchetes: o primeiro argumento e o nome do arquivo, e
  // contar a partir do zero somava ele como se fosse coluna.
  var cab = (csv.slice(csv.indexOf('['), csv.indexOf(']')).match(/'/g) || []).length / 2;
  ok(cab === 7, 'sete colunas no cabecalho do CSV', cab);
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

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)\n' : '\n>>> TELAS OK\n');
process.exit(falhas ? 1 : 0);
