import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/cache_de_imagens.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/pessoas_api.dart';
import '../../api/problem.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/selo_de_validado.dart';
import '../../widgets/visualizador_de_imagem.dart';
import '../seguranca/menu_do_perfil.dart';

/// **O PERFIL DE OUTRA PESSOA** — a tela que o cliente disse não ter subido
/// ("*a parte do usuário adicionar outras pessoas, ou o perfil do usuário,
/// também não subiu*", 18/10/2026).
class TelaDePerfilDePessoa extends StatefulWidget {
  const TelaDePerfilDePessoa({
    required this.apelido,
    required this.pessoas,
    required this.conexoes,
    required this.seguranca,
    super.key,
    this.podeAgirNaComunidade = false,
    this.tokenDoConvite,
    this.cacheDeImagens,
  });

  /// O apelido, **sem o `@`**: o `@` é símbolo de leitura.
  final String apelido;

  final PessoasApi pessoas;

  /// A porta das conexões. É dela que saem aceitar, recusar, cancelar, desfazer
  /// e — com um convite na mão — pedir.
  final ConexoesApi conexoes;

  /// A porta de denunciar e bloquear, entregue a [MenuDoPerfil].
  final SegurancaApi seguranca;

  /// Sessão **e** e-mail verificado, como `podeCriarNaComunidade`.
  final bool podeAgirNaComunidade;

  /// O **token de convite**, quando quem abriu esta tela tem um.
  final String? tokenDoConvite;

  /// O CACHE DE IMAGEM NO APARELHO (BICHUS-296), **ou nulo**.
  final CacheDeImagensNoAparelho? cacheDeImagens;

  /// **O TÍTULO DA BARRA DE TOPO DESTA TELA É A PALAVRA `Perfil`**, e não o
  /// nome da pessoa (cliente, 23/10/2026).
  static const String tituloDaBarra = 'Perfil';

  static const String naoEncontramos = 'Não encontramos este usuário.';
  static const String falhaAoCarregar = 'Não conseguimos carregar este perfil agora.';
  static const String falhaAoAgir = 'Não conseguimos registrar isso agora.';
  static const String pedirConexao = 'Pedir conexão';
  static const String aceitar = 'Aceitar';
  static const String recusar = 'Recusar';
  static const String cancelarPedido = 'Cancelar pedido';
  static const String pedidoEnviado = 'Pedido enviado. Ela decide quando responder.';
  static const String pedidoRecebido = 'Este usuário quer se conectar com você.';

  /// **A frase do estado de estranho**, e ela diz o que falta e não o que é
  /// proibido: a vitrine não é um recurso bloqueado, é uma coisa que a conexão
  /// abre.
  static const String fotosSoParaConexao = 'As fotos aparecem para quem é conexão.';

  /// O vazio de quem **é** conexão.
  static const String conexaoSemFoto = 'Este usuário ainda não publicou fotos.';

  /// O que o toque na célula faz.
  static const String dicaDeAmpliar = 'Ampliar';

  /// O lado da célula, em dp — **o mesmo da vitrine do dono**, e por isso a
  /// mesma derivada de 320 px serve: 104 dp dão 312 px reais a 3x.
  static const double ladoDaCelula = 104;
  static const double vaoDaGrade = 2;

  /// O rótulo da contagem de pets.
  static String rotuloDePets(int quantos) => quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  @override
  State<TelaDePerfilDePessoa> createState() => _EstadoDoPerfilDePessoa();
}

class _EstadoDoPerfilDePessoa extends State<TelaDePerfilDePessoa> {
  PerfilDePessoa? _perfil;
  bool _carregando = true;
  bool _perdeuOAlvo = false;
  String? _falha;

