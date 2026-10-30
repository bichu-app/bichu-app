import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/vitrine_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/visualizador_de_imagem.dart';

/// A VITRINE DE FOTOS DO USUARIO — **visivel so ao dono**.
class VitrineDeFotosDoUsuario extends StatefulWidget {
  const VitrineDeFotosDoUsuario({
    required this.api,
    required this.escrita,
    required this.camera,
    required this.envio,
    super.key,
  });

  /// A LEITURA, e nao a `VitrineApi` inteira.
  final LeituraDaVitrine api;

  /// A ESCRITA, em interface propria: `intencaoDeFotoDaVitrine` e `substituir`,
  /// e nada mais.
  final EscritaDaVitrine escrita;

  /// A fronteira com o aparelho.
  final CameraEGaleria camera;

  /// O unico caminho de bytes do app.
  final EnvioDeFoto envio;

  /// O lado da celula, em dp.
  static const double ladoDaCelula = 104;

  /// O vao entre celulas. 2 dp: a grade e um mosaico, e nao uma lista de
  /// cartoes — vao largo transformaria nove fotos em nove objetos soltos.
  static const double vaoDaGrade = 2;

  static const String tituloDaTela = 'Minhas fotos';

  /// O vazio. **Pede UMA foto, e nunca as nove**: a vitrine com uma foto e
  /// estado completo, e da terceira em diante o ganho e perto de zero.
  static const String textoDoVazio = 'Adicione uma foto para começar a sua vitrine.';

  static const String recadoDeFotoQueNaoAbriu = 'Não deu para mostrar esta foto.';

  /// O que o toque na celula faz.
  static const String dicaDeAmpliar = 'Ampliar';

  static const String rotuloDaCapa = 'Capa';

  static const String tirarFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  /// O unico botao de salvar desta tela, e ele so existe quando ha o que
  /// salvar.
  static const String salvar = 'Salvar';

  static const String aFotoEscolhida = 'A foto que você escolheu';

  static const String fotoProntaParaSalvar =
      'Foto enviada. Toque em Salvar para guardar na sua vitrine.';

  static const String fotoSemSinal =
      'A foto não subiu: sem conexão agora. Escolha a foto de novo quando '
      'tiver internet.';

  static const String fotoRecusada =
      'A foto não foi aceita. Escolha outra foto.';

  static const String fotoSalva = 'Foto salva na sua vitrine.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  /// O texto do teto. **O numero vem do SERVIDOR** (`MyShowcase.max_photos`,
  /// `enum: [9]`, medido contra a homologacao: `{"photos":[],"max_photos":9}`),
  /// e nunca de uma constante aqui -- duas copias do numero divergem na
  /// primeira mudanca, e a tela e a copia que ninguem lembra de atualizar.
  static String vitrineCheia(int teto) =>
      'Sua vitrine está cheia, com $teto fotos. Apague uma para pôr outra.';

  @override
  State<VitrineDeFotosDoUsuario> createState() => _EstadoDaVitrine();
}

class _EstadoDaVitrine extends State<VitrineDeFotosDoUsuario> {
  Vitrine? _vitrine;
  String? _falha;
  bool _carregando = true;

  /// A falha foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;

  /// A foto que a pessoa escolheu no aparelho.
  FotoLocal? _escolhida;

  /// O `upload_id` de uma foto cujos **bytes ja estao no armazenamento** e que
  /// ainda **nao esta na vitrine**, ou nulo quando nao ha nenhuma.
  String? _uploadPendente;

  bool _enviando = false;
  bool _salvando = false;

  /// A faixa de recado -- recusa de tipo, envio que nao saiu, falha ao gravar.
  MensagemDeErro? _faixa;

