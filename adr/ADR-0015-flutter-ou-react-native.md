# ADR-0015: Cliente móvel — Flutter ou React Native

**Status:** proposto
**Data:** 2026-09-17

## Contexto

Flutter foi definido no primeiro dia como premissa, não como decisão
fundamentada. O cliente reabriu a pergunta e ela é legítima: **nada foi
construído, o repositório está vazio, e este é o momento mais barato que a troca
vai ter.** Um ADR que não compare agora estará defendendo uma escolha que
ninguém fez.

O critério deste documento é **este produto**, não popularidade. Não uso número
de estrelas, vaga de emprego nem tendência: as exigências que decidem já estão
escritas nos documentos deste projeto, e é contra elas que comparo.

## 1. O que os dois fazem igual — e é quase tudo

| Exigência do MVP | Flutter | React Native | Empate? |
|---|---|---|---|
| Câmera e leitura de QR | `mobile_scanner` | `vision-camera` + leitor de código | **sim** |
| Push em segundo plano com FCM | `firebase_messaging` | `@react-native-firebase/messaging` | **sim**, os dois maduros |
| Geolocalização e as nuances de permissão | `geolocator` + `permission_handler` | `react-native-permissions` + geolocalização | **sim** |
| Armazenamento seguro (Keychain e Keystore) | `flutter_secure_storage` | `react-native-keychain` | **sim** |
| App Links e Universal Links | manifesto e entitlement, mais um manipulador | idem | **sim** — é configuração nativa nos dois, não recurso de framework |
| Foto: captura, redimensionamento e envio direto ao armazenamento | `image_picker` + compressão | `image-picker` + redimensionador | **sim** |
| Google Maps | `google_maps_flutter`, **mantido pelo próprio time do Flutter** | `react-native-maps`, mantido pela comunidade | **não**, vantagem pequena do Flutter |

**Conclusão do item: é empate no que o MVP exige.** Nenhum recurso do produto
existe em um e falta no outro. Quem decidir por capacidade técnica bruta vai
empatar e ter que decidir por outra coisa — e é isso que os itens seguintes
fazem.

## 2. O argumento mais forte a favor do React Native, avaliado de verdade

**Uma linguagem só na pilha.** O backend é TypeScript; com React Native o app
também seria. Gerar tipos do contrato uma vez e usar dos dois lados, compartilhar
validação, uma cadeia de ferramentas só. É o melhor argumento que existe contra o
Flutter neste projeto, e por isso merece ser avaliado em vez de descartado.

**Ele vale menos do que parece aqui, e o motivo é que duas decisões anteriores já
capturaram quase todo o benefício:**

1. **Contrato-primeiro com cliente gerado.** `api/openapi.yaml` está escrito,
   versionado e tem gerador dos dois lados: `openapi-typescript` para TS,
   `openapi-generator` ou `swagger_dart_code_generator` para Dart. Em ambos os
   casos os tipos do cliente **não são escritos à mão**. O que o React Native
   acrescenta é que o artefato gerado seria literalmente o mesmo, e não um
   equivalente — ganho real, e pequeno.
2. **Nenhuma regra de negócio vive no cliente.** A seção "a fronteira entre
   cliente e servidor" é explícita: o cliente valida formato por conveniência, e
   a autoridade é sempre do servidor. E a validação compartilhada, que seria o
   segundo ganho, **é exatamente o que eu já proibi de duplicar**: a regra é
   derivar de uma fonte só, o schema da spec. Não há lógica de domínio no app
   para compartilhar, porque o desenho a tirou de lá de propósito.

**O que sobra de benefício real, e eu não vou fingir que é zero:**

- **Uma cadeia de ferramentas a menos na esteira.** Com Flutter, o pipeline pina
  Node **e** Dart. Custo real, medido em horas de configuração, não em dias.
- **Troca de contexto para quem escreve.** Um squad que escreve TypeScript no
  backend paga algum custo ao alternar para os idiomas de Dart. É custo difuso,
  difícil de medir, e honesto de reconhecer.
- **Atualização por ar (OTA).** React Native permite publicar correção de código
  JavaScript sem passar pela loja; Flutter não, salvo produto comercial de
  terceiro. **Hoje isso vale zero** — não há publicação em loja até 30/09 — mas
  passa a valer no dia seguinte ao lançamento, e é a vantagem do React Native com
  maior vida útil.

**Veredito do item: é vantagem do React Native, é verdadeira, e é menor do que o
enunciado sugere — porque contrato-primeiro e "nenhuma regra no cliente" já
entregaram a maior parte do que ela prometia.**

## 3. O SDK do validador facial — verificado, fornecedor por fornecedor

