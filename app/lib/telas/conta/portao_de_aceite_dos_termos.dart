import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/termos_api.dart';
import 'tela_de_aceite_dos_termos.dart';

/// ===========================================================================
/// O GATILHO DA RECOLETA. **UMA LINHA, E E ESTA.**
/// ===========================================================================
///
/// `true` liga o pedido de aceite. `false` o deixa de pe e calado.
///
/// ## Por que existe um interruptor, em vez de "diverge, logo pede"
///
/// Porque **divergir nao basta como gatilho: hoje ja diverge para todo mundo.**
/// Medido em 01/11/2026, 37 registros de aceite no banco local:
///
///   - 1 com `2026-09-17`, versao que NUNCA esteve no ar (e a data dos
///     ADR-0001..0013);
///   - 36 com `NULL`, consentimento sem versao nenhuma.
///
/// E a versao que este binario exige passou a ser `2026-09-23`, da fonte unica
/// `web/src/conteudo/versao-legal.json` (PR #142). Entao ligar a comparacao sem
/// interruptor pediria aceite a **todas as 37 contas no primeiro arranque** --
/// contra um texto que ainda diz, nas paginas publicadas,
/// *"Rascunho -- pendente de revisao juridica"*.
///
/// Colher aceite contra rascunho repete o defeito que esta entrega conserta,
/// com data nova: consentimento apontando para um documento que nao e o final.
///
/// ## Quem vira a chave, e quando
///
/// O CLIENTE, **depois da revisao juridica**, junto com a publicacao do texto
/// aprovado. Nao e decisao de engenharia: a pergunta "o texto esta pronto para
/// ser aceito?" so o advogado dele responde.
///
/// Virar a chave aqui NAO muda o texto publicado, NAO tira o aviso de rascunho
/// e NAO arbitra data -- as tres coisas moram em outros arquivos, de proposito.
/// A versao que sera gravada e a que `versao-legal.json` publicar naquele dia.
///
/// ## A consequencia de a versao exigida vir do BINARIO, dita em voz alta
///
/// Este interruptor e esta linha viajam **dentro do APK**. Aparelho com APK
/// antigo nao tem nem o interruptor nem a versao nova: ele continua exigindo a
/// versao que foi compilada nele, e nao pede nada. Logo **a recoleta alcanca
/// quem atualizar o aplicativo, e so.**
///
/// Isso e desenho e nao esquecimento. A alternativa -- o servidor dizer qual e
/// a versao exigida -- alcancaria todo mundo sem atualizacao, e e MUDANCA DE
/// FRONTEIRA: a versao exigida sairia do binario e passaria a ser decidida por
/// quem publica. **Nao foi decidido**, e por isso nao foi feito.
const bool recoletaDoAceiteLigada = false;

/// O PORTAO DO ACEITE: quem pede o aceite novo a quem JA tem conta.
///
/// ## Onde a pessoa encontra o pedido
///
/// **Em qualquer tela, no arranque**, porque este portao embrulha o aplicativo
/// inteiro -- do lado de `PortaoDeVersao`, em `app/lib/app.dart`. Nao ha item de
/// menu nem aviso para procurar: o pedido aparece por cima do que estiver
/// aberto, assim que a sessao esta de pe.
///
/// Esse lugar foi escolhido por uma cicatriz, e nao por gosto: em 28/10/2026 o
/// passkey foi entregue em TODAS as camadas e sem NENHUMA porta para quem ja
/// tinha conta. Funcionalidade inalcancavel equivale a funcionalidade que nao
/// existe, e um pedido de aceite que so aparece no cadastro nunca alcancaria
/// justamente as 37 contas que precisam dele.
///
/// ## As quatro razoes de NAO pedir, e cada uma e deliberada
///
/// 1. **Interruptor desligado** ([recoletaDoAceiteLigada]): ver acima.
/// 2. **Ninguem conectado.** Aceite e de uma CONTA, e sem sessao nao ha onde
///    gravar. A tela de abertura nao e lugar de pedir aceite.
/// 3. **Este build nao sabe qual versao exige** (`versaoExigida` nula, o APK
///    sem `--dart-define=TERMS_VERSION`). Pedir aqui registraria aceite SEM
///    versao, que e exatamente o defeito dos 36 nulos. **Nao pedir e o lado
///    certo**, e e a mesma escolha que `tela_criar_conta.dart` faz desde
///    01/11/2026.
/// 4. **Nao houve resposta do servidor.** `null` de rede nao e "nao aceitou":
///    o pedido apareceria e o botao falharia pela mesma rede.
///
/// ## O que ele trata como "nunca aceitou a versao atual"
///
/// Versao registrada **diferente** da exigida, e versao registrada **nula** --
/// os 36 nulos medidos. `registrada != exigida` cobre os dois de uma vez, e o
/// caso nulo tem teste proprio para que ele nao passe a ser coberto por
/// acidente.
class PortaoDeAceiteDosTermos extends StatefulWidget {
  const PortaoDeAceiteDosTermos({
    required this.termosApi,
    required this.tokenValido,
    required this.versaoExigida,
    required this.child,
    super.key,
    this.urlDosTermos,
    this.urlDaPrivacidade,
    this.ligado = recoletaDoAceiteLigada,
  });

