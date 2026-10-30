import 'package:flutter/material.dart';

import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'alca_de_arraste.dart';
import 'faixa_de_aviso.dart';

/// A folha inferior destrutiva do paragrafo 11.9.1 do design system.
class FolhaDestrutiva extends StatefulWidget {
  const FolhaDestrutiva({
    required this.titulo,
    required this.corpo,
    required this.oQueSome,
    required this.rotuloDeConfirmar,
    required this.rotuloAcessivelDeConfirmar,
    required this.aoConfirmar,
    super.key,
    this.avisoExtra,
    this.rotuloDeCancelar = 'Cancelar',
  });

  /// `title-lg` em `text-primary`, **nunca em `error`**: titulo vermelho sobre
  /// corpo neutro faz o olho pular a explicacao.
  final String titulo;

  /// `body`. O paragrafo que explica a consequencia antes da lista.
  final String corpo;

  /// O que some, em lista de marcadores, com quantidade concreta quando
  /// existir.
  final List<String> oQueSome;

  /// Um aviso a mais, acima das acoes, para o que depende do estado do pet --
  /// hoje, o caso de perdido aberto (criterio 4 da BICHUS-60).
  final String? avisoExtra;

  final String rotuloDeConfirmar;

  /// O nome acessivel do botao destrutivo.
  final String rotuloAcessivelDeConfirmar;

  final String rotuloDeCancelar;

  /// A destruicao. Estourar aqui e o caminho esperado do erro: a folha
  /// permanece aberta, **nada foi destruido**, e a falha aparece na faixa.
  final Future<void> Function() aoConfirmar;

  @override
  State<FolhaDestrutiva> createState() => _FolhaDestrutivaState();
}

class _FolhaDestrutivaState extends State<FolhaDestrutiva> {
  bool _emAndamento = false;
  String? _erro;

  Future<void> _confirmar() async {
    setState(() {
      _emAndamento = true;
      _erro = null;
    });
    try {
      await widget.aoConfirmar();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emAndamento = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao confirmar a folha');
      if (!mounted) return;
      setState(() {
        _emAndamento = false;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: widget.titulo,
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewPadding.bottom + BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const AlcaDeArraste(),
              ExcludeSemantics(
                child: Icon(
                  Icons.warning_amber_rounded,
                  size: BichuEspaco.e8,
                  color: cores.error,
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Semantics(
                header: true,
                child: Text(
                  widget.titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(widget.corpo, style: textos.bodyMedium),
              if (widget.oQueSome.isNotEmpty) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                ...widget.oQueSome.map((item) => _Marcador(texto: item)),
              ],
              if (widget.avisoExtra != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: widget.avisoExtra!,
                ),
              ],
              if (_erro != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                FaixaDeAviso(texto: _erro!),
              ],
              const SizedBox(height: BichuEspaco.e6),

              _BotaoDeCancelar(
                rotulo: widget.rotuloDeCancelar,
                aoTocar: _emAndamento
                    ? null
                    : () => Navigator.of(context).pop(false),
              ),
              const SizedBox(height: BichuEspaco.e4),
              _BotaoDestrutivo(
                rotulo: widget.rotuloDeConfirmar,
                rotuloAcessivel: widget.rotuloAcessivelDeConfirmar,
                carregando: _emAndamento,
                aoTocar: _confirmar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Abre a folha e devolve **se a destruicao aconteceu**.
Future<bool> mostrarFolhaDestrutiva(
  BuildContext context, {
  required String titulo,
  required String corpo,
  required List<String> oQueSome,
  required String rotuloDeConfirmar,
  required String rotuloAcessivelDeConfirmar,
  required Future<void> Function() aoConfirmar,
  String? avisoExtra,
  String rotuloDeCancelar = 'Cancelar',
}) async {
  final cores = BichuColors.of(context).cores;
  final confirmou = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => FolhaDestrutiva(
      titulo: titulo,
      corpo: corpo,
      oQueSome: oQueSome,
      avisoExtra: avisoExtra,
      rotuloDeConfirmar: rotuloDeConfirmar,
      rotuloAcessivelDeConfirmar: rotuloAcessivelDeConfirmar,
      rotuloDeCancelar: rotuloDeCancelar,
      aoConfirmar: aoConfirmar,
    ),
  );
  return confirmou ?? false;
}

/// Um item da lista do que some.
class _Marcador extends StatelessWidget {
  const _Marcador({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ExcludeSemantics(
            child: Padding(
              padding: const EdgeInsets.only(right: BichuEspaco.e2),
              child: Text('•', style: textos.bodyMedium),
            ),
          ),
          Expanded(child: Text(texto, style: textos.bodyMedium)),
        ],
      ),
    );
  }
}

/// Cancelar: `secondary`, largura total, **64 dp**.
class _BotaoDeCancelar extends StatelessWidget {
  const _BotaoDeCancelar({required this.rotulo, required this.aoTocar});

  final String rotulo;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.critico,
      child: OutlinedButton(onPressed: aoTocar, child: Text(rotulo)),
    );
  }
}

/// A confirmacao da destruicao: `danger` (`urgency` preenchido), largura total,
/// 48 dp.
class _BotaoDestrutivo extends StatelessWidget {
  const _BotaoDestrutivo({
    required this.rotulo,
    required this.rotuloAcessivel,
    required this.carregando,
    required this.aoTocar,
  });

  final String rotulo;
  final String rotuloAcessivel;
  final bool carregando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando ? '$rotuloAcessivel, em andamento' : rotuloAcessivel,
      excludeSemantics: true,
      onTap: acao,
      child: SizedBox(
        width: double.infinity,
        height: BichuAlvoDeToque.min,
        child: FilledButton(
          onPressed: acao,
          style: FilledButton.styleFrom(
            backgroundColor: cores.urgency,
            foregroundColor: cores.onUrgency,
            disabledBackgroundColor: cores.disabledSurface,
            disabledForegroundColor: cores.onDisabled,
            minimumSize: const Size(double.infinity, BichuAlvoDeToque.min),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BichuRaio.md),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (carregando) ...<Widget>[
                SizedBox(
                  width: BichuEspaco.e4,
                  height: BichuEspaco.e4,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: cores.onDisabled,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
              ],
              Flexible(
                child: Text(
                  rotulo,
                  style: textos.labelLarge,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
