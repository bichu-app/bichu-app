import 'package:flutter/widgets.dart';

/// De ONDE veio o valor que está em cada campo do formulário, para que a busca
/// de CEP saiba o que pode substituir e o que não pode.
///
/// ## POR QUE ISTO EXISTE, e ele reconcilia duas decisões do cliente
///
/// A de **17/10/2026** diz que a busca de CEP *"só preenche campo vazio: o que
/// a pessoa já escreveu vence o que a base devolve"*. A de **21/10/2026** diz
/// que o formulário *"nasce preenchido"* com o endereço guardado na conta.
///
/// Juntas e sem esta separação, a segunda MATA a primeira: com tudo
/// pré-preenchido, nada está vazio, e a busca de CEP não preenche mais nada
/// nunca. Quem mudou de casa digita o CEP novo e fica com a rua, o bairro, a
/// cidade e a UF antigos na tela — **em silêncio**, e com a plaquinha indo para
/// o endereço anterior.
///
/// São então DUAS coisas que `isNotEmpty` confundia numa:
///
/// - **o que a PESSOA escreveu vence** a busca de CEP (17/10, intacta) — ela
///   está olhando o endereço dela, e a base erra;
/// - **o que a CONTA trouxe cede** à busca de CEP — é conveniência, e não algo
///   que ela escreveu nesta sessão.
///
/// Um campo sai de "valor da conta" no **primeiro toque** da pessoa nele, e daí
/// em diante vale a regra de 17/10.
///
/// ## UMA SÓ, e nao uma por tela
///
/// `tela_solicitar_plaquinha.dart` e `tela_endereco_de_entrega.dart` têm o mesmo
/// formulário de endereço, e as duas abrem preenchidas pela conta. A segunda
/// nasceu **sem** esta reconciliação, e o defeito foi medido na revisão de
/// 21/10/2026: no "lugar só" de editar o endereço, digitar o CEP novo salvava
/// rua, bairro, cidade e UF antigos com 200.
///
/// O mecanismo mora aqui **FORA de `app/lib/telas`** de propósito, pelo mesmo
/// motivo que `TextosDoAppDeMapas` mora em `app/lib/dispositivo/`: arquivo novo
/// dentro de `app/lib/telas` move a constante `_arvoreDasTelas` sem precisar, e
/// o lugar certo de algo que duas telas compartilham não é dentro de uma delas.
///
/// **Isto é escolha de engenharia e está relatada como tal.** O cliente decidiu
/// as duas pontas; a reconciliação entre elas não estava escrita em lugar
/// nenhum.
class OrigemDosValores {
  /// As chaves dos campos que AINDA carregam o valor que veio da conta, sem a
  /// pessoa ter mexido.
  final Set<String> _daConta = <String>{};

  /// O campo ainda carrega o valor que veio da conta?
  bool ehDaConta(String chave) => _daConta.contains(chave);

  /// **O TOQUE DA PESSOA SOLTA O CAMPO.** Daí em diante o que está ali é dela, e
  /// a busca de CEP não o substitui mais — a regra de 17/10, intacta.
  ///
  /// Devolve `true` quando o campo *estava* marcado, para a tela saber que algo
  /// mudou e redesenhar.
  bool soltar(String chave) => _daConta.remove(chave);

  /// Anota (ou desanota) a origem de um valor que **não** é um
  /// [TextEditingController] — a UF, que é um seletor de lista.
  ///
  /// `temValor: false` desanota: um campo que a conta trouxe VAZIO não é "valor
  /// da conta", é campo vazio, e para ele a regra de 17/10 já basta.
  void anotarDaConta(String chave, {required bool temValor}) {
    if (temValor) {
      _daConta.add(chave);
    } else {
      _daConta.remove(chave);
    }
  }

  /// Põe o valor do endereço guardado num campo **vazio**, e anota que aquele
  /// campo ainda não foi tocado pela pessoa.
  ///
  /// Campo já escrito fica: a leitura da conta pode voltar depois de ela começar
  /// a digitar, e sobrescrever ali seria apagar o que ela acabou de escrever.
  ///
  /// Devolve `true` quando preencheu, para a tela limpar o erro daquele campo —
  /// deixar "Digite a rua." embaixo de uma rua preenchida seria a tela
  /// discutindo consigo mesma.
  bool doGuardado(TextEditingController campo, String valor, String chave) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return false;
    campo.text = valor;
    _daConta.add(chave);
    return true;
  }

  /// Põe o valor que a busca de CEP devolveu no campo, quando ele está vazio
  /// **ou quando ainda carrega o valor que veio da conta**.
  ///
  /// A segunda condição é a que mantém a busca de CEP viva sobre um formulário
  /// pré-preenchido. Sem ela — lendo a regra de 17/10 como `isEmpty` puro —
  /// nada está vazio e a busca nunca mais preenche nada.
  ///
  /// Devolve `true` quando preencheu.
  bool daBusca(TextEditingController campo, String valor, String chave) {
    if (valor.isEmpty) return false;
    if (campo.text.trim().isNotEmpty && !_daConta.contains(chave)) return false;
    campo.text = valor;
    // Substituído pela base: deixa de ser "o valor da conta". Se a pessoa
    // digitar o CEP antigo de novo, o que está na tela agora é o da base, e
    // sobrescrevê-lo seria a tela discutindo consigo mesma.
    _daConta.remove(chave);
    return true;
  }

  /// Solta **todos** os campos que ainda carregam o valor que veio do endereço
  /// guardado, e devolve as chaves que estavam marcadas.
  ///
  /// ## Para que isto existe: a TROCA DE PET, em 27/10/2026
  ///
  /// Decisão do cliente: *"endereço um por pet"*. No formulário do pedido a
  /// pessoa escolhe o pet DENTRO da tela, e trocar de pet troca a fonte do
  /// endereço — o que estava pré-preenchido era do pet de antes.
  ///
  /// **Sem isto, a troca de pet produzia um endereço misturado de dois pets**, e
  /// pelo mesmo mecanismo que [daBusca] documenta: [doGuardado] só preenche
  /// campo VAZIO, e depois da primeira carga nada está vazio. O endereço do
  /// segundo pet não entraria em campo nenhum, e o pedido sairia com a rua do
  /// primeiro — exatamente a classe de defeito que a separação de origem existe
  /// para evitar, chegando por um caminho novo.
  ///
  /// **O que a pessoa DIGITOU não é solto aqui**, e não pode ser: o toque dela
  /// já tirou o campo deste conjunto ([soltar]), então ele não aparece na
  /// devolução e quem chama não o limpa. Trocar de pet não apaga o que ela
  /// escreveu.
  Set<String> soltarOQueVeioDoGuardado() {
    final soltas = <String>{..._daConta};
    _daConta.clear();
    return soltas;
  }

  /// A MESMA regra de [daBusca], para o valor que não é um
  /// [TextEditingController] — a UF.
  ///
  /// **A isca "CEP novo SUBSTITUI o que veio da conta" reprovou aqui primeiro**,
  /// na tela do pedido: a UF ficava em `SP` com a rua, o bairro e a cidade já
  /// trocados para o Rio — um endereço misturado de duas cidades, que é o pior
  /// desfecho possível deste formulário.
  bool podeVirDaBusca(String chave, {required bool vazio}) {
    return vazio || _daConta.contains(chave);
  }
}
