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

  /// **Nao houve antessala**, e e o desfecho que a BICHUS-24 existe para tornar
  /// possivel: ou a permissao ja estava respondida, ou as duas oportunidades
  /// acabaram, ou este build nao tem push.
  naoOferecido,

  /// O registro do aparelho no servidor nao completou.
  registroFalhou,
}

/// O fluxo inteiro do pedido de permissao de aviso, nos dois pontos em que ele
/// existe (UX 10.1, BICHUS-24).
abstract final class PedidoDeAviso {
  /// Oferece a permissao **uma vez** em [oportunidade], e nunca mais ali.
  static Future<DesfechoDoPedido> oferecer(
    BuildContext context, {
    required OportunidadeDeAviso oportunidade,
    required String nomeDoPet,
  }) async {
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
      if (quer) permissao = await avisos.pedir();
    }

    vigia.anotar(permissao);

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
