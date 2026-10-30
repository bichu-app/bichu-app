import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import 'conexoes/tela_minhas_conexoes.dart';
import 'conexoes/tela_pedidos_de_conexao.dart';
import 'seguranca/tela_de_bloqueados.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A FORMA de um sub-destino, e por que ela decide se ele entra na gaveta.
enum FormaDoSubDestino {
  /// Tem endereco proprio e e alcancavel por menu.
  destino,

  /// Tela de detalhe de um item de lista.
  detalhe,

  /// Folha inferior (design system 11.9).
  folhaInferior,

  /// Acao ou campo na propria tela: busca, seletor de cidade, `Vou participar`,
  /// `Encerrar caso`, `Sair`.
  acaoNaTela,

  /// O conteudo da secao, ou um bloco dentro de uma tela que ja existe.
  conteudoDaSecao,

  /// Faixa persistente no topo, ou estado de tela.
  faixaOuEstado,
}

/// O estado de construcao de um sub-destino, com a mesma regua de 27.5.
enum EstadoDoSubDestino {
  /// Codigo rodando, com tela de verdade do outro lado.
  existe,

  /// O mapa declara e ninguem construiu.
  planejada,
}

/// Uma linha do inventario de 27.5.
class SubDestino {
  const SubDestino({
    required this.rotulo,
    required this.forma,
    required this.estado,
    this.rota,
    this.icone,
  }) : assert(
         !(forma == FormaDoSubDestino.destino &&
                 estado == EstadoDoSubDestino.existe &&
                 rota != null) ||
             icone != null,
         'Sub-destino VIVO sem icone. Item de gaveta sem glifo volta a ser a '
         'linha de texto que o cliente mandou enfeitar em 18/10/2026: '
         '"nos subitens dos menus voce deve colocar icones tambem". Escolha '
         'o glifo na familia embutida (Material Symbols, design system 10.1) '
         'e confira que nenhum outro item da MESMA secao ja o usa -- a '
         'colisao de dois sentidos num glifo so e a que o cliente leu no '
         'aparelho em 22/09.',
       );

  /// O nome curto, como a UX 27.5 o escreve.
  final String rotulo;

  final FormaDoSubDestino forma;
  final EstadoDoSubDestino estado;

  /// O endereco, quando existe.
  final String? rota;

  /// O GLIFO do item, da familia embutida do Flutter (Material Symbols, a
  /// familia fechada do design system 10.1).
  final IconData? icone;

  /// Se ele vira item da gaveta.
  bool get viraItem =>
      forma == FormaDoSubDestino.destino &&
      estado == EstadoDoSubDestino.existe &&
      rota != null;

  /// Se ele e destino de menu que **ainda nao existe**.
  bool get pendente =>
      forma == FormaDoSubDestino.destino &&
      estado == EstadoDoSubDestino.planejada;
}

