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
var MIGRACOES = require('./_migracoes');

var TABELA = { Locais: 'locais', TiposCaixa: 'tipos_caixa', Usuarios: 'usuarios', Motoristas: 'motoristas',
               LocaisPadrao: 'locais_padrao' };
var PREFIXO = { Locais: 'L', TiposCaixa: 'T', Usuarios: 'U', Motoristas: 'D', LocaisPadrao: 'P' };
var MAPA = { Locais: db.LOCAL, TiposCaixa: db.TIPO, Usuarios: db.USUARIO, Motoristas: db.MOTORISTA,
             LocaisPadrao: db.LOCAL_PADRAO };
var COLECAO = { Locais: 'locais', TiposCaixa: 'tipos', Usuarios: 'usuarios', Motoristas: 'motoristas',
                LocaisPadrao: 'locaisPadrao' };

/* ============================ migrações ============================ */

// Uma vez por instância morna basta: o que já foi aplicado não volta a ser.
var migracoesOk = false;

/**
 * Aplica o que falta, em ordem. O DDL sai daqui, não do PostgREST, através da função
 * `aplicar_migracao` que o bootstrap cria — é ela que tem permissão para mexer na
 * estrutura. O `sql` vem sempre de `_migracoes.js`; nada que chega pela API entra aqui.
 */
async function garantirMigracoes() {
  if (migracoesOk) return null;
  var jaAplicadas;
  try {
    jaAplicadas = await db.selectAll('migracoes');
  } catch (e) {
    // Sem a tabela de registro, o bootstrap ainda não rodou. Segue a vida: o app
    // funciona com o que o banco já tem, e avisa quando faltar coluna de verdade.
    migracoesOk = true;
    return null;
  }

  var feitas = {};
  (jaAplicadas || []).forEach(function (m) { feitas[m.id] = true; });
  var pendentes = MIGRACOES.filter(function (m) { return !feitas[m.id]; });
  if (!pendentes.length) { migracoesOk = true; return null; }

  for (var i = 0; i < pendentes.length; i++) {
    var m = pendentes[i];
    try {
      await db.rpc('aplicar_migracao', { id_migracao: m.id, sql_migracao: m.sql });
      console.log('[caixas] migração aplicada:', m.id, '—', m.nota);
    } catch (e) {
      console.error('[caixas] migração falhou:', m.id, e && e.message);
      // Para na primeira falha: aplicar as seguintes por cima de um banco meio migrado
      // é como o estrago vira difícil de desfazer.
      return 'Falha ao atualizar o banco na migração ' + m.id + '. Veja o log da Vercel.';
    }
  }
  migracoesOk = true;
  return null;
}

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
      return { ok: true, locais: d.locais, tipos: d.tipos, config: d.config,
               motoristas: L.motoristasPublicos(d.motoristas) };
    case 'equipe':
      // Aqui vai o cadastro completo, com documento — é a tela do escritório.
      return { ok: true, usuarios: L.usuariosPublicos(d.usuarios), motoristas: d.motoristas,
               locaisPadrao: d.locaisPadrao, pedidosSenha: d.pedidosSenha };
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
  if (acao === 'pedirSenha') return await pedirSenha(p);
  if (acao === 'resolverPedidoSenha') return await resolverPedidoSenha(p);

  if (acao === 'movimento') return await gravarMovimento(p);
  if (acao === 'conferir') return await conferir(p);
  if (acao === 'cancelar') return await cancelar(p);
  if (acao === 'corrigir') return await corrigir(p);
  if (acao === 'salvarLocal') return await salvarRegistro('Locais', p);
  if (acao === 'salvarTipo') return await salvarRegistro('TiposCaixa', p);
  if (acao === 'salvarMotorista') return await salvarRegistro('Motoristas', p);
  if (acao === 'salvarLocalPadrao') return await salvarRegistro('LocaisPadrao', p);
  if (acao === 'salvarUsuario') return await salvarUsuario(p);
  if (acao === 'salvarConfig') return await salvarConfig(p);
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
 * Registra que alguém não consegue entrar. A resposta é sempre a mesma, exista o
 * identificador ou não: dizer "esse e-mail não existe" entrega quem trabalha aqui a
 * quem estiver testando endereços.
 */
