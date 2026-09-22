import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../casca_com_abas.dart';

/// O cache de leitura de `GET /pets`, do criterio 7 da BICHUS-62.
///
/// **Vive em memoria e nao toca o disco, de proposito.** Uma das decisoes
/// abertas do cliente em 21/09 e se o cache de leitura e por usuario ou
/// apagado na saida, e ela foi classificada como decisao de **seguranca**:
/// trocar de conta nao pode expor os pets da anterior. Enquanto ela nao sai,
/// cache em disco seria tomar a decisao por ele, do lado errado. Em memoria a
/// pergunta nao se coloca: o cache morre com o processo.
///
/// A trava por dono existe mesmo assim, porque a troca de conta acontece
/// **dentro** do mesmo processo: sair e entrar com outro e-mail nao mata o
/// app. [pets] devolve nulo quando o dono e outro, e limpa o que estava la.
class CacheDeMeusPets {
  String? _idDoDono;
  List<Pet>? _pets;

  /// O que esta guardado para [idDoDono]. Nulo quando nao ha nada, **ou
  /// quando o que ha e de outra conta**.
  List<Pet>? pets(String? idDoDono) {
    if (idDoDono == null) return null;
    if (_idDoDono != idDoDono) {
      limpar();
      return null;
    }
    return _pets;
  }

  void guardar(String? idDoDono, List<Pet> pets) {
    if (idDoDono == null) return;
    _idDoDono = idDoDono;
    _pets = List<Pet>.unmodifiable(pets);
  }

  void limpar() {
    _idDoDono = null;
    _pets = null;
  }
}

/// `Perfil` › `Meus pets` (BICHUS-62, destino fixado pela secao 27.6 do UX).
///
/// Os cartoes da variante `lista` do paragrafo 11.3 contra `listMyPets`.
///
/// ## O que esta tela nao tem, e nao e esquecimento
///
/// - **`Marcar como perdido`**, nem habilitado nem desabilitado, nem no cartao
///   nem numa barra de acao fixa: a tela que a acao abre e a BICHUS-21 e nao
///   existe (criterio 2, fatiamento de 19/09).
/// - **O caso aberto dominando a tela.** Ele saiu daqui em 21/09 e virou a
///   BICHUS-177, no topo de `Pets`. Quem tem caso aberto esta em panico e nao
///   navega; atras de um toque numa aba `Perfil` o estado do caso ficaria
///   escondido no unico momento em que esconder custa o animal.
/// - **Feed, estatistica, novidade e painel** (criterio 8). E uma lista de
///   pets.
class MeusPets extends StatefulWidget {
  const MeusPets({required this.cache, super.key});

  /// Injetado, e nao criado aqui dentro: o cache precisa sobreviver a
  /// reconstrucao do widget, e um teste precisa conseguir prepara-lo.
  final CacheDeMeusPets cache;

  /// O titulo do estado vazio (criterio 11).
  ///
  /// **Nao e** `Nenhum pet cadastrado ainda`. Aquele texto foi renderizado por
  /// meses numa tela que nao sabia listar pet nenhum, e e o que o cliente leu
  /// depois de cadastrar o dele.
  static const String tituloDoVazio = 'Seu primeiro pet entra aqui.';

  static const String explicacaoDoVazio =
      'Cadastre seu pet para gerar a plaquinha com QR e entrar na rede de quem '
      'procura e de quem encontra.';

  /// A faixa do criterio 7, palavra por palavra.
  static const String faixaDeCache =
      'Mostrando o que temos salvo. Não conseguimos atualizar agora.';

  static const String rotuloDeAtualizar = 'Atualizar';

  static const String titulo = 'Meus pets';

  @override
  State<MeusPets> createState() => _MeusPetsState();
}

/// Os quatro desfechos de uma abertura da tela. Nenhum deles e "tela em
/// branco", e nenhum deles e "lista vazia por falha".
enum _Fase { carregando, lista, falhaComCache, falhaSemCache }

