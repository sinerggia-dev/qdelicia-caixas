# Qdelícia Frutas — Controle de Caixas

Controle de saída, entrada e saldo de caixas retornáveis por cliente, filial e galpão.
Site estático + função serverless na **Vercel**, com **Postgres no Supabase** como banco.

Modelo de referência: **crate ledger** — o mesmo desenho usado por SpireStock, TrackOnline e Mercaflux:

```
saldo do cliente = saídas − devoluções confirmadas − perdas baixadas
```

## Manual de operação

Manual completo, por perfil (motorista, promotor, galpão, escritório):
**https://qdelicia-caixas.vercel.app/manual.html**

Fonte em [`manual.html`](manual.html) — página estática, sem dependência, publicada junto com o app.

## Como funciona a operação

```
GALPÃO ──carrega──► ROTA ──entrega──► CLIENTE ──coleta──► ROTA ──volta──► GALPÃO
   └──transferência──► FILIAL ──saída──► CLIENTE ──devolução──► FILIAL ──► GALPÃO
```

A **rota é o caminhão** e guarda caixa como qualquer outro local. É o que impede o que subiu
no caminhão e não foi entregue de aparecer na conta do cliente.

Cada local (galpão, filial, cliente) tem saldo próprio, então a caixa nunca "some no meio do caminho":
se saiu do galpão e não chegou ao cliente, o saldo fica com quem estiver com ela.

**A regra que resolve a dor principal:** todo retorno **baixa o saldo assim que é lançado**,
não importa quem lançou. Até setembro/2026 a devolução contada na rua nascia `AGUARDANDO` e
esperava conferência no galpão; a aba de Conferência saiu do app de campo — e era o único lugar
onde um retorno era confirmado —, então manter o estado de espera prenderia a caixa na conta do
cliente para sempre. A divergência entre o contado e o que chegou continua registrada; o que ela
deixou de ser é portão.

## Perfis e permissões

O perfil quase não decide nada. Só `ADMIN` tem poder próprio — cadastros e correções; o resto é
**chave por usuário**, no cadastro de cada pessoa:

| Chave | O que controla | Vazio quer dizer |
|---|---|---|
| `saidas` / `destinos` | De onde e para onde aquela pessoa pode lançar | todos |
| `operacoes` | Se ela lança Saída, Retorno ou os dois — recusado **no servidor**, não só escondido | todas |
| `acesso_painel` | Se abre o `admin.html` | (booleano; ADMIN entra sempre) |
| `abas` | Quais das seis abas do painel ela enxerga | todas as permitidas |

Perfis de fábrica: `Admin`, `Gestor`, `Gerente`, `Conferente`, `Motorista`, `Promotor` — e o campo
é **texto livre**, para o escritório escrever o cargo que precisar. Perfil escrito nasce sem poder
nenhum: permissão por digitação seria permissão por engano de digitação. A única exceção que ainda
mora no perfil é `PROMOTOR`, que não vê a aba de Saída.

| Onde | Abas |
|---|---|
| `index.html` (campo) | Saída · Retorno · Lançamentos |
| `admin.html` (escritório) | Painel de Ativos · Painel · Extratos · Ajustes · Movimentos · Cadastros |
| `extrato.html?t=TOKEN` | Só leitura: o cliente vê o próprio saldo e extrato |

## Arquitetura

```
navegador ──fetch──► /api (função na Vercel) ──service_role──► Postgres (Supabase)
                            │
                            └──► Storage (canhotos e fotos)
```

O navegador **nunca** fala com o banco. A chave que abre o Postgres vive só na variável de
ambiente da Vercel; a página conhece apenas o caminho `/api`. É isso que permite manter o PIN
curto e o link anônimo do cliente sem deixar o banco exposto.

| Arquivo | Papel |
|---|---|
| [`api/index.js`](api/index.js) | Roteador das 16 ações, o mesmo contrato de sempre |
| [`api/_logica.js`](api/_logica.js) | Regras de negócio, funções puras, zero acesso a banco |
| [`api/_supabase.js`](api/_supabase.js) | PostgREST via `fetch` e tradução snake_case ↔ formato interno |
| [`supabase/schema.sql`](supabase/schema.sql) | Tabelas, índices, RLS e bucket |
| [`supabase/seed.sql`](supabase/seed.sql) | Dados de exemplo |

Arquivos em `api/` que começam com `_` não viram endpoint — a Vercel os trata como auxiliares.

## Instalação

Duas peças: o banco no Supabase e o site + API na Vercel. Nenhuma precisa de CLI.

### 1. Banco (Supabase)

