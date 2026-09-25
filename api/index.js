/**
 * Qdelícia Frutas — Controle de Caixas
 * Função na Vercel: o mesmo contrato de 16 rotas que o Apps Script servia.
 *
 * O front continua falando com uma URL só (`API_URL` no config.js) e mandando `acao`.
 * A diferença é que agora a chave do banco fica aqui, no servidor, e não na página.
 *
 * Variáveis de ambiente necessárias (painel da Vercel > Settings > Environment Variables):
 *   SUPABASE_URL          https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  a service_role (NUNCA a anon, e nunca no repositório)
 */
'use strict';

var L = require('./_logica');
var db = require('./_supabase');
var senha = require('./_senha');
var MIGRACOES = require('./_migracoes');

var TABELA = { Locais: 'locais', TiposCaixa: 'tipos_caixa', Usuarios: 'usuarios', Motoristas: 'motoristas',
               LocaisPadrao: 'locais_padrao', Veiculos: 'veiculos' };
/* `V` de veículo. O prefixo é o que separa os ids de cadastros diferentes num sistema em
   que tudo é texto — `D001` é motorista, `V001` é carro, e nenhum id vira o do outro. */
var PREFIXO = { Locais: 'L', TiposCaixa: 'T', Usuarios: 'U', Motoristas: 'D', LocaisPadrao: 'P',
                Veiculos: 'V' };
var MAPA = { Locais: db.LOCAL, TiposCaixa: db.TIPO, Usuarios: db.USUARIO, Motoristas: db.MOTORISTA,
             LocaisPadrao: db.LOCAL_PADRAO, Veiculos: db.VEICULO };
var COLECAO = { Locais: 'locais', TiposCaixa: 'tipos', Usuarios: 'usuarios', Motoristas: 'motoristas',
                LocaisPadrao: 'locaisPadrao', Veiculos: 'veiculos' };

/* ============================ migrações ============================ */

// Uma vez por instância morna basta: o que já foi aplicado não volta a ser.
var migracoesOk = false;

/**
 * Aplica o que falta, em ordem. O DDL sai daqui, não do PostgREST, através da função
 * `aplicar_migracao` que o bootstrap cria — é ela que tem permissão para mexer na
 * estrutura. O `sql` vem sempre de `_migracoes.js`; nada que chega pela API entra aqui.
 */
async function garantirMigracoes() {
  if (migracoesOk) return null;
  var jaAplicadas;
  try {
    jaAplicadas = await db.selectAll('migracoes');
  } catch (e) {
    // Sem a tabela de registro, o bootstrap ainda não rodou. Segue a vida: o app
    // funciona com o que o banco já tem, e avisa quando faltar coluna de verdade.
    migracoesOk = true;
    return null;
  }

  var feitas = {};
  (jaAplicadas || []).forEach(function (m) { feitas[m.id] = true; });
  var pendentes = MIGRACOES.filter(function (m) { return !feitas[m.id]; });
  if (!pendentes.length) { migracoesOk = true; return null; }

  for (var i = 0; i < pendentes.length; i++) {
    var m = pendentes[i];
    try {
      await db.rpc('aplicar_migracao', { id_migracao: m.id, sql_migracao: m.sql });
      console.log('[caixas] migração aplicada:', m.id, '—', m.nota);
    } catch (e) {
      console.error('[caixas] migração falhou:', m.id, e && e.message);
      // Para na primeira falha: aplicar as seguintes por cima de um banco meio migrado
      // é como o estrago vira difícil de desfazer.
      return 'Falha ao atualizar o banco na migração ' + m.id + '. Veja o log da Vercel.';
    }
  }
  migracoesOk = true;
  return null;
}

