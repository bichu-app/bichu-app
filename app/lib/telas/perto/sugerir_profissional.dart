import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
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
  telefoneIncompleto('Digite DDD e número.');

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
