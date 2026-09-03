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
var senha = require('./_senha');

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
      // A lista de usuários saiu daqui de propósito: era carregada na tela de login e expunha
      // o nome de todo mundo para quem só abrisse o endereço. Quem precisa dela pede `equipe`.
      return { ok: true, locais: d.locais, tipos: d.tipos, config: d.config };
    case 'equipe':
      return { ok: true, usuarios: L.usuariosPublicos(d.usuarios) };
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
    // Escritório entra com identificador + senha; campo, com nome + PIN curto.
    if (p.senha) return L.loginPorSenha(d0.usuarios, p.identificador || p.usuarioId, p.senha, senha.conferir);
    return L.loginPorPin(d0.usuarios, p.identificador || p.nome || p.usuarioId, p.pin);
  }

  if (acao === 'definirSenha') return await definirSenha(p);

  if (acao === 'movimento') return await gravarMovimento(p);
  if (acao === 'conferir') return await conferir(p);
  if (acao === 'cancelar') return await cancelar(p);
  if (acao === 'corrigir') return await corrigir(p);
  if (acao === 'salvarLocal') return await salvarRegistro('Locais', p);
  if (acao === 'salvarTipo') return await salvarRegistro('TiposCaixa', p);
  if (acao === 'salvarUsuario') return await salvarUsuario(p);
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

/**
 * Troca da própria senha. Exige a senha atual; quem ainda não tem uma prova quem é pelo PIN.
 * Sem isso, qualquer um definiria a senha do administrador — e não há sessão no servidor
 * para impedir (ver CLAUDE.md).
 */
async function definirSenha(p) {
  var d = await db.carregarTudo();
  var u = L.acharPorIdentificador(d.usuarios, p.identificador || p.usuarioId);
  if (!u) return { ok: false, erro: 'Usuário ou senha incorretos.' };

  var autorizado = u.SenhaHash
    ? senha.conferir(p.senhaAtual, u.SenhaHash)
    : (String(u.PIN || '').trim() !== '' && String(u.PIN).trim() === String(p.pin || '').trim());
  if (!autorizado) {
    return { ok: false, erro: u.SenhaHash ? 'Senha atual incorreta.' : 'PIN incorreto.' };
  }

  var hash;
  try { hash = senha.gerar(p.novaSenha); }
  catch (e) { return { ok: false, erro: e.message }; }

  await db.update('usuarios', u.ID, { senha_hash: hash });
  return { ok: true };
}

async function corrigir(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarCorrecao(mov, p, new Date());
  if (!r.ok) return r;
  var patch = db.MOV.para(r.patch);
  patch.historico = r.historico;
  await db.update('movimentos', mov.ID, patch);
  return { ok: true, alterou: r.entradas };
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

/** A senha chega em texto do formulário e só existe em memória: o que vai ao banco é o hash. */
async function salvarUsuario(p) {
  var dados = p.registro;
  if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch (e) { dados = null; } }
  if (!dados) return { ok: false, erro: 'Nada para salvar.' };

  delete dados.SenhaHash;                       // nunca aceite hash vindo do navegador
  var nova = String(dados.Senha || '').trim();
  delete dados.Senha;
  if (nova) {
    try { dados.SenhaHash = senha.gerar(nova); }
    catch (e) { return { ok: false, erro: e.message }; }
  }

  if (dados.Email || dados.Usuario) {
    var d = await db.carregarTudo();
    var conflito = d.usuarios.filter(function (u) {
      if (String(u.ID) === String(dados.ID || '')) return false;
      function igual(a, b) { return a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
      return igual(u.Email, dados.Email) || igual(u.Usuario, dados.Usuario);
    })[0];
    if (conflito) return { ok: false, erro: 'Já existe usuário com esse e-mail ou login: ' + conflito.Nome };
  }

  return await salvarRegistro('Usuarios', { registro: dados });
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
    // Rota com cliente apontando para ela: apagar quebraria a chave estrangeira e o
    // usuário veria um erro do banco. Inativar mantém o vínculo legível.
    var atende = d.locais.filter(function (l) { return String(l.RotaId) === String(id); });
    if (atende.length) {
      await db.update('locais', id, { ativo: false });
      return {
        ok: true, inativado: true,
        aviso: 'Rota atende ' + atende.length + (atende.length > 1 ? ' pontos' : ' ponto') +
               ' — foi inativada em vez de excluída. Troque a rota deles para poder apagar.'
      };
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
    res.status(200).json({ ok: false, erro: mensagemDeErro(e) });
  }
};

/**
 * Coluna ou tabela que falta quase sempre é migração pendente, não defeito de código.
 * Dizer isso na tela poupa muito tempo — o log da Vercel não está à mão de quem opera.
 * Os códigos são do Postgres: 42703 = coluna inexistente, 42P01 = tabela inexistente.
 */
function mensagemDeErro(e) {
  var corpo = String((e && e.corpo) || (e && e.message) || '');
  // PGRST204/205 sao do PostgREST (coluna ou tabela fora do cache do schema) e aparecem na
  // ESCRITA; 42703/42P01 vem do Postgres direto. Tratar so os do Postgres deixava o caso mais
  // comum -- migracao pendente ao salvar -- caindo na mensagem generica.
  if (corpo.indexOf('42703') >= 0 || corpo.indexOf('42P01') >= 0 ||
      corpo.indexOf('PGRST204') >= 0 || corpo.indexOf('PGRST205') >= 0) {
    var col = (corpo.match(/column ["']?([a-z_.]+)["']? does not exist/i) ||
               corpo.match(/find the '([^']+)' column/i) || [])[1];
    return 'O banco está desatualizado' + (col ? ' (falta a coluna ' + col + ')' : '') +
      '. Rode as migrações da pasta supabase/ no SQL Editor.';
  }
  if (corpo.indexOf('23505') >= 0) return 'Já existe um registro com esse valor.';
  if (corpo.indexOf('23503') >= 0) return 'Registro ligado a outro que não existe mais.';
  return 'Falha no servidor ao processar a solicitação.';
}
