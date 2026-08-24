/**
 * Qdelícia Frutas — Controle de Caixas
 * Função na Vercel: o mesmo contrato de 16 rotas que o Apps Script servia.
 *
 * O front continua falando com uma URL só (`API_URL` no config.js) e mandando `acao`.
 * A diferença é que agora a chave do banco fica aqui, no servidor, e não na página.
 *
 * Variáveis de ambiente necessárias (painel da Vercel > Settings > Environment Variables):
 *   SUPABASE_URL          https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  a service_role (NUNCA a anon, e nunca no repositório)
 */
'use strict';

var L = require('./_logica');
var db = require('./_supabase');

var TABELA = { Locais: 'locais', TiposCaixa: 'tipos_caixa', Usuarios: 'usuarios' };
var PREFIXO = { Locais: 'L', TiposCaixa: 'T', Usuarios: 'U' };
var MAPA = { Locais: db.LOCAL, TiposCaixa: db.TIPO, Usuarios: db.USUARIO };
var COLECAO = { Locais: 'locais', TiposCaixa: 'tipos', Usuarios: 'usuarios' };

function corpo(req) {
  var b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

/* ============================ GET ============================ */

async function rotaGet(p) {
  var acao = String(p.acao || 'ping');

  if (acao === 'ping') {
    // Responde sem tocar no banco: serve para saber se a função está de pé.
    return { ok: true, versao: 3, motor: 'supabase', empresa: 'Qdelícia Frutas' };
  }

  var d = await db.carregarTudo();

  switch (acao) {
    case 'dados':
      return {
        ok: true,
        locais: d.locais, tipos: d.tipos,
        usuarios: L.usuariosPublicos(d.usuarios),
        config: d.config
      };
    case 'painel':
      return { ok: true, painel: L.painel(d) };
    case 'pendentes':
      return { ok: true, movimentos: L.pendentes(d.movimentos, d.locais, d.tipos) };
    case 'movimentos':
      return { ok: true, movimentos: L.listaMovimentos(d.movimentos, d.locais, d.tipos, d.usuarios, p) };
    case 'extrato':
      return L.extrato(d, p.local, p.de, p.ate);
    case 'extratoToken':
      return L.extratoToken(d, p.t, p.de, p.ate);
    default:
      return { ok: false, erro: 'Ação desconhecida: ' + acao };
  }
}

/* ============================ POST ============================ */

async function rotaPost(p) {
  var acao = String(p.acao || '');
  if (!acao) return { ok: false, erro: 'Informe a ação.' };

  if (acao === 'login') {
    var d0 = await db.carregarTudo();
    return L.login(d0.usuarios, p.usuarioId, p.pin);
  }

  if (acao === 'movimento') return await gravarMovimento(p);
  if (acao === 'conferir') return await conferir(p);
  if (acao === 'cancelar') return await cancelar(p);
  if (acao === 'salvarLocal') return await salvarRegistro('Locais', p);
  if (acao === 'salvarTipo') return await salvarRegistro('TiposCaixa', p);
  if (acao === 'salvarUsuario') return await salvarRegistro('Usuarios', p);
  if (acao === 'excluir') return await excluir(p.aba, p.id);

  return { ok: false, erro: 'Ação desconhecida: ' + acao };
}

async function gravarMovimento(p) {
  var d = await db.carregarTudo();

  var existentes = {};
  d.movimentos.forEach(function (m) { if (m.ClientKey) existentes[String(m.ClientKey)] = m.ID; });

  var agora = new Date();
  var selo = 'm' + agora.getTime() + '-' + Math.random().toString(36).slice(2, 8);
  var assinaturaUrl = p.assinatura ? await db.subirArquivo('canhoto-' + selo + '.png', p.assinatura, 'image/png') : '';
  var fotoUrl = p.foto ? await db.subirArquivo('foto-' + selo + '.jpg', p.foto, 'image/jpeg') : '';

  var r = L.montarMovimento(p, {
    movimentos: d.movimentos,
    agora: agora,
    clientKeysExistentes: existentes,
    assinaturaUrl: assinaturaUrl,
    fotoUrl: fotoUrl
  });
  if (!r.ok) return r;

  var criados = r.jaExistiam.slice();
  if (r.linhas.length) {
    try {
      var gravadas = await db.insert('movimentos', r.linhas.map(db.MOV.para));
      (gravadas || []).forEach(function (g) {
        criados.push({ id: g.id, tipoCaixaId: g.tipo_caixa_id, qtd: Number(g.qtd) });
      });
    } catch (e) {
      // 23505 = violação de UNIQUE. É a fila offline reenviando: o banco recusou a duplicata,
      // que é exatamente o comportamento desejado. Para o celular, isso é sucesso.
      if (String(e.corpo || '').indexOf('23505') >= 0 || e.status === 409) {
        return { ok: true, criados: criados, status: r.status, duplicado: true };
      }
      throw e;
    }
  }
  return { ok: true, criados: criados, status: r.status };
}

async function conferir(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarConferencia(mov, p);
  if (!r.ok) return r;
  await db.update('movimentos', mov.ID, db.MOV.para(r.patch));
  return { ok: true, divergencia: r.divergencia, declarada: r.declarada, conferida: r.conferida };
}

async function cancelar(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  await db.update('movimentos', mov.ID, {
    cancelado: true,
    motivo_cancel: String(p.motivo || '') + ' (' + (p.usuarioId || '') + ')'
  });
  return { ok: true };
}

async function salvarRegistro(aba, p) {
  if (!TABELA[aba]) return { ok: false, erro: 'Cadastro inválido.' };
  var dados = p.registro;
  if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch (e) { dados = null; } }
  if (!dados) return { ok: false, erro: 'Nada para salvar.' };

  var d = await db.carregarTudo();
  var colecao = d[COLECAO[aba]];

  if (dados.ID) {
    var atual = colecao.filter(function (x) { return String(x.ID) === String(dados.ID); })[0];
    if (!atual) return { ok: false, erro: 'Registro não encontrado: ' + dados.ID };
    var patch = MAPA[aba].para(dados);
    delete patch.id;
    await db.update(TABELA[aba], dados.ID, patch);
    return { ok: true, id: dados.ID, atualizado: true };
  }

  dados.ID = L.novoId(PREFIXO[aba], colecao);
  if (aba === 'Locais' && !dados.Token) {
    var usados = {};
    d.locais.forEach(function (l) { usados[l.Token] = true; });
    do { dados.Token = L.novoToken(); } while (usados[dados.Token]);
  }
  if (dados.Ativo === undefined) dados.Ativo = true;
  await db.insert(TABELA[aba], [MAPA[aba].para(dados)]);
  return { ok: true, id: dados.ID, criado: true };
}

