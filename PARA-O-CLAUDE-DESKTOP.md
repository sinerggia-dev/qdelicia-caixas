# Levar o Controle de Caixas para o Claude Desktop

Este arquivo é o que você abre do outro lado. Ele diz **o que o projeto é**, **o que vai junto**,
**o que o Claude Desktop consegue e o que não consegue fazer com ele**, e **o que colar no começo
da conversa** para a sessão nova não começar do zero.

Os outros três documentos continuam valendo, e este não os substitui:

| Arquivo | Para quê |
|---|---|
| `README.md` | Instalação: criar o banco, subir na Vercel, os primeiros passos no sistema. |
| `CLAUDE.md` | A nota de retomada — 85 KB do que **não está óbvio no código**: as regras do produto, as armadilhas já pagas, o porquê de cada decisão. É o documento mais importante do repositório. |
| `manual.html` / `manual.pdf` | O manual de operação, para quem usa o sistema no galpão. |

---

## 1. Antes de tudo: o que o Claude Desktop consegue fazer aqui

Vale ler esta seção inteira antes de montar qualquer coisa, porque ela decide o que faz sentido
pedir lá.

**O Claude Desktop lê e escreve arquivos** — basta ligar o conector de sistema de arquivos à pasta
do projeto (seção 3). Com isso ele consegue:

- ler e explicar qualquer parte do código;
- escrever e reescrever trechos, telas, textos, documentação;
- planejar uma mudança e deixá-la pronta no arquivo.

**O Claude Desktop não tem terminal.** Sem um servidor MCP que execute comandos, ele **não roda**:

- `node teste/teste_tela.js` e as outras oito suítes;
- `python scripts/versionar.py`;
- `python scripts/testar.py`;
- `git commit`, `git push`;
- nada que verifique o que ele acabou de escrever.

Isto não é um detalhe de conforto. Neste projeto **a prova é parte do trabalho**: toda mudança
nasce com uma bancada que mede o efeito dela, e a bancada só vale depois de ser sabotada e pegar o
defeito. Um ajuste escrito sem rodar nada é um ajuste **não verificado** — e a história deste
repositório tem caso de coisa dada como pronta, que foi para produção quebrada, justamente porque
a verificação não rodou.

**Então o desenho que funciona é este:**

| No Claude Desktop | No Claude Code (terminal) |
|---|---|
| Ler o projeto, entender, discutir | Rodar as suítes |
| Planejar a mudança | Rodar a sabotagem |
| Escrever documentação e textos | `versionar.py`, `testar.py` |
| Rascunhar o código da mudança | `git commit` e `git push` |
| Revisar o que já foi feito | Conferir o que entrou no ar |

Se você quiser o ciclo inteiro dentro do Desktop, é preciso instalar um servidor MCP que execute
comandos nesta máquina. Isso existe, mas é uma decisão de segurança sua: um servidor desses dá a
uma conversa o direito de rodar qualquer coisa no computador. O Claude Code já é a ferramenta
feita para isso, com confirmação a cada comando.

---

## 2. O que levar

**Leve a pasta inteira.** Tudo o que importa está versionado no Git — inclusive a pasta `teste/`,
que o `.vercelignore` tira do deploy mas o Git guarda.

```
C:\Users\natan_cou1nrv\OneDrive\Documentos\claude\qdelicia-caixas
```

Ou, numa máquina nova:

```
git clone https://github.com/sinerggia-dev/qdelicia-caixas.git
```

**O que NÃO está na pasta, e não pode estar:**

- A **chave do banco** (`SUPABASE_SERVICE_KEY`). Ela vive só nas variáveis de ambiente da Vercel, e
  nunca em arquivo nenhum deste repositório. Não peça essa chave numa conversa, não cole numa
  conversa, não escreva num arquivo — ela abre o Postgres inteiro, por cima de qualquer trava.
- A **senha do escritório**. Também não é para estar escrita em lugar nenhum.
- As credenciais do GitHub e da Vercel.

**O que precisa existir na máquina** para o ciclo rodar (no Claude Code, não no Desktop): Node,
Python 3 e Git. Não há `npm install` — o projeto não tem dependências, e as funções da Vercel
falam com o Postgres por `fetch` puro.

---

## 3. Ligar o Claude Desktop à pasta

1. No Claude Desktop, abra **Configurações → Conectores**.
2. Adicione o conector de **sistema de arquivos** (Filesystem) apontando para a pasta do projeto.
3. Confirme pedindo algo simples: *"liste os arquivos da raiz do projeto e me diga o tamanho do
   `admin.html`"*. Se vier a lista, está ligado.

**Um aviso de tamanho.** Estes arquivos não cabem numa mensagem de conversa:

| Arquivo | Tamanho |
|---|---|
| `admin.html` | ~700 KB |
| `styles.css` | ~263 KB |
| `app.js` | ~169 KB |
| `api/_logica.js` | ~152 KB |
| `index.html` | ~142 KB |
| `CLAUDE.md` | ~85 KB |

Não tente colar nenhum deles. Peça que o Desktop **leia pelo conector**, e de preferência que
procure o trecho — por nome de função, por texto da tela — em vez de abrir o arquivo inteiro.

