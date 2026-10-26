/// Os textos de F3.5, num lugar so.
///
/// **Constante e nao literal espalhado**, pela razao de sempre: o mesmo texto
/// aparece na tela, na isca e no anuncio de leitor de tela, e tres copias
/// divergem na primeira correcao de virgula.
///
/// **CUIDADO COM A ISCA TAUTOLOGICA.** Uma isca que compare o texto
/// renderizado com a constante que o produz fica verde com qualquer coisa
/// escrita aqui -- inclusive com a frase errada. As iscas desta historia que
/// medem PALAVRA escrevem a palavra a mao, de proposito; as que usam estas
/// constantes medem **presenca de um texto especifico em um estado
/// especifico**, que e outra afirmacao.
library;

import '../../dispositivo/camera_e_galeria.dart';

abstract final class TextosDoAchado {
  /// O titulo da barra de topo.
  ///
  /// **Nao e o rotulo do botao**, e a diferenca e proposital: a barra diz onde
  /// a pessoa esta e o botao diz o que o toque faz. Titulo e acao com a mesma
  /// palavra deixam a tela com dois "Registrar achado" -- e quem navega por
  /// leitor de tela ouve o mesmo texto duas vezes, sem saber qual dos dois
  /// aciona alguma coisa.
  static const String titulo = 'Achei um pet';

  /// A frase de abertura, palavra por palavra do criterio 1.
  static const String chamada = 'Você achou um pet. Conte o que dá para ver.';

  // -- Foto -----------------------------------------------------------------

  static const String rotuloDaFoto = 'Foto';

  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
  static const String trocarAFoto = 'Trocar a foto';

  /// O rotulo que o leitor de tela anuncia sobre a previa.
  static const String fotoEscolhidaDoAchado = 'Foto escolhida do pet achado';

  /// Quem ve a foto, numa linha (cliente, 17/10/2026).
  ///
  /// **O paragrafo saiu; a afirmacao de privacidade ficou.** O cliente pediu
  /// para tirar o texto da foto, e o que ele nomeou -- "a foto nao aparece em
  /// lista nenhuma" -- saiu. O que sobra e o unico pedaco com peso de
  /// privacidade: a quem a foto e mostrada. Apagar isso tambem seria apagar o
  /// aviso de uso de dado, e esse apagamento nao e meu para fazer.
  static const String fotoSoNaConversa = 'Mostrada só ao tutor, na conversa.';

  /// A orientacao de tamanho, numa linha (cliente, 17/10/2026).
  ///
  /// Vem de `orientacaoDeTamanhoDaImagem` e nao e escrita aqui: o numero e o
  /// mesmo teto que o contrato declara e que o balde impoe na politica
  /// assinada.
  static const String orientacaoDaFoto = orientacaoDeTamanhoDaImagem;

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';

  static const String semCamera =
      'Este aparelho não tem câmera disponível para o Bichu. Dá para escolher '
      'uma foto da galeria.';

  static const String abrirAjustes = 'Abrir os ajustes';

  // -- Os campos ------------------------------------------------------------

  /// A ESPECIE NAO TEM ROTULO VISIVEL (cliente, 22/10/2026).
  ///
  /// O pedido, palavra por palavra: *"retirar 'o que é o bicho' porque o
  /// titulo já tras isso, mas **mantenha cachorro, gato e outro**"*. Ele esta
  /// certo: o titulo do passo 1 ja pergunta
  /// ([tituloDoPasso1], *"Qual o animalzinho está perdido?"*), e a linha
  /// *"O que é o bicho?"* logo abaixo fazia a mesma pergunta de novo.
  ///
  /// **O que saiu foi o ROTULO; as opcoes ficaram.** Cao, gato e outro
  /// continuam sendo os tres segmentos, e `achado_textos_enxugados_test.dart`
  /// cobra as tres presentes DEPOIS de o rotulo sair -- porque "apagar a
  /// pergunta" e "apagar o campo" sao a mesma linha de codigo neste widget.
  ///
  /// **E O GRUPO CONTINUA TENDO NOME PARA QUEM NAO VE A TELA.**
  /// `GrupoSegmentado` usa o mesmo `rotulo` no `Text` visivel e no
  /// `Semantics.label`, e a prosa dele diz por que: sem o nome do grupo, o
  /// leitor de tela anuncia *"Cachorro"* sozinho e nao ha como saber qual era a
  /// pergunta. Entao o visivel saiu e o nome ficou -- e ele nao e a frase
  /// removida, que seria a mesma redundancia por outro canal: e uma palavra,
  /// a que a propria prosa de `GrupoSegmentado` usa de exemplo.
  static const String nomeDaEspecie = 'Espécie';

