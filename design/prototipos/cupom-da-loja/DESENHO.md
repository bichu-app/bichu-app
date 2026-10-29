# Cupom da Loja, mais chamativo — desenho

**Bichu · 28/10/2026 · protótipo HTML no lugar do Figma**, por autorização do
cliente de 23/09/2026 (a conta não tem cota). Abra `index.html` no navegador: o
painel do topo troca a largura (320, 375, 412 dp), o tema (claro e escuro) e as
cinco telas.

**Design system do APP (o "Sério").** Os tokens vêm de `design/tokens.json` e de
`app/lib/theme/bichu_tokens.g.dart`, escritos por extenso no `:root` do
`index.html`. Não é a linguagem expressiva do site: aqui não há ilustração,
blob, manuscrito nem patinha.

## O pedido, e por que ele vem por protótipo

Ele pediu duas coisas no mesmo dia, e elas são de naturezas diferentes:

1. *"coloque a barra de busca acima do texto"* — **isso é código**, já medido e
   já no PR. O padrão de listagem em vigor diz que busca, filtro e ordenação
   ficam no topo do **corpo** da tela, e mover a busca para cima do convite
   **cumpre** o padrão em vez de abrir exceção a ele.
2. *"deixe o cupom de desconto bichu, na pagina da loja, mais chamativo"* —
   **isso é desenho**, e neste projeto componente passa pelo desenho antes do
   código. Daí este protótipo.

**As quatro telas desenham a tela já com a ordem nova** (busca em cima,
convite abaixo), porque é nela que o cupom vai morar.

**Nada aqui está implementado.** A escolha é dele, e o código do cupom só começa
depois dela.

## O que NENHUMA variação muda, e nenhuma ausência é esquecimento

- **A frase é dele, palavra por palavra**, inclusive `mantermos`
  (`VitrineDaLoja.conviteDaVitrine`, redação de 22/10). Microcopia é decisão
  dele;
- **o código é `bichu`, em minúscula**, exatamente como ele escreveu. Cupom é
  código, e código não se "arruma";
- **o código continua selecionável e sem botão de copiar.** Ele existe para ser
  digitado no site do parceiro, e um cupom que a pessoa não consegue copiar é um
  cupom que ela erra; o botão foi recusado em 22/10 porque copiar exigiria uma
  confirmação visível para não ser toque sem desfecho;
- **rótulo e código continuam em dois nós**, e não num `'Cupom: bichu'` montado:
  quem usa leitor de tela ouve o rótulo e depois o código;
- **não entra preço riscado, "de/por", desconto percentual nem "menor preço".**
  Nada disso foi pedido, e o critério 19 da BICHUS-185 os proíbe — comparação é
  afirmação sobre o mercado, e nós não medimos o mercado;
- **não há validade, não há por-parceiro e não há contador.** `coupon` e `cupom`
  não existem em `api/openapi.yaml`: o cupom é texto desta tela, e esta tela não
  tem como saber se ele ainda vale. Desenhar "válido até" seria afirmar o que
  não se sabe.

## As variações, e o número que separa uma da outra

**A dobra é o que decide este desenho, e não o gosto.** Em 22/10 a primeira
versão do bloco do cupom tinha moldura, fundo e 16 dp de recuo: ela custava
**~145 dp** no topo da vitrine, empurrou o título do primeiro cartão para fora
da área visível, e `loja_carrossel_nao_sai_test` reprovou tocando num título que
já não estava alcançável. Foi essa medição que produziu o texto corrido de hoje.

As alturas abaixo foram **medidas no navegador** (`getBoundingClientRect` mais a
margem de baixo), e não estimadas:

| variação | 375 e 412 dp | 320 dp | sobre hoje |
|---|---|---|---|
| **hoje** (referência) | 72 dp | 90 dp | — |
| **A** — no lugar, com contraste e tamanho | **88 dp** | 106 dp | **+16 dp** |
| **B** — bloco tracejado, uma linha | 100 dp | 118 dp | +28 dp |
| **B2** — bloco tracejado, código em linha própria | 133 dp | **151 dp** | +61 dp |

