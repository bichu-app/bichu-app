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

/// F1.3 — Cadastrar pet: identificacao. Figma `89:45`.
///
/// **A tela nao guarda mais os campos: ela os hospeda.** Os campos vivem em
/// [CamposDeIdentificacao] (`campos_do_pet.dart`), porque a tela de EDICAO
/// mexe nos mesmos atributos do mesmo animal e duas formas diferentes de
/// editar os mesmos campos e defeito, nao escolha. O que continua sendo desta
/// tela e o que so ela sabe: o passo do assistente, o botao `Continuar` e para
/// onde ele leva.
///
/// A regra dos campos -- raca em dois campos, campo livre que so existe atras
/// da opcao `Outra`, lista que falha sem travar o cadastro -- esta escrita
/// junto dos campos, e nao aqui. Se ela estivesse aqui, a tela de edicao
/// precisaria de uma copia, e e a copia que diverge.
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

  /// A porta para [CamposDeIdentificacaoState.validar]: a tela confere os
  /// campos **pelo metodo deles** antes de navegar, e nao por uma segunda
  /// copia da regra escrita aqui.
  final GlobalKey<CamposDeIdentificacaoState> _campos =
      GlobalKey<CamposDeIdentificacaoState>();

  // Sem `dispose` do rascunho, de proposito: quando ele veio do `Voltar` de
  // F1.4 o dono e quem navegou, e a tela seguinte ainda o usa. Quem cria o
  // `RascunhoDePet` e dono do `dispose()`, e aqui ele atravessa os tres passos
  // do assistente.

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
