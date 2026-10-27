import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/busca_de_cep.dart';
import '../../formato/cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/modelos_localizacao.dart';
import '../../dispositivo/localizacao.dart';
import '../../escopo.dart';
import '../../formulario/origem_dos_valores.dart';
import '../../sessao/localizacao_da_sessao.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/seletor_de_lista.dart';
import 'antessala_de_localizacao.dart';
import 'textos_da_localizacao.dart';

/// A captura da localizacao **no ponto de uso** (BICHUS-23).
///
/// ## O que "ponto de uso" quer dizer, e o que ele exclui
///
/// A localizacao e capturada no instante em que a pessoa age, dentro da tela
/// em que ela esta agindo, e nunca em segundo plano. Nao ha servico, nao ha
/// vigia de posicao, nao ha `getPositionStream`: ha uma medicao, pedida por um
/// toque, com prazo para desistir. "Localizacao em segundo plano" e
/// "geofencing" estao em *Fora desta historia*, e a ausencia delas e o que faz
/// o escopo `Ao usar o app` do iOS ser honesto.
///
/// ## Por que esta peca e um trecho de tela, e nao uma tela
///
/// F3.1 (BICHUS-21) e F3.5 (BICHUS-35) sao as telas, e elas sao de outras
/// historias. O que a BICHUS-23 entrega e a captura que as duas embutem, num
/// lugar so: dois pontos de uso, uma implementacao. Fosse uma tela, cada uma
/// das duas teria de navegar para ela e voltar carregando o resultado, e a
/// segunda copiaria o tratamento dos cinco motivos de falha da primeira --
/// que e como as regras de permissao acabam escritas diferente em cada tela.
///
/// ## O que esta peca NUNCA faz
///
/// Converter coordenada em **bairro**, ou bairro em coordenada. ADR-0006
/// proibe as duas, e o que sustenta a proibicao nao e este comentario: e
/// `sem_geocodificacao_test.dart`, e o fato de o pacote que converte nao estar
/// no binario.
///
/// **BAIRRO, e nao "nome de lugar".** A emenda 1 do ADR-0006 abriu um sentido,
/// `coordenada -> nome de cidade`, e a peca o usa -- ver a secao das duas
/// direcoes, abaixo. Ler esta secao como "nada de coordenada vira texto" foi o
/// que fez a cidade preenchida parecer defeito em 26/10/2026.
///
/// ## O CEP, e por que ele NAO desmente o paragrafo acima
///
/// O cliente pediu em 18/10/2026 ("na pagina de avisar que encontrou um pet o
/// cep tambem nao entrou"), pela decisao dele de 17/10 -- ViaCEP em todo
/// cadastro com CEP, preenchendo o endereco e **deixando a pessoa editar**.
///
/// O CEP troca **um codigo postal por bairro, cidade e estado -- texto**, que
/// e exatamente o que a pessoa digitaria. Nenhuma latitude, nenhuma longitude:
/// ver `api/busca_de_cep.dart`, que le quatro campos e **ignora de proposito**
/// a coordenada que a BrasilAPI devolve. Geocodificar seria o contrario disto.
///
/// **As duas direcoes continuam fechadas, e e por construcao e nao por
/// cuidado:**
///
/// - o GPS escreve `_ponto` e, desde 22/10/2026, **o nome da cidade** -- e
///   **nunca** `_bairro` ou `_uf`. A fronteira nao e "o GPS nao toca em
///   texto": e a tabela da **emenda 1 do ADR-0006** (19/10/2026), que autoriza
///   um unico sentido, `coordenada -> nome de cidade`, e recusa
///   `coordenada -> bairro` em uma frase -- *"a emenda fala de cidade. Bairro e
///   mais fino que o que a pessoa escolheu entregar"*. A UF tambem nao e
///   derivada, e isso e escolha conservadora declarada em
///   [_CapturaDeLocalizacaoState._preencherACidadeDaLocalizacao], que e a
///   funcao onde isto acontece e onde a justificativa inteira mora.
///
///   **Este paragrafo dizia `so _ponto`, e ficou errado por quatro dias:** a
///   cidade entrou em 22/10/2026 e o cabecalho nao acompanhou. Em 26/10 quem
///   leu so esta secao concluiu que a cidade chegando era defeito -- era o
///   contrario, e e por isso que a linha agora nomeia o que escreve em vez de
///   dizer o que ela nao faz.
///
///   O bairro continua sendo PERGUNTADO, e e por isso que o terceiro caso
///   `OndeComPontoEArea` existe: a tela pede o bairro em vez de deduzi-lo;
/// - o CEP escreve `_bairro`, `_cidade` e `_uf`, e **so** eles. Ele nunca
///   escreve `_ponto`, nao o apaga e nao o move.
///
/// Os dois nao disputam o mesmo campo, entao nao ha o que sobrescrever em
/// nenhum dos dois sentidos. E dentro dos tres campos de texto vale a regra do
/// utilitario: **so campo vazio recebe**, o que a pessoa digitou fica.
///
/// **O CEP nao viaja no corpo.** `Area` do contrato aceita `city`,
/// `neighborhood` e `state` -- os tres que o CEP preenche --, e nada mais: o
/// CEP serve para a pessoa nao digitar os tres. Guardar o codigo postal do
/// lugar onde um animal foi achado seria **mais** precisao que bairro e
/// cidade, que e o teto do ADR-0010 para superficie publica.
///
/// **E ele nao pode travar `Registrar`.** Nao entra em
/// `ImpedimentoDeRegistrar`, nao entra em `montarOnde` e nenhum desfecho da
/// busca marca campo ou desabilita botao. Quem esta com um animal na rua nao
/// fica preso num formulario porque um servico gratuito caiu.
///
/// ## Nada e guardado no aparelho
///
/// Localizacao e dado pessoal, e esta peca **nao persiste nada**: o ponto vive
/// no estado deste widget e morre com ele. Por isso nao ha entrada em
/// `limpezasAoSair` -- nao ha o que limpar, e uma entrada que limpa nada
/// passaria a ideia de que ha.
///
/// O rascunho local que sobrevive ao app fechar e o criterio 5 da BICHUS-35, e
/// ele e daquela historia. Quem o construir precisa registrar a limpeza,
/// porque ai vai passar a haver o que limpar. O portao
/// `nada_de_localizacao_no_disco_test.dart` reprova se esta peca comecar a
/// gravar antes disso.
class CapturaDeLocalizacao extends StatefulWidget {
  const CapturaDeLocalizacao({
    required this.pontoDeUso,
    required this.aoMudar,
    super.key,
    this.prazoDaMedicao = const Duration(seconds: 12),
  });

