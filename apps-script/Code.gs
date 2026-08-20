/**
 * Qdelícia Frutas — Controle de Caixas
 * Backend (Google Apps Script Web App) vinculado à planilha do Google Sheets.
 *
 * INSTALAÇÃO (uma vez):
 *  1. Crie uma planilha nova no Google Sheets (nome sugerido: "Qdelicia - Controle de Caixas").
 *  2. Extensões > Apps Script. Apague o conteúdo e cole este arquivo inteiro.
 *  3. Rode a função `setup` (menu Executar). Autorize quando pedir.
 *  4. Implantar > Nova implantação > Tipo "App da Web":
 *       Executar como: Eu    |    Quem tem acesso: Qualquer pessoa
 *  5. Copie a URL /exec e cole em config.js do site.
 *
 * Ao alterar este código, use Implantar > Gerenciar implantações > editar (lápis) >
 * Versão "Nova versão" > Implantar. A URL /exec continua a mesma.
 */

var SH_LOCAIS = 'Locais';
var SH_TIPOS = 'TiposCaixa';
var SH_USERS = 'Usuarios';
var SH_MOV = 'Movimentos';
var SH_CONFIG = 'Config';

var COLS = {};
COLS[SH_LOCAIS] = ['ID', 'Tipo', 'Nome', 'Responsavel', 'Telefone', 'LimiteCaixas', 'DiasPrazo', 'Token', 'Ativo', 'Obs'];
COLS[SH_TIPOS] = ['ID', 'Nome', 'ValorUnit', 'Ativo'];
COLS[SH_USERS] = ['ID', 'Nome', 'Perfil', 'PIN', 'Telefone', 'LocalPadrao', 'Ativo'];
COLS[SH_MOV] = ['ID', 'ClientKey', 'DataHora', 'DataRef', 'Tipo', 'OrigemID', 'DestinoID', 'TipoCaixaID',
  'Qtd', 'QtdConferida', 'Status', 'Romaneio', 'UsuarioID', 'Perfil', 'Obs',
  'AssinaturaURL', 'FotoURL', 'ConferidoEm', 'ConferidoPor', 'Cancelado', 'MotivoCancel'];
COLS[SH_CONFIG] = ['Chave', 'Valor'];

// Tipos de movimento: SAIDA | DEVOLUCAO | TRANSFERENCIA | PERDA | AJUSTE
// Status: CONFIRMADO | AGUARDANDO   (AGUARDANDO = contagem feita no cliente, falta conferir na chegada)

