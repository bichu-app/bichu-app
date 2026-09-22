import 'package:flutter/widgets.dart';

import '../../api/falhas.dart';
import '../../dispositivo/avisos.dart';
import '../../dispositivo/oportunidades_de_aviso.dart';
import '../../escopo.dart';
import 'antessala_de_aviso.dart';

/// O desfecho do pedido, do ponto de vista de quem chamou.
enum DesfechoDoPedido {
  /// A antessala apareceu e a pessoa concedeu no dialogo do sistema.
  concedido,

  /// A antessala apareceu e a permissao continua sem ser concedida -- por
  /// recusa da antessala, por recusa no dialogo, ou por dispensa da folha.
  oferecidoESemPermissao,

  /// **Nao houve antessala**, e e o desfecho que a BICHUS-24 existe para
  /// tornar possivel: ou a permissao ja estava respondida, ou as duas
  /// oportunidades acabaram, ou este build nao tem push.
  naoOferecido,

  /// O registro do aparelho no servidor nao completou. A tela que chamou
  /// precisa dizer isso: o app estaria prometendo um aviso que nao vai chegar.
  registroFalhou,
}

/// O fluxo inteiro do pedido de permissao de aviso, nos dois pontos em que ele
/// existe (UX 10.1, BICHUS-24).
///
/// ## Por que isto saiu de dentro de F1.6
///
/// Ate a BICHUS-24 este fluxo era um metodo privado de
/// `tela_pet_cadastrado.dart`. Funcionava, e nao dava para reusar: F3.2 e a
/// **segunda oportunidade da mesma permissao**, com o mesmo limite, o mesmo
/// registro de aparelho e a mesma regra de nao abrir o dialogo duas vezes.
/// Reimplementar isso na outra tela e como a regra de "duas oportunidades"
/// vira "duas em cada tela" sem ninguem decidir -- e a segunda copia nunca
/// recebe a correcao que a primeira recebeu.
///
/// O que fica na tela e o que e da tela: quando chamar, e o que fazer com a
/// faixa de falha.
///
/// ## As quatro perguntas que este fluxo responde, na ordem
///
/// 1. **Este build tem push?** Sem plataforma, nada acontece e nenhum aparelho
///    e registrado: um aparelho sem push na base sujaria a contagem de alcance,
///    que e a metrica que decide se o alerta toca em alguem (ADR-0008).
/// 2. **A permissao ja foi respondida?** Se sim, nao ha antessala: o dialogo do
///    sistema nao abre mais, e uma antessala que leva a lugar nenhum e pior que
///    nenhuma. O caminho de volta e `Ligar nos ajustes`, em Perfil.
/// 3. **Esta oportunidade ainda cabe?** E a pergunta que nao existia. Ver
///    [OportunidadesDeAviso].
/// 4. **O que o servidor precisa saber?** O aparelho e registrado nos tres
///    desfechos, inclusive quando a pessoa recusou.
abstract final class PedidoDeAviso {
  /// Oferece a permissao **uma vez** em [oportunidade], e nunca mais ali.
  ///
  /// [nomeDoPet] entra no titulo das duas antessalas.
  static Future<DesfechoDoPedido> oferecer(
    BuildContext context, {
    required OportunidadeDeAviso oportunidade,
    required String nomeDoPet,
  }) async {
    // O escopo e lido ANTES do primeiro `await`: depois dele o `context` pode
    // nao estar mais montado, e `Escopo.of` num elemento desmontado estoura.
    final escopo = Escopo.of(context);
    final avisos = escopo.avisos;
    final devices = escopo.devices;
    final oportunidades = escopo.oportunidades;
    final vigia = escopo.vigiaDeAviso;

    final plataforma = avisos.plataforma;
    if (plataforma == null) return DesfechoDoPedido.naoOferecido;

    var permissao = await avisos.estado();
    if (permissao == PermissaoDeAviso.indisponivel) {
      return DesfechoDoPedido.naoOferecido;
    }

    var houveAntessala = false;

    if (permissao == PermissaoDeAviso.naoPedida &&
        await oportunidades.aindaCabe(oportunidade)) {
      if (!context.mounted) return DesfechoDoPedido.naoOferecido;

      // **A oportunidade e gasta ANTES de a folha abrir**, e nao depois da
      // resposta. Duas razoes, e a segunda e a que custa caro:
      //
      // - A chance de convencer foi usada no instante em que a pessoa leu o
      //   texto. `Agora nao`, o toque fora e o botao de voltar gastam a mesma
      //   chance; marcar so no `Sim` faria a recusa nao custar nada, e a
      //   antessala voltaria a cada pet novo.
      // - Se o app for encerrado pelo sistema com a folha aberta -- que e
      //   comum, porque a folha abre logo depois de uma chamada de rede -- o
      //   registro ja esta em disco. Gravar depois perderia a oportunidade
      //   exatamente no caso em que ela foi mais gasta.
      await oportunidades.gastar(oportunidade);
      if (!context.mounted) return DesfechoDoPedido.naoOferecido;

      houveAntessala = true;
      final quer = await AntessalaDeAviso.mostrar(
        context,
        nomeDoPet: nomeDoPet,
        qual: switch (oportunidade) {
          OportunidadeDeAviso.primeiroPetCadastrado => QualAntessala.primeira,
          OportunidadeDeAviso.primeiroCasoDePerdido => QualAntessala.segunda,
        },
      );
      // A recusa mantem `naoPedida`, e e isso que vai para o servidor:
      // `not_asked` e `denied` sao estados diferentes no contrato, e colapsar
      // os dois faria o app abrir depois um dialogo que nao abre mais.
      if (quer) permissao = await avisos.pedir();
    }

    // O vigia passa a saber o que este fluxo descobriu. Sem isto ele trataria
    // este mesmo estado como novidade na primeira retomada e reenviaria um
    // registro que acabou de sair.
    vigia.anotar(permissao);

    // Token so existe com permissao concedida. `null` explicito no corpo diz
    // "este aparelho nao tem token", que e o que o contrato espera.
    final token =
        permissao == PermissaoDeAviso.concedida ? await avisos.token() : null;

    try {
      await devices.registrar(
        plataforma: plataforma,
        permissao: permissao,
        pushToken: token,
      );
    } on FalhaDeChamada {
      return DesfechoDoPedido.registroFalhou;
    }

    if (permissao == PermissaoDeAviso.concedida) {
      return DesfechoDoPedido.concedido;
    }
    return houveAntessala
        ? DesfechoDoPedido.oferecidoESemPermissao
        : DesfechoDoPedido.naoOferecido;
  }
}
