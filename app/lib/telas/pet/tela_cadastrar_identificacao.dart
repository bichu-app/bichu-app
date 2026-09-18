import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_segmentado.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_cadastro.dart';

/// F1.3 — Cadastrar pet: identificacao. Figma `89:45`.
///
/// **Raca sao dois campos, e a tela e o que torna o erro impossivel.**
/// `breed_code` vem da lista fechada e e a unica coisa que o cruzamento de
/// perdido e achado le; `breed_free_text` e a raca como a pessoa escreveu,
/// guardada e exibida, **nunca cruzada**. O contrato recusa os dois juntos com
/// `validation-failed`, e a restricao que impede isso nao e validacao: e o
/// campo de texto **so existir** quando a opcao `Outra` esta escolhida
/// (Norman). Deixar o campo visivel o tempo todo e convidar ao erro e depois
/// explica-lo.
///
/// **A lista que nao carrega nao trava o cadastro.** Raca e opcional no
/// contrato (`PetInput` exige `name`, `species` e `size`), e perder o pet por
/// causa de um campo que ninguem precisa preencher e o pior desfecho possivel.
///
/// **Sem a lista, a pessoa pode DIGITAR a raca** (criterio 6 de BICHUS-90), e
/// isso nao contradiz o paragrafo acima: o que nao pode acontecer e o texto
/// livre virar o codigo de cruzamento. Aqui ele nao vira -- digitar escolhe
/// `outro_<especie>`, que e um codigo LIMPO da lista fechada, significando
/// "nao esta na lista", e o texto vai para `breed_free_text`, que descreve e
/// nunca cruza. E exatamente o arranjo que o criterio 3 da mesma historia
/// descreve: "o texto e aceito e guardado, E o cruzamento continua funcionando
/// pelos atributos que vieram da lista".
///
/// A primeira versao desta tela nao oferecia esse caminho e o cadastro seguia
/// sem raca nenhuma. Funcionava, e perdia a informacao: `outro_dog` + "Akita"
/// aparece na ficha, no cartaz e no perfil publico; nada nao aparece.
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

  late final TextEditingController _nome =
      TextEditingController(text: _rascunho.nome);
  late final TextEditingController _racaLivre =
      TextEditingController(text: _rascunho.breedFreeText);

  final FocusNode _focoDoNome = FocusNode();
  final FocusNode _focoDaRacaLivre = FocusNode();

  DadosDeReferencia? _referencia;
  bool _carregandoReferencia = true;
  bool _listaFalhou = false;

  /// Verdadeiro depois de a pessoa escolher `Continuar sem a raça`: a faixa
  /// some e o seletor fica desabilitado, mas **nao vira** campo de texto.
  bool _seguiuSemRaca = false;

  String? _erroDoNome;
  String? _erroDaEspecie;
  String? _erroDoPorte;
  String? _erroDaRacaLivre;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregarReferencia();
  }

  @override
  void dispose() {
    _nome.dispose();
    _racaLivre.dispose();
    _focoDoNome.dispose();
    _focoDaRacaLivre.dispose();
    super.dispose();
  }

  Future<void> _carregarReferencia() async {
    setState(() {
      _carregandoReferencia = true;
      _listaFalhou = false;
    });
    try {
      final dados = await Escopo.of(context).pets.dadosDeReferencia();
      if (!mounted) return;
      setState(() {
        _referencia = dados;
        _carregandoReferencia = false;
      });
      _rascunho.atualizar(() {
        // A versao que o **cliente tinha em maos**. Sem ela o servidor grava a
        // corrente no momento da escrita, que responde "qual e a lista de
        // hoje" e nao "de qual lista este pet foi escolhido".
        _rascunho.refDataVersion = dados.versao;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoReferencia = false;
        _listaFalhou = true;
      });
    }
  }

  /// A lista mostrada no seletor: as racas da especie escolhida **mais** a
  /// opcao de saida, que e microcopy e nao dado do servidor.
  List<ItemDeLista> get _itensDeRaca {
    final especie = _rascunho.especie;
    final referencia = _referencia;
    if (especie == null || referencia == null) return const <ItemDeLista>[];
    return <ItemDeLista>[
      for (final raca in referencia.racasDe(especie))
        ItemDeLista(codigo: raca.codigo, rotulo: raca.rotulo),
      ItemDeLista(
        codigo: especie.codigoDeOutraRaca,
        rotulo: TextosDoCadastro.opcaoOutraRaca,
      ),
    ];
  }

  String? get _rotuloDaRacaEscolhida {
    final codigo = _rascunho.breedCode;
    if (codigo == null) return null;
    for (final item in _itensDeRaca) {
      if (item.codigo == codigo) return item.rotulo;
    }
    return null;
  }

  void _escolherEspecie(Especie escolha) {
    _rascunho.atualizar(() {
      _rascunho.especie = escolha;
      // A lista de racas e por especie, e o codigo de saida tambem. Trocar a
      // especie sem soltar a raca deixaria `breed_code` apontando para uma
      // lista que nao e mais a desta tela.
      _rascunho.breedCode = null;
      _rascunho.breedFreeText = '';
    });
    _racaLivre.clear();
    setState(() {
      _erroDaEspecie = null;
      _erroDaRacaLivre = null;
    });
  }

  /// A saída do critério 6: sem a lista, a pessoa digita a raça.
  ///
  /// Reusa `_escolherRaca` com o código `outro_<espécie>` em vez de abrir um
  /// caminho paralelo. Isso importa mais do que parece: `_escolherRaca` já
  /// anuncia o aparecimento do campo para o leitor de tela e já cuida de não
  /// roubar o foco. Um caminho novo precisaria repetir as duas coisas, e a
  /// repetição é onde a acessibilidade se perde primeiro.
  void _digitarARaca() {
    final especie = _rascunho.especie;
    if (especie == null) return;
    setState(() => _seguiuSemRaca = true);
    _escolherRaca(especie.codigoDeOutraRaca);
  }

  void _escolherRaca(String? codigo) {
    final eraOutra = _rascunho.escolheuOutraRaca;
    _rascunho.atualizar(() => _rascunho.breedCode = codigo);
    setState(() => _erroDaRacaLivre = null);

    final agoraEOutra = _rascunho.escolheuOutraRaca;
    if (agoraEOutra && !eraOutra) {
      // **O aparecimento e anunciado e o foco NAO pula para o campo.** Mudar o
      // foco sozinho depois de uma escolha e deslize garantido em leitor de
      // tela; o campo fica imediatamente depois do seletor na ordem de foco e
      // e alcancado pelo avanco normal (UX F1.3, acessibilidade).
      anunciar(
        context,
        '${TextosDoCadastro.rotuloDaRacaLivre} (opcional)',
      );
    }
    if (!agoraEOutra && eraOutra) {
      _racaLivre.clear();
      _rascunho.atualizar(() => _rascunho.breedFreeText = '');
    }
  }

  bool _camposObrigatoriosPreenchidos() {
    final rascunho = _rascunho;
    final erroDoNome =
        _nome.text.trim().isEmpty ? TextosDoCadastro.digiteONome : null;
    final erroDaEspecie =
        rascunho.especie == null ? TextosDoCadastro.escolhaAEspecie : null;
    final erroDoPorte =
        rascunho.porte == null ? TextosDoCadastro.escolhaOPorte : null;

    if (erroDoNome == null && erroDaEspecie == null && erroDoPorte == null) {
      return true;
    }
    setState(() {
      _erroDoNome = erroDoNome;
      _erroDaEspecie = erroDaEspecie;
      _erroDoPorte = erroDoPorte;
    });
    if (erroDoNome != null) _focoDoNome.requestFocus();
    return false;
  }

  void _continuar() {
    setState(() {
      _erroDoNome = null;
      _erroDaEspecie = null;
      _erroDoPorte = null;
      _erroDaRacaLivre = null;
    });

    final livre = _racaLivre.text.trim();
    if (livre.length > TextosDoCadastro.limiteDaRacaLivre) {
      setState(() => _erroDaRacaLivre = TextosDoCadastro.racaLivreLonga);
      _focoDaRacaLivre.requestFocus();
      return;
    }

    // A tela **nao corrige** a combinacao proibida por conta propria: ela a
    // torna impossivel. Se por algum caminho o texto livre existir com uma
    // raca da lista, o erro e do campo livre e nao do seletor, e a mensagem
    // nomeia a raca escolhida.
    if (livre.isNotEmpty && !_rascunho.escolheuOutraRaca) {
      final raca = _rotuloDaRacaEscolhida;
      setState(() {
        _erroDaRacaLivre = raca == null
            ? TextosDoCadastro.racaLivreLonga
            : TextosDoCadastro.racaLivreComRacaDaLista(raca);
      });
      return;
    }

    _rascunho.atualizar(() {
      _rascunho.nome = _nome.text.trim();
      _rascunho.breedFreeText = livre;
    });

    if (!_camposObrigatoriosPreenchidos()) return;

    context.push(Rotas.cadastrarPetFoto, extra: _rascunho);
  }

  @override
  Widget build(BuildContext context) {
    final rascunho = _rascunho;

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
            BichuField(
              rotulo: TextosDoCadastro.rotuloDoNome,
              controlador: _nome,
              foco: _focoDoNome,
              erro: _erroDoNome,
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.next,
              aoMudar: _erroDoNome == null
                  ? null
                  : (_) => setState(() => _erroDoNome = null),
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Especie>(
              rotulo: TextosDoCadastro.rotuloDaEspecie,
              erro: _erroDaEspecie,
              selecionado: rascunho.especie,
              aoSelecionar: _escolherEspecie,
              opcoes: <OpcaoSegmentada<Especie>>[
                for (final especie in Especie.values)
                  OpcaoSegmentada<Especie>(
                    valor: especie,
                    rotulo: especie.rotulo,
                  ),
              ],
            ),
            const SizedBox(height: BichuEspaco.e6),
            if (_listaFalhou && !_seguiuSemRaca) ...<Widget>[
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: TextosDoCadastro.listaDeRacasNaoCarregou(_nome.text),
                rotuloDaAcao: 'Tentar de novo',
                aoTocarNaAcao: _carregarReferencia,
              ),
              const SizedBox(height: BichuEspaco.e2),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: BichuEspaco.e4,
                  children: <Widget>[
                    // Primeiro a saida que PRESERVA a informacao. "Continuar
                    // sem a raca" continua existindo e vem depois, porque
                    // perder o campo e a segunda melhor opcao, nao a primeira.
                    if (_rascunho.especie != null)
                      TextButton(
                        onPressed: _digitarARaca,
                        child: const Text(TextosDoCadastro.digitarARaca),
                      ),
                    TextButton(
                      onPressed: () => setState(() => _seguiuSemRaca = true),
                      child: const Text(TextosDoCadastro.continuarSemARaca),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            SeletorDeLista(
              rotulo: TextosDoCadastro.rotuloDaRaca,
              ajuda: TextosDoCadastro.ajudaDaRaca,
              estadoInicial: TextosDoCadastro.escolherNaLista,
              itens: _itensDeRaca,
              selecionado: rascunho.breedCode,
              aoSelecionar: _escolherRaca,
              // Desabilitado enquanto nao ha especie escolhida (a lista e por
              // especie), enquanto a lista carrega, e quando ela falhou. Em
              // nenhum desses casos ele vira campo de texto livre.
              habilitado: rascunho.especie != null &&
                  !_carregandoReferencia &&
                  !_listaFalhou,
            ),
            if (rascunho.escolheuOutraRaca) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                rotulo: TextosDoCadastro.rotuloDaRacaLivre,
                opcional: true,
                controlador: _racaLivre,
                foco: _focoDaRacaLivre,
                erro: _erroDaRacaLivre,
                ajuda: TextosDoCadastro.ajudaDaRacaLivre(_nome.text),
                capitalizacao: TextCapitalization.words,
                acaoDeTeclado: TextInputAction.next,
                limite: TextosDoCadastro.limiteDaRacaLivre,
                aoMudar: (valor) {
                  _rascunho.breedFreeText = valor;
                  if (_erroDaRacaLivre != null) {
                    setState(() => _erroDaRacaLivre = null);
                  } else {
                    setState(() {});
                  }
                },
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Porte>(
              rotulo: TextosDoCadastro.rotuloDoPorte,
              erro: _erroDoPorte,
              selecionado: rascunho.porte,
              aoSelecionar: (escolha) {
                _rascunho.atualizar(() => _rascunho.porte = escolha);
                setState(() => _erroDoPorte = null);
              },
              // Tres botoes, e nao os quatro valores de `PetSize`. O desenho de
              // F1.3 tem tres, e o paragrafo 11.17 do design system limita o
              // grupo segmentado a tres segmentos de uma palavra: com quatro, o
              // rotulo mais longo quebra em duas linhas a 200% de escala de
              // fonte. `GG` existe no contrato e e lido na ficha; ele so nao e
              // oferecido aqui.
              opcoes: const <OpcaoSegmentada<Porte>>[
                OpcaoSegmentada<Porte>(
                  valor: Porte.pequeno,
                  rotulo: 'Pequeno',
                ),
                OpcaoSegmentada<Porte>(valor: Porte.medio, rotulo: 'Médio'),
                OpcaoSegmentada<Porte>(valor: Porte.grande, rotulo: 'Grande'),
              ],
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Sexo>(
              rotulo: TextosDoCadastro.rotuloDoSexo,
              selecionado: rascunho.sexo,
              aoSelecionar: (escolha) =>
                  _rascunho.atualizar(() => _rascunho.sexo = escolha),
              opcoes: <OpcaoSegmentada<Sexo>>[
                for (final sexo in Sexo.values)
                  OpcaoSegmentada<Sexo>(valor: sexo, rotulo: sexo.rotulo),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
