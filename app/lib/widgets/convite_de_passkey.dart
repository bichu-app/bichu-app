import 'dart:async';

import 'package:flutter/material.dart';

import '../escopo.dart';
import '../sessao/fiacao_do_passkey.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O convite para cadastrar a passkey, logo depois do cadastro da conta.
class ConviteDePasskey extends StatefulWidget {
  const ConviteDePasskey({
    super.key,
    this.rotuloDoAparelho,
    this.permitirRecusaFormal = false,
  });

  /// A FOLHA OFERECE `Não quero ativar`?
  final bool permitirRecusaFormal;

  /// O nome sugerido para o aparelho, ou nulo.
  final String? rotuloDoAparelho;

  @override
  State<ConviteDePasskey> createState() => _ConviteDePasskeyState();
}

class _ConviteDePasskeyState extends State<ConviteDePasskey> {
  bool _emAndamento = false;

  Future<void> _naoQuero() async {
    await Escopo.of(context).passkeyNesteAparelho.registrarRecusa();
    if (!mounted) return;
    Navigator.of(context).pop(DesfechoDoCadastroDePasskey.naoCadastrada);
  }

  Future<void> _ativar() async {
    setState(() => _emAndamento = true);
    final escopo = Escopo.of(context);

    final desfecho = await escopo.passkey.oferecerCadastro(
      rotulo: widget.rotuloDoAparelho,
    );

    if (!mounted) return;
    Navigator.of(context).pop(desfecho);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: _titulo,
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
              const _AlcaDoConvite(),
              ExcludeSemantics(
                child: Icon(
                  Icons.fingerprint,
                  size: BichuEspaco.e8,
                  color: cores.primary,
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Semantics(
                header: true,
                child: Text(
                  _titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(_corpo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e3),
              Text(_aSenhaContinua, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e6),

              _BotaoDeAtivar(carregando: _emAndamento, aoTocar: _ativar),
              const SizedBox(height: BichuEspaco.e4),
              _BotaoDeAgoraNao(
                aoTocar: _emAndamento
                    ? null
                    : () => Navigator.of(context)
                        .pop(DesfechoDoCadastroDePasskey.naoCadastrada),
              ),
              if (widget.permitirRecusaFormal) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                _BotaoDeNaoQuero(
                  aoTocar: _emAndamento ? null : () => unawaited(_naoQuero()),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static const String _titulo = 'Entrar sem digitar a senha?';

  static const String _corpo =
      'Seu celular pode guardar uma credencial digital protegida pela sua '
      'digital, seu rosto ou o bloqueio de tela. Na proxima vez, voce entra '
      'com um toque.';

  static const String _aSenhaContinua =
      'Sua senha continua valendo. Voce pode usar as duas.';
}

/// Abre o convite.
Future<void> mostrarConviteDePasskey(
  BuildContext context, {
  String? rotuloDoAparelho,
  bool permitirRecusaFormal = false,
}) async {
  final cores = BichuColors.of(context).cores;
  await showModalBottomSheet<DesfechoDoCadastroDePasskey>(
    context: context,
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => ConviteDePasskey(
      rotuloDoAparelho: rotuloDoAparelho,
      permitirRecusaFormal: permitirRecusaFormal,
    ),
  );
}

/// A alca de 36 x 4, decorativa.
class _AlcaDoConvite extends StatelessWidget {
  const _AlcaDoConvite();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            color: cores.outline,
            borderRadius: BorderRadius.circular(BichuRaio.full),
          ),
        ),
      ),
    );
  }
}

/// A acao principal: `primary` preenchido, largura total, 64 dp.
class _BotaoDeAtivar extends StatelessWidget {
  const _BotaoDeAtivar({required this.carregando, required this.aoTocar});

  final bool carregando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;

    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando ? '$_rotulo, em andamento' : _rotulo,
      excludeSemantics: true,
      onTap: acao,
      child: SizedBox(
        width: double.infinity,
        height: BichuAlvoDeToque.critico,
        child: FilledButton(
          onPressed: acao,
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
                  _rotulo,
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

  static const String _rotulo = 'Ativar';
}

/// A saida: `secondary`, largura total, 48 dp.
class _BotaoDeAgoraNao extends StatelessWidget {
  const _BotaoDeAgoraNao({required this.aoTocar});

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: OutlinedButton(onPressed: aoTocar, child: const Text('Agora não')),
    );
  }
}

/// `Não quero ativar`: a RECUSA FORMAL (28/10/2026).
class _BotaoDeNaoQuero extends StatelessWidget {
  const _BotaoDeNaoQuero({required this.aoTocar});

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: TextButton(
        onPressed: aoTocar,
        child: const Text('Não quero ativar'),
      ),
    );
  }
}
