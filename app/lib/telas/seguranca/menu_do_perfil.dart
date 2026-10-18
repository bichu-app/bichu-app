import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../api/modelos_seguranca.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import 'folha_de_denuncia.dart';

/// O **"⋮" DA BARRA DO PERFIL** — o acesso a denunciar e a bloquear.
///
/// ## Por que aqui, e não num botão no topo do perfil
///
/// O cliente pediu *"uma opção no perfil do usuário de forma sutil para o outro
/// denunciar perfil"*. **Sutil não é escondido**, e as duas alternativas erram
/// para lados opostos:
///
/// - **Um "Denunciar" ao lado do nome** lê como acusação oferecida a todo
///   mundo: barateia o ato, deixa o perfil hostil e disputa atenção com a ação
///   principal da tela.
/// - **Ajustes → Privacidade → Denunciar** é o padrão em que a pessoa desiste.
///   Quem precisa denunciar está desconfortável e não vai caçar o botão.
///
/// O "⋮" da barra é o meio: **visível sem rolar**, no mesmo lugar em **todos os
/// estados do perfil — inclusive no de bloqueado**. É por isso que ele recebe
/// [bloqueada]: o menu não desaparece quando a pessoa já foi bloqueada, ele
/// troca "Bloquear" por "Desbloquear". Um menu que sumisse no estado de
/// bloqueado deixaria sem saída justamente quem já agiu uma vez.
///
/// ## A CONTAGEM DE TOQUES
///
/// **1 para achar** (este "⋮"), **2 para chegar aos motivos** (o item abre a
/// folha com os motivos à vista), **4 para concluir** (escolher o motivo é o 3º
/// e **seleciona**; o 4º é um "Enviar" explícito). Ver
/// [FolhaDeDenuncia] — denúncia não tem desfazer.
///
/// ## Depois de denunciar: *Denúncia enviada*, DESABILITADO
///
/// É o que impede a mesma pessoa de denunciar cinco vezes, e impede pela tela —
/// onde custa menos. O servidor também soma em vez de duplicar, mas um menu que
/// continuasse oferecendo "Denunciar" faria a pessoa achar que a primeira não
/// foi.
///
/// ## Bloquear logo abaixo, em um toque
///
/// **O bloqueio é o que dá alívio imediato**, porque a denúncia sozinha não
/// muda nada que a pessoa veja do outro lado. Por isso os dois moram no mesmo
/// menu, e não em telas diferentes.
///
/// ## O que este menu NÃO tem
///
/// Nenhuma frase de prazo. Nenhum estado de denúncia além de "enviada". E nada
/// sobre o que a outra pessoa vai ver, **porque ela não vê nada**.
class MenuDoPerfil extends StatefulWidget {
  const MenuDoPerfil({
    required this.refDaPessoa,
    required this.api,
    super.key,
    this.bloqueada = false,
    this.jaDenunciada = false,
    this.aoMudarOBloqueio,
    this.aoPerderOAlvo,
  });

  /// `users.public_ref`: o endereço público e opaco da pessoa, 22 símbolos.
  /// **Não é UUID** e não é o apelido.
  final String refDaPessoa;

  final SegurancaApi api;

  /// Se ESTA pessoa já foi bloqueada por quem está olhando. Decide o rótulo.
  final bool bloqueada;

  /// Se quem está olhando já denunciou este perfil. Decide o item desabilitado.
  final bool jaDenunciada;

  /// Chamado depois de bloquear ou desbloquear, para a tela do perfil recarregar.
  final ValueChanged<bool>? aoMudarOBloqueio;

  /// Chamado quando o servidor responde `404`.
  ///
  /// **O `404` aqui é ambíguo de propósito** e a tela não tenta desfazer a
  /// ambiguidade: pode ser pessoa inexistente, conta desabilitada **ou a outra
  /// pessoa tendo bloqueado quem está olhando**. Os três têm o mesmo corpo e o
  /// mesmo código, porque descobrir que foi bloqueado é o que gera retaliação.
  /// A tela diz "não encontramos esta pessoa" e volta.
  final VoidCallback? aoPerderOAlvo;

  @override
  State<MenuDoPerfil> createState() => _EstadoDoMenuDoPerfil();
}

enum _AcaoDoMenu { denunciar, bloquear, desbloquear }

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
    // A OCULTAÇÃO IMEDIATA já aconteceu no servidor — é filtro de leitura, e é
    // o que faz a denúncia valer sem prazo prometido. A tela só conta isso.
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
      // UM toque para achar: o ícone está na barra, visível sem rolar, e no
      // mesmo lugar em todos os estados do perfil.
      icon: Icon(Icons.more_vert, color: cores.textPrimary),
      tooltip: 'Mais opções',
      onSelected: (acao) => unawaitedExecutar(acao),
      itemBuilder: (contexto) => <PopupMenuEntry<_AcaoDoMenu>>[
        PopupMenuItem<_AcaoDoMenu>(
          value: _AcaoDoMenu.denunciar,
          // DESABILITADO depois de denunciar: é o que impede a mesma pessoa de
          // denunciar cinco vezes.
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
