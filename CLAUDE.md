# Qdelícia Frutas — Controle de Caixas · nota de retomada

Leia isto antes de mexer. O README é a documentação de instalação; o `manual.html` é o manual de
operação; este arquivo é o que não está óbvio no código.

## O que é

Controle de caixas retornáveis (90% banana) que circulam entre galpão, filiais e clientes.
A dor original: sai fácil, volta mal, e a perda aparece no fim do mês sem dono.

O desenho copia o padrão de mercado chamado *crate ledger*: cada local — inclusive o cliente —
tem saldo próprio, e a caixa fica sempre na conta de quem estiver com ela.

## Onde as coisas estão

| | |
|---|---|
| Repo | `sinerggia-dev/qdelicia-caixas` |
| App | https://qdelicia-caixas.vercel.app |
| Banco | Supabase, `https://lwsrasupgvizuxuwhghy.supabase.co`, região Oregon |
| Clone de trabalho | `Documentos\claude\qdelicia-caixas` |

O GitHub Pages do mesmo repo está **obsoleto** — serve uma versão que aponta para `/api`, que só
existe na Vercel. Se ainda estiver ligado, desligue em Settings → Pages → Source: None.

## As três regras que sustentam o produto

Se uma alteração quebrar qualquer uma delas, o app perde a razão de existir.

1. **Toda devolução baixa saldo assim que é lançada.** *(Mudou em 16/09/2026, a pedido do
   usuário.)* Antes a devolução de quem não podia conferir nascia `AGUARDANDO` e só a
   conferência no galpão a confirmava. A aba Conferência saiu do app de campo — e era o
   **único** lugar onde uma devolução era confirmada —, então manter o `AGUARDANDO` travaria
   a caixa na conta do cliente para sempre. O status deixou de segurar o razão: `efetiva()`,
   `saldos()` e o extrato não olham mais para ele, e linhas antigas em `AGUARDANDO` passaram
   a contar. `pendentes()` e `emConferencia()` devolvem vazio de propósito — listar como
   pendente algo que já entrou na conta seria a tela se contradizendo. A rota `conferir`
   continua existindo e ainda registra divergência, mas virou ajuste, não portão.
2. **Nada é apagado.** Movimento errado se cancela (`cancelado = true`), nunca se deleta. Local com
   movimento é inativado, não excluído.
3. **O navegador não fala com o banco.** Toda leitura e escrita passa pela função. É isso que
   permite PIN de 4 dígitos e link de cliente sem login.

## Rota é um tipo de local, não uma tabela nova

`locais.tipo` aceita `GALPAO | FILIAL | CLIENTE | ROTA`. A rota é o caminhão em circulação e
guarda caixa como qualquer outro nó — por isso saldo, aging, extrato e movimentos funcionam para
ela sem uma linha de matemática nova. Foi a razão de não criar tabela separada.

Duas colunas sustentam o vínculo: `locais.motorista_id` (rota → usuário `MOTORISTA`) e
`locais.rota_id` (cliente/filial → rota). A segunda é auto-referência na mesma tabela.

No `painel()` as rotas saem em `rotas`, **fora** de `locais` — quem consome não deve misturar
caminhão com cliente. Cada rota traz `saldo` (no caminhão) e `saldoClientes` (nos pontos dela)
separados de propósito: somar os dois esconde onde a caixa está.

Banco antigo se resolve sozinho: ver a seção de migração automática.

## Perfis

`Admin, Gestor, Gerente, Conferente, Motorista, Promotor`. `Galpao` foi renomeado para
`Conferente` por migração, mas **continua reconhecido no código**: a sessão guardada no
celular só troca no próximo login.

**A grafia gravada é a que a pessoa escolheu** — Inicial Maiúscula, conectores em minúscula
("Supervisor de Área"). Nenhuma tela reescreve a caixa para exibir. Em compensação, **nenhuma
comparação de permissão pode ser sensível a caixa**: `podeConferir()`, `podeVerPainel()`,
`ehAdmin()` e o `ultimoAdmin()` comparam em MAIÚSCULA por dentro. Se acrescentar uma
comparação nova, normalize antes — senão "conferente" perde a aba que "Conferente" tem.

O perfil é **texto livre**: o escritório escreve o cargo que precisar, e as sugestões do
formulário são os de fábrica mais os que alguém já usou (`L.perfisConhecidos()`). Um perfil
escrito nasce **sem poder nenhum** — não cadastra e não administra. Permissão por
digitação seria permissão por engano de digitação. Só
`ADMIN` e `CONFERENTE` têm poder próprio; o resto do acesso é a chave por usuário.

A trava do banco foi removida de propósito (o `check` em `usuarios.perfil`): quem valida
agora é a aplicação, em `salvarUsuario` — vazio e símbolo estranho são recusados ali.

`L.podeConferir()` continua existindo e testado, mas **não decide mais nada no fluxo**: com a
etapa de conferência extinta, o perfil deixou de influir no status da devolução. Foi mantido
para o dia em que a etapa voltar — e para que a volta seja mudar uma linha, não reconstruir
a regra.
São dois lugares porque o celular não carrega `_logica.js`; se mudar um, mude o outro.

## Separação de funções no painel

Quem abre o `admin.html` é decidido por `usuarios.acesso_painel`, **uma chave por pessoa**.
Até setembro/2026 era consequência do perfil (ADMIN e GALPAO entravam), e não havia como
separar o conferente que precisa ver os números do que só lança no galpão.

`L.podeVerPainel(u)` é a autoridade, e vale mais que a coluna: **ADMIN entra sempre**, mesmo
com a chave desligada — senão dá para trancar o último administrador do lado de fora, e a
volta seria por SQL. Desativado não entra em hipótese alguma. A migração nasceu com
`default false` e ligou a chave para quem já entrava, então ninguém perdeu acesso no deploy.

Dentro do painel, **Lançar** e **Cadastros** continuam escondidos para quem não é `ADMIN`, e o
botão de cancelar movimento também. O motivo não é hierarquia — é que o conferente é
justamente quem gera a divergência na chegada. Dar a ele um *Ajuste de saldo* seria deixá-lo
apagar o próprio erro, e o cadastro de usuários deixaria ele trocar o PIN do admin.

**Isso é só a interface.** A API **não tem autorização nenhuma**: o `login` confere a senha e
devolve o usuário, mas as chamadas seguintes não carregam prova de quem é. Um `POST /api` com
`{"acao":"salvarUsuario"}` funciona de qualquer lugar, sem senha — inclusive para ligar a
própria chave. Herdado do Apps Script e mantido na migração. Enquanto for app de teste, tudo
bem; virando operação real, é Supabase Auth com checagem de perfil em cada rota.

## Não existe valor em dinheiro

Removido em setembro/2026 a pedido do usuário. Não há preço de caixa, KPI de valor exposto, coluna
de valor no painel nem no CSV. `tipos_caixa` tem só nome e ativo. Se o banco é antigo, a coluna
`valor_unit` pode continuar lá sem uso — o `schema.sql` traz o `alter table ... drop column` no
comentário.

Se um dia pedirem valor de volta, não é só religar a coluna: `painel()` e `extrato()` em
`_logica.js` precisam voltar a calcular, e a interface a exibir.

## Arquitetura

```
navegador ──fetch──► /api (função na Vercel) ──chave secreta──► Postgres (Supabase)
```

| Arquivo | Papel |
|---|---|
| `api/_logica.js` | Regras puras. **Zero acesso a banco** — é o que permite testar sem rede nem chave. |
| `api/_supabase.js` | PostgREST via `fetch`, sem dependência. Traduz snake_case ↔ formato interno. |
| `api/index.js` | Roteador das 16 ações (`acao=...`), o mesmo contrato desde a versão do Apps Script. |
| `app.js` | Núcleo do front: API, sessão, fila offline. |
| `supabase/schema.sql` | Tabelas, índices, RLS, bucket. Idempotente. |

Arquivos em `api/` que começam com `_` **não viram endpoint** — a Vercel os trata como auxiliares.
Essa é a razão do underscore; não renomeie.

**Não existe `package.json` nem `vercel.json`, de propósito.** Zero dependência, zero build. A
Vercel detecta sozinha: estáticos na raiz, funções em `api/`. Adicionar um `package.json` faz ela
procurar um passo de build que não existe.

### Segurança

RLS **ligado e sem nenhuma política** em todas as tabelas. Parece errado e é intencional: com RLS
ativo e zero políticas, a chave pública não lê nem escreve nada. Quem entra é a função, com a
chave secreta, que ignora RLS.

Verificação rápida de que continua valendo:

```
curl -s -o /dev/null -w "%{http_code}" "https://lwsrasupgvizuxuwhghy.supabase.co/rest/v1/movimentos?select=*"
```

Tem que responder **401**. Se responder 200, alguém criou uma política — investigue antes de
qualquer outra coisa.

A chave vive só em `SUPABASE_SERVICE_KEY`, nas variáveis de ambiente da Vercel. É uma *secret key*
nova do Supabase (`sb_secret_...`, chamada `vercel_api`), não a `service_role` legada. **Nunca**
coloque em arquivo do repositório, e não peça para o usuário mandá-la por chat.

## Entrar: duas credenciais, uma porta só

**As credenciais continuam duas**, de propósito, por escolha do usuário. O celular lança de
luva várias vezes por dia e o PIN protege só lançamento — que fica assinado e pode ser
corrigido. O painel vê a operação inteira e mexe em cadastro, então pede e-mail/usuário mais
senha em hash (scrypt, `_senha.js`). Se alguém pedir para fundir **as credenciais**, a
pergunta já foi feita e a resposta foi manter.

