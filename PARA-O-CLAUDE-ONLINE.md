# Controle de Caixas — briefing de design

Você vai desenhar telas para um sistema que já existe e está em produção. Este
documento é tudo o que você precisa saber para isso: o que o produto é, quem o usa, o
sistema visual que ele já tem, as regras que o desenho não pode quebrar, e o que fazer
com o que você produzir.

**Você não tem acesso ao repositório nem ao banco.** Você desenha; outra instância do
Claude, com terminal, aplica no código. Por isso o formato do que você entrega importa
tanto quanto o desenho — a última seção diz qual é.

---

## 1. O produto em dez linhas

Controle de **caixas plásticas retornáveis** (90% banana) de uma distribuidora de frutas
em Recife, a **Qdelícia Frutas**. As caixas circulam entre o galpão da matriz, cinco
filiais, rotas de entrega, clientes e fornecedores.

A dor original: **a caixa sai fácil e volta mal**, e a perda só aparece no fim do mês,
sem dono.

O desenho segue o padrão de mercado chamado *crate ledger*: **cada local tem saldo
próprio** — inclusive o cliente e o caminhão —, e a caixa fica sempre na conta de quem
estiver com ela. Não há valor em dinheiro em lugar nenhum do sistema: a unidade é a
caixa.

Está no ar em `qdelicia-caixas.vercel.app`, com Postgres no Supabase.

### O ciclo

```
GALPÃO ──carrega──► ROTA ──entrega──► CLIENTE ──coleta──► ROTA ──volta──► GALPÃO
```

A matriz também manda caixa para filiais (transferência, não saída) e para fornecedores
(aí sim sai da empresa).

---

## 2. Quem usa, e onde

Isto decide quase todo o desenho.

| Quem | Onde | O que faz |
|---|---|---|
| **Motorista** | celular, no pátio, sob sol forte | declara o que levou e o que trouxe |
| **Conferente** | celular ou tablet, na doca | conta a carga que chegou |
| **Gerente de filial** | computador | lança saídas e confere a unidade dele |
| **Escritório / admin** | computador, tela larga | concilia, cobra, apresenta ao cliente |

Duas consequências que você não pode esquecer:

- **O app de campo (`index.html`) é um app de celular.** Botão grande, poucos campos,
  nada que exija precisão de dedo. Ele roda às vezes sem rede.
- **O painel (`admin.html`) é de computador.** Tabelas largas, muitas colunas, filtros.
  No celular ele degrada para listas empilhadas, mas não é onde ele vive.

---

## 3. O sistema visual que já existe

**Não invente um novo.** Ele foi medido, tem teste automático cobrando contraste, e
trocar a paleta por conta própria quebraria a bancada.

### Tema

Azul-marinho escuro em todas as telas, com acento **roxo** `#a46ce7`. O âmbar é
**aviso**, nunca ação. Há tema claro também, pelos mesmos tokens.

### Tokens — use estes nomes, nunca cor solta

Há um teste que **reprova qualquer cor escrita direto no CSS.**

| Token | Papel |
|---|---|
| `--bg` | o chão da página |
| `--surface` | cartão, janela |
| `--surface-2` | cabeçalho de tabela, linha sob o mouse |
| `--campo` | dentro do que se digita, e a lateral — mais fundo que o cartão, de propósito: o que se preenche afunda |
| `--neutro` | etiqueta, botão neutro, barra |
| `--linha` | separador; `--linha-viva` para o mais forte |
| `--txt` / `--txt2` / `--txt3` / `--txt-fraco` | tinta, do mais forte ao mais apagado |
| `--brand` / `--brand-hover` | o acento roxo: item de menu aberto, grupo escolhido |
| `--ambar-btn` | botão principal (o nome mente: hoje é o mesmo roxo) |
| `--verde` / `--ambar` / `--vermelho` | bom · atenção · ruim |
| `--azul-cheio` / `--verde-cheio` | **só para preencher área** (barras de gráfico). Os outros são claros demais como área e brilham |
| `--raio` 14px / `--raio-sm` 10px | cantos |
| `--fonte` IBM Plex Sans / `--fonte-mono` IBM Plex Mono | a mono é para número |

**Fundo nunca é tinta.** `--surface`, `--campo`, `--brand`, `--ambar-btn` existem para
ser fundo; escritos como `color:` somem sobre a própria família. Onde a marca precisa
ser letra, é `--marca-txt`. Há teste recusando isso.

### Vocabulário de componentes que já existe

