> **Status:** em revisão
> **Atualizado:** 2026-09-21

# Vetor da marca — derivado dos PNG, com autorização

Sete SVG, todos gerados por `derivar-vetor-do-png.py` a partir dos PNG que o
cliente entregou em 17/09/2026. **Nenhum deles é o arquivo do autor da marca.**

| Arquivo | O que é | Fonte |
|---|---|---|
| `simbolo.svg` | Símbolo isolado, cara híbrida de cão e gato | `referencia/03-icone-do-app.png` |
| `logotipo-horizontal.svg` | Símbolo + "Bichu" + descritor "a rede dos pets" | `referencia/02-logo-horizontal.png` |
| `lockup-sem-descritor.svg` | Símbolo + "Bichu", sem o descritor | idem, com o descritor cortado |
| `icone-pilar-comunidade.svg` | Três pessoas | `referencia/10-icones-pilares.png` |
| `icone-pilar-bairro.svg` | Casa | idem |
| `icone-pilar-proximidade.svg` | Três pétalas em Manteiga (a patinha aposentada) | idem |
| `icone-pilar-encontros.svg` | Árvore | idem |

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

## O que não está aqui, e não por esquecimento

**A variante reduzida do símbolo para abaixo de 48px.** Ela é desenho novo, não
simplificação automática: a régua da §3.10 mede o símbolo reprovando abaixo de
48px porque bigode, piscada e brilho fecham. Um traçador que "simplificasse"
isso estaria inventando marca. Favicon de 16 e 32px, ícone de notificação de
24dp e avatar pequeno continuam dependendo dessa variante, e ela é decisão do
dono da marca.

Conferido em tela: a 48px o símbolo ainda lê; a 24px os bigodes se fundem, que é
exatamente o que a régua já dizia.

## Versão clara, para fundo preenchido

A barra de topo ficou clara por decisão de 21/09/2026 (§21.1), então o lockup em
`primary` é o que ela precisa. Se algum dia uma superfície preenchida em Carmim
tiver de carregar a marca, **a versão clara é uma troca de atributo**: o `fill`
do grupo `tinta` passa de `primary` para `on-primary` (`#FAFAF8`). A Manteiga
não acompanha — a língua e os brilhos são sempre Manteiga, inclusive sobre
Carmim preenchido (§4 de `design/marca/README.md`).

## Como regerar

```
python3 design/marca/vetor/derivar-vetor-do-png.py
```

Requer Pillow, numpy e scikit-image, na máquina de quem desenha. Nada disso
entra no app.

O script **recusa em vez de adivinhar**: se não achar a coluna vazia que separa
o símbolo da palavra, ou a linha vazia que separa "Bichu" do descritor, ou se a
faixa encontrada não tiver a proporção de um descritor, ele para com o motivo.
A primeira versão cortava pelo maior intervalo entre inícios de contorno e
produziu um lockup escrito "a rede dos pet"; contorno solto não diz onde um
bloco começa, perfil de ocupação diz.
