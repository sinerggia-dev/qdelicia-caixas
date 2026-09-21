/**
 * Qdelícia Frutas — Controle de Caixas
 * VARREDURA das permissões, ponta a ponta.
 *
 * POR QUE ISTO EXISTE
 * Um administrador marcou cinco abas do painel para um conferente e nada mudou na tela
 * dele. A marca estava gravada, certinha, no banco — o que faltava era a chave "Pode
 * entrar no painel?", desligada dois campos acima. O formulário aceitou as cinco marcas
 * sem dizer nada.
 *
 * O pedido que veio depois foi este: garantir que o que o administrador liga e desliga
 * **funcione de fato, para todos os usuários**. Então em vez de conferir uma permissão,
 * este arquivo confere a CORRENTE de cada uma:
 *
 *     formulário → envia → servidor grava → sessão carrega → alguma tela usa
 *
 * Um elo faltando é um interruptor que não acende nada. E, além dos elos, confere as
 * PRÉ-CONDIÇÕES: combinações que o formulário poderia aceitar e que não fariam efeito
 * nenhum. Marca que não faz nada é pior do que marca ausente — ela diz que fez.
 *
 * Não roda navegador: lê o código dos dois lados e executa as regras do servidor.
 */
'use strict';

var fsReal = require('fs');
var path = require('path');

/* Mesma razão do `teste_tela.js`: o recorte por texto fecha numa quebra de linha, e uma
   cópia de trabalho em CRLF faria o recorte ir até o fim do arquivo, calado. */
var fs = {
  readFileSync: function (p, enc) {
    var d = fsReal.readFileSync(p, enc);
    return typeof d === 'string' ? d.replace(new RegExp(String.fromCharCode(13), 'g'), '') : d;
  }
};