Reuse. Um componente novo parecido com um existente dá duas coisas para manter e duas
para divergirem.

| Classe | O que é |
|---|---|
| `.card` | o cartão branco/escuro que embrulha cada seção |
| `.ftile` | o cartão de número grande da fileira do topo (rótulo, número, desenho) |
| `.tbl` | tabela de dados |
| `.tabela-wrap` | o invólucro que dá rolagem horizontal |
| `.graficos` + `.g` | **a fileira de blocos** com barras — grid de 5, cada bloco com título, total e linhas |
| `.gb` / `.gb__r` / `.gb__k` / `.gb__v` / `.gb__t` | uma linha de barra dentro do bloco: rótulo, valor, trilho |
| `.bt-campo` | rótulo em cima + campo embaixo, na barra de filtros |
| `.barra-trava` + `.barra-trava__acoes` | a barra de filtros: o bloco de botões e, **como irmãos diretos**, os campos |
| `.chip-hoje`, `.tag`, `.btn sec/neutro` | atalho, etiqueta, botões |
| `.ret-rail` + `.ret-item` | o trilho lateral do Painel de Ativos, com os chips de lente |
| `.vazio` | o estado "não há nada aqui" |

### Regras de desenho que já custaram caro

Cada uma destas nasceu de um defeito real.

1. **Um número que não fecha com a coluna logo abaixo não se defende.** Se o cartão diz
   36.520 e somar a coluna dá outro valor, a pessoa para de confiar na tela inteira —
   não só naquele cartão. Todo número precisa de um caminho para ser conferido.
2. **Vazio é resposta, mas precisa ter nome.** Célula em branco se lê como "o sistema
   não carregou". Use travessão `—` para "não existe", e `0` só quando o valor é zero.
3. **Sem informação é uma categoria, não um buraco.** Lançamento sem motorista vira uma
   linha chamada "sem informação", nunca some da lista.
4. **Aviso que aparece sempre deixa de ser aviso.** Rodapé, marca, cor de alerta: só
   quando há o que dizer.
5. **Vermelho quer dizer uma coisa só**: há caixa fora / falta. Pendência a resolver é
   âmbar.
6. **Os cartões do topo não mudam quando se troca de aba.** São o número da matriz.
   Quem muda é a tabela — e ela tem o total dela no rodapé, com nome.
7. **Contraste WCAG AA é cobrado por teste** que lê o CSS e calcula. Não aprove um par
   sem checar.

---

## 4. As telas

### App de campo — `index.html`, celular

| Tela | Para quê |
|---|---|
| Enviar contagem | o motorista declara saída ou retorno |
| Entrada | o conferente conta a carga que chegou |
| Lançamentos | o que ele mesmo mandou, para conferir e corrigir |

### Painel — `admin.html`, computador

| Tela | Para quê |
|---|---|
| **Painel de Ativos** | a tela principal: cinco cartões no topo, trilho de lentes à esquerda, tabela de fluxo |
| **Movimentos Gerais** | todos os lançamentos, linha a linha, com filtros e agrupamento |
| **Movimentos Motoristas** | a conciliação: o que o motorista declarou × o que o conferente contou |
| **Lançamento Motorista** | a mesma conciliação noutro recorte |
| Movimentos Rotas, Extratos, Cadastros, Colunas, Ajuste Estoque | apoio |

### As colunas das duas telas de conciliação — as de verdade

Não invente coluna. **São duas telas parecidas e diferentes de propósito**, e a
diferença entre elas é o ponto: há teste cobrando que não virem a mesma.

**Lançamento Motorista — 11 colunas.** A pergunta é *"o que o motorista declarou, e SE
já foi conferido"*. O **se** está na coluna Situação.

```
Lançamento · Data · Hora · Tipo · Motorista · Placa · Origem · Destino ·
Caixas · Declarado · Situação
```

**Movimentos Motoristas — 17 colunas.** A pergunta é *"bateu?"* — e por isso ela tem o
**quanto** foi conferido e a diferença.

```
Lançamento · Data · Hora · Base · Tipo · Motorista · Placa · Origem · Destino ·
Caixas · Retorno Declarado · Retorno Decl. · Conferido · Conferido em ·
Conferido − Declarado · Conferente · Situação
```

Trazer as colunas de conferência para a primeira tela faria duas telas iguais com nomes
diferentes. Já foi tentado, e a bancada pegou.

