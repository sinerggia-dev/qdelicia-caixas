/**
 * Qdelícia Frutas — Controle de Caixas
 * Regras de negócio, sem nenhum acesso a banco.
 *
 * Tudo aqui é função pura sobre arrays de objetos: entra linha, sai resultado.
 * É o que permite rodar os 38 testes no Node sem Supabase, sem rede e sem chave.
 * O acesso ao Postgres mora em `_supabase.js`; o roteamento, em `index.js`.
 *
 * Formato interno das linhas (o adaptador converte de/para snake_case do Postgres):
 *   local     { ID, Tipo, Nome, Responsavel, Telefone, LimiteCaixas, DiasPrazo, Token, Ativo:bool, Obs,
 *               MotoristaId, RotaId }   Tipo: GALPAO | FILIAL | CLIENTE | ROTA
 *   tipoCaixa { ID, Nome, Ativo:bool }
 *   usuario   { ID, Nome, Perfil, PIN, Telefone, LocalPadrao, Ativo:bool, Email, Usuario, SenhaHash }
 *   movimento { ID, ClientKey, DataHora:Date, DataRef:Date, Tipo, OrigemID, DestinoID, TipoCaixaID,
 *               Qtd:number, QtdConferida:number|null, Status, Romaneio, UsuarioID, Perfil, Obs,
 *               AssinaturaURL, FotoURL, ConferidoEm, ConferidoPor, Cancelado:bool, MotivoCancel,
 *               Historico:[] }
 */
'use strict';

var TIPOS_MOV = ['SAIDA', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'AJUSTE'];
var PERFIS = ['ADMIN', 'GALPAO', 'MOTORISTA', 'PROMOTOR'];
// A rota é o caminhão em circulação: guarda caixa como qualquer outro local, e é isso que
// impede o que subiu no caminhão e não foi entregue de sumir na conta do cliente.
var TIPOS_LOCAL = ['GALPAO', 'FILIAL', 'CLIENTE', 'ROTA'];

/* ============================ datas ============================ */

function data(v) {
  if (v instanceof Date) return v;
  var s = String(v == null ? '' : v).trim();
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var p = s.slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    var q = s.split('/');
    return new Date(Number(q[2]), Number(q[1]) - 1, Number(q[0]));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function fimDoDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59); }
function iso(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  function z(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) +
    'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
}
function soData(d) { return iso(d).slice(0, 10); }

/* ============================ utilidades ============================ */

function mapaNomes(lista) {
  var m = {};
  lista.forEach(function (x) { m[String(x.ID)] = x.Nome; });
  return m;
}
function nome(mapa, id) { return mapa[String(id)] || (id ? String(id) : ''); }

/** Movimentos que valem: cancelado não conta para nada. */
function ativos(movimentos) {
  return movimentos.filter(function (m) { return !m.Cancelado; });
}

