import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
import '../../api/envio_de_foto.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../api/estados_brasileiros.dart';
import '../../formato/cep.dart';
import '../../formato/telefone.dart';
import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/saida_da_tela.dart';

/// **Indicar um profissional, clínica ou laboratório para o `Perto`**
/// (`suggestDirectoryEntry`).
///
/// ## Por que esta tela NAO publica, e a de criar encontro publica
///
/// A diferenca e de natureza, e e ela que decide o desenho inteiro:
///
/// - **Criar encontro e a pessoa falando DELA MESMA.** Ela escolheu o lugar,
///   marcou a hora e responde pelo que escreveu. Autor e assunto sao a mesma
///   pessoa, e por isso o encontro pode publicar direto.
/// - **Indicar uma clinica e publicar sobre um TERCEIRO** que nao pediu, nao
///   sabe e pode discordar -- do texto, da categoria e de aparecer. Nao existe
///   no produto quem represente esse terceiro.
///
/// Por isso a sugestao **nasce pendente de revisao** e nada aparece no `Perto`
/// antes de alguem olhar. Isso nao e zelo novo: e a emenda 1 do ADR-0011,
/// escrita no `CHECK` de `professionals.source`, que **nao tem** o valor
/// `'community'` -- *"nenhum perfil nasce sem o aceite de quem ele descreve; a
/// comunidade convida e avalia, nunca cria"*. Esta tela nao escreve em
/// `professionals`: ela escreve numa fila que o painel trabalha.
///
/// **O texto de sucesso diz isso com estas palavras.** Um "pronto, indicado!"
/// faria a pessoa acreditar que o nome de uma clinica real esta no ar sem
/// ninguem ter olhado.
///
/// ## O minimo de dado pessoal, e so de entidade
///
/// Nome, atividade, cidade, bairro opcional e **um** contato publico -- o que o
/// estabelecimento ja divulga para ser contratado, e que e o que permite ao
/// painel convida-lo. **Nao pede documento** (CRMV, CNPJ) e **nao pede dado de
/// pessoa fisica**: documento e prova de quem o apresenta, mora em
/// `entity_verifications`, e pedi-lo aqui seria coletar o documento de um
/// terceiro pela mao de um estranho.
///
/// **Sem endereco por extenso e sem ponto no mapa** (ADR-0006): nao ha
/// geocodificacao neste caminho. Cidade, estado e bairro sao rotulo de texto. O
/// ponto e trabalho do painel, com mapa de toque.
///
/// ## O e-mail nao confirmado: a recusa vem ANTES do formulario
///
/// A porta desta tela ja esta escondida para quem nao esta cadastrado E
/// validado (`podeCriarNaComunidade`, em `telas/abas.dart`, decisao do
/// cliente de 18/10/2026: *"caso ao contrario o botao nem aparece"*). Mas
/// **esconder a porta nao fecha a rota**: `Rotas.sugerirProfissional` segue
/// alcancavel por link profundo, e App Link e `F5` caem nela.
///
/// Quem chegava assim preenchia a tela inteira e era recusado no envio, pelo
/// `409 contact-channel-unverified`. A tela de criar encontro nao fazia isso
/// -- ela tem `_Impedimento.semEmailConfirmado` desde o primeiro dia --, e a
/// assimetria era defeito e nao desenho: **as duas sao destino de acao de
/// criar da comunidade, com a mesma regua no servidor**. Agora as duas dizem
/// o motivo com a saida acima dos campos. Ver [TelaSugerirProfissional.semEmailConfirmado]
/// para a regua e para por que a FRASE e diferente da de la.
///
/// O `409` continua tratado, como rede de seguranca para quem confirmou o
/// e-mail noutro aparelho com esta tela em pe.
///
/// ## O CEP: busca o endereco E vai no corpo, para quem revisa
///
/// O cliente pediu o campo em 18/10/2026 ("no formulario de indicacao do
/// profissional, o campo cep nao entrou tambem"), pela decisao dele de 17/10 --
/// ViaCEP em todo cadastro com CEP, preenchendo o endereco e **deixando a
/// pessoa editar** --, e no mesmo dia autorizou GUARDAR o valor: *"pode
/// armazenar o cep sim!"*.
///
/// Entao ele faz duas coisas, e as duas sao dele:
///
/// 1. **preenche** bairro, cidade e UF, e **so o que estiver vazio**;
/// 2. **viaja no corpo** como `postal_code` -- opcional, oito digitos sem
///    hifen (`^[0-9]{8}$`), acrescentado ao contrato pela mudanca aditiva de
///    18/10 e guardado por `directory_suggestions.postal_code`
///    (`20261017000015`).
///
/// **O destinatario e quem REVISA, e nunca o publico.** A fila do painel
/// precisa achar o estabelecimento para convida-lo (ADR-0011: convite e
/// aceite). Rua e CEP nao saem no `Perto` (ADR-0010 itens 4 e 5 -- bairro e
/// cidade sao o teto), nao existe operacao de leitura de
/// `directory_suggestions` no contrato, e o recibo desta tela nao devolve o
/// CEP: `DirectorySuggestionReceipt` e `additionalProperties: false` com
/// `reference`, `state` e `created_at`.
///
/// **Continua OPCIONAL, e nada nesta tela o torna obrigatorio**: ele nao entra
/// em [_Impedimento], e CEP pela metade simplesmente nao vai no corpo em vez
/// de virar recusa -- ver `DiretorioApi.corpoDaSugestao`.
///
/// E **isto nao e geocodificacao**: ver `api/busca_de_cep.dart`, que troca CEP
/// por texto e ignora de proposito a coordenada que a BrasilAPI devolve. Nao
/// ha logradouro aqui, e a assimetria e decisao: o CEP aponta para um trecho
/// de rua e tem destinatario; logradouro e numero apontam para a porta de um
/// terceiro que nao pediu nada.
class TelaSugerirProfissional extends StatefulWidget {
  const TelaSugerirProfissional({super.key});

  /// **Mais curto que o rotulo da porta, de proposito.** `BarraDeConta` tem
  /// 64 dp e uma linha: medido no aparelho, "Indicar quem atende bem" sai
  /// truncado como "Indicar quem atende be...". O rotulo do botao no `Perto`
  /// continua sendo o convite; o titulo da tela e o nome do lugar onde a
  /// pessoa chegou.
  static const String titulo = 'Indicar profissional';

  /// **O aviso que separa esta tela da de criar encontro.** Antes dos campos,
  /// porque e a decisao que a pessoa precisa entender ao comecar a escrever.
  static const String avisoDeRevisao =
      'A gente confere antes de publicar. O estabelecimento é avisado e decide '
      'se quer aparecer.';

  static const String rotuloDeIndicar = 'Enviar indicação';

  static const String entreParaIndicar = 'Entre para indicar.';

