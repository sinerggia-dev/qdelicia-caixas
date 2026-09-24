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
  /* O CARIMBO de quando o lançamento foi gravado, na hora de quem está olhando.
   *
   * `dataBR` não serve aqui, e a diferença não é detalhe: ela recorta os dez primeiros
   * caracteres do texto, o que está certo para a data de referência — que é uma data
   * seca, sem hora nenhuma — e errado para o carimbo, que tem hora e fuso.
   *
   * O SERVIDOR RODA EM UTC, e o carimbo chega dele SEM MARCA DE FUSO: "2026-09-17T23:30:00"
   * é 23:30 em Londres, ou seja 20:30 no galpão. Entregue cru ao `new Date`, o navegador
   * lê esse texto como hora LOCAL e mostra 23:30 — três horas adiante, e na véspera
   * virando o dia. Marcar o texto como UTC antes de converter é o que põe a coluna Hora
   * na hora em que a pessoa de fato lançou.
   *
   * Carimbo que JÁ traz fuso (termina em Z, ou +03:00) passa intocado: marcá-lo de novo
   * seria trocar o fuso certo por outro.
   */
  function comoUTC(carimbo) {
    var t = String(carimbo || '');
    return /(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : t + 'Z';
  }
  function horaBR(carimbo) {
    var d = carimbo ? new Date(comoUTC(carimbo)) : null;
    if (!d || isNaN(d.getTime())) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function dataDoCarimboBR(carimbo) {
    var d = carimbo ? new Date(comoUTC(carimbo)) : null;
    if (!d || isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function dataHoraBR(carimbo) {
    var dt = dataDoCarimboBR(carimbo);
    return dt ? dt + ' ' + horaBR(carimbo) : '';
  }
  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* O FUSO DA OPERAÇÃO. Um só, e aqui: o servidor tem o dele em `FUSO_OPERACAO_H`, e
     dois lugares com o mesmo número acabam divergindo no dia em que um deles mudar. */
  var FUSO_OPERACAO = 'America/Recife';

  /* O DIA DE HOJE NO GALPÃO, e não no computador de quem olha.
     `hoje()` acima devolve a data da máquina, que é o certo para preencher um campo que
     a pessoa vai conferir. Já um ATALHO de período ("últimos 7 dias") decide sozinho o
     que vai ser somado: com o relógio em outro fuso — gerente em viagem, servidor em
     UTC — ele mudaria de significado sem ninguém perceber. Este devolve o mesmo dia que
     o servidor usa para decidir se um lançamento é "de hoje".

     `formatToParts` em vez do truque de formatar com um locale que sai em ISO: o truque
     depende do separador do locale, e isso não é contrato de lugar nenhum. */
  function hojeOperacao() {
    if (!window.Intl || !Intl.DateTimeFormat) return hoje();
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_OPERACAO,
      year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year && p.month && p.day ? p.year + '-' + p.month + '-' + p.day : hoje();
  }
  /* ================= RELÓGIO E TEMPO DA UNIDADE =================
   *
   * AQUI, E NÃO NO PAINEL. Nasceu dentro do `admin.html`, e por isso só existia nas sete
   * páginas do escritório: quem estava no galpão, com o app de campo, não via hora nem
   * tempo nenhum — e é justamente quem está no pátio que precisa saber se vai chover.
   *
   * A HORA É A DA OPERAÇÃO. Quem confere de outro estado — ou de casa, com o relógio do
   * computador em outro fuso — precisa ler a hora do galpão: é ela que decide se um
   * lançamento é "de hoje", e é por ela que a janela de dez minutos da correção conta.
   * O mesmo fuso que o servidor usa em `FUSO_OPERACAO_H`.
   *
   * O TEMPO NÃO É ENFEITE: caixa de papelão em pátio molhado é perda, e chuva na rota é
   * atraso de retorno. Fica ao lado da hora porque as duas respondem "como está lá
   * agora". Vem da Open-Meteo, que não pede chave nem cadastro, e o que sai daqui é a
   * coordenada do galpão — nada de pessoa nenhuma.
   *
   * SEM VALOR DE MENTIRA. Se a consulta não voltar, o grau fica apagado em "--°" e a
   * hora continua: um número inventado no lugar do que não carregou é pior que o campo
   * vazio, porque ninguém desconfia dele. */
  var UNIDADE = {
    /* Trocar aqui se a operação passar a ser de outra unidade. Um lugar só, e agora
       vale para os DOIS apps. O fuso vem do `FUSO_OPERACAO` acima: é o MESMO que decide
       o dia da operação nos atalhos de período e na janela de correção — dois relógios
       diferentes na mesma tela discordariam sobre que dia é hoje. */
    nome: 'Recife', lat: -8.0632, lon: -34.8926, fuso: FUSO_OPERACAO
  };

  /* A MARCAÇÃO SAI DAQUI TAMBÉM, e não de cada HTML. Ela é pura estrutura, sem uma
     palavra que mude de página, e nasce `hidden` — sem o JS ela não aparece de qualquer
     jeito, então copiá-la nos dois arquivos só criaria duas cópias para divergirem. */
  var TEMPO_HTML =
    /* A CONTA DENTRO DA PÍLULA, e não numa moldura ao lado. Duas caixas arredondadas
       encostadas no mesmo canto viram duas bordas competindo; aqui a conta, o tempo e a
       hora se separam pela MESMA divisória que já separava tempo de hora.

       SÓ NO COMPUTADOR — o CSS cuida disso. No celular a barra do app já tem a foto e a
       saudação numa linha própria, e repetir as duas na faixa seria dizer duas vezes a
       mesma coisa num espaço que não sobra.

       O risco do arranjo é assumido: sem borda própria a conta deixa de parecer botão.
       Por isso ela ganha fundo ao passar o mouse e mantém o cursor de clique. */
    '<button class="tempo__conta" id="tempoConta" type="button">' +
      '<span class="avatar" id="avatarTempo" aria-hidden="true">—</span>' +
      '<span class="tempo__quem">' +
        '<span class="tempo__ola" id="tempoOla">Olá,</span>' +
        '<b class="tempo__nome" id="tempoNome">—</b>' +
      '</span>' +
    '</button>' +
    '<span class="tempo__div tempo__div--conta" aria-hidden="true"></span>' +
    '<div class="tempo__t" id="tempoT">' +
      '<span class="tempo__ico" id="tempoIco" aria-hidden="true"></span>' +
      '<span class="tempo__c">' +
        '<span class="tempo__g" id="tempoGrau">--°</span>' +
        '<span class="tempo__loc">' +
          /* A CONDIÇÃO SAIU DA LINHA, a pedido, e ficou só no balão.
             Ela esteve aqui com um argumento que continua valendo — um desenho de 28px
             não distingue "garoa" de "chuva forte", e essa diferença muda a decisão de
             quem carrega caminhão. O que pesou contra foi a largura: com grau,
             condição e local na mesma linha, o local — que diz de ONDE é o tempo —
             era o primeiro a cortar. Entre perder a palavra e perder a cidade, a
             cidade fica: tempo certo da cidade errada é pior que tempo vago da certa.
             A palavra continua no `title`, e a tabela de intensidades continua inteira. */
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
               'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"></path>' +
            '<circle cx="12" cy="10" r="2.6"></circle></svg>' +
          '<span id="tempoLocal"></span>' +
        '</span>' +
      '</span>' +
    '</div>' +
    '<span class="tempo__div" aria-hidden="true"></span>' +
    '<div class="tempo__d">' +
      '<span class="tempo__data" id="tempoData"></span>' +
      '<time class="tempo__hora" id="tempoHora"></time>' +
    '</div>';

  /* ================= A SAUDAÇÃO PELO HORÁRIO =================
   *
   * "Bom dia" no lugar de "Olá". Custa o mesmo espaço e diz uma coisa a mais: que a
   * tela sabe que horas são. Num app que fica aberto o dia inteiro, é também o sinal
   * mais discreto de que ele não congelou às 8h da manhã.
   *
   * 05:00–11:59 bom dia · 12:00–17:59 boa tarde · 18:00–04:59 boa noite.
   *
   * A HORA SAI DO FUSO DA OPERAÇÃO, e não do relógio do aparelho. Celular de galpão
   * com o fuso errado — ou gerente conferindo de outro estado — veria "bom dia" às
   * 22h, e a saudação errada é pior que nenhuma: ela anuncia que o relógio da tela
   * não vale nada, e é o mesmo relógio que decide o dia do lançamento. */
  function saudacaoDe(h) {
    if (h >= 5 && h < 12) return 'Bom dia,';
    if (h >= 12 && h < 18) return 'Boa tarde,';
    return 'Boa noite,';
  }
  function horaDaOperacao() {
    if (!window.Intl || !Intl.DateTimeFormat) return new Date().getHours();
    try {
      var t = new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO_OPERACAO, hour: '2-digit', hour12: false
      }).format(new Date());
      var h = parseInt(t, 10);
      /* meia-noite vem como "24" em alguns navegadores, e `24 >= 18` daria "boa noite"
         por acidente certo pelo motivo errado — às 00h30 ele já erraria a virada. */
      return h === 24 ? 0 : h;
    } catch (e) { return new Date().getHours(); }
  }
  function pintarSaudacao() {
    /* OS DOIS LUGARES: a barra do app no celular e a pílula no computador. Um só
       elemento por vez estaria certo hoje — `.topo` e a pílula nunca aparecem juntos —,
       mas escrever num id fixo era o que deixaria a saudação congelada no outro no dia
       em que os dois convivessem. */
    var alvos = [document.getElementById('olaSaudacao'),
                 document.querySelector('.tempo .tempo__ola')].filter(Boolean);
    if (!alvos.length) return;
    var t = saudacaoDe(horaDaOperacao());
    /* só toca no DOM quando muda: escrever o mesmo texto a cada minuto é trabalho que
       não muda nada e ainda atrapalha quem estiver com o texto selecionado. */
    alvos.forEach(function (el) { if (el.textContent !== t) el.textContent = t; });
  }
  /* VIRA SOZINHA, no minuto cheio. Quem deixa o painel aberto a tarde toda vê "Boa
     tarde" virar "Boa noite" às 18h sem recarregar. Reagenda em vez de `setInterval`
     pela mesma razão do relógio: intervalo fixo acumula atraso, e depois de horas
     aberto a virada chegaria minutos depois da hora. */
  function agendarSaudacao() {
    var a = new Date();
    setTimeout(function () { pintarSaudacao(); agendarSaudacao(); },
      (60 - a.getSeconds()) * 1000 - a.getMilliseconds());
  }

  /* Preenche a conta da pílula a partir da sessão. Chamada pelos DOIS lados porque a
     ordem não é garantida: a faixa se monta no arranque e o `quemEsta` roda quando a
     sessão carrega, e qualquer um dos dois pode chegar primeiro. Chamar nos dois é mais
     barato que um sinal entre eles, e não tem estado para desencontrar. */
  function pintarContaTopo() {
    /* AS PEÇAS SAEM DA FAIXA, e não de uma busca global por id — a mesma razão do
       resto da faixa: o app de campo já teve dois elementos com o mesmo id e a busca
       global entregou o errado. */
    var faixa = document.querySelector('.tempo');
    var cx = faixa && faixa.querySelector('.tempo__conta');
    if (!cx || !faixa) return;
    var s = sessao() || {};
    var nome = s.nome || '';
    /* SÓ O PRIMEIRO NOME aqui, e o inteiro no balão. "Boa noite, Natanael" soa como
       gente falando; com o nome completo vira crachá — e a pílula divide ~180px com o
       tempo e o relógio, então o sobrenome cortaria no meio de qualquer jeito. Na barra
       do celular, que tem uma linha inteira só para ela, continua o nome completo. */
    var primeiro = nome ? String(nome).trim().split(/\s+/)[0] : '—';
    faixa.querySelector('.tempo__nome').textContent = primeiro;
    pintarCirculo(faixa.querySelector('.tempo__conta .avatar'), nome, s.foto);
    cx.title = nome + (s.perfil ? ' · ' + s.perfil : '');
    cx.setAttribute('aria-label', 'Conta de ' + nome + (s.perfil ? ' · ' + s.perfil : ''));
    /* A CHAVE ÚNICA: sem nome, a conta e a divisória dela não aparecem. "Olá, —" na
       moldura do tempo é pior que a pílula sem a conta. */
    faixa.classList.toggle('tem-conta', !!nome);
    pintarSaudacao();
  }

  /* O CAMINHÃO, com a carga à vista: quanto mais cheio, mais do que saiu já voltou.
     Os quadrados vazios são a diferença — é o mesmo número do cartão, desenhado.

     Nasceu no `admin.html` e mudou para cá quando o app de campo precisou do mesmo
     desenho na estrada da linha do título: dois caminhões divergem na primeira
     mexida. A cor sai de `currentColor`, e o `--cor` de quem o contém — assim o
     mesmo desenho serve de verde na saída e de azul no retorno, herdando o
     significado que o sistema inteiro já dá às duas cores. */
  function caminhao(cheios){
    var cx = '';
    for (var i = 0; i < 4; i++){
      cx += '<rect x="'+(4+i*7)+'" y="6" width="6" height="8" rx="1" fill="'+
        (i < cheios ? 'currentColor' : 'none')+'" stroke="currentColor" stroke-opacity="'+
        (i < cheios ? '1' : '.35')+'" stroke-width=".9"/>';
    }
    return '<svg class="caminhao" viewBox="0 0 58 24" fill="none" aria-hidden="true" '+
      'style="color:var(--cor)">'+
      '<rect x="1.5" y="2.5" width="32" height="14" rx="2" stroke="currentColor" stroke-width="1.4"/>'+cx+
      '<path d="M33.5 7.5h8l5 5v4h-13z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'+
      '<circle cx="11" cy="19" r="3.4" stroke="currentColor" stroke-width="1.4"/>'+
      '<circle cx="26" cy="19" r="3.4" stroke="currentColor" stroke-width="1.4"/>'+
      '<circle cx="42" cy="19" r="3.4" stroke="currentColor" stroke-width="1.4"/>'+
      '<path d="M1.5 16.5h32M33.5 16.5h13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'+
      /* O escapamento fica na traseira (x≈1): a fumaça sobe e fica para trás. Três
         baforadas defasadas, dentro do próprio SVG — assim andam junto com o caminhão
         sem um segundo elemento para manter no lugar. */
      '<circle class="fumaca" cx="1" cy="13" r="1.7"/>'+
      '<circle class="fumaca fumaca--2" cx="1" cy="13" r="1.7"/>'+
      '<circle class="fumaca fumaca--3" cx="1" cy="13" r="1.7"/></svg>';
  }


  /* ================= O LOCAL DE VERDADE, PELO GPS =================
   *
   * "Recife" é o município do meio de uma região metropolitana, e o galpão pode estar
   * em São Lourenço da Mata, Jaboatão, Paulista ou Cabo. Medido nos dois pontos daqui:
   * a mesma consulta devolve "Recife" para a Ilha do Leite e "São Lourenço da Mata"
   * para um ponto a 20km — ou seja, com o GPS o rótulo passa a dizer o lugar de
   * verdade, e o grau passa a ser lido NA COORDENADA de quem está olhando.
   *
   * NÃO PEDE NADA SOZINHO. Se o navegador já tem a permissão concedida, usa; se não, o
   * nome do local vira um BOTÃO e quem quiser toca. Janela de GPS na cara de quem só
   * abriu a tela é o tipo de coisa que faz a pessoa fechar e não voltar.
   *
   * O RELÓGIO NÃO SEGUE O GPS. A hora continua sendo a da OPERAÇÃO: é ela que decide
   * se um lançamento é "de hoje" e é por ela que a janela de dez minutos da correção
   * conta. O GPS move só o TEMPO, que responde outra pergunta — "como está AQUI agora".
   * Por isso `UNIDADE.fuso` não é tocado em lugar nenhum daqui.
   *
   * E É POR ISSO QUE É OFERTA, não padrão: o gerente que abre o painel de casa no
   * domingo veria o tempo DA CASA DELE, não o do galpão, e tomaria decisão de carga
   * com a chuva errada. A coordenada fixa da unidade continua sendo o começo de toda
   * sessão; o GPS é de quem está no lugar e sabe que está.
   *
   * A COORDENADA vai para o serviço de tempo e para o de nome, e mais nada: não é
   * gravada, não entra em movimento nenhum e não passa pelo servidor do sistema. */
  var GPS_LIGADO = true;

  function ondeEstou() {
    return new Promise(function (ok, erro) {
      if (!navigator.geolocation) return erro('navegador sem GPS');
      navigator.geolocation.getCurrentPosition(
        function (p) {
          ok({ lat: +p.coords.latitude.toFixed(4),
               lon: +p.coords.longitude.toFixed(4),
               prec: Math.round(p.coords.accuracy || 0) });
        },
        function (e) { erro((e && e.message) || 'permissão negada'); },
        /* 15min de `maximumAge`: quem está no galpão não se moveu entre duas trocas de
           aba, e reaproveitar a leitura poupa o rádio do aparelho. */
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 15 * 60 * 1000 }
      );
    });
  }

  /* DUAS FONTES DE NOME, as duas medidas daqui antes de entrarem:
   *
   * 1. BigDataCloud — responde com `Access-Control-Allow-Origin: *`, não pede chave e
   *    distingue município de município: devolveu "São Lourenço da Mata" no ponto onde
   *    uma consulta mais grossa diria só "Recife".
   * 2. wttr.in — o `nearest_area` da MESMA resposta que já buscamos para o tempo. Mais
   *    grosso, mas não acrescenta domínio nenhum e já está provado que atende o
   *    navegador, porque é de lá que o grau vem quando a Open-Meteo falha.
   *
   * O NOMINATIM FICOU DE FORA de propósito. Ele seria a reserva óbvia — é o do
   * OpenStreetMap —, e daqui ele até responde. Mas com cabeçalho `Origin`, que é o que
   * todo navegador manda, ele devolve 403: recusa página. Uma reserva que nunca pode
   * ser exercitada é pior que reserva nenhuma, porque parece que existe. */
  function nomeDoLugar(lat, lon) {
    return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client' +
                 '?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=pt',
                 { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        /* `locality` é o menor nome que o serviço conhece — o bairro ou o município —,
           e é o que a pessoa reconhece como "onde eu estou". `city` e a região são os
           degraus acima, para quando o menor não vem. */
        return d.locality || d.city || d.principalSubdivision ||
               Promise.reject('sem nome');
      })
      .catch(function () {
        return fetch('https://wttr.in/' + lat + ',' + lon + '?format=j1',
                     { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function (d) {
            var a = (d && d.nearest_area && d.nearest_area[0]) || {};
            var n = ((a.areaName || [])[0] || {}).value;
            return n || Promise.reject('sem nome');
          });
      });
  }

  function relogioETempo() {
    /* NO CABEÇALHO DA PÁGINA, que é um só para o app inteiro e fica FORA do
       `.corpo-pagina` que troca de conteúdo. Por isso a faixa aparece em todos os
       módulos sem precisar ser montada de novo a cada troca de aba. */
    var cab = document.querySelector('.cab-pagina');
    if (!cab || cab.querySelector('.tempo')) return null;

    var caixa = document.createElement('div');
    caixa.className = 'tempo';
    caixa.id = 'tempo';
    caixa.hidden = true;
    caixa.innerHTML = TEMPO_HTML;
    cab.appendChild(caixa);

    /* As referências saem da PRÓPRIA caixa, e não de `document.getElementById`: o app
       de campo já teve dois elementos com o mesmo id (`marcaNome`, na barra e na
       gaveta), e a busca global entregou o errado. */
    var elT = caixa.querySelector('.tempo__t');
    var elIco = caixa.querySelector('.tempo__ico');
    var elGrau = caixa.querySelector('.tempo__g');
    var elData = caixa.querySelector('.tempo__data');
    var elHora = caixa.querySelector('.tempo__hora');
    caixa.querySelector('#tempoLocal').textContent = UNIDADE.nome;
    caixa.hidden = false;

    function bater() {
      var agora = new Date();
      elData.textContent = agora.toLocaleDateString('pt-BR',
        { weekday: 'short', day: 'numeric', month: 'short', timeZone: UNIDADE.fuso });
      elHora.textContent = agora.toLocaleTimeString('pt-BR',
        { hour: '2-digit', minute: '2-digit', timeZone: UNIDADE.fuso });
      elHora.dateTime = agora.toISOString();
    }
    bater();

    /* SEM SEGUNDOS, e batendo na virada do MINUTO. Os segundos serviam de sinal de que
       o app estava vivo; hoje quem dá esse sinal é a luz que desce pela barra, e um
       temporizador por segundo num aparelho de galpão é trabalho que ninguém pediu. E
       nada no sistema precisa deles: a janela da correção conta dez MINUTOS.

       REAGENDA a cada volta, em vez de `setInterval` fixo: intervalo acumula atraso e a
       virada chega segundos depois da hora. E PARA com a aba escondida, acertando
       quando ela volta — painel de galpão fica aberto o dia inteiro. */
    var tique;
    function agendar() {
      clearTimeout(tique);
      var a = new Date();
      tique = setTimeout(function () { bater(); agendar(); },
        (60 - a.getSeconds()) * 1000 - a.getMilliseconds());
    }
    agendar();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearTimeout(tique);
      else { bater(); agendar(); }
    });

    /* ---- os desenhos ---- */
    var C = { sol: '#e8a33d', nuvem: '#c3d3e6', chuva: '#8ab8f5', neve: '#e8eef5' };
    function svg(miolo) {
      return '<svg width="28" height="28" viewBox="0 0 32 32" fill="none" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + miolo + '</svg>';
    }
    var raios = '';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      raios += '<line x1="' + (11 + Math.cos(a) * 7.2).toFixed(1) +
               '" y1="' + (12 + Math.sin(a) * 7.2).toFixed(1) +
               '" x2="' + (11 + Math.cos(a) * 9.4).toFixed(1) +
               '" y2="' + (12 + Math.sin(a) * 9.4).toFixed(1) +
               '" stroke="' + C.sol + '"/>';
    }
    var SOL = '<circle cx="11" cy="12" r="5" stroke="' + C.sol + '" fill="' + C.sol +
      '" fill-opacity=".22"/>' + raios;

    /* ---- estrelas da noite ----
       Quatro pontas em curva, e não um polígono de dez lados: em 3px de tela a
       diferença não aparece e o caminho fica quatro vezes menor. Ficam na parte de
       cima, fora de onde a nuvem entra — senão em "noite entre nuvens" elas
       apareceriam POR CIMA dela. Cintilam fora de compasso: piscando juntas leriam
       como alarme. */
    function estrela(x, y, r, classe) {
      return '<path class="estrela ' + classe + '" d="M' + x + ' ' + (y - r) +
        'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
        'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
        'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y +
        'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) +
        'Z" fill="' + C.neve + '" stroke="none"/>';
    }
    var ESTRELAS = estrela(25, 6, 2.1, 'e1') + estrela(6.5, 8.5, 1.5, 'e2') +
                   estrela(28, 13.5, 1.2, 'e3');
    var LUA = ESTRELAS +
      '<path d="M20 17.5A8 8 0 0 1 11.5 9a7 7 0 1 0 8.5 8.5z" stroke="' + C.nuvem +
      '" fill="' + C.nuvem + '" fill-opacity=".18"/>';
    var NUVEM = '<path d="M10.5 25h12a5 5 0 0 0 .4-10 7 7 0 0 0-13.2 2A4.2 4.2 0 0 0 10.5 25z" ' +
      'stroke="' + C.nuvem + '" fill="' + C.nuvem + '" fill-opacity=".14"/>';
    var NUVEM2 = '<path d="M6 21h9a4 4 0 0 0 .3-8 5.6 5.6 0 0 0-10.5 1.5A3.4 3.4 0 0 0 6 21z" ' +
      'stroke="' + C.nuvem + '" stroke-opacity=".6" fill="none"/>';
    var GOTAS = '<path d="M12 27l-1.4 3M17 27l-1.4 3M22 27l-1.4 3" stroke="' + C.chuva + '"/>';
    var GOTAS2 = '<path d="M14.5 27l-1.4 3.4M19.5 27l-1.4 3.4" stroke="' + C.chuva + '"/>';
    var GAROA = '<path d="M13 27l-.8 2M18 27l-.8 2M23 27l-.8 2" stroke="' + C.chuva +
      '" stroke-opacity=".75"/>';
    var RAIO = '<path d="M17 25l-3.5 5h3l-2 4.5" stroke="' + C.sol + '"/>';
    var FLOCO = '<path d="M12 28.5h1M16.5 28.5h1M21 28.5h1" stroke="' + C.neve + '"/>';
    var NEVOA = '<path d="M7 14h18M5 19h22M8 24h16" stroke="' + C.nuvem + '"/>';

    /* ================= OS CÓDIGOS DA OMM =================
     * [família do desenho, palavra de dia, palavra de noite].
     *
     * OS GRAUS DE INTENSIDADE VIRAM PALAVRAS DIFERENTES de propósito. A tabela antiga
     * devolvia "chuva" para tudo entre 51 e 82 — garoa, chuva forte e pancada na mesma
     * palavra. Quem vai decidir se carrega o caminhão agora precisa da diferença, e o
     * desenho de 28px não a dá.
     *
     * Código desconhecido cai em "nublado", que é a resposta mais inofensiva: não
     * promete sol nem assusta com tempestade. */
    var TEMPO = {
      0:  ['limpo',      'céu limpo',              'noite limpa'],
      1:  ['poucas',     'sol com poucas nuvens',  'noite com poucas nuvens'],
      2:  ['parcial',    'sol entre nuvens',       'noite entre nuvens'],
      3:  ['nublado',    'nublado',                'nublado'],
      45: ['nevoa',      'neblina',                'neblina'],
      48: ['nevoa',      'neblina gelada',         'neblina gelada'],
      51: ['garoa',      'garoa fraca',            'garoa fraca'],
      53: ['garoa',      'garoa',                  'garoa'],
      55: ['garoa',      'garoa forte',            'garoa forte'],
      56: ['garoa',      'garoa congelante',       'garoa congelante'],
      57: ['garoa',      'garoa congelante',       'garoa congelante'],
      61: ['chuva',      'chuva fraca',            'chuva fraca'],
      63: ['chuva',      'chuva',                  'chuva'],
      65: ['chuvaforte', 'chuva forte',            'chuva forte'],
      66: ['chuva',      'chuva congelante',       'chuva congelante'],
      67: ['chuvaforte', 'chuva congelante forte', 'chuva congelante forte'],
      71: ['neve',       'neve fraca',             'neve fraca'],
      73: ['neve',       'neve',                   'neve'],
      75: ['neve',       'neve forte',             'neve forte'],
      77: ['neve',       'grãos de neve',          'grãos de neve'],
      80: ['pancada',    'pancadas de chuva',      'pancadas de chuva'],
      81: ['pancada',    'pancadas de chuva',      'pancadas de chuva'],
      82: ['chuvaforte', 'pancadas fortes',        'pancadas fortes'],
      85: ['neve',       'pancadas de neve',       'pancadas de neve'],
      86: ['neve',       'pancadas de neve',       'pancadas de neve'],
      95: ['tempestade', 'tempestade',             'tempestade'],
      96: ['tempestade', 'tempestade com granizo', 'tempestade com granizo'],
      99: ['tempestade', 'tempestade com granizo', 'tempestade com granizo']
    };

    function desenho(cod, dia) {
      var t = TEMPO[cod] || TEMPO[3];
      var f = t[0], texto = dia ? t[1] : t[2], astro = dia ? SOL : LUA, m;
      if (f === 'limpo') m = astro;
      else if (f === 'poucas' || f === 'parcial') m = astro + NUVEM;
      else if (f === 'nublado') m = NUVEM + NUVEM2;
      else if (f === 'nevoa') m = NEVOA;
      else if (f === 'garoa') m = NUVEM + GAROA;
      else if (f === 'chuva') m = NUVEM + GOTAS;
      else if (f === 'chuvaforte') m = NUVEM + GOTAS + GOTAS2;
      else if (f === 'pancada') m = astro + NUVEM + GOTAS;
      else if (f === 'neve') m = NUVEM + FLOCO;
      else if (f === 'tempestade') m = NUVEM + RAIO + GOTAS;
      else m = NUVEM;
      return [m, texto];
    }

    /* É DIA OU É NOITE, quando a fonte não diz.
       A Open-Meteo manda `is_day`; o wttr.in não manda. Antes disso o código assumia
       DIA quando o campo faltava — e a faixa mostrava sol às 22h. 6h às 17h59 no fuso
       da operação: não é o nascer do sol exato, mas erra por minutos duas vezes por
       ano, em vez de errar por doze horas todo dia. */
    function ehDia() {
      try {
        var t = new Intl.DateTimeFormat('pt-BR', {
          timeZone: UNIDADE.fuso, hour: '2-digit', hour12: false
        }).format(new Date());
        var h = parseInt(t, 10); if (h === 24) h = 0;
        return h >= 6 && h < 18;
      } catch (e) {
        var g = new Date().getHours();
        return g >= 6 && g < 18;
      }
    }

    var ultima = null;
    function pintar(grau, cod, dia, fonte) {
      var d = desenho(cod, dia);
      elIco.innerHTML = svg(d[0]);
      elGrau.textContent = grau + '°';
      elT.classList.remove('tempo--sem');
      ultima = new Date();
      caixa.title = d[1] + ' em ' + UNIDADE.nome + ' · ' + grau + '°C · ' + fonte +
        ' · lido às ' + ultima.toLocaleTimeString('pt-BR',
          { hour: '2-digit', minute: '2-digit', timeZone: UNIDADE.fuso });
    }

    /* Nasce apagado e com "--°": o campo existe e ainda não carregou, que é diferente
       de não existir. */
    elIco.innerHTML = svg(NUVEM);
    elT.classList.add('tempo--sem');
    caixa.title = 'Consultando o tempo em ' + UNIDADE.nome + '…';

    /* ================= DUAS FONTES, EM CADEIA =================
     *
     * A faixa deixa de depender de um serviço só. A ordem é tentada de cima para
     * baixo, a primeira que responder direito ganha, e a VENCEDORA vai para a frente
     * da fila da próxima vez — não faz sentido insistir numa que acabou de cair.
     *
     * Cada fonte traduz a resposta dela para o MESMO formato, `{grau, cod, dia}`, com
     * `cod` sempre em WMO: é o que os desenhos e a tabela de palavras entendem. Fonte
     * com vocabulário próprio traz a sua conversão junto.
     *
     * MEDIDO, e não suposto: as duas respondem com `Access-Control-Allow-Origin: *`,
     * então funcionam do navegador. E, consultadas no mesmo minuto para Recife, as
     * duas concordaram — WMO 2 e WWO 116, que é o mesmo "sol entre nuvens". Uma fonte
     * de reserva que discordasse da principal seria pior que nenhuma.
     *
     * NÃO há terceira. A que o modelo sugeria exige chave de cadastro, e código que
     * não pode rodar não pode ser conferido — entra no dia em que houver chave. */
    var WWO_WMO = {
      113:0, 116:2, 119:3, 122:3, 143:45, 248:45, 260:45,
      176:80, 263:51, 266:53, 281:56, 284:57,
      293:61, 296:61, 299:63, 302:63, 305:65, 308:65, 311:66, 314:67,
      353:80, 356:81, 359:82,
      179:71, 182:66, 185:56, 227:73, 230:75, 317:71, 320:73,
      323:71, 326:71, 329:73, 332:73, 335:75, 338:75, 350:77,
      362:85, 365:86, 368:85, 371:86, 374:85, 377:86,
      200:95, 386:95, 389:96, 392:95, 395:96
    };

    var FONTES = [
      { nome: 'Open-Meteo',
        url: function () {
          return 'https://api.open-meteo.com/v1/forecast?latitude=' + UNIDADE.lat +
            '&longitude=' + UNIDADE.lon + '&current=temperature_2m,weather_code,is_day' +
            '&timezone=' + encodeURIComponent(UNIDADE.fuso);
        },
        ler: function (d) {
          var c = (d && d.current) || (d && d.current_weather) || null;
          if (!c) return null;
          var t = c.temperature_2m != null ? c.temperature_2m : c.temperature;
          var cod = c.weather_code != null ? c.weather_code : c.weathercode;
          if (t == null || cod == null) return null;
          return { grau: Math.round(t), cod: +cod,
                   dia: c.is_day == null ? null : !!c.is_day };
        } },
      { nome: 'wttr.in',
        url: function () {
          return 'https://wttr.in/' + UNIDADE.lat + ',' + UNIDADE.lon + '?format=j1';
        },
        ler: function (d) {
          var c = d && d.current_condition && d.current_condition[0];
          if (!c || c.temp_C == null) return null;
          var w = parseInt(c.weatherCode, 10);
          return { grau: Math.round(+c.temp_C),
                   cod: WWO_WMO[w] != null ? WWO_WMO[w] : 3,
                   dia: null };   /* não manda dia/noite: quem decide é o relógio */
        } }
    ];
    var ordemFontes = FONTES.slice();

    function pedirA(f) {
      /* CORTA EM 8 SEGUNDOS. Sem isso, uma rede de galpão que aceita a conexão e não
         responde deixa a promessa pendurada para sempre — e, com a cadeia, seguraria
         também a fonte seguinte, que é justamente a saída. */
      var corta = window.AbortController ? new AbortController() : null;
      if (corta) setTimeout(function () { corta.abort(); }, 8000);
      var opc = { cache: 'no-store' };
      if (corta) opc.signal = corta.signal;
      return fetch(f.url(), opc)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (j) {
          var v = f.ler(j);
          if (!v || v.grau == null || isNaN(v.grau)) return Promise.reject('sem os campos');
          v.fonte = f.nome;
          return v;
        });
    }

    function tentarTodas(i) {
      i = i || 0;
      if (i >= ordemFontes.length) return Promise.reject('nenhuma fonte respondeu');
      return pedirA(ordemFontes[i]).catch(function () { return tentarTodas(i + 1); });
    }

    /* ---- o ritmo ----
       De 10 em 10 minutos no normal. Falhando, recua: 30s, 1min, 2min, 4min… até o
       teto de 10min. Tentar de 30 em 30 segundos numa rede caída é bater na porta de
       alguém que não está em casa — e são duas fontes por tentativa.
       E busca de novo ao VOLTAR para a aba e ao a internet VOLTAR: são os dois
       momentos em que o dado está mais velho e em que alguém está olhando. */
    var RITMO_OK = 10 * 60 * 1000, RITMO_MAX = 10 * 60 * 1000;
    var falhas = 0, agenda = null, buscando = false;
    /* QUAL COORDENADA a busca no ar esta perguntando. O GPS vira este numero;
       resposta de geracao vencida e jogada fora em vez de virar grau na tela. */
    var geracao = 0;
    function agendarBusca(ms) { clearTimeout(agenda); agenda = setTimeout(buscar, ms); }

    function buscar() {
      if (!window.fetch || buscando) return;
      buscando = true;
      var minha = geracao;
      tentarTodas()
        .then(function (v) {
          if (minha !== geracao) return;
          /* a que respondeu vira a primeira da próxima vez */
          ordemFontes.sort(function (a, b) {
            return (b.nome === v.fonte) - (a.nome === v.fonte);
          });
          pintar(v.grau, v.cod, v.dia == null ? ehDia() : v.dia, v.fonte);
          falhas = 0;
          agendarBusca(RITMO_OK);
        })
        .catch(function () {
          if (minha !== geracao) return;
          falhas++;
          /* SÓ FALA SE NUNCA LEU NADA. Havendo uma leitura na tela, ela FICA: um valor
             de vinte minutos atrás é melhor que apagar o campo, e a hora do `title` diz
             de quando ele é. Número inventado é que não entra — o campo nasce em "--°"
             e continua assim até alguma fonte responder. */
          if (!ultima) {
            caixa.title = 'Nenhuma fonte de tempo respondeu. ' +
              'O local e a hora não dependem da internet.';
          }
          agendarBusca(Math.min(30000 * Math.pow(2, falhas - 1), RITMO_MAX));
        })
        .then(function () { if (minha === geracao) buscando = false; });
    }

    /* ---- passar a ler no lugar de quem está olhando ----
       Ver o bloco "O LOCAL DE VERDADE, PELO GPS" lá em cima: nada aqui pede permissão
       por conta própria, e o relógio não se mexe. */
    var elLocal = caixa.querySelector('#tempoLocal');

    function usarGPS() {
      elLocal.textContent = 'localizando…';
      return ondeEstou().then(function (p) {
        UNIDADE.lat = p.lat; UNIDADE.lon = p.lon;
        /* O GRAU QUE ESTÁ NA TELA É DE OUTRO LUGAR. Zerar `ultima` e apagar o número
           é o que impede o pior desfecho deste recurso: o rótulo trocar para a cidade
           nova enquanto o grau continua sendo o da antiga — tempo errado com etiqueta
           convincente. Volta para "--°" até a consulta nova responder. */
        ultima = null;
        elGrau.textContent = '--°';
        elT.classList.add('tempo--sem');
        /* E a busca que estiver NO AR agora responde pela coordenada velha. Sem virar
           a geração, ela chegaria depois e repintaria o grau do lugar antigo por cima
           do novo — o `buscando` sozinho só a faria ser ignorada na ida, não na volta. */
        geracao++;
        buscando = false;
        buscar();
        return nomeDoLugar(p.lat, p.lon).then(function (n) {
          UNIDADE.nome = n;
          elLocal.textContent = n;
          elLocal.classList.remove('pode-gps');
          elLocal.title = 'Pelo GPS · precisão de cerca de ' + p.prec + ' m';
          return n;
        }).catch(function () {
          /* Achou a coordenada e não achou o nome. O GRAU JÁ ESTÁ CERTO — foi buscado
             na coordenada —, então não se desfaz nada: só o rótulo cede, e diz a
             verdade sobre o que sabe. */
          UNIDADE.nome = 'sua localização';
          elLocal.textContent = UNIDADE.nome;
          elLocal.classList.remove('pode-gps');
          return null;
        });
      }).catch(function (e) {
        /* Negou, deu tempo esgotado ou o aparelho não tem GPS: volta a dizer a unidade,
           e o convite continua de pé. Nada foi trocado — a coordenada só muda DEPOIS
           de a posição chegar. */
        elLocal.textContent = UNIDADE.nome;
        elLocal.classList.add('pode-gps');
        return Promise.reject(e);
      });
    }

    function oferecerGPS() {
      elLocal.classList.add('pode-gps');
      elLocal.title = 'Tocar para usar a localização deste aparelho';
      elLocal.setAttribute('role', 'button');
      elLocal.setAttribute('tabindex', '0');
      elLocal.addEventListener('click', function () { usarGPS().catch(function () {}); });
      elLocal.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); usarGPS().catch(function () {});
        }
      });
    }

    if (GPS_LIGADO && navigator.geolocation) {
      /* `permissions.query` RESPONDE se já foi concedida sem pedir nada — é ele que
         permite usar o GPS de quem já disse sim sem abrir janela para quem não disse.
         Onde ele não existe, oferece o botão: é o caminho que nunca pede sozinho. */
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
          .then(function (st) {
            if (st.state === 'granted') usarGPS().catch(oferecerGPS);
            else oferecerGPS();
          })
          .catch(oferecerGPS);
      } else {
        oferecerGPS();
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) buscar();
    });
    window.addEventListener('online', buscar);
    pintarContaTopo();
    pausarEstrada();
    document.addEventListener('visibilitychange', pausarEstrada);
    agendarSaudacao();   /* a virada das 18h sem recarregar */
    buscar();   /* dali em diante quem reagenda é a própria cadeia */
    return caixa;
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
    pintarEstrada(botao.dataset.pagina);
  }

  /* ================= A ESTRADA DA LINHA DO TÍTULO =================
   *
   * VERDE PARA A DIREITA na saída, AZUL ESPELHADO no retorno. Não é enfeite: estas duas
   * telas são gêmeas — mesmos campos, mesmas travas, mesmo botão —, e a única coisa que
   * as distingue é o SENTIDO do movimento. Quem abre a errada percebe pela cor e pela
   * direção antes de ler o título, que é justamente o que ninguém lê com pressa.
   *
   * As duas cores não são escolha de estética: no sistema inteiro verde é saída e azul
   * é retorno, e o caminhão herda o significado que os cartões do painel já deram.
   *
   * SÓ NESSAS DUAS. Nas outras páginas a estrada sai da tela — uma faixa animada ao
   * lado de "Cadastros" não diria nada, e movimento que não informa é ruído. */
  var ESTRADAS = {
    pgSaida:     { volta: false, cor: 'var(--verde)', cheios: 4, diz: 'saindo' },
    pgDevolucao: { volta: true,  cor: 'var(--azul)',  cheios: 2, diz: 'voltando' }
  };

  function pintarEstrada(pagina) {
    var linha = document.querySelector('.cab-pagina__rota');
    if (!linha) return;
    var velha = linha.querySelector('.desenho');
    if (velha) velha.remove();
    var e = ESTRADAS[pagina];
    if (!e) return;
    var d = document.createElement('div');
    /* `aria-hidden`: o leitor de tela já leu o título, e "imagem" repetida a cada troca
       de página é ruído para quem depende dele. */
    /* AS DUAS CLASSES NA VOLTA, e não uma ou outra. Quem desenha o asfalto tracejado é
       o `::after` do `.desenho--pista`; o `.desenho--volta` sozinho só INVERTE a
       direção dele — e invertendo o nada dá nada. Posto como alternativa, o retorno
       ficava com o caminhão andando sobre estrada nenhuma. É assim que o painel
       sempre usou as duas: `desenho--pista desenho--volta`. */
    d.className = 'desenho desenho--titulo desenho--pista' +
      (e.volta ? ' desenho--volta' : '');
    d.setAttribute('aria-hidden', 'true');
    d.style.setProperty('--cor', e.cor);
    /* DOIS DE QUATRO no retorno, e quatro de quatro na saída: retorno quase nunca traz
       tudo de volta, e o desenho não deve prometer o contrário. */
    d.innerHTML = caminhao(e.cheios);
    linha.appendChild(d);
  }

  /* A ABA ESCONDIDA PARA A ESTRADA — bateria de aparelho de galpão. A classe LIGA a
     pausa; sem ela, anda. É a ordem certa: se este trecho nunca rodar, o desenho
     continua na tela em vez de sumir sem avisar. */
  function pausarEstrada() {
    var cab = document.querySelector('.cab-pagina');
    if (cab) cab.classList.toggle('parado', document.hidden);
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
  /* O CÍRCULO: a foto quando há, as iniciais quando não há.
   *
   * A foto entra como um `<img>` POR CIMA das letras, e não no lugar delas. Duas razões:
   * o `onerror` devolve as iniciais quando o endereço quebra — arquivo apagado do balde,
   * rede fora —, coisa que uma imagem de fundo não oferece; e o ponto de estado que mora
   * dentro do círculo continua desenhado por cima de tudo, pela regra de sempre.
   */
  function pintarCirculo(el, nome, foto) {
    if (!el) return;
    var letras = iniciais(nome);
    /* `insertBefore` em vez de `textContent`: o ponto de estado e a própria foto moram
       dentro deste elemento, e escrever o texto por cima apagaria os dois. */
    if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = letras;
    else el.insertBefore(document.createTextNode(letras), el.firstChild);

    var img = el.querySelector('.avatar__foto');
    if (!foto) { if (img) img.remove(); return; }
    if (!img) {
      img = document.createElement('img');
      img.className = 'avatar__foto';
      img.alt = '';                       // decorativo: o nome já está escrito ao lado
      img.addEventListener('error', function () { img.remove(); });
      el.appendChild(img);
    }
    if (img.getAttribute('src') !== foto) img.src = foto;
  }

  function quemEsta(nome, perfil, foto) {
    var n = document.getElementById('cabUsuario');
    if (n) n.textContent = nome || '—';
    var p = document.getElementById('cabPerfil');
    if (p) p.textContent = perfil || '';
    /* Os dois circulos: o da lateral e o da barra de app. O da barra e a UNICA pista de
       quem esta logado no celular com a gaveta fechada, e por isso ele leva o nome
       inteiro no `title` — duas letras identificam pouco quando ha dois Josés.

       `insertBefore` em vez de `textContent` no de cima: o ponto de estado mora dentro
       dele, e escrever o texto por cima apagaria o ponto junto. */
    /* A SAUDAÇÃO MORA NA LINHA DA SOBRANCELHA, e não na barra do app.
       Ela já esteve na barra de duas formas — escrevendo por cima do nome do sistema, e
       depois ao lado dele — e as duas obrigavam a escolher quem cortava quando faltasse
       largura. A linha da sobrancelha já existia e estava vazia do lado direito: o
       cabeçalho não cresceu um pixel, e ninguém disputa espaço com ninguém.

       O NOME INTEIRO, agora que cabe. Na barra só o primeiro cabia; aqui sobra linha, e
       o sobrenome é o que separa dois Josés no mesmo galpão. Cortando ainda assim,
       corta na ponta direita com reticências — e o `title` guarda o inteiro.

       A CONTRAPARTIDA É ASSUMIDA: esta linha rola e some. Para uma saudação está certo,
       porque se lê uma vez. Para "em qual unidade estou logado" NÃO serviria. */
    var ola = document.getElementById('olaUsuario');
    var olaN = document.getElementById('olaNome');
    if (ola && olaN) {
      olaN.textContent = nome ? String(nome).trim() : '—';
      ola.title = (nome || '') + (perfil ? ' · ' + perfil : '');
      /* Some enquanto não há nome: "Olá, —" durante o carregamento é pior do que a
         linha sem a saudação. */
      ola.hidden = !nome;
    }

    pintarCirculo(document.getElementById('avatarUsuario'), nome, foto);
    pintarContaTopo();
    var t = document.getElementById('avatarTopo');
    pintarCirculo(t, nome, foto);
    /* O de cima leva o nome inteiro no `title`: no celular com a gaveta fechada ele é a
       ÚNICA pista de quem está logado, e duas letras — ou um rosto pequeno — identificam
       pouco quando há dois Josés. */
    if (t) t.title = (nome || '—') + (perfil ? ' · ' + perfil : '');
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

  /* ESTA SESSAO ENTRA NO PAINEL? UMA funcao, e ela mora aqui.
     A regra existia DUAS vezes — a conta que mostra a porta no app de campo e a
     guarda do painel — e as duas cópias divergiam num ponto: com a chave
     `acessoPainel` em `false`, o app de campo deixava o ADMIN passar ("admin entra
     sempre") e o painel o recusava ("`acessoPainel === true`"). Resultado: a porta
     aparecia e levava à tela de entrada. Porta que não abre é pior que porta nenhuma.

     Morar no `app.js` também faz elas não poderem divergir POR CACHE: o `app.js`
     carrega com o hash do conteúdo no endereço, e o HTML não. Com a regra dentro de
     cada página, um `index.html` velho no celular decide por uma regra e o
     `admin.html` novo por outra — e a pessoa fica no meio.

     A ordem é a do servidor (`podeVerPainel`): o ADMIN entra sempre, senão o
     primeiro admin com a chave desligada ficaria trancado fora do próprio painel —
     inclusive da tela onde isso se conserta. */
  function podePainel(s) {
    if (!s) return false;
    /* O PAINEL ENTRA POR SENHA. O que o PIN protege é o lançamento, que fica
       registrado com nome e hora e pode ser corrigido. `via` ausente é sessão de
       antes da porta única, e essa passa: derrubar quem já estava logado no dia do
       deploy é pior, e o próximo login corrige. */
    if (s.via === 'pin') return false;
    if (String(s.perfil).toUpperCase() === 'ADMIN') return true;
    /* `acessoPainel` ausente é sessão de antes de a chave existir: vale a regra
       antiga, por perfil, para não tirar a porta de quem já a tinha. */
    if (s.acessoPainel === undefined) {
      return ['GALPAO', 'CONFERENTE'].indexOf(String(s.perfil).toUpperCase()) >= 0;
    }
    return s.acessoPainel === true;
  }

  /** TODO LANÇAMENTO TEM O BOTÃO. O que muda não é se ele aparece, é o que ele pede.
   *
   * Antes o botão só nascia para o autor e para o ADMIN — e quem precisava consertar o
   * lançamento de um colega que já foi embora não tinha nem por onde começar: a tela
   * não dizia "peça a senha", ela simplesmente não mostrava nada.
   *
   * Quem separa o conserto livre do conserto com senha é `correcaoLivre`, logo abaixo.
   *
   * Uma sessão é o único requisito: sem ela não há quem assine a correção, e o
   * histórico ficaria com um autor vazio.
   */
  function podeCorrigir(s, m) {
    return !!s && !!m;
  }

  /** O conserto sai de graça, ou vai pedir a senha do escritório?
   *
   * Livre é: o PRÓPRIO autor, dentro do prazo, no mesmo dia. Fora disso, senha.
   *
   * O PRAZO NÃO ESTÁ ESCRITO AQUI. Quem o calcula é o servidor, que manda `livreAte`
   * pronto em cada lançamento — os dez minutos escritos também no navegador seriam dois
   * números sobre a mesma regra, e no dia em que discordassem a tela ofereceria o
   * conserto livre para o servidor recusar em seguida. O "mesmo dia" vem embutido: fora
   * dele o servidor manda `livreAte` vazio.
   *
   * POR ID, e não por nome: dois "João" no cadastro e a comparação por nome daria a um
   * o prazo do outro.
   *
   * ISTO É A TELA, NÃO A TRANCA: a API não tem autorização, e quem manda um POST direto
   * escapa daqui — mas não escapa do servidor, que refaz esta mesma conta antes de
   * gravar. Aqui é para a pessoa saber o que vai acontecer antes de digitar.
   */
  function correcaoLivre(s, m, agora) {
    if (!s || !m || !m.livreAte) return false;
    if (!m.usuarioId || String(m.usuarioId) !== String(s.id)) return false;
    var limite = new Date(comoUTC(m.livreAte));
    if (isNaN(limite.getTime())) return false;
    return (agora || new Date()).getTime() < limite.getTime();
  }

  /**
   * JUNTA AS LINHAS DE UMA REMESSA SÓ.
   *
   * Um toque em Enviar com cinco tipos de caixa grava cinco linhas. A lista mostrava as
   * cinco, repetindo data, origem, destino e motorista em cada uma — cinco linhas para
   * uma carga, e no celular isso vira uma tabela que só se lê arrastando de lado.
   *
   * A chave é o `lote`, que o servidor calcula do `ClientKey` do envio. Aqui não se
   * adivinha nada: linhas com o mesmo lote vieram do mesmo toque.
   *
   * O TIPO DE CAIXA REPETIDO ABRE OUTRO GRUPO. Duas linhas de CX P no mesmo lote não são
   * um envio só — são dois envios que caíram na mesma chave (acontece com as linhas
   * antigas, sem `ClientKey`, gravadas no mesmo segundo). Somadas, virariam uma
   * quantidade que ninguém lançou; separadas, no máximo aparecem dois cartões onde a
   * pessoa esperava um.
   *
   * A ORDEM DE CHEGADA É MANTIDA: quem ordena é quem monta a lista, e reordenar aqui
   * faria a tela discordar do servidor sem nenhum motivo visível.
   */
  /** A chave que junta as linhas de uma remessa — e que a tela usa para achá-las de volta.
   *
   * Mora aqui porque é usada DUAS vezes: para agrupar, e para, a partir do cartão,
   * encontrar as linhas que ele representa. Escrita nos dois lugares, a linha sem `lote`
   * era agrupada por `id:M1` e procurada por `lote`, não achava nada, e o botão de ações
   * do cartão não abria — sem erro nenhum no console.
   */
  function chaveDoLote(m) {
    return (m && m.lote) || ('id:' + (m && m.id));
  }

  function agruparLancamentos(lista) {
    var grupos = [], porChave = {};
    (lista || []).forEach(function (m) {
      var chave = chaveDoLote(m);
      var g = porChave[chave];
      if (g && g.caixas[String(m.tipoCaixaId)]) {
        /* Já tem esta caixa: fecha o grupo para novas entradas e começa outro. A chave
           velha some do índice para o próximo item desta caixa não voltar para ele. */
        g = null;
      }
      if (!g) {
        g = {
          lote: chave, id: m.id, tipo: m.tipo, dataRef: m.dataRef, dataHora: m.dataHora,
          origem: m.origem, destino: m.destino, origemId: m.origemId,
          destinoId: m.destinoId, motorista: m.motorista, usuario: m.usuario,
          usuarioId: m.usuarioId, teste: m.teste, situacao: m.situacao,
          /* O prazo é da REMESSA: as linhas dela nascem do mesmo carimbo, então o
             `livreAte` é o mesmo em todas. Vindo da primeira, vale para o cartão. */
          livreAte: m.livreAte,
          obs: m.obs, romaneio: m.romaneio,
          itens: [], total: 0, alterado: null, caixas: {}
        };
        porChave[chave] = g;
        grupos.push(g);
      }
      g.caixas[String(m.tipoCaixaId)] = true;
      g.itens.push({
        id: m.id, tipoCaixa: m.tipoCaixa, tipoCaixaId: m.tipoCaixaId,
        qtd: Number(m.qtd) || 0, alterado: m.alterado || null
      });
      g.total += Number(m.qtd) || 0;
      /* A correção mais RECENTE do lote representa o cartão: corrigir um tipo de caixa
         corrige o lançamento aos olhos de quem olha, e o cartão é o lançamento. */
      var a = m.alterado;
      if (a && a.vezes && (!g.alterado || String(a.em) > String(g.alterado.em))) {
        g.alterado = a;
      }
    });
    return grupos;
  }

  /** Para onde esta sessao deve ir depois de autenticar.
   *
   * QUEM NÃO É ADMIN CAI NA OPERAÇÃO, sempre — a Saída, que é onde se lança. Antes
   * bastava ter a chave do painel para o login já abrir lá, e gerente, conferente e
   * promotor entravam num painel de números quando o que eles vêm fazer é registrar
   * caixa saindo e voltando. Cinco das treze pessoas cadastradas estavam nesse caso.
   *
   * Isto muda o DESTINO, não a permissão: quem tem o painel liberado continua com a
   * porta `▦ Painel` no alto da tela, e chega lá em um clique. O que deixa de
   * acontecer é ele ser o ponto de partida de quem não administra.
   *
   * O painel continua exigindo a SENHA, e não o PIN — ver `podePainel()`. */
  function destinoDa(s) {
    if (!s || s.via !== 'senha') return 'index.html';
    if (String(s.perfil).toUpperCase() !== 'ADMIN') return 'index.html';
    return podePainel(s) ? 'admin.html' : 'index.html';
  }

  /**
   * @param aqui   'campo' | 'painel' — qual app está servindo esta tela
   * @param abrir  função que abre o app desta página, já com a sessão gravada
   * @param aviso  por que a pessoa está vendo esta tela, quando ela FOI MANDADA
   *               para cá. Opcional, e vazio na visita normal.
   *
   * O `aviso` existe porque a recusa era MUDA: quem tinha o painel liberado clicava
   * na porta, via a tela de entrada aparecer e não tinha como saber o que houve —
   * parecia defeito, e o cadastro estava certo o tempo todo. Tela que recusa sem
   * dizer o motivo manda a pessoa procurar o problema no lugar errado.
   */
  function portaUnica(aqui, abrir, aviso) {
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

    /* O OLHO VOLTOU, e agora é só um.
       Ele tinha saído porque o campo ficava com DOIS: o do app e o que o Edge desenha
       sozinho em `input type=password`. A conclusão da época foi ficar com o do
       navegador — e o erro estava aí: o Chrome não desenha nenhum, e quem entra por ele
       digitava seis números às cegas, com "usuário ou senha incorretos" como única
       resposta. Agora o do navegador é calado pela folha de estilo (`::-ms-reveal`) e
       fica o do app, igual em todo lugar.

       TODOS os campos de senha desta tela, e não só o da entrada: a de trocar pede a
       senha nova DUAS vezes, e conferir duas digitações às cegas é justamente onde a
       pessoa trava no primeiro acesso. */
    olhosDeSenha(document);
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
    /* Por que a pessoa foi mandada para cá. Vem DEPOIS da guarda da API acima: se a
       configuração está faltando, esse é o problema maior e é ele que tem de aparecer. */
    if (aviso) mostrarErro(aviso);

    // A lista de usuarios nao aparece aqui: ela mostrava o nome de toda a equipe a
    // quem so abrisse o endereco. O aparelho guarda o ultimo nome, entao na pratica
    // ninguem redigita.
    var ultimo = localStorage.getItem('qdc_ultimo_usuario');
    if (ultimo) $('inUsuario').value = ultimo;
    (ultimo ? campo : $('inUsuario')).focus();
  }

  /**
   * O TÍTULO DO MÓDULO SOME COM OS ITENS DELE.
   *
   * A navegação é separada em Operação / Dados / Sistema, e as duas telas escondem
   * itens conforme a permissão de quem entrou. Sem isto, quem não pode ver nenhuma
   * página de um módulo ainda lia o cabeçalho dele — um título anunciando uma seção
   * vazia, que é a forma mais crua de mentir sobre o que a pessoa pode fazer.
   *
   * Mora AQUI e não em cada tela porque as duas peneiram do mesmo jeito, e duas
   * cópias divergem no primeiro conserto que só uma recebe.
   *
   * Lê o `display` computado, e não o atributo: o `admin.html` esconde com
   * `style.display='none'` e o `index.html` também — mas um terceiro caminho
   * (`hidden`, uma classe) passaria despercebido por uma checagem de atributo.
   */
  function gruposDaNavegacao(seletor) {
    var nav = document.querySelector(seletor || '#abas');
    if (!nav) return;
    var vivos = {};
    nav.querySelectorAll('button[data-grupo]').forEach(function (b) {
      if (getComputedStyle(b).display !== 'none') vivos[b.dataset.grupo] = true;
    });
    nav.querySelectorAll('.nav-grupo').forEach(function (t) {
      t.style.display = vivos[t.dataset.grupo] ? '' : 'none';
    });
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
    function noCorte() {
      if (mqLargo.matches) fecharGaveta(false);
      /* A espiada é coisa de mouse: descendo para a gaveta ela não faz sentido, e
         deixada acesa a lateral abriria sozinha ao voltar para o desktop. */
      barra.classList.remove('espiando');
    }
    if (mqLargo.addEventListener) mqLargo.addEventListener('change', noCorte);
    else if (mqLargo.addListener) mqLargo.addListener(noCorte);

    trilho(barra);
  }

  /* ---------------- o trilho: a lateral recolhida ----------------
     Acima de 1024px a lateral pode virar um trilho de ícones. São DOIS caminhos, e
     eles convivem:

       · CLIQUE  — no botão do topo, ou em qualquer área vazia da lateral. É decisão:
                   troca o modo e FICA, inclusive depois de recarregar.
       · ESPIADA — o mouse parado sobre o trilho por 140ms. É temporária: sai o
                   cursor, volta ao trilho.

     Por que a espiada não é `:hover` puro no CSS: (1) sem o atraso a lateral pisca a
     cada vez que o cursor atravessa a tela a caminho de outra coisa; (2) ao fechar
     pelo clique com o cursor ainda em cima, o `:hover` reabriria na mesma hora e
     pareceria que o clique não funcionou. */
  var CHAVE_TRILHO = 'qdc_lateral_v1';

  function trilho(barra) {
    var shell = document.getElementById('app');
    var btn = document.getElementById('btnLateral');
    if (!shell || !barra) return;

    var tEspiada = null;
    var espiadaLiberada = true;   // trava enquanto o cursor não sair

    function aplicar(modo) {
      shell.dataset.nav = modo;
      var recolhida = modo === 'trilho';
      if (btn) {
        btn.setAttribute('aria-pressed', String(recolhida));
        btn.setAttribute('aria-label', recolhida ? 'Abrir o menu' : 'Recolher o menu');
      }
    }

    function alternar() {
      var novo = shell.dataset.nav === 'trilho' ? 'expandida' : 'trilho';
      aplicar(novo);
      try { localStorage.setItem(CHAVE_TRILHO, novo); } catch (e) {}
      barra.classList.remove('espiando');
      clearTimeout(tEspiada);
      // Fechou com o cursor em cima: a espiada fica travada até ele sair.
      if (novo === 'trilho') espiadaLiberada = false;
    }

    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      alternar();
    });

    function espiar(ligar) {
      if (!mqLargo.matches) return;
      if (ligar && (!espiadaLiberada || shell.dataset.nav !== 'trilho')) return;
      barra.classList.toggle('espiando', ligar);
    }

    barra.addEventListener('pointerenter', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;   // o dedo não espia
      clearTimeout(tEspiada);
      tEspiada = setTimeout(function () { espiar(true); }, 140);
    });
    barra.addEventListener('pointerleave', function () {
      clearTimeout(tEspiada);
      espiadaLiberada = true;
      espiar(false);
    });

    /* Clicar em área VAZIA da lateral também alterna. Botão, link e campo continuam
       fazendo o trabalho deles: o clique só alterna quando não caiu em nada clicável —
       senão escolher uma página fecharia o menu junto. */
    barra.addEventListener('click', function (e) {
      if (!mqLargo.matches) return;          // no celular quem manda é a gaveta
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      alternar();
    });

    /* Recolher é PREFERÊNCIA de quem olha, como a ordem das colunas: uma tela por
       pessoa, no aparelho dela. Guardado aqui e não no cadastro porque não é
       permissão — e porque no galpão o mesmo usuário abre em telas de tamanhos
       diferentes, e cada uma quer a sua. */
    var guardado = null;
    try { guardado = localStorage.getItem(CHAVE_TRILHO); } catch (e) {}
    aplicar(guardado === 'trilho' ? 'trilho' : 'expandida');
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

  /* ==================== O OLHO DE VER A SENHA ====================
   *
   * ELE JÁ EXISTIU E FOI TIRADO. A razão da época: o Edge desenha um olho SEU em todo
   * `input type=password`, e dois controles com a mesma função lado a lado parecem
   * defeito. A conclusão foi deixar só o do navegador, "onde o navegador o oferecer".
   *
   * O erro estava nesse "onde": o Chrome não oferece nenhum. Quem entra por ele digita
   * seis números às cegas, erra, e a única resposta é "usuário ou senha incorretos" —
   * sem jeito de conferir o que escreveu. No galpão, de luva, isso é o normal.
   *
   * Agora o olho é do app, e o do navegador é calado pela folha de estilo
   * (`::-ms-reveal`). Um controle só, em todo navegador — que era a intenção da decisão
   * antiga, e não o que ela conseguiu.
   *
   * NASCE SEMPRE OCULTO, a cada desenho: senha revelada que sobrevive a uma troca de
   * tela acaba aberta nas costas de quem foi buscar café.
   */
  function olhoDeSenha(input) {
    if (!input || input.dataset.olho) return;
    input.dataset.olho = '1';

    var cx = document.createElement('span');
    cx.className = 'com-olho';
    input.parentNode.insertBefore(cx, input);
    cx.appendChild(input);

    var b = document.createElement('button');
    b.type = 'button';                    // dentro de um formulário, o padrão é enviar
    b.className = 'olho';
    b.tabIndex = -1;                      /* Fora da ordem do Tab: quem navega pelo
                                             teclado vai do campo para "Entrar", e uma
                                             parada no meio para um enfeite atrapalha
                                             mais do que ajuda. */
    function pintar() {
      var ver = input.type === 'text';
      b.setAttribute('aria-pressed', ver ? 'true' : 'false');
      b.setAttribute('aria-label', ver ? 'Ocultar a senha' : 'Mostrar a senha');
      b.title = b.getAttribute('aria-label');
      b.innerHTML = ver ? OLHO_FECHADO : OLHO_ABERTO;
    }
    b.addEventListener('click', function () {
      /* O FOCO E O CURSOR VOLTAM para onde estavam. Sem isto, tocar no olho no meio da
         digitação joga o cursor para o fim do campo — e quem estava corrigindo o
         terceiro número escreve o resto no lugar errado. */
      var i = input.selectionStart, f = input.selectionEnd;
      input.type = input.type === 'password' ? 'text' : 'password';
      pintar();
      input.focus();
      try { input.setSelectionRange(i, f); } catch (e) {}
    });
    pintar();
    cx.appendChild(b);
  }

  var OLHO_ABERTO =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"></path>' +
    '<circle cx="12" cy="12" r="3"></circle></svg>';
  var OLHO_FECHADO =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6">' +
    '</path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>' +
    '<line x1="3" y1="3" x2="21" y2="21"></line></svg>';

  /** Põe o olho em TODOS os campos de senha de um pedaço da tela, de uma vez. */
  function olhosDeSenha(raiz) {
    (raiz || document).querySelectorAll('input[type="password"]').forEach(olhoDeSenha);
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
    hojeOperacao: hojeOperacao, FUSO_OPERACAO: FUSO_OPERACAO,
    UNIDADE: UNIDADE, relogioETempo: relogioETempo, caminhao: caminhao,
    ondeEstou: ondeEstou, nomeDoLugar: nomeDoLugar,
    saudacaoDe: saudacaoDe, pintarSaudacao: pintarSaudacao,
    horaBR: horaBR, dataDoCarimboBR: dataDoCarimboBR, dataHoraBR: dataHoraBR,
    toast: toast, abas: abas, gaveta: gaveta, fecharGaveta: fecharGaveta,
    portaUnica: portaUnica, destinoDa: destinoDa, podePainel: podePainel,
    podeCorrigir: podeCorrigir, correcaoLivre: correcaoLivre,
    agruparLancamentos: agruparLancamentos, chaveDoLote: chaveDoLote,
    gruposDaNavegacao: gruposDaNavegacao,
    quemEsta: quemEsta, iniciais: iniciais, pintarCirculo: pintarCirculo,
    olhoDeSenha: olhoDeSenha, olhosDeSenha: olhosDeSenha,
    barraAging: barraAging, assinatura: assinatura,
    comprimirFoto: comprimirFoto, csv: csv, atualizarBadge: atualizarBadge
  };
})();
