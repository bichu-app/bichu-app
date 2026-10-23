/// A CIDADE DO APARELHO, e a caixa que a oferece **enquanto ela nao existe**.
///
/// ## Por que esta peca e compartilhada, e nao copiada em cada secao
///
/// Decisao do cliente, 20/10/2026: *"nos eventos e na comunidade, voce tambem
/// deve trazer os mais proximos da localizacao, utilizar a mesma inteligencia
/// do pets"*. **`A mesma` e literal.** Sao tres secoes (`Pets`, `Eventos`,
/// `Comunidade`), a mesma pessoa e o mesmo app, e divergencia entre secoes le
/// como defeito -- quem concedeu a permissao em `Pets` e viu a cidade aparecer
/// nao tem como entender `Eventos` pedindo de novo com outras palavras, nem
/// uma caixa que fica na tela numa aba e sai na outra.
///
/// Por isso **a regra de aparecer e sair mora NUM lugar** ([CaixaDeLocalizacao.
/// build], primeira linha) e nao em cada tela: tres copias divergem na proxima
/// correcao, e a correcao de 20/10 ja custou um defeito (ver
/// [CidadeDoAparelho.resolverPorToque]).
///
/// ## A `inteligencia do Pets` NAO E ordenar por distancia
///
/// Ela resolve a **cidade** a partir da coordenada e usa a cidade. O ADR-0006 e
/// explicito: *"A listagem publica de perdidos filtra por cidade e bairro
/// digitados, jamais por latitude e longitude"*, e a **emenda 1** (19/10/2026)
/// autorizou **um sentido so**, coordenada -> nome de cidade, por servico de
/// plataforma. O inverso -- endereco ou bairro -> coordenada -- segue proibido
/// e e cobrado por portao (`sem_geocodificacao_test.dart`).
///
/// **Nada aqui poe coordenada em consulta nenhuma.** Esta peca devolve um
/// `String?` com o NOME da cidade, e o nome e o que vai para a rota, no
/// parametro `city` que as tres operacoes ja declaram no contrato. A coordenada
/// nasce e morre dentro de [Localizacao.cidadeAproximada], que e a unica
/// conversao desta fronteira.
///
/// ## O que a ordem por distancia das duas abas da `Rede` NAO e
///
/// As duas abas JA ordenam por distancia de verdade, e por um mecanismo que
/// **nao e este**: o ponto de referencia que o servidor guarda por aparelho
/// (`user_reference_locations`, par `(user_id, session_family_id)`), medido em
/// SQL com `ST_Distance` e exposto so em metros. Ele e independente desta peca
/// e continua valendo -- as duas coisas se somam em vez de competir: a cidade
/// recorta QUAIS itens entram, a distancia ordena os que entraram.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../dispositivo/localizacao.dart';
import '../escopo.dart';
import '../sessao/localizacao_da_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

// **OS DOIS PRAZOS DESTA PECA SAIRAM DAQUI (22/10/2026), e nao foram
// perdidos.** Eles viviam aqui E em `lista_de_perdidos.dart`, com os MESMOS
// valores e dois nomes -- `prazoDaCidadeDoAparelho`/`prazoDaResolucao` e
// `tetoDaEsperaDaCidadeDoAparelho`/`tetoDaEsperaDaResolucao`. Agora a espera
// pelo aparelho acontece num lugar so, e os prazos moram com ela:
// `prazoDaMedicaoDaCidade` e `tetoDaEsperaDaCidade`, em
// `sessao/localizacao_da_sessao.dart`.
//
// Duas copias do mesmo prazo nao eram enfeite: elas davam DUAS experiencias da
// mesma permissao assim que alguem ajustasse uma e esquecesse a outra.

/// O que a caixa diz quando ha algo a dizer.
///
/// **Quatro, e nao os oito motivos de [MotivoDeNaoTerCidade]**: a caixa oferece
/// dois caminhos (tentar de novo, ou escolher a cidade no filtro), e distinguir
/// oito sentencas sobre as mesmas duas saidas e ruido. O agrupamento e o mesmo
/// da pagina de pets, pela mesma razao.
enum AvisoDaCidadeDoAparelho {
  /// A resolucao esta correndo. **A tela responde ao toque antes de ter
  /// resposta**: doze segundos sem nada e o botao "nao esta funcionando".
  procurando,

