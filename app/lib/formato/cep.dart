/// O CEP brasileiro: **mascara para quem digita, oito digitos para a API**.
///
/// ## Por que este arquivo nasceu
///
/// O cliente pediu em 18/10/2026: *"Coloque mascara no campo cep de todos os
/// formularios"*. Antes disso os campos de CEP do app eram
/// `FilteringTextInputFormatter.digitsOnly` com `limite: 8` -- entrava digito e
/// so digito, mas a pessoa lia `01310100` em vez de `01310-100`.
///
/// **Quatro campos de CEP no app**, varridos em 18/10/2026 (`app/lib/`):
///
/// 1. `telas/pet/tela_solicitar_plaquinha.dart` -- endereco de entrega;
/// 2. `telas/perfil/tela_dados_pessoais.dart` -- regiao de referencia;
/// 3. `telas/perto/sugerir_profissional.dart` -- indicar profissional;
/// 4. `telas/localizacao/captura_de_localizacao.dart` -- passo 2 do achado.
///
/// Os quatro usam [MascaraDeCep], e **nenhum deles monta a propria mascara**:
/// quatro copias divergiriam na primeira mudanca, e a que divergiria seria a
/// menos exercitada. Mesmo arranjo e mesmo motivo de `formato/telefone.dart`,
/// que e o precedente deste arquivo.
///
/// O CEP do **painel** nao mora aqui: `admin/` e TypeScript, e nao da para
/// importar Dart la. Quando ele existir, a duplicacao sera de LINGUAGEM e nao
/// de decisao, como ja acontece com `admin/src/formato/telefone.ts`.
///
/// ## A MASCARA FORMATA, E NAO VALIDA
///
/// Esta e a divisao que o arquivo inteiro protege, e ela tem consequencia
/// medida: no formulario de achado, **CEP incompleto nao pode travar o
/// envio**. Quem esta com um animal na rua nao fica preso num campo.
///
/// Entao [MascaraDeCep] nunca recusa, nunca marca erro e nunca devolve vazio
/// para punir: ela formata o que existe e descarta o que nao e digito. Quem
/// produz valor de contrato e [cepParaOContrato], **uma funcao separada**, que
/// devolve `null` em vez de adivinhar -- e quem chama decide o que fazer com o
/// `null` (no achado, nada; na indicacao, o campo simplesmente nao vai).
///
/// ## O QUE VAI PARA O SERVIDOR E SEM HIFEN, E A DIVERGENCIA E O RISCO
///
/// A mascara mostra `01310-100` e o contrato espera `01310100`. **Essa
/// diferenca e exatamente o tipo de coisa que passa por todos os portoes e
/// quebra em producao**, porque nenhum comparador de contrato olha o que a
/// tela guarda no controlador.
///
/// Por isso **nenhuma tela manda `controlador.text` para a API**. As quatro
/// passam por [cepParaOContrato] ou pelo proprio `_soDigitos` que elas ja
/// tinham, e o hifen morre na borda:
///
/// - `TagRequestInput.postal_code` -> `^[0-9]{8}$`;
/// - `DirectorySuggestionInput.postal_code` -> `^[0-9]{8}$` (18/10/2026);
/// - `MeUpdate.reference_area.postal_code` -> `^\d{5}-?\d{3}$`, que aceita
///   hifen **opcional**. Mandamos sem, por uma razao e nao por acaso: uma
///   forma canonica so, nas quatro telas, e o que faz dois CEPs iguais serem
///   iguais no banco.
///
/// `Area` do contrato (achado e perdido) **nao tem** `postal_code`: la o CEP e
/// so busca, e nada dele viaja.
///
/// ## Aviso de rumo: o buscador vai virar rota nossa
///
/// O cliente decidiu em 18/10 que a integracao de CEP passa a ser endpoint do
/// nosso backend, reaproveitado por app e painel, em vez de cada cliente
/// chamar o ViaCEP direto. **Nada deste arquivo atrapalha aquela migracao**:
/// ele nao fala com rede nenhuma, nao conhece servico nenhum e nao e chamado
/// por `api/busca_de_cep.dart`. Quando o buscador trocar de destino, a mascara
/// continua igual -- ela formata o que a pessoa digita, e nao o que o servico
/// responde.
library;

