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

**O que está no ar é o tema claro**: fundo `gelo`, tema `gelo`, topo verde. A escolha
mora em Sistema → Aparência e é gravada na configuração do servidor, então vale para
todas as máquinas. O tema escuro — azul-marinho com acento **roxo** `#a46ce7` — também
existe, pelos mesmos tokens, e é o que a tela mostra sem configuração. O âmbar é
**aviso**, nunca ação, nos dois.

**Desenhe no claro.** Uma prévia no escuro parece outro sistema para quem usa o painel
todo dia, e a primeira prévia do rank foi recusada exatamente por isso.

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
Caixas · Saída · Retorno Declarado · Conferido · Conferido em ·
Conferido − Declarado · Conferente · Situação
```

Trazer as colunas de conferência para a primeira tela faria duas telas iguais com nomes
diferentes. Já foi tentado, e a bancada pegou.

Os valores de **Situação** são **sete**: `Bateu` · `Divergente` · `Sem conferência` ·
`Sem Retorno Motorista` · `Saída Logística` · `Sem quantidade` · `Conferido`.

**O sétimo só existe numa das duas telas.** `Conferido` é o que se sabe quando falta um
dos dois números: na aba Lançamento Motorista a contagem do conferente chega sem a
quantidade, e aí dizer "Bateu" seria otimismo e "Divergente", pessimismo — nenhum dos
dois foi medido. Na aba Movimentos Motoristas ele nunca aparece, e o filtro de lá nem o
oferece. Pelo mesmo motivo, o filtro da tela de lançamento **não** oferece `Bateu` nem
`Divergente`: ali as duas nunca casariam com linha nenhuma.

**`Conferido` é uma etiqueta contornada** (`.tag.contorno`): a família neutra, sem
fundo, com borda. Verde afirmaria que fechou — e o mesmo par pode ser `Divergente` na
outra aba; âmbar chamaria de pendência o que não espera nada desta tela. E o cinza
preenchido é o das **ausências**: na tela de lançamento, quatro das cinco situações eram
cinza, e a cor deixava de dizer qualquer coisa. O contorno diz "registrado, sem
veredito", sem cor nova. A regra completa está no comentário acima de `corDaSituacao`.

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

## 6. O rank dos motoristas — já está no ar

Esta seção pedia um rank. **Ele foi construído e está publicado.** O que vem abaixo é o
que existe hoje na tela, com o porquê de cada escolha. **O pedido agora é de revisão de
desenho, não de construção** — leia o código (seção 8) antes de propor mudança.

### O que está no ar

1. **A tabela é o primeiro lugar, e a tela cabe na janela** (computador, 1024px ou
   mais). Tabela e rank dividem a altura que sobra abaixo dos cartões; quem rola é a
   tabela, por dentro, com o cabeçalho fixo — a página não rola. **Não há janela de 16
   linhas**: ela foi pedida, mas 16 linhas e o rank aberto não cabem juntos numa tela.
   Com o rank recolhido (o padrão, item 2), o monitor do escritório (2540×915) mostra
   11,1 linhas; um 1920×1080, 15,2.
2. **O rank vem embaixo dela, na largura inteira**, em **três blocos lado a lado**, cada
   um com a sua rolagem vertical — o mesmo desenho dos painéis `.graficos`/`.g` de
   Movimentos Gerais, com o modificador `.g--rank`. Ao lado da tabela foi tentado e
   medido: com 17 colunas, Conferido, a diferença e Situação saíam da vista.
   **Ele nasce recolhido**, numa barra com os totais dos blocos ("Declarou 4.548 ·
   Chegou sem declarar 46.420 · 15% declarado"), e abre num clique. Aberto, ele levava
   228px — quase o mesmo que a tabela — e o monitor do escritório (2540×915) mostrava
   5,5 linhas. Recolhido, e sem o título repetido dentro do cartão, são **11,1 linhas**
   (13,3 na tela de lançamento). A escolha fica no navegador de quem olha.
3. **Tela baixa (menos de 860px de altura, notebook)**: aí a página volta a rolar, com a
   tabela numa janela de 460px (umas 10 linhas) e o rank logo abaixo. Espremida, a
   tabela ficava com duas linhas.
4. **No celular o rank sobe para antes dos cartões**, em carrossel horizontal, com alvo
   de toque de 44px. Abaixo de 1024px a tabela vira um cartão por par — 116 cartões,
   ~35.600px na captura —, e depois deles o rank não era alcançado.
5. **Cada linha é um botão**: clicar filtra a tela por aquele motorista, e o botão diz
   que está ligado. `sem informação` é categoria, não vira filtro — o mesmo nome que o
   resto do painel usa para a ausência.
6. **Na tela Lançamento Motorista o rank tem DOIS blocos**, e não três. Ver abaixo.

### Os blocos, e o critério de cada um

| Bloco | O que soma | Ordem |
|---|---|---|
| **Declarou o retorno** | caixas que ele informou que trazia, nas viagens de retorno. Saída não entra | do maior para o menor |
| **Chegou sem ele declarar** | caixas que alguém contou na chegada sem o retorno dele | do maior para o menor |
| **% declarado** | dos dias em que ele voltou, em quantos declarou | **do pior para o melhor** — é a lista de quem cobrar |

**O rank conta DIAS, não viagens.** Cada linha da conciliação é um *par*, e a chave do par
é `dia + motorista + sentido` (`chaveDoPar`): duas viagens de retorno do mesmo motorista
no mesmo dia viram um par só. O rótulo dizia "cargas", e "6 cargas" podia ser nove
viagens. Contar viagem de verdade é outra regra, que o par não tem.

**O total do segundo bloco não fecha com o cartão Conferido, de propósito**: o cartão soma
também o que se contou nos pares Divergente, onde o motorista declarou. Para conferir,
filtre a Situação por "Sem Retorno Motorista" — o cartão passa a mostrar o mesmo número.
O título do bloco diz isso ao passar o mouse — **só na tela que tem cartões**.

### O segundo bloco não existe na tela Lançamento Motorista

**As duas abas têm permissão independente** (`pgLancamentosMotorista` e
`pgLancamentoMotorista`), e o Admin pode dar uma sem dar a outra. Quem recebeu só a de
lançamento vê **se** uma carga foi conferida — é a coluna Situação — e nunca **quanto**.

A quantidade conferida vazava por **sete portas** nessa tela: o rank, a coluna Caixas, o
par aberto, o formulário de corrigir, a ficha e o cabeçalho do dia no celular, e o CSV.
Hoje há **um interruptor só**, `veConferencia` no descritor de cada tela, e cada porta
pergunta a ele. Uma porta nova que esqueça de perguntar é pega pela prova, que desenha a
tela inteira com uma contagem que não existe em mais lugar nenhum e procura por ela.

Então: **Movimentos Motoristas mostra três blocos; Lançamento Motorista mostra dois** —
"Declarou o retorno" e "% declarado", numa grade de dois (`.graficos--rank-2`). O "%
declarado" fica porque conta **dias**, e só diz *se* houve conferência.

Fica registrado, porque não foi resolvido: **esconder é a porta, não a fechadura.** A
rota `conciliacao` continua entregando os lançamentos do conferente a essa tela.

As quatro perguntas que esta seção deixava em aberto foram respondidas assim:

- **Três blocos**, não dois. 1.919 caixas declaradas não dizem o mesmo vindas de quem
  teve 599 sem declarar ou de quem teve 7.685; a porcentagem põe os dois na mesma escala.
- **A barra tem uma cor só.** Nos painéis de Movimentos ela é dividida em saída/retorno
  porque cada linha tem os dois números. Aqui cada linha tem **um**, e dividi-la
  inventaria uma segunda grandeza.
- **Verde para o declarado, âmbar para o que faltou** — não vermelho: declaração que
  faltou é pendência a cobrar, não caixa perdida.
- **Quem não declarou nada fica fora do primeiro bloco** e aparece no terceiro com 0%,
  que é onde a ausência dele responde alguma coisa.

### Os números reais, para julgar o desenho com carga de verdade

(Capturados quando o rótulo ainda dizia "cargas"; o número é o mesmo, contado em dias.)

```
Isaque Araújo    declarou 1.919 (6 dias)    sem declarar   599 (4 dias)
Welison Santana  declarou   980 (5 dias)    sem declarar 1.492 (5 dias)
Luciano          declarou   911 (3 dias)    sem declarar   884 (4 dias)
Arilson Silva    declarou   738 (3 dias)    sem declarar 1.542 (7 dias)
Alcimar Silva    declarou     —              sem declarar 7.685 (6 dias)
Dinho            declarou     —              sem declarar 3.415 (6 dias)
Fernando Silva   declarou     —              sem declarar 3.405 (2 dias)
Engenho Cepo     declarou     —              sem declarar 1.530 (4 dias)
Diego/Hodir      declarou     —              sem declarar   937 (2 dias)
Fausto - RN      declarou     —              sem declarar   900 (1 dia)
Diassis 2 - RN   declarou     —              sem declarar   856 (1 dia)
Arthur           declarou     —              sem declarar   225 (1 dia)
```

São 36 motoristas no total; a maioria só aparece na segunda coluna.

### O que ainda vale olhar

A função é `desenharRank` em `admin.html`, e as classes começam em `.rk-` e `.g--rank`
no `styles.css`. O estudo que precedeu a implementação continua no repositório como
`estudo-rank.html` — ele é **histórico, não o estado atual**; onde os dois discordarem,
quem manda é o `admin.html`.

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
