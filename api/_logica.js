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
  /* "AJUSTES" NAO DIZIA O QUE ERA. Esta pagina lanca ajuste de saldo e baixa de perda —
     ela MEXE NO ESTOQUE. O nome generico a fazia parecer configuracao do sistema, e foi
     ao lado das configuracoes que ela morava no menu. */
  { ID: 'pgLancar',     Nome: 'Ajuste Estoque', sensivel: true },
  { ID: 'pgMovimentos', Nome: 'Movimentos' },
  /* Preferencia de quem olha, e nao dado da operacao: escolher colunas nao muda saldo
     nenhum. Por isso nao e `sensivel` — quem ve uma tabela pode arrumar a propria. */
  { ID: 'pgColunas',    Nome: 'Colunas' },
  /* A APARENCIA vale para a empresa inteira, e por isso quem troca e o administrador.
     Nao ganha marca nenhuma no catalogo, pela MESMA razao do Colunas: `sensivel` diria
     "so por marca explicita", e nao e disso que se trata. Quem esconde o botao e o
     PERFIL, no desenho do menu, junto do Colunas.

     NAO VOLTAR COM `soAdmin`. Ele ja existiu aqui e saiu a pedido: o administrador
     concede qualquer aba a quem quiser, e uma trava por perfil no catalogo tirava isso
     dele. Ha uma assercao no `teste_api.js` escrita para segurar essa volta. */
  { ID: 'pgAparencia',  Nome: 'Aparência' },
  /* O VIDEO. Sem dado nenhum para ver: e a demonstracao de como se lanca, a mesma
     que o app de campo abre no primeiro acesso. Entra no catalogo como qualquer
     outra — o menu so mostra o que ESTE catalogo conhece, e o botao dela ficou
     escondido no ar por nao estar aqui. */
  /* A TELA QUE EXPLICA O SISTEMA a quem esta dentro dele. Como as duas abaixo, nao
     mostra dado de operacao: mostra quem entrou e o que essa pessoa pode abrir. */
  { ID: 'pgInstrucoes', Nome: 'Instruções' },
  { ID: 'pgVideo',      Nome: 'Vídeo Tutorial' },
  /* OS DOIS TUTORIAIS SEPARADOS, um por gesto: saida e retorno sao coisas diferentes,
     e quem vai fazer uma delas agora nao quer esperar a outra terminar. O tutorial
     completo continua existindo para quem quer os dois seguidos. */
  { ID: 'pgTutorialSaida',   Nome: 'Tutorial de Saída' },
  { ID: 'pgTutorialRetorno', Nome: 'Tutorial de Retorno' },
  /* OS LANCAMENTOS DO MOTORISTA. Aba propria, e nao um filtro de Movimentos, por uma
     razao que nao e de arrumacao: a contagem do conferente tem de ser CEGA. Se ele
     puder ler o que o motorista declarou antes de contar, ele copia o numero — e a
     comparacao entre os dois passa a nao comparar nada.
     Por isso esta aba faz mais do que abrir uma tela: e ela que decide quem RECEBE
     declaracao, em qualquer rota. Ver `veDeclaracao`. */
  /* O ID NAO MUDA COM O NOME. Ele esta gravado na marca de abas de quem ja recebeu esta
     tela; trocado, todo mundo perderia o acesso a ela no mesmo instante, e ninguem
     ligaria uma coisa a outra. O nome e o que aparece; o id e o que vale. */
  { ID: 'pgLancamentosMotorista', Nome: 'Motorista/Conferente' },
  /* A MESMA LISTA, COM MENOS COLUNAS. Movimentos Motoristas existe para COMPARAR duas
     contas — o que o motorista declarou e o que o conferente contou —, e por isso leva a
     diferenca entre elas. Esta responde outra pergunta, mais curta: quanto ele declarou,
     e se ja' conferiram. Sao as duas unicas colunas de numero e de estado.
     ABA PROPRIA, e nao um filtro da outra: quem abre esta nao quer a conta de
     divergencia na tela, e uma coluna escondida continua sendo uma coluna que se pode
     reabrir sem querer — e a contagem cega nao sobrevive a um "sem querer". */
  { ID: 'pgLancamentoMotorista', Nome: 'Lançamento Motorista' },
  /* O MANUAL, pela mesma razao do video: texto que explica o sistema, sem dado nenhum
     dentro. As tres passam pela marca como qualquer outra: houve tempo em que chegavam
     a todo mundo que entrasse, e um motorista com uma aba marcada via quatro. */
  { ID: 'pgManual',     Nome: 'Manual de Uso' },
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
 * A CASA E NOSSA: galpao e filial.
 *
 * Caixa parada numa casa nossa e ESTOQUE; caixa parada num cliente ou num caminhao e
 * divida de alguem. A filial estava do lado errado dessa linha — somada com os clientes
 * em "caixas em poder de terceiros" —, e por isso o estoque dela nunca aparecia no total
 * e ela entrava no aging como se houvesse alguem a cobrar. Cobrar a filial e cobrar de
 * casa.
 *
 * A MESMA DUPLA QUE O PAINEL JA USA (`ehTipoDeUnidade`, em admin.html), e e por isso que
 * ela mora numa funcao: escrita solta nos dois lugares, o dia em que entrasse um terceiro
 * tipo de casa ela entraria num e ficaria faltando no outro — e aí uma tela conta como
 * estoque o que a outra cobra como divida.
 */
function ehCasaNossa(tipo) {
  var t = String(tipo == null ? '' : tipo).toUpperCase();
  return t === 'GALPAO' || t === 'FILIAL';
}

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
/* OS VEÍCULOS QUE O APP DE CAMPO PODE VER. Sai a placa, o modelo e o motorista
   habitual — é ele que a saída usa para preencher o campo sozinha. `Obs` fica de fora:
   é anotação de oficina, não interessa a quem lança.

   Só os ATIVOS: carro vendido ou parado não some do cadastro, porque o histórico aponta
   para ele, mas não pode aparecer na lista de quem vai lançar hoje. */
function veiculosPublicos(veiculos) {
  return (veiculos || [])
    .filter(function (v) { return v.Ativo !== false; })
    .map(function (v) {
      return { ID: v.ID, Placa: v.Placa, Modelo: v.Modelo || '', Tipo: v.Tipo || '',
               MotoristaID: v.MotoristaID || '' };
    })
    .sort(function (a, b) {
      return pesoTeste(a.Placa) - pesoTeste(b.Placa) ||
             String(a.Placa).localeCompare(String(b.Placa), 'pt-BR');
    });
}

/**
 * COMO ESTA PESSOA E CHAMADA NA OPERACAO.
 *
 * O apelido e o nome de trabalho: no galpao ele e 'Isaque', e e assim que quem lanca o
 * procura numa lista de treze nomes. O nome completo e o do cadastro, da CNH e do
 * relatorio. Os dois existem e nenhum substitui o outro.
 *
 * ESCRITO AQUI, NUM LUGAR SO. A lista do app, a lista do painel, o que a linha grava e o
 * que o CSV exporta leem daqui — quatro copias de `Apelido || Nome` divergem no dia em
 * que alguem esquecer o `.trim()` numa delas, e ai a mesma pessoa aparece com dois nomes
 * em duas telas.
 *
 * SEM APELIDO E O NOME INTEIRO, e nao vazio: a maioria dos treze nao vai ter apelido
 * nenhum, e uma lista com linhas em branco e pior do que uma lista com nomes longos.
 */
function comoChamar(m) {
  var ap = String((m && m.Apelido) || '').trim();
  return ap || String((m && m.Nome) || '').trim();
}

/**
 * NOME E SOBRENOME, para onde o espaco e curto — a saudacao e o rodape do painel.
 *
 * O PRIMEIRO E O ULTIMO, e nao os dois primeiros: 'Jose Carlos da Silva Urbano' lido
 * pelos dois primeiros vira 'Jose Carlos', que e como ninguem o chama; pelo primeiro e o
 * ultimo vira 'Jose Urbano', que e como ele assina.
 * UM NOME SO CONTINUA SENDO ELE MESMO — a regra nao pode inventar sobrenome.
 */
function nomeESobrenome(nome) {
  var p = String(nome || '').trim().split(/\s+/).filter(function (x) { return x !== ''; });
  if (p.length < 2) return p[0] || '';
  return p[0] + ' ' + p[p.length - 1];
}

/* ================= EM QUE SENTIDO O MOTORISTA ATENDE ESTA ROTA =================
 *
 * `Rotas` diz QUAIS rotas. Esta funcao responde, para uma delas, se ele faz a saida, a
 * entrada ou as duas.
 *
 * AUSENTE QUER DIZER AMBAS, e e' por isso que ninguem perde nada: a rota marcada sempre
 * valeu para os dois sentidos, e quem nunca abrir este campo continua exatamente como
 * estava. So' quem escolher um sentido passa a ser filtrado por ele.
 *
 * SO' O TIPO FORNECEDOR tem sentido por rota, a pedido. Ele nasceu do carro que traz
 * fruta e leva vasilhame: os dois sentidos nao sao a mesma viagem. Para os outros
 * tipos, um sentido gravado por engano — numa troca de tipo, por exemplo — nao pode
 * passar a esconder o motorista de metade da operacao sem ninguem ter pedido.
 *
 * E' UMA FUNCAO PURA e mora aqui porque o app de campo e o painel perguntam a mesma
 * coisa. Escrita nos dois, a primeira correcao que so' um recebesse faria a lista do
 * celular discordar do cadastro que a gerou. */
var SENTIDOS_ROTA = ['ambas', 'saida', 'entrada'];

function sentidoDaRota(motorista, rotaId) {
  var m = motorista || {};
  if (String(m.Tipo || '').toUpperCase() !== 'FORNECEDOR') return 'ambas';
  var mapa = (m.RotasSentido && typeof m.RotasSentido === 'object') ? m.RotasSentido : {};
  var v = String(mapa[String(rotaId)] || '').toLowerCase();
  return SENTIDOS_ROTA.indexOf(v) > 0 ? v : 'ambas';
}

function atendeNoSentido(motorista, rotaId, sentido) {
  var s = String(sentido || '').toLowerCase();
  /* SEM SENTIDO PERGUNTADO, nao ha o que filtrar: e' o caso de quem so' quer saber se
     ele atende a rota, sem direcao — e responder "nao" ali esconderia o motorista de
     uma tela que nem pergunta isso. */
  if (s !== 'saida' && s !== 'entrada') return true;
  var dele = sentidoDaRota(motorista, rotaId);
  return dele === 'ambas' || dele === s;
}

