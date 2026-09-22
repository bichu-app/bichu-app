> **Status:** em revisão
> **Atualizado:** 2026-09-22

# Marca Bichu — leitura da identidade entregue pelo cliente

Esta pasta guarda a identidade visual que o cliente entregou em **17/09/2026** e
a leitura dela para dentro do design system. **Ela substitui a identidade âmbar
e o logotipo de patinha.** A especificação completa está em
`docs/06-design-system.md`; aqui fica o que é específico da marca: o que cada
arquivo é, o que a folha declara, e o que eu mudei e por quê.

**Os arquivos de referência são insumo do cliente. Não edite nenhum deles.** Se
algum precisar de correção, a correção vira decisão registrada no design system
e um arquivo novo pedido ao cliente, nunca um PNG mexido por cima.

---

## 1. Os dez arquivos

| Arquivo | O que é | Serve de fonte para |
|---|---|---|
| `referencia/01-folha-identidade-visual.png` | A folha inteira: paleta, logotipos, ícone do app, tag, cartões, ícones de pilar | Tudo. É o documento-mãe. |
| `referencia/02-logo-horizontal.png` | Logotipo horizontal em alta, fundo transparente | §3.10 do design system |
| `referencia/03-icone-do-app.png` | Símbolo em Marfim sobre quadrado Framboesa, cantos arredondados | Ícone de loja, favicon |
| `referencia/04-tag-frente.png` | Tag física, frente: símbolo e "Bichu" em Framboesa sobre Manteiga | §10.3 |
| `referencia/05-tag-verso-qr.png` | Tag física, verso: QR estilizado. **Rotulado "QR não escaneável" pelo próprio cliente** | §17, pendência 0.1 |
| `referencia/06-card-pet-encontrado.png` | Cartão de comunicação com banda em Verde suave | §6.4.2 |
| `referencia/07-card-evento-no-bairro.png` | Cartão de comunicação com banda em Goiaba suave | §6.4.2 |
| `referencia/08-ilustracao-tres-pessoas.png` | Ilustração de três pessoas com pets, traço cheio, sem contorno | Estilo de ilustração |
| `referencia/09-card-frase-vizinhos.png` | Peça de campanha: frase manuscrita sobre mancha em Verde suave | §8.4 |
| `referencia/10-icones-pilares.png` | Quatro ícones: comunidade, casa, três pétalas em Manteiga, árvore | Ícones de pilar, e o destino da patinha |

## 2. A paleta declarada, e o que ela vira no sistema

| Nome do cliente | Hex | Papel na folha | Token primitivo | Papel semântico |
|---|---|---|---|---|
| ~~Framboesa~~ **Carmim** | ~~`#922C4A`~~ **`#9E0B3A`** | Principal — marca e texto | `raspberry/700` | `primary`, `focus-ring` |
| Manteiga | `#E7B93E` | Destaques, ações | `butter/400` | `action-fill` |
| Verde suave | `#A9CFBB` | Informação, comunidade | `sage/300` | `community-fill` |
| Goiaba suave | `#E8A7A0` | Apoio, ilustrações | `guava/300` | `accent-fill` |
| Marfim quente | `#FFF7E8` | Fundo | — | **só material de marca** (ver abaixo) |

Os hexes são **literais do cliente** e não podem ser ajustados. Os demais
degraus das rampas foram derivados deles em HSL (§6.2 do design system).

> **A tinta mudou em 21/09/2026, e isso é decisão do cliente, não ajuste.** Ele
> olhou as seis colunas do estudo da §20.9 e escolheu a direção A: a Framboesa
> `#922C4A` saiu e entrou o Carmim `#9E0B3A`, mesmo matiz com 62% mais croma e
> mais escuro. **O desenho não mudou**; mudou o valor. Os quatro preenchimentos
> (Manteiga, Verde suave, Goiaba suave, Marfim) e todas as regras abaixo
> continuam valendo. Os dez PNG de `referencia/` **continuam na Framboesa** e
> continuam sendo insumo do cliente: eles não se editam, e a leitura deles para
> dentro do sistema é que carrega a cor nova. Ver §21 do design system.

