// **A VARREDURA DO VOCABULARIO DO PRODUTO, numa fonte so.**
//
// As tres palavras que o **texto de usuario** de `app/lib` nao pode mais
// conter, e a varredura que as cobra.
//
// ---------------------------------------------------------------------------
// POR QUE ELA EXISTE
// ---------------------------------------------------------------------------
// Em 22/10/2026 o cliente pediu TRES substituicoes de vocabulario no app:
//
//   - `bicho`/`bichos`   -> `pet`/`pets`;
//   - `cao`/`caes`       -> `cachorro`/`cachorros`;
//   - `pessoa`/`pessoas` -> `usuario`/`usuarios`.
//
// Substituicao de texto sem portao **volta na primeira edicao**. No mesmo dia
// o produto tinha cinco redacoes de um rotulo de selo e tres da mesma frase de
// abrir mapa, as duas por falta de alguem cobrando. Esta e a cobranca das tres
// palavras.
//
// ---------------------------------------------------------------------------
// ELA ESTENDE O MOTOR QUE JA EXISTE -- NAO E UM SEGUNDO
// ---------------------------------------------------------------------------
// [semProsaDeDart], [dartsDeLib] e [caminhoRelativoNoPacote] vem de
// `test/dispositivo/literais_de_abrir_mapa.dart`, que ja varre `app/lib`
// apagando comentario. Escrever uma segunda caminhada daria duas definicoes de
// "o que e superficie", e a segunda envelheceria calada.
//
// ---------------------------------------------------------------------------
// ELA VARRE **LITERAL DE CADEIA**, E NAO CODIGO SOLTO
// ---------------------------------------------------------------------------
// Esta e a diferenca em relacao a varredura de abrir mapa, e ela e obrigatoria
// aqui: as agulhas sao PALAVRAS, nao frases. `\bpessoa\b` casa com
// `widget.pessoa.nomeParaLer` -- o ponto e fronteira de palavra --, e um portao
// que reprovasse ali cobraria renomear campo, que e exatamente o que o pedido
// PROIBE. Entao:
//
//   1. a prosa sai ([semProsaDeDart]);
//   2. linha de `import`/`export`/`part` sai (caminho de arquivo nao e texto);
//   3. so o conteudo dos literais entra;
//   4. **a interpolacao sai de dentro do literal** (`$x` e `${x.y}`): ela e
//      codigo, e `'${widget.pessoa.nomeParaLer}'` nao escreve "pessoa" para
//      ninguem ler.
//
// ---------------------------------------------------------------------------
// AS AGULHAS SAO POR PALAVRA INTEIRA, E ISSO PROTEGE QUATRO FAMILIAS
// ---------------------------------------------------------------------------
// Por substring, a troca destruiria o produto. Medido em 22/10/2026 sobre
// `4a8cf72d`:
//
//   - **`Bichu` e a MARCA** (9590 ocorrencias no repositorio). `bich` -> `pet`
//     faria `Petu`, `petu.app`, `app.petu`, `PetuEspaco`. [ocorrenciasDeBichu]
//     existe so para reprovar se a contagem mudar.
//   - **`bichano`** (2) e GATO, nao "bicho";
//   - **`balcao`** (1) e **`Caominhada`** (3) contem `cao` e nao sao cao: a
//     segunda e o nome de um evento da Rede (cao + caminhada), e trocar daria
//     "Cachorrominhada";
//   - **`pessoal`/`pessoais`** (247) e "pessoal", nao "pessoa": `dados
//     pessoais` viraria `dados usuariois`.
//
// A fronteira de palavra (`\b`) cobre as quatro sem precisar de excecao.

import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';

