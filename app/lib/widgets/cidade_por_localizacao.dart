/// A CIDADE DO APARELHO, e a caixa que a oferece **enquanto ela nao existe**.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../dispositivo/localizacao.dart';
import '../escopo.dart';
import '../sessao/localizacao_da_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O que a caixa diz quando ha algo a dizer.
enum AvisoDaCidadeDoAparelho {
  /// A resolucao esta correndo.
  procurando,

  /// Recusada, agora ou em definitivo.
  semPermissao,

  /// Permissao ha, servico de localizacao desligado nos ajustes.
  servicoDesligado,

  /// Veio coordenada e nao veio nome de cidade -- ou nao veio coordenada por um
  /// motivo que nao e recusa nem servico (sem fix no prazo, geocoder ausente,
  /// teto de uso, sem resultado, indisponivel).
  naoDescoberta,
}

/// A cidade que o APARELHO diz, e o estado da tentativa de descobri-la.
class CidadeDoAparelho extends ChangeNotifier {
  CidadeDoAparelho(this._sessao);

  /// A porta vem do [Escopo], e **e esta peca que a pega -- nao a tela**.
  factory CidadeDoAparelho.doEscopo(BuildContext context) =>
      CidadeDoAparelho(Escopo.of(context).localizacaoDaSessao);

  /// A LOCALIZACAO DA SESSAO, e nao a porta do aparelho.
  final LocalizacaoDaSessao _sessao;

  /// A cidade resolvida pelo aparelho, ou nulo.
  String? get cidade => _sessao.cidadeDoAparelho;

  AvisoDaCidadeDoAparelho? _aviso;

  /// O que a caixa diz. Nulo e o estado normal: ninguem pediu nada ainda.
  AvisoDaCidadeDoAparelho? get aviso => _aviso;

  /// A resolucao esta correndo.
  bool get procurando => _aviso == AvisoDaCidadeDoAparelho.procurando;

  /// **Da para OFERECER a localizacao neste aparelho.**
  bool get podeOferecer =>
      _sessao.permissao != null &&
      _sessao.permissao != PermissaoDeLocalizacao.indisponivel;

  bool _descartado = false;

  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _anunciar() {
    if (_descartado) return;
    notifyListeners();
  }

  /// A ABERTURA: resolve **so com a permissao JA concedida**, e em silencio.
  Future<bool> resolverNaAbertura() async {
    if (procurando) return false;
    final permissao = await _sessao.estado();
    if (_descartado) return false;
    _anunciar();
    if (permissao != PermissaoDeLocalizacao.concedida) return false;
    return _resolver(porToque: false);
  }

  /// O TOQUE: pede a permissao e, concedida, resolve.
  Future<bool> resolverPorToque() async {
    if (procurando) return false;
    _aviso = AvisoDaCidadeDoAparelho.procurando;
    _anunciar();

    final antes = await _sessao.estado();
    if (_descartado) return false;
    if (antes == PermissaoDeLocalizacao.negadaPermanentemente) {
      _aviso = AvisoDaCidadeDoAparelho.semPermissao;
      _anunciar();
      await _sessao.abrirAjustesDoSistema();
      return false;
    }

    final depois = await _sessao.pedir();
    if (_descartado) return false;
    switch (depois) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.negadaPermanentemente:
      case PermissaoDeLocalizacao.naoPedida:
        _aviso = AvisoDaCidadeDoAparelho.semPermissao;
        _anunciar();
        return false;
      case PermissaoDeLocalizacao.indisponivel:
        _aviso = AvisoDaCidadeDoAparelho.naoDescoberta;
        _anunciar();
        return false;
      case PermissaoDeLocalizacao.concedida:
        break;
    }
    return _resolver(porToque: true);
  }

  /// A resolucao em si, pelos dois caminhos.
  Future<bool> _resolver({required bool porToque}) async {
    final anterior = _sessao.cidadeDoAparelho;
    final resultado = await _sessao.cidade(forcar: porToque);
    if (_descartado) return false;
    switch (resultado) {
      case CidadeNaoResolvida(motivo: final motivo):
        if (!porToque) return false;
        _aviso = switch (motivo) {
          MotivoDeNaoTerCidade.permissaoNegada ||
          MotivoDeNaoTerCidade.permissaoNegadaPermanentemente =>
            AvisoDaCidadeDoAparelho.semPermissao,
          MotivoDeNaoTerCidade.servicoDesligado =>
            AvisoDaCidadeDoAparelho.servicoDesligado,
          MotivoDeNaoTerCidade.semFixNoPrazo ||
          MotivoDeNaoTerCidade.indisponivel ||
          MotivoDeNaoTerCidade.geocoderAusente ||
          MotivoDeNaoTerCidade.falhaDoServico ||
          MotivoDeNaoTerCidade.resolucaoSemResposta ||
          MotivoDeNaoTerCidade.semResultado =>
            AvisoDaCidadeDoAparelho.naoDescoberta,
        };
        _anunciar();
        return false;
      case CidadeResolvida(cidade: final cidade):
        final trocou = cidade != anterior;
        _aviso = null;
        _anunciar();
        return trocou;
    }
  }
}

