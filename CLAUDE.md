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

## Entrar: PIN no campo, senha no painel

Os dois convivem de propósito, por escolha do usuário. O celular lança de luva várias vezes
por dia e o PIN protege só lançamento — que fica assinado e pode ser corrigido. O painel vê a
operação inteira e mexe em cadastro, então pede e-mail/usuário mais senha em hash (scrypt,
`_senha.js`). Se alguém pedir para unificar, a pergunta já foi feita e a resposta foi manter.

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

## Quem lança de onde: lista vazia quer dizer TODOS

`usuarios.saidas` e `usuarios.destinos` são arrays de id de `locais`, e **array vazio libera
tudo**. Não é detalhe de implementação: se vazio significasse "nenhum", o deploy da coluna
trancaria a operação inteira no primeiro dia, porque ninguém tem nada marcado. Quem inverter
isso quebra o app de todo mundo de uma vez. `L.locaisPermitidos()` guarda a regra num lugar só.

Vale também para `motoristas.rotas`, com o mesmo raciocínio: sem rota marcada,
o motorista aparece em qualquer uma. E há um degrau a mais em `L.motoristasDaRota()`:
se a rota escolhida não tiver ninguém atribuído, ela devolve **todos**. Travar a saída do
galpão porque faltou um cadastro seria pior do que oferecer a lista inteira.

**Fixo x Volante** (`motoristas.tipo`): volante roda qualquer rota, mesmo com rotas
marcadas — é o que a palavra quer dizer, e ignorar isso faria o campo mentir. Fixo aparece
só nas rotas dele. Vazio ("não informado") se comporta como curinga, que é o que mantém os
motoristas antigos visíveis. Escolher uma rota sem nenhum fixo cai nos curingas; só quando
não houver curinga nenhum é que a lista volta a trazer todos, para não travar a saída.

Cuidado com a duplicata: `locais.motorista_id` é outra coisa — aponta para um
**usuário** de perfil MOTORISTA e alimenta a coluna Motorista do painel de rotas.
`motoristas.rotas` é o cadastro de quem dirige, sem login. Os dois convivem e não
se conversam — se um dia forem unificados, decida qual morre antes de escrever código.

A devolução é o caminho de volta, então os papéis se invertem: quem devolve é um **destino**
e quem recebe é uma **saída**. Está assim no `montarFormularios()` do `index.html`.

Duas coisas que valem lembrar:

- **As duas telas releem a própria permissão** — o painel pela `equipe`, o app de campo pela rota
  `meuAcesso`. A sessão guardada continua sendo uma foto do login; o que mudou é que ela deixou
  de ser a única fonte. Veja a seção abaixo.
- **Ao mudar a permissão de alguém, a tela dele não muda na hora.** Ele vê a mudança na próxima
  vez que abrir o painel, não no mesmo segundo. Não há empurrão do servidor.
- **Isto é a tela, não a tranca.** Vale o mesmo aviso da seção de separação de funções: a API
  não tem autorização, e um POST direto ignora qualquer filtro daqui.

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
| `#chipPainel` — ▦ Painel | app de campo | `admin.html` | a mesma regra do `podeVerPainel()`: ADMIN sempre, os demais pela chave do cadastro |
| `#chipCampo` — ↩ Lançamentos | painel | `index.html` | `temPin` — sem PIN o `loginPorPin` recusa |

**Porta que leva a uma recusa é pior que porta nenhuma.** É por isso que cada uma checa o lado de
lá antes de aparecer, e é por isso que a sessão passou a carregar `temPin` (o SIM ou NÃO, nunca o
PIN). Quando o campo está **ausente** — sessão de antes dele existir — a porta **aparece**:
esconder um caminho de quem já o tinha é pior do que oferecê-lo a quem talvez não passe, e a
releitura corrige no mesmo carregamento.

`a.chip[hidden]{display:none}` é obrigatório: sem essa regra o `display` do chip vence o atributo
`hidden` e a porta aparece para todo mundo.