function novoId(prefixo, existentes) {
  var largura = prefixo === 'M' ? 6 : 3;
  var max = 0;
  existentes.forEach(function (x) {
    var n = parseInt(String(x.ID || '').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  var num = String(max + 1);
  while (num.length < largura) num = '0' + num;
  return prefixo + num;
}

/** Alfabeto sem caracteres que se confundem (0/o, 1/l) — o token é lido e digitado por gente. */
function novoToken(rnd) {
  var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  var r = rnd || Math.random;
  var s = '';
  for (var i = 0; i < 10; i++) s += abc.charAt(Math.floor(r() * abc.length));
  return s;
}

/* ============================ login ============================ */

/* Uma frase só para "não existe" e para "senha errada". Mensagens diferentes contam a quem
   está tentando se aquele e-mail existe na empresa. */
var ERRO_ACESSO = 'Usuário ou senha incorretos.';
var ERRO_PIN = 'Nome ou PIN incorretos.';

function normal(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function sessaoDe(u) {
  return { id: u.ID, nome: u.Nome, perfil: String(u.Perfil).toUpperCase(), localPadrao: u.LocalPadrao };
}

/** Acha por e-mail, apelido de login ou nome completo — o usuário digita o que lembrar. */
function acharPorIdentificador(usuarios, ident) {
  var alvo = normal(ident);
  if (!alvo) return null;
  return usuarios.filter(function (u) {
    if (u.Ativo === false) return false;
    return normal(u.Email) === alvo || normal(u.Usuario) === alvo || normal(u.Nome) === alvo;
  })[0] || null;
}

/**
 * Login do escritório. A comparação do hash é injetada porque este arquivo não importa nada:
 * é o que permite rodar os testes sem `crypto` e sem rede.
 */
function loginPorSenha(usuarios, ident, senha, conferir) {
  var u = acharPorIdentificador(usuarios, ident);
  if (!u || !u.SenhaHash) return { ok: false, erro: ERRO_ACESSO };
  if (!conferir(senha, u.SenhaHash)) return { ok: false, erro: ERRO_ACESSO };
  return { ok: true, usuario: sessaoDe(u) };
}

/** Login do campo: nome digitado + PIN curto. Sem lista de usuários na tela. */
function loginPorPin(usuarios, ident, pin) {
  var u = acharPorIdentificador(usuarios, ident);
  if (!u) return { ok: false, erro: ERRO_PIN };
  var informado = String(pin == null ? '' : pin).trim();
  if (!informado || String(u.PIN || '').trim() !== informado) return { ok: false, erro: ERRO_PIN };
  return { ok: true, usuario: sessaoDe(u) };
}

/* ============================ montagem de movimento ============================ */

/**
 * Valida o pedido e devolve as linhas a gravar — sem tocar em banco.
 * `ctx` = { movimentos, agora, clientKeysExistentes:{chave:id}, assinaturaUrl, fotoUrl }
 * Devolve { ok, linhas:[], jaExistiam:[], status } ou { ok:false, erro }.
 */
function montarMovimento(p, ctx) {
  var tipo = String(p.tipo || '').toUpperCase();
  if (TIPOS_MOV.indexOf(tipo) < 0) return { ok: false, erro: 'Tipo de movimento inválido: ' + tipo };

  var itens = p.itens;
  if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch (e) { itens = null; } }
  if (!itens || !itens.length) itens = [{ tipoCaixaId: p.tipoCaixaId, qtd: p.qtd }];
  // Ajuste aceita negativo (corrigir saldo inicial errado); os outros, só positivo.
  itens = itens.filter(function (i) {
    return tipo === 'AJUSTE' ? Number(i.qtd) !== 0 : Number(i.qtd) > 0;
  });
  if (!itens.length) return { ok: false, erro: 'Informe a quantidade de caixas.' };

  var origem = String(p.origemId || '');
  var destino = String(p.destinoId || '');
  if (tipo === 'SAIDA' || tipo === 'TRANSFERENCIA') {
    if (!origem || !destino) return { ok: false, erro: 'Informe origem e destino.' };
    if (origem === destino) return { ok: false, erro: 'Origem e destino não podem ser o mesmo local.' };
  } else if (tipo === 'DEVOLUCAO') {
    if (!origem || !destino) return { ok: false, erro: 'Informe de qual cliente/filial vieram as caixas e para onde foram.' };
    if (origem === destino) return { ok: false, erro: 'Origem e destino não podem ser o mesmo local.' };
  } else if (tipo === 'PERDA') {
    if (!origem) return { ok: false, erro: 'Informe o local que perdeu as caixas.' };
    destino = '';
  } else if (tipo === 'AJUSTE') {
    if (!destino) return { ok: false, erro: 'Informe o local do ajuste.' };
    origem = '';
  }

  var perfil = String(p.perfil || '').toUpperCase();
  // A regra central: contagem feita no cliente não baixa saldo sozinha.
  var status = String(p.status || '').toUpperCase();
  if (!status) {
    status = (tipo === 'DEVOLUCAO' && (perfil === 'PROMOTOR' || perfil === 'MOTORISTA'))
      ? 'AGUARDANDO' : 'CONFIRMADO';
  }

  var agora = ctx.agora || new Date();
  var dataRef = p.dataRef ? data(p.dataRef) : agora;
  var existentes = ctx.clientKeysExistentes || {};
  var base = p.clientKey ? String(p.clientKey) : ('K' + agora.getTime() + '-' + novoId('M', ctx.movimentos));

  var linhas = [], jaExistiam = [];
  var proximos = ctx.movimentos.slice();
  itens.forEach(function (item, idx) {
    var ck = base + '-' + idx;
    if (existentes[ck]) { jaExistiam.push({ id: existentes[ck], duplicado: true }); return; }
    var id = novoId('M', proximos);
    var linha = {
      ID: id,
      ClientKey: ck,
      DataHora: agora,
      DataRef: dataRef,
      Tipo: tipo,
      OrigemID: origem || null,
      DestinoID: destino || null,
      TipoCaixaID: String(item.tipoCaixaId || ''),
      Qtd: Number(item.qtd),
      QtdConferida: status === 'CONFIRMADO' ? Number(item.qtd) : null,
      Status: status,
      Romaneio: String(p.romaneio || ''),
      UsuarioID: String(p.usuarioId || '') || null,
      Perfil: perfil || null,
      Obs: String(p.obs || ''),
      AssinaturaURL: ctx.assinaturaUrl || null,
      FotoURL: ctx.fotoUrl || null,
      ConferidoEm: status === 'CONFIRMADO' ? agora : null,
      ConferidoPor: status === 'CONFIRMADO' ? (String(p.usuarioId || '') || null) : null,
      Cancelado: false,
      MotivoCancel: null
    };
    linhas.push(linha);
    proximos.push(linha);
  });

  return { ok: true, linhas: linhas, jaExistiam: jaExistiam, status: status };
}

/** Conferência na chegada. Devolve o patch a aplicar e a divergência apurada. */
function montarConferencia(mov, p) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado: ' + String(p.id || '') };
  var qtd = Number(p.qtdConferida);
  if (isNaN(qtd) || qtd < 0) return { ok: false, erro: 'Quantidade conferida inválida.' };
  var declarada = Number(mov.Qtd);
  var obs = mov.Obs || '';
  if (p.obs) obs = (obs ? obs + ' | ' : '') + 'Conferência: ' + p.obs;
  return {
    ok: true,
    patch: {
      QtdConferida: qtd,
      Status: 'CONFIRMADO',
      ConferidoEm: p.agora || new Date(),
      ConferidoPor: String(p.usuarioId || '') || null,
      Obs: obs
    },
    divergencia: qtd - declarada,
    declarada: declarada,
    conferida: qtd
  };
}

/**
 * Correção feita pelo escritório. Não sobrescreve em silêncio: devolve o patch e as linhas de
 * histórico a empilhar, com valor antigo, novo, autor e motivo. É o que mantém de pé a regra
 * de que nada se apaga.
 */
var CORRIGIVEIS = [
  { campo: 'Qtd', rotulo: 'quantidade', numero: true },
  { campo: 'QtdConferida', rotulo: 'conferida', numero: true },
  { campo: 'DataRef', rotulo: 'data', data: true },
  { campo: 'Romaneio', rotulo: 'romaneio' },
  { campo: 'Obs', rotulo: 'observação' }
];

function montarCorrecao(mov, p, agora) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (mov.Cancelado) return { ok: false, erro: 'Movimento cancelado não se corrige — lance um novo.' };
  var motivo = String(p.motivo || '').trim();
  if (!motivo) return { ok: false, erro: 'Descreva o motivo da correção.' };

  agora = agora || new Date();
  var patch = {}, entradas = [];

  CORRIGIVEIS.forEach(function (c) {
    if (p[c.campo] === undefined || p[c.campo] === null) return;
    var novo = p[c.campo];
    var velho = mov[c.campo];
    if (c.numero) {
      if (String(novo).trim() === '') return;
      novo = Number(novo);
      if (isNaN(novo) || novo < 0) return;
      if (Number(velho) === novo) return;
    } else if (c.data) {
      novo = data(novo);
      if (soData(novo) === soData(velho)) return;
    } else {
      novo = String(novo);
      if (String(velho || '') === novo) return;
    }
    patch[c.campo] = novo;
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: c.rotulo, motivo: motivo,
      de: c.data ? soData(velho) : (velho === null || velho === undefined ? '' : String(velho)),
      para: c.data ? soData(novo) : String(novo)
    });
  });

  if (!entradas.length) return { ok: false, erro: 'Nada mudou.' };
  return { ok: true, patch: patch, historico: (mov.Historico || []).concat(entradas), entradas: entradas };
}

