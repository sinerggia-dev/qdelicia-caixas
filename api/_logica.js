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
 *   tipoCaixa { ID, Nome, Ativo:bool, Kg:number|'' }
 *   usuario   { ID, Nome, Perfil, PIN, Telefone, LocalPadrao, Ativo:bool, Email, Usuario, SenhaHash }
 *   motorista { ID, Nome, Telefone, CPF, CNH, CNHCategoria, CNHValidade, Placa, Obs, Ativo:bool }
 *   movimento { ID, ClientKey, DataHora:Date, DataRef:Date, Tipo, OrigemID, DestinoID, TipoCaixaID,
 *               Qtd:number, QtdConferida:number|null, Status, Romaneio, UsuarioID, Perfil, Obs,
 *               AssinaturaURL, FotoURL, ConferidoEm, ConferidoPor, Cancelado:bool, MotivoCancel,
 *               Motorista, Rota, Historico:[] }
 */
'use strict';

var TIPOS_MOV = ['SAIDA', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'AJUSTE'];
/* GALPAO ficou como apelido antigo de CONFERENTE: a migração troca as linhas do banco,
   mas uma sessão guardada no celular pode continuar dizendo GALPAO por dias. */
var PERFIS = ['Admin', 'Gestor', 'Gerente', 'Conferente', 'Motorista', 'Promotor'];
/* Guardado em MAIÚSCULA porque a comparação é que precisa ser insensível a caixa, não o
   que se mostra na tela. Quem lê perfil escrito nunca compara direto: usa podeConferir(). */
var CONFEREM = ['ADMIN', 'CONFERENTE', 'GALPAO'];

/**
 * Perfil escrito à mão vira MAIÚSCULA sem espaço sobrando — "Supervisor " e "supervisor"
 * precisam ser a mesma coisa, senão a lista de sugestões se enche de gráfias do mesmo cargo.
 */
/* Conectores ficam em minúscula: "Supervisor de Área" se lê como nome de cargo, e
   "Supervisor De Área" se lê como erro. */
var MIUDAS = ['de', 'da', 'do', 'das', 'dos', 'e'];
function normalizarPerfil(v) {
  var s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!s) return '';
  return s.split(' ').map(function (p, i) {
    var b = p.toLowerCase();
    if (i > 0 && MIUDAS.indexOf(b) >= 0) return b;
    return b.charAt(0).toUpperCase() + b.slice(1);
  }).join(' ');
}

/**
 * O que o formulário oferece: os perfis de fábrica mais os que alguém já escreveu. Um perfil
 * novo nasce **sem poder nenhum** — não cadastra e não confere, e a devolução dele espera
 * conferência. É de propósito: permissão por digitação seria permissão por engano de digitação.
 */
