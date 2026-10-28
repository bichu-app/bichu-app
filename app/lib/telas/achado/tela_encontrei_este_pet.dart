import 'package:flutter/material.dart';

import '../../achado/envio_do_achado.dart';
import '../../achado/rascunho_do_achado.dart';
import '../../api/api_client.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_perdido.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../perdido/quando_foi_visto.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/saida_da_tela.dart';
import '../localizacao/antessala_de_localizacao.dart';
import '../localizacao/captura_de_localizacao.dart';
import 'tela_registrar_achado.dart';
import 'textos_do_achado.dart';

/// **Achei ESTE pet** — o destino de `Encontrei este animal` na pagina publica
/// de um caso.
///
/// ## O defeito que ela conserta
///
/// O cliente, 26/10/2026, palavra por palavra: *"nao subiu o fluxo de quando
/// clicar no pet, nao levar ele para a pagina de registrar um achado, porque
/// **se ele encontrou o pet, ele nao tem que cadastrar as informacoes
/// novamente**"*.
///
/// O toque caia em [TelaRegistrarAchado] (F3.5), que pergunta **especie,
/// porte, raca e cor** — e os quatro ja estao respondidos do outro lado: o
/// pet tem cadastro, o caso esta aberto, e a projecao publica que esta tela
/// acabou de ler traz os dados. Quem achou um animal IDENTIFICADO era obrigado
/// a redigitar o que o sistema sabia.
///
/// ## O que ela pergunta, e o que ela NAO pergunta
///
/// **Nao pergunta**: especie, porte, raca, cor, sexo, nome. Os dois primeiros
/// vao para o corpo vindos de [PerdidoPublico] — e `species` e `size` sao
/// **obrigatorios em `PublicLostPet`**, entao nao existe caso em que eles
/// faltem e a tela tenha de perguntar. (`primary_color` e `breed_label` sao
/// anulaveis NO CONTRATO, e por isso nao viajam: eles tambem sao **rotulo** e
/// o corpo pede **codigo** (`primary_color_code`, `breed_code`), e converter
/// rotulo em codigo no cliente e inventar dado. Os dois sao opcionais em
/// `StrayFoundReportInput`, entao a omissao nao perde nada que o cruzamento
/// precise — e o cruzamento nem corre: o `share_token` vincula direto.)
///
/// **Pergunta**, e so: `Quando?`, `Onde?`, o recado e a foto. E exatamente o
/// que ninguem alem de quem achou tem como saber.
///
/// ## O `share_token` e o fio, e ele nao vem dos dedos de ninguem
///
/// `StrayFoundReportInput.share_token` existe, no contrato, *"para o vizinho
/// que chegou pelo push de um caso especifico e esta dizendo 'vi este pet': o
/// achado e vinculado diretamente aquele caso, sem depender do cruzamento por
/// atributos"*. E `PublicLostCase.can_report_sighting` nomeia este caminho:
/// *"o toque leva a `POST /found-reports` com o `share_token` do caso"*.
///
/// **Nenhuma operacao nova de contrato foi inventada.** O caminho ja existia
/// inteiro; o que faltava era a tela parar de pedir o que o caso ja diz.
///
/// ## O que ela NAO faz
///
/// - **Nao monta corpo nem navega por conta propria.** Quem envia e
///   [enviarAchado], a MESMA funcao de F3.5: um segundo envio daria duas
///   copias dos cinco desfechos (conta que falta, rede caida, sessao vencida,
///   falha de api, registro).
/// - **Nao tem passo 1.** Nao ha o que colapsar: os campos do passo 1 nao
///   existem aqui. O que a tela desenha no lugar e um cartao de LEITURA, para
///   a pessoa poder dizer "nao e este animal" e voltar.
/// - **Nao le o caso do servidor.** O `extra` chega da pagina que acabou de
///   ler; uma segunda leitura aqui seria a mesma resposta duas vezes e um
///   segundo estado de carregando no meio do caminho de quem esta com o
///   animal na mao.
class TelaEncontreiEstePet extends StatefulWidget {
  const TelaEncontreiEstePet({
    required this.perdido,
    super.key,
    this.agora = DateTime.now,
  });

  /// O caso, como a pagina publica o leu. **`shareToken`, `nome`, `especie` e
  /// `porte` nao sao anulaveis** nesta classe, e a garantia e do contrato:
  /// `PublicLostPet` os declara `required`, e `PerdidoPublico.doJson` estoura
  /// `FormatException` se `species` ou `size` vierem fora da lista.
  final PerdidoPublico perdido;