  /// Recusada, agora ou em definitivo.
  semPermissao,

  /// Permissao ha, servico de localizacao desligado nos ajustes. **Separado de
  /// [semPermissao] de proposito**: mandar quem desligou o servico para a tela
  /// de permissao que ela ja concedeu e o defeito que
  /// [Localizacao.servicoLigado] existe para evitar.
  servicoDesligado,

  /// Veio coordenada e nao veio nome de cidade -- ou nao veio coordenada por um
  /// motivo que nao e recusa nem servico (sem fix no prazo, geocoder ausente,
  /// teto de uso, sem resultado, indisponivel).
  naoDescoberta,
}

/// A cidade que o APARELHO diz, e o estado da tentativa de descobri-la.
///
/// Um [ChangeNotifier] e nao um `mixin` de `State`: assim ele e exercitavel
/// **sem montar tela**, e os dois caminhos de resolucao (abertura e toque) sao
/// medidos direto. Quem o usa escuta e redesenha.
class CidadeDoAparelho extends ChangeNotifier {
  CidadeDoAparelho(this._sessao);

  /// A porta vem do [Escopo], e **e esta peca que a pega -- nao a tela**.
  ///
  /// `localizacao_no_ponto_de_uso_test.dart` cobra uma lista curta de quem pode
  /// falar com a porta, e o proprio portao explica a regra: *"uma tela que
  /// precise falar com a porta direto esta contornando a peca, e ai o
  /// tratamento dos cinco motivos de falha passa a existir em dois lugares"*.
  ///
  /// Com esta fabrica, as secoes que usam a cidade do aparelho **nao nomeiam a
  /// porta**: elas constroem a peca e leem `cidade`. Um nome novo na lista do
  /// portao, e nao um por secao -- que e exatamente o que a lista curta quer
  /// dizer.
  factory CidadeDoAparelho.doEscopo(BuildContext context) =>
      CidadeDoAparelho(Escopo.of(context).localizacaoDaSessao);

  /// A LOCALIZACAO DA SESSAO, e nao a porta do aparelho.
  ///
  /// **E esta troca que faz a autorizacao valer para todas as secoes**
  /// (cliente, 22/10/2026). Esta peca continua sendo uma por secao -- ela tem
  /// estado de TELA, a frase da caixa e o `procurando` -- mas a MEMORIA do que
  /// o aparelho respondeu passou a ser uma so, do app inteiro. A segunda secao
  /// aberta recebe a cidade ja resolvida sem tocar no aparelho, e por isso a
  /// caixa nem aparece nela.
  final LocalizacaoDaSessao _sessao;

  /// A cidade resolvida pelo aparelho, ou nulo. **Nome, nunca coordenada.**
  ///
  /// Vem da sessao, e nao de um campo desta peca: duas secoes abertas na mesma
  /// sessao leem o MESMO valor, que e o requisito de 22/10.
  String? get cidade => _sessao.cidadeDoAparelho;

  AvisoDaCidadeDoAparelho? _aviso;

  /// O que a caixa diz. Nulo e o estado normal: ninguem pediu nada ainda.
  AvisoDaCidadeDoAparelho? get aviso => _aviso;

  /// A resolucao esta correndo.
  bool get procurando => _aviso == AvisoDaCidadeDoAparelho.procurando;


  /// **Da para OFERECER a localizacao neste aparelho.**
  ///
  /// `false` ate a porta responder, e `false` para sempre quando ela diz
  /// [PermissaoDeLocalizacao.indisponivel] -- a compilacao sem o plugin, ou o
  /// aparelho sem o servico. **O MESMO criterio da pagina de pets**
  /// (`_podeOferecerLocalizacao`, `!= indisponivel`), e de proposito: tres
  /// secoes com tres criterios para o mesmo botao e a divergencia que esta peca
  /// existe para nao ter.
  ///
  /// Oferecer onde nao funciona e `acao sem destino`, o defeito que o criterio
  /// 2 da BICHUS-62 proibe -- e aqui seria pior do que de costume, porque o
  /// toque *pareceria* ter funcionado: ele pede, falha e volta com a terceira
  /// frase, sem a pessoa ter como saber que nunca ia dar.
  ///
  /// Comecar em `false` tambem evita o PISCA: a caixa aparecendo no primeiro
  /// quadro e saindo no seguinte, numa compilacao em que ela nunca poderia
  /// servir.
  bool get podeOferecer =>
      _sessao.permissao != null &&
      _sessao.permissao != PermissaoDeLocalizacao.indisponivel;

