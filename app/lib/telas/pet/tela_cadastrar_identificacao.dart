import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/saida_da_tela.dart';
import 'campos_do_pet.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_cadastro.dart';

/// F1.3 — Cadastrar pet: identificacao.
class TelaCadastrarIdentificacao extends StatefulWidget {
  const TelaCadastrarIdentificacao({super.key, this.rascunhoExistente});

  /// Nulo quando a tela e o comeco do assistente, e nao nulo quando se volta a
  /// ela pelo `Voltar` de F1.4: o que foi digitado continua no lugar.
  final RascunhoDePet? rascunhoExistente;

  @override
  State<TelaCadastrarIdentificacao> createState() =>
      _TelaCadastrarIdentificacaoState();
}

class _TelaCadastrarIdentificacaoState
    extends State<TelaCadastrarIdentificacao> {
  late final RascunhoDePet _rascunho =
      widget.rascunhoExistente ?? RascunhoDePet();

  final GlobalKey<CamposDeIdentificacaoState> _campos =
      GlobalKey<CamposDeIdentificacaoState>();

  void _continuar() {
    if (_campos.currentState?.validar() != true) return;

    context.push(Rotas.cadastrarPetFoto, extra: _rascunho);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Cadastrar pet',
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.continuar,
            critico: true,
            aoTocar: _continuar,
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            const IndicadorDePasso(
              passo: 1,
              total: 3,
              titulo: TextosDoCadastro.tituloIdentificacao,
            ),
            const SizedBox(height: BichuEspaco.e6),
            CamposDeIdentificacao(key: _campos, rascunho: _rascunho),
          ],
        ),
      ),
    );
  }
}
