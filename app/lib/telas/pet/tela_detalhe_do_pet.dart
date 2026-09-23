import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import 'textos_do_detalhe.dart';

/// T.1 — Detalhe do pet (UX, secao 7.6.3).
///
/// ## Por que esta tela existe nesta entrega
///
/// **Ela e pre-requisito medido, e nao ampliacao de escopo por gosto.** O
/// criterio 1 da BICHUS-61 e o criterio 1 da BICHUS-60 comecam com a mesma
/// clausula -- _"Dado o detalhe do pet, quando ele abre logado como dono,
/// entao existe ..."_ -- e a ficha da BICHUS-60 declara a tela do UX como
/// "derivada do detalhe do pet". As duas historias penduram as acoes delas
/// numa tela que a BICHUS-62 listou, com todas as letras, em **Fora desta
/// historia**. Nenhuma outra historia a reivindica.
///
/// O que entra aqui e o **minimo que hospeda as duas acoes**, e nao a T.1
/// inteira. Ficam de fora, nomeados e nao esquecidos:
///
/// - **Documentos** e **Historico** (itens 6 e 7 da 7.6.3): nao ha rota no
///   contrato que os alimente;
/// - **`Transferir`**: virou historia propria, dita no "Fora desta historia"
///   da BICHUS-61;
/// - **A acao principal da barra fixa.** A 7.6.3 manda uma, e ela depende do
///   estado: `Marcar como perdida` (BICHUS-21), `Fazer a tag da coleira`
///   (nao ha rota de vinculo para pet ja cadastrado, ver
///   [CartaoDePet.convitePlaquinha]) e `Ver o caso` (F3.3). **As tres apontam
///   para tela que nao existe**, e o criterio 2 da BICHUS-62 proibe renderizar
///   acao sem destino, nem habilitada nem desabilitada. Entao esta tela **nao
///   tem barra de acao fixa**, e isso e o criterio sendo cumprido, nao
///   esquecido.
/// - **`Desativar a tag`** (criterio 1 da BICHUS-60), pelo mesmo teste e por
///   um motivo a mais: `revokePetTag` declara `reauth: []` com
///   `x-reauth-scope: tag_revocation`, e **o app nao tem reautenticacao**.
///   `POST /auth/reauth` esta no contrato e nao ha nada em `app/lib/api` que o
///   chame. Um botao ali receberia 401 `reauthentication-required` e morreria
///   sem saida. A maquinaria e a BICHUS-48.
///
/// ## `Editar` e `Excluir` ficam em texto, no fim
///
/// A 7.6.3 e explicita, e o motivo e de acessibilidade e nao de estetica: sao
/// acoes destrutivas, ficam **longe da acao principal e a mais de 16 dp de
/// qualquer outro alvo**, porque a proximidade produz deslize. Os 16 dp sao o
/// `target.gap-consequencia-alta` do 11.1, o mesmo numero que separa os dois
/// botoes da folha destrutiva.
class TelaDetalheDoPet extends StatefulWidget {
  const TelaDetalheDoPet({required this.petId, super.key});

  final String petId;

  @override
  State<TelaDetalheDoPet> createState() => _TelaDetalheDoPetState();
}

/// Os desfechos de uma abertura. **`foraDaConta` e um deles**, e nao um erro
/// generico: ele tem texto proprio e saida propria.
enum _Fase { carregando, carregado, foraDaConta, falha }

