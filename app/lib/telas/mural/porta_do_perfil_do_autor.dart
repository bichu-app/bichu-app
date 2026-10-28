/// **O TOQUE QUE LEVA AO PERFIL DE QUEM PUBLICOU, no Mural.**
///
/// Cliente, 22/10/2026: *"Inclua um link que seja o usuario a pagina do
/// perfil"*. O app ja linkava em cinco superficies -- a conversa, os pedidos de
/// conexao, a busca, `Minhas conexoes` e a leitura de QR -- e **no Mural nao**.
/// Esta e a sexta.
///
/// ---------------------------------------------------------------------------
/// POR QUE ELA EXISTE EM VEZ DE O TOQUE ENTRAR EM `MarcaDaPessoa`
/// ---------------------------------------------------------------------------
/// O cabecalho de `_FotoDoAutor`, em `tela_do_mural.dart`, declarava a regra
/// antes de este arquivo existir: *"`MarcaDaPessoa` desenha e nao toca, e e
/// `MarcaNeutraDoParticipante` que poe o `InkWell` por fora"*. Este widget e o
/// irmao dessa `MarcaNeutraDoParticipante` para o Mural: ele **embrulha**, e
/// nao redesenha. `MarcaDaPessoa` e `NomeComSelo` continuam intactos.
///
/// ---------------------------------------------------------------------------
/// O APELIDO NULO E O ESTADO NORMAL, E E ELE QUE DECIDE SE O TOQUE NASCE
/// ---------------------------------------------------------------------------
/// `Rotas.perfilDe` enderecca o perfil pelo APELIDO, e
/// `AutorDaPublicacao.apelido` e anulavel -- o proprio contrato diz isso, e o
/// doc do campo ja mandava: *"ai o toque no autor **nao nasce**, em vez de
/// nascer e nao levar a lugar nenhum"*.
///
/// **Sem apelido este widget devolve o filho cru**: nenhum `InkWell`, nenhuma
/// semantica de botao, nenhum alvo de toque. Nao e fallback, e decisao -- um
/// circulo que se anuncia como botao e nao leva a lugar nenhum e o toque sem
/// desfecho que o criterio 2 da BICHUS-62 proibe, e e exatamente o que o
/// comentario do Mural protegia quando pedia que *"quem trouxer o toque para o
/// perfil traz com ele o estado de apelido nulo"*.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/mural_api.dart';
import '../../roteamento/rotas.dart';

class PortaDoPerfilDoAutor extends StatelessWidget {
  const PortaDoPerfilDoAutor({
    required this.autor,
    required this.child,
    super.key,
    this.rotulo,
  });

  /// Quem publicou ou comentou. **O autor inteiro e nao o apelido**: quem
  /// decide se o toque nasce e este widget, e a decisao e sobre o autor.
  final AutorDaPublicacao autor;

  final Widget child;

  /// O nome acessivel da porta, e e ele que escolhe UMA DAS DUAS FORMAS.
  ///
  /// **COM rotulo (a FOTO): a porta e um BOTAO para o leitor de tela.** O
  /// circulo nao tem texto proprio, entao sem rotulo ele seria um controle que
  /// nao diz o que abre. A semantica do filho e SUBSTITUIDA pela frase, como
  /// `MarcaNeutraDoParticipante` ja faz na conversa.
  ///
  /// **SEM rotulo (o NOME): a porta e so TOQUE, e nao mexe na semantica.** E
  /// decisao, e ela foi MEDIDA: embrulhar `NomeComSelo` num `Semantics` com
  /// `button: true` FUNDE o nome e o selo num no so -- o rotulo do selo passou
  /// de `Contato confirmado` para `Marina\nContato confirmado`, e
  /// `selo_de_validado_test.dart` reprovou em dois casos
  /// (*"o selo e uma parada de foco SEPARADA do nome"*). Aquela separacao e a
  /// emenda do ADR-0010 de 21/10/2026 e vale mais que um segundo botao: o
  /// destino continua alcancavel por leitor de tela pela FOTO ao lado, que e
  /// um botao rotulado para o MESMO perfil.
  ///
  /// E por isso que aqui entra `GestureDetector(excludeFromSemantics: true)`,
  /// e nao `InkWell`: o `InkWell` publica semantica de toque por conta propria,
  /// e era ela que fundia os dois nos.
  final String? rotulo;

  /// O nome acessivel da porta da FOTO. Diz o que ela ABRE, e nao o que ela e.
  static String rotuloDaPorta(String nome) => 'Abrir o perfil de $nome';

  @override
  Widget build(BuildContext context) {
    final String? apelido = autor.apelido?.trim();

    // SEM ENDERECO, SEM CONTROLE. Ver a prosa desta classe.
    if (apelido == null || apelido.isEmpty) return child;

    void abrir() => context.push(Rotas.perfilDe(apelido));

    final String? r = rotulo;
    if (r == null) {
      // O NOME: toque sem semantica nova. Ver o doc de [rotulo].
      return GestureDetector(
        excludeFromSemantics: true,
        onTap: abrir,
        child: child,
      );
    }
    // A FOTO: botao rotulado.
    return Semantics(
      button: true,
      label: r,
      excludeSemantics: true,
      child: InkWell(onTap: abrir, child: child),
    );
  }
}