async function excluir(aba, id) {
  if (!TABELA[aba]) return { ok: false, erro: 'Cadastro inválido.' };
  var d = await db.carregarTudo();
  var colecao = d[COLECAO[aba]];
  var alvo = colecao.filter(function (x) { return String(x.ID) === String(id || ''); })[0];
  if (!alvo) return { ok: false, erro: 'Registro não encontrado.' };

  // Local com movimento não some — vira inativo, senão o histórico fica órfão.
  if (aba === 'Locais') {
    var temMov = d.movimentos.some(function (m) {
      return String(m.OrigemID) === String(id) || String(m.DestinoID) === String(id);
    });
    if (temMov) {
      await db.update('locais', id, { ativo: false });
      return { ok: true, inativado: true, aviso: 'Local tem movimentos — foi inativado em vez de excluído.' };
    }
  }
  await db.remover(TABELA[aba], id);
  return { ok: true, excluido: true };
}

/* ============================ handler ============================ */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!db.configurado()) {
    res.status(500).json({
      ok: false,
      erro: 'Backend sem configuração: defina SUPABASE_URL e SUPABASE_SERVICE_KEY na Vercel.'
    });
    return;
  }

  try {
    var r = req.method === 'POST'
      ? await rotaPost(corpo(req))
      : await rotaGet(req.query || {});
    res.status(200).json(r);
  } catch (e) {
    // O detalhe vai para o log da Vercel; para a tela, uma frase que ajuda sem expor o banco.
    console.error('[caixas]', e && e.stack ? e.stack : e);
    res.status(200).json({ ok: false, erro: 'Falha no servidor ao processar a solicitação.' });
  }
};