function perfisConhecidos(usuarios) {
  var vistos = {};
  PERFIS.forEach(function (p) { vistos[p] = true; });
  (usuarios || []).forEach(function (u) {
    var p = normalizarPerfil(u.Perfil);
    if (p) vistos[p] = true;
  });
  return Object.keys(vistos).sort(function (a, b) {
    // Os de fábrica primeiro, na ordem em que foram pensados; os escritos depois, em ordem.
    var ia = PERFIS.indexOf(a), ib = PERFIS.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}

/** Quem confere devolução no galpão. */
function podeConferir(perfil) {
  return CONFEREM.indexOf(String(perfil || '').toUpperCase()) >= 0;
}
// A rota é o caminhão em circulação: guarda caixa como qualquer outro local, e é isso que
// impede o que subiu no caminhão e não foi entregue de sumir na conta do cliente.
var TIPOS_LOCAL = ['GALPAO', 'FILIAL', 'CLIENTE', 'ROTA', 'FORNECEDOR'];

/**
 * Nome que a equipe lê nas listas: "Caixa Banana · 20 kg".
 * O peso entra no rótulo porque é o que separa duas caixas de mesmo nome no seletor,
 * na hora da conferência, quando a contagem precisa ser exata.
 */
/**
 * Só o necessário para o celular montar a lista de escolha. CPF, CNH e telefone ficam
 * de fora: a rota `dados` é pública, e documento de motorista não tem por que trafegar
 * para quem só abriu o endereço do app.
 */
function motoristasPublicos(motoristas) {
  return (motoristas || [])
    .filter(function (m) { return m.Ativo !== false; })
    // A rota atendida entra: não é dado pessoal, e é o que deixa o celular filtrar a lista
    // sem uma segunda chamada. CPF, CNH e telefone continuam de fora.
    .map(function (m) {
      return { ID: m.ID, Nome: m.Nome, Tipo: m.Tipo || '',
               Rotas: Array.isArray(m.Rotas) ? m.Rotas : [] };
    })
    .sort(function (a, b) {
      return pesoTeste(a.Nome) - pesoTeste(b.Nome) ||
             String(a.Nome).localeCompare(String(b.Nome), 'pt-BR');
    });
}

/**
 * Motoristas que atendem uma rota.
 *
 * Sem rota escolhida, todos. Com rota, quem estiver atribuído a ela **mais** quem não
 * tem rota nenhuma marcada — lista vazia quer dizer "serve qualquer uma", a mesma regra
 * de `locaisPermitidos`. É o que faz o cadastro antigo continuar funcionando: ninguém
 * some da tela no dia em que a coluna nasce.
 *
 * Se a rota escolhida não tiver ninguém atribuído, devolve todos: melhor oferecer a lista
 * inteira do que travar a saída porque faltou um cadastro.
 */
/** Volante roda qualquer rota; é o que a palavra quer dizer. */
function ehVolante(m) {
  return String((m && m.Tipo) || '').trim().toUpperCase() === 'VOLANTE';
}

function motoristasDaRota(motoristas, rotaId) {
  var todos = motoristas || [];
  if (!rotaId) return todos;
  var alvo = String(rotaId);
  var atribuidos = todos.filter(function (m) {
    var r = Array.isArray(m.Rotas) ? m.Rotas : [];
    return r.length && r.map(String).indexOf(alvo) >= 0;
  });
  // Volante entra sempre; e quem não tem rota marcada também, que é a regra antiga —
  // sem ela, os onze motoristas já cadastrados sumiriam no dia em que a coluna nasceu.
  var curinga = todos.filter(function (m) {
    return atribuidos.indexOf(m) < 0 &&
           (ehVolante(m) || !(Array.isArray(m.Rotas) && m.Rotas.length));
  });
  if (!atribuidos.length && !curinga.length) return todos;
  return atribuidos.concat(curinga);
}

/** CNH vencida é impedimento real de rodar — o painel marca, não bloqueia. */
function cnhVencida(m, hoje) {
  if (!m || !m.CNHValidade) return false;
  return data(m.CNHValidade) < (hoje || new Date());
}

function mapaTipos(tipos) {
  var m = {};
  (tipos || []).forEach(function (t) { m[String(t.ID)] = rotuloTipo(t); });
  return m;
}

function rotuloTipo(t) {
  if (!t) return '';
  var s = String(t.Nome || '');
  if (t.Kg !== '' && t.Kg !== null && t.Kg !== undefined && Number(t.Kg) > 0) {
    s += ' · ' + String(Number(t.Kg)).replace('.', ',') + ' kg';
  }
  return s;
}

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

/**
 * Ativo chega booleano do Postgres, mas o formulário manda 'SIM'/'NAO'. Normaliza os dois.
 * O navegador tem a sua cópia em app.js — este arquivo não importa nada, de propósito.
 */
function ativo(v) {
  if (v === false || v === 0) return false;
  var s = String(v === undefined || v === null ? '' : v).trim().toUpperCase();
  return !(s === 'NAO' || s === 'NÃO' || s === 'FALSE' || s === 'N' || s === '0');
}

/** Movimentos que valem: cancelado não conta para nada. */
function ativos(movimentos) {
  return movimentos.filter(function (m) { return !m.Cancelado; });
}

/* `naoCancelados` é o mesmo que `ativos`. Ficou como apelido porque o ciclo da carga e a
   lista de Movimentos o nomeiam, e o nome diz o que eles querem: a peneira do cancelado,
   sem promessa nenhuma sobre ensaio. */
var naoCancelados = ativos;

/* Lançamento de teste é o de quem tem "teste" no perfil — decisão do usuário: o perfil é
   texto livre, então "Teste", "Motorista Teste" e "Conferente de teste" entram todos, sem
   precisar de uma chave separada no cadastro para manter em dia.

   Ele CONTA em tudo, como qualquer outro: saldo, aging, painel, extrato. A separação é um
   filtro de leitura, não uma exclusão. `Teste` do movimento é o que o servidor gravou no
   lançamento; o perfil guardado na linha cobre o que veio antes desta coluna existir. */
function temTeste(v) {
  return /teste/i.test(String(v == null ? '' : v));
}

/* O mesmo teste com o nome do que ele responde em cada lugar: no perfil, "é de teste?";
   num nome de local ou de caixa, a mesma pergunta. */
var ehPerfilTeste = temTeste;

/* Peso de ordenação: 0 para o que é real, 1 para o que é ensaio. Entra como PRIMEIRA
   chave de toda ordenação, então o ensaio afunda para o fim sem bagunçar a ordem de
   dentro de cada grupo. */
function pesoTeste(v) { return temTeste(v) ? 1 : 0; }

function lancamentoDeTeste(m) {
  return m.Teste === true || ehPerfilTeste(m.Perfil);
}

/* Recorte para os painéis: 'todos' (padrão), 'reais' ou 'teste'. Devolve uma cópia rasa
   com os movimentos peneirados — assim `painel()` e companhia não precisam saber que o
   recorte existe. */
function recorteTeste(dados, modo) {
  var m = String(modo || 'todos');
  if (m !== 'reais' && m !== 'teste') return dados;
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (x) {
    return m === 'teste' ? lancamentoDeTeste(x) : !lancamentoDeTeste(x);
  });
  return copia;
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
var ERRO_PIN = 'Nome ou senha incorretos.';

function normal(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/**
 * Quem entra no painel do escritório.
 *
 * Antes era consequência do perfil: ADMIN e GALPAO entravam, e não havia como separar o
 * conferente que precisa ver os números do que só lança no galpão. Agora é uma chave por
 * pessoa. ADMIN fica sempre de fora da chave — senão dá para trancar o último
 * administrador do lado de fora, e a volta seria por SQL no banco.
 */
function podeVerPainel(u) {
  if (!u || u.Ativo === false) return false;
  if (String(u.Perfil).toUpperCase() === 'ADMIN') return true;
  return u.AcessoPainel === true;
}

/**
 * De onde e para onde esta pessoa pode lançar.
 *
 * Lista vazia quer dizer **todos**, e não "nenhum". É o que faz o cadastro antigo continuar
 * funcionando sem ninguém mexer em nada: só quem for restringido de propósito passa a ver
 * menos. O contrário trancaria a operação inteira no dia do deploy.
 */
function locaisPermitidos(ids, locais) {
  var lista = Array.isArray(ids) ? ids : [];
  if (!lista.length) return locais;
  var querido = {};
  lista.forEach(function (id) { querido[String(id)] = true; });
  return locais.filter(function (l) { return querido[String(l.ID)]; });
}

function sessaoDe(u) {
  return {
    id: u.ID, nome: u.Nome, perfil: normalizarPerfil(u.Perfil),
    localPadrao: u.LocalPadrao, acessoPainel: podeVerPainel(u),
    saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
    destinos: Array.isArray(u.Destinos) ? u.Destinos : [],
    // Mesma convenção das outras duas: lista vazia quer dizer TODOS. Inverter isso
    // deixaria toda a operação sem tipo de caixa no dia do deploy.
    tiposCaixa: Array.isArray(u.TiposCaixa) ? u.TiposCaixa : [],
    motoristas: Array.isArray(u.Motoristas) ? u.Motoristas : []
  };
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
  // Senha que o admin definiu: a pessoa entra, mas a tela pede a troca antes de seguir.
  return { ok: true, usuario: sessaoDe(u), trocarSenha: u.SenhaProvisoria === true };
}

/** Login do campo: nome digitado + PIN curto. Sem lista de usuários na tela. */
function loginPorPin(usuarios, ident, pin) {
  var u = acharPorIdentificador(usuarios, ident);
  if (!u) return { ok: false, erro: ERRO_PIN };
  var informado = String(pin == null ? '' : pin).trim();
  if (!informado || String(u.PIN || '').trim() !== informado) return { ok: false, erro: ERRO_PIN };
  return { ok: true, usuario: sessaoDe(u), trocarSenha: u.PinProvisorio === true };
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

  var perfil = String(p.perfil || '');   // podeConferir() cuida da caixa
  // A regra central: contagem feita no cliente não baixa saldo sozinha.
  var status = String(p.status || '').toUpperCase();
  if (!status) {
    // Invertido de propósito: em vez de listar quem gera AGUARDANDO, pergunta quem pode
    // conferir. Dá no mesmo para os perfis antigos, e perfil novo entra pelo lado seguro —
    // esquecer de acrescentar alguém aqui passa a significar "a contagem dele espera
    // conferência", e não "a contagem dele baixa saldo sozinha".
    /* A etapa de conferência saiu da operação: o app de campo não tem mais a aba, e
       ela era o único lugar onde uma devolução era confirmada. Deixar nascer AGUARDANDO
       sem ninguém para confirmar travaria a caixa na conta do cliente para sempre. */
    status = 'CONFIRMADO';
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
      Motorista: String(p.motorista || '').trim() || null,
      Rota: String(p.rota || '').trim() || null,
      AssinaturaURL: ctx.assinaturaUrl || null,
      FotoURL: ctx.fotoUrl || null,
      ConferidoEm: status === 'CONFIRMADO' ? agora : null,
      ConferidoPor: status === 'CONFIRMADO' ? (String(p.usuarioId || '') || null) : null,
      Cancelado: false,
      MotivoCancel: null,
      /* Vem de ctx, que o servidor lê do cadastro do usuário — nunca do payload. Se
         viesse do celular, um pedido adulterado marcaria lançamento real como teste e
         ele sumiria do saldo sem deixar rastro. */
      Teste: ctx.teste === true
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
  { campo: 'Obs', rotulo: 'observação' },
  /* `mapa` faz o histórico guardar o NOME e não o id: uma linha dizendo
     "quem lançou: de U003 para U007" não serve para ninguém conferir nada. */
  { campo: 'UsuarioID', rotulo: 'quem lançou', mapa: true }
];

/* `nomes` é opcional: mapa de id para nome, usado só nos campos marcados com `mapa`.
   Quem chamava com três argumentos continua funcionando — cai no valor cru. */
function montarCorrecao(mov, p, agora, nomes) {
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
    function legivel(v) {
      if (c.data) return soData(v);
      if (v === null || v === undefined) return '';
      return c.mapa && nomes ? nome(nomes, v) : String(v);
    }
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: c.rotulo, motivo: motivo,
      de: legivel(velho), para: legivel(novo)
    });
  });

  if (!entradas.length) return { ok: false, erro: 'Nada mudou.' };
  return { ok: true, patch: patch, historico: (mov.Historico || []).concat(entradas), entradas: entradas };
}