/* ============================ saldos ============================ */

/** Quantidade que conta no saldo: a conferida manda; devolução aguardando não abate nada. */
function efetiva(m) {
  if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') return 0;
  var q = (m.QtdConferida !== null && m.QtdConferida !== undefined && m.QtdConferida !== '')
    ? Number(m.QtdConferida) : Number(m.Qtd);
  return isNaN(q) ? 0 : q;
}

/**
 * Saldo por local e tipo de caixa.
 *   Cliente/Filial: caixas em poder dele = entradas − devoluções confirmadas − perdas baixadas
 *   Galpão:         estoque físico       = ajustes + devoluções recebidas − saídas
 */
function saldos(movimentos) {
  var s = {};
  function add(local, tipoCx, valor) {
    if (!local) return;
    s[local] = s[local] || {};
    s[local][tipoCx] = (s[local][tipoCx] || 0) + valor;
  }
  ativos(movimentos).forEach(function (m) {
    if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') return;
    var q = efetiva(m);
    if (m.Tipo === 'AJUSTE') { add(m.DestinoID, m.TipoCaixaID, Number(m.Qtd)); return; }
    if (m.Tipo === 'PERDA') { add(m.OrigemID, m.TipoCaixaID, -q); return; }
    add(m.OrigemID, m.TipoCaixaID, -q);
    add(m.DestinoID, m.TipoCaixaID, q);
  });
  return s;
}