/// Quantas vezes `bichu` (em qualquer caixa) aparece em `app/lib`.
///
/// **Este numero e a defesa da marca.** Ele nao mede qualidade de nada: ele
/// existe para que uma substituicao descuidada de `bich` -> `pet` reprove aqui
/// em vez de renomear `Bichu` para `Petu` no app inteiro e passar.
///
/// Medido em 22/10/2026 sobre `4a8cf72d`, antes e depois das tres trocas, com
/// o mesmo resultado -- que e a prova de que as trocas nao tocaram a marca.
///
/// ATUALIZADO NA MESCLA DA ONDA 6 (22/10/2026): 2675 -> 2672. O numero acima
/// foi medido sobre `4a8cf72d` + a troca de vocabulario SOZINHA; a arvore
/// mesclada tem mais sete entradas, e quatro delas mexeram em arquivos de
/// `app/lib` que citam a marca. O saldo de -3 foi medido ARQUIVO POR ARQUIVO,
/// comparando a ponta do vocabulario (aa0be5df) com o commit de mescla, e
/// fecha exatamente:
///   -4  telas/mural/publicar_no_mural.dart      (19 -> 15)
///   -11 telas/perto/lista_do_diretorio.dart     (42 -> 31)
///   +5  telas/perto/pagina_do_local.dart        (132 -> 137)
///   +7  widgets/visualizador_de_imagem.dart     (16 -> 23)
///   +0  sessao/localizacao_da_sessao.dart       (arquivo novo, 0 mencoes)
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, e isso foi medido e nao suposto:
/// `petu` nao aparece em `app/lib`, `app/test`, `src`, `admin/src` nem
/// `web/src` (as unicas ocorrencias sao a prosa deste proprio portao, que
/// descreve a armadilha), e as ancoras da marca estao todas de pe --
/// `bichu.app` 12, `app.bichu` 2, `BichuEspaco` 1048, `BichuColors` 231,
/// `Bichu` 1979. O que mudou foi a QUANTIDADE DE LINHAS que citam a marca,
/// por tela que enxugou e tela que cresceu, e nao a marca.
/// ATUALIZADO NA MESCLA DA ONDA 7 (22/10/2026): 2672 -> 2690. O saldo de +18
/// foi medido ARQUIVO POR ARQUIVO entre `bdae03e1` (a `development`) e a
/// arvore mesclada, e fecha exatamente num unico arquivo:
///   +18 telas/conexoes/tela_minhas_conexoes.dart  (arquivo NOVO, 18 mencoes)
///
/// E a causa que a mensagem deste portao manda aceitar -- *arquivo novo que a
/// cita* --, e nao substituicao descuidada.
///
/// ---------------------------------------------------------------------------
/// ATUALIZADO NA MESCLA DA ONDA 8 (23/10/2026): 2690 -> 2706.
/// ---------------------------------------------------------------------------
/// **TRES valores travados colidiram aqui, e NENHUM dos tres servia:** 2690
/// (a `development` da onda 7), 2686 (`textos/lote-22-10`) e 2674
/// (`feat/ver-todos-pets`). Somar os deltas seria palpite. O valor foi CONTADO
/// SOBRE A ARVORE MESCLADA, arquivo por arquivo, e fecha exatamente contra
/// `bdae03e1` (2672):
///
///   +18 telas/conexoes/tela_minhas_conexoes.dart  (arquivo NOVO -- onda 7)
///   +15 telas/loja/vitrine_da_loja.dart        (28 -> 43 -- textos)
///    +2 telas/rede/secao_da_rede.dart          (6  -> 8  -- textos)
///    -3 telas/perfil/vitrine_de_fotos.dart     (37 -> 34 -- textos)
///    -1 telas/pessoa/tela_perfil_de_pessoa.dart (27 -> 26 -- textos)
///    +1 telas/pet/tela_detalhe_do_pet.dart     (75 -> 76 -- textos)
///    +2 telas/perfil/meus_pets.dart            (31 -> 33 -- ver-todos-pets)
///
/// Soma: +34, e 2672 + 34 = 2706. Sao SETE arquivos e nenhum deles e tocado
/// por mais de uma das tres frentes -- os conjuntos sao disjuntos. Por isso
/// aqui a soma dos deltas coincide com a medicao, e isso e RESULTADO da
/// medicao e nao substituto dela: se duas frentes tivessem mexido no mesmo
/// arquivo, a soma mentiria e a contagem nao.
///
/// `notif/pedido-conexao` nao entra nesta conta: medida na ponta `b5376b23`,
/// ela devolve 2672, identica a base. A frente nao toca `app/lib/telas`.
///
/// **A ATRIBUICAO QUE O LOTE DE TEXTOS DEIXOU ESCRITA ESTAVA ERRADA EM DOIS
/// ARQUIVOS, e o total dela estava certo.** A frente declarava `+17` na
/// vitrine da Loja e nao declarava `telas/rede/secao_da_rede.dart`. Medido na
/// propria ponta `b4407f63` com o metodo deste portao: a Loja e 28 -> 43
/// (`+15`) e `secao_da_rede.dart` e 6 -> 8 (`+2`). A soma e a mesma (+14), e
/// por isso o numero 2686 que ela travava estava correto enquanto a
/// explicacao nao estava. Fica registrado porque a proxima uniao vai ler esta
/// prosa antes de medir.
///
/// CONTROLE POSITIVO DO METODO, em QUATRO pontos onde a resposta ja era
/// conhecida, todos reproduzidos EXATAMENTE pela mesma contagem que produziu
/// 2706: `bdae03e1` -> 2672, `49ca33de` -> 2690, `b4407f63` -> 2686,
/// `a9478e4e` -> 2674. Acerta nos quatro lugares onde a resposta era
/// conhecida, e so por isso vale aqui, onde nao era. O controle NAO foi feito
/// so contra a base de proposito: validar so contra `bdae03e1` aprovaria o
/// procedimento sobre a arvore errada.
///
/// PRESENCA DE ARQUIVO CONFERIDA, e nao so o total -- arvore que perdeu
/// arquivo pode fechar o numero por compensacao: `app/lib` tem 217 `.dart` em
/// `bdae03e1` e 218 nesta arvore, e contra a lista de `49ca33de` (218) o
/// `diff` e VAZIO. O unico arquivo que a onda 8 acrescenta a `app/lib` e
/// nenhum: as tres frentes mudam conteudo, e so a onda 7 criara arquivo ali.
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, medido e nao suposto: `petu` nao
/// aparece em `app/lib`.
/// ---------------------------------------------------------------------------
/// 2706 -> 2714 em 23/10/2026 (BICHUS-278, os icones da barra)
/// ---------------------------------------------------------------------------
///
/// **A MARCA NAO MUDOU DE TAMANHO POR TROCA DE VOCABULARIO: tres arquivos a
/// citam a mais, e a conta fecha nos tres.** Medido arquivo por arquivo com o
/// metodo deste proprio portao (`/bichu/i` sobre o TEXTO CRU de todo `.dart`
/// de `app/lib`, recursivo, comentario incluido):
///
///   * `telas/casca_com_abas.dart`  51 -> 53  (**+2**)
///   * `theme/icones_da_barra.g.dart`  novo   (**+1**)
///   * `widgets/icone_da_barra.dart`   novo   (**+5**)
///
/// Soma +8, e 2706 + 8 = 2714. As DUAS de `casca_com_abas.dart` sao as unicas
/// linhas novas daquele arquivo que escrevem a palavra, e as duas estao em
/// mensagem de `assert`: *"DESTINO DA BARRA DESENHA O DO BICHU"* e *"Ou o
/// desenho do Bichu"*. As cinco de `widgets/icone_da_barra.dart` sao
/// `BichuTheme` (duas, em prosa), `BichuColors` (uma, em prosa), o importe
/// `theme/bichu_colors.dart` e a chamada `BichuColors.of`. A de
/// `theme/icones_da_barra.g.dart` e `BichuTheme` na prosa do gerador.
///
/// CONTROLE POSITIVO DO METODO: a mesma contagem, rodada sobre a arvore LIMPA
/// da base `d590ce2a` ANTES de qualquer edicao, devolveu EXATAMENTE 2706 --
/// o valor que a linha travava. Reproduzir o numero conhecido antes de medir o
/// desconhecido e o que faz esta troca valer; sem isso eu estaria travando o
/// resultado do meu script e nao a marca.
///
/// PRESENCA DE ARQUIVO CONFERIDA, e nao so o total -- arvore que perdeu
/// arquivo pode fechar o numero por compensacao: `app/lib` tem 218 `.dart` na
/// base e 220 aqui, e os DOIS a mais sao exatamente os dois arquivos novos
/// listados acima. Nenhum arquivo saiu.
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, medido e nao suposto: `petu` nao
/// aparece em `app/lib`.
/// ---------------------------------------------------------------------------
/// 2714 -> 2722 em 26/10/2026 (BICHUS-278, o CARIMBO DE BUILD)
/// ---------------------------------------------------------------------------
///
/// **A MARCA NAO MUDOU DE TAMANHO POR TROCA DE VOCABULARIO: dois arquivos a
/// citam a mais, e a conta fecha nos dois.** Medido arquivo por arquivo com o
/// metodo deste proprio portao (`/bichu/i` sobre o TEXTO CRU de todo `.dart`
/// de `app/lib`, recursivo, comentario incluido):
///
///   * `widgets/carimbo_do_build.dart`  novo      (**+5**)
///   * `config/app_config.dart`         2 -> 5    (**+3**)
///
/// Soma +8, e 2714 + 8 = 2722. As cinco de `widgets/carimbo_do_build.dart` sao
/// os importes `theme/bichu_colors.dart` e `theme/bichu_tokens.g.dart`, a
/// chamada `BichuColors.of`, `BichuEspaco` e a citacao de `/etc/bichu/commit`
/// na prosa. As tres de `config/app_config.dart` sao `/etc/bichu/commit` de
/// novo e duas de `BICHUS-210` na prosa do campo novo.
///
/// **`telas/abas.dart` nao entra, e o zero e medido e nao suposto**: 33 antes e
/// 33 depois. A unica linha que ela ganhou e
/// `import '../widgets/carimbo_do_build.dart';`, que nao escreve a palavra --
/// e e por isso que a conta tem de ser por ARQUIVO e nao por intuicao.
///
/// CONTROLE POSITIVO DO METODO, feito ANTES de qualquer edicao: a mesma
/// contagem sobre a arvore LIMPA da base `d590ce2a` devolveu EXATAMENTE 2706,
/// que era o valor travado naquela arvore. E o `+8` da frente dos icones,
/// reconstruido pelo mesmo metodo, reproduziu o 2714 desta linha. Reproduzir
/// os dois numeros conhecidos antes de escrever o desconhecido e o que faz
/// esta troca valer: sem isso eu estaria travando o resultado do meu script.
///
/// PRESENCA DE ARQUIVO CONFERIDA, e nao so o total -- arvore que perdeu
/// arquivo pode fechar o numero por compensacao: `app/lib` tem 218 `.dart` na
/// base `d590ce2a`, 220 com os dois da frente dos icones e 221 aqui, e o UNICO
/// a mais e `widgets/carimbo_do_build.dart`. Nenhum arquivo saiu.
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, medido e nao suposto: `petu` nao
/// aparece em `app/lib`.
/// ---------------------------------------------------------------------------
/// 2718 -> 2742 em 26/10/2026 (ACHEI ESTE PET, defeito relatado pelo cliente:
/// *"se ele encontrou o pet, ele nao tem que cadastrar as informacoes
/// novamente"*). **+24, e os 24 foram contados ARQUIVO POR ARQUIVO**, nao
/// deduzidos do total:
///
///   `app/lib/telas/achado/tela_encontrei_este_pet.dart`   0 -> 23  (nasce)
///   `app/lib/achado/envio_do_achado.dart`                 0 ->  2  (nasce)
///   `app/lib/telas/achado/tela_registrar_achado.dart`    38 -> 37  (-1)
///   `app/lib/telas/achado/textos_do_achado.dart`          7 ->  7
///   `app/lib/telas/perdido/tela_do_caso_publico.dart`    22 -> 22
///   `app/lib/roteamento/rotas.dart`                      15 -> 15
///
/// 23 + 2 - 1 = 24, e 2718 + 24 = 2742. A varredura passou de 221 para 223
/// arquivos `.dart`, que sao exatamente os dois que nasceram.
///
/// **O -1 esta EXPLICADO, e nao arredondado**: e UMA mencao a `BICHUS-31` (a
/// que explica por que a fila offline nao pode mostrar tela de sucesso) que
/// SAIU de `_registrar` quando o envio foi extraido, e ENTROU em
/// `envio_do_achado.dart` -- onde ela e citada duas vezes, no cabecalho e no
/// ramo da fila. Nenhuma ocorrencia foi apagada; uma mudou de arquivo.
///
/// CONTROLE DO METODO: o mesmo contador, rodado sobre a arvore LIMPA da base
/// (`1654bcaf`) ANTES de qualquer edicao, devolveu EXATAMENTE 2718 em 221
/// arquivos -- o valor que esta linha travava. Reproduzir o conhecido antes de
/// medir o desconhecido e o que faz este numero valer.
///
/// 2722 -> 2718 em 26/10/2026 (BICHUS-278, A UNIAO: arraste + convite)
/// ---------------------------------------------------------------------------
///
/// **A MARCA NAO FOI SUBSTITUIDA: a porta do convite SAIU do corpo do AuAu.**
/// O cliente mandou, duas vezes, tirar `Convide tutores` das mensagens e
/// deixar a porta so no menu do Perfil.
///
/// **ESTE VALOR FOI RECALCULADO SOBRE A ARVORE UNIDA, e nao e nenhum dos dois
/// lados do conflito nem a soma de deltas relatados.** Os dois lados existiam:
/// a base `f7678f4c` travava **2722** e o ramo `feat/convite-tutores-no-perfil`
/// travava **2702** -- e o 2702 e um numero de RAMO, medido sobre a base
/// `cc9f2767` (que valia 2706) e que nao conhece o carimbo de build nem os
/// icones da barra. Travar 2702 na uniao reprovaria; travar 2722 esconderia a
/// saida da porta. O valor da uniao e 2722 - 4 = **2718**, e o -4 foi MEDIDO
/// sobre a arvore unida, nao somado de relato.
///
/// CONTADO ARQUIVO POR ARQUIVO entre a base `f7678f4c` e esta arvore, e o
/// saldo de -4 fecha exatamente num UNICO arquivo:
///
///   -4 `telas/mensagens/area_de_mensagens.dart`  (24 -> 20)
///
/// Todos os outros 220 `.dart` de `app/lib` tem contagem IDENTICA a da base.
///
/// **AS QUATRO OCORRENCIAS ESTAO NOMEADAS, e a quarta e a interessante:** tres
/// sao `BichuEspaco` (uma `BichuEspaco.e2` e duas `BichuEspaco.e4`, do
/// `EdgeInsets.fromLTRB` do `Padding` que embrulhava o `ItemDeMenu` do convite)
/// e a quarta e **`BICHUS-62`**, a chave da issue citada na prosa que saiu
/// junto. A agulha e `RegExp('bichu', caseSensitive: false)`, e `BICHUS` CASA
/// com ela -- chave de Jira conta como ocorrencia da marca neste portao, e quem
/// contar so os `BichuEspaco` acha 3 e fica devendo 1.
///
/// Nada ENTROU: a prosa nova dos arquivos editados nao escreve a marca.
///
/// CONTROLE POSITIVO DO METODO, feito ANTES de medir o desconhecido: a MESMA
/// contagem, sobre a arvore LIMPA da base `f7678f4c`, reproduziu EXATAMENTE a
/// constante que ela travava (**2722**) -- por TRES caminhos que concordaram
/// (`grep -oi` arquivo por arquivo, `re.findall` com `IGNORECASE` sobre o
/// disco, e o mesmo sobre os blobs lidos da ref por `git show`). Reproduzir o
/// valor conhecido antes de medir o desconhecido e o que faz esta linha valer;
/// sem isso eu estaria travando o resultado do meu script e nao a marca.
///
/// PRESENCA DE ARQUIVO CONFERIDA, e nao so o total -- arvore que perdeu
/// arquivo pode fechar o numero por compensacao: `app/lib` tem **221** `.dart`
/// na base e **221** aqui, e o `diff` entre as duas listas ordenadas saiu
/// VAZIO. As contas foram feitas pelos dois lados: `set(base)-set(agora)` e
/// `set(agora)-set(base)` sao os dois VAZIOS. Nenhum arquivo entrou, saiu ou
/// foi renomeado.
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, medido e nao suposto: `petu` nao
/// aparece em `app/lib`.
/// ---------------------------------------------------------------------------
/// 26/10/2026: 2718 -> **2716**, e os dois que sairam NAO sao da marca
/// ---------------------------------------------------------------------------
/// O lote das duas correcoes do cliente (tirar as acoes de QR do usuario, e
/// por a foto de quem falou em cada fala) mexeu em dois arquivos de
/// `app/lib/telas`, e o saldo foi **-2**.
///
/// CONTADO ARQUIVO POR ARQUIVO, e a diferenca esta localizada nos dois -- nao
/// e um total que fechou por compensacao:
///
///   `telas/conexoes/convide_tutores.dart`    32 -> 28  (-4)
///   `telas/mensagens/tela_da_conversa.dart`  35 -> 37  (+2)
///
/// **NENHUMA OCORRENCIA DA MARCA FOI APAGADA.** Os quatro que sairam do
/// convite sao referencias a `BichuEspaco.` dos dois `BotaoSecundario` e dos
/// dois avisos que foram removidos com eles -- o token do design system casa
/// com a agulha porque ela ignora caixa, e nao porque alguem escreveu a marca
/// ali. Os dois que entraram na conversa sao os `BichuEspaco.` do respiro da
/// marca de quem falou. Texto de usuario com a palavra `Bichu` nao foi tocado
/// em nenhum dos dois arquivos.
///
/// CONTROLE DO METODO, feito ANTES de medir o novo: o mesmo script, sobre a
/// arvore LIMPA da base (`1654bcaf`, lendo cada arquivo por
/// `git show "${SHA}:${caminho}"`), reproduziu EXATAMENTE a constante que ela
/// travava -- **2718** em 221 arquivos. Reproduzir o valor conhecido antes de
/// medir o desconhecido e o que faz esta linha valer.
///
/// PRESENCA DE ARQUIVO CONFERIDA: 221 `.dart` na base e 221 no disco, e o
/// `diff` entre as duas listas ORDENADAS de caminhos saiu vazio (0 linhas).
/// Nenhum arquivo entrou, saiu ou foi renomeado -- os dois arquivos NOVOS
/// deste lote sao de `app/test`, que esta fora desta varredura.
///
/// A ARMADILHA CONTINUA AUSENTE, medida e nao suposta: `petu` nao aparece em
/// `app/lib` (busca sem distincao de caixa, saida vazia). **Com controle
/// positivo da sonda**, porque busca negativa passa no vazio: a mesma busca
/// trocando a agulha por `bichu` devolve 186 arquivos.
const int ocorrenciasDeBichu = 2742;