  /// **O bloqueio que esta tela passou a saber ANTES do formulario.**
  ///
  /// A regua e `usuario.emailVerificado`, que sai de `Me.email_verified` e a
  /// sessao ja tem -- a mesma de criar encontro, e a mesma do servidor nas
  /// duas rotas de criar da comunidade: `409 contact-channel-unverified` com
  /// `next_action: verify_email`, medido em homologacao em 19/10/2026. O
  /// predicado de la e `email_verified_at IS NOT NULL OR phone_verified_at IS
  /// NOT NULL`, mas na pratica e o e-mail: nao existe operacao de verificacao
  /// de telefone no contrato.
  ///
  /// **Por que a frase e OUTRA que a de criar encontro.** La o motivo e a
  /// publicacao -- *"o evento vai aparecer para toda a comunidade com o seu
  /// nome"* --, e aqui nada publica: a indicacao nasce pendente de revisao. O
  /// que pesa nesta tela e o TERCEIRO, e quem confere precisa saber de quem
  /// veio a indicacao de um estabelecimento de verdade. Copiar a frase de la
  /// prometeria uma publicacao que esta tela acabou de passar tres paragrafos
  /// dizendo que nao acontece.
  /// **UMA COPIA SO DO TEXTO, e isto e o colapso da mescla de 20/10/2026.**
  ///
  /// O #40 (esta tela avisa ANTES do formulario) e o #49 (a frase do `409`
  /// nomeia a rota que recusou) nasceram em sessoes que nao se enxergavam, e os
  /// dois escreveram a MESMA frase em lugares diferentes -- o #49 copiou a
  /// redacao do #40 em vez de reescrever, e os dois deixaram a duplicacao de
  /// proposito para nao criar conflito entre os PRs. Medido na arvore mesclada
  /// antes de colapsar: os dois literais eram iguais caractere a caractere.
  ///
  /// Nao houve decisao de microcopy aqui, so de estrutura. O texto mora em
  /// [MensagensDeErro.canalNaoVerificadoParaIndicar], que e o vocabulario do
  /// `409 contact-channel-unverified` desta rota, e esta tela o REUSA: o aviso
  /// previo e a recusa do servidor dizem a mesma coisa porque sao a mesma
  /// coisa, uma antes e outra depois da chamada. Duas copias terminariam
  /// divergindo numa revisao de texto que mexesse numa e nao na outra, e a que
  /// divergisse seria a que ninguem percebe.
  ///
  /// O NOME daqui fica, e nao e cerimonia: ha teste que o referencia, e manter
  /// o apelido da tela deixa o colapso sem efeito em quem chama.
  static const String semEmailConfirmado =
      MensagensDeErro.canalNaoVerificadoParaIndicar;

  static const String rotuloDeConfirmarEmail = 'Confirmar meu e-mail';

  static const String recebido =
      'Indicação recebida. Ela vai para conferência: nada aparece na Rede até '
      'alguém olhar.';

  /// O rotulo do campo de TIPO DE ENTIDADE (pedido do cliente, 29/10/2026).
  ///
  /// Verbatim: *"esta faltando o campo se e um profissional, ong ou
  /// estabelecimento"*. **O campo nao existia nesta tela**, e a consequencia era
  /// medida e silenciosa: quem indica pelo APK publicado gravava
  /// `entity_kind: professional` sem nunca ver a pergunta, porque o `DEFAULT` da
  /// coluna e o `coalesce` da funcao de registro respondem por quem nao manda o
  /// campo. Nao havia como indicar uma ONG.
  ///
  /// **O rotulo do CAMPO e da voz do app; os rotulos das OPCOES sao do painel.**
  /// Os dois textos das opcoes vem de [TipoDeEntidade.rotulo] e tem de ser
  /// identicos aos de `TIPOS_DE_ENTIDADE` em `admin/src/diretorio/dominio.ts`
  /// (ver a prosa daquele campo e o teste que cobra a igualdade). Este rotulo
  /// aqui nao: o painel diz `Tipo *` para um operador, e "O que é esse lugar" e
  /// a pergunta que a mesma lista responde para quem esta indicando a clinica do
  /// bairro -- a mesma diferenca que ja existe entre `Tipo` e
  /// [rotuloDaAtividade].
  static const String rotuloDoTipoDeEntidade = 'O que é esse lugar';

  /// **A ajuda EXISTE porque os dois eixos se confundem**, e e a mesma frase que
  /// o painel ja diz em `e-tipo-entidade-ajuda`. Sem ela, "O que é esse lugar" e
  /// "O que eles fazem" parecem a mesma pergunta duas vezes, e quem indica uma
  /// ONG que atende como clinica fica sem saber onde dizer cada coisa -- a
  /// resposta e NOS DOIS, e e isso que a linha diz.
  static const String ajudaDoTipoDeEntidade =
      'Uma ONG também escolhe abaixo o que ela faz: aqui você diz o que o '
      'lugar é.';

  /// O rotulo do campo de ATIVIDADE, que era literal na arvore do `build`.
  ///
  /// Virou constante em 29/10/2026 por uma razao e nao por arrumacao: o campo de
  /// tipo de entidade entrou ACIMA dele, e um teste que precisa distinguir os
  /// dois seletores pelo rotulo nao pode depender de literal solto no meio de
  /// mil linhas de `build`.
  static const String rotuloDaAtividade = 'O que eles fazem';

  // =========================================================================
  // O LOGOTIPO (pedido do cliente, 29/10/2026)
  // =========================================================================
  //
  // Verbatim: *"nao tem o campo do logotipo para o usuario subir e indicar o
  // estabelecimento"*.
  //
  // **NAO E UM CAMPO, E UMA OPERACAO DE INTENCAO DE ENVIO.** O backend nunca
  // recebe os bytes (ADR-0007): `createDirectorySuggestionLogoUploadIntent`
  // assina a politica, o app sobe direto para o armazenamento, e
  // `suggestDirectoryEntry` CONFIRMA o `upload_id` na mesma transacao do
  // `INSERT`. Nao ha segunda chamada de confirmacao, exatamente como na capa do
  // encontro.
  //
  // **O MOLDE E `rede/criar_encontro.dart`**, e o que se reusa e literal:
  // `EnvioParaConfirmarDepois`, `tiposDeFotoAceitosSemHeic`,
  // `recusaDeTipoDaFoto`, `PreviaDaFoto` e `CameraEGaleria`. O que NAO se reusa
  // e a GEOMETRIA: a capa do encontro e uma faixa 16:9 de 180 dp, e o logotipo
  // e um QUADRADO -- ele e a marca desenhada ao lado do nome, e a derivada dele
  // e `DERIVADAS_DA_LOGO` (`card` 512 x 512). Desenhar a logo numa faixa
  // panoramica prometeria um recorte que a derivada nao faz.

  static const String tituloDoLogotipo = 'Logotipo';

  /// **Uma linha de apoio, e o "Opcional" esta nela.** O cliente reprovou texto
  /// excessivo em tela, e o campo precisa dizer que a ausencia e aceitavel: a
  /// maioria de quem indica a clinica do bairro nao tem o arquivo da logo dela.
  static const String ajudaDoLogotipo =
      'A marca do lugar, se você tiver. Opcional.';

  static const String tirarAFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String oLogotipoEscolhido = 'O logotipo que você escolheu';

  static const String logotipoSemSinal =
      'O logotipo não subiu: sem conexão agora. Escolha a imagem de novo '
      'quando tiver internet.';

  static const String logotipoRecusado =
      'O logotipo não foi aceito. Escolha outra imagem.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  /// O motivo do bloqueio enquanto os bytes do logotipo estao no ar.
  ///
  /// **Constante PUBLICA da tela, e nao literal dentro de `_Impedimento`**: o
  /// `enum` e privado do arquivo, e um teste que precise afirmar esta frase sem
  /// ela teria de copia-la -- e frase copiada e a que diverge na primeira
  /// revisao de texto. Mesmo arranjo de `entreParaIndicar` e
  /// `semEmailConfirmado`, que o `enum` ja le da classe.
  static const String esperarOLogotipo =
      'Espere o logotipo terminar de subir.';

  static const String rotuloDoCep = 'CEP';

  /// O rotulo do campo de estado, que deixou de ser `UF` digitada.
  static const String rotuloDoEstado = 'Estado';

  /// O que o seletor mostra enquanto nada foi escolhido.
  static const String escolherOEstado = 'Escolher na lista';

  /// **Diz que o CEP e guardado, e para quem.** A pessoa esta informando o
  /// endereco de um terceiro: esconder que o valor fica salvo seria o tipo de
  /// omissao que a faixa de revisao desta tela existe para nao fazer.
  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois. Fica salvo '
      'só para quem confere, e não aparece na Rede.';

  /// Os tres desfechos da busca. **Nenhum e erro de formulario**: nenhum marca
  /// campo, nenhum desabilita o botao e nenhum impede o envio -- o CEP nao e
  /// campo do corpo, e o pior desfecho quer dizer "digite você mesmo".
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaIndisponivel =
      'Não deu para buscar o CEP agora. Preencha abaixo.';

