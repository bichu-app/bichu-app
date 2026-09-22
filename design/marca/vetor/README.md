> **Status:** em revisão
> **Atualizado:** 2026-09-22

# Vetor da marca — derivado dos PNG, com autorização

**Nove SVG.** Sete gerados por `derivar-vetor-do-png.py` a partir dos PNG que o
cliente entregou em 17/09/2026, e dois gerados por
`derivar-variante-reduzida.py` a partir do `simbolo.svg` daqueles sete.
**Nenhum deles é o arquivo do autor da marca.**

| Arquivo | O que é | Fonte |
|---|---|---|
| `simbolo.svg` | Símbolo isolado, cara híbrida de cão e gato | `referencia/03-icone-do-app.png` |
| `logotipo-horizontal.svg` | Símbolo + "Bichu" + descritor "a rede dos pets" | `referencia/02-logo-horizontal.png` |
| `lockup-sem-descritor.svg` | Símbolo + "Bichu", sem o descritor | idem, com o descritor cortado |
| `icone-pilar-comunidade.svg` | Três pessoas | `referencia/10-icones-pilares.png` |
| `icone-pilar-bairro.svg` | Casa | idem |
| `icone-pilar-proximidade.svg` | Três pétalas em Manteiga (a patinha aposentada) | idem |
| `icone-pilar-encontros.svg` | Árvore | idem |
| `simbolo-reduzido.svg` | A variante abaixo de 48 px: o símbolo sem os bigodes, sem a piscada e sem os brilhos | `simbolo.svg` |
| `selo-reduzido.svg` | A variante reduzida vazada em claro sobre o quadrado Carmim | `simbolo-reduzido.svg` |

## Por que estes arquivos existem

A pendência 3 de `design/marca/README.md` pedia o pacote vetorial ao cliente, e
a §20.8 do design system recomendava esperar: vetorizar uma marca que pode ser
substituída é desenhar duas vezes.

Em 21/09/2026 as duas condições que faltavam foram satisfeitas no mesmo dia. A
identidade fechou (§21, Carmim `#9E0B3A`) e o cliente autorizou o plano B com
estas palavras: **"derivar o vetor a partir do png"**.

## O que estes arquivos garantem

- Silhueta, proporção e paleta fiéis ao raster **acima de 48px**.
- Curvas convertidas, sem fonte viva, `viewBox` correto, camadas nomeadas
  (`tinta`, `manteiga`, `verde`) e `fill-rule="evenodd"`.
- A cor de saída vem de `design/tokens.json`. Trocar a semente e rodar o script
  de novo basta: nenhum hexadecimal de marca está escrito à mão aqui.

## O que eles NÃO garantem

Esta lista não mudou desde a §20.8 e continua valendo palavra por palavra.

- **As curvas não são as que o autor da marca desenhou.** Elas acompanham a
  suavização de borda do raster, não a intenção do traço.
- **O lettering de "Bichu" é aproximação.** O PNG não diz qual é a fonte nem se
  ela foi modificada, e lettering errado é o item de marca que mais se nota.
- **Fidelidade de impressão.** Vetor derivado de raster carrega o erro de
  interpretação do raster, e em tiragem isso é caro de desfazer. Antes de
  qualquer tiragem, peça o pacote do autor.

## Quem usa cada um, e quem não usa

A pergunta é da **BICHUS-196**: até 22/09/2026 os sete existiam no disco sem
portão nenhum e sem ninguém os referenciar. Qualquer um deles podia ser
apagado, corrompido ou repintado com a esteira inteira verde. Agora os nove
passam por `app/test/marca/vetor_da_marca_test.dart`, e **três entram no app de
verdade**.

