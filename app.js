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

/**
   * O estado da rede, escrito nos TRES lugares que o mostram.
   *
   * Uma conta so: o chip da lateral, o ponto no circulo da barra de app e o aviso ao
   * lado dele. Tres contas sobre a mesma coisa discordam no primeiro ajuste, e a que
   * discordar mente em silencio — alguem veria ponto verde com lancamento preso na fila.
   *
   * O AVISO da barra de app so aparece quando ha o que avisar. Um chip dizendo "Online"
   * o tempo todo vira ruido, e ruido constante e o que faz ninguem reparar no dia em que
   * ele muda. O ponto verde ja diz que esta tudo bem.
   */
  function atualizarBadge() {
    var n = fila().length;
    var estado, texto;
    if (!navigator.onLine) {
      estado = 'off';
      texto = n ? '⚠ Offline · ' + n + ' na fila' : '⚠ Offline';
    } else if (n) {
      estado = 'alerta';
      texto = '↻ ' + n + ' para enviar';
    } else {
      estado = '';
      texto = '● Online';
    }

    var el = document.getElementById('chipRede');
    if (el) {
      el.className = estado ? 'chip ' + estado : 'chip';
      el.textContent = texto;
    }
    var ponto = document.getElementById('pontoRede');
    if (ponto) ponto.className = estado ? 'ponto ' + estado : 'ponto';
    var aviso = document.getElementById('avisoRede');
    if (aviso) {
      aviso.hidden = !estado;
      aviso.className = estado ? 'chip ' + estado : 'chip';
      aviso.textContent = texto;
    }
  }

  function chave() {
    return 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- sessão ---------------- */

  function sessao() { try { return JSON.parse(localStorage.getItem(KEY_SESSAO) || 'null'); } catch (e) { return null; } }
  /**
   * Grava a sessão.
   *
   * `via` — se a pessoa autenticou com PIN ou com senha — SOBREVIVE aqui, e isso não é
   * detalhe: ela é propriedade da SESSÃO, não do cadastro. O servidor só a sabe no
   * login; `meuAcesso` devolve o registro atualizado e não tem como saber por onde a
   * pessoa entrou. Como a renovação chama `entrar()` com esse registro, sem esta linha
   * o `via` sumia segundos depois de entrar — e um login por PIN passava a abrir o
   * painel, que é exatamente o que a porta única não pode fazer. Medido no navegador.
   */
  function entrar(u) {
    var novo = {};
    Object.keys(u || {}).forEach(function (k) { novo[k] = u[k]; });
    if (novo.via === undefined) {
      var antes = sessao();
      if (antes && antes.via !== undefined) novo.via = antes.via;
    }
    localStorage.setItem(KEY_SESSAO, JSON.stringify(novo));
  }
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
   * Ordem de leitura dos locais: galpão, filial, rota, cliente, fornecedor — e alfabética dentro de
   * cada grupo. O banco entrega por id, e id é ordem de cadastro: bastou nascer um galpão
   * novo para ele cair no fim da lista, longe dos outros galpões. Quem lê a tela procura
   * por tipo, não por quando a linha foi criada.
   *
   * Devolve um array novo: ordenar no lugar mexeria no cache compartilhado.
   */
  var ORDEM_TIPO = { GALPAO: 0, FILIAL: 1, ROTA: 2, CLIENTE: 3, FORNECEDOR: 4 };
  /* "teste" no nome afunda para o fim, antes de qualquer outro critério. A cópia da
     regra do servidor vive aqui de propósito: app.js não importa nada, e a alternativa
     seria uma chamada a mais só para ordenar uma lista. */
  function temTeste(v) { return /teste/i.test(String(v == null ? '' : v)); }
  function pesoTeste(v) { return temTeste(v) ? 1 : 0; }
  /* A matriz abre a lista, a pedido: é de onde a carga sai quase sempre, e ficava em
     quarto por acaso do alfabeto ("Filial ..." vem antes de "Matriz ..."). O peso do
     ensaio continua mandando mais: uma "Matriz Teste" segue no fim. */
  function pesoMatriz(v) { return /matriz/i.test(String(v == null ? '' : v)) ? 0 : 1; }

  function ordenarLocais(lista) {
    function peso(l) {
      var t = ORDEM_TIPO[String(l.Tipo).toUpperCase()];
      return t === undefined ? 9 : t;
    }
    return (lista || []).slice().sort(function (a, b) {
      return pesoTeste(a.Nome) - pesoTeste(b.Nome) ||
             pesoMatriz(a.Nome) - pesoMatriz(b.Nome) ||
             peso(a) - peso(b) ||
             String(a.Nome).localeCompare(String(b.Nome), 'pt-BR');
    });
  }

  /** Lista qualquer com campo Nome: ensaio no fim, alfabética dentro de cada grupo. */
  function ordenarPorNome(lista) {
    return (lista || []).slice().sort(function (a, b) {
      return pesoTeste(a.Nome) - pesoTeste(b.Nome) ||
             String(a.Nome || '').localeCompare(String(b.Nome || ''), 'pt-BR');
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

  /**
   * O cabecalho da pagina diz ONDE se esta.
   *
   * Na barra lateral o item aceso ja diz isso — mas so no desktop. No celular a barra e
   * uma gaveta fechada, e sem este titulo a tela nao tem nenhuma pista de que pagina
   * esta aberta. Por isso ele nao e enfeite: e a unica resposta no estreito.
   *
   * O texto sai do proprio botao (`data-titulo`, ou o rotulo dele). Uma fonte so — uma
   * lista a parte de titulo por pagina discordaria da navegacao no primeiro rename.
   */
  function tituloDaPagina(botao) {
    var t = document.getElementById('tituloPagina');
    if (!t || !botao) return;
    t.textContent = botao.dataset.titulo || botao.textContent.trim();
    var acima = document.getElementById('acimaPagina');
    if (acima && botao.dataset.acima) acima.textContent = botao.dataset.acima;
  }

  function abas(seletor) {
    document.querySelectorAll(seletor + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll(seletor + ' button').forEach(function (x) { x.classList.remove('ativa'); });
        b.classList.add('ativa');
        document.querySelectorAll('.pagina').forEach(function (p) { p.classList.remove('ativa'); });
        var alvo = document.getElementById(b.dataset.pagina);
        if (alvo) alvo.classList.add('ativa');
        tituloDaPagina(b);
        /* Trocar de pagina fecha a gaveta: no celular ela cobre a tela, e deixa-la aberta
           sobre a pagina recem-aberta esconderia justamente o que a pessoa foi buscar.
           `false` porque o foco NAO volta para o gatilho — ele volta para o conteudo. */
        fecharGaveta(false);
        window.scrollTo(0, 0);
        if (b.dataset.pagina && typeof window.aoAbrirAba === 'function') window.aoAbrirAba(b.dataset.pagina);
      });
    });
    var ativa = document.querySelector(seletor + ' button.ativa');
    if (ativa) tituloDaPagina(ativa);
  }

  /**
   * As iniciais para o circulo de quem esta logado.
   *
   * Duas letras: a primeira do primeiro nome e a primeira do ULTIMO. "Melkezedeque
   * Soares" vira MS, e nao ME — num galpao com dois Joses, o sobrenome e o que separa.
   */
  function iniciais(nome) {
    var p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '—';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  /**
   * Escreve no rodape da barra lateral quem esta logado.
   *
   * Nome e perfil em LINHAS separadas, e nao "Nome · Perfil" numa so: na barra de 236px
   * a linha unica era cortada no meio do nome, e o que sobrava era justamente a parte
   * que nao identifica ninguem.
   */
  function quemEsta(nome, perfil) {
    var n = document.getElementById('cabUsuario');
    if (n) n.textContent = nome || '—';
    var p = document.getElementById('cabPerfil');
    if (p) p.textContent = perfil || '';
    /* Os dois circulos: o da lateral e o da barra de app. O da barra e a UNICA pista de
       quem esta logado no celular com a gaveta fechada, e por isso ele leva o nome
       inteiro no `title` — duas letras identificam pouco quando ha dois Josés.

       `insertBefore` em vez de `textContent` no de cima: o ponto de estado mora dentro
       dele, e escrever o texto por cima apagaria o ponto junto. */
    var a = document.getElementById('avatarUsuario');
    if (a) a.textContent = iniciais(nome);
    var t = document.getElementById('avatarTopo');
    if (t) {
      t.firstChild && t.firstChild.nodeType === 3
        ? (t.firstChild.nodeValue = iniciais(nome))
        : t.insertBefore(document.createTextNode(iniciais(nome)), t.firstChild);
      t.title = (nome || '—') + (perfil ? ' · ' + perfil : '');
    }
  }


  /* ==================== A PORTA UNICA ====================
   * Uma tela de entrada so, servida pelos dois apps. Ela mora AQUI e nao em cada
   * pagina porque duas copias de uma tela de login divergem — e o dia em que uma
   * delas pedir outra coisa, a pessoa descobre isso levando uma recusa.
   *
   * Antes eram duas telas quase iguais, "Area do Usuario" e "Area Admin", cada uma
   * mandando para a outra por um link no rodape. Quem errava a porta levava
   * "usuario ou senha incorretos" — uma mensagem que nao falava do erro de verdade.
   *
   * O DESTINO e decidido pelo PAPEL, depois da autenticacao, nunca pelo endereco que
   * a pessoa abriu. Mas o PAINEL continua exigindo a SENHA: o que o PIN protege e o
   * lancamento, que fica registrado com nome e hora e pode ser corrigido; o painel ve
   * a operacao inteira e mexe em cadastro. Se o PIN abrisse o painel, a porta unica
   * teria rebaixado a tranca do escritorio a do galpao sem ninguem pedir.
   */

  /** Para onde esta sessao deve ir. */
  function destinoDa(s) {
    return (s && s.via === 'senha' && s.acessoPainel === true) ? 'admin.html' : 'index.html';
  }

  /**
   * @param aqui   'campo' | 'painel' — qual app está servindo esta tela
   * @param abrir  função que abre o app desta página, já com a sessão gravada
   */
  function portaUnica(aqui, abrir) {
    var pagina = aqui === 'painel' ? 'admin.html' : 'index.html';
    var $ = function (id) { return document.getElementById(id); };

    /* ---- o erro, num lugar so ---------------------------------------------
       O cartao do topo e para o que a pessoa precisa LER COM CALMA; o toast, para
       o que ela ja sabe. Misturar os dois faz a frase importante sumir em cinco
       segundos. */
    function mostrarErro(texto) {
      var caixa = $('erroLogin');
      if (!caixa) return;
      caixa.hidden = !texto;
      var alvo = $('erroLoginTexto');
      if (alvo) alvo.textContent = texto || '';
    }

    /* Segredo errado seguido: na terceira, a tela para de repetir "incorretos" e diz
       o que fazer. Quem chega na terceira nao errou o dedo — esqueceu, ou o nome
       cadastrado nao e o que ele digita —, e daqui nao havia saida nenhuma.

       E so contagem de TELA: nao bloqueia nem grava nada. Travar o acesso por segredo
       errado pararia o lancamento no galpao, que e o que este app existe para nao
       deixar parar. E nao conta falha de rede: cair a internet nao e segredo errado. */
    var AVISA_ADMIN = 3, erros = 0, erroDe = '';
    var MSG_ADMIN = 'Entre em contato com o administrador do sistema.';

    function contarErro(id, msgServidor) {
      // Outra pessoa no mesmo aparelho comeca do zero: senao ela levaria o aviso do
      // administrador ja na primeira tentativa dela.
      if (id.toLowerCase() !== erroDe) { erros = 0; erroDe = id.toLowerCase(); }
      erros++;
      if (erros < AVISA_ADMIN) { mostrarErro(''); toast(msgServidor, 'erro'); return; }
      mostrarErro(MSG_ADMIN);
      toast(MSG_ADMIN, 'erro');
    }

    /* O app nao tem mais botao de mostrar o segredo: o campo ficava com dois olhos,
       o nosso e o que o Edge desenha sozinho em `input type=password`. O `campo`
       continua aqui porque o Enter e o foco da abertura dependem dele. */
    var campo = $('inSegredo');

    /* ---- entrar ------------------------------------------------------------ */
    var trocaPendente = null;   // { id, atual, usuario, via } ate a troca terminar

    function seguir(usuario, via) {
      var sessao = {};
      Object.keys(usuario || {}).forEach(function (k) { sessao[k] = usuario[k]; });
      sessao.via = via;
      entrar(sessao);
      var destino = destinoDa(sessao);
      /* Se esta pagina nao e o destino, a pessoa vai para la. A sessao ja esta
         gravada, entao a outra pagina abre direto — sem pedir nada de novo. */
      if (destino !== pagina) { location.href = destino; return; }
      abrir(sessao);
    }

    $('btnEntrar').addEventListener('click', function () {
      var id = $('inUsuario').value.trim();
      var segredo = campo ? campo.value : '';
      if (!id) return toast('Informe seu usuário.', 'erro');
      var btn = this;
      btn.disabled = true; btn.textContent = 'Entrando…';
      post({ acao: 'login', identificador: id, segredo: segredo }).then(function (r) {
        btn.disabled = false; btn.textContent = 'Entrar';
        if (!r.ok) return contarErro(id, r.erro);
        erros = 0; erroDe = ''; mostrarErro('');
        localStorage.setItem('qdc_ultimo_usuario', id);
        /* Segredo que veio do escritorio: a pessoa nao chega ao app antes de
           escolher um dela. A sessao deste login fica guardada para depois da
           troca — refazer o login mandaria o segredo novo de volta pela rede. */
        if (r.trocarSenha) { abrirTroca(id, segredo, r.usuario, r.via); return; }
        seguir(r.usuario, r.via);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Entrar';
        toast(e.message, 'erro');
      });
    });
    if (campo) campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnEntrar').click();
    });

    /* ---- trocar o segredo provisorio -------------------------------------- */
    function abrirTroca(id, atual, usuario, via) {
      trocaPendente = { id: id, atual: atual, usuario: usuario, via: via };
      $('cardEntrar').hidden = true;
      $('cardTroca').hidden = false;
      $('inNova').value = ''; $('inNova2').value = '';
      $('inNova').focus();
    }

    $('btnTrocarSenha').addEventListener('click', function () {
      if (!trocaPendente) return;
      var nova = $('inNova').value.trim();
      var rep = $('inNova2').value.trim();
      var erro = $('erroTroca');
      function falhar(msg, cid) {
        erro.innerHTML = '<div class="aviso-box erro">' + esc(msg) + '</div>';
        var el = $(cid); if (el) el.focus();
      }
      /* A REGRA SEGUE A CREDENCIAL, e nao a pagina: quem entrou com PIN troca um PIN
         de seis numeros; quem entrou com senha troca uma senha. Fosse pela pagina, a
         mesma pessoa veria regras diferentes conforme o endereco que abriu. */
      var ehPin = trocaPendente.via === 'pin';
      if (ehPin && !/^\d{6}$/.test(nova)) return falhar('A senha do app de campo tem 6 números.', 'inNova');
      if (!ehPin && nova.length < 6) return falhar('A senha do painel tem pelo menos 6 caracteres.', 'inNova');
      if (nova !== rep) return falhar('As duas senhas não são iguais.', 'inNova2');
      if (nova === trocaPendente.atual) return falhar('Escolha uma senha diferente da que o escritório passou.', 'inNova');

      erro.innerHTML = '';
      var btn = this; btn.disabled = true; btn.textContent = 'Salvando…';
      var pedido = ehPin
        ? { acao: 'definirPin', identificador: trocaPendente.id,
            pinAtual: trocaPendente.atual, novoPin: nova }
        : { acao: 'definirSenha', identificador: trocaPendente.id,
            senhaAtual: trocaPendente.atual, novaSenha: nova };
      post(pedido).then(function (r) {
        btn.disabled = false; btn.textContent = 'Salvar e entrar';
        if (!r.ok) return falhar(r.erro || 'Não consegui trocar a senha.', 'inNova');
        var u = trocaPendente.usuario, via = trocaPendente.via;
        trocaPendente = null;
        toast('Senha trocada.', 'ok');
        seguir(u, via);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'Salvar e entrar';
        falhar(e.message, 'inNova');
      });
    });
    $('inNova2').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnTrocarSenha').click();
    });

    /* ---- primeiro acesso / esqueci ----------------------------------------
       Abre NA PROPRIA TELA, e nao num modal: o modal so existia no painel, e no
       celular um bloco que desce e melhor do que uma janela por cima do teclado. */
    $('linkPrimeiroAcesso').addEventListener('click', function (e) {
      e.preventDefault();
      var aberto = !$('cardPrimeiro').hidden;
      $('cardPrimeiro').hidden = aberto;
      if (!aberto) {
        $('psIdent').value = $('inUsuario').value.trim();
        $('psIdent').focus();
      }
    });

    $('psSalvar').addEventListener('click', function () {
      var b = this; b.disabled = true; b.textContent = 'Salvando…';
      post({ acao: 'definirSenha',
             identificador: $('psIdent').value.trim(),
             pin: $('psPin').value,
             senhaAtual: $('psAtual').value,
             novaSenha: $('psNova').value }).then(function (r) {
        b.disabled = false; b.textContent = 'Salvar senha';
        if (!r.ok) return toast(r.erro, 'erro');
        $('cardPrimeiro').hidden = true;
        toast('Senha definida. Entre com ela agora.', 'ok');
      }).catch(function (e) {
        b.disabled = false; b.textContent = 'Salvar senha'; toast(e.message, 'erro');
      });
    });

    /* Resposta unica, exista o identificador ou nao: dizer "esse e-mail nao existe"
       entregaria a lista de quem trabalha aqui a quem estiver testando enderecos. */
    $('psPedir').addEventListener('click', function () {
      var b = this, ident = $('psIdent').value.trim();
      if (!ident) return toast('Escreva seu usuário ali em cima.', 'erro');
      b.disabled = true; b.textContent = 'Enviando…';
      post({ acao: 'pedirSenha', identificador: ident }).then(function (r) {
        b.disabled = false; b.textContent = 'Pedir ajuda ao escritório';
        if (!r || r.ok === false) return toast((r && r.erro) || 'Não consegui enviar.', 'erro');
        $('cardPrimeiro').hidden = true;
        toast('Pedido enviado. Procure o escritório para receber a senha nova.', 'ok');
      }).catch(function (e) {
        b.disabled = false; b.textContent = 'Pedir ajuda ao escritório'; toast(e.message, 'erro');
      });
    });

    /* ---- abertura ---------------------------------------------------------- */
    if (semApi()) {
      mostrarErro('Configure o endereço da API em config.js antes de usar.');
      return;
    }
    // A lista de usuarios nao aparece aqui: ela mostrava o nome de toda a equipe a
    // quem so abrisse o endereco. O aparelho guarda o ultimo nome, entao na pratica
    // ninguem redigita.
    var ultimo = localStorage.getItem('qdc_ultimo_usuario');
    if (ultimo) $('inUsuario').value = ultimo;
    (ultimo ? campo : $('inUsuario')).focus();
  }

  /* ---------------- gaveta de navegacao ----------------
     Abaixo de 1024px a barra lateral vira gaveta; acima disso ela e fixa e isto aqui
     fica inerte. Mora no `app.js`, e nao em cada tela: sao duas telas com a mesma
     gaveta, e duas copias divergem no primeiro ajuste. */
  var mqLargo = window.matchMedia('(min-width: 1024px)');

  function gavetaAberta() { return document.body.classList.contains('gaveta-aberta'); }

  var focoAntes = null;

  function abrirGaveta() {
    if (mqLargo.matches || gavetaAberta()) return;
    var barra = document.getElementById('lateral');
    var btn = document.getElementById('btnMenu');
    var veu = document.getElementById('veu');
    if (!barra) return;
    focoAntes = document.activeElement;
    document.body.classList.add('gaveta-aberta');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (veu) veu.hidden = false;
    /* O foco entra na gaveta. Sem isto o teclado continua no conteudo ATRAS dela, e quem
       navega sem mouse abre um painel em que nao consegue entrar. */
    var primeiro = barra.querySelector('button:not([style*="none"]), a');
    if (primeiro) primeiro.focus();
  }

  function fecharGaveta(devolveFoco) {
    if (!gavetaAberta()) return;
    var btn = document.getElementById('btnMenu');
    var veu = document.getElementById('veu');
    document.body.classList.remove('gaveta-aberta');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (veu) veu.hidden = true;
    if (devolveFoco !== false && focoAntes && focoAntes.focus) focoAntes.focus();
  }

  function gaveta() {
    var btn = document.getElementById('btnMenu');
    var barra = document.getElementById('lateral');
    var veu = document.getElementById('veu');
    if (!btn || !barra) return;
    btn.addEventListener('click', function () {
      if (gavetaAberta()) fecharGaveta(); else abrirGaveta();
    });
    if (veu) veu.addEventListener('click', function () { fecharGaveta(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gavetaAberta()) fecharGaveta();
    });
    /* O foco nao escapa da gaveta enquanto ela esta aberta. */
    document.addEventListener('focusin', function (e) {
      if (gavetaAberta() && !barra.contains(e.target) && e.target !== btn) {
        var primeiro = barra.querySelector('button:not([style*="none"]), a');
        if (primeiro) primeiro.focus();
      }
    });
    /* Ao passar para o desktop a gaveta some, e o estado tem de sumir junto: a classe
       esquecida no `body` deixaria a pagina travada sem rolagem. */
    function noCorte() { if (mqLargo.matches) fecharGaveta(false); }
    if (mqLargo.addEventListener) mqLargo.addEventListener('change', noCorte);
    else if (mqLargo.addListener) mqLargo.addListener(noCorte);
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
    /* Os DOIS mandam a fila agora: o chip da lateral e o aviso da barra de app. Quem ve
       o aviso no celular e quem esta com lancamento preso, e era o unico que nao tinha
       onde tocar para tentar de novo. */
    ['chipRede', 'avisoRede'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function () {
        sincronizar().then(function (n) { toast(n ? n + ' enviado(s).' : (fila().length ? 'Ainda na fila — sem conexão.' : 'Nada pendente.'), n ? 'ok' : ''); });
      });
    });
  });

  window.QDC = {
    get: get, post: post, enviar: enviar, sincronizar: sincronizar, fila: fila, chave: chave,
    sessao: sessao, entrar: entrar, sair: sair, ehAdmin: ehAdmin, podeConferir: podeConferir,
    cache: cache, carregarDados: carregarDados, semApi: semApi,
    precisaConfirmar: precisaConfirmar, precisaConfirmarCaixa: precisaConfirmarCaixa,
    ativo: ativo, ordenarLocais: ordenarLocais, ordenarPorNome: ordenarPorNome,
    temTeste: temTeste, num: num, dataBR: dataBR, hoje: hoje, esc: esc, soDigitos: soDigitos,
    toast: toast, abas: abas, gaveta: gaveta, fecharGaveta: fecharGaveta,
    portaUnica: portaUnica, destinoDa: destinoDa,
    quemEsta: quemEsta, iniciais: iniciais,
    barraAging: barraAging, assinatura: assinatura,
    comprimirFoto: comprimirFoto, csv: csv, atualizarBadge: atualizarBadge
  };
})();