> **O Marfim saiu do app em 17/09/2026.** O cliente olhou o produto renderizado e
> achou "meio tosco, apagado"; escolheu o neutro `#FAFAF8` entre quatro opções.
> **O fundo do app é `#FAFAF8`; o fundo do cartaz, da tag, das peças e do e-mail
> continua o Marfim `#FFF7E8`.** Isso é decisão dele, tomada sabendo, e está no
> §6.8 do design system. Não "conserte" o app de volta para o Marfim achando que
> é erro.

Medido pela fórmula de luminância relativa da WCAG 2.1, contra os dois fundos:

| Cor | sobre o app `#FAFAF8` | sobre o Marfim `#FFF7E8` | Pode ser texto? |
|---|---:|---:|---|
| **Carmim** (desde 21/09) | **7.84:1** | 7.70:1 | sim, inclusive em superfície crítica (AAA) |
| Framboesa (até 21/09) | 7.49:1 | 7.36:1 | sim — saiu por decisão de cor, não por contraste |
| Goiaba suave | 1.92:1 | 1.88:1 | **não** |
| Manteiga | 1.76:1 | 1.73:1 | **não** |
| Verde suave | 1.63:1 | 1.60:1 | **não** |

## 3. As quatro regras de uso que saem daí

1. **A tinta da marca escreve. As outras três preenchem.** Nenhuma das três pode
   pintar texto ou ícone sobre superfície clara, em lugar nenhum. Os quatro
   papéis afetados estão declarados em `$extensions.bichu.nunca-texto` de
   `design/tokens.json` e recebem nome feio no Dart.

2. **Sobre banda colorida, a tinta é o neutro escuro `#1C1B19`, não a tinta da
   marca.** A arte de referência escreve os títulos dos cartões em
   Framboesa, e os dois reprovam: "Pet encontrado" em 4.60:1 e "Evento no
   bairro" em 3.90:1. A correção mantém a cor da banda e troca a tinta, o que
   leva os dois para 10.10:1 e 8.58:1. O raciocínio completo está em §6.4.2 do
   design system.

3. **O símbolo pode ser a tinta da marca sobre banda colorida.** Com o Carmim
   os três pares subiram: 4.45:1 sobre Manteiga, 4.81:1 sobre Verde suave e
   4.08:1 sobre Goiaba suave, contra 4.25, 4.60 e 3.90 da Framboesa. Todos
   passam o piso de 3:1 do SC 1.4.11 para objeto gráfico. É por isso que a tag
   sobre Manteiga está correta como desenho, e o "Bichu" dela é vetor, não
   texto vivo.

4. **Vermelho é território de marca nesta identidade, então o erro não é
   vermelho-vinho.** Goiaba suave está em matiz 6 e o Carmim em 341. A cor de
   erro foi para a Brasa, matiz 16, e vem sempre com ícone e palavra. §6.4.1.

## 4. O logotipo

Cara híbrida de cão e gato: orelha caída à esquerda, orelha pontuda à direita,
olho piscando, focinho, língua de fora em Manteiga, três bigodes de cada lado e
dois traços de brilho em Manteiga na diagonal superior direita. Traço de peso
único com terminações arredondadas. Ao lado, "Bichu" em grotesca arredondada
pesada e, abaixo, o descritor "a rede dos pets".

- O logotipo é **vetor**. Nenhuma tela compõe a palavra "Bichu" digitando em
  fonte. Ver §8.4 do design system para o motivo.
  **Desde 22/09/2026 isso é portão, não lembrança.** Duas telas quebravam a
  regra por falta de vetor — a de abertura, com `Text('Bichu')` em
  `displaySmall`, e a barra de topo da Início deslogada. As duas passaram a
  desenhar (`app/lib/widgets/marca.dart`), e
  `app/test/marca/logotipo_em_vetor_test.dart` reprova se alguma voltar a
  compor: ele mantém o inventário de toda ocorrência do literal `'Bichu'` em
  `app/lib/` e mede o que a tela **renderiza**, não o que o arquivo contém.
  O nome do produto dentro de uma frase continua legítimo; o que a regra proíbe
  é a palavra sozinha fazendo as vezes de marca.
