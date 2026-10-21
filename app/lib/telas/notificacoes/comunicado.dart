/// A PAGINA DO COMUNICADO: o unico destino "pagina interna" da caixa.
///
/// ---------------------------------------------------------------------------
/// ## Por que ESTE tipo tem pagina e os outros nove nao
///
/// O cliente ofereceu as duas formas (20/10/2026): *"tem que ter a pagina
/// interna da notificacao **ou** o link que leva para a acao que foi
/// notificada"*. A segunda e melhor quase sempre -- a pessoa quer ver o pet, o
/// encontro, o caso, e nao um intermediario --, e por isso oito tipos levam a
/// uma tela que ja existia.
///
/// **`broadcast` e o unico sem destino natural.** Ele nao fala de pet, de caso
/// nem de encontro: e texto, e texto precisa de onde ser lido. E
/// `match_suggested` nao tem destino NENHUM, porque nao existe tela de
/// confirmar candidato neste app -- a linha dele nao navega.
///
/// ## A caixa carrega o TITULO, e o corpo vem daqui
///
/// `NotificationItem.subject` e o titulo do comunicado. O CORPO vive no
/// servidor e, ate 20/10, era legivel so pelo painel. `getMyBroadcast` existe
/// para esta tela, e e **recortada pelo destinatario**: comunicado que nao
/// chegou a esta conta responde `404`, e nunca `403` (ADR-0021).
///
/// ## ABRIR ESTA PAGINA NAO MARCA O AVISO COMO LIDO
///
/// Quem marca e a propria caixa, no toque da linha, com o `ref` da
/// NOTIFICACAO. O `ref` daqui e o do COMUNICADO -- sao dois identificadores
/// diferentes para duas coisas diferentes, e trocar um pelo outro responde
/// `404`. Esta tela nao chama marcacao nenhuma, de proposito: quando ela abre,
/// a caixa ja marcou.
///
/// ## Sem compartilhar e sem apagar
///
/// Nao ha botao de compartilhar: comunicado e recado interno do produto, e nao
/// conteudo que circula. E nao ha apagar -- quem limpa a lista e o "x" da
/// caixa, que dispensa a LINHA e nao revoga o comunicado.
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/problem.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_notificacao.dart';
import '../../api/notificacoes_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// O endereco da pagina do comunicado, num lugar so.
///
/// **E isto que `rotas.dart` consome**, e nao o texto escrito a mao: o dia em
/// que o endereco mudar, ele muda aqui e em nenhum outro lugar. Mesmo arranjo
/// de [RotasDaCaixa].
abstract final class RotasDoComunicado {
  /// O padrao da rota. Widget: [PaginaDoComunicado].
  static const String comunicado = '/avisos/comunicados/:comunicadoRef';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoRef = 'comunicadoRef';

  /// O endereco do comunicado de [ref]. **Use esta funcao**, e nao a cadeia.
  ///
  /// `Uri.encodeComponent` porque o `ref` vem da RESPOSTA do servidor e nao
  /// desta tela -- a mesma regra de `Rotas.casoPublicoDe`.
  static String de(String ref) =>
      '/avisos/comunicados/${Uri.encodeComponent(ref)}';
}

/// Os textos da pagina, num lugar so.
abstract final class TextosDoComunicado {
  static const String titulo = 'Recado do Bichu';

  /// O `404`: o comunicado nao chegou a esta conta, ou nao existe.
  ///
  /// **A frase e a MESMA para os dois casos**, e isso e requisito e nao
  /// preguica: um texto que distinguisse "nao existe" de "nao e seu"
  /// confirmaria que aquele `ref` foi disparado, que e exatamente o que o
  /// `404` em vez de `403` evita (ADR-0021).
  static const String naoEncontrado = 'Este recado não está disponível.';
}

/// A pagina de UM comunicado.
class PaginaDoComunicado extends StatefulWidget {
  const PaginaDoComunicado({required this.ref, super.key, this.notificacoes});