**A TELA, porém, é uma só** — `Q.portaUnica(aqui, abrir)` no `app.js`, e o `index.html` e o
`admin.html` carregam o mesmo bloco de entrada, palavra por palavra (o `teste_tela` compara os
dois trechos e exige que sejam idênticos). Eram duas telas quase iguais, "Área do Usuário" e
"Área Admin", cada uma com um link para a outra no rodapé. Quem errava a porta levava
"usuário ou senha incorretos" — uma mensagem que falava do erro errado: a credencial estava
certa, o endereço é que não era. E não havia como a pessoa saber qual das duas era a dela.

Como a porta é uma só, quem decide o destino é a **sessão**, não o link clicado:

```
loginUnico(usuarios, ident, segredo, conferir)   // _logica.js
  → tenta a SENHA primeiro, depois o PIN
  → devolve `via: 'senha' | 'pin'`

destinoDa(s)   // app.js
  → via === 'senha' && acessoPainel === true  →  admin.html
  → tudo mais                                  →  index.html
```

**A ordem não é arbitrária.** Na ordem inversa, alguém cuja senha do painel fosse por acaso
seis dígitos entraria sempre como PIN e perderia o painel — sem erro nenhum na tela, e sem
maneira de entender por quê.

**Uma recusa só para os dois fracassos.** Segredo errado e identificador inexistente devolvem
a mesma frase, e a recusa não diz por qual credencial falhou: mensagens diferentes contariam a
quem estivesse testando se aquele identificador existe, e com que credencial.

**O `via` é propriedade da SESSÃO, não do cadastro.** O servidor só o sabe no instante do
login; `meuAcesso` devolve o registro sem ele. Como a renovação chama `entrar()` com esse
registro, o `entrar()` preserva o `via` que já estava lá — sem isso ele sumia segundos depois
do login e a sessão de PIN passava a abrir o painel. Isto foi **medido no navegador**, não
deduzido.

**A mesma regra é cobrada três vezes, de propósito.** Mandar para o outro app é conveniência,
e quem digita `admin.html` na barra passa por cima dela: por isso o `podeEntrar` do painel
recusa a sessão de PIN por conta própria, e o `aplicarSessao` do campo esconde a porta do
painel para quem entrou por PIN — deixá-la ali devolveria pelo atalho o que a entrada acabou
de recusar. **Sessão de antes da porta única não tem `via`, e essa passa**: derrubar quem já
estava logado no dia do deploy é pior, e o próximo login corrige.

**O campo do segredo não tem olho de "mostrar a senha", e isso é de propósito.** Ele teve, e o
resultado foi um campo com **dois**: o botão do app e o `::-ms-reveal`, que o Edge desenha
sozinho em todo `input type=password` e que o Chrome não desenha. Lado a lado, dois controles
com a mesma função parecem defeito. Medido no navegador: o do app ficava centrado em x=550 e o
do Edge em x=510, dentro do vão de 58px que o `padding-right` reservava. O do app saiu, o vão
saiu com ele, e o `teste_tela` cobra as duas ausências.

Consequência a saber antes de mexer: **no celular não sobra nenhum**, porque Chrome, Firefox,
Safari e Android nunca desenharam o deles. Se um dia o galpão pedir para ver o que digitou, o
caminho é trazer o botão do app de volta **e** matar o do Edge com
`input[type="password"]::-ms-reveal{display:none}` — nunca só o primeiro, ou a dupla volta.

**A rota ainda aceita `senha` e `pin` soltos**, além do `segredo` novo. Há tela em cache e fila
offline mandando os campos antigos, e recusá-los tirava gente do ar no dia do deploy.

**Não existe envio de e-mail neste app.** Por isso "esqueci a senha" não manda link: quem tem
PIN ou a senha antiga se resolve sozinho na tela; quem não tem nenhum dos dois grava um pedido
em `pedidos_senha`, e o admin vê em Cadastros → Pedidos de senha e cadastra a senha nova à mão.

`pedirSenha` responde **sempre** `{ok:true}`, exista o identificador ou não, e ignora repetição
do mesmo identificador. Diferenciar as respostas transformaria a tela de login pública num
listório de quem trabalha na empresa. Se mexer ali, mantenha isso.

## As colunas de uma tabela são dado, não HTML

Cada tabela ajustável tem **um descritor** em `admin.html` — `TAB_ATIVOS`, `TAB_MOV`,
`TAB_USUARIOS`:

```js
{ padrao: [...ids na ordem de fábrica],
  larg:    { id: px },
  titulos: { id: 'Nome na tela' },
  kOrdem, kLarg, kOcultas,      // as três chaves de localStorage
  alvo, redesenha }             // o seletor da tabela e como pedir o redesenho
```

A máquina compartilhada — `ordemColunas(t)`, `colunasOcultas(t)`, `larguras(t)`,
`ligarArrastarColunas(t)`, `ligarLarguraColunas(t)` e as três `guardar*` — recebe o descritor,
não conhece tabela nenhuma pelo nome. O cabeçalho, as células e o CSV iteram a **mesma** lista.

A aba **Colunas** (`pgColunas`, `desenharColunas()`) é uma tela sobre esses descritores: uma
ficha por módulo, montada a partir de `tabelasGerenciaveis()`. **Registrar o próximo módulo é
acrescentar um item ali** — não escrever outra tela. E a tela avisa quais ainda não entram
(Painel, Extratos, Cadastros, cujas tabelas têm cabeçalho escrito à mão): módulo que falta sem
explicação parece coisa quebrada.

Três coisas que já custaram caro e não devem voltar:

- **o título mora no descritor** (`titulos`), e a célula o lê de lá. Escrito nos dois lugares,
  diverge no primeiro renome — e a aba passaria a oferecer um nome que a tabela não usa;
- **esconder não tira a linha da lista da aba**, só a apaga. Sumindo, não haveria como trazer a
  coluna de volta, e é justamente ela que se procura;
- **esconder é um botão que diz "✕ esconder"**, não uma caixa de marcar. A primeira versão usava
  caixa, e o usuário abriu a aba e não achou a função: marcada, a caixa não diz o que acontece ao
  desmarcar, e a palavra que a pessoa procura não aparecia em canto nenhum da tela. Nenhum teste
  quebrou, porque todos olhavam para o `data-colver` e nenhum para o que se **lê**. Agora há
  afirmações sobre o texto visível, e a página nomeia as três ações por extenso;
- **mover mexe na ordem completa**, não só no que está visível. Mexer no visível embaralha a
  ordem das escondidas sem ninguém ver, e elas voltam noutro lugar ao reaparecer.

A coluna dos botões de ação de Movimentos e de Usuários fica **fora** do sistema: não é dado, é o
caminho para corrigir. Escondível, alguém a esconde sem querer e perde o único jeito de consertar
um lançamento.

Duas coisas que **só apareceram medindo no Chrome**, e que nenhum teste de código pegava:

- **o estilo do cabeçalho segue a classe `fixa`, nunca um id.** Estava escrito para
  `#tabelaFluxo`, e quando Movimentos entrou na maquinaria ganhou o arrasto no JavaScript e não
  ganhou onde clicar: a alcinha media **0x16px** e a tabela ficava em `table-layout:auto`. Tudo
  ligado, nada funcionando, e o código parecia certo;
- **toda tabela termina numa coluna de folga**, sem largura (`<th class="folga">` no Painel de
  Ativos; a coluna dos botões em Movimentos e Usuários). Em `table-layout:fixed` com a tabela a
  100%, o que sobra é repartido entre as colunas: pedir 95px devolvia **435px** sempre que as
  colunas não enchiam a janela, e esconder uma só esticava as outras. O `colspan` da linha de
  "nada aqui" conta essa folga (`cs.length + 1`).

## Nada marcado = nada liberado. Marcar é conceder.

**A convenção do projeto, e ela virou em setembro/2026.** Antes, lista vazia queria dizer
**todos**. A razão era boa — errar para o lado de mostrar se corrige no cadastro, errar para o
lado de trancar só se resolve com o admin por perto — mas ela surpreendia justamente quem
cadastra: o administrador desmarcava todas as abas de uma pessoa, esperava que ela não visse
nada, e ela continuava vendo cinco páginas. **Formulário cuja marcação não faz o que aparenta é
pior do que formulário rígido.**

São oito listas: `Abas`, `Operacoes`, `Saidas`, `Destinos`, `TiposCaixa`, `Motoristas`,
`Ajustes` e `UsuariosVistos`.

### A regra mora numa constante só

```js
var VAZIA_LIBERA = false;          // api/_logica.js
function podeItem(lista, id)       // "este id está liberado?"
function peneirarPor(lista, itens) // "quais destes itens a lista libera?"
```

Virar a chave de volta é mudar `VAZIA_LIBERA`. É de propósito que seja **uma**: espalhada por
oito funções, metade delas discordaria na primeira mudança — e a que discordasse mentiria calada.

O app de campo não carrega `_logica.js` e tem a sua cópia da regra em `permitidos()`. Um teste
compara as duas.

### O preço, dito em voz alta

**Item novo nasce NEGADO.** Um galpão, um motorista, um tipo de caixa ou um usuário criado amanhã
não aparece para ninguém até ser marcado, pessoa por pessoa. É assim que funciona toda lista de
permissão explícita, e é exatamente o que a convenção antiga existia para evitar.

Os cinco formulários de cadastro **avisam isso na hora de criar** (`avisoItemNovo()`), só no
cadastro novo — editar item que já existe não muda permissão de ninguém. Sem o aviso, o preço é
descoberto dias depois, por um motorista que não acha o cliente novo na lista, e aí parece bug.

### A virada não tirou nada de ninguém