  final PontoDeUsoDaLocalizacao pontoDeUso;

  /// Chamado a cada mudanca do "onde", inclusive com `null`.
  ///
  /// `null` significa "ainda nao da para enviar" -- sem ponto e sem cidade. A
  /// tela de cima usa isso para habilitar o envio, e **nunca** para mostrar
  /// bloqueio: falta de coordenada nao bloqueia nada (criterio 12).
  final ValueChanged<Onde?> aoMudar;

  /// Quanto tempo esperar o aparelho fixar antes de desistir.
  ///
  /// Doze segundos por escolha, nao por medicao: e o tempo em que uma pessoa
  /// parada na rua ainda esta esperando, e nao o tempo em que o GPS costuma
  /// fixar a frio (que e maior). Desistir e barato aqui -- o campo de bairro
  /// esta a um toque, e `Tentar de novo` continua oferecido.
  final Duration prazoDaMedicao;

  @override
  State<CapturaDeLocalizacao> createState() => _CapturaDeLocalizacaoState();
}

enum _Fase { escolhendo, capturando, comPonto, digitando }

class _CapturaDeLocalizacaoState extends State<CapturaDeLocalizacao> {
  _Fase _fase = _Fase.escolhendo;
  PontoCapturado? _ponto;
  MotivoDeNaoTerPonto? _motivo;

  /// **Campo de busca, e nao campo do `Onde`.** Mora no estado desta peca pelo
  /// mesmo motivo dos outros dois controladores: e o que faz o que foi
  /// digitado sobreviver ao vai e volta entre os dois passos do formulario de
  /// achado (`IndexedStack`, que mantem os dois filhos montados).
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final FocusNode _focoDoBairro = FocusNode();

  /// O que a ultima busca de CEP devolveu, so para a linha de texto embaixo do
  /// campo. **Nunca desabilita nada.**
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  /// AS CHAVES DOS TRES CAMPOS do `Onde`, para [OrigemDosValores].
  ///
  /// Texto solto repetido em cinco lugares erra no sexto, e o erro e silencioso
  /// -- uma chave torta faz o campo nunca ser reconhecido como "cedido", e o
  /// preenchimento simplesmente nao acontece.
  static const String _chaveBairro = 'bairro';
  static const String _chaveCidade = 'cidade';
  static const String _chaveUf = 'uf';

