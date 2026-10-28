# Estrelas na listagem da Comunidade — desenho

**Bichu · BICHUS-313 · 28/10/2026 · protótipo HTML no lugar do Figma**, por
autorização do cliente de 23/09/2026 (a conta não tem cota). Abra `index.html` no
navegador: o painel do topo troca a largura (320, 375, 412 dp), a tela, a
**variação da estrela** e o **povoamento** da lista.

Sobre `origin/development` em `675c516c`.

## O pedido

> *"a listagem da comunidade, vamos incluir umas estrelinhas com a avaliação de
> cada estabelecimento"*

A tela é `app/lib/telas/perto/lista_do_diretorio.dart`, a aba `Perto` dentro da
seção **Comunidade**.

## Isto reabre uma decisão dele de 22/10/2026 — e quem implementar precisa saber

Seis dias atrás o cliente pediu o contrário, e o cartão de hoje é o resultado
daquele pedido:

> *"a listagem dos profissionais deve ser apenas o logo, nome, segmento, endereço
> e botão de ligar, remova as informações adicionais, deixe apenas na página
> interna"*

**A média e a contagem foram uma das quatro coisas removidas naquele dia** (as
outras três: a distância, a apresentação e o selo do que foi verificado). O
pedido de hoje devolve **uma** delas. O cartão passa de cinco para **seis**
coisas.

Duas consequências práticas:

1. **As outras três continuam fora.** Este protótipo não traz nenhuma de volta,
   e o pedido de hoje não as menciona.
2. **A prosa de `lista_do_diretorio.dart` que começa em "CINCO COISAS, E SÓ
   ELAS" vira mentira no commit que implementar isto**, junto com a linha da
   tabela que diz onde a média foi parar. Ela precisa ser reescrita no mesmo
   commit, e não apagada: a decisão de 22/10 existiu e vale para as outras três.

Decisão do cliente revertendo decisão do cliente é dele. O que não pode é o
código continuar dizendo uma coisa e desenhar outra.

## O dado, que o contrato já decidiu

`DirectoryEntrySummary.rating` → `DirectoryRating`, em `api/openapi.yaml`. Nada
abaixo é escolha de desenho:

| o que | o que o contrato diz |
|---|---|
| `average` | uma casa decimal, **arredondada pelo servidor**; a tela escreve com vírgula |
| `average` com `count = 0` | **nulo, nunca zero** — *"zero se lê como péssimo, e um local sem avaliação não é péssimo"* |
| o desfecho de tela | *"A tela escreve 'Ainda sem avaliacoes' e nao desenha estrela nenhuma"* |
| `rating` | **opcional**: o APK publicado não conhece o campo |
| `histogram` | existe, e é da **página do local** — não entra na listagem |

### São QUATRO estados, e não dois

A tela *os 4 estados do dado* no protótipo desenha os quatro no tamanho real:

1. **`count > 1`** — estrela, `4,8`, `128 avaliações`.
2. **`count = 1`** — `1 avaliação`, no singular (`quantidadeEmTexto` de
   `PontuacaoDoLocal` já resolve isso). Uma nota só já desenha estrela.
3. **`count = 0`, `average` nulo** — **"Ainda sem avaliações", sem estrela
   nenhuma e sem `0,0`.** Estado frequente, e não erro: as avaliações nasceram
   em 18/10/2026.
4. **`rating` ausente da resposta** — **nenhuma linha.** Mesma regra do bairro
   nulo e da distância nula, que o cartão já aplica.

**O 3 e o 4 não podem virar o mesmo desenho.** Ausente é *"esta resposta não
trouxe a agregação"*; zero é *"ninguém avaliou ainda"*. Colapsá-los faria o
cartão afirmar que um local não tem avaliação quando o que houve foi um APK
velho ou uma agregação que não veio.

## As duas variações

A **única** diferença entre elas é a forma da estrela. Posição, tinta, medida
(16 dp), texto e ordem são idênticos, para a escolha ser de uma coisa só.

| | A | B |
|---|---|---|
| estrela | **uma**, cheia | **cinco**, preenchidas por fração |
| linha | `★ 4,8 · 128 avaliações` | `★★★★★ 4,8 · 128 avaliações` |
| tinta da estrela | `primary` (carmim) | `primary`, vazia em `surface-sunken` |

**Onde a linha entra no cartão:** logo + nome → segmento → bairro → **avaliação**
→ `Ligar`. Ela é a última linha de texto e fica **dentro da mesma parada de
foco** do nome (o `MergeSemantics` que o cartão já tem), com o rótulo
`Média 4,8 de 5 estrelas, 128 avaliações`. O `Ligar` continua fora dela, porque
é controle com destino próprio.

