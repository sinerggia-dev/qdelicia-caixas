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

  // GET via JSONP: não sofre CORS/preflight e funciona igual em qualquer navegador.
  function get(params) {
    return new Promise(function (resolve, reject) {
      if (semApi()) return reject(new Error('URL do Apps Script não configurada em config.js.'));
      var cb = 'qdc_cb_' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () { limpar(); reject(new Error('Tempo esgotado ao consultar o servidor.')); }, 30000);
      function limpar() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      window[cb] = function (r) { limpar(); resolve(r); };
      var q = Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
      var s = document.createElement('script');
      s.src = API + '?' + q + '&callback=' + cb + '&_=' + Date.now();
      s.onerror = function () { limpar(); reject(new Error('Falha de rede ao consultar o servidor.')); };
      document.head.appendChild(s);
    });
  }

  // POST com Content-Type text/plain: evita preflight e ainda permite ler a resposta.
  function post(payload) {
    if (semApi()) return Promise.reject(new Error('URL do Apps Script não configurada em config.js.'));
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (r) { return r.text(); }).then(function (t) {
      try { return JSON.parse(t); } catch (e) { throw new Error('Resposta inesperada do servidor.'); }
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
  function ehAdmin() { var s = sessao(); return !!s && (s.perfil === 'ADMIN'); }
  function podeConferir() { var s = sessao(); return !!s && (s.perfil === 'ADMIN' || s.perfil === 'GALPAO'); }

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

  function num(n) { return (Number(n) || 0).toLocaleString('pt-BR'); }
  function moeda(n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
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
    num: num, moeda: moeda, dataBR: dataBR, hoje: hoje, esc: esc, soDigitos: soDigitos,
    toast: toast, abas: abas, barraAging: barraAging, assinatura: assinatura,
    comprimirFoto: comprimirFoto, csv: csv, atualizarBadge: atualizarBadge
  };
})();