  /// DE ONDE VEIO O VALOR DE CADA CAMPO -- o mecanismo COMPARTILHADO, e nao um
  /// segundo.
  ///
  /// `formulario/origem_dos_valores.dart`, o mesmo que
  /// `tela_solicitar_plaquinha.dart` e `tela_endereco_de_entrega.dart` usam.
  /// Ele reconcilia duas decisoes do cliente que, juntas e sem ele, se matam:
  ///
  /// - **17/10/2026**: a busca de CEP *"so preenche campo vazio -- o que a
  ///   pessoa ja escreveu vence"*;
  /// - **22/10/2026**, nesta tela: *"quando o usuario autoriza a localizacao ao
  ///   encontrar um pet, voce deve preencher o formulario com as informacoes,
  ///   para caso o usuario queira corrigir ou alterar [...] apenas como uma
  ///   facilidade para ele nao ter que preencher todos os campos"*.
  ///
  /// **Esta tela tinha o `_preencherSeVazio` dela, e era a armadilha exata que
  /// aquele arquivo existe para resolver:** lido como `isEmpty` puro, um
  /// formulario que nasce preenchido nunca tem campo vazio, e a busca de CEP
  /// deixa de preencher qualquer coisa para sempre. Quem acha um animal, digita
  /// o CEP do lugar e fica com a cidade da LOCALIZACAO na tela nao tem como
  /// saber que o CEP foi ignorado.
  ///
  /// A separacao, entao: o que a **localizacao** (ou a regiao do tutor) trouxe
  /// **cede** ao CEP; o que a **pessoa** digitou **vence**. Um campo sai de
  /// "cedido" no primeiro toque dela nele.
  final OrigemDosValores _origem = OrigemDosValores();

  /// A sigla escolhida na lista de estados, ou nulo.
  ///
  /// **Campo de estado, e nao `TextEditingController`** (cliente, 17/10/2026):
  /// o estado passou a ser escolha numa lista de 27, e nao sigla digitada. O
  /// que viaja continua sendo a SIGLA -- `Area.state` do contrato e de dois
  /// caracteres, e o rotulo longo e so o que a pessoa le.
  ///
  /// Mora aqui, no estado desta peca, pelo mesmo motivo dos dois
  /// controladores: e o que faz a escolha sobreviver ao vai e volta entre os
  /// dois passos do formulario.
  String? _uf;