  @override
  State<TelaSugerirProfissional> createState() =>
      _TelaSugerirProfissionalState();
}

enum _Fase { preenchendo, enviando, recebida }

/// O primeiro impedimento, ou nulo. **A ordem importa**: o que a pessoa nao
/// resolve nesta tela vem antes do que ela resolve digitando. E-mail nao
/// confirmado vem antes dos campos de proposito -- na ordem inversa a tela
/// mandaria preencher o formulario inteiro para o servidor recusar no envio.
enum _Impedimento {
  semConta(TelaSugerirProfissional.entreParaIndicar),
  semEmailConfirmado(TelaSugerirProfissional.semEmailConfirmado),
  semNome('Diga o nome do lugar ou da pessoa.'),
  semAtividade('Escolha o que eles fazem.'),
  semCidade('Diga a cidade.'),
  // **"Escolha", e nao "digite com duas letras"**: o estado deixou de ser
  // sigla digitada e passou a ser uma escolha na lista de 27, e um motivo que
  // manda digitar manda a pessoa procurar um campo de texto que nao existe.
  semUf('Escolha o estado.'),
  semTipoDeContato('Escolha como entrar em contato.'),
  semContato('Preencha o contato público.'),
  // **As MESMAS palavras de `tela_dados_pessoais` e do pedido da plaquinha**,
  // e nao uma terceira redacao delas. Ele entrou junto com a mascara: com o
  // campo mascarado, `(11` tem tres caracteres e passava por `semContato` --
  // o botao ficava habilitado sobre um numero pela metade, e a recusa chegava
  // como `400` em `public_contact.value`.
  telefoneIncompleto('Digite DDD e número.'),
  // **O LOGOTIPO ESTA SUBINDO** (29/10/2026). Enviar agora mandaria o
  // `upload_id` que ainda nao existe -- ou nenhum -- e gravaria a indicacao sem
  // o logotipo que a pessoa escolheu, **sem dizer nada**. E a mesma guarda que
  // `capaSubindo` faz em `criar_encontro.dart`, e ela vem POR ULTIMO na ordem:
  // o logotipo e opcional, entao sem imagem escolhida este impedimento nao
  // vale e o botao fica livre.
  logotipoSubindo(TelaSugerirProfissional.esperarOLogotipo);

  const _Impedimento(this.texto);

  final String texto;
}

