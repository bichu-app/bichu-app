import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';

/// A microcopy da antessala de notificacao.
///
/// **Copiada de `docs/05-ux-research.md` secao 10.1, nao reescrita.** A unica
/// diferenca esta marcada abaixo, e ela e a mesma do conteudo do push no
/// servidor: o artigo antes do nome do pet sai, porque o app nao sabe o genero
/// do animal e nao ha campo para isso. "encontrar Rex" esta certo; "encontrar
/// a Rex" esta errado na tela de um tutor de verdade.
abstract final class TextosDaAntessala {
  /// UX 10.1, antessala C.3. Sem o artigo antes do nome (ver o topo).
  static String titulo(String nomeDoPet) =>
      'Quer ser avisada se alguém encontrar $nomeDoPet?';

  /// UX 10.1. "a tag dela" virou "a tag" pelo mesmo motivo do titulo.
  static const String corpo =
      'A gente manda um aviso no seu celular na hora em que alguém escanear a '
      'tag. E avisa também quando um pet sumir perto de você.';

  static const String sim = 'Sim, quero ser avisada';

  static const String agoraNao = 'Agora não';

  // -- A SEGUNDA OPORTUNIDADE (F3.2) ---------------------------------------
  //
  // UX 10.1, "Segunda oportunidade": em F3.2, ao confirmar o primeiro caso de
  // perdido, se ainda nao houver permissao. Mesma regra do artigo antes do
  // nome do topo deste arquivo -- "achar Nina", nunca "achar a Nina".
  //
  // O texto e outro de proposito, e a diferenca e o argumento: a primeira
  // antessala fala do que PODE acontecer um dia; esta fala do que esta
  // acontecendo agora. E a unica chance que sobrou, e ela e gasta com o pet
  // ja perdido.

  /// UX 10.1, segunda antessala.
  static String tituloDaSegunda(String nomeDoPet) =>
      'Alguém pode achar $nomeDoPet nos próximos minutos';

  static const String corpoDaSegunda =
      'Ligue o aviso no celular para saber na hora.';

  static const String ligarOAviso = 'Ligar o aviso';

  static const String continuarSem = 'Continuar sem';

  // -- QUEM NEGOU, E O CAMINHO DE VOLTA -------------------------------------
  //
  // UX 10.1, "Quem negou": "Nao recebe alerta de pet perdido por perto. Dito
  // uma vez, em texto, e nao descoberto depois". O documento poe a linha na
  // aba Perdidos e diz que ela "existe tambem em Perfil".
  //
  // **Ela entra em Perfil, e so ali.** A aba `Perdidos` nao existe mais neste
  // produto: a BICHUS-164 fundiu perdidos, achados e adocoes em `Pets`, e a
  // constante `Rotas.perdidos` foi removida. Por o aviso na listagem de `Pets`
  // o poria sobre pets para adocao, onde ele nao tem sentido nenhum.

  /// A linha fixa de quem recusou o aviso no dialogo do sistema.
  ///
  /// Diz o que se perde, **sem** prometer que o resto some: "Continua usando o
  /// app inteiro. Nada fica escondido" (UX 10.1).
  static const String semAvisoPorPerto =
      'Você não recebe aviso de pet perdido por perto.';

  /// O unico caminho de volta que existe depois de a permissao ser negada.
  static const String ligarNosAjustes = 'Ligar nos ajustes';

  /// A rede de seguranca, dita junto: o caso proprio NAO depende do push.
  ///
  /// UX 10.1 e o ADR-0008 sao explicitos em que o e-mail cobre o aviso ao
  /// tutor, "porque um canal que depende de permissao do sistema operacional
  /// nao pode ser o unico". Sem esta frase a linha acima soaria como se negar
  /// tivesse desligado o produto.
  static const String oEmailCobreOCasoProprio =
      'Se alguém achar um pet seu, a gente avisa por e-mail.';

  // -- DEDUZIDO ------------------------------------------------------------
  //
  // O UX nao escreve texto para "o registro do aparelho falhou", porque ele
  // desenha o fluxo e nao a falha de rede dele. A alternativa era silencio, e
  // silencio aqui seria o app prometendo um aviso que nao vai chegar.
  //
  // A frase NAO pede nada a pessoa e NAO tem acao: nao ha o que ela faca. O que
  // ela precisa saber e que o caso proprio continua coberto -- que e a promessa
  // de UX 10.1 para quem nega, e vale igual para quem quis e a rede nao deixou.

  /// Faixa informativa em F1.6 quando `POST /me/devices` nao completa.
  static String avisoNaoFicouLigado(String nomeDoPet) =>
      'Os avisos no celular não ficaram ligados agora. Você vai receber por '
      'e-mail se alguém achar $nomeDoPet.';
}

/// Qual das duas antessalas esta sendo exibida (UX 10.1).
///
/// Duas, e **nunca** uma terceira. Quem controla quantas vezes cada uma pode
/// aparecer nao e este arquivo: e `OportunidadesDeAviso`, em
/// `lib/dispositivo/`. Aqui mora so o que a pessoa le.
enum QualAntessala {
  /// C.3, em F1.6, depois de o QR do primeiro pet aparecer.
  primeira,

  /// A segunda e ultima, em F3.2, ao confirmar o primeiro caso de perdido.
  segunda,
}

