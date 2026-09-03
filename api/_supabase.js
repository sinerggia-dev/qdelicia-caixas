/**
 * Qdelícia Frutas — Controle de Caixas
 * Acesso ao Postgres do Supabase, via PostgREST. Sem dependência de pacote: usa `fetch` nativo.
 *
 * A chave usada aqui é a service_role, que ignora RLS. Ela vive só na variável de ambiente
 * da Vercel e nunca chega ao navegador — é justamente por isso que a API existe.
 *
 * Este arquivo também traduz os nomes: o Postgres usa snake_case, a lógica usa o formato
 * interno descrito em `_logica.js`.
 */
'use strict';

var URL_BASE = process.env.SUPABASE_URL || '';
var CHAVE = process.env.SUPABASE_SERVICE_KEY || '';

function configurado() { return !!(URL_BASE && CHAVE); }

function cabecalhos(extra) {
  var h = {
    apikey: CHAVE,
    Authorization: 'Bearer ' + CHAVE,
    'Content-Type': 'application/json'
  };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

async function req(caminho, opcoes) {
  var r = await fetch(URL_BASE.replace(/\/+$/, '') + caminho, opcoes);
  var texto = await r.text();
  if (!r.ok) {
    var detalhe = texto;
    try { detalhe = JSON.parse(texto).message || texto; } catch (e) { /* texto cru mesmo */ }
    var err = new Error('Supabase ' + r.status + ': ' + detalhe);
    err.status = r.status;
    err.corpo = texto;
    throw err;
  }
  if (!texto) return null;
  try { return JSON.parse(texto); } catch (e) { return texto; }
}

function selectAll(tabela, ordem) {
  var q = '/rest/v1/' + tabela + '?select=*' + (ordem ? '&order=' + ordem : '');
  return req(q, { method: 'GET', headers: cabecalhos() });
}

function insert(tabela, linhas) {
  return req('/rest/v1/' + tabela, {
    method: 'POST',
    headers: cabecalhos({ Prefer: 'return=representation' }),
    body: JSON.stringify(linhas)
  });
}

function update(tabela, id, patch) {
  return req('/rest/v1/' + tabela + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: cabecalhos({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  });
}

function remover(tabela, id) {
  return req('/rest/v1/' + tabela + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: cabecalhos()
  });
}

/**
 * Sobe assinatura ou foto (data URL base64) para o bucket `canhotos`.
 * Devolve a URL pública, ou '' se der qualquer problema — perder o canhoto
 * é ruim, mas derrubar o lançamento por causa dele é pior.
 */
async function subirArquivo(caminho, dataUrl, mime) {
  try {
    var s = String(dataUrl || '');
    var base64 = s.indexOf(',') >= 0 ? s.split(',')[1] : s;
    if (!base64 || base64.length < 50) return '';
    var bytes = Buffer.from(base64, 'base64');
    await fetch(URL_BASE.replace(/\/+$/, '') + '/storage/v1/object/canhotos/' + caminho, {
      method: 'POST',
      headers: {
        apikey: CHAVE,
        Authorization: 'Bearer ' + CHAVE,
        'Content-Type': mime,
        'x-upsert': 'true'
      },
      body: bytes
    });
    return URL_BASE.replace(/\/+$/, '') + '/storage/v1/object/public/canhotos/' + caminho;
  } catch (e) {
    return '';
  }
}

/* ============================ tradução das linhas ============================ */

function bool(v) {
  if (v === true || v === 1) return true;
  var s = String(v === undefined || v === null ? '' : v).trim().toUpperCase();
  return s === 'SIM' || s === 'TRUE' || s === 'S' || s === '1';
}
function nulo(v) { return (v === '' || v === undefined) ? null : v; }

var LOCAL = {
  de: function (r) {
    return {
      ID: r.id, Tipo: String(r.tipo || '').toUpperCase(), Nome: r.nome,
      Responsavel: r.responsavel || '', Telefone: r.telefone || '',
      LimiteCaixas: r.limite_caixas, DiasPrazo: r.dias_prazo,
      Token: r.token, Ativo: r.ativo !== false, Obs: r.obs || '',
      MotoristaId: r.motorista_id, RotaId: r.rota_id
    };
  },
  para: function (o) {
    var r = {};
    if (o.ID !== undefined) r.id = o.ID;
    if (o.Tipo !== undefined) r.tipo = String(o.Tipo).toUpperCase();
    if (o.Nome !== undefined) r.nome = o.Nome;
    if (o.Responsavel !== undefined) r.responsavel = o.Responsavel || '';
    if (o.Telefone !== undefined) r.telefone = o.Telefone || '';
    if (o.LimiteCaixas !== undefined) r.limite_caixas = nulo(o.LimiteCaixas);
    if (o.DiasPrazo !== undefined) r.dias_prazo = nulo(o.DiasPrazo);
    if (o.Token !== undefined) r.token = o.Token;
    if (o.Ativo !== undefined) r.ativo = bool(o.Ativo);
    if (o.Obs !== undefined) r.obs = o.Obs || '';
    if (o.MotoristaId !== undefined) r.motorista_id = nulo(o.MotoristaId);
    if (o.RotaId !== undefined) r.rota_id = nulo(o.RotaId);
    return r;
  }
};

var TIPO = {
  de: function (r) {
    return {
      ID: r.id, Nome: r.nome, Ativo: r.ativo !== false,
      Kg: r.kg === null || r.kg === undefined ? '' : Number(r.kg)
    };
  },
  para: function (o) {
    var r = {};
    if (o.ID !== undefined) r.id = o.ID;
    if (o.Nome !== undefined) r.nome = o.Nome;
    if (o.Ativo !== undefined) r.ativo = bool(o.Ativo);
    if (o.Kg !== undefined) r.kg = (o.Kg === '' || o.Kg === null) ? null : Number(o.Kg);
    return r;
  }
};

var USUARIO = {
  de: function (r) {
    return {
      ID: r.id, Nome: r.nome, Perfil: String(r.perfil || '').toUpperCase(), PIN: String(r.pin),
      Telefone: r.telefone || '', LocalPadrao: r.local_padrao, Ativo: r.ativo !== false,
      Email: r.email || '', Usuario: r.usuario || '', SenhaHash: r.senha_hash || ''
    };
  },
  para: function (o) {
    var r = {};
    if (o.ID !== undefined) r.id = o.ID;
    if (o.Nome !== undefined) r.nome = o.Nome;
    if (o.Perfil !== undefined) r.perfil = String(o.Perfil).toUpperCase();
    if (o.PIN !== undefined) r.pin = String(o.PIN);
    if (o.Telefone !== undefined) r.telefone = o.Telefone || '';
    if (o.LocalPadrao !== undefined) r.local_padrao = nulo(o.LocalPadrao);
    if (o.Ativo !== undefined) r.ativo = bool(o.Ativo);
    if (o.Email !== undefined) r.email = nulo(String(o.Email).trim().toLowerCase());
    if (o.Usuario !== undefined) r.usuario = nulo(String(o.Usuario).trim().toLowerCase());
    if (o.SenhaHash !== undefined) r.senha_hash = nulo(o.SenhaHash);
    return r;
  }
};

var MOV = {
  de: function (r) {
    return {
      ID: r.id, ClientKey: r.client_key,
      DataHora: r.data_hora ? new Date(r.data_hora) : new Date(),
      DataRef: r.data_ref ? new Date(r.data_ref + 'T00:00:00') : new Date(),
      Tipo: String(r.tipo || '').toUpperCase(),
      OrigemID: r.origem_id, DestinoID: r.destino_id, TipoCaixaID: r.tipo_caixa_id,
      Qtd: Number(r.qtd), QtdConferida: r.qtd_conferida === null ? null : Number(r.qtd_conferida),
      Status: String(r.status || '').toUpperCase(),
      Romaneio: r.romaneio || '', UsuarioID: r.usuario_id, Perfil: r.perfil, Obs: r.obs || '',
      AssinaturaURL: r.assinatura_url, FotoURL: r.foto_url,
      ConferidoEm: r.conferido_em, ConferidoPor: r.conferido_por,
      Cancelado: r.cancelado === true, MotivoCancel: r.motivo_cancel,
      Motorista: r.motorista || '', Placa: r.placa || '',
      Historico: Array.isArray(r.historico) ? r.historico : []
    };
  },
  para: function (o) {
    var r = {};
    function pos(chave, campo, transforma) {
      if (o[chave] === undefined) return;
      r[campo] = transforma ? transforma(o[chave]) : o[chave];
    }
    pos('ID', 'id');
    pos('ClientKey', 'client_key');
    pos('DataHora', 'data_hora', function (d) { return d instanceof Date ? d.toISOString() : d; });
    pos('DataRef', 'data_ref', function (d) {
      if (!(d instanceof Date)) return String(d).slice(0, 10);
      function z(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
    });
    pos('Tipo', 'tipo');
    pos('OrigemID', 'origem_id', nulo);
    pos('DestinoID', 'destino_id', nulo);
    pos('TipoCaixaID', 'tipo_caixa_id');
    pos('Qtd', 'qtd', Number);
    pos('QtdConferida', 'qtd_conferida', function (v) { return (v === '' || v === null) ? null : Number(v); });
    pos('Status', 'status');
    pos('Romaneio', 'romaneio');
    pos('UsuarioID', 'usuario_id', nulo);
    pos('Perfil', 'perfil', nulo);
    pos('Obs', 'obs');
    pos('Motorista', 'motorista', nulo);
    pos('Placa', 'placa', nulo);
    pos('AssinaturaURL', 'assinatura_url', nulo);
    pos('FotoURL', 'foto_url', nulo);
    pos('ConferidoEm', 'conferido_em', function (d) { return d instanceof Date ? d.toISOString() : nulo(d); });
    pos('ConferidoPor', 'conferido_por', nulo);
    pos('Cancelado', 'cancelado', function (v) { return v === true; });
    pos('MotivoCancel', 'motivo_cancel', nulo);
    pos('Historico', 'historico');
    return r;
  }
};

/** Carrega tudo de uma vez — é o mesmo que o Apps Script fazia, e mantém a lógica igual. */
async function carregarTudo() {
  var partes = await Promise.all([
    selectAll('locais', 'id'),
    selectAll('tipos_caixa', 'id'),
    selectAll('usuarios', 'id'),
    selectAll('movimentos', 'id'),
    selectAll('config', 'chave')
  ]);
  var config = {};
  (partes[4] || []).forEach(function (r) { config[r.chave] = r.valor; });
  return {
    locais: (partes[0] || []).map(LOCAL.de),
    tipos: (partes[1] || []).map(TIPO.de),
    usuarios: (partes[2] || []).map(USUARIO.de),
    movimentos: (partes[3] || []).map(MOV.de),
    config: config
  };
}

module.exports = {
  configurado: configurado,
  selectAll: selectAll, insert: insert, update: update, remover: remover,
  subirArquivo: subirArquivo, carregarTudo: carregarTudo,
  LOCAL: LOCAL, TIPO: TIPO, USUARIO: USUARIO, MOV: MOV
};