/* ============================ saldos ============================ */

/** Quantidade que conta no saldo: a conferida manda; devolução aguardando não abate nada. */
function efetiva(m) {
  /* Sem a etapa de conferência, uma devolução vale desde que é lançada. Linhas antigas
     que ficaram em AGUARDANDO passam a contar também — do contrário ficariam valendo
     zero eternamente, sem nenhuma tela capaz de confirmá-las. */
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
  /* Vazio de propósito. A etapa de conferência saiu, e agora toda devolução já conta no
     saldo. Continuar listando as linhas antigas em AGUARDANDO diria que elas estão
     paradas esperando algo — enquanto já entraram na conta. Duas telas contando a mesma
     caixa de formas opostas é pior do que não ter a informação. */
  return {};
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
  var mLocais = mapaNomes(locais), mTipos = mapaTipos(tipos);
  return ativos(movimentos)
    /* Nada fica pendente: a etapa de conferência saiu e toda devolução já conta no saldo.
       O filtro impossível fica no lugar do `return []` para a função continuar devolvendo
       linhas com a mesma forma, caso a etapa volte um dia. */
    .filter(function () { return false; })
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

/**
 * Estado de cada remessa: ela já voltou?
 *
 * Não há vínculo no banco entre uma devolução e a saída que a originou — a devolução diz
 * de ONDE vem, não a QUAL carga pertence. Então vale a mesma premissa do aging: dentro de
 * um mesmo local e tipo de caixa, o que volta abate as remessas MAIS ANTIGAS primeiro.
 * É a leitura natural da operação (a caixa parada há mais tempo é a que não voltou) e já
 * é a regra com que o painel calcula idade — duas contas com premissas diferentes na
 * mesma tela dariam respostas que não fecham entre si.
 *
 * Devolução ainda não conferida vale 0 em `efetiva`, então não abate nada: enquanto o
 * galpão não confere, a remessa continua "Enviada". É o mesmo critério do saldo.
 */
function cicloDaCarga(movimentos) {
  var lotes = {};      // local|caixa -> [{id, resta}]
  var devolvido = {};  // id da saída -> quanto já voltou
  var total = {};      // id da saída -> tamanho da remessa

  /* O ensaio entra na chave: sem isso uma devolução de teste quitaria uma remessa real,
     e a coluna Status passaria a mentir sobre carga que nunca voltou. */
  function chaveDestino(m) {
    return String(m.DestinoID) + '|' + String(m.TipoCaixaID) + '|' + (lancamentoDeTeste(m) ? 'T' : 'R');
  }
  function chaveOrigem(m) {
    return String(m.OrigemID) + '|' + String(m.TipoCaixaID) + '|' + (lancamentoDeTeste(m) ? 'T' : 'R');
  }

  naoCancelados(movimentos).slice().sort(function (a, b) {
    if (a.DataRef > b.DataRef) return 1;
    if (a.DataRef < b.DataRef) return -1;
    return a.DataHora > b.DataHora ? 1 : -1;
  }).forEach(function (m) {
    var q = efetiva(m);
    if (!q) return;
    if (m.Tipo === 'SAIDA' || m.Tipo === 'TRANSFERENCIA') {
      if (!m.DestinoID) return;
      var k = chaveDestino(m);
      lotes[k] = lotes[k] || [];
      lotes[k].push({ id: m.ID, resta: q });
      total[m.ID] = q;
      devolvido[m.ID] = 0;
    } else if (m.Tipo === 'DEVOLUCAO') {
      if (!m.OrigemID) return;
      var fila = lotes[chaveOrigem(m)] || [];
      var sobra = q;
      for (var i = 0; i < fila.length && sobra > 0; i++) {
        if (fila[i].resta <= 0) continue;
        var usa = fila[i].resta < sobra ? fila[i].resta : sobra;
        fila[i].resta -= usa;
        sobra -= usa;
        devolvido[fila[i].id] += usa;
      }
      // sobra > 0 quer dizer que voltou mais do que saiu por aqui — saldo antigo, de antes
      // do sistema. Não há lote para abater e o excedente simplesmente não encontra dono.
    }
  });

  var estado = {};
  Object.keys(total).forEach(function (id) {
    var t = total[id], d = devolvido[id] || 0;
    estado[id] = { total: t, devolvido: d, cheio: d >= t, parcial: d > 0 && d < t };
  });
  return estado;
}

/** Uma coluna só no lugar de Tipo + Status: o que a linha é E em que pé está. */
function rotuloCiclo(m, e) {
  if (m.Tipo === 'DEVOLUCAO') return 'Devolvida';
  if (m.Tipo === 'PERDA') return 'Perda';
  if (m.Tipo === 'AJUSTE') return 'Ajuste';
  if (e && e.cheio) return 'Devolvida';
  if (e && e.parcial) return 'Parcial';
  return m.Tipo === 'TRANSFERENCIA' ? 'Transferida' : 'Enviada';
}

function listaMovimentos(movimentos, locais, tipos, usuarios, p) {
  p = p || {};
  var mLocais = mapaNomes(locais), mTipos = mapaTipos(tipos), mUsers = mapaNomes(usuarios);
  var de = p.de ? data(p.de) : null;
  var ate = p.ate ? fimDoDia(data(p.ate)) : null;
  var limite = Number(p.limit || 400);
  // Calculado sobre TODOS os movimentos, antes do filtro e do corte: uma devolução de
  // fora da janela filtrada ainda abate a remessa dela, e ignorá-la faria uma carga já
  // devolvida aparecer como "Enviada" só porque o filtro cortou a devolução.
  var ciclo = cicloDaCarga(movimentos);

  /* 'todos' é o padrão porque o ensaio agora conta em tudo: esconder por omissão faria a
     tela mostrar menos do que o saldo soma. 'reais' e 'teste' separam quando se quer. */
  var recorte = String(p.teste || 'todos');

  return naoCancelados(movimentos).filter(function (m) {
    if (recorte === 'reais' && lancamentoDeTeste(m)) return false;
    if (recorte === 'teste' && !lancamentoDeTeste(m)) return false;
    if (de && m.DataRef < de) return false;
    if (ate && m.DataRef > ate) return false;
    if (p.local && String(m.OrigemID) !== String(p.local) && String(m.DestinoID) !== String(p.local)) return false;
    if (p.tipo && m.Tipo !== String(p.tipo).toUpperCase()) return false;
    // Aqui e nao no navegador: o corte de 500 linhas vem DEPOIS deste filtro, entao
    // filtrar na tela mostraria so os lancamentos da pessoa que couberam nas 500.
    if (p.usuario && String(m.UsuarioID) !== String(p.usuario)) return false;
    return true;
  }).sort(function (a, b) {
    // O ensaio desce para o fim; dentro de cada grupo a data continua mandando.
    var d = (lancamentoDeTeste(a) ? 1 : 0) - (lancamentoDeTeste(b) ? 1 : 0);
    if (d) return d;
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
      teste: lancamentoDeTeste(m),
      situacao: rotuloCiclo(m, ciclo[m.ID]),
      devolvido: ciclo[m.ID] ? ciclo[m.ID].devolvido : null,
      motorista: m.Motorista || '', rota: m.Rota || '',
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL,
      historico: m.Historico || []
    };
  });
}

