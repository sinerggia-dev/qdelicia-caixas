/* Qdelícia Frutas — Controle de Caixas | núcleo compartilhado (API, sessão, fila offline, utilitários) */
(function () {
  'use strict';

  var API = (typeof API_URL !== 'undefined' && API_URL) ? API_URL : '';
  var KEY_FILA = 'qdc_fila';
  var KEY_SESSAO = 'qdc_sessao';
  var KEY_CACHE = 'qdc_cache_';

  /* ---------------- API ---------------- */

  function semApi() {
    return !API || API.indexOf('COLE_AQUI') >= 0;
  }

  /**
   * A API é servida na mesma origem do site (/api na Vercel), então é fetch simples:
   * sem JSONP e sem preflight. O tempo limite continua em 30s — no celular em rua ruim,
   * pendurar a tela é pior do que avisar que falhou, porque a fila offline segura o dado.
   */
  function comLimite(url, opcoes) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var o = opcoes || {};
    if (ctrl) o.signal = ctrl.signal;
    var estourou = false;
    var timer = setTimeout(function () { estourou = true; if (ctrl) ctrl.abort(); }, 30000);
    return fetch(url, o).then(function (r) {
      clearTimeout(timer);
      return r.text().then(function (t) {
        try { return JSON.parse(t); } catch (e) { throw new Error('Resposta inesperada do servidor.'); }
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (estourou) throw new Error('Tempo esgotado ao consultar o servidor.');
      if (e && e.message && e.message.indexOf('Resposta inesperada') === 0) throw e;
      throw new Error('Falha de rede ao consultar o servidor.');
    });
  }

  function get(params) {
    if (semApi()) return Promise.reject(new Error('Endereço da API não configurado em config.js.'));
    var q = Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return comLimite(API + '?' + q + '&_=' + Date.now(), { method: 'GET' });
  }

  function post(payload) {
    if (semApi()) return Promise.reject(new Error('Endereço da API não configurado em config.js.'));
    return comLimite(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  /* ---------------- fila offline ---------------- */

  function fila() { try { return JSON.parse(localStorage.getItem(KEY_FILA) || '[]'); } catch (e) { return []; } }
  function salvarFila(f) { localStorage.setItem(KEY_FILA, JSON.stringify(f)); atualizarBadge(); }

  /**
   * Guarda o lançamento para reenvio. Se a cota do navegador estourar (fotos/canhotos pesam),
   * salva de novo sem as imagens — perder a foto é ruim, perder a contagem é pior.
   */
  function enfileirar(payload) {
    var f = fila();
    f.push({ payload: payload, criadoEm: new Date().toISOString(), tentativas: 0 });
    try {
      salvarFila(f);
    } catch (e) {
      var leve = f.map(function (i) {
        var p = {};
        Object.keys(i.payload).forEach(function (k) { if (k !== 'foto' && k !== 'assinatura') p[k] = i.payload[k]; });
        return { payload: p, criadoEm: i.criadoEm, tentativas: i.tentativas };
      });
      try {
        salvarFila(leve);
        toast('Memória do celular cheia: os lançamentos foram guardados sem as fotos.', 'erro');
      } catch (e2) {
        toast('Não foi possível guardar o lançamento offline. Anote no papel!', 'erro');
      }
    }
  }

  /** Envia agora; se falhar (offline), guarda na fila e devolve {offline:true}. */
  function enviar(payload) {
    if (!payload.clientKey) payload.clientKey = chave();
    if (!navigator.onLine) { enfileirar(payload); return Promise.resolve({ ok: true, offline: true }); }
    return post(payload).then(function (r) {
      if (!r || r.ok === false) throw new Error((r && r.erro) || 'Erro no servidor.');
      return r;
    }).catch(function (err) {
      // Erro de rede -> guarda para reenviar. Erro de validação do servidor -> propaga.
      if (/rede|network|failed to fetch|tempo|inesperada/i.test(err.message)) {
        enfileirar(payload);
        return { ok: true, offline: true, aviso: err.message };
      }
      throw err;
    });
  }

  function sincronizar() {
    var f = fila();
    if (!f.length || !navigator.onLine) return Promise.resolve(0);
    var enviados = 0;
    return f.reduce(function (p, item) {
      return p.then(function () {
        return post(item.payload).then(function (r) {
          if (r && r.ok !== false) { item._ok = true; enviados++; }
          else { item.tentativas++; item._erro = r && r.erro; }
        }).catch(function () { item.tentativas++; });
      });
    }, Promise.resolve()).then(function () {
      salvarFila(f.filter(function (i) { return !i._ok; }));
      return enviados;
    });
  }

  function atualizarBadge() {
    var el = document.getElementById('chipRede');
    if (!el) return;
    var n = fila().length;
    if (!navigator.onLine) {
      el.className = 'chip off';
      el.textContent = n ? '⚠ Offline · ' + n + ' na fila' : '⚠ Offline';
    } else if (n) {
      el.className = 'chip alerta';
      el.textContent = '↻ ' + n + ' para enviar';
    } else {
      el.className = 'chip';
      el.textContent = '● Online';
    }
  }

  function chave() {
    return 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- sessão ---------------- */

  function sessao() { try { return JSON.parse(localStorage.getItem(KEY_SESSAO) || 'null'); } catch (e) { return null; } }
  function entrar(u) { localStorage.setItem(KEY_SESSAO, JSON.stringify(u)); }
  function sair() { localStorage.removeItem(KEY_SESSAO); location.reload(); }
  /* Compara sem caixa: o perfil é escrito por gente, e a grafia gravada é a que a pessoa
     escolheu — quem decide permissão não pode depender disso. */
  function ehAdmin() { var s = sessao(); return !!s && String(s.perfil).toUpperCase() === 'ADMIN'; }
  /* GALPAO continua aqui de propósito: virou CONFERENTE no banco, mas a sessão guardada
     no celular só troca no próximo login, e até lá o conferente perderia a aba. */
  function podeConferir() {
    var s = sessao();
    return !!s && ['ADMIN', 'CONFERENTE', 'GALPAO'].indexOf(String(s.perfil).toUpperCase()) >= 0;
  }

  /* ---------------- cache local dos cadastros ---------------- */

  function cache(nome, valor) {
    if (valor === undefined) {
      try { return JSON.parse(localStorage.getItem(KEY_CACHE + nome) || 'null'); } catch (e) { return null; }
    }
    localStorage.setItem(KEY_CACHE + nome, JSON.stringify(valor));
    return valor;
  }

  /** Cadastros: usa cache imediatamente e atualiza em segundo plano. */
  function carregarDados() {
    var local = cache('dados');
    var promessa = get({ acao: 'dados' }).then(function (r) {
      if (r && r.ok) { cache('dados', r); return r; }
      throw new Error((r && r.erro) || 'Falha ao carregar cadastros.');
    });
    if (local) { promessa.catch(function () { }); return Promise.resolve(local).then(function (d) { promessa.then(function (n) { window.dispatchEvent(new CustomEvent('dadosAtualizados', { detail: n })); }).catch(function () { }); return d; }); }
    return promessa;
  }

  /* ---------------- utilitários ---------------- */

  /**
   * Ativo chega como booleano do Postgres, mas o histórico da planilha usava 'SIM'/'NAO'.
   * Sem este helper, `String(false) !== 'NAO'` deixava passar tudo como ativo.
   */
  function ativo(v) {
    if (v === false || v === 0) return false;
    var s = String(v === undefined || v === null ? '' : v).trim().toUpperCase();
    return !(s === 'NAO' || s === 'NÃO' || s === 'FALSE' || s === 'N' || s === '0');
  }

  /**
   * Ordem de leitura dos locais: galpão, filial, rota, cliente — e alfabética dentro de
   * cada grupo. O banco entrega por id, e id é ordem de cadastro: bastou nascer um galpão
   * novo para ele cair no fim da lista, longe dos outros galpões. Quem lê a tela procura
   * por tipo, não por quando a linha foi criada.
   *
   * Devolve um array novo: ordenar no lugar mexeria no cache compartilhado.
   */
  var ORDEM_TIPO = { GALPAO: 0, FILIAL: 1, ROTA: 2, CLIENTE: 3 };
  function ordenarLocais(lista) {
    function peso(l) {
      var t = ORDEM_TIPO[String(l.Tipo).toUpperCase()];
      return t === undefined ? 9 : t;
    }
    return (lista || []).slice().sort(function (a, b) {
      return peso(a) - peso(b) ||
             String(a.Nome).localeCompare(String(b.Nome), 'pt-BR');
    });
  }

  /* ---------------- confirmação dentro da página ---------------- */

  /**
   * O `confirm()` do navegador nasce colado na barra de endereço, com o domínio no título
   * e longe de onde a pessoa clicou. Estes dois o substituem sem mexer em quem chama:
   * devolvem `true` enquanto falta confirmar e, no "sim", re-disparam o clique do botão.
   */
  function marcado(botao) {
    if (botao.dataset.confirmado === '1') { delete botao.dataset.confirmado; return true; }
    return false;
  }
  function refazer(botao) { botao.dataset.confirmado = '1'; botao.click(); }

  /** Pergunta na própria linha da lista, onde o dedo estava. */
  function precisaConfirmar(botao, texto) {
    if (marcado(botao)) return false;
    var celula = botao.parentNode;
    if (celula.querySelector('.confirmando')) return true;

    // Os botões originais só somem enquanto a pergunta existe: recriá-los perderia
    // os eventos já ligados neles.
    var antes = Array.prototype.slice.call(celula.children);
    antes.forEach(function (el) { el.style.display = 'none'; });

    var box = document.createElement('span');
    box.className = 'confirmando';
    var msg = document.createElement('span');
    msg.textContent = texto;
    var sim = document.createElement('button');
    sim.className = 'mini perigo'; sim.textContent = 'sim';
    var nao = document.createElement('button');
    nao.className = 'mini'; nao.textContent = 'não';
    box.appendChild(msg); box.appendChild(sim); box.appendChild(nao);

    function fechar() {
      if (box.parentNode) box.parentNode.removeChild(box);
      antes.forEach(function (el) { el.style.display = ''; });
    }
    nao.addEventListener('click', fechar);
    sim.addEventListener('click', function () { fechar(); refazer(botao); });
    celula.appendChild(box);
    nao.focus();
    return true;
  }

  /** Caixa sobre o conteúdo, para formulário — ali não existe "a linha". */
  function precisaConfirmarCaixa(botao, texto, rotuloSim) {
    if (marcado(botao)) return false;

    var fundo = document.createElement('div');
    fundo.className = 'confirma-fundo';
    var cx = document.createElement('div');
    cx.className = 'confirma-caixa';
    var p = document.createElement('p');
    p.textContent = texto;
    var linha = document.createElement('div');
    linha.className = 'linha-btn';
    var sim = document.createElement('button');
    sim.className = 'btn'; sim.textContent = rotuloSim || 'Confirmar';
    var nao = document.createElement('button');
    nao.className = 'btn neutro'; nao.textContent = 'Cancelar';
    linha.appendChild(sim); linha.appendChild(nao);
    cx.appendChild(p); cx.appendChild(linha);
    fundo.appendChild(cx);

    function fechar() { if (fundo.parentNode) fundo.parentNode.removeChild(fundo); }
    nao.addEventListener('click', fechar);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
    });
    sim.addEventListener('click', function () { fechar(); refazer(botao); });
    document.body.appendChild(fundo);
    sim.focus();
    return true;
  }

  function num(n) { return (Number(n) || 0).toLocaleString('pt-BR'); }
  function dataBR(iso) {
    if (!iso) return '';
    var d = String(iso).slice(0, 10).split('-');
    return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : String(iso);
  }
  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

  function toast(msg, tipo) {
    var el = document.getElementById('toast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.className = tipo || '';
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, tipo === 'erro' ? 5200 : 3200);
  }

  function abas(seletor) {
    document.querySelectorAll(seletor + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll(seletor + ' button').forEach(function (x) { x.classList.remove('ativa'); });
        b.classList.add('ativa');
        document.querySelectorAll('.pagina').forEach(function (p) { p.classList.remove('ativa'); });
        var alvo = document.getElementById(b.dataset.pagina);
        if (alvo) alvo.classList.add('ativa');
        window.scrollTo(0, 0);
        if (b.dataset.pagina && typeof window.aoAbrirAba === 'function') window.aoAbrirAba(b.dataset.pagina);
      });
    });
  }

  /** Bloco de aging pronto para exibir (barra + legenda). */
  function barraAging(ag) {
    ag = ag || {};
    var t = (ag.d0_7 || 0) + (ag.d8_15 || 0) + (ag.d16_30 || 0) + (ag.d31 || 0);
    if (!t) return '<div class="vazio" style="padding:10px">Sem caixas pendentes.</div>';
    function p(v) { return (100 * (v || 0) / t).toFixed(1) + '%'; }
    return '<div class="barra">' +
      '<span style="width:' + p(ag.d0_7) + ';background:#2e9e54"></span>' +
      '<span style="width:' + p(ag.d8_15) + ';background:#f5b301"></span>' +
      '<span style="width:' + p(ag.d16_30) + ';background:#e07b00"></span>' +
      '<span style="width:' + p(ag.d31) + ';background:#c62828"></span>' +
      '</div><div class="legenda">' +
      '<span><i style="background:#2e9e54"></i>até 7 dias: <b>' + num(ag.d0_7) + '</b></span>' +
      '<span><i style="background:#f5b301"></i>8–15: <b>' + num(ag.d8_15) + '</b></span>' +
      '<span><i style="background:#e07b00"></i>16–30: <b>' + num(ag.d16_30) + '</b></span>' +
      '<span><i style="background:#c62828"></i>+30 dias: <b>' + num(ag.d31) + '</b></span>' +
      (ag.maisAntiga !== null && ag.maisAntiga !== undefined ? '<span>mais antiga: <b>' + ag.maisAntiga + ' dias</b></span>' : '') +
      '</div>';
  }

  /** Pad de assinatura em <canvas> (mouse + toque). */
  function assinatura(canvas) {
    var ctx = canvas.getContext('2d');
    var desenhando = false, vazio = true;
    function tamanho() {
      var r = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16212b';
    }
    tamanho();
    window.addEventListener('resize', function () { var d = vazio; tamanho(); vazio = d; });
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function inicio(e) { e.preventDefault(); desenhando = true; vazio = false; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function move(e) { if (!desenhando) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    function fim() { desenhando = false; }
    ['mousedown', 'touchstart'].forEach(function (ev) { canvas.addEventListener(ev, inicio, { passive: false }); });
    ['mousemove', 'touchmove'].forEach(function (ev) { canvas.addEventListener(ev, move, { passive: false }); });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { canvas.addEventListener(ev, fim); });
    return {
      limpar: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); vazio = true; },
      vazio: function () { return vazio; },
      dataURL: function () { return vazio ? '' : canvas.toDataURL('image/png'); }
    };
  }

  /** Reduz a foto no navegador antes de subir (economiza dados do celular). */
  function comprimirFoto(file, maxLado, qualidade) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var img = new Image();
        img.onload = function () {
          var esc = Math.min(1, (maxLado || 1200) / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', qualidade || 0.72));
        };
        img.onerror = function () { reject(new Error('Não foi possível ler a imagem.')); };
        img.src = r.result;
      };
      r.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      r.readAsDataURL(file);
    });
  }

  function csv(nomeArquivo, cabecalho, linhas) {
    var txt = [cabecalho.join(';')].concat(linhas.map(function (l) {
      return l.map(function (c) {
        var s = String(c === undefined || c === null ? '' : c);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    })).join('\r\n');
    var blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  window.addEventListener('online', function () { atualizarBadge(); sincronizar().then(function (n) { if (n) toast(n + ' lançamento(s) enviado(s) da fila.', 'ok'); }); });
  window.addEventListener('offline', atualizarBadge);
  document.addEventListener('DOMContentLoaded', function () {
    atualizarBadge();
    sincronizar().then(function (n) { if (n) toast(n + ' lançamento(s) pendente(s) enviado(s).', 'ok'); });
    var chip = document.getElementById('chipRede');
    if (chip) chip.addEventListener('click', function () {
      sincronizar().then(function (n) { toast(n ? n + ' enviado(s).' : (fila().length ? 'Ainda na fila — sem conexão.' : 'Nada pendente.'), n ? 'ok' : ''); });
    });
  });

  window.QDC = {
    get: get, post: post, enviar: enviar, sincronizar: sincronizar, fila: fila, chave: chave,
    sessao: sessao, entrar: entrar, sair: sair, ehAdmin: ehAdmin, podeConferir: podeConferir,
    cache: cache, carregarDados: carregarDados, semApi: semApi,
    precisaConfirmar: precisaConfirmar, precisaConfirmarCaixa: precisaConfirmarCaixa,
    ativo: ativo, ordenarLocais: ordenarLocais, num: num, dataBR: dataBR, hoje: hoje, esc: esc, soDigitos: soDigitos,
    toast: toast, abas: abas, barraAging: barraAging, assinatura: assinatura,
    comprimirFoto: comprimirFoto, csv: csv, atualizarBadge: atualizarBadge
  };
})();
