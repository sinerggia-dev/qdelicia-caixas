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

/* O movimento leva caixa embora ou traz caixa de volta?
   SAIDA e TRANSFERENCIA levam; DEVOLUCAO traz. PERDA e AJUSTE nao sao nem um nem outro —
   nao ha viagem, ha correcao de saldo — e por isso devolvem ''. Quem filtra por sentido
   nao os quer em lado nenhum, e somar uma perda como "saida" inflaria o que se cobra.

   Mora aqui, e nao repetida em cada quem-pergunta, porque a tela de Movimentos e os
   paineis precisam responder isso do MESMO jeito: se o filtro chamasse de entrada algo
   que o painel nao conta como retorno, os dois numeros brigariam sem ninguem saber por que. */
function sentidoDoMovimento(tipo) {
  if (tipo === 'SAIDA' || tipo === 'TRANSFERENCIA') return 'SAIDA';
  if (tipo === 'DEVOLUCAO') return 'ENTRADA';
  return '';
}

/* Mapa {tipo: quantidade} vira lista ordenada por nome.
   Ordenada aqui, e nao na tela, por dois motivos: a tela nao ordena de novo, e as colunas
   de SAIDA e RETORNO saem sempre na mesma ordem — que e o que deixa comparar uma com a
   outra de relance. Era codigo igual em dois lugares; duas copias da mesma regra so
   servem para uma delas mudar sozinha um dia. */
function detalharTipos(porTipo) {
  return Object.keys(porTipo || {}).sort(function (a, b) {
    return a.localeCompare(b, 'pt-BR');
  }).map(function (k) { return { caixa: k, qtd: porTipo[k] }; });
}

/* As operacoes que o app de campo oferece. Uma lista so, no servidor, porque tres
   lugares precisam concordar sobre elas: o formulario do cadastro, as abas do celular e
   a recusa na gravacao. Duas copias disso divergiriam no primeiro nome novo. */
var OPERACOES = [
  { ID: 'SAIDA', Nome: 'Saída', Tipos: ['SAIDA', 'TRANSFERENCIA'] },
  { ID: 'RETORNO', Nome: 'Retorno', Tipos: ['DEVOLUCAO'] }
];

/* As abas do painel do escritorio. Como em OPERACOES, a lista mora num lugar so: o
   formulario do cadastro e a tela que esconde as abas precisam concordar sobre ela, e
   duas copias divergiriam no primeiro nome novo.

   Ajustes e Cadastros so aparecem para o admin, independente desta lista — quem confere a
   chegada e quem gera a divergencia, e dar a ele o ajuste de saldo seria deixa-lo apagar
   o proprio erro. */
var ABAS = [
  { ID: 'pgRetornos',   Nome: 'Painel de Ativos' },
  { ID: 'pgPainel',     Nome: 'Painel' },
  { ID: 'pgExtrato',    Nome: 'Extratos' },
  /* `sensivel` nao quer mais dizer "so admin" — o administrador pode conceder estas
     duas a quem quiser. Quer dizer "so por marca EXPLICITA": elas ficam fora do "nada
     marcado = todas".

     Sao as duas que mexem em quem pode o que (Cadastros) e no saldo (Ajustes). No
     padrao, o proximo usuario criado com acesso ao painel e sem nenhuma marca ganharia o
     cadastro de usuarios de brinde — e dali se tornaria administrador sozinho.
     Concedida a dedo e escolha; concedida por omissao e acidente. */
  { ID: 'pgLancar',     Nome: 'Ajustes', sensivel: true },
  { ID: 'pgMovimentos', Nome: 'Movimentos' },
  /* Preferencia de quem olha, e nao dado da operacao: escolher colunas nao muda saldo
     nenhum. Por isso nao e `sensivel` — quem ve uma tabela pode arrumar a propria. */
  { ID: 'pgColunas',    Nome: 'Colunas' },
  { ID: 'pgCadastros',  Nome: 'Cadastros', sensivel: true }
];

/* ==================================================================================
 * A CONVENÇÃO DAS LISTAS DE PERMISSÃO, num lugar só.
 *
 * **Nada marcado = nada liberado.** Marcar é conceder.
 *
 * Era o contrário: lista vazia queria dizer TODOS. A razão era boa — errar para o lado
 * de mostrar se corrige no cadastro, errar para o lado de trancar só se resolve com o
 * admin por perto — mas ela surpreendia justamente quem cadastra. O administrador
 * desmarcava tudo, esperava que a pessoa não visse nada, e ela continuava vendo cinco
 * páginas. Um formulário cuja marcação não faz o que aparenta é pior do que um
 * formulário rígido.
 *
 * O PREÇO, dito em voz alta: item novo nasce NEGADO. Um galpão, um motorista, um tipo de
 * caixa ou um usuário criado amanhã não aparece para ninguém até ser marcado, pessoa por
 * pessoa. É assim que funciona toda lista de permissão explícita, e é exatamente o que a
 * convenção antiga existia para evitar. Os formulários de cadastro avisam isso na hora
 * de criar, para não ser descoberto em silêncio.
 *
 * A migração `2026-09-22-marcar-o-que-ja-valia` gravou em cada usuário o que ele já
 * enxergava, então ninguém perdeu nada na virada.
 *
 * Virar a chave de volta é mudar esta constante — e é de propósito que ela seja UMA.
 * Espalhada por oito funções, metade delas discordaria na primeira mudança.
 * ================================================================================== */
var VAZIA_LIBERA = false;

/** Se `id` está liberado por `lista`. */
function podeItem(lista, id) {
  var l = Array.isArray(lista) ? lista : [];
  if (!l.length) return VAZIA_LIBERA;
  return l.map(String).indexOf(String(id)) >= 0;
}

/** Os itens de `itens` que `lista` libera. Cada item precisa ter `ID`. */
function peneirarPor(lista, itens) {
  var l = Array.isArray(lista) ? lista : [];
  var todos = Array.isArray(itens) ? itens : [];
  if (!l.length) return VAZIA_LIBERA ? todos : [];
  var querido = {};
  l.forEach(function (x) { querido[String(x)] = true; });
  return todos.filter(function (i) { return querido[String(i.ID)]; });
}

function podeAba(u, id) {
  return podeItem(u && u.Abas, id);
}

/* De que operacao este lancamento e. AJUSTE e PERDA devolvem '' de proposito: nascem no
   escritorio, na aba Ajustes, e nao no celular — governa-las por esta lista trancaria o
   administrador fora do proprio ajuste. */
function operacaoDoTipo(tipo) {
  var achou = '';
  OPERACOES.forEach(function (o) {
    if (o.Tipos.indexOf(String(tipo || '').toUpperCase()) >= 0) achou = o.ID;
  });
  return achou;
}

/* AJUSTE e PERDA devolvem `op` vazio em `operacaoDoTipo()`, e por isso passam direto:
   elas nascem no escritorio e quem manda nelas e a lista de locais. */
function podeOperacao(u, op) {
  if (!op) return true;
  return podeItem(u && u.Operacoes, op);
}