  /// O relogio entra pela porta, como em F3.5: sem isso, "amanha nao e
  /// aceito" so seria exercitavel esperando um dia.
  final DateTime Function() agora;

  @override
  State<TelaEncontreiEstePet> createState() => _TelaEncontreiEstePetState();
}

enum _Fase { preenchendo, enviando }

class _TelaEncontreiEstePetState extends State<TelaEncontreiEstePet> {
  /// O rascunho **ja nasce com o animal respondido**.
  ///
  /// Esta e a linha que conserta o defeito. Especie e porte vem do caso;
  /// `shareToken` vem do caso; e e por isso que [RascunhoDoAchado] nao precisou
  /// de campo novo nem de modo novo — ele sempre soube carregar os tres.
  late final RascunhoDoAchado _rascunho = RascunhoDoAchado(
    especie: widget.perdido.especie,
    porte: widget.perdido.porte,
    shareToken: widget.perdido.shareToken,
  );

  late final TextEditingController _recado = TextEditingController();

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  /// A chave de idempotencia **da primeira tentativa**, e nao de cada uma.
  /// Mesma razao de F3.5: uma chave por tentativa faria cada reenvio virar um
  /// achado novo, e a mesma tutora receberia a mesma sugestao varias vezes.
  String? _chave;

  bool _consultou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_consultou) return;
    _consultou = true;
    _consultarACamera();
  }

  @override
  void dispose() {
    _recado.dispose();
    super.dispose();
  }

  Future<void> _consultarACamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  Future<void> _tirarFoto() async {
    final foto = await Escopo.of(context).camera.tirarFoto();
    if (!mounted) return;
    setState(() {
      if (foto != null) _rascunho.foto = foto;
    });
    await _consultarACamera();
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted) return;
    setState(() {
      if (foto != null) _rascunho.foto = foto;
    });
  }

  /// O calendario de `Outra data`, igual ao de F3.5.
  Future<void> _escolherData() async {
    final agora = widget.agora();
    final escolhida = await showDatePicker(
      context: context,
      initialDate: _rascunho.dataEscolhida ?? agora,
      firstDate: DateTime(agora.year - 1),
      // **Hoje e o ultimo dia aceito.** Achado no futuro nao e achado, e a
      // mesma recusa existe na borda do servidor.
      lastDate: agora,
    );
    if (!mounted) return;
    setState(() {
      if (escolhida != null) _rascunho.dataEscolhida = escolhida;
    });
  }

  Future<void> _avisar() async {
    _rascunho.observacao = _recado.text;
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
    await enviarAchado(
      context: context,
      rascunho: _rascunho,
      agora: widget.agora(),
      chave: chave,
      aoComecar: () => setState(() {
        _fase = _Fase.enviando;
        _erro = null;
      }),
      aoFalhar: (erro) => setState(() {
        _fase = _Fase.preenchendo;
        _erro = erro;
      }),
      aoVoltarDoLogin: () => setState(() => _fase = _Fase.preenchendo),
    );
  }

  /// A frase sobre o lugar, ou nada. Mesma regra de F3.5: tres estados, e
  /// nenhum deles bloqueia o envio.
  String? get _avisoDoLugar {
    final onde = _rascunho.onde;
    if (onde == null) return null;
    if (!_rascunho.temRotuloDeArea) return TextosDoAchado.semRotuloDeArea;
    if (!_rascunho.temCoordenada) return TextosDoAchado.semCoordenada;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final agora = widget.agora();
    // **SO o impedimento do passo 2.** `impedimentoDoPasso1` (especie e porte)
    // esta satisfeito por construcao, e chama-lo aqui seria perguntar ao
    // rascunho uma coisa que a tela ja resolveu.
    final impedimento = _rascunho.impedimentoDoPasso2(agora);

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDeEncontrei,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                TextosDoAchado.chamadaDeEncontrei(widget.perdido.nome),
                style: textos.titleLarge,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              TextosDoAchado.oQueJaSabemos,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e6),
            _CartaoDoPet(perdido: widget.perdido),
            const SizedBox(height: BichuEspaco.e6),
            GrupoDeOpcoes<QuandoFoiVisto>(
              rotulo: TextosDoAchado.rotuloDeQuando,
              selecionado: _rascunho.quando,
              opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
                for (final q in QuandoFoiVisto.values)
                  OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
              ],
              aoSelecionar: (escolha) {
                _rascunho.quando = escolha;
                // Trocar de `Outra data` para outra opcao **apaga** a data:
                // deixa-la guardada gravaria o achado com a data de um
                // calendario que a pessoa ja abandonou.
                if (!escolha.pedeCalendario) _rascunho.dataEscolhida = null;
                setState(() {});
                if (escolha.pedeCalendario) _escolherData();
              },
            ),
            if (_rascunho.quando?.pedeCalendario ?? false) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              // A MESMA peca de F3.5, e nao uma segunda: o rotulo acessivel
              // dela redeclara `onTap` por cima do `excludeSemantics` (a forma
              // `btn=true tap=false` que este app ja pagou quatro vezes), e o
              // formato `dd/mm/aaaa` nao depende de `intl`. Reescrever as duas
              // coisas aqui seria reabrir os dois defeitos.
              DataEscolhidaDoAchado(
                data: _rascunho.dataEscolhida,
                aoTrocar: _escolherData,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              child: Text(
                TextosDoAchado.rotuloDeOnde,
                style: textos.titleMedium,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            // A PECA DA BICHUS-23, EMBUTIDA — a mesma de F3.5, e com o MESMO
            // ponto de uso: `registrarAchado`. Um valor novo no enum seria um
            // ponteiro sem texto proprio, e o portao `enum-sem-valores-lidos`
            // reprova enum cujo valor ninguem le.
            CapturaDeLocalizacao(
              pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
              aoMudar: (onde) {
                _rascunho.onde = onde;
                setState(() {});
              },
            ),
            if (_avisoDoLugar != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: _avisoDoLugar!,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: TextosDoAchado.rotuloDoRecado,
              controlador: _recado,
              opcional: true,
              linhas: 3,
              limite: RascunhoDoAchado.limiteDaObservacao,
              exemplo: TextosDoAchado.exemploDoRecado,
              capitalizacao: TextCapitalization.sentences,
            ),
            const SizedBox(height: BichuEspaco.e6),
            BlocoDaFotoDoAchado(
              foto: _rascunho.foto,
              permissao: _permissaoDaCamera,
              aoTirar: _tirarFoto,
              aoEscolher: _escolherDaGaleria,
              aoAbrirAjustes: () =>
                  Escopo.of(context).camera.abrirAjustesDoSistema(),
            ),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erro!.texto),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          if (impedimento != null)
            MotivoDoBloqueioDoAchado(
              texto: impedimento.texto,
              cor: cores.textPrimary,
            ),
          BotaoPrimario(
            rotulo: TextosDoAchado.avisarOTutor,
            critico: true,
            carregando: _fase == _Fase.enviando,
            aoTocar: (impedimento != null || _fase == _Fase.enviando)
                ? null
                : _avisar,
          ),
        ],
      ),
    );
  }
}