---

## 4. O texto para colar no começo da sessão

```
Projeto: Qdelícia Frutas — Controle de Caixas.
A pasta está ligada pelo conector de arquivos.

Antes de responder qualquer coisa sobre o projeto, leia nesta ordem:
1. PARA-O-CLAUDE-DESKTOP.md (este arquivo: o mapa e as regras)
2. CLAUDE.md (a nota de retomada; é longa — leia os cabeçalhos e
   depois as seções que importarem para o que eu pedir)

Regras desta conversa:
- Você não tem terminal aqui. Não diga que rodou teste, nem que
  commitou, nem que subiu nada. Quando a mudança precisar ser
  verificada, escreva o código e me diga exatamente o que devo
  rodar no Claude Code.
- Não me peça a chave do Supabase nem a senha do escritório, e não
  escreva nenhuma das duas em arquivo nenhum.
- A interface é em português. O código das telas de campo é ES5.
```

---

## 5. O mapa do projeto

```
navegador ──fetch──► /api (função na Vercel) ──service_role──► Postgres (Supabase)
                           │
                           └──► Storage (canhotos e fotos)
```

O navegador **nunca** fala com o banco. É isso que permite o PIN de 6 números e o link anônimo do
cliente sem deixar o Postgres exposto.

### As telas

| Arquivo | O que é |
|---|---|
| `index.html` | O **app de campo**: quem lança saída, retorno e contagem. É a tela do galpão, no celular. |
| `admin.html` | O **painel**: cadastros, relatórios, conciliação, gráficos, permissões. É a tela do escritório. |
| `extrato.html` | O extrato do cliente, aberto por link com token. Sem login. |
| `instrucoes.html` | Instruções, dentro do grupo SISTEMA. |
| `demo-lancamento*.html` | Telas de demonstração do tutorial. |
| `app.js` | O **núcleo compartilhado** pelas telas: tema, cores, sessão, formatação, a lista dos livros. Regra do projeto: a regra mora aqui, e não repetida em cada página. |
| `styles.css` | A folha inteira, com um ponto de quebra só (1023/1024px). |

### O servidor

| Arquivo | O que é |
|---|---|
| `api/index.js` | O roteador. GET: `dados`, `equipe`, `meuAcesso`, `painel`, `saldoLocais`, `pendentes`, `movimentos`, `meusLancamentos`, `conciliacao`, `lixeira`, `extrato`, `extratoToken`. POST: `login`, `movimento`, `conferir`, `cancelar`, `descancelar`, `corrigir`, `salvarUsuario`, `salvarLocal`, `salvarMotorista`, entre outras. |
| `api/_logica.js` | As **regras puras**, sem banco: `basesEfetivas`, `recorteBases`, `marcarHistorico`, `sessaoDe`, `usuariosPublicos`, o saldo, as permissões. É aqui que mora a maior parte do que precisa ser entendido. |
| `api/_supabase.js` | PostgREST por `fetch`, e a tradução `snake_case` ↔ formato interno. |
| `api/_migracoes.js` | As **43 migrações** do banco, em lista. Rodam sozinhas, na ordem. |
| `api/_senha.js` | O hash das senhas. |

Arquivo em `api/` que começa com `_` **não vira endpoint** — a Vercel o trata como auxiliar.

### As tabelas

| Tabela | Para quê |
|---|---|
| `locais` | Galpões, filiais, clientes e **rotas** — todos são nós que guardam caixa. `token` é o código do link do cliente. |
| `tipos_caixa` | Os tipos, com o peso de cada um. |
| `usuarios` | Nome, perfil, senha, PIN, local padrão e as chaves de permissão. |
| `motoristas` | Quem dirige. Não faz login. |
| `locais_padrao` | Postos de trabalho. Não guardam caixa. |
| `movimentos` | O **livro-razão**: só acrescenta. Nada é apagado — movimento errado se **cancela**. |
| `config` | Nome da empresa, prazo padrão. |

Tipos de movimento: `SAIDA`, `DEVOLUCAO`, `TRANSFERENCIA`, `PERDA`, `AJUSTE`.

---

## 6. As regras que não se quebram

Estas não são preferências. Uma alteração que quebre qualquer uma delas é um defeito, mesmo que
funcione na tela.

**Segurança**

1. **A chave do banco nunca entra num arquivo do repositório**, nem numa conversa.
2. **Documento pessoal não sai pela rota pública.** CPF, CNH e telefone não aparecem na rota
   `dados`.
3. **A RLS fica ligada, sem política nenhuma.** Quem passa é a função, com a chave de serviço.
4. **Nada marcado = nada liberado.** Nenhuma página aparece sem estar marcada no cadastro — para
   ninguém, administrador inclusive.
5. **O que está no perfil é o limite, em todo lugar.** Se a base não está marcada no cadastro da
   pessoa, ela não aparece em filtro nenhum nem traz lançamento nenhum. Sem exceção para o
   administrador: a exceção já existiu, e fazia o filtro e a tabela se contradizerem na mesma tela.
