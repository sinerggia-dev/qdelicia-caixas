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

1. **Devolução contada dentro do cliente não baixa saldo.** Lançada por `MOTORISTA` ou `PROMOTOR`,
   nasce `AGUARDANDO`. Só a conferência no galpão confirma e move o saldo. A diferença entre o
   declarado e o conferido vira divergência registrada, com nome e hora.
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

## Perfis e a regra do AGUARDANDO

`Admin, Gestor, Gerente, Conferente, Motorista, Promotor`. `Galpao` foi renomeado para
`Conferente` por migração, mas **continua reconhecido no código**: a sessão guardada no
celular só troca no próximo login, e até lá o conferente perderia a aba de conferência.

**A grafia gravada é a que a pessoa escolheu** — Inicial Maiúscula, conectores em minúscula
("Supervisor de Área"). Nenhuma tela reescreve a caixa para exibir. Em compensação, **nenhuma
comparação de permissão pode ser sensível a caixa**: `podeConferir()`, `podeVerPainel()`,
`ehAdmin()` e o `ultimoAdmin()` comparam em MAIÚSCULA por dentro. Se acrescentar uma
comparação nova, normalize antes — senão "conferente" perde a aba que "Conferente" tem.

O perfil é **texto livre**: o escritório escreve o cargo que precisar, e as sugestões do
formulário são os de fábrica mais os que alguém já usou (`L.perfisConhecidos()`). Um perfil
escrito nasce **sem poder nenhum** — não cadastra, não confere, e a devolução dele espera
conferência. Permissão por digitação seria permissão por engano de digitação. Só
`ADMIN` e `CONFERENTE` têm poder próprio; o resto do acesso é a chave por usuário.

A trava do banco foi removida de propósito (o `check` em `usuarios.perfil`): quem valida
agora é a aplicação, em `salvarUsuario` — vazio e símbolo estranho são recusados ali.

A regra central foi invertida de propósito. Antes: *devolução de PROMOTOR ou MOTORISTA nasce
AGUARDANDO*. Agora: *devolução de quem não pode conferir nasce AGUARDANDO*. Dá no mesmo para
os perfis antigos — os testes provam — e faz o perfil novo entrar pelo lado seguro: esquecer
de acrescentar alguém em `CONFEREM` passa a significar "a contagem dele espera
conferência", e não "a contagem dele baixa saldo sozinha".

Quem confere está em `L.podeConferir()`, e o front repete a lista em `app.js`.
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

- **A sessão guardada no celular não se atualiza sozinha.** As listas viajam no `login`, então
  quem já está logado continua vendo tudo até sair e entrar de novo.
- **Isto é a tela, não a tranca.** Vale o mesmo aviso da seção de separação de funções: a API
  não tem autorização, e um POST direto ignora qualquer filtro daqui.

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

## Testar

```
node teste/teste_api.js
node teste/teste_tela.js
```

222 verificações. Roda o roteador, as regras e os tradutores **de produção**, trocando só o acesso
ao Postgres por um banco falso em memória. Sem rede, sem chave, meio segundo. Rode depois de
qualquer alteração em `api/`.

O `teste/teste_tela.js` (15 verificações) não roda navegador: lê o `index.html` e confere que a função de
limpar de cada formulário toca em **todo** campo da seção, menos a data. Existe porque o
botão Limpar quebrou em silêncio quando `sdRota` e `sdMotorista` entraram na tela: seletor
escondido guarda valor velho e só reaparece quando a origem muda de galpão para rota.
Acrescentou campo no formulário? Ou ele entra no limpar, ou este teste falha dizendo o id.

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

**Pendente:** o PIN do admin ainda é `1234` num site público; ninguém rodou o ciclo completo pela
interface; não há cadastro real nem saldo inicial lançado. O banco só tem os dados de exemplo do
`seed.sql`.