/* ============================ painel ============================ */

/**
 * Fluxo do período por quem segura a caixa: quanto saiu para ele, quanto voltou dele e o
 * buraco entre as duas pontas.
 *
 * NÃO é o saldo do razão, e a diferença é o motivo deste painel existir. `saldos()` soma
 * desde o primeiro lançamento; aqui se olha só a janela pedida. Um cliente pode estar com
 * 300 caixas de meses atrás (saldo alto) e ter devolvido tudo o que levou neste mês
 * (fluxo zerado) — e o contrário também. São duas perguntas diferentes: "quanto ele tem
 * nosso?" e "ele está devolvendo o que leva?". Somar as duas responde nenhuma.
 *
 * A leitura é da casa para fora, que é como a operação fala: SAÍDA é o que chegou nele
 * (ele é o destino do movimento) e RETORNO é o que ele mandou de volta (ele é a origem).
 */
var DESVIO_RUIM = 40;   // acima disso a linha fica vermelha: falta mais de 40% do que saiu

/**
 * Mesma aritmética do fluxo, mas agrupada por GENTE em vez de por local.
 *
 * Duas visões, e elas respondem coisas diferentes:
 *  - motorista: o movimento guarda o nome de quem dirigiu, então "saiu 580 pelas mãos
 *    dele e voltaram 0" é literal — ele levou e ainda não trouxe.
 *  - usuário: é quem LANÇOU. Aqui o número mede quem registrou a saída e não registrou
 *    a devolução. Cuidado ao ler como dívida: se o Fulano lança a saída e outra pessoa
 *    lança a devolução da mesma carga, o déficit fica com o Fulano. Serve para achar
 *    baixa que ninguém deu, não para cobrar pessoa.
 */
