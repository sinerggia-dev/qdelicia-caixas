/**
 * Qdelícia Frutas — Controle de Caixas
 * Hash de senha. Usa só o `crypto` do Node, sem dependência.
 *
 * Formato guardado: `s1$<iteracoes>$<salt hex>$<hash hex>`, tudo numa coluna só.
 * O prefixo `s1` existe para permitir trocar o algoritmo depois sem invalidar o que já está
 * gravado: uma versão futura grava `s2$...` e a verificação escolhe pelo prefixo.
 *
 * scrypt em vez de SHA: SHA é rápido de propósito, o que ajuda quem tenta adivinhar por força
 * bruta. scrypt é deliberadamente lento e consome memória, então cada tentativa custa caro.
 */
'use strict';

var crypto = require('crypto');

var N = 16384;   // custo de CPU/memória — ~50ms por verificação nesta faixa
var TAM = 32;    // bytes do hash

function gerar(senha) {
  var s = String(senha == null ? '' : senha);
  if (s.length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.');
  var salt = crypto.randomBytes(16);
  var hash = crypto.scryptSync(s, salt, TAM, { N: N, r: 8, p: 1 });
  return 's1$' + N + '$' + salt.toString('hex') + '$' + hash.toString('hex');
}

/**
 * Compara em tempo constante. Comparar com `===` vaza informação pelo tempo de resposta:
 * quanto mais caracteres iniciais acertam, mais demora — dá para descobrir o hash byte a byte.
 */
function conferir(senha, guardado) {
  try {
    var p = String(guardado || '').split('$');
    if (p.length !== 4 || p[0] !== 's1') return false;
    var n = Number(p[1]) || N;
    var salt = Buffer.from(p[2], 'hex');
    var esperado = Buffer.from(p[3], 'hex');
    var obtido = crypto.scryptSync(String(senha == null ? '' : senha), salt, esperado.length, { N: n, r: 8, p: 1 });
    return crypto.timingSafeEqual(esperado, obtido);
  } catch (e) {
    return false;
  }
}

function temHash(v) { return /^s1\$\d+\$[0-9a-f]+\$[0-9a-f]+$/.test(String(v || '')); }

module.exports = { gerar: gerar, conferir: conferir, temHash: temHash };