  bool _descartado = false;

  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _anunciar() {
    if (_descartado) return;
    notifyListeners();
  }

  /// A ABERTURA: resolve **so com a permissao JA concedida**, e em silencio.
  ///
  /// Pedir aqui abriria o dialogo do sistema como efeito colateral de abrir uma
  /// aba, e o pedido e um ato da pessoa. Quando nao da, os oito motivos caem
  /// **sem uma palavra**: ninguem pediu nada, e faixa de erro em cima de uma
  /// lista que abriu bem e erro inventado.
  ///
  /// Devolve `true` quando a cidade mudou -- e o sinal de recarregar.
  Future<bool> resolverNaAbertura() async {
    if (procurando) return false;
    final permissao = await _sessao.estado();
    if (_descartado) return false;
    // `podeOferecer` acabou de mudar: a caixa depende dele.
    _anunciar();
    if (permissao != PermissaoDeLocalizacao.concedida) return false;
    return _resolver(porToque: false);
  }

  /// O TOQUE: pede a permissao e, concedida, resolve. **Responde sempre.**
  ///
  /// ## [porToque] nao e conveniencia: ele e o conserto
  ///
  /// Os dois caminhos eram um metodo so na pagina de pets, e a confusao deles
  /// **era a causa do defeito de 20/10/2026** (*"o botao de usar minha
  /// localizacao na secao do pets nao esta funcionando"*). O guarda era
  /// `if (_pessoaMexeu) return;`, correto para a abertura -- trocar a lista
  /// debaixo de quem acabou de digitar uma cidade e o pior desfecho -- e
  /// invertido no toque: bastava digitar uma cidade, ou tocar `Ver todas`, para
  /// o botao gastar a permissao e o teto de uso da plataforma, receber a cidade
  /// e **joga-la fora** sem trocar um pixel.
  ///
  /// **Por isso `pessoa mexeu` NAO e criterio em lugar nenhum desta peca.** O
  /// criterio da caixa e "ha cidade em uso" ([CaixaDeLocalizacao]), e a
  /// precedencia do toque e resolvida por quem chama: no toque **a pessoa
  /// acabou de escolher a localizacao**, e essa e a escolha mais nova.
  Future<bool> resolverPorToque() async {
    // Dois toques seguidos pediriam permissao duas vezes e gastariam o teto de
    // uso do geocoder duas vezes. O botao desabilita enquanto `procurando`
    // vale, e esta guarda cobre o toque que escapa entre o gesto e o quadro.
    if (procurando) return false;
    _aviso = AvisoDaCidadeDoAparelho.procurando;
    _anunciar();

    final antes = await _sessao.estado();
    if (_descartado) return false;
    if (antes == PermissaoDeLocalizacao.negadaPermanentemente) {
      // Abrir os ajustes e o certo -- pedir de novo nao abre dialogo nenhum --,
      // e a tela DIZ isso: quem volta dos ajustes sem liberar, e quem nao chega
      // a sair do app, lia o nada.
      _aviso = AvisoDaCidadeDoAparelho.semPermissao;
      _anunciar();
      await _sessao.abrirAjustesDoSistema();
      return false;
    }

    final depois = await _sessao.pedir();
    if (_descartado) return false;
    switch (depois) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.negadaPermanentemente:
      case PermissaoDeLocalizacao.naoPedida:
        // `naoPedida` depois de `pedir()` e o dialogo que a pessoa dispensou
        // sem responder. Para a tela e o mesmo que recusar.
        _aviso = AvisoDaCidadeDoAparelho.semPermissao;
        _anunciar();
        return false;
      case PermissaoDeLocalizacao.indisponivel:
        // Ausencia, nao recusa -- e ausencia nao manda ninguem para ajuste
        // nenhum. Cai na frase que oferece o filtro.
        _aviso = AvisoDaCidadeDoAparelho.naoDescoberta;
        _anunciar();
        return false;
      case PermissaoDeLocalizacao.concedida:
        break;
    }
    return _resolver(porToque: true);
  }

  /// A resolucao em si, pelos dois caminhos.
  Future<bool> _resolver({required bool porToque}) async {
    // **O `timeout` nao e rede sobre rede.** Ver `tetoDaEsperaDaCidade`:
    // o prazo que a porta recebe cobre a MEDICAO do ponto, e nao a resolucao do
    // nome da cidade, que nao tem prazo em pacote nenhum.
    // **O TETO MUDOU DE LUGAR, e nao desapareceu.** Ele vive agora em
    // `LocalizacaoDaSessao.cidade` (ver `tetoDaEsperaDaCidade` la), junto com a
    // guarda de "ja resolvida" e a de "resolucao em voo" -- as tres precisam
    // ficar do mesmo lado, senao um `Future` pendurado seria compartilhado por
    // todas as secoes em vez de por nenhuma.
    //
    // `forcar: porToque`: a abertura ACEITA a cidade que outra secao ja
    // resolveu -- e exatamente isso que o cliente pediu em 22/10. O toque pede
    // medicao nova, porque e um ato da pessoa querendo tentar de novo.
    final anterior = _sessao.cidadeDoAparelho;
    final resultado = await _sessao.cidade(forcar: porToque);
    if (_descartado) return false;
    switch (resultado) {
      case CidadeNaoResolvida(motivo: final motivo):
        // Na abertura, os oito motivos caem em silencio. Ver
        // [resolverNaAbertura].
        if (!porToque) return false;
        _aviso = switch (motivo) {
          MotivoDeNaoTerCidade.permissaoNegada ||
          MotivoDeNaoTerCidade.permissaoNegadaPermanentemente =>
            AvisoDaCidadeDoAparelho.semPermissao,
          MotivoDeNaoTerCidade.servicoDesligado =>
            AvisoDaCidadeDoAparelho.servicoDesligado,
          // CODIGO DE FIO DA ONDA 4: `tetoDeUsoEstourado` virou
          // `falhaDoServico` na frente da reserva e do prazo, e ela
          // acrescentou `resolucaoSemResposta`. As duas frentes nao se
          // cruzaram em linha nenhuma, entao a uniao compilava quebrada: este
          // `switch` e exaustivo. A classificacao e a MESMA de
          // `telas/perdido/lista_de_perdidos.dart`, que a propria frente do
          // renome escreveu -- os seis sao "nao deu agora".
          MotivoDeNaoTerCidade.semFixNoPrazo ||
          MotivoDeNaoTerCidade.indisponivel ||
          MotivoDeNaoTerCidade.geocoderAusente ||
          MotivoDeNaoTerCidade.falhaDoServico ||
          MotivoDeNaoTerCidade.resolucaoSemResposta ||
          MotivoDeNaoTerCidade.semResultado =>
            AvisoDaCidadeDoAparelho.naoDescoberta,
        };
        _anunciar();
        return false;
      case CidadeResolvida(cidade: final cidade):
        final trocou = cidade != anterior;
        _aviso = null;
        _anunciar();
        return trocou;
    }
  }
}