async function pedirSenha(p) {
  var ident = String(p.identificador || '').trim();
  if (!ident) return { ok: false, erro: 'Informe seu e-mail ou usuário.' };

  var d = await db.carregarTudo();
  var jaTem = (d.pedidosSenha || []).some(function (x) {
    return String(x.identificador).toLowerCase() === ident.toLowerCase();
  });
  if (!jaTem) {
    await db.insert('pedidos_senha', [{
      id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      identificador: ident.slice(0, 120)
    }]);
  }
  return { ok: true };
}

async function resolverPedidoSenha(p) {
  await db.update('pedidos_senha', String(p.id || ''), { atendido: true });
  return { ok: true };
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

  var d = await db.carregarTudo();
  if (dados.ID && dados.Ativo !== undefined && !L.ativo(dados.Ativo) && ultimoAdmin(d.usuarios, dados.ID)) {
    return { ok: false, erro: 'Este é o último administrador ativo. Promova outro antes de desativá-lo.' };
  }

  if (dados.Email || dados.Usuario) {
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

/**
 * Sem autorização no servidor, o painel só se recupera por SQL se ficar sem admin.
 * Por isso o último ADMIN ativo não pode ser desativado nem excluído — nem por ele mesmo.
 */
function ultimoAdmin(usuarios, id) {
  var alvo = usuarios.filter(function (u) { return String(u.ID) === String(id); })[0];
  if (!alvo || String(alvo.Perfil).toUpperCase() !== 'ADMIN' || alvo.Ativo === false) return false;
  var outros = usuarios.filter(function (u) {
    return String(u.ID) !== String(id) && String(u.Perfil).toUpperCase() === 'ADMIN' && u.Ativo !== false;
  });
  return outros.length === 0;
}

/** Só chaves conhecidas: `config` alimenta a tela, não é depósito de qualquer coisa. */
var CHAVES_CONFIG = ['empresa', 'diasPrazoPadrao', 'motoristas'];

async function salvarConfig(p) {
  var chave = String(p.chave || '').trim();
  if (CHAVES_CONFIG.indexOf(chave) < 0) return { ok: false, erro: 'Configuração desconhecida: ' + chave };
  await db.salvarConfig(chave, p.valor);
  return { ok: true };
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
  // Usuário aparece em cada movimento que lançou e em cada conferência que fez, e uma
  // rota pode apontar para ele. Apagar quebraria a chave estrangeira e, pior, tiraria o
  // nome de quem contou — que é o que dá peso à divergência.
  // Local padrão em uso continua: a coluna do usuário guarda o id, e apagar deixaria
  // a linha apontando para o vazio.
  if (aba === 'LocaisPadrao') {
    var usando = d.usuarios.filter(function (u) { return String(u.LocalPadrao) === String(id); });
    if (usando.length) {
      return {
        ok: false,
        erro: 'Está em uso por ' + usando.length + (usando.length > 1 ? ' usuários' : ' usuário') +
              '. Troque o local deles antes de excluir.'
      };
    }
  }

  if (aba === 'Usuarios') {
    if (ultimoAdmin(d.usuarios, id)) {
      return { ok: false, erro: 'Este é o último administrador ativo. Promova outro antes de excluí-lo.' };
    }
    var lancou = d.movimentos.some(function (m) {
      return String(m.UsuarioID) === String(id) || String(m.ConferidoPor) === String(id);
    });
    var rotas = d.locais.filter(function (l) { return String(l.MotoristaId) === String(id); });
    if (lancou || rotas.length) {
      await db.update('usuarios', id, { ativo: false });
      return {
        ok: true, inativado: true,
        aviso: lancou
          ? 'Usuário tem lançamentos no histórico — foi desativado em vez de excluído.'
          : 'Usuário responde por ' + rotas.length + (rotas.length > 1 ? ' rotas' : ' rota') +
            ' — foi desativado em vez de excluído.'
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
    var falha = await garantirMigracoes();
    if (falha) { res.status(200).json({ ok: false, erro: falha }); return; }

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