import 'package:flutter/services.dart';

/// Os oito digitos do CEP.
const int digitosDoCep = 8;

/// `01310`: o que vem antes do hifen.
const int _digitosDoPrefixo = 5;

/// O que a mascara brasileira ocupa: `01310-100`. E o `limite` dos campos.
///
/// **Nove e nao oito**, e trocar isto por oito e o defeito silencioso que o
/// `maxLength` produz: o `BichuField` cortaria o ultimo digito do CEP e o
/// contador diria "8 de 8" com o endereco errado na tela.
const int limiteDoCep = digitosDoCep + 1;

/// **A MESMA forma do contrato** (`^[0-9]{8}$`), e nao uma segunda redacao
/// dela: `TagRequestInput.postal_code` e `DirectorySuggestionInput.postal_code`
/// declaram esta expressao.
final RegExp formaDoCepNoContrato = RegExp(r'^[0-9]{8}$');

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica que se le: `01310-100`.
///
/// **Progressiva de proposito**, como a do telefone: formata o que ja existe
/// sem esperar o campo encher. Mascara que so aparece no oitavo digito faz o
/// campo parecer quebrado enquanto se digita.
///
/// **Aceita digitacao continua sem hifen, e e isso que a torna usavel.** Quem
/// digita `01310100` ve o hifen nascer sozinho no sexto digito; quem cola
/// `01310-100` ou `01.310-100` ve o mesmo resultado, porque o que nao e digito
/// e descartado antes da contagem. Nenhuma das duas formas e recusada: esta
/// funcao nao recusa nada.
String mascaraDeCep(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  // Digito alem do teto e DESCARTADO na digitacao, e nao aceito para ser
  // recusado depois -- a mesma regra do telefone.
  final cortado = digitos.length > digitosDoCep
      ? digitos.substring(0, digitosDoCep)
      : digitos;

  if (cortado.length <= _digitosDoPrefixo) return cortado;
  return '${cortado.substring(0, _digitosDoPrefixo)}-'
      '${cortado.substring(_digitosDoPrefixo)}';
}

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
///
/// **A unica funcao deste arquivo que produz valor de contrato**, e ela nao
/// adivinha: CEP curto, vazio ou com digito a menos devolve `null`, e quem
/// chama decide. Devolve **sem hifen**, sempre.
///
/// `null` **nao e erro de formulario** em nenhuma das quatro telas: na
/// indicacao o campo e opcional e simplesmente nao vai no corpo; no achado o
/// CEP nem viaja; na plaquinha e nos dados pessoais o campo ja tinha a propria
/// conferencia, e ela continua sendo dela.
String? cepParaOContrato(String bruto) {
  final digitos = _somenteDigitos(bruto);
  return formaDoCepNoContrato.hasMatch(digitos) ? digitos : null;
}

/// A mascara aplicada enquanto se digita.
///
/// Fora de [mascaraDeCep] de proposito: a funcao pura e exercitavel sem
/// Flutter, e e ela que a isca mede.
///
/// **Nao recusa nada e nao valida nada.** Letra e simbolo nao passam porque
/// [mascaraDeCep] descarta o que nao e digito, e nao porque esta classe
/// reprove alguma coisa: o campo continua digitavel, o botao continua vivo e
/// nenhum caminho daqui marca erro.
class MascaraDeCep extends TextInputFormatter {
  const MascaraDeCep();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeCep(depois.text);
    return TextEditingValue(
      text: formatado,
      // O cursor no fim: a mascara so cresce a direita enquanto se digita, e
      // manter o deslocamento antigo o jogaria para antes do hifen.
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}
