/**
 * Roda supabase/migracao.sql no banco, pela Management API do Supabase.
 *
 *   SUPABASE_PAT=sbp_xxx node scripts/rodar_migracao.js
 *   (no Windows: setx SUPABASE_PAT "sbp_xxx" e abra um terminal novo)
 *
 * Por que existe: o PostgREST — que a API do app usa — só faz CRUD em tabelas. `alter table`
 * e `create index` precisam da Management API, que autentica com um Personal Access Token
 * criado em https://supabase.com/dashboard/account/tokens
 *
 * O token NÃO deve ser escrito neste arquivo nem em nenhum outro do repositório: ele abre
 * todos os projetos da conta. Vive só na variável de ambiente, e pode ser revogado depois.
 *
 * A migração é idempotente, então rodar de novo é seguro. O script executa em blocos
 * separados por `-- ===` para que, se um falhar, os anteriores fiquem aplicados e a
 * mensagem aponte exatamente onde parou.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const REF = process.env.SUPABASE_REF || 'lwsrasupgvizuxuwhghy';
const PAT = process.env.SUPABASE_PAT || '';
const ARQUIVO = path.join(__dirname, '..', 'supabase', 'migracao.sql');

function executar(sql) {
  return new Promise((resolve, reject) => {
    const corpo = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: '/v1/projects/' + REF + '/database/query',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + PAT,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(corpo)
      }
    }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(t);
        let msg = t;
        try { msg = JSON.parse(t).message || t; } catch (e) { /* texto cru */ }
        reject(new Error('HTTP ' + res.statusCode + ': ' + msg));
      });
    });
    req.on('error', reject);
    req.write(corpo);
    req.end();
  });
}

/** Quebra em blocos pelos cabeçalhos `-- ====`, para o erro apontar o trecho certo. */
function blocos(sql) {
  return sql.split(/\n(?=-- =+)/)
    .map((b) => b.trim())
    .filter((b) => b && b.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
}

function titulo(bloco) {
  const m = bloco.match(/^-- =+\s*(.+)$/m);
  return m ? m[1].trim() : bloco.split('\n')[0].slice(0, 60);
}

async function main() {
  if (!PAT) {
    console.error('Falta SUPABASE_PAT. Crie em https://supabase.com/dashboard/account/tokens');
    console.error('e exporte na variável de ambiente — nunca escreva o token em arquivo do repo.');
    return 1;
  }
  const sql = fs.readFileSync(ARQUIVO, 'utf8');
  const partes = blocos(sql);
  console.log('projeto :', REF);
  console.log('arquivo :', path.relative(process.cwd(), ARQUIVO), '·', partes.length, 'blocos\n');

  for (let i = 0; i < partes.length; i++) {
    const nome = titulo(partes[i]);
    process.stdout.write('  ' + String(i + 1).padStart(2) + '. ' + nome + ' … ');
    try {
      await executar(partes[i]);
      console.log('ok');
    } catch (e) {
      console.log('FALHOU');
      console.error('\n' + e.message + '\n');
      console.error('Os blocos anteriores já foram aplicados. Corrija e rode de novo:');
      console.error('a migração é idempotente, o que já passou não se repete.');
      return 1;
    }
  }
  console.log('\nMigração concluída.');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