  /// O porte, na redacao que ele ditou em 22/10/2026.
  ///
  /// Era *"Do tamanho de quê?"*. A troca e dele, palavra por palavra:
  /// *"trocar 'tamanho de quê?' por 'Qual é o porte?'"*.
  static const String rotuloDoPorte = 'Qual é o porte?';
  static const String rotuloDoSexo = 'Macho ou fêmea?';
  static const String rotuloDaRaca = 'Raça';
  static const String rotuloDaCor = 'Cor';
  static const String escolherNaLista = 'Escolher na lista';

  // A AJUDA DA RACA E DA COR SAIU (cliente, 22/10/2026): *"retirar 'só se você
  // souber, em branco funciona'"*. Ela dizia duas vezes o que o campo ja
  // mostra: os dois seletores continuam com `estadoInicial` igual a
  // `Escolher na lista` -- ou seja, visivelmente sem escolha -- e nenhum dos
  // dois entra em `impedimentoDoPasso1`, porque raca e cor sao opcionais no
  // contrato. Nada ficou exigido que nao era, e nenhuma instrucao de acao se
  // perdeu: a frase nao ensinava a fazer nada, ela tranquilizava.

  static const String rotuloDeOnde = 'Onde você achou?';
  static const String rotuloDeQuando = 'Quando?';

  /// **A REDACAO E DO CLIENTE (22/10/2026), literal**: *"Altere a frase para:
  /// Alguma coisa que ajude a reconhecer para Alguma caracteristica especifica
  /// que ajude a identifica-lo."*
  ///
  /// O rotulo deixou de ser pergunta e virou pedido, e o ponto final e dele:
  /// `Alguma coisa que ajude a reconhecer?` perguntava se havia algo, e quem
  /// responde "sim" na cabeca nao escreve nada no campo. A frase nova diz **o
  /// que escrever**.
  static const String rotuloDaObservacao =
      'Alguma característica específica que ajude a identificá-lo.';

  static const String exemploDaObservacao =
      'coleira azul sem placa, mancha branca no peito, mancava da pata '
      'traseira';

  // -- O que acontece sem rotulo de area ------------------------------------

  /// A frase que a tela mostra quando ha coordenada e **nenhum texto
  /// digitado** (criterio 6, e a consequencia da BICHUS-23).
  ///
  /// Ela nao repreende e nao bloqueia: o achado vale, e o que muda e a forma
  /// como ele aparece para o tutor. Derivar o bairro da coordenada e o que o
  /// ADR-0006 proibe, entao a unica saida honesta e perguntar -- e o campo de
  /// bairro esta logo ali, oferecido junto com o GPS.
  static const String semRotuloDeArea =
      'O tutor vai ver a distância, e não o bairro. Escreva o bairro e a '
      'cidade acima se quiser que ele apareça.';

  /// A frase que a tela mostra quando ha area digitada e **nenhuma
  /// coordenada** (criterio 6).
  ///
  /// O cruzamento **nao deixa de existir**: ele perde o criterio de distancia
  /// e passa a valer dentro da mesma cidade. Dizer "não vai funcionar" seria
  /// mentira, e dizer nada deixaria a pessoa achar que a distancia foi medida.
  static const String semCoordenada =
      'Sem o ponto no mapa, a busca por um tutor parecido vale na cidade '
      'inteira, e não no seu quarteirão.';

