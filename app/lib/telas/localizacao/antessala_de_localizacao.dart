import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import 'textos_da_localizacao.dart';

/// Os dois pontos do app em que a localizacao e pedida, e nao ha um terceiro.
///
/// Criterio 1 da BICHUS-23: "ela e pedida em exatamente dois pontos do app:
/// F3.1 (marcar perdido) e F3.5 (registrar achado avulso), e em nenhum outro".
///
/// O enum e o que torna esse criterio verificavel. Um `bool ehAchado` diria a
/// mesma coisa e nao criaria o lugar onde um terceiro ponto de uso teria de se
/// declarar -- e e justamente a declaracao que o portao
/// `dois_pontos_de_uso_test.dart` conta.
enum PontoDeUsoDaLocalizacao {
  /// F3.1 — o tutor marcando o pet como perdido.
  marcarPerdido,

  /// F3.5 — quem achou um pet na rua registrando o achado.
  registrarAchado;

  String get titulo => switch (this) {
        PontoDeUsoDaLocalizacao.marcarPerdido =>
          TextosDaLocalizacao.tituloPerdido,
        PontoDeUsoDaLocalizacao.registrarAchado =>
          TextosDaLocalizacao.tituloAchado,
      };

  String get corpo => switch (this) {
        PontoDeUsoDaLocalizacao.marcarPerdido =>
          TextosDaLocalizacao.corpoPerdido,
        PontoDeUsoDaLocalizacao.registrarAchado =>
          TextosDaLocalizacao.corpoAchado,
      };
}

/// A antessala do pedido de permissao de localizacao (criterios 3 e 4).
///
/// ## Por que existe uma antessala, e nao o dialogo direto
///
/// Mesmo argumento de UX 10 para a notificacao, com um agravante que e desta
/// permissao: no iOS o dialogo de localizacao **nao volta**. Depois que a
/// pessoa responde, `requestPermission` nao abre mais nada, e o unico caminho
/// e os ajustes do sistema. Gastar essa chance com a pessoa sem saber para que
/// serve e como transformar um "nao sei" em um "nao" permanente.
///
/// A antessala tambem e o lugar onde a promessa de privacidade e feita antes
/// da pergunta, e nao depois: o corpo do criterio 3 diz que o endereco nao
/// aparece para ninguem. Dito depois do dialogo, ja nao ajuda quem recusou.
///
/// ## `Prefiro digitar o bairro` nao e a recusa
///
/// E a outra metade do mesmo criterio, e o fluxo dela termina igual: caso
/// aberto, achado registrado. Por isso as duas acoes tem o **mesmo peso
/// visual** -- a primaria preenchida, a outra com contorno e a mesma altura.
/// Um `TextButton` aqui transformaria a alternativa num sussurro, e a
/// antessala viraria coacao com duas saidas no papel e uma na pratica.
///
/// Dispensar por toque fora, por gesto ou pelo botao voltar cai em
/// [RespostaDaAntessala.digitarOBairro], que e o lado seguro: nao dispara
/// dialogo nenhum.
class AntessalaDeLocalizacao extends StatelessWidget {
  const AntessalaDeLocalizacao({required this.pontoDeUso, super.key});

  final PontoDeUsoDaLocalizacao pontoDeUso;

  /// Abre a folha e devolve o que a pessoa escolheu.
  static Future<RespostaDaAntessala> mostrar(
    BuildContext context, {
    required PontoDeUsoDaLocalizacao pontoDeUso,
  }) async {
    final resposta = await showModalBottomSheet<RespostaDaAntessala>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => AntessalaDeLocalizacao(pontoDeUso: pontoDeUso),
    );
    return resposta ?? RespostaDaAntessala.digitarOBairro;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // `SafeArea` inferior pelo mesmo motivo medido na antessala de aviso em
    // 22/09: `showModalBottomSheet(useSafeArea: true)` monta
    // `SafeArea(bottom: false, ...)` e devolve a base ao conteudo. Sem isto, a
    // segunda acao termina debaixo da barra de gestos -- e aqui a segunda
    // acao e o caminho de quem nao quer dar a permissao, que e exatamente o
    // que nao pode ficar fora de alcance.
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                pontoDeUso.titulo,
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            Text(pontoDeUso.corpo, style: textos.bodyLarge),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: TextosDaLocalizacao.usarMinhaLocalizacao,
              aoTocar: () => Navigator.of(context).pop(
                RespostaDaAntessala.usarALocalizacao,
              ),
            ),
            const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(
                RespostaDaAntessala.digitarOBairro,
              ),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
                side: BorderSide(
                  color: cores.outline,
                  width: BichuBorda.hairline,
                ),
              ),
              child: const Text(TextosDaLocalizacao.preferoDigitarOBairro),
            ),
          ],
        ),
      ),
    );
  }
}

/// O que a pessoa escolheu na antessala.
enum RespostaDaAntessala {
  /// Abrir o dialogo do sistema.
  usarALocalizacao,

  /// Ir direto para o campo de bairro. **Nao e recusa**: e o outro caminho.
  digitarOBairro,
}