A migração `2026-09-22-marcar-o-que-ja-valia` gravou, em cada cadastro com lista **vazia**,
exatamente o que a pessoa já enxergava. Nove dos dez cadastros estavam vazios; sem ela, o deploy
teria tirado o painel e o app de praticamente toda a operação no mesmo instante.

Ela só mexe em quem está vazio: quem já tinha marcação escolheu aquilo, e sobrescrever seria
desfazer uma decisão do administrador.

### As duas exceções, e por que cada uma existe

- **O ADMIN sem marca nenhuma entra em tudo.** Ele é a origem da concessão, e um admin nascido
  sem marca perderia até a tela onde isso se conserta — a volta seria por SQL no banco. Só com a
  lista **vazia**: admin que marca recebe o que marcou, como todo mundo. A regra e a exceção
  estão na **mesma linha** de `abasPermitidas()`; separadas, a exceção acaba vindo antes da marca
  e o admin perde a capacidade de se restringir. Aconteceu enquanto isto era escrito, e o teste
  pegou.
- **Sem local informado, `podeAjustarEm()` não opina.** Quem recusa é a validação do campo, com a
  mensagem que ajuda a corrigir.

### O que mudou junto

- **Marca quebrada não concede nada.** Um id de aba renomeada caía no padrão e a pessoa via tudo
  menos as sensíveis. Era coerente com a convenção de então e é o oposto desta.
- **O atalho por perfil do promotor saiu.** "Promotor sem marca ganha RETORNO" era um padrão
  escondido, e padrão escondido é a surpresa que a virada veio tirar. A migração gravou
  `['RETORNO']` em quem dependia dele.
- **"Vê os lançamentos de todos" passou a ser a lista CHEIA**, e não a vazia — o seletor tem de
  dizer o que a lista de fato faz. E a lista vazia abre em "escolhidos", que é a verdade: a lista
  manda, e está vazia. Quem não vê ninguém está em *não vê os lançamentos*, o interruptor ao lado.
- **`recorteProprios()` manda `__ninguem__` quando a lista está vazia.** Mandar `''` seria não
  pedir recorte, e não pedir é pedir todos — entregaria a operação inteira a quem não tem marca.

### Filtro NÃO é permissão

Na aba Lançamentos, nada marcado num filtro continua querendo dizer **todos**, e tem de
continuar. São coisas diferentes com a mesma cara: permissão responde *o que esta pessoa pode*, e
marcar é conceder; filtro responde *o que ela quer ver agora*, e nada marcado é "não estou
filtrando por isto". Invertido ali, a aba abriria sem nenhuma linha e sem pista do porquê.

## Ajuste e perda: a aba é a porta, a lista de locais é o quarto

A aba **Ajustes** era tudo-ou-nada: quem a tivesse mexia no saldo de **qualquer** galpão, filial,
cliente ou rota. Agora há uma lista por pessoa (`Ajustes`, coluna `ajustes`), com a convenção do
projeto: **vazia quer dizer TODOS**. Invertida, o dia do deploy trancaria a operação inteira fora
do próprio ajuste, inclusive o administrador.

**AJUSTE e PERDA não passam pela lista `Operacoes`**, e isso é de propósito: `operacaoDoTipo()`
devolve `''` para as duas, porque elas nascem no escritório e governá-las por ali trancaria o
administrador fora do próprio ajuste. Quem manda nelas é esta lista de locais.

**Qual local cada tipo mexe mora em `localDoAjuste()`, num lugar só.** AJUSTE credita o
**destino**; PERDA debita a **origem**. Espalhada entre a tela e o roteador, a tela filtraria um
campo e a gravação cobraria outro, e a restrição passaria a valer só na metade que alguém
lembrasse.

**A peneira entra nos dois campos da tela.** Filtrar só o do ajuste deixaria a perda como porta
dos fundos: a mesma pessoa, barrada no ajuste, dando baixa no mesmo local pela outra opção do
seletor.

**A tranca é o roteador, não o seletor.** `api/index.js` recusa antes de montar o movimento, lendo
o cadastro do servidor — filtrar o seletor é conveniência, e um POST direto passa por cima dele.

**E a peneira anuncia que peneirou** (`#lcRestrito`). Lista curta e muda parece cadastro faltando,
e manda a pessoa procurar em Cadastros um local que está lá e continua não aparecendo. O aviso diz
**quais** são os locais e **onde** se resolve; aparece só para quem tem lista, porque para quem
pode tudo seria ruído.

**A sessão renovada remonta o seletor** (`aplicarSessao` → `if (DADOS) ajustarLancamento()`). Ela
chega depois do primeiro desenho: sem isso, a permissão mudada no cadastro só valeria no próximo
recarregamento, e até lá a pessoa veria os locais antigos e levaria a recusa do servidor sem
entender por quê.

### O tradutor do banco não era testado

Nada cobria o `api/_supabase.js`: uma coluna podia deixar de ser lida **ou** de ser gravada e todo
o resto continuava verde, porque as suítes rodam sobre um banco falso que não passa por ele. É o
ponto exato em que uma permissão vira "não fica salva". Agora há uma varredura que, para cada uma
das oito listas, exige o `lista(r.<coluna>)` na leitura e o `r.<coluna> =` na gravação.

## O painel nasce fechado: nenhuma aba, nenhuma página

Ao entrar, as sete abas apareciam por alguns segundos e só depois a peneira rodava —
`ajustarAbasPainel()` precisa do **catálogo** de abas, que diz quais existem e quais são
sensíveis, e ele só chega com a `equipe`. Nesse intervalo a pessoa via *Ajustes* e
*Cadastros*, e **podia clicar**: as seções existem no HTML e a API não tem autorização
nenhuma. Medido: 7 abas à vista e o Painel de Ativos aberto, por toda a ida e volta da rede.

Agora **as abas nascem com `style="display:none"` e nenhuma página nasce `ativa`**. Quem
revela é a peneira, depois de saber. Sem catálogo ela não mostra nada — o mesmo `return`
de antes, que só era inofensivo porque as abas nasciam visíveis.

`style="display:none"` e **não** o atributo `hidden`: há seletores em produção que
procuram `:not([style*="none"])` para achar a primeira aba liberada, e trocar o mecanismo
aqui os deixaria achando aba escondida.

Três coisas que a lateral vazia exige dizer, porque navegação em branco parece tela
quebrada e a pessoa recarrega:

- **enquanto carrega** — "Carregando suas permissões…", que sai quando a peneira roda;
- **se a `equipe` falhar** — a peneira nunca roda e as abas ficariam escondidas para
  sempre. O `toast` some em segundos; quem chegar depois dele só veria o branco;
- **se ninguém liberou nada** — `abasPermitidas()` já evita, mas se escapar, a pessoa
  merece a frase em vez do vazio.

O app de campo **não tinha esse problema**: `ajustarAbas()` decide só com a sessão, sem
catálogo, e roda antes de qualquer resposta chegar.

## Toda aba pode ser concedida — o padrão é que trava, não o perfil

Ajustes e Cadastros eram travadas para quem não é Admin. **A trava saiu a pedido do usuário:**
o administrador concede qualquer aba a qualquer pessoa.

O que ficou no lugar dela é o **padrão**. As duas são `sensivel: true` em `ABAS`, e `sensivel`
não quer mais dizer "só admin" — quer dizer **"só por marca explícita"**: elas ficam fora do
"nada marcado = todas".

| quem | sem marca | com marca |
|---|---|---|
| não-admin | todas **menos** Ajustes e Cadastros | exatamente as marcadas, **inclusive** as sensíveis |
| admin | todas | exatamente as marcadas |

O motivo do padrão fechado é o tamanho do estrago: **Cadastros deixa criar e editar usuários,
inclusive tornar-se administrador**, e Ajustes lança correção de saldo. No padrão, o próximo
usuário criado com acesso ao painel e sem marca nenhuma ganharia as duas de brinde. Concedida a
dedo é escolha; concedida por omissão é acidente.

Pela mesma razão, **marca quebrada cai no padrão fechado**: um id de aba que foi renomeada não
pode virar a porta de entrada do cadastro de usuários.

O admin sem marca vê tudo porque trancá-lo fora do próprio cadastro não teria como ser desfeito
por ninguém.

No formulário, as duas não travam mais — ganham a etiqueta **"dá poder"** e, quando alguma está
marcada, uma nota dizendo o que aquilo permite. **A etiqueta avisa, não impede**: impedir era o
que o pedido tirou, e conceder Cadastros não pode ser um clique igual aos outros.

## Os cartões: duas famílias, um tamanho

`.kpi` (com caixa e sombra, aba Painel) e `.ftile` (com filete à esquerda, Painel de Ativos e
Lançamentos) são duas famílias de cartão em telas diferentes. **O número e o rótulo têm de ter o
mesmo tamanho nas duas**: a pessoa troca de aba e compara, e um número de 26px ao lado de um de
20px faz a mesma informação parecer de importância diferente. Há teste comparando as duas.

Foram reduzidos a pedido: `.kpi` de 75px para 57px de altura, `.ftile` de 68px para 56px, e a
fileira de 83px para 67px. Medido no Chrome com os rótulos reais, que são longos — *"Caixas que
Saíram e Não Voltaram"* tem 32 caracteres, e a checagem é se ele ainda cabe numa linha, porque
quebrando em duas o cartão volta a crescer e o ajuste teria piorado o que queria melhorar.

**O rótulo não encolheu na mesma proporção do número.** Ele já estava no limite do legível, e é
ele que diz o que o número é — um cartão proporcional seria um cartão ilegível. O resto da altura
saiu da **entrelinha**: em 1.5 (o padrão) cada linha de 11.5px gastava 17px.