### A recomendação: a variação A

Em vinte linhas, cinco estrelas repetidas cem vezes viram a textura mais forte
da tela e competem com o nome do estabelecimento, que é o que a pessoa está
procurando; uma estrela só diz a mesma nota com um quinto da tinta. Troque o
povoamento para *lista madura* no painel e compare — é para isso que o protótipo
existe.

**Medido no navegador**, para a escolha não depender só de gosto:

| | A | B |
|---|---|---|
| a linha quebra em 320 / 375 / 412 dp? | não | não |
| altura das 20 linhas a 412 dp | 5.604 px | **5.604 px** |

Então **a escolha entre A e B não é de espaço nem de rolagem — é só de quanta
tinta a estrela gasta**, e é por isso que ela se decide olhando a lista inteira e
não um cartão.

### O que a variação B tem contra ela, além do peso

A estrela vazia é `surface-sunken` contra `surface`: **1,06:1**, praticamente
invisível. B não se lê como *"4 de 5"* — lê-se como *"quatro estrelas e um
pedaço"*, e o denominador some. Na página do local isso custa pouco, porque a
média em corpo grande e o `de 5` estão ao lado; no cartão não há nenhum dos dois.

## A estrela é CARMIM e não dourada, e isso é medido

| tinta | contra `surface` | serve? |
|---|---|---|
| `action-fill` = `butter.400` (o dourado do sistema) | **1,76:1** | não |
| `butter.500` | 2,25:1 | não |
| `butter.600` | 3,2:1 | é **traço** em objeto gráfico por decisão de token, não preenchimento |
| **`primary` = `raspberry.700` (carmim)** | **7,84:1** | **sim** |

Dois motivos, e o primeiro é o que manda:

1. **A página do local já desenha estrela em `cores.primary`** (`_Estrelas` de
   `pagina_do_local.dart`), sobre a **mesma média**. Duas tintas para o mesmo
   dado seriam duas informações.
2. Uma estrela que carrega informação é objeto gráfico e precisa de 3:1 (WCAG
   2.1 SC 1.4.11). O dourado do sistema não chega lá, e `butter.400` é **só
   preenchimento** por decisão de token — ele não pode pintar nada que precise
   ser lido.

O preenchimento por fração usa o mesmo desenho do produto: uma fileira vazia por
baixo e uma fileira cheia por cima, recortada pela fração — meia estrela sem
precisar de um glifo de meia estrela, que não existe em toda medida.

## O que este protótipo NÃO mexeu, de propósito

- **A foto do lugar continua fora do cartão.** A faixa 16:9 mora só na página do
  local: vinte faixas numa página de listagem custariam **65,6 MiB** de imagem
  decodificada. A estrela é barata; a foto não.
- **Não há mapa** (decisão de 17/09).
- **A ordem e o aviso de "saiu por nome"** (`distance_available: false`) estão
  como estão hoje. São o ponto mais caro da tela e não foram redesenhados.
- **Busca, filtro e ordenação continuam no topo do corpo da tela**, nunca na
  barra — padrão de listagem do projeto.
- **Nenhum filtro por nota, nenhuma reordenação por nota.** Não foi pedido.

## O que NÃO foi medido

- **Escala de fonte do sistema.** A 200% a linha da avaliação pode quebrar e
  empurrar o cartão; o protótipo é HTML e não reproduz o `textScaler` do Flutter.
  Mede-se no app, não aqui.
- **Tema escuro.** O protótipo desenha só o tema claro. Calculei os dois pares sem
  desenhá-los: a estrela cheia vira `raspberry.300`, **8,59:1** sobre `bark.900`, e
  a vazia vira `bark.700` sobre `bark.900`, **1,23:1** — ou seja, o problema da
  variação B se repete no escuro. Número conferido na calculadora, desenho não
  conferido no aparelho.
- **Leitor de tela de verdade.** O rótulo acessível está no protótipo como texto,
  mas TalkBack não foi rodado.
- **Custo da agregação.** O contrato diz que ela é por **página** e não por
  entrada (um `GROUP BY` sobre os 20 `professional_id`), e a operação já carrega
  `x-effects: [expensive_query]`. Não foi medido tempo de resposta com o campo
  ligado.

## Arquivos

- `index.html` — o protótipo. Abra no navegador.
- Fonte dos valores: `design/tokens.json` (tema claro), o mesmo que
  `app/lib/theme/bichu_tokens.g.dart` emite. Nenhum valor foi inventado aqui.
