import 'package:flutter/material.dart';

import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import 'minhas_indicacoes.dart';

/// `Minhas indicações` como TELA PROPRIA, empilhada (19/10/2026).
///
/// ## Por que ela deixou de ser aba
///
/// Ela era a segunda aba da secao `Perto` (`AbaDoPerto.indicacoes`). Com
/// `Perto` virando a aba `Comunidade` da `Rede`, as **cinco** abas antigas
/// tiveram de caber em **duas mais filtro** -- e tres delas couberam no filtro
/// porque a entidade nao muda. Esta nao cabe, e a razao e medida:
///
/// uma indicacao **em analise** ainda nao e um local do diretorio. Ela nao tem
/// ficha, nao esta na lista, e quem a le e outra operacao
/// (`listMyDirectorySuggestions`, contra `listDirectoryEntries`). Filtrar a
/// lista de locais por "as que eu indiquei" devolveria **zero** justamente no
/// caso que interessa -- a que ainda espera revisao. Filtro que mente sobre o
/// alcance e o que `barra_de_listagem.dart` existe para impedir.
///
/// Entao ela virou **porta**, no pe da aba `Comunidade`, e esta e a tela do
/// outro lado. A conta completa esta em `Rotas.minhasIndicacoes`.
///
/// ## Por que a tela e EMPILHADA e nao um ramo
///
/// Ela e uma tela de CONTA, da mesma familia de `Meus achados`, `Meus dados` e
/// `Pessoas bloqueadas` -- e as quatro cobrem a casca e ganham `Voltar`. Como
/// ramo ela herdaria a barra de baixo e, no slot da esquerda, a **foto da
/// conta** no lugar do `Voltar`: a saida da tela desapareceria, que e
/// exatamente o que `TelaDeAba.raizDeSecao` existe para impedir ("a composicao
/// `Saida + titulo + foto` nao existe neste app").
///
/// ## O CORPO E O MESMO WIDGET DE ANTES, e nenhuma linha dele mudou
///
/// [MinhasIndicacoes] ja era um **corpo de lista** e nao uma tela: ela nao
/// monta `Scaffold`, nao monta `AppBar` e desenha o proprio gatilho de filtro
/// no corpo. Era o que o cabecalho dela ja dizia por escrito, e e o que
/// permitiu esta mudanca sem tocar nela.
///
/// **O que esta casca precisou dar a ela: o ponto do gesto de atualizar.**
/// `MinhasIndicacoes` publica a propria busca por `PublicaAAtualizacao`, que
/// procura um [SlotDeAtualizacao] ancestral -- e `maybeOf` devolve nulo sem
/// ele. Como aba, o slot vinha da casca das cinco secoes; empilhada, ela nao
/// tem casca, e sem este par (`SlotDeAtualizacao` mais
/// `ArrastarParaAtualizar.doSlot`) o arrastar-para-atualizar **sumiria em
/// silencio** -- a tela funcionaria e o gesto nao, que e o tipo de perda que
/// nenhum caso de widget acusa sozinho.
///
/// O embrulho e **permanente e nao condicional**, como na casca: desenha-lo so
/// quando ha busca publicada muda a profundidade da arvore e remonta o corpo,
/// e isso custou 22 casos da suite quando foi tentado (ver o construtor
/// `doSlot` em `widgets/arrastar_para_atualizar.dart`).
class TelaDeMinhasIndicacoes extends StatefulWidget {
  const TelaDeMinhasIndicacoes({super.key});

  /// O titulo da barra de topo.
  ///
  /// **A MESMA palavra da aba que ela substituiu, e da porta que a abre.** Os
  /// tres saem desta constante ou da de `SecaoDaRede`, e nao de literais
  /// soltos: quem procurava a aba acha a porta e a tela pelo mesmo texto.
  static const String titulo = 'Minhas indicações';

  @override
  State<TelaDeMinhasIndicacoes> createState() =>
      _TelaDeMinhasIndicacoesState();
}

class _TelaDeMinhasIndicacoesState extends State<TelaDeMinhasIndicacoes> {
  /// O ponto onde o corpo publica a propria busca. Ver a prosa da classe.
  final RecargaDaSecao _recarga = RecargaDaSecao();

  @override
  void dispose() {
    _recarga.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SlotDeAtualizacao(
      recarga: _recarga,
      child: Scaffold(
        // Sem `leading` escrito: o `AppBar` desenha o `Voltar` sozinho porque
        // esta rota foi empilhada. Escreve-lo a mao seria a segunda definicao
        // da saida da tela.
        appBar: AppBar(title: const Text(TelaDeMinhasIndicacoes.titulo)),
        body: SafeArea(
          // Area segura nao e margem: notch, ilha dinamica, barra de gestos e
          // teclado mudam a area utilizavel em tempo de execucao.
          child: ArrastarParaAtualizar.doSlot(
            recarga: _recarga,
            child: ListView(
              // `addSemanticIndexes: false` pela mesma razao da casca: o
              // padrao do `ListView` embrulha cada filho direto num
              // `IndexedSemantics` e colapsa tudo o que esta dentro num no
              // so -- e este nao e uma lista de itens, e o corpo rolavel de
              // uma pagina. Com o padrao, a lista inteira de indicacoes
              // viraria um unico no anunciado como botao (SC 4.1.2).
              addSemanticIndexes: false,
              padding: const EdgeInsets.all(BichuEspaco.e4),
              children: const <Widget>[MinhasIndicacoes()],
            ),
          ),
        ),
      ),
    );
  }
}