function corpo(req) {
  var b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

/* ============================ GET ============================ */

async function rotaGet(p) {
  var acao = String(p.acao || 'ping');

  if (acao === 'ping') {
    // Responde sem tocar no banco: serve para saber se a função está de pé.
    return { ok: true, versao: 3, motor: 'supabase', empresa: 'Qdelícia Frutas' };
  }

  var d = await db.carregarTudo();

  switch (acao) {
    case 'dados':
      // A lista de usuários saiu daqui de propósito: era carregada na tela de login e expunha
      // o nome de todo mundo para quem só abrisse o endereço. Quem precisa dela pede `equipe`.
      return { ok: true, locais: d.locais, tipos: d.tipos, config: configPublica(d.config),
               motoristas: L.motoristasPublicos(d.motoristas),
               veiculos: L.veiculosPublicos(d.veiculos) };
    case 'equipe':
      // Aqui vai o cadastro completo, com documento — é a tela do escritório.
      return { ok: true, usuarios: L.usuariosPublicos(d.usuarios), motoristas: d.motoristas,
               veiculos: d.veiculos,
               locaisPadrao: d.locaisPadrao, pedidosSenha: d.pedidosSenha,
               perfis: L.perfisConhecidos(d.usuarios),
               // A MESMA lista que a gravacao usa para recusar. Escrever as opcoes na tela
               // faria duas listas sobre a mesma regra, e elas divergem no primeiro nome novo.
               operacoes: L.OPERACOES, abas: L.ABAS, situacoes: L.SITUACOES };
    case 'meuAcesso':
      // A sessao de UMA pessoa, relida do cadastro. E o que faz a permissao mudada valer
      // sem ela sair e entrar. Devolve estritamente menos que a `equipe`: nada de e-mail,
      // telefone, documento ou senha.
      return { ok: true, usuario: L.meuAcesso(d.usuarios, p.id) };
    case 'painel':
      /* Os dois recortes se somam, e nesta ordem nao importa: um estreita por ensaio, o
         outro por quem lancou. `so` vazio devolve tudo. */
      return { ok: true, painel: L.painel(L.recorteProprios(L.recorteTeste(d, p.teste), p.so),
                                          null, { de: p.de, ate: p.ate }) };
    case 'pendentes':
      return { ok: true, movimentos: L.pendentes(d.movimentos, d.locais, d.tipos) };
    case 'movimentos':
      /* O MESMO recorte das outras rotas, e nao o filtro `usuario` — que agora seria
         apertado demais: a permissao pode citar varios usuarios, e `usuario` prende num
         so. O filtro continua existindo para a escolha manual da tela. */
      var mov = L.recorteProprios(d, p.so);
      return { ok: true, movimentos: L.listaMovimentos(mov.movimentos, d.locais, d.tipos,
                 d.usuarios, p) };
    /* A lixeira entende o MESMO `so` que `movimentos`, e pela mesma razão: ela é o
       avesso daquela lista, e uma peneira que valesse só de um lado transformaria a
       tela que restaura num jeito de ver o que a tela que lista esconde. A tela manda
       aqui o mesmo `so` que manda no "Apagar o que está no filtro": quem não pôde apagar
       um lançamento não o encontra aqui para restaurar. */
    case 'lixeira':
      return { ok: true, movimentos: L.listaLixeira(L.recorteProprios(d, p.so).movimentos,
                 d.locais, d.tipos, d.usuarios, p) };
    case 'extrato':
      return L.extrato(L.recorteProprios(d, p.so), p.local, p.de, p.ate);
    case 'extratoToken':
      return L.extratoToken(d, p.t, p.de, p.ate);
    default:
      return { ok: false, erro: 'Ação desconhecida: ' + acao };
  }
}

/* ============================ POST ============================ */

async function rotaPost(p) {
  var acao = String(p.acao || '');
  if (!acao) return { ok: false, erro: 'Informe a ação.' };

  if (acao === 'login') {
    var d0 = await db.carregarTudo();
    /* UMA PORTA SO: a tela manda `segredo`, e o servidor descobre se é senha ou PIN.
       Os campos antigos (`senha`, `pin`) continuam aceitos — há telas em cache e
       fila offline que ainda os mandam, e recusá-las tirava gente do ar no deploy. */
    var quem = p.identificador || p.nome || p.usuarioId;
    if (p.segredo !== undefined) return L.loginUnico(d0.usuarios, quem, p.segredo, senha.conferir);
    if (p.senha) return L.loginPorSenha(d0.usuarios, quem, p.senha, senha.conferir);
    return L.loginPorPin(d0.usuarios, quem, p.pin);
  }

  if (acao === 'definirSenha') return await definirSenha(p);
  if (acao === 'definirPin') return await definirPin(p);
  if (acao === 'pedirSenha') return await pedirSenha(p);
  if (acao === 'resolverPedidoSenha') return await resolverPedidoSenha(p);

  if (acao === 'movimento') return await gravarMovimento(p);
  if (acao === 'conferir') return await conferir(p);
  if (acao === 'cancelar') return await cancelar(p);
  if (acao === 'corrigir') return await corrigir(p);
  if (acao === 'salvarLocal') return await salvarRegistro('Locais', p);
  if (acao === 'salvarTipo') return await salvarRegistro('TiposCaixa', p);
  if (acao === 'salvarMotorista') return await salvarRegistro('Motoristas', p);
  if (acao === 'salvarVeiculo') return await salvarRegistro('Veiculos', p);
  if (acao === 'salvarLocalPadrao') return await salvarRegistro('LocaisPadrao', p);
  if (acao === 'salvarUsuario') return await salvarUsuario(p);
  if (acao === 'salvarConfig') return await salvarConfig(p);
  if (acao === 'excluir') return await excluir(p.aba, p.id);
  if (acao === 'excluirMovimento') return await excluirMovimento(p);
  if (acao === 'restaurarMovimento') return await restaurarMovimento(p);
  if (acao === 'limparMovimentos') return await limparMovimentos(p);

  return { ok: false, erro: 'Ação desconhecida: ' + acao };
}

async function gravarMovimento(p) {
  var d = await db.carregarTudo();

  var existentes = {};
  d.movimentos.forEach(function (m) { if (m.ClientKey) existentes[String(m.ClientKey)] = m.ID; });

  var agora = new Date();
  var selo = 'm' + agora.getTime() + '-' + Math.random().toString(36).slice(2, 8);
  var assinaturaUrl = p.assinatura ? await db.subirArquivo('canhoto-' + selo + '.png', p.assinatura, 'image/png') : '';
  var fotoUrl = p.foto ? await db.subirArquivo('foto-' + selo + '.jpg', p.foto, 'image/jpeg') : '';

  /* Teste é o perfil com "teste" no nome, lido do CADASTRO aqui no servidor e não do
     payload: o celular manda o perfil junto, e um pedido adulterado classificaria errado.
     Hoje isso só muda o lado do filtro — o lançamento conta de qualquer jeito. */
  var quem = d.usuarios.filter(function (u) { return String(u.ID) === String(p.usuarioId || ''); })[0];

  /* A permissao e recusada AQUI, e nao so escondendo a aba no celular. Esconder o botao
     e conveniencia; quem manda um POST direto passa por cima dela. E o cadastro que
     decide, lido do servidor — o payload nao opina sobre o que quem o mandou pode fazer. */
  var op = L.operacaoDoTipo(p.tipo);
  if (quem && !L.podeOperacao(quem, op)) {
    return { ok: false, erro: 'Este usuário não está habilitado a lançar ' +
      (op === 'RETORNO' ? 'retorno' : 'saída') + '.' };
  }

  /* AJUSTE e PERDA nao passam pela lista de operacoes — nascem no escritorio, e governa-las
     por ela trancaria o administrador fora do proprio ajuste. Quem manda nelas e a lista de
     LOCAIS: ter a aba Ajustes abre a porta, e esta lista diz em que saldo a pessoa mexe.

     Recusado AQUI, e nao so filtrando o seletor da tela: filtrar e conveniencia, e um POST
     direto passa por cima dela. */
  var localAj = L.localDoAjuste(p.tipo, p);
  if (quem && localAj && !L.podeAjustarEm(quem, localAj)) {
    var nomeLocal = (d.locais || []).filter(function (l) {
      return String(l.ID) === String(localAj);
    })[0];
    return { ok: false, erro: 'Este usuário não está habilitado a lançar ajuste em ' +
      ((nomeLocal && nomeLocal.Nome) || 'neste local') + '.' };
  }

  var r = L.montarMovimento(p, {
    movimentos: d.movimentos,
    agora: agora,
    /* A BASE VEM DO CADASTRO, e nao mais do nome do perfil. Perfil e cargo; base e
       onde a pessoa lanca. Enquanto as duas coisas moravam no mesmo campo, cadastrar
       alguem como "Conferente" durante a validacao exigia escrever "Conferente de
       teste" — e depois lembrar de limpar, em todos, no dia da virada.
       SO A COLUNA DECIDE, e o perfil nao entra mais nesta conta. Eu tinha deixado o
       perfil como piso "para as contas antigas" — e isso era guarda morta e mentirosa ao
       mesmo tempo. Morta porque a migracao copia a regra do perfil para a coluna, entao
       nao ha conta antiga descoberta. Mentirosa porque quem tivesse "Conferente de
       teste" escrito no cargo ficaria preso no ensaio mesmo com a Base marcada como
       Producao no formulario: a tela diria uma coisa e o lancamento faria outra, sem
       nada a que culpar.
       Medido antes de tirar: perfil "Conferente de teste" com Base Producao carimbava
       Base Teste.
       O PERFIL GRAVADO NO MOVIMENTO continua valendo — `lancamentoDeTeste` le o `Perfil`
       da LINHA, que e historia e nao cadastro, e cobre os movimentos anteriores a coluna
       `teste` existir em `movimentos`. Sao duas perguntas diferentes com o mesmo nome. */
    teste: quem && quem.Teste === true,
    clientKeysExistentes: existentes,
    assinaturaUrl: assinaturaUrl,
    fotoUrl: fotoUrl
  });
  if (!r.ok) return r;

  var criados = r.jaExistiam.slice();
  if (r.linhas.length) {
    try {
      var gravadas = await db.insert('movimentos', r.linhas.map(db.MOV.para));
      (gravadas || []).forEach(function (g) {
        criados.push({ id: g.id, tipoCaixaId: g.tipo_caixa_id, qtd: Number(g.qtd) });
      });
    } catch (e) {
      // 23505 = violação de UNIQUE. É a fila offline reenviando: o banco recusou a duplicata,
      // que é exatamente o comportamento desejado. Para o celular, isso é sucesso.
      if (String(e.corpo || '').indexOf('23505') >= 0 || e.status === 409) {
        return { ok: true, criados: criados, status: r.status, duplicado: true };
      }
      throw e;
    }
  }
  return { ok: true, criados: criados, status: r.status };
}

/**
 * Registra que alguém não consegue entrar. A resposta é sempre a mesma, exista o
 * identificador ou não: dizer "esse e-mail não existe" entrega quem trabalha aqui a
 * quem estiver testando endereços.
 */
async function pedirSenha(p) {
  var ident = String(p.identificador || '').trim();
  if (!ident) return { ok: false, erro: 'Informe seu e-mail ou usuário.' };

  var d = await db.carregarTudo();
  var jaTem = (d.pedidosSenha || []).some(function (x) {
    return String(x.identificador).toLowerCase() === ident.toLowerCase();
  });
  if (!jaTem) {
    await db.insert('pedidos_senha', [{
      id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      identificador: ident.slice(0, 120)
    }]);
  }
  return { ok: true };
}

async function resolverPedidoSenha(p) {
  await db.update('pedidos_senha', String(p.id || ''), { atendido: true });
  return { ok: true };
}

/**
 * Troca da própria senha. Exige a senha atual; quem ainda não tem uma prova quem é pelo PIN.
 * Sem isso, qualquer um definiria a senha do administrador — e não há sessão no servidor
 * para impedir (ver CLAUDE.md).
 */
async function definirSenha(p) {
  var d = await db.carregarTudo();
  var u = L.acharPorIdentificador(d.usuarios, p.identificador || p.usuarioId);
  if (!u) return { ok: false, erro: 'Usuário ou senha incorretos.' };

  var autorizado = u.SenhaHash
    ? senha.conferir(p.senhaAtual, u.SenhaHash)
    : (String(u.PIN || '').trim() !== '' && String(u.PIN).trim() === String(p.pin || '').trim());
  if (!autorizado) {
    return { ok: false, erro: u.SenhaHash ? 'Senha atual incorreta.' : 'Senha do app de campo incorreta.' };
  }

  var hash;
  try { hash = senha.gerar(p.novaSenha); }
  catch (e) { return { ok: false, erro: e.message }; }

  // A pessoa escolheu a dela: a marca de provisoria cai.
  await db.update('usuarios', u.ID, { senha_hash: hash, senha_provisoria: false });
  return { ok: true };
}

/**
 * Troca do PIN do app de campo pela propria pessoa, provando o PIN atual.
 * E o par de `definirSenha`, que cuida da senha do painel.
 */
async function definirPin(p) {
  var d = await db.carregarTudo();
  var u = L.acharPorIdentificador(d.usuarios, p.identificador || p.usuarioId);
  // Mesma mensagem para usuario inexistente e senha errada: dizer qual dos dois
  // entregaria quem trabalha aqui para quem estivesse adivinhando.
  var ERRO = 'Nome ou senha incorretos.';
  if (!u) return { ok: false, erro: ERRO };

  var atual = String(u.PIN || '').trim();
  if (!atual || atual !== String(p.pinAtual || '').trim()) return { ok: false, erro: ERRO };

  var novo = String(p.novoPin || '').trim();
  if (!/^\d{6}$/.test(novo)) return { ok: false, erro: 'A senha tem 6 números.' };
  if (novo === atual) return { ok: false, erro: 'A senha nova tem de ser diferente da atual.' };

  await db.update('usuarios', u.ID, { pin: novo, pin_provisorio: false });
  return { ok: true };
}

async function corrigir(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  /* Um mapa por tipo de campo: a origem se lê na lista de locais, a caixa na de tipos.
     Com um mapa só, "origem: de L001 para L016" ia para o histórico como id cru. */
  /* A SENHA só é conferida quando faz falta — o `scrypt` custa uns 50ms, e cobrá-los de
     quem está dentro dos dez minutos seria pagar pelo caso que não acontece. */
  var agora = new Date();
  var livre = L.correcaoLivre(mov, p.usuarioId, agora);
  var mandou = p.senha !== undefined && p.senha !== null && String(p.senha) !== '';
  var senhaOk = livre || (mandou && conferirSenhaCorrecao(p.senha, d.config));

  var r = L.montarCorrecao(mov, p, agora, {
    usuarios: L.mapaNomes(d.usuarios || []),
    locais: L.mapaNomes(d.locais || []),
    tipos: L.mapaTipos(d.tipos || [])
  }, { senhaOk: senhaOk, senhaErrada: mandou && !senhaOk });
  if (!r.ok) return r;
  var patch = db.MOV.para(r.patch);
  patch.historico = r.historico;
  await db.update('movimentos', mov.ID, patch);
  /* `consulta` viaja de volta para a tela dizer o que aconteceu de verdade: "Corrigido:
     quantidade" depois de uma gravação que não mudou nada seria a mesma mentira da
     etiqueta, dita em outro lugar. */
  return { ok: true, alterou: r.entradas, consulta: !!r.consulta };
}

async function conferir(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarConferencia(mov, p);
  if (!r.ok) return r;
  await db.update('movimentos', mov.ID, db.MOV.para(r.patch));
  return { ok: true, divergencia: r.divergencia, declarada: r.declarada, conferida: r.conferida };
}

/* Apaga TODOS os lançamentos. Existe para zerar a base de testes antes de a operação
   começar de verdade.

   `esperado` é obrigatório e tem de bater com o que está no banco AGORA. Serve para duas
   coisas. A primeira é operacional: entre abrir a tela e confirmar, alguém no campo pode
   ter lançado — sem a conferência, esses lançamentos novos iriam junto sem ninguém ver.
   A segunda é que esta API não tem autorização nenhuma; exigir o número certo não é
   segurança, mas tira do caminho o POST às cegas, que é o engano mais provável. */
async function limparMovimentos(p) {
  var d = await db.carregarTudo();

  /* Os ids saem da MESMA função que monta a lista da tela. Reescrever o filtro aqui era o
     caminho curto para apagar coisa diferente da que a pessoa viu — bastava um critério
     interpretado de outro jeito nos dois lugares. O limite alto porque aqui não se pagina:
     o que casa com o filtro tem de sair inteiro. */
  /* Todo filtro que a lista entende tem de vir para ca. Um campo esquecido aqui nao da
     erro: a tela mostra cinco linhas, o servidor acha quinhentas, e a unica defesa que
     sobra e a conferencia do numero. Ha teste que compara as duas listas. */
  var filtro = {
    local: p.local, origem: p.origem, destino: p.destino,
    tipo: p.tipo, fluxo: p.fluxo, caixa: p.caixa, usuario: p.usuario, teste: p.teste,
    situacao: p.situacao, motorista: p.motorista, trecho: p.trecho,
    de: p.de, ate: p.ate, limit: 100000
  };
  var ids = L.listaMovimentos(d.movimentos, d.locais, d.tipos, d.usuarios, filtro)
    .map(function (m) { return m.id; });

  if (!ids.length) return { ok: false, erro: 'Nenhum lançamento casa com este filtro.' };

  var esperado = Number(p.esperado);
  if (!(esperado > 0) || esperado !== ids.length) {
    return {
      ok: false,
      erro: 'A lista mudou desde que a tela abriu: agora são ' + ids.length +
            ' lançamentos. Atualize e confirme de novo.'
    };
  }

  /* VAI PARA A LIXEIRA, e não some. Este botão leva centenas de lançamentos de uma vez, e
     era o que menos podia ser definitivo: errar o filtro aqui custava um dia inteiro de
     galpão, sem nada a fazer depois.

     Em bloco e com a MESMA marca para todos — não a entrada de histórico que a exclusão
     de uma linha escreve. Ela é por linha, e escrevê-la aqui seria ou centenas de idas ao
     banco numa função com tempo contado, ou o mesmo histórico copiado por cima de todos,
     apagando o que cada lançamento já tinha. Quem apagou e quando ficam nas duas colunas
     da lixeira, que é onde essa pergunta é feita. */
  var marca = db.MOV.para({ ExcluidoEm: new Date(), ExcluidoPor: String(p.usuarioId || '') });
  for (var i = 0; i < ids.length; i += 100) {
    await db.atualizarVarios('movimentos', ids.slice(i, i + 100), marca);
  }
  return { ok: true, apagados: ids.length };
}

/* MANDA PARA A LIXEIRA. Antes esta função apagava a linha, e o aviso da tela dizia a
   verdade: não tinha volta. Tinha volta nenhuma também para quem escrevia o nome certo
   da caixa por engano, que é justamente o engano que a confirmação escrita não pega.

   Diferente de `cancelar`, que deixa o lançamento à vista com o motivo: o cancelado
   continua na lista e no CSV, dizendo que existiu e não vale. O excluído sai de vista —
   mas sai do banco nunca, e por isso `restaurarMovimento` consegue trazê-lo de volta. */
async function excluirMovimento(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarExclusao(mov, p, new Date());
  if (!r.ok) return r;
  var patch = db.MOV.para(r.patch);
  patch.historico = r.historico;
  await db.update('movimentos', mov.ID, patch);
  return { ok: true, excluido: true };
}

/* TRAZ DE VOLTA. O lançamento volta exatamente como estava: nada do que ele tinha foi
   perdido, porque nada foi apagado — só a marca da lixeira some. */
async function restaurarMovimento(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarRestauracao(mov, p, new Date());
  if (!r.ok) return r;
  var patch = db.MOV.para(r.patch);
  patch.historico = r.historico;
  await db.update('movimentos', mov.ID, patch);
  return { ok: true, restaurado: true };
}

async function cancelar(p) {
  var d = await db.carregarTudo();
  var mov = d.movimentos.filter(function (m) { return String(m.ID) === String(p.id || ''); })[0];
  var r = L.montarCancelamento(mov, p, new Date());
  if (!r.ok) return r;
  var patch = db.MOV.para(r.patch);
  patch.historico = r.historico;
  await db.update('movimentos', mov.ID, patch);
  return { ok: true };
}

/** A senha chega em texto do formulário e só existe em memória: o que vai ao banco é o hash. */
async function salvarUsuario(p) {
  var dados = p.registro;
  if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch (e) { dados = null; } }
  if (!dados) return { ok: false, erro: 'Nada para salvar.' };

  // As marcas de provisorio nunca vem do navegador: quem as levanta e este codigo,
  // quando o proprio admin define a credencial.
  delete dados.PinProvisorio;
  delete dados.SenhaProvisoria;

  // A senha do app de campo tem 6 numeros exatos. A regra fica aqui porque a API
  // aceita `salvarUsuario` de qualquer origem: validar so na tela seria enfeite.
  // Vale para DEFINIR — nunca para entrar. Quem ja tem senha de 4 digitos continua
  // entrando com ela; barrar no login trancaria a equipe inteira para fora do
  // galpao de uma vez.
  if (dados.PIN !== undefined && String(dados.PIN).trim() !== '') {
    var pinNovo = String(dados.PIN).trim();
    if (!/^\d{6}$/.test(pinNovo)) {
      return { ok: false, erro: 'A senha do app de campo tem 6 números.' };
    }
    dados.PIN = pinNovo;
    // Senha que o admin escolheu e provisoria por definicao: serve para o primeiro
    // acesso, e a pessoa troca por uma dela ao entrar.
    dados.PinProvisorio = true;
  }

  delete dados.SenhaHash;                       // nunca aceite hash vindo do navegador
  var nova = String(dados.Senha || '').trim();
  delete dados.Senha;
  if (nova) {
    try { dados.SenhaHash = senha.gerar(nova); }
    catch (e) { return { ok: false, erro: e.message }; }
    dados.SenhaProvisoria = true;               // mesma razao do PIN acima
  }

  if (dados.Perfil !== undefined) {
    dados.Perfil = L.normalizarPerfil(dados.Perfil);
    if (!dados.Perfil) return { ok: false, erro: 'Informe o perfil.' };
    // Aceita as duas caixas: a grafia é escolha de quem cadastra, e normalizarPerfil()
    // já padronizou. Barrar minúscula aqui seria ditar estilo, não validar.
    if (!/^[A-Za-zÀ-ÿ0-9 .-]+$/.test(dados.Perfil)) {
      return { ok: false, erro: 'Perfil aceita só letras, números, espaço, ponto e hífen.' };
    }
  }

  /* A FOTO SOBE PARA O BALDE, e a tabela guarda só o endereço.
     Três casos, e os três precisam ser distinguidos aqui:
       · começa com "data:" — é imagem nova, sobe e vira URL;
       · vazio — é a pessoa TIRANDO a foto, e o vazio tem de chegar ao banco;
       · qualquer outra coisa — é o endereço que já estava lá, e regravá-lo é o normal
         de um formulário que manda o registro inteiro. Subir de novo a cada Salvar
         encheria o balde de cópias do mesmo rosto.

     E o que sobe é conferido: um `data:` que não seja imagem é recusado em vez de virar
     um arquivo com extensão de foto e conteúdo de outra coisa. */
  if (typeof dados.Foto === 'string' && dados.Foto.slice(0, 5) === 'data:') {
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dados.Foto)) {
      return { ok: false, erro: 'A foto precisa ser uma imagem PNG, JPG ou WEBP.' };
    }
    /* O TETO É DO SERVIDOR. A tela já reduz antes de mandar, mas a tela não é a
       fronteira: esta rota aceita pedido de qualquer origem. 1,5 MB em base64 são uns
       1,1 MB de imagem — muito mais do que um retrato de 320px precisa. */
    if (dados.Foto.length > 1500000) {
      return { ok: false, erro: 'A foto ficou grande demais. Envie uma imagem menor.' };
    }
    var selo = 'u' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var url = await db.subirArquivo('foto-usuario-' + selo + '.jpg', dados.Foto, 'image/jpeg');
    /* Falhou o envio, a gravação PARA. Seguir gravando o resto deixaria a pessoa com o
       cadastro salvo, a foto perdida e nenhum aviso de que ela se perdeu. */
    if (!url) return { ok: false, erro: 'Não consegui guardar a foto. Tente de novo.' };
    dados.Foto = url;
  }

  var d = await db.carregarTudo();

  /* `__EU__` quer dizer "ela mesma" na lista de quem ela ve os lancamentos. O formulario
     manda esse marcador porque o usuario NOVO ainda nao tem id na hora de salvar.

     Trocado AQUI, e nao na tela: e o unico ponto que conhece o id final nos dois casos —
     o que ja existe e o que acabou de nascer. Na tela, o usuario novo ficaria com uma
     lista citando um id que ninguem atribuiu ainda. */
  if (Array.isArray(dados.UsuariosVistos) && dados.UsuariosVistos.indexOf('__EU__') >= 0) {
    var meuId = dados.ID || L.novoId('U', d.usuarios);
    dados.ID = dados.ID || meuId;
    dados.UsuariosVistos = dados.UsuariosVistos.map(function (x) {
      return x === '__EU__' ? String(meuId) : x;
    });
  }

  /* Tirar o acesso ao painel leva junto a senha do painel. Hash que fica no banco sem
     ninguem poder usar nao e so sujeira: `acharPorIdentificador` casa tambem pelo NOME e
     `loginPorSenha` nao olha acesso ao painel, entao a senha velha continuaria
     autenticando na API. O painel barra na tela — e a tela nao e a fronteira.

     ADMIN fica de fora: para ele o acesso vem do perfil, nao desta chave. O perfil pode
     nao ter vindo no pedido, entao vale o que ja esta gravado. */
  if (dados.AcessoPainel !== undefined && !L.ativo(dados.AcessoPainel)) {
    var jaGravado = dados.ID
      ? d.usuarios.filter(function (u) { return String(u.ID) === String(dados.ID); })[0]
      : null;
    var perfilFinal = dados.Perfil !== undefined ? dados.Perfil : (jaGravado ? jaGravado.Perfil : '');
    if (String(perfilFinal).toUpperCase() !== 'ADMIN') {
      dados.SenhaHash = '';
      dados.SenhaProvisoria = false;
    }
  }

  if (dados.ID && dados.Ativo !== undefined && !L.ativo(dados.Ativo) && ultimoAdmin(d.usuarios, dados.ID)) {
    return { ok: false, erro: 'Este é o último administrador ativo. Promova outro antes de desativá-lo.' };
  }

  if (dados.Email || dados.Usuario) {
    var conflito = d.usuarios.filter(function (u) {
      if (String(u.ID) === String(dados.ID || '')) return false;
      function igual(a, b) { return a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
      return igual(u.Email, dados.Email) || igual(u.Usuario, dados.Usuario);
    })[0];
    if (conflito) return { ok: false, erro: 'Já existe usuário com esse e-mail ou login: ' + conflito.Nome };
  }

  return await salvarRegistro('Usuarios', { registro: dados });
}