class _TelaDetalheDoPetState extends State<TelaDetalheDoPet> {
  _Fase _fase = _Fase.carregando;
  Pet? _pet;
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
      final pet = await Escopo.of(context).pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = pet;
        _fase = _Fase.carregado;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (_ehForaDaConta(falha)) {
          // **404 e a resposta de "nao e seu" tambem** (ADR-0021). A tela nao
          // tenta descobrir qual dos dois foi, e nao deve: a autorizacao mora
          // na clausula `WHERE` do servidor justamente para que as duas
          // respostas sejam indistinguiveis.
          _fase = _Fase.foraDaConta;
        } else {
          _textoDaFalha = MensagensDeErro.de(falha).texto;
          _fase = _Fase.falha;
        }
      });
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada. Sem este ramo a tela ficava em
      // `_Fase.carregando` para sempre, sem pet e sem saida.
      registrarFalhaInesperada(erro, pilha, onde: 'ao carregar o detalhe do pet');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falha;
      });
    }
  }

  bool _ehForaDaConta(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      (falha.problem.tipo == ProblemTipo.naoEncontrado ||
          falha.problem.status == 404);

  /// Abre a edicao e **recarrega com o que ela devolveu**.
  ///
  /// A tela de edicao entrega o [Pet] ja atualizado pela resposta do `PATCH`:
  /// pintar esse valor evita um `GET` a mais e, principalmente, evita a
  /// janela em que a tela mostra o dado velho depois de a pessoa ter salvado.
  Future<void> _editar() async {
    final pet = _pet;
    if (pet == null) return;
    final atualizado = await context.push<Pet>(
      Rotas.editarPetDe(pet.id),
      extra: pet,
    );
    if (!mounted || atualizado == null) return;
    setState(() => _pet = atualizado);
  }

  /// A exclusao (BICHUS-60).
  ///
  /// **Nada acontece sem a folha confirmar.** O `DELETE` mora dentro do
  /// `aoConfirmar`, que so e chamado pelo botao destrutivo: cancelar, o gesto
  /// de voltar e o arrasto para baixo nao chegam nele.
  Future<void> _excluir() async {
    final pet = _pet;
    if (pet == null) return;
    final escopo = Escopo.of(context);

    final excluiu = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoDetalhe.tituloDaExclusao(pet.nome),
      corpo: TextosDoDetalhe.corpoDaExclusao(pet.nome),
      oQueSome: TextosDoDetalhe.oQueSome(pet),
      // Criterio 4: so quando ha caso aberto.
      avisoExtra: pet.idDoCasoAberto == null
          ? null
          : TextosDoDetalhe.casoAbertoSeraEncerrado(pet.nome),
      rotuloDeConfirmar: TextosDoDetalhe.confirmarExclusao,
      rotuloAcessivelDeConfirmar:
          TextosDoDetalhe.confirmarExclusaoAcessivel(pet.nome),
      aoConfirmar: () => escopo.pets.excluirPet(pet.id),
    );
    if (!mounted || !excluiu) return;

    // **O pet excluido nao pode sobreviver no cache de `Meus pets`.**
    //
    // `CacheDeMeusPets` guarda a ultima lista lida, e ela ainda contem este
    // pet. A lista recarrega ao voltar a ficar visivel, mas se esse `GET`
    // falhar ela cai no cache -- e a pessoa veria, de volta na lista, o pet
    // que acabou de confirmar a exclusao, sem nada explicando. Limpar e a
    // operacao segura: ela nunca expoe dado de outra conta, e o pior desfecho
    // dela e a tela mostrar a falha com `Atualizar` em vez de um pet apagado.
    //
    // **Nao entra entrada nova em `limpezasAoSair`**: este cache ja esta
    // registrado la (`app.dart`), e esta historia nao cria cache nenhum.
    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.excluido(pet.nome));
    context.go(Rotas.perfil);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BarraDeConta(
        titulo: _pet?.nome ?? '',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    return switch (_fase) {
      _Fase.carregando => const Center(child: CircularProgressIndicator()),
      _Fase.foraDaConta => _ForaDaConta(),
      // `_textoDaFalha` nunca e nulo nesta fase: quem a liga sempre o
      // preenche por `MensagensDeErro.de`, que devolve texto para toda falha.
      _Fase.falha => _Falha(
          texto: _textoDaFalha!,
          aoTentarDeNovo: _carregar,
        ),
      _Fase.carregado => _Conteudo(
          pet: _pet!,
          aoEditar: _editar,
          aoExcluir: _excluir,
        ),
    };
  }
}

/// O pet que a conta nao tem (ADR-0021).
class _ForaDaConta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            TextosDoDetalhe.petForaDaConta,
            style: textos.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            TextosDoDetalhe.petForaDaContaExplicacao,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _Falha extends StatelessWidget {
  const _Falha({required this.texto, required this.aoTentarDeNovo});

  final String texto;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: FaixaDeAviso(
        texto: texto,
        rotuloDaAcao: 'Atualizar',
        aoTocarNaAcao: aoTentarDeNovo,
      ),
    );
  }
}

