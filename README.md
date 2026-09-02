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
GALPÃO ──saída──► CLIENTE ──devolução──► GALPÃO
   └──transferência──► FILIAL ──saída──► CLIENTE ──devolução──► FILIAL ──► GALPÃO
```

Cada local (galpão, filial, cliente) tem saldo próprio, então a caixa nunca "some no meio do caminho":
se saiu do galpão e não chegou ao cliente, o saldo fica com quem estiver com ela.

**A regra que resolve a dor principal:** a devolução contada no cliente (por promotor ou motorista)
entra como **AGUARDANDO**. O saldo do cliente só baixa quando o galpão confere na chegada.
A diferença entre o que foi contado no cliente e o que chegou fica registrada como **divergência**.

## Perfis

| Perfil | Onde usa | O que faz |
|---|---|---|
| `ADMIN` | admin.html | Tudo: painel, extratos, lançamento manual, perdas, cadastros, cancelamento |
| `GALPAO` | index.html + admin.html | Lança saída/devolução e **confere** as chegadas. No painel só consulta — sem Lançar e sem Cadastros |
| `MOTORISTA` | index.html | Lança saída e coleta na rua, com assinatura do cliente |
| `PROMOTOR` | index.html | Só conta a devolução dentro do cliente |
| Cliente | extrato.html?t=TOKEN | Só leitura: vê o próprio saldo e extrato |

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

1. Entre em `admin.html` com **Administrador** / PIN **1234** e **troque esse PIN**.
2. Aba **Cadastros**: renomeie o galpão, cadastre filiais, clientes (com WhatsApp, limite de
   caixas e prazo de devolução) e os tipos de caixa.
3. Cadastre motoristas e promotores com PIN próprio.
4. Aba **Lançar** → **Ajuste / saldo inicial**: quantas caixas cada cliente já deve hoje e
   quantas estão no galpão. Sem isso o saldo começa do zero.

## Estrutura de dados (tabelas)

| Tabela | Para quê |
|---|---|
| `locais` | Galpões, filiais e clientes — todos são "nós" que guardam caixas. `token` é o código do link do cliente. |
| `tipos_caixa` | Tipos de caixa que aparecem nas telas de lançamento. |
| `usuarios` | Nome, perfil, PIN e local padrão. |
| `movimentos` | Livro-razão, só acrescenta. Nada é apagado — movimento errado se **cancela**. |
| `config` | Nome da empresa, prazo padrão. |

Tipos de movimento: `SAIDA`, `DEVOLUCAO`, `TRANSFERENCIA`, `PERDA`, `AJUSTE`.
Status: `CONFIRMADO` ou `AGUARDANDO` (contado no cliente, falta conferir no galpão).

## Detalhes técnicos

- **Offline**: motorista e promotor podem lançar sem sinal. Fica na fila do celular
  (`localStorage`) e sobe sozinho quando a internet volta. O chip no topo mostra o tamanho da fila.
- **Sem duplicidade**: cada lançamento carrega um `client_key`, e a coluna tem `UNIQUE`.
  Quem recusa a repetição é o banco, não o código — reenvio da fila nunca lança duas vezes.
- **Canhoto e foto**: assinatura desenhada na tela e foto do romaneio vão para o bucket
  `canhotos` no Supabase Storage; o link aparece no extrato e na conferência. A foto é reduzida
  no celular antes de subir — o corpo da requisição na Vercel tem limite de 4,5 MB.
- **Aging FIFO**: as caixas mais antigas são consideradas as que ainda não voltaram — é o que
  gera as faixas 0-7 / 8-15 / 16-30 / +30 dias e o alerta de prazo vencido.
- **Comunicação**: `fetch` comum, mesma origem. Sem JSONP e sem CORS, que só existiam por
  causa das limitações do Apps Script.

## Teste da matemática do saldo

```
node teste/teste_api.js
```

Roda o roteador, as regras e os tradutores de verdade, trocando apenas o acesso ao Postgres por
um banco falso em memória — sem rede e sem chave. São 45 verificações: saldo por cliente,
devolução do promotor sem baixar saldo, conferência com divergência, perda, caminho
galpão→filial→cliente, aging FIFO, extrato, token do cliente, idempotência da fila offline,
cancelamento, login, validações e cadastros. Rode depois de qualquer alteração em `api/`.

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