/* ============================ SETUP ============================ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(COLS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var head = COLS[nome];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f7a3f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > head.length) sh.deleteColumns(head.length + 1, sh.getMaxColumns() - head.length);
  });

  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);

  // Dados iniciais só se estiver vazio
  if (_rows(SH_LOCAIS).length === 0) {
    _append(SH_LOCAIS, { ID: 'L001', Tipo: 'GALPAO', Nome: 'Galpão de Distribuição', Responsavel: '', Telefone: '', LimiteCaixas: '', DiasPrazo: '', Token: _token(), Ativo: 'SIM', Obs: '' });
    _append(SH_LOCAIS, { ID: 'L002', Tipo: 'FILIAL', Nome: 'Filial (exemplo — renomeie)', Responsavel: '', Telefone: '', LimiteCaixas: '', DiasPrazo: '', Token: _token(), Ativo: 'SIM', Obs: '' });
    _append(SH_LOCAIS, { ID: 'L003', Tipo: 'CLIENTE', Nome: 'Cliente Exemplo', Responsavel: '', Telefone: '', LimiteCaixas: 200, DiasPrazo: 7, Token: _token(), Ativo: 'SIM', Obs: 'Apague depois de cadastrar os reais' });
  }
  if (_rows(SH_TIPOS).length === 0) {
    _append(SH_TIPOS, { ID: 'T001', Nome: 'Caixa Banana', ValorUnit: 18, Ativo: 'SIM' });
    _append(SH_TIPOS, { ID: 'T002', Nome: 'Caixa Plástica Grande', ValorUnit: 25, Ativo: 'SIM' });
  }
  if (_rows(SH_USERS).length === 0) {
    _append(SH_USERS, { ID: 'U001', Nome: 'Administrador', Perfil: 'ADMIN', PIN: '1234', Telefone: '', LocalPadrao: 'L001', Ativo: 'SIM' });
    _append(SH_USERS, { ID: 'U002', Nome: 'Conferente Galpão', Perfil: 'GALPAO', PIN: '1111', Telefone: '', LocalPadrao: 'L001', Ativo: 'SIM' });
    _append(SH_USERS, { ID: 'U003', Nome: 'Motorista Exemplo', Perfil: 'MOTORISTA', PIN: '2222', Telefone: '', LocalPadrao: 'L001', Ativo: 'SIM' });
    _append(SH_USERS, { ID: 'U004', Nome: 'Promotor Exemplo', Perfil: 'PROMOTOR', PIN: '3333', Telefone: '', LocalPadrao: '', Ativo: 'SIM' });
  }
  if (_rows(SH_CONFIG).length === 0) {
    _append(SH_CONFIG, { Chave: 'empresa', Valor: 'Qdelícia Frutas' });
    _append(SH_CONFIG, { Chave: 'diasPrazoPadrao', Valor: '7' });
    _append(SH_CONFIG, { Chave: 'pastaDriveId', Valor: '' });
  }
  _pastaDrive(); // cria a pasta de canhotos/fotos e grava o ID no Config
  return 'Setup concluído.';
}

/* ============================ ROTEADOR ============================ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    out = _rotaGet(p);
  } catch (err) {
    out = { ok: false, erro: String(err && err.message || err) };
  }
  return _out(out, p.callback);
}

function doPost(e) {
  var p = {};
  try {
    if (e && e.postData && e.postData.contents && String(e.postData.contents).charAt(0) === '{') {
      p = JSON.parse(e.postData.contents);
    } else {
      p = (e && e.parameter) || {};
    }
  } catch (err) {
    p = (e && e.parameter) || {};
  }
  var out;
  try {
    out = _rotaPost(p);
  } catch (err) {
    out = { ok: false, erro: String(err && err.message || err) };
  }
  return _out(out, p.callback);
}

function _rotaGet(p) {
  switch (String(p.acao || 'ping')) {
    case 'ping': return { ok: true, versao: 2, empresa: _config().empresa || 'Qdelícia Frutas' };
    case 'dados': return { ok: true, locais: _locais(), tipos: _tipos(), usuarios: _usuariosPublicos(), config: _config() };
    case 'painel': return { ok: true, painel: _painel() };
    case 'pendentes': return { ok: true, movimentos: _pendentes() };
    case 'movimentos': return { ok: true, movimentos: _listaMovimentos(p) };
    case 'extrato': return _extrato(p.local, p.de, p.ate);
    case 'extratoToken': return _extratoToken(p.t, p.de, p.ate);
    default: return { ok: false, erro: 'Ação desconhecida: ' + p.acao };
  }
}

function _rotaPost(p) {
  switch (String(p.acao || '')) {
    case 'login': return _login(p.usuarioId, p.pin);
    case 'movimento': return _gravarMovimento(p);
    case 'conferir': return _conferir(p);
    case 'cancelar': return _cancelar(p);
    case 'salvarLocal': return _salvarRegistro(SH_LOCAIS, p, 'L');
    case 'salvarTipo': return _salvarRegistro(SH_TIPOS, p, 'T');
    case 'salvarUsuario': return _salvarRegistro(SH_USERS, p, 'U');
    case 'excluir': return _excluir(p.aba, p.id);
    default: return { ok: false, erro: 'Ação desconhecida: ' + p.acao };
  }
}

/* ============================ AUTENTICAÇÃO (PIN simples) ============================ */

function _login(usuarioId, pin) {
  var u = _rows(SH_USERS).filter(function (r) {
    return String(r.ID) === String(usuarioId) && String(r.Ativo).toUpperCase() !== 'NAO';
  })[0];
  if (!u) return { ok: false, erro: 'Usuário não encontrado ou inativo.' };
  if (String(u.PIN).trim() !== String(pin || '').trim()) return { ok: false, erro: 'PIN incorreto.' };
  return { ok: true, usuario: { id: u.ID, nome: u.Nome, perfil: String(u.Perfil).toUpperCase(), localPadrao: u.LocalPadrao } };
}

/* ============================ MOVIMENTOS ============================ */

/**
 * Grava um movimento. Aceita várias linhas de tipo de caixa de uma vez:
 *   itens = [{tipoCaixaId, qtd}, ...]  (ou tipoCaixaId + qtd soltos)
 * Idempotente por clientKey — a fila offline pode reenviar sem duplicar.
 */
