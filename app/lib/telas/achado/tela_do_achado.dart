import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_achado.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'textos_do_achado.dart';

/// O achado, pelo endereco dele: `/achados/:achadoId`.
///
/// ## Por que ela LE do servidor, sempre, e nunca desenha de um `extra`
///
/// **Um achado avulso e lido e alterado somente pela conta que o registrou.**
/// Quem sustenta isso e a clausula `WHERE` do servidor: achado de outra pessoa
/// responde **ausencia** (404), indistinguivel do inexistente, porque um 403
/// confirmaria que aquele identificador e um achado de verdade (ADR-0021).
///
/// Uma tela que aceitasse o achado pronto em `extra` -- ou que o lesse de um
/// cache do app -- desenharia o registro **sem perguntar a ninguem**, e a
/// regra do servidor deixaria de valer no unico lugar em que ela e visivel: o
/// aparelho compartilhado, onde a segunda pessoa a entrar herdaria a tela da
/// primeira. Esta tela nao tem esse caminho, e a isca `achado alheio` mede
/// exatamente isso.
///
/// ## A mesma frase para "nao existe" e para "nao e seu"
///
/// [TextosDoAchado.naoEncontrado] e uma so, e a igualdade e o ponto. Dois
/// textos diferentes confirmariam, para quem nao e o dono, qual dos dois
/// identificadores existe -- que e o vazamento que o 404 unico fecha.
class TelaDoAchado extends StatefulWidget {
  const TelaDoAchado({required this.achadoId, super.key});

  final String achadoId;

  @override
  State<TelaDoAchado> createState() => _TelaDoAchadoState();
}

class _TelaDoAchadoState extends State<TelaDoAchado> {
  AchadoRegistrado? _achado;
  MensagemDeErro? _erro;
  String? _ausente;
  bool _carregando = true;
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
      _ausente = null;
    });
    try {
      final achado = await Escopo.of(context).achados.buscar(widget.achadoId);
      if (!mounted) return;
      setState(() {
        _achado = achado;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        // **404 e ausencia, e nao erro.** A tela nao oferece `Tentar de novo`
        // para o que nao existe: repetir a pergunta nao muda a resposta, e o
        // botao ensinaria a pessoa a insistir.
        if (falha.tipo == ProblemTipo.naoEncontrado) {
          _ausente = TextosDoAchado.naoEncontrado;
        } else {
          _erro = MensagensDeErro.de(falha);
        }
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        _erro = MensagensDeErro.de(falha);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final achado = _achado;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDoRegistrado,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            if (_carregando)
              const Center(child: CircularProgressIndicator())
            else if (_ausente != null)
              // **Nada do achado na arvore.** Nem titulo, nem regiao, nem
              // observacao: a ausencia e total, porque meia tela ja contaria
              // que o registro existe.
              Semantics(
                liveRegion: true,
                child: Text(_ausente!, style: textos.bodyLarge),
              )
            else if (_erro != null)
              FaixaDeAviso(
                texto: _erro!.texto,
                rotuloDaAcao: MensagensDeErro.tentarDeNovo,
                aoTocarNaAcao: _carregar,
              )
            else if (achado != null) ...<Widget>[
              Text(
                TextosDoAchado.registradoCorpo,
                style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
              ),
              if (achado.rotuloDaArea != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                Text('Região: ${achado.rotuloDaArea}',
                    style: textos.bodyLarge),
              ],
              if (achado.observacao != null &&
                  achado.observacao!.isNotEmpty) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                Text(achado.observacao!, style: textos.bodyLarge),
              ],
              const SizedBox(height: BichuEspaco.e6),
              // O estado da foto dito em texto: `photo_url` volta nulo por
              // criterio, e um campo de imagem vazio pareceria defeito.
              const FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: TextosDoAchado.fotoAindaNaoSubiu,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