| Arquivo | Entra no app? | Por quê |
|---|---|---|
| `simbolo.svg` | **sim** | `MarcaSimbolo`, de 48 px para cima. É também a fonte da variante reduzida. |
| `simbolo-reduzido.svg` | **sim** | `MarcaSimbolo`, de 24 a 48 px. É o que serve o ícone de notificação de 24 dp e o favicon de 32 px. |
| `lockup-sem-descritor.svg` | **sim** | Tela de abertura e barra de topo da Início deslogada. O lockup com descritor tem piso de 160 px de largura e não cabe numa barra (§21.2). |
| `selo-reduzido.svg` | não | Insumo de favicon de 16 px e de ícone nativo. Dentro do app ele seria preenchimento de marca como fundo, que o §6.1.6 proíbe fora de ação e selo. |
| `logotipo-horizontal.svg` | não | Insumo de e-mail, cartaz e impressão. Piso de 160 px: não existe superfície no app com esse espaço para a marca, e espremer poria o descritor abaixo do piso. |
| os quatro `icone-pilar-*.svg` | não | Insumo de campanha e da home de visitante da fatia C, bloqueada por ADR. Não há tela no MVP que mostre a fileira de pilares. |

O caminho para dentro do app é o mesmo dos tokens: `app/tool/gen_marca.dart` lê
os SVG da raiz e escreve `app/lib/theme/marca_vetor.g.dart`. Asset copiado para
dentro de `app/` seria a segunda fonte da verdade que o §18.2.2 existe para
impedir, e link simbólico já deixou uma suíte inteira invisível neste
repositório.

**Insumo sem uso no app continua coberto.** O portão lê a pasta inteira e
reprova quando um arquivo some, quando aparece um que ninguém declarou, quando
uma cor deixa de ser primitivo de `design/tokens.json`, quando entra `<text>`,
`<tspan>` ou `font-family`, e quando o `d` usa um comando que os derivadores
não emitem.

## A variante abaixo de 48 px, e onde ela para

Ela **saiu em 22/09/2026**, e não é conversão automática nem desenho novo: é
subtração. A §3.10 do design system já tinha escrito qual era a variante — "o
mesmo desenho sem bigodes, sem o piscar e sem o brilho, guardando as duas
orelhas e o contorno da cabeça" — e o que faltava era o vetor, porque apagar
bigode de um PNG é repintar, e repintar a marca do cliente é redesenhá-la. Com
as curvas na mão, apagar um subcaminho inteiro é exato: **as seis curvas saem e
nenhuma entra**. O portão compara curva por curva com `simbolo.svg` e reprova se
alguma da reduzida não existir lá.

### O que foi medido, e com que régua

A medida está em `app/test/marca/variante_reduzida_test.dart` e roda no
**rasterizador de verdade** (o mesmo `Canvas` do app, Flutter 3.47.4, que é o
que a esteira pina), não num verificador de arquivo. Ela conta **componentes
conexos de tinta** na imagem: em 256 px esse número é o desenho inteiro, e num
tamanho pequeno número menor quer dizer que traços se encostaram e número maior
quer dizer que um traço se partiu.

| Variante | 16 px | 24 px | 32 px | 48 px | 64 px | 256 px |
|---|---:|---:|---:|---:|---:|---:|
| `simbolo.svg` | 13 | 11 | 10 | 10 | **11** | 11 |
| `simbolo-reduzido.svg` | 7 | **5** | **5** | **5** | **5** | 5 |

Lidas assim: **a variante reduzida segura o desenho de 24 px para cima e o perde
em 16 px.** O piso dela é 24 px, e ele está escrito em
`app/tool/gen_marca.dart` — `MarcaSimbolo` troca de variante por esse número, de
modo que a régua é código e não lembrança.

**Duas ressalvas que precisam viajar junto.**

1. **A medida tem um parâmetro livre, e ele está declarado.** "Tinta" é o pixel
   que andou pelo menos 30% do fundo para o Carmim. Os números mudam com esse
   valor: a 50% a reduzida só segura de 32 px para cima. Quem discordar do
   critério discute o critério.
2. **Nada aqui prova que uma pessoa reconhece a marca.** Contagem de traços diz
   que o desenho não fundiu nem se despedaçou; não diz que o que sobrou ainda é
   a cara do Bichu. Isso é olho, e continua sendo de quem desenha.