A largura mínima da coluna estreitou junto (`minmax`). Com o cartão mais baixo e a largura de
antes, sobraria faixa vazia entre eles e a fileira pareceria mais **vazia**, não menor.

## A lista de tipos da regra de campo é uma armadilha

`input[type=text],input[type=number],…` em `styles.css`: o tipo que **não está nessa lista** nasce
com o visual de fábrica do navegador — **fundo branco e ~190px de largura** — no meio de uma tela
escura. Não dá erro, não quebra nada, e só aparece quando alguém olha.

Pegou duas vezes: o `type=search` da busca nova, e o `type=email` do cadastro de usuários, que
ficou branco por semanas sem ninguém ligar o defeito à causa.

Há um teste que compara **todo `type=` que as três telas usam** com a lista da regra, ignorando os
que não são campo de texto (`button`, `checkbox`, `file`…, que têm visual próprio e que a regra
estragaria — um `checkbox` com `width:100%` vira uma faixa). O próximo tipo novo cai ali no mesmo
dia em que for escrito. O teste também imprime os tipos da regra que ninguém usa, sem falhar por
isso.

O `::-webkit-search-cancel-button` do `search` precisa de `filter:invert(1)` pela mesma razão do
ícone do seletor de data: nasce preto e some no campo escuro.

## Ver lançamentos: se vê, e de quem

Duas colunas, e duas perguntas encadeadas — a segunda só faz sentido depois da primeira:

| coluna | o que é | padrão |
|---|---|---|
| `ver_lancamentos` | vê lançamentos, sim ou não | **true** |
| `usuarios_vistos` | de quais usuários | `[]` = **todos** |

Os dois padrões estão nessa direção pelo mesmo motivo: o contrário tiraria o lançamento de
todo mundo no dia do deploy. É a convenção "lista vazia = TODOS", que já vale nas outras seis
listas, e `VerLancamentos !== false` — e **não** `=== true` — porque o registro antigo não tem a
coluna, e `=== true` deixaria todos eles sem lançamentos.

### O seletor do painel é um atalho para a lista

A pedido, o seletor **Pode entrar no painel?** voltou a oferecer *"sim — vê apenas os lançamentos
dele mesmo"*. Ele **não** é um segundo lugar de verdade: escreve na mesma `usuarios_vistos` e lê
dela. As duas direções são mantidas em dia, então não há como discordarem:

| lista | seletor mostra |
|---|---|
| vazia | sim — vê os lançamentos de todos |
| só ela | sim — vê apenas os lançamentos dele mesmo |
| outras pessoas | sim — vê de pessoas escolhidas abaixo |

**O `selected` inicial vem do REGISTRO, e toda opção sabe vir marcada.** Sem isso nenhuma
`<option>` levava `selected` para quem tinha painel, o navegador caía na primeira — "não" — e o
formulário de quem TEM painel abria dizendo que não tem. Salvar dali gravava `AcessoPainel: NAO`
e tirava o acesso de alguém que ninguém mandou tirar. **A gravação estava certa o tempo todo; quem
mentia era a abertura.**

Esse defeito passou por 593 afirmações, porque todas olhavam o que o formulário **faz** depois de
aberto — o ajuste, os gatilhos, o salvar — e nenhuma olhava o que ele **mostra** no instante em
que nasce.

**E a correção foi escrita no lugar errado, então o defeito continuou igual por semanas.** O
`var inicial` ficou umas cinquenta linhas ABAIXO do `modal(` que o interpola. `var` é içado: o
nome existe durante o HTML e vale `undefined`, nenhuma das quatro comparações bate, nenhuma
`<option>` nasce `selected` — e o navegador escolhe a primeira, que é "não". Não dá erro nenhum.
Medido no navegador com a resposta real do servidor: Nestor Neto tinha `AcessoPainel:true`
gravado, o formulário abria em "não — só o app de campo", as abas apareciam travadas e um aviso
dizia que a culpa era de uma chave que ele tinha ligada. Era isso que o usuário via como
"a configuração nunca fica salva".

**`inicial` é calculado antes do `modal(`, e isso não é estilo.** O bloco de teste agora afirma a
ordem, e mais: que **nenhum** nome interpolado pelo formulário seja declarado depois dele. A regra
vale mais que o caso — a próxima conta escrita no lugar errado mentiria do mesmo jeito, e de novo
sem nada para denunciar.

Uma lição sobre o teste, e não sobre o código: a afirmação antiga procurava `var inicial` no
arquivo, e ele estava lá. Procurar se uma linha **existe** não diz se ela **roda a tempo**.

### As perguntas ficam na seção que corresponde ao que elas fazem

"Vê os lançamentos?" e "De quem ela vê os lançamentos" moraram um tempo embaixo de **O que ele
pode lançar**, onde liam como permissão de *lançar*. As duas dizem o que **aparece** para a pessoa
— exatamente como o quadro das abas do painel, logo acima. Agora as três estão juntas em **O que
ele vê no painel**, e *O que ele pode lançar* começa no que ela de fato faz: a operação.

Isso alinha a tela ao manual, que já descrevia "Lançamentos: se vê, e de quem" dentro de *o que
cada um pode ver no painel*. Um teste afirma a ordem das seções: título → abas → lançamentos →
*pode lançar* → operação, e a pergunta antes da lista que ela comanda.

A quarta opção **só aparece quando a lista diz isso**: sempre visível, ela ofereceria um estado
que a lista não está, e escolhê-la não faria nada. E o ouvinte do seletor **mexe na lista e só
então reavalia** — na outra ordem, o ajuste leria a lista velha e o rótulo voltaria sozinho.

`resumoDaLista()` e `aplicarResumo()` são as duas direções, cada uma numa função: a mesma conta
espalhada nos dois ouvintes discorda no primeiro caso que alguém esquecer.

**O usuário novo ainda não tem id** quando o formulário salva, então "apenas ele mesmo" manda o
marcador `__EU__`, e **o servidor** o troca pelo id — é o único ponto que conhece o id final nos
dois casos, o que já existe e o que acaba de nascer. E o id escolhido é o mesmo que o registro
leva; dois ids diferentes deixariam a pessoa vendo os lançamentos de ninguém.

Isto **substituiu** o interruptor `so_proprios`, que durou um dia: a lista diz aquilo (marcar só
ela mesma) e diz também o que o interruptor não dizia — *"ela vê os dela e os do fulano"*. A
migração converte quem estava na marca antiga, e `usuariosVistosDe()` entende as duas enquanto a
migração não roda. Nunca houve ninguém marcado em produção, então a troca não mexeu em ninguém.

O recorte é o mesmo `recorteProprios(dados, quem)`, agora com **uma lista** (ou texto separado
por vírgula, que é como a tela manda). Ele estreita `dados.movimentos` **na porta**, como
`recorteTeste`, e tudo o que vem depois obedece sozinho — Painel de Ativos, saldos, extratos,
Movimentos e a aba Lançamentos do app de campo.

**"Não vê lançamento nenhum" pede `'__ninguem__'`, e não vazio.** Não pedir nada pediria TODOS,
pela convenção do vazio — o contrário exato do que o admin marcou. Essa linha existe nas duas
telas, idêntica, e há teste comparando as duas palavra por palavra.

**A ordem dentro de `ajustarPainel()` importa.** O laço que destrava os quadros quando a pessoa
está ativa roda no meio da função; travar a lista de "de quem" **antes** dele não adianta nada —
o laço desfaz. Medido na primeira versão: com o interruptor em NÃO, 3 de 3 continuavam clicáveis.
Há uma afirmação sobre a posição, não só sobre a existência da trava.

**A aba Lançamentos some** do app de campo para quem não vê — some, e não fica vazia: uma aba que
abre sem nada dentro parece quebrada, e a pessoa volta nela toda vez achando que não carregou. Se
era ela que estava aberta, outra assume.

A aba tem **busca** (`lcBusca`). Os cinco filtros respondem *quais*; a busca responde *cadê
aquele* — com trinta linhas e cinco listas, achar UM lançamento custa quatro cliques, e digitando
custa um. Ela procura em origem, destino, caixa, motorista e quem lançou, **e o campo diz isso**:
buscar no que a etiqueta não promete devolve resultado que ninguém entende de onde veio. Ignora
acento e caixa, e cada palavra precisa aparecer em **algum** campo da mesma linha — *"isaque joao"*
acha a carga do Isaque para João Pessoa, que é como a pergunta se faz; um "ou" traria quase tudo.

Ela entra na **mesma peneira** dos filtros, e não por fora: por fora esconderia linhas e deixaria
os cartões de cima somando as escondidas. O "Limpar filtros" apaga a busca junto, e quando ela
não acha nada a tela diz que foi ela — *"Nenhum lançamento"* sozinho faz a pessoa procurar no
período, quando o que sobrou de fora foi o que ela digitou.

Os filtros da aba são **listas suspensas**: abertas no lugar, elas empurravam a tabela para
baixo — a fileira inteira crescia para caber a mais alta, e os outros quatro filtros viravam
caixas vazias de 350px. Suspensa, a lista passa por cima e a tabela não se mexe. Uma de cada vez
(vizinhas na mesma fileira, duas abertas se cobrem), fecha ao clicar fora, e a última abre para a
esquerda para não sair pela borda da tela. **`.filtros-lanc` não pode ganhar `overflow:hidden`** —
seria a terceira vez que uma lista flutuante some atrás de um recorte de ancestral neste projeto.