Este era o ponto que poderia decidir, e eu verifiquei em vez de opinar.
**O resultado inverte a hipótese.**

Antes do resultado, uma delimitação que muda o peso: **a validação facial com
prova de vida é o degrau D4 da escada de confiança em `docs/01-visao-produto.md`,
e ela não está no MVP** — nada do reencontro passa de D2, e "contratar fornecedor
de facial" é decisão pendente, não requisito do dia 30. Isto é risco de roteiro,
não bloqueio de entrega.

| Fornecedor | Embrulho oficial Flutter | Embrulho oficial React Native | Situação |
|---|---|---|---|
| **Unico** (o maior do mercado brasileiro) | **sim** — SDK Flutter documentado no portal de desenvolvedores, pacote `unico_check` publicado, repositório na organização `unico-labs` | **não** — só projetos de comunidade e artigos ensinando a construir a ponte nativa à mão; relatos explícitos de ausência de documentação oficial | **favorece Flutter** |
| **CAF** (Combate à Fraude) | **sim** — `docs.caf.io/caf-sdk/flutter`, pacote `caf_sdk` publicado, exemplos na organização oficial | **sim** — `docs.caf.io/caf-sdk/react-native` | **neutro** |
| **idwall** | **a confirmar** — encontrei SDK nativo de Android e iOS; não encontrei embrulho oficial para nenhum dos dois, e o material de React Native que existe é artigo de comunidade sobre construir ponte | **a confirmar** | **neutro, com dúvida a resolver na contratação** |
| **Serpro Datavalid** (federal) | não se aplica | não se aplica | **neutro**: é **API**, com captura sob controle do cliente. Um componente embutível existe, mas o caminho de API dispensa SDK e funciona igual nos dois |

**Conclusão, e ela é o oposto do que se temia:** entre os fornecedores
verificados, **não encontrei nenhum com embrulho oficial de React Native e sem
Flutter.** Encontrei o contrário — o maior deles tem Flutter oficial e React
Native apenas por ponte de comunidade. O critério que poderia derrubar o Flutter
**o sustenta**, de forma fraca mas verificada.

**O que fica em aberto, e é o item que eu levaria à mesa de contratação:**
confirmar o embrulho do idwall antes de escolher fornecedor, e preferir, em
igualdade de condições, quem publica SDK para o framework que a gente usa.
Manter ponte nativa à mão para um SDK de biometria que atualiza sozinho é custo
recorrente, e é o tipo de custo que ninguém coloca na proposta.

## 4. Talento, com o peso honesto de hoje

**Hoje vale zero.** O time são agentes; o tamanho do mercado de trabalho não
muda nada sobre o que será entregue em 30/09.

**Passa a valer no dia da passagem de bastão** — quando um humano, uma agência ou
um contratado assumir a manutenção. Aí o argumento é real, e no Brasil ele pende
levemente para React Native pela oferta maior, com Flutter também bem
representado. **Não é critério de decisão agora; é critério de revisão na
primeira contratação**, e registro assim para que ninguém o use com peso de hoje
nem o esqueça amanhã.

## 5. O custo real de trocar hoje, em dias

**O que se perde**, e é trabalho de documento, não código jogado fora:

- o mapa de **22 dos 30 componentes** para Material 3;
- a `ThemeExtension`, que é mecanismo específico do Flutter;
- o teste de contraste que monta widget em Dart e mede o que foi de fato
  renderizado;
- e uma decisão nova que hoje não existe: **qual biblioteca de componentes usar
  no React Native**, já que Material 3 não é nativo lá.

**Estimativa: 2 a 4 dias de retrabalho de design system**, incluindo a decisão da
biblioteca. São **15% a 30% dos 13 dias restantes**, gastos sem que o tutor ou o
achador ganhem nada.

**O que sobrevive** porque é token e não implementação: paleta, escala
tipográfica, espaçamento, razões de contraste exigidas, inventário de telas,
fluxos, microcópia e critérios de acessibilidade. Tudo isso é independente de
framework e continua valendo.

**E confirmo o que foi afirmado ao cliente: backend, contrato de API, modelo de
dados, rota pública, segurança e infraestrutura não são tocados.** Não por sorte:
o app conversa exclusivamente pelo contrato, a rota pública do achador é HTML
renderizado no servidor **sem framework nenhum**, e a regra de negócio vive toda
no servidor. Foram decisões tomadas para que o cliente móvel fosse substituível,
e é agora que elas pagam.

Os dois fatos convivem e os dois são verdade: **é o momento mais barato que a
troca vai ter, e ainda assim ela custa um quarto do prazo restante.**