6. **A contagem é cega.** O conferente nunca vê a declaração do motorista antes de contar.
7. **A senha do escritório não fica escrita em lugar nenhum.**

**Produto**

8. **Toda devolução baixa saldo assim que é lançada.**
9. **Rota é um tipo de local**, e não uma tabela nova.
10. **Não existe valor em dinheiro** no sistema.
11. **O livro-razão só acrescenta.** Cancelar, nunca apagar.

**Dados**

12. As migrações entram **no fim de `api/_migracoes.js`**, e **não saem de lá** depois de rodadas.
    Elas são **estrutura, não conteúdo** — nada de dado de cliente ali.
13. Toda migração que cria uma permissão nova **preenche o que já existia**. Uma permissão que
    nasce vazia tira de todo mundo o que as pessoas já faziam: isso é uma parada, não um ajuste.
14. **Apóstrofo dentro de string SQL derruba a migração inteira**, e com ela a API. O projeto
    escreve `e'` no lugar de `é` nos comentários de código; dentro de SQL isso **fecha a string**.
    Já aconteceu, e tirou o sistema do ar.

---

## 7. O ciclo de trabalho

Este é o ciclo que toda mudança percorre. **Nada dele roda no Claude Desktop** — está aqui para
você saber o que pedir, e para a sessão nova não prometer o que não pode cumprir.

```
1. escrever a mudança
2. escrever a BANCADA que mede o efeito dela
3. SABOTAR: plantar N defeitos plausíveis, exigir N capturas
      — defeito que escapa vira bancada nova, sempre
4. python scripts/versionar.py      (se mexeu em app.js ou styles.css)
5. python scripts/testar.py         (as 9 suítes, ~4.600 conferências)
6. git commit  +  git push origin main
7. Ctrl+Shift+R no navegador
```

**Sobre o passo 2.** A bancada mede o **efeito**, e não o endereço. Procurar o nome de uma função
no arquivo responde "a palavra está lá?" — e estaria, inclusive numa versão que faz a conta ao
contrário. Este projeto já teve bancada verde sobre tela quebrada mais de uma vez; o que funciona
é **rodar o trecho de verdade e medir o que ele produz**.

**Sobre o passo 3.** Sem sabotagem a bancada é decoração. No último ajuste foram 11 defeitos
plantados e 2 escaparam na primeira rodada — um deles porque a prova encontrava a frase certa no
`title` do botão, com a linha visível da tela apagada.

**Sobre o passo 4.** `versionar.py` carimba o `?v=` do `app.js` e do `styles.css` em todas as
páginas. Sem ele o navegador serve a versão do cache, e a mudança simplesmente não aparece.

As nove suítes: `teste_api`, `teste_backend`, `teste_login`, `teste_motorista`,
`teste_obrigatorios`, `teste_permissoes`, `teste_primeiro_acesso`, `teste_saldo`, `teste_tela`.

---

## 8. Onde as coisas estão no ar

| | |
|---|---|
| Repositório | `sinerggia-dev/qdelicia-caixas` |
| Aplicação | https://qdelicia-caixas.vercel.app |
| Banco | Supabase, região Oregon |
| Hospedagem | Vercel, plano **Hobby** |

O deploy é automático: `git push origin main`, e a Vercel publica em menos de um minuto. Não há
etapa de build.

O **GitHub Pages do mesmo repositório está obsoleto** — serve uma versão que aponta para `/api`,
que só existe na Vercel.

---

## 9. O que está em aberto

Isto é dívida conhecida, não defeito novo. Vale saber antes de prometer qualquer coisa ao
escritório.

- **A API não tem autenticação.** `gravarMovimento` recusa por permissão, e as telas escondem o que
  a pessoa não deve ver, mas as demais rotas aceitam chamada de qualquer origem. A correção real é
  autenticação com checagem por rota. **É a maior dívida do projeto.**
- **Os PINs de exemplo** continuam publicados num site público.
- **`Saidas`, `Destinos` e `TiposCaixa` são conferidos na tela, e não no servidor.** Quem souber
  montar a chamada à mão passa por cima.
- **Vercel Hobby proíbe uso comercial.** O plano precisa virar Pro, ou mudar de hospedagem.
- **Supabase gratuito pausa o banco** depois de cerca de 7 dias sem acesso.
- Três tokens de cor (`--txt-fraco`, `--marca-roxo`, `--marca-verde`) continuam definidos no
  `styles.css` e não são lidos por nada.

---

## 10. Para onde olhar primeiro

Se a sessão nova precisar de um ponto de entrada, estes são os quatro que explicam o sistema:

1. `CLAUDE.md`, seção **"As três regras que sustentam o produto"** — o porquê do produto.
2. `CLAUDE.md`, seção **"Nada marcado = nada liberado. Marcar é conceder."** — o modelo de
   permissão inteiro.
3. `api/_logica.js`, as funções `basesEfetivas` e `recorteBases` — onde o limite do cadastro vira
   código.
4. `CLAUDE.md`, seção **"Armadilhas já pagas"** — os erros que este projeto já cometeu, e não
   precisa cometer de novo.
