import 'package:flutter/widgets.dart';

/// De ONDE veio o valor que está em cada campo do formulário, para que a busca
/// de CEP saiba o que pode substituir e o que não pode.
class OrigemDosValores {
  /// As chaves dos campos que AINDA carregam o valor que veio da conta, sem a
  /// pessoa ter mexido.
  final Set<String> _daConta = <String>{};

  /// O campo ainda carrega o valor que veio da conta?
  bool ehDaConta(String chave) => _daConta.contains(chave);

  /// **O TOQUE DA PESSOA SOLTA O CAMPO.** Daí em diante o que está ali é dela,
  /// e a busca de CEP não o substitui mais — a regra de 17/10, intacta.
  bool soltar(String chave) => _daConta.remove(chave);

  /// Anota (ou desanota) a origem de um valor que **não** é um
  /// [TextEditingController] — a UF, que é um seletor de lista.
  void anotarDaConta(String chave, {required bool temValor}) {
    if (temValor) {
      _daConta.add(chave);
    } else {
      _daConta.remove(chave);
    }
  }

  /// Põe o valor do endereço guardado num campo **vazio**, e anota que aquele
  /// campo ainda não foi tocado pela pessoa.
  bool doGuardado(TextEditingController campo, String valor, String chave) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return false;
    campo.text = valor;
    _daConta.add(chave);
    return true;
  }

  /// Põe o valor que a busca de CEP devolveu no campo, quando ele está vazio
  /// **ou quando ainda carrega o valor que veio da conta**.
  bool daBusca(TextEditingController campo, String valor, String chave) {
    if (valor.isEmpty) return false;
    if (campo.text.trim().isNotEmpty && !_daConta.contains(chave)) return false;
    campo.text = valor;
    _daConta.remove(chave);
    return true;
  }

  /// Solta **todos** os campos que ainda carregam o valor que veio do endereço
  /// guardado, e devolve as chaves que estavam marcadas.
  Set<String> soltarOQueVeioDoGuardado() {
    final soltas = <String>{..._daConta};
    _daConta.clear();
    return soltas;
  }

  /// A MESMA regra de [daBusca], para o valor que não é um
  /// [TextEditingController] — a UF.
  bool podeVirDaBusca(String chave, {required bool vazio}) {
    return vazio || _daConta.contains(chave);
  }
}
