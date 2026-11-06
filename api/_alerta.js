/**
 * Qdelícia Frutas — Controle de Caixas
 * O ALERTA DE FALHA DE GRAVAÇÃO.
 *
 * Nasceu do pior defeito que o app já teve (04–06/11/2026): por dois dias o banco recusou
 * lançamentos, a tela disse "gravado", e quem descobriu foi a equipe. Agora toda gravação
 * que falha no servidor:
 *   1. fica REGISTRADA na tabela `falhas_gravacao`, com o que a pessoa tentou mandar —
 *      é a cópia de segurança do lançamento, para ele poder ser refeito mesmo que o
 *      celular se perca;
 *   2. vira um E-MAIL para o administrador, na hora.
 *
 * O e-mail sai pelo Resend (https://resend.com), com a chave em `RESEND_API_KEY` e o
 * destino em `ALERTA_EMAIL`, as duas nas variáveis de ambiente da Vercel. Sem elas, o
 * alerta não sai — e a falha continua registrada e visível no painel. NUNCA ponha a chave
 * num arquivo do repositório.
 *
 * NADA AQUI PODE DERRUBAR A RESPOSTA. Se o registro ou o e-mail falharem, a pessoa ainda
 * precisa receber o "NÃO GRAVADO" — é ele que faz o celular guardar o lançamento.
 */
'use strict';

/* Campos que NUNCA vão para o registro nem para o e-mail: credenciais e imagens. */
var PROIBIDOS = /senha|pin|segredo|token|foto|assinatura|chave/i;

function limparPayload(p) {
  var o = {};
  Object.keys(p || {}).forEach(function (k) {
    if (PROIBIDOS.test(k)) return;
    var v = p[k];
    if (typeof v === 'string' && v.length > 500) v = v.slice(0, 500) + '…';
    o[k] = v;
  });
  return o;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function horaBrasilia(d) {
  try {
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch (e) { return d.toISOString(); }
}

/* O RESUMO LEGÍVEL do que a pessoa tentou gravar — é ele que permite refazer o
   lançamento a partir do e-mail, sem abrir o banco. */
function resumoDoPedido(p) {
  var linhas = [];
  var campos = [['acao', 'Ação'], ['tipo', 'Tipo'], ['dataRef', 'Data do movimento'],
    ['origemId', 'Origem'], ['destinoId', 'Destino'], ['motorista', 'Motorista'],
    ['veiculo', 'Veículo'], ['usuarioId', 'Quem lançou'], ['obs', 'Observação'],
    ['clientKey', 'Chave do envio']];
  campos.forEach(function (c) {
    if (p[c[0]] !== undefined && p[c[0]] !== '') linhas.push([c[1], p[c[0]]]);
  });
  if (Array.isArray(p.itens)) {
    linhas.push(['Itens', p.itens.map(function (i) {
      return (i.tipoCaixaId || '?') + ': ' + (i.qtd == null ? '?' : i.qtd);
    }).join(' · ')]);
  }
  return linhas;
}

/* UM E-MAIL POR MINUTO por instância, no máximo. Com o banco fora do ar, cada tentativa
   de cada celular falharia — sem o freio seriam centenas de e-mails, e o que importa é
   saber que começou. As falhas seguintes continuam registradas, e o e-mail diz isso. */
var ultimoEnvio = 0, seguradas = 0;
var INTERVALO_MS = 60 * 1000;

async function enviarEmail(assunto, html) {
  var chave = process.env.RESEND_API_KEY || '';
  var para = process.env.ALERTA_EMAIL || '';
  if (!chave || !para) return { enviado: false, motivo: 'sem RESEND_API_KEY ou ALERTA_EMAIL' };
  var de = process.env.ALERTA_REMETENTE || 'Controle de Caixas <onboarding@resend.dev>';
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var t = ctl ? setTimeout(function () { ctl.abort(); }, 4000) : null;
  try {
    var r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: de, to: para.split(',').map(function (x) { return x.trim(); }),
                             subject: assunto, html: html }),
      signal: ctl ? ctl.signal : undefined
    });
    return { enviado: r.ok, motivo: r.ok ? '' : ('Resend ' + r.status) };
  } catch (e) {
    return { enviado: false, motivo: String(e && e.message || e) };
  } finally { if (t) clearTimeout(t); }
}

/**
 * Registra e avisa. `db` é o módulo do banco (para o teste poder trocar), `p` o pedido,
 * `e` o erro, `agora` a hora. Devolve o que conseguiu fazer — nunca lança.
 */
async function falhaDeGravacao(db, p, e, agora) {
  agora = agora || new Date();
  var limpo = limparPayload(p);
  var tecnico = String((e && e.corpo) || (e && e.message) || e || '').slice(0, 2000);
  var resultado = { registrado: false, email: null };

  try {
    await db.insert('falhas_gravacao', [{
      acao: String(p && p.acao || ''),
      usuario_id: String(p && (p.usuarioId || p.quem) || ''),
      erro: tecnico,
      payload: limpo
    }]);
    resultado.registrado = true;
  } catch (e2) { /* o banco pode ser justamente o que caiu — o e-mail vira a cópia */ }

  var agoraMs = agora.getTime();
  if (agoraMs - ultimoEnvio < INTERVALO_MS) {
    seguradas++;
    resultado.email = { enviado: false, motivo: 'freio de 1 por minuto' };
    return resultado;
  }
  var antes = seguradas;
  ultimoEnvio = agoraMs; seguradas = 0;

  var linhas = resumoDoPedido(limpo).map(function (l) {
    return '<tr><td style="padding:4px 10px 4px 0;color:#555">' + esc(l[0]) +
      '</td><td style="padding:4px 0"><b>' + esc(l[1]) + '</b></td></tr>';
  }).join('');
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">' +
    '<h2 style="color:#a3261d;margin:0 0 8px">Lançamento NÃO gravado</h2>' +
    '<p>O banco recusou uma gravação em <b>' + esc(horaBrasilia(agora)) + '</b> (Brasília). ' +
    'A tela avisou a pessoa e o celular guardou o lançamento para reenviar sozinho.</p>' +
    '<table style="border-collapse:collapse">' + linhas + '</table>' +
    '<p style="margin-top:14px"><b>Erro técnico:</b><br><code style="font-size:12px">' +
    esc(tecnico.slice(0, 600)) + '</code></p>' +
    (antes ? '<p>Antes deste, <b>' + antes + '</b> outra(s) falha(s) ficaram sem e-mail pelo ' +
             'freio de um por minuto — estão no painel.</p>' : '') +
    '<p>' + (resultado.registrado
      ? 'A tentativa ficou registrada no painel, em <b>Falhas de gravação</b>.'
      : '<b>Nem o registro da falha entrou no banco</b> — este e-mail é a única cópia do ' +
        'que a pessoa tentou lançar. Guarde-o.') + '</p></div>';

  resultado.email = await enviarEmail('⚠ Caixas: lançamento NÃO gravado (' +
    String(limpo.acao || 'gravação') + ')', html);
  return resultado;
}

module.exports = {
  falhaDeGravacao: falhaDeGravacao, limparPayload: limparPayload,
  resumoDoPedido: resumoDoPedido, enviarEmail: enviarEmail,
  _zerarFreio: function () { ultimoEnvio = 0; seguradas = 0; }
};