/// As tres agulhas, por palavra inteira e sem distincao de caixa.
///
/// Cada uma cobre o singular e o plural numa entrada so. `cao`/`caes` precisa
/// das duas formas escritas porque o plural portugues nao e sufixo do
/// singular.
final List<RegExp> agulhasDoVocabulario = <RegExp>[
  RegExp(r'\bbichos?\b', caseSensitive: false),
  RegExp('\\b(c\u00e3o|c\u00e3es)\\b', caseSensitive: false),
  RegExp(r'\bpessoas?\b', caseSensitive: false),
];

/// Os literais que **podem** manter a palavra, por caminho, com a razao.
///
/// **Nenhuma entrada aqui e "excecao porque deu trabalho".** Cada uma e uma de
/// tres coisas, e a razao esta escrita na linha:
///
///   1. **nao e texto de usuario** (rota, nome de arquivo, semente de apelido,
///      mensagem de `assert`, diagnostico de telemetria);
///   2. **tem dono agora** -- outra frente estava editando o arquivo em
///      22/10/2026, e duas frentes no mesmo arquivo custou horas no dia
///      anterior. Sai na segunda passada;
///   3. **tem redacao propria pedida pelo cliente**, que nao e a troca
///      generica.
///
/// A chave e o caminho relativo ao pacote; o valor, o conteudo exato do
/// literal (ja sem interpolacao) que fica liberado naquele arquivo.
const Map<String, List<String>> excecoesDoVocabulario = <String, List<String>>{
  // ---- 1. NAO E TEXTO DE USUARIO ----

  // Rota do contrato. Trocar o segmento quebra o link publico do perfil.
  'lib/roteamento/rotas.dart': <String>['/pessoa/:', '/pessoa/'],

  // Nome de arquivo de imagem no bundle.
  'lib/telas/conta/tela_entrar.dart': <String>[
    'assets/ilustracoes/tres-pessoas-no-parque.webp',
  ],

  // Semente do apelido sugerido (`pessoa-01`). O apelido tem conjunto de
  // caracteres fechado e **nao aceita acento**: `usuario` passaria, `usuario`
  // com acento nao, e trocar aqui e trocar o apelido que o produto oferece --
  // dado, nao texto.
  'lib/formato/apelido.dart': <String>['pessoa'],

  // Mensagem de `assert`: quem le e quem escreve a tela, nao quem usa o app.
  //
  // **E o PEDACO da cadeia, e nao a frase inteira**: Dart concatena cadeias
  // adjacentes, e a extracao devolve um literal por pedaco. Uma excecao
  // escrita com a frase montada nao casaria com nenhum deles -- foi assim que
  // este portao reprovou na primeira execucao.
  'lib/widgets/acoes_de_criar_flutuantes.dart': <String>[
    'existe para oferecer uma coisa: um toque a mais entre a pessoa e a ',
  ],

  // Diagnostico de telemetria (`_relatar`), lido em investigacao de defeito.
  'lib/intencao/guarda_de_acao.dart': <String>[
    'envelope ileg\u00edvel descartado: a pessoa entra na conta e vai para o In\u00edcio',
    'a pessoa voltou para ',
  ],

  // ---- 2. TEM DONO AGORA: SEGUNDA PASSADA ----

  // Fluxo do achado. A frente que o enxuga em 22/10/2026 esta removendo
  // justamente `O que e o bicho?`, e tambem reescreve as duas linhas de ajuda.
  'lib/telas/achado/textos_do_achado.dart': <String>[
    'O que \u00e9 o bicho?',
    'Olhe se o bicho tem plaquinha ou coleira com c\u00f3digo. Escanear o QR da ',
    'Procure o bicho na lista de pets perdidos, na se\u00e7\u00e3o Pets. Ela mostra ',
  ],

  // Mesma frente. E tambem o caso de SENTIDO: `outro bicho` e a terceira opcao
  // de especie, e o cliente pediu na mesma rodada para manter `cachorro, gato
  // e outro`. `outro pet` dentro de uma frase que ja diz `cachorro, gato` e
  // decisao de microcopia dele, nao troca mecanica.
  'lib/achado/rascunho_do_achado.dart': <String>[
    'Diga se \u00e9 cachorro, gato ou outro bicho.',
  ],

  // Localizacao (sessao e pre-preenchimento): outra frente.
  'lib/telas/localizacao/textos_da_localizacao.dart': <String>[
    'Se quiser, diga o bairro. \u00c9 ele que aparece para as outras pessoas ',
  ],

  // Pagina de publicacao do usuario: outra frente.
  'lib/telas/mural/comentarios_da_publicacao.dart': <String>[
    'Seja a primeira pessoa a comentar nesta publica\u00e7\u00e3o.',
  ],

  // Pagina interna e listagem do profissional: outra frente.
  'lib/telas/perto/pagina_do_local.dart': <String>[
    'O que outras pessoas disseram',
    'Seja a primeira pessoa a contar como foi o atendimento aqui.',
  ],
  'lib/telas/perto/sugerir_profissional.dart': <String>[
    'Diga o nome do lugar ou da pessoa.',
  ],

  // O rotulo da especie. `Cao` -> `Cachorro` e a troca de maior valor das tres
  // -- ela entrega tambem o pedido de `cachorro, gato e outro` -- e esta
  // BLOQUEADA por dono: 15 asserts de `find.text('Cao')` moram em cinco
  // arquivos de teste de frente alheia (`registrar_achado_test.dart`,
  // `registrar_achado_dois_passos_test.dart`, `cep_nos_dois_formularios_test.dart`,
  // `localizacao_do_botao_test.dart`, `perdidos_e_meus_achados_test.dart`).
  // Mudar o rotulo sem mudar os asserts deixa a suite vermelha; mudar os
  // asserts e editar arquivo de outra frente. Sai na segunda passada, junto
  // com `admin/src/loja/dominio.ts` e `web/src/dominio/texto-do-pet.ts`, que
  // carregam o MESMO rotulo -- os tres mudam no mesmo commit ou o produto fica
  // dizendo `Cachorro` no site e `Cao` no app.
  'lib/api/modelos_pet.dart': <String>['C\u00e3o'],

  // ---- 3. REDACAO PROPRIA, PEDIDA PELO CLIENTE ----
  //
  // **ESTA SECAO ESTA VAZIA, e o vazio e o desfecho da unica entrada que ela
  // tinha.** Era `lib/telas/rede/busca_de_pessoas.dart`, com os dois ramos de
  // `_fimDaLista` -- `Uma pessoa com esse nome.` e `Voce viu todas as `. Os
  // dois ficaram liberados porque o cliente havia pedido a redacao do PRIMEIRO
  // (*"Troque o texto Uma pessoa com esse nome para Um usuario encontrado em
  // sua busca."*) e mudar so o segundo desencontraria o par.
  //
  // **Em 22/10/2026 os dois mudaram juntos** e nenhum escreve mais `pessoa`:
  // o singular saiu com a redacao literal dele, e o plural foi derivado dela
  // (`Voce viu todos os N usuarios encontrados em sua busca.`) -- a derivacao
  // esta justificada na prosa de `_fimDaLista`, e e ela que pode ser revista,
  // nao esta excecao. Com os literais trocados, a excecao ficaria liberando
  // texto que nao existe: `liberadoPorExcecao` casa por PREFIXO nos dois
  // sentidos, entao uma entrada orfa nao fica so inofensiva -- ela passa a
  // poder liberar uma frase futura que comece igual.
  //
  // A secao fica escrita, e nao apagada, porque a terceira razao continua
  // valendo para a proxima redacao que ele pedir.
};

