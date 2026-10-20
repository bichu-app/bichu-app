// BICHUS-161, criterio 10 — "nenhuma tela do assistente de cadastro muda de
// codigo por causa desta historia. Se alguma precisar mudar, a porta esta
// sendo contornada, e isso reprova".
//
// A ISCA deste arquivo: **o criterio 10 so existe como frase enquanto alguem
// o afirma.** "Conferi com `git diff` que nenhuma tela mudou" e verdade no dia
// em que foi digitada e nao acusa nada no dia seguinte. Quem ler o commit
// acredita; quem contornar a porta depois nao encontra ninguem reclamando.
//
// Sao dois portoes, e eles pegam coisas diferentes:
//
// 1. A TRAVA DE ARVORE cobra a letra do criterio: o conteudo de
//    `app/lib/telas` e o mesmo que estava valendo quando a trava foi escrita
//    pela ultima vez. Um espaco a mais reprova. E de proposito que ela seja
//    burra: o criterio nao fala de comportamento, fala de o codigo nao ter
//    mudado.
//
// 2. O PORTAO ESTRUTURAL cobra o espirito, e sobrevive a esta historia: tela
//    nenhuma importa plugin de aparelho nem fala canal de plataforma. A trava
//    de arvore morre no dia em que uma historia legitima mexer numa tela; este
//    aqui continua valendo, e e ele que pega o contorno de verdade.
//
// ---------------------------------------------------------------------------
// O QUE MUDOU DEPOIS DA REVISAO DA BICHUS-161 (e por que)
// ---------------------------------------------------------------------------
//
// **O portao estrutural tinha um furo, e era grande.** Ele casava o texto
// `import '`, com aspa SIMPLES. `import "package:image_picker/..."`, com aspa
// dupla, passava verde -- e o `prefer_single_quotes` estava comentado no
// `analysis_options.yaml`, entao o `flutter analyze` tambem ficava calado. O
// portao que existe para impedir que uma tela contorne a porta era contornavel
// trocando o tipo de aspa, que e a diferenca mais inocente que existe entre
// dois programadores.
//
// Agora ele nao casa texto: ele LE as diretivas, com o leitor de
// `diretivas_dart.dart`, que entende aspa simples, dupla, tripla, string crua,
// escape unicode, literais adjacentes, comentario no meio e `import`
// condicional. O grupo `autoteste do leitor` abaixo prova cada uma dessas
// formas, e ele fica no repositorio de proposito: prova negativa que vive numa
// frase evapora, e esta precisa acusar no dia em que o leitor deixar de
// enxergar.
//
// `prefer_single_quotes` FOI ligado tambem (zero arquivos do projeto quebram
// com ele), mas como cinto, nao como freio: se alguem o desligar amanha, este
// portao continua enxergando igual. Era essa dependencia que fazia o portao
// antigo ter duas maneiras de morrer, e a segunda ser silenciosa.
//
// **A trava de conteudo virou trava de ARVORE.** Ela fixava o digest SHA-256
// de sete arquivos de `app/lib/telas/pet/`, enumerados a mao, contra o commit
// `7fe24a6`. Tres problemas, e o terceiro e o pior:
//
//   - fixava um COMMIT, e nao uma propriedade: quem destravasse uma vez
//     passaria a cobrar "byte a byte o da base 7fe24a6" sobre o que a pessoa
//     anterior colou;
//   - custava sete linhas de digest por destravamento, o que transforma um ato
//     deliberado em cerimonia -- e cerimonia se despacha no automatico;
//   - cobria sete arquivos de uma SUBPASTA. Pasta nova dentro de
//     `app/lib/telas` nao era coberta por nada.
//
// `git write-tree` devolve o hash da arvore, que cobre o diretorio inteiro
// **recursivamente**: arquivo novo, arquivo apagado, subpasta nova, permissao
// trocada, tudo muda o hash. Uma constante no lugar de sete, o diretorio no
// lugar da subpasta, e o commit citado como PROCEDENCIA e nao como alvo.
//
// COMO DESTRAVAR, quando uma historia FUTURA tiver motivo legitimo para mexer
// numa tela: rode o comando que a mensagem de falha imprime, troque a
// constante `_arvoreDasTelas` e cite a chave da issue na linha. Continua sendo
// um ato deliberado, com nome e motivo no diff -- so deixou de custar sete
// edicoes para custar uma.
//
// O QUE ESTE PORTAO NAO COBRE: o criterio 12, verificacao em aparelho fisico.
// Camera nao se verifica em simulador nem em teste de widget, e nada aqui
// finge que verifica.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'diretivas_dart.dart';

/// O diretorio que a trava cobre, relativo a raiz do repositorio.
const String _caminhoDasTelas = 'app/lib/telas';