/// A CAIXA que oferece a localizacao, **e que sai de cena quando ela chega**.
///
/// ## A regra de aparecer e sair, que e o requisito
///
/// Decisao do cliente, 20/10/2026, pedida em `Pets` e valendo para as tres
/// secoes: a caixa aparece **so enquanto a localizacao nao esta resolvida**;
/// resolvida, **so a cidade dentro do filtro**. A primeira linha de [build] e
/// isso inteiro, e e o unico lugar do app que decide.
///
/// **O criterio e `ha cidade em uso`, e NAO `a pessoa interagiu`.** A distincao
/// custou um defeito: `_pessoaMexeu`, na pagina de pets, servia a resolucao de
/// abertura e descartava o resultado do toque (ver
/// [CidadeDoAparelho.resolverPorToque]). Uma caixa que sai porque alguem tocou
/// em algo sairia para quem tocou e nao conseguiu cidade nenhuma -- que e
/// exatamente quem ainda precisa dela.
///
/// [cidadeEmUso] e o recorte que de fato esta valendo na lista, venha do
/// aparelho ou do filtro: as duas sao "cidade resolvida" para quem olha a tela,
/// e esconder a caixa de quem escolheu a cidade a mao e tao certo quanto
/// esconde-la de quem concedeu a permissao.
class CaixaDeLocalizacao extends StatelessWidget {
  const CaixaDeLocalizacao({
    required this.cidadeEmUso,
    required this.explicacao,
    required this.podeOferecer,
    required this.aviso,
    required this.aoUsarLocalizacao,
    super.key,
  });

