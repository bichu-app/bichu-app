import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/api_client.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/imagem_do_qr.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../dispositivo/oportunidades_de_aviso.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../avisos/antessala_de_aviso.dart';
import '../avisos/pedido_de_aviso.dart';
import 'resultado_do_cadastro.dart';
import 'textos_do_cadastro.dart';

/// F1.6 — Pet cadastrado / QR gerado. Figma `91:72`.
///
/// **Esta e a unica tela do produto em que o codigo da tag existe por
/// extenso.** O contrato e explicito: `POST /v1/pets/{petId}/tags` devolve
/// `code` e `url` uma vez, na emissao, e `GET /v1/pets/{petId}/tags` nunca
/// mais devolve o codigo em claro, **nem para o dono** -- so `code_suffix`, os
/// quatro ultimos caracteres. Isso nao e detalhe de implementacao: e o que
/// decide o que esta tela pode prometer, e e por isso que ela **diz**, com o
/// codigo ainda na tela, que aquele e o unico lugar em que ele aparece
/// inteiro.
///
/// O codigo vive na memoria desta tela e morre com ela. Nao vai para disco,
/// nao vai para o chaveiro e nao vai para log alguma: o contrato manda o
/// cliente nao persistir o valor, e "persistir" inclui a linha de depuracao
/// que alguem deixa para tras.
///
/// **A tela nao mostra QR nenhum enquanto nao houver codigo.** Um QR de enfeite
/// aqui vira uma plaquinha impressa que nao resolve, e quem a imprimiu so
/// descobre no dia em que precisar dela.
class TelaPetCadastrado extends StatefulWidget {
  const TelaPetCadastrado({required this.resultado, super.key});

  final ResultadoDoCadastro resultado;

  @override
  State<TelaPetCadastrado> createState() => _TelaPetCadastradoState();
}

class _TelaPetCadastradoState extends State<TelaPetCadastrado> {
  /// A mesma chave em toda tentativa de emitir a tag desta tela: `Tentar de
  /// novo` depois de um tempo esgotado **nao** pode emitir uma segunda tag.
  final String _chaveDeIdempotencia = ApiClient.novaChaveDeIdempotencia();

  TagEmitida? _tag;
  bool _emitindo = true;
  MensagemDeErro? _faixa;

  /// Em qual dos quatro estados a IMAGEM do QR esta. Separado de [_faixa] de
  /// proposito: a faixa fala da emissao da tag, e uma imagem que nao carregou
  /// nao e um problema da tag. O aviso mora onde o QR moraria.
  _EstadoDoQr _estadoDoQr = _EstadoDoQr.semEndereco;

  /// O provedor que o `Image` desenha. Ele vem do cofre, e o cofre e do
  /// escopo: quem o esvazia no logout e a lista `limpezasAoSair`, e nao esta
  /// tela. Ver [CofreDaImagemDoQr].
  MemoryImage? _qr;

  /// Em qual dos quatro estados o ENVIO DA FOTO esta.
  ///
  /// Separado de [_faixa] e de [_estadoDoQr] pela mesma razao que separa
  /// aqueles dois: a faixa fala da emissao da tag, o QR fala da imagem, e a
  /// foto e um terceiro assunto que nao pode derrubar nenhum dos outros. O
  /// cadastro esta feito nos quatro.
  late _EstadoDaFoto _estadoDaFoto = widget.resultado.fotoPendente == null
      ? _EstadoDaFoto.semFoto
      : _EstadoDaFoto.subindo;