/// O hash de arvore de [_caminhoDasTelas].
///
/// Procedencia ate 21/09: `7fe24a6` (BICHUS-157 e 158, o commit em que a
/// BICHUS-161 nasceu) e `71559a0` (a ponta da BICHUS-161) davam **o mesmo**
/// hash, `52ea5cee883547d9a324900479a8e60802041d4a` -- que e exatamente o que
/// o criterio 10 afirma.
///
/// **Destravado pela BICHUS-164** na integracao de 22/09, e este e o ato
/// deliberado que a trava cobra. A 164 leva a barra de navegacao de tres para
/// cinco secoes e mexe em `app/lib/telas/abas.dart`, `casca_com_abas.dart`,
/// `escanear/tela_leitor_de_qr.dart`, `pet/tela_cadastrar_sinais.dart` e
/// `pet/tela_pet_cadastrado.dart`, e acrescenta `perfil/meus_pets.dart`. O
/// criterio 10 da BICHUS-161 continua valendo sobre o que ele diz -- que a
/// CAMERA nao contornou a porta --, e quem responde por isso e o portao de
/// diretivas acima, que nao depende desta constante.
///
/// **Destravado de novo pela BICHUS-205** (`fix/botao-primario-sem-acao`), na
/// mesma integracao: a acao primaria voltava a se anunciar como tocavel, e
/// `pet/tela_pet_cadastrado.dart` recebeu a correcao. A trava reprovou, como
/// tem de reprovar, e o bump e o ato deliberado que ela cobra.
///
/// **Destravado uma terceira vez pela BICHUS-154**: o codigo da tag encolheu
/// para 16 caracteres e a tela que o exibe acompanhou.
///
/// **Destravado uma quarta vez pela BICHUS-195/196**: `casca_com_abas.dart`
/// ganhou `tituloEmMarca` e `abas.dart` recebeu a nota da decisao entre ela
/// e a BICHUS-164.
///
/// **Destravado uma quinta vez pelos achados em aparelho fisico de 22/09**,
/// os dois de posicionamento que a suite nao via:
/// `escanear/tela_leitor_de_qr.dart` ganhou `alturaDaSaidaSobreposta` e o
/// estado `digitando` passou a abrir depois da saida sobreposta, que cobria o
/// rotulo do campo; `avisos/antessala_de_aviso.dart` ganhou o `SafeArea`
/// inferior que `showModalBottomSheet(useSafeArea: true)` NAO aplica, porque
/// `Agora não` caia debaixo da barra de gestos. Os dois estao medidos em
/// `test/telas/area_segura_do_aparelho_test.dart`.
///
/// **Esta trava nao poderia ter pego nenhum dos dois, e isso e o desenho
/// dela.** Ela e hash de bytes de fonte: ela acusa que o codigo mudou, nunca
/// que o desenho se atropela. Quem cobra geometria e o arquivo de area
/// segura, e ate 22/09 ele nao existia.
/// **Destravado uma quinta vez pelas tres mudancas do teste em aparelho de
/// 22/09/2026** (BICHUS-29 e BICHUS-81): o Perfil perdeu a linha de termos e
/// privacidade em `abas.dart`, a F1.1 ganhou a caixa de aceite dos termos em
/// `conta/tela_criar_conta.dart`, e a caixa de "continuar conectado" saiu de
/// `tela_criar_conta.dart` e de `conta/tela_entrar.dart`. Nenhuma delas
/// encosta na porta `CameraEGaleria`, que e o que o criterio 10 protege.
///
/// **Destravado uma sexta vez pela BICHUS-220**, pelos dois achados do cliente
/// em aparelho fisico de 22/09:
///
/// - `perfil/meus_pets.dart` ganhou o gatilho de recarga por visibilidade. A
///   tela carregava uma vez, em `initState`, e o pet cadastrado com ela ja
///   montada nunca entrava na lista.
/// - `escanear/tela_leitor_de_qr.dart` **parou de desenhar uma camera que nao
///   existe**. Com a permissao concedida ela pintava fundo preto e uma moldura
///   de 240 x 240 sem nenhum widget de camera na arvore. O leitor e a
///   BICHUS-54, que esta em `To Do`; enquanto ela nao entra, a tela diz isso e
///   oferece a digitacao do codigo, que a propria BICHUS-54 chama de caminho
///   de igual valor.
///
/// Nenhuma das duas encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege. A segunda, alias, **tira** da tela a ultima leitura que ela
/// fazia da porta: o leitor nao consulta mais permissao nenhuma, porque a
/// resposta nao mudava nada do que ele consegue fazer.
///
/// **Destravado uma setima vez pela BICHUS-235**: o QR da tag passou a ser
/// buscado com o `Authorization` que a rota exige, e a falha da imagem deixou
/// de colapsar para `SizedBox.shrink()`.
/// `pet/tela_pet_cadastrado.dart` trocou `Image.network` por um `Image` sobre
/// os bytes que a camada de API baixou, e ganhou os quatro estados da imagem;
/// `pet/textos_do_cadastro.dart` recebeu os tres textos que distinguem "esta
/// tag nao tem imagem" de "nao consegui buscar". Nenhuma das duas encosta na
/// porta `CameraEGaleria`, que e o que o criterio 10 protege.
///
/// **Destravado uma oitava vez pela INTEGRACAO DE 22/09.** Seis historias
/// mexeram em `app/lib/telas` no mesmo dia, e cada uma mediu o proprio hash
/// a partir de `648b91a936...` achando que seria a proxima a entrar. Nenhum
/// dos seis vale: o valor abaixo foi medido sobre a arvore com as seis
/// juntas, pelo indice temporario que este portao usa, e nao copiado de
/// nenhum relato. Os paragrafos a seguir sao o que cada autora escreveu, um
/// por historia, porque o que cada uma protege continua sendo diferente.
///
/// **Destravado pela BICHUS-24**, "duas oportunidades e nao
/// mais". A trava reprovou com `648b91a936...` contra o
/// `3831b7207e32ae96a7ac40852e3681017eb81918` medido, que e o ato deliberado
/// que ela cobra. Quatro arquivos, e nenhum deles encosta na porta
/// `CameraEGaleria`:
///
/// - `avisos/pedido_de_aviso.dart` **nasceu**: o fluxo do pedido de permissao
///   saiu de dentro de F1.6 porque F3.2 e a SEGUNDA oportunidade da mesma
///   permissao, e reimplementa-lo la faria "duas oportunidades" virar "duas em
///   cada tela" sem ninguem decidir.
/// - `avisos/antessala_de_aviso.dart` ganhou a segunda variante (criterio 4) e
///   os textos de quem negou. **O mesmo widget para as duas**, porque o
///   criterio 6 diz "a antessala em qualquer ponto" e duas `Column` copiadas
///   divergem na primeira vez que alguem mexe numa so.
/// - `pet/tela_pet_cadastrado.dart` perdeu o `_resolverAviso` inteiro e ficou
///   com o que e da tela: quando chamar, e o que fazer com a faixa de falha.
/// - `abas.dart` ganhou a linha de Perfil de quem negou, com `Ligar nos
///   ajustes` (UX 10.1). Sem ela, o rigor de nao repetir o dialogo virava beco
///   sem saida.
///
/// O portao de diretivas abaixo continua valendo sobre as quatro, e e ele que
/// responde pelo que o criterio 10 de fato protege: nenhuma delas importa
/// plugin de aparelho nem abre canal de plataforma. O acesso ao servico de
/// notificacao continua atras da porta `Avisos`, em `lib/dispositivo/`, que e
/// onde `openAppSettings()` passou a morar.
///
/// **Destravado pela BICHUS-54**: a leitura do QR pela camera
/// entrou, e `escanear/tela_leitor_de_qr.dart` foi reescrita inteira --
/// desfazendo o que a BICHUS-220 tinha feito, que era a tela **dizer** que nao
/// havia leitor. Agora ha: `mobile_scanner` atras da porta nova
/// `dispositivo/leitor_de_qr.dart`, os quatro estados de permissao voltando a
/// decidir a tela, e `escanear/codigo_lido_do_qr.dart` triando localmente o QR
/// que nao e do Bichu. Entrou tambem `escanear/mascara_do_codigo_da_tag.dart`,
/// so para publicar `aceitos` -- a triagem precisa do MESMO alfabeto da
/// mascara, e uma segunda copia do intervalo divergiria.
///
/// **Esta e a primeira vez que a trava dispara por uma tela que VOLTOU a ler a
/// porta da camera**, e vale dizer por que isso nao contraria o criterio 10.
/// A BICHUS-161 protege a porta `CameraEGaleria` de ser CONTORNADA -- tela
/// chamando plugin direto. A tela do leitor nao a contorna: ela pergunta a
/// permissao **por ela**, e de proposito nao pergunta pela porta do leitor,
/// que e a mesma permissao de sistema. Duas portas consultando
/// `Permission.camera` dariam duas respostas que precisam ser iguais e um dia
/// nao seriam.
///
/// **Destravado pelas BICHUS-60 e BICHUS-61**: entrou a tela de
/// detalhe do pet (T.1), que e a hospedeira que o criterio 1 das duas
/// historias pressupoe, e com ela a tela de edicao. Os campos do pet sairam de
/// dentro de `tela_cadastrar_identificacao.dart` e `tela_cadastrar_sinais.dart`
/// para `pet/campos_do_pet.dart`, porque a edicao mexe nos MESMOS atributos do
/// mesmo animal e duas formas diferentes de editar os mesmos campos e defeito;
/// `pet/textos_do_detalhe.dart` recebeu a frase da ADR-0004 que diz que o
/// codigo da tag nao volta. Nenhuma das telas encosta na porta
/// `CameraEGaleria`, que e o que o criterio 10 protege -- a edicao **nao**
/// embarca foto, e o motivo esta escrito em `tela_editar_pet.dart`.
/// **Destravado pela BICHUS-23**: a captura de localizacao no
/// ponto de uso nasceu, e ela e uma pasta nova em `app/lib/telas` --
/// `telas/localizacao/`, com `captura_de_localizacao.dart`,
/// `antessala_de_localizacao.dart` e `textos_da_localizacao.dart`.
///
/// Nenhuma tela existente mudou: a pasta e inteiramente nova, e o hash de
/// ARVORE cobre o diretorio recursivamente, entao pasta nova muda o valor
/// mesmo sem um byte dos arquivos antigos mudar. E esse o comportamento que
/// a troca de digest-de-sete-arquivos por hash-de-arvore comprou.
///
/// A peca nova NAO encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege, e ela fala com a porta `Localizacao` pelo escopo -- que e o
/// arranjo que o portao estrutural abaixo exige, e que
/// `localizacao_no_ponto_de_uso_test.dart` cobra por nome de arquivo.
/// **Destravado pelas BICHUS-232, BICHUS-233 e BICHUS-153**,
/// os tres achados do cliente de 22/09/2026. Quatro arquivos, e nenhum deles
/// encosta na porta `CameraEGaleria`:
///
/// - `abas.dart` (232) deixou de oferecer o botao de cadastro ao lado de
///   `Entrou como` e `Ja tenho conta`: a porta de cadastro de pet nao mora no
///   Perfil.
/// - `perfil/meus_pets.dart` (232) passou a construir a acao de cadastrar num
///   lugar so, usada nos dois ramos, em vez de duas copias que ja tinham
///   divergido.
/// - `casca_com_abas.dart` (232) teve o comentario de `EstadoDaSecao.existe`
///   corrigido.
/// - `escanear/tela_leitor_de_qr.dart` (233 e 153): o icone de proximidade
///   virou `place_outlined`/`place` sob o enum `CampoSemantico`, e o 404 de
///   `GET /v1/tags/{code}` passou a distinguir o codigo DIGITADO do codigo
///   lido, com `Digitar de novo` devolvendo o foco ao campo sem limpa-lo.
///
/// A ultima **tira** ainda mais leitura da porta, em vez de somar: a tela
/// continua sem consultar permissao nenhuma, e a origem do codigo que ela
/// agora carrega vem do teclado, nunca da camera. O `_codigoFoiDigitado`
/// nasce `false` de proposito, para a BICHUS-54 cair no caminho escaneado
/// quando trouxer o leitor de verdade.
///
/// **A BICHUS-54 destrava isto de novo, e com outro numero.** Ela apaga
/// `escanear/tela_leitor_de_qr.dart` e altera `mascara_do_codigo_da_tag.dart`.
/// Quem mesclar por ultimo reescreve esta linha; um conflito aqui e o
/// resultado esperado, e nao sinal de que alguem errou.
///
/// Nao e "o hash da base 7fe24a6": e o hash que vale agora. Quem destravar
/// troca esta linha e cita a issue aqui, e a proxima pessoa passa a cobrar o
/// que essa issue deixou, e nao o que um commit de setembro deixou.
/// **Destravado pela BICHUS-21**: o fluxo de marcar o pet como
/// perdido entrou, e ele e cinco arquivos novos em `perdido/` -- F3.0
/// (`tela_de_quem_e_o_caso.dart`), F3.1 (`tela_onde_e_quando.dart`), F3.2
/// (`tela_alcance_do_alerta.dart`), F3.3 (`resultado_da_abertura.dart`), a
/// ponte do envelope de intencao (`tela_de_retomada.dart`) e o cabecalho do
/// pet (`cabecalho_do_pet.dart`). `perfil/meus_pets.dart` ganhou a porta que a
/// BICHUS-62 deixou reservada, com a acao `Marcar como perdido` que so agora
/// tem destino.
///
/// Nenhuma delas encosta na porta `CameraEGaleria`, que e o que o criterio 10
/// protege: o fluxo inteiro nao le camera, nao le galeria e nao le
/// localizacao. Quem responde por isso e o portao de diretivas abaixo, que nao
/// depende desta constante.
///
/// A autora mediu `e2263ed05357bf22b31f1b177fcdb3d5b28f710b` sobre a base;
/// esse valor foi superado pela integracao de 22/09, que mediu a arvore com
/// as seis historias juntas.
///
/// **Destravado uma setima vez pela BICHUS-58 e pela BICHUS-57**, a tela que o
/// codigo da tag abre: `escanear/tela_do_pet_da_tag.dart` e arquivo novo (F2.2
/// e F2.3) e `escanear/tela_leitor_de_qr.dart` parou de descartar o retorno de
/// `tags.resolver` e passou a empilhar a tela do pet. **Nenhuma das duas
/// encosta na porta** `CameraEGaleria` nem em canal de plataforma, que e o que
/// o criterio 10 da BICHUS-161 protege, e quem responde por isso e o portao de
/// diretivas abaixo. Medido pelo indice temporario (`GIT_INDEX_FILE` +
/// `read-tree HEAD` + `add -A` + `write-tree --prefix=app/lib/telas`) sobre o
/// commit desta branch.
/// **Destravado pela BICHUS-35**: a tela do achado avulso nasceu, e ela e uma
/// pasta nova em `app/lib/telas` -- `telas/achado/`, com
/// `tela_registrar_achado.dart` (F3.5), `tela_achado_registrado.dart` (o
/// desfecho, nos dois estados), `tela_do_achado.dart` (o achado pelo endereco
/// dele), `resultado_do_achado.dart` e `textos_do_achado.dart`.
///
/// Uma tela existente mudou, e a mudanca e **uma linha**:
/// `escanear/tela_leitor_de_qr.dart` tinha a porta de F3.5 desabilitada, com
/// o comentario "F3.5 e de outra historia" ao lado do `onPressed: null`. A
/// historia chegou, e o `null` virou `context.push`. **Nenhum botao novo
/// entrou na tela**, e isso foi escolha e nao sorte: a varredura de
/// `test/a11y/acao_de_controle_test.dart` conta os controles de cada tela, e
/// ela mora fora de `app/`.
///
/// Nenhuma das seis encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege: F3.5 pede foto **pela porta**, pelo escopo, do mesmo jeito que
/// `pet/tela_cadastrar_foto.dart` -- e o portao de diretivas abaixo continua
/// respondendo por isso, sem depender desta constante.
///
/// F3.5 tambem **nao** fala com a porta `Localizacao`: ela embute
/// `CapturaDeLocalizacao`, que e quem fala, e
/// `localizacao_no_ponto_de_uso_test.dart` cobra isso por lista de arquivos.
///
/// **Destravado pelo envio de foto do app (22/09/2026, sem chave de issue no
/// acionamento).** UM arquivo: `pet/tela_pet_cadastrado.dart`. Ate aqui
/// nenhum caminho do app mandava bytes para lugar nenhum -- F1.6 anunciava "a
/// foto ainda esta sendo enviada" sobre um envio inexistente, e
/// `PetsApi.intencaoDeFotoDoPet`, escrita na BICHUS-62, nunca tinha sido
/// chamada. A tela passou a chamar `EnvioDeFoto` e a dizer a verdade nos
/// quatro estados do envio, e a chamar `RetomadaDeFotos` em vez do mecanismo
/// cru -- e ela que guarda a foto no registro quando falta sinal (criterio 6
/// da BICHUS-87) e a tira de la quando ela sobe.
///
/// **Ela NAO encosta na porta `CameraEGaleria`, que e o que o criterio 10
/// protege.** A tela nao le camera, nao le galeria e nao pede permissao
/// nenhuma: ela recebe a [FotoLocal] ja escolhida por F1.4 e a entrega ao
/// mecanismo de envio, que vive em `lib/api/`. Quem le o arquivo do aparelho e
/// `CameraEGaleria.bytesDaFoto`, atras da porta, e o portao de diretivas
/// abaixo -- que nao depende desta constante -- continua cobrando que nenhuma
/// tela importe `image_picker` nem `permission_handler`.
///
///
/// **BICHUS-75, 22/09**: superado de novo. O aviso persistente de cadastro
/// acrescentou `app/lib/telas/avisos/aviso_de_cadastro_incompleto.dart` e
/// alterou `app/lib/telas/abas.dart` e
/// `app/lib/telas/perfil/meus_pets.dart`. Nenhuma das tres mudancas contorna
/// a porta `CameraEGaleria`, que e o que o criterio 10 da BICHUS-161 protege:
/// a historia nao encosta em camera, e o diff nao cita `CameraEGaleria`,
/// `ImagePicker` nem `Permission`. Anterior:
/// `f14551245240f69cfb43cb67216e2682cdb7684c`.
///
/// **Destravado pela BICHUS-29** (validacao de senha ao vivo, 22/09/2026).
/// Um arquivo muda: `conta/tela_criar_conta.dart`. Tres coisas nele:
/// o texto de ajuda fixo do campo de senha saiu e no lugar entrou
/// `RequisitosDaSenha`; a recusa de senha passou a ser decidida pela politica
/// inteira e pelo `code` do servidor, em vez de um teste de tamanho e de um
/// texto fixo; e a faixa de "este build nao registra aceite" passou a aparecer
/// na abertura da tela, com rolagem ate ela no toque do botao.
///
/// Nenhuma das tres encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege: a tela continua sem ler camera, galeria ou localizacao, e quem
/// cobra isso e o portao de diretivas abaixo, que nao depende desta constante.
///
/// Medido com o indice temporario, na arvore de trabalho:
/// `4be08548b405759c524cf6336451b53d03b2d184`.
///
/// **Destravado uma setima vez pela listagem de `Perto`** (regra de listagem
/// de 22/09/2026): `telas/perto/` e pasta nova, com
/// `lista_do_diretorio.dart`, e `abas.dart` mudou porque `AbaPerto` deixou de
/// ser casca honesta -- `GET /directory/entries` existe, e o `EstadoVazio`
/// "Perto esta em construcao" passou a ser uma afirmacao falsa sobre uma
/// secao que tem dado. Nenhuma das duas encosta na porta `CameraEGaleria`,
/// que e o que o criterio 10 protege, e quem responde por isso e o portao de
/// diretivas abaixo, que nao depende desta constante.
///
/// **O valor anterior desta constante era `ad6fde0e74c94b21c983c286d1557c07be291288`**,
/// medido pelo indice temporario na base `feat/perto-com-dados`. O
/// `f145512...` citado acima e de uma base anterior e ja nao valia.
///
/// `casca_com_abas.dart` entrou na mesma mudanca: `Perto` deixou de ser
/// `EstadoDaSecao.planejada` e virou `existe`, porque a secao tem conteudo e
/// porque `planejada` a esconderia da barra no build de entrega.
///
/// **Destravado uma oitava vez pela vitrine da `Loja`** (a Loja do MVP, que a
/// BICHUS-185 descreve, com a regra de listagem de 22/09/2026):
/// `telas/loja/` e pasta nova, com `vitrine_da_loja.dart`, e `abas.dart`
/// mudou porque `AbaLoja` deixou de ser casca honesta -- `GET /store/items`
/// existe, e o `EstadoVazio` "Loja esta em construcao" passou a ser uma
/// afirmacao falsa sobre uma secao que tem dado. `casca_com_abas.dart` entrou
/// junto, pela mesma razao de `Perto`: `Loja` virou `existe`, e o reforco da
/// pagina perdeu a promessa da plaquinha, que a secao C da BICHUS-185 tirou
/// da Loja no MVP.
///
/// Nenhuma das tres encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege: a vitrine nao tira foto, nao abre galeria e nao pede permissao
/// nenhuma. Quem responde por isso e o portao de diretivas abaixo, que nao
/// depende desta constante.
///
/// **O valor anterior desta constante era `4a29c9d07d3aaf5c4067be2885b3efbd8b4876e6`**,
/// medido na base `feat/tela-de-perto` (`98a91a2`).
///
/// **Remedido na mescla de `development` (920a221) nesta branch, 23/09/2026.**
/// Pelo mesmo motivo de sempre, e ele nao cansa de valer: os dois lados
/// destravaram a constante pela propria historia, e **a arvore que existe
/// depois da mescla nao e nenhuma das duas**. Desta branch veio a secao
/// `Rede`; da `development` veio a ancoragem do botao de criar conta no
/// rodape, que mexe em `telas/conta/`.
///
/// Nenhuma das pecas dos dois lados encosta na porta `CameraEGaleria`, e o
/// portao de diretivas abaixo continua cobrando isso sem depender desta
/// constante. Medido com o indice temporario deste portao sobre a arvore ja
/// mesclada. Anteriores: `59de12f643235735ac6a21249b1408fbf3651c93` (esta
/// branch) e `65bcd97d9088e6da8668127c8cb4d38f5e19d718` (`development`).
/// **Destravado uma nona vez pelo travamento de `Criar conta` em aparelho
/// fisico de 22/09/2026.** O cliente nao conseguia criar conta nem entrar, e
/// a varredura que saiu dali achou uma classe inteira: o `setState` que
/// desliga o carregando morava DENTRO do `catch (FalhaDeChamada)`, que parecia
/// exaustivo e nao era. Corpo 200 fora do contrato (`Pet.doJson` e
/// `Sessao.doJson` estouram `TypeError`), `PlatformException` de chaveiro ou
/// de disco e `MissingPluginException` deixavam a tela girando para sempre com
/// o erro engolido -- ou, onde havia `finally`, saindo do carregando e sem
/// dizer nada, que e o outro lado do mesmo defeito.
///
/// Nove arquivos de `app/lib/telas` ganharam o ramo que faltava, e nenhum
/// deles encosta na porta `CameraEGaleria`, que e o que o criterio 10 protege:
/// `conta/tela_criar_conta.dart`, `conta/tela_entrar.dart`,
/// `conta/tela_esqueci_minha_senha.dart`, `escanear/tela_leitor_de_qr.dart`,
/// `perdido/tela_alcance_do_alerta.dart`, `perfil/meus_pets.dart`,
/// `pet/campos_do_pet.dart`, `pet/tela_cadastrar_sinais.dart`,
/// `pet/tela_detalhe_do_pet.dart`, `pet/tela_editar_pet.dart` e
/// `pet/tela_pet_cadastrado.dart`.
///
/// **A trava reprovou, como tem de reprovar**, com
/// `f14551245240f69cfb43cb67216e2682cdb7684c` contra o
/// `fb8371eecdcfaa014f8f36bf8a4a39df937e3dae` medido pelo indice temporario
/// deste portao. O que sustenta o comportamento novo nao e esta constante:
/// e `test/telas/carregar_para_sempre_test.dart`, que reprova se "carregando
/// para sempre" -- ou o silencio no lugar dele -- voltar a ser alcancavel.
///
/// **Remedido no merge de `development` (19115f2) em 22/09/2026.** Os dois
/// lados destravaram a constante pelo proprio motivo, e por isso nenhum dos
/// dois valores vale depois do merge: a arvore mesclada nao e a que nenhuma
/// das duas mediu sozinha. O valor abaixo foi medido sobre a arvore ja
/// mesclada, com `git rev-parse HEAD:app/lib/telas`. As duas justificativas
/// acima seguem valendo e por isso ficaram as duas: elas dizem QUE mudou em
/// cada lado, e e isso que faz a troca continuar sendo um ato deliberado.
///
/// **Destravado pela GAVETA COM SUBMENUS, 22/09.** O pedido do cliente,
/// repetido duas vezes, acrescentou `app/lib/telas/gaveta_de_secoes.dart` e
/// alterou `app/lib/telas/casca_com_abas.dart` (a gaveta e o `leading` de 64
/// dp) e `app/lib/telas/abas.dart` (as cinco raizes se declaram raiz de
/// secao). Nenhuma das tres encosta na porta `CameraEGaleria`, que e o que o
/// criterio 10 da BICHUS-161 protege: a gaveta nao le camera, nao pede
/// permissao e nao cita `ImagePicker` nem `Permission` -- e o portao de
/// diretivas abaixo, que nao depende desta constante, continua cobrando isso
/// por conta propria.
///
/// O valor foi MEDIDO pelo indice temporario que este portao usa
/// (`GIT_INDEX_FILE` + `read-tree HEAD` + `add -A app/lib/telas` +
/// `write-tree --prefix=app/lib/telas`) sobre a arvore ja commitada, e nao
/// copiado de relato nenhum. Anterior:
/// `ad6fde0e74c94b21c983c286d1557c07be291288`.
///
/// **Destravado de novo pela BICHUS-234, 22/09**, e por UM arquivo:
/// `app/lib/telas/gaveta_de_secoes.dart`. Duas linhas do inventario de 27.5
/// da secao `Perto` estavam desatualizadas contra a tela que foi construida:
/// `Profissionais e estabelecimentos` saiu de `planejada` para `existe`, e
/// `Filtros` saiu de folha inferior `planejada` para `acaoNaTela` `existe`,
/// porque o controle de filtro daquela tela vive no corpo e nao em folha.
/// Nenhuma das duas encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 da BICHUS-161 protege: sao linhas de um mapa, sem camera, sem galeria e
/// sem permissao, e o portao de diretivas abaixo continua cobrando isso por
/// conta propria, sem depender desta constante.
///
/// Medido pelo mesmo indice temporario descrito acima, sobre a arvore de
/// trabalho. Anterior: `1774532baa910c4cf8f4331631a81698f4c5b0ac`.
///
/// **Remedido no merge de `feat/gaveta-com-submenus` para a `development`,
/// 23/09/2026.** Os dois lados do conflito estavam certos sobre a propria
/// historia e errados sobre o resultado: `657d32eb...` e a arvore de um lado,
/// `5fe2df53...` e a do outro, e a arvore que existe depois do merge nao e
/// nenhuma das duas. O valor abaixo foi MEDIDO com o mesmo indice temporario
/// que este portao usa, sobre a arvore ja mesclada. As justificativas acima
/// ficaram TODAS: cada uma diz o que mudou de um lado, e e isso que mantem a
/// troca sendo um ato deliberado.
///
/// **Destravado uma oitava vez pela mescla de `development` nesta branch, e a
/// trava disparou por dois motivos somados, nao por um.** Da `development`
/// entrou a pasta `telas/achado/` inteira e a porta de F3.5 ligada em
/// `escanear/tela_leitor_de_qr.dart`; desta branch entrou
/// `escanear/tela_do_pet_da_tag.dart` e a tela do leitor que deixou de
/// descartar o retorno de `tags.resolver`.
///
/// **As duas mudancas na tela do leitor nao se excluem, e o conflito que o Git
/// mostrou nesse arquivo era de formatacao.** Esta branch reformatou
/// `tela_leitor_de_qr.dart` inteiro, o alinhamento de linhas deslizou, e o
/// corpo de `Digitar de novo` (BICHUS-153) foi casado com o corpo da saida de
/// F3.5 (BICHUS-35) como se fossem o mesmo botao. Sao dois `TextButton`
/// distintos, em condicoes distintas: `Digitar de novo` so existe enquanto o
/// 404 do caminho digitado esta na faixa, e `Registrar que achei um pet` existe
/// sempre. A mescla ficou com os dois, e **nenhum botao novo entrou na tela**.
///
/// Nenhuma das pecas encosta na porta `CameraEGaleria`, que e o que o criterio
/// 10 protege, e o portao de diretivas abaixo continua respondendo por isso sem
/// depender desta constante.
///
/// **Remedido no merge de `feat/tela-do-pet-apos-escanear`
/// para a `development`, 23/09/2026.** Os dois lados do conflito estavam
/// certos sobre a propria historia e errados sobre o resultado:
/// `fe88e1df...` e a arvore de um lado, `a4d5b9bf...` e a do
/// outro, e a arvore que existe depois do merge nao e nenhuma das duas. O
/// valor abaixo foi MEDIDO com o mesmo indice temporario que este portao usa,
/// sobre a arvore ja mesclada. As justificativas acima ficaram TODAS: cada
/// uma diz o que mudou de um lado, e e isso que mantem a troca sendo um ato
/// deliberado.
///
/// **Remedido no merge de `development` (38371aa) nesta branch, 23/09/2026.**
/// Os dois lados destravaram a constante pelo proprio motivo e os dois valores
/// morreram no merge: `da86c7e4f32392f54c088b25bd9307581eefda49` e a arvore
/// desta branch sozinha, `72832de16b55beaff488096e442d64b1846bed0c` e a da
/// `development` sozinha, e a arvore que existe depois do merge nao e nenhuma
/// das duas. O valor abaixo foi MEDIDO com o mesmo indice temporario que este
/// portao usa, sobre a arvore ja mesclada. As justificativas acima ficaram
/// TODAS, dos dois lados: cada uma diz o que mudou de um lado, e e isso que
/// mantem a troca sendo um ato deliberado.
///
/// **Destravado pela ancoragem do botao de `Criar conta`, 23/09/2026 (sem
/// chave de issue no acionamento).** UM arquivo de `app/lib/telas` muda:
/// `conta/tela_criar_conta.dart`. Tres coisas nele, e nenhuma encosta na
/// porta `CameraEGaleria`, que e o que o criterio 10 da BICHUS-161 protege:
///
///  - o botao saiu do corpo rolavel e foi para `BarraDeAcaoFixa`, no
///    `bottomNavigationBar` (design system 11.8), porque medido em 360 x 640
///    dp com o teclado aberto ele ficava 500 dp abaixo da dobra e o `ListView`
///    nem chegava a constru-lo;
///  - o corpo virou `SingleChildScrollView` com `Column`, pelo mesmo motivo
///    registrado em `pet/tela_editar_pet.dart`: controle obrigatorio que nao
///    e construido nao pode ser marcado, focado nem lido por leitor de tela;
///  - cada recusa passou a trazer o campo recusado para a janela, porque um
///    botao alcancavel de qualquer ponto pode ser tocado de um ponto onde o
///    campo recusado esta fora da tela.
///
/// A tela continua sem ler camera, galeria ou localizacao, e quem cobra isso e
/// o portao de diretivas abaixo, que nao depende desta constante. Medido pelo
/// indice temporario que este portao usa, sobre a arvore de trabalho.
/// Anterior: `74dc7b2c06f3ee25b139b9517824614656db73c2`.
/// **Remedido na mescla de `development` (38371aa) nesta branch, 23/09/2026.**
/// Os dois lados destravaram a constante pelo proprio motivo, e por isso
/// nenhum dos dois valores vale depois da mescla: a arvore mesclada nao e a
/// que nenhum dos dois mediu sozinho. Desta branch veio a vitrine da `Loja`
/// (`telas/loja/`, com `abas.dart` e `casca_com_abas.dart`); da `development`
/// vieram a gaveta de secoes, os nove ramos de erro que tiravam o
/// `carregando para sempre` e a tela do pet da tag.
///
/// Nenhuma das pecas dos dois lados encosta na porta `CameraEGaleria`, que e
/// o que o criterio 10 da BICHUS-161 protege: a vitrine nao tira foto, nao
/// abre galeria e nao pede permissao, e o portao de diretivas abaixo, que nao
/// depende desta constante, continua cobrando isso por conta propria.
///
/// O valor abaixo foi MEDIDO com o mesmo indice temporario que este portao
/// usa (`GIT_INDEX_FILE` + `read-tree HEAD` + `add -A app/lib/telas` +
/// `write-tree` + `rev-parse <arvore>:app/lib/telas`) sobre a arvore ja
/// mesclada, e nao copiado de relato nenhum. As justificativas acima ficaram
/// TODAS: cada uma diz o que mudou de um lado, e e isso que mantem a troca
/// sendo um ato deliberado. Anteriores:
/// `47d3281e75ece2ffd5e85586047c465868427d6f` (esta branch) e
/// `72832de16b55beaff488096e442d64b1846bed0c` (`development`).
// BICHUS-251 (ADR-0025): a secao `Rede` ganhou tela. `app/lib/telas/rede/`
// nasceu com a agenda e o detalhe do encontro, e `abas.dart` perdeu a casca
// honesta. Nenhuma tela mudou por causa da camera -- que e o que o criterio
// 10 vigia --, e a porta `CameraEGaleria` nao foi tocada.
///
/// **Remedido na mescla de `feat/tela-de-loja` (69c6a27) nesta branch,
/// 23/09/2026.** Os dois lados destravaram a constante pelo proprio motivo, e
/// por isso **nenhum dos dois valores vale depois da mescla**: a arvore
/// mesclada nao e a que nenhum dos dois mediu sozinho. Desta branch veio a
/// secao `Rede` (`telas/rede/`, com `abas.dart` e `casca_com_abas.dart`); do
/// outro lado veio a identidade interna da vitrine, que nao toca em
/// `app/lib/telas`.
///
/// Nenhuma das pecas dos dois lados encosta na porta `CameraEGaleria`, que e o
/// que o criterio 10 da BICHUS-161 protege, e o portao de diretivas abaixo
/// continua cobrando isso por conta propria, sem depender desta constante.
///
/// O valor abaixo foi MEDIDO com o mesmo indice temporario que este portao usa
/// (`GIT_INDEX_FILE` + `read-tree HEAD` + `add -A app/lib/telas` +
/// `write-tree` + `rev-parse <arvore>:app/lib/telas`) sobre a arvore ja
/// mesclada, e nao copiado de relato nenhum. As justificativas acima ficaram
/// TODAS, dos dois lados: cada uma diz o que mudou de um lado, e e isso que
/// mantem a troca sendo um ato deliberado. Anteriores:
/// `a64f0919fd008d7165c19d40149e74431b8ae019` (esta branch) e
/// `77a37422c91cce0d6d91b979bbdc2835da0ea585` (`feat/tela-de-loja`).
///
/// **Remedido na mescla de `development` (920a221) nesta branch, 23/09/2026.**
/// Pelo mesmo motivo de sempre: os dois lados destravaram a constante pela
/// propria historia, e **a arvore que existe depois da mescla nao e nenhuma
/// das duas**. Desta branch veio a secao `Rede` (`telas/rede/`); da
/// `development` veio a ancoragem do botao de `Criar conta` no rodape, que
/// mexe em `telas/conta/tela_criar_conta.dart`.
///
/// Nenhuma das pecas dos dois lados encosta na porta `CameraEGaleria`, e o
/// portao de diretivas abaixo continua cobrando isso sem depender desta
/// constante. Medido com o indice temporario deste portao sobre a arvore ja
/// mesclada, e nao copiado de relato nenhum. As justificativas acima ficaram
/// TODAS, dos dois lados. Anteriores:
/// `59de12f643235735ac6a21249b1408fbf3651c93` (esta branch) e
/// `65bcd97d9088e6da8668127c8cb4d38f5e19d718` (`development`).
///
/// **Destravado pela emenda da BICHUS-251, 23/09/2026: check-in e galeria
/// saem do app nesta versao, por decisao do cliente.** Mudam
/// `rede/encontro_da_rede.dart` (sem botao de confirmar presenca, sem contagem
/// e sem galeria), `rede/agenda_da_rede.dart` (o cartao perde a linha de
/// contagem) e `abas.dart` (so o comentario da secao). Nenhuma delas encosta
/// na porta `CameraEGaleria`, que e o que o criterio 10 da BICHUS-161
/// protege, e o portao de diretivas abaixo continua cobrando isso sem
/// depender desta constante. O trabalho removido esta na branch
/// `guarda/rede-checkin-galeria`. Medido com `git rev-parse
/// HEAD:app/lib/telas` sobre o commit da emenda (9c9a72d), e conferido contra
/// o "encontrado" que este portao imprimiu antes da troca. Anterior:
/// `e113de4b6d5741694bde0b5a3135817229911625`.
///
/// **Remedido no merge de `feat/tela-de-loja` para a `development`,
/// 23/09/2026, e pela terceira vez seguida pelo mesmo motivo.** Os dois
/// lados estavam certos sobre a propria historia e errados sobre o
/// resultado: `65bcd97d9088e6da8668127c8cb4d38f5e19d718` e a arvore de um
/// lado (a validacao de senha ao vivo, ja na `development`),
/// `77a37422c91cce0d6d91b979bbdc2835da0ea585` e a do outro (a vitrine da
/// `Loja`), e a arvore que existe depois do merge nao e nenhuma das duas:
/// `telas/loja/` e `telas/perto/` entram inteiras ao lado do
/// `conta/tela_criar_conta.dart` reescrito, e nenhuma soma de dois hashes
/// produz o terceiro.
///
/// Nenhuma das pecas dos dois lados encosta na porta `CameraEGaleria`, que e
/// o que o criterio 10 da BICHUS-161 protege: nem a vitrine, nem a listagem
/// de `Perto`, nem a barra de acao fixa de `Criar conta` leem camera ou
/// galeria ou pedem permissao. Quem cobra isso e o portao de diretivas
/// abaixo, que nao depende desta constante.
///
/// O valor abaixo foi MEDIDO com o mesmo indice temporario que este portao
/// usa (`GIT_INDEX_FILE` + `read-tree HEAD` + `add -A app/lib/telas` +
/// `write-tree` + `rev-parse <arvore>:app/lib/telas`) sobre a arvore ja
/// mesclada, e nao copiado de relato nenhum. As justificativas acima ficaram
/// TODAS, dos dois lados: cada uma diz o que mudou de um lado, e e isso que
/// mantem a troca sendo um ato deliberado.
/// **Destravado pelas duas telas de conta que faltavam, 23/09/2026 (sem chave
/// de issue no acionamento).** DOIS arquivos de `app/lib/telas` mudam:
/// `conta/tela_entrar.dart` e `conta/tela_esqueci_minha_senha.dart`. Eram as
/// duas ultimas das tres telas de conta fora do padrao 11.8 do design system;
/// a terceira, `conta/tela_criar_conta.dart`, entrou pela manha.
///
/// O que mudou nas duas, e nada disso encosta na porta `CameraEGaleria`, que
/// e o que o criterio 10 da BICHUS-161 protege:
///
///  - a acao primaria saiu do corpo rolavel e foi para `BarraDeAcaoFixa`, no
///    `bottomNavigationBar`. Medido com o teclado de 270 dp aberto: `Entrar`
///    ficava 100 dp abaixo da dobra em 320 x 568 e 28 dp em 360 x 640, e
///    `Enviar o link` ficava 78 dp e 6 dp nos mesmos dois gabaritos. Depois do
///    401 -- o estado de quem ja tem conta e errou a senha -- faltavam 360 dp
///    em 320 x 568 e 231 dp em 375 x 667, um gabarito em que a tela estava
///    certa antes do erro;
///  - o corpo virou `SingleChildScrollView` com `Column`, pelo motivo ja
///    registrado em `pet/tela_editar_pet.dart` e em F1.1: em 320 x 568 o
///    `ListView` nao chegava a CONSTRUIR o botao das duas telas, e controle
///    que nao esta na arvore nao pode ser focado nem lido por leitor de tela;
///  - cada recusa passou a trazer a faixa para dentro da janela, porque um
///    botao alcancavel de qualquer ponto pode ser tocado de um ponto em que a
///    recusa esta fora da tela.
///
/// A `C.4` ganhou uma barra que troca de acao com a fase, porque a tela tem
/// duas acoes e nunca as duas ao mesmo tempo: `Enviar o link` antes do pedido,
/// `Reenviar o link` depois dele.
///
/// Quem cobra o comportamento nao e esta constante, e sim
/// `test/telas/acao_primaria_fora_da_rolagem_test.dart`, que toca no botao SEM
/// rolar no menor gabarito e mede a requisicao do outro lado. Medido pelo
/// indice temporario que este portao usa, sobre a arvore de trabalho.
/// Anterior: `883961325403f0e22fe845c4442014e93ff1e479`.
///
/// DESTRAVADO pelas tres ligacoes que faltavam no app (o aviso ao tutor pela
/// plaquinha, o ouvinte de push e o dreno da fila offline). Duas telas mudaram,
/// e **nenhuma das duas contorna a porta `CameraEGaleria`** -- que e o que o
/// criterio 10 da BICHUS-161 cobra:
///
/// - `telas/escanear/tela_do_pet_da_tag.dart` ganhou o botao `Avisar o tutor`.
///   Ele chama `TagsApi.avisarOTutor`, uma rota do contrato. Nenhum plugin de
///   aparelho, nenhum canal de plataforma: o portao ESTRUTURAL abaixo continua
///   valendo sobre este arquivo e continua verde, e e ele que pega o contorno de
///   verdade.
/// - `telas/casca_com_abas.dart` ganhou a faixa do aviso que chegou. Ela le um
///   `ChangeNotifier` do escopo; o `firebase_messaging` fica atras da porta
///   `MensagensDePush`, em `lib/dispositivo/`, que e exatamente onde o portao
///   estrutural manda que ele fique.
///
/// A foto continua entrando pela porta: nenhuma tela do assistente de cadastro
/// (`app/lib/telas/pet/`) mudou nesta rodada.
///
/// Troca de 28/09, correcao da paginacao das listagens (sem chave de issue no
/// acionamento): `telas/perto/lista_do_diretorio.dart` e
/// `telas/loja/vitrine_da_loja.dart` passaram a acumular as paginas e a pedir a
/// seguinte pelo `RodapeDaPaginacao`. Nada a ver com camera: nenhuma das duas
/// toca em foto, e as telas do assistente de cadastro (`app/lib/telas/pet/`)
/// seguem intocadas.
///
/// Troca de 28/09, correcao do truncamento silencioso na digitacao do codigo da
/// plaquinha (achado do cliente por telefone, sem chave de issue no
/// acionamento). DOIS arquivos de `app/lib/telas` mudam, e **nenhum dos dois
/// encosta na porta `CameraEGaleria`** -- que e o que o criterio 10 da
/// BICHUS-161 protege:
///
/// - `escanear/mascara_do_codigo_da_tag.dart` parou de descartar entrada em
///   silencio. Ela cortava no 16o simbolo e apagava o `U` sem nada na tela
///   mudar: quem colava um codigo de 26 simbolos mandava os 16 primeiros ao
///   servidor e lia uma recusa sobre um codigo que nunca digitou. Agora ela
///   descarta apenas o que `normalizarCodigoDaTag` tambem descarta
///   (`[^0-9A-Za-z]`), e formata em grupos de quatro tantos quantos vierem.
/// - `escanear/tela_leitor_de_qr.dart` passou a conferir a FORMA do codigo
///   digitado -- tamanho e alfabeto -- antes de chamar `GET /v1/tags/{code}`,
///   com o numero na mensagem. O simbolo de verificacao continua sendo do
///   servidor (ADR-0004, Emenda 1): **nada da aritmetica dele entrou no app**,
///   e ha caso cobrando isso nos dois sentidos.
///
/// A mudanca e do TECLADO, e nao da camera: `escanear/codigo_lido_do_qr.dart`
/// ganhou o diagnostico de forma e `temFormaDeCodigoDeTag` passou a derivar
/// dele, com o comportamento do caminho do QR identico entrada por entrada. As
/// telas do assistente de cadastro (`app/lib/telas/pet/`) seguem intocadas, e
/// nenhuma tela ganhou importe de plugin de aparelho -- quem pega o contorno de
/// verdade e o portao ESTRUTURAL abaixo, que continua valendo e continua verde.
///
/// Medido pelo indice temporario que este portao usa, sobre a arvore de
/// trabalho. Anterior: `cfba3eb42ecc9c32b91a500e7748fb50463a7b92`.
///
/// Troca de 28/09, correcao da gaveta lateral (sem chave de issue no
/// acionamento: o cliente reprovou o menu por escrito e a correcao saiu na
/// hora): `telas/gaveta_de_secoes.dart` passou a mostrar so o submenu da secao
/// atual, uma linha por item, e `telas/casca_com_abas.dart` deixou de montar a
/// gaveta e o gatilho nas secoes sem sub-destino. Nada a ver com camera:
/// nenhuma das duas toca em foto, e as telas do assistente de cadastro
/// (`app/lib/telas/pet/`) seguem intocadas.
///
/// **Destravado na integracao de 28/09/2026 que juntou o codigo da plaquinha
/// e a gaveta na `development`**, com `e180a88c22a8cf905ef8d5f38a260b3399d4a7ce`.
/// Essa trava intermediaria viveu um commit e esta registrada aqui para que a
/// procedencia nao tenha buraco.
///
/// Troca de 28/09, transporte de e-mail real (sem chave de issue no
/// acionamento): `telas/conta/tela_verifique_seu_email.dart` parou de AFIRMAR
/// que o e-mail de verificacao foi enviado. O 201 do cadastro prova que a conta
/// nasceu, e nada mais -- o envio e engolido por um `try/catch` no servidor, por
/// decisao (criterio 3 de BICHUS-147). A tela passou a dizer o estado e o
/// remedio, que sao verdade independentemente do que aconteceu no envio.
///
/// Nada a ver com camera: a tela nao toca em foto, nao importa plugin de
/// aparelho nenhum -- o portao ESTRUTURAL abaixo continua valendo sobre ela e
/// continua verde -- e as telas do assistente de cadastro (`app/lib/telas/pet/`)
/// seguem intocadas.
///
/// **Destravado de novo na MESMA integracao de 28/09/2026, quando o
/// transporte de e-mail real entrou por decisao do cliente** e a mescla
/// passou a ter TRES correcoes dentro (sem chave de issue no acionamento: as
/// tres sairam de achado do cliente). O motivo do bump e o MERGE: cada
/// branch travou a arvore que ELA produziu -- `ed8f71b6` a do codigo da
/// plaquinha, `587b9bb6` a da gaveta, `5523613a` a do e-mail --, e a arvore
/// que tem as tres dentro nao e nenhuma das tres. Os seis arquivos que
/// mudaram sao exatamente a uniao dos tres conjuntos
/// (`escanear/mascara_do_codigo_da_tag.dart`, `escanear/codigo_lido_do_qr.dart`,
/// `escanear/tela_leitor_de_qr.dart`, `gaveta_de_secoes.dart`,
/// `casca_com_abas.dart` e `conta/tela_verifique_seu_email.dart`): nada entrou
/// aqui que nao estivesse em uma das tres travas ja justificadas, nenhum deles
/// encosta na porta `CameraEGaleria` e nenhum ganhou importe de plugin de
/// aparelho -- quem cobra isso e o portao ESTRUTURAL abaixo, que continua
/// valendo e continua verde. As telas do assistente de cadastro
/// (`app/lib/telas/pet/`) seguem intocadas.
///
/// Medido pelo indice temporario que este portao usa, sobre a arvore de
/// trabalho da mescla. Anterior: `e180a88c22a8cf905ef8d5f38a260b3399d4a7ce`
/// (a mescla de duas), e antes dela as tres travas de branch citadas acima.
///
/// ---- procedencia do outro lado da mescla de 29/09 ----
///
/// Remedida na mescla de `origin/development` (`b3360aa`) na
/// `integracao/backoffice-v1`, 28/09/2026: a arvore mesclada junta as telas da
/// Rede (rede-admin) com a paginacao acima, e nao e nenhuma das duas. Medido
/// com o indice temporario deste portao sobre a arvore mesclada.
/// **Remedido na mescla de `development` (`09c430a`) na
/// `feat/secao-rede-emenda-servidor`, 23/09/2026.** Os dois lados
/// destravaram a constante pela propria historia: desta branch, a emenda da
/// Rede (`5669853d...`); da `development`, as telas de conta com a acao
/// primaria fora da rolagem (`cad6c7b5...`). A arvore mesclada nao e nenhuma
/// das duas. Nenhuma das pecas encosta na porta `CameraEGaleria`. Medido com
/// o indice temporario deste portao sobre a arvore ja mesclada.
///
/// **Destravado pela Rede no desenho novo (BICHUS-251, emendada, e
/// BICHUS-279), 28/09/2026.** Mudam `rede/agenda_da_rede.dart` (abas
/// `Próximos`, `Meus pedidos` e `Encerrados` na `BarraDeListagem`),
/// `rede/encontro_da_rede.dart` (capa, secoes, pedido do privado, cancelado e
/// encerrado) e entram `rede/cartao_do_encontro.dart`,
/// `rede/local_do_encontro.dart` (mapa estatico pela `/location`, so com
/// conta) e `rede/pecas_da_rede.dart`. Nenhuma delas encosta na porta
/// `CameraEGaleria`: nao leem camera nem galeria e nao pedem permissao
/// nenhuma (o calendario e o app de mapas saem por
/// `dispositivo/saida_do_app.dart`, sem permissao), e o portao de diretivas
/// abaixo continua cobrando isso sem depender desta constante. Medido com
/// `git rev-parse HEAD:app/lib/telas` sobre o commit `d897eef` da
/// branch `feat/secao-rede-app-desenho-novo`, e conferido contra o
/// "encontrado" que este portao imprimiu antes da troca. Anterior:
/// `61c6945773d63c8f502e26039f0b69435f03659c`.
///
/// **Destravado pelas correcoes do QA na Rede (BICHUS-251), 28/09/2026.**
/// Mudam `rede/agenda_da_rede.dart` (paginacao, espera da busca, distancias
/// desacopladas e presas a regiao cadastrada, microcopy A4/A13/A14),
/// `rede/encontro_da_rede.dart` (falha do pedido dentro da caixa, retomada
/// da guarda, microcopy A5) e `rede/cartao_do_encontro.dart` (pilula so com
/// rotulo). Nenhuma encosta na porta `CameraEGaleria`. Medido com `git
/// rev-parse HEAD:app/lib/telas` sobre `11d36d9`, conferido contra o
/// "encontrado" do portao. Anterior: `d555005fb7c327572091b26863473674fcd6e965`.
///
/// **Destravado pela regiao na assinatura das distancias (BICHUS-251),
/// 28/09/2026.** Muda so `rede/agenda_da_rede.dart`, que passa a regiao de
/// referencia a `assinaturaDasDistancias`. Nao encosta na porta
/// `CameraEGaleria`. Medido com `git rev-parse HEAD:app/lib/telas` sobre
/// `2533bfa`. Anterior: `123dc34cc1100ee38bc0571a36bab5b5e25238ca`.
///
/// **Destravado pela microcopy N7 e N8 da UX 30.6 (BICHUS-251),
/// 28/09/2026.** Mudam dois textos em `rede/agenda_da_rede.dart` e
/// `rede/encontro_da_rede.dart`. Nao encosta na porta `CameraEGaleria`.
/// Medido com `git rev-parse HEAD:app/lib/telas` sobre `1c99ff7`. Anterior:
/// `913a54008f37a5dcf6efba87b080b3000cf4b4f3`.
///
/// **Remedido na mescla de `feat/secao-rede-app-desenho-novo` (`1a51c07`) na
/// `integracao/backoffice-v1`, 28/09/2026.** A arvore mesclada junta a Rede no
/// desenho novo com a paginacao da `development`, e nao e nenhuma das duas.
/// Medido com o indice temporario deste portao sobre a arvore mesclada.
/// Anteriores: `863560db...` (integracao) e `c0d5bd30...` (desenho novo).
///
/// **Remedido pela BICHUS-251, 28/09/2026:** `rede/local_do_encontro.dart`
/// passou a ler o endereco dos tiles e o `User-Agent` do build
/// (`config/mapa.json`, portao de portabilidade). Nao toca camera nem aparelho.
/// Anterior: `6bcbdd0f...`.
///
/// **Remedido na mescla de `integracao/backoffice-v1` na `development`,
/// 29/09/2026** (fechar o paralelismo de branches, por decisao do cliente:
/// tudo que se faz tem que refletir no ambiente). A arvore mesclada junta as
/// telas da Rede do lado da integracao com o codigo da plaquinha, a gaveta e
/// a tela de verificacao de e-mail do lado da `development`, e NAO e nenhuma
/// das duas -- e por isso que a constante muda: pelo MERGE, e nao por uma
/// tela nova. Os doze arquivos que mudam sao exatamente a uniao dos dois
/// conjuntos ja justificados acima: `abas.dart`, `casca_com_abas.dart`,
/// `gaveta_de_secoes.dart`, `conta/tela_verifique_seu_email.dart`,
/// `escanear/codigo_lido_do_qr.dart`,
/// `escanear/mascara_do_codigo_da_tag.dart`,
/// `escanear/tela_leitor_de_qr.dart` e as cinco telas de
/// `rede/` (`agenda_da_rede.dart`, `cartao_do_encontro.dart`,
/// `encontro_da_rede.dart`, `local_do_encontro.dart`, `pecas_da_rede.dart`).
/// Nada entrou aqui que nao estivesse em uma das travas ja justificadas,
/// nenhum deles encosta na porta `CameraEGaleria` e nenhum ganhou importe de
/// plugin de aparelho -- quem cobra isso e o portao ESTRUTURAL abaixo, que
/// continua valendo e continua verde. `abas.dart` passou a montar
/// `AgendaDaRede()` no lugar do `EstadoVazio` "Rede esta em construcao", que
/// e o efeito que o cliente pediu para ver no ambiente.
///
/// Medido pelo indice temporario que este portao usa, sobre a arvore de
/// trabalho da mescla (`read-tree HEAD`, `add -A -- app/lib/telas`,
/// `write-tree`), e conferido por `ls-tree`. Anteriores:
/// `6d8d8235940c99a9ea5dbd5532aab678c49e4f0e` (`development`) e
/// `67a10122bd57d7231e13ebfc68d6615e94ef8e6d` (`integracao/backoffice-v1`).
///
/// DESTRAVADO EM 30/09 (lote de 30/09, BICHUS-278). UM arquivo muda:
/// `perto/lista_do_diretorio.dart`. A busca por nome no diretorio entrou no
/// contrato (`q` em `listDirectoryEntries`, `minLength: 3`), e o portao de
/// `app/test/telas/perto_com_dados_test.dart` cobra os DOIS sentidos: sem `q`
/// na rota o campo nao pode existir; com `q` na rota o campo passa a ser
/// obrigatorio. A tela montou `ControleDeBusca` com
/// `alcance: AlcanceDaBusca.servidor` no `BarraDeListagem` que ela ja
/// desenhava -- componente que ja existia, nenhum widget novo, nenhuma pasta
/// nova. Nao encosta na porta `CameraEGaleria` e nao ganhou importe de plugin
/// de aparelho: quem cobra isso e o portao ESTRUTURAL abaixo, que continua
/// valendo e continua verde. Anterior:
/// `5af94a5a286fc5e78b296fdd458b9a6058563fbe`.
///
/// DESTRAVADO EM 17/10 (BICHUS-278, o lote da `Loja`: link do produto, capa e
/// ordem das imagens, `Ler mais` no cartao, e a tela de detalhe). O valor
/// abaixo e o da arvore MESCLADA, e nao o de nenhuma das branches: as duas
/// destravaram por conta propria e nenhum dos dois valores sobrevive a uniao.
/// Recalculado aqui, com o mesmo indice temporario que o portao usa.
///
/// O que muda em `app/lib/telas/`:
///
///   - `loja/vitrine_da_loja.dart`: a saida do cartao passou a chamar
///     `SaidaDoApp.atual.abrirLink` no lugar de `launchUrl` direto -- a mesma
///     porta que `rede/encontro_da_rede.dart` ja usa para o link do convite
///     --, e a tela com isso **perdeu** o importe de `package:url_launcher/`.
///     O cartao ganhou a imagem de capa, o `Ler mais` da descricao e o toque
///     que leva ao detalhe, e `AvisoDoParceiroDaLoja` e `BotaoDeSaidaDaLoja`
///     viraram publicos para a tela nova reusar em vez de reimplementar.
///   - `loja/produto_da_loja.dart`: nasce, a tela de detalhe do produto. A
///     galeria de ate oito imagens nao tinha onde aparecer.
///
/// Esta trava anda na direcao que o portao ESTRUTURAL abaixo quer, e nao
/// contra ele: uma tela a menos falando com plugin de aparelho, e a tela nova
/// desenha `Image.network` com a URL que o servidor mandou -- nenhum importe
/// de plugin, nenhum canal de plataforma. **A camera nao entra nisso e a porta
/// `CameraEGaleria` nao foi tocada.** Anteriores:
/// `878dd2fa0cce8bb9d906e4391d1add202aeafb95` (01/10),
/// `fffa4cb0cced92dac6108ad97cc649adf65e997a` (`feat/loja-link-externo`) e
/// `a2ee078f99dbc688f22d69472aaef2f91a48c6b8`
/// (`feat/loja-detalhe-do-produto`).
///
/// DESTRAVADO EM 17/10 (BICHUS-278, o pedido da plaquinha da coleira). O
/// motivo, em uma frase: **o botao `Fazer a tag da coleira` nao estava
/// quebrado, ele nao tinha destino**, e o cliente pediu o destino.
///
/// O que muda em `app/lib/telas/`:
///
///   - `pet/tela_solicitar_plaquinha.dart`: nasce, o formulario do pedido. Ela
///     monta `SeletorDeLista`, `BichuField` e `BotaoPrimario` dentro de
///     `BarraDeAcaoFixa` -- **tres componentes que ja existiam, nenhum widget
///     novo**, que e a condicao para a tela nascer em codigo em vez de esperar
///     o desenho;
///   - `pet/tela_pet_cadastrado.dart`: o botao sai de `aoTocar: null` e passa a
///     empurrar `Rotas.solicitarPlaquinha`. O `null` era o criterio 2 da
///     BICHUS-62 sendo cumprido (acao sem destino nao se renderiza), e agora o
///     destino existe: `POST /v1/pets/{petId}/tag-requests` e a tela acima;
///   - `pet/tela_detalhe_do_pet.dart`: **so comentario de doc**. A linha que
///     dizia que as tres acoes da barra fixa "apontam para tela que nao
///     existe" ficou falsa para uma das tres, e deixa-la seria documentacao
///     mentindo. A tela continua sem barra de acao fixa, e o codigo dela nao
///     mudou.
///
/// Nenhuma das tres encosta na porta `CameraEGaleria` e nenhuma ganhou importe
/// de plugin de aparelho nem `dart:io` -- quem cobra isso e o portao
/// ESTRUTURAL abaixo, que continua valendo e continua verde. Medido pelo
/// indice temporario que este portao usa (`GIT_INDEX_FILE` + `read-tree HEAD`
/// + `add -A -- app/lib/telas` + `write-tree` +
/// `rev-parse <arvore>:app/lib/telas`), sobre a arvore de trabalho desta
/// branch, a partir de `1cce9f2` (`origin/development`).
///
/// **Nota honesta:** nesta branch nenhuma suite rodou, por decisao de quem
/// pediu a entrega. Este portao foi o UNICO caso executado isoladamente
/// (`flutter test test/dispositivo/porta_nao_contornada_test.dart`), que e o
/// que o procedimento de destravamento cobra. Anterior: `65dcb5c`.
///
/// DESTRAVADO DE NOVO EM 17/10, mesma historia, segunda rodada. O cliente
/// respondeu a pergunta que estava aberta: **o endereco de entrega entra, e e
/// obrigatorio** -- sem ele a administracao nao cumpre o pedido.
///
/// UM arquivo muda: `pet/tela_solicitar_plaquinha.dart`. Ele ganha os sete
/// campos do endereco (`Quem recebe`, CEP, rua, numero, complemento, bairro,
/// cidade) e o seletor de UF, que le a lista dos 27 de
/// `app/lib/api/estados_brasileiros.dart` -- **a tela nao escreve a segunda
/// lista**, e e por isso que ela pode cobrar a UF sem criar a fonte que
/// divergiria. A recusa passa a dizer QUAL campo falta, no proprio campo.
///
/// Continua sem componente novo (`BichuField` e `SeletorDeLista`, os dois ja
/// existiam), sem importe de plugin de aparelho e **sem consulta de CEP**: a
/// ADR-0006 proibe geocodificacao, e digitar o CEP nao preenche campo nenhum.
/// As outras duas telas do lote anterior nao mudaram nesta rodada. Anterior:
/// `a0f1b4a`.
///
/// DESTRAVADO PELA TERCEIRA VEZ EM 17/10, mesma historia. O cliente pediu duas
/// coisas: **busca de endereco pelo CEP** e **telefone do destinatario**.
///
/// UM arquivo muda, de novo: `pet/tela_solicitar_plaquinha.dart`.
///
///   - o CEP passa a preencher rua, bairro, cidade e estado, pelo ViaCEP com
///     BrasilAPI de reserva. **Quem fala com a rede e `api/busca_de_cep.dart`,
///     e nao a tela** -- a tela chama uma porta e nao sabe de onde vem a
///     resposta, que e o mesmo arranjo do envio de fotos;
///   - **isso nao e geocodificacao**: vem texto (rua, bairro, cidade, UF) e
///     nunca coordenada. A ADR-0006 proibe a coordenada, e o motivo esta
///     escrito do lado da chamada para ninguem "consertar" de volta;
///   - **nada disso pode travar o pedido**: servico fora, lento ou CEP
///     inexistente deixa os campos abertos e o botao vivo, e ha isca que
///     derruba a rede de CEP e afirma que o pedido vai assim mesmo;
///   - o campo de telefone entra, com a mascara de `formato/telefone.dart`
///     (arquivo novo, fora de `telas/`), mostrando `(11) 98765-4321` e
///     enviando `+5511987654321`.
///
/// Nenhum componente novo -- `BichuField` e `SeletorDeLista` de sempre --,
/// nenhum importe de plugin de aparelho e nenhum `dart:io` na tela: quem fala
/// HTTP e a porta, em `app/lib/api/`. Anterior: `6224791`.
///
/// `rede/local_do_encontro.dart` e `rede/encontro_da_rede.dart` nao mudaram
/// neste lote: a trava de 01/10 abaixo continua sendo a razao de eles estarem
/// como estao.
///
/// DESTRAVADO EM 17/10 (BICHUS-278, as DUAS ESCRITAS DA COMUNIDADE: marcar um
/// encontro na `Rede` e indicar um profissional no `Perto`). O cliente pediu
/// "os botoes na rede e no perto para o usuario criar os eventos e recomendar
/// os profissionais"; `createNetworkEvent` ja existia no contrato sem tela, e
/// a indicacao do `Perto` nao existia em lugar nenhum.
///
/// O que muda em `app/lib/telas/`:
///
///   - `rede/criar_encontro.dart`: nasce. O formulario de
///     `CommunityNetworkEventInput`, com os dois casos de recusa ditos com a
///     saida que os resolve.
///   - `perto/sugerir_profissional.dart`: nasce. A indicacao, que **nao
///     publica**: ela nasce pendente de revisao, porque e texto sobre um
///     TERCEIRO e nao sobre quem escreve.
///   - `rede/agenda_da_rede.dart` e `perto/lista_do_diretorio.dart`: cada uma
///     ganha a porta para a sua tela, no CORPO e acima dos controles de
///     listagem -- o slot unico de acao da `AppBar` continua livre.
///
/// **Esta trava anda na direcao do portao ESTRUTURAL abaixo, e nao contra
/// ele.** As duas telas novas nao falam com aparelho nenhum: nenhum importe de
/// plugin, nenhum canal de plataforma, nenhuma coordenada. A capa do encontro
/// ficou de fora desta rodada justamente por passar pela porta
/// `CameraEGaleria`, que outra frente esta mexendo -- a porta NAO foi tocada.
/// O unico recurso de aparelho que entra e `showTimePicker`, do proprio
/// Flutter, pela mesma via de `showDatePicker` que duas telas ja usam.
/// Anterior: `65dcb5cd25c486a5e7d537aeaec19566828420d5`.
/// **Destravado pelo NOME OBRIGATORIO NO CADASTRO (18/10/2026)**, pela queixa
/// do cliente: *"o campo de nome no cadastro do usuario e obrigatorio, hoje
/// ele esta cadastrando sem esse campo"*. Um arquivo desta pasta muda,
/// `conta/tela_criar_conta.dart`:
///
/// - o campo `Nome` ganhou `erro`, `limite` e o alvo de rolagem da recusa;
/// - `_criarConta` passou a recusar nome ausente, vazio e **so com espaco**,
///   pela regra de `validacao/nome_de_exibicao.dart` (arquivo novo, FORA
///   desta pasta, e por isso ele nao entra neste hash);
/// - o botao do rodape ficou bloqueado enquanto nao ha nome, e a linha
///   `nome: ... .isEmpty ? null : ...` -- que era a que apagava a chave em
///   silencio -- deixou de existir.
///
/// **Nenhuma porta de aparelho encostada**, que e o que o criterio 10
/// protege: a mudanca e de validacao de formulario. Nenhum importe de
/// plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` --
/// e o portao estrutural de diretivas deste mesmo arquivo continua
/// respondendo por isso.
///
/// Valor medido com `git rev-parse HEAD:app/lib/telas` sobre esta arvore
/// commitada, e nao copiado de relato.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA.** Havia quatro
/// frentes abertas neste repositorio em 18/10, e ao menos uma mexe em
/// `app/lib/telas` (`casca_com_abas.dart`, `abas.dart`, `perfil/*`,
/// `perto/lista_do_diretorio.dart`, `loja/*`). Valor de ramo isolado NAO
/// sobrevive a uniao -- foi exatamente assim que seis historias erraram o
/// hash na integracao de 22/09.
/// Anterior: `45b6093e7fd295e6ba36fb9b0081a8b08f7755b4`.
/// **Destravado de novo no MESMO DIA (18/10/2026)**, pela segunda metade da
/// decisao do cliente: *"nao permitir atualizar o cadastro, se nao tiver
/// algum nome cadastrado"*. Agora e
/// `perfil/tela_dados_pessoais.dart`, em dois pontos e so dois:
///
/// - `_conferir` perdeu o `_nome.text.isNotEmpty &&` que deixava o campo
///   VAZIO escapar da recusa -- era a porta pela qual `display_name: ""`
///   saia no PATCH e zerava a coluna;
/// - a frase `_TextosDosDados.nomeSoComEspaco` (*"Escreva o seu nome, ou
///   deixe o campo vazio para tira-lo."*) virou `nomePrecisaDeTexto`, numa
///   linha, porque a segunda metade dela passou a ser instrucao falsa.
///
/// **Nenhuma porta de aparelho encostada**: e validacao de formulario e uma
/// constante de texto. Medido em `app/test/telas/dados_pessoais_exige_nome_test.dart`.
///
/// **FRONTEIRA DECLARADA:** este mesmo arquivo de tela foi mexido hoje por
/// outra frente, no ramo `chore/remover-quatro-textos-18-10` (ainda nao
/// mesclado), que retira de la a linha do e-mail e os textos de senha. Os
/// dois pontos acima sao localizados e nao encostam nesses; quem mesclar
/// **recalcula este hash sobre a arvore mesclada**, como o paragrafo
/// anterior ja avisa.
/// Anterior: `26d2076350283395220e65985ba49c29387eed50`.
/// **Somado na mescla, do ramo `feat/minhas-indicacoes`:** BICHUS-278 18/10 (Minhas indicações): DOIS arquivos desta pasta mudam, e nenhum dos dois encosta em porta de aparelho. (1) `perto/minhas_indicacoes.dart` é ARQUIVO NOVO: a tela que o cliente pediu -- *"e a aba de minhas indicações, com o status se está pendente ou se já foi aprovado pelo administrador?"* -- e ela só lê `GET /v1/directory/suggestions` pela camada de API; nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissão, nenhum `dart:io`. (2) `gaveta_de_secoes.dart`: UMA linha de `SubDestino` na seção `Perto`, que é a porta de entrada da tela -- sem ela a tela fica alcançável só por URL. O portão estrutural de diretivas deste mesmo arquivo continua respondendo pelas duas, e ele passou. Valor LIDO DA PRÓPRIA FALHA deste portão nesta árvore (`encontrado:`), e não copiado de relato nem de outro ramo. **A QUEM MESCLAR: recalcule sobre a árvore MESCLADA**, pelo procedimento escrito acima; valor de ramo isolado não sobrevive à união -- e há cinco ramos tocando `app/lib/telas` nesta rodada. (antes: 45b6093e7f)
/// **Somado na mescla, do ramo `feat/acompanhar-pedido-plaquinha`:** BICHUS-278 (pedido da plaquinha, 18/10): DOIS arquivos de `app/lib/telas` mudam, e os dois sao pedido direto do cliente. (1) `pet/tela_solicitar_plaquinha.dart`: saiu o exemplo `cor da plaquinha` da observacao ("a cor sera unica") e saiu o botao `Pedir a plaquinha` da tela de sucesso ("ja foi pedido") -- ele ficava DESABILITADO, e o criterio 2 da BICHUS-62 proibe acao sem destino nem habilitada nem desabilitada; o desfecho virou o acompanhamento do pedido. (2) `pet/tela_acompanhar_plaquinha.dart`: ARQUIVO NOVO, a pagina privada de acompanhamento, que LE `GET /v1/pets/{petId}/tag-requests` -- a autorizacao e a clausula `WHERE` do servidor (404 e nunca 403, ADR-0021) e nenhuma conferencia de dono mora na tela. (3) `pet/tela_detalhe_do_pet.dart` e `pet/textos_do_detalhe.dart`: o link para essa pagina, que so aparece quando ha pedido. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o portao estrutural de diretivas deste mesmo arquivo continua respondendo por isso. Valor REPRODUZIDO pelo procedimento do proprio portao nesta arvore (`read-tree HEAD` + `add -A -- app/lib/telas` + `write-tree`, em `GIT_INDEX_FILE` proprio), e nao copiado de relato. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outros ramos tocando `app/lib/telas` hoje, e valor de ramo isolado nao sobrevive a uniao. (antes: 45b6093e7f)
/// **Somado na mescla, do ramo `feat/minhas-indicacoes`:** BICHUS-278 18/10 (Minhas indicações como ABA do Perto): TRÊS arquivos desta pasta mudam, e nenhum dos três encosta em porta de aparelho. (1) `perto/corpo_do_perto.dart`, ARQUIVO NOVO: a casca de abas da seção (`Profissionais` / `Minhas indicações`), com a mecânica de `rede/agenda_da_rede.dart` reusada. Ela nasceu em arquivo PRÓPRIO de propósito: a casca poderia ter nascido dentro de `perto/lista_do_diretorio.dart`, como a da Rede nasceu dentro da agenda, mas aquele arquivo está sendo editado por outra frente (a logo do profissional no cartão) -- e assim **zero linha** foi tocada lá. (2) `perto/minhas_indicacoes.dart`, ARQUIVO NOVO: o corpo da segunda aba, que só lê `GET /v1/directory/suggestions` pela camada de API. (3) `abas.dart`: `AbaPerto` passa a entregar `CorpoDoPerto` como único filho, com a porta de adoção como rodapé da aba da LISTA -- fora das abas ela apareceria embaixo de `Minhas indicações` também. Nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissão, nenhum `dart:io`; o portão estrutural de diretivas deste mesmo arquivo responde pelos três e passou. Valor LIDO DA PRÓPRIA FALHA deste portão nesta árvore (`encontrado:`), e não copiado de relato nem de outro ramo. **A QUEM MESCLAR: recalcule sobre a árvore MESCLADA**, pelo procedimento escrito acima -- há pelo menos quatro valores diferentes em ramos abertos tocando esta pasta hoje, e valor de ramo isolado não sobrevive à união. (antes: 2379100dab, e antes dele 45b6093e7f)
///
/// DESTRAVADO EM 18/10 (QA, rodada final da suite), valor
/// 45b6093e7fd295e6ba36fb9b0081a8b08f7755b4. QA 18/10 (rodada final da
/// suite): dois arquivos desta pasta mudam, e os dois sao CONSERTO DE
/// DEFEITO medido pela propria suite, nao tela nova. (1)
/// `pet/tela_solicitar_plaquinha.dart`: `_carregarPets()` saiu de
/// `initState` para `didChangeDependencies`, porque ler `Escopo` (um
/// `InheritedWidget`) antes de `initState` terminar estoura
/// `dependOnInheritedWidgetOfExactType ... before initState() completed` --
/// a tela NUNCA listava os pets e abria dizendo "servidor fora". Mesmo
/// arranjo e mesmo sinalizador de `pet/tela_editar_pet.dart` e
/// `perfil/meus_pets.dart`. (2) `perfil/tela_dados_pessoais.dart`: o campo
/// de telefone passou a ser preenchido por `telefoneDoE164` em vez de
/// `mascaraDeTelefone`, porque a mascara de DIGITACAO descarta o `+` e lia
/// `+5511987654321` como digitos locais -- o campo abria `(55) 11987-6543`
/// e um `Salvar` gravava `+5555119876543` por cima do telefone certo.
/// **Nenhuma porta de aparelho encostada**: as duas mudancas sao de ciclo
/// de vida e de formatacao de texto; nenhum importe de plugin, nenhum canal
/// de plataforma, nenhuma permissao, nenhum `dart:io`, e o portao
/// estrutural de diretivas deste mesmo arquivo continua respondendo por
/// isso. Valor LIDO DA PROPRIA FALHA deste portao nesta arvore
/// (`encontrado:`), e nao copiado de relato nem recalculado com comando de
/// escrita -- a tarefa desta rodada proibia comando git que escreve. **A
/// QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// escrito acima; valor de ramo isolado nao sobrevive a uniao. (antes:
/// 0c72963525)
///
/// DESTRAVADO EM 18/10 (a PINTURA das imagens do profissional e da foto do
/// proprio usuario). O cliente autorizou as tres: "pode liberar as imagens
/// do profissional no app" e "coloque um campo para o usuario cadastrar sua
/// propria foto e um selo na foto dele, se ele estiver validado". O
/// contrato, o servidor e o modelo Dart ja estavam prontos (1d2ccac1 e
/// 51696860); o que muda aqui e so a pintura. Tres arquivos desta pasta
/// mudam: `perto/lista_do_diretorio.dart` (a logo ao lado do nome no
/// cartao, quadrado de 56 dp, FORA da semantica porque o nome ja e o
/// rotulo), `perto/pagina_do_local.dart` (a faixa 16:9 com a foto do lugar,
/// de borda a borda, e so no detalhe: vinte faixas de 1280 x 720 numa
/// listagem seriam 65,6 MiB de imagem decodificada) e
/// `perfil/tela_dados_pessoais.dart` (o retrato da propria pessoa, a previa
/// do arquivo escolhido, o selo de `Me.email_verified` em cima dele e os
/// tres passos do envio). **Nenhuma porta de aparelho contornada, e o
/// portao estrutural deste mesmo arquivo responde por isso**: quem desenha
/// arquivo local continua sendo `widgets/previa_da_foto.dart` e quem
/// desenha imagem de servidor e `widgets/imagem_da_rede.dart` -- as duas
/// fora de `lib/telas`, porque `dart:io` e proibido aqui dentro. A tela de
/// dados pessoais importa `dispositivo/camera_e_galeria.dart`, que e a
/// PORTA (a mesma que o registro de achado e o cadastro de pet usam), e nao
/// o plugin: nenhum `package:image_picker/`, nenhum
/// `package:permission_handler/`, nenhum `dart:io`. Valor LIDO DA PROPRIA
/// FALHA deste portao nesta arvore (`encontrado:`), e conferido
/// reproduzindo o calculo do portao num indice temporario -- os dois deram
/// o mesmo hash. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**,
/// pelo procedimento escrito acima. Ha pelo menos quatro valores diferentes
/// em ramos abertos hoje, e valor de ramo isolado nao sobrevive a uniao.
///
/// **Destravado em 18/10/2026 pela dinamica do escanear e pelos quatro
/// defeitos conhecidos** (ramo `feat/escanear-e-quatro-defeitos`, base
/// `3f9a57c2`). UM arquivo desta pasta muda:
/// `escanear/tela_do_pet_da_tag.dart`, e as tres mudancas sao a dinamica que
/// o cliente definiu -- *"se eu escanear o qr-code abre a pagina do pet. se o
/// tutor marcou como perdido, abre a pagina para o usuario enviar mensagem ao
/// tutor"*. (1) o modo dono deixou de ser um beco: ele chama
/// `GET /tags/{code}/owner-context` e faz `pushReplacement` para
/// `Rotas.detalheDoPet`. (2) com `is_lost: true` a tela virou a pagina de
/// falar com o tutor, com campo de recado que vira `client_note` (campo que
/// JA estava no contrato e nenhum caminho do app mandava). (3) o desfecho do
/// aviso passou a sair de `owner_notified` em vez de afirmar sempre que o
/// tutor recebeu o push.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o unico
/// importe novo e `dart:async` (por `unawaited`) mais `go_router` e
/// `widgets/bichu_field.dart`, e o portao estrutural de diretivas deste mesmo
/// arquivo responde por isso e passou. A CAMERA continua atras da porta: este
/// ramo nao encosta em `escanear/tela_leitor_de_qr.dart`.
///
/// Valor REPRODUZIDO pelo procedimento do proprio portao nesta arvore
/// (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`,
/// `write-tree`, `rev-parse <arvore>:app/lib/telas`), e nao copiado de relato.
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras sessoes
/// tocando `app/lib/telas` nesta rodada, e valor de ramo isolado nao sobrevive
/// a uniao. (antes: dd6582d172)
///
///
/// DESTRAVADO EM 18/10 (a LISTAGEM PUBLICA DE PERDIDOS na aba `Pets` e a
/// lista dos MEUS ACHADOS no `Perfil`). A aba `Pets` -- a secao em que o
/// aplicativo ABRE -- dizia "A lista de pets perdidos esta em construcao", e
/// a frase era honesta: `listPublicLostPets` estava no contrato e **nao tinha
/// rota**, era a ultima linha de `OPERACOES_AINDA_SEM_ROTA`. A rota foi
/// registrada no mesmo commit. Quatro arquivos desta pasta mudam:
/// `perdido/lista_de_perdidos.dart` (NOVO, a listagem com `BarraDeListagem`
/// sem copia -- busca em largura total no corpo, filtro e ordem no slot unico
/// da barra, e o campo de CIDADE DIGITADA que o cliente autorizou para o
/// visitante sem conta), `perdido/cartao_do_perdido.dart` (NOVO, o cartao com
/// foto, bairro e quando o pet foi visto), `perfil/meus_achados.dart` (NOVO, a
/// lista de `listMyFoundReports`, que existia no servidor e nao tinha chamador
/// no app) e `abas.dart` (DUAS EDICOES MINIMAS: o `EstadoVazio` do corpo de
/// `AbaPets` virou `const ListaDePerdidos()`, e um `ItemDeMenu` de
/// `Meus achados` entrou no menu de `AbaPerfil` entre `Escanear uma tag` e
/// `Sair da conta`).
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. Quem desenha
/// imagem de servidor continua sendo `widgets/imagem_da_rede.dart`, FORA de
/// `lib/telas`; quem guarda a cidade escolhida no aparelho e
/// `sessao/cidade_escolhida.dart`, tambem fora, e pelo mesmo motivo.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// escrito acima. Este valor JA e o da uniao com `origin/development` em
/// 87979b6d (o lote de oito, as imagens do profissional e a foto do proprio
/// usuario entre eles): a colisao com 50b766d431 foi resolvida recalculando, e
/// nao escolhendo um dos dois lados. O CAMPO DE CIDADE DIGITADA entrou depois da mescla, no mesmo ramo, e por isso este valor e o SEGUNDO desta frente. (antes, por ramo isolado: 799b29b7b2; depois da mescla e antes da cidade: 0f927ff7ee;
/// no lado de development: 50b766d431)
///
/// DESTRAVADO EM 18/10 (O PET PERDIDO: pagina interna, acao inversa e os dois
/// padroes visuais). Quatro pedidos do cliente, nestas palavras: *"quando o pet
/// esta perdido, deve ter uma pagina interna do pet e um botao caso a pessoa
/// encontrou o animal"*; *"nao tem uma opcao de desmarcar como perdido ou que
/// foi encontrado"*; *"esse botao deve ter um padrao visual diferente quando
/// estiver perdido e quando nao estiver"*; e o campo rotulado `Sinais` passar a
/// ler `Sinais particulares` -- ele leu `Sinais` na tela e PERGUNTOU o que era.
///
/// Quatro arquivos desta pasta mudam:
/// `perdido/tela_do_caso_publico.dart` (NOVO, a pagina interna do perdido sobre
/// `getPublicLostCase`, com `Encontrei este animal` levando ao fluxo de achado
/// que JA existe -- `Rotas.registrarAchado` com o `share_token` no rascunho,
/// que e o que o contrato manda usar em `can_report_sighting`);
/// `perdido/lista_de_perdidos.dart` (UMA edicao: `aoTocar` do cartao, que era
/// nulo porque a tela de destino nao existia);
/// `perdido/cartao_do_perdido.dart` (SO PROSA: o paragrafo que dizia que aquela
/// tela "nao existe no app" deixou de ser verdade);
/// `pet/tela_detalhe_do_pet.dart` (`_acaoDeMarcarPerdido` virou
/// `_acaoDeEstadoDoPet`, com os dois padroes -- secundario de 48 dp quando nao
/// perdido, primario `critico` de 64 dp mais faixa de urgencia quando perdido
/// -- e o `Encontrei meu pet` sobre `closeLostCase`);
/// `pet/textos_do_detalhe.dart` (os textos novos e o rotulo dos sinais, que
/// reusa a constante do formulario em vez de criar uma segunda redacao).
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. Quem desenha
/// imagem de servidor continua sendo `widgets/imagem_da_rede.dart`, FORA de
/// `lib/telas`.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// escrito acima (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`).
/// Este valor foi calculado assim, sobre `origin/development` em `f8c74714`, e
/// **nao** copiado de ramo nem de relato. Valor de ramo isolado nao sobrevive a
/// uniao. (antes: 145640db9f)
///
/// DESTRAVADO EM 19/10 (REABRIR O CASO DE PERDIDO: a folha de confirmacao e o
/// desfazer). O contrato prometia, na descricao de `closeLostCase`, que
/// *"Encerrar e reversivel por 7 dias"*, e nomeava a operacao que faz a
/// reversao -- `reopenLostCase`, `POST /v1/lost-cases/{caseId}/reopen`, com um
/// `410` cuja descricao e *"Passou dos 7 dias"*. Ela **nunca ganhou rota**: era
/// uma linha de `OPERACOES_AINDA_SEM_ROTA`, e o caminho respondia 404. Entao
/// `Encontrei meu pet` -- que a branch anterior entregou -- era UM TOQUE, sem
/// confirmacao e sem desfazer, numa tela que se abre em panico.
///
/// DESTRAVADO EM 18/10 (a FOTO DO PERFIL DE QUEM NAO TEM NOME, defeito
/// relatado pelo cliente contra homologacao). UM arquivo desta pasta muda:
/// `perfil/tela_dados_pessoais.dart`, e a mudanca sao duas coisas -- uma
/// constante de texto (`fotoPrecisaDoNome`) e uma guarda local no comeco de
/// `_enviarAFoto`.
///
/// **O que o defeito era, medido e nao suposto.** O terceiro passo do envio da
/// foto e `PATCH /v1/me` com `photo_upload_id`, e a decisao do cliente de
/// 18/10/2026 -- *"nao permitir atualizar o cadastro, se nao tiver algum nome
/// cadastrado"* -- vale para ele. Medido contra a pilha efemera de integracao,
/// no commit `f8c74714` (o mesmo de `hml.bichu.app`), com uma conta de
/// `display_name` nulo, que e o estado de 2 das 7 contas de homologacao:
/// `400 {"errors":[{"field":"display_name","code":"required"}]}`. Do lado de ca
/// isso chegava como `DesfechoDoEnvio.recusada`, que vira **"O envio foi
/// recusado. Tente outra foto."** -- e nenhuma outra foto resolve. A pessoa
/// trocava de arquivo a esmo sem descobrir que faltava o NOME.
///
/// A guarda nao afrouxa a trava do servidor: ela conta o que falta, antes de
/// gastar a leitura do arquivo e dois pedidos de rede, e marca o campo do nome
/// como o `Salvar` ja marcava. Medida em
/// `test/telas/foto_do_usuario_e_selo_test.dart`, no grupo `o envio da propria
/// foto sem nome na conta`, com contrapeso.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe novo, nenhum canal
/// de plataforma, nenhuma permissao, nenhum `dart:io`. A camera continua atras
/// da porta `CameraEGaleria` -- esta mudanca, alias, faz a tela ler MENOS da
/// porta, porque ela para antes de pedir os bytes. O portao estrutural de
/// diretivas deste mesmo arquivo responde por isso e passou.
///
/// DESTRAVADO EM 18/10 (o botao `Ligar` curto e o GLIFO DO TIPO no lugar da
/// imagem ausente). Dois pedidos do cliente no mesmo dia, e dois arquivos
/// desta pasta mudam:
///
/// - `perto/lista_do_diretorio.dart`: o botao de ligar passou a ler so
///   `Ligar`, com o icone de telefone, e **o nome do local saiu do rotulo
///   VISIVEL sem sair do nome ACESSIVEL** -- quem publica `Ligar para <nome>`
///   agora e um `Semantics` com `onTap` redeclarado (sem ele,
///   `excludeSemantics: true` apagaria a acao do `TextButton`, que e o defeito
///   2 de `test/a11y/acao_de_controle_test.dart`). E o cartao sem logo deixou
///   de desenhar nada no lugar dela: ele desenha o glifo do TIPO.
/// - `perto/pagina_do_local.dart`: o mesmo rotulo curto no `BotaoPrimario`
///   (por `rotulo` + `nomeAcessivel`, que nasceram para isto) e o mesmo glifo
///   num quadrado ao lado do nome, **so quando nao ha `photo_url`**. A faixa
///   16:9 vazia foi TENTADA e medida: ela empurrava `Informações` para fora da
///   arvore do `ListView` em toda entrada sem foto.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. Os dois importes
/// novos sao locais -- `widgets/icone_do_inscrito.dart`, que nasceu FORA de
/// `lib/telas` justamente porque o cartao e a pagina precisam do mesmo glifo,
/// e `widgets/moldura.dart`, por `BichuMoldura.larguraFotoSm`. A CAMERA
/// continua atras da porta: este ramo nao encosta em
/// `escanear/tela_leitor_de_qr.dart`.
///
/// DESTRAVADO EM 18/10 (a BUSCA, a ROLAGEM INFINITA e o TOQUE NO ICONE da area
/// de mensagens -- os quatro pedidos do cliente para a aba `AuAu`). **UM
/// arquivo desta pasta muda**: `mensagens/area_de_mensagens.dart`.
///
/// Valor REPRODUZIDO pelo procedimento do proprio portao nesta arvore
/// (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`,
/// `write-tree`, `rev-parse <arvore>:app/lib/telas`), e nao copiado de relato.
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras sessoes
/// tocando `app/lib/telas` nesta rodada, e valor de ramo isolado nao sobrevive
/// a uniao. (antes: 145640db9f)
/// [lado da uniao, valor de ramo b476e764be] FOTO DO PERFIL SEM NOME (18/10/2026): valor MEDIDO pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de relato. Valor de ramo isolado NAO sobrevive a uniao: quem mesclar recalcula.
///
/// DESTRAVADO EM 18/10 (BICHUS-62, os dois pedidos do cliente sobre o filtro
/// das listagens). **Duas** telas desta pasta mudam, e as duas pela mesma
/// razao: a linha de busca passou a levar o gatilho de filtro junto.
/// `perdido/lista_de_perdidos.dart` e `rede/agenda_da_rede.dart` desenham a
/// busca FORA da barra (`BarraDeListagem.buscaAcima`), e trocaram
/// `CampoDeBuscaDaListagem` por `LinhaDeBuscaDaListagem` -- o campo com o
/// gatilho so-icone na frente dele, na mesma linha. A listagem de perdidos tem
/// mais tres edicoes, todas da janela de `period` que deixou de nascer em 30
/// dias: a pastilha nasce sem selecao, limpar a pastilha nao repoe `30d`, e
/// "recorte ativo" passou a ser "ha janela" em vez de "a janela nao e 30d".
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe novo em tela
/// nenhuma -- `LinhaDeBuscaDaListagem` mora em `widgets/barra_de_listagem.dart`,
/// que as duas telas JA importavam --, nenhum canal de plataforma, nenhuma
/// permissao, nenhum `dart:io`. A camera continua atras da porta: este ramo nao
/// encosta em `escanear/`.
///
/// Valor REPRODUZIDO por `git rev-parse HEAD:app/lib/telas` sobre o commit
/// desta frente, e nao copiado de relato. **A QUEM MESCLAR: recalcule sobre a
/// arvore MESCLADA** -- ha outras sessoes tocando `app/lib/telas`, e valor de
/// ramo isolado nao sobrevive a uniao. (antes: 145640db9f)
/// [lado do ramo, valor de ramo ac5e2a7c5f] BICHUS-62, 18/10/2026: o gatilho de filtro so-icone na frente da busca, e a pagina de pets sem janela por padrao. A justificativa esta inteira acima, e a da UNIAO DAS QUATORZE ficou junto com as anteriores.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas dos dois lados ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo dd731286dc] LOTE DE 19/10/2026 (filtros-por-icone): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: b476e764be1341b9fc408499e416ebb2bc0aae94, ac5e2a7c5f7e610f85955bb1631db0c14f6c5a4c. Valor de ramo isolado NAO sobrevive a uniao.
///
/// [lado do ramo, valor de ramo 8f0eeca8b1] UNIAO DAS QUATORZE (18/10/2026): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de ramo nem de relato. As justificativas dos dois lados ficaram INTEIRAS. Valor de ramo isolado NAO sobrevive a uniao.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo f2c3b9209a] LOTE DE 19/10/2026 (ate perto-ligar-e-icone): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: dd731286dc70e5beb66c24768801ed02c93b8dd3, 8f0eeca8b1977b7cbe4b8261b1a34d17545e628a. Valor de ramo isolado NAO sobrevive a uniao.
///
/// DESTRAVADO EM 18/10 PELOS TRES PEDIDOS DO CLIENTE desta rodada -- o
/// desfecho do achado com foto e informacao util, a retirada do preco da
/// `Loja` e o arrastar-para-atualizar no app inteiro. Cinco arquivos desta
/// pasta mudam, e nenhum deles por causa da camera:
///
/// - `achado/tela_achado_registrado.dart`: a foto do pet (por `PreviaDaFoto`,
///   que mora FORA de `lib/telas` -- a tela continua sem `dart:io`), tres
///   blocos de informacao e a acao de escanear a plaquinha;
/// - `achado/textos_do_achado.dart`: os textos dos tres blocos, com
///   `Ninguém foi avisado ainda` reusado de `TelaCasoAberto.avisoDaFila`;
/// - `loja/vitrine_da_loja.dart` e `loja/produto_da_loja.dart`: o preco, a
///   linha `Preço de referência` e a clausula orfa do preco vencido sairam
///   das duas telas da secao;
/// - `casca_com_abas.dart`: o `ListView` das cinco secoes passou a ser
///   embrulhado por `ArrastarParaAtualizar.doSlot`, e `TelaDeAba` ganhou o
///   `RecargaDaSecao` que o corpo de cada secao publica. **Alteracao minima**:
///   um importe, um campo, o descarte dele e o embrulho.
///
/// Mais seis arquivos desta pasta ganharam o gesto, cada um em duas linhas
/// (`with PublicaAAtualizacao` + `aoArrastarParaAtualizar`), ou no embrulho do
/// proprio rolavel: `perdido/lista_de_perdidos.dart`,
/// `rede/agenda_da_rede.dart`, `perto/lista_do_diretorio.dart`,
/// `perto/minhas_indicacoes.dart`, `perfil/meus_pets.dart`,
/// `mensagens/area_de_mensagens.dart`,
/// `notificacoes/caixa_de_notificacoes.dart`, `perfil/meus_achados.dart`,
/// `perfil/vitrine_de_fotos.dart` e `conexoes/tela_pedidos_de_conexao.dart`
/// (este ultimo tinha um `RefreshIndicator` cru, e foi convertido).
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io` -- quem desenha o
/// arquivo do aparelho continua sendo `widgets/previa_da_foto.dart`, fora
/// desta pasta, e e exatamente por isso que ela existe.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`).
/// Este valor e de RAMO ISOLADO -- `feat/achado-rico-e-loja-sem-preco` sobre
/// `origin/development` em f8c74714 -- e valor de ramo isolado NAO sobrevive a
/// uniao. (antes: 145640db9f; e, dentro desta mesma frente, 216959f0cc antes de eu desfazer a reformatacao automatica que o `dart format` havia aplicado a 111 arquivos que esta tarefa nao toca)
/// [lado do ramo, valor de ramo 6a089b729b] TRES PEDIDOS DE 18/10/2026: valor medido pelo procedimento deste proprio portao sobre o ramo isolado, nao copiado de relato.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo fcd3d1b1f7] LOTE DE 19/10/2026 (ate achado-rico-e-loja-sem-preco): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: f2c3b9209ae248af53da714481c47236dfb26233, 6a089b729b6c275ee46105fda9738069d886ec72. Valor de ramo isolado NAO sobrevive a uniao.
///
/// [lado do ramo, valor de ramo e6dcbd496e] ESTADO DE DESLOGADO (19/10/2026, pedido do cliente: *"tem que ter uma pagina de deslogado, nao da para mostrar so uma mensagem de erro para atualizar"*): nove telas de `app/lib/telas` passam a desenhar `ConviteParaEntrar` no 401 em vez de faixa de erro com `Atualizar` -- `perto/lista_do_diretorio.dart`, `mensagens/area_de_mensagens.dart`, `notificacoes/caixa_de_notificacoes.dart`, `perfil/meus_pets.dart`, `perfil/meus_achados.dart`, `perfil/vitrine_de_fotos.dart`, `conexoes/tela_pedidos_de_conexao.dart`, `perto/pagina_do_local.dart` e `mensagens/tela_da_conversa.dart`. Valor RECALCULADO pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- com as CHAVES, porque em zsh `$T:app/...` aplica o modificador `:a` e devolve caminho absurdo em silencio), e nao copiado de ramo nem de relato. Valor velho: `145640db`, que e a arvore de `origin/development`. **QUEM MESCLAR RECALCULA sobre a arvore MESCLADA**: valor de ramo isolado nao sobrevive a uniao, e seis ramos desta rodada mexeram neste campo. // UNIAO DAS QUATORZE (18/10/2026): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de ramo nem de relato. As justificativas dos dois lados ficaram INTEIRAS. Valor de ramo isolado NAO sobrevive a uniao.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo 5d91124f91] LOTE DE 19/10/2026 (ate estado-deslogado-nas-secoes): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: fcd3d1b1f76bbbba40380daa188cc0817969732a, e6dcbd496e15b81b3ef34181ce62c59da45e07ed. Valor de ramo isolado NAO sobrevive a uniao.
///
/// DOIS arquivos desta pasta mudam:
/// `pet/tela_detalhe_do_pet.dart` (a folha de confirmacao antes do
/// `closeLostCase` -- `_confirmarEncerramento` mais a `_FolhaDoEncerramento`,
/// que NAO e a `FolhaDestrutiva`: encerrar nao apaga nada e volta por 7 dias,
/// e o 24.17.6 separa os dois casos --, mais a oferta de `Reabrir o caso`
/// sobre `reopenLostCase`, condicionada ao `reopen_deadline` da RESPOSTA e
/// nunca a uma janela de 7 dias refeita no aparelho);
/// `pet/textos_do_detalhe.dart` (os textos da folha e da reabertura, e a
/// CORRECAO da frase de sucesso, que afirmava *"quem estava ajudando foi
/// avisado"* -- falso nos dois niveis: nada e enviado ao encerrar, a conversa
/// vira modo leitura por derivacao na leitura, e o push esta bloqueado em
/// producao e inexistente no iPhone do cliente).
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. O unico importe
/// novo e `formato/quando.dart` (para `QuandoNaLista.diaEMes`, que formata o
/// prazo), e ele mora FORA de `lib/telas`.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// escrito acima (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`).
/// Este valor foi calculado assim, sobre a arvore de trabalho desta entrega, e
/// **nao** copiado de ramo nem de relato. HA OUTRAS TRES BRANCHES tocando
/// `app/lib/telas` nesta rodada, com valores concorrentes: valor de ramo
/// isolado NAO sobrevive a uniao. (antes: 1015211855c9e1d2346aab2f0c120e1d0e4a1e0b)
///
/// [lado do ramo, valor de ramo 4d66551db6] REABRIR O CASO DE PERDIDO (19/10/2026): valor RECALCULADO pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`) sobre a arvore de trabalho desta entrega -- nao copiado de ramo nem de relato. As justificativas de todos os destravamentos anteriores ficaram INTEIRAS acima. Valor de ramo isolado NAO sobrevive a uniao: a quem mesclar, recalcule.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo 32769dcfb7] LOTE DE 19/10/2026 (ate reabrir-caso-de-perdido): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: 5d91124f9101c6b972982385a340418daa4fdca6, 4d66551db6fef958f5c0f42a84913e48bfcc0481. Valor de ramo isolado NAO sobrevive a uniao.
///
/// **Destravado pelos TRES ITENS DE NAVEGACAO de 18/10/2026** (pedido do
/// cliente: glifo em todo subitem da gaveta, `Meus dados` fora de `Pets` e de
/// `Perto`, e a margem direita da foto da barra de topo). Mexeu em dois
/// arquivos de `lib/telas`: `gaveta_de_secoes.dart` (o campo `icone` com a
/// assercao que cobra glifo em item vivo, os quatro glifos, a saida de
/// `Meus dados` dos globais e a guarda do filete) e `casca_com_abas.dart` (a
/// margem INTERNA de 16 dp no alvo da foto, mais a chave do circulo para o
/// portao poder medir desenho e alvo separados).
///
/// Valor **recalculado pelo procedimento deste proprio portao** sobre a
/// arvore de trabalho -- `GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse <arvore>:app/lib/telas` --, e nao copiado de ramo nem de
/// relato. Anterior: `145640db9f`.
/// [lado do ramo, valor de ramo 66fb4850a1] SINO NA BARRA E `criar` FLUTUANTE (19/10/2026, decisao do cliente: *"O botao criar sai da barra"*): `casca_com_abas.dart` monta `SinoDeNotificacoes` no `actions`, tira a porta de criar de la e a desenha no `floatingActionButton`, com respiro de 72 dp no pe da lista; `abas.dart` passa a entregar `AcaoDeCriarFlutuante` (o arquivo do widget mudou de nome e mora em `app/lib/widgets`, fora desta arvore). **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o portao estrutural de diretivas deste mesmo arquivo continua respondendo por isso. Valor REPRODUZIDO pelo procedimento do proprio portao nesta arvore (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), e nao copiado de relato. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras sessoes tocando `app/lib/telas` hoje, e valor de ramo isolado nao sobrevive a uniao. (antes: 818971c53b). Antes dele: NAVEGACAO DE 18/10/2026 (icones na gaveta, `Meus dados` fora de Pets/Perto, margem da foto); antes: UNIAO DAS QUATORZE (18/10/2026): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de ramo nem de relato. As justificativas dos dois lados ficaram INTEIRAS. Valor de ramo isolado NAO sobrevive a uniao.
///
/// [lado do ramo, valor de ramo 507413a952] O NUMERO DO SINO LIGADO
/// (19/10/2026): `casca_com_abas.dart` passou a LER
/// `Escopo.contadorDeAvisos` e a ouvi-lo (`ListenableBuilder` em volta do
/// `ValueListenableBuilder` que ja existia), e a linha do `actions` virou
/// `SinoDeNotificacoes(naoLidas: contadorDeAvisos.naoLidas)`;
/// `notificacoes/caixa_de_notificacoes.dart` passou a zerar o contador no
/// caminho de SUCESSO de `marcarListaVista`. A busca NAO mora nestes dois
/// arquivos: ela mora em `sessao/contador_de_avisos.dart` e e disparada pelo
/// `app.dart`, os dois FORA desta arvore -- os ramos da casca ficam montados
/// e uma busca aqui sairia uma vez por secao visitada. **Nenhuma porta de
/// aparelho encostada**: nenhum importe de plugin, nenhum canal de
/// plataforma, nenhuma permissao, nenhum `dart:io`.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
/// [lado da uniao, valor de ramo 1959197b96] LOTE DE 19/10/2026 (ate sino-na-barra-e-criar-flutuante): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao, nao copiado de ramo nem de relato. Valores de ramo que esta uniao substitui: 32769dcfb795143f98d911f430c0b2dae2fbdd58, 66fb4850a1e3e6e20263a8760faf960db81867d9. Valor de ramo isolado NAO sobrevive a uniao.
///
/// O que mudou nele, e por que cada parte e pedido dele por escrito:
///
/// - **O campo de busca**, pelo componente compartilhado `BarraDeListagem`
///   (*"adicione um campo de busca/filtro na secao de mensagens"*). Sem copia:
///   `widgets/barra_de_listagem.dart` **nao foi tocado** por esta frente, e
///   nem precisou -- nao ha filtro nem ordenacao aqui, porque
///   `listConversations` nao declara recorte de lista fechada, e o proprio
///   componente nao desenha gatilho sem desfecho.
/// - **A rolagem infinita de dez em dez** (*"trazendo as 10 ultimas conversas
///   e incrementando por 10"*): o botao `Carregar mais conversas` saiu, e
///   entrou um `ScrollController` com gatilho de folga mais um segundo gatilho
///   para a lista que nao enche a tela -- sem ele, `maxScrollExtent` em zero
///   deixaria o cursor sem consumidor e a lista pararia em dez, em silencio.
/// - **O toque no icone da conversa** (*"faca a imagem ser clicada levando o
///   usuario para o perfil do usuario"*), num ponto unico e nomeado,
///   `PortaDoPerfilDoParticipante`. Ele nasce devolvendo `null` porque a tela
///   de perfil de TERCEIRO nao existe em `origin/development` -- ela e de
///   `feat/comunidade-perfil-e-conexao`, por decisao do cliente --, e com
///   `null` o icone continua decorativo em vez de se anunciar como um botao
///   que nao leva a lugar nenhum.
/// - **A FOTO NAO ENTROU**, e o cabecalho daquele arquivo tem a medida: o
///   contrato proibe foto de perfil em `participants` por extenso e em dois
///   pontos, o ADR-0025 item 2 proibe avatar de terceiro, e o desenho da
///   frente de perfil recusa esta superficie por nome.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. Os importes novos
/// do arquivo sao `widgets/barra_de_listagem.dart` e nada mais -- o
/// `widgets/botao_primario.dart` SAIU junto com o botao de carregar mais. A
/// CAMERA continua atras da porta: esta frente nao encosta em
/// `escanear/tela_leitor_de_qr.dart`.
///
/// Valor REPRODUZIDO pelo procedimento do proprio portao nesta arvore
/// (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`,
/// `write-tree`, `rev-parse <arvore>:app/lib/telas`), e nao copiado de relato.
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras sessoes
/// tocando `app/lib/telas` nesta rodada (entre elas a que deixa o gatilho de
/// filtro so-icone na `BarraDeListagem`), e valor de ramo isolado nao
/// sobrevive a uniao. (antes: 145640db9f)
/// **A MESCLA (19/10/2026) juntou os dois lados**: o `_arvoreDasTelas` de cada ramo media a
/// propria arvore isolada, e a uniao tem as DUAS mudancas (`mensagens/area_de_mensagens.dart`
/// desta frente e a pasta `pessoa/` mais a linha de `SubDestino` na `gaveta_de_secoes.dart` da
/// frente de perfil), mais o acendimento da `PortaDoPerfilDoParticipante` desta tarefa. Por isso
/// o valor abaixo nao e nem um nem outro: foi RECALCULADO sobre a arvore mesclada.
/// [lado do ramo, valor de ramo 8b070d9dc0] A LISTA DE BLOQUEADOS E O TITULO DE `PERTO` A 200% (19/10/2026), decisao do cliente: TRES arquivos de `app/lib/telas` mudam. (1) `seguranca/tela_de_bloqueados.dart` NASCE -- a lista de quem eu bloqueei, que e o unico caminho de volta de um bloqueio: o bloqueio e SIMETRICO e fechava com 404 o perfil onde o `Desbloquear` do `MenuDoPerfil` morava, e por isso bloquear era irreversivel pelo aplicativo. (2) `gaveta_de_secoes.dart` ganha a porta dela em `Perfil` (+1 linha de importe e +28 de `SubDestino`). (3) `casca_com_abas.dart` declara a abreviacao do titulo: `maxLines: 1`, `softWrap: false`, `overflow: ellipsis` e `semanticsLabel: titulo` -- a 200% em 320 dp `Perto` pede 172,90 dp contra 160,00 de orcamento e corta, e o nome ANUNCIADO continua inteiro. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; a tela nova importa so `material`, `dart:async`, a camada de api, o tema e `widgets/faixa_de_aviso.dart`, e `escanear/tela_leitor_de_qr.dart` nao foi tocado -- o portao estrutural de diretivas deste mesmo arquivo responde por isso. A FIACAO da rota NAO esta aqui: ela mora em `app/lib/roteamento/rotas.dart`, que esta FORA de `app/lib/telas` e por isso nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${arvore}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO). ANTERIOR: 045d87197b2276c8e1a93dcfcd3fcd23fa7250dd (a foto na conversa entre conexoes, logo abaixo). === A FOTO NA CONVERSA ENTRE CONEXOES (19/10/2026), emenda 3 do ADR-0010: UM arquivo de `app/lib/telas` muda, `mensagens/area_de_mensagens.dart`, e a mudanca e pedido direto do cliente (*"a foto aparece SO quando as duas pessoas ja aceitaram conexao"*). `MarcaNeutraDoParticipante` passa a desenhar `ImagemDaRede` quando `participante.photoIconUrl` nao e nulo, e a inicial quando e -- e o importe novo e `widgets/imagem_da_rede.dart` e **nada mais**. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; a CAMERA continua atras da porta, e `escanear/tela_leitor_de_qr.dart` nao foi tocado -- o portao estrutural de diretivas deste mesmo arquivo responde por isso. A FIACAO do toque NAO esta aqui: ela mora em `app/lib/roteamento/rotas.dart`, que esta FORA de `app/lib/telas` e por isso nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${arvore}:app/lib/telas"`), e nao copiado de relato. ANTERIOR: 40ba5d1cb735a3c0b42c6560fbb6ed00bea6c442 (a MESCLA, logo abaixo). === MESCLA DE MENSAGENS COM PERFIL DE TERCEIRO (19/10/2026), a foto na conversa entre conexoes: valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${arvore}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO). Nenhum dos dois valores de ramo sobrevive a uniao, porque os DOIS lados tocam `app/lib/telas`. As justificativas dos dois lados ficam INTEIRAS. === LADO MENSAGENS, 4930ba4dc4b3f15343ffcaa9d37b02040c2fe749: BUSCA, ROLAGEM E TOQUE NA AREA DE MENSAGENS (18/10/2026): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de ramo nem de relato. As justificativas dos dois lados ficaram INTEIRAS. Valor de ramo isolado NAO sobrevive a uniao. === LADO PERFIL, c1484355dc615af2fd6a73200134ef60596b7711: FATIA G (19/10/2026), o perfil de OUTRA pessoa: pasta nova `pessoa/` com `tela_perfil_de_pessoa.dart`, mais uma linha de `SubDestino` em `gaveta_de_secoes.dart` (a porta da caixa de pedidos de conexao, que existia sem porta desde 18/10). Valor RECALCULADO pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao chutado e nao copiado de relato. ANTERIOR: 145640db9fb6764eccb543b350c43caef8e2f2b3 (UNIAO DAS QUATORZE, 18/10/2026). **QUEM MESCLAR PRECISA RECALCULAR SOBRE A ARVORE MESCLADA**: valor de ramo isolado NAO sobrevive a uniao, e tres frentes desta rodada tocam `app/lib/telas` (gaveta, casca e esta). // UNIAO DAS QUATORZE (18/10/2026): valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse <arvore>:app/lib/telas`), nao copiado de ramo nem de relato. As justificativas dos dois lados ficaram INTEIRAS. Valor de ramo isolado NAO sobrevive a uniao.
///
/// **VALOR DESTA UNIAO (19/10/2026).** Nenhum dos valores de ramo acima
/// sobrevive a mescla: o hash e de ARVORE e cobre a pasta inteira, e cada
/// ramo mediu a SUA arvore isolada. Este valor foi RECALCULADO sobre a
/// arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"`), e nao copiado de ramo nem de relato.
/// As justificativas de TODOS os ramos ficaram INTEIRAS acima, de proposito.
///
/// [lado do ramo feat/versao-minima-do-app, valor de ramo 6622873a56] VERSAO MINIMA DO APP (19/10/2026, pedido do cliente): a pasta NOVA `app/lib/telas/atualizacao/` entrou com a tela de bloqueio, o aviso brando, os textos e o portao. Valor MEDIDO pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves: em zsh, sem elas o `$T:app/...` aplica o modificador `:a` e devolve caminho absurdo em SILENCIO), sobre `f8c74714`. Valor anterior: `145640db9fb6764eccb543b350c43caef8e2f2b3` (uniao das quatorze, 18/10). Nenhum dos quatro arquivos novos encosta na porta `CameraEGaleria`, que e o que o criterio 10 protege: a tela de bloqueio abre o link da loja pela porta `SaidaDoApp`, como `pagina_do_local` e `lista_do_diretorio`, e o portao de diretivas abaixo continua respondendo por isso sem depender desta constante. **QUEM MESCLAR RECALCULA SOBRE A ARVORE MESCLADA**: ha um lote de 19/10 em mescla, e valor de ramo isolado NAO sobrevive a uniao.
///
/// **VALOR DESTA MESCLA (19/10/2026, A VERSAO QUE O APP MANDA).** Nenhum dos
/// dois valores acima sobrevive: `c46ae91fdb` e de `origin/development` e
/// `6622873a56` e do ramo do bloqueio por versao, e os DOIS lados tocam
/// `app/lib/telas`. Este valor foi RECALCULADO sobre a arvore MESCLADA pelo
/// procedimento deste proprio portao (`GIT_INDEX_FILE` temporario,
/// `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"` -- COM as chaves: em zsh, sem elas o shell
/// aplica o modificador `:a` e devolve caminho absoluto em SILENCIO), e nao
/// copiado de ramo nem de relato. As justificativas dos dois lados ficaram
/// INTEIRAS acima, de proposito.
/// [valor de ramo 0a06fa5404, SUPERADO pela uniao] MESCLA DE `feat/versao-minima-do-app` COM `origin/development` (19/10/2026): recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao. Substitui os dois valores de ramo: 6622873a566c3176eb78b427d408827e2b2e3848 (bloqueio por versao) e c46ae91fdb80c21c16742669fb38d8d1e83a2e4c (lote de 19/10 na development). Justificativa do lado development: LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
/// [lado do ramo feat/pets-por-distancia, valor de ramo 7e739f5a3b, SUPERADO pela uniao] VALOR FINAL DESTA FRENTE. Recalculado depois de `CidadeEscolhida` recuperar o LEITOR dela: `_lerODeposito()` entrou em `perdido/lista_de_perdidos.dart` e a ultima cidade guardada no aparelho virou a TERCEIRA reserva da cadeia, com rotulo proprio (`da sua ultima busca`, nunca `da sua localizacao` -- cidade guardada semana passada pode ser de outra cidade). Antes disso a tela ESCREVIA no deposito e ninguem lia, que e divida com aparencia de funcao. Mesmo procedimento do portao, mesma arvore de trabalho. SUBSTITUI 4267db1df4d583226bf2d3ad06f5c0f92993e872, cujo comentario abaixo descreve o resto desta mudanca e continua valendo: // A CIDADE VEM DA LOCALIZACAO (19/10/2026, emenda 1 do ADR-0006), decisao do cliente (*"autorizar o gps, e trazer algum valor padrao em caso de fallback"*): UM arquivo de `app/lib/telas` muda, `perdido/lista_de_perdidos.dart`, e o que entra nele e a cadeia de reserva de tres elos -- cidade resolvida pelo aparelho, `Me.reference_area.city`, e nenhuma cidade (os 20 mais recentes do pais). **UMA PORTA DE APARELHO PASSOU A SER ENCOSTADA, e e por isso que este valor merece leitura atenta**: a tela importa `dispositivo/localizacao.dart` e chama `estado()`, `pedir()`, `abrirAjustesDoSistema()` e `cidadeAproximada()`. Ela NAO importa `package:geocoding/` nem `package:geolocator/` -- o portao `sem_geocodificacao_test.dart` reprova o importe do pacote fora da porta, e o portao estrutural de diretivas deste mesmo arquivo responde pelo resto. A permissao nunca e pedida na abertura: `_resolverACidade` chama `estado()`, e `pedir()` roda so a partir do toque em `Usar minha localizacao`. Entra tambem `_LinhaDoRecorte`, que e quem DIZ qual recorte esta valendo e de onde a cidade veio -- cidade derivada em silencio e pior que cidade nenhuma. **`app/lib/widgets/barra_de_listagem.dart` continua NAO TOCADO** (zero linhas nas duas rodadas desta frente): outra frente o esta invertendo. A FIACAO nao esta aqui: `dispositivo/localizacao.dart` (a resolucao e a memoria da grade de ~100 m), `api/modelos_perdido.dart` (o colapso de espaco que `texto_para_busca` nao faz) e `app.dart` (`LocalizacaoPorGeolocator` deixou de ser `const` porque ganhou memoria) estao FORA de `app/lib/telas`. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absurdo em SILENCIO). ANTERIOR: b7d0350bbfb714eaa46a820308ce039629be793c (A CIDADE OPCIONAL NA PAGINA DE PETS, 19/10/2026), decisao do cliente (*"o campo cidade do filtro da pagina pet nao deve ser obrigatorio, mas devemos filtrar pelos 20 ultimos pets cadastrados e deixar que ele altere os filtros manualmente"*): UM arquivo de `app/lib/telas` muda, `perdido/lista_de_perdidos.dart`. O que sai dele: a fase `_Fase.semCidade` e as duas frases dela (`semCidade` e `rotuloDeEscolherCidade`), a porta `if (cidade == null)` de `_carregar()`, e a precedencia de tres fontes de cidade (`_cidadeDigitada`, `_cidadeDaRegiao`, `_cidadeDoAparelho`) com o `_lerOAparelho()` que buscava a ultima cidade do aparelho. O que entra: o recorte nasce `const RecorteDePerdidos()` e a lista abre com os 20 casos mais recentes de qualquer cidade; o campo de cidade da folha perde `obrigatorio` (e o rotulo visivel passa a `Cidade (opcional)`, derivado por `BichuField`); `_temRecorteAtivo` passa a CONTAR a cidade, que e o que mantem o gatilho de filtro vivo numa lista vazia por recorte. **Nenhuma porta de aparelho encostada**: o arquivo PERDEU importes (`sessao/cidade_escolhida.dart`, `widgets/botao_primario.dart` e `dart:async`) e nao ganhou nenhum; nenhum plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`. Pelo contrario, a unica dependencia de armazenamento de plataforma que esta tela tinha -- `CidadeEscolhida`, que chama `getApplicationDocumentsDirectory()` -- deixou de ser lida aqui. **`app/lib/widgets/barra_de_listagem.dart` NAO FOI TOCADO** (zero linhas), e isso e deliberado: outra frente o esta invertendo nesta mesma rodada. `obrigatorio` ja tinha padrao `false` e a folha ja tratava campo opcional em `serve`, em `ativos` e no `Limpar`, entao a mudanca inteira caberia do lado de quem chama. Ele esta FORA de `app/lib/telas` de qualquer forma e nao mexeria neste valor. A FIACAO da rota NAO esta aqui: `app/lib/roteamento/rotas.dart` e `app/lib/api/modelos_perdido.dart` (onde `RecorteDePerdidos.cidade` virou opcional com sentinela) estao FORA de `app/lib/telas` e por isso nao mexem neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO). ANTERIOR: c46ae91fdb80c21c16742669fb38d8d1e83a2e4c (LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
//
// **ESTA UNIAO (19/10/2026) juntou `fix/foto-no-app-upload-e-previa` com
// `feat/evento-simples-e-sem-telefone`.** NENHUM dos dois valores de ramo
// sobrevive: os dois lados tocam `app/lib/telas` (um mexe em
// `perfil/tela_dados_pessoais.dart`, o outro APAGA `rede/encontro_da_rede.dart`
// e `rede/local_do_encontro.dart` e reescreve o cartao), e o hash e de ARVORE.
// As justificativas dos DOIS lados ficam INTEIRAS abaixo, de proposito.
//
// === LADO `fix/foto-no-app-upload-e-previa` ===
// [valor de ramo 169528b830ac6b09354b5c6385748d895039ab74] A FOTO SOBE NA ESCOLHA E E CONFIRMADA NO `Salvar` (19/10/2026), pedido do cliente: UM arquivo de `app/lib/telas` muda, `perfil/tela_dados_pessoais.dart`. O botao `Salvar a foto` SAI (*"remova esse botao de salvar foto, quando o usuario fizer o upload de qualquer foto no app, voce deve fazer o upload e apresentar como vai ficar de preview, e ao salvar o voce salva a foto"*), o envio passa para a ESCOLHA, a confirmacao passa a ser `photo_upload_id` no MESMO `PATCH /v1/me` do `Salvar`, e `Me.photo.status == 'rejected'` passa a desenhar `rejection_reason` em vez de ser tratado igual a sem foto. O defeito que isso conserta foi MEDIDO antes da mudanca: escolher a foto e tocar no `Salvar` lia 0 bytes, mandava 0 intencoes, 0 requisicoes ao armazenamento e 0 `PATCH /v1/me`, e respondia "Nada mudou desde a ultima vez.". **Nenhuma porta de aparelho encostada**: nenhum importe de plugin novo, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- a camera continua atras de `CameraEGaleria` e a previa continua sendo `widgets/previa_da_foto.dart`. O mecanismo de envio (`EnvioParaConfirmarDepois`) e a recusa por tipo (`recusaDeTipoDaFoto`) moram FORA de `app/lib/telas`, em `api/envio_de_foto.dart` e `dispositivo/camera_e_galeria.dart`, e por isso nao mexem neste valor. Valor RECALCULADO pelo procedimento deste proprio portao (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO). ANTERIOR: c46ae91fdb80c21c16742669fb38d8d1e83a2e4c (LOTE DE 19/10/2026, logo abaixo). === LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
//
// === LADO `feat/evento-simples-e-sem-telefone` ===
// [valor de ramo acdd11654f38cd384fcb625129df5665c827e520] SO EVENTO ABERTO (19/10/2026, segunda decisao do cliente no mesmo dia: *"vamos deixar apenas os eventos abertos por enquanto, no futuro analisamos a necessidade de ter eventos privados tambem"*). UM arquivo de `app/lib/telas` muda: `rede/agenda_da_rede.dart`. Sai a aba `Meus pedidos` do `enum AbaDaRede` (a agenda passa de tres abas para DUAS, com conta e sem -- `_abasVisiveis` deixou de depender da sessao), sai o ramo de carga que era o UNICO lugar do app que lia `listMyNetworkEventJoinRequests`, saem os dois grupos de filtro `Situação do pedido` (`state`) e `Público ou privado` (`visibility`), sai o campo `pedido` de `_ItemDaAgenda` e saem as duas constantes do vazio de pedidos. O resto da decisao mora FORA desta arvore: `app/lib/api/modelos_rede.dart` fixa `visibility=public` em `queryDaAgenda` e descarta o que nao e publico em `PaginaDaRede.doJson`, e `app/lib/api/rede_api.dart` ganhou o registro das SETE operacoes aposentadas -- os dois ficam em `app/lib/api/`, que esta fora de `app/lib/telas` e por isso nao mexe neste valor. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; o diff da agenda e remocao e prosa, e o portao estrutural de diretivas deste mesmo arquivo responde por isso. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato. ANTERIOR: e4244c57976a57cce656d9380b3f6cea2871a75d (o cartao so com foto e titulo, logo abaixo). **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, e ATENCAO: a frente `feat/barra-com-mural-e-rede-unificada` esta no MESMO metodo -- ela move `Perto` para dentro de `Rede` como aba `Comunidade`, e este commit tira uma aba do mesmo `enum AbaDaRede` e da mesma `_abasVisiveis`. A uniao das duas e textual e precisa ser lida, nao resolvida no automatico. // EVENTO SO COM FOTO E TITULO, E TELEFONE FORA DA TELA (19/10/2026, pedido do cliente: *"a pagina perto e rede tem que ser unificado e você deve mostrar apenas a foto e o titulo do evento, sem informações adicionais ou pagina de detalhes do evento e sem aparecer o telefone quando for profissionais/clinicas"*). CINCO caminhos de `app/lib/telas` mudam, e DOIS deles SOMEM da arvore -- e e por isso que o hash muda mais do que de costume. (1) `rede/encontro_da_rede.dart`: APAGADO. Era a pagina de detalhe do evento, e com ela sairam o pedido de participacao (`Pedir para participar`, `Desistir do pedido`), a guarda de acao que mandava o pedido depois do login, o mapa estatico da `/location`, `Adicionar ao calendário`, os links de convite e Instagram e o conteudo do privado aprovado. (2) `rede/local_do_encontro.dart`: APAGADO. Era o mapa estatico e a caixa de endereco daquela pagina, e nada mais a desenhava. (3) `rede/cartao_do_encontro.dart`: o cartao virou foto 16:9 mais titulo, e nada mais -- sairam o bloco de dia, o distintivo de situacao, a data, o lugar, a distancia da regiao, o resumo, os selos de valor e `Privado` e a pilula de `Meus pedidos`; o `InkWell` e o `Semantics(button: true)` sairam porque nao ha destino, e o criterio 2 da BICHUS-62 proibe controle sem desfecho. (4) `rede/pecas_da_rede.dart`: `rotuloDaSituacao`, `BlocoDoDia`, `DistintivoDeSituacao`, `SeloDoEncontro`, `seloDeValor` e `seloPrivado` sairam por falta de chamador, e `ImagemDoEncontroOuBanner` GANHOU `cacheWidth` pela largura pintada -- era o unico `Image.network` do app sem ele, e a agenda monta os 20 cartoes da pagina de uma vez. (5) `rede/agenda_da_rede.dart`: o cartao passa a receber so `encontro`. (6) `perto/pagina_do_local.dart`: saiu a linha `Telefone comercial: <phone_e164>` da secao `Informações` -- o UNICO lugar do app que pintava o numero --, e a frase do visitante parou de prometer o telefone. O botao `Ligar` FICOU: ele nao mostra numero. (7) `rede/criar_encontro.dart`: o desfecho de criar virou `context.go(Rotas.rede)`, porque a pagina do proprio evento, que era o desfecho, saiu. **A PAGINA DO LOCAL NAO SAIU**: o pedido de 19/10 removeu a pagina do EVENTO, e a do local e pedido dele de 18/10 (nota de 1 a 5 e recomendacao em texto). **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o portao estrutural de diretivas deste mesmo arquivo responde por isso, e `rede/encontro_da_rede.dart` e `rede/local_do_encontro.dart` eram DUAS das telas que ele media (o `url_launcher` do convite e o `Uri` do mapa sairam com elas). A FIACAO da rota NAO esta nesta arvore: `app/lib/roteamento/rotas.dart` fica FORA de `app/lib/telas`, e a remocao de `encontros/:slug` nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato. ANTERIOR: c46ae91fdb80c21c16742669fb38d8d1e83a2e4c. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras tres frentes tocando `app/lib/telas` nesta rodada (a unificacao da barra e das abas, Pets por geolocalizacao e o Mural), e valor de ramo isolado nao sobrevive a uniao.
// [lado do ramo feat/evento-simples-e-sem-telefone, valor de ramo bea2650f34, SUPERADO pela uniao] A PALAVRA `Cancelado` NO CARTAO (19/10/2026, terceira decisao do cliente no mesmo dia, sobre a pergunta fechada que a entrega da manha deixou: *"um cartao limpo nao vale alguem sair de casa para um evento que nao existe"*). UM arquivo de `app/lib/telas` muda: `rede/cartao_do_encontro.dart`. O cartao de um evento `status: cancelled` ganha UMA palavra acima do titulo -- sem fundo, sem pilula, sem glifo, sem a data ou o lugar de volta --, e os outros tres estados (`upcoming`, `happening`, `ended`) continuam com o titulo e nada mais. O cartao volta a ter um no `Semantics` com rotulo montado (`Cancelado: <titulo>`), porque MEDI o primeiro desenho e ele estava errado: `MergeSemantics` em volta da coluna publicava `label=Cancelado` e COMIA o titulo -- o leitor de tela anunciaria "Cancelado" sem dizer de qual evento, que e pior que a ausencia da palavra. `excludeSemantics: true` nao apaga acao nenhuma aqui: o cartao deixou de ser tocavel em 19/10 e nao ha `onTap`, `InkWell` nem `TextButton` embaixo dele. **O cinza da foto NAO voltou** -- ele saiu nesta rodada por ser sinal exclusivamente por cor (SC 1.4.1), a palavra abriria a porta para ele voltar como reforco, e a decisao de nao traze-lo esta no relato da entrega. `DistintivoDeSituacao`, `rotuloDaSituacao` e os selos continuam APAGADOS de `rede/pecas_da_rede.dart`: a palavra e um `Text` do proprio cartao, e nao a pilula de volta. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; o unico importe do arquivo continua sendo `material`, a camada de api e o tema. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato. ANTERIOR: acdd11654f38cd384fcb625129df5665c827e520 (so evento aberto, logo abaixo). **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- `feat/barra-com-mural-e-rede-unificada` continua no mesmo `enum AbaDaRede` e na mesma `_abasVisiveis` de `rede/agenda_da_rede.dart`; este commit NAO toca aquele arquivo, e a lista de hunks da colisao esta no relato da entrega anterior. // SO EVENTO ABERTO (19/10/2026, segunda decisao do cliente no mesmo dia: *"vamos deixar apenas os eventos abertos por enquanto, no futuro analisamos a necessidade de ter eventos privados tambem"*). UM arquivo de `app/lib/telas` muda: `rede/agenda_da_rede.dart`. Sai a aba `Meus pedidos` do `enum AbaDaRede` (a agenda passa de tres abas para DUAS, com conta e sem -- `_abasVisiveis` deixou de depender da sessao), sai o ramo de carga que era o UNICO lugar do app que lia `listMyNetworkEventJoinRequests`, saem os dois grupos de filtro `Situação do pedido` (`state`) e `Público ou privado` (`visibility`), sai o campo `pedido` de `_ItemDaAgenda` e saem as duas constantes do vazio de pedidos. O resto da decisao mora FORA desta arvore: `app/lib/api/modelos_rede.dart` fixa `visibility=public` em `queryDaAgenda` e descarta o que nao e publico em `PaginaDaRede.doJson`, e `app/lib/api/rede_api.dart` ganhou o registro das SETE operacoes aposentadas -- os dois ficam em `app/lib/api/`, que esta fora de `app/lib/telas` e por isso nao mexe neste valor. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; o diff da agenda e remocao e prosa, e o portao estrutural de diretivas deste mesmo arquivo responde por isso. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato. ANTERIOR: e4244c57976a57cce656d9380b3f6cea2871a75d (o cartao so com foto e titulo, logo abaixo). **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, e ATENCAO: a frente `feat/barra-com-mural-e-rede-unificada` esta no MESMO metodo -- ela move `Perto` para dentro de `Rede` como aba `Comunidade`, e este commit tira uma aba do mesmo `enum AbaDaRede` e da mesma `_abasVisiveis`. A uniao das duas e textual e precisa ser lida, nao resolvida no automatico. // EVENTO SO COM FOTO E TITULO, E TELEFONE FORA DA TELA (19/10/2026, pedido do cliente: *"a pagina perto e rede tem que ser unificado e você deve mostrar apenas a foto e o titulo do evento, sem informações adicionais ou pagina de detalhes do evento e sem aparecer o telefone quando for profissionais/clinicas"*). CINCO caminhos de `app/lib/telas` mudam, e DOIS deles SOMEM da arvore -- e e por isso que o hash muda mais do que de costume. (1) `rede/encontro_da_rede.dart`: APAGADO. Era a pagina de detalhe do evento, e com ela sairam o pedido de participacao (`Pedir para participar`, `Desistir do pedido`), a guarda de acao que mandava o pedido depois do login, o mapa estatico da `/location`, `Adicionar ao calendário`, os links de convite e Instagram e o conteudo do privado aprovado. (2) `rede/local_do_encontro.dart`: APAGADO. Era o mapa estatico e a caixa de endereco daquela pagina, e nada mais a desenhava. (3) `rede/cartao_do_encontro.dart`: o cartao virou foto 16:9 mais titulo, e nada mais -- sairam o bloco de dia, o distintivo de situacao, a data, o lugar, a distancia da regiao, o resumo, os selos de valor e `Privado` e a pilula de `Meus pedidos`; o `InkWell` e o `Semantics(button: true)` sairam porque nao ha destino, e o criterio 2 da BICHUS-62 proibe controle sem desfecho. (4) `rede/pecas_da_rede.dart`: `rotuloDaSituacao`, `BlocoDoDia`, `DistintivoDeSituacao`, `SeloDoEncontro`, `seloDeValor` e `seloPrivado` sairam por falta de chamador, e `ImagemDoEncontroOuBanner` GANHOU `cacheWidth` pela largura pintada -- era o unico `Image.network` do app sem ele, e a agenda monta os 20 cartoes da pagina de uma vez. (5) `rede/agenda_da_rede.dart`: o cartao passa a receber so `encontro`. (6) `perto/pagina_do_local.dart`: saiu a linha `Telefone comercial: <phone_e164>` da secao `Informações` -- o UNICO lugar do app que pintava o numero --, e a frase do visitante parou de prometer o telefone. O botao `Ligar` FICOU: ele nao mostra numero. (7) `rede/criar_encontro.dart`: o desfecho de criar virou `context.go(Rotas.rede)`, porque a pagina do proprio evento, que era o desfecho, saiu. **A PAGINA DO LOCAL NAO SAIU**: o pedido de 19/10 removeu a pagina do EVENTO, e a do local e pedido dele de 18/10 (nota de 1 a 5 e recomendacao em texto). **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o portao estrutural de diretivas deste mesmo arquivo responde por isso, e `rede/encontro_da_rede.dart` e `rede/local_do_encontro.dart` eram DUAS das telas que ele media (o `url_launcher` do convite e o `Uri` do mapa sairam com elas). A FIACAO da rota NAO esta nesta arvore: `app/lib/roteamento/rotas.dart` fica FORA de `app/lib/telas`, e a remocao de `encontros/:slug` nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato. ANTERIOR: c46ae91fdb80c21c16742669fb38d8d1e83a2e4c. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras tres frentes tocando `app/lib/telas` nesta rodada (a unificacao da barra e das abas, Pets por geolocalizacao e o Mural), e valor de ramo isolado nao sobrevive a uniao.
//
// HISTORICO DA LINHA ANTERIOR (mantido inteiro, de proposito): LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
/// [valor PENDENTE do lote em mescla] 
/// [lado do ramo feat/capa-do-evento-e-vitrine, valor de ramo db34d3b735, SUPERADO pela uniao] A CAPA DO EVENTO E A VITRINE QUE ACEITA FOTO (19/10/2026), dois pedidos antigos do cliente: *"a foto que eu estou falando para criar do evento e a da capa do evento"* (hoje) e *"perfil do usuario com vitrine de fotos, parecido com instagram"* (18/10). DOIS arquivos de `app/lib/telas` mudam. (1) `rede/criar_encontro.dart`: o formulario passa a PERGUNTAR a capa, no padrao decidido em 19/10 (escolher -> envia na hora -> previa do arquivo local -> `Criar o encontro` confirma), e a confirmacao e `cover_photo_upload_id` no MESMO `POST /v1/network/events` -- nao ha segundo caminho de confirmacao e nao ha botao separado de salvar foto. (2) `perfil/vitrine_de_fotos.dart`: nasce o controle de ADICIONAR foto, que a tela nao tinha (o vazio dizia "Adicione uma foto para comecar a sua vitrine" e nao havia como), pelo mesmo padrao e por `VitrineApi.substituir`, com `purpose` `user_showcase` MEDIDO no contrato. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- a camera continua atras de `dispositivo/camera_e_galeria.dart`, o envio e `api/envio_de_foto.dart` (`EnvioParaConfirmarDepois`) e a previa e `widgets/previa_da_foto.dart`, todos FORA de `app/lib/telas`. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore MESCLADA de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de ramo nem de relato.
/// [valor PENDENTE do lote em mescla] 
/// [lado do ramo feat/barra-com-mural-e-rede-unificada, valor de ramo 30fdc84cd6, SUPERADO pela uniao] BARRA NOVA, `Rede` REUNIDA E GAVETA OCULTA (19/10/2026, quatro decisoes do cliente): SETE arquivos de `app/lib/telas` mudam, TRES nascem e UM e apagado. (1) `casca_com_abas.dart`: o registro de secoes vira `Pets · Rede · Mural · Loja · AuAu` (`Perto` SAI, `Mural` ENTRA com `dynamic_feed` e `EstadoDaSecao.casca`), o `drawer:` sai do `Scaffold` da casca (*"vamos ocultar o menu por enquanto"*), o `leading` da `TelaDeAba` deixa de ser o hamburguer e passa a ser `AvatarDaConta` (*"colocar o icone do usuario no lugar do menu, do lado esquerdo da pagina"*), `actions` fica so com o sino, e a margem interna da foto troca de lado. O orcamento do titulo foi de 160,00 para **224,00 dp** em 320 dp a 200%, MEDIDO, e com ele a excecao de corte de cinco letras acabou -- `Mural` pede os mesmos 172,90 dp de `Perto` e CABE, com 51,10 de folga. (2) `abas.dart`: `AbaPerto` E APAGADA (a secao deixou de existir), `AbaRede` passa a devolver `SecaoDaRede`, `AbaMural` NASCE, `Pets` ganha `AcoesDeCriarFlutuantes` com as TRES acoes que a gaveta perdeu, e `AbaPerfil` ganha `Pedidos de conexao` e `Pessoas bloqueadas` -- os DOIS itens que tinham a gaveta como UNICA porta em `lib/`, medido antes de ocultar o menu. (3) `rede/secao_da_rede.dart` NASCE: a secao reunida, com as abas `Eventos` e `Comunidade` numa `TabBar` ROLAVEL e uma acao flutuante que troca com a aba. (4) `mural/tela_do_mural.dart` NASCE: o LUGAR da linha do tempo, em estado inicial honesto e SEM acao de publicar -- nao existe `user_publications` nem operacao de publicar nesta arvore, e o conteudo e de outra frente. (5) `perto/tela_de_minhas_indicacoes.dart` NASCE: a porta propria da lista que nao cabe no filtro (a entidade muda -- indicacao em analise nao e local da lista). (6) `perto/corpo_do_perto.dart` E APAGADO: as duas abas dele nao existem mais. (7) `rede/agenda_da_rede.dart`: `AbaDaRede` SAI -- as tres abas viraram FILTRO (`Quando -> Próximos/Encerrados` e `Meu envolvimento -> Só onde eu pedi`), e a `TabBar` sai desta tela (as abas passaram a ser da SECAO). (8) `gaveta_de_secoes.dart`: as OITO linhas de `Perto` mudam de chave para `Rotas.rede` e `Mural` entra com UMA -- o inventario de 27.5 vai de 52 para 53 linhas, 17 destinos e 7 itens vivos (6 destinos distintos). (9) `perto/pagina_do_local.dart` e `perto/sugerir_profissional.dart`: TRES linhas de `Rotas.perto` -> `Rotas.rede` e DOIS rotulos (`Ver o Perto` -> `Ver a Rede`, `Voltar para o Perto` -> `Voltar para a Rede`). **A PASTA `perto/` NAO FOI RENOMEADA, de proposito**: tres frentes editam arquivos dela nesta mesma rodada, e mover a pasta trocaria uma mudanca de composicao por um conflito textual em cada arquivo. O nome da pasta nao aparece em tela nenhuma. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- `AcoesDeCriarFlutuantes` mora em `app/lib/widgets`, FORA desta arvore, e importa so `material` e o tema; a camera continua atras da porta e `escanear/tela_leitor_de_qr.dart` nao foi tocado. O portao estrutural de diretivas deste mesmo arquivo continua respondendo por isso. **A FIACAO das rotas NAO esta aqui**: `Rotas.perto` apagada, `Rotas.mural` e `Rotas.minhasIndicacoes` novas e a ordem dos ramos vivem em `app/lib/roteamento/rotas.dart`, que esta FORA de `app/lib/telas` e por isso nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de relato. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras TRES frentes tocando `app/lib/telas` nesta rodada (Pets por geolocalizacao, cartao de evento simples, e o conteudo do Mural), e valor de ramo isolado nao sobrevive a uniao. **SEGUNDA RODADA DO MESMO DIA, a resposta dele a minha ressalva:** eu lhe mostrei as tres opcoes da folha de `Pets` e perguntei qual delas era *"adicionar um novo pet perdido"*; resposta literal, *"botao para escanear o pet"*. `abas.dart` muda de novo: `Escanear uma tag` sai da folha e vira o alvo flutuante PRINCIPAL de `Pets` (um toque, `qr_code_scanner` -- LER a plaquinha, contra `qr_code_2` que e EXIBIR a propria), e `Registrar achado avulso` e `Cadastrar pet` passam para o alvo SECUNDARIO ao lado dele. `AcoesDeCriarFlutuantes` (em `app/lib/widgets`, FORA desta arvore) passou a desenhar os dois alvos numa `Row`, e e essa escolha que mantem a invasao do pe da lista em **72,00 dp**: empilhados em coluna ela iria a 144,00 e o respiro rolavel teria de dobrar. Substitui a68912e09ef07bc154ba498b2e930184f4e730be, e antes dele c46ae91fdb80c21c16742669fb38d8d1e83a2e4c (e o valor intermediario 52d21ea1b0 desta propria frente, de antes dos consertos de prosa em `perto/minhas_indicacoes.dart` -- o cabecalho dela ainda dizia que ela era aba e que "falta uma linha" para ser -- e em `perto/lista_do_diretorio.dart`, que apontava a acao flutuante para `AbaPerto`). // LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
///
/// **VALOR FINAL DO SEGUNDO LOTE DE 19/10/2026.**
///
/// **SETE valores de ramo disputaram este campo, e NENHUM sobreviveu.** O
/// hash e de ARVORE e cobre `app/lib/telas` inteira; cada frente mediu a SUA
/// arvore isolada, e seis das sete tocaram a pasta. Os valores superados,
/// todos com a justificativa INTEIRA preservada acima, de proposito:
///
///   c46ae91fdb  `origin/development` (o PRIMEIRO lote de 19/10)
///   6622873a56  `feat/versao-minima-do-app`
///   0a06fa5404  `feat/app-manda-a-propria-versao` (a mescla do anterior)
///   7e739f5a3b  `feat/pets-por-distancia`
///   db34d3b735  `feat/capa-do-evento-e-vitrine`
///   bea2650f34  `feat/evento-simples-e-sem-telefone` (a ponta `58d0df28`)
///   30fdc84cd6  `feat/barra-com-mural-e-rede-unificada`
///
/// `fix/cancelar-o-proprio-evento` nao entra na lista: ela nao tocou
/// `app/lib/telas` e media o valor da propria development.
///
/// **O QUE MUDOU NESTA UNIAO, e por que o valor nao e o de nenhum ramo.** As
/// mudancas se somam na mesma pasta: a pasta NOVA `atualizacao/` (bloqueio
/// por versao), `perdido/lista_de_perdidos.dart` (a cidade pela
/// localizacao), `perfil/tela_dados_pessoais.dart` e `perfil/vitrine_de_fotos.dart`
/// (a foto que sobe na escolha e a vitrine), `rede/encontro_da_rede.dart` e
/// `rede/local_do_encontro.dart` APAGADAS, `rede/cartao_do_encontro.dart`
/// (foto e titulo, mais UMA palavra no cancelado), `rede/criar_encontro.dart`
/// (a capa), `perto/pagina_do_local.dart` (o telefone fora da tela), a pasta
/// NOVA `mural/`, `rede/secao_da_rede.dart` NOVA, `perto/tela_de_minhas_indicacoes.dart`
/// NOVA, `perto/corpo_do_perto.dart` APAGADA, mais `abas.dart`,
/// `casca_com_abas.dart`, `gaveta_de_secoes.dart` e
/// `rede/agenda_da_rede.dart`.
///
/// **`rede/agenda_da_rede.dart` NAO E A SOMA DOS DOIS DIFFS, e isto precisa
/// ser lido.** `feat/barra-com-mural-e-rede-unificada` e
/// `feat/evento-simples-e-sem-telefone` estavam no MESMO metodo: a primeira
/// converteu as tres abas em recorte e deixou a terceira viva como o `bool
/// _soOndePedi`; a segunda REMOVEU a aba `Meus pedidos` por decisao do
/// cliente no mesmo dia. **A remocao ganhou, e nao por preferencia de quem
/// mesclou: o outro lado nao compilaria** -- `RecorteDaRede` perdeu
/// `visibilidade`, `estadoDoPedido` e `queryDePedidos`, e
/// `AgendaDaRede.tituloDoVazioDePedidos` deixou de ser declarada. O
/// resultado tem DUAS abas de secao (`Eventos` e `Comunidade`, em
/// `rede/secao_da_rede.dart`, `TabBar` rolavel), `Próximos`/`Encerrados`
/// como grupo `Quando` da folha, `Meus pedidos` INEXISTENTE e
/// `Minhas indicações` como porta propria.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore
/// MESCLADA (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`
/// -- COM as chaves: em zsh, sem elas o shell aplica o modificador de
/// historia `:a` e devolve caminho absurdo, e MEDI isso nesta rodada), e nao
/// copiado de ramo nem de relato.
/// [valor de ramo 0bda41ae9a, SUPERADO pela uniao] SEGUNDO LOTE DE 19/10/2026, VALOR FINAL: recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao. Substitui os SETE valores de ramo listados acima, cujas justificativas ficam INTEIRAS.
/// [lado do ramo feat/meus-eventos-e-cancelar, valor de ramo c87d9e1afc, SUPERADO pela uniao] `Perfil` > `Meus eventos` (19/10/2026): UM arquivo NOVO em `app/lib/telas` -- `perfil/meus_eventos.dart` -- mais UMA linha em `abas.dart` (o `ItemDeMenu` entre `Meus achados` e `Sair da conta`, onde o proprio arquivo declara que item novo entra) e o importe dela. A tela e o UNICO caminho do app ate `cancelNetworkEvent`: nada na resposta da agenda diz de quem e o encontro. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; a tela nova importa so `material`, a camada de api, o `Escopo`, o tema, quatro pecas de `widgets/` (`arrastar_para_atualizar`, `convite_para_entrar`, `faixa_de_aviso`, `folha_destrutiva`, `saida_da_tela`) e `rede/pecas_da_rede.dart` -- o portao estrutural de diretivas deste mesmo arquivo responde por isso. A FIACAO da rota NAO esta aqui: ela mora em `app/lib/roteamento/rotas.dart`, que esta FORA de `app/lib/telas` e por isso nao mexe neste valor. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (GIT_INDEX_FILE proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${arvore}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absurdo em SILENCIO). **QUEM MESCLAR PRECISA RECALCULAR SOBRE A ARVORE MESCLADA**: valor de ramo isolado NAO sobrevive a uniao, e SEIS frentes mexem em `app/lib/telas` nesta rodada. ANTERIOR: c46ae91fdb80c21c16742669fb38d8d1e83a2e4c (o LOTE DE 19/10/2026, logo abaixo). === LOTE DE 19/10/2026, VALOR FINAL: recalculado pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`) depois dos DOIS consertos de ACHADO DA MESCLA: (1) os itens vivos novos da gaveta nasceram sem glifo porque a assercao que o exige veio de outro ramo; (2) `pessoa/tela_perfil_de_pessoa.dart` e `seguranca/tela_de_bloqueados.dart` montavam `RefreshIndicator` CRU, e o ponto unico do gesto veio de outro ramo -- as duas foram convertidas para `ArrastarParaAtualizar`. Substitui 201cb4ec32ee39e427d3645c699d0e9d8da537d5.
///
/// **VALOR FINAL DO SEGUNDO LOTE DE 19/10/2026, com as OITO frentes.**
///
/// **OITO valores de ramo disputaram este campo, e NENHUM sobreviveu** -- mais
/// um valor intermediario desta propria mescla, que tambem nao sobreviveu
/// quando a oitava frente entrou. O hash e de ARVORE e cobre `app/lib/telas`
/// inteira; cada frente mediu a SUA arvore isolada. Os valores superados, com
/// a justificativa INTEIRA preservada acima, de proposito:
///
///   c46ae91fdb  `origin/development` (o PRIMEIRO lote de 19/10)
///   6622873a56  `feat/versao-minima-do-app`
///   0a06fa5404  `feat/app-manda-a-propria-versao` (a mescla do anterior)
///   7e739f5a3b  `feat/pets-por-distancia`
///   db34d3b735  `feat/capa-do-evento-e-vitrine`
///   bea2650f34  `feat/evento-simples-e-sem-telefone` (a ponta `58d0df28`)
///   30fdc84cd6  `feat/barra-com-mural-e-rede-unificada`
///   c87d9e1afc  `feat/meus-eventos-e-cancelar`
///   0bda41ae9a  valor INTERMEDIARIO desta mescla, com SETE frentes, antes de
///               a oitava entrar -- registrado para ninguem o confundir com o
///               valor final nem com um valor de ramo
///
/// `fix/cancelar-o-proprio-evento` nao entra na lista: ela nao tocou
/// `app/lib/telas`, e fica CONTIDA em `feat/meus-eventos-e-cancelar`.
///
/// **O QUE A OITAVA FRENTE SOMOU A PASTA**, e por que o valor mudou de novo:
/// `perfil/meus_eventos.dart` NASCE (a lista de quem criou o encontro, e o
/// unico caminho do app ate `Cancelar`); `abas.dart` ganha o item
/// `Meus eventos`; e `rede/pecas_da_rede.dart` RECUPERA `rotuloDaSituacao` e
/// `DistintivoDeSituacao`.
///
/// **DUAS COLISOES ENTRE FRENTES FORAM RESOLVIDAS NESTA PASTA, e nenhuma deu
/// conflito textual na segunda -- ela apareceu como ERRO DE COMPILACAO.**
///
/// 1. `abas.dart`, conflito textual: `feat/barra-...` e
///    `feat/meus-eventos-e-cancelar` acrescentaram item no MESMO ponto do menu
///    da conta. Os TRES sobrevivem (`Pedidos de conexão`, `Pessoas
///    bloqueadas`, `Meus eventos`), com `Sair da conta` ainda por ultimo.
///    Apagar qualquer um deixaria tela construida sem porta.
///
/// 2. `rede/pecas_da_rede.dart`, SEM conflito textual: `meus_eventos.dart`
///    chamava `rotuloDaSituacao`, `DistintivoDeSituacao` e o parametro
///    `cancelado` da capa, que `feat/evento-simples-e-sem-telefone` havia
///    apagado. O git dobrou os dois lados em silencio e `flutter analyze`
///    acusou com QUATRO erros. Os dois primeiros voltaram verbatim da base,
///    porque o motivo escrito da remocao deles era **falta de chamador** e a
///    oitava frente traz um chamador noutra tela. O terceiro NAO voltou: ele
///    saiu por ser sinal exclusivamente por cor (SC 1.4.1), e decisao de
///    acessibilidade nao se desfaz por conveniencia de mescla.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore
/// MESCLADA (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`
/// -- COM as chaves: em zsh, sem elas o shell aplica o modificador de
/// historia `:a` e devolve caminho absurdo, e MEDI isso nesta rodada), e nao
/// copiado de ramo nem de relato.
///
/// **AVISO DO E-MAIL NAO CONFIRMADO NA TELA DE INDICAR (20/10/2026).** Um
/// arquivo mudou, `perto/sugerir_profissional.dart`, e a mudanca e a simetria
/// que faltava entre as duas acoes de criar da comunidade: a tela de criar
/// encontro tem `_Impedimento.semEmailConfirmado` desde o primeiro dia, e a
/// de indicar profissional nao tinha nenhum impedimento de e-mail -- quem
/// chegava a rota por link profundo (`podeCriarNaComunidade`, em
/// `abas.dart`, esconde a PORTA e nao fecha a ROTA) preenchia o formulario
/// inteiro para ser recusado no envio pelo `409
/// contact-channel-unverified`. Entrou o impedimento, ANTES dos de
/// preenchimento, e a faixa com a saida `Confirmar meu e-mail` acima dos
/// campos, pelo `FaixaDeAviso` que a outra tela ja usa.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe novo no arquivo
/// (`widgets/faixa_de_aviso.dart`, `roteamento/rotas.dart` e
/// `go_router` ja estavam lá), nenhum plugin, nenhum canal de plataforma,
/// nenhuma permissao, nenhum `dart:io` -- o portao estrutural de diretivas
/// deste mesmo arquivo continua respondendo por isso. `abas.dart`,
/// `criar_encontro.dart`, `src/` e o contrato **nao foram tocados**: o
/// servidor ja recusa e esta certo.
///
/// LINHA DE BASE CONFERIDA antes da edicao: a arvore limpa de
/// `origin/development` (`fb3a0fba`) reproduziu `1413454d74` pelo
/// procedimento abaixo, e so depois disso o valor novo foi calculado. Valor
/// RECALCULADO pelo procedimento deste proprio portao sobre a arvore de
/// trabalho JA MESCLADA com `origin/development` (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"` -- COM as chaves), e nao copiado de ramo
/// nem de relato. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** --
/// ha outras sessoes tocando `app/lib/telas` nesta rodada, e valor de ramo
/// isolado nao sobrevive a uniao. Anterior: `1413454d74`.
/// ---------------------------------------------------------------------------
/// ## 20/10/2026, `fix/localizacao-nos-pets`: O BOTAO DE LOCALIZACAO DOS PETS
///
/// **VALOR DE RAMO, e quem mesclar TEM DE RECALCULAR** sobre a arvore mesclada:
/// ha outras sessoes nesta rodada em `app/lib/telas`, e valor de ramo isolado
/// nao sobrevive a uniao. Anterior: `1413454d74` (o valor final do segundo lote
/// de 19/10, com as oito frentes -- a justificativa dele fica INTEIRA acima).
///
/// **O QUE ESTA FRENTE SOMOU A PASTA**, e e um arquivo so:
/// `perdido/lista_de_perdidos.dart`. Duas coisas, as duas medidas em teste de
/// widget e nenhuma em aparelho:
///
/// 1. **A CAUSA do relato do cliente** (*"o botao de usar minha localizacao na
///    secao do pets nao esta funcionando"*): `_resolverEAplicar` era um metodo
///    so para a resolucao de ABERTURA e para o TOQUE, e o guarda
///    `if (_pessoaMexeu) return;` -- correto para a abertura -- DESCARTAVA o
///    resultado do toque. Ele passou a receber `porToque`, e no toque a escolha
///    da pessoa e o proprio toque.
/// 2. **As quatro frases do toque.** Permissao recusada, servico desligado,
///    cidade nao descoberta e cidade descoberta sem pet nenhum deixaram de ser
///    desfechos mudos. A resolucao de ABERTURA segue muda nos oito motivos, e a
///    assimetria e decisao: la ninguem pediu nada.
/// 3. **O teto da espera** (`tetoDaEsperaDaResolucao`), que fecha a lacuna que
///    o proprio conserto abriria: `prazoDaResolucao` cobre a MEDICAO do ponto
///    e nao a resolucao do nome da cidade, e nao ha `timeout` em lugar nenhum
///    do `geocoding` nem do `geocoding_android` (varrido). Sem teto,
///    `Procurando sua localizacao...` seria uma frase que nunca sai.
///
/// Nenhuma tela NASCEU e nenhuma SAIU, e nenhuma porta nova foi aberta: a
/// `Localizacao` que esta tela usa ja vinha do `Escopo` desde 19/10/2026.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao nesta arvore
/// (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`,
/// `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves, porque sem
/// elas o zsh aplica o modificador `:a` e devolve caminho absurdo em silencio),
/// e nao copiado de relato.
/// BICHUS-278 (20/10/2026) -- O CONTADOR DE NAO LIDO DA ABA `AuAu`.
///
/// BICHUS-278 (20/10/2026) -- OS CONTADORES DAS ABAS `Pets` E `Rede`.
///
/// Destravado por `d979a337...` -> `7f016247...`. A frente anterior entregou o
/// contador de `AuAu` e MEDIU que as outras quatro abas nao tinham fonte; o
/// cliente mandou construir tres delas no mesmo dia (a do `Mural` e de outra
/// frente). TRES arquivos desta pasta mudaram:
///
///   * `casca_com_abas.dart` -- `SubstantivoDaContagem` NASCE e
///     `DestinoDeNavegacao` ganha `contagem`. E a regra que a frente anterior
///     deixou escrita, cumprida: *"quando a segunda aba ganhar fonte, o
///     substantivo entra no registro do destino"*. `nomeAcessivelCom` perdeu a
///     palavra `mensagem` fixa no corpo e o `assert` passou a cobrar a
///     PRESENCA do substantivo em vez do campo semantico. `_naoLidasDaAba`
///     virou `switch` sem `default`, para campo novo do enum nao cair em nulo
///     em silencio;
///   * `perdido/lista_de_perdidos.dart` -- UMA chamada nova, depois de a
///     primeira pagina chegar na tela: `marcarSecaoVista(pets)`. E o mesmo
///     momento e a mesma razao de `aoVerAArea` em `area_de_mensagens.dart` --
///     marcar no toque zeraria o selo de quem abriu a aba e levou erro de rede;
///   * `rede/secao_da_rede.dart` -- `initState` marca a sub-aba INICIAL como
///     vista e `_trocarAba` marca a nova. As duas sub-abas tem marcadores
///     SEPARADOS, entao o selo da aba `Rede` -- que e a soma -- desce em dois
///     passos.
///
/// **Nenhuma colisao com as quatro frentes vizinhas nesta pasta**, medido por
/// leitura: a da barra toca `AvatarDaConta` e a margem da foto, a do compositor
/// toca `mural/`, a do aviso de login toca o detalhe do evento, e a do selo de
/// "encontrado" toca o CARTAO da lista de perdidos. As tres mudancas acima
/// estao em `DestinoDeNavegacao`/`_naoLidasDaAba`, no `_carregar` da lista e no
/// estado das sub-abas da `Rede` -- nenhuma delas e o mesmo ponto.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao (`GIT_INDEX_FILE`
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"` -- COM as chaves), e nao copiado de ramo
/// nem de relato.
///
/// Destravado por `1413454d...` -> `d979a337...`. Duas telas mudaram, e as
/// duas por pedido literal do cliente (*"o icone do auau vai ficar de outra
/// cor com o +1, +2 dependendo a quantidade de mensagens nao lida"*):
///
///   * `app/lib/telas/casca_com_abas.dart` -- `DistintivoDaAba` (o numero
///     SOBRE o glifo, fora do fluxo, para nao disputar a largura do rotulo),
///     `DestinoDeNavegacao.nomeAcessivelCom` (o numero INTEIRO para quem ouve
///     a tela) e o `ListenableBuilder` que reconstroi SO a barra;
///   * `app/lib/telas/mensagens/area_de_mensagens.dart` -- UM parametro novo,
///     `aoVerAArea`, que dispara depois de `markMyConversationsSeen` voltar. A
///     costura irma (`aoContarNaoLidas`) ja existia e nao mudou.
///
/// **Valor RECALCULADO pelo procedimento deste proprio portao**, sobre o commit
/// desta frente e depois de comitar: `git rev-parse "${T}:app/lib/telas"` --
/// COM as chaves, pelo motivo medido no paragrafo acima. Nao copiado de relato.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA.** Duas outras frentes
/// rodam hoje e ao menos uma delas encosta na barra (margem da foto, barra de
/// baixo fixa, menu do perfil, alvo secundario em `Pets`) e a outra no
/// compositor do `Mural` -- quer dizer, nos MESMOS dois diretorios. Este valor
/// e de RAMO e nao vale depois da uniao, exatamente como os oito de 19/10 nao
/// valeram.
///
/// **MURAL, 20/10/2026 (BICHUS-278).** O valor anterior,
/// `1413454d749f87001859c85e1e6e71d0449c2941`, era o do segundo lote de 19/10
/// com as oito frentes, e a justificativa dele fica inteira logo acima.
///
/// O que mudou em `app/lib/telas` nesta frente, e por que cada mudanca e de
/// OUTRA historia e legitima -- o pedido do cliente de 20/10: *"na secao do
/// mural, nao tem a caixa de texto para o usuario escrever uma mensagem, subir
/// uma foto e publicar o conteudo."*, mais as duas decisoes dele que chegaram
/// durante a frente (a foto do autor, e curtir e comentar):
///
///   - `mural/publicar_no_mural.dart` (NOVO) -- a caixa de texto, a foto e o
///     `Publicar`;
///   - `mural/comentarios_da_publicacao.dart` (NOVO) -- os comentarios, por
///     decisao dele de 19/10 (*"curtir e comentar"*), com o carimbo de migracao
///     `20261020000006`; mais o `Apagar` que o DONO DA PUBLICACAO ve em
///     comentario de terceiro, por decisao dele de 20/10 -- e que **nao e
///     moderacao**: nao passa por fila, nao tem administrador e nao tem
///     revisao;
///   - `mural/tela_do_mural.dart` -- o estado inicial honesto virou a linha do
///     tempo, porque agora existe `GET /timeline` para desenhar; mais a foto do
///     autor (Emenda 5 do ADR-0010, *"tras a foto, algo bem parecido com o
///     instagram"*) e a linha de curtir e comentar;
///   - `abas.dart` -- `AbaMural` ganhou a acao flutuante `Publicar`, que a
///     frente de 19/10 deliberadamente NAO desenhou por nao haver destino.
///
/// **O criterio 10 continua valendo, e isto nao e excecao a ele.** O criterio
/// diz que nenhuma tela muda de codigo *por causa da camera embarcada*, e que
/// tela que fala com o aparelho tem a porta sendo contornada. `PublicarNoMural`
/// nao fala com o aparelho: ela recebe `CameraEGaleria` por construtor, nao
/// importa `dart:io` (a previa e `PreviaDaFoto`, que mora em `lib/widgets/`
/// justamente por isso) e nao importa `image_picker` nem
/// `permission_handler`. `ComentariosDaPublicacao` nao toca o aparelho em forma
/// nenhuma -- ela e texto. O grupo "o espirito do criterio 10" deste mesmo
/// arquivo mede isso mecanicamente, e ele continua verde -- que e o que
/// distingue trocar o hash por mudanca legitima de trocar o hash para calar o
/// portao.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao, e nao copiado de
/// ramo nem de relato: `GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`
/// -- COM as chaves, porque em zsh sem elas o shell aplica o modificador de
/// historia `:a` e devolve caminho absurdo EM SILENCIO.
///
///
/// **Destravado pela VOLTA DA PAGINA DO ENCONTRO, 20/10/2026, e o destravamento
/// e correcao de pedido do cliente.** Literal: *"eu nao pedi pra voce remover,
/// eu pedi para remover o clique para o usuario nnao conseguir acessar a pagina
/// de detalhes e pedi pra voce resumir a listagem com foto, titulo do
/// evento"*. A entrega de 19/10 apagou `rede/encontro_da_rede.dart` e
/// `rede/local_do_encontro.dart`; os dois voltaram do historico
/// (`be057793^`), sem o evento privado.
///
/// **SETE arquivos de `app/lib/telas` mudam**, e nenhum deles encosta na porta
/// `CameraEGaleria`, que e o que o criterio 10 da BICHUS-161 protege:
///
///   - `rede/encontro_da_rede.dart` e `rede/local_do_encontro.dart`, de volta;
///   - `rede/cartao_do_encontro.dart`, que voltou a ser tocavel -- e o toque
///     vem de quem chama, nao dele;
///   - `rede/agenda_da_rede.dart`, que decide o toque pela sessao;
///   - `rede/pecas_da_rede.dart`, que recuperou `BlocoDoDia`, `SeloDoEncontro`
///     e `seloDeValor`, e deu texto alternativo a capa;
///   - `pet/tela_detalhe_do_pet.dart`, `achado/tela_do_achado.dart` e
///     `pessoa/tela_perfil_de_pessoa.dart`, que trocaram a faixa de erro vazia
///     do 401 pelo convite para entrar.
///
/// Nenhum deles le camera, abre galeria ou pede permissao -- e o portao de
/// diretivas abaixo continua cobrando isso sem depender desta constante. A
/// pagina do encontro restaurada **nao tem check-in nem galeria da
/// comunidade**: o que saiu pela emenda da BICHUS-251 continua fora, e a
/// restauracao veio do commit anterior a remocao, que ja era posterior aquela
/// emenda.
///
/// Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de
/// TRABALHO, e nao copiado de relato. Anterior:
/// `1413454d749f87001859c85e1e6e71d0449c2941`.
///
///
/// **BARRA FIXA E PERFIL POR TOPICOS, 20/10/2026 (ramo `4e13c694...`).**
/// A justificativa do ramo, preservada INTEIRA (ela vinha na linha da
/// constante, e nao em doc):
///
/// BICHUS -- A DELIMITACAO DE 20/10/2026, no mesmo dia dos quatro pedidos:
/// *"vamos colocar a barra fixa apenas nas paginas de primeiro plano, as
/// paginas internas, pode manter como esta. Exemplo: ao clicar no menu auau,
/// mantem a barra .. ao clicar na mensagem tira a barra. Ao clicar no perfil
/// mantem a barra, ao clicar no cadastro do pet, remove a barra. Na listagem
/// dos eventos, mantem a barra, ao clicar nos detalhes do evento, remove a
/// barra. E assim por diante."* **DOIS arquivos de `app/lib/telas` mudam, e
/// nenhum deles muda CODIGO de barra:** a fiacao que encolheu de 29 rotas
/// para 2 vive em `app/lib/roteamento/rotas.dart`, FORA desta arvore. (1)
/// `casca_com_abas.dart`: a prosa de `CascaFixa` e de `BarraDeBaixo` passa a
/// dizer PRIMEIRO PLANO contra PAGINA INTERNA, com o discriminador medido --
/// **quem abre a tela, a casca ou o conteudo** --, porque "lista contra
/// detalhe" le os tres exemplos dele e discorda de si mesma em OITO telas
/// desta arvore (`Meus achados`, `Meus eventos`, `Pedidos de conexao`,
/// `Pessoas bloqueadas`, `Minhas fotos`, `Minhas indicacoes`, `Adoções` e
/// `Meus dados` sao LISTAS e sao alcancadas de DENTRO do Perfil). Nenhuma
/// linha de codigo mudou: `CascaFixa`, `BarraDeBaixo` e o `Align` do respiro
/// da foto ficam como estavam. (2) `abas.dart`: a prosa de `Registrar achado
/// avulso` registra a RESPOSTA do cliente a pergunta fechada que eu levei --
/// *"O fluxo ja existe dentro do botao escanear, digitar codigo manualmente e
/// sinalizar o pet perdido ou no perfil do usuario, podemos deixar como
/// esta"* --, para que ninguem "conserte" a porta sem conta que ele aceitou
/// perder. Tambem so prosa. **O QUE NAO MUDOU, e vale dizer:** a margem da
/// foto (216,00 dp de orcamento, alvo 48 x 48), o `more_horiz` fora de `Pets`
/// e os quatro grupos do menu da conta continuam exatamente como entraram no
/// valor anterior. Valor RECALCULADO pelo procedimento deste proprio portao
/// sobre a arvore de trabalho (`GIT_INDEX_FILE` temporario, `read-tree HEAD`,
/// `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"`
/// -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o
/// modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e
/// nao copiado de relato. **A QUEM MESCLAR: recalcule sobre a arvore
/// MESCLADA.** A frente `feat/aviso-de-login-ao-tocar` (`65dfcb99`) traz
/// `rede/encontro_da_rede.dart` e `rede/local_do_encontro.dart` NOVOS nesta
/// arvore, e ela declara `encontros/:slug` **sob o ramo da `Rede`** -- o que
/// da a barra a ficha do evento POR CONSTRUCAO e contraria o exemplo literal
/// do cliente acima. O portao `toda rota empilhada esta classificada` reprova
/// nomeando `encontros/:slug` ate alguem decidir; o conserto que segue o
/// cliente e tira-la do `routes:` do ramo e declara-la irma da casca.
/// Substitui 99cc2437faf7cfabad8e567e698c4a7ae372ecec, e antes dele
/// 1413454d749f87001859c85e1e6e71d0449c2941.
///
/// **CORRECAO DO COMENTARIO DE `podeCriarNaComunidade` (20/10/2026).**
/// Justificativa do ramo, preservada INTEIRA (ela vinha na linha da
/// constante, e nao em doc):
///
/// CORRECAO DE COMENTARIO EM `telas/abas.dart` (20/10/2026), MESCLADA SOBRE O
/// SEGUNDO LOTE: SO o cabecalho de `podeCriarNaComunidade` muda, e nenhuma
/// linha executavel -- o corpo da funcao e todo o resto da pasta vem do lote,
/// byte a byte. O cabecalho afirmava que `createNetworkEvent` e a rota da
/// sugestao do diretorio "nao exigem `email_verified` em lugar nenhum de
/// `src/`" e que a metade "validado" da regra existia "so no app"; as duas
/// rotas RECUSAM, com `409 contact-channel-unverified` e `next_action:
/// verify_email` -- medido em hml no commit `458cd005` com conta descartavel
/// de `email_verified: false`, e `suggestDirectoryEntry` junto com
/// `createNetworkEvent`. O servidor cobra CANAL DE CONTATO
/// (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`, a mesma
/// redacao em `kysely-network-repository.ts` e `kysely-canal-verificado-do-
/// chamador.ts`), e e por isso que procurar `email_verified` em `src/` nao
/// achava a trava: a metade do e-mail mora numa coluna com sufixo `_at`. **O
/// VALOR DO LOTE NAO SOBREVIVEU A ESTA MESCLA** porque os dois lados tocam
/// `abas.dart` -- o lote por `Meus eventos` no menu da conta, esta correcao
/// pelo cabecalho --, e o hash e de ARVORE. Valor RECALCULADO sobre a arvore
/// MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE
/// temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`,
/// `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE
/// conferida antes: `origin/development:app/lib/telas` reproduziu
/// 1413454d749f87001859c85e1e6e71d0449c2941, o valor que o lote travava.
/// Substitui 1413454d749f87001859c85e1e6e71d0449c2941 (e, do ramo isolado
/// desta correcao, 5e7f753f673afdabeb3fe709ae04537b816e6051, que media a
/// arvore de ANTES do lote e por isso nao vale).
///
///
/// DESTRAVADO DE NOVO EM 19/10 PELA TELA DO ACHADO (`/achados/:achadoId`), que
/// e o destino do botao `Ver o achado` do desfecho e tinha ficado com o desenho
/// antigo -- um paragrafo, a linha da regiao, a observacao e uma faixa. Quem
/// volta ao app no dia seguinte para acompanhar o achado chega NELA, e nao no
/// desfecho, que so existe no instante do envio. Quatro arquivos desta pasta
/// mudam, e nenhum deles por causa da camera:
///
/// - `achado/tela_do_achado.dart`: os tres blocos do desfecho, o gesto de
///   arrastar-para-atualizar (ela e a **decima segunda** superficie, e ficou
///   fora do lote de 18/10 porque o recorte daquele dia foi listagem), o estado
///   lido do SERVIDOR em vez do `Em análise` fixo, e UMA LINHA dizendo onde a
///   foto esta -- a tela nao tem foto para desenhar e nao finge que tem;
/// - `achado/textos_do_achado.dart`: a constante da linha da foto. Ela
///   substitui, nesta tela, uma frase que era FALSA ali: `fotoAindaNaoSubiu`
///   afirma que o envio nao aconteceu, e o `GET` de um achado nao devolve
///   estado de envio de foto nenhum;
/// - `achado/tela_achado_registrado.dart`: o `_Bloco` privado saiu para
///   `widgets/bloco_de_informacao.dart`, porque agora sao DUAS telas com os
///   mesmos blocos e uma copia perderia o `header: true` sem ninguem ver;
/// - `perfil/meus_achados.dart`: `rotuloDoEstado` deixou de ser privado do
///   cartao. Um segundo `switch` sobre o mesmo `status` na tela do achado seria
///   a segunda traducao do mesmo campo, e as duas telas estao a dois toques uma
///   da outra na mesma conta.
///
/// **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum
/// canal de plataforma, nenhuma permissao, nenhum `dart:io`. A tela do achado
/// nao desenha arquivo do aparelho **de proposito** -- dar-lhe uma gaveta por
/// `achadoId` seria a foto do animal de alguem esperando, num aparelho
/// compartilhado, a proxima pessoa a entrar.
///
/// **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA**, pelo procedimento
/// deste proprio portao. Este valor tambem e de RAMO ISOLADO --
/// `claude/achado-detalhe-rico-535cde` sobre `feat/achado-rico-e-loja-sem-preco`
/// em 1d4a9e1f -- e valor de ramo isolado NAO sobrevive a uniao.
/// (antes: 6a089b729b)
///
///
/// **REMEDIDO NA SEGUNDA MESCLA DA `development` NO SINO (20/10/2026).** O
/// segundo lote e esta frente mexeram os dois em `app/lib/telas` -- o lote
/// trocou `Perto` por `Mural` e tirou o hamburguer da barra; esta frente
/// ligou o contador do sino. Nenhum dos dois valores de ramo sobrevive:
/// `1413454d74` mediu a arvore do segundo lote sem o contador, e
/// `96e2144577` mediu a arvore da primeira mescla sem o segundo lote. O
/// valor abaixo foi RECALCULADO sobre a arvore MESCLADA pelo procedimento
/// deste proprio portao, e nao escolhido entre os dois lados. As
/// justificativas de TODOS os ramos continuam INTEIRAS acima.
///
/// [lado do ramo, valor de ramo 96e2144577] O NUMERO DO SINO LIGADO
/// (19/10/2026): `casca_com_abas.dart` LE `Escopo.contadorDeAvisos` e o ouve
/// (`ListenableBuilder` em volta do `ValueListenableBuilder` que ja existia),
/// e a linha do `actions` virou
/// `SinoDeNotificacoes(naoLidas: contadorDeAvisos.naoLidas)` -- o `const` da
/// lista saiu porque o numero e valor de execucao, e a lista continua com UM
/// item. `notificacoes/caixa_de_notificacoes.dart` zera o contador no caminho
/// de SUCESSO de `marcarListaVista`. A busca NAO mora nestes dois arquivos:
/// ela mora em `sessao/contador_de_avisos.dart` e e disparada pelo
/// `app.dart`, os dois FORA desta arvore. **Nenhuma porta de aparelho
/// encostada**: nenhum importe de plugin, nenhum canal de plataforma,
/// nenhuma permissao, nenhum `dart:io`.
const String _arvoreDasTelas = '04307255a0e445490e9533e38c88ec2c9641b812'; // TERCEIRO LOTE DE 20/10/2026, ONDA 3, VALOR FINAL. Recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE conferida ANTES de ser usado: `origin/development:app/lib/telas` reproduziu 86c644e7d3375cba598cca5f7ca885cd206ae06e. Substitui o valor da base (86c644e7d3375cba598cca5f7ca885cd206ae06e) e os valores de RAMO desta onda -- 563392a143b46a86670c5dbe3315b7a4d07474e6 (`fix/localizacao-nos-pets`) entre eles --, que mediam arvores de ANTES da uniao e por isso nao valem. As justificativas de TODOS os ramos ficam INTEIRAS. === PROCEDENCIA, RAMO `feat/compartilhar-o-caso` (valor de ramo d5d63934232939b630781b40c822480f517c9fda): COMPARTILHAR O CASO (20/10/2026, pedido do cliente): *"vamos implementar uma acao de compartilhar o pet perdido no whatsapp, dentro da pagina de detalhes do pet"*, com a folha do sistema fechada na resposta seguinte. UM arquivo de `app/lib/telas` muda, `pet/tela_detalhe_do_pet.dart`: entram a leitura do caso aberto (`getLostCase`, a unica porta do contrato que traz `share_url` e `area_label`), o getter `_linkDoCaso` e o botao `Compartilhar` no ramo do pet procurado. **A tela NAO fala com o aparelho**: quem abre a folha e `lib/dispositivo/saida_do_app.dart`, e `package:share_plus/` entrou na lista de `_importesProibidos` deste arquivo na MESMA rodada -- medido reprovando com o import posto na tela de proposito. Procedencia anterior: O RECENCONTRADO NA LISTA PADRAO (20/10/2026, segunda rodada do mesmo dia): perguntado se o pet reencontrado devia aparecer so no filtro `Encontrados` ou tambem na lista de sempre, o cliente respondeu **"Tambem na lista padrao"**. UM arquivo de `app/lib/telas` muda, `perdido/lista_de_perdidos.dart`, e a mudanca e so de PROSA e de uma frase de microcopy: o comentario do `GrupoDeFiltro` de `case_state` passou a dizer que a ausencia de pastilha e a UNIAO (e nao mais "os casos abertos"), e a `nota` da folha ganhou a primeira frase -- `A lista ja traz os dois.` --, sem a qual quem ve um cartao com selo na lista nao entende de onde ele veio e quem escolhe `Encontrados` e acha pouco nao sabe que o resto estava junto. Nenhum widget novo, nenhum campo novo, nenhum controle novo: o `GrupoDeFiltro` e as duas pastilhas sao os mesmos da entrega anterior do mesmo dia. O que de fato mudou mora FORA desta arvore -- `app/lib/api/modelos_perdido.dart` (a prosa de `EstadoDoCasoNaLista`) e o servidor, onde o recorte padrao virou `status = 'open' OR (reencontrado na janela)`. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`, e o portao estrutural de diretivas deste mesmo arquivo responde por isso. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO). ANTERIOR: ff13bc0d93e48e521602f72a38023669b43625b3 (o selo e o filtro, logo abaixo). // O SELO E O FILTRO DE `encontrado pela comunidade` (20/10/2026), decisao do cliente: *"o pet ganha um selo/filtro na pagina de pets como encontrado por 30 dias e depois ele expira e sai"*, com o sinal sendo *"depois de um usuario ter escaneado a tag do usuario ou ter entrado em contato"*. TRES arquivos de `app/lib/telas` mudam, e nenhum nasce nem e apagado. (1) `perdido/cartao_do_perdido.dart`: o selo do cartao passa a sair do campo `found_by_community` da RESPOSTA (`seloDe`), com o texto `Encontrado pela comunidade` e com `successContainer`/`textPrimary` -- `success` sobre `successContainer` reprova 4,5:1 no tema CLARO (4,47:1 medido sobre os tokens), e nao existe `onSuccessContainer` no sistema; `rotuloAcessivelDe` le o MESMO selo, para o leitor de tela nao ouvir `Perdido` sobre um pet que voltou. (2) `perdido/lista_de_perdidos.dart`: um `GrupoDeFiltro` novo (`case_state`, `Perdidos`/`Encontrados`) como PRIMEIRO grupo da folha, nascendo sem pastilha marcada, mais a leitura dele em `_aplicarAFolha` e no `_temRecorteAtivo`. O componente compartilhado `widgets/barra_de_listagem.dart` NAO FOI TOCADO: o gatilho so-icone a direita da busca e os grupos de filtro ja existiam, e o filtro novo e dado entregue a ele. (3) `perdido/tela_de_quem_e_o_caso.dart`: a elegibilidade de `Marcar como perdido` passa a ler o PAR `status == perdido || open_case_id != null` (`jaProcuradoPeloPar`), porque MEDIDO em 20/10/2026 nada em `src/` nem em `migrations/` escreve `pets.status = 'lost'` -- um pet COM caso aberto aparecia como elegivel e o toque batia num `409 pet-already-lost` depois de duas telas, que e o que o criterio 13 existe para evitar. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- os tres arquivos importam so `material`, `go_router`, a camada de api, o tema e widgets compartilhados, e o portao estrutural de diretivas deste mesmo arquivo responde por isso. O que mudou FORA desta arvore e por isso nao mexe neste valor: `app/lib/api/modelos_perdido.dart` (`EstadoDoCasoNaLista`, `found_by_community` e `case_state` na query) e `app/lib/widgets/cartao_de_pet.dart` (`procuradoDe`, o selo `PERDIDO` que nunca aparecia). Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore de trabalho (`GIT_INDEX_FILE` proprio, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- em zsh as CHAVES sao obrigatorias: sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto em SILENCIO), e nao copiado de relato. ANTERIOR: 1413454d749f87001859c85e1e6e71d0449c2941 (SEGUNDO LOTE DE 19/10/2026, logo abaixo). **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- ha outras quatro frentes nesta rodada e pelo menos uma delas (o aviso de login ao tocar conteudo) cruza `perdido/lista_de_perdidos.dart`; valor de ramo isolado nao sobrevive a uniao. // SEGUNDO LOTE DE 19/10/2026, VALOR FINAL com as OITO frentes: recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao. Substitui os OITO valores de ramo e o intermediario de sete frentes, listados acima, cujas justificativas ficam INTEIRAS. === PROCEDENCIA ANTERIOR (valor 86c644e7d3375cba598cca5f7ca885cd206ae06e): CORRECAO DE COMENTARIO EM `telas/abas.dart` (20/10/2026), TERCEIRA MESCLA, sobre a development de `6b59933d`: SO o cabecalho de `podeCriarNaComunidade` muda, e nenhuma linha executavel. As duas rotas de criar da comunidade RECUSAM conta nao validada com `409 contact-channel-unverified` -- o cabecalho dizia que nao, e que a metade "validado" existia "so no app". O servidor cobra CANAL DE CONTATO (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), e por isso procurar `email_verified` em `src/` nao achava a trava. Valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE conferida antes: `origin/development:app/lib/telas` reproduziu c08880b92cd668cc8c630ece0da43714613d0b21. TERCEIRA vez que este ramo recalcula: a development andou 24 e depois 36 commits enquanto este PR de COMENTARIO esperava, e cada PR do app disputa esta mesma constante. Substitui c08880b92c (e, dos ramos anteriores desta correcao, 5e7f753f67, 27399b7b2e e 83b68e5442, que mediam arvores de antes). === HISTORICO, INTEIRO: TERCEIRO LOTE DE 20/10/2026, ONDA 2, VALOR FINAL. Recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com o procedimento VALIDADO na base antes de ser usado. Substitui o valor final da onda 1 (`2f822c38...`), os dois intermediarios da onda 2 e os valores de RAMO da correcao do cabecalho, da ficha rica do achado e do sino, cujas justificativas ficam INTEIRAS acima. === PROCEDENCIA, RAMO `fix/localizacao-nos-pets` (valor de ramo 563392a143b46a86670c5dbe3315b7a4d07474e6): VALOR DE RAMO de `fix/localizacao-nos-pets` (20/10/2026). RECALCULE na mescla. Anterior: `1413454d74`, o valor final do segundo lote de 19/10 com as OITO frentes, cuja justificativa fica INTEIRA acima. === PROCEDENCIA, RAMO `saida-do-409-indicacao (PR #45)` (valor de ramo 43bc80a21582577caa783edc1da0725c0a4167a7): BICHUS-62 -- A SAIDA DO `409` NA TELA DE INDICAR PROFISSIONAL (20/10/2026), RECALCULADO SOBRE A MESCLA COM `origin/development` (`ceff3402`). `perto/sugerir_profissional.dart` ganhou o ramo de `ProximaAcao.verificarEmail` no `_saidaDoErro`, espelhando `rede/criar_encontro.dart`: sem ele o `409 contact-channel-unverified` desenhava a faixa com a frase do servidor e NENHUMA saida -- `FaixaDeAviso` so monta o `TextButton` com rotulo E callback (`widgets/faixa_de_aviso.dart`, linha 97), entao o rotulo `Confirmar meu e-mail` nao saia morto: nao saia. E a unica mudanca deste ramo nesta arvore; todo o resto vem da `development`, e a prosa em doc dela ficou INTEIRA acima, com a justificativa da ONDA 2 adiante nesta mesma linha. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o unico uso novo e `Escopo.of(context)` e `Rotas.verifiqueSeuEmail`, os dois ja importados no arquivo; o portao estrutural de diretivas deste mesmo arquivo continua respondendo por isso. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore JA MESCLADA (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), e nao copiado de ramo nem de relato. **LINHA DE BASE conferida RODANDO ESTE PORTAO** num worktree limpo em `ceff3402`: ele passou, e a arvore de la reproduz o `86c644e7d3` que esta linha substitui. **ARMADILHA MEDIDA, e ela custou uma conclusao errada:** `origin/development` andou de `6b59933d` para `ceff3402` NO MEIO desta mescla, e comparar o valor travado de uma revisao com a arvore de outra me fez concluir que o portao estava vermelho na `development` -- nao estava, e as duas revisoes sao consistentes consigo mesmas. Quem conferir base, leia o valor travado e a arvore DA MESMA revisao, com o SHA na mao. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- o PR #40 (`aviso-email-sugestao`) toca O MESMO ARQUIVO e seguia ABERTO nesta data. Substitui o `86c644e7d3` da `development` e, antes dele, o valor de RAMO `2fc783e272` que esta mescla descartou; as justificativas das duas ficam INTEIRAS. // CORRECAO DE COMENTARIO EM `telas/abas.dart` (20/10/2026), TERCEIRA MESCLA, sobre a development de `6b59933d`: SO o cabecalho de `podeCriarNaComunidade` muda, e nenhuma linha executavel. As duas rotas de criar da comunidade RECUSAM conta nao validada com `409 contact-channel-unverified` -- o cabecalho dizia que nao, e que a metade "validado" existia "so no app". O servidor cobra CANAL DE CONTATO (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), e por isso procurar `email_verified` em `src/` nao achava a trava. Valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE conferida antes: `origin/development:app/lib/telas` reproduziu c08880b92cd668cc8c630ece0da43714613d0b21. TERCEIRA vez que este ramo recalcula: a development andou 24 e depois 36 commits enquanto este PR de COMENTARIO esperava, e cada PR do app disputa esta mesma constante. Substitui c08880b92c (e, dos ramos anteriores desta correcao, 5e7f753f67, 27399b7b2e e 83b68e5442, que mediam arvores de antes). === HISTORICO, INTEIRO: TERCEIRO LOTE DE 20/10/2026, ONDA 2, VALOR FINAL. Recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com o procedimento VALIDADO na base antes de ser usado. Substitui o valor final da onda 1 (`2f822c38...`), os dois intermediarios da onda 2 e os valores de RAMO da correcao do cabecalho, da ficha rica do achado e do sino, cujas justificativas ficam INTEIRAS acima. === PROCEDENCIA, RAMO `frase-do-409-por-rota (PR #49)` (valor de ramo e720d4b0f8562baa5768340d9a3a1586bdd4f8b8): A FRASE DO `409 contact-channel-unverified` PASSA A FALAR DA ROTA QUE RECUSOU (20/10/2026): QUATRO arquivos de `app/lib/telas` mudam, e nenhum deles encosta em porta de aparelho. Um `type` servia a quatro rotas do servidor com UMA frase, a de pet perdido, e em tres delas ela prometia o que nao ia acontecer -- evento nao tem achador, indicacao nao avisa ninguem, avaliacao de veterinario nao alerta vizinho. (1) `perdido/tela_alcance_do_alerta.dart` declara `AcaoEmCurso.avisarPetPerdido` nos dois `catch` do envio e PARA de manter uma copia literal da frase no bloqueio local -- ela agora vem de `MensagensDeErro.canalNaoVerificadoParaAvisar`. (2) `rede/criar_encontro.dart` declara `AcaoEmCurso.criarEncontro`, e `semEmailConfirmado` aponta para a constante em vez de repetir o texto. (3) `perto/sugerir_profissional.dart` declara `AcaoEmCurso.indicarProfissional` nos dois `catch` (duas linhas, longe do `_saidaDoErro` da PR #45 e do `_Impedimento` da PR #40). (4) `perto/pagina_do_local.dart` declara `AcaoEmCurso.avaliarLocal` na escrita da avaliacao -- a QUARTA rota deste `type`, que o achado nao tinha. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; `escanear/tela_leitor_de_qr.dart` nao foi tocado, e o portao estrutural de diretivas deste mesmo arquivo responde por isso sem depender desta constante. Valor MEDIDO pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE conferida antes: `2f822c38...` reproduzido sobre `c717f4ae` ANTES de qualquer edicao, e so entao o valor novo medido. **QUEM MESCLAR RECALCULA SOBRE A ARVORE MESCLADA**: as PRs #40 e #45 tocam `perto/sugerir_profissional.dart` e a #45 mexe NESTA constante, e valor de ramo isolado NAO sobrevive a uniao. ANTERIOR: 2f822c3823e97a304c6fee96c88977c8ae45f2b5 (terceiro lote de 20/10, cuja justificativa fica INTEIRA abaixo). // TERCEIRO LOTE DE 20/10/2026, VALOR FINAL com as CINCO frentes mescladas (contador do `AuAu`, contadores de `Pets` e `Rede`, Mural, aviso de login com a volta da ficha do evento, barra fixa). Recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com o procedimento VALIDADO antes de ser usado, reproduzindo o valor da base `1413454d...`. Substitui os CINCO valores de RAMO (`4e13c694...`, `8f3222ea...`, `d979a337...`, `7f016247...`, `bc0506b4...`) e os dois intermediarios desta mescla, cujas justificativas ficam INTEIRAS acima. === PROCEDENCIA, RAMO `frase-do-409-por-rota (PR #49, head 353fc8d8)` (valor de ramo 29e9404b6de4526c876230f5461c3b0eaaf4223e): BICHUS-62 -- A SAIDA DO `409` NA TELA DE INDICAR PROFISSIONAL (20/10/2026), RECALCULADO SOBRE A MESCLA COM `origin/development` (`ceff3402`). `perto/sugerir_profissional.dart` ganhou o ramo de `ProximaAcao.verificarEmail` no `_saidaDoErro`, espelhando `rede/criar_encontro.dart`: sem ele o `409 contact-channel-unverified` desenhava a faixa com a frase do servidor e NENHUMA saida -- `FaixaDeAviso` so monta o `TextButton` com rotulo E callback (`widgets/faixa_de_aviso.dart`, linha 97), entao o rotulo `Confirmar meu e-mail` nao saia morto: nao saia. E a unica mudanca deste ramo nesta arvore; todo o resto vem da `development`, e a prosa em doc dela ficou INTEIRA acima, com a justificativa da ONDA 2 adiante nesta mesma linha. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io` -- o unico uso novo e `Escopo.of(context)` e `Rotas.verifiqueSeuEmail`, os dois ja importados no arquivo; o portao estrutural de diretivas deste mesmo arquivo continua respondendo por isso. Valor RECALCULADO pelo procedimento deste proprio portao sobre a arvore JA MESCLADA (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), e nao copiado de ramo nem de relato. **LINHA DE BASE conferida RODANDO ESTE PORTAO** num worktree limpo em `ceff3402`: ele passou, e a arvore de la reproduz o `86c644e7d3` que esta linha substitui. **ARMADILHA MEDIDA, e ela custou uma conclusao errada:** `origin/development` andou de `6b59933d` para `ceff3402` NO MEIO desta mescla, e comparar o valor travado de uma revisao com a arvore de outra me fez concluir que o portao estava vermelho na `development` -- nao estava, e as duas revisoes sao consistentes consigo mesmas. Quem conferir base, leia o valor travado e a arvore DA MESMA revisao, com o SHA na mao. **A QUEM MESCLAR: recalcule sobre a arvore MESCLADA** -- o PR #40 (`aviso-email-sugestao`) toca O MESMO ARQUIVO e seguia ABERTO nesta data. Substitui o `86c644e7d3` da `development` e, antes dele, o valor de RAMO `2fc783e272` que esta mescla descartou; as justificativas das duas ficam INTEIRAS. // CORRECAO DE COMENTARIO EM `telas/abas.dart` (20/10/2026), TERCEIRA MESCLA, sobre a development de `6b59933d`: SO o cabecalho de `podeCriarNaComunidade` muda, e nenhuma linha executavel. As duas rotas de criar da comunidade RECUSAM conta nao validada com `409 contact-channel-unverified` -- o cabecalho dizia que nao, e que a metade "validado" existia "so no app". O servidor cobra CANAL DE CONTATO (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), e por isso procurar `email_verified` em `src/` nao achava a trava. Valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (GIT_INDEX_FILE temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com a LINHA DE BASE conferida antes: `origin/development:app/lib/telas` reproduziu c08880b92cd668cc8c630ece0da43714613d0b21. TERCEIRA vez que este ramo recalcula: a development andou 24 e depois 36 commits enquanto este PR de COMENTARIO esperava, e cada PR do app disputa esta mesma constante. Substitui c08880b92c (e, dos ramos anteriores desta correcao, 5e7f753f67, 27399b7b2e e 83b68e5442, que mediam arvores de antes). === HISTORICO, INTEIRO: TERCEIRO LOTE DE 20/10/2026, ONDA 2, VALOR FINAL. Recalculado sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves), com o procedimento VALIDADO na base antes de ser usado. Substitui o valor final da onda 1 (`2f822c38...`), os dois intermediarios da onda 2 e os valores de RAMO da correcao do cabecalho, da ficha rica do achado e do sino, cujas justificativas ficam INTEIRAS acima. === A FRASE DO `409 contact-channel-unverified` PASSA A FALAR DA ROTA QUE RECUSOU (20/10/2026), MESCLADA SOBRE A DEVELOPMENT DE `070bfee6` (a entrada do PR #45): QUATRO arquivos de `app/lib/telas` mudam, e nenhum deles encosta em porta de aparelho. Um `type` servia a QUATRO rotas do servidor com UMA frase, a de pet perdido, e em tres delas ela prometia o que nao ia acontecer -- evento nao tem achador, indicacao nao avisa ninguem, avaliacao de veterinario nao alerta vizinho. (1) `perdido/tela_alcance_do_alerta.dart` declara `AcaoEmCurso.avisarPetPerdido` nos dois `catch` do envio e PARA de manter uma copia literal da frase no bloqueio local -- ela agora vem de `MensagensDeErro.canalNaoVerificadoParaAvisar`. (2) `rede/criar_encontro.dart` declara `AcaoEmCurso.criarEncontro`, e `semEmailConfirmado` aponta para a constante em vez de repetir o texto. (3) `perto/sugerir_profissional.dart` declara `AcaoEmCurso.indicarProfissional` nos dois `catch` de `_enviar`. (4) `perto/pagina_do_local.dart` declara `AcaoEmCurso.avaliarLocal` na escrita da avaliacao -- a QUARTA rota deste `type`, que o achado nao tinha. **Nenhuma porta de aparelho encostada**: nenhum importe de plugin, nenhum canal de plataforma, nenhuma permissao, nenhum `dart:io`; `escanear/tela_leitor_de_qr.dart` nao foi tocado, e o portao estrutural de diretivas deste mesmo arquivo responde por isso sem depender desta constante. **O PR #45 E ESTE NAO COLIDEM EM CODIGO, e isso foi MEDIDO e nao presumido**: a #45 mexe em `_saidaDoErro` (que da DESTINO ao rotulo) e este mexe nos dois `catch` de `_enviar` (que mudam o TEXTO da faixa), 330+ linhas de distancia, e o `git merge` juntou os dois arquivos sem conflito. Os dois sao necessarios: so a #45 deixa o botao funcionando com o texto de pet perdido numa tela que nao manda foto; so este deixa o texto certo SEM BOTAO, porque `FaixaDeAviso` (linha 97) so monta o `TextButton` com rotulo E callback. **DOIS valores de ramo nao sobreviveram**: `e720d4b0f8562baa5768340d9a3a1586bdd4f8b8` (medido sobre a arvore isolada deste ramo, base `c717f4ae`) e o intermediario `95d1907f85913761c90edb60b19bef4525f07d4f` (a mescla sobre `ceff3402`, superada quando a #45 entrou e mexeu em `perto/sugerir_profissional.dart`). Valor RECALCULADO sobre a arvore MESCLADA pelo procedimento deste proprio portao (`GIT_INDEX_FILE` temporario, `read-tree HEAD`, `add -A -- app/lib/telas`, `write-tree`, `rev-parse "${T}:app/lib/telas"` -- COM as chaves: em zsh, sem elas o shell aplica o modificador de historia `:a` e devolve caminho absoluto. **Isto nao e teoria: a tentativa sem chaves desta mesma mescla devolveu `.../bichu-wt-frase-409/070bfee6...pp/lib/telas`, comendo o `a` de `app`** -- aqui ela falhou alto, mas num `$(...)` dentro de comparacao ela falha calada). LINHA DE BASE conferida nas DUAS pontas da MESMA revisao, com o SHA na mao e nao pelo ref local, que andou DUAS vezes hoje no meio de mescla: em `070bfee6`, `git rev-parse "070bfee6...:app/lib/telas"` e a constante travada dao os dois `43bc80a21582577caa783edc1da0725c0a4167a7`. ANTERIOR: 43bc80a21582577caa783edc1da0725c0a4167a7 (a entrada do PR #45, cuja justificativa e a da ONDA 2 ficam INTEIRAS nesta linha e acima). === PROCEDENCIA, RAMO `aviso-email-sugestao (PR #40, dono ausente)` (valor de ramo 94c906c31db3ae56654135f9bf83dc8740ae8683): AVISO DE E-MAIL NA TELA DE INDICAR (20/10/2026): um arquivo, `perto/sugerir_profissional.dart`. Substitui o valor do SEGUNDO LOTE DE 19/10/2026 (1413454d74), cuja justificativa -- e as de todos os ramos antes dele -- fica INTEIRA acima.

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e assim que esta classe de defeito passa despercebida.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/$_caminhoDasTelas').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// Roda `git` e **reprova alto** quando ele falha.
///
/// Portao que nao consegue conferir precisa reprovar: um `git` ausente, um
/// diretorio que nao e repositorio ou um `HEAD` inalcancavel nao podem virar
/// silencio verde.
String _git(
  String raiz,
  List<String> argumentos,
  Map<String, String> ambiente,
) {
  final resultado = Process.runSync(
    'git',
    argumentos,
    workingDirectory: raiz,
    environment: ambiente,
  );
  if (resultado.exitCode != 0) {
    throw StateError(
      'REPROVA: `git ${argumentos.join(' ')}` saiu com ${resultado.exitCode} '
      'em "$raiz". Este portao confere a arvore pelo proprio git; sem ele nao '
      'ha o que conferir, e ficar verde assim seria pior que nao existir.\n'
      '  stderr: ${resultado.stderr}',
    );
  }
  return (resultado.stdout as String).trim();
}