/** Devoluções contadas no cliente que o galpão ainda não validou. */
function emConferencia(movimentos) {
  var s = {};
  ativos(movimentos).forEach(function (m) {
    if (m.Tipo !== 'DEVOLUCAO' || m.Status === 'CONFIRMADO') return;
    s[m.OrigemID] = (s[m.OrigemID] || 0) + Number(m.Qtd);
  });
  return s;
}

/**
 * Aging FIFO: idade das caixas ainda em poder de cada local.
 * A premissa é que as mais antigas são justamente as que não voltaram.
 * `prazos` = {localId: dias} para apurar `vencidas` com o prazo real de cada cliente.
 */
function aging(movimentos, prazos, hoje) {
  prazos = prazos || {};
  hoje = hoje || new Date();
  var lotes = {};   // local -> [{data, qtd}]
  var consumo = {}; // local -> quanto abater

  ativos(movimentos).slice().sort(function (a, b) {
    return a.DataRef > b.DataRef ? 1 : -1;
  }).forEach(function (m) {
    var q = efetiva(m);
    if (!q || q < 0) return;
    if (m.Tipo === 'SAIDA' || m.Tipo === 'TRANSFERENCIA' || m.Tipo === 'AJUSTE') {
      if (m.DestinoID) {
        lotes[m.DestinoID] = lotes[m.DestinoID] || [];
        lotes[m.DestinoID].push({ data: m.DataRef, qtd: q });
      }
      if (m.OrigemID) consumo[m.OrigemID] = (consumo[m.OrigemID] || 0) + q;
    } else if (m.Tipo === 'DEVOLUCAO') {
      if (m.OrigemID) consumo[m.OrigemID] = (consumo[m.OrigemID] || 0) + q;
      if (m.DestinoID) {
        lotes[m.DestinoID] = lotes[m.DestinoID] || [];
        lotes[m.DestinoID].push({ data: m.DataRef, qtd: q });
      }
    } else if (m.Tipo === 'PERDA') {
      if (m.OrigemID) consumo[m.OrigemID] = (consumo[m.OrigemID] || 0) + q;
    }
  });

  var res = {};
  Object.keys(lotes).forEach(function (local) {
    var fila = lotes[local].map(function (l) { return { data: l.data, qtd: l.qtd }; });
    var abater = consumo[local] || 0;
    for (var i = 0; i < fila.length && abater > 0; i++) {
      var usa = Math.min(fila[i].qtd, abater);
      fila[i].qtd -= usa;
      abater -= usa;
    }
    var prazo = Number(prazos[local]) || 0;
    var b = { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, total: 0, vencidas: 0 };
    fila.forEach(function (l) {
      if (l.qtd <= 0) return;
      var dias = Math.floor((hoje - l.data) / 86400000);
      if (dias <= 7) b.d0_7 += l.qtd;
      else if (dias <= 15) b.d8_15 += l.qtd;
      else if (dias <= 30) b.d16_30 += l.qtd;
      else b.d31 += l.qtd;
      b.total += l.qtd;
      if (prazo && dias > prazo) b.vencidas += l.qtd;
      if (b.maisAntiga === null || dias > b.maisAntiga) b.maisAntiga = dias;
    });
    res[local] = b;
  });
  return res;
}