  Pet get _pet => widget.resultado.pet;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _emitir();
    // **Em paralelo com a emissao da tag, e nao depois dela.** F1.4 prometeu
    // que o envio da foto nao bloqueia o avanco, e encadear as duas faria a
    // foto esperar o QR -- ou, pior, nunca sair quando a emissao falhasse.
    // Nenhuma das duas depende do resultado da outra.
    _enviarAFoto();
  }

  /// **O envio que nao existia.** Ate 22/09/2026 nenhum caminho do app mandava
  /// bytes para lugar nenhum: `PetsApi.intencaoDeFotoDoPet` estava escrita
  /// desde a BICHUS-62 e nunca era chamada, e esta tela ja anunciava "a foto
  /// ainda esta sendo enviada" sobre um envio inexistente.
  ///
  /// A foto sobe **aqui**, e nao em F1.5, porque a autorizacao de upload exige
  /// o `pet_id` -- que so existe depois do cadastro. E e esta tela que recebe
  /// [ResultadoDoCadastro.fotoPendente] por causa disso.
  Future<void> _enviarAFoto() async {
    final foto = widget.resultado.fotoPendente;
    if (foto == null) return;

    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    //
    // `RetomadaDeFotos`, e nao `EnvioDeFoto` direto: e ela que guarda a foto
    // no registro quando falta sinal (criterio 6) e a tira de la quando ela
    // sobe. Chamar o mecanismo cru aqui faria esta tela ser a unica das tres
    // que nao lembra, e a foto sumiria ao fechar o app.
    final retomada = Escopo.of(context).retomadaDeFotos;

    if (mounted) setState(() => _estadoDaFoto = _EstadoDaFoto.subindo);

    final desfecho = await retomada.enviarDoPet(petId: _pet.id, foto: foto);
    if (!mounted) return;
    setState(() {
      _estadoDaFoto = switch (desfecho) {
        DesfechoDoEnvio.enviada => _EstadoDaFoto.enviada,
        DesfechoDoEnvio.semSinal => _EstadoDaFoto.semSinal,
        DesfechoDoEnvio.recusada => _EstadoDaFoto.recusada,
      };
    });
  }

  Future<void> _emitir() async {
    setState(() {
      _emitindo = true;
      _faixa = null;
    });
    try {
      final tag = await Escopo.of(context).pets.emitirTag(
            petId: _pet.id,
            idempotencyKey: _chaveDeIdempotencia,
          );
      if (!mounted) return;
      setState(() {
        _tag = tag;
        _emitindo = false;
      });
      // A imagem vem antes da antessala, porque a regra de UX abaixo fala do
      // QR APARECENDO e nao da tag existindo. Ela nao pode DERRUBAR a
      // antessala: a tag foi emitida, a pessoa ja tem o que perder, e uma
      // imagem que nao carregou nao muda isso. Por isso `_baixarOQr` trata a
      // propria falha e nunca propaga.
      await _baixarOQr(tag);
      if (!mounted) return;
      // A antessala vem DEPOIS de o QR aparecer, e so quando ele aparece.
      //
      // UX 10.1 fixa o momento: "F1.6, imediatamente depois de o primeiro pet
      // ser cadastrado e o QR aparecer -- e o primeiro instante em que a pessoa
      // tem algo a perder". Pedir na abertura do app e o jeito mais rapido de
      // a pessoa negar para sempre, e no iOS o dialogo do sistema e mostrado
      // **uma vez**: gastar essa chance sem contexto queima a permissao.
      //
      // E so quando o QR apareceu: no ramo de falha abaixo a tela ja esta
      // mostrando um problema, e empilhar um pedido de permissao em cima dele
      // e pedir atencao para outra coisa no pior momento possivel.
      await _resolverAviso();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _faixa = falha is FalhaDeConexao
            // Sem conexao o codigo nao existe, e a tela diz isso em vez de
            // desenhar um QR falso. O codigo so existe depois do servidor.
            ? MensagemDeErro(
                texto: TextosDoCadastro.salvoNesteCelular(_pet.nome),
              )
            : MensagemDeErro(
                texto: TextosDoCadastro.tagNaoSaiu(_pet.nome),
                acao: MensagensDeErro.tentarDeNovo,
              );
      });
    }
  }

  /// Busca a imagem do QR **com o `Authorization` que a rota exige**.
  ///
  /// `Image.network` nao serve aqui e nao e questao de estilo: ele abre um
  /// `HttpClient` proprio, por fora da camada de API, e nao ha por onde passar
  /// cabecalho. A rota da imagem e `bearerAuth` e esta marcada
  /// `reveals_credential` no contrato -- pela `Image.network` ela responde 401,
  /// o `errorBuilder` colapsava para `SizedBox.shrink()`, e a tela ficava
  /// exatamente como o cliente a viu: sem QR e sem dizer por que.
  ///
  /// A falha **nao** vira [_faixa]. A faixa e o slot da emissao da tag; a
  /// imagem que nao veio e um problema da imagem, e o aviso dela fica onde ela
  /// ficaria, junto do codigo que continua resolvendo.
  Future<void> _baixarOQr(TagEmitida tag) async {
    final endereco = tag.qrPngUrl;
    if (endereco == null || endereco.isEmpty) {
      // Nao ha imagem prometida. **Nada falhou**, e a tela diz isso com outro
      // texto -- colapsar os dois casos no mesmo silencio foi o defeito.
      if (mounted) setState(() => _estadoDoQr = _EstadoDoQr.semEndereco);
      return;
    }

    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    final api = Escopo.of(context).api;
    final cofre = Escopo.of(context).cofreDoQr;

    setState(() {
      _estadoDoQr = _EstadoDoQr.carregando;
      _qr = null;
    });

    try {
      final Uint8List bytes = await api.baixarImagem(endereco);
      final provedor = await cofre.guardar(bytes);
      if (!mounted) return;
      setState(() {
        _qr = provedor;
        _estadoDoQr = _EstadoDoQr.pronto;
      });
    } on FalhaDeChamada {
      // Os quatro desfechos de `FalhaDeChamada` levam ao MESMO texto de tela, e
      // isso e deliberado: para quem esta com o celular na mao, "401", "sem
      // sinal" e "o endereco nao e desta API" produzem a mesma resposta -- o
      // codigo por extenso resolve, e da para tentar de novo. O que a tela nao
      // pode fazer e ficar calada.
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = _EstadoDoQr.falhou;
      });
    }
  }

  /// A primeira das DUAS oportunidades de UX 10.1 (BICHUS-24).
  ///
  /// O fluxo inteiro -- consultar o estado, conferir se a oportunidade ainda
  /// cabe, abrir a antessala, pedir ao sistema e registrar o aparelho -- mora
  /// em [PedidoDeAviso], porque F3.2 e a **segunda oportunidade da mesma
  /// permissao** e precisa contar a mesma coisa. O que e desta tela e QUANDO
  /// chamar, e o que fazer quando o registro falha.
  ///
  /// **Quando:** depois de o QR aparecer, e so quando ele aparece. UX 10.1
  /// fixa o momento em "F1.6, imediatamente depois de o primeiro pet ser
  /// cadastrado e o QR aparecer -- o primeiro instante em que a pessoa tem
  /// algo a perder". No ramo de falha da emissao a tela ja esta mostrando um
  /// problema, e empilhar um pedido de permissao em cima dele e pedir atencao
  /// para outra coisa no pior momento possivel.
  Future<void> _resolverAviso() async {
    final desfecho = await PedidoDeAviso.oferecer(
      context,
      oportunidade: OportunidadeDeAviso.primeiroPetCadastrado,
      nomeDoPet: _pet.nome,
    );
    if (desfecho != DesfechoDoPedido.registroFalhou) return;
    // A falha NAO e engolida: a faixa diz que o aviso no celular nao ficou
    // ligado e lembra que o caso proprio continua coberto por e-mail. O slot
    // de faixa esta livre aqui -- so chegamos neste ponto quando a emissao da
    // tag deu certo.
    if (!mounted) return;
    setState(() {
      _faixa = MensagemDeErro(
        texto: TextosDaAntessala.avisoNaoFicouLigado(_pet.nome),
      );
    });
  }

  /// O que a tela diz sobre a foto, nos quatro estados.
  ///
  /// **Nenhum deles diz "enviada".** O criterio 2 da BICHUS-31 proibe tela de
  /// sucesso para o que nao aconteceu, e a outra metade dessa regra e que o
  /// sucesso tambem nao precisa de anuncio: quando a foto sobe, a linha
  /// simplesmente some, e a tela volta a ser a de um cadastro sem pendencia.
  /// Um "foto enviada" ali seria ruido sobre o caminho normal.
  List<Widget> _linhaDaFoto(TextTheme textos, BichuCores cores) {
    final discreto = textos.bodyMedium?.copyWith(color: cores.textSecondary);
    switch (_estadoDaFoto) {
      case _EstadoDaFoto.semFoto:
      case _EstadoDaFoto.enviada:
        return const <Widget>[];

      case _EstadoDaFoto.subindo:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e1),
          Text(
            // Linha discreta, **sem botao**: o envio esta em curso e nao ha
            // nada para a pessoa fazer. Um botao aqui seria trabalho
            // inventado, e ele nao existia por engano.
            TextosDoCadastro.fotoAindaSubindo(_pet.nome),
            style: discreto,
          ),
        ];

      case _EstadoDaFoto.semSinal:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e2),
          FaixaDeAviso(
            // Informativo, e nao erro: **nada se perdeu**. O pet esta
            // cadastrado e o codigo saiu; o que falta e uma foto.
            peso: PesoDaFaixa.informativo,
            texto: TextosDoCadastro.fotoNaoSubiuSemSinal(_pet.nome),
            rotuloDaAcao: TextosDoCadastro.tentarEnviarAgora,
            aoTocarNaAcao: _enviarAFoto,
          ),
        ];

      case _EstadoDaFoto.recusada:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e2),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            // **Sem rotulo e sem toque, juntos.** Um rotulo sem callback sai
            // na arvore de semantica como botao sem acao -- o defeito que
            // quatro widgets deste app ja tiveram. Aqui os dois faltam porque
            // repetir a chamada devolve a mesma recusa.
            texto: TextosDoCadastro.fotoNaoSubiuRecusada(_pet.nome),
          ),
        ];
    }
  }

  Future<void> _copiar() async {
    final codigo = _tag?.codigo;
    if (codigo == null) return;
    await Clipboard.setData(ClipboardData(text: codigo));
    if (!mounted) return;
    // Copiar sem retorno audivel e copiar sem saber se copiou.
    anunciar(context, TextosDoCadastro.codigoCopiado);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(TextosDoCadastro.codigoCopiado)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final tag = _tag;

    return Scaffold(
      // `Fechar`, e nao `voltar`: a tela e um **destino**. Os tres passos do
      // assistente foram substituidos de proposito e nao existem mais; nao ha
      // para onde voltar, ha de onde sair.
      appBar: const BarraDeConta(
        titulo: 'Pet cadastrado',
        saida: TipoDeSaida.fechar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.fazerATag,
            critico: true,
            // F1.7 e de outra historia. Enquanto ela nao existe, o botao nao
            // finge que funciona -- e o padrao que o Inicio ja usa.
            aoTocar: null,
          ),
          // Secundaria **em texto, e nao em botao**, como a especificacao pede.
          //
          // O fim do assistente vai para `Perfil`, e nao para a secao de
          // aterrissagem: e a excecao que a UX 26.8 abriu quando `Meus pets`
          // passou a morar em `Perfil` > `Meus pets` (27.6). Quem acabou de
          // cadastrar um pet quer ver o pet, e ele esta la.
          TextButton(
            onPressed: () => context.go(Rotas.perfil),
            child: const Text(TextosDoCadastro.depois),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                TextosDoCadastro.tituloPetCadastrado(_pet.nome),
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(_pet.nome, style: textos.titleLarge),
            ..._linhaDaFoto(textos, cores),
            const SizedBox(height: BichuEspaco.e4),
            Text(
              TextosDoCadastro.corpoPetCadastrado,
              style: textos.bodyLarge,
            ),
            const SizedBox(height: BichuEspaco.e6),
            if (_emitindo)
              const Center(child: CircularProgressIndicator())
            else if (tag != null)
              _BlocoDoCodigo(
                tag: tag,
                nome: _pet.nome,
                aoCopiar: _copiar,
                estadoDoQr: _estadoDoQr,
                qr: _qr,
                aoTentarDeNovo: () => _baixarOQr(tag),
              ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: _faixa!.texto,
                rotuloDaAcao: _faixa!.acao,
                aoTocarNaAcao: _faixa!.acao == null ? null : _emitir,
              ),
            ],
            if (_pet.redacoesDeCuidados.isNotEmpty) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                // Nao bloqueante, e informativo: **a pessoa estava tentando
                // ajudar**, e o texto nao pode soar como acusacao nem como
                // bloqueio.
                peso: PesoDaFaixa.informativo,
                texto: TextosDoCadastro.redacaoDeCuidados(
                  _pet.redacoesDeCuidados
                      .map((r) => r.comoSeChama)
                      .toList(growable: false),
                  _pet.nome,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// O QR, o codigo por extenso, o `Copiar o código` ao lado, e a linha 6.
///
/// Os quatro ficam no **mesmo container semantico** de proposito: a linha 6 e
/// anunciada junto do codigo, e nao depois dos botoes. Quem usa leitor de tela
/// e exatamente quem mais perde com o codigo sumindo, porque a recuperacao
/// alternativa (ler o codigo impresso na plaquinha) nao serve.
/// Em qual estado esta a IMAGEM do QR. Quatro, e nao dois.
///
/// O defeito que este enum fecha: [semEndereco] e [falhou] desenhavam a mesma
/// coisa -- nada. Quem estava com o celular na mao nao tinha como saber se a
/// tag nao tem imagem ou se o app nao conseguiu busca-la, e so o segundo caso
/// tem conserto do lado de ca.
enum _EstadoDoQr {
  /// A emissao nao prometeu imagem (`qr_png_url` ausente). Nada falhou.
  semEndereco,

  /// A requisicao esta em curso.
  carregando,

  /// Os bytes chegaram e estao desenhados.
  pronto,

  /// A requisicao saiu e nao voltou imagem.
  falhou,
}

/// Em qual estado esta o ENVIO da foto escolhida em F1.4.
///
/// Quatro, e nao dois. "Nao subiu" junta duas situacoes que levam a telas
/// diferentes, pela mesma razao que permissao tem tres estados e nao dois:
/// [semSinal] tem um movimento que resolve e [recusada] nao tem.
enum _EstadoDaFoto {
  /// O cadastro veio sem foto. Nao ha linha nenhuma.
  semFoto,

  /// Os bytes estao a caminho. A linha discreta aparece, sem acao.
  subindo,

  /// Os bytes chegaram e a confirmacao saiu. A linha some.
  enviada,

  /// Faltou rede. Faixa informativa **com** `Enviar a foto de novo`.
  semSinal,

  /// O servidor ou o armazenamento recusaram. Faixa informativa sem acao:
  /// repetir devolve a mesma recusa.
  recusada,
}

/// O lado do quadrado do QR, em dp.
///
/// Nao e espacamento e por isso nao sai de `BichuEspaco`: e o tamanho de
/// desenho de uma imagem. Fica em constante porque os TRES estados precisam
/// ocupar a mesma caixa -- se o esqueleto de carregamento tiver outra altura, a
/// tela salta debaixo do dedo no instante em que a imagem chega.
const double _ladoDoQr = 200;

class _BlocoDoCodigo extends StatelessWidget {
  const _BlocoDoCodigo({
    required this.tag,
    required this.nome,
    required this.aoCopiar,
    required this.estadoDoQr,
    required this.qr,
    required this.aoTentarDeNovo,
  });

  final TagEmitida tag;
  final String nome;
  final VoidCallback aoCopiar;
  final _EstadoDoQr estadoDoQr;
  final MemoryImage? qr;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        // Fundo branco puro, e nao a superficie do app: a areia reduz o
        // contraste de modulo e leitor barato falha (legenda do Figma
        // `101:69`).
        color: const Color(0xFFFFFFFF),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _ImagemDoQr(
            estado: estadoDoQr,
            provedor: qr,
            codigo: tag.codigo,
            aoTentarDeNovo: aoTentarDeNovo,
          ),
          const SizedBox(height: BichuEspaco.e4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              Expanded(
                child: SelectableText(
                  tag.codigo,
                  style: textos.titleLarge?.copyWith(
                    color: const Color(0xFF000000),
                    fontFeatures: const <FontFeature>[
                      // Zero cortado e digitos de largura fixa: este codigo e
                      // transcrito a mao para uma plaquinha, e `0` contra `O` e
                      // o erro que a ajuda do campo de digitacao existe para
                      // perdoar.
                      FontFeature.slashedZero(),
                      FontFeature.tabularFigures(),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
              Semantics(
                button: true,
                // `container: true` junto do rotulo: sem ele a anotacao se
                // funde com a do codigo ao lado, na mesma linha, e o leitor de
                // tela anuncia os dois grudados. O nome do controle precisa
                // ser o nome do controle.
                container: true,
                // O rotulo acessivel diz **de qual tag**: quem tem mais de um
                // pet ouve "Copiar o código" tres vezes iguais sem isso.
                label: '${TextosDoCadastro.copiarOCodigo} da tag de $nome',
                excludeSemantics: true,
                // Sem esta linha o no sai com `button: true` e ZERO acoes:
                // `excludeSemantics: true` leva junto a acao do
                // `TextButton.icon`. E o unico caminho do app para copiar o
                // codigo da tag, que so aparece nesta tela e nunca mais -- e
                // ele estava fechado para quem usa leitor de tela.
                onTap: aoCopiar,
                child: TextButton.icon(
                  onPressed: aoCopiar,
                  icon: const Icon(Icons.copy, size: 20),
                  label: const Text(TextosDoCadastro.copiarOCodigo),
                  style: TextButton.styleFrom(
                    // 48 dp de alvo, como a especificacao de F1.6 pede.
                    minimumSize: const Size(0, BichuAlvoDeToque.min),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            TextosDoCadastro.soAquiPorExtenso(tag.sufixo),
            // Sem icone de alerta e sem cor de erro: **nada deu errado**. A
            // frase e informativa, e fica abaixo do codigo.
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// O lugar do QR, nos quatro estados.
///
/// ## A decisao que este widget carrega
///
/// Ate 22/09 a tela usava `Image.network(qr, errorBuilder: (...) =>
/// SizedBox.shrink())`. Duas coisas erradas numa linha:
///
/// 1. `Image.network` nao manda `Authorization`, e a rota e `bearerAuth`. O QR
///    nunca ia aparecer.
/// 2. O `errorBuilder` colapsava para nada. **A tela mentia por omissao**:
///    ficava igual quando nao havia imagem e quando a busca falhou.
///
/// O que cada estado mostra, e por que:
///
/// - **[_EstadoDoQr.semEndereco]**: uma linha informativa, sem icone de alerta
///   e sem acao. Nada falhou; nao ha o que a pessoa possa fazer, e um botao
///   aqui seria trabalho inventado. Mesmo criterio da linha "a foto ainda esta
///   subindo" logo acima nesta tela.
/// - **[_EstadoDoQr.carregando]**: a caixa com o lado do QR, ocupada por um
///   indicador. Ocupa a caixa inteira de proposito: a tela nao pode saltar
///   quando a imagem chega, e o codigo por extenso esta logo abaixo do dedo.
/// - **[_EstadoDoQr.pronto]**: a imagem, anunciada com o codigo por extenso
///   como alternativa textual.
/// - **[_EstadoDoQr.falhou]**: faixa informativa **com** `Tentar de novo`. E o
///   unico estado com acao, porque e o unico em que existe uma.
///
/// Nos quatro, o codigo por extenso continua logo abaixo. Ele e o caminho que
/// sempre funciona, e nenhum estado desta imagem o esconde.
class _ImagemDoQr extends StatelessWidget {
  const _ImagemDoQr({
    required this.estado,
    required this.provedor,
    required this.codigo,
    required this.aoTentarDeNovo,
  });

  final _EstadoDoQr estado;
  final MemoryImage? provedor;
  final String codigo;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final imagem = provedor;

    switch (estado) {
      case _EstadoDoQr.semEndereco:
        return Text(
          TextosDoCadastro.qrSemImagem,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        );

      case _EstadoDoQr.carregando:
        return Center(
          child: Semantics(
            label: TextosDoCadastro.qrCarregando,
            liveRegion: true,
            child: const SizedBox(
              width: _ladoDoQr,
              height: _ladoDoQr,
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
        );

      case _EstadoDoQr.pronto:
        if (imagem == null) {
          // Estado impossivel pela construcao (`pronto` so e atribuido junto do
          // provedor), e mesmo assim ele nao pode virar um quadrado vazio: cai
          // no texto que diz a verdade sobre o que a pessoa esta vendo.
          return Text(
            TextosDoCadastro.qrSemImagem,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          );
        }
        return Center(
          child: Semantics(
            image: true,
            // **A alternativa textual do QR e o codigo por extenso**, e nao
            // "QR code do pet". Ninguem le um QR com leitor de tela, e uma
            // alternativa que descreve a imagem em vez de entregar o conteudo
            // dela nao serve para nada.
            label: codigo,
            child: Image(
              image: imagem,
              width: _ladoDoQr,
              height: _ladoDoQr,
              // `gaplessPlayback` fora: ele guarda o quadro ANTERIOR para
              // mostrar durante a troca, e o quadro anterior aqui e a
              // credencial de outra tag.
              gaplessPlayback: false,
            ),
          ),
        );

      case _EstadoDoQr.falhou:
        return FaixaDeAviso(
          // Informativo, e nao erro: a tag existe, o codigo esta na tela e a
          // plaquinha sai do mesmo jeito. Cor de erro aqui diria que algo se
          // perdeu, e nao se perdeu nada.
          peso: PesoDaFaixa.informativo,
          texto: TextosDoCadastro.qrNaoCarregou,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: aoTentarDeNovo,
        );
    }
  }
}