  // -- Os dois passos -------------------------------------------------------

  /// O titulo do passo 1, **palavra por palavra do cliente (17/10/2026)**.
  ///
  /// **PENDENTE DE CONFIRMACAO.** Ele ditou esta frase testando o registro de
  /// ACHADO, e quem acha um animal na rua nao sabe se ele esta perdido --
  /// pode ser abandonado, pode estar passeando solto. A frase e dele e esta
  /// aqui como ele a escreveu; trocar "perdido" por "achou" e decisao dele.
  static const String tituloDoPasso1 = 'Qual o animalzinho está perdido?';

  /// O titulo do passo 2.
  static const String tituloDoPasso2 = 'Onde e quando';

  static const String continuar = 'Continuar';
  static const String voltarAoPasso1 = 'Voltar';

  // -- O envio --------------------------------------------------------------

  static const String registrar = 'Registrar achado';

  // -------------------------------------------------------------------------
  // `TelaEncontreiEstePet`: quem achou um pet QUE ESTA NA LISTA DE PERDIDOS
  // -------------------------------------------------------------------------
  //
  // **DEFEITO RELATADO PELO CLIENTE (26/10/2026), palavra dele**: *"se ele
  // encontrou o pet, ele nao tem que cadastrar as informacoes novamente"*.
  //
  // O toque em `Encontrei este animal` na pagina do caso caia em F3.5, que
  // pergunta especie, cor e porte -- os tres dados que o cadastro do pet JA
  // responde e que a projecao publica do caso JA traz. Estes textos sao os da
  // tela que substitui aquele destino. Eles NAO substituem os de F3.5: o
  // achado avulso continua perguntando tudo, porque la nao ha pet nenhum
  // identificado do outro lado.

  /// O titulo da barra da tela nova.
  ///
  /// **Nao carrega o nome do pet**, pela mesma razao de
  /// `TelaDoCasoPublico.titulo`: a barra que troca de titulo no meio do
  /// carregamento e o que o 11.23.4 evita. Aqui o nome JA chegou (ele vem no
  /// `extra`, nao de uma segunda leitura), mas o titulo fica igual ao da
  /// pagina de onde a pessoa veio -- duas barras com o mesmo assunto e nomes
  /// diferentes fazem quem navega por leitor de tela achar que mudou de
  /// assunto.
  static const String tituloDeEncontrei = 'Achei este pet';

  /// A headline, com o nome do pet. **`pet_display_name` e obrigatorio em
  /// `PublicLostPet`**, entao nao ha ramo sem nome para desenhar.
  static String chamadaDeEncontrei(String nome) => 'Você achou o $nome.';

  /// A frase que diz POR QUE a tela nao pergunta o animal.
  ///
  /// Ela existe para a pessoa nao procurar os campos que faltam. Um
  /// formulario que simplesmente nao tem o campo de especie e
  /// indistinguivel, para quem preencheu o outro ontem, de um formulario que
  /// perdeu o campo.
  static const String oQueJaSabemos =
      'A gente já sabe quem ele é. Conte só o que só você sabe.';

  /// O rotulo do cartao de identificacao do pet.
  static const String rotuloDeQuemE = 'O pet que você achou';

  /// A descricao da foto do pet, para leitor de tela.
  static String fotoDoPetDoCaso(String nome) => 'Foto do $nome';

  /// A linha de especie e porte do cartao, **somente leitura**.
  ///
  /// Os dois valem `species` e `size` de `StrayFoundReportInput`, e e dai que
  /// eles vao para o corpo -- nao de um campo que alguem preencheu. Mostrar os
  /// dois nao e enfeite: e o que permite a pessoa dizer "nao e este animal" e
  /// voltar, que e a unica conferencia que ela consegue fazer.
  static String especieEPorte(String especie, String porte) =>
      '$especie · $porte';