A aba mostra **quem lançou**, em coluna e em filtro, e esse é o **primeiro** filtro da fileira:
com a permissão "de quem ela vê" citando várias pessoas, *de quem é isto* passa a ser a primeira
pergunta de quem olha a lista, e não a última. Ela passou a listar os lançamentos de mais
de uma pessoa — é o que a permissão "de quem ela vê" faz de propósito —, e sem isso as linhas de
duas pessoas ficam misturadas sem nenhum jeito de saber de quem é cada uma. O filtro entra na
**mesma** maquinaria dos outros quatro: mesma função de opções, mesma convenção "nada marcado =
todos", mesmo contador. O "Limpar filtros" alcança porque varre o container inteiro — e é por isso
que o filtro novo mora **dentro** de `.filtros-lanc`, e não ao lado dele.

**Uma exceção, de propósito:** o `carregarPainel()` do `index.html` não é recortado. Ele alimenta
o aviso de saldo embaixo da origem no formulário de retorno, e é desse número que sai o alerta
*"você contou mais do que o saldo"*, uma das guardas contra saída não lançada. Recortado, o saldo
viria menor que a realidade e o alerta acusaria erro em toda devolução legítima, até a pessoa
aprender a ignorá-lo. A exceção está escrita no código e testada.

**Não há aviso na tela de quem está restrito** — houve uma faixa âmbar e ela foi retirada a pedido
do usuário. A consequência é conhecida: quem está restrito e ainda não lançou nada vê zeros.

**Isto é a tela, não a tranca.** A API não tem autorização: um GET direto sem o `so` devolve tudo.

## As três pré-condições do cadastro

Um administrador marcou cinco abas do painel para um conferente e nada mudou na tela dele. A
marca estava gravada certinha no banco: o que faltava era a chave **Pode entrar no painel?**,
desligada dois campos acima. O formulário aceitou as cinco marcas e não disse nada.

A varredura que veio depois (`teste/teste_permissoes.js`) mostrou que **nenhuma corrente estava
quebrada**: tudo o que o formulário manda, o servidor grava; tudo o que grava, a sessão carrega;
tudo o que a sessão carrega, alguma tela usa. O erro não era de encanamento. Era o formulário
aceitando combinações **inertes**.

São três, e cada uma desliga o que depende dela, em `ajustarPainel()`:

| pré-condição | o que fica sem efeito | o que a tela diz |
|---|---|---|
| **Ativo** desligado | **tudo** — a pessoa não entra em lugar nenhum | todos os quadros travados, nota no campo Ativo |
| **Pode entrar no painel?** em NÃO | as **Abas** — ela não chega ao painel | quadro travado, nota apontando a chave |
| **sem senha de painel** | o acesso ligado ainda recusa no login | nota no campo, explicando que o PIN de 6 números é do app de campo |

A terceira é a mais traiçoeira: são **duas senhas diferentes**. O painel entra por senha; o PIN
de seis números é do app de campo. Liberar o acesso sem definir a senha do painel é ligar uma
chave para uma porta que continua recusando, e a confusão entre as duas é natural.

`ajustarPainel()` é reavaliada por **quatro** campos — `fPerfil` (`input`), `fPainel` (`change`),
`fAtivo` (`change`) e `fSenha` (`input`). Faltando um, a tela mente justamente no instante em que
a pessoa mexe nele. Foi o `fPainel` que faltava: ele mudava e as abas seguiam marcáveis e mudas.

**Marca que não faz nada é pior do que marca ausente: ela diz que fez.** É a mesma razão pela qual
as abas de admin travam para quem não é admin, e pela qual o quadro bloqueado fica **apagado e não
sumido** — sumir esconderia que a permissão existe, e é justamente ela que a pessoa procura.

## A permissão mudada chega a quem já está logado

`Q.sessao()` é uma **foto tirada no login**. Enquanto ela for a única fonte, mudar as abas (ou
os locais, ou os tipos de caixa) de alguém no cadastro não chega em quem já está dentro: a pessoa
segue com o que tinha no dia em que entrou, e a única saída é sair e entrar de novo — coisa que
ninguém faz e que a tela nunca pediu. Foi assim que um gerente ficou com uma aba só depois de o
administrador marcar quatro.

A `equipe` já traz o registro atualizado de **todo mundo**, inclusive de quem está olhando. Então
`renovarSessao()` troca a foto pelo registro a cada abertura do painel, e também depois de salvar
um usuário (o admin pode restringir a si mesmo). `abasPermitidas()` roda sobre a sessão renovada,
nunca sobre a guardada.

O **app de campo** faz o mesmo pela rota `meuAcesso`, que devolve `sessaoDe(u)` de um id e nada
mais — sem e-mail, telefone, documento ou senha, estritamente menos do que a `equipe` já devolve
publicamente. Lá a releitura é a **última** coisa de `abrirApp()`: é um retoque, não uma tranca, e
na frente uma rede lenta seguraria a tela de quem só quer lançar. Sem rede, fica o que já estava.

### As duas portas entre o app de campo e o painel

As telas são dois arquivos, e por um bom tempo não havia caminho de uma para a outra depois do
login. O link para o painel existia **só na tela de entrada** do `index.html` e sumia no instante
em que a pessoa entrava; e do painel não havia volta nenhuma. Quem tinha o painel liberado não
chegava nele, e quem chegava ficava preso: em ambos os casos a única saída era **Sair**. As
permissões estavam certas o tempo todo — o caminho é que não existia.

Hoje são duas portas simétricas, ambas no cabeçalho, ambas `<a href>` de verdade (abrem em aba
nova pelo clique do meio) e ambas **nascem `hidden`**:

| chip | onde | vai para | aparece quando |
|---|---|---|---|
| `#chipPainel` — ▦ Painel | app de campo | `admin.html` | a mesma regra do `podeVerPainel()`: ADMIN sempre, os demais pela chave do cadastro — **e nunca para quem entrou por PIN** |
| `#chipCampo` — ↩ Lançamentos | painel | `index.html` | `temPin` — sem PIN o `loginPorPin` recusa |

**Porta que leva a uma recusa é pior que porta nenhuma.** É por isso que cada uma checa o lado de
lá antes de aparecer, e é por isso que a sessão passou a carregar `temPin` (o SIM ou NÃO, nunca o
PIN). Quando o campo está **ausente** — sessão de antes dele existir — a porta **aparece**:
esconder um caminho de quem já o tinha é pior do que oferecê-lo a quem talvez não passe, e a
releitura corrige no mesmo carregamento.

O `[hidden]{display:none!important}` do fim do `styles.css` é obrigatório: sem ele o `display`
do chip vence o atributo `hidden` e a porta aparece para todo mundo. Era uma regra por
elemento — `a.chip[hidden]`, e mais duas — e o bug voltou **quatro vezes**, sempre num
elemento novo que ninguém lembrou de incluir. Hoje é **uma regra só, para todo mundo**: é o
tipo de coisa que não se resolve lembrando.

`aplicarSessao()`, nas duas telas, é o único lugar que mexe no que a sessão manda no cabeçalho
(nome, porta, abas). Os dois caminhos — abertura e releitura — passam por ela; espalhado entre os
dois, o segundo esquece alguma coisa, e esquece calado.

### A navegação: barra lateral no computador, gaveta no celular

As duas telas usam o mesmo **app shell** — barra de app (só no estreito), navegação, cabeçalho de
página, conteúdo. **Um corte: 1024px.** Acima, a lateral é fixa e a barra de app some. Abaixo, a
lateral vira gaveta e a barra de app aparece com o `☰`.

Antes disso o painel tinha as sete páginas num **menu suspenso no cabeçalho**, porque numa barra
horizontal elas não cabiam: um botão escondendo sete destinos atrás de um clique. Em pé, na
lateral, elas cabem — e no computador, que é onde o painel é usado, ficam à vista o tempo todo.

**O contrato de dados não mudou.** As páginas continuam sendo `<button data-pagina>` dentro de
`#abas`, com `.ativa` na aberta. É o que `Q.abas()` liga e o que `ajustarAbasPainel()` esconde;
trocar por `<a href>` levaria junto a peneira de permissão, calada. Um teste afirma que **toda**
página é um `<button>` — contar "pelo menos três" deixava trocar uma sem ninguém notar, e a
primeira é justamente a que carrega o `.ativa`.

**As portas para a outra tela ficam FORA do `<nav>`** (`#chipPainel` no campo, `#chipCampo` no
painel). `Q.abas()` liga o trocador de página em todo botão de dentro: ali, a porta viraria uma aba
sem página, e clicar nela apagaria a ativa deixando a tela em branco.

**A gaveta mora no `app.js`** (`Q.gaveta()`), uma vez só para as duas telas. Ela fecha com `Esc`,
com clique no véu e ao escolher uma página; o foco não escapa dela enquanto está aberta; e ao
passar para o computador o estado é limpo — a classe `gaveta-aberta` esquecida no `body` deixaria a
página travada sem rolagem.

**O título do cabeçalho de página** (`#tituloPagina`) diz onde se está, e `Q.abas()` o escreve a
cada troca. No computador a lateral já responde isso; **no celular a gaveta está fechada, e ele é
a única pista**. O texto sai do próprio botão (`data-titulo`, ou o rótulo): uma lista de títulos à
parte discordaria da navegação no primeiro rename.

#### O canto direito da barra de app

Levar os chips para dentro da gaveta **sumiu com duas coisas no celular**: quem está logado e o
estado da rede. Com a gaveta fechada não havia como saber nenhum dos dois — e "3 na fila" é
justamente o aviso que não pode esperar um toque, porque diz que o lançamento não saiu.

