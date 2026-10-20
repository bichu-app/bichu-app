import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_achado.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/bloco_de_informacao.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../perfil/meus_achados.dart';
import 'textos_do_achado.dart';

/// O achado, pelo endereco dele: `/achados/:achadoId`.
///
/// ## Por que ela LE do servidor, sempre, e nunca desenha de um `extra`
///
/// **Um achado avulso e lido e alterado somente pela conta que o registrou.**
/// Quem sustenta isso e a clausula `WHERE` do servidor: achado de outra pessoa
/// responde **ausencia** (404), indistinguivel do inexistente, porque um 403
/// confirmaria que aquele identificador e um achado de verdade (ADR-0021).
///
/// Uma tela que aceitasse o achado pronto em `extra` -- ou que o lesse de um
/// cache do app -- desenharia o registro **sem perguntar a ninguem**, e a
/// regra do servidor deixaria de valer no unico lugar em que ela e visivel: o
/// aparelho compartilhado, onde a segunda pessoa a entrar herdaria a tela da
/// primeira. Esta tela nao tem esse caminho, e a isca `achado alheio` mede
/// exatamente isso.
///
/// ## A mesma frase para "nao existe" e para "nao e seu"
///
/// [TextosDoAchado.naoEncontrado] e uma so, e a igualdade e o ponto. Dois
/// textos diferentes confirmariam, para quem nao e o dono, qual dos dois
/// identificadores existe -- que e o vazamento que o 404 unico fecha.
///
/// ## OS TRES BLOCOS, trazidos do desfecho (cliente, 18/10/2026)
///
/// A queixa que gerou o desfecho rico -- *"Na pagina 'achado registrado' nao
/// mostra muita informacao, nao tem foto do pet ou alguma informacao util"* --
/// vale igual **aqui**, e aqui ela doi mais: este e o destino do botao `Ver o
/// achado` daquele desfecho, e ate agora quem tocasse nele caia num paragrafo,
/// uma linha de regiao e uma faixa. Quem volta ao app no dia seguinte para
/// acompanhar o achado chega nesta tela, e nao naquela -- o desfecho so existe
/// no instante do envio.
///
/// Os tres blocos sao os MESMOS, pelos mesmos textos ([BlocoDeInformacao] e as
/// constantes de [TextosDoAchado]), porque duas redacoes para a mesma verdade
/// seriam duas verdades. O que muda e o que esta tela SABE, e sao duas coisas:
///
/// ## 1. O ESTADO VEM DO SERVIDOR, e por isso nao e `Em analise` fixo
///
/// O desfecho escreve [TextosDoAchado.estadoEmAnalise] a mao, e ali isso e
/// verdade por construcao: o achado nasceu `open` dois segundos antes. **Aqui
/// o achado pode ter qualquer estado** -- `matched` quando o servidor achou um
/// tutor parecido, `closed` quando o caso fechou --, e a tela le `status` de
/// verdade. Escrever `Em analise` sobre um achado encerrado seria a tela
/// afirmando o que o servidor nega, que e a classe de defeito que o bloco
/// `Quem foi avisado` existe para nao repetir.
///
/// Quem traduz e `MeusAchados.rotuloDoEstado`, que ja existe e ja cobre o
/// estado desconhecido com palavra neutra. **Um `switch` novo aqui seria a
/// segunda traducao do mesmo `status`**, e duas divergem: `Meus achados` diria
/// `Possível tutor encontrado` e esta tela diria outra coisa sobre o mesmo
/// registro, na mesma conta, a dois toques de distancia.
///
/// ## 2. A FOTO NAO E DESENHADA AQUI, e a tela DIZ isso
///
/// O desfecho mostra a foto porque ele a recebeu do aparelho, em
/// `ResultadoDoAchado.foto`, do seletor que a pessoa acabou de usar. **Esta
/// tela nao tem esse objeto**: ela chega por URL -- link, `go` de outra tela,
/// app reaberto no dia seguinte -- e tudo que ela sabe vem do `GET`.
///
/// E o `GET` **nao devolve foto nenhuma**: `FoundReport.photo_url` volta nulo
/// por criterio do contrato (`api/openapi.yaml`, `components/schemas/
/// FoundReport`), porque a foto do achador e vista pelo tutor dentro da
/// conversa mediada, e so. Ler `photo_url` aqui seria ler um campo que o
/// contrato promete vazio.
///
/// **E a foto nao foi buscada no aparelho de proposito.** `FotoPendente` guarda
/// arquivo local por `petId`, e nao por achado; dar a esta tela uma gaveta
/// propria por `achadoId` e exatamente o que
/// `achado/tela_registrar_achado.dart` se recusa a fazer, com a razao escrita
/// la: *"uma terceira gaveta desta tela seria dado de conta esperando a proxima
/// pessoa que entrasse neste aparelho"*. A foto do animal de alguem,
/// sobrevivendo ao logout num aparelho compartilhado, e dado pessoal a espera
/// de quem nao deveria ve-lo -- e o achado ainda ficaria sem foto em qualquer
/// outro aparelho da mesma conta, o que faria a tela mentir por omissao
/// dependendo de onde fosse aberta.
///
/// Entao **nao ha quadro de foto**, e nao ha lugar reservado: um retangulo
/// cinza com um icone pareceria carregamento que falhou, que e o erro que
/// `MeusAchados` tambem recusa (*"um lugar reservado de foto que nunca
/// preenche pareceria defeito"*). O que existe e UMA LINHA que diz onde a foto
/// esta, porque silencio aqui faria a pessoa achar que a foto que ela escolheu
/// se perdeu.
///
/// **A linha substituiu [TextosDoAchado.fotoAindaNaoSubiu], que era falso nesta
/// tela.** Aquela frase afirma *"a foto ainda nao foi enviada"*, e esta tela
/// nao tem como saber disso: o envio da foto do achado e uma cadeia propria
/// (`FotoDeAchado`, por `found_report_id`), e o `GET` nao devolve o estado
/// dela. A tela afirmava em toda visita, sobre todo achado, um fato que ela nao
/// media.
///
/// ## 3. O GESTO DE ARRASTAR, que ficou de fora do lote de 18/10
///
/// Ela le de rede e nao estava nas onze superficies: o recorte daquele dia foi
/// LISTAGEM, e esta e tela de item unico. O gesto cabe pelo mesmo criterio que
/// vale para as outras -- ha uma busca a refazer, e e `_carregar`, a mesma
/// funcao do `Tentar de novo` da faixa de erro. O embrulho e permanente, e nao
/// condicional: trocar a forma da arvore entre estados remonta o `ListView` e
/// faz o `GET` acontecer de novo sozinho (medido em 22 casos, ver
/// `widgets/arrastar_para_atualizar.dart`).
///
/// **No estado de ausencia o gesto continua na arvore, e isso nao contradiz a
/// recusa do `Tentar de novo`.** Aquele botao e uma OFERTA da tela -- ela
/// ensinaria a insistir no que nao existe. O arrasto e um gesto que a pessoa
/// traz do resto do app; ele re-pergunta e recebe a mesma ausencia, sem a tela
/// ter prometido nada.
class TelaDoAchado extends StatefulWidget {
  const TelaDoAchado({required this.achadoId, super.key});