/// O inventario de sub-destinos de 27.5, por rota de secao.
abstract final class RegistroDeSubDestinos {
  static const Map<String, List<SubDestino>>
  porSecao = <String, List<SubDestino>>{
    Rotas.pets: <SubDestino>[
      SubDestino(
        rotulo: 'Caso aberto',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Aviso de cadastro incompleto',
        forma: FormaDoSubDestino.faixaOuEstado,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Lista de pets perdidos da região',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Adoções',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Busca',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Ordenação',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Seletor de cidade',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Escanear uma tag',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.escanear,
        icone: Icons.qr_code_scanner,
      ),
      SubDestino(
        rotulo: 'Registrar achado avulso',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.registrarAchado,
        icone: Icons.campaign_outlined,
      ),
      SubDestino(
        rotulo: 'Possíveis correspondências',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Conversa mediada',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Cartaz',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Encerrar caso',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Detalhe do pet perdido',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Três estados vazios',
        forma: FormaDoSubDestino.faixaOuEstado,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    Rotas.rede: <SubDestino>[
      SubDestino(
        rotulo: 'Eventos da região',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Detalhe do evento',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Vou participar',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Feed da comunidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Mensagens',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Profissionais e estabelecimentos',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'ONGs',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Pets de ONGs para adoção',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Avaliações da comunidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros do diretório',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Detalhe do profissional ou da ONG',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Convidar um profissional',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Reivindicar este perfil',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    Rotas.mural: <SubDestino>[
      SubDestino(
        rotulo: 'Publicações das conexões',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    Rotas.loja: <SubDestino>[
      SubDestino(
        rotulo: 'Catálogo próprio',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros de categoria',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Plaquinha de reposição',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Doações',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Carrinho e pedido',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Meus pedidos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    Rotas.mensagens: <SubDestino>[
      SubDestino(
        rotulo: 'Lista de conversas',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Conversa',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    Rotas.perfil: <SubDestino>[
      SubDestino(
        rotulo: 'Crachá de identidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Meus pets',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Cadastrar pet',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.cadastrarPet,
        icone: Icons.note_add_outlined,
      ),
      SubDestino(
        rotulo: 'A tag do meu pet',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Escanear uma tag',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.escanear,
        icone: Icons.qr_code_scanner,
      ),
      SubDestino(
        rotulo: 'Convidar vizinhos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: TelaDePedidosDeConexao.titulo,
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.pedidosDeConexao,
        icone: Icons.person_add_alt_outlined,
      ),
      SubDestino(
        rotulo: TelaDeMinhasConexoes.titulo,
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.minhasConexoes,
        icone: Icons.people_outline,
      ),
      SubDestino(
        rotulo: TelaDeBloqueados.titulo,
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.pessoasBloqueadas,
        icone: Icons.block_outlined,
      ),
      SubDestino(
        rotulo: 'Meus dados',
        forma: FormaDoSubDestino.destino,
        icone: Icons.manage_accounts_outlined,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.dadosPessoais,
      ),
      SubDestino(
        rotulo: 'Notificações',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Transferir um pet',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Termos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Sair da conta',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Excluir a conta',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
  };

  /// O inventario inteiro, numa lista so.
  static List<SubDestino> get todos => <SubDestino>[
    for (final linhas in porSecao.values) ...linhas,
  ];

  /// Os itens vivos de [rotaDaSecao], na ordem do documento.
  static List<SubDestino> itensDe(String rotaDaSecao) {
    final linhas = porSecao[rotaDaSecao];
    if (linhas == null) {
      throw ArgumentError.value(
        rotaDaSecao,
        'rotaDaSecao',
        'nao tem linha no registro de sub-destinos (UX 27.5)',
      );
    }
    return linhas.where((s) => s.viraItem).toList(growable: false);
  }

  /// OS DESTINOS GLOBAIS, que toda secao mostra no fim da gaveta.
  static const List<SubDestino> globais = <SubDestino>[
    SubDestino(
      rotulo: 'Escanear uma tag',
      forma: FormaDoSubDestino.destino,
      estado: EstadoDoSubDestino.existe,
      rota: Rotas.escanear,
      icone: Icons.qr_code_scanner,
    ),
  ];

  /// Os destinos de menu de [rotaDaSecao] que ainda **nao** existem.
  static List<SubDestino> pendentesDe(String rotaDaSecao) {
    final linhas = porSecao[rotaDaSecao];
    if (linhas == null) {
      throw ArgumentError.value(
        rotaDaSecao,
        'rotaDaSecao',
        'nao tem linha no registro de sub-destinos (UX 27.5)',
      );
    }
    return linhas.where((s) => s.pendente).toList(growable: false);
  }
}

/// Os textos da gaveta, num lugar so.
abstract final class TextosDaGaveta {
  /// O nome acessivel do gatilho (11.23.3).
  static const String abrirAGaveta = 'Abrir o submenu desta seção';
}

/// A gaveta lateral: **o submenu da secao em que a pessoa esta**, e nada mais.
class GavetaDeSecoes extends StatelessWidget {
  const GavetaDeSecoes({required this.rotaDaSecao, super.key});

  /// A secao cujo submenu esta gaveta mostra.
  final String rotaDaSecao;

  @override
  Widget build(BuildContext context) {
    final itens = RegistroDeSubDestinos.itensDe(rotaDaSecao);
    final jaOferecidas = itens.map((i) => i.rota).toSet();
    final globais = RegistroDeSubDestinos.globais
        .where((g) => !jaOferecidas.contains(g.rota))
        .toList(growable: false);
    final cores = BichuColors.of(context).cores;

    return Drawer(
      child: SafeArea(
        child: ListView(
          addSemanticIndexes: false,
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e4,
          ),
          children: <Widget>[
            for (final item in itens)
              ItemDaGaveta(item: item, rotaDaSecao: rotaDaSecao),
            if (itens.isNotEmpty && globais.isNotEmpty)
              Divider(
                height: BichuEspaco.e6,
                thickness: BichuBorda.hairline,
                color: cores.outline,
              ),
            for (final item in globais)
              ItemDaGaveta(item: item, rotaDaSecao: rotaDaSecao),
          ],
        ),
      ),
    );
  }
}

/// Um caminho vivo: **uma linha, so o rotulo**.
class ItemDaGaveta extends StatelessWidget {
  const ItemDaGaveta({
    required this.item,
    required this.rotaDaSecao,
    super.key,
  });

  final SubDestino item;

  /// A secao a que este item pertence.
  final String rotaDaSecao;

  /// A chave de um item, para o portao apontar para UM item e nao para dois.
  static Key chaveDe(String rotaDaSecao, String rotulo) =>
      ValueKey<String>('gaveta$rotaDaSecao/$rotulo');

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final rota = item.rota!;

    return ListTile(
      key: chaveDe(rotaDaSecao, item.rotulo),
      contentPadding: EdgeInsets.zero,
      minTileHeight: BichuAlvoDeToque.critico,
      leading: Icon(item.icone!, color: cores.textPrimary),
      title: Text(item.rotulo),
      trailing: Icon(Icons.chevron_right, color: cores.textSecondary),
      onTap: () {
        final roteador = GoRouter.of(context);
        Scaffold.of(context).closeDrawer();
        roteador.push(rota);
      },
    );
  }
}

/// O gatilho da gaveta, na barra de topo.
class BotaoDaGaveta extends StatelessWidget {
  const BotaoDaGaveta({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: TextosDaGaveta.abrirAGaveta,
      icon: const Icon(Icons.menu),
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      onPressed: ControleDaGaveta.of(context).abrir,
    );
  }
}

/// O caminho do gatilho ate a gaveta da casca.
class ControleDaGaveta extends InheritedWidget {
  const ControleDaGaveta({
    required this.abrir,
    required this.temSubDestinos,
    required super.child,
    super.key,
  });

  final VoidCallback abrir;

  /// Se a secao ATUAL tem algum sub-destino construido.
  final bool temSubDestinos;

  /// O controle, ou nulo quando nao ha casca acima.
  static ControleDaGaveta? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ControleDaGaveta>();
  }

  static ControleDaGaveta of(BuildContext context) {
    final controle = maybeOf(context);
    if (controle == null) {
      throw FlutterError(
        'BotaoDaGaveta montado fora de CascaComAbas. O gatilho so existe na '
        'raiz de secao, e a raiz de secao vive dentro da casca -- que e quem '
        'carrega a gaveta e a barra de baixo no mesmo Scaffold.',
      );
    }
    return controle;
  }

  @override
  bool updateShouldNotify(ControleDaGaveta anterior) =>
      abrir != anterior.abrir || temSubDestinos != anterior.temSubDestinos;
}