  /// O `ref` do COMUNICADO -- o que veio em `AvisoDaCaixa.destinoRef`.
  final String ref;

  /// A camada de API, injetavel. Nula em producao, e ai sai do [Escopo].
  final NotificacoesApi? notificacoes;

  @override
  State<PaginaDoComunicado> createState() => _PaginaDoComunicadoState();
}

enum _Fase { carregando, texto, falha }

class _PaginaDoComunicadoState extends State<PaginaDoComunicado> {
  _Fase _fase = _Fase.carregando;
  ComunicadoDoBichu? _comunicado;
  String? _falha;

  /// O mesmo sinalizador das outras telas que leem [Escopo]: ler um
  /// `InheritedWidget` em `initState` estoura, e a tela abriria dizendo
  /// "servidor fora" sem ter chamado nada.
  bool _iniciou = false;

  NotificacoesApi get _api =>
      widget.notificacoes ?? NotificacoesApi(Escopo.of(context).api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falha = null;
    });
    try {
      final comunicado = await _api.buscarComunicado(widget.ref);
      if (!mounted) return;
      setState(() {
        _comunicado = comunicado;
        _fase = _Fase.texto;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        // **O `404` ganha a frase DESTA tela, e nao a do servidor.** O texto
        // generico de `MensagensDeErro` falaria de outra coisa, e o do servidor
        // poderia descrever o recurso -- os dois perderiam o ponto, que e nao
        // dizer se aquele `ref` existe.
        _falha =
            falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado
                ? TextosDoComunicado.naoEncontrado
                : MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      // Corpo `200` fora do contrato. E falha de leitura, e nao recado vazio:
      // uma pagina em branco aqui pareceria um comunicado sem texto.
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falha = MensagensDeErro.servidorFora;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler o comunicado');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falha = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // [BarraDeConta] com `voltar`, e nao `AppBar` cru: esta tela e EMPILHADA
      // sobre a caixa (`context.push`), e voltar devolve a pessoa a lista onde
      // ela estava -- com a linha ja dizendo `Lido`.
      appBar: const BarraDeConta(
        titulo: TextosDoComunicado.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: _corpo(),
        ),
      ),
    );
  }

  Widget _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return const Center(child: CircularProgressIndicator());
      case _Fase.falha:
        return Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _falha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        );
      case _Fase.texto:
        final comunicado = _comunicado;
        if (comunicado == null) {
          // Inalcancavel pela maquina de fases, e escrito em vez de `!`: um
          // `!` que um dia estivesse errado derrubaria a tela.
          return const SizedBox.shrink();
        }
        return _Texto(comunicado: comunicado);
    }
  }
}

/// O recado: titulo, quando foi e o corpo.
///
/// **Sem imagem e sem autor**, como a caixa: o contrato nao devolve nenhum dos
/// dois aqui, e esta tela nao inventa o que o servidor nao manda.
class _Texto extends StatelessWidget {
  const _Texto({required this.comunicado});

  final ComunicadoDoBichu comunicado;

  /// `21/10/2026 às 9h05`, no fuso de quem le.
  ///
  /// Mesma forma de `AvisoDaCaixa.dataEmTexto`, e pelo mesmo motivo: `intl`
  /// nao esta no `pubspec`, e uma dependencia nova por uma linha de texto e
  /// custo que esta tela nao pede.
  String get _quando {
    final q = comunicado.disparadoEm.toLocal();
    final dia = q.day.toString().padLeft(2, '0');
    final mes = q.month.toString().padLeft(2, '0');
    final minuto = q.minute.toString().padLeft(2, '0');
    return '$dia/$mes/${q.year} às ${q.hour}h$minuto';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        Text(comunicado.titulo, style: textos.headlineSmall),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          _quando,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        // `SelectableText` e nao `Text`: recado costuma ter data, horario ou
        // instrucao que a pessoa quer copiar, e um texto que nao se copia
        // obriga a transcrever a mao.
        SelectableText(comunicado.corpo, style: textos.bodyLarge),
      ],
    );
  }
}