function classificaFluxo(saida, retorno, RUIM) {
  var saldo = retorno - saida;
  // Sem saída não há o que cobrar: uma devolução isolada não vira "retorno de 0%".
  var desvio = saida > 0 ? Math.round(((saida - retorno) / saida) * 100) : null;
  var situacao;
  if (!saida && !retorno) situacao = 'parado';
  else if (saldo >= 0) situacao = 'ok';
  else if (desvio !== null && desvio > RUIM) situacao = 'ruim';
  else situacao = 'atencao';
  return { saldo: saldo, desvio: desvio, situacao: situacao };
}

function fluxoPorPessoa(dados, desde) {
  var movimentos = dados.movimentos || [];
  var usuarios = dados.usuarios || [];
  var nomesUsuarios = mapaNomes(usuarios);
  var perfis = {};
  usuarios.forEach(function (u) { perfis[String(u.ID)] = u.Perfil || ''; });

  // chave -> { nome, extra:{}, saida, retorno }
  var porMot = {}, porUsu = {};
  function soma(mapa, chave, nome, q, ehSaida, extra) {
    if (!chave) return;
    var k = String(chave);
    if (!mapa[k]) mapa[k] = { id: k, nome: nome, saida: 0, retorno: 0, n: 0, extras: {} };
    mapa[k].n++;
    if (ehSaida) mapa[k].saida += q; else mapa[k].retorno += q;
    if (extra) mapa[k].extras[extra] = 1;
  }

  ativos(movimentos).forEach(function (m) {
    if (desde && m.DataRef < desde) return;
    var q = efetiva(m);
    if (!q) return;
    var ehSaida = (m.Tipo === 'SAIDA' || m.Tipo === 'TRANSFERENCIA');
    if (!ehSaida && m.Tipo !== 'DEVOLUCAO') return;   // perda e ajuste não são fluxo de ida e volta
    var mot = String(m.Motorista || '').trim();
    soma(porMot, mot, mot, q, ehSaida, String(m.Rota || '').trim());
    soma(porUsu, m.UsuarioID, nome(nomesUsuarios, m.UsuarioID), q, ehSaida, '');
  });

  function lista(mapa, tipo, sub) {
    return Object.keys(mapa).map(function (k) {
      var r = mapa[k];
      var c = classificaFluxo(r.saida, r.retorno, DESVIO_RUIM);
      var rotas = Object.keys(r.extras).filter(function (x) { return x; }).sort();
      /* De onde vem a marca muda com a visao: no usuario e o PERFIL que tem "teste"
         (o nome dele pode ser qualquer um), no motorista e o proprio nome, que e o que
         o movimento guarda. Ordenar so por `nome` deixava o usuario de ensaio em cima. */
      var ehTeste = sub === 'perfil' ? temTeste(perfis[r.id]) : temTeste(r.nome);
      return {
        id: r.id, nome: r.nome, tipo: tipo, teste: ehTeste,
        // A linha de baixo traz a contagem de lançamentos: dizer "Conferente" aqui
        // repetiria a coluna Perfil, que fica a dois dedos de distância.
        sub: r.n + (r.n === 1 ? ' lançamento' : ' lançamentos'),
        // A quinta coluna troca de sentido junto com a visão: nas rotas do motorista e no
        // perfil do usuário. Uma coluna "Responsável" com o proprio nome repetido seria ruído.
        responsavel: sub === 'perfil' ? (perfis[r.id] || '') : rotas.join(', '),
        saida: r.saida, retorno: r.retorno,
        saldo: c.saldo, desvio: c.desvio, situacao: c.situacao
      };
    }).sort(function (a, b) {
      return (a.teste ? 1 : 0) - (b.teste ? 1 : 0) ||
             a.saldo - b.saldo || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  }

  return { motoristas: lista(porMot, 'MOTORISTA', 'rotas'), usuarios: lista(porUsu, 'USUARIO', 'perfil') };
}

function fluxoPorOrigem(dados, desde, meta) {
  var locais = dados.locais || [];
  var movimentos = dados.movimentos || [];
  meta = Number(meta) || 90;

  var nomesUsuarios = mapaNomes(dados.usuarios || []);
  var nomesLocais = mapaNomes(locais);
  var nomesTipos = mapaTipos(dados.tipos || []);

  var saiu = {}, voltou = {};
  // Quem dirigiu, que caixa foi e quantos lançamentos — colhidos do próprio movimento.
  // O cadastro da rota costuma vir sem motorista, e o nome só existe aqui.
  var condutores = {}, caixas = {}, quantos = {};
  function anota(local, m) {
    if (!local) return;
    quantos[local] = (quantos[local] || 0) + 1;
    var mot = String(m.Motorista || '').trim();
    if (mot) { condutores[local] = condutores[local] || {}; condutores[local][mot] = 1; }
    var cx = nome(nomesTipos, m.TipoCaixaID);
    if (cx) { caixas[local] = caixas[local] || {}; caixas[local][cx] = 1; }
  }

  ativos(movimentos).forEach(function (m) {
    if (desde && m.DataRef < desde) return;
    var q = efetiva(m);          // devolução não confirmada vale 0, e vale a contada
    if (!q) return;
    if (m.Tipo === 'SAIDA' || m.Tipo === 'TRANSFERENCIA') {
      if (m.DestinoID) { saiu[m.DestinoID] = (saiu[m.DestinoID] || 0) + q; anota(m.DestinoID, m); }
    } else if (m.Tipo === 'DEVOLUCAO') {
      if (m.OrigemID) { voltou[m.OrigemID] = (voltou[m.OrigemID] || 0) + q; anota(m.OrigemID, m); }
    }
  });

  function chavesDe(mapa, id) {
    return Object.keys(mapa[id] || {}).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR');
    });
  }

  var SUB = { ROTA: 'rota', FILIAL: 'filial', CLIENTE: 'cliente' };
  var linhas = locais.filter(function (l) {
    return l.Tipo === 'ROTA' || l.Tipo === 'FILIAL' || l.Tipo === 'CLIENTE';
  }).map(function (l) {
    var saida = saiu[l.ID] || 0;
    var retorno = voltou[l.ID] || 0;
    var c = classificaFluxo(saida, retorno, DESVIO_RUIM);
    var motMov = chavesDe(condutores, l.ID);

    /* Quem responde, em ordem de confiança:
       1) o cadastro — é a designação oficial;
       2) quem dirigiu de fato no período, que vem no movimento.
       O passo 2 existe porque rota sem motorista no cadastro é o caso comum enquanto o
       cadastro não está completo: a tela dizia "sem responsável" tendo o nome do
       motorista em cada lançamento daquela rota. Só vale para ROTA — em cliente e
       filial quem responde é o dono do local, não quem entregou. */
    var resp = l.Tipo === 'ROTA'
      ? (l.MotoristaId ? nome(nomesUsuarios, l.MotoristaId) : motMov.join(', '))
      : String(l.Responsavel || '').trim();

    var cx = chavesDe(caixas, l.ID);
    var n = quantos[l.ID] || 0;
    var partes = [SUB[l.Tipo]];
    if (l.Tipo === 'CLIENTE' && l.RotaId) partes.push(nome(nomesLocais, l.RotaId));
    if (n) partes.push(n + (n === 1 ? ' lançamento' : ' lançamentos'));
    if (cx.length) partes.push(cx.join(', '));

    return {
      id: l.ID, nome: l.Nome, tipo: l.Tipo,
      sub: partes.join(' · '),
      rotaId: l.RotaId || '',
      responsavel: resp,
      // Diz de onde veio o nome: sem isso não dá para saber se falta cadastrar o
      // motorista da rota ou se ele já está lá.
      respDoCadastro: !!(l.Tipo === 'ROTA' ? l.MotoristaId : String(l.Responsavel || '').trim()),
      motoristas: motMov, caixas: cx, lancamentos: n,
      saida: saida, retorno: retorno, saldo: c.saldo,
      desvio: c.desvio, situacao: c.situacao
    };
  }).sort(function (a, b) {
    // Quem deve mais primeiro; entre os parados, ordem alfabética, senão a lista dança.
    // O ensaio vem antes de tudo isso, para ficar no fim.
    return pesoTeste(a.nome) - pesoTeste(b.nome) ||
           a.saldo - b.saldo || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });

  var comMovimento = linhas.filter(function (l) { return l.situacao !== 'parado'; });
  var tSaida = 0, tRetorno = 0, deficit = 0, porTipo = { ROTA: 0, FILIAL: 0, CLIENTE: 0 };
  comMovimento.forEach(function (l) {
    tSaida += l.saida; tRetorno += l.retorno;
    if (l.saldo < 0) deficit += -l.saldo;
    porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1;
  });

  return {
    meta: meta,
    linhas: linhas,
    totais: {
      linhas: comMovimento.length,
      porTipo: porTipo,
      saida: tSaida, retorno: tRetorno,
      saldo: tRetorno - tSaida,
      deficit: deficit,
      taxaRetorno: tSaida > 0 ? Math.round((tRetorno / tSaida) * 1000) / 10 : null,
      foraDaMeta: comMovimento.filter(function (l) {
        return l.desvio !== null && (100 - l.desvio) < meta;
      }).length
    }
  };
}

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
  }).sort(function (a, b) {
    return pesoTeste(a.nome) - pesoTeste(b.nome) || b.saldo - a.saldo;
  });

  var galpoes = locais.filter(function (l) { return l.Tipo === 'GALPAO'; }).map(function (l) {
    var porTipo = sal[l.ID] || {};
    var total = 0;
    Object.keys(porTipo).forEach(function (t) { total += porTipo[t]; });
    return { id: l.ID, nome: l.Nome, saldo: total, porTipo: porTipo };
  }).sort(function (a, b) {
    return pesoTeste(a.nome) - pesoTeste(b.nome) ||
           String(a.nome).localeCompare(String(b.nome), 'pt-BR');
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
  }).sort(function (a, b) {
    return pesoTeste(a.nome) - pesoTeste(b.nome) ||
           (b.saldo + b.saldoClientes) - (a.saldo + a.saldoClientes);
  });

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
    locais: lista, rotas: rotas, galpoes: galpoes, tipos: tipos,
    // Mesma janela dos KPIs (do dia 1 do mês): se o painel mostrasse uma taxa de retorno
    // do mês e a tabela outra de outro período, as duas na mesma tela, quem lê escolheria
    // uma ao acaso. A meta sai da config e cai em 90 quando ninguém a definiu.
    fluxo: fluxoPorOrigem(dados, ini, Number(dados.config.metaRetorno) || 90),
    fluxoPessoas: fluxoPorPessoa(dados, ini)
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

  var mTipos = mapaTipos(dados.tipos), mLocais = mapaNomes(dados.locais), mUsers = mapaNomes(dados.usuarios);
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
    // (a conferência saiu: devolução lançada já mexe no extrato)
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
      ID: u.ID, Nome: u.Nome, Perfil: normalizarPerfil(u.Perfil),
      LocalPadrao: u.LocalPadrao, Telefone: u.Telefone || '',
      Email: u.Email || '', Usuario: u.Usuario || '',
      Ativo: u.Ativo !== false, TemSenha: !!u.SenhaHash,
      // Se existe PIN, nao qual e: a coluna Senha do painel precisa distinguir
      // "ainda nao trocou" de "nao tem essa credencial".
      TemPin: !!String(u.PIN == null ? '' : u.PIN).trim(),
      // Nao e segredo, e o admin precisa saber quem ainda nao trocou.
      PinProvisorio: u.PinProvisorio === true, SenhaProvisoria: u.SenhaProvisoria === true,
      AcessoPainel: podeVerPainel(u),
      Saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
      Destinos: Array.isArray(u.Destinos) ? u.Destinos : []
    };
  });
}

