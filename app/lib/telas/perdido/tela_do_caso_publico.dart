import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_perdido.dart';
import '../../api/perdidos_api.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import '../escanear/tela_do_pet_da_tag.dart';
import 'cartao_do_perdido.dart';

/// A PAGINA INTERNA DE UM PET PERDIDO, na visao de quem **nao** e o tutor.
class TelaDoCasoPublico extends StatefulWidget {
  const TelaDoCasoPublico({required this.shareToken, super.key});

  /// O token opaco do caso, **como veio no caminho da rota**.
  final String shareToken;

  /// O rotulo da acao, literal do cliente: *"um botao caso a pessoa encontrou o
  /// animal"*.
  static const String rotuloDeEncontrei = 'Encontrei este animal';

  /// O que a tela diz quando o link nao leva mais a caso aberto.
  static const String casoEncerrado =
      'Este link não leva mais a um caso aberto.';

  /// A saida do 410, que e a do `next_action` do contrato.
  static const String rotuloDeRegistrarAchado = 'Registrar um achado';

  /// O agradecimento de quem abriu o cartaz de um pet **que ja voltou**.
  static const String petReencontrado = MensagensDeErro.petReencontrado;

  /// O titulo da barra quando o caso terminou com o animal em casa.
  static const String tituloDoReencontrado = 'Pet encontrado';

  /// O titulo da barra. **Nao carrega o nome do pet**: ele chega depois da
  /// leitura, e uma barra que troca de titulo no meio do carregamento e o que o
  /// 11.23.4 evita.
  static const String titulo = 'Pet perdido';

  @override
  State<TelaDoCasoPublico> createState() => _TelaDoCasoPublicoState();
}

/// Os desfechos de uma abertura.
enum _Fase {
  carregando,
  carregado,

  /// O 410 FUNDIDO: os quatro motivos que continuam sem nome -- pet excluido,
  /// falecido, arquivado, e token desconhecido -- mais o caso encerrado sem
  /// reencontro.
  encerrado,

  /// O 410 do caso que terminou **porque o animal voltou**, e so ele.
  reencontrado,

  falha,
}

class _TelaDoCasoPublicoState extends State<TelaDoCasoPublico> {
  _Fase _fase = _Fase.carregando;
  CasoPerdidoPublico? _caso;
  String? _textoDaFalha;
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final api = PerdidosApi(Escopo.of(context).api);
      final caso = await api.buscarCaso(widget.shareToken);
      if (!mounted) return;
      setState(() {
        _caso = caso;
        _fase = _Fase.carregado;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (_ehCasoReencontrado(falha)) {
          _fase = _Fase.reencontrado;
        } else if (_ehCasoEncerrado(falha)) {
          _fase = _Fase.encerrado;
        } else {
          _textoDaFalha = MensagensDeErro.de(falha).texto;
          _fase = _Fase.falha;
        }
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao abrir o caso publico');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falha;
      });
    }
  }

  /// **Decide pelo `type`, e o status e so o cinto.**
  bool _ehCasoEncerrado(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      falha.problem.tipo != ProblemTipo.casoReencontrado &&
      (falha.problem.tipo == ProblemTipo.casoEncerrado ||
          falha.problem.status == 410);

  /// **O reencontrado, e ele compara SO o `type`.**
  bool _ehCasoReencontrado(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      falha.problem.tipo == ProblemTipo.casoReencontrado;

  /// A porta do achado, **com o caso inteiro**.
  void _encontrei() {
    context.push(Rotas.encontreiEstePet, extra: _caso!.perdido);
  }

  /// A porta do achado **sem** token, no caminho do 410.
  void _registrarAchadoAvulso() => context.push(Rotas.registrarAchado);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _fase == _Fase.reencontrado
              ? TelaDoCasoPublico.tituloDoReencontrado
              : TelaDoCasoPublico.titulo,
        ),
        leading: const SaidaDaTela(tipo: TipoDeSaida.voltar),
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    return switch (_fase) {
      _Fase.carregando => const Center(child: CircularProgressIndicator()),
      _Fase.encerrado => Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaDoCasoPublico.casoEncerrado,
            rotuloDaAcao: TelaDoCasoPublico.rotuloDeRegistrarAchado,
            aoTocarNaAcao: _registrarAchadoAvulso,
          ),
        ),
      _Fase.reencontrado => Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaDoCasoPublico.petReencontrado,
          ),
        ),
      _Fase.falha => Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _textoDaFalha!,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ),
      _Fase.carregado => _Conteudo(
          caso: _caso!,
          aoEncontrar: _encontrei,
        ),
    };
  }
}