/// O hash de arvore de `app/lib/telas` **como esta no disco agora**.
///
/// Usa um indice temporario (`GIT_INDEX_FILE`) para nao tocar no indice de
/// quem roda. Le a arvore de trabalho, e nao o `HEAD`: alteracao ainda nao
/// commitada precisa reprovar na hora, e nao so depois que a esteira olhar.
String _arvoreDeTelasAgora(String raiz) {
  final indice = File(
    '${Directory.systemTemp.path}/bichu-portao-$pid-'
    '${DateTime.now().microsecondsSinceEpoch}.index',
  );
  final ambiente = <String, String>{'GIT_INDEX_FILE': indice.path};
  try {
    _git(raiz, const <String>['read-tree', 'HEAD'], ambiente);
    _git(raiz, const <String>['add', '-A', '--', _caminhoDasTelas], ambiente);
    final completa = _git(raiz, const <String>['write-tree'], ambiente);
    return _git(
      raiz,
      <String>['rev-parse', '$completa:$_caminhoDasTelas'],
      ambiente,
    );
  } finally {
    if (indice.existsSync()) indice.deleteSync();
  }
}

/// O que uma tela nao pode importar, e por que.
const Map<String, String> _importesProibidos = <String, String>{
  'package:image_picker/': 'o seletor de imagem',
  'package:permission_handler/': 'o pedido de permissao',
  // BICHUS-23: o plugin de localizacao entra na MESMA lista, no mesmo dia em
  // que entra no `pubspec.yaml`. O criterio 10 da BICHUS-161 fala da camera,
  // mas o portao estrutural deste arquivo cobra o ESPIRITO -- "tela nenhuma
  // fala com o aparelho" --, e ele nao tem por que valer so para um plugin.
  //
  // Acrescentar aqui agora, e nao quando a primeira tela errar, e o que
  // impede a classe de defeito de reabrir: `geolocator` e o proximo pacote de
  // aparelho a chegar, e sem esta linha a primeira tela que o importasse
  // passaria verde.
  'package:geolocator/': 'a leitura de posicao do aparelho',
  // 20/10/2026: a folha de compartilhamento do sistema. Entra aqui no MESMO dia
  // em que entra no `pubspec.yaml`, que e o que o comentario de `geolocator`
  // acima manda fazer -- e nao quando a primeira tela errar.
  //
  // **A tentacao concreta era grande**: a acao de compartilhar nasceu na ficha
  // do pet, e `import 'package:share_plus/share_plus.dart'` dentro de
  // `telas/pet/tela_detalhe_do_pet.dart` com duas linhas de `SharePlus.instance`
  // teria funcionado e passado verde sem esta linha. Quem fala com a folha e
  // `lib/dispositivo/saida_do_app.dart`, a mesma porta que abre mapa e
  // navegador, e a tela recebe `SaidaDoApp` -- que e tambem o que torna a
  // mensagem compartilhada mensuravel em teste de widget.
  'package:share_plus/': 'a folha de compartilhamento do sistema',
  'dart:io': 'o sistema de arquivos',
};