  /// O rotulo do recado, nesta tela.
  ///
  /// **Diferente do de F3.5 de proposito.** La o campo pede sinais que ajudem
  /// a IDENTIFICAR o animal, porque ninguem sabe quem ele e. Aqui a
  /// identificacao esta feita, e o que falta e o estado dele e o combinado --
  /// que e outra pergunta, e o mesmo rotulo nas duas faria esta tela pedir de
  /// novo, por escrito, a descricao que o cliente mandou parar de pedir.
  static const String rotuloDoRecado = 'Quer deixar um recado para o tutor?';

  static const String exemploDoRecado =
      'está bem, está comigo em casa, pode me procurar à tarde';

  /// O rotulo do botao de envio.
  ///
  /// **`Avisar o tutor` e nao `Registrar achado`**: o que a pessoa quer e que
  /// o tutor saiba, e `x-effects: [notifies]` de `createStrayFoundReport` diz
  /// que e isso que a operacao faz. O desfecho continua sendo
  /// `TelaAchadoRegistrado`, que ja e honesta sobre quem foi avisado e sobre
  /// a confirmacao humana que ainda falta -- nao ha promessa nova aqui.
  static const String avisarOTutor = 'Avisar o tutor';

  // -- A tela do achado registrado -----------------------------------------

  /// O titulo da barra de topo do desfecho.
  ///
  /// **Neutro, e nao o estado.** A barra e a headline diziam a mesma frase, e
  /// o resultado era o mesmo texto duas vezes na arvore de semantica: quem usa
  /// leitor de tela ouve a resposta, ouve de novo, e nao sabe se sao duas
  /// coisas. O estado mora na headline, que e onde a pessoa olha.
  static const String tituloDaBarraDoDesfecho = 'Achado';

  static const String tituloDoRegistrado = 'Achado registrado';

  /// **`Na fila` NAO e `Registrado`**, e a distancia entre as duas frases e o
  /// criterio 2 da BICHUS-31: tela de sucesso para o que nao aconteceu faz a
  /// pessoa parar de procurar caminho.
  static const String tituloDaFila = 'Vamos registrar quando a conexão voltar';

  /// O corpo do desfecho, ENXUGADO em 22/10/2026 (*"tem muito texto, vamos
  /// resumir isso"*).
  ///
  /// **O que saiu foi uma REPETICAO LITERAL, e nao uma informacao.** A segunda
  /// frase era *"Quem confirma se é o mesmo animal é o tutor, nunca o Bichu
  /// sozinho."* -- palavra por palavra o fim de [oQueOTutorRecebe], que as
  /// duas telas desenham poucos centimetros abaixo, no bloco
  /// `Quem foi avisado`. A mesma sentenca aparecia DUAS vezes na mesma tela,
  /// nas duas telas (`/achado-registrado` e `/achados/:id`).
  ///
  /// **A copia que ficou e a de [oQueOTutorRecebe]**, e a escolha nao e
  /// sorteio: a confirmacao humana e a parte delicada do bloco
  /// `Quem foi avisado`, cuja prosa registra por que ele nao pode prometer
  /// entrega -- tirar a frase de lá e que seria perda.
  ///
  /// **E a primeira frase NAO saiu**, embora seja uma promessa: ela e o
  /// antecedente que [avisoNoCelularNaoFunciona] corrige na mesma tela
  /// (*"Quando a gente diz que te avisa, é aqui dentro do aplicativo"*).
  /// Apagar o *"a gente te avisa"* deixaria a correcao falando sozinha, sobre
  /// uma promessa que a tela nao faz mais.
  static const String registradoCorpo =
      'Se aparecer um tutor procurando um pet parecido, a gente te avisa.';

  /// O corpo da fila, com a promessa que a fila de fato cumpre.
  static const String filaCorpo =
      'O que você escreveu está guardado no aparelho e sai sozinho assim que '
      'houver sinal. Pode fechar o app.';