/**
 * Em QUAL local este lançamento mexe no saldo.
 *
 * AJUSTE mexe no destino — é o local que ganha (ou perde) as caixas. PERDA mexe na
 * origem — é quem as perdeu. Os outros tipos devolvem '' porque não são lançados na aba
 * Ajustes: eles nascem no campo e já são governados por `Saidas`/`Destinos`.
 *
 * A pergunta "qual local" mora AQUI, e não espalhada entre a tela e o roteador: espalhada,
 * a tela filtraria por um campo e a gravação cobraria outro, e a restrição passaria a
 * valer só na metade que alguém lembrasse.
 */
function localDoAjuste(tipo, p) {
  var t = String(tipo || '').toUpperCase();
  if (t === 'AJUSTE') return String((p && p.destinoId) || '');
  if (t === 'PERDA') return String((p && p.origemId) || '');
  return '';
}

/**
 * Se esta pessoa pode ajustar o saldo DESTE local.
 *
 * Vazia quer dizer NENHUM — a convenção do projeto, marcar é conceder.
 *
 * A aba Ajustes era tudo-ou-nada: quem a tinha mexia no saldo de qualquer galpão, filial,
 * cliente ou rota. Ter a aba passa a ser a porta; esta lista é o quarto.
 */
function podeAjustarEm(u, localId) {
  /* Sem local nao ha o que cobrar: quem recusa e a validacao do campo, com a mensagem
     que ajuda a corrigir. */
  if (!localId) return true;
  return podeItem(u && u.Ajustes, localId);
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
 * tem rota nenhuma marcada — aqui lista vazia quer dizer "serve qualquer uma".
 *
 * ESTA LISTA NÃO SEGUIU A VIRADA de "nada marcado = nada liberado", e é de propósito.
 * Ela não é permissão de pessoa: mora no cadastro do MOTORISTA e responde "que rotas ele
 * atende", que é uma regra de casamento, não de acesso. Invertê-la faria um motorista sem
 * rota marcada sumir de todas as saídas — e a válvula logo abaixo (rota sem ninguém
 * atribuído devolve todos) passaria a brigar com ela em vez de socorrer.
 *
 * Se um dia ela virar também, o `VAZIA_LIBERA` não a alcança: ela tem regra própria, aqui.
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

/** Movimentos que valem: cancelado não conta para nada, e o que está na lixeira também não.
 *
 * ESTA É A ÚNICA PENEIRA. Saldo, painel, extrato, ciclo da carga e a lista de Movimentos
 * passam todos por aqui — foi por isso que a exclusão pôde virar marca em vez de apagão
 * sem precisar lembrar de filtrar em seis lugares. Esquecido um deles, o lançamento
 * "excluído" continuaria pesando no saldo de alguém, e ninguém teria como ver por quê.
 *
 * O que NÃO passa por aqui é de propósito: a conferência de chave do celular, para uma
 * fila offline não ressuscitar o que o escritório acabou de excluir, e as travas de
 * "local tem movimento", porque a linha continua existindo no banco e a chave estrangeira
 * continua apontando para ela.
 */
function ativos(movimentos) {
  return movimentos.filter(function (m) { return !m.Cancelado && !m.ExcluidoEm; });
}

/** O avesso: o que está na lixeira, e só. */
function naLixeira(movimentos) {
  return movimentos.filter(function (m) { return !!m.ExcluidoEm; });
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

/* A matriz abre as listas ordenadas por nome. Não entra nas ordenadas por saldo — lá a
   ordem É a resposta (quem deve mais primeiro), e furar a fila com a matriz esconderia
   justamente o que aquele quadro existe para mostrar. */
function pesoMatriz(v) { return /matriz/i.test(String(v == null ? '' : v)) ? 0 : 1; }

function lancamentoDeTeste(m) {
  return m.Teste === true || ehPerfilTeste(m.Perfil);
}

/**
 * O LOTE: de qual REMESSA esta linha faz parte.
 *
 * Um toque em Enviar vira VÁRIAS linhas — uma por tipo de caixa. Na tela de campo isso
 * aparecia como cinco lançamentos, repetindo data, rota e motorista cinco vezes para uma
 * carga só. A chave daqui é o que permite juntá-las de novo sem adivinhar.
 *
 * Ela sai do `ClientKey`, que é a identidade do envio e não uma semelhança: o
 * `montarMovimento` grava `base + '-' + índice`, com o MESMO `base` para todos os itens
 * do mesmo envio. Tirando o último pedaço, sobra o envio.
 *
 * Linha SEM chave — as que vieram do Apps Script, antes de a fila offline existir — cai
 * no carimbo de gravação mais a viagem. Também é exato para um envio só, porque as linhas
 * dele nascem do mesmo `agora`; o que ele não separa são dois envios idênticos gravados
 * no mesmo instante, e para isso quem olha é quem agrupa: tipo de caixa repetido dentro
 * de um lote quer dizer que não era um lote só.
 */
function loteDo(m) {
  var ck = String((m && m.ClientKey) || '');
  var corte = ck.lastIndexOf('-');
  if (ck && corte > 0) return 'k:' + ck.slice(0, corte);
  return 'x:' + [iso(m.DataHora), m.Tipo, m.OrigemID, m.DestinoID,
                 m.UsuarioID, m.Motorista].join('|');
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

/**
 * O recorte de quem só vê o que lançou.
 *
 * Estreita `dados.movimentos` **na porta**, do mesmo jeito que `recorteTeste`, e por isso
 * tudo o que vem depois obedece sozinho: o Painel de Ativos, os saldos, os extratos e a
 * lista de Movimentos saem todos daqui.
 *
 * Filtrar só a lista de Movimentos seria pior do que não filtrar: as linhas sumiriam e os
 * mesmos números continuariam somados nos cartões logo acima — a pessoa veria o total do
 * galpão inteiro e uma tabela de três linhas, sem entender nem uma coisa nem outra.
 *
 * `usuarioId` vazio devolve os dados inteiros. É a convenção do projeto, e a única segura:
 * o contrário deixaria todo mundo com o painel vazio no dia em que a coluna nasceu.
 */
function recorteProprios(dados, quem) {
  /* `quem` e uma LISTA de ids — ou uma string com eles separados por virgula, que e como
     a tela manda. Antes era um id so, de quando a unica opcao era "so os proprios". */
  var ids = (Array.isArray(quem) ? quem : String(quem == null ? '' : quem).split(','))
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return x !== ''; });
  if (!ids.length) return dados;
  var querido = {};
  ids.forEach(function (id) { querido[id] = true; });
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (m) {
    return querido[String(m.UsuarioID)];
  });
  return copia;
}

/**
 * De quem esta pessoa vê os lançamentos — a lista pronta para o recorte.
 *
 * Três respostas, e a ordem importa:
 *   - não vê lançamento nenhum  → devolve o id dela mesma antecedido de nada que exista,
 *     e quem chama trata pelo `verLancamentos`;
 *   - lista vazia               → **todos**, a convenção do projeto;
 *   - lista com ids            → só esses. Marcar só ela mesma é o antigo "só os próprios".
 */