function _gravarMovimento(p) {
  var tipo = String(p.tipo || '').toUpperCase();
  if (['SAIDA', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'AJUSTE'].indexOf(tipo) < 0) {
    return { ok: false, erro: 'Tipo de movimento inválido: ' + tipo };
  }
  var itens = p.itens;
  if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch (e) { itens = null; } }
  if (!itens || !itens.length) itens = [{ tipoCaixaId: p.tipoCaixaId, qtd: p.qtd }];
  // Ajuste aceita quantidade negativa (corrigir saldo inicial errado); os outros, só positiva.
  itens = itens.filter(function (i) { return tipo === 'AJUSTE' ? Number(i.qtd) !== 0 : Number(i.qtd) > 0; });
  if (!itens.length) return { ok: false, erro: 'Informe a quantidade de caixas.' };

  var origem = String(p.origemId || '');
  var destino = String(p.destinoId || '');
  if (tipo === 'SAIDA' || tipo === 'TRANSFERENCIA') {
    if (!origem || !destino) return { ok: false, erro: 'Informe origem e destino.' };
    if (origem === destino) return { ok: false, erro: 'Origem e destino não podem ser o mesmo local.' };
  } else if (tipo === 'DEVOLUCAO') {
    if (!origem || !destino) return { ok: false, erro: 'Informe de qual cliente/filial vieram as caixas e para onde foram.' };
  } else if (tipo === 'PERDA') {
    if (!origem) return { ok: false, erro: 'Informe o local que perdeu as caixas.' };
    destino = '';
  } else if (tipo === 'AJUSTE') {
    if (!destino) return { ok: false, erro: 'Informe o local do ajuste.' };
    origem = '';
  }

  var perfil = String(p.perfil || '').toUpperCase();
  // Devolução contada no cliente (promotor/motorista) fica aguardando conferência no galpão.
  var status = String(p.status || '').toUpperCase();
  if (!status) {
    status = (tipo === 'DEVOLUCAO' && (perfil === 'PROMOTOR' || perfil === 'MOTORISTA')) ? 'AGUARDANDO' : 'CONFIRMADO';
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // A checagem de duplicidade só vale para chave enviada pelo app (fila offline pode reenviar).
    // Sem chave, gera uma única — dois lançamentos no mesmo milissegundo não podem virar "duplicata".
    var temChave = !!p.clientKey;
    var base = temChave ? String(p.clientKey)
      : ('K' + new Date().getTime() + Math.floor(Math.random() * 1000000));
    var existentes = {};
    if (temChave) {
      _rows(SH_MOV).forEach(function (r) { if (r.ClientKey) existentes[String(r.ClientKey)] = r.ID; });
    }

    var assinatura = p.assinatura ? _salvarArquivo(p.assinatura, 'canhoto-' + base + '.png', 'image/png') : '';
    var foto = p.foto ? _salvarArquivo(p.foto, 'foto-' + base + '.jpg', 'image/jpeg') : '';

    var agora = new Date();
    var dataRef = p.dataRef ? _data(p.dataRef) : agora;
    var criados = [];
    itens.forEach(function (item, idx) {
      var ck = base + '-' + idx;
      if (existentes[ck]) { criados.push({ id: existentes[ck], duplicado: true }); return; }
      var id = _novoId('M');
      _append(SH_MOV, {
        ID: id,
        ClientKey: ck,
        DataHora: agora,
        DataRef: dataRef,
        Tipo: tipo,
        OrigemID: origem,
        DestinoID: destino,
        TipoCaixaID: String(item.tipoCaixaId || ''),
        Qtd: Number(item.qtd),
        QtdConferida: status === 'CONFIRMADO' ? Number(item.qtd) : '',
        Status: status,
        Romaneio: String(p.romaneio || ''),
        UsuarioID: String(p.usuarioId || ''),
        Perfil: perfil,
        Obs: String(p.obs || ''),
        AssinaturaURL: assinatura,
        FotoURL: foto,
        ConferidoEm: status === 'CONFIRMADO' ? agora : '',
        ConferidoPor: status === 'CONFIRMADO' ? String(p.usuarioId || '') : '',
        Cancelado: '',
        MotivoCancel: ''
      });
      criados.push({ id: id, tipoCaixaId: item.tipoCaixaId, qtd: Number(item.qtd) });
    });
    return { ok: true, criados: criados, status: status };
  } finally {
    lock.releaseLock();
  }
}