async function salvarRegistro(aba, p) {
  if (!TABELA[aba]) return { ok: false, erro: 'Cadastro inválido.' };
  var dados = p.registro;
  if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch (e) { dados = null; } }
  if (!dados) return { ok: false, erro: 'Nada para salvar.' };

  var d = await db.carregarTudo();
  var colecao = d[COLECAO[aba]];

  if (dados.ID) {
    var atual = colecao.filter(function (x) { return String(x.ID) === String(dados.ID); })[0];
    if (!atual) return { ok: false, erro: 'Registro não encontrado: ' + dados.ID };
    var patch = MAPA[aba].para(dados);
    delete patch.id;
    await db.update(TABELA[aba], dados.ID, patch);
    return { ok: true, id: dados.ID, atualizado: true };
  }

  dados.ID = L.novoId(PREFIXO[aba], colecao);
  if (aba === 'Locais' && !dados.Token) {
    var usados = {};
    d.locais.forEach(function (l) { usados[l.Token] = true; });
    do { dados.Token = L.novoToken(); } while (usados[dados.Token]);
  }
  if (dados.Ativo === undefined) dados.Ativo = true;
  await db.insert(TABELA[aba], [MAPA[aba].para(dados)]);
  return { ok: true, id: dados.ID, criado: true };
}