function motoristasPublicos(motoristas) {
  return (motoristas || [])
    .filter(function (m) { return m.Ativo !== false; })
    // A rota atendida entra: não é dado pessoal, e é o que deixa o celular filtrar a lista
    // sem uma segunda chamada. CPF, CNH e telefone continuam de fora.
    .map(function (m) {
      /* O APELIDO VIAJA e o nome completo tambem: o celular mostra um e grava os
         dois. Apelido nao e dado pessoal — e como a pessoa e chamada no galpao. */
      /* O SENTIDO DE CADA ROTA VIAJA JUNTO, pelo mesmo motivo que a rota: e' o que
         deixa o celular montar a lista certa sem uma segunda chamada. Nao e' dado
         pessoal — e' escala de trabalho. */
      return { ID: m.ID, Nome: m.Nome, Apelido: m.Apelido || '', Tipo: m.Tipo || '',
               Rotas: Array.isArray(m.Rotas) ? m.Rotas : [],
               RotasSentido: (m.RotasSentido && typeof m.RotasSentido === 'object')
                 ? m.RotasSentido : {} };
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
/* O QUE VALE. Fora o cancelado e o que esta na lixeira, sai tambem a DECLARACAO: ela
   existe como linha e nao existe como movimento — e quem chama esta funcao e todo mundo
   que SOMA (saldo, aging, painel, extrato, fluxo por pessoa).
   E a unica peneira desses seis: escrita em cada um deles, o setimo nasceria sem ela e
   contaria a declaracao no estoque sem dar erro nenhum — so um numero plausivel. */
function ativos(movimentos) {
  return movimentos.filter(function (m) {
    return !m.Cancelado && !m.ExcluidoEm && !ehDeclaracao(m);
  });
}

/** O avesso: o que está na lixeira, e só. */
function naLixeira(movimentos) {
  return movimentos.filter(function (m) { return !!m.ExcluidoEm; });
}

/* AS LINHAS QUE EXISTEM. Era apelido de `ativos` e deixou de ser no dia em que nasceu um
   lancamento que EXISTE e NAO VALE: a declaracao do motorista. A lista de Movimentos e o
   ciclo da carga chamam esta — eles mostram o que aconteceu, e esconder a declaracao
   deixaria a pessoa com uma tabela cujo total nao bate com o saldo e sem nada na tela
   dizendo por que. */
function naoCancelados(movimentos) {
  return movimentos.filter(function (m) { return !m.Cancelado && !m.ExcluidoEm; });
}

/* DECLARACAO: o motorista informa o que trouxe, e quem conta e o conferente. A linha
   existe, aparece e nao entra em conta nenhuma.
   LIDA DA LINHA, e nao do cadastro de quem lancou: no cadastro, promover um motorista a
   conferente faria as declaracoes dele de meses atras passarem a contar, de uma vez e em
   silencio. E a mesma razao do nome do motorista e da placa, que o lancamento guarda
   como texto. */
function ehDeclaracao(m) {
  return !!m && m.Declaracao === true;
}

/* OS QUATRO LIVROS, e o nome de cada um. Escrito aqui, num lugar so: a tela, o CSV e o
   seletor do app de campo leem daqui, e tres copias do mesmo nome divergem no dia em que
   alguem renomeia um deles numa so.

   A ORDEM E A DE QUANTO CADA LIVRO PESA NA OPERACAO, e ela e a mesma no cadastro, no
   filtro, na coluna da tabela e no seletor do app: quatro ordens diferentes para as
   mesmas quatro palavras fazem a pessoa reler a lista toda vez.

   OS IDS NAO SAO OS NOMES. `teste` continua sendo o id do ensaio de producao porque e o
   que esta gravado em milhares de linhas; renomea-lo seria apagar e recriar dado para
   trocar uma palavra que so aparece na tela. */
var BASES = [
  { id: 'reais',      nome: 'Base Produção',         campo: 'BaseProducao' },
  { id: 'teste',      nome: 'Base Teste Produção',   campo: 'Teste' },
  { id: 'declaracao', nome: 'Base Declaração',       campo: 'BaseDeclaracao' },
  { id: 'testeDecl',  nome: 'Base Teste Declaração', campo: 'BaseTesteDeclaracao' }
];

function nomeDaBase(id) {
  var b = BASES.filter(function (x) { return x.id === String(id); })[0];
  return b ? b.nome : '';
}

/* AS BASES QUE ESTA PESSOA TEM, na ordem em que o app as oferece.
 *
 * As tres convivem: producao, ensaio e declaracao sao livros diferentes, e o escritorio
 * decidiu que a mesma pessoa pode escrever em mais de um — os relatorios os leem
 * separados. Quando ha mais de uma, quem escolhe e ela, lancamento a lancamento. */
function basesDoUsuario(u) {
  return BASES.filter(function (b) { return !!u && u[b.campo] === true; })
              .map(function (b) { return b.id; });
}

/* AS BASES QUE VALEM DE VERDADE, com o caso de ninguem resolvido NUM LUGAR SO'.
 *
 * Sem nenhuma marcada, a gravacao ja' tratava a pessoa como se fosse de Producao — era
 * um `if (!tem.length) return 'reais'` dentro de `baseEscolhida`, e so' la'. A peneira
 * de LEITURA que nasce agora precisa da mesma resposta: dando lista vazia, a pessoa
 * lancaria na Producao e nao enxergaria o proprio lancamento. Duas respostas diferentes
 * para a mesma pergunta e' o tipo de divergencia que ninguem relaciona com a causa. */
function basesEfetivas(u) {
  var tem = basesDoUsuario(u);
  return tem.length ? tem : ['reais'];
}

/* ================= O LIVRO E' DO CADASTRO, E NAO DO PEDIDO =================
 *
 * `recorteTeste` ja' existia e peneira pelo que a TELA pediu — e' o filtro "Lancamentos"
 * da gaveta. Isto aqui e' a outra pergunta, e ela estava sem resposta: o que esta pessoa
 * PODE ver. Sem ela, o conferente marcado so' na Base Teste Producao recebia as linhas
 * da Producao e as via na tabela, nos cartoes e no saldo — a peneira existia e era a do
 * pedido, que e' justamente quem nao pode decidir isso.
 *
 * E' O MESMO DESENHO DE `recorteProprios` e de `recorteDeclaracao`: a permissao sai do
 * CADASTRO de quem pergunta, e o pedido nao opina. Os tres se somam, e a ordem nao
 * importa.
 *
 * ELE NAO VAI NA ROTA DA CONCILIACAO, e isto e' decisao e nao esquecimento: la' cada par
 * tem as duas metades em LIVROS diferentes — a declaracao do motorista num, a contagem
 * do conferente noutro — e quem governa aquela tela e' `veDeclaracao`. Peneirando por
 * base, metade de cada par sumiria e a tabela diria "So declaracao" para todo mundo. */
function recorteBases(dados, usuario) {
  /* NAO HA' EXCECAO, NEM PARA O ADMINISTRADOR, e isto foi decidido duas vezes.
   *
   * Houve uma: quando esta peneira nasceu, o painel do administrador ficou vazio — o
   * cadastro dele diz "Base Producao", porque e' nela que ele lanca, e a operacao inteira
   * desta empresa esta' hoje na Base Teste Producao. Eu abri uma excecao para ele.
   *
   * A EXCECAO CRIOU UMA CONTRADICAO PIOR: o filtro "Lancamentos" da gaveta le' o
   * cadastro e mostrava so' "Base Producao", enquanto a tabela ao lado mostrava linha
   * atras de linha marcada "Teste Producao". A tela afirmava duas coisas opostas ao
   * mesmo tempo, e quem olha nao tem como saber qual acreditar.
   *
   * A REGRA PEDIDA E' UMA SO': a base vem do cadastro, e de mais lugar nenhum. Quem
   * precisa ver outro livro marca esse livro no proprio cadastro — e' uma caixa, e quem
   * a marca e' o administrador, que e' justamente quem estava trancado.
   *
   * O QUE NAO PODE E' A TELA FICAR VAZIA E CALADA. Por isso a mensagem de "nenhum
   * movimento" passa a dizer QUAIS livros esta pessoa tem, quando ela nao tem todos. */
  var tem = basesEfetivas(usuario);
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (m) {
    return tem.indexOf(baseDoMovimento(m)) >= 0;
  });
  return copia;
}

/**
 * EM QUE BASE ESTE LANCAMENTO ENTRA.
 *
 * O pedido diz qual ela escolheu; o CADASTRO diz quais ela pode escolher. Sem a segunda
 * metade, um pedido montado a mao mandaria para a producao a contagem de quem so
 * declara — e o estoque mudaria por causa de uma informacao.
 *
 * SEM ESCOLHA POSSIVEL, nao ha o que perguntar: uma base so, e e ela.
 *
 * E SEM RESPOSTA, QUANDO HA ESCOLHA, devolve nulo — e a rota RECUSA. Adivinhar aqui e o
 * pior dos caminhos: chutar producao faz uma declaracao baixar estoque, chutar
 * declaracao faz um retorno de verdade sumir da conta, e nos dois casos ninguem fica
 * sabendo. Recusado, quem esta com o dedo na tela conserta na hora.
 *
 * A EXCECAO E O MUNDO DE ANTES: quem tem so producao e ensaio continua sendo entendido
 * pelo `teste` do pedido, que e o que os aparelhos com a fila cheia ainda mandam.
 */
function baseEscolhida(u, p) {
  var tem = basesDoUsuario(u);
  /* O CASO DE NINGUEM MORA EM `basesEfetivas`, e a resposta aqui e' a mesma que a
     peneira de leitura da': escritas separadas, a pessoa lancaria num livro e leria
     outro. */
  if (!tem.length) return basesEfetivas(u)[0];
  if (tem.length === 1) return tem[0];
  var pedida = String((p && p.base) || '').trim();
  if (pedida) return tem.indexOf(pedida) >= 0 ? pedida : null;
  if (tem.indexOf('declaracao') < 0) {
    var velho = p && (p.teste === true || String(p.teste) === 'true');
    return velho ? 'teste' : 'reais';
  }
  return null;
}

/**
 * QUEM PODE VER DECLARACAO.
 *
 * A contagem do conferente e CEGA: se ele ler o que o motorista declarou antes de
 * contar, ele copia o numero, e a comparacao entre os dois deixa de comparar. Entao a
 * declaracao nao e so uma tela a mais — e um dado que so chega a quem foi habilitado.
 *
 * DECIDIDO NO SERVIDOR, e nao escondendo a aba: esconder o botao e conveniencia; quem
 * filtra "Base Declaracao" na lista de Movimentos passa por cima dela. E a lista, o
 * extrato, a lixeira e o CSV leem do mesmo lugar.
 *
 * A MARCA SAO AS ABAS QUE MOSTRAM DECLARACAO, numa lista so: `ABAS_DE_DECLARACAO`.
 * Nao e' uma permissao nova ao lado delas — duas marcas para a mesma pergunta divergem
 * no primeiro cadastro em que alguem mexer so' numa, e ai a tela mostra o que a lista
 * esconde, ou o contrario.
 *
 * A REGRA DE QUEM ENTRA NA LISTA: toda tela que mostre o numero DECLARADO pelo
 * motorista. Nasceu com uma; quando "Lancamento Motorista" apareceu, mostrando a mesma
 * coluna com menos companhia, ela entrou junto — fora dali, quem recebesse so' a tela
 * nova abriria uma pagina que o servidor recusa, e a pessoa leria "sem permissao" numa
 * aba que lhe foi concedida.
 *
 * ADMIN SEM MARCA NENHUMA VE, pela mesma regra do painel: lista vazia quer dizer "todas"
 * so para ele, que e a origem da concessao.
 */
/* QUEM ESTA PERGUNTANDO, achado uma vez. Antes a busca vivia dentro do ;
   com a contagem cega passaram a ser duas perguntas sobre a MESMA pessoa, e duas buscas
   escritas separadas sao duas chances de uma delas comparar o id de outro jeito. */
function acharUsuario(usuarios, quem) {
  var id = String(quem == null ? '' : quem).trim();
  if (!id) return null;
  return (usuarios || []).filter(function (x) { return String(x.ID) === id; })[0] || null;
}

var ABAS_DE_DECLARACAO = ['pgLancamentosMotorista', 'pgLancamentoMotorista'];

function veDeclaracao(u) {
  if (!u) return false;
  var abas = Array.isArray(u.Abas) ? u.Abas : [];
  if (!abas.length) return ehAdministrador(u);
  return abas.some(function (a) { return ABAS_DE_DECLARACAO.indexOf(a) >= 0; });
}

/* A PENEIRA DA CONTAGEM CEGA, na porta — do mesmo jeito que `recorteTeste` e
   `recorteProprios`. Aplicada em cada consumidor, o proximo nasceria sem ela e
   entregaria a declaracao a quem nao pode ve-la, sem dar erro nenhum.
   OS DOIS LIVROS DE DECLARACAO passam por ela: o ensaio de uma declaracao continua
   sendo o numero que o motorista disse, e le-lo antes de contar estraga a contagem do
   mesmo jeito — inclusive durante o ensaio, que e quando se treina o habito. */
/* A DECLARACAO SAI DE MOVIMENTOS DE VEZ, e nao por filtro.
 *
 * Ela nao e movimento de caixa — e o que o motorista DISSE que trazia. Dentro de
 * Movimentos ela entrava nos cartoes de Saida, Retorno e Saldo, porque aqueles cartoes
 * somam o que chega ate eles: o estoque passava a contar duas vezes a mesma carga, uma
 * pela contagem do conferente e outra pela fala do motorista.
 *
 * TIRADA AQUI E NAO POR OPCAO DE FILTRO, de proposito. Por filtro, o pedido que nao
 * escolhesse base nenhuma continuaria trazendo tudo — e e esse o pedido que a tela faz
 * ao abrir. Sem opcao nenhuma, nao ha pedido que a traga: a contagem cega deixa de
 * depender de alguem lembrar de marcar. */
/* `dono` E A UNICA EXCECAO, e ela nao afrouxa nada: e a propria pessoa vendo o que ELA
 * mandou. A contagem cega protege o CONFERENTE de ler o numero do motorista antes de
 * contar — nao protege o motorista de si mesmo. Sem esta excecao, quem digitou 450 no
 * lugar de 540 nao tinha onde ver o erro, muito menos onde conserta-lo.
 * PELO ID DE QUEM LANCOU, e nunca pelo perfil: "motoristas veem declaracoes" daria a um
 * motorista a declaracao de outro, e ai a cega seria so a do conferente.
 * A rota de Movimentos chama SEM dono, e continua sem excecao nenhuma. */
function semDeclaracao(dados, dono) {
  var eu = String(dono == null ? '' : dono).trim();
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (m) {
    if (!ehDeclaracao(m)) return true;
    return !!eu && String(m.UsuarioID) === eu;
  });
  return copia;
}

/* OS DOIS MUNDOS DA CONCILIACAO, e cada um tem DUAS bases.
 *
 * O motorista declara num livro e o conferente conta em OUTRO: a declaracao de verdade
 * casa com a contagem da Base Producao, e o ensaio de uma declaracao casa com a
 * contagem da Base Teste Producao. Um filtro que trouxesse literalmente "so a base de
 * declaracao" traria metade de cada par, e a tela inteira diria "So declaracao" — que e
 * como se le uma carga que chegou e ninguem conferiu.
 *
 * O ID DO MUNDO E O DA BASE DE DECLARACAO DELE, para que o rotulo na tela seja o nome
 * que o cadastro ja usa. Quem escolhe "Base Declaracao" pede a conciliacao daquele
 * livro, e nao as linhas dele soltas. */
var MUNDOS = [
  { id: 'declaracao', nome: 'Base Declaração',       bases: ['declaracao', 'reais'] },
  { id: 'testeDecl',  nome: 'Base Teste Declaração', bases: ['testeDecl', 'teste'] }
];

/* VAZIO NAO TRAZ NADA — e esta funcao e a UNICA do projeto em que "vazio" nao quer
 * dizer "todas". A excecao e pensada, e o motivo e o que a distingue das outras
 * peneiras:
 *
 *   · motorista, situacao e tipo PENEIRAM o que ja veio. Vazias, elas nao abrem porta
 *     nenhuma: o que esta na tela ja estava autorizado a estar la.
 *   · esta escolhe QUAL LIVRO E LIDO. Vazia com o sentido de "todos", ela e uma
 *     permissao dada por omissao — e que cresce sozinha a cada livro novo, sem ninguem
 *     decidir nada. Hoje sao dois mundos; no dia em que houver um terceiro, quem nunca
 *     mexeu no filtro passaria a ler o terceiro tambem.
 *
 * E A MESMA REGRA QUE JA VALE PARA ESCREVER: quem tem mais de uma base para lancar
 * escolhe na hora, e o servidor RECUSA quando vem ambiguo. Ler segue a escrita.
 *
 * QUEM PEDE TEM DE DIZER. A rota recusa antes de chegar aqui; esta funcao e a segunda
 * tranca, para o dia em que alguem escrever um segundo consumidor e esquecer a
 * primeira — e ela tranca pela UNICA condicao que existe abaixo: um mundo so entra na
 * conta quando foi NOMEADO. Havia aqui um `if (!quais.length) return []` a mais, e ele
 * nao defendia de nada: com a lista vazia, nenhum mundo e nomeado e a resposta ja saia
 * vazia. Linha que nao muda resposta nenhuma e linha que nenhuma prova pode defender,
 * e que se le como se estivesse segurando algo. */
function recorteMundos(movimentos, pedidos) {
  var quais = (Array.isArray(pedidos) ? pedidos
               : String(pedidos == null ? '' : pedidos).split('|'))
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return !!x; });
  var livros = {};
  MUNDOS.forEach(function (m) {
    if (quais.indexOf(m.id) >= 0) {
      m.bases.forEach(function (b) { livros[b] = true; });
    }
  });
  return (movimentos || []).filter(function (m) {
    return livros[baseDoMovimento(m)] === true;
  });
}