/** Conferência na chegada: grava a quantidade realmente contada e expõe a divergência. */
function _conferir(p) {
  var id = String(p.id || '');
  var sh = _sheet(SH_MOV);
  var idx = _indice(SH_MOV, id);
  if (idx < 0) return { ok: false, erro: 'Movimento não encontrado: ' + id };
  var c = _colMap(SH_MOV);
  var qtd = Number(p.qtdConferida);
  if (isNaN(qtd) || qtd < 0) return { ok: false, erro: 'Quantidade conferida inválida.' };
  sh.getRange(idx, c.QtdConferida).setValue(qtd);
  sh.getRange(idx, c.Status).setValue('CONFIRMADO');
  sh.getRange(idx, c.ConferidoEm).setValue(new Date());
  sh.getRange(idx, c.ConferidoPor).setValue(String(p.usuarioId || ''));
  if (p.obs) {
    var atual = String(sh.getRange(idx, c.Obs).getValue() || '');
    sh.getRange(idx, c.Obs).setValue((atual ? atual + ' | ' : '') + 'Conferência: ' + p.obs);
  }
  var declarada = Number(sh.getRange(idx, c.Qtd).getValue());
  return { ok: true, divergencia: qtd - declarada, declarada: declarada, conferida: qtd };
}

function _cancelar(p) {
  var idx = _indice(SH_MOV, String(p.id || ''));
  if (idx < 0) return { ok: false, erro: 'Movimento não encontrado.' };
  var c = _colMap(SH_MOV);
  var sh = _sheet(SH_MOV);
  sh.getRange(idx, c.Cancelado).setValue('SIM');
  sh.getRange(idx, c.MotivoCancel).setValue(String(p.motivo || '') + ' (' + (p.usuarioId || '') + ')');
  return { ok: true };
}

function _pendentes() {
  var locais = _mapa(_locais());
  var tipos = _mapa(_tipos());
  return _movs().filter(function (m) { return m.Tipo === 'DEVOLUCAO' && m.Status === 'AGUARDANDO'; })
    .map(function (m) {
      return {
        id: m.ID, dataRef: _iso(m.DataRef), qtd: m.Qtd,
        origemId: m.OrigemID, origem: _nome(locais, m.OrigemID),
        destinoId: m.DestinoID, destino: _nome(locais, m.DestinoID),
        tipoCaixaId: m.TipoCaixaID, tipoCaixa: _nome(tipos, m.TipoCaixaID),
        romaneio: m.Romaneio, obs: m.Obs, perfil: m.Perfil,
        usuario: m.UsuarioID, assinatura: m.AssinaturaURL, foto: m.FotoURL
      };
    })
    .sort(function (a, b) { return a.dataRef < b.dataRef ? -1 : 1; });
}

function _listaMovimentos(p) {
  var locais = _mapa(_locais());
  var tipos = _mapa(_tipos());
  var users = _mapa(_rows(SH_USERS));
  var de = p.de ? _data(p.de) : null;
  var ate = p.ate ? _fimDoDia(_data(p.ate)) : null;
  var limite = Number(p.limit || 400);
  var lista = _movs().filter(function (m) {
    if (de && m.DataRef < de) return false;
    if (ate && m.DataRef > ate) return false;
    if (p.local && String(m.OrigemID) !== String(p.local) && String(m.DestinoID) !== String(p.local)) return false;
    if (p.tipo && m.Tipo !== String(p.tipo).toUpperCase()) return false;
    return true;
  }).sort(function (a, b) { return a.DataRef > b.DataRef ? -1 : (a.DataHora > b.DataHora ? -1 : 1); });

  return lista.slice(0, limite).map(function (m) {
    return {
      id: m.ID, dataRef: _iso(m.DataRef), dataHora: _iso(m.DataHora), tipo: m.Tipo,
      origem: _nome(locais, m.OrigemID), destino: _nome(locais, m.DestinoID),
      origemId: m.OrigemID, destinoId: m.DestinoID,
      tipoCaixa: _nome(tipos, m.TipoCaixaID), qtd: m.Qtd, qtdConferida: m.QtdConferida,
      divergencia: (m.Status === 'CONFIRMADO' && m.QtdConferida !== '' ? Number(m.QtdConferida) - Number(m.Qtd) : ''),
      status: m.Status, romaneio: m.Romaneio, usuario: _nome(users, m.UsuarioID), perfil: m.Perfil,
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL
    };
  });
}

/* ============================ SALDOS / AGING / PAINEL ============================ */