**O gatilho da gaveta fica à DIREITA, e é o último elemento da barra** — é o canto que o polegar
alcança com o celular na mão, e o app é usado de pé, no galpão, de luva. A ordem é marca → conta →
gatilho, e o respiro acompanha: 12px à esquerda, onde a marca abre a linha, e 4px à direita, onde
o gatilho já tem os seus 44px de alvo. O `margin-left:auto` continua no grupo da conta, e não no
gatilho: assim os dois vão juntos para a direita, colados, em vez de a conta ficar parada no meio
da barra. **A gaveta continua entrando pela esquerda** — se um dia incomodar, é uma linha.

### 44px é piso, não sugestão — e mora no CSS

O contador de caixas da Saída ocupava a tela inteira do celular: cinco linhas de tipo a 70px
cada, com passo de 80, davam **390px dos 412** de largura de um celular comum — a última linha
e o botão de registrar nunca apareciam juntos. Encolheu o **respiro**, não o alvo:

| | antes | depois |
|---|---|---|
| linha `.item` | 70px (passo 80) | 58px (passo 66) |
| campo de quantidade | 48 × 120 | 44 × 88 |
| bloco das 5 linhas | 390px | **322px** |
| `button.btn` | 50px | 46px |

**O piso de toque está declarado**, com `min-height:44px` no `.stepper input` e no
`button.btn`, em vez de sair por acaso da soma do `padding` com o tamanho da letra. A diferença
não é de estilo: medido no Chrome, baixar a letra do campo para 11px dá **44px com o piso e
36px sem ele**. Sem a declaração, a próxima pessoa que mexer na tipografia encolhe o alvo do
dedo sem perceber, e o app é usado **de luva, de pé, no galpão** — alvo pequeno custa
lançamento, e lançamento perdido é caixa perdida.

Se for mexer aqui, **meça**: `teste_tela` cobra o piso e o respiro, e o
`sabota_compacto.py` mede no navegador se o piso de fato segura.

A barra de app leva o círculo com as iniciais (`#avatarTopo`, com o nome inteiro no `title`)
e um ponto de estado dentro dele (`#pontoRede`). **O aviso (`#avisoRede`) só aparece quando há o
que avisar**: um chip dizendo "Online" o tempo todo vira ruído, e ruído constante é o que faz
ninguém reparar no dia em que ele muda. Verde é "está tudo bem", e nada mais.

**`atualizarBadge()` calcula o estado UMA vez e escreve nos três lugares.** Três contas sobre a
mesma coisa discordam no primeiro ajuste, e a que discordar mente calada — alguém veria ponto
verde com lançamento preso na fila. O chip e o aviso **ambos** mandam a fila ao toque: quem vê o
aviso no celular é justamente quem está com lançamento preso, e era o único que não tinha onde
tocar para tentar de novo.

**A marca encolhe, o canto direito não.** Medido a 390px com "⚠ Offline · 2 na fila": sem
`flex:0 1 auto` na marca, o avatar era empurrado para fora da barra justamente no estado em que
ele mais importa.

#### `[hidden]` vence o `display`, uma regra para tudo

Este projeto tropeçou nisto **quatro vezes** — `.ret-pop`, `.aviso-trava`, a porta do painel e
agora o chip da barra de app —, e as três primeiras ganharam cada uma a sua regra, escrita depois
de a peça aparecer onde não devia. As três saíram; no lugar delas há `[hidden]{display:none!important}`,
que vale para qualquer elemento. Um teste recusa regra `[hidden]` por elemento.

#### `.lateral`, e nunca `.barra`

`.barra` **já existia** neste projeto — é a barra de aging, `height:10px`, declarada mais abaixo no
arquivo. Ela vencia por vir depois, e a lateral inteira era espremida a dez pixels: a navegação, o
indicador de rede e o rodapé continuavam lá, medindo certo, e transbordavam para fora de uma caixa
de 10px. Nome de classe novo em CSS antigo tem de ser **procurado** antes, e não só pensado.

#### Medir o desktop aqui exige iframe

O Chrome deste ambiente trava o viewport de layout em **504px**, peça-se 360 ou 1280, nos dois
modos headless — e `--screenshot` obedece a largura pedida, então a foto sai pintada a 1280 com o
layout de 504 e parece um bug que não existe. `@media` mede o **viewport**, não o contentor, então
um `<div>` de largura fixa também não serve. **Iframe tem viewport próprio**; é nele que a media
query passa a valer, e é assim que as medições desta seção foram feitas.

Três coisas que não podem mudar aqui, porque cada uma tranca alguém para fora:

- **`podeVerPainelRegistro()` é cópia fiel do `podeVerPainel()` do servidor**, e não a coluna
  crua: o ADMIN entra sempre, mesmo com `AcessoPainel` em `false`, e quem está inativo não entra.
  Lendo a coluna direto, o primeiro admin com ela desligada perderia o próprio painel.
- **`EQUIPE_CHEGOU`, e não `EQUIPE.length`.** Lista vazia pode querer dizer "ainda não carregou"
  ou "a resposta falhou"; só depois de uma resposta boa é que não estar nela quer dizer que a
  pessoa saiu do cadastro. Confundir os dois manda todo mundo para o login no primeiro soluço
  de rede.
- **`sessaoDoRegistro()` tem os mesmos campos de `sessaoDe()`** em `api/_logica.js`. São duas
  cópias da mesma sessão, e um campo que exista de um lado e não do outro some no meio do
  caminho, calado. Há teste comparando as duas listas de campos.

Quem perdeu o acesso, foi desativado ou teve o cadastro apagado é mandado embora com um aviso que
diz o motivo, e a saída é adiada 2,5s para dar tempo de ler.

**Isto é a tela, não a tranca.** A API continua sem autorização: um POST direto ignora tudo isto.

## Migração do banco: automática

Depois do `supabase/bootstrap.sql` (rodado uma vez), o app aplica sozinho o que falta.
Para mudar a estrutura, **acrescente um item no fim de `api/_migracoes.js`** e faça push.
A primeira chamada à API depois do deploy aplica.

Três regras que não são negociáveis, e estão repetidas no cabeçalho do arquivo:

1. **Nunca edite nem remova um item já publicado.** Quem já aplicou não reaplica, e o banco
   de outra pessoa ficaria diferente do seu sem ninguém perceber.
2. **Escreva sempre de forma repetível** — `if not exists`, `on conflict do nothing`.
3. **O `sql` nunca é montado com dado que veio do navegador.** Ele sai literal de
   `_migracoes.js` e vai para a função `aplicar_migracao`, que é `security definer`.

Quem executa o DDL é essa função no Postgres, não o PostgREST — o PostgREST só faz CRUD.
Ela está trancada para `anon` e `authenticated`: só quem tem a chave secreta chama, e essa
chave já abre o banco inteiro de qualquer jeito. Por isso este caminho não amplia o estrago
possível, ao contrário de guardar um token da Management API na Vercel.

Se o bootstrap não tiver rodado, o app **não quebra**: segue com o que o banco já tem, e a
mensagem de coluna faltando aparece quando alguma tela precisar de verdade.

Falhou uma migração? O app **para na primeira** e devolve o id no erro — aplicar as
seguintes por cima de um banco meio migrado é como o estrago vira difícil de desfazer.

## Antes de commitar mudança em `app.js` ou `styles.css`

```
python scripts/versionar.py
```

Não há passo de build: as páginas apontam para os dois arquivos direto, e o navegador os
guarda. Depois de um deploy a pessoa continua vendo a tela antiga sem nenhum sinal — às
vezes com HTML novo e JS velho, que é pior do que só estar velho: metade do comportamento
muda e a outra metade não.

O sufixo é o **hash do conteúdo**, não a data. Arquivo que não mudou mantém o mesmo
endereço e segue vindo do cache; só quem mudou força o download. Rodar duas vezes não faz
diferença nenhuma.

Isto custou tempo mais de uma vez: mudança publicada e verificada em produção, e o usuário
ainda vendo o comportamento antigo. Antes de investigar um bug relatado logo depois de um
deploy, confirme que a página dele carregou o `app.js` novo.

## Senha do app de campo: 6 numeros

A regra vale para **definir** a senha, nunca para entrar. Quem cadastrou senha antes dela
existir continua entrando com a de 4 digitos — validar no login trancaria a equipe inteira
para fora, de uma vez, no galpao. Por isso o campo de entrada nao tem `minlength`.

A validacao esta em `salvarUsuario`, no servidor: a API aceita chamada de qualquer origem,
entao checar so na tela seria enfeite. O painel checa tambem, mas so para a pessoa saber na
hora, sem esperar a ida ao servidor.

## Primeiro acesso: a senha do admin vira a senha da pessoa

O admin cadastra com uma senha provisoria. No primeiro login a tela troca o cartao de
entrada pelo de troca, e so depois de escolher uma senha propria a pessoa entra. Perdeu a
senha? O admin define outra provisoria e o ciclo recomeca — nao ha auto-atendimento.

**Duas marcas, nao uma.** `usuarios.pin_provisorio` (app de campo) e
`usuarios.senha_provisoria` (painel). Cada pessoa pode ter as duas credenciais e o admin
pode mexer so numa; uma marca unica obrigaria a trocar as duas, ou ficaria ambigua sobre
qual. As marcas **nunca vem do navegador**: `salvarUsuario` apaga o que chegar e escreve
por conta propria.

`definirPin` e o par de `definirSenha`: troca a credencial do campo provando a atual.

Na lista de usuarios a coluna **Senha** mostra as duas credenciais em separado — lancamento e
painel —, cada uma como propria, provisoria ou sem senha. Uma etiqueta so nao servia:
"provisoria: painel" nao dizia nada sobre a senha do lancamento, e "propria" aparecia ate
para quem nunca teve aquela credencial. A linha do painel some para quem nao entra no painel
e nao tem senha de painel.