/// Os literais de cadeia de Dart, nas quatro formas de aspas.
///
/// **A ordem importa**: a forma TRIPLA vem primeiro, senao as aspas simples
/// casariam o comeco de uma cadeia tripla como duas cadeias vazias e o resto
/// do arquivo sairia desalinhado. O prefixo `r` de cadeia crua fica fora do
/// casamento de proposito: o que interessa e o conteudo.
final RegExp _literalDeCadeia = RegExp(
  r"'''([\s\S]*?)'''"
  r'|"""([\s\S]*?)"""'
  r"|'((?:\\.|[^'\\\n])*)'"
  r'|"((?:\\.|[^"\\\n])*)"',
);

/// O conteudo dos literais de cadeia de [fonte], ja sem prosa e sem
/// interpolacao.
///
/// Existe separada de [conferirVocabularioDoProduto] porque **a isca da isca
/// precisa da resposta como VALOR**: ela alimenta amostras de proposito e exige
/// que a extracao as veja.
List<String> literaisDeCadeiaEm(String fonte) {
  final String limpo = semProsaDeDart(fonte);
  final List<String> uteis = <String>[];
  for (final String linha in limpo.split('\n')) {
    final String t = linha.trimLeft();
    if (t.startsWith('import ') ||
        t.startsWith('export ') ||
        t.startsWith('part ') ||
        t.startsWith('part of ')) {
      continue;
    }
    uteis.add(linha);
  }
  final String corpo = uteis.join('\n');

  final List<String> achados = <String>[];
  for (final RegExpMatch m in _literalDeCadeia.allMatches(corpo)) {
    final String? bruto =
        m.group(1) ?? m.group(2) ?? m.group(3) ?? m.group(4);
    if (bruto == null) continue;
    achados.add(semInterpolacao(bruto));
  }
  return achados;
}