/** Quantidade que conta para o saldo (a conferida manda; devolução aguardando não abate). */
function _efetiva(m) {
  if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') return 0;
  var q = (m.QtdConferida !== '' && m.QtdConferida !== null) ? Number(m.QtdConferida) : Number(m.Qtd);
  return isNaN(q) ? 0 : q;
}

/**
 * Saldo por local e tipo de caixa.
 *  Cliente/Filial: caixas em poder dele  = entradas (saída do galpão) − devoluções confirmadas − perdas baixadas
 *  Galpão:         estoque físico        = ajustes + devoluções recebidas − saídas
 */
function _saldos() {
  var s = {};
  function add(local, tipoCx, valor) {
    if (!local) return;
    s[local] = s[local] || {};
    s[local][tipoCx] = (s[local][tipoCx] || 0) + valor;
  }
  _movs().forEach(function (m) {
    var q = _efetiva(m);
    if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') return;
    if (m.Tipo === 'AJUSTE') { add(m.DestinoID, m.TipoCaixaID, Number(m.Qtd)); return; }
    if (m.Tipo === 'PERDA') { add(m.OrigemID, m.TipoCaixaID, -q); return; }
    add(m.OrigemID, m.TipoCaixaID, -q);
    add(m.DestinoID, m.TipoCaixaID, q);
  });
  return s;
}

/** Em conferência: devoluções contadas no cliente que o galpão ainda não validou. */
function _emConferencia() {
  var s = {};
  _movs().forEach(function (m) {
    if (m.Tipo !== 'DEVOLUCAO' || m.Status === 'CONFIRMADO') return;
    s[m.OrigemID] = (s[m.OrigemID] || 0) + Number(m.Qtd);
  });
  return s;
}

/**
 * Aging FIFO: idade das caixas que ainda estão em poder de cada local.
 * `prazos` (opcional) = {localId: diasDePrazo} — usado para contar `vencidas` com o prazo real de cada cliente.
 */