function usuariosVistosDe(u) {
  var lista = Array.isArray(u && u.UsuariosVistos) ? u.UsuariosVistos : [];
  /* A compatibilidade com o `so_proprios` antigo mora AQUI, num lugar só: quem tinha a
     marca velha e ainda não tem lista vê a si mesmo. A migração já converte no banco;
     isto cobre o intervalo entre o deploy e a migração rodar. */
  if (!lista.length && u && u.SoProprios === true && u.ID) return [String(u.ID)];
  return lista.map(String);
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
 * De onde e para onde esta pessoa pode lançar. Segue a convenção de `peneirarPor`.
 */
function locaisPermitidos(ids, locais) {
  return peneirarPor(ids, locais);
}

function sessaoDe(u) {
  return {
    id: u.ID, nome: u.Nome, perfil: normalizarPerfil(u.Perfil),
    localPadrao: u.LocalPadrao, acessoPainel: podeVerPainel(u),
    saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
    destinos: Array.isArray(u.Destinos) ? u.Destinos : [],
    // Mesma convenção das outras: lista vazia quer dizer NENHUM — marcar é conceder.
    tiposCaixa: Array.isArray(u.TiposCaixa) ? u.TiposCaixa : [],
    motoristas: Array.isArray(u.Motoristas) ? u.Motoristas : [],
    // Idem: vazia = todas. E o celular esconde a aba que nao esta aqui.
    operacoes: Array.isArray(u.Operacoes) ? u.Operacoes : [],
    /* Em quais locais ela ajusta. Esquecido aqui, a tela do painel ofereceria todos
       os locais e a gravacao recusaria — a pessoa preenche o formulario inteiro para
       levar um nao no fim. */
    ajustes: Array.isArray(u.Ajustes) ? u.Ajustes : [],
    // As abas do painel do escritorio, mesma convencao.
    abas: Array.isArray(u.Abas) ? u.Abas : [],
    /* Painel restrito: entra no painel, mas so enxerga o que ela mesma lancou. Mantido
       para nao quebrar sessao ja guardada; quem manda agora e `usuariosVistos`. */
    soProprios: u.SoProprios === true,
    /* Se ve lancamentos, e de quem. Lista vazia = TODOS. */
    verLancamentos: u.VerLancamentos !== false,
    usuariosVistos: usuariosVistosDe(u),
    /* Se esta pessoa consegue entrar no app de lancamento. Sem PIN o `loginPorPin` recusa,
       entao o painel usa isto para decidir se mostra a porta de volta — porta que leva a
       uma recusa e pior do que porta nenhuma.

       Vai o SIM ou NAO, nunca o PIN. */
    temPin: !!String(u.PIN == null ? '' : u.PIN).trim()
  };
}

/** Acha por e-mail, apelido de login ou nome completo — o usuário digita o que lembrar. */
/**
 * A sessão de uma pessoa, relida do cadastro. É o que deixa a permissão mudada valer sem
 * a pessoa sair e entrar: a sessão guardada no aparelho é uma foto do login, e sozinha
 * ela congela o que valia naquele dia.
 *
 * Devolve `null` para quem não existe ou está inativo — as duas coisas querem dizer
 * "não tem mais sessão", e quem chama trata igual.
 *
 * Só a sessão: nada de e-mail, telefone, documento ou senha. É estritamente menos do que
 * a `equipe` já devolve.
 */
function meuAcesso(usuarios, id) {
  var alvo = String(id == null ? '' : id);
  if (!alvo) return null;
  var u = (usuarios || []).filter(function (x) { return String(x.ID) === alvo; })[0];
  if (!u || u.Ativo === false) return null;
  return sessaoDe(u);
}

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

/**
 * UMA PORTA SO. A pessoa digita usuário e segredo; aqui se descobre qual é qual.
 *
 * Antes eram duas telas com dois pedidos diferentes, e quem abria o endereço errado
 * levava "usuário ou senha incorretos" — uma mensagem que não falava do erro de
 * verdade, que era a porta.
 *
 * A ordem importa: tenta a SENHA primeiro, depois o PIN. Ao contrário, alguém cuja
 * senha longa fosse por acaso seis dígitos entraria sempre como PIN, e perderia o
 * painel sem entender por quê.
 *
 * O `via` volta junto, e não é enfeite: **o painel continua exigindo a senha**. O que
 * o PIN protege é o lançamento, que fica registrado com nome e hora e pode ser
 * corrigido; o painel vê a operação inteira e mexe em cadastro. Se o PIN abrisse o
 * painel, a porta única teria rebaixado a tranca do escritório à do galpão — e sem
 * ninguém pedir. Quem decide PARA ONDE ir é o papel; a credencial decide até onde.
 */
function loginUnico(usuarios, ident, segredo, conferir) {
  var texto = String(segredo == null ? '' : segredo);
  if (!String(ident == null ? '' : ident).trim() || !texto) {
    return { ok: false, erro: ERRO_ACESSO };
  }
  var porSenha = loginPorSenha(usuarios, ident, texto, conferir);
  if (porSenha.ok) { porSenha.via = 'senha'; return porSenha; }
  var porPin = loginPorPin(usuarios, ident, texto);
  if (porPin.ok) { porPin.via = 'pin'; return porPin; }
  /* Uma mensagem só para os dois fracassos: dizer qual das duas falhou contaria a
     quem estiver testando se aquele identificador existe, e com que credencial. */
  return { ok: false, erro: ERRO_ACESSO };
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
      /* O lançamento pode SUBIR para teste, nunca descer. O ctx vem do cadastro (perfil
         com "teste" no nome) e é o piso: quem é usuário de ensaio não consegue passar um
         lançamento por real, nem por engano nem por payload adulterado. Por cima disso, o
         escritório marca um ajuste como ensaio quando quiser — é o caso de quem tem
         perfil real e está só experimentando. */
      Teste: ctx.teste === true || p.teste === true || String(p.teste) === 'true'
    };
    linhas.push(linha);
    proximos.push(linha);
  });

  return { ok: true, linhas: linhas, jaExistiam: jaExistiam, status: status };
}

/** Conferência na chegada. Devolve o patch a aplicar e a divergência apurada. */
function montarConferencia(mov, p) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado: ' + String(p.id || '') };
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento está na lixeira — restaure antes de conferir.' };
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
/* Tudo que uma correção alcança. A lista manda em três coisas de uma vez: os campos que
   o servidor aceita, o rótulo que vai para o histórico e como o valor vira texto legível.
   Acrescentar aqui é o bastante para o campo passar a ser corrigível.

   `mapa` diz de QUAL mapa de nomes o campo se serve — o histórico guarda o NOME e não o
   id, porque uma linha dizendo "origem: de L001 para L016" não serve para ninguém
   conferir nada. */
/* O `campo` que marca uma consulta no mesmo histórico das correções. Ele NÃO pode
   colidir com nenhum `rotulo` de `CORRIGIVEIS` — se colidisse, uma correção de verdade
   seria contada como consulta e sumiria da conta de alterações. Os dois parênteses estão
   aí para isso: nenhum rótulo de campo se chama assim. */
var MARCA_CONSULTA = '(consulta)';