  final String achadoId;

  @override
  State<TelaDoAchado> createState() => _TelaDoAchadoState();
}

class _TelaDoAchadoState extends State<TelaDoAchado> {
  AchadoRegistrado? _achado;
  MensagemDeErro? _erro;
  String? _ausente;

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  ///
  /// Campo separado de [_erro] porque os dois desenham coisas diferentes: sem
  /// conta a tela convida a entrar, e um 500 continua desenhando a faixa de
  /// erro com `Tentar de novo`.
  bool _faltaConta = false;
  bool _carregando = true;
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
      _ausente = null;
      _faltaConta = false;
    });
    try {
      final achado = await Escopo.of(context).achados.buscar(widget.achadoId);
      if (!mounted) return;
      setState(() {
        _achado = achado;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        // **404 e ausencia, e nao erro.** A tela nao oferece `Tentar de novo`
        // para o que nao existe: repetir a pergunta nao muda a resposta, e o
        // botao ensinaria a pessoa a insistir.
        if (falha.tipo == ProblemTipo.naoEncontrado) {
          _ausente = TextosDoAchado.naoEncontrado;
        } else if (faltaConta(falha)) {
          // **SEM CONTA NAO E ERRO.** Decidido pelo `next_action` do corpo, e
          // nao pelo status: os dois 401 que chegam aqui trazem
          // `next_action: sign_in`. Ver `widgets/convite_para_entrar.dart`.
          _faltaConta = true;
        } else {
          _erro = MensagensDeErro.de(falha);
        }
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        // `faltaConta` tambem aqui, e nao so no ramo de `FalhaDaApi`: o tipo
        // mais especifico e capturado antes, mas quem ler este ramo isolado
        // nao deve concluir que ele trata outra classe de falha.
        _faltaConta = faltaConta(falha);
        if (!_faltaConta) _erro = MensagensDeErro.de(falha);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final achado = _achado;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDoRegistrado,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        // O ARRASTAR-PARA-ATUALIZAR (cliente, 18/10/2026): *"Crie uma acao no
        // aplicativo de atualizar a pagina conforme o usuario puxa a pagina
        // para baixo"*. Por `ArrastarParaAtualizar`, o ponto unico do app --
        // nenhum `RefreshIndicator` cru em tela nenhuma. A funcao e a MESMA do
        // `Tentar de novo` da faixa.
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            addSemanticIndexes: false,
            children: <Widget>[
              if (_carregando)
                const Center(child: CircularProgressIndicator())
              else if (_ausente != null)
                // **Nada do achado na arvore.** Nem titulo, nem regiao, nem
                // observacao, e nem os tres blocos: a ausencia e total, porque
                // meia tela ja contaria que o registro existe. `Quem foi
                // avisado` desenhado aqui diria, a quem nao e o dono, que ha um
                // achado sobre o qual ninguem foi avisado.
                Semantics(
                  liveRegion: true,
                  child: Text(_ausente!, style: textos.bodyLarge),
                )
              // SEM CONTA VEM ANTES DO ERRO, e nao ha `Tentar de novo`:
              // perguntar de novo sai igualmente sem conta e volta o mesmo 401.
              //
              // **Preservado na mescla do terceiro lote de 20/10/2026**: o
              // convite e da frente `feat/aviso-de-login-ao-tocar` e a ficha
              // rica e desta, e as duas tocam este mesmo `ListView`. A ordem
              // importa e nao e estetica: `_faltaConta` antes de `_erro` e o
              // que impede a tela oferecer `Tentar de novo` a quem nao tem
              // sessao -- o 401 voltaria igual, e o botao mentiria.
              else if (_faltaConta)
                const ConviteParaEntrar(secao: SecaoComConta.paginaDoAchado)
              else if (_erro != null)
                FaixaDeAviso(
                  texto: _erro!.texto,
                  rotuloDaAcao: MensagensDeErro.tentarDeNovo,
                  aoTocarNaAcao: _carregar,
                )
              else if (achado != null) ...<Widget>[
                Text(
                  TextosDoAchado.registradoCorpo,
                  style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e4),
                // ONDE A FOTO ESTA, em texto e sem quadro. Ver a prosa da
                // classe: `photo_url` volta nulo por criterio e esta tela nao
                // tem a `FotoLocal` do aparelho.
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TextosDoAchado.fotoNaoApareceAqui,
                ),
                const SizedBox(height: BichuEspaco.e6),
                // ============================================================
                // O QUE A GENTE GUARDOU.
                // ============================================================
                BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDoQueGuardamos,
                  linhas: <String>[
                    // O estado em PALAVRA, e o do SERVIDOR -- nao o `Em
                    // analise` fixo do desfecho. Ver a prosa da classe.
                    MeusAchados.rotuloDoEstado(achado.status),
                    // O rotulo de area **so vem do servidor**; o nulo vira a
                    // linha neutra, e nao o bairro digitado.
                    achado.rotuloDaArea == null
                        ? TextosDoAchado.regiaoNaoInformada
                        : 'Região: ${achado.rotuloDaArea}',
                    // `found_at` e anulavel no contrato: o nulo nao vira data
                    // inventada, e a linha simplesmente nao sai.
                    if (achado.achadoEm != null)
                      TextosDoAchado.achadoEmTexto(achado.achadoEm!),
                  ],
                ),
                if (achado.observacao != null &&
                    achado.observacao!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  Text(
                    TextosDoAchado.rotuloDosSinais,
                    style: textos.labelLarge?.copyWith(
                      color: cores.textSecondary,
                    ),
                  ),
                  const SizedBox(height: BichuEspaco.e1),
                  Text(achado.observacao!, style: textos.bodyLarge),
                ],
                // ============================================================
                // QUEM FOI AVISADO: **ninguem**, e a tela nao suaviza.
                //
                // O mesmo bloco do desfecho, e aqui ele e MAIS necessario: no
                // desfecho a pessoa acabou de enviar e sabe que nada teve tempo
                // de acontecer. Quem abre esta tela dias depois, com o achado
                // em `Em analise`, e exatamente quem pode concluir sozinha que
                // alguem ja foi avisado nesse meio-tempo.
                // ============================================================
                const SizedBox(height: BichuEspaco.e6),
                const BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDeQuemFoiAvisado,
                  linhas: <String>[
                    TextosDoAchado.ninguemFoiAvisado,
                    TextosDoAchado.oQueOTutorRecebe,
                    TextosDoAchado.avisoNoCelularNaoFunciona,
                  ],
                ),
                // ============================================================
                // O QUE FAZER AGORA: tres passos, e o primeiro nao depende de
                // nos.
                // ============================================================
                const SizedBox(height: BichuEspaco.e6),
                const BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDoQueFazerAgora,
                  linhas: <String>[
                    TextosDoAchado.passoDaPlaquinha,
                    TextosDoAchado.passoDaListaDePerdidos,
                    TextosDoAchado.passoDeCuidar,
                  ],
                ),
                const SizedBox(height: BichuEspaco.e3),
                // A acao do passo 1: escanear a plaquinha e o unico caminho que
                // alcanca o tutor **hoje**, sem depender do aviso no celular
                // que nao funciona. `push` e nao `go`: quem escaneia e nao
                // encontra nada volta para esta tela, que e o endereco do
                // registro.
                BotaoSecundario(
                  rotulo: TextosDoAchado.escanearAPlaquinha,
                  aoTocar: () => context.push(Rotas.escanear),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