function _aging(prazos) {
  prazos = prazos || {};
  var lotes = {};   // local -> [{data, qtd}]
  var consumo = {}; // local -> qtd a abater
  _movs().sort(function (a, b) { return a.DataRef > b.DataRef ? 1 : -1; }).forEach(function (m) {
    var q = _efetiva(m);
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

  var hoje = new Date();
  var res = {};
  Object.keys(lotes).forEach(function (local) {
    var fila = lotes[local].slice();
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

function _painel() {
  var locais = _locais();
  var tipos = _tipos();
  var saldos = _saldos();
  var prazoPadrao = Number(_config().diasPrazoPadrao) || 7;
  var prazos = {};
  locais.forEach(function (l) { prazos[l.ID] = Number(l.DiasPrazo) || prazoPadrao; });
  var aging = _aging(prazos);
  var emConf = _emConferencia();
  var valor = {};
  tipos.forEach(function (t) { valor[t.ID] = Number(t.ValorUnit) || 0; });

  var hoje = new Date();
  var ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var movs = _movs();

  var perdasMes = 0, perdasMesValor = 0, saidasMes = 0, devolucoesMes = 0, divergenciaMes = 0;
  movs.forEach(function (m) {
    if (m.DataRef < ini) return;
    var v = valor[m.TipoCaixaID] || 0;
    if (m.Tipo === 'PERDA') { perdasMes += Number(m.Qtd); perdasMesValor += Number(m.Qtd) * v; }
    if (m.Tipo === 'SAIDA') saidasMes += Number(m.Qtd);
    if (m.Tipo === 'DEVOLUCAO' && m.Status === 'CONFIRMADO') {
      devolucoesMes += Number(m.QtdConferida !== '' ? m.QtdConferida : m.Qtd);
      if (m.QtdConferida !== '' && Number(m.QtdConferida) !== Number(m.Qtd)) {
        divergenciaMes += Number(m.QtdConferida) - Number(m.Qtd);
      }
    }
  });

  var lista = locais.filter(function (l) { return l.Tipo !== 'GALPAO'; }).map(function (l) {
    var porTipo = saldos[l.ID] || {};
    var total = 0, vTotal = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; vTotal += porTipo[t] * (valor[t] || 0); });
    var ag = aging[l.ID] || { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, vencidas: 0 };
    var prazo = prazos[l.ID] || prazoPadrao;
    return {
      id: l.ID, nome: l.Nome, tipo: l.Tipo, responsavel: l.Responsavel, telefone: l.Telefone,
      limite: Number(l.LimiteCaixas) || 0, prazo: prazo,
      saldo: total, valor: vTotal, porTipo: porTipo,
      emConferencia: emConf[l.ID] || 0,
      aging: ag,
      vencidas: Number(ag.vencidas) || 0,
      acimaLimite: (Number(l.LimiteCaixas) > 0 && total > Number(l.LimiteCaixas))
    };
  }).sort(function (a, b) { return b.saldo - a.saldo; });

  var galpoes = locais.filter(function (l) { return l.Tipo === 'GALPAO'; }).map(function (l) {
    var porTipo = saldos[l.ID] || {};
    var total = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; });
    return { id: l.ID, nome: l.Nome, saldo: total, porTipo: porTipo };
  });

  var emPoderTerceiros = 0, valorTerceiros = 0;
  lista.forEach(function (l) { emPoderTerceiros += l.saldo; valorTerceiros += l.valor; });

  return {
    kpis: {
      emPoderTerceiros: emPoderTerceiros,
      valorTerceiros: valorTerceiros,
      clientesComSaldo: lista.filter(function (l) { return l.saldo > 0; }).length,
      vencidas: lista.reduce(function (s, l) { return s + Math.max(0, l.vencidas); }, 0),
      aguardandoConferencia: _pendentes().length,
      perdasMes: perdasMes, perdasMesValor: perdasMesValor,
      saidasMes: saidasMes, devolucoesMes: devolucoesMes,
      divergenciaMes: divergenciaMes,
      taxaRetorno: saidasMes > 0 ? Math.round((devolucoesMes / saidasMes) * 1000) / 10 : null
    },
    locais: lista, galpoes: galpoes, tipos: tipos
  };
}

/* ============================ EXTRATO ============================ */

function _extrato(localId, de, ate) {
  localId = String(localId || '');
  var local = _locais().filter(function (l) { return String(l.ID) === localId; })[0];
  if (!local) return { ok: false, erro: 'Local não encontrado.' };
  var tipos = _mapa(_tipos());
  var locais = _mapa(_locais());
  var users = _mapa(_rows(SH_USERS));
  var dDe = de ? _data(de) : null;
  var dAte = ate ? _fimDoDia(_data(ate)) : null;

  var todos = _movs().filter(function (m) {
    return String(m.OrigemID) === localId || String(m.DestinoID) === localId;
  }).sort(function (a, b) { return a.DataRef > b.DataRef ? 1 : (a.DataHora > b.DataHora ? 1 : -1); });

  var saldo = 0, saldoInicial = 0;
  var linhas = [];
  todos.forEach(function (m) {
    var q = _efetiva(m);
    var sinal = 0;
    if (m.Tipo === 'AJUSTE') sinal = String(m.DestinoID) === localId ? 1 : 0;
    else if (m.Tipo === 'PERDA') sinal = String(m.OrigemID) === localId ? -1 : 0;
    else sinal = String(m.DestinoID) === localId ? 1 : -1;
    var delta = sinal * (m.Tipo === 'AJUSTE' ? Number(m.Qtd) : q);
    if (m.Tipo === 'DEVOLUCAO' && m.Status !== 'CONFIRMADO') delta = 0;
    saldo += delta;
    var fora = (dDe && m.DataRef < dDe);
    if (fora) { saldoInicial = saldo; return; }
    if (dAte && m.DataRef > dAte) return;
    linhas.push({
      id: m.ID, data: _iso(m.DataRef), tipo: m.Tipo,
      descricao: _descricao(m, locais, localId),
      tipoCaixa: _nome(tipos, m.TipoCaixaID),
      entrada: delta > 0 ? delta : '', saida: delta < 0 ? -delta : '',
      declarada: m.Qtd, conferida: m.QtdConferida,
      divergencia: (m.Tipo === 'DEVOLUCAO' && m.QtdConferida !== '' && Number(m.QtdConferida) !== Number(m.Qtd)) ? Number(m.QtdConferida) - Number(m.Qtd) : '',
      status: m.Status, romaneio: m.Romaneio, usuario: _nome(users, m.UsuarioID),
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL, saldo: saldo
    });
  });

  var ag = _aging()[localId] || { d0_7: 0, d8_15: 0, d16_30: 0, d31: 0, maisAntiga: null, total: 0 };
  var porTipo = (_saldos()[localId]) || {};
  var valores = {};
  _tipos().forEach(function (t) { valores[t.ID] = Number(t.ValorUnit) || 0; });
  var vTotal = 0;
  Object.keys(porTipo).forEach(function (t) { vTotal += porTipo[t] * (valores[t] || 0); });

  return {
    ok: true,
    local: { id: local.ID, nome: local.Nome, tipo: local.Tipo, responsavel: local.Responsavel, telefone: local.Telefone, limite: Number(local.LimiteCaixas) || 0, prazo: Number(local.DiasPrazo) || Number(_config().diasPrazoPadrao) || 7 },
    saldoInicial: saldoInicial, saldo: saldo, valor: vTotal,
    porTipo: Object.keys(porTipo).map(function (t) { return { tipo: _nome(tipos, t), qtd: porTipo[t], valor: porTipo[t] * (valores[t] || 0) }; }),
    emConferencia: _emConferencia()[localId] || 0,
    aging: ag, linhas: linhas
  };
}

function _extratoToken(token, de, ate) {
  token = String(token || '').trim();
  if (!token) return { ok: false, erro: 'Link inválido.' };
  var local = _rows(SH_LOCAIS).filter(function (l) { return String(l.Token).trim() === token; })[0];
  if (!local) return { ok: false, erro: 'Link inválido ou revogado.' };
  var r = _extrato(local.ID, de, ate);
  if (r.ok) { r.somenteLeitura = true; r.empresa = _config().empresa || 'Qdelícia Frutas'; }
  return r;
}

function _descricao(m, locais, localId) {
  var outro = String(m.OrigemID) === localId ? m.DestinoID : m.OrigemID;
  var nomeOutro = _nome(locais, outro);
  switch (m.Tipo) {
    case 'SAIDA': return String(m.DestinoID) === localId ? 'Remessa de caixas — saiu de ' + nomeOutro : 'Remessa enviada para ' + nomeOutro;
    case 'DEVOLUCAO': return String(m.OrigemID) === localId ? 'Devolução de caixas para ' + nomeOutro : 'Devolução recebida de ' + nomeOutro;
    case 'TRANSFERENCIA': return String(m.DestinoID) === localId ? 'Transferência recebida de ' + nomeOutro : 'Transferência enviada para ' + nomeOutro;
    case 'PERDA': return 'Baixa de caixas (perda)' + (m.Obs ? ' — ' + m.Obs : '');
    case 'AJUSTE': return 'Ajuste de saldo' + (m.Obs ? ' — ' + m.Obs : '');
    default: return m.Tipo;
  }
}

/* ============================ CADASTROS ============================ */

function _salvarRegistro(aba, p, prefixo) {
  var dados = p.registro;
  if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch (e) { dados = null; } }
  if (!dados) {
    dados = {};
    COLS[aba].forEach(function (c) { if (p[c] !== undefined) dados[c] = p[c]; });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = _sheet(aba);
    var c = _colMap(aba);
    if (dados.ID) {
      var idx = _indice(aba, dados.ID);
      if (idx < 0) return { ok: false, erro: 'Registro não encontrado: ' + dados.ID };
      COLS[aba].forEach(function (col) {
        if (col === 'ID') return;
        if (dados[col] === undefined) return;
        sh.getRange(idx, c[col]).setValue(dados[col]);
      });
      return { ok: true, id: dados.ID, atualizado: true };
    }
    dados.ID = _novoId(prefixo);
    if (aba === SH_LOCAIS && !dados.Token) dados.Token = _token();
    if (dados.Ativo === undefined) dados.Ativo = 'SIM';
    _append(aba, dados);
    return { ok: true, id: dados.ID, criado: true };
  } finally {
    lock.releaseLock();
  }
}