1. Crie o projeto em https://supabase.com/dashboard — região **South America (São Paulo)**.
2. **SQL Editor → New query** → cole [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Repita com [`supabase/seed.sql`](supabase/seed.sql) para os dados de exemplo.
   Depois, rode [`supabase/bootstrap.sql`](supabase/bootstrap.sql) **uma vez**: a partir dele o
   app aplica sozinho toda migração futura, sem ninguém abrir o SQL Editor de novo.
4. **Settings → API**: guarde a **Project URL** e a chave **service_role**.

O RLS fica ligado e sem política em todas as tabelas: a chave pública não acessa nada.
Quem entra é a função, com a `service_role` — que nunca vai para o repositório.

### 2. Site + API (Vercel)

1. https://vercel.com/new → importe `sinerggia-dev/qdelicia-caixas`.
2. Framework Preset: **Other**. Não há build: os arquivos da raiz são servidos como estão
   e a pasta `api/` vira função sozinha.
3. **Environment Variables**, marcando os três ambientes:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | a chave `service_role` |

4. **Deploy**. Confira em `SEU-DOMINIO/api?acao=ping`, que deve responder
   `{"ok":true,"versao":3,"motor":"supabase"}`.

Alterou código? `git push` na `main` e a Vercel publica sozinha.
Mudou variável de ambiente? Precisa de **redeploy** para valer.

### 3. Primeiros passos no sistema

1. Entre em `admin.html` como **Administrador** e **troque os PINs e a senha de exemplo** —
   o endereço é público.
2. Aba **Cadastros**: renomeie o galpão, cadastre filiais, clientes (com WhatsApp, limite de
   caixas e prazo de devolução) e os tipos de caixa.
3. Cadastre motoristas e promotores com PIN próprio.
4. Aba **Ajustes** → **Ajuste / saldo inicial**: quantas caixas cada cliente já deve hoje e
   quantas estão no galpão. Sem isso o saldo começa do zero. É esse lançamento que alimenta a
   coluna **Estoque** do Painel de Ativos, e ele pode ser refeito a qualquer momento.

## Estrutura de dados (tabelas)

| Tabela | Para quê |
|---|---|
| `locais` | Galpões, filiais, clientes e **rotas** — todos são "nós" que guardam caixas. `token` é o código do link do cliente; `rota_id` liga o cliente à rota; `motorista_id` liga a rota ao motorista. |
| `tipos_caixa` | Tipos de caixa, com o peso (`kg`) de cada um. |
| `usuarios` | Nome, perfil, senha, PIN, local padrão e as chaves de permissão. |
| `motoristas` | Quem dirige, com CNH e as rotas que atende. Não faz login. |
| `locais_padrao` | Postos de trabalho. Não guardam caixa. |
| `movimentos` | Livro-razão, só acrescenta. Nada é apagado — movimento errado se **cancela**. |
| `config` | Nome da empresa, prazo padrão. |

Tipos de movimento: `SAIDA`, `DEVOLUCAO`, `TRANSFERENCIA`, `PERDA`, `AJUSTE`.

O **status** da coluna de Movimentos é o ponto do ciclo, não o de valer no saldo: `Enviada`,
`Transferida`, `Parcial`, `Devolvida`, `Perda`, `Ajuste`. `AGUARDANDO` não existe mais, e as
linhas antigas que ficaram nele passaram a contar.

## Detalhes técnicos

- **Offline**: motorista e promotor podem lançar sem sinal. Fica na fila do celular
  (`localStorage`) e sobe sozinho quando a internet volta. O chip no topo mostra o tamanho da fila.
- **Sem duplicidade**: cada lançamento carrega um `client_key`, e a coluna tem `UNIQUE`.
  Quem recusa a repetição é o banco, não o código — reenvio da fila nunca lança duas vezes.
- **Foto**: a foto do romaneio vai para o bucket `canhotos` no Supabase Storage e o link aparece
  no extrato. É reduzida no celular antes de subir — o corpo da requisição na Vercel tem limite de
  4,5 MB. Lançamentos antigos podem ter assinatura anexada; o campo saiu da tela em setembro/2026.
- **Sem valor em dinheiro**: não há preço de caixa em lugar nenhum. Retirado em setembro/2026.
- **Lançamento de teste**: quem tem `teste` no perfil produz lançamento de teste. Ele conta no
  saldo como qualquer outro — as telas só separam a leitura, com um seletor *Só reais / Só de
  teste*, e nunca misturam os dois.
- **Aging FIFO**: as caixas mais antigas são consideradas as que ainda não voltaram — é o que
  gera as faixas 0-7 / 8-15 / 16-30 / +30 dias e o alerta de prazo vencido.
- **Comunicação**: `fetch` comum, mesma origem. Sem JSONP e sem CORS, que só existiam por
  causa das limitações do Apps Script.

## Teste da matemática do saldo

```
node teste/teste_api.js    # 519 verificações das regras
node teste/teste_tela.js   # 735 verificações das telas
node teste/teste_permissoes.js   # 87 verificações das permissões, ponta a ponta
```

A primeira roda o roteador, as regras e os tradutores de verdade, trocando apenas o acesso ao
Postgres por um banco falso em memória — sem rede e sem chave: saldo por cliente, divergência,
perda, caminho galpão→rota→cliente, aging FIFO, extrato, token do cliente, idempotência da fila
offline, cancelamento, login, primeiro acesso, permissões e o fluxo do Painel de Ativos.

A segunda lê o HTML e o JavaScript das páginas e confere que cada filtro, coluna e botão está
ligado **dos dois lados**: um campo que aparece na barra mas não viaja no pedido, ou uma coluna
com cabeçalho e sem célula, falha ali em vez de falhar na tela de quem usa.

Rode as duas depois de qualquer alteração. Mexeu em `app.js` ou `styles.css`? Rode também
`python scripts/versionar.py` antes de commitar — sem isso o navegador serve o arquivo do cache.

O backend antigo do Google continua no repositório, com o próprio teste
(`node teste/teste_backend.js`, 38 verificações), como referência e rota de volta enquanto a
migração não estiver validada em produção.

## Manutenção

Alterou o esquema do banco? Rode o SQL novo no **SQL Editor** do Supabase. Como o
`schema.sql` usa `create table if not exists`, ele não recria o que já existe — para mudar
coluna, escreva o `alter table` correspondente.

Atenção ao plano gratuito: o projeto do Supabase **pausa após ~7 dias sem acesso**.
Despausar é um clique no painel, mas o primeiro acesso depois disso falha.

## Próximos passos sugeridos

- Envio automático do extrato por WhatsApp/e-mail para quem está acima do prazo.
- QR code por palete/lote para conferência por leitura, em vez de digitar a contagem.
- Trocar o PIN por autenticação de verdade (Supabase Auth) se o app sair do estágio de teste.