/// O corpo de T.1, na ordem da 7.6.3.
class _Conteudo extends StatelessWidget {
  const _Conteudo({
    required this.pet,
    required this.aoEditar,
    required this.aoExcluir,
  });

  final Pet pet;
  final VoidCallback aoEditar;
  final VoidCallback aoExcluir;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        // 1. Faixa de estado, quando existir.
        if (pet.semTag) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.semTag(pet.nome),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],

        // 2. Foto grande e nome.
        Center(child: _FotoGrande(pet: pet)),
        const SizedBox(height: BichuEspaco.e4),
        Semantics(
          header: true,
          child: Text(pet.nome, style: textos.displaySmall),
        ),
        const SizedBox(height: BichuEspaco.e1),

        // 3. Linha de identificacao. O mesmo `atributosDe` do cartao: duas
        // formas de compor a mesma linha divergiriam na primeira manutencao.
        Text(
          CartaoDePet.atributosDe(pet),
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e6),

        // 4. Sinais, nunca truncado.
        _CartaoDeTexto(
          titulo: 'Sinais',
          texto: pet.sinaisParticulares,
          vazio: TextosDoDetalhe.semSinais(pet.nome),
        ),

        if (pet.cuidados != null && pet.cuidados!.isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(titulo: 'Cuidados', texto: pet.cuidados),
        ],

        // As acoes destrutivas, em texto, no fim, e separadas por mais de
        // 16 dp de qualquer outro alvo (7.6.3, acessibilidade).
        const SizedBox(height: BichuEspaco.e8),
        _AcaoEmTexto(rotulo: TextosDoDetalhe.editar, aoTocar: aoEditar),
        const SizedBox(height: BichuEspaco.e4),
        _AcaoEmTexto(
          rotulo: TextosDoDetalhe.excluir,
          aoTocar: aoExcluir,
          destrutiva: true,
        ),
      ],
    );
  }
}

class _FotoGrande extends StatelessWidget {
  const _FotoGrande({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    // A moldura larga do detalhe. O estado vazio nao e defeito nem pendencia:
    // a foto e **opcional** por decisao do cliente de 21/09, e a edicao e o
    // caminho de volta de quem cadastrou sem ela (criterio 10 da BICHUS-61).
    return Moldura(
      // `foto/lg` do 5.4: o tamanho que a tabela publica para "Perfil do pet",
      // que e esta tela. O numero mora em `BichuMoldura`, e nao aqui: um 200
      // escrito a mao seria medida inventada no widget, que e o que o criterio
      // 13 da BICHUS-62 proibe.
      largura: BichuMoldura.larguraFotoLg,
      estado: pet.fotoDeCapa == null
          ? EstadoDaMoldura.vazio
          : EstadoDaMoldura.repouso,
    );
  }
}

/// Um cartao de texto corrido. **Nunca truncado** (7.6.3, item 4).
class _CartaoDeTexto extends StatelessWidget {
  const _CartaoDeTexto({
    required this.titulo,
    required this.texto,
    this.vazio,
  });

  final String titulo;
  final String? texto;
  final String? vazio;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final conteudo = texto == null || texto!.isEmpty ? vazio : texto;
    if (conteudo == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(titulo, style: textos.titleMedium),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(conteudo, style: textos.bodyMedium),
        ],
      ),
    );
  }
}

/// Acao em texto, com alvo de toque de 48 dp.
///
/// O `Semantics` declara `button: true` **e** `onTap`, os dois. Declarar so o
/// primeiro com `excludeSemantics` apaga a arvore do filho e leva junto a acao
/// que o `InkWell` publicava: o no sai com `btn=true tap=false` e
/// `test/a11y/acao_de_controle_test.dart` reprova, corretamente -- quem usa
/// leitor de tela ouviria que existe um botao de excluir e nao teria como
/// aciona-lo.
class _AcaoEmTexto extends StatelessWidget {
  const _AcaoEmTexto({
    required this.rotulo,
    required this.aoTocar,
    this.destrutiva = false,
  });

  final String rotulo;
  final VoidCallback aoTocar;
  final bool destrutiva;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: rotulo,
      excludeSemantics: true,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: SizedBox(
          height: BichuAlvoDeToque.min,
          width: double.infinity,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              rotulo,
              style: textos.labelLarge?.copyWith(
                color: destrutiva ? cores.error : cores.primary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
