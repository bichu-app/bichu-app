import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/mural_api.dart';
import '../api/modelos_perdido.dart';
import '../api/modelos_pet.dart';
import '../intencao/cadastro_de_pet_como_intencao.dart';
import '../intencao/caso_de_perdido_como_intencao.dart';
import '../intencao/leitura_como_intencao.dart';
import '../achado/rascunho_do_achado.dart';
import '../perdido/rascunho_do_caso.dart';
import '../sessao/controlador_de_sessao.dart';
import '../telas/abas.dart';
import '../telas/casca_com_abas.dart';
import '../telas/conta/tela_criar_conta.dart';
import '../telas/conta/tela_entrar.dart';
import '../telas/conta/tela_esqueci_minha_senha.dart';
import '../telas/conta/tela_verifique_seu_email.dart';
import '../telas/escanear/tela_do_pet_da_tag.dart';
import '../telas/escanear/tela_leitor_de_qr.dart';
import '../telas/pet/rascunho_de_pet.dart';
import '../telas/pet/resultado_do_cadastro.dart';
import '../telas/pet/tela_cadastrar_foto.dart';
import '../telas/pet/tela_cadastrar_identificacao.dart';
import '../telas/pet/tela_cadastrar_sinais.dart';
import '../telas/pet/tela_detalhe_do_pet.dart';
import '../telas/pet/tela_editar_pet.dart';
import '../telas/pet/tela_pet_cadastrado.dart';
import '../telas/pet/tela_acompanhar_plaquinha.dart';
import '../telas/pet/tela_solicitar_plaquinha.dart';
import '../api/vitrine_api.dart';
import '../escopo.dart';
import '../telas/ajuda/tela_de_duvida.dart';
import '../telas/conexoes/tela_de_conexoes.dart';
import '../api/pessoas_api.dart';
import '../api/seguranca_api.dart';
import '../telas/pessoa/tela_perfil_de_pessoa.dart';
import '../telas/mural/publicar_no_mural.dart';
import '../telas/perfil/tela_endereco_de_entrega.dart';
import '../telas/perfil/vitrine_de_fotos.dart';
import '../telas/mensagens/area_de_mensagens.dart';
import '../telas/mensagens/tela_da_conversa.dart';
import '../api/modelos_notificacao.dart';
import '../telas/notificacoes/caixa_de_notificacoes.dart';
import '../telas/notificacoes/comunicado.dart';
import '../telas/perfil/meus_achados.dart';
import '../telas/perfil/meus_eventos.dart';
import '../telas/perfil/meus_pets.dart';
import '../telas/perfil/tela_dados_pessoais.dart';
import '../telas/perdido/resultado_da_abertura.dart';
import '../telas/perdido/tela_alcance_do_alerta.dart';
import '../telas/perdido/tela_de_quem_e_o_caso.dart';
import '../telas/perdido/tela_de_retomada.dart';
import '../telas/perdido/tela_do_caso_publico.dart';
import '../telas/perdido/tela_onde_e_quando.dart';
import '../telas/achado/resultado_do_achado.dart';
import '../telas/achado/tela_achado_registrado.dart';
import '../telas/achado/tela_do_achado.dart';
import '../telas/achado/tela_encontrei_este_pet.dart';
import '../telas/achado/tela_registrar_achado.dart';
import '../intencao/achado_como_intencao.dart';
import '../telas/loja/produto_da_loja.dart';
import '../telas/perto/pagina_do_local.dart';
import '../telas/perto/sugerir_profissional.dart';
import '../telas/perto/tela_de_minhas_indicacoes.dart';
import '../telas/rede/criar_encontro.dart';
import '../telas/rede/encontro_da_rede.dart';
import '../telas/tela_de_abertura.dart';

/// Os enderecos do app.
abstract final class Rotas {
  static const String abertura = '/';

  /// As CINCO secoes da barra, na ordem em que a barra as mostra (UX 27.2).
  static const String pets = '/pets';
  static const String rede = '/rede';