### O 16 px não é servido pelo desenho, e sim pelo selo

Medido e dito com todas as letras: **em 16 px nem o símbolo nem a variante
reduzida seguram o desenho.** Traço de contorno não sobrevive a 16 px, e
engordar o traço (o eixo *optical size* dos Material Symbols) foi testado e
fecha o focinho antes de resolver a orelha.

A saída é a construção que a própria folha do cliente já usa no ícone do app
(`referencia/03-icone-do-app.png`): **`selo-reduzido.svg`**, com a variante
reduzida vazada em `neutral.25` sobre o quadrado `raspberry.700` de cantos
arredondados. Em 16 px quem carrega a marca é o quadrado, e não o desenho — que
é o que um favicon de 16 px faz em qualquer sistema honesto. De 24 px para cima
o desenho dentro dele volta a ler.

**O que ainda não existe, e não é desta entrega:** os PNG nativos que essas
variantes alimentam — `res/drawable-*/` do ícone de notificação do Android e os
`.ico`/`.png` do favicon da superfície web. São arte assada por gerador, e o
gerador de arte tem dono. O que esta entrega fecha é o **vetor** que eles
exigiam, mais o consumo direto em Flutter, que dispensa PNG dentro do app.

### A divergência com a §3.10 que ficou registrada em vez de arredondada

A §3.10 diz "48 px passa" para o símbolo completo, e aquele veredito foi **de
olho**, num rasterizador local e no do Figma. Por este critério mecânico, em
48 px dois traços já se encostam (11 caem para 10) e a contagem só volta a
bater em 64 px.

**Não mexi na §3.10.** O número de lá é decisão registrada de quem desenhou, e
divergência de critério se resolve por conversa, não por um teste reescrevendo
um documento. O caso `o simbolo completo so guarda o desenho a partir de 64px`
existe para que a divergência não desapareça: no dia em que alguém redesenhar e
48 px passar a bater, ele reprova e obriga a atualizar os dois.

## Versão clara, para fundo preenchido

A barra de topo ficou clara por decisão de 21/09/2026 (§21.1), então o lockup em
`primary` é o que ela precisa. Se algum dia uma superfície preenchida em Carmim
tiver de carregar a marca, **a versão clara é uma troca de atributo**: o `fill`
do grupo `tinta` passa de `primary` para `on-primary` (`#FAFAF8`). A Manteiga
não acompanha — a língua e os brilhos são sempre Manteiga, inclusive sobre
Carmim preenchido (§4 de `design/marca/README.md`).

## Como regerar

```
python3 design/marca/vetor/derivar-vetor-do-png.py      # os sete, a partir dos PNG
python3 design/marca/vetor/derivar-variante-reduzida.py # os dois, a partir do vetor
cd app && dart run tool/gen_marca.dart                  # o Dart que o app consome
```

O primeiro requer Pillow, numpy e scikit-image, na máquina de quem desenha. O
segundo é **só biblioteca padrão**, de propósito: ele é o que refaz a variante
da marca, e ferramenta que precisa de ambiente montado é ferramenta que ninguém
roda. Nada disso entra no app.

`derivar-variante-reduzida.py` também **recusa em vez de adivinhar**, e de um
jeito mais duro que o primeiro: ele carrega a impressão digital dos doze
subcaminhos de `simbolo.svg` — nome e caixa delimitadora — e para se o arquivo
de entrada não bater exatamente. Símbolo novo exige revisão humana daquela
tabela. Um traçador que "reconhecesse bigode" estaria inventando marca no dia em
que errasse.

O script **recusa em vez de adivinhar**: se não achar a coluna vazia que separa
o símbolo da palavra, ou a linha vazia que separa "Bichu" do descritor, ou se a
faixa encontrada não tiver a proporção de um descritor, ele para com o motivo.
A primeira versão cortava pelo maior intervalo entre inícios de contorno e
produziu um lockup escrito "a rede dos pet"; contorno solto não diz onde um
bloco começa, perfil de ocupação diz.