  /// A falha foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;
  bool _agindo = false;

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final perfil = await widget.pessoas.perfil(widget.apelido);
      if (!mounted) return;
      setState(() {
        _perfil = perfil;
        _carregando = false;
        _perdeuOAlvo = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        if (falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado) {
          _perdeuOAlvo = true;
          _perfil = null;
        } else if (faltaConta(falha)) {
          _faltaConta = true;
          _perfil = null;
        } else {
          _falha = MensagensDeErro.de(falha).texto;
        }
      });
    }
  }

  /// **APAGA DO DISCO AS FOTOS DESTA PESSOA**, porque a permissão de vê-las
  /// acabou de terminar.
  Future<void> _esquecerAsFotosDela() async {
    await widget.cacheDeImagens?.esquecerPessoa(widget.apelido);
  }

  /// `endConnection` **e** a limpeza do cache, nesta ordem.
  Future<void> _encerrar(String ref) async {
    await widget.conexoes.encerrar(ref);
    await _esquecerAsFotosDela();
  }

  Future<void> _agir(Future<void> Function() acao) async {
    if (_agindo) return;
    setState(() {
      _agindo = true;
      _falha = null;
    });
    try {
      await acao();
      if (!mounted) return;
      setState(() => _agindo = false);
      await _carregar();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        if (falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado) {
          _perdeuOAlvo = true;
          _perfil = null;
          return;
        }
        if (faltaConta(falha)) {
          _faltaConta = true;
          _perfil = null;
          return;
        }
        _falha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final perfil = _perfil;

    return Scaffold(
      appBar: AppBar(
        title: const Text(TelaDePerfilDePessoa.tituloDaBarra),
        actions: <Widget>[
          if (perfil != null)
            MenuDoPerfil(
              refDaPessoa: perfil.publicRef,
              api: widget.seguranca,
              aoPerderOAlvo: () => setState(() {
                _perdeuOAlvo = true;
                _perfil = null;
              }),
              aoMudarOBloqueio: (bloqueada) => unawaited(() async {
                if (bloqueada) await _esquecerAsFotosDela();
                await _carregar();
              }()),
              aoDesfazerConexao:
                  perfil.connectionState == EstadoDaConexao.conectado &&
                          perfil.connectionRef != null
                      ? () => _agir(
                            () => _encerrar(perfil.connectionRef!),
                          )
                      : null,
            ),
        ],
      ),
      body: ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (_falha != null) ...<Widget>[
              FaixaDeAviso(
                texto: _falha as String,
                rotuloDaAcao: 'Tentar de novo',
                aoTocarNaAcao: () => unawaited(_carregar()),
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_faltaConta)
              const ConviteParaEntrar(secao: SecaoComConta.paginaDaPessoa)
            else if (_perdeuOAlvo)
              _semAlvo(cores, textos)
            else if (_carregando && perfil == null)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BichuEspaco.e8),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (perfil != null)
              ..._corpo(perfil, cores, textos),
          ],
        ),
      ),
    );
  }

  /// O estado de alvo perdido.
  Widget _semAlvo(BichuCores cores, TextTheme textos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          TelaDePerfilDePessoa.naoEncontramos,
          style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BotaoSecundario(
          rotulo: 'Voltar',
          aoTocar: () => Navigator.of(context).maybePop(),
        ),
      ],
    );
  }

  List<Widget> _corpo(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    return <Widget>[
      NomeComSelo(
        nome: perfil.nomeParaLer,
        comSelo: perfil.canalConfirmado,
        estilo: textos.titleLarge?.copyWith(color: cores.textPrimary),
      ),
      const SizedBox(height: BichuEspaco.e1),
      if (perfil.displayName != null && perfil.displayName!.trim().isNotEmpty)
        Text(
          '@${perfil.handle}',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      const SizedBox(height: BichuEspaco.e4),
      _contagens(perfil, cores, textos),
      const SizedBox(height: BichuEspaco.e6),
      ..._acoesDaRelacao(perfil, cores, textos),
      const SizedBox(height: BichuEspaco.e6),
      _vitrine(perfil, cores, textos),
    ];
  }

  /// As DUAS contagens, lado a lado.
  Widget _contagens(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    final estilo = textos.bodyLarge?.copyWith(color: cores.textPrimary);
    return Semantics(
      label:
          '${TelaDePerfilDePessoa.rotuloDePets(perfil.petsCount)}, '
          '${TelaDePerfilDePessoa.rotuloDeConexoes(perfil.connectionsCount)}',
      child: ExcludeSemantics(
        child: Row(
          children: <Widget>[
            Text(TelaDePerfilDePessoa.rotuloDePets(perfil.petsCount), style: estilo),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e2),
              child: Text('·', style: estilo),
            ),
            Text(TelaDePerfilDePessoa.rotuloDeConexoes(perfil.connectionsCount), style: estilo),
          ],
        ),
      ),
    );
  }

  /// A área de ação, **uma por estado**.
  List<Widget> _acoesDaRelacao(
    PerfilDePessoa perfil,
    BichuCores cores,
    TextTheme textos,
  ) {
    final ref = perfil.connectionRef;

    switch (perfil.connectionState) {
      case EstadoDaConexao.pedidoRecebido:
        return <Widget>[
          _linhaDeEstado(TelaDePerfilDePessoa.pedidoRecebido, cores, textos),
          const SizedBox(height: BichuEspaco.e3),
          BotaoPrimario(
            rotulo: TelaDePerfilDePessoa.aceitar,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => widget.conexoes.aceitar(ref))),
          ),
          const SizedBox(height: BichuEspaco.e2),
          BotaoSecundario(
            rotulo: TelaDePerfilDePessoa.recusar,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => _encerrar(ref))),
          ),
        ];

      case EstadoDaConexao.pedidoEnviado:
        return <Widget>[
          _linhaDeEstado(TelaDePerfilDePessoa.pedidoEnviado, cores, textos),
          const SizedBox(height: BichuEspaco.e3),
          BotaoSecundario(
            rotulo: TelaDePerfilDePessoa.cancelarPedido,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => _encerrar(ref))),
          ),
        ];

      case EstadoDaConexao.conectado:
        return const <Widget>[];

      case null:
        if (!widget.podeAgirNaComunidade) return const <Widget>[];
        final convite = widget.tokenDoConvite;
        return <Widget>[
          BotaoPrimario(
            rotulo: TelaDePerfilDePessoa.pedirConexao,
            carregando: _agindo,
            aoTocar: () => unawaited(
              _agir(() async {
                if (convite != null) {
                  await widget.conexoes.pedir(
                    tokenDoConvite: convite,
                    idempotencyKey: 'conexao-convite-$convite',
                  );
                  return;
                }
                await widget.conexoes.pedirPorApelido(
                  apelido: widget.apelido,
                  idempotencyKey: 'conexao-apelido-${widget.apelido}',
                );
              }),
            ),
          ),
        ];
    }
  }

  Widget _linhaDeEstado(String frase, BichuCores cores, TextTheme textos) {
    return Text(frase, style: textos.bodyMedium?.copyWith(color: cores.textSecondary));
  }

  /// A VITRINE. **Três estados, e os três são diferentes**: fora de alcance,
  /// conexão sem foto, e a grade.
  Widget _vitrine(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    final fotos = perfil.vitrine;

    if (fotos == null) {
      return _recado(TelaDePerfilDePessoa.fotosSoParaConexao, cores, textos);
    }
    if (fotos.isEmpty) {
      return _recado(TelaDePerfilDePessoa.conexaoSemFoto, cores, textos);
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: fotos.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: TelaDePerfilDePessoa.ladoDaCelula,
        mainAxisSpacing: TelaDePerfilDePessoa.vaoDaGrade,
        crossAxisSpacing: TelaDePerfilDePessoa.vaoDaGrade,
        childAspectRatio: 1,
      ),
      itemBuilder: (context, indice) => _celula(fotos, indice),
    );
  }

  Widget _recado(String frase, BichuCores cores, TextTheme textos) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        frase,
        textAlign: TextAlign.center,
        style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
      ),
    );
  }

  /// Uma célula da grade.
  Widget _celula(List<FotoDoPerfil> fotos, int indice) {
    final foto = fotos[indice];

    final imagem = ImagemDaRede(
      url: foto.gridUrl,
      descricao: foto.altText,
      raio: BichuRaio.sm,
      simboloDeFalha: Icons.photo_outlined,
      cache: ChaveDeImagem.dePessoa(foto.gridUrl, apelido: widget.apelido),
    );

    final abertas = <String>[];
    var inicial = 0;
    for (var i = 0; i < fotos.length; i++) {
      final url = fotos[i].openUrl;
      if (url.trim().isEmpty) continue;
      if (i == indice) inicial = abertas.length;
      abertas.add(url);
    }

    return Semantics(
      button: true,
      hint: TelaDePerfilDePessoa.dicaDeAmpliar,
      child: InkWell(
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        onTap: () => VisualizadorDeImagem.abrirVarias(
          context,
          urls: abertas,
          textoAlternativo: foto.altText,
          inicial: inicial,
        ),
        child: imagem,
      ),
    );
  }
}