  /// O nome do parametro de consulta que diz **em qual aba a `Rede` abre**.
  static const String parametroDaAbaDaRede = 'aba';

  /// O endereco da `Rede` **aberta na aba `Usuarios`**.
  static const String redeNaBuscaDePessoas = '$rede?$parametroDaAbaDaRede=usuarios';

  /// O encontro da `Rede`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a agenda.
  static const String encontroDaRede = '/rede/encontros/:slug';

  static const String parametroDoEncontro = 'slug';

  static String encontroDaRedeDe(String slug) =>
      '/rede/encontros/${Uri.encodeComponent(slug)}';

  /// **Marcar um encontro da `Rede`: IRMA da casca, e nao sob o ramo.**
  static const String criarEncontroDaRede = '/rede/encontros/novo';

  /// **A SECAO `Mural`: a linha do tempo das publicacoes (19/10/2026).**
  static const String mural = '/mural';

  /// **Publicar no Mural: IRMA da casca, e nao sob o ramo** (20/10/2026).
  static const String publicarNoMural = '/mural/publicar';

  /// **Indicar um profissional: irma da casca**, pela mesma razao de
  /// [criarEncontroDaRede].
  static const String sugerirProfissional = '/rede/indicacoes/nova';

  /// **`Minhas indicacoes`: PORTA PROPRIA, e nao mais aba (19/10/2026).**
  static const String minhasIndicacoes = '/rede/indicacoes';

  /// A pagina de um local da aba `Comunidade`, **sob o ramo da `Rede`**.
  static const String localDoPerto = 'locais/:slug';

  static const String parametroDoLocal = 'slug';

  /// O endereco do local [slug].
  static String localDoPertoDe(String slug) =>
      '/rede/locais/${Uri.encodeComponent(slug)}';
  static const String loja = '/loja';

  /// O produto da `Loja`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a vitrine onde a pessoa estava, com a busca e o filtro dela
  /// intactos.
  static const String produtoDaLoja = 'produtos/:slug';

  static const String parametroDoProduto = 'slug';

  /// O endereco do produto [slug].
  static String produtoDaLojaDe(String slug) =>
      '/loja/produtos/${Uri.encodeComponent(slug)}';

  /// A tela da conta. **Deixou de ser ramo da casca em 19/10**, quando o
  /// cliente tirou `Perfil` da barra de baixo e pos a porta dela na foto da
  /// barra de topo.
  static const String perfil = '/perfil';

  /// A AREA DE MENSAGENS: o endereco, e **nao** a tela.
  static const String mensagens = '/mensagens';

  /// A CAIXA DE NOTIFICACOES (18/10/2026): o conteudo do sino.
  static const String notificacoes = '/notificacoes';

  /// `Pedidos de conexao` (18/10/2026): as duas caixas, recebidos e enviados.
  static const String pedidosDeConexao = '/conexoes/pedidos';

  /// **`Conexoes` (22/10/2026): a lista das PROPRIAS conexoes aceitas.**
  static const String minhasConexoes = '/conexoes';

  /// **O PERFIL DE OUTRA PESSOA** (19/10/2026, fatia G).
  static const String perfilDePessoa = '/pessoa/:$parametroDoApelido';

  /// O nome do parametro de caminho de [perfilDePessoa].
  static const String parametroDoApelido = 'apelido';

  /// O endereco do perfil de `apelido`.
  static String perfilDe(String apelido) {
    final limpo = apelido.startsWith('@') ? apelido.substring(1) : apelido;
    return '/pessoa/$limpo';
  }

  /// `Perfil` > `Minhas fotos`: a VITRINE do proprio tutor (18/10/2026).
  static const String minhaVitrine = '/perfil/minhas-fotos';

  /// `Perfil` › `Meus dados`: os dados pessoais do tutor (18/10/2026).
  static const String dadosPessoais = '/perfil/dados';

  /// `Editar pet` > `Endereço de entrega`: o endereço de entrega **daquele
  /// pet** (27/10/2026).
  static const String enderecoDeEntrega = '/pets/:petId/endereco-de-entrega';