var CORRIGIVEIS = [
  { campo: 'Qtd', rotulo: 'quantidade', numero: true },
  { campo: 'QtdConferida', rotulo: 'conferida', numero: true },
  { campo: 'DataRef', rotulo: 'data', data: true },
  { campo: 'OrigemID', rotulo: 'origem', mapa: 'locais' },
  { campo: 'DestinoID', rotulo: 'destino', mapa: 'locais' },
  { campo: 'TipoCaixaID', rotulo: 'tipo de caixa', mapa: 'tipos' },
  // O motorista é gravado pelo nome, não por id: não há o que mapear.
  { campo: 'Motorista', rotulo: 'motorista' },
  { campo: 'Romaneio', rotulo: 'romaneio' },
  { campo: 'Obs', rotulo: 'observação' },
  { campo: 'UsuarioID', rotulo: 'quem lançou', mapa: 'usuarios' }
];

/* `nomes` é opcional: { locais, tipos, usuarios }, cada um um mapa de id para nome, usado
   só nos campos marcados com `mapa`. Quem chamar sem ele continua funcionando — o
   histórico cai no valor cru, que é feio mas não quebra nada. */
/* ------------------------- a janela do conserto livre -------------------------
 *
 * Corrigir sem pedir nada a ninguém vale por DEZ MINUTOS, para o PRÓPRIO autor, no
 * MESMO DIA. Passou disso, é outra pessoa, ou virou o dia: pede a senha do escritório.
 *
 * Os dez minutos são o tempo de quem digitou errado perceber e arrumar — passado isso, o
 * número já foi visto por alguém, já entrou num saldo, já pode ter virado conferência. O
 * "mesmo dia" existe para o lançamento das 23h55: dentro dos dez minutos, mas já é
 * amanhã, e amanhã o dia de ontem está fechado.
 *
 * O DIA É O DO GALPÃO, não o do servidor. A Vercel roda em UTC, e às 21h de Brasília lá
 * já é o dia seguinte: sem o deslocamento, todo lançamento do fim da tarde nasceria "de
 * outro dia" e pediria senha. Offset fixo porque a operação é no Nordeste, que não tem
 * horário de verão desde 2019 — muda isto quando a operação mudar de fuso, não antes.
 */
var JANELA_CORRECAO_MIN = 10;
var FUSO_OPERACAO_H = -3;

function diaDaOperacao(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  var local = new Date(d.getTime() + FUSO_OPERACAO_H * 3600000);
  return local.toISOString().slice(0, 10);
}

/**
 * Até quando este lançamento se corrige sem senha — ou '' quando já não se corrige.
 *
 * Quem calcula é o SERVIDOR, e a tela só compara com o relógio. Os dez minutos escritos
 * também no navegador seriam dois números sobre a mesma regra, e o dia em que eles
 * discordassem a tela ofereceria o conserto livre e o servidor pediria senha.
 */
function livreAte(m, agora) {
  if (!m || !(m.DataHora instanceof Date)) return '';
  agora = agora || new Date();
  /* Outro dia: nem começa. O prazo de um lançamento de ontem já não existe, e devolver
     um horário que já passou diria a mesma coisa de um jeito mais frágil. */
  if (diaDaOperacao(m.DataHora) !== diaDaOperacao(agora)) return '';
  return iso(new Date(m.DataHora.getTime() + JANELA_CORRECAO_MIN * 60000));
}

/** O conserto sai de graça? Próprio autor, dentro dos dez minutos, no mesmo dia. */
function correcaoLivre(m, usuarioId, agora) {
  if (!m) return false;
  var quem = String(usuarioId || '');
  if (!quem || String(m.UsuarioID || '') !== quem) return false;
  var ate = livreAte(m, agora);
  if (!ate) return false;
  return (agora || new Date()).getTime() <
         new Date(m.DataHora.getTime() + JANELA_CORRECAO_MIN * 60000).getTime();
}

function montarCorrecao(mov, p, agora, nomes, guarda) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento está na lixeira — restaure antes de corrigir.' };
  if (mov.Cancelado) return { ok: false, erro: 'Movimento cancelado não se corrige — lance um novo.' };
  var motivo = String(p.motivo || '').trim();
  if (!motivo) return { ok: false, erro: 'Descreva o motivo da correção.' };

  agora = agora || new Date();

  /* A SENHA, quando a janela livre já passou. Recusado AQUI, e não só escondendo o
     botão: esconder é conveniência, e um POST direto passa por cima dela.

     `senhaOk !== true` e não `=== false`: quem chamar sem a guarda cai no lado que pede
     senha. Um caminho novo esquecido passa a recusar correções antigas, que se percebe
     no mesmo dia — o contrário abriria a porta calado. */
  guarda = guarda || {};
  if (!correcaoLivre(mov, p.usuarioId, agora) && guarda.senhaOk !== true) {
    return {
      ok: false, precisaSenha: true,
      erro: guarda.senhaErrada
        ? 'Senha incorreta.'
        : 'Passaram os ' + JANELA_CORRECAO_MIN + ' minutos de conserto livre — ou o lançamento é ' +
          'de outra pessoa, ou de outro dia. Informe a senha do escritório.'
    };
  }
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
      return c.mapa && nomes && nomes[c.mapa] ? nome(nomes[c.mapa], v) : String(v);
    }
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: c.rotulo, motivo: motivo,
      de: legivel(velho), para: legivel(novo)
    });
  });

  /* ABRIR E GRAVAR SEM MUDAR NADA É UMA CONSULTA, e não uma correção. A etiqueta
     "corrigido" é uma afirmação sobre o DADO: ela diz que o número que está ali não é o
     que foi lançado. Posta em cima de um lançamento intocado, ela manda o escritório
     procurar uma diferença que não existe — e, pior, faz duvidar de um dado correto.
     Fica registrado assim mesmo: quem abriu a correção de um lançamento e por quê é
     coisa que se quer saber depois; o que muda é o nome do que aconteceu. */
  if (!entradas.length) {
    var consulta = {
      em: iso(agora), por: String(p.usuarioId || ''), campo: MARCA_CONSULTA,
      motivo: motivo, de: '', para: ''
    };
    return {
      ok: true, consulta: true, patch: {},
      historico: (mov.Historico || []).concat([consulta]), entradas: []
    };
  }
  return { ok: true, patch: patch, historico: (mov.Historico || []).concat(entradas), entradas: entradas };
}

/* ------------------------- lixeira: mandar e trazer de volta -------------------------
 *
 * As três escrevem no MESMO `historico` da correção, com a mesma forma. É isso que deixa
 * a coluna "Alterado por" ser uma só: ela lê a última entrada, sem precisar saber se o
 * que aconteceu foi uma troca de quantidade, um cancelamento ou uma exclusão.
 *
 * O motivo é opcional aqui, e obrigatório na correção, de propósito: a correção muda um
 * número que vai virar saldo, e sem o porquê ninguém reconstrói a conta depois. Exigir
 * texto para mandar à lixeira só faria escreverem "." com pressa. */

function entradaHistorico(agora, usuarioId, campo, motivo, de, para) {
  return {
    em: iso(agora || new Date()), por: String(usuarioId || ''), campo: campo,
    motivo: String(motivo || ''), de: de, para: para
  };
}