/**
 * Sem autorização no servidor, o painel só se recupera por SQL se ficar sem admin.
 * Por isso o último ADMIN ativo não pode ser desativado nem excluído — nem por ele mesmo.
 */
function ultimoAdmin(usuarios, id) {
  var alvo = usuarios.filter(function (u) { return String(u.ID) === String(id); })[0];
  if (!alvo || String(alvo.Perfil).toUpperCase() !== 'ADMIN' || alvo.Ativo === false) return false;
  var outros = usuarios.filter(function (u) {
    return String(u.ID) !== String(id) && String(u.Perfil).toUpperCase() === 'ADMIN' && u.Ativo !== false;
  });
  return outros.length === 0;
}

/** Só chaves conhecidas: `config` alimenta a tela, não é depósito de qualquer coisa. */
var CHAVES_CONFIG = ['empresa', 'diasPrazoPadrao', 'motoristas', 'senhaCorrecao'];

/* A SENHA DO CONSERTO FORA DE PRAZO. Enquanto ninguém cadastrar outra, vale esta — é a
   que foi combinada, e está aqui em vez de no banco para o sistema funcionar num banco
   recém-criado. Trocada pela tela, vai para `config` em HASH, e daí em diante é a
   cadastrada que vale. */
var SENHA_CORRECAO_PADRAO = '123456';

