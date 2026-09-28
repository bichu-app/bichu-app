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
// Remedida na integracao backoffice-v1 (acesso + rede-admin).
const String _arvoreDasTelas = '54312e72ad5c8622555a4614c15189ab559f9622';

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