  /// O caminho de [enderecoDeEntrega] com o pet dentro.
  static String enderecoDeEntregaDoPet(String petId) =>
      '/pets/${Uri.encodeComponent(petId)}/endereco-de-entrega';

  /// `Perfil` > `Meus achados`: a lista dos avisos de achado desta conta.
  static const String meusAchados = '/perfil/achados';

  /// `Perfil` > `Meus eventos`: os encontros que a conta criou (19/10/2026).
  static const String meusEventos = '/perfil/eventos';

  /// `Perfil` > `Meus pets`, a lista INTEIRA (22/10/2026, pedido do cliente).
  static const String meusPets = '/perfil/pets';

  /// `Perfil` > `Pessoas bloqueadas` (19/10/2026, decisao do cliente).
  static const String pessoasBloqueadas = '/perfil/bloqueados';

  /// `Perfil` > `Ajuda` (29/10/2026, pedido do cliente: *"no menu do usuario,
  /// adicione um botao de ajuda, que abrira uma pagina com um formulario de
  /// duvida"*).
  static const String ajuda = '/perfil/ajuda';

  /// `Pets` > `Adoções`: sub-destino com porta propria (UX 27.2.4).
  static const String adocoes = '/adocoes';

  /// O leitor de QR. **Deixou de ser aba e continua sendo endereco.**
  static const String escanear = '/escanear';

  /// `/t/<codigo>`: F2.2 e F2.3, o pet que o codigo da tag resolveu.
  static const String petDaTag = '/t/:codigo';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoCodigoDaTag = 'codigo';

  /// O endereco de F2.2/F2.3 para [codigo].
  static String petDaTagDe(String codigo) =>
      '/t/${Uri.encodeComponent(codigo)}';

  /// `/p/<share_token>`: a PAGINA INTERNA de um pet perdido, na visao de quem
  /// nao e o tutor (cliente, 18/10/2026).
  static const String casoPublico = '/p/:shareToken';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoShareToken = 'shareToken';

  /// O endereco da pagina publica do caso de [shareToken].
  static String casoPublicoDe(String shareToken) =>
      '/p/${Uri.encodeComponent(shareToken)}';

  static const String entrar = '/entrar';
  static const String criarConta = '/criar-conta';
  static const String verifiqueSeuEmail = '/verifique-seu-email';
  static const String esqueciMinhaSenha = '/esqueci-minha-senha';

  /// Para onde vai quem acabou de abrir o app, ou acabou de entrar.
  static String destinoDoArranque({required bool logado}) => rede;

  /// Os tres passos do cadastro de pet (F1.3, F1.4, F1.5) e a confirmacao
  /// (F1.6).
  static const String cadastrarPet = '/pets/novo';
  static const String cadastrarPetFoto = '/pets/novo/foto';
  static const String cadastrarPetSinais = '/pets/novo/sinais';
  static const String petCadastrado = '/pets/cadastrado';

  /// O pedido da plaquinha da coleira: o destino que o botao `Fazer a tag da
  /// coleira` nunca teve.
  static const String solicitarPlaquinha = '/pets/plaquinha';

  /// A PAGINA DE ACOMPANHAMENTO do pedido da plaquinha (cliente, 18/10).
  static const String acompanharPlaquinha = '/pets/plaquinha/:petId';

  /// O endereco de [acompanharPlaquinha] para um pet.
  static String acompanharPlaquinhaDe(String petId) =>
      '/pets/plaquinha/${Uri.encodeComponent(petId)}';

  /// O fluxo de marcar como perdido: F3.0, F3.1, F3.2 e F3.3.
  static const String escolherPetPerdido = '/pets/perdido';
  static const String marcarPerdido = '/pets/perdido/onde-e-quando';
  static const String marcarPerdidoAlcance = '/pets/perdido/alcance';
  static const String casoAberto = '/pets/perdido/caso';

  /// O achado avulso (F3.5, BICHUS-35).
  static const String registrarAchado = '/achados/novo';