/* `digitada`, e não `senha`: o módulo de hash se chama `senha` neste arquivo, e um
   parâmetro com esse nome o encobre — `senha.temHash` passa a procurar o método num
   texto. Foi assim que este código estourou na primeira vez. */
function conferirSenhaCorrecao(digitada, config) {
  var guardado = (config || {}).senhaCorrecao;
  /* O hash é conferido em tempo constante pelo `_senha.js`. A senha de fábrica não tem
     hash para comparar, então vai no `===` mesmo: ela é pública neste arquivo, e não há
     o que um ataque de tempo descubra sobre ela. */
  if (senha.temHash(guardado)) return senha.conferir(digitada, guardado);
  return String(digitada == null ? '' : digitada) === SENHA_CORRECAO_PADRAO;
}

/* NADA QUE PAREÇA SEGREDO SAI NA ROTA `dados`, que é pública e sem autorização nenhuma.
   A peneira é pelo NOME e não por uma lista: chave de segredo criada amanhã sai por
   omissão, em vez de vazar até alguém lembrar de acrescentá-la aqui. */
function configPublica(config) {
  var fora = {};
  Object.keys(config || {}).forEach(function (k) {
    if (/senha|token|chave|secret/i.test(k)) return;
    fora[k] = config[k];
  });
  return fora;
}