/// O literal sem as interpolacoes: `${...}` e `$identificador` saem.
///
/// Elas sao CODIGO dentro do texto. `'${widget.pessoa.nomeParaLer}'` nao
/// escreve "pessoa" para ninguem ler, e um portao que reprovasse ali cobraria
/// renomear campo -- que e o que o pedido proibe.
String semInterpolacao(String literal) {
  return literal
      .replaceAll(RegExp(r'\$\{[^}]*\}'), ' ')
      .replaceAll(RegExp(r'\$[A-Za-z_][A-Za-z0-9_]*'), ' ');
}

/// As agulhas que [texto] contem, ou vazio. Valor, para a isca da isca.
List<String> palavrasTrocadasEm(String texto) {
  final List<String> achadas = <String>[];
  for (final RegExp agulha in agulhasDoVocabulario) {
    final RegExpMatch? m = agulha.firstMatch(texto);
    if (m != null) achadas.add(m.group(0)!);
  }
  return achadas;
}

/// Verdadeiro quando [literal] esta liberado em [caminho].
///
/// Casa por **prefixo** do literal liberado, e nao por igualdade: um literal
/// quebrado em varias linhas de Dart (concatenacao implicita) chega aqui como
/// pedaco, e exigir igualdade deixaria a excecao sem efeito.
bool liberadoPorExcecao(String caminho, String literal) {
  final List<String>? liberados = excecoesDoVocabulario[caminho];
  if (liberados == null) return false;
  final String alvo = literal.trim();
  for (final String ok in liberados) {
    final String okt = ok.trim();
    if (okt.isEmpty) continue;
    if (alvo == okt || okt.startsWith(alvo) || alvo.startsWith(okt)) {
      return true;
    }
  }
  return false;
}