Os valores de **Situação** são: `Bateu` · `Divergente` · `Sem conferência` ·
`Sem Retorno Motorista` · `Saída Logística` · `Sem quantidade`.

### O Painel de Ativos em detalhe — é onde o desenho mais importa

**Cinco cartões no topo** (`.ftile`): Total no Estoque · Saiu · Voltou · Saldo · Taxa de
Retorno. Eles são a operação do período e **não mudam com a aba escolhida**.

**Trilho à esquerda** com nove *lentes*, cada uma com uma contagem:

```
Todas · Rotas · Unidades · Clientes · Em déficit
Motoristas · Usuários · Tipos de caixa · Fornecedores
```

Quatro delas — Todas, Motoristas, Usuários, Tipos de caixa — recortam a operação
**inteira** e fecham com os cartões. As outras cinco são **recortes**: mostram menos, e
há um "?" no rodapé da tabela explicando o critério de cada uma.

**Tabela** no centro, com colunas arrastáveis, agrupamento e linha de total no pé.

---

## 5. O vocabulário do domínio

Você vai ver estas palavras e precisa saber o que querem dizer.

| Palavra | Significado |
|---|---|
| **Saída** | caixa deixando o galpão |
| **Retorno / Devolução** | caixa voltando |
| **Transferência** | entre duas casas nossas (matriz ↔ filial) — **não** é saída da empresa |
| **Perda** | caixa que deixou de existir |
| **Ajuste** | lançamento de saldo inicial |
| **Declaração** | o motorista dizendo o que trouxe — **não é caixa que andou** |
| **Conferência** | alguém contando a carga na chegada. **É ela que vale** |
| **Contagem cega** | o conferente nunca vê o que o motorista declarou, para não copiar |
| **Divergência** | declarado ≠ contado |
| **Sem retorno motorista** | alguém contou a chegada e o motorista nunca declarou |
| **Lente / aba / chip** | cada um dos nove recortes do trilho |
| **Casa nossa** | galpão ou filial |
| **Perna interna** | trecho entre duas casas nossas |

Duas regras do domínio que mudam número na tela:

- **Numa devolução conferida, vale a quantidade CONTADA, não a declarada.**
- **Declaração não entra em nenhum total de caixa** — ela é informação, não movimento.

---

## 6. O trabalho pendente — o que foi pedido

Há um rank de motoristas na tela de conciliação, e ele precisa ser redesenhado.

### O problema

O rank foi posto **acima** da tabela e empurrou a tabela para fora da tela. Com 35
linhas, quem abre a página não vê os dados — vê o resumo.

### O que foi pedido

1. **A tabela volta para o primeiro lugar.**
2. Ela ganha uma **janela de 16 linhas**, com o resto em rolagem interna e o cabeçalho
   fixo no topo da janela.
3. O rank desce para **depois** da tabela.
4. O rank passa ao formato de **blocos lado a lado**, cada um com a sua **rolagem
   vertical** — o mesmo desenho dos painéis `.graficos`/`.g` que a tela de Movimentos
   Gerais já usa.

### Os dados do rank

Por motorista, dentro do período e dos filtros ativos:

| Campo | O que é |
|---|---|
| **Declarou o retorno** | caixas que ele informou que trazia, nas viagens de retorno. Saída não entra |
| **Chegou sem ele declarar** | caixas que alguém contou na chegada sem o retorno dele |
| cargas | quantos lançamentos em cada conta |

Números reais de uma captura, para o desenho ficar realista:

```
Isaque Araújo    declarou 1.919 (6 cargas)   sem declarar   599 (4 cargas)
Welison Santana  declarou   980 (5 cargas)   sem declarar 1.492 (5 cargas)
Luciano          declarou   911 (3 cargas)   sem declarar   884 (4 cargas)
Arilson Silva    declarou   738 (3 cargas)   sem declarar 1.542 (7 cargas)
Alcimar Silva    declarou     —              sem declarar 7.685 (6 cargas)
Dinho            declarou     —              sem declarar 3.415 (6 cargas)
Fernando Silva   declarou     —              sem declarar 3.405 (2 cargas)
Engenho Cepo     declarou     —              sem declarar 1.530 (4 cargas)
Diego/Hodir      declarou     —              sem declarar   937 (2 cargas)
Fausto - RN      declarou     —              sem declarar   900 (1 carga)
Diassis 2 - RN   declarou     —              sem declarar   856 (1 carga)
Arthur           declarou     —              sem declarar   225 (1 carga)
```