/* OS MUNDOS QUE O PEDIDO CITOU, e so os que existem. Um nome desconhecido nao vira
   "todos" nem erro silencioso: ele simplesmente nao esta na conta, e a rota recusa
   porque sobrou lista vazia. */
function mundosPedidos(pedido) {
  var quais = (Array.isArray(pedido) ? pedido
               : String(pedido == null ? '' : pedido).split('|'))
    .map(function (x) { return String(x).trim(); });
  return MUNDOS.filter(function (m) { return quais.indexOf(m.id) >= 0; })
    .map(function (m) { return m.id; });
}

/* QUEM PODE MEXER NUMA DECLARACAO — e so nela.
 *
 * A regra NAO vale para os lancamentos comuns: la continua valendo o prazo do proprio
 * autor mais a senha do escritorio, que e o que o campo usa o dia inteiro. Trocar
 * aquilo por esta lista tiraria do conferente o conserto do proprio engano dez minutos
 * depois de come-lo, que nao foi o que se pediu.
 *
 * GESTOR ENTRA JUNTO. Ele esta ACIMA do Gerente na lista de perfis, e deixa-lo de fora
 * faria o cargo mais alto ter menos poder que o de baixo — confirmado com quem pediu. */
var PERFIS_DECLARACAO = ['ADMIN', 'GESTOR', 'GERENTE'];

function podeAlterarDeclaracao(u) {
  return !!u && PERFIS_DECLARACAO.indexOf(String(u.Perfil || '').toUpperCase()) >= 0;
}

/* A TRANCA MORA NA ROTA, e o perfil vem do CADASTRO.
 *
 * Esconder o botao na tela e cadeado pintado na porta: o POST direto passa do mesmo
 * jeito. E lido do pedido, o perfil seria escrito por quem manda o pedido — que e
 * justamente quem a regra pretende barrar.
 *
 * FECHA O CAMINHO INTEIRO: corrigir, cancelar, excluir e restaurar. Posta so em
 * "excluir", a mesma linha sairia de circulacao por um cancelamento sem motivo. */
function barraDeclaracao(mov, usuarios, quem) {
  if (!mov || !ehDeclaracao(mov)) return null;
  if (podeAlterarDeclaracao(acharUsuario(usuarios, quem))) return null;
  return { ok: false, erro: 'Só Admin, Gestor ou Gerente pode alterar uma declaração de motorista.' };
}

function recorteDeclaracao(dados, u) {
  if (veDeclaracao(u)) return dados;
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (m) {
    return !ehDeclaracao(m);
  });
  return copia;
}

/* EM QUE LIVRO ESTA LINHA ENTROU — um, entre os quatro.
 *
 * As duas perguntas que a linha responde sao DIFERENTES — "isto conta no estoque?" e
 * "isto e ensaio ou e de verdade?" —, e e por isso que os livros sao quatro e nao tres.
 * A linha ja guardava as duas respostas em colunas separadas; aqui elas viram o nome do
 * livro.
 *
 * UM LIVRO SO, e nao uma lista: com a declaracao de ensaio em dois livros ao mesmo tempo,
 * quem filtrasse "Base Teste Producao" receberia declaracao junto — e os dois sao coisas
 * que nao se somam.
 *
 * PRODUCAO E A AUSENCIA das outras marcas, e nao uma marca propria: uma linha que nao e
 * declaracao nem ensaio e a operacao. */
function baseDoMovimento(m) {
  var decl = ehDeclaracao(m);
  var ens = lancamentoDeTeste(m);
  if (decl && ens) return 'testeDecl';
  if (decl) return 'declaracao';
  return ens ? 'teste' : 'reais';
}

/**
 * O CAMINHO DE VOLTA: dado o livro, que marcas a linha precisa ter.
 *
 * `baseDoMovimento` LÊ em que livro a linha está; esta ESCREVE o livro nela. A correção
 * precisou da segunda: até aqui a base era decidida no instante do lançamento e nunca
 * mais, e um retorno lançado por engano na Produção só saía de lá por SQL no banco.
 *
 * AS DUAS ANDAM AMARRADAS POR UMA PROVA: para todo livro, `baseDoMovimento` das marcas
 * devolve o próprio livro. Escritas soltas, bastava um livro novo entrar numa e não na
 * outra para a correção mandar a linha para um lugar e a tela mostrá-la noutro — e as
 * duas estariam certas cada uma por si, que é o jeito de o erro durar.
 */
function marcasDaBase(id) {
  return { Teste: id === 'teste' || id === 'testeDecl',
           Declaracao: id === 'declaracao' || id === 'testeDecl' };
}

/* O NOME DO LIVRO sai de `BASES`, que é onde ele já mora: escrito de novo aqui, renomear
   um livro no cadastro deixaria o histórico dizendo o nome antigo para sempre — e
   histórico é justamente o que não se reescreve depois. */
function nomeDaBase(id) {
  var b = BASES.filter(function (x) { return x.id === id; })[0];
  return b ? b.nome : String(id == null ? '' : id);
}

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

/* Recorte por BASE: 'todos' (padrão), ou uma lista de bases colada por "|" — 'reais',
   'teste', 'declaracao'. Devolve uma cópia rasa com os movimentos peneirados, para que
   `painel()` e companhia não precisem saber que o recorte existe.

   A DECLARAÇÃO NÃO PRECISA SER TIRADA AQUI: quem soma passa por `ativos()`, e é lá que
   ela fica de fora, num lugar só. Esta função é sobre o que se QUER VER. */