- A língua e os traços de brilho são sempre Manteiga, inclusive sobre Framboesa
  preenchida. Em versão de uma cor, eles somem em vez de mudar de cor.
- **A patinha não é mais a marca.** Ela sobrevive como o grafismo de três
  pétalas em Manteiga da fileira de ícones de pilar
  (`referencia/10-icones-pilares.png`). Não use a patinha como símbolo, favicon,
  ícone do app nem marcador de posição de foto.

## 5. Ilustração

Traço cheio, sem contorno, formas geométricas simplificadas, sem gradiente e
sem sombra. Cabelo e roupas usam a paleta ampliada da própria ilustração, que é
mais larga que a paleta de interface: isso é aceitável **dentro da ilustração**
e não autoriza cor nova em componente.

**Ilustração nunca carrega texto por cima.** Se uma peça precisa de frase sobre
imagem, a frase vai numa banda sólida abaixo, com a tinta neutra, como nos dois
cartões de referência.

## 6. O que está pendente nesta pasta

Quatro itens, todos registrados em §17 do design system. **Dois já caíram**, e
ficam riscados aqui em vez de apagados: o que foi decidido e por quê é a parte
que mais se perde.

1. **O QR do verso da tag não escaneia**, e a própria folha admite isso. Antes
   de virar arte final, precisa de QR real com correção de erro nível H,
   impresso e lido em pelo menos três aparelhos.
2. ~~**A prova de redução a 24px é do cliente e não foi remedida aqui.**~~
   **Remedida em 22/09/2026**, no rasterizador do próprio app e não a olho. O
   enunciado da folha estava certo na causa: bigodes e olho piscando são o que
   fecha primeiro. Só que a leitura é outra — **o símbolo completo não serve
   24px de jeito nenhum**, e quem serve é a variante reduzida do item 4, que
   existe justamente porque aqueles detalhes saíram.
3. ~~**Não há SVG.**~~ **Resolvido em 21/09/2026, com ressalva que precisa
   viajar junto.** O cliente autorizou derivar o vetor dos PNG
   (*"derivar o vetor a partir do png"*), e `vetor/` agora tem sete SVG:
   logotipo completo, lockup sem descritor, símbolo e os quatro ícones de pilar,
   todos na cor nova e gerados por `vetor/derivar-vetor-do-png.py`.

   **O que continua pendente com o cliente**, e não é a mesma coisa: o pacote
   vetorial do autor da marca. O derivado garante silhueta, proporção e paleta
   acima de 48px; **não** garante que as curvas sejam as do autor, que o
   lettering de "Bichu" seja o mesmo desenho, nem fidelidade de impressão em
   tiragem. Ver `vetor/README.md`.

4. ~~**A variante reduzida abaixo de 48px não saiu.**~~ **Saiu em
   22/09/2026, e ela não foi desenho novo: foi subtração.** Com as curvas na
   mão, apagar a piscada, os três bigodes e os dois brilhos — que é exatamente
   o que a §3.10 já mandava — é uma operação exata, e o que sobra continua
   sendo o desenho do autor. `vetor/simbolo-reduzido.svg`.

   **Onde ela para, medido no rasterizador do app e não a olho:** o desenho
   segura de **24px** para cima e se perde em 16px. O favicon de 16px é
   servido por `vetor/selo-reduzido.svg`, que é a variante vazada em claro
   sobre o quadrado Carmim — a mesma construção do ícone do app da folha do
   cliente. Em 16px quem carrega a marca é o quadrado, e isso está dito em vez
   de disfarçado. A tabela de medidas está em `vetor/README.md`.