**Tirar o acesso ao painel apaga a senha do painel.** Hash guardado para quem nao entra no
painel nao e so sujeira: `acharPorIdentificador` casa tambem pelo NOME e `loginPorSenha` nao
olha acesso ao painel, entao a senha velha continuaria autenticando na API — o painel barra
na tela, e a tela nao e a fronteira. ADMIN fica de fora: para ele o acesso vem do perfil.
Cadastro antigo com esse resto foi limpo pela migracao `2026-09-15-limpa-senha-sem-acesso`,
entao a celula diz apenas "painel: sem acesso" — nao existe mais o caso de sobrar senha sem
acesso. Se a pessoa tiver de entrar no painel, o admin liga a chave e define a senha, que e o
fluxo normal de primeiro acesso.

**Armadilha fechada:** `PIN: String(r.pin)` transformava PIN nulo no texto `"null"`, e como
`loginPorPin` compara texto com texto, quem digitasse a palavra `null` entrava como essa
pessoa. Hoje nulo vira string vazia. Ha teste, e ele foi conferido desfazendo a correcao.

A troca e obrigatoria de proposito, sem botao de "depois" — senha provisoria que se pode
adiar nao e trocada nunca, e a do admin costuma ser a mesma para todo mundo.

Isto organiza o ciclo da senha; **nao e seguranca**. A API continua sem autorizacao, que
segue sendo o pendente real.

## Testar

```
node teste/teste_api.js
node teste/teste_tela.js
node teste/teste_login.js
node teste/teste_motorista.js
node teste/teste_obrigatorios.js
node teste/teste_saldo.js
node teste/teste_primeiro_acesso.js
```

O `teste_api.js` tem **531 verificações**. Roda o roteador, as regras e os tradutores **de
produção**, trocando só o acesso ao Postgres por um banco falso em memória. Sem rede, sem chave,
meio segundo. Rode depois de qualquer alteração em `api/`.

O `teste/teste_tela.js` (**762 verificações**) não roda navegador: lê o HTML e o JavaScript das
páginas e confere que cada coisa está ligada **dos dois lados**. Nasceu de um botão Limpar que
quebrou em silêncio quando `sdRota` e `sdMotorista` entraram na tela, e desde então virou o lugar
das simetrias:

- o limpar de cada formulário toca em **todo** campo da seção, menos a data;
- o cabeçalho e as células do Painel de Ativos saem da **mesma** lista de colunas, e toda coluna
  de fábrica tem definição, largura e o par título+valor no CSV;
- todo campo da barra de Movimentos entra no filtro, **viaja no pedido**, recarrega a lista e
  volta ao padrão no Limpar;
- a aba **Colunas** e as tabelas leem o mesmo armazenamento, e toda coluna de fábrica tem nome
  no descritor — sem ele a aba mostraria o id cru.

O terceiro item é o que faltava quando `mvFluxo` e `mvCaixa` passaram a existir sem efeito: o
servidor sabia filtrar, a tela só não pedia. Havia teste entre a barra e o filtro, e entre o
filtro e o apagar — nenhum entre o filtro e o **pedido**.

**`teste_backend.js` falha depois das 21h** (fuso de Brasília): o `dia(n)` dele monta a data com
`toISOString()`, que é UTC, enquanto o aging conta em dia local. Passadas as 21h a data UTC já
virou, e "caixa mais antiga tem 20 dias" recebe 19. É do conjunto antigo do Apps Script, que pode
ser apagado quando a migração estiver validada — mas não confunda isso com regressão.

**A cópia de trabalho precisa ficar em LF.** Há `.gitattributes` com `* text=auto eol=lf`, porque
o Git desta máquina está com `core.autocrlf=true` e reescrevia tudo em CRLF a cada checkout ou
`stash pop`. A conferência recorta o código por texto, e muitos recortes fecham numa quebra de
linha: em CRLF o `indexOf` não acha nada, o recorte vai até o fim do arquivo e o teste passa a
medir o arquivo inteiro **sem avisar** — um recorte grande demais tem tamanho e tem o texto
procurado, então as guardas de tamanho não veem nada. As duas suítes também normalizam o `
` na
leitura, num embrulho do `readFileSync`, para não depender só do `.gitattributes`.

**Dois testes estão quebrados** e não são regressão deste trabalho: `teste_motorista.js` e
`teste_saldo.js` estouram com `meusMotoristas is not defined`. Eles recortam funções do
`index.html` procurando texto, e o recorte deixou de pegar um auxiliar. A correção é a mesma
aplicada nos testes novos: fechar o recorte contando chaves e conferir o próprio recorte antes de
usá-lo, para ele cair alto em vez de passar verde testando outro código.

O `teste/teste_login.js` (20 verificacoes) cuida do aviso de administrador na tela de
entrada: as duas primeiras tentativas erradas seguem com a mensagem normal, da terceira em
diante o aviso passa a ser "Entre em contato com o administrador do sistema." e fica fixo no
cartao, porque o toast some em cinco segundos. A contagem e so de tela — **nao bloqueia o
acesso de proposito**: travar a entrada por segredo errado pararia o lancamento de caixa no
galpao, que e o que este app existe para nao deixar parar. O teste verifica isso tambem.

A contagem **mudou de casa** com a porta unica: vivia dentro do `index.html`, com uma copia
no `admin.html`, e hoje mora no `app.js`, dentro do `portaUnica`. O teste acompanhou — ele
recorta de `function mostrarErro(texto)` ate o fim de `contarErro` e roda o trecho com DOM de
mentira. Repare que ele **nao imita o `mostrarErro`**: usa o de verdade, porque e ele que
decide se o cartao aparece e por onde o texto entra. Escrever a frase certa num cartao
`hidden` e a mesma coisa que nao escrever nada, e e por isso que duas verificacoes olham o
`hidden` e nao so o texto. O cartao recebe `textContent`, nunca `innerHTML`: assim a mensagem
que veio do servidor vira texto, e nao marcacao.

O `teste/teste_motorista.js` (23 verificacoes) cuida da lista de motoristas na saida e na devolucao (a mesma funcao, com os seletores de cada tela; na devolucao a rota e o caminhao de onde a carga volta). A rota
decide a **ordem**, nao quem pode aparecer: "Motorista da rota" em cima, "Outros motoristas"
embaixo. Filtrar de verdade, como era antes, travava a cobertura — a rota oferecia um nome so,
e no dia em que outro levasse a carga a saida ia lancada no nome errado. O preenchimento
automatico olha so quem esta **atribuido** a rota: contando o volante, que e curinga de todas,
nenhuma rota teria "um motorista so" e o campo nunca viria posto.

O `teste/teste_obrigatorios.js` (27 verificacoes) cuida dos campos obrigatorios das duas telas
de lancamento. A regra e uma lista (`OBRIGATORIOS`) e a mesma lista marca o campo com `*` e
cobra no envio — duas verificacoes comparam o HTML com a lista, nos dois sentidos, para nao
existir campo cobrado sem marca nem marca sem cobranca.

**Campo escondido nao e exigido.** Na saida do galpao aparecem Rota e Motorista; da rota para
o cliente aparece Destino. Cobrar o que nao esta na tela travaria o lancamento sem explicacao
possivel — e o caso que mais importa neste teste. Observacao e foto ficam de fora a pedido do
usuario, e nas quantidades basta um tipo de caixa preenchido.

O `teste/teste_saldo.js` (22 verificacoes) cuida da aba Saldo e do aviso de saldo da
devolucao. **`painel()` monta `locais` so com CLIENTE e FILIAL e devolve as rotas a parte,
em `rotas`** — duas telas liam a fonte errada: a aba Saldo listava `locais` e nunca mostrou
rota nenhuma, e `mostrarSaldoDoOrigem` procurava ali a origem da devolucao, que e sempre uma
ROTA. Nunca achava: a caixa de saldo e o alerta de "voce contou mais do que o saldo" ficavam
mudos, e esse alerta e uma das guardas contra saida nao lancada.

O teste tambem fixa a regra de **nao somar** as duas contas da rota: `saldo` e o que esta no
caminhao, `saldoClientes` e o que esta nos pontos dela. Somar esconde onde a caixa esta.

O `teste/teste_primeiro_acesso.js` (30 verificacoes) le o HTML das duas telas e o codigo do
servidor. O fluxo visual precisa de navegador e nao roda aqui; o que ele protege e o desvio:
tirar o `if (r.trocarSenha)` do login faria a senha provisoria valer para sempre sem nada
quebrar. O comportamento do servidor esta em `teste_api.js`, no bloco "primeiro acesso".

O `teste/teste_permissoes.js` (**109 verificações**) é a varredura ponta a ponta do que o
administrador liga e desliga. Para cada permissão percorre a corrente inteira — **formulário →
envia → servidor grava → sessão carrega → alguma tela usa** — e um elo faltando é um interruptor
que não acende nada. Confere também a convenção "lista vazia = todos", as três pré-condições
acima e se a permissão gravada **chega** a quem já está logado.

A última verificação do primeiro bloco é a que segura o arquivo no tempo: ela compara a lista de
permissões da varredura com o que o formulário de fato envia. Uma permissão nova que entre no
salvar e não na lista escaparia da varredura inteira, calada — e é exatamente assim que a
próxima passaria despercebida.

O `teste/teste_backend.js` testa o backend antigo do Apps Script (38 verificações), que continua
em `apps-script/` como referência e rota de volta. Pode apagar os dois quando a migração estiver
validada em produção com dado real.

## Gerar o PDF do manual

```
chrome --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=30000 \
  --print-to-pdf="<abs>/manual.pdf" "file:///<abs>/manual.html"
```

