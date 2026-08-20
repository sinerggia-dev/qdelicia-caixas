# Qdelícia Frutas — Controle de Caixas

Controle de saída, entrada e saldo de caixas retornáveis por cliente, filial e galpão.
Site estático (GitHub Pages) + Google Sheets como banco de dados, via Google Apps Script. Sem servidor próprio, sem custo.

Modelo de referência: **crate ledger** — o mesmo desenho usado por SpireStock, TrackOnline e Mercaflux:

```
saldo do cliente = saídas − devoluções confirmadas − perdas baixadas
```

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
| `GALPAO` | index.html + admin.html | Lança saída/devolução e **confere** as chegadas |
| `MOTORISTA` | index.html | Lança saída e coleta na rua, com assinatura do cliente |
| `PROMOTOR` | index.html | Só conta a devolução dentro do cliente |
| Cliente | extrato.html?t=TOKEN | Só leitura: vê o próprio saldo e extrato |

## Instalação

### 1. Planilha + backend (uma vez, ~10 min)

1. Crie uma planilha no Google Sheets: **Qdelicia - Controle de Caixas**.
2. Menu **Extensões → Apps Script**. Apague o código de exemplo e cole todo o conteúdo de
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Salve e execute a função **`setup`** (seletor de função no topo → `setup` → Executar).
   Autorize quando o Google pedir (é a sua própria conta acessando a sua própria planilha).
   Isso cria as abas `Locais`, `TiposCaixa`, `Usuarios`, `Movimentos`, `Config` já com dados de exemplo
   e uma pasta no Drive para os canhotos.
4. **Implantar → Nova implantação → tipo App da Web**:
   - Descrição: `v1`
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
5. Copie a URL gerada (termina em `/exec`).

### 2. Site

1. Abra `config.js` e cole a URL no lugar de `COLE_AQUI_...`.
2. Publique os arquivos no repositório do GitHub Pages (ex.: `sinerggia-dev/qdelicia-caixas`),
   na raiz do branch principal:
   ```
   index.html   admin.html   extrato.html   app.js   config.js   styles.css
   ```
   (a pasta `apps-script/` não precisa ir, mas não atrapalha)
3. Settings → Pages → Fonte: branch principal, pasta `/ (raiz)`.
4. URLs finais:
   - Campo: `https://sinerggia-dev.github.io/qdelicia-caixas/`
   - Escritório: `https://sinerggia-dev.github.io/qdelicia-caixas/admin.html`
   - Cliente: `https://sinerggia-dev.github.io/qdelicia-caixas/extrato.html?t=TOKEN`

> Se o deploy do GitHub Pages travar em "deployment_in_progress": Settings → Pages → dropdown do
> branch → **Nenhum** → Salvar → esperar 10s → selecionar o branch de novo → Salvar.

### 3. Primeiros passos no sistema

1. Entre em `admin.html` com o usuário **Administrador** / PIN **1234** e **troque esse PIN**.
2. Aba **Cadastros**: renomeie o galpão, cadastre as filiais, os clientes (com WhatsApp, limite de
   caixas e prazo de devolução) e os tipos de caixa com o valor unitário.
3. Cadastre motoristas e promotores com PIN próprio.
4. Aba **Lançar** → tipo **Ajuste / saldo inicial**: informe quantas caixas cada cliente já está
   devendo hoje e quantas estão no galpão. Sem isso o saldo começa do zero.
5. A partir daí, use o app do campo no dia a dia.

## Estrutura de dados (abas da planilha)

| Aba | Para quê |
|---|---|
| `Locais` | Galpões, filiais e clientes — todos são "nós" que guardam caixas. `Token` é o código do link do cliente. |
| `TiposCaixa` | Tipos e valor unitário (transforma caixa perdida em R$). |
| `Usuarios` | Nome, perfil, PIN, local padrão. |
| `Movimentos` | Livro-razão, só acrescenta. Nada é apagado — movimento errado se **cancela** (coluna `Cancelado`). |
| `Config` | Nome da empresa, prazo padrão, ID da pasta do Drive. |

Tipos de movimento: `SAIDA`, `DEVOLUCAO`, `TRANSFERENCIA`, `PERDA`, `AJUSTE`.
Status: `CONFIRMADO` ou `AGUARDANDO` (contado no cliente, falta conferir no galpão).

## Detalhes técnicos

- **Offline**: motorista e promotor podem lançar sem sinal. Fica na fila do celular
  (`localStorage`) e sobe sozinho quando a internet volta. O chip no topo mostra quantos estão na fila.
- **Sem duplicidade**: cada lançamento carrega um `clientKey`; o backend ignora repetição, então
  reenvio da fila nunca lança duas vezes.
- **Canhoto e foto**: assinatura desenhada na tela e foto do romaneio vão para uma pasta no Drive;
  o link aparece no extrato e na conferência. A foto é reduzida no celular antes de subir.
- **Aging FIFO**: as caixas mais antigas são consideradas as que ainda não voltaram — é o que gera
  as faixas 0-7 / 8-15 / 16-30 / +30 dias e o alerta de prazo vencido.
- **Comunicação**: GET por JSONP e POST com `Content-Type: text/plain` — evita CORS/preflight do
  Apps Script sem precisar de proxy.

## Teste da matemática do saldo

`teste/teste_backend.js` roda o `Code.gs` fora do Google, com uma planilha falsa em memória:

```
node teste/teste_backend.js
```

Cobre 38 verificações: saldo por cliente, devolução do promotor sem baixar saldo, conferência com
divergência, perda, caminho galpão→filial→cliente, aging FIFO, extrato, token do cliente,
idempotência da fila offline, cancelamento, login e validações. Rode depois de qualquer alteração no `Code.gs`.

## Manutenção

Alterou o `Code.gs`? **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar.**
A URL `/exec` continua a mesma — não precisa mexer no `config.js`.

## Próximos passos sugeridos

- Envio automático do extrato por WhatsApp/e-mail para quem está acima do prazo (gatilho diário no Apps Script).
- QR code por palete/lote para conferência por leitura, em vez de digitar a contagem.
- Assinatura do cliente com foto do documento nas entregas de alto volume.