`aplicarSessao()`, nas duas telas, é o único lugar que mexe no que a sessão manda no cabeçalho
(nome, porta, abas). Os dois caminhos — abertura e releitura — passam por ela; espalhado entre os
dois, o segundo esquece alguma coisa, e esquece calado.

No celular o cabeçalho do painel passa de 57px para 124px por causa desse chip a mais: ele quebra
em duas linhas. Medido, nada se sobrepõe e não há rolagem horizontal — o painel é ferramenta de
escritório, e o caminho de volta vale a linha.

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

O `teste_api.js` tem **462 verificações**. Roda o roteador, as regras e os tradutores **de
produção**, trocando só o acesso ao Postgres por um banco falso em memória. Sem rede, sem chave,
meio segundo. Rode depois de qualquer alteração em `api/`.

O `teste/teste_tela.js` (**545 verificações**) não roda navegador: lê o HTML e o JavaScript das
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

O `teste/teste_login.js` (17 verificacoes) cuida do aviso de administrador na tela de
entrada do galpao: as duas primeiras senhas erradas seguem com a mensagem normal, da
terceira em diante o aviso passa a ser "Entre em contato com o administrador do sistema."
e fica fixo no cartao, porque o toast some em cinco segundos. A contagem e so de tela —
**nao bloqueia o acesso de proposito**: travar a entrada por senha errada pararia o
lancamento de caixa no galpao, que e o que este app existe para nao deixar parar. O teste
verifica isso tambem.

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

O `teste/teste_primeiro_acesso.js` (29 verificacoes) le o HTML das duas telas e o codigo do
servidor. O fluxo visual precisa de navegador e nao roda aqui; o que ele protege e o desvio:
tirar o `if (r.trocarSenha)` do login faria a senha provisoria valer para sempre sem nada
quebrar. O comportamento do servidor esta em `teste_api.js`, no bloco "primeiro acesso".

O `teste/teste_permissoes.js` (**74 verificações**) é a varredura ponta a ponta do que o
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

Cinza escuro em todas as telas, a pedido do usuário (setembro/2026). **Marinho continua
a marca** — cabeçalho e tela de entrada — e **âmbar continua a ação**. O que mudou foi o
chão: fundo, cartões, campos e tabelas.

Tudo passa por tokens em `styles.css`; nenhum arquivo tem cor solta. Foi isso que permitiu
trocar o tema inteiro mexendo num bloco só — mas só depois de converter as cores que
ainda estavam fixas (`#fff`, `#eef1f4`, `#fafbfc`). Se voltar a escrever cor solta, o
próximo que mexer no tema paga essa conta de novo.

### Os degraus de superfície

| Token | Papel |
|---|---|
| `--bg` | o chão da página |
| `--surface` | cartão, janela |
| `--surface-2` | cabeçalho de tabela, linha sob o mouse, item |
| `--campo` | dentro do que se digita — mais fundo que o cartão, de propósito |
| `--neutro` | etiqueta, botão neutro, barra |

Os quatro degraus existem porque cinza chapado vira uma mancha só: sem eles não se vê
onde termina o cartão e começa o campo.

### Marinho é fundo, nunca tinta

A armadilha do tema escuro: `--marinho` aparecia como `color:` na aba ativa, no botão
secundário, no `editar` e nos links. Sobre cinza escuro isso some. Onde a marca precisa
ser tinta, use `--marca-txt` (azul claro). Se acrescentar algo com a cor da marca, pergunte
antes se é fundo ou letra.

### Refaça a conta antes de mexer

O app é lido no celular, no galpão, sob luz forte. Os quinze pares de cor foram medidos e
passam em WCAG AA — o mais apertado é a etiqueta cinza, em 4,51:1 contra o mínimo de 4,5.
Trocar qualquer tom exige refazer a medição, não o olhar.

O `manual.html` tem paleta própria e **continua claro, na identidade verde**; alinhar é
tarefa à parte, e exige regerar PDF e Word.

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