  /// O estado da foto que ainda nao subiu (criterio 4).
  ///
  /// *"achado sem foto vale menos, mas vale"* -- e por isso a frase diz o que
  /// falta sem sugerir que o achado nao existe.
  ///
  /// **ENXUGADA em 22/10/2026**: saiu *"e a foto entra na conversa quando o
  /// tutor aparecer"*. Esta faixa so e desenhada com `resultado.foto != null`,
  /// e nesse exato estado a tela acabou de escrever [fotoSoNaConversa] --
  /// *"Mostrada só ao tutor, na conversa."* -- duas linhas acima, debaixo do
  /// quadro da foto. "Na conversa", "ao tutor": era a mesma frase em outra
  /// ordem. O que a faixa tem de proprio -- que o ENVIO ainda nao aconteceu e
  /// que o achado vale sem ele, que e o criterio 4 -- ficou inteiro.
  static const String fotoAindaNaoSubiu =
      'A foto ainda não foi enviada. O achado já vale sem ela.';

  static const String semFoto = 'Você registrou este achado sem foto.';

  /// ONDE A FOTO ESTA, na tela do achado (`/achados/:id`), que **nao tem
  /// foto para desenhar**.
  ///
  /// ## Por que uma frase nova, e nao uma das de cima
  ///
  /// As duas frases de foto que existem afirmam o que aquela tela **nao sabe**.
  /// [fotoAindaNaoSubiu] diz *"a foto ainda nao foi enviada"* e [semFoto] diz
  /// *"voce registrou este achado sem foto"*: as duas falam do estado do envio,
  /// e o `GET` de um achado nao devolve esse estado -- `FoundReport` nao tem
  /// campo de foto nenhum, por criterio. A tela do achado mostrava
  /// [fotoAindaNaoSubiu] em TODA visita, sobre TODO achado, afirmando um fato
  /// que ela nunca mediu.
  ///
  /// No desfecho aquelas duas continuam certas, e por isso continuam lá: ele
  /// recebeu a `FotoLocal` do seletor e sabe, por construcao, se ha foto e que
  /// ela ainda nao subiu.
  ///
  /// ## A condicional nao e hesitacao: e o limite do que a tela sabe
  ///
  /// *"Se voce enviou uma foto"* existe porque a tela nao tem como saber se
  /// houve foto. Afirmar que houve seria inventar; afirmar que nao houve seria
  /// apagar o trabalho de quem tirou a foto. A segunda metade e a linha ja
  /// aprovada do formulario ([fotoSoNaConversa], *"Mostrada só ao tutor, na
  /// conversa"*), que e a parte com peso de aviso de uso de dado -- e aqui ela
  /// responde a pergunta que a ausencia do quadro levanta: nao se perdeu, esta
  /// guardada para o tutor.
  static const String fotoNaoApareceAqui =
      'Se você enviou uma foto, ela não aparece aqui: a foto do achado é '
      'mostrada só ao tutor, na conversa.';

  // -- O DESFECHO RICO (cliente, 18/10/2026) --------------------------------
  //
  // A queixa, palavra por palavra: *"Na pagina 'achado registrado' nao mostra
  // muita informacao, nao tem foto do pet ou alguma informacao util"*.
  //
  // Ele estava certo: ate aqui a tela tinha titulo, dois paragrafos, a linha
  // do estado da foto e -- so quando o servidor mandava um -- a regiao. Nenhuma
  // imagem, e nada que respondesse as tres perguntas de quem acabou de achar um
  // animal na rua com o bicho do lado.
  //
  // As tres perguntas, e os tres titulos de bloco abaixo: **o que acontece
  // agora**, **quem foi avisado** e **o que fazer em seguida**.

  /// O cabecalho do bloco do registro.
  static const String tituloDoQueGuardamos = 'O que a gente guardou';