/// O corpo, na ORDEM de [FormaDaTelaDaTag.mensagemAoTutor].
class _Conteudo extends StatelessWidget {
  const _Conteudo({required this.caso, required this.aoEncontrar});

  final CasoPerdidoPublico caso;
  final VoidCallback aoEncontrar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final pet = caso.perdido;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        Semantics(
          liveRegion: true,
          container: true,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(BichuEspaco.e4),
            decoration: BoxDecoration(
              color: cores.urgency,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
            ),
            child: Text(
              TelaDoPetDaTag.faixaDePerdidoDe(pet.nome, pet.vistoPorUltimoEm),
              style: textos.titleLarge?.copyWith(color: cores.onUrgency),
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e6),

        if (pet.urlDaFoto != null && pet.urlDaFoto!.trim().isNotEmpty) ...[
          Center(
            child: ImagemDaRede(
              url: pet.urlDaFoto!,
              descricao: 'Foto de ${pet.nome}',
              largura: BichuMoldura.larguraFotoLg,
            ),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],

        Text(
          TelaDoPetDaTag.tituloDoAchadorDe(pet.nome),
          style: textos.displayLarge?.copyWith(color: cores.textPrimary),
        ),

        if (caso.podeAvisarQueViu) ...[
          const SizedBox(height: BichuEspaco.e6),
          BotaoPrimario(
            rotulo: TelaDoCasoPublico.rotuloDeEncontrei,
            critico: true,
            aoTocar: aoEncontrar,
          ),
        ],

        const SizedBox(height: BichuEspaco.e6),
        _Cartao(
          titulo: 'Sinais particulares',
          texto: CartaoDoPerdido.atributosDe(pet),
        ),

        if (_temTexto(caso.descricao)) ...[
          const SizedBox(height: BichuEspaco.e4),
          _Cartao(titulo: 'O que o tutor contou', texto: caso.descricao!.trim()),
        ],

        if (_temTexto(caso.notasDeCuidado)) ...[
          const SizedBox(height: BichuEspaco.e4),
          _Cartao(
            titulo: TelaDoPetDaTag.tituloDosCuidadosDe(pet.nome),
            atribuicao: TelaDoPetDaTag.atribuicaoDosCuidadosDe(pet.nome),
            texto: caso.notasDeCuidado!.trim(),
          ),
        ],

        const SizedBox(height: BichuEspaco.e4),
        Text(
          pet.rotuloDaArea ?? CartaoDoPerdido.semRegiao,
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }

  static bool _temTexto(String? valor) =>
      valor != null && valor.trim().isNotEmpty;
}

/// Um cartao de texto, com titulo e atribuicao opcional.
class _Cartao extends StatelessWidget {
  const _Cartao({
    required this.titulo,
    required this.texto,
    this.atribuicao,
  });

  final String titulo;
  final String texto;
  final String? atribuicao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              titulo,
              style: textos.titleMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
          if (atribuicao != null) ...[
            const SizedBox(height: BichuEspaco.e2),
            Text(
              atribuicao!,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          Text(texto, style: textos.bodyLarge?.copyWith(color: cores.textPrimary)),
        ],
      ),
    );
  }
}