/* ============================ listagens ============================ */

function pendentes(movimentos, locais, tipos) {
  var mLocais = mapaNomes(locais), mTipos = mapaNomes(tipos);
  return ativos(movimentos)
    .filter(function (m) { return m.Tipo === 'DEVOLUCAO' && m.Status === 'AGUARDANDO'; })
    .map(function (m) {
      return {
        id: m.ID, dataRef: iso(m.DataRef), qtd: m.Qtd,
        origemId: m.OrigemID, origem: nome(mLocais, m.OrigemID),
        destinoId: m.DestinoID, destino: nome(mLocais, m.DestinoID),
        tipoCaixaId: m.TipoCaixaID, tipoCaixa: nome(mTipos, m.TipoCaixaID),
        romaneio: m.Romaneio, obs: m.Obs, perfil: m.Perfil,
        usuario: m.UsuarioID, assinatura: m.AssinaturaURL, foto: m.FotoURL
      };
    })
    .sort(function (a, b) { return a.dataRef < b.dataRef ? -1 : 1; });
}

function listaMovimentos(movimentos, locais, tipos, usuarios, p) {
  p = p || {};
  var mLocais = mapaNomes(locais), mTipos = mapaNomes(tipos), mUsers = mapaNomes(usuarios);
  var de = p.de ? data(p.de) : null;
  var ate = p.ate ? fimDoDia(data(p.ate)) : null;
  var limite = Number(p.limit || 400);

  return ativos(movimentos).filter(function (m) {
    if (de && m.DataRef < de) return false;
    if (ate && m.DataRef > ate) return false;
    if (p.local && String(m.OrigemID) !== String(p.local) && String(m.DestinoID) !== String(p.local)) return false;
    if (p.tipo && m.Tipo !== String(p.tipo).toUpperCase()) return false;
    return true;
  }).sort(function (a, b) {
    return a.DataRef > b.DataRef ? -1 : (a.DataHora > b.DataHora ? -1 : 1);
  }).slice(0, limite).map(function (m) {
    var temConf = m.QtdConferida !== null && m.QtdConferida !== undefined && m.QtdConferida !== '';
    return {
      id: m.ID, dataRef: iso(m.DataRef), dataHora: iso(m.DataHora), tipo: m.Tipo,
      origem: nome(mLocais, m.OrigemID), destino: nome(mLocais, m.DestinoID),
      origemId: m.OrigemID, destinoId: m.DestinoID,
      tipoCaixa: nome(mTipos, m.TipoCaixaID), qtd: m.Qtd,
      qtdConferida: temConf ? m.QtdConferida : '',
      divergencia: (m.Status === 'CONFIRMADO' && temConf) ? Number(m.QtdConferida) - Number(m.Qtd) : '',
      status: m.Status, romaneio: m.Romaneio, usuario: nome(mUsers, m.UsuarioID), perfil: m.Perfil,
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL,
      historico: m.Historico || []
    };
  });
}