function montarExclusao(mov, p, agora) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento já está na lixeira.' };
  agora = agora || new Date();
  var entrada = entradaHistorico(agora, p && p.usuarioId, 'Exclusão',
    (p && p.motivo) || '', 'valendo', 'na lixeira');
  return {
    ok: true,
    patch: { ExcluidoEm: agora, ExcluidoPor: String((p && p.usuarioId) || '') },
    historico: (mov.Historico || []).concat([entrada])
  };
}

function montarRestauracao(mov, p, agora) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (!mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento não está na lixeira.' };
  agora = agora || new Date();
  var entrada = entradaHistorico(agora, p && p.usuarioId, 'Restauração',
    (p && p.motivo) || '', 'na lixeira', 'valendo');
  /* `null` explícito, e não campo ausente: é o que apaga a marca no banco. Devolvido
     como `undefined`, o patch sairia sem a coluna e a linha ficaria na lixeira depois
     de a tela dizer "restaurado". */
  return {
    ok: true,
    patch: { ExcluidoEm: null, ExcluidoPor: null },
    historico: (mov.Historico || []).concat([entrada])
  };
}

function montarCancelamento(mov, p, agora) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento está na lixeira — restaure antes.' };
  if (mov.Cancelado) return { ok: false, erro: 'Este lançamento já está cancelado.' };
  agora = agora || new Date();
  var motivo = String((p && p.motivo) || '');
  var entrada = entradaHistorico(agora, p && p.usuarioId, 'Cancelamento', motivo,
    'valendo', 'cancelado');
  return {
    ok: true,
    patch: {
      Cancelado: true,
      MotivoCancel: motivo + ' (' + ((p && p.usuarioId) || '') + ')'
    },
    historico: (mov.Historico || []).concat([entrada])
  };
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
/* Os rotulos de status sao um conjunto fechado, e esta e a lista que a tela oferece
   para filtrar. Escrever as opcoes no HTML faria duas listas sobre a mesma regra: elas
   divergem no primeiro rotulo novo, e o filtro passa a oferecer algo que nao existe — ou
   a esconder algo que existe. Ha teste comparando esta lista com o que `rotuloCiclo`
   e capaz de devolver, nos dois sentidos.

   A ordem e a do ciclo da caixa, e nao alfabetica: saiu, voltou em parte, voltou. */
var SITUACOES = ['Enviada', 'Transferida', 'Parcial', 'Devolvida', 'Perda', 'Ajuste'];

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
  /* UM relógio para a lista inteira. Lido dentro do `map`, o prazo do último item seria
     medido milissegundos depois do primeiro — irrelevante para o galpão, e suficiente
     para um teste de janela oscilar sem motivo. */
  var agoraLista = p.agora instanceof Date ? p.agora : new Date();
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
    // `local` casa nas duas pontas; `origem` e `destino` prendem cada uma na sua. Os dois
    // existem porque "tudo que passou por Caruaru" e "tudo que SAIU de Caruaru" são
    // perguntas diferentes, e a segunda é a que importa na hora de apagar.
    if (p.origem && String(m.OrigemID) !== String(p.origem)) return false;
    if (p.destino && String(m.DestinoID) !== String(p.destino)) return false;
    if (p.tipo && m.Tipo !== String(p.tipo).toUpperCase()) return false;
    // Sentido e Tipo convivem: Tipo escolhe UMA linha do razão, sentido pega o grupo.
    // "Saída" aqui traz remessa E transferência juntas, que é como o operador pensa —
    // e deixa de fora perda e ajuste, que não são viagem de caixa nenhuma.
    if (p.fluxo && sentidoDoMovimento(m.Tipo) !== String(p.fluxo).toUpperCase()) return false;
    if (p.caixa && String(m.TipoCaixaID) !== String(p.caixa)) return false;
    /* O status nao esta no movimento: e calculado do ciclo da carga, entao filtra-lo na
       tela nao daria — pela mesma razao do usuario, o corte de 500 linhas vem DEPOIS
       daqui, e a tela veria so os "Parcial" que couberam nas 500. */
    if (p.situacao && rotuloCiclo(m, ciclo[m.ID]) !== String(p.situacao)) return false;
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
      /* De qual remessa esta linha é. A tela de celular junta as linhas por aqui em vez
         de repetir data, rota e motorista uma vez por tipo de caixa. */
      lote: loteDo(m),
      /* Até quando o autor conserta sem senha. Vazio já quer dizer "só com senha", e o
         cálculo dos dez minutos fica NUM lugar: escrito também no navegador, o dia em
         que os dois discordassem a tela ofereceria o conserto livre e o servidor
         pediria senha. */
      livreAte: livreAte(m, agoraLista),
      origem: nome(mLocais, m.OrigemID), destino: nome(mLocais, m.DestinoID),
      origemId: m.OrigemID, destinoId: m.DestinoID,
      // o nome para a tabela; o id para o seletor da correção abrir no valor certo
      tipoCaixa: nome(mTipos, m.TipoCaixaID), tipoCaixaId: m.TipoCaixaID, qtd: m.Qtd,
      qtdConferida: temConf ? m.QtdConferida : '',
      divergencia: (m.Status === 'CONFIRMADO' && temConf) ? Number(m.QtdConferida) - Number(m.Qtd) : '',
      /* O ID de quem lançou vai junto com o NOME. O nome é para ler; o id é para a tela
         decidir se esta pessoa pode corrigir este lançamento. Por nome, dois homônimos
         no cadastro entregariam a um o lançamento do outro. */
      status: m.Status, romaneio: m.Romaneio, usuario: nome(mUsers, m.UsuarioID),
      usuarioId: m.UsuarioID, perfil: m.Perfil,
      teste: lancamentoDeTeste(m),
      situacao: rotuloCiclo(m, ciclo[m.ID]),
      devolvido: ciclo[m.ID] ? ciclo[m.ID].devolvido : null,
      motorista: m.Motorista || '', rota: m.Rota || '',
      obs: m.Obs, assinatura: m.AssinaturaURL, foto: m.FotoURL,
      historico: m.Historico || [],
      /* Quem mexeu por último, já com NOME. O id resolvido aqui e não na tela porque a
         tabela de usuários mora no servidor: a tela mostraria "u014" e o CSV também. */
      alterado: ultimaAlteracao(m, mUsers)
    };
  });
}

/**
 * Quem mexeu no lançamento por último, e quando.
 *
 * Lê o MESMO `historico` que a correção escreve — cancelar, excluir e restaurar também
 * escrevem lá, com a mesma forma. Uma segunda lista só para "quem alterou" teria de ser
 * lembrada em cada ação nova, e a primeira esquecida deixaria a coluna mentindo por
 * omissão: em branco, como se ninguém tivesse tocado.
 */
/* O HISTÓRICO É UM SÓ, e guarda duas coisas diferentes: o que MUDOU o dado e quem só
   abriu a correção e gravou sem mexer. Elas não podem ser contadas juntas — `vezes` é o
   que faz a tela dizer "corrigido", e uma consulta contada ali acusaria de alteração um
   lançamento que ninguém tocou.

   Duas listas separadas resolveriam também, e ao custo de duas verdades sobre o mesmo
   lançamento podendo divergir. Aqui a separação é na leitura, e a marca é uma só. */