  /// O desfecho de F3.5, nos dois estados (registrado e na fila).
  static const String achadoRegistrado = '/achados/registrado';

  /// **Achei ESTE pet**: o destino de `Encontrei este animal` na pagina publica
  /// de um caso (defeito relatado pelo cliente em 26/10/2026).
  static const String encontreiEstePet = '/achados/encontrei';

  /// O padrao do achado pelo endereco dele.
  static const String achado = '/achados/:achadoId';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoAchadoId = 'achadoId';

  /// O endereco do achado [achadoId].
  static String achadoDe(String achadoId) =>
      '/achados/${Uri.encodeComponent(achadoId)}';

  /// O padrao de `T.1`. Use [detalheDoPetDe] para montar o endereco.
  static const String detalheDoPet = '/pets/:petId';

  /// A edicao (BICHUS-61), filha do detalhe.
  static const String editarPet = '/pets/:petId/editar';

  /// O nome do parametro de caminho, num lugar so: quem monta o endereco e quem
  /// o le usam a mesma palavra.
  static const String parametroDoPetId = 'petId';

  /// O endereco de T.1 para [petId].
  static String detalheDoPetDe(String petId) =>
      '/pets/${Uri.encodeComponent(petId)}';

  static String editarPetDe(String petId) => '${detalheDoPetDe(petId)}/editar';

  /// O endereco da tela de retorno de um envelope de intencao (UX 8.3).
  static String? rotaDaTelaDeUx(String telaDeUx) {
    return switch (telaDeUx.toUpperCase()) {
      'F1.3' => cadastrarPet,
      'F1.4' => cadastrarPetFoto,
      'F1.5' => cadastrarPetSinais,
      'F1.6' => petCadastrado,
      'F3.0' => escolherPetPerdido,
      'F3.1' => marcarPerdido,
      'F3.2' => marcarPerdidoAlcance,
      'F3.3' => casoAberto,
      'F3.5' => registrarAchado,
      'REDE.ENCONTRO' => rede,
      telaDeUxDaLeitura => pets,
      _ => null,
    };
  }
}

RascunhoDePet? _rascunhoDoExtra(Object? extra) {
  return switch (extra) {
    RascunhoDePet rascunho => rascunho,
    RetomadaDoCadastro retomada => retomada.rascunho,
    _ => null,
  };
}

final GlobalKey<NavigatorState> _navegadorRaiz = GlobalKey<NavigatorState>(
  debugLabel: 'raiz',
);

/// Monta o roteador.
void ligarPortaDoPerfilDoParticipante() {
  PortaDoPerfilDoParticipante.destino = (outro) {
    final apelido = outro.handle;
    if (apelido == null || apelido.isEmpty) return null;
    return Rotas.perfilDe(apelido);
  };
}

GoRoute _comBarraFixa({
  required String path,
  required Widget Function(BuildContext, GoRouterState) builder,
}) {
  return GoRoute(
    path: path,
    builder: (context, estado) => CascaFixa(child: builder(context, estado)),
  );
}

/// A COSTURA DO DESTINO DE UMA NOTIFICACAO (cliente, 20/10/2026).
void ligarPortaDoDestinoDoAviso() {
  PortaDoDestinoDoAviso.destino = (aviso) {
    final destino = aviso.destino;
    final ref = aviso.destinoRef;
    if (destino == null || ref == null || ref.isEmpty) return null;
    return switch (destino) {
      DestinoDoAviso.pet => Rotas.detalheDoPetDe(ref),
      DestinoDoAviso.achado => Rotas.achadoDe(ref),
      DestinoDoAviso.casoPublico => Rotas.casoPublicoDe(ref),
      DestinoDoAviso.encontro => Rotas.encontroDaRedeDe(ref),
      DestinoDoAviso.indicacao => Rotas.minhasIndicacoes,
      DestinoDoAviso.pedidoDaPlaquinha => Rotas.acompanharPlaquinhaDe(ref),
      DestinoDoAviso.comunicado => RotasDoComunicado.de(ref),
      DestinoDoAviso.pedidosDeConexao => Rotas.pedidosDeConexao,
    };
  };
}