/* ============================ painel ============================ */

function painel(dados, hoje) {
  hoje = hoje || new Date();
  var locais = dados.locais, tipos = dados.tipos, movimentos = dados.movimentos;
  var sal = saldos(movimentos);
  var prazoPadrao = Number(dados.config.diasPrazoPadrao) || 7;
  var prazos = {};
  locais.forEach(function (l) { prazos[l.ID] = Number(l.DiasPrazo) || prazoPadrao; });
  var ag = aging(movimentos, prazos, hoje);
  var emConf = emConferencia(movimentos);

  var ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var perdasMes = 0, saidasMes = 0, devolucoesMes = 0, divergenciaMes = 0;
  ativos(movimentos).forEach(function (m) {
    if (m.DataRef < ini) return;
    if (m.Tipo === 'PERDA') perdasMes += Number(m.Qtd);
    if (m.Tipo === 'SAIDA') saidasMes += Number(m.Qtd);
    if (m.Tipo === 'DEVOLUCAO' && m.Status === 'CONFIRMADO') {
      var temConf = m.QtdConferida !== null && m.QtdConferida !== undefined && m.QtdConferida !== '';
      devolucoesMes += Number(temConf ? m.QtdConferida : m.Qtd);
      if (temConf && Number(m.QtdConferida) !== Number(m.Qtd)) {
        divergenciaMes += Number(m.QtdConferida) - Number(m.Qtd);
      }
    }
  });

  var nomes = mapaNomes(locais);
  var lista = locais.filter(function (l) {
    return l.Tipo === 'CLIENTE' || l.Tipo === 'FILIAL';
  }).map(function (l) {
    var porTipo = sal[l.ID] || {};
    var total = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; });
    var a = ag[l.ID] || { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, vencidas: 0 };
    return {
      id: l.ID, nome: l.Nome, tipo: l.Tipo, responsavel: l.Responsavel, telefone: l.Telefone,
      limite: Number(l.LimiteCaixas) || 0, prazo: prazos[l.ID] || prazoPadrao,
      rotaId: l.RotaId || '', rota: l.RotaId ? nome(nomes, l.RotaId) : '',
      saldo: total, porTipo: porTipo,
      emConferencia: emConf[l.ID] || 0,
      aging: a,
      vencidas: Number(a.vencidas) || 0,
      acimaLimite: (Number(l.LimiteCaixas) > 0 && total > Number(l.LimiteCaixas))
    };
  }).sort(function (a, b) { return b.saldo - a.saldo; });

  var galpoes = locais.filter(function (l) { return l.Tipo === 'GALPAO'; }).map(function (l) {
    var porTipo = sal[l.ID] || {};
    var total = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; });
    return { id: l.ID, nome: l.Nome, saldo: total, porTipo: porTipo };
  });

  // Cada rota traz duas contas separadas: o que está no caminhão dela (saldo) e o que está
  // com os clientes que ela atende (saldoClientes). Somar os dois esconderia onde a caixa está.
  var mUsuarios = mapaNomes(dados.usuarios || []);
  var rotas = locais.filter(function (l) { return l.Tipo === 'ROTA'; }).map(function (l) {
    var porTipo = sal[l.ID] || {};
    var total = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; });
    var a = ag[l.ID] || { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, vencidas: 0 };
    var meus = lista.filter(function (c) { return String(c.rotaId) === String(l.ID); });
    return {
      id: l.ID, nome: l.Nome,
      motoristaId: l.MotoristaId || '',
      motorista: l.MotoristaId ? nome(mUsuarios, l.MotoristaId) : '',
      saldo: total, porTipo: porTipo, aging: a,
      clientes: meus.length,
      saldoClientes: meus.reduce(function (t2, c) { return t2 + c.saldo; }, 0),
      vencidasClientes: meus.reduce(function (t2, c) { return t2 + Math.max(0, c.vencidas); }, 0),
      emConferencia: emConf[l.ID] || 0
    };
  }).sort(function (a, b) { return (b.saldo + b.saldoClientes) - (a.saldo + a.saldoClientes); });

  var emPoderTerceiros = 0;
  lista.forEach(function (l) { emPoderTerceiros += l.saldo; });
  var emRota = rotas.reduce(function (t, r) { return t + r.saldo; }, 0);

  return {
    kpis: {
      emPoderTerceiros: emPoderTerceiros,
      emRota: emRota,
      clientesComSaldo: lista.filter(function (l) { return l.saldo > 0; }).length,
      vencidas: lista.reduce(function (s, l) { return s + Math.max(0, l.vencidas); }, 0),
      aguardandoConferencia: pendentes(movimentos, locais, tipos).length,
      perdasMes: perdasMes,
      saidasMes: saidasMes, devolucoesMes: devolucoesMes,
      divergenciaMes: divergenciaMes,
      taxaRetorno: saidasMes > 0 ? Math.round((devolucoesMes / saidasMes) * 1000) / 10 : null
    },
    locais: lista, rotas: rotas, galpoes: galpoes, tipos: tipos
  };
}