class _TelaSugerirProfissionalState extends State<TelaSugerirProfissional> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _contato = TextEditingController();
  final TextEditingController _recado = TextEditingController();

  /// A sigla do estado escolhida na lista de 27, ou nulo.
  ///
  /// **Escolha e nao digitacao, e isso conserta DADO e nao so atrito.**
  /// `DirectorySuggestionInput.state` e `pattern: '^[A-Z]{2}$'`, mas o campo
  /// digitado de dois caracteres aceitava `SA`, `XX` e qualquer par de letras
  /// -- e quem indica uma clinica de outra cidade nao tem por que saber a
  /// sigla dela. A lista mostra o NOME e guarda a SIGLA, que e a mesma decisao
  /// de 17/10/2026 ja construida em `perfil/tela_dados_pessoais`,
  /// `pet/tela_solicitar_plaquinha` e `localizacao/captura_de_localizacao`.
  String? _uf;

  AtividadeDoDiretorio? _atividade;

  /// O TIPO DE ENTIDADE escolhido. **Nasce com `profissional`, e nao nulo.**
  ///
  /// ## A decisao, e o argumento dos dois lados
  ///
  /// O seletor de atividade acima e `AtividadeDoDiretorio?`, nulo ate escolher,
  /// e `_impedimento` barra o botao enquanto nao ha escolha. Repetir a forma
  /// aqui seria o caminho de menor atrito de leitura -- e esta errado. Os tres
  /// motivos, em ordem de peso:
  ///
  /// 1. **O painel nasce em `professional`** (`FormularioDaEntrada`,
  ///    `tipoDeEntidade: 'professional'` no estado inicial) e o contrato tambem
  ///    (`DirectorySuggestionInput.entity_kind` tem `default: professional`, e a
  ///    coluna tem o mesmo `DEFAULT`). Exigir escolha aqui faria o aplicativo
  ///    ser **mais estrito que o painel e que o contrato** na mesma pergunta --
  ///    que e a classe de divergencia que este campo inteiro veio consertar.
  /// 2. **Nao existe terceira resposta, e nao existe "nenhuma".** O `enum` tem
  ///    DOIS valores, e "nem profissional nem ONG" nao e estado que signifique
  ///    algo. Um impedimento a mais (seria o setimo) travaria o botao de todo
  ///    mundo esperando a confirmacao de um valor que ja esta certo na enorme
  ///    maioria -- `ORDEM_DOS_TIPOS_DE_ENTIDADE` no painel escreve exatamente
  ///    isso: *"`professional` primeiro porque e o padrao do contrato e o caso
  ///    comum; `organization` e a excecao que o operador escolhe de proposito"*.
  /// 3. **Padrao VISIVEL nao e gravacao silenciosa.** O contra-argumento legitimo
  ///    e que padrao grava o que a pessoa nao escolheu. Ele vale para campo
  ///    escondido; aqui o campo fecha com o texto `Profissional ou
  ///    estabelecimento` escrito dentro dele, acima da atividade, na primeira
  ///    dobra. **A gravacao silenciosa e o que acontece HOJE**, sem campo nenhum:
  ///    o APK publicado manda a indicacao sem `entity_kind` e a linha nasce
  ///    `professional` sem que a pergunta tenha sido feita. Trocar "escreve o
  ///    padrao certo com a pergunta na tela" por "trava o botao" nao compra
  ///    informacao -- compra um toque obrigatorio.
  ///
  /// **O que o padrao NAO faz:** ele nao decide nada sobre a fila. A indicacao
  /// continua nascendo `pending` e passando por um revisor, que ve o tipo escrito
  /// em `FilaDeIndicacoes` e o corrige se a pessoa errou. O campo existe para a
  /// pessoa **poder dizer** que e uma ONG, e nao para ser portao de qualidade de
  /// dado de terceiro.
  TipoDeEntidade _tipoDeEntidade = TipoDeEntidade.profissional;

  TipoDeContatoPublico? _tipoDeContato;

  /// O que a ultima busca de CEP devolveu. **Nunca desabilita nada**: serve
  /// so para a linha de texto embaixo do campo.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  // ===========================================================
  // O LOGOTIPO (29/10/2026) -- ver as constantes da classe
  // ===========================================================

  /// A imagem que a pessoa escolheu no aparelho. **A fonte da PREVIA, e ela vem
  /// do ARQUIVO LOCAL** -- nao se espera a derivada do servidor, que so existe
  /// depois de o worker rodar, e a indicacao ainda nem foi gravada.
  FotoLocal? _logotipoEscolhido;

  /// O `upload_id` de um logotipo cujos **bytes ja estao no armazenamento** e
  /// que ainda nao foi confirmado, ou nulo.
  ///
  /// E ele que vai em `logo_upload_id` no `POST`. **Fica nulo quando o envio
  /// falha**: um identificador de bytes que nao subiram volta
  /// `400 upload_not_usable` sem dizer por que.
  String? _uploadDoLogotipo;

  bool _enviandoOLogotipo = false;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  Map<String, String> _errosDeCampo = const <String, String>{};
  String? _chave;

  // ===========================================================
  // BAIRRO, CIDADE E ESTADO ABREM VAZIOS (BICHUS-317)
  // ===========================================================
  //
  // **Nao ha `didChangeDependencies` nesta tela, e a ausencia e o recurso.**
  // Ate 29/10/2026 ela preenchia os tres campos da regiao de referencia do
  // tutor (`Me.reference_area`) na primeira montagem. O cliente pediu que
  // parasse, verbatim: *"na pagina criar evento e indicar profissional, os
  // campos bairro, cidade e estado estao vindo preenchidos por padrao com
  // minhas informacoes, deve vir em branco e o usuario digitar"*.
  //
  // **O repositorio ja argumentava a favor disso, e e por isso que o pedido
  // nao e troca de gosto.** `localizacao/captura_de_localizacao.dart` (na
  // prosa de `_preencherDaRegiaoDeReferencia`) escreve que, ao lado de um dado
  // medido, *"inventa-la da ficha do tutor seria pior"*. O juizo vale inteiro
  // aqui, e com mais forca: o endereco desta tela e **de um TERCEIRO** -- uma
  // clinica que a pessoa esta indicando --, e nao dela. Escrever o bairro do
  // tutor embaixo do nome de um estabelecimento afirma, com cara de dado
  // conferido, que o estabelecimento fica onde o tutor mora. Quem indica a
  // clinica da cidade vizinha mandava a cidade errada sem notar: o campo ja
  // vinha escrito, e campo escrito nao se le, se aceita.
  //
  // **Quem preenche endereco aqui e o CEP**, que a pessoa digita de proposito
  // e que preenche os tres (`_buscarOCep`). Esse caminho tem origem declarada
  // e a pessoa sabe o que pediu; a ficha do tutor nao tinha nenhuma das duas.
  //
  // **A mudanca vale NOS DOIS formularios de criar da comunidade**, aqui e em
  // `rede/criar_encontro.dart`. Mexer num so deixaria `Criar evento` e
  // `Indicar` discordando sobre a mesma pergunta, que e o tipo de incoerencia
  // que ninguem reporta e todos sentem.
  //
  // ===========================================================
  // E `didChangeDependencies` VOLTOU EM 29/10/2026 -- PARA A CAMERA, E SO
  // ===========================================================
  //
  // O paragrafo acima dizia "nao ha `didChangeDependencies` nesta tela, e a
  // ausencia e o recurso". **A ausencia do PREENCHIMENTO continua sendo o
  // recurso, e ela esta intacta**: nada aqui le `Me.reference_area`, e bairro,
  // cidade e estado seguem abrindo vazios.
  //
  // O metodo existe de novo por um motivo diferente e de outra natureza: o
  // campo de logotipo precisa saber o estado da camera **antes** de a pessoa
  // tocar em nada, para nao desenhar `Tirar foto` em aparelho sem camera --
  // botao que nao leva a nada e pior que a ausencia dele. `Escopo.of(context)`
  // nao esta disponivel em `initState`, entao nao ha onde mais ler isso.
  //
  // E exatamente o arranjo de `rede/criar_encontro.dart`, onde o
  // `didChangeDependencies` ficou com esta UNICA tarefa depois de a
  // BICHUS-317 tirar o preenchimento dele.

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // **Uma tarefa so, e ela nao preenche campo nenhum.** Quem acrescentar algo
    // aqui releia os tres paragrafos acima: foi o preenchimento da regiao de
    // referencia do tutor neste metodo que mandava a cidade errada embaixo do
    // nome de um estabelecimento.
    _lerAPermissaoDaCamera();
  }

  @override
  void dispose() {
    _nome.dispose();
    _cep.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _contato.dispose();
    _recado.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
  ///
  /// Tres regras, e as tres sao do pedido do cliente de 17/10/2026:
  ///
  /// 1. **so campo vazio recebe.** O que a pessoa escreveu vence o que a base
  ///    devolve. A base erra, e quem esta olhando o endereco e a pessoa.
  ///
  ///    **Desde a BICHUS-317 os tres campos abrem VAZIOS** -- a tela nao os
  ///    preenche mais da regiao de referencia do tutor --, entao na primeira
  ///    busca esta regra quase sempre preenche os tres. Ela continua existindo
  ///    para a SEGUNDA busca e para quem digita o bairro antes do CEP, e
  ///    continua sendo por CAMPO e nao por formulario;
  /// 2. **nada fica bloqueado depois da busca.** Os tres campos continuam
  ///    editaveis: CEP generico de cidade nao traz bairro;
  /// 3. **nada aqui pode impedir a indicacao.** Nenhum caminho desta funcao
  ///    marca erro de campo, mexe em `_impedimento` ou desabilita o botao.
  ///    Servico de CEP fora do ar nao impede ninguem de indicar: o campo
  ///    segue digitavel e o corpo sai com o CEP que a pessoa escreveu, ou sem
  ///    nenhum.
  ///
  /// O `logradouro` que a busca devolve e **descartado**: nao ha campo de rua
  /// nesta tela e nao ha coluna para ele (ADR-0011: endereco publico e ponto
  /// do mapa sao do painel). Descartar e o certo; criar o campo seria decidir
  /// por conta propria que a sugestao passa a carregar endereco de terceiro.
  Future<void> _buscarOCep() async {
    final cep = _cep.text.replaceAll(_soDigitos, '');
    if (cep.length != 8 || cep == _cepJaBuscado) return;
    _cepJaBuscado = cep;

    setState(() {
      _buscandoOCep = true;
      _buscaDoCep = null;
    });

    final resposta = await Escopo.of(context).buscaDeCep.buscar(cep);
    if (!mounted) return;

    setState(() {
      _buscandoOCep = false;
      _buscaDoCep = resposta.resultado;
      final endereco = resposta.endereco;
      if (endereco == null) return;
      _preencherSeVazio(_bairro, endereco.bairro, 'neighborhood');
      _preencherSeVazio(_cidade, endereco.cidade, 'city');
      // **Escolha vazia recebe; escolha feita fica** -- a mesma regra dos dois
      // controladores acima, agora sobre um `String?` em vez de um campo de
      // texto. O que a pessoa escolheu vence o que a base devolve.
      final uf = siglaDeEstadoValida(endereco.uf);
      if (_uf == null && uf != null) {
        _uf = uf;
        _errosDeCampo = <String, String>{..._errosDeCampo}..remove('state');
      }
    });
  }

  /// Campo vazio recebe; campo escrito fica. E o erro do campo que acabou de
  /// ser preenchido sai junto -- deixar "Diga a cidade." embaixo de uma cidade
  /// preenchida seria a tela discutindo consigo mesma.
  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _errosDeCampo = <String, String>{..._errosDeCampo}..remove(chave);
  }

  /// A linha que conta o que a busca fez. **Nenhum destes estados e erro.**
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        TelaSugerirProfissional.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado =>
        TelaSugerirProfissional.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel =>
        TelaSugerirProfissional.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

  // -------------------------------------------------------------------------
  // O LOGOTIPO DA INDICACAO (29/10/2026)
  // -------------------------------------------------------------------------

  /// O estado da camera, lido **antes** de a pessoa tocar em nada.
  ///
  /// E o que permite a tela nao desenhar `Tirar foto` em aparelho sem camera.
  /// Mesmo arranjo de `criar_encontro`, de `Meus dados`, do cadastro de foto do
  /// pet e do registro de achado.
  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarOLogotipo() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustado = await _ajustarOLogotipo(camera, foto);
    if (!mounted || ajustado == null) return;
    await _escolheuOLogotipo(ajustado);
  }

  Future<void> _escolherOLogotipoDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustado = await _ajustarOLogotipo(camera, foto);
    if (!mounted || ajustado == null) return;
    await _escolheuOLogotipo(ajustado);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  ///
  /// Cliente, 29/10/2026: *"precisamos implementar em todo sistema que tem
  /// upload de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a
  /// posicao da imagem"*. Nulo e a pessoa cancelando -- **o mesmo nulo** que o
  /// seletor devolve quando ela desiste de escolher, e que esta tela ja trata.
  ///
  /// A forma vem de `DERIVADAS_DA_LOGO` (512 x 512) em
  /// `src/modules/media/domain/derivadas.ts` -- o corte que o SERVIDOR faz.
  /// O quadro desta tela (`ladoDoQuadro`, 120, com `width` IGUAL a `height`
  /// de proposito) concorda, mas quem manda na janela e quem corta.
  ///
  /// E era justamente este o recorte automatico errado para uma LOGO: uma
  /// marca retangular centrada num quadrado perde as duas pontas, e a logo e
  /// a parte da indicacao que identifica o negocio.
  Future<FotoLocal?> _ajustarOLogotipo(
    CameraEGaleria camera,
    FotoLocal foto,
  ) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.logoDaIndicacao,
        titulo: 'Ajuste o logotipo',
      );

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// O logotipo escolhido **JA SOBE**, e a previa aparece antes de o servidor
  /// dizer qualquer coisa.
  ///
  /// **Nao ha botao separado de salvar a imagem**, e a ausencia e o desenho:
  /// os bytes sobem agora e `Enviar indicação` confirma o `upload_id`. Dois
  /// caminhos de confirmacao para a mesma imagem divergem na primeira edicao.
  Future<void> _escolheuOLogotipo(FotoLocal foto) async {
    // A RECUSA POR TIPO, dita ANTES do envio, e com a lista SEM HEIC: o `enum`
    // de `DirectorySuggestionLogoIntentInput` e `[image/jpeg, image/png,
    // image/webp]`, mais estreito que o da foto de pet, porque a esteira de
    // catalogo nao decodifica HEIC. Dizer aqui poupa a pessoa de um `400` que
    // ela nao tem como interpretar.
    final recusa =
        recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitosSemHeic);
    if (recusa != null) {
      setState(() {
        _logotipoEscolhido = null;
        _uploadDoLogotipo = null;
        _erro = MensagemDeErro(texto: recusa);
      });
      return;
    }

    setState(() {
      _logotipoEscolhido = foto;
      _uploadDoLogotipo = null;
      _erro = null;
      _enviandoOLogotipo = true;
    });

    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    final escopo = Escopo.of(context);
    // `EnvioParaConfirmarDepois` com a FUNCAO DA ROTA, e nao com uma etiqueta
    // de proposito: `DirectorySuggestionLogoIntentInput` nao tem campo
    // `purpose`, e e a ROTA que fixa o `directory_suggestion_logo`. Passar a
    // funcao e o que torna uma troca de rota visivel em quem a passa -- e a
    // troca aqui seria a mais caro do produto: a rota do PAINEL
    // (`directory_logo`) grava envio que a escrita de `professionals` ACEITA, e
    // `professionals` sai em superficie publica.
    final destino = EnvioParaConfirmarDepois(
      pedir: DiretorioApi(escopo.api).intencaoDeLogotipoDaIndicacao,
    );
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoOLogotipo = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadDoLogotipo = destino.uploadId;
        case DesfechoDoEnvio.semSinal:
          // **A previa SAI quando o envio falha**, e isso nao e perder o
          // trabalho da pessoa: o `POST` nao teria o que confirmar, e manter a
          // imagem na tela depois de um envio que nao aconteceu e a tela
          // prometendo um logotipo que nao existe.
          _logotipoEscolhido = null;
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.logotipoSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _logotipoEscolhido = null;
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.logotipoRecusado,
          );
      }
    });
  }

  _Impedimento? get _impedimento {
    final usuario = Escopo.of(context).sessao.usuario;
    if (usuario == null) {
      return _Impedimento.semConta;
    }
    // **Aqui, acima dos campos, e nao no envio.** Sem esta linha quem chega
    // sem o e-mail confirmado preenche nome, atividade, cidade, UF e contato
    // publico e so descobre no toque do botao, pelo `409` do servidor.
    if (!usuario.emailVerificado) return _Impedimento.semEmailConfirmado;
    if (_nome.text.trim().length < 2) return _Impedimento.semNome;
    if (_atividade == null) return _Impedimento.semAtividade;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf == null) return _Impedimento.semUf;
    if (_tipoDeContato == null) return _Impedimento.semTipoDeContato;
    if (_contato.text.trim().length < 3) return _Impedimento.semContato;
    // **So no ramo do telefone**, e e `telefoneEmE164` quem decide -- a mesma
    // funcao que `Meus dados`, o endereco de entrega e o pedido da plaquinha
    // chamam. Sem esta linha a mascara pioraria o formulario em vez de
    // melhora-lo: ela e quem faz `(11` caber em `length >= 3`.
    if (_tipoDeContato == TipoDeContatoPublico.phone &&
        telefoneEmE164(_contato.text) == null) {
      return _Impedimento.telefoneIncompleto;
    }
    // O LOGOTIPO, por ultimo, porque ele e OPCIONAL: sem imagem escolhida este
    // nao vale e o botao fica livre. O que ele impede e so a janela em que os
    // bytes estao no ar -- enviar ali gravaria a indicacao sem o logotipo que a
    // pessoa acabou de escolher, em silencio.
    if (_enviandoOLogotipo) return _Impedimento.logotipoSubindo;
    return null;
  }

  Future<void> _indicar() async {
    if (_impedimento != null) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _errosDeCampo = const <String, String>{};
    });

    final corpo = DiretorioApi.corpoDaSugestao(
      nome: _nome.text.trim(),
      atividade: _atividade!,
      // **Sem `!` e sem ramo de ausencia**: o campo nasce com `profissional` e
      // o seletor nunca devolve nulo para ele (ver a prosa de
      // `_tipoDeEntidade`). E a diferenca em relacao a `_atividade` acima, que
      // e anulavel e por isso tem `_impedimento.semAtividade` guardando o `!`.
      tipoDeEntidade: _tipoDeEntidade,
      cidade: _cidade.text.trim(),
      // Sem `trim` e sem `toUpperCase`: o valor vem de `estadosBrasileiros`,
      // que guarda a sigla ja em maiuscula e sem espaco. As duas chamadas
      // existiam porque o campo era digitado.
      uf: _uf!,
      tipoDeContato: _tipoDeContato!,
      // **O que viaja e E.164, e nao o que esta na tela.**
      // `DirectorySuggestionContact.value` declara, para `kind: phone`, E.164
      // (`+5511...`); a mascara e de EXIBICAO e `(11) 98765-4321` tomaria
      // `400`. `telefoneEmE164` e a unica funcao de `formato/telefone.dart`
      // que produz valor de contrato, e `_impedimento` acima ja garantiu que
      // ela nao devolve `null` aqui.
      //
      // Site e Instagram seguem indo CRUS: o formato deles e o que a pessoa
      // digitou, e nao ha mascara nenhuma a desfazer.
      contato: _tipoDeContato == TipoDeContatoPublico.phone
          ? telefoneEmE164(_contato.text)!
          : _contato.text.trim(),
      bairro: _bairro.text.trim(),
      cep: _cep.text.trim(),
      recado: _recado.text.trim(),
      // **O LOGOTIPO VAI NO MESMO CORPO.** Nao ha segunda chamada de
      // confirmacao: `logo_upload_id` e campo de `DirectorySuggestionInput`, e e
      // esta gravacao que confirma a intencao no servidor, na mesma transacao.
      // Sem isso o objeto subiria e o varredor o recolheria em dez minutos.
      logoUploadId: _uploadDoLogotipo,
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      await escopo.diretorio.sugerir(corpo, idempotencyKey: chave);
      if (!mounted) return;
      // **Fica NESTA tela, com o recibo.** Nao ha tela de "publicado" porque
      // nada foi publicado, e navegar para o `Perto` faria a pessoa procurar
      // na lista o que nao esta lá.
      setState(() => _fase = _Fase.recebida);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. Toque de novo quando tiver internet.',
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        setState(() => _fase = _Fase.preenchendo);
        context.push(Rotas.entrar);
        return;
      }
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.indicarProfissional,
        );
        _errosDeCampo = _camposRecusados(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.indicarProfissional,
        );
      });
    } on Object catch (erro, pilha) {
      // Sem este ramo a fase `enviando` ficaria de pe para sempre num erro que
      // nao e `FalhaDeChamada` (ver `api/falhas.dart`).
      registrarFalhaInesperada(erro, pilha, onde: 'ao indicar um profissional');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  /// Os campos que o `400` nomeou, pela frase do servidor.
  static Map<String, String> _camposRecusados(FalhaDaApi falha) {
    final mapa = <String, String>{};
    for (final campo in falha.problem.campos) {
      if (campo.campo.isEmpty) continue;
      mapa[campo.campo] = campo.mensagem ?? 'Confira este campo.';
    }
    return mapa;
  }

  @override
  Widget build(BuildContext context) {
    final escopo = Escopo.of(context);
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return AnimatedBuilder(
      animation: escopo.sessao,
      builder: (context, _) {
        if (_fase == _Fase.recebida) return _recibo(context);

        final impedimento = _impedimento;
        final enviando = _fase == _Fase.enviando;
        final tipo = _tipoDeContato;

        return Scaffold(
          appBar: const BarraDeConta(
            titulo: TelaSugerirProfissional.titulo,
            saida: TipoDeSaida.voltar,
          ),
          body: SafeArea(
            top: false,
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TelaSugerirProfissional.avisoDeRevisao,
                ),
                if (_erro != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: _erro!.texto,
                    rotuloDaAcao: _erro!.acao,
                    aoTocarNaAcao: _saidaDoErro(context, _erro!),
                  ),
                ],
                // Sem conta, o motivo vem com a saida que o resolve, acima dos
                // campos: um botao desabilitado sem explicacao e o defeito que
                // esta faixa existe para impedir.
                if (impedimento == _Impedimento.semConta) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaSugerirProfissional.entreParaIndicar,
                    rotuloDaAcao: 'Entrar',
                    aoTocarNaAcao: () => context.push(Rotas.entrar),
                  ),
                ],
                // Mesmo desenho, e pelo mesmo motivo: o bloqueio que a tela
                // sabe de antemao vem com a saida que o resolve, ACIMA dos
                // campos -- os dois tornam o formulario inutil enquanto
                // valem, e preencher nove campos para ser recusado no envio
                // era o que esta faixa veio tirar.
                if (impedimento == _Impedimento.semEmailConfirmado) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaSugerirProfissional.semEmailConfirmado,
                    rotuloDaAcao:
                        TelaSugerirProfissional.rotuloDeConfirmarEmail,
                    aoTocarNaAcao: () => context.push(
                      Rotas.verifiqueSeuEmail,
                      extra: escopo.sessao.usuario?.email ?? '',
                    ),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Nome do lugar',
                  controlador: _nome,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['display_name'],
                  limite: 120,
                  exemplo: 'Clínica Veterinária Bichinho',
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                // O TIPO DE ENTIDADE, **antes da atividade e de proposito**: "o
                // que e?" vem antes de "o que faz?", que e a mesma ordem e o
                // mesmo argumento escritos em `FormularioDaEntrada` no painel.
                // Uma ONG responde as duas perguntas, e quem le a de cima
                // primeiro entende por que a de baixo continua sendo pedida.
                //
                // **Nao ha `erro:` aqui**, e a ausencia e medida: o campo e
                // opcional no contrato, nasce preenchido e so pode sair com um
                // dos dois valores do `enum`, entao nao existe `400` com
                // `field: entity_kind` para esta tela pintar. Pendurar
                // `_errosDeCampo['entity_kind']` seria desenhar a moldura de um
                // erro que nenhum caminho produz.
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDoTipoDeEntidade,
                  ajuda: TelaSugerirProfissional.ajudaDoTipoDeEntidade,
                  itens: TipoDeEntidade.values
                      .map(
                        (t) => ItemDeLista(codigo: t.codigo, rotulo: t.rotulo),
                      )
                      .toList(),
                  selecionado: _tipoDeEntidade.codigo,
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    // **`??` e nao `!`**: `aoSelecionar` declara `String?`, e um
                    // codigo que o `enum` nao conhece nao pode virar nulo num
                    // campo que nunca e nulo. Cair no valor que ja estava e a
                    // unica saida que nao inventa estado -- e, como a lista sai
                    // de `TipoDeEntidade.values`, este ramo nao tem como
                    // acontecer pela tela.
                    _tipoDeEntidade =
                        TipoDeEntidade.porCodigo(codigo) ?? _tipoDeEntidade;
                    _erro = null;
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDaAtividade,
                  itens: AtividadeDoDiretorio.values
                      .map(
                        (a) => ItemDeLista(codigo: a.codigo, rotulo: a.rotulo),
                      )
                      .toList(),
                  selecionado: _atividade?.codigo,
                  erro: _errosDeCampo['kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _atividade = AtividadeDoDiretorio.porCodigo(codigo);
                    _erro = null;
                  }),
                ),
                const SizedBox(height: BichuEspaco.e6),
                // O LOGOTIPO, **depois do que o lugar E e do que ele FAZ, e
                // antes do endereco**: as tres primeiras perguntas sao sobre a
                // identidade do estabelecimento, e o endereco e outro assunto
                // (tem titulo de secao proprio logo abaixo). A imagem junto do
                // nome e tambem a ordem em que a logo aparece depois: um
                // quadrado ao lado do `display_name`.
                _BlocoDoLogotipo(
                  escolhido: _logotipoEscolhido,
                  enviando: _enviandoOLogotipo,
                  permissao: _permissaoDaCamera,
                  // `enviando` aqui e a fase de ENVIO DO FORMULARIO, nao a do
                  // logotipo: com a indicacao sendo gravada, trocar a imagem
                  // mandaria um `upload_id` que a requisicao em curso nao vai
                  // usar.
                  aoTirar: enviando ? null : _tirarOLogotipo,
                  aoEscolher: enviando ? null : _escolherOLogotipoDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde atende', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                // **O CEP vem ANTES dos tres campos que ele preenche**, e a
                // ordem e o proprio recurso: quem digita primeiro o CEP nao
                // digita o resto. Ele e **opcional** e nao entra em
                // `_impedimento` -- quem nao sabe o CEP da clinica preenche
                // cidade e UF a mao, como antes.
                BichuField(
                  rotulo: TelaSugerirProfissional.rotuloDoCep,
                  controlador: _cep,
                  opcional: true,
                  // 9 e nao 8: o `maxLength` do campo conta o HIFEN da
                  // mascara, e com 8 o ultimo digito seria cortado em
                  // silencio -- o CEP ficaria errado na tela e no corpo.
                  limite: limiteDoCep,
                  tipoDeTeclado: TextInputType.number,
                  ajuda: TelaSugerirProfissional.ajudaDoCep,
                  // **A mascara, e nao `digitsOnly`** (cliente, 18/10:
                  // "coloque mascara no campo cep de todos os formularios").
                  // Ela mostra `01310-100`, aceita digitacao continua sem
                  // hifen, descarta o que nao e digito -- e **nao valida
                  // nada**: quem produz o valor do contrato e
                  // `cepParaOContrato`, do mesmo arquivo, e e ela que tira o
                  // hifen antes de o corpo sair. Sem essa separacao a tela
                  // mandaria `22041-001` contra um `pattern` de
                  // `^[0-9]{8}$`, que e a divergencia que nenhum portao pega.
                  formatadores: const <TextInputFormatter>[
                    MascaraDeCep(),
                  ],
                  correcaoAutomatica: false,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                  // No oitavo digito a busca sai sozinha. Sem botao `Buscar`:
                  // um botao a mais e um passo a mais para quem so quer os
                  // campos preenchidos, e nao buscar e desfecho valido.
                  aoMudar: (valor) {
                    _aoDigitar(valor);
                    _buscarOCep();
                  },
                ),
                // O que a busca disse, e **so isso**: nao marca campo e nao
                // desabilita nada.
                if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  _linhaDaBusca(textos),
                ],
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Cidade',
                  controlador: _cidade,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['city'],
                  limite: 80,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                // **Lista de 27, e nao sigla digitada**, pela mesma decisao de
                // 17/10/2026 que ja vale em `Meus dados`, no pedido da
                // plaquinha e no registro de achado. Ela conserta DADO e nao
                // so atrito -- ver o campo `_uf`.
                //
                // **Fora da `Row` da cidade**, e nao na `SizedBox` de 96 px
                // onde a sigla ficava: o seletor mostra o NOME do estado
                // ("Rio Grande do Norte"), que nao cabe em 96 px. O campo que
                // ele substituiu cabia porque mostrava duas letras.
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDoEstado,
                  estadoInicial: TelaSugerirProfissional.escolherOEstado,
                  itens: estadosBrasileiros,
                  selecionado: _uf,
                  erro: _errosDeCampo['state'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _uf = codigo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['neighborhood'],
                  opcional: true,
                  limite: 80,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Contato público', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                SeletorDeLista(
                  rotulo: 'Como entrar em contato',
                  // **O tipo e declarado, nao adivinhado.** O servidor confere
                  // o formato contra ele; adivinhar por heuristica aceitaria um
                  // telefone no campo de site, e a recusa chegaria sem dizer
                  // qual dos dois estava errado.
                  itens: TipoDeContatoPublico.values
                      .map(
                        (t) => ItemDeLista(codigo: t.codigo, rotulo: t.rotulo),
                      )
                      .toList(),
                  selecionado: tipo?.codigo,
                  erro: _errosDeCampo['public_contact.kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    final novo = TipoDeContatoPublico.porCodigo(codigo);
                    // ===========================================
                    // TROCAR DE TIPO LIMPA O CAMPO -- e por que
                    // ===========================================
                    //
                    // A mascara entra e sai com o tipo, e isso deixa um
                    // estado que nao existia antes dela: escolher `Telefone`,
                    // digitar `(11) 98765-4321` e trocar para `Site` deixava
                    // parenteses e hifen DENTRO de um campo de endereco.
                    //
                    // **Limpar, e nao deixar a validacao recusar**, e a
                    // decisao -- a razao e que um valor mascarado num campo
                    // de site e lixo que a pessoa nao pediu: ela nao digitou
                    // `(11) 98765-4321` como site, digitou como telefone, e
                    // manter o texto a obriga a apagar caractere por
                    // caractere o que a tela escreveu sozinha. Deixar e
                    // recusar depois trocaria um campo vazio (que diz
                    // `Preencha o contato público.` acima dos campos) por um
                    // `400` do servidor nomeando `public_contact.value`.
                    //
                    // **Toda troca limpa, e nao so a que sai do telefone.**
                    // Uma URL de site tambem nao e um perfil de Instagram: a
                    // regra de uma linha ("o valor pertence ao tipo que o
                    // produziu") nao tem excecao a lembrar depois. Limpar na
                    // PRIMEIRA escolha nao perde nada -- o campo nasce
                    // `habilitado: tipo != null`, entao nao havia o que
                    // digitar antes de existir um tipo.
                    if (novo != _tipoDeContato) _contato.clear();
                    _tipoDeContato = novo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: tipo?.rotulo ?? 'Contato',
                  controlador: _contato,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['public_contact.value'],
                  // **O teto segue o tipo**, pelo mesmo motivo que a mascara:
                  // `(11) 98765-4321` sao 15 caracteres e a mascara nao deixa
                  // passar disso, entao um contador `0 de 120` sobre um campo
                  // de telefone mente sobre o que cabe. `limiteDoTelefone` e o
                  // mesmo valor que os outros tres campos de telefone do app
                  // declaram. Site e Instagram continuam em 120, que e o
                  // `maxLength` de `DirectorySuggestionContact.value`.
                  limite: tipo == TipoDeContatoPublico.phone
                      ? limiteDoTelefone
                      : 120,
                  // A ajuda muda com o tipo escolhido: o formato que o servidor
                  // vai conferir dito ANTES, e nao descoberto pelo 400.
                  ajuda: tipo?.exemplo ??
                      'Escolha acima como entrar em contato.',
                  tipoDeTeclado: tipo == TipoDeContatoPublico.phone
                      ? TextInputType.phone
                      : TextInputType.text,
                  // =====================================================
                  // A MASCARA ENTRA E SAI COM O TIPO (BICHUS-308)
                  // =====================================================
                  //
                  // O cliente pediu em 26/10/2026 *"mascara de telefone em
                  // todos os inputs que necessitam de telefone"*. Este era o
                  // unico que faltava: o campo JA trocava o teclado para
                  // `TextInputType.phone` quando o tipo e `phone` -- ele sabia
                  // que era telefone e nao mascarava.
                  //
                  // **Condicional e nao fixa**: este campo e o mesmo para
                  // telefone, site e Instagram. `MascaraDeTelefone` descarta
                  // tudo o que nao e digito, entao aplicada sempre ela comeria
                  // `https://` e `@` -- um campo de site que apaga o que se
                  // digita e pior que um campo sem mascara. Trocar o tipo
                  // reconstroi este `BichuField` (o seletor chama `setState`),
                  // e e por isso que a lista nova vale na hora; `BichuField` e
                  // `StatelessWidget` e repassa `formatadores` direto para
                  // `inputFormatters`.
                  //
                  // **Esta mascara e BRASILEIRA, e isso ESTREITA o campo.**
                  // `DirectorySuggestionContact.value` aceita E.164 de
                  // qualquer pais, e hoje quem digitasse `+14155550123` o
                  // mandava cru. Com a mascara nao da mais: ela descarta o `+`
                  // e corta em onze digitos. O que decidiu foi a propria
                  // ajuda do campo, que ja prometia so o Brasil
                  // (`TipoDeContatoPublico.phone.exemplo` =
                  // `'Com DDD, como +5511988887777'`) -- a tela nunca ofereceu
                  // outro pais, e o contrato nao mudou, porque `+55...`
                  // continua sendo E.164 valido para ele. **Esta e uma
                  // decisao de produto e esta relatada ao cliente**, nao um
                  // efeito colateral descoberto depois.
                  formatadores: tipo == TipoDeContatoPublico.phone
                      ? const <TextInputFormatter>[MascaraDeTelefone()]
                      : null,
                  correcaoAutomatica: false,
                  habilitado: !enviando && tipo != null,
                  // **`done` e nao `next`: e o ULTIMO campo de uma linha da
                  // tela.** O que vem depois e `Por que você indica`, que e
                  // texto corrido e nao recebe acao -- `next` aqui poria a
                  // flecha de avancar numa travessia que termina no proprio
                  // campo seguinte sem desfecho.
                  acaoDeTeclado: TextInputAction.done,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Por que você indica',
                  controlador: _recado,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['note'],
                  opcional: true,
                  linhas: 3,
                  limite: 280,
                  // **Nao e publicado**, nem se a indicacao for aprovada:
                  // avaliacao da comunidade e outro modelo, e ele nao existe
                  // (ADR-0011 secao 5.4). Dito, para ninguem escrever para o
                  // publico.
                  ajuda: 'Só quem confere lê. Não aparece na Rede.',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                  // **Sem `acaoDeTeclado`, e e decisao e nao esquecimento.**
                  // `linhas: 3` faz o Flutter usar `TextInputType.multiline`,
                  // e ali a tecla de retorno INSERE LINHA --
                  // `TextInputAction.newline` e o desfecho certo de quem
                  // escreve um paragrafo. Declarar `done` aqui tiraria a
                  // quebra de linha. Quem fecha o teclado em campo de texto
                  // corrido e a faixa `Concluir` de
                  // `widgets/barra_do_teclado.dart`, que e mecanismo de todo o
                  // app e nao desta tela.
                ),
              ],
            ),
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              // Nao repete o que a faixa acima ja disse com saida: duas
              // copias da mesma frase fazem o leitor de tela anunciar o
              // bloqueio duas vezes.
              if (impedimento != null &&
                  impedimento != _Impedimento.semEmailConfirmado &&
                  impedimento != _Impedimento.semConta)
                _MotivoDoBloqueio(
                  texto: impedimento.texto,
                  cor: cores.textPrimary,
                ),
              BotaoPrimario(
                rotulo: TelaSugerirProfissional.rotuloDeIndicar,
                critico: true,
                carregando: enviando,
                aoTocar: impedimento == null && !enviando ? _indicar : null,
              ),
            ],
          ),
        );
      },
    );
  }

  /// O recibo. **Diz que foi para conferencia, e nao que foi publicado.**
  Widget _recibo(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaSugerirProfissional.titulo,
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(
                'Obrigado pela indicação',
                style: textos.titleLarge?.copyWith(color: cores.textPrimary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            Text(
              TelaSugerirProfissional.recebido,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            // `Rede` e nao `Perto`: a secao `Perto` deixou de existir em
            // 19/10, e o diretorio virou a aba `Comunidade` da `Rede`.
            rotulo: 'Voltar para a Rede',
            critico: true,
            aoTocar: () => context.go(Rotas.rede),
          ),
        ],
      ),
    );
  }

  /// A SAIDA DA FAIXA DE ERRO: o rotulo que o servidor manda tem de levar a
  /// algum lugar.
  ///
  /// `FaixaDeAviso` so monta o `TextButton` com rotulo E callback
  /// (`widgets/faixa_de_aviso.dart`, linha 97). Devolver `null` aqui para uma
  /// `proximaAcao` que `MensagensDeErro` sabe produzir nao deixa um rotulo de
  /// acao sem destino -- o defeito que a BICHUS-62 nomeou --, deixa a faixa
  /// SEM SAIDA NENHUMA: a pessoa le o motivo e nao tem onde tocar. Por isso
  /// cada `proximaAcao` que chega nesta rota precisa do seu ramo aqui.
  ///
  /// **`verificarEmail` chega pelo `409 contact-channel-unverified`** -- a
  /// recusa do servidor para quem nao confirmou o e-mail. E uma REDE DE
  /// SEGURANCA, nao o caminho comum: a porta da indicacao ja esconde a acao de
  /// criar de quem nao esta validado (`podeCriarNaComunidade`). O que sobra e
  /// quem tinha a tela em pe quando o estado do e-mail mudou noutro aparelho --
  /// e esse ainda ve a faixa, e a faixa ainda tem de sair.
  VoidCallback? _saidaDoErro(BuildContext context, MensagemDeErro mensagem) {
    if (mensagem.acao == null) return null;
    final rota = mensagem.rotaDaAcao;
    if (rota != null) return () => context.go(rota);
    if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
      final email = Escopo.of(context).sessao.usuario?.email ?? '';
      return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
    }
    if (mensagem.proximaAcao == ProximaAcao.entrar) {
      return () => context.push(Rotas.entrar);
    }
    return null;
  }
}