function ehConsulta(u) { return String((u && u.campo) || '') === MARCA_CONSULTA; }

function ultimaAlteracao(m, mUsers) {
  var h = (m && m.Historico) || [];
  var mudancas = h.filter(function (u) { return !ehConsulta(u); });
  var consultas = h.filter(ehConsulta);
  var u = mudancas[mudancas.length - 1] || {};
  var c = consultas[consultas.length - 1] || {};
  return {
    por: mUsers ? nome(mUsers, u.por) : String(u.por || ''),
    em: u.em || '', campo: u.campo || '', motivo: u.motivo || '', vezes: mudancas.length,
    /* Quem olhou por último, e quantas vezes olharam. Serve à etiqueta "consultado" —
       que é o que fica quando ninguém mudou nada. */
    consulta: {
      por: mUsers ? nome(mUsers, c.por) : String(c.por || ''),
      em: c.em || '', motivo: c.motivo || '', vezes: consultas.length
    }
  };
}

/**
 * A LIXEIRA: o que foi excluído e ainda dá para trazer de volta.
 *
 * Sai da mesma tabela e da mesma peneira, pelo avesso — `naLixeira` é o complemento
 * exato de `ativos`. Duas consultas independentes poderiam discordar, e a discordância
 * aqui tem nome: um lançamento que não aparece em lugar nenhum, nem valendo nem na
 * lixeira, e que ninguém consegue nem usar nem restaurar.
 */