  /// O estado do aviso em PALAVRA, nunca em cor sozinha (SC 1.4.1).
  ///
  /// **A mesma frase de `Meus achados`**, de proposito: o aviso recem-criado
  /// aparece na lista do Perfil com este rotulo, e duas palavras para o mesmo
  /// `status = 'open'` fariam a pessoa achar que sao dois estados.
  static const String estadoEmAnalise = 'Em análise';

  /// Quando o servidor nao mandou rotulo de area.
  ///
  /// **A mesma linha de `Meus achados`.** Ela nao repreende: o achado vale sem
  /// bairro, e o que muda e como ele chega ao tutor -- o que ja esta dito em
  /// [semRotuloDeArea], no formulario, onde ainda da para escrever o bairro.
  static const String regiaoNaoInformada = 'Região não informada';

  /// `Achado em dd/mm/aaaa`, com o nulo tratado por quem chama.
  ///
  /// **A mesma redacao e o mesmo formato de `Meus achados`**, e o mesmo motivo
  /// para nao usar `intl`: `found_at` e anulavel no contrato e o nulo nao vira
  /// data inventada -- a linha nao sai.
  static String achadoEmTexto(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return 'Achado em $dia/$mes/${local.year}';
  }

  /// O que a pessoa escreveu para ajudar a reconhecer, com rotulo.
  static const String rotuloDosSinais = 'Os sinais que você descreveu';

  // -- Quem foi avisado -----------------------------------------------------

  /// O cabecalho do bloco mais delicado da tela.
  static const String tituloDeQuemFoiAvisado = 'Quem foi avisado';

  /// **NINGUEM, e a tela diz isso com todas as letras.**
  ///
  /// ## O defeito que esta frase existe para nao repetir
  ///
  /// Houve um dia em que TRES lugares mentiam juntos sobre a mesma coisa: o
  /// servidor devolvia `owner_notified: true` sem ter entregado nada, a tela do
  /// achador afirmava em texto fixo que *"o tutor foi avisado"*, e o
  /// desserializador do app ainda tinha `?? true` -- entao nem a resposta
  /// honesta do servidor conseguia desmentir a tela. Os tres foram consertados
  /// (`api/modelos_pet.dart` le `owner_notified` com `?? false`;
  /// `escanear/tela_do_pet_da_tag.dart` tem dois desfechos e nao um) e o valor
  /// hoje e **falso** ate o emissor existir.
  ///
  /// **E o envio de aviso no celular nao funciona.** Nao funciona em producao
  /// -- falta permissao da conta de servico na VM -- e nao funciona **nenhum**
  /// no iPhone deste build. Uma tela que prometesse o aviso faria o pior
  /// desfecho possivel deste produto: a pessoa solta o animal na rua por
  /// acreditar que alguem foi chamado.
  ///
  /// ## A redacao e a JA APROVADA, e nao uma nova
  ///
  /// `Ninguém foi avisado ainda` e palavra por palavra de
  /// `TelaCasoAberto.avisoDaFila` (`perdido/resultado_da_abertura.dart`), onde
  /// ela diz a mesma verdade sobre o outro lado do produto. A frase sobre o
  /// que o tutor recebe reusa `Eles vão receber a foto de <nome> e os sinais`,
  /// de `perdido/tela_alcance_do_alerta.dart` e da mesma
  /// `resultado_da_abertura.dart` -- aqui sem nome, porque achado avulso e de
  /// um animal que ninguem identificou ainda.
  static const String ninguemFoiAvisado = 'Ninguém foi avisado ainda.';

  /// O que o tutor recebe, e **quando**, sem prometer o aviso no celular.
  static const String oQueOTutorRecebe =
      'Se um tutor abrir um caso de um pet parecido, é a foto e os sinais que '
      'você descreveu que ele vai receber. Quem confirma se é o mesmo animal é '
      'o tutor, nunca o Bichu sozinho.';

