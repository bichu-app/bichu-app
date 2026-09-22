import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../intencao/caso_de_perdido_como_intencao.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'tela_onde_e_quando.dart';

/// A ponte entre o envelope de intenção e F3.1 (UX 8.3, regra 4).
///
/// ## Por que ela existe em vez de F3.1 receber o envelope direto
///
/// O envelope guarda o **id** do pet e não o pet. Essa decisão está em
/// `RascunhoDoCaso.dosCampos` e o motivo é privacidade: uma cópia do animal em
/// disco seria dado de conta esperando a próxima pessoa que entrar naquele
/// aparelho. A consequência é que reconstruir F3.1 custa uma leitura, e F3.1
/// **não pode fazer leitura nenhuma** — o critério 6 manda que ela funcione
/// inteira sem conexão, e um estado de carregamento dentro dela criaria a
/// espera que o critério recusa.
///
/// A leitura fica aqui, num passo que só existe neste caminho: a abertura do
/// caso falhou depois do login, e a pessoa está voltando para o formulário.
/// Esse caminho já é de rede, porque a falha veio dela.
///
/// ## Os dois desfechos que não são F3.1
///
/// - **A lista não carrega.** Sem o pet não há como desenhar F3.1, e desenhar
///   um formulário que não sabe de qual animal fala seria pior que dizer o que
///   houve. A tela mostra a falha e oferece tentar de novo.
/// - **O pet não está mais na conta.** Envelope de até 24 horas atrás pode
///   apontar para um animal que saiu da lista. A tela diz isso em vez de abrir
///   um formulário para um caso que não pode existir.
class TelaDeRetomadaDoCaso extends StatefulWidget {
  const TelaDeRetomadaDoCaso({required this.retomada, super.key});

  final RetomadaDoCaso retomada;

  static const String titulo = 'Marcar como perdido';

  static const String carregando = 'Carregando o seu rascunho.';

  /// O pet do envelope não está mais na lista da conta.
  static const String petForaDaConta =
      'Esse pet não está mais na sua lista, e por isso não dá para abrir o '
      'caso dele. O que você escreveu continua aqui até você sair desta tela.';

  static const String rotuloDeVerMeusPets = 'Ver meus pets';

  @override
  State<TelaDeRetomadaDoCaso> createState() => _TelaDeRetomadaDoCasoState();
}

enum _Fase { carregando, achou, petForaDaConta, falhou }

class _TelaDeRetomadaDoCasoState extends State<TelaDeRetomadaDoCaso> {
  _Fase _fase = _Fase.carregando;
  Pet? _pet;
  String? _textoDaFalha;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final pets = await Escopo.of(context).pets.listarMeusPets();
      if (!mounted) return;
      for (final pet in pets) {
        if (pet.id == widget.retomada.petId) {
          setState(() {
            _pet = pet;
            _fase = _Fase.achou;
          });
          return;
        }
      }
      setState(() => _fase = _Fase.petForaDaConta);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falhou;
        _textoDaFalha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pet = _pet;
    if (_fase == _Fase.achou && pet != null) {
      // F3.1 **preenchida**, com o erro dito. Reabrir calada deixaria a falha
      // invisível: a pessoa tocaria em `Continuar` de novo sem saber o que
      // houve da primeira vez.
      return TelaOndeEQuando(
        rascunho: RascunhoDoCaso.dosCampos(pet, widget.retomada.campos),
        erroInicial: widget.retomada.erro?.texto,
      );
    }

    final textos = Theme.of(context).textTheme;
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaDeRetomadaDoCaso.titulo,
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: switch (_fase) {
            // Carregamento **com texto**, e nunca um esqueleto mudo: quem usa
            // leitor de tela precisa ouvir que algo está acontecendo.
            _Fase.carregando || _Fase.achou => Semantics(
                liveRegion: true,
                child: Row(
                  children: <Widget>[
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    ),
                    const SizedBox(width: BichuEspaco.e3),
                    Expanded(
                      child: Text(
                        TelaDeRetomadaDoCaso.carregando,
                        style: textos.bodyLarge,
                      ),
                    ),
                  ],
                ),
              ),
            _Fase.petForaDaConta => const FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: TelaDeRetomadaDoCaso.petForaDaConta,
              ),
            _Fase.falhou => FaixaDeAviso(
                texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                rotuloDaAcao: MensagensDeErro.tentarDeNovo,
                aoTocarNaAcao: _carregar,
              ),
          },
        ),
      ),
      bottomNavigationBar: _fase == _Fase.petForaDaConta
          ? BarraDeAcaoFixa(
              acoes: <Widget>[
                BotaoPrimario(
                  rotulo: TelaDeRetomadaDoCaso.rotuloDeVerMeusPets,
                  critico: true,
                  aoTocar: () => context.go(Rotas.perfil),
                ),
              ],
            )
          : null,
    );
  }
}