function recorteTeste(dados, modo) {
  var pedidas = String(modo == null ? '' : modo).split('|')
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return !!x && x !== 'todos'; });
  if (!pedidas.length) return dados;
  var copia = {};
  Object.keys(dados).forEach(function (k) { copia[k] = dados[k]; });
  copia.movimentos = (dados.movimentos || []).filter(function (x) {
    return pedidas.indexOf(baseDoMovimento(x)) >= 0;
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

/* NINGUEM: um id que cadastro nenhum tem. Ele e o jeito de dizer "esta pessoa nao ve
   lancamento de ninguem" usando o MESMO caminho de "ela ve os destes tres" — sem ele,
   esse caso precisaria de um `if` proprio em cada rota, e o `if` esquecido numa delas e
   exatamente o defeito que esta mudanca veio consertar. */
var NINGUEM = '__ninguem__';

/**
 * DE QUEM ESTA PESSOA VE OS LANCAMENTOS — decidido AQUI, a partir do cadastro.
 *
 * Antes quem decidia era o navegador: a tela lia a permissao da sessao, montava a lista
 * e a mandava no pedido; o servidor obedecia. Duas consequencias, e as duas aconteceram:
 *
 *   1. A TELA QUE ESQUECE MOSTRA TUDO. A lista de Movimentos nao mandava recorte nenhum,
 *      e um motorista habilitado a ver apenas os proprios lancamentos via a operacao
 *      inteira — cinco outras telas mandavam, e por isso o defeito passou despercebido.
 *   2. O RECORTE ERA UM PEDIDO, e nao uma regra: quem montasse o pedido a mao escolhia o
 *      proprio recorte.
 *
 * Agora o pedido diz apenas QUEM esta perguntando, e o recorte sai do cadastro.
 *
 * SEM IDENTIDADE, NINGUEM: a rota devolve lista vazia em vez da base inteira. Esta e a
 * unica escolha segura para o valor que falta — o contrario transforma qualquer
 * esquecimento futuro no mesmo vazamento de novo.
 *
 * ISTO NAO E AUTENTICACAO, e nao adianta fingir que e: a API continua sem nenhuma, e
 * quem souber o id de outra pessoa pode perguntar como ela. O que esta regra elimina e a
 * classe de defeito em que a TELA decide o que pode ver.
 */
function idsVisiveis(usuarios, quem) {
  var id = String(quem == null ? '' : quem).trim();
  if (!id) return [NINGUEM];
  var u = (usuarios || []).filter(function (x) { return String(x.ID) === id; })[0];
  /* Cadastro apagado no meio da sessao: nao ve mais nada. Devolver tudo aqui seria
     premiar justamente o pedido que nao corresponde a ninguem. */
  if (!u) return [NINGUEM];
  if (u.VerLancamentos === false) return [NINGUEM];
  /* Lista vazia quer dizer TODOS — a convencao do projeto, e a unica segura: invertida,
     o dia em que a coluna nascesse vazia no banco ninguem veria nada. */
  return usuariosVistosDe(u);
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
/* QUEM É ADMINISTRADOR, num lugar só. A mesma pergunta era feita solta em três lugares,
   cada um escrevendo `String(u.Perfil).toUpperCase() === 'ADMIN'` por conta própria — e
   a quarta cópia é a que esquece o `toUpperCase`. */
function ehAdministrador(u) {
  return !!u && String(u.Perfil == null ? '' : u.Perfil).toUpperCase() === 'ADMIN';
}

function podeVerPainel(u) {
  if (!u || u.Ativo === false) return false;
  if (ehAdministrador(u)) return true;
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
    /* A foto de quem está logada, para o círculo do rodapé e o da barra. Sem ela na
       sessão, a lateral mostraria as iniciais de quem já pôs foto — e a pessoa
       concluiria que a foto não salvou. */
    foto: u.Foto || '',
    localPadrao: u.LocalPadrao, acessoPainel: podeVerPainel(u),
    /* QUANDO O ESCRITORIO REDEFINIU A CREDENCIAL. A sessao guarda o valor que valia na
       hora em que a pessoa entrou; a renovacao compara com o de agora e, diferindo,
       encerra a sessao. Sem isto, redefinir a senha de alguem nao tirava essa pessoa de
       dentro — ela seguia lancando, e a senha nova so' valia no proximo login.
       VAZIO E' "NAO SEI", e nao "nunca": sessao aberta antes desta coluna existir nao
       tem carimbo, e expulsa-la seria deslogar a equipe inteira no deploy. */
    credencialEm: u.CredencialEm || '',
    /* SE ESTA PESSOA CORRIGE LANCAMENTO. Na sessao porque quem decide se MOSTRA o botao
       e' a tela, e ela so' tem a sessao na mao. A tranca de verdade continua na rota. */
    podeCorrigir: u.PodeCorrigir !== false,
    saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
    destinos: Array.isArray(u.Destinos) ? u.Destinos : [],
    /* DE ONDE A CAIXA VOLTA. Lista propria desde 14/10/2026: antes a origem do retorno
       lia `destinos`, e os dois rotulos do cadastro queriam dizer uma coisa na Saida e a
       oposta no Retorno. */
    retornos: Array.isArray(u.Retornos) ? u.Retornos : [],
    // Mesma convenção das outras: lista vazia quer dizer NENHUM — marcar é conceder.
    tiposCaixa: Array.isArray(u.TiposCaixa) ? u.TiposCaixa : [],
    motoristas: Array.isArray(u.Motoristas) ? u.Motoristas : [],
    veiculos: Array.isArray(u.Veiculos) ? u.Veiculos : [],
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
    /* JA VIU O TUTORIAL? E o que decide se o app de campo abre no tutorial ou direto
       nos lancamentos. Vem na sessao porque a decisao e tomada na abertura, antes de
       qualquer outra ida a rede — buscando-a depois, a pessoa veria o app por um
       instante e seria jogada para o tutorial com o dedo ja a caminho de um botao. */
    viuTutorial: u.ViuTutorial === true,
    /* AS DUAS BASES VAO NA SESSAO porque e o app de campo que precisa delas: com as
       duas marcadas, a tela de lancamento pergunta em qual delas o lancamento entra.
       Buscadas numa ida a rede na hora de gravar, o app ficaria sem a pergunta
       justamente quando o galpao esta sem sinal — que e quando ele mais lanca. */
    baseTeste: u.Teste === true,
    baseProducao: u.BaseProducao === true,
    baseDeclaracao: u.BaseDeclaracao === true,
    baseTesteDeclaracao: u.BaseTesteDeclaracao === true,
    /* SE JA VIU A APRESENTACAO. Vai na sessao porque e ela que decide o que a tela de
       boas-vindas mostra no instante seguinte ao login — esperar a `equipe` chegar para
       descobrir faria a apresentacao piscar para quem ja a viu. */
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
/* ================= O FORNECEDOR DA CARGA =================
 *
 * O FORNECEDOR E' O PROPRIO MOTORISTA, e essa foi a virada. A primeira versao pedia um
 * campo a parte no lancamento, lido de um cadastro proprio de fornecedores. Na operacao
 * de verdade quem chega com a carga do fornecedor E' o motorista dele, ja' cadastrado
 * com nome, apelido, placa e rotas — e digitar o fornecedor de novo era a mesma
 * informacao pedida duas vezes, com duas chances de divergir.
 *
 * ENTAO A REGRA MUDOU DE PERGUNTA: quando o lancamento toca um local marcado, o que se
 * exige nao e' mais um NOME digitado — e' que quem dirigiu seja um motorista do tipo
 * FORNECEDOR, cadastrado. O campo saiu da tela, e a coluna `Fornecedor` do movimento
 * passa a ser preenchida pelo servidor a partir do motorista: um dado so', uma fonte
 * so'.
 *
 * AS DUAS PONTAS CONTAM. Na saida o fornecedor e' o DESTINO; no retorno, a ORIGEM. Uma
 * regra que olhasse so' um lado deixaria metade da operacao sem conferencia — e seria a
 * metade que varia conforme a tela.
 *
 * AJUSTE E PERDA ficam de fora: nascem no escritorio, mexem no saldo de um local so' e
 * nao sao viagem de caixa. Exigir motorista neles trancaria o administrador fora do
 * proprio ajuste.
 *
 * Devolve a frase do erro, ou null quando esta' tudo certo. */
function ehMotoristaFornecedor(m) {
  return !!m && String(m.Tipo || '').toUpperCase() === 'FORNECEDOR';
}

/* QUEM E' ESTE MOTORISTA NO CADASTRO, procurado pelo nome de TRABALHO — que e' o que o
   movimento grava — e tambem pelo nome do cadastro, para as linhas gravadas antes de o
   apelido existir continuarem podendo ser corrigidas. As duas portas levam ao mesmo
   cadastro. */
function acharMotorista(motoristas, nome) {
  var alvo = String(nome == null ? '' : nome).trim().toLowerCase();
  if (!alvo) return null;
  return (motoristas || []).filter(function (m) {
    var n = String(m.Nome || '').trim().toLowerCase();
    var ap = String(m.Apelido || '').trim().toLowerCase();
    return n === alvo || (ap && ap === alvo);
  })[0] || null;
}

function pontasQuePedemFornecedor(p, locais) {
  var tipo = String(p.tipo || '').toUpperCase();
  if (tipo === 'AJUSTE' || tipo === 'PERDA') return [];
  function local(id) {
    if (!id) return null;
    return (locais || []).filter(function (l) {
      return String(l.ID) === String(id);
    })[0] || null;
  }
  return [local(p.origemId), local(p.destinoId)].filter(function (l) {
    return l && l.PedeFornecedor === true;
  });
}

/* O FORNECEDOR SAI DO CADASTRO DE FORNECEDORES, e nao mais do de motoristas.
 *
 * POR QUE MUDOU: os vinte e oito estavam cadastrados nos DOIS lugares, e o lado do
 * motorista eram cascas — zero CPF, zero CNH, zero telefone, zero placa, zero rota
 * marcada. O unico campo preenchido era `Empresa`, e o que estava escrito nele era a
 * LOCALIDADE ("Fornecedor - Macaparana"): faltando onde por o dado, o escritorio dobrou
 * um campo para ele caber. Campo dobrado e' sintoma de cadastro errado — e era o de
 * motorista que estava errado para esta gente.
 *
 * O CADASTRO DE FORNECEDORES tem exatamente o que falta: Nome, Apelido e Localidade,
 * preenchida nos vinte e oito.
 *
 * A BUSCA E' A MESMA DE MOTORISTA — nome de trabalho ou nome do cadastro —, de
 * proposito: sao a mesma pergunta feita a outra lista, e duas formas de procurar um
 * nome divergem no primeiro acento. */
function acharFornecedor(fornecedores, nome) {
  return acharMotorista(fornecedores, nome);
}

function conferirFornecedor(p, locais, fornecedores) {
  var pontas = pontasQuePedemFornecedor(p, locais);
  if (!pontas.length) return null;

  var nome = String(p.motorista || '').trim();
  if (!nome) {
    return 'Escolha o fornecedor: ' + pontas[0].Nome +
      ' só recebe lançamento com um fornecedor do cadastro.';
  }
  var f = acharFornecedor(fornecedores, nome);
  if (!f) {
    return 'Fornecedor fora do cadastro: ' + nome +
      '. Cadastre-o em Cadastros → Fornecedores para poder lançar nele.';
  }
  /* INATIVO NAO ENTRA EM LANCAMENTO NOVO, e continua escrito nos antigos. E' a mesma
     regra de todo cadastro daqui, e e' ela que deixa aposentar um fornecedor sem
     reescrever o historico. */
  if (!ativo(f.Ativo)) {
    return 'Fornecedor inativo: ' + nome +
      '. Reative-o em Cadastros → Fornecedores para lançar nele.';
  }
  return null;
}

/* O NOME DO FORNECEDOR QUE VAI PARA A LINHA, derivado do CADASTRO — e nao digitado.
 *
 * Derivado AQUI, no servidor, e nao mandado pela tela: a tela esconder o campo e'
 * conveniencia, e um POST direto chegaria sem ele. Com uma fonte so', a coluna
 * `Fornecedor` de Movimentos nunca pode discordar da coluna `Motorista` da mesma linha.
 *
 * E' o nome de TRABALHO — o apelido quando existe —, o mesmo que a coluna Motorista
 * guarda: duas grafias da mesma pessoa partiriam o relatorio em dois. */
function fornecedorDoMovimento(p, locais, fornecedores) {
  if (!pontasQuePedemFornecedor(p, locais).length) return '';
  var f = acharFornecedor(fornecedores, p.motorista);
  if (!f) return '';
  /* O NOME DO CADASTRO, e nao o apelido.
     As duas colunas da linha respondem perguntas diferentes: `Motorista` diz QUEM
     DIRIGIU, pelo nome de trabalho — e' por ele que o galpao chama a pessoa —, e
     `Fornecedor` diz DE QUEM E A CARGA, que e' o que vai para a cobranca. Com o apelido
     nas duas, a linha mostra "Mundinho | Mundinho": o mesmo texto repetido, e nenhuma
     das duas perguntas respondida por inteiro. */
  return String(f.Nome || f.Apelido || '').trim();
}

/* ================= OS DOIS NOMES, COMO A TELA OS MOSTRA =================
 *
 * O movimento guarda o nome COPIADO — e' isso que faz o historico sobreviver a um
 * cadastro apagado, e nao muda. O que muda aqui e' a LEITURA: estando a pessoa no
 * cadastro, a tela mostra o que o cadastro diz HOJE.
 *
 * POR QUE: o escritorio renomeia. Trocado o apelido de um fornecedor, as linhas
 * antigas continuavam com o texto de ontem e as novas saiam com o de hoje — o mesmo
 * sitio partido em dois no relatorio, e os dois plausiveis.
 *
 * O QUE CADA COLUNA RESPONDE:
 *   Motorista  -> o APELIDO, o nome de trabalho de quem dirigiu;
 *   Fornecedor -> o NOME do cadastro, que e' o que se cobra.
 *
 * SUMINDO DO CADASTRO, VALE O QUE ESTA GRAVADO. E' a garantia que o projeto sempre deu
 * e que esta funcao nao tira: quem foi apagado continua escrito na linha, com o nome
 * que tinha no dia. Sem este `||`, apagar um cadastro esvaziaria a coluna de todas as
 * viagens dele — apagar o cadastro reescreveria o passado.
 *
 * E A COLUNA FORNECEDOR SO' E' RESOLVIDA QUANDO A LINHA JA' TEM UMA: numa viagem comum
 * ela e' vazia, e buscar o nome no cadastro de fornecedores ali inventaria um
 * fornecedor para uma carga que nao tinha nenhum — bastaria a mesma pessoa aparecer
 * nos dois cadastros.
 */
function nomesDaLinha(m, motoristas, fornecedores) {
  var gravado = String((m && m.Motorista) || '').trim();
  var gravadoForn = String((m && m.Fornecedor) || '').trim();
  /* DUAS PORTAS PARA O MESMO CADASTRO, e e' isto que faz o renome chegar nas linhas
     ja' gravadas.
     A linha guarda TEXTO, e nao id — e' o que a faz sobreviver a um cadastro apagado.
     O preco e' que trocar o texto no cadastro corta o fio: gravado o apelido de ontem,
     `acharFornecedor` nao acha mais ninguem com ele.
     ENTAO SE PROCURA PELOS DOIS TEXTOS que a linha guarda: o da coluna Motorista e o da
     coluna Fornecedor. Como a coluna Fornecedor passou a guardar o NOME do cadastro —
     que e' o que menos muda —, trocar o apelido deixa de cortar o fio.
     O LIMITE, dito em voz alta: mudando o nome E o apelido de uma vez, nenhuma das duas
     portas acha, e a linha mostra o que esta' gravada. E' o mesmo piso de sempre. */
  function doCadastro(txt) {
    if (!txt) return null;
    return acharMotorista(motoristas, txt) || acharFornecedor(fornecedores, txt);
  }
  /* A COLUNA MOTORISTA SO' SE RESOLVE PELO TEXTO DELA, e nunca pelo da coluna
     Fornecedor. Achar o fornecedor por aquele outro texto nao autoriza reescrever QUEM
     DIRIGIU: numa linha corrigida a mao, em que o motorista e' outro, a tela passaria a
     mostrar o nome do fornecedor ao volante — e seria uma mentira sobre a pessoa, que e'
     o tipo de erro que este sistema existe para nao cometer.
     Foi uma prova desta bancada que pegou isso; o preco esta' logo abaixo, escrito.
     MOTORISTAS PRIMEIRO, que e' o caso comum; o fornecedor entra depois porque ele
     tambem dirige, e desde que saiu do cadastro de motoristas e' la' que ele esta'. */
  var pessoa = doCadastro(gravado);
  var apelido = pessoa ? String(pessoa.Apelido || pessoa.Nome || '').trim() : '';
  var f = gravadoForn ? (acharFornecedor(fornecedores, gravado) ||
                         acharFornecedor(fornecedores, gravadoForn)) : null;
  return {
    motorista: apelido || gravado,
    fornecedor: f ? (String(f.Nome || f.Apelido || '').trim() || gravadoForn)
                  : gravadoForn
  };
}

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
  /* O REGISTRO E UM SO PARA O ENVIO INTEIRO, e sai da PRIMEIRA linha dele.
     Por que herdado e nao uma sequencia propria: o id da linha e chave primaria, entao
     dois envios simultaneos nao conseguem gravar o mesmo — e o registro herda essa
     defesa de graca. Numerado a parte, com o 'maior + 1' lido antes de gravar, ele seria
     o unico codigo do sistema sem protecao contra repeticao, e dois R000012 diferentes
     acabam com a unica coisa que o codigo serve para fazer.
     O preco e que os numeros pulam de quatro em quatro numa carga de quatro caixas. Ele
     e um codigo, e nao uma contagem. */
  itens.forEach(function (item, idx) {
    var ck = base + '-' + idx;
    if (existentes[ck]) { jaExistiam.push({ id: existentes[ck], duplicado: true }); return; }
    var id = novoId('M', proximos);
    var linha = {
      ID: id,
      ClientKey: ck,
      /* Preenchido depois do laco, quando se sabe qual foi a primeira linha GRAVADA:
         num reenvio em que parte dos itens ja existe, a primeira do laco nao e a
         primeira do envio. */
      Registro: '',
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
      /* O COMPLETO CAI NO CURTO quando nao vier: e o que acontece com quem nao tem
         apelido, e com qualquer tela antiga que ainda mande um nome so. Deixar nulo
         aqui faria a coluna do relatorio nascer vazia para metade dos lancamentos. */
      MotoristaNome: String(p.motoristaNome || p.motorista || '').trim() || null,
      /* A PLACA, na mesma forma do cadastro: sem hífen, sem espaço, em caixa alta.
         Se o movimento guardasse "abc-1d23" e o cadastro "ABC1D23", um relatório
         por veículo listaria o mesmo carro duas vezes.
         A REGRA É A MESMA DA CORREÇÃO, e por isso mora fora daqui: escrita nos dois
         lugares, ela divergiria no primeiro ajuste que só um deles recebesse. */
      Veiculo: placa(p.veiculo) || null,
      /* O NOME, e nao o id: a mesma decisao do motorista e da placa. O cadastro pode
         ser renomeado ou sair de uso, e o que ja saiu do galpao continua dizendo de
         quem era a caixa.
         VEM DO `ctx`, E NUNCA DO PEDIDO. O fornecedor e' DERIVADO do motorista, e quem
         deriva e' a rota, contra o cadastro. Lendo `p.fornecedor`, um pedido montado a
         mao escreveria o nome que quisesse na coluna — e ela passaria a discordar da
         coluna Motorista da mesma linha, as duas plausiveis. Ignorando o pedido, o pior
         caso vira uma coluna VAZIA, que se ve'. */
      Fornecedor: String((ctx && ctx.fornecedor) || '').trim() || null,
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
      Teste: ctx.teste === true || p.teste === true || String(p.teste) === 'true',
      /* SÓ DO CADASTRO, e nunca do payload: "isto é declaração" não é uma escolha que se
         faça lançamento a lançamento. Aceitar do pedido abriria o caminho para um
         retorno de verdade entrar como informação — e sumir do estoque sem sumir da
         tela. */
      Declaracao: ctx.declaracao === true
    };
    linhas.push(linha);
    proximos.push(linha);
  });

  /* E AQUI O ENVIO GANHA O NOME DELE. Uma volta a mais depois do laco, e nao dentro:
     dentro, a primeira iteracao ainda nao sabe se vai gravar alguma coisa — um envio
     inteiro pode cair no `jaExistiam` e nao ter linha nenhuma. */
  var reg = linhas.length ? 'R' + String(linhas[0].ID).replace(/[^0-9]/g, '') : '';
  linhas.forEach(function (l) { l.Registro = reg; });

  return { ok: true, linhas: linhas, jaExistiam: jaExistiam, status: status,
           registro: reg };
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

/**
 * A FORMA DA PLACA: sem hífen, sem espaço, em caixa alta.
 *
 * Escrita num lugar só porque ela vale nos DOIS caminhos — o lançamento e a correção.
 * Se o lançamento guardasse `ABC1D23` e a correção `abc-1d23`, um relatório por veículo
 * listaria o MESMO carro duas vezes, e o total de cada um estaria certo e errado ao
 * mesmo tempo. O lançamento já fazia isso; a correção nasceu depois e não fazia.
 */
function placa(v) {
  return String(v == null ? '' : v).replace(/[-\s]/g, '').trim().toUpperCase();
}

/* DUAS FORMAS VALEM: a antiga, ABC1234, e a Mercosul, ABC1D23. A tela tambem confere,
   e isso aqui nao e' repeticao: a tela e' conveniencia, e um POST direto passa por cima
   dela. Desde que a placa pode ser DIGITADA, sem esta guarda a coluna Veiculo viraria
   campo livre — "caminhao do ze" numa planilha de placas.
   VAZIO CONTINUA VALENDO: ha lancamento sem veiculo, e quem decide se o campo e'
   obrigatorio e' o formulario. */
var PLACA_FORMATO = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

function placaAceitavel(v) {
  var p = placa(v);
  return !p || PLACA_FORMATO.test(p);
}

var CORRIGIVEIS = [
  { campo: 'Qtd', rotulo: 'quantidade', numero: true },
  { campo: 'QtdConferida', rotulo: 'conferida', numero: true },
  { campo: 'DataRef', rotulo: 'data', data: true },
  { campo: 'OrigemID', rotulo: 'origem', mapa: 'locais' },
  { campo: 'DestinoID', rotulo: 'destino', mapa: 'locais' },
  { campo: 'TipoCaixaID', rotulo: 'tipo de caixa', mapa: 'tipos' },
  // O motorista é gravado pelo nome, não por id: não há o que mapear.
  { campo: 'Motorista', rotulo: 'motorista' },
  /* O NOME COMPLETO ANDA COM O CURTO. Sem ele aqui, trocar o motorista de uma linha
     reescrevia só metade do par: a coluna Motorista passava a dizer o nome novo e a
     Motorista (completo) continuava dizendo o antigo — a mesma viagem com dois nomes
     diferentes, e o relatório por motorista partido em duas pessoas.
     ENTRADA PRÓPRIA NO HISTÓRICO, e não escondida: quem lê o histórico tem de ver que os
     dois campos mudaram, senão a linha muda sozinha aos olhos de quem confere. */
  { campo: 'MotoristaNome', rotulo: 'motorista (nome completo)' },
  /* A PLACA NÃO SE CORRIGIA EM LUGAR NENHUM. Ela é gravada no lançamento, aparece na
     coluna Veículo e no relatório por carro — e trocar de caminhôo em cima da hora é o
     mais comum que existe no galpão. Lançada errada, ela ficava errada para sempre, e a
     única saída era cancelar o lançamento e refazê-lo.
     NORMALIZADA, pela mesma razão do lançamento: duas grafias da mesma placa fazem o
     relatório por veículo listar o mesmo carro duas vezes. */
  { campo: 'Veiculo', rotulo: 'veículo', normaliza: placa },
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

/**
 * AS LINHAS DE UMA CARGA, pelo código do registro.
 *
 * O lançamento é feito de uma vez — quatro tipos de caixa num toque em Enviar — e vira
 * quatro linhas. Corrigir a carga uma linha de cada vez é abrir quatro formulários,
 * digitar o mesmo motivo quatro vezes e a mesma senha quatro vezes, e basta desistir no
 * terceiro para a carga ficar metade corrigida e metade não.
 *
 * CANCELADA E EXCLUÍDA FICAM DE FORA: `montarCorrecao` as recusa uma a uma de qualquer
 * jeito, e com elas dentro a carga inteira seria recusada por causa de uma linha que
 * ninguém queria mexer.
 *
 * REGISTRO VAZIO NÃO CASA COM NADA. As linhas gravadas antes de a coluna existir têm o
 * registro em branco; sem esta recusa, um pedido sem registro juntaria TODAS elas numa
 * carga só e uma correção de quantidade cairia sobre dezenas de lançamentos alheios.
 */
function linhasDoRegistro(movimentos, registro) {
  var reg = String(registro == null ? '' : registro).trim();
  if (!reg) return [];
  return (movimentos || []).filter(function (m) {
    return String(m.Registro || '').trim() === reg && !m.Cancelado && !m.ExcluidoEm;
  });
}

/* COMO SE ESCREVE UM VALOR NO HISTORICO, nas duas formas, num lugar so': a correcao e o
   restauro gravam o mesmo tipo de entrada, e escrito duas vezes o dia em que um campo
   novo precisasse de tratamento so' um dos dois o receberia. */
function legivelDe(c, v, nomes) {
  if (c.data) return soData(v);
  if (v === null || v === undefined) return '';
  return c.mapa && nomes && nomes[c.mapa] ? nome(nomes[c.mapa], v) : String(v);
}
function cruDe(c, v) {
  if (v === null || v === undefined) return '';
  if (c.data) return iso(v);
  if (c.numero) return Number(v);
  return String(v);
}

/**
 * O QUE DA' PARA DESFAZER.
 *
 * So' uma CORRECAO se desfaz: a consulta nao mudou nada, e um restauro ja' e' o desfazer
 * de alguma coisa — marcar o restauro como desfazivel faria o par ir e voltar para
 * sempre no mesmo lugar. Deixando-o de fora, apertar Restaurar de novo anda mais um
 * passo para tras, que e' o que se espera de um desfazer.
 *
 * E SO' O QUE TEM O VALOR CRU. As correcoes feitas antes deste campo existir guardaram
 * apenas o texto legivel; reconstruir o id a partir do nome acertaria quase sempre, e o
 * "quase" aqui e' mandar carga para o lugar errado sem avisar ninguem.
 */
function podeRestaurar(h) {
  return !!(h && h.campoId && h.deCru !== undefined && h.deCru !== null &&
            !h.restauro && String(h.campo || '') !== MARCA_CONSULTA);
}

/**
 * O RESTAURO: desfaz a ULTIMA correcao, e deixa rastro de que desfez.
 *
 * UMA CORRECAO DE CADA VEZ, e nao "volta ao original": a carga pode ter sido corrigida
 * tres vezes por tres razoes, e jogar tudo fora de uma vez desfaz duas que ninguem
 * pediu para desfazer. Um passo por toque e' previsivel, e dois toques andam dois
 * passos.
 *
 * O GRUPO INTEIRO DAQUELE INSTANTE, e nao uma linha: uma correcao mexe em varios campos
 * de uma vez — trocar o motorista reescreve o nome curto e o completo juntos —, e
 * desfazer so' um deixaria a linha com metade de cada versao.
 *
 * O RESTAURO ENTRA NO HISTORICO como qualquer mudanca. Desfazer sem deixar rastro
 * transformaria o historico num lugar onde se pode apagar o que incomoda, que e' o
 * oposto do que ele existe para fazer.
 */
function montarRestauro(mov, p, agora, nomes, guarda) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  /* MESMA TRANCA DA CORRECAO: desfazer uma correcao e' corrigir de volta. Uma porta
     mais barata para o mesmo estrago seria a porta que se usa. */
  if (guarda && guarda.quem && !corrigeLancamento(guarda.quem)) {
    return { ok: false, erro: 'Seu cadastro não permite corrigir lançamentos.' };
  }
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento está na lixeira.' };
  if (mov.Cancelado) return { ok: false, erro: 'Movimento cancelado não se restaura.' };
  var motivo = String(p.motivo || '').trim();
  if (!motivo) return { ok: false, erro: 'Descreva o motivo do restauro.' };

  agora = agora || new Date();
  guarda = guarda || {};
  /* A MESMA TRANCA DA CORRECAO: restaurar muda o dado como corrigir muda, e uma porta
     mais barata para o mesmo estrago seria a porta que se usa. */
  if (!correcaoLivre(mov, p.usuarioId, agora) && guarda.senhaOk !== true) {
    return {
      ok: false, precisaSenha: true,
      erro: guarda.senhaErrada
        ? 'Senha incorreta.'
        : 'Passaram os ' + JANELA_CORRECAO_MIN + ' minutos de conserto livre. Informe a ' +
          'senha do escritório.'
    };
  }

  var hist = (mov.Historico || []);
  /* CADA RESTAURO DIZ QUAL CORRECAO DESFEZ, e e' por isso que o segundo toque anda de
     verdade. Sem essa marca, o varredor so' pulava os restauros e caia de novo na
     correcao que o restauro anterior ja' tinha desfeito: ele regravava o mesmo valor que
     ja' estava la', o toque nao fazia nada visivel, e o historico ganhava uma linha
     dizendo que mudou de 200 para 200. */
  var desfeitos = {};
  hist.forEach(function (h) {
    if (h && h.restauro && h.desfez) desfeitos[String(h.desfez)] = true;
  });
  function aindaDesfazivel(h) {
    return podeRestaurar(h) && !desfeitos[String(h.em)];
  }
  var i = hist.length - 1;
  while (i >= 0 && !aindaDesfazivel(hist[i])) i--;
  if (i < 0) {
    return { ok: false, erro: 'Não há correção para restaurar neste lançamento.' };
  }
  var quando = hist[i].em;
  var porCampo = {};
  CORRIGIVEIS.forEach(function (c) { porCampo[c.campo] = c; });

  var patch = {}, entradas = [];
  hist.forEach(function (h) {
    if (!aindaDesfazivel(h) || h.em !== quando) return;
    var c = porCampo[h.campoId];
    if (!c) return;
    var valor = c.data ? data(h.deCru) : (c.numero ? Number(h.deCru) : String(h.deCru));
    if (c.numero && isNaN(valor)) return;
    patch[c.campo] = valor;
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: c.rotulo, motivo: motivo,
      de: legivelDe(c, mov[c.campo], nomes), para: legivelDe(c, valor, nomes),
      campoId: c.campo, deCru: cruDe(c, mov[c.campo]), paraCru: cruDe(c, valor),
      restauro: true, desfez: quando
    });
  });
  if (!entradas.length) {
    return { ok: false, erro: 'Não há correção para restaurar neste lançamento.' };
  }
  return { ok: true, patch: patch, historico: hist.concat(entradas),
           entradas: entradas, desfez: quando };
}

/* A PESSOA PODE CORRIGIR?
 *
 * A TELA ESCONDER NAO BASTA, e nunca bastou: esconder botao e' conveniencia, e um POST
 * direto passa por cima dela. A rota pergunta de novo, e e' esta a resposta que vale.
 *
 * AUSENTE E' SIM, como no cadastro: a coluna nasceu `default true` para nao tirar da
 * operacao inteira, no instante do deploy, o conserto do proprio engano de dedo. Quem
 * nao deve corrigir e' marcado um a um.
 */
/**
 * A FOTO DE PERFIL QUE A PROPRIA PESSOA MANDA.
 *
 * UMA PORTA ESTREITA, e nao `salvarUsuario`: aquela aceita o cadastro inteiro, e usa-la
 * para isto ensinaria a tela a mandar perfil, abas e permissoes num pedido que so'
 * deveria trocar um retrato. Aqui so' a foto passa.
 *
 * SO' IMAGEM, E COM TETO. O que chega e' um `data:` montado pelo navegador depois de
 * comprimir — mas quem manda para esta rota nao e' so' a nossa tela, porque a API nao
 * tem autorizacao nenhuma. Sem conferir o tipo, um `data:text/html` viraria foto; sem
 * teto, um arquivo de dez megabytes entraria na linha do cadastro e viajaria em TODA
 * leitura de equipe depois disso.
 *
 * VAZIO APAGA, de proposito: e' como se tira a foto e se volta as iniciais.
 */
function fotoDePerfil(valor) {
  var s = String(valor == null ? '' : valor).trim();
  if (!s) return { ok: true, foto: '' };
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) {
    return { ok: false, erro: 'Envie uma imagem PNG, JPG ou WEBP.' };
  }
  /* 400 mil caracteres sao uns 300 KB de imagem — folga larga para o retrato de 320px
     que a tela comprime, e teto para o que nao veio dela. */
  if (s.length > 400000) {
    return { ok: false, erro: 'Imagem grande demais. Escolha uma menor.' };
  }
  return { ok: true, foto: s };
}

function corrigeLancamento(u) {
  return !!u && u.PodeCorrigir !== false;
}

function montarCorrecao(mov, p, agora, nomes, guarda) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  /* `guarda.quem` e' o CADASTRO de quem pediu, e nao o id: quem o busca e' a rota, que
     tem a lista na mao. Ausente, a guarda nao roda — e quem chamar sem ela cai no lado
     que PERMITE, porque este caminho e' o do campo, que sempre pode consertar o proprio
     engano dentro da janela. A tranca nova e' para quem foi marcado, e marcar exige
     cadastro: sem cadastro em maos nao ha marca para ler. */
  if (guarda && guarda.quem && !corrigeLancamento(guarda.quem)) {
    return { ok: false, erro: 'Seu cadastro não permite corrigir lançamentos.' };
  }
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
      /* A FORMA VEM ANTES DA COMPARAÇÃO. Comparado cru, digitar `abc-1d23` sobre
         `ABC1D23` parecia mudança, gravava, e o histórico registrava uma correção que
         não corrigiu nada — além de partir o carro em dois no relatório. */
      novo = c.normaliza ? c.normaliza(novo) : String(novo);
      if ((c.normaliza ? c.normaliza(velho) : String(velho || '')) === novo) return;
    }
    patch[c.campo] = novo;
    /* O LEGIVEL E O CRU, LADO A LADO.
       O legivel e' para quem LE o historico: "origem: de Caruaru para Joao Pessoa". O
       cru e' para quem o DESFAZ — e' o id, a data e o numero como estao na linha. Sem
       ele o restauro teria de adivinhar o id a partir do nome, e dois locais de mesmo
       nome o mandariam para o lugar errado calado. */
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: c.rotulo, motivo: motivo,
      de: legivelDe(c, velho, nomes), para: legivelDe(c, novo, nomes),
      campoId: c.campo, deCru: cruDe(c, velho), paraCru: cruDe(c, novo)
    });
  });

  /* ---------- A BASE: O LIVRO EM QUE O LANÇAMENTO VIVE ----------
   *
   * ELA NÃO ESTÁ EM `CORRIGIVEIS`, e não é esquecimento: aquela lista casa UM pedido com
   * UMA coluna, e o livro sai do PAR `Teste`/`Declaracao`. Forçada lá dentro, ou ela
   * mexeria em metade do par — e uma carga acabaria metade na produção e metade no
   * ensaio —, ou o histórico registraria "teste: de false para true", que não é uma
   * frase que alguém leia seis meses depois.
   *
   * SÓ O ADMINISTRADOR, e SEMPRE com a senha do escritório. Mudar de livro tira as
   * caixas do saldo de alguém no instante do clique, como o excluir — e, ao contrário
   * dele, não há lixeira de onde voltar: a volta é outra correção. A senha é exigida
   * AINDA DENTRO dos dez minutos de conserto livre, porque aquela janela existe para o
   * engano de dedo do próprio autor, e não para mudar o livro de uma carga inteira.
   *
   * A RECUSA É DA ROTA, e não da tela: esconder o seletor é conveniência, e um POST
   * direto passa por cima dele.
   */
  var baseAgora = baseDoMovimento(mov);
  var basePedida = String(p.base == null ? '' : p.base).trim();
  if (basePedida && basePedida !== baseAgora) {
    if (!BASES.some(function (b) { return b.id === basePedida; })) {
      return { ok: false, erro: 'Base desconhecida: ' + basePedida + '.' };
    }
    if (!ehAdministrador(guarda.quem)) {
      return { ok: false, erro: 'Só o administrador muda a base de um lançamento.' };
    }
    if (guarda.senhaConferida !== true) {
      return {
        ok: false, precisaSenha: true,
        erro: guarda.senhaErrada
          ? 'Senha incorreta.'
          : 'Mudar a base pede a senha do escritório, mesmo dentro dos ' +
            JANELA_CORRECAO_MIN + ' minutos de conserto livre: o lançamento muda de ' +
            'livro e sai do saldo no mesmo instante.'
      };
    }
    /* O PERFIL DE TESTE VENCE A COLUNA, e por isso a saída do ensaio é RECUSADA em vez
       de gravada em silêncio: `lancamentoDeTeste` responde sim se a coluna disser sim OU
       se quem lançou tiver "teste" no perfil. Gravando `Teste:false` numa linha dessas, a
       rota diria "corrigido: base" e a tela continuaria mostrando o lançamento no ensaio
       — a pior forma de não funcionar, porque ela afirma ter funcionado. */
    var marcas = marcasDaBase(basePedida);
    if (!marcas.Teste && ehPerfilTeste(mov.Perfil)) {
      return { ok: false, erro: 'Este lançamento foi feito por alguém com "teste" no ' +
        'perfil, e por isso conta como ensaio pelo AUTOR, e não pela base — mudar a ' +
        'base não o tiraria de lá. Troque "quem fez o envio" ou o perfil da pessoa.' };
    }
    patch.Teste = marcas.Teste;
    patch.Declaracao = marcas.Declaracao;
    entradas.push({
      em: iso(agora), por: String(p.usuarioId || ''), campo: 'base', motivo: motivo,
      de: nomeDaBase(baseAgora), para: nomeDaBase(basePedida),
      campoId: 'base', deCru: baseAgora, paraCru: basePedida
    });
  }

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