async function salvarConfig(p) {
  var chave = String(p.chave || '').trim();
  if (CHAVES_CONFIG.indexOf(chave) < 0) return { ok: false, erro: 'Configuração desconhecida: ' + chave };
  var valor = p.valor;
  /* Senha vai ao banco em HASH, como a de qualquer pessoa. Em texto, quem abre a tabela
     `config` lê a senha que destranca a correção de qualquer lançamento. */
  if (/senha/i.test(chave)) {
    var nova = String(valor == null ? '' : valor);
    if (nova.length < 6) return { ok: false, erro: 'A senha precisa de pelo menos 6 caracteres.' };
    valor = senha.gerar(nova);
  }
  await db.salvarConfig(chave, valor);
  return { ok: true };
}

async function excluir(aba, id) {
  if (!TABELA[aba]) return { ok: false, erro: 'Cadastro inválido.' };
  var d = await db.carregarTudo();
  var colecao = d[COLECAO[aba]];
  var alvo = colecao.filter(function (x) { return String(x.ID) === String(id || ''); })[0];
  if (!alvo) return { ok: false, erro: 'Registro não encontrado.' };

  // Local com movimento não some — vira inativo, senão o histórico fica órfão.
  if (aba === 'Locais') {
    var temMov = d.movimentos.some(function (m) {
      return String(m.OrigemID) === String(id) || String(m.DestinoID) === String(id);
    });
    if (temMov) {
      await db.update('locais', id, { ativo: false });
      return { ok: true, inativado: true, aviso: 'Local tem movimentos — foi inativado em vez de excluído.' };
    }
    // Rota com cliente apontando para ela: apagar quebraria a chave estrangeira e o
    // usuário veria um erro do banco. Inativar mantém o vínculo legível.
    var atende = d.locais.filter(function (l) { return String(l.RotaId) === String(id); });
    if (atende.length) {
      await db.update('locais', id, { ativo: false });
      return {
        ok: true, inativado: true,
        aviso: 'Rota atende ' + atende.length + (atende.length > 1 ? ' pontos' : ' ponto') +
               ' — foi inativada em vez de excluída. Troque a rota deles para poder apagar.'
      };
    }
  }
  // Usuário aparece em cada movimento que lançou e em cada conferência que fez, e uma
  // rota pode apontar para ele. Apagar quebraria a chave estrangeira e, pior, tiraria o
  // nome de quem contou — que é o que dá peso à divergência.
  // Local padrão em uso continua: a coluna do usuário guarda o id, e apagar deixaria
  // a linha apontando para o vazio.
  if (aba === 'LocaisPadrao') {
    var usando = d.usuarios.filter(function (u) { return String(u.LocalPadrao) === String(id); });
    if (usando.length) {
      return {
        ok: false,
        erro: 'Está em uso por ' + usando.length + (usando.length > 1 ? ' usuários' : ' usuário') +
              '. Troque o local deles antes de excluir.'
      };
    }
  }

  if (aba === 'Usuarios') {
    if (ultimoAdmin(d.usuarios, id)) {
      return { ok: false, erro: 'Este é o último administrador ativo. Promova outro antes de excluí-lo.' };
    }
    var lancou = d.movimentos.some(function (m) {
      return String(m.UsuarioID) === String(id) || String(m.ConferidoPor) === String(id);
    });
    var rotas = d.locais.filter(function (l) { return String(l.MotoristaId) === String(id); });
    if (lancou || rotas.length) {
      await db.update('usuarios', id, { ativo: false });
      return {
        ok: true, inativado: true,
        aviso: lancou
          ? 'Usuário tem lançamentos no histórico — foi desativado em vez de excluído.'
          : 'Usuário responde por ' + rotas.length + (rotas.length > 1 ? ' rotas' : ' rota') +
            ' — foi desativado em vez de excluído.'
      };
    }
  }
  await db.remover(TABELA[aba], id);
  return { ok: true, excluido: true };
}