/// Reprova se algum literal de `app/lib` escrever `bicho`, `cao` ou `pessoa`.
///
/// [minimoDeArquivos] e [minimoDeLiterais] sao o **controle positivo**, e sao
/// dois de proposito: uma caminhada que achasse zero arquivo passaria no
/// vazio, e uma extracao de literal quebrada (uma expressao regular que
/// parasse de casar) passaria no vazio AINDA ACHANDO os arquivos. O segundo
/// piso e o que pega esse caso, que e o modo de falhar mais perigoso de portao
/// que varre codigo.
void conferirVocabularioDoProduto({
  int minimoDeArquivos = 180,
  int minimoDeLiterais = 4000,
}) {
  final List<io.File> arquivos = dartsDeLib();
  expect(
    arquivos.length,
    greaterThanOrEqualTo(minimoDeArquivos),
    reason:
        'REPROVA: a caminhada achou so ${arquivos.length} arquivos `.dart` em '
        '`app/lib`. Abaixo de $minimoDeArquivos ela esta cega, e varredura '
        'cega fica verde sem conferir.',
  );

  int literaisVistos = 0;
  final List<String> reprovas = <String>[];
  for (final io.File arquivo in arquivos) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    final List<String> literais = literaisDeCadeiaEm(arquivo.readAsStringSync());
    literaisVistos += literais.length;
    for (final String literal in literais) {
      if (liberadoPorExcecao(caminho, literal)) continue;
      for (final String palavra in palavrasTrocadasEm(literal)) {
        reprovas.add('  $caminho escreve "$palavra" em: "$literal"');
      }
    }
  }

  expect(
    literaisVistos,
    greaterThanOrEqualTo(minimoDeLiterais),
    reason:
        'REPROVA: a extracao achou so $literaisVistos literais de cadeia em '
        '`app/lib`, e o piso e $minimoDeLiterais. A expressao regular de '
        'literal parou de casar, e a varredura esta passando no vazio sobre '
        'arquivos que ela ESTA lendo -- exatamente o modo de falhar que os '
        'dois pisos existem para separar.',
  );

  expect(
    reprovas,
    isEmpty,
    reason:
        'REPROVA: ${reprovas.length} literal(is) de `app/lib` ainda escrevem '
        'uma das tres palavras trocadas em 22/10/2026:\n'
        '${reprovas.join('\n')}\n\n'
        'As trocas sao `bicho`->`pet`, `cao`->`cachorro`, '
        '`pessoa`->`usuario`, e valem **so para texto que o usuario le**. Se o '
        'literal NAO e texto de usuario (rota, nome de arquivo, semente de '
        'apelido, `assert`, diagnostico), ou tem dono, ou tem redacao propria '
        'pedida pelo cliente, ele entra em `excecoesDoVocabulario` **com a '
        'razao escrita na linha** -- e nao e so acrescentado. Microcopia e '
        'decisao do cliente, nao de quem edita a tela.',
  );
}