function listaLixeira(movimentos, locais, tipos, usuarios, p) {
  p = p || {};
  var mLocais = mapaNomes(locais), mTipos = mapaTipos(tipos), mUsers = mapaNomes(usuarios);
  var limite = Number(p.limit || 300);
  return naLixeira(movimentos).slice().sort(function (a, b) {
    // O mais recente primeiro: numa lixeira, procura-se o que acabou de sumir.
    return String(b.ExcluidoEm || '') > String(a.ExcluidoEm || '') ? 1 : -1;
  }).slice(0, limite).map(function (m) {
    return {
      id: m.ID, dataRef: iso(m.DataRef), dataHora: iso(m.DataHora), tipo: m.Tipo,
      origem: nome(mLocais, m.OrigemID), destino: nome(mLocais, m.DestinoID),
      tipoCaixa: nome(mTipos, m.TipoCaixaID), qtd: m.Qtd,
      usuario: nome(mUsers, m.UsuarioID), motorista: m.Motorista || '',
      teste: lancamentoDeTeste(m), obs: m.Obs || '',
      excluidoEm: iso(m.ExcluidoEm), excluidoPor: nome(mUsers, m.ExcluidoPor)
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

function fluxoPorPessoa(dados, desde, ate) {
  var movimentos = dados.movimentos || [];
  var usuarios = dados.usuarios || [];
  var nomesUsuarios = mapaNomes(usuarios);
  var perfis = {};
  usuarios.forEach(function (u) { perfis[String(u.ID)] = u.Perfil || ''; });

  // chave -> { nome, extra:{}, saida, retorno }
  var porMot = {}, porUsu = {};
  var nomesTiposP = mapaTipos(dados.tipos || []);
  function soma(mapa, chave, nome, q, ehSaida, extra, caixa) {
    if (!chave) return;
    var k = String(chave);
    if (!mapa[k]) {
      mapa[k] = { id: k, nome: nome, saida: 0, retorno: 0, n: 0, extras: {},
                  saidaTipo: {}, retornoTipo: {} };
    }
    mapa[k].n++;
    var lado = ehSaida ? 'saidaTipo' : 'retornoTipo';
    if (ehSaida) mapa[k].saida += q; else mapa[k].retorno += q;
    if (caixa) mapa[k][lado][caixa] = (mapa[k][lado][caixa] || 0) + q;
    if (extra) mapa[k].extras[extra] = 1;
  }

  ativos(movimentos).forEach(function (m) {
    if (desde && m.DataRef < desde) return;
    if (ate && m.DataRef > ate) return;
    var q = efetiva(m);
    if (!q) return;
    var sentido = sentidoDoMovimento(m.Tipo);
    if (!sentido) return;                             // perda e ajuste não são fluxo de ida e volta
    var ehSaida = (sentido === 'SAIDA');
    var mot = String(m.Motorista || '').trim();
    var caixa = nome(nomesTiposP, m.TipoCaixaID);
    soma(porMot, mot, mot, q, ehSaida, String(m.Rota || '').trim(), caixa);
    soma(porUsu, m.UsuarioID, nome(nomesUsuarios, m.UsuarioID), q, ehSaida, '', caixa);
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
        saidaTipos: detalharTipos(r.saidaTipo), retornoTipos: detalharTipos(r.retornoTipo),
        saldo: c.saldo, desvio: c.desvio, situacao: c.situacao
      };
    }).sort(function (a, b) {
      return (a.teste ? 1 : 0) - (b.teste ? 1 : 0) ||
             a.saldo - b.saldo || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  }

  return { motoristas: lista(porMot, 'MOTORISTA', 'rotas'), usuarios: lista(porUsu, 'USUARIO', 'perfil') };
}

/**
 * Painel de Ativos: uma linha por TRAJETO.
 *
 * Antes cada linha era um LOCAL, e a Matriz aparecia com "Filial Maceió, João Pessoa"
 * juntos numa célula só. Mas "saiu da Matriz para João Pessoa" e "saiu da Matriz para a
 * Filial Maceió" são duas informações, com números próprios e cobranças próprias —
 * somadas numa linha, nenhuma das duas dá para conferir.
 *
 * O trajeto e a ida COM a volta dela: a remessa A→B e a devolucao B→A sao o mesmo caminho
 * visto nos dois sentidos, entao caem na mesma linha. E o que faz "saiu 1.690, voltou
 * 1.250, faltam 440" ser uma frase so.
 *
 * Efeito colateral bem-vindo: acabou a contagem dobrada. No modelo por local a mesma
 * remessa aparecia duas vezes — na linha da Matriz e na da rota — e por isso o galpao
 * precisava ficar fora dos totais. Um trajeto aparece uma vez, e os totais somam tudo.
 *
 * Quem tem estoque inicial (lancamento de AJUSTE) ganha uma linha propria, sem trajeto:
 * o saldo inicial e do LOCAL, nao de um caminho, e repeti-lo em cada trajeto dele
 * contaria o mesmo estoque varias vezes.
 */
function fluxoPorOrigem(dados, desde, meta, ate) {
  var movimentos = dados.movimentos || [];
  var locais = dados.locais || [];
  meta = Number(meta) || 90;

  var nomesLocais = mapaNomes(locais);
  var nomesTipos = mapaTipos(dados.tipos || []);
  var porId = {};
  locais.forEach(function (l) { porId[String(l.ID)] = l; });

  /* chave do trajeto: sempre "quem despachou > quem recebeu". A devolucao entra pela
     chave invertida, que e a mesma viagem de volta. */
  /* A chave leva o DIA junto. Sem ele, uma remessa nova para o mesmo destino somava na
     linha do dia anterior e desaparecia como lancamento: a tabela mostrava 2.500 numa
     linha datada de 16/09, sem dizer que 810 daquilo eram do dia 17.

     Cada dia e uma linha, entao a tabela se le como extrato de verdade — que e o que a
     coluna de saldo corrido ja prometia. */
  var tr = {};
  function trajeto(de, para, dia) {
    var k = String(de) + '>' + String(para) + '|' + dia;
    if (!tr[k]) {
      tr[k] = { de: String(de), para: String(para), dia: dia, saida: 0, retorno: 0, n: 0,
                saidaTipo: {}, retornoTipo: {}, desde: null };
    }
    return tr[k];
  }

  var inicio = {};

  ativos(movimentos).forEach(function (m) {
    /* O ajuste entra ANTES do recorte de periodo, de proposito. Saldo inicial e posicao,
       nao movimento: se ele saisse da conta por ter sido lancado mes passado, a coluna
       zeraria sozinha na virada do mes e o saldo final passaria a mentir. */
    if (m.Tipo === 'AJUSTE') {
      if (m.DestinoID) {
        // tambem por dia: dois ajustes em datas diferentes sao dois lancamentos
        var kIni = String(m.DestinoID) + '|' + soData(m.DataRef);
        if (!inicio[kIni]) inicio[kIni] = { local: String(m.DestinoID), qtd: 0, n: 0,
                                            dia: m.DataRef };
        inicio[kIni].qtd += efetiva(m);
        inicio[kIni].n++;
      }
      return;
    }
    /* Sem recorte de periodo AQUI, de proposito. O saldo corrido de uma linha e o
       acumulado de tudo que veio antes dela — inclusive do que o filtro esconde. Cortando
       antes de somar, filtrar 17/09 fazia a linha abrir no saldo de 15/09 e ignorar as
       movimentacoes do dia 16: o numero da tela contradizia a operacao.
       O recorte acontece depois, na hora de escolher o que se MOSTRA. */
    var q = efetiva(m);          // devolução não confirmada vale 0, e vale a contada
    if (!q) return;
    if (!m.OrigemID || !m.DestinoID) return;   // perda nao e viagem: nao tem as duas pontas

    var caixa = nome(nomesTipos, m.TipoCaixaID);
    var sentido = sentidoDoMovimento(m.Tipo);
    /* A remessa define a direcao do trajeto; a devolucao fecha o mesmo caminho, por isso
       entra na chave invertida. Uma devolucao sem remessa nenhuma abre um trajeto no
       sentido da ida que ela esta desfazendo. */
    var dia = soData(m.DataRef);
    var t = (sentido === 'ENTRADA') ? trajeto(m.DestinoID, m.OrigemID, dia)
                                    : trajeto(m.OrigemID, m.DestinoID, dia);
    var lado = (sentido === 'ENTRADA') ? 'retorno' : 'saida';
    t[lado] += q;
    t.n++;
    // a data do primeiro lancamento do caminho: e por ela que a lista se ordena
    if (!t.desde || m.DataRef < t.desde) t.desde = m.DataRef;
    var mapa = (sentido === 'ENTRADA') ? t.retornoTipo : t.saidaTipo;
    if (caixa) mapa[caixa] = (mapa[caixa] || 0) + q;
  });

  function tipoDe(id) { return (porId[String(id)] || {}).Tipo || ''; }

  var linhas = [];

  Object.keys(tr).forEach(function (k) {
    var t = tr[k];
    var c = classificaFluxo(t.saida, t.retorno, DESVIO_RUIM);
    /* O tipo da linha e o de quem RECEBEU: e ele que esta com a caixa, e e por ele que os
       chips Rotas / Filiais / Clientes separam a lista. */
    linhas.push({
      id: k, nome: nome(nomesLocais, t.para), tipo: tipoDe(t.para),
      sub: t.n + (t.n === 1 ? ' lançamento' : ' lançamentos'),
      origens: [nome(nomesLocais, t.de)],
      destinos: [nome(nomesLocais, t.para)],
      lancamentos: t.n,
      saidaTipos: detalharTipos(t.saidaTipo),
      retornoTipos: detalharTipos(t.retornoTipo),
      inicial: 0,
      data: t.desde ? iso(t.desde) : '',
      saida: t.saida, retorno: t.retorno,
      saldoFinal: t.retorno - t.saida,
      saldo: c.saldo, desvio: c.desvio, situacao: c.situacao
    });
  });

  /* As linhas de estoque inicial. Sem trajeto: o saldo inicial e do local, e espalha-lo
     pelos caminhos dele contaria o mesmo estoque uma vez por caminho. */
  Object.keys(inicio).forEach(function (k) {
    var e = inicio[k];
    if (!e.qtd) return;
    linhas.push({
      id: 'ini:' + k, nome: nome(nomesLocais, e.local), tipo: tipoDe(e.local),
      sub: e.n + (e.n === 1 ? ' lançamento' : ' lançamentos'),
      origens: [nome(nomesLocais, e.local)],
      destinos: [],
      estoqueInicial: true,
      lancamentos: e.n,
      saidaTipos: [], retornoTipos: [],
      inicial: e.qtd,
      data: iso(e.dia),
      saida: 0, retorno: 0,
      saldoFinal: e.qtd,
      saldo: 0, desvio: null, situacao: 'parado'
    });
  });

  /* A lista se le como um extrato, e num extrato quem manda e a DATA. Dentro do mesmo
     dia o estoque lancado abre, e os caminhos daquele dia vem depois — e essa a leitura
     de "o que eu tinha quando o dia comecou, e o que fiz com isso".

     O estoque vinha antes da data na comparacao, e ai TODOS os estoques subiam para o
     topo da tabela: um lancamento de saldo inicial feito no dia 17 aparecia grudado no do
     dia 15, acima das movimentacoes do dia 16, como se tivesse sido lancado antes delas.
     A ordem tambem e a ordem em que o saldo corre, entao o acumulado saia errado junto.

     O ensaio continua vindo antes de tudo na comparacao, para acabar no fim da lista.
     Data e tipo iguais caem no nome, senao a lista dança a cada carregamento. */
  linhas.sort(function (a, b) {
    return pesoTeste(a.nome) - pesoTeste(b.nome) ||
           String(a.data).localeCompare(String(b.data)) ||
           (b.estoqueInicial ? 1 : 0) - (a.estoqueInicial ? 1 : 0) ||
           String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });

  /* O saldo corre sobre TODAS as linhas, na ordem, antes de qualquer recorte: o saldo
     final de uma e o inicial da seguinte, mais o estoque lancado naquele dia.

       1.250 (inicial) − 1.690 (saida) + 1.250 (retorno) = 810
        810            −   810         +     0           =   0

     Feito aqui e nao na tela porque a tela so tem as linhas do periodo pedido, e o
     acumulado de uma linha depende do que veio ANTES dela — inclusive de fora da
     janela. */
  var acumulado = 0;
  linhas.forEach(function (l) {
    l.iniCorrido = acumulado + (l.inicial || 0);
    l.fimCorrido = l.iniCorrido - l.saida + l.retorno;
    acumulado = l.fimCorrido;
  });

  /* So agora o recorte de periodo. As linhas de fora saem da tela levando consigo apenas
     a propria visibilidade: o que elas somaram ja esta no saldo das que ficaram. */
  if (desde || ate) {
    linhas = linhas.filter(function (l) {
      var d = data(l.data);
      if (desde && d < desde) return false;
      if (ate && d > ate) return false;
      return true;
    });
  }

  var comMovimento = linhas.filter(function (l) { return l.situacao !== 'parado'; });
  var tSaida = 0, tRetorno = 0, porTipo = { ROTA: 0, FILIAL: 0, CLIENTE: 0 };
  comMovimento.forEach(function (l) {
    tSaida += l.saida; tRetorno += l.retorno;
    porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1;
  });

  /* O deficit soma por CAMINHO, e nao por linha, agora que cada dia e uma linha. Uma
     remessa no dia 16 e a devolucao dela no dia 18 sao duas linhas: somando os negativos
     linha a linha, o dia da remessa entraria inteiro no deficit e o dia da devolucao nao
     abateria nada — "caixas que sairam e nao voltaram" contaria o que ja voltou. */
  var porCaminho = {};
  comMovimento.forEach(function (l) {
    var k = l.id.split('|')[0];
    porCaminho[k] = (porCaminho[k] || 0) + l.saldo;
  });
  var deficit = 0;
  Object.keys(porCaminho).forEach(function (k) {
    if (porCaminho[k] < 0) deficit += -porCaminho[k];
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
function painel(dados, hoje, p) {
  hoje = hoje || new Date();
  p = p || {};
  var locais = dados.locais, tipos = dados.tipos, movimentos = dados.movimentos;
  var sal = saldos(movimentos);
  var prazoPadrao = Number(dados.config.diasPrazoPadrao) || 7;
  var prazos = {};
  locais.forEach(function (l) { prazos[l.ID] = Number(l.DiasPrazo) || prazoPadrao; });
  var ag = aging(movimentos, prazos, hoje);
  var emConf = emConferencia(movimentos);

  /* Os KPIs do topo seguem sempre o mes corrente — sao os numeros do mural. O periodo
     escolhido na tela vale para o Painel de Ativos, que e onde se responde "quanto saiu e
     voltou neste intervalo". Misturar os dois faria o mural mudar de sentido sem aviso. */
  var ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  var fluxoIni = p.de ? data(p.de) : ini;
  var fluxoFim = p.ate ? fimDoDia(data(p.ate)) : null;
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
           pesoMatriz(a.nome) - pesoMatriz(b.nome) ||
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
    periodo: { de: soData(fluxoIni), ate: fluxoFim ? soData(fluxoFim) : '' },
    fluxo: fluxoPorOrigem(dados, fluxoIni, Number(dados.config.metaRetorno) || 90, fluxoFim),
    fluxoPessoas: fluxoPorPessoa(dados, fluxoIni, fluxoFim)
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
      /* O painel restrito volta junto. Esquecido aqui, o formulario abriria sempre em
         "ve os lancamentos de todos" e a gravacao seguinte apagaria a restricao — e a
         renovacao da sessao a tiraria de quem ja a tinha, calada. */
      SoProprios: u.SoProprios === true,
      VerLancamentos: u.VerLancamentos !== false,
      UsuariosVistos: usuariosVistosDe(u),
      /* As SEIS listas de permissão voltam para o painel. Esquecer uma aqui não dá
         erro nenhum: o formulário abre com ela desmarcada e a gravação seguinte escreve
         vazio por cima do que estava salvo. Foi o que aconteceu com TiposCaixa e
         Motoristas — por isso o teste de simetria logo abaixo desta função. */
      Saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
      Destinos: Array.isArray(u.Destinos) ? u.Destinos : [],
      TiposCaixa: Array.isArray(u.TiposCaixa) ? u.TiposCaixa : [],
      Motoristas: Array.isArray(u.Motoristas) ? u.Motoristas : [],
      Operacoes: Array.isArray(u.Operacoes) ? u.Operacoes : [],
      Ajustes: Array.isArray(u.Ajustes) ? u.Ajustes : [],
      Abas: Array.isArray(u.Abas) ? u.Abas : []
    };
  });
}

module.exports = {
  loginUnico: loginUnico,
  VAZIA_LIBERA: VAZIA_LIBERA, podeItem: podeItem, peneirarPor: peneirarPor,
  localDoAjuste: localDoAjuste, podeAjustarEm: podeAjustarEm,
  TIPOS_MOV: TIPOS_MOV, PERFIS: PERFIS, TIPOS_LOCAL: TIPOS_LOCAL,
  rotuloTipo: rotuloTipo, mapaTipos: mapaTipos,
  motoristasPublicos: motoristasPublicos, cnhVencida: cnhVencida,
  data: data, fimDoDia: fimDoDia, iso: iso, soData: soData,
  mapaNomes: mapaNomes, nome: nome, ativos: ativos, naoCancelados: naoCancelados,
  naLixeira: naLixeira, listaLixeira: listaLixeira, ultimaAlteracao: ultimaAlteracao,
  loteDo: loteDo,
  montarExclusao: montarExclusao, montarRestauracao: montarRestauracao,
  montarCancelamento: montarCancelamento,
  ehPerfilTeste: ehPerfilTeste, temTeste: temTeste, pesoTeste: pesoTeste, pesoMatriz: pesoMatriz,
  lancamentoDeTeste: lancamentoDeTeste, recorteTeste: recorteTeste,
  recorteProprios: recorteProprios, usuariosVistosDe: usuariosVistosDe, ativo: ativo, novoId: novoId, novoToken: novoToken,
  acharPorIdentificador: acharPorIdentificador, loginPorSenha: loginPorSenha,
  meuAcesso: meuAcesso,
  fluxoPorOrigem: fluxoPorOrigem, fluxoPorPessoa: fluxoPorPessoa,
  cicloDaCarga: cicloDaCarga, rotuloCiclo: rotuloCiclo,
  loginPorPin: loginPorPin, sessaoDe: sessaoDe,
  montarMovimento: montarMovimento, montarConferencia: montarConferencia,
  montarCorrecao: montarCorrecao, CORRIGIVEIS: CORRIGIVEIS,
  JANELA_CORRECAO_MIN: JANELA_CORRECAO_MIN, diaDaOperacao: diaDaOperacao,
  livreAte: livreAte, correcaoLivre: correcaoLivre,
  efetiva: efetiva, saldos: saldos, emConferencia: emConferencia, aging: aging,
  pendentes: pendentes, listaMovimentos: listaMovimentos, painel: painel,
  descricao: descricao, extrato: extrato, extratoToken: extratoToken,
  usuariosPublicos: usuariosPublicos, podeVerPainel: podeVerPainel, podeConferir: podeConferir,
  normalizarPerfil: normalizarPerfil, perfisConhecidos: perfisConhecidos,
  locaisPermitidos: locaisPermitidos, motoristasDaRota: motoristasDaRota,
  ehVolante: ehVolante,
  OPERACOES: OPERACOES, operacaoDoTipo: operacaoDoTipo, podeOperacao: podeOperacao,
  ABAS: ABAS, podeAba: podeAba,
  SITUACOES: SITUACOES, rotuloCiclo: rotuloCiclo
};