  /// A cidade que a lista esta usando, de qualquer origem. **Nao nula esconde a
  /// caixa inteira.**
  final String? cidadeEmUso;

  /// O que a lista esta mostrando enquanto nao ha cidade. Por secao, porque o
  /// substantivo e da secao -- a ESTRUTURA e que e compartilhada.
  final String explicacao;

  /// Da para oferecer a localizacao neste aparelho. **Falso esconde a caixa**,
  /// pelo mesmo motivo de [cidadeEmUso] nao nula: ver
  /// [CidadeDoAparelho.podeOferecer].
  final bool podeOferecer;

  final AvisoDaCidadeDoAparelho? aviso;

  /// **Nulo desenha o botao DESABILITADO**, e nao o esconde. Esconder o unico
  /// controle que a pessoa acabou de tocar faria o toque parecer ter apagado a
  /// saida; desabilitado ela ve que o toque foi recebido.
  final VoidCallback? aoUsarLocalizacao;

  static const String rotuloDeUsarLocalizacao = 'Usar minha localização';

  /// As quatro frases. **Nenhuma culpa a pessoa e todas oferecem saida**, e as
  /// duas saidas sao sempre as mesmas: tentar de novo, ou escolher a cidade no
  /// filtro.
  static const String avisoProcurando = 'Procurando sua localização…';

  static const String avisoSemPermissao =
      'Sem a permissão de localização não dá para descobrir sua cidade. Dá '
      'para liberar nos ajustes do aparelho, ou escolher a cidade no filtro.';

  static const String avisoServicoDesligado =
      'A localização do aparelho está desligada. Dá para ligar nos ajustes, '
      'ou escolher a cidade no filtro.';

  static const String avisoNaoDescoberta =
      'Não deu para descobrir sua cidade agora. Dá para tentar de novo, ou '
      'escolher a cidade no filtro.';

  static String? textoDoAviso(AvisoDaCidadeDoAparelho? aviso) =>
      switch (aviso) {
        null => null,
        AvisoDaCidadeDoAparelho.procurando => avisoProcurando,
        AvisoDaCidadeDoAparelho.semPermissao => avisoSemPermissao,
        AvisoDaCidadeDoAparelho.servicoDesligado => avisoServicoDesligado,
        AvisoDaCidadeDoAparelho.naoDescoberta => avisoNaoDescoberta,
      };

  @override
  Widget build(BuildContext context) {
    // **A REGRA, inteira.** Ha cidade em uso -> a caixa nao existe, e a cidade
    // vive no filtro (ver o cabecalho desta classe). Nao da para oferecer ->
    // ela tambem nao existe, porque um botao que nunca pode funcionar e pior
    // que botao nenhum (ver [podeOferecer]).
    if (cidadeEmUso != null || !podeOferecer) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final texto = textoDoAviso(aviso);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // `liveRegion`: a caixa TROCA de frase, e depois SAI, com a lista ja
          // pintada. Sem isto, quem usa leitor de tela veria o recorte mudar
          // sem nada ser anunciado.
          Semantics(
            liveRegion: true,
            child: Text(texto ?? explicacao, style: textos.bodyMedium),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: aoUsarLocalizacao,
              child: const Text(rotuloDeUsarLocalizacao),
            ),
          ),
        ],
      ),
    );
  }
}