`<abs>` precisa ser caminho absoluto no formato do Windows com barras normais — use `$(pwd -W)`
no Git Bash. Com caminho errado o Chrome renderiza a página de erro dele e devolve um PDF de
1 página, sem reclamar.

O `manual.html` tem um bloco `@media print` que esconde o sumário, força a paleta clara e impede
tabela partida entre páginas. Rode de novo sempre que alterar o manual — o PDF não se atualiza
sozinho.

Duas coisas descobertas ao montar isso, para não repetir a investigação:

- O bloco de impressão precisa dos **três seletores** (`:root`, `:root:not([data-theme="light"])`
  e `:root[data-theme="dark"]`). Só `:root` perde em especificidade para o bloco de tema escuro,
  e o PDF sairia com fundo preto para quem estiver no tema escuro.
- O exportador de PDF do Chrome **não embute Archivo nem Source Sans 3**, mesmo com as fontes
  carregadas e confirmadas por `document.fonts.check`. Ele cai para Segoe UI nos títulos. Embutir
  as fontes como data URI não resolveu, nem trocar `display=swap` por `display=block`, nem usar
  as instâncias estáticas da API v1. É diferença só de tipografia — layout, cores e diagrama saem
  corretos. Não vale mais tempo.

## Gerar o Word do manual

```
python scripts/gerar_docx.py
```

Lê o `manual.html`, monta o `manual.docx` com estilos de título de verdade (o painel de navegação
do Word funciona), tabelas, as caixas de destaque com barra lateral colorida e as etiquetas
`AGUARDANDO` / `CONFIRMADO` nas cores certas. Depende de `python-docx`, já instalado.

O diagrama do ciclo entra como imagem, de `scripts/diagrama.png`. Para regerar essa imagem depois
de mudar o SVG do manual: extraia o bloco `<svg class="dg">` para um HTML com a paleta clara e
rode o Chrome com `--screenshot --window-size=1600,600`.

**Não edite o `manual.docx` à mão.** O conteúdo vive no `manual.html`; o Word e o PDF são saídas.
Editar a saída faz as três versões divergirem em silêncio.

## Paleta

**Azul-marinho em todas as telas** (setembro/2026, a pedido do usuário, a partir de um modelo de
app shell que ele trouxe). O chão deixou de ser cinza.

**A ação passou a ser o azul da marca, e não mais o âmbar.** Texto antigo que diga "âmbar continua
a ação" está falando do tema anterior. O âmbar ficou sendo o **aviso**, que é o papel que ele
exerce melhor.

Tudo passa por tokens em `styles.css`; **nenhum arquivo tem cor solta** — e isso agora é cobrado
por um teste, não só escrito aqui. Foi o que permitiu trocar o tema inteiro mexendo num bloco só.

**Os nomes dos tokens não mudaram, de propósito.** São umas setecentas linhas de regra lendo
`--surface`, `--linha`, `--txt2`: trocar os valores carrega a tela inteira junto. Por isso
`--ambar-btn` continua se chamando assim e já não é âmbar — renomear espalharia a troca por dez
arquivos para não ganhar nada. **O preço disso é um nome que mente**, e ele já cobrou duas vezes
(veja abaixo).

### Os degraus de superfície

| Token | Papel |
|---|---|
| `--bg` | o chão da página |
| `--surface` | cartão, janela |
| `--surface-2` | cabeçalho de tabela, linha sob o mouse, item |
| `--campo` | dentro do que se digita, e a lateral — mais fundo que o cartão, de propósito |
| `--neutro` | etiqueta, botão neutro, barra |

Os degraus existem porque azul chapado vira uma mancha só: sem eles não se vê onde termina o
cartão e começa o campo.

### Fundo nunca é tinta

A armadilha do tema escuro, agora com nome e teste. `--marinho`, `--brand`, `--ambar-btn`,
`--surface`, `--campo` e os outros **existem para ser fundo**; escritos como `color:` somem sobre a
própria família. Onde a marca precisa ser letra, é `--marca-txt`.

Um teste recusa `color:var(...)` para qualquer token de fundo. Ele nasceu porque a troca de paleta
quebrou **dois** lugares que ninguém teria visto:

- **o link da tela de entrada** usava `--ambar-btn` — virou azul escuro sobre o card azul;
- **a estrelinha de campo obrigatório** (`.obrig`) usava `--ambar-btn` — virou a cor da **ação**,
  no lugar do aviso. O comentário ao lado dela já dizia "âmbar"; era o token que tinha deixado de
  ser.

A medição de contraste sozinha **não pega isso**: ela compara pares de token, e não sabe qual
token cada regra escolheu.

### Refaça a conta antes de mexer — e agora ela é cobrada

O app é lido no celular, no galpão, sob luz forte. **Os 28 pares de cor que a tela usa de verdade
passam em WCAG AA**, e o mais apertado é o **botão principal, em 6,00:1** (era 4,51 no tema
anterior — a folga aumentou).

Isso deixou de ser uma promessa no texto: `teste_tela.js` lê os tokens do **próprio `styles.css`**
e calcula. Uma tabela de cores escrita no teste discordaria do arquivo no primeiro ajuste e
passaria verde justamente quando devia falhar.

### Tipografia

IBM Plex Sans (e Mono para números), do Google Fonts, com `system-ui` atrás no `--fonte`. O
fallback não é enfeite: o app roda no galpão, às vezes sem rede, e a fonte pode não chegar.

O `manual.html` tem paleta própria e **continua claro, na identidade verde**; alinhar é tarefa à
parte, e exige regerar PDF e Word.

## Armadilhas já pagas

- **Substituição de texto casando com o tradutor errado.** Aconteceu duas vezes: um campo
  do usuário foi parar em `formLocalPadrao`, e `Empresa` foi parar no tradutor de LOCAL
  em vez do de MOTORISTA. O sintoma é mudo — salvar responde ok e o valor não vai. Dois
  testes cobrem isso agora: `teste_tela.js` (formulário só lê campo que ele desenha) e
  `teste_api.js` (campo que o `de` lê, o `para` grava). Ambos verificados reintroduzindo
  o defeito. Se for editar por script, ancore em texto único do bloco certo.

- **`Ativo` virou booleano na migração e o front não acompanhou.** O código comparava
  `String(l.Ativo).toUpperCase() !== 'NAO'`, e `String(false)` é `'FALSE'` — então local e tipo
  inativos continuavam aparecendo nas listas. Corrigido com `Q.ativo()` em `app.js`, que aceita
  booleano e o texto antigo da planilha. Se aparecer outra comparação de `Ativo` por string,
  é o mesmo bug.

- **`toISOString()` num projeto que vive em hora local.** A produção inteira usa hora local:
  `data()` lê `AAAA-MM-DD` como data local e `iso()` formata pelos componentes locais. O
  auxiliar `dia(n)` do teste usava `toISOString()`, que é UTC — e a partir das 21h em
  Brasília devolvia a data de amanhã, fazendo `dia(-20)` valer 19 dias. O teste de aging
  quebrava sozinho toda noite. Se um teste de data falhar sem ninguém ter mexido no
  código, olhe a hora antes de procurar culpado no produto.

- **Node local é v14.** Os CLIs da Vercel e do Supabase pedem 18+, então não dá para usá-los aqui.
  Não é problema: os dois funcionam pelo navegador, e a Vercel publica direto do GitHub.
- **`curl -L` num POST para a API quebra com 411** — ele repete o POST no redirect sem
  `Content-Length`. Para testar de fora, use `urllib.request` do Python, que faz GET no redirect
  como o navegador.
- **`gh` não está autenticado.** O `git push` funciona porque o Git Credential Manager tem token em
  cache. Use `GIT_TERMINAL_PROMPT=0`, senão o helper trava esperando uma janela gráfica.
- **O tradutor automático do Edge traduz código.** No SQL Editor do Supabase, `alter table` virou
  "Mesa de mudança" e `values (true)` virou "Valores (verdade)". Antes de pedir para o usuário
  colar SQL, mande desligar a tradução no site.
- **Heredoc do bash com conteúdo HTML/SQL quebra** por causa de crases e parênteses. Use a
  ferramenta de escrita de arquivo em vez de `cat <<EOF`.
- **`var()` não funciona em atributo de apresentação do SVG.** No `manual.html` as cores do
  diagrama vêm de classes CSS por isso.

## Planos gratuitos

- **Supabase Free pausa o projeto após ~7 dias sem acesso.** Despausar é um clique, mas o primeiro
  acesso depois falha.
- **Vercel Hobby proíbe uso comercial** nos termos deles. O usuário foi avisado e seguiu por ser
  app de teste. Se virar operação real, é Pro ou outra hospedagem.

## Estado atual

Migrado do Google Sheets para Vercel + Supabase em 20/08/2026. Funcionando e verificado de ponta a
ponta por fora (`ping`, `dados`, `painel`, `login`, extrato por token, e o 401 do banco).

O ciclo já roda pela interface com dados de ensaio: saldo inicial por ajuste, saída do galpão
para a rota, entrega, retorno, e o Painel de Ativos lendo tudo isso como extrato.

**Pendente:**

- Os **PINs de exemplo** continuam publicados num site público.
- A **API não tem autorização**. `gravarMovimento` recusa por `podeOperacao`, e a permissão de
  abas esconde o que a pessoa não deve ver — mas as demais rotas aceitam qualquer chamada. A
  correção real é Supabase Auth com checagem por rota.
- Três usuários (**Wellington Silva, Nestor Neto, Melkezedeque Soares**) têm lista de *Saída* com
  um único local, então só conseguem lançar retorno vindo daquele local. É cadastro, não código —
  falta o escritório decidir.
- `teste_motorista.js` e `teste_saldo.js` quebrados (ver a seção de testes).