class _MeusPetsState extends State<MeusPets> {
  _Fase _fase = _Fase.carregando;
  List<Pet> _pets = const <Pet>[];
  String? _textoDaFalha;

  @override
  void initState() {
    super.initState();
    // `addPostFrameCallback` e nao chamada direta: `Escopo.of` depende do
    // contexto herdado, que nao esta pronto em `initState`.
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final idDoDono = escopo.sessao.usuario?.id;
    final salvo = widget.cache.pets(idDoDono);

    setState(() {
      _fase = _Fase.carregando;
      _pets = salvo ?? const <Pet>[];
      _textoDaFalha = null;
    });

    try {
      final pets = await escopo.pets.listarMeusPets();
      widget.cache.guardar(idDoDono, pets);
      if (!mounted) return;
      setState(() {
        _pets = pets;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final cache = widget.cache.pets(idDoDono);
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        if (cache != null && cache.isNotEmpty) {
          _pets = cache;
          _fase = _Fase.falhaComCache;
        } else {
          // **Sem cache a tela nao finge que a conta esta vazia.** Uma lista
          // vazia aqui seria indistinguivel de "voce nao tem pet", que e o
          // estado vazio que parece sucesso. A falha aparece e tem saida.
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(MeusPets.titulo, style: textos.titleLarge),
        const SizedBox(height: BichuEspaco.e4),
        ..._corpo(cores),
      ],
    );
  }

  List<Widget> _corpo(BichuCores cores) {
    return switch (_fase) {
      // Esqueleto do paragrafo 11.3: moldura e barras em `surface-sunken`. Um
      // indicador circular no lugar disto nao diria que o que vem e uma lista.
      _Fase.carregando when _pets.isEmpty => const <Widget>[
          _EsqueletoDeCartao(),
          SizedBox(height: BichuEspaco.e3),
          _EsqueletoDeCartao(),
        ],
      _Fase.carregando => _cartoes(),
      _Fase.lista when _pets.isEmpty => <Widget>[
          EstadoVazio(
            titulo: MeusPets.tituloDoVazio,
            explicacao: MeusPets.explicacaoDoVazio,
            // Acao **unica** em destaque (criterio 6): nao ha um segundo botao
            // competindo com ela nesta caixa.
            acao: BotaoPrimario(
              rotulo: 'Cadastrar meu pet',
              aoTocar: () => context.push(Rotas.cadastrarPet),
            ),
          ),
        ],
      _Fase.lista => _cartoes(),
      _Fase.falhaComCache => <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: MeusPets.faixaDeCache,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
          const SizedBox(height: BichuEspaco.e4),
          ..._cartoes(),
        ],
      _Fase.falhaSemCache => <Widget>[
          FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
        ],
    };
  }

  /// Os cartoes, um por pet, na ordem em que o servidor mandou.
  ///
  /// Sem paginacao e sem corte: o contrato fixa o teto em 20 pets por conta e
  /// a `ListView` da `TelaDeAba` ja rola (criterio 14). Um `ListView` aninhado
  /// aqui dentro criaria uma segunda area de rolagem dentro da primeira.
  List<Widget> _cartoes() {
    final saida = <Widget>[];
    for (var i = 0; i < _pets.length; i++) {
      if (i > 0) saida.add(const SizedBox(height: BichuEspaco.e3));
      saida.add(CartaoDePet(pet: _pets[i]));
    }
    return saida;
  }
}

/// O esqueleto de um cartao: moldura mais tres barras (paragrafo 11.3).
class _EsqueletoDeCartao extends StatelessWidget {
  const _EsqueletoDeCartao();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Container(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surface,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Moldura(
              largura: BichuMoldura.larguraFotoSm,
              estado: EstadoDaMoldura.carregando,
            ),
            const SizedBox(width: BichuEspaco.e4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _Barra(cor: cores.surfaceSunken, fracao: 0.6),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.9),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        // A altura acompanha a linha de `body-sm` em vez de ser fixa: com a
        // fonte do sistema em 200% um esqueleto de altura fixa fica menor que
        // o texto que ele representa e a lista pula quando carrega.
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
