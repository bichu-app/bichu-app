/// O QUE O APARELHO JA DISSE SOBRE ONDE A PESSOA ESTA, **num lugar so**.
///
/// ## O defeito que isto conserta, e ele foi MEDIDO antes de uma linha
///
/// Decisao do cliente, 22/10/2026: *"quando o usuario autorizar a localizacao,
/// em qualquer uma das paginas, voce deve utilizar ela para todas as secoes, e
/// nao ficar perguntando na secao pets, depois rede, isso tem que ser default
/// depois que ele liberou"*. E, sobre onde guardar: *"parece que a localizacao
/// esta se perdendo, o usuario libera, mas em cada pagina solicita novamente,
/// ele deve manter a localizacao na sessao"*.
///
/// **A medicao, em 22/10/2026, com UMA porta e a permissao CONCEDIDA**
/// (`test/telas/localizacao_vale_para_todas_as_secoes_test.dart`, caso
/// `MEDICAO`): abrir o app e andar `Rede` -> `Pets` produzia **duas**
/// resolucoes de cidade, uma por secao, e `pedir()` ficava em **zero**. Ou
/// seja:
///
/// - **o dialogo do SISTEMA nunca reabriu.** Nenhuma secao chama `pedir()` ao
///   abrir -- so o toque chama. O que a pessoa ve de novo e **a caixa do
///   proprio app**, e nao a do Android nem a do iOS;
/// - **cada secao refazia a descoberta do zero** e guardava o resultado em si
///   mesma. A `Rede` resolvia `Sao Paulo`, os `Pets` tentavam outra vez, e
///   quando a segunda tentativa falhava -- geocoder sem cota, GPS sem fix
///   dentro de predio -- os `Pets` mostravam `Usar minha localizacao` de novo,
///   **com a cidade do aparelho ja conhecida uma aba antes**.
///
/// A causa, entao, e a primeira das duas: **a permissao esta concedida e o app
/// nao lembrava nem compartilhava o que ja tinha descoberto.** Este arquivo e
/// o "lugar so que guarda e responde".
///
/// ## O que ele guarda, e a distincao que NAO pode se perder
///
/// **`tem cidade` nao e `autorizou localizacao`, e confundir os dois muda o
/// comportamento de quem nunca autorizou.** `CidadeEscolhida`
/// (`sessao/cidade_escolhida.dart`) persiste **qualquer** cidade pesquisada, em
/// arquivo, inclusive a de quem nunca viu um dialogo de permissao. Guardar as
/// duas coisas no mesmo campo faria o app parar de oferecer a localizacao a
/// quem jamais a liberou.
///
/// Por isso [cidadeDoAparelho] **so recebe valor de uma resolucao do aparelho
/// que deu certo**. Cidade digitada, cidade guardada em arquivo e cidade da
/// regiao de referencia do tutor nao entram aqui, e continuam onde estao.
///
/// ## NADA DISTO VAI PARA O DISCO, e e decisao e nao esquecimento
///
/// Tres razoes, e a terceira e a que importa mais:
///
/// 1. `localizacao_no_ponto_de_uso_test.dart`, grupo *nada de localizacao fica
///    no aparelho*, cobra que localizacao nao seja gravada -- e manda que o
///    que for gravado entre em `limpezasAoSair` com isca propria, no mesmo
///    commit;
/// 2. o deposito de sessao (`sessao/deposito_de_sessao.dart`) e o CHAVEIRO, e
///    ele e amarrado a uma conta. O caso que mais precisa desta peca e o
///    visitante **sem conta nenhuma** -- ver o cabecalho de
///    `cidade_escolhida.dart`;
/// 3. **a permissao do sistema pode ser REVOGADA com o app fechado.** Um
///    `autorizou: true` guardado em disco faria o app acreditar que pode usar
///    a localizacao quando ele nao pode mais -- conveniencia virando defeito.
///    Como nada e persistido, cada arranque pergunta ao sistema (`estado()`,
///    que **nao abre dialogo**) e a resposta e sempre a verdade de agora.
///
/// **A consequencia honesta:** fechar e abrir o app faz a PRIMEIRA secao
/// aberta resolver uma vez. Dali em diante as outras nao resolvem mais. O que
/// o cliente relatou -- `em cada pagina solicita novamente` -- e o que sai;
/// uma resolucao por arranque e o que fica.
library;

import 'dart:async';

import '../dispositivo/localizacao.dart';

/// O prazo da MEDICAO do ponto, repassado a porta.
///
/// O mesmo valor que as duas telas ja usavam (`prazoDaResolucao` nos pets,
/// `prazoDaCidadeDoAparelho` na peca da rede): dois prazos para a mesma
/// medicao dariam duas experiencias da mesma permissao.
const Duration prazoDaMedicaoDaCidade = Duration(seconds: 12);

/// O TETO DA ESPERA, e ele existe porque [prazoDaMedicaoDaCidade] **nao cobre a
/// resolucao inteira**.
///
/// `cidadeAproximada` repassa o prazo a `pontoAproximado` e depois chama o
/// servico de plataforma. A porta ja tem prazo proprio para o geocoder, e este
/// teto cobre a chamada INTEIRA -- inclusive um travamento em qualquer linha
/// que nao seja o geocoder.
///
/// **`try/catch` nao serve aqui, e isso ja mordeu este app duas vezes**
/// (`Firebase.initializeApp`, `placemarkFromCoordinates`): um `Future` que
/// nunca completa **nao lanca**. Quem espera resposta do sistema precisa de
/// teto, e nao de `catch`.
const Duration tetoDaEsperaDaCidade = Duration(seconds: 24);