/// A CAIXA que oferece a localizacao, **e que sai de cena quando ela chega**.
class CaixaDeLocalizacao extends StatelessWidget {
  const CaixaDeLocalizacao({
    required this.cidadeEmUso,
    required this.explicacao,
    required this.podeOferecer,
    required this.aviso,
    required this.aoUsarLocalizacao,
    super.key,
  });

  /// A cidade que a lista esta usando, de qualquer origem.
  final String? cidadeEmUso;

  /// O que a lista esta mostrando enquanto nao ha cidade.
  final String explicacao;

  /// Da para oferecer a localizacao neste aparelho.
  final bool podeOferecer;

  final AvisoDaCidadeDoAparelho? aviso;

  /// **Nulo desenha o botao DESABILITADO**, e nao o esconde.
  final VoidCallback? aoUsarLocalizacao;

  static const String rotuloDeUsarLocalizacao = 'Usar minha localização';

  /// As quatro frases. **Nenhuma culpa a pessoa e todas oferecem saida**, e as
  /// duas saidas sao sempre as mesmas: tentar de novo, ou escolher a cidade no
  /// filtro.
  static const String avisoProcurando = 'Procurando sua localização…';

  static const String avisoSemPermissao =
      'Sem a permissão de localização não dá para descobrir sua cidade. Dá '
      'para liberar nos ajustes do aparelho, ou escolher a cidade no filtro.';

  static const String avisoServicoDesligado =
      'A localização do aparelho está desligada. Dá para ligar nos ajustes, '
      'ou escolher a cidade no filtro.';

  static const String avisoNaoDescoberta =
      'Não deu para descobrir sua cidade agora. Dá para tentar de novo, ou '
      'escolher a cidade no filtro.';

  static String? textoDoAviso(AvisoDaCidadeDoAparelho? aviso) =>
      switch (aviso) {
        null => null,
        AvisoDaCidadeDoAparelho.procurando => avisoProcurando,
        AvisoDaCidadeDoAparelho.semPermissao => avisoSemPermissao,
        AvisoDaCidadeDoAparelho.servicoDesligado => avisoServicoDesligado,
        AvisoDaCidadeDoAparelho.naoDescoberta => avisoNaoDescoberta,
      };

  @override
  Widget build(BuildContext context) {
    if (cidadeEmUso != null || !podeOferecer) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final texto = textoDoAviso(aviso);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            liveRegion: true,
            child: Text(texto ?? explicacao, style: textos.bodyMedium),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: aoUsarLocalizacao,
              child: const Text(rotuloDeUsarLocalizacao),
            ),
          ),
        ],
      ),
    );
  }
}