## 6. O que pesa a favor do Flutter, para o documento não virar advocacia

- **Renderização própria.** O Flutter desenha os próprios pixels em vez de
  delegar a componentes nativos. Isso importa aqui mais do que na média, porque
  dois requisitos deste produto são de pixel: **contraste AAA de 7:1 para leitura
  sob sol** e **alvo de toque de 64 dp**, ambos especificados para o achador na
  rua, com uma mão, com o animal se mexendo. Com renderização própria, o que foi
  especificado é o que aparece nos dois sistemas; com componentes nativos, há
  variação de plataforma e de versão a conferir.
- **Material 3 é nativo**, e o design system já foi escrito em cima dele.
- **O teste de contraste renderizado** monta widget em Dart e mede o resultado
  real. Ele existe porque contraste conferido em ferramenta de design não prova o
  que a tela mostra — e essa verificação é mais difícil de reproduzir com
  fidelidade em React Native.
- **`google_maps_flutter` é de primeira parte**, mantido pelo time do Flutter.

## Decisão

**Manter Flutter.** Quatro razões, em ordem de peso:

1. **O critério que poderia derrubá-lo o sustenta.** Entre os fornecedores de
   facial verificados, nenhum tem React Native oficial sem Flutter; o maior tem
   Flutter oficial e React Native por ponte de comunidade.
2. **O melhor argumento do React Native já foi capturado por outras decisões.**
   Contrato-primeiro com cliente gerado e nenhuma regra de negócio no cliente
   esvaziaram a maior parte do ganho de "uma linguagem só".
3. **Dois requisitos do produto são de pixel**, e renderização própria os entrega
   de forma determinística.
4. **Trocar custa 2 a 4 dos 13 dias restantes** por um benefício majoritariamente
   ergonômico.

### O que derrubaria esta escolha

Escrevo para que a revisão seja possível sem refazer a análise:

| Se acontecer | Então |
|---|---|
| O fornecedor de facial efetivamente contratado tiver SDK oficial de React Native e **não** de Flutter, **e** a facial virar requisito firme | reabrir. Manter ponte nativa à mão para SDK de biometria é custo recorrente, e esse é o cenário em que ele passa a pesar mais que tudo acima |
| Surgir necessidade de um **aplicativo web** que compartilhe código com o móvel | reabrir — mas note que hoje isso não existe por decisão: a superfície web é HTML renderizado no servidor, de propósito |
| A manutenção passar para humanos e a contratação se mostrar difícil | reavaliar na passagem de bastão, não antes |

### A tabela para outro critério levar a outra conclusão

| Se o critério que mais pesa for… | A escolha é | O que custa |
|---|---|---|
| SDK de biometria com suporte oficial do fornecedor provável | **Flutter** | nada hoje; confirmar idwall na contratação |
| Uma linguagem só e uma esteira só | **React Native** | 2 a 4 dias agora, e um benefício já em boa parte capturado pelo contrato |
| Fidelidade de pixel sob sol e alvo de toque | **Flutter** | nada |
| Publicar correção sem passar pela loja, depois do lançamento | **React Native** | 2 a 4 dias agora por um ganho que só começa depois de 30/09 |
| Contratação futura de gente no Brasil | leve vantagem do **React Native** | 2 a 4 dias hoje por um benefício de data desconhecida |
| Prazo | **Flutter**, por não mexer | — |

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| React Native | uma linguagem, atualização por ar, mercado maior no Brasil | 2 a 4 dias de retrabalho; ponte de comunidade no SDK do maior fornecedor de facial; Material 3 não nativo | o benefício principal já foi capturado por decisões anteriores |
| Nativo separado, Kotlin e Swift | teto de qualidade mais alto | duas bases para escrever em 13 dias | inviável no prazo |
| Web app instalável, sem app nativo | uma superfície só | sem push confiável no iOS, sem App Links, sem leitura de QR com a qualidade necessária | mata o fluxo do alerta, que é o produto |
| Decidir depois | adia | o design system e o app são a próxima frente a começar | adiar aqui é escolher Flutter sem dizer |

## Consequências

Fica mais fácil: começar, porque nada muda e a próxima frente está destravada.

Fica mais difícil: não há caminho de atualização sem loja depois do lançamento,
e isso precisa entrar no plano de publicação como restrição conhecida, e não
como surpresa no primeiro defeito grave em produção.

Passa a ser irreversível: nada, hoje. **Mas a janela fecha rápido:** este ADR
vale enquanto o repositório estiver vazio. A cada tela escrita, o custo da troca
sobe, e em duas semanas ele deixa de ser 2 a 4 dias e passa a ser reescrever o
aplicativo.