  /// **O aviso no celular NAO funciona, e a tela diz.**
  ///
  /// Sem esta linha, a frase acima deixaria a pessoa esperando um toque no
  /// telefone que nao vai chegar -- e esperar sentado e o oposto do que ela
  /// precisa fazer nas primeiras horas.
  /// **E ELA CORRIGE, NA MESMA TELA, A PROMESSA DE [registradoCorpo].**
  ///
  /// Duas linhas acima a tela diz *"a gente te avisa"*. Sem esta frase, a
  /// pessoa leria a promessa e esperaria o telefone tocar -- e esperar sentado
  /// e o oposto do que ela precisa fazer nas primeiras horas. A promessa nao
  /// foi apagada porque ela e verdadeira sobre o CANAL que existe (a caixa de
  /// notificacoes do aplicativo); o que nao existe e a entrega no celular.
  /// Esta linha diz qual dos dois e qual, e e por isso que ela nomeia a
  /// promessa em vez de so negar o push.
  static const String avisoNoCelularNaoFunciona =
      'Quando a gente diz que te avisa, é aqui dentro do aplicativo: o aviso '
      'no celular ainda não está funcionando no Bichu. Não espere um toque no '
      'telefone, confira você mesmo por aqui.';

  // -- O que fazer em seguida -----------------------------------------------

  static const String tituloDoQueFazerAgora = 'O que fazer agora';

  /// O passo 1, e e o unico que alcanca o tutor **sem depender de nada nosso**.
  static const String passoDaPlaquinha =
      'Olhe se o bicho tem plaquinha ou coleira com código. Escanear o QR da '
      'plaquinha chega direto no tutor, na hora.';

  /// O passo 2: a lista publica de perdidos existe desde 18/10 e e o lugar em
  /// que a pessoa pode fazer a correspondencia com as proprias maos.
  static const String passoDaListaDePerdidos =
      'Procure o bicho na lista de pets perdidos, na seção Pets. Ela mostra '
      'quem está sendo procurado, com foto e bairro.';

  /// O passo 3, e ele e sobre o animal e nao sobre o app.
  static const String passoDeCuidar =
      'Deixe o animal num lugar seguro e volte aqui para acompanhar o achado. '
      'Nada que você fez se perde.';

  /// O rotulo da acao de escanear, no corpo da tela.
  static const String escanearAPlaquinha = 'Escanear a plaquinha';

  static const String voltarParaOsPets = 'Voltar';

  /// A acao que leva ao registro que a pessoa acabou de criar.
  ///
  /// **Ela existe porque o desfecho era um beco.** Ate 18/10 esta tela tinha
  /// UMA acao -- `Voltar`, para `Rotas.pets` --, e `Rotas.pets` diz com todas
  /// as letras que *a lista de pets perdidos esta em construcao*. O app nao
  /// lista achado em lugar nenhum: `GET /v1/found-reports`
  /// (`listMyFoundReports`) nao tem UM chamador em `app/lib`, e
  /// `Rotas.achadoDe` nao era chamada de lugar nenhum -- [TelaDoAchado] estava
  /// construida, registrada em `rotas.dart` e **orfa**. O resultado medido e a
  /// queixa do cliente, palavra por palavra: *"cadastrei que encontrei um pet
  /// e nao esta aparecendo na tela de pets"*. Ele estava certo sobre o sintoma
  /// e a tela de pets era o lugar errado de procurar.
  ///
  /// Esta acao **nao substitui a lista** -- ela da ao registro um endereco
  /// alcancavel enquanto a lista nao existe. Quem acabou de registrar um
  /// achado quer ver o achado, e ele esta em `/achados/<id>`. E a mesma
  /// escolha de `TextosDoCadastro.fazerATag`, pela mesma razao.
  static const String verOAchado = 'Ver o achado';

  /// O que a tela do achado diz quando o servidor responde ausencia.
  ///
  /// **A mesma frase para "nao existe" e para "nao e seu"**, e a igualdade e
  /// o ponto: um texto diferente para cada caso confirmaria a existencia do
  /// registro para quem nao e o dono (ADR-0021).
  static const String naoEncontrado =
      'Não encontramos este achado na sua conta.';
}
