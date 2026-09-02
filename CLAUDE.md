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

Banco antigo precisa de `supabase/migracao-rotas.sql`, que é idempotente.

## Separação de funções no painel

`GALPAO` entra no `admin.html`, mas só consulta: **Lançar** e **Cadastros** ficam escondidos para
quem não é `ADMIN`, e o botão de cancelar movimento também. O motivo não é hierarquia — é que o
conferente é justamente quem gera a divergência na chegada. Dar a ele um *Ajuste de saldo* seria
deixá-lo apagar o próprio erro, e o cadastro de usuários deixaria ele trocar o PIN do admin.

**Isso é só a interface.** A API **não tem autorização nenhuma**: o `login` confere o PIN e devolve
o usuário, mas as chamadas seguintes não carregam prova de quem é. Um `POST /api` com
`{"acao":"salvarUsuario"}` funciona de qualquer lugar, sem PIN. Herdado do Apps Script e mantido na
migração. Enquanto for app de teste, tudo bem; virando operação real, é Supabase Auth com checagem
de perfil em cada rota.

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

## Testar

```
node teste/teste_api.js
```

63 verificações. Roda o roteador, as regras e os tradutores **de produção**, trocando só o acesso
ao Postgres por um banco falso em memória. Sem rede, sem chave, meio segundo. Rode depois de
qualquer alteração em `api/`.

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

## Armadilhas já pagas

- **`Ativo` virou booleano na migração e o front não acompanhou.** O código comparava
  `String(l.Ativo).toUpperCase() !== 'NAO'`, e `String(false)` é `'FALSE'` — então local e tipo
  inativos continuavam aparecendo nas listas. Corrigido com `Q.ativo()` em `app.js`, que aceita
  booleano e o texto antigo da planilha. Se aparecer outra comparação de `Ativo` por string,
  é o mesmo bug.

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