function _excluir(aba, id) {
  if (!COLS[aba]) return { ok: false, erro: 'Aba inválida.' };
  if (aba === SH_MOV) return { ok: false, erro: 'Movimento não se exclui — use cancelar.' };
  var idx = _indice(aba, String(id || ''));
  if (idx < 0) return { ok: false, erro: 'Registro não encontrado.' };
  // Não apaga local com movimento — inativa.
  if (aba === SH_LOCAIS) {
    var temMov = _movs().some(function (m) { return String(m.OrigemID) === String(id) || String(m.DestinoID) === String(id); });
    if (temMov) {
      _sheet(aba).getRange(idx, _colMap(aba).Ativo).setValue('NAO');
      return { ok: true, inativado: true, aviso: 'Local tem movimentos — foi inativado em vez de excluído.' };
    }
  }
  _sheet(aba).deleteRow(idx);
  return { ok: true, excluido: true };
}

/* ============================ HELPERS ============================ */

function _sheet(nome) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh) throw new Error('Aba não encontrada: ' + nome + '. Rode a função setup() no Apps Script.');
  return sh;
}

function _colMap(aba) {
  var m = {};
  COLS[aba].forEach(function (c, i) { m[c] = i + 1; });
  return m;
}

function _rows(aba) {
  var sh = _sheet(aba);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = COLS[aba];
  var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
  return vals.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (c, i) { o[c] = r[i]; });
    o._linha = 0;
    return o;
  });
}