  /// O recado de sucesso, que sai no mesmo lugar e e outra coisa.
  String? _confirmacao;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  @override
  void initState() {
    super.initState();
    _carregar();
    _lerAPermissaoDaCamera();
  }

  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await widget.camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarFoto() async {
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await widget.camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await widget.camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await widget.camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  Future<FotoLocal?> _ajustar(FotoLocal foto) => ajustarAFoto(
        context,
        camera: widget.camera,
        foto: foto,
        formato: FormatoDoRecorte.vitrineDoUsuario,
        titulo: 'Ajuste a foto da vitrine',
      );

  Future<void> _abrirOsAjustes() => widget.camera.abrirAjustesDoSistema();

  /// A foto escolhida **JA SOBE**, e a previa aparece antes de o servidor dizer
  /// qualquer coisa.
  Future<void> _escolheu(FotoLocal foto) async {
    final recusa = recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitos);
    if (recusa != null) {
      setState(() {
        _escolhida = null;
        _uploadPendente = null;
        _confirmacao = null;
        _faixa = MensagemDeErro(texto: recusa);
      });
      anunciar(context, recusa);
      return;
    }

    setState(() {
      _escolhida = foto;
      _uploadPendente = null;
      _confirmacao = null;
      _faixa = null;
      _enviando = true;
    });

    final destino = EnvioParaConfirmarDepois(
      pedir: widget.escrita.intencaoDeFotoDaVitrine,
    );
    final desfecho = await widget.envio.enviar(foto: foto, destino: destino);
    if (!mounted) return;

    setState(() {
      _enviando = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadPendente = destino.uploadId;
          _confirmacao = VitrineDeFotosDoUsuario.fotoProntaParaSalvar;
        case DesfechoDoEnvio.semSinal:
          _escolhida = null;
          _faixa = const MensagemDeErro(
            texto: VitrineDeFotosDoUsuario.fotoSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _escolhida = null;
          _faixa = const MensagemDeErro(
            texto: VitrineDeFotosDoUsuario.fotoRecusada,
          );
      }
    });
    if (!mounted) return;
    anunciar(
      context,
      desfecho == DesfechoDoEnvio.enviada
          ? VitrineDeFotosDoUsuario.fotoProntaParaSalvar
          : (_faixa?.texto ?? ''),
    );
  }

