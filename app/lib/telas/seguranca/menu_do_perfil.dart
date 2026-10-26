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
/// ## `DESFAZER CONEXÃO` MORA AQUI DESDE 26/10/2026, E O PEDIDO É DELE
///
/// Palavras do cliente, 22/10/2026: *"o botão desfazer conexão deve ir para os
/// 3 pontinhos, junto com o denunciar"*. Até 26/10 ele era `BotaoSecundario` no
/// corpo de `TelaDePerfilDePessoa`, e o pedido nunca havia sido implementado.
///
/// **Ele entra por [aoDesfazerConexao], e NÃO por uma `ConexoesApi` aqui
/// dentro.** A diferença não é arrumação: quem chama `encerrar` continua sendo
/// o `_agir` da tela do perfil, e é ele que **recarrega o perfil** depois da
/// ação, trata o 404 como alvo perdido e segura o toque duplo por `_agindo`.
/// Dar uma segunda porta de conexões a este menu duplicaria as três coisas.
///
/// **O item só nasce quando o retorno é não-nulo**, e a tela o passa só no
/// estado `conectado` com `connection_ref` presente — o mesmo recorte do
/// `CartaoDePessoaEncontrada`. O `⋮` aparece nos QUATRO estados da relação
/// (ver `TelaDePerfilDePessoa.build`), então sem esse recorte `Desfazer
/// conexão` apareceria para quem não é conexão.
///
/// ## POR QUE NÃO HÁ DIÁLOGO DE CONFIRMAÇÃO, e isto foi MEDIDO e não escolhido
///
/// Desfazer é irreversível pela tela — refazer exige pedir de novo e a outra
/// pessoa aceitar. A pergunta óbvia é se ele precisa de confirmação, e a
/// resposta vem do padrão **que esta casa já tem**, conferido item por item:
///
/// | Item destrutivo | Confirma? |
/// |---|---|
/// | `Denunciar` (este menu) | abre [FolhaDeDenuncia] — mas ela existe para colher o **motivo**, e o 4º toque é o `Enviar`. Não é caixa de "tem certeza?" |
/// | `Bloquear` (este menu) | **não confirma** — um toque. É reversível no mesmo menu, que troca para `Desbloquear` |
/// | `Apagar` (o `⋮` do Mural) | **não confirma** — um toque, e apagar publicação é irreversível |
///
/// Então o padrão da casa para item destrutivo dentro de `⋮` é **sem
/// confirmação**, e `Apagar` é o precedente exato: irreversível, num `⋮`, um
/// toque. O único `AlertDialog` que o app teve morreu por decisão do cliente
/// (ver `sairDaLoja` em `telas/loja/vitrine_da_loja.dart`).
///
/// **Inventar um diálogo só para este item seria criar um padrão que ninguém
/// decidiu** — e os dois freios que já existem são o `⋮` (o menu não abre
/// sozinho) e o rótulo, que diz o que a ação faz. **Se ele quiser confirmação,
/// é decisão dele e vale para os três itens, não só para este.**
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
    this.aoDesfazerConexao,
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

  /// **DESFAZER A CONEXÃO — pedido do cliente de 22/10/2026**, *"o botão
  /// desfazer conexão deve ir para os 3 pontinhos, junto com o denunciar"*.
  ///
  /// **Nulo esconde o item**, e é assim que o recorte por estado chega aqui sem
  /// este arquivo saber o que é uma aresta: a tela passa não-nulo só no estado
  /// `conectado` com `connection_ref` presente. Ver o cabeçalho desta classe.
  ///
  /// Quem executa é o `_agir` da tela do perfil — ele chama `encerrar`, segura
  /// o toque duplo e **recarrega o perfil** depois. Este menu só oferece.
  final Future<void> Function()? aoDesfazerConexao;

  /// O rótulo, e ele é o MESMO que estava no botão do corpo até 26/10/2026.
  ///
  /// Mudar a palavra junto de mudar o lugar faria a reclamação dele voltar
  /// sobre outra coisa: ele pediu que o botão **mudasse de lugar**, não que
  /// passasse a se chamar outra coisa.
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
        // **Sem `try` aqui, e sem `setState`.** Quem trata a falha é o `_agir`
        // da tela do perfil: ele já distingue 404 (alvo perdido) de falha de
        // rede, e já recarrega o perfil no sucesso. Um `catch` nesta classe
        // seria a segunda política de erro para a mesma chamada.
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
        // **PRIMEIRO, e ANTES dos dois de moderação** (26/10/2026). Duas razões,
        // e nenhuma é gosto:
        //
        // 1. `Denunciar` e `Bloquear` são vizinhos POR DECISÃO -- o cabeçalho
        //    desta classe diz *"Bloquear logo abaixo, em um toque"*, porque o
        //    bloqueio é o alívio imediato que a denúncia sozinha não dá.
        //    Enfiar `Desfazer conexão` entre os dois desfaria essa adjacência;
        // 2. desfazer é ação de RELAÇÃO e os outros dois são de SEGURANÇA.
        //    Quem abre este menu para desfazer não devia passar o dedo por
        //    cima de `Denunciar` para chegar lá.
        //
        // **O item não nasce quando não há o que desfazer**, e o recorte é a
        // nulidade do retorno -- a tela só o passa no estado `conectado`.
        if (widget.aoDesfazerConexao != null)
          const PopupMenuItem<_AcaoDoMenu>(
            value: _AcaoDoMenu.desfazerConexao,
            child: Text(MenuDoPerfil.desfazerConexao),
          ),
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