void main() {
  final raiz = _raizDoRepositorio().path;
  final pastaDeTelas = Directory('$raiz/$_caminhoDasTelas');

  group('criterio 10: as telas nao mudaram uma linha', () {
    test('a pasta de telas existe e tem arquivo', () {
      // Sem isto, apagar a pasta deixaria os outros casos verdes por vazio.
      expect(
        pastaDeTelas.existsSync(),
        isTrue,
        reason: 'REPROVA: ${pastaDeTelas.path} nao existe. Este portao nao tem '
            'o que conferir, e ficar verde assim seria pior que nao existir.',
      );
    });

    test('a arvore de `$_caminhoDasTelas` e a que esta travada', () {
      final agora = _arvoreDeTelasAgora(raiz);
      expect(
        agora,
        _arvoreDasTelas,
        reason: 'REPROVA: `$_caminhoDasTelas` mudou.\n'
            '  travado:    $_arvoreDasTelas\n'
            '  encontrado: $agora\n'
            'O criterio 10 da BICHUS-161 diz que nenhuma tela muda de codigo '
            'por causa da camera embarcada: se uma precisou mudar, a porta '
            '`CameraEGaleria` esta sendo contornada, e o lugar do conserto e a '
            'porta, nao a tela.\n'
            'O hash e de ARVORE, e cobre o diretorio inteiro recursivamente: '
            'editar, criar, apagar ou renomear qualquer arquivo em qualquer '
            'subpasta muda esse valor. Para ver o que mudou:\n'
            '  git status --short -- $_caminhoDasTelas\n'
            '  git diff -- $_caminhoDasTelas\n'
            'Se a mudanca e de OUTRA historia e legitima, commite e rode\n'
            '  git rev-parse HEAD:$_caminhoDasTelas\n'
            'e troque `_arvoreDasTelas` neste arquivo, citando a chave da '
            'issue na linha. Trocar o hash precisa ser um ato deliberado, com '
            'nome e motivo no diff -- e agora custa uma linha, para que '
            'continuar sendo deliberado nao dependa de paciencia.',
      );
    });
  });

  group('o espirito do criterio 10: nenhuma tela fala com o aparelho', () {
    // Este grupo sobrevive ao dia em que a trava de arvore for destravada.
    // Ele nao cobra "a tela nao mudou", cobra "a tela nao virou a porta".
    late final List<File> telas;

    setUpAll(() {
      telas = pastaDeTelas
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();
    });

    test('ha telas para conferir', () {
      expect(
        telas.length,
        greaterThan(5),
        reason: 'REPROVA: achei ${telas.length} arquivo(s) em '
            '${pastaDeTelas.path}. O projeto tem mais que isso; um portao que '
            'varre a pasta errada passa por vazio.',
      );
    });

    test('nenhuma tela importa plugin de aparelho', () {
      // A porta existe para que a integracao com o aparelho tenha UM lugar.
      // Uma tela que importe o plugin direto contorna a porta sem precisar
      // mudar nenhuma assinatura, e nada mais pega isso.
      //
      // A leitura e por DIRETIVA, nao por texto: a forma da aspa, o escape e a
      // quebra de linha nao mudam o que o Dart importa, e nao podem mudar o
      // que este portao enxerga.
      for (final tela in telas) {
        final fonte = tela.readAsStringSync();
        for (final diretiva in lerDiretivas(fonte)) {
          for (final proibido in _importesProibidos.entries) {
            expect(
              diretiva.uri.startsWith(proibido.key),
              isFalse,
              reason: 'REPROVA: ${tela.path}:${diretiva.linha} '
                  '(${diretiva.palavra}) traz `${diretiva.uri}` '
                  '-- ${proibido.value}. Integracao com o aparelho mora em '
                  '`lib/dispositivo/`, atras da porta `CameraEGaleria`. Tela '
                  'que importa o plugin direto contorna a porta sem mudar '
                  'assinatura nenhuma, deixa de ser testavel sem aparelho, e '
                  'leva a regra de permissao para um lugar onde ela vai ser '
                  'reescrita diferente na proxima tela.',
            );
          }
        }
      }
    });

    test('nenhuma tela nomeia plugin de aparelho fora de diretiva', () {
      // A rede de seguranca do caso anterior: referencia que nao esteja num
      // `import` -- uma constante com a URI, uma biblioteca adiada -- tambem
      // reprova. Roda sobre o fonte SEM COMENTARIOS, para que uma tela possa
      // explicar em prosa que nao importa o plugin sem por isso reprovar.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final proibido in _importesProibidos.entries) {
          // `dart:io` fica de fora desta rede: e curto demais e aparece em
          // nome de simbolo legitimo. A diretiva dele ja e coberta acima.
          if (proibido.key == 'dart:io') continue;
          expect(
            codigo.contains(proibido.key),
            isFalse,
            reason: 'REPROVA: ${tela.path} nomeia `${proibido.key}` '
                '(${proibido.value}) fora de comentario. Mesmo sem um '
                '`import`, uma tela que carrega a URI do plugin esta a um '
                'passo de contornar a porta `CameraEGaleria`.',
          );
        }
      }
    });

    test('nenhuma tela abre canal de plataforma', () {
      // `package:flutter/services.dart` continua permitido: `Clipboard` e
      // `HapticFeedback` sao dele e sao de tela. O que nao e de tela e abrir
      // canal.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final canal in <String>['MethodChannel(', 'EventChannel(']) {
          expect(
            codigo.contains(canal),
            isFalse,
            reason: 'REPROVA: ${tela.path} abre um `$canal`. Canal de '
                'plataforma e da camada de dispositivo; numa tela ele nao tem '
                'como ser exercitado por teste de widget, e o estado de '
                'permissao passa a existir em dois lugares.',
          );
        }
      }
    });

    test('nenhuma tela nomeia a implementacao concreta da camera', () {
      // A tela conhece a porta, nao quem a implementa. Nomear
      // `CameraDoAparelho` faria a tela deixar de ser montavel sem aparelho, e
      // e o jeito mais discreto de contornar a injecao.
      for (final tela in telas) {
        final codigo = semComentarios(tela.readAsStringSync());
        for (final concreta in <String>[
          'CameraDoAparelho',
          'CameraNaoEmbarcada',
        ]) {
          expect(
            codigo.contains(concreta),
            isFalse,
            reason: 'REPROVA: ${tela.path} nomeia `$concreta`. A tela recebe '
                '`CameraEGaleria` pelo escopo e nao escolhe implementacao; '
                'quem escolhe e `app.dart`, em um lugar so.',
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // O autoteste do leitor
  // -------------------------------------------------------------------------
  //
  // O portao acima so vale o que o leitor enxerga. Estes casos sao as formas
  // que o Dart aceita para a MESMA diretiva, e a aspa dupla esta aqui porque
  // ela ja passou verde uma vez. Eles ficam no repositorio porque "testei nos
  // dois sentidos e acusou certo" e afirmacao, nao evidencia: ninguem
  // reexecuta uma frase, e ela nao acusa no dia em que o leitor cegar.
  group('autoteste do leitor: as formas de escrever o mesmo import', () {
    final formas = <String, String>{
      'aspa simples': "import 'package:image_picker/image_picker.dart';",
      'aspa dupla': 'import "package:image_picker/image_picker.dart";',
      'string crua, aspa simples':
          "import r'package:image_picker/image_picker.dart';",
      'string crua, aspa dupla':
          'import r"package:image_picker/image_picker.dart";',
      'aspa tripla simples':
          "import '''package:image_picker/image_picker.dart''';",
      'aspa tripla dupla':
          'import """package:image_picker/image_picker.dart""";',
      'quebra de linha antes da URI':
          "import\n    'package:image_picker/image_picker.dart';",
      'comentario de bloco no meio':
          "import /* nota */ 'package:image_picker/image_picker.dart';",
      'comentario de linha no meio':
          "import // nota\n    'package:image_picker/image_picker.dart';",
      'literais adjacentes':
          "import 'package:' 'image_picker/image_picker.dart';",
      'escape unicode na URI':
          r"import 'package:image_picker/image_picker.dart';",
      'com prefixo `as`':
          'import "package:image_picker/image_picker.dart" as seletor;',
      'com `show`':
          "import 'package:image_picker/image_picker.dart' show ImagePicker;",
      'import condicional, na URI alternativa':
          "import 'inexistente.dart'\n"
              '    if (dart.library.io) '
              '"package:image_picker/image_picker.dart";',
      'export em vez de import':
          'export "package:image_picker/image_picker.dart";',
      'sem espaco depois da palavra-chave':
          'import"package:image_picker/image_picker.dart";',
    };

    formas.forEach((nome, fonte) {
      test('o leitor enxerga: $nome', () {
        final uris = lerDiretivas(fonte).map((d) => d.uri).toList();
        expect(
          uris.any((u) => u.startsWith('package:image_picker/')),
          isTrue,
          reason: 'REPROVA: o leitor NAO enxergou o seletor de imagem escrito '
              'como "$nome". Era exatamente assim que o portao antigo era '
              'contornado: ele casava `import` mais aspa simples, e a aspa '
              'dupla passava verde. O que o leitor devolveu: $uris\n'
              '  fonte: $fonte',
        );
      });
    });

    test('o leitor nao confunde `import` escrito dentro de uma string', () {
      // O outro lado: um portao que acusa demais e desligado por quem cansa.
      const fonte = 'const exemplo = "import \'package:image_picker/x.dart\';";';
      expect(
        lerDiretivas(fonte),
        isEmpty,
        reason: 'REPROVA: o leitor tratou o conteudo de uma string como '
            'diretiva. Falso positivo em portao estrutural nao e zelo: e o '
            'motivo pelo qual portao acaba desligado.',
      );
    });

    test('o leitor nao confunde `import` escrito num comentario', () {
      const fonte = "// import 'package:image_picker/x.dart';\nvoid main() {}";
      expect(lerDiretivas(fonte), isEmpty);
    });

    test('`semComentarios` apaga a prosa e preserva o codigo', () {
      const fonte = '// nao importamos package:image_picker aqui\n'
          "const x = 'package:image_picker/y.dart';";
      final codigo = semComentarios(fonte);
      expect(
        codigo.contains('nao importamos'),
        isFalse,
        reason: 'REPROVA: a prosa sobreviveu, e a rede de seguranca vai '
            'reprovar telas que so explicam o que nao fazem.',
      );
      expect(codigo.contains('package:image_picker/y.dart'), isTrue);
    });
  });
}
