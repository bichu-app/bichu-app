import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_seguranca.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/ficha_da_pessoa.dart';

/// **PESSOAS BLOQUEADAS** — a lista de quem esta conta bloqueou, e o único
/// lugar de onde o desbloqueio sai.
class TelaDeBloqueados extends StatefulWidget {
  const TelaDeBloqueados({required this.seguranca, super.key});

  final SegurancaApi seguranca;

  static const String titulo = 'Usuários bloqueados';
  static const String vazio = 'Você não bloqueou ninguém';
  static const String explicacaoDoVazio =
      'Quando você bloquear alguém, esse usuário aparece aqui e você pode '
      'desbloqueá-la por este caminho.';
  static const String falhaAoCarregar =
      'Não conseguimos carregar a sua lista agora.';
  static const String falhaAoDesbloquear =
      'Não conseguimos desbloquear agora. Tente de novo.';
  static const String desbloquear = 'Desbloquear';

  /// **A frase que diz o que o desbloqueio NÃO faz.**
  static const String oQueODesbloqueioNaoFaz =
      'Desbloquear devolve só a visibilidade. Se vocês eram conexão, a conexão '
      'não volta.';

  @override
  State<TelaDeBloqueados> createState() => _EstadoDosBloqueados();
}

class _EstadoDosBloqueados extends State<TelaDeBloqueados> {
  PaginaDeBloqueados? _pagina;
  bool _carregando = true;
  String? _falha;
  final Set<String> _emCurso = <String>{};

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final pagina = await widget.seguranca.bloqueados();
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _carregando = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falha = TelaDeBloqueados.falhaAoCarregar;
      });
    }
  }

  Future<void> _desbloquear(String publicRef) async {
    if (_emCurso.contains(publicRef)) return;
    setState(() {
      _emCurso.add(publicRef);
      _falha = null;
    });
    try {
      await widget.seguranca.desbloquear(publicRef);
      if (!mounted) return;
      _emCurso.remove(publicRef);
      await _carregar();
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emCurso.remove(publicRef);
        _falha = TelaDeBloqueados.falhaAoDesbloquear;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _pagina?.items ?? const <PessoaBloqueada>[];

    return
      ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (_falha != null) ...<Widget>[
              FaixaDeAviso(texto: _falha as String),
              const SizedBox(height: BichuEspaco.e3),
            ],
            if (_carregando)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BichuEspaco.e8),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (itens.isEmpty && _falha == null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e8),
                child: Column(
                  children: <Widget>[
                    Text(
                      TelaDeBloqueados.vazio,
                      style: textos.titleMedium?.copyWith(
                        color: cores.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: BichuEspaco.e2),
                    Text(
                      TelaDeBloqueados.explicacaoDoVazio,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else ...<Widget>[
              Text(
                TelaDeBloqueados.oQueODesbloqueioNaoFaz,
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e4),
              ...itens.map((PessoaBloqueada pessoa) => _cartao(cores, textos, pessoa)),
            ],
          ],
        ),
    );
  }

  Widget _cartao(BichuCores cores, TextTheme textos, PessoaBloqueada pessoa) {
    final ocupado = _emCurso.contains(pessoa.publicRef);
    final nome = pessoa.nomeParaLer;
    final apelido = pessoa.handle;
    final mostraOApelido = apelido != null && apelido.isNotEmpty && nome != '@$apelido';
    return Container(
      margin: const EdgeInsets.only(bottom: BichuEspaco.e3),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          FichaDaPessoa(
            nome: nome,
            urlDaFoto: null,
            comSelo: false,
            estiloDoNome: textos.titleMedium?.copyWith(color: cores.textPrimary),
            abaixoDoNome: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (mostraOApelido) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e1),
                  Text(
                    '@$apelido',
                    style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  'Bloqueada em ${_data(pessoa.bloqueadoEm)}',
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Row(
            children: <Widget>[
              Expanded(
                child: FilledButton(
                  onPressed: ocupado ? null : () => unawaited(_desbloquear(pessoa.publicRef)),
                  child: Semantics(
                    label: '${TelaDeBloqueados.desbloquear} $nome',
                    excludeSemantics: true,
                    child: const Text(TelaDeBloqueados.desbloquear),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _data(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes/${local.year}';
  }
}