/// A localizacao que vale para TODAS as secoes nesta sessao de uso do app.
///
/// Uma instancia por app, montada em `app.dart` e entregue pelo `Escopo`. Nao
/// e um `ChangeNotifier` de proposito: quem avisa a tela continua sendo a peca
/// de cada secao (`CidadeDoAparelho`), que tem estado de TELA -- a frase da
/// caixa, o `procurando`. Aqui mora so o que e da SESSAO.
class LocalizacaoDaSessao {
  LocalizacaoDaSessao(this._porta);

  final Localizacao _porta;

  String? _cidadeDoAparelho;

  /// A cidade que o APARELHO resolveu nesta sessao, ou nulo.
  ///
  /// **Nome de cidade, nunca coordenada** -- ADR-0006 e emenda 1: o unico
  /// sentido autorizado e coordenada -> nome de cidade, e a coordenada nasce e
  /// morre dentro de [Localizacao.cidadeAproximada].
  ///
  /// **So uma resolucao do aparelho escreve aqui.** Ver o cabecalho: cidade
  /// digitada nao e autorizacao de localizacao.
  String? get cidadeDoAparelho => _cidadeDoAparelho;

  PermissaoDeLocalizacao? _permissao;

  /// O que o sistema respondeu da ultima vez que alguem perguntou. Nulo
  /// enquanto ninguem perguntou ainda.
  PermissaoDeLocalizacao? get permissao => _permissao;

  // **NAO HA UM `bool get autorizou` AQUI, e a ausencia e deliberada.**
  //
  // Ele foi escrito e removido no mesmo dia: ninguem o chamava. Quem decide se
  // a caixa aparece sao `CidadeDoAparelho.podeOferecer` e
  // `_podeOferecerLocalizacao` (nos pets), e os dois leem [permissao] direto --
  // um terceiro nome para a mesma pergunta seria o lugar onde a confusao entre
  // "tem cidade" e "autorizou" voltaria a caber. Codigo que nenhuma isca
  // derruba porque ninguem o chama nao e guarda: e convite.

  Future<ResultadoDaCidade>? _emVoo;

  /// Pergunta ao sistema qual e o estado da permissao. **Nao abre dialogo.**
  Future<PermissaoDeLocalizacao> estado() async {
    final atual = await _porta.estado();
    _permissao = atual;
    return atual;
  }

  /// Abre o dialogo do sistema. **So o toque da pessoa chega aqui.**
  Future<PermissaoDeLocalizacao> pedir() async {
    final depois = await _porta.pedir();
    _permissao = depois;
    return depois;
  }

  Future<void> abrirAjustesDoSistema() => _porta.abrirAjustesDoSistema();

  /// A CIDADE, resolvida **uma vez por sessao** e servida a todas as secoes.
  ///
  /// Tres caminhos, e os dois primeiros nao tocam no aparelho:
  ///
  /// 1. **ja resolvida** -> devolve a guardada. E isto que faz a segunda secao
  ///    nao perguntar nada: ela recebe a cidade e a caixa nem aparece;
  /// 2. **resolucao em voo** -> devolve o MESMO `Future`. Duas secoes montadas
  ///    no mesmo quadro gastariam duas resolucoes do teto de uso da plataforma
  ///    para a mesma medicao;
  /// 3. **nada ainda** -> pede a porta, com [tetoDaEsperaDaCidade] por cima.
  ///
  /// [forcar] pula o caminho 1: e o TOQUE em `Usar minha localizacao`, que e um
  /// ato da pessoa pedindo para tentar de novo. Sem ele, quem tocou depois de
  /// uma falha receberia a falha guardada e o botao "nao funcionaria".
  Future<ResultadoDaCidade> cidade({bool forcar = false}) {
    if (!forcar) {
      final guardada = _cidadeDoAparelho;
      if (guardada != null) {
        return Future<ResultadoDaCidade>.value(CidadeResolvida(guardada));
      }
      final emVoo = _emVoo;
      if (emVoo != null) return emVoo;
    }
    final tentativa = _porta
        .cidadeAproximada(prazo: prazoDaMedicaoDaCidade)
        .timeout(
          tetoDaEsperaDaCidade,
          onTimeout: () => CidadeNaoResolvida(
            MotivoDeNaoTerCidade.resolucaoSemResposta,
            detalhe: 'teto de ${tetoDaEsperaDaCidade.inSeconds}s na sessao',
          ),
        )
        .then((resultado) {
      if (resultado is CidadeResolvida) _cidadeDoAparelho = resultado.cidade;
      return resultado;
    });
    _emVoo = tentativa;
    // `whenComplete` e nao `then`: a limpeza tem de correr tambem quando a
    // tentativa termina em erro, senao um `_emVoo` morto bloquearia todas as
    // tentativas seguintes desta sessao.
    tentativa.whenComplete(() {
      if (_emVoo == tentativa) _emVoo = null;
    });
    return tentativa;
  }
}