module.exports = {
  TIPOS_MOV: TIPOS_MOV, PERFIS: PERFIS, TIPOS_LOCAL: TIPOS_LOCAL,
  rotuloTipo: rotuloTipo, mapaTipos: mapaTipos,
  motoristasPublicos: motoristasPublicos, cnhVencida: cnhVencida,
  data: data, fimDoDia: fimDoDia, iso: iso, soData: soData,
  mapaNomes: mapaNomes, nome: nome, ativos: ativos, naoCancelados: naoCancelados,
  ehPerfilTeste: ehPerfilTeste, temTeste: temTeste, pesoTeste: pesoTeste,
  lancamentoDeTeste: lancamentoDeTeste, recorteTeste: recorteTeste, ativo: ativo, novoId: novoId, novoToken: novoToken,
  acharPorIdentificador: acharPorIdentificador, loginPorSenha: loginPorSenha,
  fluxoPorOrigem: fluxoPorOrigem, fluxoPorPessoa: fluxoPorPessoa,
  cicloDaCarga: cicloDaCarga, rotuloCiclo: rotuloCiclo,
  loginPorPin: loginPorPin, sessaoDe: sessaoDe,
  montarMovimento: montarMovimento, montarConferencia: montarConferencia,
  montarCorrecao: montarCorrecao, CORRIGIVEIS: CORRIGIVEIS,
  efetiva: efetiva, saldos: saldos, emConferencia: emConferencia, aging: aging,
  pendentes: pendentes, listaMovimentos: listaMovimentos, painel: painel,
  descricao: descricao, extrato: extrato, extratoToken: extratoToken,
  usuariosPublicos: usuariosPublicos, podeVerPainel: podeVerPainel, podeConferir: podeConferir,
  normalizarPerfil: normalizarPerfil, perfisConhecidos: perfisConhecidos,
  locaisPermitidos: locaisPermitidos, motoristasDaRota: motoristasDaRota,
  ehVolante: ehVolante
};