/// O cartao de LEITURA do pet: foto, nome, especie e porte.
///
/// **Nenhum campo editavel aqui, e e esse o ponto da tela.** Um `SeletorDeLista`
/// pre-preenchido continuaria sendo uma pergunta, e o cliente nao pediu um
/// padrao melhor — ele pediu para nao perguntar.
class _CartaoDoPet extends StatelessWidget {
  const _CartaoDoPet({required this.perdido});

  final PerdidoPublico perdido;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = perdido.urlDaFoto;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // **Sem foto nao desenha retangulo cinza.** `photo_url` e anulavel no
          // contrato (caso aberto antes de a derivada ficar pronta), e
          // `ImagemDaRede` recebe `url` nao anulavel de proposito.
          if (url != null) ...<Widget>[
            ImagemDaRede(
              url: url,
              descricao: TextosDoAchado.fotoDoPetDoCaso(perdido.nome),
              largura: 72,
              simboloDeFalha: Icons.pets_outlined,
            ),
            const SizedBox(width: BichuEspaco.e4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  TextosDoAchado.rotuloDeQuemE,
                  style: textos.labelMedium
                      ?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e1),
                Text(perdido.nome, style: textos.titleMedium),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  TextosDoAchado.especieEPorte(
                    perdido.especie.rotulo,
                    perdido.porte.rotulo,
                  ),
                  style: textos.bodyMedium
                      ?.copyWith(color: cores.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