/* ============================ extrato ============================ */

function descricao(m, mLocais, localId) {
  var outro = String(m.OrigemID) === localId ? m.DestinoID : m.OrigemID;
  var nomeOutro = nome(mLocais, outro);
  switch (m.Tipo) {
    case 'SAIDA':
      return String(m.DestinoID) === localId
        ? 'Remessa de caixas — saiu de ' + nomeOutro : 'Remessa enviada para ' + nomeOutro;
    case 'DEVOLUCAO':
      return String(m.OrigemID) === localId
        ? 'Devolução de caixas para ' + nomeOutro : 'Devolução recebida de ' + nomeOutro;
    case 'TRANSFERENCIA':
      return String(m.DestinoID) === localId
        ? 'Transferência recebida de ' + nomeOutro : 'Transferência enviada para ' + nomeOutro;
    case 'PERDA': return 'Baixa de caixas (perda)' + (m.Obs ? ' — ' + m.Obs : '');
    case 'AJUSTE': return 'Ajuste de saldo' + (m.Obs ? ' — ' + m.Obs : '');
    default: return m.Tipo;
  }
}

function extrato(dados, localId, de, ate, hoje) {
  hoje = hoje || new Date();
  localId = String(localId || '');
  var local = dados.locais.filter(function (l) { return String(l.ID) === localId; })[0];
  if (!local) return { ok: false, erro: 'Local não encontrado.' };

  var mTipos = mapaNomes(dados.tipos), mLocais = mapaNomes(dados.locais), mUsers = mapaNomes(dados.usuarios);
  var dDe = de ? data(de) : null;
  var dAte = ate ? fimDoDia(data(ate)) : null;

  var todos = ativos(dados.movimentos).filter(function (m) {
    return String(m.OrigemID) === localId || String(m.DestinoID) === localId;
  }).sort(function (a, b) {
    return a.DataRef > b.DataRef ? 1 : (a.DataHora > b.DataHora ? 1 : -1);
  });

  var saldo = 0, saldoInicial = 0, linhas = [];
  todos.forEach(function (m) {
    var q = efetiva(m);
    var sinal = 0;
    if (m.Tipo === 'AJUSTE') sinal = String(m.DestinoID) === localId ? 1 : 0;
    else if (m.Tipo === 'PERDA') sinal = String(m.OrigemID) === localId ? -1 : 0;
    else sinal = String(m.DestinoID) === localId ? 1 : -1;
    var delta = sinal * (m.Tipo === 'AJUSTE' ? Number(m.Qtd) : q);
    if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') delta = 0;
    saldo += delta;
    if (dDe && m.DataRef < dDe) { saldoInicial = saldo; return; }
    if (dAte && m.DataRef > dAte) return;
    var temConf = m.QtdConferida !== null && m.QtdConferida !== undefined && m.QtdConferida !== '';
    linhas.push({
      id: m.ID, data: iso(m.DataRef), tipo: m.Tipo,
      descricao: descricao(m, mLocais, localId),
      tipoCaixa: nome(mTipos, m.TipoCaixaID),
      entrada: delta > 0 ? delta : '', saida: delta < 0 ? -delta : '',
      declarada: m.Qtd, conferida: temConf ? m.QtdConferida : '',
      divergencia: (m.Tipo === 'DEVOLUCAO' && temConf && Number(m.QtdConferida) !== Number(m.Qtd))
        ? Number(m.QtdConferida) - Number(m.Qtd) : '',
      status: m.Status, romaneio: m.Romaneio, usuario: nome(mUsers, m.UsuarioID),
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL, saldo: saldo
    });
  });

  var ag = aging(dados.movimentos, {}, hoje)[localId] ||
    { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, total: 0 };
  var porTipo = saldos(dados.movimentos)[localId] || {};

  return {
    ok: true,
    local: {
      id: local.ID, nome: local.Nome, tipo: local.Tipo, responsavel: local.Responsavel,
      telefone: local.Telefone, limite: Number(local.LimiteCaixas) || 0,
      prazo: Number(local.DiasPrazo) || Number(dados.config.diasPrazoPadrao) || 7
    },
    saldoInicial: saldoInicial, saldo: saldo,
    porTipo: Object.keys(porTipo).map(function (t) {
      return { tipo: nome(mTipos, t), qtd: porTipo[t] };
    }),
    emConferencia: emConferencia(dados.movimentos)[localId] || 0,
    aging: ag, linhas: linhas
  };
}

