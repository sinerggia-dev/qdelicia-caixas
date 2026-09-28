/* AS REGRAS DO PISO ES5, num arquivo proprio.
 *
 * Elas moram fora do `teste_tela.js` por um motivo pratico e um honesto:
 *
 *   · PRATICO — sao expressoes regulares cheias de barra invertida, e este projeto as
 *     escreve por script. Geradas assim, elas saem mutiladas: foi o que aconteceu na
 *     primeira versao desta prova, em que `\bObject\.assign` virou `\bObject .assign`
 *     e deixou de casar com coisa nenhuma. Cinco das sete sabotagens passaram verdes, e
 *     a prova inteira parecia funcionar.
 *   · HONESTO — uma prova que nao pega o que promete e pior que prova nenhuma, porque
 *     ela ocupa o lugar da que pegaria.
 *
 * POR QUE O PISO EXISTE: este app e ES5 do comeco ao fim, de proposito. Ele abre em
 * aparelho velho de galpao e em navegador de escritorio que ninguem atualiza. E o modo
 * de falhar e o pior possivel — uma API que o navegador nao conhece nao "deixa de
 * funcionar": ela ESTOURA, e tudo o que vem depois naquele script deixa de existir. A
 * tela nao quebra, porque o HTML ja esta pronto; ela so para de responder da linha do
 * erro para baixo.
 *
 * MEDIDO NA PRATICA: um `new URLSearchParams(...)` no alto de `admin.html` deixou, em
 * UMA maquina so, o botao de recolher o menu desenhado e sem efeito. O erro acontecia
 * trezentas linhas antes de o botao ser ligado, e nada na tela dizia isso.
 */
var PROIBIDO = [
  { re: /\bURLSearchParams\b/,
    nome: 'URLSearchParams',
    porque: 'nao existe em navegador antigo, e ESTOURA em vez de devolver vazio' },
  { re: /=>/,
    nome: 'arrow function',
    porque: 'e erro de SINTAXE: o arquivo inteiro morre, e nao so a linha' },
  { re: /(^|[^.\w])(const|let)\s+[A-Za-z_$]/,
    nome: 'const/let',
    porque: 'mesma coisa — sintaxe nova derruba o arquivo inteiro' },
  { re: /\bObject\s*\.\s*assign\s*\(/,
    nome: 'Object.assign',
    porque: 'estoura em navegador antigo; use um laco sobre as chaves' },
  { re: /\bArray\s*\.\s*from\s*\(/,
    nome: 'Array.from',
    porque: 'estoura em navegador antigo; use `[].slice.call(...)`' },
  { re: /\.\s*includes\s*\(/,
    nome: '.includes(',
    porque: 'use `indexOf(...) >= 0`, que vale em tudo' },
  { re: /\.\s*(padStart|padEnd)\s*\(/,
    nome: '.padStart(',
    porque: 'o projeto ja tem o laco que preenche com zeros, em `novoId`' },
  { re: /\?\?/,
    nome: 'operador ??',
    porque: 'sintaxe nova: derruba o arquivo' },
  { re: /\?\s*\.\s*[A-Za-z_$]/,
    nome: 'operador ?.',
    porque: 'sintaxe nova: derruba o arquivo' },
  { re: /`/,
    nome: 'template literal',
    porque: 'sintaxe nova: derruba o arquivo. O projeto concatena com `+`' }
];

/* SEM COMENTARIO, senao a prova acusa a prosa que EXPLICA por que nao se usa aquilo —
   e foi o que aconteceu: um comentario citando `.filter(id => ...)` como exemplo do que
   NAO fazer virou "arrow function no arquivo".
   O `//` so e comentario quando abre a linha: no meio dela ele e `https://`. */
function semComentario(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

function acharProibidos(nomeArquivo, conteudo) {
  var corpo = semComentario(conteudo);
  return PROIBIDO.filter(function (x) { return x.re.test(corpo); })
    .map(function (x) { return nomeArquivo + ': ' + x.nome + ' — ' + x.porque; });
}

module.exports = { PROIBIDO: PROIBIDO, semComentario: semComentario,
                   acharProibidos: acharProibidos };