/**
 * DESFAZER UM CANCELAMENTO.
 *
 * O cancelamento nao apaga nada: ele poe uma marca, e a quantidade continua inteira na
 * linha. Faltava a porta de volta — e sem ela um toque errado tirava a carga do saldo
 * para sempre, com o numero a vista e inalcancavel. Foi o que aconteceu: um clique em
 * "cancelar", ao lado de "corrigir", numa tela onde ninguem ia para cancelar nada. Os
 * dois botoes ja sairam dali; esta e' a volta para quem ja levou o tombo.
 *
 * A MESMA TRANCA DO CANCELAMENTO, e o mesmo rastro: quem desfaz escreve o motivo, e o
 * historico guarda as duas pontas. Um lancamento que sai e volta do saldo sem explicacao
 * e' pior do que um que ficou fora: o saldo muda duas vezes e ninguem sabe por que.
 *
 * DA LIXEIRA NAO SE DESCANCELA: sao duas marcas diferentes, e uma linha que esta nas
 * duas precisa sair da lixeira primeiro — senao ela voltaria a contar no saldo estando
 * excluida, que e' o estado que ninguem consegue explicar depois.
 */
function montarDescancelamento(mov, p, agora) {
  if (!mov) return { ok: false, erro: 'Movimento não encontrado.' };
  if (mov.ExcluidoEm) return { ok: false, erro: 'Este lançamento está na lixeira — restaure antes.' };
  if (!mov.Cancelado) return { ok: false, erro: 'Este lançamento não está cancelado.' };
  agora = agora || new Date();
  var motivo = String((p && p.motivo) || '').trim();
  if (!motivo) return { ok: false, erro: 'Descreva o motivo de desfazer o cancelamento.' };
  var entrada = entradaHistorico(agora, p && p.usuarioId, 'Cancelamento desfeito', motivo,
    'cancelado', 'valendo');
  /* `null` explicito, como na lixeira: devolvido ausente, o patch sairia sem a coluna e
     a linha continuaria cancelada depois de a tela dizer que voltou. */
  return {
    ok: true,
    patch: { Cancelado: false, MotivoCancel: null },
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
 *   Cliente/Rota:   caixas em poder dele = entradas − devoluções confirmadas − perdas baixadas
 *   Galpão/Filial:  estoque físico       = ajustes + devoluções recebidas − saídas
 *
 * A CONTA EM SI NAO SEPARA TIPO NENHUM — ela tira da origem e poe no destino, e e a
 * mesma linha para todo mundo. Quem decide o que e estoque e o que e divida e quem LE
 * estes saldos, mais abaixo: `ehCasaNossa`.
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

  /* A BASE ENTRA NA CHAVE: sem isso uma devolução de teste quitaria uma remessa real, e
     a coluna Status passaria a mentir sobre carga que nunca voltou. Vale igual para a
     declaração — ela é o mesmo perigo com outro nome: o motorista informa que trouxe, e
     a remessa apareceria "Devolvida" sem ninguém ter contado uma caixa. */
  /* A DECLARACAO VEM ANTES DO ENSAIO na letra: uma declaracao de ensaio nunca pode
     quitar remessa nenhuma, nem a real nem a de treino. */
  function letra(m) { return baseDoMovimento(m); }
  function chaveDestino(m) {
    return String(m.DestinoID) + '|' + String(m.TipoCaixaID) + '|' + letra(m);
  }
  function chaveOrigem(m) {
    return String(m.OrigemID) + '|' + String(m.TipoCaixaID) + '|' + letra(m);
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

/* `cad` SAO OS DOIS CADASTROS de gente: motoristas e fornecedores. Sem eles a lista
   ainda sai — com o texto gravado, que e' o piso —, e por isso a bancada enumera as
   chamadas: uma esquecida nao quebra nada, so' deixa aquela tela com os nomes de
   ontem, o que e' exatamente o defeito que se quer evitar. */
function listaMovimentos(movimentos, locais, tipos, usuarios, p, cad) {
  p = p || {};
  cad = cad || {};
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

  /* 'todos' é o padrão porque o ensaio conta em tudo: esconder por omissão faria a tela
     mostrar menos do que o saldo soma. As bases pedidas vêm coladas por "|", como os
     outros filtros de várias escolhas. */
  var basesPedidas = String(p.teste == null ? '' : p.teste).split('|')
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return !!x && x !== 'todos'; });

  /* ============ UM FILTRO PODE TRAZER VÁRIOS VALORES ============
   *
   * Vêm colados por "|", que é o mesmo separador que o Trecho já usava para as duas
   * pontas dele — lá também é uma lista, vista de outro jeito.
   *
   * VAZIO QUER DIZER "NÃO FILTRA POR ISTO", e é a única convenção segura: invertida —
   * lista vazia não casando com nada —, um campo que nasce vazio no navegador devolveria
   * a tela em branco, e quem olhasse concluiria que não há movimento nenhum.
   *
   * COMPARADO COMO TEXTO, como era antes: o id do local vem como número do banco e como
   * texto do formulário, e `===` entre os dois é falso para o mesmo local. */
  function escolhidos(v) {
    return String(v == null ? '' : v).split('|')
      .map(function (x) { return String(x).trim(); })
      .filter(function (x) { return !!x; });
  }
  function casa(v, doMovimento) {
    var l = escolhidos(v);
    return !l.length || l.indexOf(String(doMovimento)) >= 0;
  }

  /* OS CANCELADOS SAO INVISIVEIS POR PADRAO, e isso esta certo: eles nao contam em nada,
   * e deixa-los na lista de todo dia seria pedir que a pessoa os ignore uma por uma.
   *
   * MAS INVISIVEIS SEMPRE E' OUTRA COISA. Um lancamento cancelado por engano sumia de
   * TODA tela do sistema — a lista, a conciliacao, os totais, e ate' a lixeira, que e'
   * outra marca. A quantidade continuava inteira no banco, e nao havia um caminho que
   * levasse ate' ela. O desfazer que nasceu antes desta peneira era inalcancavel: ele
   * existia, correto, e nenhuma linha cancelada chegava nele.
   *
   * Tres estados, e o padrao continua sendo o de hoje: quem nao pede nada nao passa a
   * ver cancelado nenhum. */
  var comoCancelados = String(p.cancelados || '').trim();
  /* QUATRO ESTADOS, e a lixeira e' um deles. Ela e' outra marca — `ExcluidoEm` —, e
     tem tela propria em Movimentos; mas a DECLARACAO nao passa por aquela tela, para
     ninguem, nem para o administrador. Sem este caminho, uma declaracao apagada nao
     tinha onde ser encontrada em lugar nenhum do sistema. */
  var base = comoCancelados === 'so'
    ? movimentos.filter(function (m) { return !!m.Cancelado && !m.ExcluidoEm; })
    : comoCancelados === 'lixeira'
      ? movimentos.filter(function (m) { return !!m.ExcluidoEm; })
      : comoCancelados === 'incluir'
        ? movimentos.filter(function (m) { return !m.ExcluidoEm; })
        : naoCancelados(movimentos);

  return base.filter(function (m) {
    if (basesPedidas.length && basesPedidas.indexOf(baseDoMovimento(m)) < 0) return false;
    if (de && m.DataRef < de) return false;
    if (ate && m.DataRef > ate) return false;
    if (!casa(p.local, m.OrigemID) && !casa(p.local, m.DestinoID)) return false;
    // `local` casa nas duas pontas; `origem` e `destino` prendem cada uma na sua. Os dois
    // existem porque "tudo que passou por Caruaru" e "tudo que SAIU de Caruaru" são
    // perguntas diferentes, e a segunda é a que importa na hora de apagar.
    if (!casa(p.origem, m.OrigemID)) return false;
    if (!casa(p.destino, m.DestinoID)) return false;
    if (!casa(String(p.tipo || '').toUpperCase(), m.Tipo)) return false;
    // Sentido e Tipo convivem: Tipo escolhe UMA linha do razão, sentido pega o grupo.
    // "Saída" aqui traz remessa E transferência juntas, que é como o operador pensa —
    // e deixa de fora perda e ajuste, que não são viagem de caixa nenhuma.
    if (!casa(String(p.fluxo || '').toUpperCase(), sentidoDoMovimento(m.Tipo))) return false;
    if (!casa(p.caixa, m.TipoCaixaID)) return false;
    /* O status nao esta no movimento: e calculado do ciclo da carga, entao filtra-lo na
       tela nao daria — pela mesma razao do usuario, o corte de 500 linhas vem DEPOIS
       daqui, e a tela veria so os "Parcial" que couberam nas 500. */
    if (!casa(p.situacao, rotuloCiclo(m, ciclo[m.ID]))) return false;
    // Aqui e nao no navegador: o corte de 500 linhas vem DEPOIS deste filtro, entao
    // filtrar na tela mostraria so os lancamentos da pessoa que couberam nas 500.
    if (!casa(p.usuario, m.UsuarioID)) return false;
    /* O MOTORISTA e TEXTO no movimento, e nao um id: o lancamento guarda o nome porque
       repintar ou apagar um cadastro nao pode reescrever o que ja saiu do galpao. Entao
       a comparacao e de texto mesmo — e por isso ela e exata, e nao "contem": "Chico"
       nao pode trazer "Francisco Chico" junto sem ninguem ter pedido. */
    if (!casa(p.motorista, m.Motorista || '')) return false;
    /* O TRECHO e o par de pontas SEM direcao: "Matriz -> Joao Pessoa" e "Joao Pessoa ->
       Matriz" sao a mesma perna da operacao vista dos dois lados, e e assim que o
       grafico agrupa. Vem como dois ids separados por "|", em qualquer ordem — ordenar
       os dois aqui e o que faz a ida e a volta casarem com o mesmo filtro.

       POR ID, e nao por nome: nome de local muda no cadastro, e um filtro guardado por
       nome deixaria de casar no dia seguinte a uma correcao de grafia. */
    if (p.trecho) {
      var par = String(p.trecho).split('|').map(function (x) { return String(x).trim(); }).sort();
      var deste = [String(m.OrigemID || ''), String(m.DestinoID || '')].sort();
      if (par.length !== 2 || par[0] !== deste[0] || par[1] !== deste[1]) return false;
    }
    return true;
  }).sort(function (a, b) {
    // O ensaio desce para o fim; dentro de cada grupo a data continua mandando.
    var d = (lancamentoDeTeste(a) ? 1 : 0) - (lancamentoDeTeste(b) ? 1 : 0);
    if (d) return d;
    return a.DataRef > b.DataRef ? -1 : (a.DataHora > b.DataHora ? -1 : 1);
  }).slice(0, limite).map(function (m) {
    var temConf = m.QtdConferida !== null && m.QtdConferida !== undefined && m.QtdConferida !== '';
    var nomes = nomesDaLinha(m, cad.motoristas, cad.fornecedores);
    return {
      id: m.ID, dataRef: iso(m.DataRef), dataHora: iso(m.DataHora), tipo: m.Tipo,
      /* De qual remessa esta linha é. A tela de celular junta as linhas por aqui em vez
         de repetir data, rota e motorista uma vez por tipo de caixa. */
      lote: loteDo(m),
      /* O CODIGO DO ENVIO, que e o que se dita por telefone. Ele e diferente do `lote`:
         o lote e a chave tecnica que junta as linhas ('k:K1727539383-M46'), e o registro
         e o nome legivel da mesma coisa. Os dois existem porque servem a leitores
         diferentes — um e para o codigo agrupar, o outro e para gente falar. */
      registro: m.Registro || '',
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
      /* A MARCA DO CANCELAMENTO VIAJA JUNTO. Sem ela a tela nao tem como saber que a
         linha esta cancelada: ela desenharia "cancelar" em cima do que ja esta
         cancelado, e o botao de desfazer — que existe — nunca apareceria. */
      cancelado: !!m.Cancelado, motivoCancel: m.MotivoCancel || '',
      /* E A MARCA DA LIXEIRA JUNTO, pela mesma razao: sem ela a tela nao tem como
         distinguir uma linha apagada de uma linha viva, e oferece a porta errada —
         "desfazer o cancelamento" numa linha que esta' na lixeira leva a recusa da rota
         depois de a pessoa ja ter escrito o motivo. */
      excluidoEm: m.ExcluidoEm ? iso(m.ExcluidoEm) : '',
      status: m.Status, romaneio: m.Romaneio, usuario: nome(mUsers, m.UsuarioID),
      usuarioId: m.UsuarioID, perfil: m.Perfil,
      teste: lancamentoDeTeste(m),
      /* A DECLARAÇÃO VIAJA MARCADA. Sem isto ela chega à tela igual a um retorno de
         verdade, e a pessoa soma a coluna Qtd na mão e não entende por que o total não
         bate com o saldo. */
      declaracao: ehDeclaracao(m),
      situacao: rotuloCiclo(m, ciclo[m.ID]),
      devolvido: ciclo[m.ID] ? ciclo[m.ID].devolvido : null,
      /* A PLACA VIAJA JUNTO com o motorista, e pelo mesmo motivo: o movimento guarda
         o TEXTO dela, e nao o id do cadastro — repintar ou apagar um veiculo nao pode
         reescrever o que ja saiu do galpao. Ela era gravada e nao chegava a tela:
         uma coluna de Veiculo nasceria vazia em todas as linhas, e a conclusao
         natural seria que ninguem preenche o campo. */
      /* OS DOIS NOMES SAEM DO CADASTRO DE HOJE, com o que esta' gravado como piso —
         ver `nomesDaLinha`. O apelido na coluna Motorista, o nome na coluna Fornecedor. */
      motorista: nomes.motorista,
      motoristaNome: m.MotoristaNome || m.Motorista || '',
      veiculo: m.Veiculo || '', rota: m.Rota || '',
      /* GRAVADO E NAO MOSTRADO e' meio dado: a coluna Fornecedor nasceria vazia em
         todas as linhas e a conclusao natural seria que ninguem preenche o campo. Foi
         o que aconteceu com a placa do veiculo, logo acima. */
      fornecedor: nomes.fornecedor,
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
      veiculo: m.Veiculo || '',
      teste: lancamentoDeTeste(m), declaracao: ehDeclaracao(m), obs: m.Obs || '',
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
  var mLocaisP = mapaNomes(dados.locais || []);
  var perfis = {};
  usuarios.forEach(function (u) { perfis[String(u.ID)] = u.Perfil || ''; });

  // chave -> { nome, extra:{}, saida, retorno }
  var porMot = {}, porUsu = {};
  var nomesTiposP = mapaTipos(dados.tipos || []);
  /* QUANTAS LINHAS DE DETALHE CADA PESSOA LEVA.
   * Um teto existe porque a carga desta rota cresce com o periodo escolhido, e alguem
   * vai pedir o ano inteiro um dia. Quando ele morde, a gaveta DIZ que mordeu — a conta
   * de cima continua sendo de tudo, e uma gaveta que mostra menos sem avisar faria
   * parecer que os totais estao errados. */
  var TETO_DETALHE = 300;

  function soma(mapa, chave, nome, q, ehSaida, extra, caixa, linha) {
    if (!chave) return;
    var k = String(chave);
    if (!mapa[k]) {
      mapa[k] = { id: k, nome: nome, saida: 0, retorno: 0, n: 0, extras: {},
                  saidaTipo: {}, retornoTipo: {}, linhas: [], corte: 0,
                  /* ONDE ELE PEGOU, ONDE ELE DEIXOU E PARA QUEM.
                     A gaveta ja mostrava origem e destino lancamento a lancamento, mas
                     quem olha a lista de motoristas quer saber ANTES de abrir: "o
                     Boanerges levou 500 caixas para onde?". Abrindo uma a uma para
                     responder isso, a lista deixa de ser lista. */
                  ondeDe: {}, ondePara: {}, forn: {} };
    }
    mapa[k].n++;
    var lado = ehSaida ? 'saidaTipo' : 'retornoTipo';
    if (ehSaida) mapa[k].saida += q; else mapa[k].retorno += q;
    if (caixa) mapa[k][lado][caixa] = (mapa[k][lado][caixa] || 0) + q;
    if (extra) mapa[k].extras[extra] = 1;
    /* O DETALHE SAI DAQUI, do MESMO laco que soma o total — e nao de uma segunda
       passada com os mesmos filtros escritos de novo. E' o unico jeito de a gaveta nao
       poder divergir da linha: um filtro que so' uma das duas recebesse daria duas
       respostas plausiveis, e ninguem veria qual e' a certa. */
    if (linha) {
      /* OS CONJUNTOS FICAM FORA DO TETO, de proposito. O teto corta o DETALHE — trezentas
         linhas numa gaveta ninguem le —, mas a lista de lugares e de fornecedores e
         curta por natureza, e cortada ela MENTIRIA: o motorista que rodou o ano inteiro
         apareceria com os primeiros destinos dele e mais nenhum, sem nada dizendo que
         faltava. */
      if (linha.origem) mapa[k].ondeDe[linha.origem] = 1;
      if (linha.destino) mapa[k].ondePara[linha.destino] = 1;
      if (linha.fornecedor) mapa[k].forn[linha.fornecedor] = 1;
      if (mapa[k].linhas.length < TETO_DETALHE) mapa[k].linhas.push(linha);
      else mapa[k].corte++;
    }
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
    /* A LINHA DA GAVETA: o que aconteceu, quando, entre onde e onde, de que caixa e
       quantas. Os nomes ja' resolvidos aqui, e nao os ids: a tela mostraria "L016", e
       o arquivo tambem. */
    var linha = {
      id: m.ID, registro: m.Registro || '', data: soData(m.DataRef),
      tipo: m.Tipo, sentido: ehSaida ? 'saida' : 'retorno',
      origem: nome(mLocaisP, m.OrigemID), destino: nome(mLocaisP, m.DestinoID),
      rota: String(m.Rota || '').trim(), caixa: caixa, qtd: q,
      /* APARADO, como o nome do motorista e a rota logo abaixo. Ele vira CHAVE na
         lista de fornecedores da pessoa, e com o espaco " Cipo Branco" e "Cipo
         Branco" entram como dois, lado a lado na mesma celula — a mesma pessoa duas
         vezes, e nada na tela explicando a diferenca. */
      veiculo: m.Veiculo || '', fornecedor: String(m.Fornecedor || '').trim()
    };
    soma(porMot, mot, mot, q, ehSaida, String(m.Rota || '').trim(), caixa, linha);
    /* A MESMA LINHA nas duas visoes: e' o mesmo lancamento visto por dois angulos —
       quem dirigiu e quem lancou. Montar duas versoes dele seria duas verdades. */
    soma(porUsu, m.UsuarioID, nome(nomesUsuarios, m.UsuarioID), q, ehSaida, '', caixa,
         linha);
  });

  /* O `filter` E' PISO, e nao a guarda: quem barra o vazio e' o `if` la' na entrada, e
     e' la' que o espaco tambem e' aparado. Ele fica porque custa nada e porque o dia em
     que alguem alimentar estes conjuntos por outro caminho, um nome em branco no meio
     dos lugares se le' como dado que faltou carregar. */
  function ordenados(conj) {
    return Object.keys(conj).filter(Boolean)
      .sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

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
        /* OS MESMOS NOMES DE CAMPO DA LINHA DE TRAJETO — `origens` e `destinos` —, e nao
           nomes proprios: a celula de Origem do painel ja sabe desenhar essa lista, e
           batizando-os de outro jeito aqui seria preciso uma segunda celula que faz o
           mesmo. Duas celulas sobre a mesma coisa divergem no primeiro conserto que so
           uma receber. */
        origens: ordenados(r.ondeDe), destinos: ordenados(r.ondePara),
        fornecedores: ordenados(r.forn),
        saida: r.saida, retorno: r.retorno,
        saidaTipos: detalharTipos(r.saidaTipo), retornoTipos: detalharTipos(r.retornoTipo),
        saldo: c.saldo, desvio: c.desvio, situacao: c.situacao,
        /* MAIS RECENTE PRIMEIRO, como toda lista de lancamento do painel: quem abre a
           gaveta quer saber o que acabou de acontecer. */
        linhas: r.linhas.slice().sort(function (x, y) {
          return x.data < y.data ? 1 : x.data > y.data ? -1 : 0;
        }),
        corte: r.corte
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
  /* SEM ESCOLHA, NAO HA' CORTE — nem no inicio nem no fim.
   *
   * O padrao era "do dia 1 do mes ate' agora", e no dia 1 a janela tinha algumas horas:
   * todo primeiro do mes o Painel de Ativos abria zerado para a operacao inteira, com o
   * estoque cheio no cartao de cima dizendo que havia movimento. Quem olhava concluia,
   * com razao, que a tela tinha quebrado — e a frase "ainda nao ha lancamento neste mes"
   * era verdadeira e inutil ao mesmo tempo.
   *
   * Quem quer um recorte escolhe um. Quem nao escolheu nada nao pediu para esconder
   * nada. */
  var fluxoIni = p.de ? data(p.de) : null;
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
  /* SO' CLIENTE. Esta lista responde "quem esta com a nossa caixa", e alimenta o aging,
     as vencidas e o KPI de caixas em poder de terceiros — tudo que existe para COBRAR.
     Com a filial dentro, o sistema cobrava a propria empresa, e o estoque que esta la
     aparecia como divida em vez de aparecer no total. */
  var lista = locais.filter(function (l) {
    return l.Tipo === 'CLIENTE';
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

  /* AS DUAS CASAS. Era so' GALPAO, e o cartao do painel somava uma lista vazia e
     mostrava um zero limpo — numero que parece resposta e nao e'. O rodape dele ja dizia
     "nos galpoes e unidades"; agora a conta faz o que o texto prometia. */
  var galpoes = locais.filter(function (l) { return ehCasaNossa(l.Tipo); }).map(function (l) {
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
    /* VAZIO QUER DIZER "NAO CORTEI", e e' assim que a tela escreve o rotulo do cartao:
       inventar aqui o dia 1 do mes faria a legenda prometer um recorte que nao houve. */
    periodo: { de: fluxoIni ? soData(fluxoIni) : '', ate: fluxoFim ? soData(fluxoFim) : '' },
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
/* QUEM TEM HISTORICO NAO PODE SER EXCLUIDO, e a TELA precisa saber disso ANTES do
 * clique.
 *
 * A rota `excluir` ja' decidia certo: com lancamento no historico ou rota sob
 * responsabilidade, ela DESATIVA em vez de apagar — apagar deixaria lancamento orfao,
 * e o nome de quem lancou sumiria do romaneio ja' emitido. O que faltava era contar
 * isso para quem olha: a tela oferecia "excluir", a pessoa clicava, e a linha continuava
 * ali. A explicacao existia, num `toast` que some em segundos — e quem clicou em quatro
 * linhas seguidas viu quatro avisos passarem e quatro linhas ficarem.
 *
 * E' A MESMA REGRA DO RESTO DO PROJETO: a tela oferece o que a gravacao aceita. Aqui ela
 * oferecia o que a gravacao recusa, e a recusa era silenciosa por desenho.
 *
 * OS DOIS MOTIVOS VIAJAM SEPARADOS porque a frase muda: "tem lancamentos" e "responde
 * por 2 rotas" levam a pessoa a lugares diferentes para resolver. */
function marcarHistorico(usuarios, movimentos, locais) {
  var comLancamento = {}, comRota = {};
  (movimentos || []).forEach(function (m) {
    if (m.UsuarioID) comLancamento[String(m.UsuarioID)] = true;
    if (m.ConferidoPor) comLancamento[String(m.ConferidoPor)] = true;
  });
  (locais || []).forEach(function (x) {
    if (x.MotoristaId) comRota[String(x.MotoristaId)] = (comRota[String(x.MotoristaId)] || 0) + 1;
  });
  return (usuarios || []).map(function (u) {
    var fora = {};
    Object.keys(u).forEach(function (k) { fora[k] = u[k]; });
    fora.TemLancamentos = comLancamento[String(u.ID)] === true;
    fora.RotasSob = comRota[String(u.ID)] || 0;
    return fora;
  });
}

function usuariosPublicos(usuarios) {
  return usuarios.map(function (u) {
    return {
      ID: u.ID, Nome: u.Nome, Perfil: normalizarPerfil(u.Perfil),
      LocalPadrao: u.LocalPadrao, Telefone: u.Telefone || '',
      Email: u.Email || '', Usuario: u.Usuario || '',
      Ativo: u.Ativo !== false, TemSenha: !!u.SenhaHash,
      /* A foto vem junto: é ela que o painel mostra no lugar das iniciais, e sem ela
         aqui a tela cairia nas letras para todo mundo sem dizer por quê. */
      Foto: u.Foto || '',
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
      /* Vai para o painel: e por ele que o escritorio reapresenta o tutorial a alguem. */
      ViuTutorial: u.ViuTutorial === true,
      /* SE JA VIU A APRESENTACAO. Volta pela mesma razao das outras: a tela abre o
         cadastro, salva, e o que nao voltou na leitura vira `undefined` no registro —
         a pessoa veria as boas-vindas de novo a cada vez que alguem a editasse. */
      /* A BASE VOLTA JUNTO, pela mesma razao do `SoProprios` acima — e a suite pegou
         este exatamente como pegou aquele. Esquecida aqui, o formulario abriria sempre
         em "Base Producao", e a gravacao seguinte passaria a pessoa de ensaio para
         producao sem ninguem ter tocado no campo. No meio de uma validacao, isso
         mandaria lancamento de teste para o saldo real sem deixar rastro. */
      Teste: u.Teste === true,
      /* A OUTRA BASE VOLTA PELA MESMA RAZAO, e o risco aqui e o espelho do de cima:
         esquecida, o formulario abriria com a Base Producao desmarcada e a gravacao
         seguinte tiraria da producao quem estava nela. */
      BaseProducao: u.BaseProducao === true,
      BaseDeclaracao: u.BaseDeclaracao === true,
      BaseTesteDeclaracao: u.BaseTesteDeclaracao === true,
      VerLancamentos: u.VerLancamentos !== false,
      /* VOLTA NA LEITURA porque o formulario a GRAVA: faltando aqui, o cadastro abriria
         com ela no padrao e a gravacao seguinte apagaria o que estava salvo — sem erro
         em lugar nenhum. */
      PodeCorrigir: u.PodeCorrigir !== false,
      UsuariosVistos: usuariosVistosDe(u),
      /* As SEIS listas de permissão voltam para o painel. Esquecer uma aqui não dá
         erro nenhum: o formulário abre com ela desmarcada e a gravação seguinte escreve
         vazio por cima do que estava salvo. Foi o que aconteceu com TiposCaixa e
         Motoristas — por isso o teste de simetria logo abaixo desta função. */
      Saidas: Array.isArray(u.Saidas) ? u.Saidas : [],
      Destinos: Array.isArray(u.Destinos) ? u.Destinos : [],
      Retornos: Array.isArray(u.Retornos) ? u.Retornos : [],
      /* POR QUE ESTA PESSOA NAO PODE SER EXCLUIDA. Vem do `marcarHistorico`, e so' tem
         valor quando a rota o chamou — nas outras ele fica `false`/`0`, que e' o que a
         tela entende como "nao sei de nada que impeca". */
      /* O CARIMBO DA CREDENCIAL VOLTA NO CADASTRO, e nao so' na sessao: quem compara no
         PAINEL le' a `equipe`, nao o `meuAcesso`. Sem ele aqui, a tranca existia e nunca
         fechava daquele lado — e foi a bancada da rota que achou, porque o carimbo nao
         esta' na conta derivada que cobre as outras colunas. */
      CredencialEm: u.CredencialEm || '',
      TemLancamentos: u.TemLancamentos === true,
      RotasSob: Number(u.RotasSob) || 0,
      TiposCaixa: Array.isArray(u.TiposCaixa) ? u.TiposCaixa : [],
      Motoristas: Array.isArray(u.Motoristas) ? u.Motoristas : [],
      Veiculos: Array.isArray(u.Veiculos) ? u.Veiculos : [],
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
  comoChamar: comoChamar, nomeESobrenome: nomeESobrenome,
  linhasDoRegistro: linhasDoRegistro,
  placa: placa,
  motoristasPublicos: motoristasPublicos,
  sentidoDaRota: sentidoDaRota, atendeNoSentido: atendeNoSentido,
  SENTIDOS_ROTA: SENTIDOS_ROTA, veiculosPublicos: veiculosPublicos,
  cnhVencida: cnhVencida,
  data: data, fimDoDia: fimDoDia, iso: iso, soData: soData,
  mapaNomes: mapaNomes, nome: nome, ativos: ativos, naoCancelados: naoCancelados,
  naLixeira: naLixeira, listaLixeira: listaLixeira, ultimaAlteracao: ultimaAlteracao,
  loteDo: loteDo,
  montarExclusao: montarExclusao, montarRestauracao: montarRestauracao,
  montarCancelamento: montarCancelamento,
  ehPerfilTeste: ehPerfilTeste, temTeste: temTeste, pesoTeste: pesoTeste, pesoMatriz: pesoMatriz,
  lancamentoDeTeste: lancamentoDeTeste, recorteTeste: recorteTeste,
  ehDeclaracao: ehDeclaracao, baseDoMovimento: baseDoMovimento,
  BASES: BASES, nomeDaBase: nomeDaBase,
  marcarHistorico: marcarHistorico,
  basesDoUsuario: basesDoUsuario, basesEfetivas: basesEfetivas,
  recorteBases: recorteBases, baseEscolhida: baseEscolhida,
  veDeclaracao: veDeclaracao, recorteDeclaracao: recorteDeclaracao,
  semDeclaracao: semDeclaracao, MUNDOS: MUNDOS, recorteMundos: recorteMundos,
  mundosPedidos: mundosPedidos,
  PERFIS_DECLARACAO: PERFIS_DECLARACAO,
  podeAlterarDeclaracao: podeAlterarDeclaracao, barraDeclaracao: barraDeclaracao,
  acharUsuario: acharUsuario,
  recorteProprios: recorteProprios, usuariosVistosDe: usuariosVistosDe,
  idsVisiveis: idsVisiveis, NINGUEM: NINGUEM, ativo: ativo, novoId: novoId, novoToken: novoToken,
  acharPorIdentificador: acharPorIdentificador, loginPorSenha: loginPorSenha,
  meuAcesso: meuAcesso,
  fluxoPorOrigem: fluxoPorOrigem, fluxoPorPessoa: fluxoPorPessoa,
  cicloDaCarga: cicloDaCarga, rotuloCiclo: rotuloCiclo,
  loginPorPin: loginPorPin, sessaoDe: sessaoDe,
  montarMovimento: montarMovimento, placaAceitavel: placaAceitavel,
  fornecedorDoMovimento: fornecedorDoMovimento,
  ehMotoristaFornecedor: ehMotoristaFornecedor,
  pontasQuePedemFornecedor: pontasQuePedemFornecedor,
  conferirFornecedor: conferirFornecedor, acharFornecedor: acharFornecedor,
  nomesDaLinha: nomesDaLinha, montarConferencia: montarConferencia,
  montarCorrecao: montarCorrecao, CORRIGIVEIS: CORRIGIVEIS,
  montarRestauro: montarRestauro, podeRestaurar: podeRestaurar,
  corrigeLancamento: corrigeLancamento, fotoDePerfil: fotoDePerfil,
  marcasDaBase: marcasDaBase, nomeDaBase: nomeDaBase,
  ehAdministrador: ehAdministrador,
  montarDescancelamento: montarDescancelamento,
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
