import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../dispositivo/avisos.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../avisos/antessala_de_aviso.dart';
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

  /// A antessala C.3, a captura do token e o registro do aparelho.
  ///
  /// Tres decisoes, e as tres estao em UX 10.1 e no ADR-0008:
  ///
  /// 1. **A antessala so aparece em [PermissaoDeAviso.naoPedida].** Depois que
  ///    a pessoa respondeu, o dialogo do sistema nao abre mais, e uma antessala
  ///    que leva a lugar nenhum e pior que nenhuma. O caminho de volta sao os
  ///    ajustes do sistema, oferecidos em outras telas.
  /// 2. **`Agora nao` nao dispara o dialogo.** A chance unica fica guardada
  ///    para a segunda oportunidade (F3.2). "Duas oportunidades. Nao uma
  ///    terceira dentro do mesmo fluxo."
  /// 3. **O aparelho e registrado nos tres desfechos**, inclusive quando a
  ///    pessoa recusou. E esse registro que permite contar quantos tutores sao
  ///    de fato alcancaveis -- a metrica que decide se o alerta toca em alguem
  ///    (ADR-0008 e a descricao de `POST /me/devices` no contrato).
  Future<void> _resolverAviso() async {
    // O escopo e lido ANTES do primeiro `await`: depois dele o `context` pode
    // nao estar mais montado, e `Escopo.of` num elemento desmontado estoura.
    final avisos = Escopo.of(context).avisos;
    final devices = Escopo.of(context).devices;

    final plataforma = avisos.plataforma;
    // Sem plataforma nao ha push neste processo (Firebase nao subiu, ou nao e
    // Android nem iOS). Registrar o aparelho aqui sujaria a contagem de
    // alcance com um aparelho que nunca vai receber nada.
    if (plataforma == null) return;

    var permissao = await avisos.estado();
    if (permissao == PermissaoDeAviso.indisponivel) return;

    if (permissao == PermissaoDeAviso.naoPedida) {
      if (!mounted) return;
      final quer = await AntessalaDeAviso.mostrar(context, nomeDoPet: _pet.nome);
      // `quer == false` mantem `naoPedida`, e e isso que vai para o servidor:
      // `not_asked` e `denied` sao estados diferentes no contrato, e colapsar
      // os dois faria o app abrir depois um dialogo que nao abre mais.
      if (quer) permissao = await avisos.pedir();
    }

    // Token so existe com permissao concedida. `null` explicito no corpo diz
    // "este aparelho nao tem token", que e o que o contrato espera.
    final token =
        permissao == PermissaoDeAviso.concedida ? await avisos.token() : null;

    try {
      await devices.registrar(
        plataforma: plataforma,
        permissao: permissao,
        pushToken: token,
      );
    } on FalhaDeChamada {
      // A falha NAO e engolida: a faixa diz que o aviso no celular nao ficou
      // ligado e lembra que o caso proprio continua coberto por e-mail. O slot
      // de faixa esta livre aqui -- so chegamos neste ponto quando a emissao
      // da tag deu certo.
      if (!mounted) return;
      setState(() {
        _faixa = MensagemDeErro(
          texto: TextosDaAntessala.avisoNaoFicouLigado(_pet.nome),
        );
      });
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
            if (widget.resultado.fotoPendente != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e1),
              Text(
                // Linha discreta, **sem botao**: nao ha nada para a pessoa
                // fazer, e um botao aqui seria trabalho inventado.
                TextosDoCadastro.fotoAindaSubindo(_pet.nome),
                style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
              ),
            ],
            const SizedBox(height: BichuEspaco.e4),
            Text(
              TextosDoCadastro.corpoPetCadastrado,
              style: textos.bodyLarge,
            ),
            const SizedBox(height: BichuEspaco.e6),
            if (_emitindo)
              const Center(child: CircularProgressIndicator())
            else if (tag != null)
              _BlocoDoCodigo(tag: tag, nome: _pet.nome, aoCopiar: _copiar),
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
class _BlocoDoCodigo extends StatelessWidget {
  const _BlocoDoCodigo({
    required this.tag,
    required this.nome,
    required this.aoCopiar,
  });

  final TagEmitida tag;
  final String nome;
  final VoidCallback aoCopiar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final qr = tag.qrPngUrl;

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
          if (qr != null)
            Center(
              child: Semantics(
                image: true,
                // **A alternativa textual do QR e o codigo por extenso**, e nao
                // "QR code do pet". Ninguem le um QR com leitor de tela, e uma
                // alternativa que descreve a imagem em vez de entregar o
                // conteudo dela nao serve para nada.
                label: tag.codigo,
                child: Image.network(
                  qr,
                  width: 200,
                  height: 200,
                  // O QR nao carregou: **nao ha QR de enfeite**. O codigo por
                  // extenso continua na tela, que e o que a tag precisa.
                  errorBuilder: (context, erro, pilha) => const SizedBox.shrink(),
                ),
              ),
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