/* ============================ handler ============================ */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!db.configurado()) {
    res.status(500).json({
      ok: false,
      erro: 'Backend sem configuração: defina SUPABASE_URL e SUPABASE_SERVICE_KEY na Vercel.'
    });
    return;
  }

  try {
    var falha = await garantirMigracoes();
    if (falha) { res.status(200).json({ ok: false, erro: falha }); return; }

    var r = req.method === 'POST'
      ? await rotaPost(corpo(req))
      : await rotaGet(req.query || {});
    res.status(200).json(r);
  } catch (e) {
    // O detalhe vai para o log da Vercel; para a tela, uma frase que ajuda sem expor o banco.
    console.error('[caixas]', e && e.stack ? e.stack : e);
    res.status(200).json({ ok: false, erro: mensagemDeErro(e) });
  }
};

/**
 * Coluna ou tabela que falta quase sempre é migração pendente, não defeito de código.
 * Dizer isso na tela poupa muito tempo — o log da Vercel não está à mão de quem opera.
 * Os códigos são do Postgres: 42703 = coluna inexistente, 42P01 = tabela inexistente.
 */
function mensagemDeErro(e) {
  var corpo = String((e && e.corpo) || (e && e.message) || '');
  // PGRST204/205 sao do PostgREST (coluna ou tabela fora do cache do schema) e aparecem na
  // ESCRITA; 42703/42P01 vem do Postgres direto. Tratar so os do Postgres deixava o caso mais
  // comum -- migracao pendente ao salvar -- caindo na mensagem generica.
  if (corpo.indexOf('42703') >= 0 || corpo.indexOf('42P01') >= 0 ||
      corpo.indexOf('PGRST204') >= 0 || corpo.indexOf('PGRST205') >= 0) {
    var col = (corpo.match(/column ["']?([a-z_.]+)["']? does not exist/i) ||
               corpo.match(/find the '([^']+)' column/i) || [])[1];
    return 'O banco está desatualizado' + (col ? ' (falta a coluna ' + col + ')' : '') +
      '. Rode as migrações da pasta supabase/ no SQL Editor.';
  }
  if (corpo.indexOf('23505') >= 0) return 'Já existe um registro com esse valor.';
  if (corpo.indexOf('23503') >= 0) return 'Registro ligado a outro que não existe mais.';
  return 'Falha no servidor ao processar a solicitação.';
}