function extratoToken(dados, token, de, ate, hoje) {
  token = String(token || '').trim();
  if (!token) return { ok: false, erro: 'Link inválido.' };
  var local = dados.locais.filter(function (l) { return String(l.Token || '').trim() === token; })[0];
  if (!local) return { ok: false, erro: 'Link inválido ou revogado.' };
  var r = extrato(dados, local.ID, de, ate, hoje);
  if (r.ok) {
    r.somenteLeitura = true;
    r.empresa = dados.config.empresa || 'Qdelícia Frutas';
  }
  return r;
}

/* ============================ público ============================ */

/**
 * Lista da equipe para a tela de cadastros. Devolve o que o formulário precisa reexibir —
 * apagar telefone e e-mail só porque não vieram na resposta seria pior do que não listar.
 * PIN e hash de senha NUNCA saem daqui, em hipótese alguma.
 */
function usuariosPublicos(usuarios) {
  return usuarios.map(function (u) {
    return {
      ID: u.ID, Nome: u.Nome, Perfil: String(u.Perfil).toUpperCase(),
      LocalPadrao: u.LocalPadrao, Telefone: u.Telefone || '',
      Email: u.Email || '', Usuario: u.Usuario || '',
      Ativo: u.Ativo !== false, TemSenha: !!u.SenhaHash
    };
  });
}

module.exports = {
  TIPOS_MOV: TIPOS_MOV, PERFIS: PERFIS, TIPOS_LOCAL: TIPOS_LOCAL,
  data: data, fimDoDia: fimDoDia, iso: iso, soData: soData,
  mapaNomes: mapaNomes, nome: nome, ativos: ativos, novoId: novoId, novoToken: novoToken,
  acharPorIdentificador: acharPorIdentificador, loginPorSenha: loginPorSenha,
  loginPorPin: loginPorPin, sessaoDe: sessaoDe,
  montarMovimento: montarMovimento, montarConferencia: montarConferencia,
  montarCorrecao: montarCorrecao, CORRIGIVEIS: CORRIGIVEIS,
  efetiva: efetiva, saldos: saldos, emConferencia: emConferencia, aging: aging,
  pendentes: pendentes, listaMovimentos: listaMovimentos, painel: painel,
  descricao: descricao, extrato: extrato, extratoToken: extratoToken,
  usuariosPublicos: usuariosPublicos
};