  /// O `Salvar`: a foto pendente **entra na vitrine**.
  Future<void> _salvar() async {
    final pendente = _uploadPendente;
    if (pendente == null) return;

    setState(() {
      _salvando = true;
      _faixa = null;
      _confirmacao = null;
    });

    final jaEstao = (_vitrine?.fotos ?? const <FotoDaVitrineLida>[])
        .where((f) => f.uploadId != null)
        .map(
          (f) => FotoPedida(
            uploadId: f.uploadId!,
            textoAlternativo: f.textoAlternativo,
          ),
        )
        .toList();

    try {
      final vitrine = await widget.escrita.substituir(<FotoPedida>[
        ...jaEstao,
        FotoPedida(uploadId: pendente),
      ]);
      if (!mounted) return;
      setState(() {
        _vitrine = vitrine;
        _escolhida = null;
        _uploadPendente = null;
        _salvando = false;
        _confirmacao = VitrineDeFotosDoUsuario.fotoSalva;
      });
      if (!mounted) return;
      anunciar(context, VitrineDeFotosDoUsuario.fotoSalva);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final mensagem = MensagensDeErro.de(falha);
      setState(() {
        _salvando = false;
        _faixa = mensagem;
      });
      if (!mounted) return;
      anunciar(context, mensagem.texto);
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final vitrine = await widget.api.minhaVitrine();
      if (!mounted) return;
      setState(() {
        _vitrine = vitrine;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _faltaConta = faltaConta(falha);
        _falha = MensagensDeErro.de(falha).texto;
        _carregando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text(VitrineDeFotosDoUsuario.tituloDaTela)),
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: [
            Text(
              orientacaoDeTamanhoDaImagem,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
            if (_carregando)
              const Center(child: Padding(padding: EdgeInsets.all(BichuEspaco.e4), child: CircularProgressIndicator()))
            else if (_faltaConta)
              const ConviteParaEntrar(secao: SecaoComConta.minhasFotos)
            else if (_falha != null)
              _erro(_falha!, cores, textos)
            else ...<Widget>[
              _grade(_vitrine, cores, textos),
              const SizedBox(height: BichuEspaco.e4),
              _bloco(cores, textos),
            ],
          ],
        ),
        ),
      ),
    );
  }

  /// O bloco de acrescentar: previa, recado, os dois botoes e o `Salvar`.
  Widget _bloco(BichuCores cores, TextTheme textos) {
    final vitrine = _vitrine;
    final cheia = vitrine != null && vitrine.estaCheia && _uploadPendente == null;
    final local = _escolhida;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (_faixa != null) ...<Widget>[
          FaixaDeAviso(
            texto: _faixa!.texto,
            rotuloDaAcao: _faixa!.acao,
            aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (_confirmacao != null) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: _confirmacao!,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (cheia)
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: VitrineDeFotosDoUsuario.vitrineCheia(vitrine.teto),
          )
        else ...<Widget>[
          if (local != null || _enviando) ...<Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              child: SizedBox(
                height: _alturaDaPrevia,
                width: double.infinity,
                child: local != null
                    ? PreviaDaFoto(
                        foto: local,
                        descricao: VitrineDeFotosDoUsuario.aFotoEscolhida,
                        altura: _alturaDaPrevia,
                      )
                    : const Center(child: CircularProgressIndicator()),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          if (_permissaoDaCamera ==
              EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: VitrineDeFotosDoUsuario.cameraNosAjustes,
              rotuloDaAcao: VitrineDeFotosDoUsuario.abrirAjustes,
              aoTocarNaAcao: _abrirOsAjustes,
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          if (_permissaoDaCamera != EstadoDaPermissao.indisponivel) ...<Widget>[
            BotaoSecundario(
              rotulo: VitrineDeFotosDoUsuario.tirarFoto,
              aoTocar: _enviando || _salvando ? null : _tirarFoto,
            ),
            const SizedBox(height: BichuEspaco.e2),
          ],
          OutlinedButton(
            onPressed: _enviando || _salvando ? null : _escolherDaGaleria,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(VitrineDeFotosDoUsuario.escolherDaGaleria),
          ),
          if (_uploadPendente != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e3),
            BotaoPrimario(
              rotulo: VitrineDeFotosDoUsuario.salvar,
              carregando: _salvando,
              aoTocar: _salvando ? null : _salvar,
            ),
          ],
        ],
      ],
    );
  }

  /// A altura da previa. Mais alta que a celula da grade de proposito: a previa
  /// existe para a pessoa ver a foto que escolheu, e 104 dp nao mostram uma
  /// foto -- mostram uma miniatura dela.
  static const double _alturaDaPrevia = 220;

  Widget _erro(String mensagem, BichuCores cores, TextTheme textos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(mensagem, style: textos.bodyMedium?.copyWith(color: cores.textPrimary)),
        const SizedBox(height: BichuEspaco.e2),
        TextButton(onPressed: _carregar, child: const Text('Tentar de novo')),
      ],
    );
  }

  Widget _grade(Vitrine? vitrine, BichuCores cores, TextTheme textos) {
    final fotos = vitrine?.fotos ?? const <FotoDaVitrineLida>[];
    if (fotos.isEmpty) {
      return Semantics(
        label: VitrineDeFotosDoUsuario.textoDoVazio,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Text(
            VitrineDeFotosDoUsuario.textoDoVazio,
            textAlign: TextAlign.center,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: fotos.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: VitrineDeFotosDoUsuario.ladoDaCelula,
        mainAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        crossAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        childAspectRatio: 1,
      ),
      itemBuilder: (context, indice) => _celula(fotos, indice, cores, textos),
    );
  }

  /// Uma celula da grade, **tocavel quando ha a foto ABERTA**.
  Widget _celula(
    List<FotoDaVitrineLida> fotos,
    int indice,
    BichuCores cores,
    TextTheme textos,
  ) {
    final foto = fotos[indice];
    final moldura = BoxDecoration(
      color: cores.surfaceSunken,
      borderRadius: BorderRadius.circular(BichuRaio.sm),
    );

    final conteudo = ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.sm),
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: moldura,
            child: _imagemDaCelula(foto, cores, textos),
          ),
          if (foto.ehCapa)
            Positioned(
              left: BichuEspaco.e1,
              bottom: BichuEspaco.e1,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e1,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: cores.surface,
                  borderRadius: BorderRadius.circular(BichuRaio.sm),
                ),
                child: Text(
                  VitrineDeFotosDoUsuario.rotuloDaCapa,
                  style: textos.labelSmall?.copyWith(color: cores.textPrimary),
                ),
              ),
            ),
        ],
      ),
    );

    final aberta = foto.urlAberta;
    if (aberta == null || aberta.isEmpty) return conteudo;

    final abertas = <String>[];
    var inicial = 0;
    for (var i = 0; i < fotos.length; i++) {
      final url = fotos[i].urlAberta;
      if (url == null || url.trim().isEmpty) continue;
      if (i == indice) inicial = abertas.length;
      abertas.add(url);
    }

    return Semantics(
      button: true,
      hint: VitrineDeFotosDoUsuario.dicaDeAmpliar,
      child: InkWell(
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        onTap: () => VisualizadorDeImagem.abrirVarias(
          context,
          urls: abertas,
          textoAlternativo: foto.textoAlternativo,
          inicial: inicial,
        ),
        child: conteudo,
      ),
    );
  }

  Widget _imagemDaCelula(FotoDaVitrineLida foto, BichuCores cores, TextTheme textos) {
    final endereco = foto.urlDaGrade;

    if (endereco == null || endereco.isEmpty) {
      final recado = foto.estado == EstadoDaFoto.recusada
          ? (foto.motivoDaRecusa ?? VitrineDeFotosDoUsuario.recadoDeFotoQueNaoAbriu)
          : 'Preparando…';
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e1),
          child: Text(
            recado,
            textAlign: TextAlign.center,
            style: textos.labelSmall?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    return ImagemDaRede(
      url: endereco,
      descricao: foto.textoAlternativo,
      raio: BichuRaio.sm,
      simboloDeFalha: Icons.photo_outlined,
    );
  }

}