Widget _asConexoes(
  BuildContext context, {
  AbaDeConexoes aba = AbaDeConexoes.conexoes,
}) {
  final escopo = Escopo.of(context);
  return TelaDeConexoes(
    conexoes: escopo.conexoes,
    seguranca: SegurancaApi(escopo.api),
    abaInicial: aba,
  );
}

GoRouter criarRoteador(ControladorDeSessao sessao) {
  ligarPortaDoPerfilDoParticipante();
  ligarPortaDoDestinoDoAviso();
  return GoRouter(
    navigatorKey: _navegadorRaiz,
    initialLocation: Rotas.abertura,
    refreshListenable: sessao,
    redirect: (context, estado) {
      final carregando = sessao.estado == EstadoDaSessao.carregando;
      final naAbertura = estado.matchedLocation == Rotas.abertura;
      if (carregando) return naAbertura ? null : Rotas.abertura;
      if (naAbertura) {
        return Rotas.destinoDoArranque(
          logado: sessao.estado == EstadoDaSessao.logado,
        );
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: Rotas.abertura,
        builder: (context, estado) => const TelaDeAbertura(),
      ),
      GoRoute(
        path: Rotas.entrar,
        builder: (context, estado) =>
            TelaEntrar(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.criarConta,
        builder: (context, estado) =>
            TelaCriarConta(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.verifiqueSeuEmail,
        builder: (context, estado) =>
            TelaVerifiqueSeuEmail(email: estado.extra as String? ?? ''),
      ),
      GoRoute(
        path: Rotas.esqueciMinhaSenha,
        builder: (context, estado) =>
            TelaEsqueciMinhaSenha(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.escanear,
        builder: (context, estado) => const TelaLeitorDeQr(),
      ),
      GoRoute(
        path: Rotas.petDaTag,
        builder: (context, estado) {
          final tag = estado.extra;
          if (tag is! TagResolvida) return const TelaLeitorDeQr();
          final codigo =
              estado.pathParameters[Rotas.parametroDoCodigoDaTag] ?? '';
          if (codigo.isEmpty) return const TelaLeitorDeQr();
          return TelaDoPetDaTag(tag: tag, codigo: codigo);
        },
      ),
      GoRoute(
        path: Rotas.casoPublico,
        builder: (context, estado) {
          final token =
              estado.pathParameters[Rotas.parametroDoShareToken] ?? '';
          if (token.isEmpty) return const AbaPets();
          return TelaDoCasoPublico(shareToken: token);
        },
      ),

      GoRoute(
        path: Rotas.adocoes,
        builder: (context, estado) => const TelaDeAdocoes(),
      ),
      GoRoute(
        path: Rotas.cadastrarPet,
        builder: (context, estado) => TelaCadastrarIdentificacao(
          rascunhoExistente: _rascunhoDoExtra(estado.extra),
        ),
      ),
      GoRoute(
        path: Rotas.cadastrarPetFoto,
        builder: (context, estado) {
          final rascunho = _rascunhoDoExtra(estado.extra);
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarFoto(rascunho: rascunho);
        },
      ),
      GoRoute(
        path: Rotas.cadastrarPetSinais,
        builder: (context, estado) {
          final extra = estado.extra;
          final rascunho = _rascunhoDoExtra(extra);
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarSinais(
            rascunho: rascunho,
            erroInicial: extra is RetomadaDoCadastro ? extra.erro : null,
          );
        },
      ),
      GoRoute(
        path: Rotas.escolherPetPerdido,
        builder: (context, estado) {
          final pets = estado.extra;
          if (pets is! List<Pet> || pets.isEmpty) return const AbaPerfil();
          return TelaDeQuemEOCaso(pets: pets);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdido,
        builder: (context, estado) {
          final extra = estado.extra;
          if (extra is RetomadaDoCaso) {
            return TelaDeRetomadaDoCaso(retomada: extra);
          }
          if (extra is! RascunhoDoCaso) return const AbaPerfil();
          return TelaOndeEQuando(rascunho: extra);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdidoAlcance,
        builder: (context, estado) {
          final rascunho = estado.extra;
          if (rascunho is! RascunhoDoCaso) return const AbaPerfil();
          return TelaAlcanceDoAlerta(rascunho: rascunho);
        },
      ),
      GoRoute(
        path: Rotas.publicarNoMural,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          return PublicarNoMural(
            escrita: MuralApi(escopo.api),
            camera: escopo.camera,
            envio: escopo.envioDeFoto,
          );
        },
      ),
      GoRoute(
        path: Rotas.criarEncontroDaRede,
        builder: (context, estado) => const TelaCriarEncontro(),
      ),
      GoRoute(
        path: Rotas.sugerirProfissional,
        builder: (context, estado) => const TelaSugerirProfissional(),
      ),
      GoRoute(
        path: Rotas.minhasIndicacoes,
        builder: (context, estado) => const TelaDeMinhasIndicacoes(),
      ),
      GoRoute(
        path: Rotas.registrarAchado,
        builder: (context, estado) {
          final extra = estado.extra;
          if (extra is RetomadaDoAchado) {
            return TelaRegistrarAchado(
              rascunho: extra.rascunho,
              erroInicial: extra.erro?.texto,
            );
          }
          return TelaRegistrarAchado(
            rascunho: extra is RascunhoDoAchado ? extra : null,
          );
        },
      ),
      GoRoute(
        path: Rotas.encontreiEstePet,
        builder: (context, estado) {
          final extra = estado.extra;
          if (extra is! PerdidoPublico) return const TelaRegistrarAchado();
          return TelaEncontreiEstePet(perdido: extra);
        },
      ),
      GoRoute(
        path: Rotas.achadoRegistrado,
        builder: (context, estado) {
          final resultado = estado.extra;
          if (resultado is! ResultadoDoAchado) {
            return const TelaRegistrarAchado();
          }
          return TelaAchadoRegistrado(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.achado,
        builder: (context, estado) {
          final id = estado.pathParameters[Rotas.parametroDoAchadoId] ?? '';
          return TelaDoAchado(achadoId: id);
        },
      ),
      GoRoute(
        path: Rotas.casoAberto,
        builder: (context, estado) {
          final resultado = estado.extra;
          if (resultado is! ResultadoDaAbertura) return const AbaPerfil();
          return TelaCasoAberto(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.petCadastrado,
        builder: (context, estado) {
          final resultado = estado.extra as ResultadoDoCadastro?;
          if (resultado == null) return const TelaCadastrarIdentificacao();
          return TelaPetCadastrado(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.solicitarPlaquinha,
        builder: (context, estado) {
          final petId = estado.extra;
          return TelaSolicitarPlaquinha(
            petIdInicial: petId is String ? petId : null,
          );
        },
      ),
      GoRoute(
        path: Rotas.acompanharPlaquinha,
        builder: (context, estado) => TelaAcompanharPlaquinha(
          petId: estado.pathParameters['petId'] ?? '',
        ),
      ),
      GoRoute(
        path: Rotas.detalheDoPet,
        builder: (context, estado) => TelaDetalheDoPet(
          petId: estado.pathParameters[Rotas.parametroDoPetId]!,
        ),
      ),
      GoRoute(
        path: Rotas.editarPet,
        builder: (context, estado) {
          final pet = estado.extra;
          if (pet is! Pet) {
            return TelaDetalheDoPet(
              petId: estado.pathParameters[Rotas.parametroDoPetId]!,
            );
          }
          return TelaEditarPet(pet: pet);
        },
      ),
      GoRoute(
        path: Rotas.dadosPessoais,
        builder: (context, estado) => const TelaDadosPessoais(),
      ),
      GoRoute(
        path: Rotas.enderecoDeEntrega,
        builder: (context, estado) => TelaEnderecoDeEntrega(
          petId: estado.pathParameters['petId'] ?? '',
        ),
      ),
      GoRoute(
        path: Rotas.meusAchados,
        builder: (context, estado) => const MeusAchados(),
      ),
      GoRoute(
        path: Rotas.meusEventos,
        builder: (context, estado) => const MeusEventos(),
      ),
      GoRoute(
        path: Rotas.meusPets,
        builder: (context, estado) => const TelaDeTodosOsPets(),
      ),
      _comBarraFixa(
        path: RotasDeMensagens.area,
        builder: (context, estado) {
        final contadores = Escopo.of(context).contadores;
        return AreaDeMensagens(
          aoContarNaoLidas: contadores.definir,
          aoVerAArea: contadores.marcarMensagensVistas,
        );
      },
      ),
      GoRoute(
        path: RotasDeMensagens.conversa,
        builder: (context, estado) => TelaDaConversa(
          conversaId:
              estado.pathParameters[RotasDeMensagens.parametroDaConversa]!,
        ),
      ),
      _comBarraFixa(
        path: RotasDaCaixa.caixa,
        builder: (context, estado) => const CaixaDeNotificacoes(),
      ),
      GoRoute(
        path: RotasDoComunicado.comunicado,
        builder: (context, estado) => PaginaDoComunicado(
          ref: estado.pathParameters[RotasDoComunicado.parametroDoRef]!,
        ),
      ),
      GoRoute(
        path: Rotas.minhaVitrine,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          final porta = VitrineApi(escopo.api);
          return VitrineDeFotosDoUsuario(
            api: porta,
            escrita: porta,
            camera: escopo.camera,
            envio: escopo.envioDeFoto,
          );
        },
      ),
      GoRoute(
        path: Rotas.minhasConexoes,
        builder: (context, estado) => _asConexoes(context),
      ),
      GoRoute(
        path: Rotas.pedidosDeConexao,
        builder: (context, estado) =>
            _asConexoes(context, aba: AbaDeConexoes.pendentes),
      ),
      GoRoute(
        path: Rotas.pessoasBloqueadas,
        builder: (context, estado) =>
            _asConexoes(context, aba: AbaDeConexoes.bloqueados),
      ),
      GoRoute(
        path: Rotas.ajuda,
        builder: (context, estado) => const TelaDeDuvida(),
      ),
      GoRoute(
        path: Rotas.perfilDePessoa,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          final convite = estado.extra;
          return TelaDePerfilDePessoa(
            apelido: estado.pathParameters[Rotas.parametroDoApelido] ?? '',
            pessoas: PessoasApi(escopo.api),
            conexoes: escopo.conexoes,
            seguranca: SegurancaApi(escopo.api),
            podeAgirNaComunidade: podeCriarNaComunidade(escopo.sessao),
            tokenDoConvite: convite is String && convite.isNotEmpty ? convite : null,
            cacheDeImagens: escopo.cacheDeImagens,
          );
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, estado, navegacao) =>
            CascaComAbas(navegacao: navegacao),
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.pets,
                builder: (context, estado) => const AbaPets(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.rede,
                builder: (context, estado) => const AbaRede(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.localDoPerto,
                    builder: (context, estado) => PaginaDoLocal(
                      slug: estado.pathParameters[Rotas.parametroDoLocal] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.mural,
                builder: (context, estado) => const AbaMural(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.loja,
                builder: (context, estado) => const AbaLoja(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.produtoDaLoja,
                    builder: (context, estado) => TelaDoProduto(
                      slug:
                          estado.pathParameters[Rotas.parametroDoProduto] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.perfil,
                builder: (context, estado) => const AbaPerfil(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: Rotas.encontroDaRede,
        builder: (context, estado) => TelaDoEncontro(
          slug: estado.pathParameters[Rotas.parametroDoEncontro]!,
          distanciaEmMetros: estado.extra is int ? estado.extra! as int : null,
        ),
      ),
    ],
  );
}