var falhas = 0;
function ok(cond, titulo, extra) {
  if (cond) { console.log('  ✓ ' + titulo); return; }
  falhas++;
  console.log('  ✗ ' + titulo + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

function le(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }

var adm = le('admin.html');
var idx = le('index.html');
var logica = le('api/_logica.js');
var L = require(path.join(__dirname, '..', 'api', '_logica.js'));

/* O formulário de usuário, recortado por chaves. */
function recorta(texto, assinatura) {
  var i = texto.indexOf(assinatura);
  if (i < 0) return '';
  var k = texto.indexOf('{', i), n = 0;
  do { if (texto[k] === '{') n++; else if (texto[k] === '}') n--; k++; } while (n > 0 && k < texto.length);
  return texto.slice(i, k);
}
var form = recorta(adm, 'function formUsuario(u)');
ok(form.length > 3000 && form.indexOf('salvarUsuario') > 0,
  'o recorte pegou o formulário de usuário inteiro', form.length);

var telas = { 'admin.html': adm, 'index.html': idx, 'api/_logica.js': logica };

/* ==================================================================== a corrente
 * Uma linha por coisa que o administrador liga ou desliga. Acrescentar uma permissão
 * nova e esquecer de registrá-la aqui é o único jeito de ela escapar — e é por isso que
 * a última verificação deste bloco compara esta lista com o que o formulário envia.
 */
var PERMISSOES = [
  { nome: 'AcessoPainel', chave: 'AcessoPainel', campo: 'fPainel', sessao: 'acessoPainel',
    usa: [['admin.html', 'podeEntrar'], ['index.html', 'acessoPainel']] },
  { nome: 'Abas', chave: 'Abas', campo: 'fAbas', sessao: 'abas',
    usa: [['admin.html', 'abasPermitidas']] },
  /* Ver lançamentos: o interruptor e a lista de quem. Duas colunas, duas perguntas
     encadeadas — a segunda só faz sentido depois da primeira. */
  { nome: 'VerLancamentos', chave: 'VerLancamentos', campo: 'fVerLanc',
    sessao: 'verLancamentos',
    usa: [['admin.html', 'verLancamentos'], ['index.html', 'verLancamentos']] },
  { nome: 'UsuariosVistos', chave: 'UsuariosVistos', campo: 'fUsuariosVistos',
    sessao: 'usuariosVistos',
    usa: [['admin.html', 'recorteProprios'], ['api/_logica.js', 'usuariosVistosDe']] },
  { nome: 'Operacoes', chave: 'Operacoes', campo: 'fOperacoes', sessao: 'operacoes',
    usa: [['index.html', 'operacoes']] },
  { nome: 'Saidas', chave: 'Saidas', campo: 'fSaidas', sessao: 'saidas',
    usa: [['index.html', 'saidas']] },
  { nome: 'Destinos', chave: 'Destinos', campo: 'fDestinos', sessao: 'destinos',
    usa: [['index.html', 'destinos']] },
  { nome: 'TiposCaixa', chave: 'TiposCaixa', campo: 'fTiposCaixa', sessao: 'tiposCaixa',
    usa: [['index.html', 'tiposCaixa']] },
  { nome: 'Motoristas', chave: 'Motoristas', campo: 'fMotoristas', sessao: 'motoristas',
    usa: [['index.html', 'motoristas']] },
  { nome: 'Perfil', chave: 'Perfil', campo: 'fPerfil', sessao: 'perfil',
    usa: [['admin.html', 'perfil'], ['index.html', 'perfil']] },
  { nome: 'LocalPadrao', chave: 'LocalPadrao', campo: 'fLocal', sessao: 'localPadrao',
    usa: [['index.html', 'localPadrao']] },
  /* `Ativo` não viaja na sessão de propósito: quem está inativo não recebe sessão
     nenhuma. `podeVerPainel()` e `loginPorPin()` recusam antes disso. */
  { nome: 'Ativo', chave: 'Ativo', campo: 'fAtivo', sessao: null,
    usa: [['api/_logica.js', 'Ativo === false']] }
];

var sessaoVazia = L.sessaoDe({ ID: 1, Nome: 'x', Perfil: 'y' });

console.log('\n== a corrente de cada permissao, do formulario ate a tela ==');
PERMISSOES.forEach(function (p) {
  ok(form.indexOf("'" + p.campo + "'") > 0 || form.indexOf('id="' + p.campo + '"') > 0,
    p.nome + ': tem campo no formulário');
  ok(new RegExp(p.chave + '\\s*:').test(form),
    p.nome + ': o formulário ENVIA no salvar — sem isto, mexer no campo não sai da tela');
  ok(new RegExp('\\b' + p.chave + '\\b').test(logica),
    p.nome + ': o servidor conhece a coluna');
  if (p.sessao) {
    ok(p.sessao in sessaoVazia,
      p.nome + ': viaja na sessão — sem isto, a tela da pessoa nunca fica sabendo');
  }
  p.usa.forEach(function (u) {
    ok(telas[u[0]].indexOf(u[1]) > 0,
      p.nome + ': alguma tela usa (' + u[0] + ' → ' + u[1] + ') — sem isto é um ' +
      'interruptor que não acende nada');
  });
});

/* A lista acima não pode ficar para trás do formulário. Uma permissão nova que entre no
   salvar e não aqui escaparia da varredura inteira, calada. */
var envio = form.slice(form.indexOf('Saidas:lerMarcados'));
envio = envio.slice(0, envio.indexOf('};'));
var marcados = (envio.match(/(\w+):lerMarcados/g) || [])
  .map(function (x) { return x.split(':')[0]; });
var faltando = marcados.filter(function (c) {
  return !PERMISSOES.some(function (p) { return p.chave === c; });
});
ok(marcados.length >= 6 && faltando.length === 0,
  'e toda lista de permissão que o formulário envia está registrada nesta varredura — ' +
  'uma nova que escapasse daqui não seria conferida por ninguém', faltando);

/* ==================================================================== vazio = todos
 * A convenção do projeto, e a única segura: invertida em qualquer lugar, o deploy tranca
 * a operação inteira, porque ninguém tem nada marcado.
 */
console.log('\n== lista vazia quer dizer TODOS, em todo lugar ==');
ok(L.locaisPermitidos([], [{ ID: 'L1' }, { ID: 'L2' }]).length === 2,
  'locais: sem marca, valem todos');
ok(L.locaisPermitidos(['L1'], [{ ID: 'L1' }, { ID: 'L2' }]).length === 1,
  'e com marca, vale a marca');
ok(L.podeAba({ Abas: [] }, 'pgPainel') === true && L.podeAba({}, 'pgPainel') === true,
  'abas: sem marca, valem todas — e campo ausente é o mesmo que lista vazia');
ok(L.podeAba({ Abas: ['pgExtrato'] }, 'pgPainel') === false,
  'e com marca, o que ficou de fora não passa');

/* ==================================================================== pré-condições
 * O que o formulário NÃO pode deixar passar calado.
 */
console.log('\n== as pre-condicoes: marca que nao faz efeito tem de ser dita ==');

/* 1. Abas sem o acesso ao painel. O CASO QUE ACONTECEU. */
ok(L.podeVerPainel({ Perfil: 'Conferente', AcessoPainel: false, Ativo: true }) === false,
  'sem a chave do painel, a pessoa não entra — por mais abas que estejam marcadas');
var ajuste = recorta(adm, 'function ajustarPainel()');
ok(ajuste.length > 800, 'o recorte pegou a peneira do formulário', ajuste.length);
ok(/Ligue "Pode entrar no painel\?"/.test(ajuste),
  'e o formulário diz isso, apontando a chave que falta — foi a falta desta frase que ' +
  'deixou cinco abas marcadas sem efeito nenhum');
ok(/caixaAbas\.classList\.toggle\('bloqueada'/.test(ajuste),
  'e trava o quadro das abas, em vez de deixar marcar o que não vale');

/* 2. Inativo. */
ok(L.podeVerPainel({ Perfil: 'Admin', AcessoPainel: true, Ativo: false }) === false,
  'quem está inativo não entra no painel nem sendo admin');
ok(L.loginPorPin([{ ID: 1, Nome: 'x', Perfil: 'y', PIN: '123456', Ativo: false }],
                 'x', '123456').ok === false ||
   L.podeVerPainel({ Perfil: 'y', Ativo: false }) === false,
  'e a regra de inativo vale antes de qualquer permissão');
ok(/Inativo: a pessoa não entra em lugar nenhum/.test(ajuste),
  'o formulário avisa que estando inativa nenhuma permissão abaixo vale');
ok(/box\.classList\.toggle\('bloqueada', !ativo\)/.test(ajuste),
  'e trava TODOS os quadros, não só o das abas');

/* 3. Acesso ao painel sem senha de painel. O painel entra por SENHA; o PIN de seis
      números é do app de campo, e é a confusão natural entre as duas. */
ok(/NÃO tem senha do painel/.test(ajuste),
  'ligar o acesso para quem não tem senha de painel é dito na hora');
ok(/PIN de seis números é do app de campo/.test(ajuste),
  'e o aviso explica por que o PIN do app não serve');

/* ==================================================================== a peneira do painel
 * A regra que decide quais abas a pessoa vê tem de errar para o lado de MOSTRAR.
 */
console.log('\n== a peneira de abas erra para o lado de mostrar ==');
var peneira = recorta(adm, 'function abasPermitidas(s)');
ok(peneira.length > 300, 'o recorte pegou a peneira', peneira.length);
ok(/return ids\(escolhidas\.length \? escolhidas : base\)/.test(peneira),
  'marca que não alcança nenhuma aba é IGNORADA, e valem todas as permitidas — errar ' +
  'para o lado de mostrar se corrige no cadastro; errar para o lado de trancar só se ' +
  'resolve com o administrador por perto');
ok(/if \(!marcadas\.length\) return ids\(base\)/.test(peneira),
  'e lista vazia vale todas, como no resto do projeto');

/* ==================================================================== a permissão chega
 * De nada adianta gravar certo se a tela da pessoa continua com a foto do login.
 */
console.log('\n== a permissao gravada CHEGA a quem ja esta logado ==');
ok(/function renovarSessao\(\)/.test(adm) && /function renovarSessao\(\)/.test(idx),
  'as duas telas releem a própria permissão — sem isto, mudar o cadastro de alguém que ' +
  'já está dentro não muda nada até ela sair e entrar');
ok(/acao:'meuAcesso'/.test(idx) && /case 'meuAcesso':/.test(le('api/index.js')),
  'o app de campo relê pela rota `meuAcesso`, que existe no servidor');
ok(/renovarSessao\(\)/.test(recorta(adm, 'function abrirApp()')) ||
   /var atual = renovarSessao\(\)/.test(adm),
  'e o painel relê ao abrir');
ok(/ajustarAbasPainel\(renovarSessao\(\)/.test(adm),
  'e também depois de salvar um usuário: o admin pode restringir a si mesmo');

console.log(falhas ? '\n>>> ' + falhas + ' FALHA(S)' : '\n>>> PERMISSOES OK');
process.exit(falhas ? 1 : 0);