São 36 motoristas no total; a maioria só aparece na segunda coluna.

### Perguntas em aberto, que o desenho precisa responder

- **Quantos blocos?** Dois (o que foi pedido) ou três, incluindo a **porcentagem que
  cada um declarou**? 1.919 caixas declaradas não dizem o mesmo vindas de quem teve 599
  sem declarar ou de quem teve 7.685 — a porcentagem põe os dois na mesma escala. Se
  entrar, deve vir ordenada do pior para o melhor: é a lista de quem cobrar.
- **Quantas colunas na fileira?** O painel de Movimentos usa cinco, mas lá cada linha é
  uma data ou um trecho. Aqui é **nome de gente**, mais largo.
- **Que altura para a rolagem de cada bloco?** O pódio precisa caber sem rolar.
- **A barra é de uma cor ou dividida?** Nos painéis de Movimentos ela é dividida em
  saída/retorno porque cada linha tem os dois. Aqui cada linha tem **um número só**.

Há um estudo já feito com uma proposta, em `estudo-rank.html` no repositório. Peça-o se
quiser partir dele — mas não se prenda a ele.

---

## 7. O que entregar, e como

A instância do Claude que aplica isto tem terminal e repositório. Para ela conseguir
aplicar sem adivinhar, entregue:

1. **O HTML da estrutura**, com as classes que vai usar — reaproveitando as da seção 3
   onde der, e nomeando as novas com prefixo claro.
2. **O CSS novo**, só o que não existe, **usando os tokens** e nenhuma cor solta.
3. **Uma frase por decisão**, dizendo o que ela evita. Não "fica mais bonito": *"a
   janela prende a altura porque com 35 linhas a tabela empurra o resto para fora da
   tela"*. O código deste projeto é comentado assim de ponta a ponta, e a razão de cada
   escolha é tratada como parte da entrega.
4. **O que você considerou e descartou**, quando houver. Economiza a próxima rodada.

### Três coisas que farão a entrega ser recusada

- **Cor solta.** `#fff`, `rgba(...)`, `white` — há teste reprovando.
- **Redefinir uma classe que já existe** com outro desenho. Se precisar variar, crie um
  modificador (`.g--rank`), não redefina `.g`.
- **Um número sem caminho para ser conferido.** Se o bloco mostra um total, precisa
  haver como chegar nele pela tela.

### O que não é sua decisão

- Mudar a paleta, a tipografia ou os tokens.
- Mudar o que cada número significa — isso é regra de negócio, está na seção 5.
- Mexer na estrutura de dados ou nas rotas.

---

## 8. O código é a verdade — peça por ele

Este documento descreve o sistema; **ele não o substitui**. Se você puder ler o
repositório, leia — a prévia que você montar sai igual ao que está no ar, em vez de
aproximada.

| Arquivo | Por que importa para o desenho |
|---|---|
| `styles.css` | **os tokens e as classes de verdade**, 4.500 linhas. É a diferença entre usar a paleta e imitá-la |
| `admin.html` | as telas do painel. Os descritores de tabela (`TAB_LANC`, `TAB_DECL`, `TAB_ATIVOS`) dizem as colunas exatas, as larguras e os títulos |
| `index.html` | o app de campo, celular |
| `CLAUDE.md` | 86 KB do porquê de cada decisão, com uma seção de armadilhas já pagas |

Duas formas de chegar nele, as duas na mão de quem te mandou este arquivo:

- **o repositório:** `sinerggia-dev/qdelicia-caixas`
- **a pasta local:** `C:\Users\natan_cou1nrv\OneDrive\Documentos\claude\qdelicia-caixas`

**Sem acesso, trabalhe com o que está aqui e diga o que você assumiu.** Uma prévia com
as suposições declaradas é útil; uma prévia que parece exata e não é custa uma rodada
inteira para descobrir.

## 9. Se precisar de mais contexto

O repositório tem três documentos maiores, e quem está do outro lado pode colar trechos
sob demanda:

| Arquivo | O que tem |
|---|---|
| `CLAUDE.md` | 86 KB do que **não está óbvio no código**: as regras do produto, cada decisão e por quê, e uma seção de "armadilhas já pagas". É o documento mais importante do repositório |
| `README.md` | instalação, banco, deploy |
| `manual.html` | o manual de operação, por perfil, para quem usa no galpão |

Peça por seção — por exemplo, *"cole a seção Paleta do CLAUDE.md"* — em vez de pedir o
arquivo inteiro.