  @override
  void initState() {
    super.initState();
    for (final c in <TextEditingController>[_bairro, _cidade]) {
      c.addListener(_publicar);
    }
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[_bairro, _cidade]) {
      c
        ..removeListener(_publicar)
        ..dispose();
    }
    // Sem `removeListener`: o CEP nao publica `Onde` nenhum, porque ele nao e
    // campo do `Onde` -- ele preenche os tres que sao.
    _cep.dispose();
    _focoDoBairro.dispose();
    super.dispose();
  }

  AreaDigitada? get _area => AreaDigitada.montar(
        cidade: _cidade.text,
        bairro: _bairro.text,
        uf: _uf,
      );

  /// A pessoa comecou a descrever a area e deixou a cidade de fora.
  ///
  /// O erro aparece por ESTE sinal, e nao depois de um envio recusado: quem
  /// digitou o bairro ja disse que esta preenchendo a area, e a cidade e o
  /// unico campo que o contrato exige (`Area.required: [city]`). Esperar o
  /// envio para dizer isso manda a pessoa de volta a um campo que ela acabou
  /// de passar.
  ///
  /// Campo vazio antes de qualquer digitacao NAO e erro: a tela nao acusa
  /// quem ainda nao comecou.
  bool get _faltaACidade =>
      _cidade.text.trim().isEmpty &&
      (_bairro.text.trim().isNotEmpty || _uf != null);

  void _publicar() {
    widget.aoMudar(montarOnde(ponto: _ponto, area: _area));
  }

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
  ///
  /// 1. **so campo vazio recebe.** O que a pessoa escreveu vence o que a base
  ///    devolve: ela esta olhando o lugar, e a base erra;
  /// 2. **tudo continua editavel**, inclusive depois da busca;
  /// 3. **nada aqui impede `Registrar`.** Nenhum caminho desta funcao marca
  ///    erro, nem toca em `_ponto`, nem muda o que `montarOnde` devolve, a nao
  ///    ser pelo lado bom: uma cidade preenchida faz o `Onde` existir onde
  ///    antes nao existia.
  ///
  /// `logradouro` e **descartado**: nao ha campo de rua aqui e nao deve haver.
  /// O que sai em superficie publica para quem procura um animal e bairro e
  /// cidade (ADR-0010), e a rua de onde um cao foi achado nao e endereco de
  /// ninguem para ficar guardado.
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
      // **`_ponto` nao e tocado aqui, em nenhum ramo.** Se a pessoa deu a
      // localizacao, ela continua valendo e o CEP so acrescenta o rotulo de
      // area que a coordenada nao tem -- que e o caso `OndeComPontoEArea`.
      // `daBusca` e nao `doGuardado`: o CEP SUBSTITUI o que a localizacao e a
      // regiao trouxeram, e **nao** substitui o que a pessoa digitou. E a
      // reconciliacao de `OrigemDosValores`, e sem ela nada seria preenchido
      // num formulario que nasce cheio.
      _origem.daBusca(_bairro, endereco.bairro, _chaveBairro);
      _origem.daBusca(_cidade, endereco.cidade, _chaveCidade);
      final ufDaBusca = siglaDeEstadoValida(endereco.uf);
      if (ufDaBusca != null &&
          _origem.podeVirDaBusca(_chaveUf, vazio: _uf == null)) {
        _uf = ufDaBusca;
        _origem.anotarDaConta(_chaveUf, temValor: false);
      }
    });
    // Fora do `setState`: os controladores ja notificam `_publicar` ao mudar,
    // mas `_uf` nao -- e sem esta chamada uma UF preenchida pelo CEP ficaria
    // na tela sem entrar no `Onde`.
    _publicar();
  }



  /// A regiao de referencia do tutor nos campos que estao VAZIOS.
  ///
  /// **Tres telas ja faziam isto e esta nao** (`perdido/tela_onde_e_quando`,
  /// `rede/criar_encontro`, `perto/sugerir_profissional`): a regiao que o
  /// tutor cadastrou (BICHUS-92) e texto -- bairro, cidade e UF -- e nao
  /// coordenada virada em nome, porque o ADR-0006 proibe geocodificacao. Quem
  /// acha um animal acha, na maior parte das vezes, perto de casa, e o campo
  /// abria vazio para quem o app ja sabe onde mora.
  ///
  /// **Ela roda ao ENTRAR NA FASE DE DIGITAR, e nao na montagem**, e a
  /// diferenca e de dado e nao de estilo:
  ///
  /// - na fase `escolhendo` os campos nao estao na tela. Preencher ali faria
  ///   `Onde` passar a existir -- e `Registrar` a destravar -- com uma area
  ///   que a pessoa nunca viu;
  /// - na fase `comPonto` ha coordenada do aparelho. O bairro do TUTOR nao e o
  ///   bairro onde o animal foi achado, e escreve-lo ao lado de um ponto medido
  ///   poria rotulo errado num caso que tem o certo. Derivar a area do ponto e
  ///   o que o ADR-0006 proibe, e inventa-la da ficha do tutor seria pior.
  ///
  /// Na fase `digitando` a pergunta e exatamente "onde foi", a resposta esta
  /// na tela, editavel, antes de qualquer envio -- que e a mesma forma das
  /// outras tres telas.
  void _preencherDaRegiaoDeReferencia() {
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao == null) return;
    _origem.doGuardado(_bairro, regiao.bairro ?? '', _chaveBairro);
    _origem.doGuardado(_cidade, regiao.cidade ?? '', _chaveCidade);
    // **So sigla que esta NA LISTA.** `Me.reference_area.state` e
    // `maxLength: 2` sem `pattern`: `SA` e `XX` cabem nele. Ver
    // `siglaDeEstadoValida`.
    final ufDaRegiao = siglaDeEstadoValida(regiao.uf);
    if (ufDaRegiao != null && _uf == null) {
      _uf = ufDaRegiao;
      _origem.anotarDaConta(_chaveUf, temValor: true);
    }
  }

  /// A linha que conta o que a busca fez. **Nenhum destes estados e erro.**
  Widget _linhaDaBuscaDoCep() {
    if (_buscandoOCep) {
      return Semantics(
        liveRegion: true,
        child: const Text(TextosDaLocalizacao.buscandoOCep),
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => TextosDaLocalizacao.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel =>
        TextosDaLocalizacao.buscaDoCepIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto);
  }

  /// O caminho de `Usar minha localizacao`.
  ///
  /// A antessala so aparece quando o dialogo do sistema **ainda abre**. Depois
  /// de respondido em definitivo, mostra-la seria pedir contexto para uma
  /// pergunta que nao vai ser feita: no iOS `requestPermission` nao reabre
  /// nada.
  ///
  /// **`negada` entra aqui junto com `naoPedida`, e isso custou o defeito do
  /// cliente de 17/10/2026.** No Android nao existe "nunca perguntei":
  /// `checkPermission()` devolve `denied` tanto para quem nunca viu o dialogo
  /// quanto para quem negou uma vez, e `LocationPermission.denied` vira
  /// `PermissaoDeLocalizacao.negada`. Com a condicao antiga,
  /// `PermissaoDeLocalizacao.naoPedida` era **inalcancavel no aparelho**: a
  /// antessala nunca aparecia, `pedir()` nunca era chamado, o dialogo do
  /// sistema nunca abria, e o botao respondia "Tudo bem. Diga o bairro e a
  /// cidade" para sempre -- sem a pessoa ter como conceder nada.
  ///
  /// Quem **ja negou em definitivo** continua fora: ali o dialogo nao reabre
  /// em nenhuma das duas plataformas, e o caminho e os ajustes do sistema.
  Future<void> _usarALocalizacao() async {
    final porta = Escopo.of(context).localizacao;
    var permissao = await porta.estado();
    if (!mounted) return;

    if (permissao == PermissaoDeLocalizacao.naoPedida ||
        permissao == PermissaoDeLocalizacao.negada) {
      final resposta = await AntessalaDeLocalizacao.mostrar(
        context,
        pontoDeUso: widget.pontoDeUso,
      );
      if (!mounted) return;
      if (resposta == RespostaDaAntessala.digitarOBairro) {
        _irParaODigitado(null);
        return;
      }
      permissao = await porta.pedir();
      if (!mounted) return;
    }

    setState(() => _fase = _Fase.capturando);
    anunciar(context, TextosDaLocalizacao.capturando);

    final resultado = await porta.pontoAproximado(prazo: widget.prazoDaMedicao);
    if (!mounted) return;

    switch (resultado) {
      case CapturaComPonto(:final ponto):
        setState(() {
          _ponto = ponto;
          _motivo = null;
          _fase = _Fase.comPonto;
        });
        _publicar();
        // **A TELA NAO ESPERA POR ISTO**, e e de proposito: os campos ja estao
        // na tela, editaveis, e o ponto ja basta para `Registrar`. A cidade
        // chega depois e cai num campo vazio -- ou nao cai, se a pessoa comecou
        // a digitar nesse meio-tempo.
        unawaited(_preencherACidadeDaLocalizacao());
      case CapturaSemPonto(:final motivo):
        _irParaODigitado(motivo);
    }
  }

  /// A CIDADE DA LOCALIZACAO AUTORIZADA, nos campos que estao vazios.
  ///
  /// Decisao do cliente, 22/10/2026: *"quando o usuario autoriza a localizacao
  /// ao encontrar um pet, voce deve preencher o formulario com as informacoes,
  /// para caso o usuario queira corrigir ou alterar, nessa pagina, vamos
  /// utilizar apenas como uma facilidade para ele nao ter que preencher todos
  /// os campos"*.
  ///
  /// ## SO A CIDADE, e a ausencia do bairro e o ADR, nao desleixo
  ///
  /// ADR-0006, **emenda 1** (19/10/2026): o unico sentido autorizado e
  /// **coordenada -> nome de cidade**, e a tabela do que ela **nao** autoriza e
  /// explicita em duas linhas que decidem esta funcao:
  ///
  /// - **coordenada -> bairro**: *"a emenda fala de cidade. Bairro e mais fino
  ///   que o que a pessoa escolheu entregar"*. Entao o bairro continua sendo o
  ///   campo que a PESSOA preenche, e o texto acima dos campos ja diz isso;
  /// - **coordenada -> endereco ou rua**: nao ha campo de rua aqui, e nao deve
  ///   haver.
  ///
  /// A UF tambem **nao** e derivada, e isso e uma escolha conservadora
  /// declarada: a emenda e uma frase sobre o **nome da cidade**, e alargar uma
  /// decisao do cliente por conta propria nao e trabalho meu. O campo continua
  /// opcional (`Area.required: [city]`), e a lista de 27 esta a um toque.
  ///
  /// ## Nada de coordenada fica, e nada de coordenada aparece
  ///
  /// Esta funcao escreve **texto** num `TextEditingController`. A coordenada
  /// nasce e morre dentro da porta; `lat`/`lon` nao entram em campo nenhum, nao
  /// sao mostrados e nao vao para disco.
  ///
  /// ## O teto, e por que nao e um `try`
  ///
  /// Ela chama `LocalizacaoDaSessao.cidade`, que ja tem
  /// [tetoDaEsperaDaCidade] por cima -- e **um `Future` que nunca completa nao
  /// lanca**, entao `catch` aqui nao cobriria o canal de plataforma pendurado.
  /// Como a sessao guarda o que ja resolveu, a secao que a pessoa abriu antes
  /// costuma ter pago esta medicao: aqui ela volta sem tocar no aparelho.
  Future<void> _preencherACidadeDaLocalizacao() async {
    final resultado = await Escopo.of(context).localizacaoDaSessao.cidade();
    if (!mounted) return;
    if (resultado is! CidadeResolvida) return;
    // `doGuardado` e nao atribuicao: campo JA ESCRITO fica. **O que a pessoa
    // digitou vence** (cliente, 17/10/2026) -- e durante os segundos da
    // medicao ela pode muito bem ter digitado a cidade. E o campo fica marcado
    // como "cedido", para a busca de CEP ainda poder corrigi-lo.
    final preencheu = _origem.doGuardado(
      _cidade,
      resultado.cidade,
      _chaveCidade,
    );
    if (!preencheu) return;
    // O controlador notifica `_publicar` ao mudar, mas o `setState` e o que
    // repinta o rotulo e o erro deste campo.
    setState(() {});
  }

  /// Vai para o campo de bairro **com o teclado aberto** (criterio 5), **a nao
  /// ser que o bairro ja venha preenchido**.
  ///
  /// O foco e pedido depois do quadro em que o campo passa a existir: pedir
  /// foco a um `FocusNode` que ainda nao esta montado nao abre teclado nenhum,
  /// e o defeito e silencioso -- a tela fica certa e o teclado nao sobe.
  ///
  /// **O criterio 5 escreve a condicao dele junto com a consequencia**: *"sem
  /// autorizacao, o campo fica VAZIO com o teclado aberto"*. Teclado sobre um
  /// campo que [_preencherDaRegiaoDeReferencia] acabou de preencher nao e o
  /// criterio: e teclado sem nada a digitar, cobrindo metade da tela de quem
  /// so precisa conferir o bairro e seguir. O caso de bairro vazio -- que e o
  /// de quem nao tem conta ou nao cadastrou regiao -- continua abrindo o
  /// teclado, e e ele que o caso do criterio 5 mede.
  void _irParaODigitado(MotivoDeNaoTerPonto? motivo) {
    setState(() {
      _ponto = null;
      _motivo = motivo;
      _fase = _Fase.digitando;
      // Antes do `_publicar` abaixo: assim o `Onde` que sai daqui ja leva a
      // area preenchida, em vez de sair vazio e ser corrigido no quadro
      // seguinte pelos escutadores dos controladores.
      _preencherDaRegiaoDeReferencia();
    });
    _publicar();
    if (_bairro.text.trim().isNotEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focoDoBairro.requestFocus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ..._conteudoDaFase(),
      ],
    );
  }

  List<Widget> _conteudoDaFase() {
    switch (_fase) {
      case _Fase.escolhendo:
        return <Widget>[
          // **O QUE CADA CAMINHO PREENCHE, dito antes do toque.**
          //
          // Esta linha nasceu de um relato que NAO era defeito (cliente,
          // 26/10/2026: *"quando eu seleciono a localizacao, ele ta trazendo
          // apenas a cidade, mas nao o cep, bairro e estado preenchidos"*). O
          // comportamento esta certo -- ver a secao do ADR-0006 no cabecalho --,
          // e o que faltava era a tela nao deixar a pessoa formar a expectativa
          // errada.
          //
          // **ANTES dos botoes, e nao depois**, e e por isso que ela esta nesta
          // fase e nao na `comPonto`: depois do toque a pessoa ja comparou o que
          // esperava com o que veio e ja concluiu que faltou algo. A frase da
          // `comPonto` (`bairroOpcionalComGps`) continua onde esta e faz outra
          // coisa -- ela pede o bairro; esta aqui diz de onde cada campo vem.
          //
          // Texto comum, e nao `FaixaDeAviso`: nao ha nada a avisar. Uma faixa
          // com icone poria aparencia de problema no caminho de quem ainda nao
          // fez nada, e esta tela e a de quem esta com um animal na rua.
          Text(
            TextosDaLocalizacao.oQueCadaCaminhoPreenche,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          BotaoPrimario(
            rotulo: TextosDaLocalizacao.usarMinhaLocalizacao,
            aoTocar: _usarALocalizacao,
          ),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.preferoDigitarOBairro),
          ),
        ];

      case _Fase.capturando:
        return <Widget>[
          Semantics(
            liveRegion: true,
            child: Row(
              children: <Widget>[
                const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: BichuEspaco.e4),
                Expanded(child: Text(TextosDaLocalizacao.capturando)),
              ],
            ),
          ),
        ];

      case _Fase.comPonto:
        final precisao = _ponto?.precisaoEmMetros;
        return <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: precisao == null
                ? TextosDaLocalizacao.pontoSemPrecisao
                : TextosDaLocalizacao.pontoComPrecisao(
                    _arredondarPrecisao(precisao),
                  ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          // O bairro opcional JUNTO com o GPS: o caminho conservador da
          // pergunta que foi para a pauta de refinamento. Sem ele, quem
          // concede a localizacao aparece na lista publica sem rotulo de area,
          // porque derivar o bairro da coordenada e o que o ADR-0006 proibe.
          Text(TextosDaLocalizacao.bairroOpcionalComGps),
          const SizedBox(height: BichuEspaco.e4),
          // Os TRES campos, e nao so o bairro.
          //
          // Custou um caso reprovando para ficar claro, e o defeito era
          // silencioso: com so o bairro na tela, quem digitasse "Vila
          // Madalena" nao produzia area nenhuma -- `Area.required: [city]` no
          // contrato, entao sem cidade nao ha area, e o rotulo que a pessoa
          // acabou de escrever era descartado sem aviso. Ela veria o bairro no
          // campo e ele nao chegaria a lista publica.
          //
          // Opcionais os tres: quem so quer o alerta de 5 km nao precisa
          // digitar nada, e o ponto ja basta para o caso existir.
          ..._camposDeArea(comFoco: false),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.trocarPeloBairro),
          ),
        ];

      case _Fase.digitando:
        return <Widget>[
          if (_motivo != null) ...<Widget>[
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _fraseDoMotivo(_motivo!),
              rotuloDaAcao: _rotuloDaAcaoDoMotivo(_motivo!),
              aoTocarNaAcao: _acaoDoMotivo(_motivo!),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          ..._camposDeArea(comFoco: true),
        ];
    }
  }

  /// CEP, bairro, cidade e estado, na mesma ordem nas duas fases.
  ///
  /// O CEP e **campo de busca** e nao campo do `Onde`: ele existe para
  /// preencher os tres seguintes, e nao viaja no corpo. Ver o cabecalho.
  ///
  /// Uma lista so, e nao duas copias: as duas fases mostram os mesmos campos
  /// e mudam apenas o que vem ANTES deles (a explicacao da captura, ou
  /// a faixa do motivo) e se o teclado abre. Duas copias divergiriam na
  /// primeira mudanca, e a que divergiria e a menos exercitada.
  ///
  /// [comFoco] so vale para a fase em que a pessoa CAI no campo sem ter
  /// pedido: criterio 5, "com o teclado aberto". Na fase com ponto o teclado
  /// nao sobe sozinho -- ela ja tem o que precisava e pode nao querer digitar
  /// nada.
  List<Widget> _camposDeArea({required bool comFoco}) => <Widget>[
        // **O CEP vem ANTES dos tres campos que ele preenche**, e a ordem e o
        // proprio recurso: quem digita o CEP nao digita o resto. Opcional, e
        // fora do caminho que destrava `Registrar` -- ele nao entra em
        // `montarOnde` e nao e campo do `Onde`.
        //
        // **Nao recebe o foco automatico**, nem na fase em que a pessoa cai
        // nos campos sem ter pedido: o criterio 5 manda abrir o teclado no
        // BAIRRO, e trocar o destino do foco por este campo mudaria aquele
        // criterio de lugar sem ninguem ter decidido.
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloCep,
          controlador: _cep,
          opcional: true,
          // 9 e nao 8: o `maxLength` conta o hifen da mascara.
          limite: limiteDoCep,
          tipoDeTeclado: TextInputType.number,
          ajuda: TextosDaLocalizacao.ajudaDoCep,
          // **A mascara FORMATA e nao valida** (cliente, 18/10), e aqui essa
          // distincao e a regra sagrada da tela: CEP incompleto **nao pode
          // travar `Registrar`**. `MascaraDeCep` nunca recusa, nunca marca
          // erro e nunca desabilita botao -- ela so descarta o que nao e
          // digito. E nada daqui viaja: `Area` do contrato nao tem
          // `postal_code`, e o CEP deste formulario e so busca.
          formatadores: const <TextInputFormatter>[
            MascaraDeCep(),
          ],
          correcaoAutomatica: false,
          // No oitavo digito a busca sai sozinha, sem botao `Buscar`.
          aoMudar: (_) => _buscarOCep(),
        ),
        if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          _linhaDaBuscaDoCep(),
        ],
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloBairro,
          controlador: _bairro,
          foco: comFoco ? _focoDoBairro : null,
          opcional: true,
          capitalizacao: TextCapitalization.words,
          // **O TOQUE DA PESSOA SOLTA O CAMPO**, e sem isto o mecanismo
          // compartilhado fica pela metade: um campo que a localizacao (ou a
          // regiao do tutor) preencheu continua marcado como "cedido", e a
          // busca de CEP passaria por cima do que a PESSOA acabou de corrigir
          // ali -- a decisao de 17/10/2026 ao contrario. A mesma ligacao de
          // `tela_solicitar_plaquinha.dart` e `tela_endereco_de_entrega.dart`.
          aoMudar: (_) => _origem.soltar(_chaveBairro),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloCidade,
          controlador: _cidade,
          // **"(opcional)" so quando ela E opcional** (cliente, 17/10/2026).
          //
          // Sem ponto, a cidade e o UNICO campo desta peca que faz o "onde"
          // existir (`Area.required: [city]`), e portanto o unico que destrava
          // o envio -- e a tela a rotulava "(opcional)" junto dos outros dois.
          // O resultado medido no emulador: formulario inteiro preenchido,
          // tres campos marcados como dispensaveis, e o botao morto. Com
          // ponto a cidade volta a ser mesmo opcional, porque ai o "onde" ja
          // existe sem ela -- e o rotulo acompanha, em vez de mentir nos dois
          // sentidos.
          opcional: _ponto != null,
          capitalizacao: TextCapitalization.words,
          erro: _faltaACidade ? TextosDaLocalizacao.cidadeObrigatoria : null,
          // Ver o campo de bairro, acima: o toque da pessoa solta o campo.
          aoMudar: (_) => _origem.soltar(_chaveCidade),
        ),
        const SizedBox(height: BichuEspaco.e4),
        // **Lista de 27, e nao sigla digitada** (cliente, 17/10/2026). Quem
        // acha um animal numa cidade que nao e a sua nao tem por que saber a
        // sigla, e "SAO" ou "S.P." digitados nao sao recusados pelo contrato
        // (`Area.state` e so "dois caracteres") -- eles chegam gravados
        // errados. A lista mostra o NOME e guarda a sigla.
        //
        // Continua opcional, e o rotulo diz a verdade: quem exige o `onde` e
        // a CIDADE, e so ela (`Area.required: [city]`).
        SeletorDeLista(
          rotulo: TextosDaLocalizacao.rotuloEstado,
          estadoInicial: TextosDaLocalizacao.escolherOEstado,
          itens: estadosBrasileiros,
          selecionado: _uf,
          // Opcional dito em TEXTO, do mesmo jeito que raca e cor: o seletor
          // nao tem "(opcional)" no rotulo, e inventar um aqui so para este
          // campo deixaria dois formatos de "pode ficar vazio" na mesma tela.
          ajuda: TextosDaLocalizacao.estadoEmBrancoFunciona,
          aoSelecionar: (codigo) {
            setState(() {
              _uf = codigo;
              // Escolher a UF a mao solta o campo, como o toque num campo de
              // texto: dali em diante o valor e dela e o CEP nao o troca.
              _origem.soltar(_chaveUf);
            });
            _publicar();
          },
        ),
      ];

  /// Arredonda para cima, em centenas de metros.
  ///
  /// "cerca de 380 m" sugere uma medicao que a propria medicao nao sustenta; o
  /// numero que o aparelho devolve e ele mesmo uma estimativa. Para cima, e
  /// nao para o mais proximo, porque errar para o lado de prometer menos
  /// precisao e o lado seguro.
  static int _arredondarPrecisao(double metros) {
    if (metros <= 0) return 100;
    return (metros / 100).ceil() * 100;
  }

  String _fraseDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegada =>
          TextosDaLocalizacao.negouDestaVez,
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente =>
          TextosDaLocalizacao.negouEmDefinitivo,
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.servicoDesligado,
        MotivoDeNaoTerPonto.semFixNoPrazo => TextosDaLocalizacao.semFixNoPrazo,
        MotivoDeNaoTerPonto.indisponivel => TextosDaLocalizacao.indisponivel,
      };

  /// So dois dos cinco motivos tem acao, e os outros tres nao ganham uma de
  /// enfeite: um botao que nao muda nada e pior que nenhum botao.
  String? _rotuloDaAcaoDoMotivo(MotivoDeNaoTerPonto motivo) =>
      switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.abrirAjustes,
        // **`permissaoNegada` ganhou acao, e e o unico motivo que MUDOU de
        // lado.** Negar uma vez e o estado mais recuperavel dos cinco: o
        // dialogo do sistema ainda abre. Sem o botao, a pessoa que tocou em
        // "Nao permitir" por engano nao tinha caminho de volta nesta tela --
        // e so descobriria o caminho desinstalando o app.
        MotivoDeNaoTerPonto.semFixNoPrazo ||
        MotivoDeNaoTerPonto.permissaoNegada =>
          TextosDaLocalizacao.tentarDeNovo,
        // `indisponivel` continua sem acao, e continua certo: nao ha o que
        // tentar de novo num aparelho sem localizacao. Botao que nao muda
        // nada e pior que nenhum botao.
        MotivoDeNaoTerPonto.indisponivel => null,
      };

  VoidCallback? _acaoDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          () => Escopo.of(context).localizacao.abrirAjustesDoSistema(),
        MotivoDeNaoTerPonto.semFixNoPrazo ||
        MotivoDeNaoTerPonto.permissaoNegada =>
          _usarALocalizacao,
        MotivoDeNaoTerPonto.indisponivel => null,
      };
}