/// C.3 — Antessala do pedido de permissao de notificacao (UX 10 e 10.1).
///
/// ## Por que ela e uma folha sobre F1.6, e nao uma rota
///
/// O inventario do UX da a ela um ID de tela (`C.3`), e mesmo assim ela **nao
/// pode** empurrar F1.6 para fora. F1.6 e a unica tela do produto em que o
/// codigo da tag existe por extenso: `GET /v1/pets/{petId}/tags` nunca mais
/// devolve o codigo em claro, nem para o dono. O proprio arquivo de F1.6 diz
/// que o codigo "vive na memoria desta tela e morre com ela". Navegar para uma
/// rota nova destruiria F1.6 e, com ela, o codigo -- e o estrago so apareceria
/// semanas depois, quando o tutor voltasse para reler o codigo e descobrisse
/// que ele nao existe mais em lugar nenhum alcancavel pelo app.
///
/// Uma folha modal atende as duas coisas: a antessala aparece "imediatamente
/// depois de o QR aparecer", como UX 10.1 pede, e o QR continua atras dela.
///
/// ## Por que tocar fora conta como recusa
///
/// Porque e o lado seguro. A recusa **nao dispara** o dialogo do sistema, e a
/// chance unica do iOS fica guardada. Tratar a dispensa como aceite abriria o
/// dialogo sem a pessoa ter pedido, que e exatamente o gasto sem contexto que
/// a antessala existe para impedir.
///
/// ## Por que as DUAS variantes sao o mesmo widget (BICHUS-24)
///
/// O criterio 6 da BICHUS-24 diz "a antessala em **qualquer** ponto": `Agora
/// nao` e `Continuar sem` tem o mesmo peso visual da acao positiva. Duas
/// classes irmas com a mesma `Column` copiada satisfariam o criterio no dia em
/// que fossem escritas e divergiriam na primeira vez que alguem mexesse numa
/// so -- e a que ficaria para tras e a da recusa, que e sempre a que ninguem
/// olha. Um widget com dois conjuntos de texto nao tem como divergir, e a
/// medida de acessibilidade de uma vale pela outra porque e a mesma arvore.
///
/// O mesmo vale para o `SafeArea` inferior abaixo: o achado em aparelho de
/// 22/09 custou uma descoberta, e ele nao pode precisar ser redescoberto na
/// segunda folha.
class AntessalaDeAviso extends StatelessWidget {
  const AntessalaDeAviso({
    required this.nomeDoPet,
    this.qual = QualAntessala.primeira,
    super.key,
  });

  final String nomeDoPet;

  final QualAntessala qual;

  String get _titulo => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.titulo(nomeDoPet),
        QualAntessala.segunda => TextosDaAntessala.tituloDaSegunda(nomeDoPet),
      };

  String get _corpo => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.corpo,
        QualAntessala.segunda => TextosDaAntessala.corpoDaSegunda,
      };

  String get _aceitar => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.sim,
        QualAntessala.segunda => TextosDaAntessala.ligarOAviso,
      };

  String get _recusar => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.agoraNao,
        QualAntessala.segunda => TextosDaAntessala.continuarSem,
      };

  /// Abre a folha e devolve `true` so quando a pessoa pediu para ser avisada.
  ///
  /// Dispensar por toque fora, por gesto ou pelo botao voltar cai em `false`,
  /// que e a recusa.
  static Future<bool> mostrar(
    BuildContext context, {
    required String nomeDoPet,
    QualAntessala qual = QualAntessala.primeira,
  }) async {
    final resposta = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => AntessalaDeAviso(nomeDoPet: nomeDoPet, qual: qual),
    );
    return resposta ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // `SafeArea` inferior, e o motivo esta no que `useSafeArea` NAO faz.
    //
    // `showModalBottomSheet(useSafeArea: true)` monta
    // `SafeArea(bottom: false, child: content)`
    // (`material/bottom_sheet.dart`, `_ModalBottomSheetRoute.buildPage`): ele
    // protege o **topo** e devolve a base ao conteudo de proposito, porque so
    // o conteudo sabe se ele rola. O nome do parametro sugere as duas bordas e
    // entrega uma.
    //
    // Sem isto, a recusa termina a 24 dp da borda inferior e a barra de
    // gestos come o toque: no iPhone a area segura inferior e de 34 dp e no
    // Android a barra de tres botoes tem 48. O alvo continua com 48 dp e
    // passa em qualquer verificacao de tamanho -- o que falta nao e tamanho, e
    // distancia ate a borda. A recusa e o lado seguro desta tela (UX 10), e
    // era justamente ela que ficava fora do alcance.
    //
    // `top: false` porque a rota ja cuidou do topo, e aplicar duas vezes
    // empurraria a folha para baixo sem motivo.
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                _titulo,
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            Text(_corpo, style: textos.bodyLarge),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: _aceitar,
              aoTocar: () => Navigator.of(context).pop(true),
            ),
            // `gapConsequenciaAlta`: as duas acoes levam a lugares diferentes
            // e nao podem ficar coladas sob o polegar.
            const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
            // **Mesmo peso visual**, como UX 10 exige textualmente. Um
            // `TextButton` aqui -- que e o padrao da secundaria em F1.6 --
            // transformaria a recusa num sussurro, e a antessala viraria
            // coacao com duas saidas no papel e uma na pratica. Contorno, e
            // nao preenchimento, para que continue havendo uma acao
            // principal; altura identica a da primaria.
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(false),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
                side:
                    BorderSide(color: cores.outline, width: BichuBorda.hairline),
              ),
              child: Text(_recusar),
            ),
          ],
        ),
      ),
    );
  }
}