A 320 dp a frase passa de duas para três linhas, e é por isso que a coluna do
meio existe: **a B2 chega a 151 dp**, que é mais do que os 145 dp do desenho que
reprovou em 22/10. Ela está desenhada para a comparação ser vista, e não
imaginada.

### A — no lugar onde ele já está, com contraste e tamanho

O bloco não muda de lugar e o conjunto não ganha moldura. Muda só o par:

- o **rótulo** vira `overline` (12/16, peso 700, `+8%` de espacejamento, caixa
  alta) em `textSecondary`;
- o **código** vira `title` (18/24, peso 600) em `textPrimary`, dentro de uma
  pilula de `primaryContainer` com o ícone `local_activity`.

A pilula é o único elemento novo. Mais chamativo por **tamanho, peso e chão** —
e não por cor sozinha.

### B — bloco destacado com borda tracejada, estilo cupom

O cupom sai do texto corrido e ganha bloco próprio: chão de `primaryContainer` e
**borda tracejada** de 1,5 dp em `primary`. A forma de bilhete é o que diz
"cupom" sem precisar da palavra.

**A frase fica fora do bloco.** Dentro, ela o transformaria no parágrafo com
moldura que foi medido e recusado em 22/10 — e o bloco passaria dos 145 dp.

**1,5 dp e não 1 dp:** borda tracejada de 1 dp desaparece em tela de 3x.

### B2 — o mesmo bloco, com o código em linha própria

A mais chamativa das três e a mais cara: o código sobe para `titleLg` (22/28) e
ganha a linha inteira; o rótulo vira cabeçalho do bloco.

## O que eu recomendo, e por quê

**A variação A.** Ela compra o ganho de contraste e de tamanho por **+16 dp**,
enquanto a B custa +28 dp e a B2 +61 dp — e a dobra da Loja pertence aos
produtos, que é o que a medição de 22/10 provou custando uma reprovação.

**A escolha é dele, e a B não é um desenho de palha**: se o cupom vale mais que o
primeiro produto, ela está pronta e custa menos da metade do que custou o
desenho que reprovou. A B2 está no protótipo para ele ver o teto, não porque eu
a indique.

## Acessibilidade, medida nos dois temas

Contraste pelo WCAG 2.1 (pisos 4,5:1 para texto pequeno e 3:1 para não-texto):

| par | claro | escuro |
|---|---|---|
| código `textPrimary` sobre `primaryContainer` | 14,98:1 | 13,09:1 |
| rótulo `textSecondary` sobre `primaryContainer` | 7,83:1 | 7,61:1 |
| frase `textSecondary` sobre `surface` | 8,60:1 | 9,31:1 |
| borda tracejada `primary` sobre `primaryContainer` | 7,13:1 | 7,02:1 |

**Nenhuma variação distingue só por cor** (SC 1.4.1): a A muda tamanho e peso, e
a B e a B2 mudam a **forma** da borda. O tema escuro não é enfeite no painel:
`primaryContainer` vai de `#F9ECF0` para `#54031D`, e um cupom visto só no claro
não foi visto.

## O que este protótipo NÃO mediu, e fica anotado

- **Não rodou leitor de tela de verdade.** A ordem dos nós está desenhada para
  que o rótulo venha antes do código, mas quem confirma isso é TalkBack no
  aparelho, e isso é medição de implementação;
- **não há medição com fonte a 200%.** As três variações usam `flex-wrap`, e o
  `Flexible` do código já existe no produto de hoje, mas o estouro a 200% só se
  mede no widget montado;
- **não há número de quantas pessoas usam o cupom**, porque ele não existe no
  servidor: não há como saber se "mais chamativo" converteu. Se ele quiser essa
  resposta um dia, a pergunta não é de desenho — é de onde o cupom passa a ter
  dono no contrato.
