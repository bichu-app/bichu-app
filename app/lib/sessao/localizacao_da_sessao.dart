/// O QUE O APARELHO JA DISSE SOBRE ONDE A PESSOA ESTA, **num lugar so**.
library;

import 'dart:async';

import '../dispositivo/localizacao.dart';

/// O prazo da MEDICAO do ponto, repassado a porta.
const Duration prazoDaMedicaoDaCidade = Duration(seconds: 12);

/// O TETO DA ESPERA, e ele existe porque [prazoDaMedicaoDaCidade] **nao cobre a
/// resolucao inteira**.
const Duration tetoDaEsperaDaCidade = Duration(seconds: 24);

/// A localizacao que vale para TODAS as secoes nesta sessao de uso do app.
class LocalizacaoDaSessao {
  LocalizacaoDaSessao(this._porta);

  final Localizacao _porta;

  String? _cidadeDoAparelho;

  /// A cidade que o APARELHO resolveu nesta sessao, ou nulo.
  String? get cidadeDoAparelho => _cidadeDoAparelho;

  PermissaoDeLocalizacao? _permissao;

  /// O que o sistema respondeu da ultima vez que alguem perguntou.
  PermissaoDeLocalizacao? get permissao => _permissao;

  Future<ResultadoDaCidade>? _emVoo;

  /// Pergunta ao sistema qual e o estado da permissao.
  Future<PermissaoDeLocalizacao> estado() async {
    final atual = await _porta.estado();
    _permissao = atual;
    return atual;
  }

  /// Abre o dialogo do sistema.
  Future<PermissaoDeLocalizacao> pedir() async {
    final depois = await _porta.pedir();
    _permissao = depois;
    return depois;
  }

  Future<void> abrirAjustesDoSistema() => _porta.abrirAjustesDoSistema();

  /// A CIDADE, resolvida **uma vez por sessao** e servida a todas as secoes.
  Future<ResultadoDaCidade> cidade({bool forcar = false}) {
    if (!forcar) {
      final guardada = _cidadeDoAparelho;
      if (guardada != null) {
        return Future<ResultadoDaCidade>.value(CidadeResolvida(guardada));
      }
      final emVoo = _emVoo;
      if (emVoo != null) return emVoo;
    }
    final tentativa = _porta
        .cidadeAproximada(prazo: prazoDaMedicaoDaCidade)
        .timeout(
          tetoDaEsperaDaCidade,
          onTimeout: () => CidadeNaoResolvida(
            MotivoDeNaoTerCidade.resolucaoSemResposta,
            detalhe: 'teto de ${tetoDaEsperaDaCidade.inSeconds}s na sessao',
          ),
        )
        .then((resultado) {
      if (resultado is CidadeResolvida) _cidadeDoAparelho = resultado.cidade;
      return resultado;
    });
    _emVoo = tentativa;
    tentativa.whenComplete(() {
      if (_emVoo == tentativa) _emVoo = null;
    });
    return tentativa;
  }
}