/// O motivo pelo qual o botao esta desabilitado, dito em voz alta.
/// O bloco do LOGOTIPO (29/10/2026).
///
/// **IRMAO de `_BlocoDaCapa` em `rede/criar_encontro.dart`, com UMA diferenca
/// de desenho: o quadro e QUADRADO.** A capa do encontro e uma faixa 16:9 de
/// 180 dp porque a derivada dela e `card` 1024 x 576 e a tela a desenha de
/// borda a borda; a derivada do logotipo e `DERIVADAS_DA_LOGO` -- `card`
/// 512 x 512 --, e ele e desenhado num quadrado ao lado do nome. Um quadro
/// panoramico aqui prometeria um recorte que a esteira nao faz, e a logo
/// apareceria com tarja dos dois lados.
///
/// **Classe propria e nao `_BlocoDaCapa` reusado**, e a razao nao e a
/// geometria: aquele widget e privado de outro arquivo, mora na arvore de outra
/// tela e carrega os literais de `TelaCriarEncontro`. Reusa-lo exigiria
/// exporta-lo e parametrizar seis textos -- e e assim que um widget de uma tela
/// vira o widget de todas e para de poder mudar. O que de fato se reusa esta
/// uma camada abaixo e e o que importa: `PreviaDaFoto`, `CameraEGaleria`,
/// `EnvioParaConfirmarDepois` e a esteira de imagem de catalogo.
class _BlocoDoLogotipo extends StatelessWidget {
  const _BlocoDoLogotipo({
    required this.escolhido,
    required this.enviando,
    required this.permissao,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final FotoLocal? escolhido;

  /// Os bytes do LOGOTIPO estao subindo (nao a indicacao).
  final bool enviando;

  final EstadoDaPermissao permissao;
  final VoidCallback? aoTirar;
  final VoidCallback? aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// O lado do quadro, em dp.
  ///
  /// **120 e nao 180**, e o numero tem razao medida: a dimensao minima do envio
  /// e 256 x 256 (`DIMENSAO_MINIMA['directory_suggestion_logo']`), e 120 dp a
  /// 2x ja pedem 240 px -- abaixo disso o quadro mostraria menos do que a
  /// imagem mais pequena que a rota aceita. Acima de 120 o bloco empurraria o
  /// endereco para fora da primeira dobra num aparelho de 640 dp de altura, e o
  /// logotipo e o campo OPCIONAL deste formulario: ele nao pode ocupar mais
  /// espaco que a cidade e o contato, que sao obrigatorios.
  static const double ladoDoQuadro = 120;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = escolhido;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(
            TelaSugerirProfissional.tituloDoLogotipo,
            style: textos.titleMedium,
          ),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          TelaSugerirProfissional.ajudaDoLogotipo,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          child: SizedBox(
            height: ladoDoQuadro,
            // **Largura IGUAL a altura, e nao `double.infinity`.** E aqui que
            // este bloco se separa do da capa: `infinity` faria o quadro ocupar
            // a linha inteira e a logo sair esticada ou com tarja.
            width: ladoDoQuadro,
            child: local != null
                // `PreviaDaFoto` porque desenhar arquivo do aparelho pede
                // `dart:io`, e o portao estrutural o proibe dentro de
                // `lib/telas` -- com razao: foi assim que uma tela imprimiu o
                // caminho do arquivo em vez da imagem.
                ? PreviaDaFoto(
                    foto: local,
                    descricao: TelaSugerirProfissional.oLogotipoEscolhido,
                    altura: ladoDoQuadro,
                  )
                : _QuadradoSemLogotipo(cores: cores, enviando: enviando),
          ),
        ),
        const SizedBox(height: BichuEspaco.e3),
        // A ORIENTACAO DE 5 MB, uma linha, do ponto unico
        // `orientacaoDeTamanhoDaImagem`: o teto vale na politica assinada e no
        // contrato (`byte_size.maximum: 5242880`), e um texto proprio aqui seria
        // o segundo numero que divergiria do primeiro.
        Text(
          orientacaoDeTamanhoDaImagem,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaSugerirProfissional.cameraNosAjustes,
            rotuloDaAcao: TelaSugerirProfissional.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        // **Sem camera o botao SOME.** O oposto do caso acima e deliberado: ali
        // ha o que liberar e o botao ensina isso; aqui nao ha, e um botao que
        // nao leva a nada e pior que a ausencia dele. A galeria continua, e ela
        // nao tem estado de permissao proprio.
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: TelaSugerirProfissional.tirarAFoto,
            aoTocar: enviando ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: enviando ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TelaSugerirProfissional.escolherDaGaleria),
        ),
      ],
    );
  }
}

/// O lugar do logotipo quando nao ha logotipo.
///
/// Fundo afundado, borda de cabelo e o simbolo: o mesmo desenho que a imagem
/// ocuparia, dizendo que cabe uma imagem ali. **Sem frase**: o cliente mandou
/// tirar texto de apoio do app, e os dois botoes logo abaixo ja dizem o que
/// fazer.
class _QuadradoSemLogotipo extends StatelessWidget {
  const _QuadradoSemLogotipo({required this.cores, required this.enviando});

  final BichuCores cores;

  /// Os bytes estao subindo. Troca o simbolo por um indicador -- e a diferenca
  /// entre "cabe uma imagem aqui" e "a sua imagem esta subindo", dita sem uma
  /// linha de texto nova.
  final bool enviando;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: enviando
          ? const CircularProgressIndicator()
          : Icon(
              Icons.image_outlined,
              color: cores.textSecondary,
              size: 32,
            ),
    );
  }
}

class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}