function _movs() {
  return _rows(SH_MOV).filter(function (m) {
    return String(m.Cancelado).toUpperCase() !== 'SIM';
  }).map(function (m) {
    m.Tipo = String(m.Tipo).toUpperCase();
    m.Status = String(m.Status).toUpperCase();
    m.DataRef = m.DataRef instanceof Date ? m.DataRef : _data(m.DataRef || m.DataHora);
    m.DataHora = m.DataHora instanceof Date ? m.DataHora : _data(m.DataHora);
    return m;
  });
}

function _append(aba, obj) {
  var sh = _sheet(aba);
  var linha = COLS[aba].map(function (c) { return obj[c] !== undefined && obj[c] !== null ? obj[c] : ''; });
  sh.appendRow(linha);
}

function _indice(aba, id) {
  var sh = _sheet(aba);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return -1;
}

function _novoId(prefixo) {
  var aba = prefixo === 'M' ? SH_MOV : (prefixo === 'L' ? SH_LOCAIS : (prefixo === 'T' ? SH_TIPOS : SH_USERS));
  var sh = _sheet(aba);
  var last = sh.getLastRow();
  var max = 0;
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var n = parseInt(String(r[0]).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
  }
  var num = String(max + 1);
  while (num.length < (prefixo === 'M' ? 6 : 3)) num = '0' + num;
  return prefixo + num;
}

function _token() {
  var s = '';
  var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  for (var i = 0; i < 10; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

function _config() {
  var c = {};
  _rows(SH_CONFIG).forEach(function (r) { c[String(r.Chave)] = r.Valor; });
  return c;
}

function _locais() {
  return _rows(SH_LOCAIS).map(function (l) { l.Tipo = String(l.Tipo).toUpperCase(); return l; });
}
function _tipos() { return _rows(SH_TIPOS); }
function _usuariosPublicos() {
  return _rows(SH_USERS).filter(function (u) { return String(u.Ativo).toUpperCase() !== 'NAO'; })
    .map(function (u) { return { ID: u.ID, Nome: u.Nome, Perfil: String(u.Perfil).toUpperCase(), LocalPadrao: u.LocalPadrao }; });
}

function _mapa(lista) {
  var m = {};
  lista.forEach(function (x) { m[String(x.ID)] = x.Nome; });
  return m;
}
function _nome(mapa, id) { return mapa[String(id)] || (id ? String(id) : ''); }

function _data(v) {
  if (v instanceof Date) return v;
  var s = String(v || '').trim();
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    var q = s.split('/');
    return new Date(Number(q[2]), Number(q[1]) - 1, Number(q[0]));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}
function _fimDoDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59); }
function _iso(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function _pastaDrive() {
  var cfg = _config();
  if (cfg.pastaDriveId) {
    try { return DriveApp.getFolderById(String(cfg.pastaDriveId)); } catch (e) { /* recria abaixo */ }
  }
  var pasta = DriveApp.createFolder('Qdelicia - Canhotos Caixas');
  pasta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var idx = _indice(SH_CONFIG, 'pastaDriveId');
  if (idx > 0) _sheet(SH_CONFIG).getRange(idx, 2).setValue(pasta.getId());
  else _append(SH_CONFIG, { Chave: 'pastaDriveId', Valor: pasta.getId() });
  return pasta;
}

/** Salva assinatura/foto (dataURL base64) no Drive e devolve o link de visualização. */
function _salvarArquivo(dataUrl, nome, mime) {
  try {
    var s = String(dataUrl);
    var base64 = s.indexOf(',') >= 0 ? s.split(',')[1] : s;
    if (!base64 || base64.length < 50) return '';
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, nome);
    var arq = _pastaDrive().createFile(blob);
    arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/file/d/' + arq.getId() + '/view';
  } catch (e) {
    return '';
  }
}

function _out(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(String(callback) + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
