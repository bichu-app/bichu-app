import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../api/modelos_seguranca.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import 'folha_de_denuncia.dart';

/// O **"⋮" DA BARRA DO PERFIL** — o acesso a denunciar e a bloquear.
class MenuDoPerfil extends StatefulWidget {
  const MenuDoPerfil({
    required this.refDaPessoa,
    required this.api,
    super.key,
    this.bloqueada = false,
    this.jaDenunciada = false,
    this.aoMudarOBloqueio,
    this.aoPerderOAlvo,
    this.aoDesfazerConexao,
  });

  /// `users.public_ref`: o endereço público e opaco da pessoa, 22 símbolos.
  final String refDaPessoa;

  final SegurancaApi api;

  /// Se ESTA pessoa já foi bloqueada por quem está olhando.
  final bool bloqueada;

  /// Se quem está olhando já denunciou este perfil.
  final bool jaDenunciada;

  /// Chamado depois de bloquear ou desbloquear, para a tela do perfil
  /// recarregar.
  final ValueChanged<bool>? aoMudarOBloqueio;

  /// Chamado quando o servidor responde `404`.
  final VoidCallback? aoPerderOAlvo;

  /// **DESFAZER A CONEXÃO — pedido do cliente de 22/10/2026**, *"o botão
  /// desfazer conexão deve ir para os 3 pontinhos, junto com o denunciar"*.
  final Future<void> Function()? aoDesfazerConexao;

  /// O rótulo, e ele é o MESMO que estava no botão do corpo até 26/10/2026.
  static const String desfazerConexao = 'Desfazer conexão';

  @override
  State<MenuDoPerfil> createState() => _EstadoDoMenuDoPerfil();
}

enum _AcaoDoMenu { denunciar, bloquear, desbloquear, desfazerConexao }

class _EstadoDoMenuDoPerfil extends State<MenuDoPerfil> {
  late bool _bloqueada = widget.bloqueada;
  late bool _denunciada = widget.jaDenunciada;
  MensagemDeErro? _erro;

  Future<void> _executar(_AcaoDoMenu acao) async {
    switch (acao) {
      case _AcaoDoMenu.denunciar:
        await _denunciar();
      case _AcaoDoMenu.bloquear:
        await _mudarOBloqueio(bloquear: true);
      case _AcaoDoMenu.desbloquear:
        await _mudarOBloqueio(bloquear: false);
      case _AcaoDoMenu.desfazerConexao:
        await widget.aoDesfazerConexao?.call();
    }
  }

  Future<void> _denunciar() async {
    final enviou = await mostrarFolhaDeDenuncia(
      context,
      alvo: AlvoDaDenuncia.perfil,
      aoEnviar: (motivo, relato) =>
          widget.api.denunciarPerfil(widget.refDaPessoa, motivo, relato: relato),
    );
    if (!enviou || !mounted) return;
    setState(() => _denunciada = true);
    final cores = BichuColors.of(context).cores;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text(denunciaRecebida),
        backgroundColor: cores.surface,
      ),
    );
  }

  Future<void> _mudarOBloqueio({required bool bloquear}) async {
    try {
      if (bloquear) {
        await widget.api.bloquear(widget.refDaPessoa);
      } else {
        await widget.api.desbloquear(widget.refDaPessoa);
      }
      if (!mounted) return;
      setState(() => _bloqueada = bloquear);
      widget.aoMudarOBloqueio?.call(bloquear);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoEncontrado) {
        widget.aoPerderOAlvo?.call();
        return;
      }
      setState(() => _erro = MensagensDeErro.de(falha));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return PopupMenuButton<_AcaoDoMenu>(
      icon: Icon(Icons.more_vert, color: cores.textPrimary),
      tooltip: 'Mais opções',
      onSelected: (acao) => unawaitedExecutar(acao),
      itemBuilder: (contexto) => <PopupMenuEntry<_AcaoDoMenu>>[
        if (widget.aoDesfazerConexao != null)
          const PopupMenuItem<_AcaoDoMenu>(
            value: _AcaoDoMenu.desfazerConexao,
            child: Text(MenuDoPerfil.desfazerConexao),
          ),
        PopupMenuItem<_AcaoDoMenu>(
          value: _AcaoDoMenu.denunciar,
          enabled: !_denunciada,
          child: Text(_denunciada ? denunciaJaEnviada : 'Denunciar este perfil'),
        ),
        PopupMenuItem<_AcaoDoMenu>(
          value: _bloqueada ? _AcaoDoMenu.desbloquear : _AcaoDoMenu.bloquear,
          child: Text(_bloqueada ? 'Desbloquear' : 'Bloquear'),
        ),
        if (_erro != null)
          PopupMenuItem<_AcaoDoMenu>(
            enabled: false,
            child: Text(
              _erro!.texto,
              style: TextStyle(color: cores.error),
            ),
          ),
      ],
    );
  }

  /// `onSelected` é síncrono; o trabalho é assíncrono.
  void unawaitedExecutar(_AcaoDoMenu acao) {
    _executar(acao).ignore();
  }
}