  final TermosApi termosApi;

  /// `ControladorDeSessao.tokenValido`: nulo significa NINGUEM CONECTADO.
  ///
  /// Uma funcao e nao o controlador inteiro, porque e exatamente isto que este
  /// portao precisa saber -- e dependencia menor e o que deixa o caso de teste
  /// medir o portao em vez de montar uma sessao.
  final Future<String?> Function() tokenValido;

  /// `AppConfig.versaoDosTermos`: a versao que ESTE binario exige.
  final String? versaoExigida;

  /// `AppConfig.urlDosTermos` / `urlDaPrivacidade`: para onde a pessoa vai LER.
  final Uri? urlDosTermos;
  final Uri? urlDaPrivacidade;

  /// Injetavel **so para teste**. Em producao e [recoletaDoAceiteLigada].
  final bool ligado;

  final Widget child;

  @override
  State<PortaoDeAceiteDosTermos> createState() => _PortaoDeAceiteDosTermosState();
}

class _PortaoDeAceiteDosTermosState extends State<PortaoDeAceiteDosTermos> {
  /// A versao registrada, quando o servidor respondeu. Nulo cobre "nao
  /// perguntei ainda", "nao houve resposta" e "nao ha aceite" -- e os tres
  /// levam a NAO desenhar o pedido, porque [_precisaPedir] exige
  /// [_servidorRespondeu].
  String? _registrada;

  bool _servidorRespondeu = false;

  /// A pessoa disse "Agora nao" NESTE arranque.
  ///
  /// **Nao persiste, e isso e a decisao mais contida possivel**: nada e apagado,
  /// nada e travado, e o pedido volta no proximo arranque. O que recusar deve
  /// significar de verdade e decisao de produto -- e enquanto nao houver uma,
  /// este portao nao a consuma.
  bool _recusouNesteArranque = false;

  @override
  void initState() {
    super.initState();
    unawaited(_perguntar());
  }

  Future<void> _perguntar() async {
    if (!widget.ligado) return;
    final exigida = widget.versaoExigida;
    if (exigida == null || exigida.isEmpty) return;
    if (await widget.tokenValido() == null) return;

    final aceite = await widget.termosApi.consultar();
    if (!mounted) return;
    setState(() {
      _registrada = aceite.versao;
      _servidorRespondeu = aceite.servidorRespondeu;
    });
  }

  bool get _precisaPedir {
    if (!widget.ligado) return false;
    if (_recusouNesteArranque) return false;
    if (!_servidorRespondeu) return false;
    final exigida = widget.versaoExigida;
    if (exigida == null || exigida.isEmpty) return false;
    // `!=` cobre versao diferente E versao nula de uma vez.
    return _registrada != exigida;
  }

  /// Grava o aceite COM a versao exigida, e nunca sem ela.
  ///
  /// A versao vem de `widget.versaoExigida`, que [_precisaPedir] ja provou nao
  /// ser nula -- entao nao ha caminho daqui que mande valor vazio. Mesmo que
  /// houvesse: o servidor recusa com 400 e o Postgres recusa com
  /// `version NOT NULL`.
  Future<bool> _aceitar() async {
    final exigida = widget.versaoExigida;
    if (exigida == null || exigida.isEmpty) return false;
    try {
      await widget.termosApi.registrar(exigida);
    } on Object {
      return false;
    }
    if (mounted) setState(() => _registrada = exigida);
    return true;
  }

  @override
  Widget build(BuildContext context) {
    if (!_precisaPedir) return widget.child;
    return TelaDeAceiteDosTermos(
      aoAceitar: _aceitar,
      aoRecusar: () => setState(() => _recusouNesteArranque = true),
      urlDosTermos: widget.urlDosTermos,
      urlDaPrivacidade: widget.urlDaPrivacidade,
    );
  }
}
