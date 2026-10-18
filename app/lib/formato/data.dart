/// A data brasileira: **mascara para quem digita, `YYYY-MM-DD` para a API**.
///
/// ## Por que este arquivo nasceu
///
/// O cliente decidiu em 18/10/2026: *"coloque maiores de 16 anos"*. Antes
/// disso **nao havia campo de data de nascimento em lugar nenhum** -- nem na
/// tela, nem no contrato, nem no banco -- e por isso nao havia mascara de data
/// para reaproveitar: `formato/` tinha telefone, CEP, dinheiro e e-mail.
///
/// **Mesmo arranjo e mesmo motivo de `formato/cep.dart` e `formato/telefone.dart`**,
/// que sao o precedente deste arquivo: a mascara mora aqui, nenhuma tela monta
/// a propria, e a funcao que produz valor de contrato e **separada** da que
/// formata.
///
/// ## A MASCARA FORMATA, E NAO VALIDA
///
/// Esta e a divisao que o arquivo inteiro protege, e e a mesma do CEP:
/// [MascaraDeData] nunca recusa, nunca marca erro e nunca devolve vazio para
/// punir. Ela formata o que existe e descarta o que nao e digito.
///
/// Quem **recusa** e [IdadeMinima], e quem produz valor de contrato e
/// [dataParaOContrato], que devolve `null` em vez de adivinhar.
///
/// A razao e concreta: enquanto a pessoa digita `1`, `19`, `199`, a data esta
/// incompleta e **nao e erro** -- marcar vermelho no primeiro digito e o campo
/// gritando com quem ainda nem terminou. A recusa acontece quando a pessoa
/// tenta enviar, e nao enquanto ela escreve.
///
/// ## `31/12/1990` NA TELA, `1990-12-31` NO CORPO
///
/// A gramatica que se le no Brasil e dia/mes/ano; a que o contrato exige
/// (`format: date`) e ano-mes-dia. **Essa diferenca e exatamente o tipo de
/// coisa que passa por todos os portoes e quebra em producao**, porque nenhum
/// comparador de contrato olha o que a tela guarda no controlador -- e aqui
/// ela e pior que a do CEP: `03/04/2010` e `2010-03-04` sao as duas datas
/// validas, e trocar uma pela outra nao falha, **acerta a data errada**.
///
/// Por isso **nenhuma tela manda `controlador.text` para a API**: quem
/// atravessa a borda e [dataParaOContrato], e ela e a unica funcao daqui que
/// produz a forma do contrato.
///
/// ## A IDADE MINIMA DAQUI E CONVENIENCIA, E A AUTORIDADE E O SERVIDOR
///
/// `POST /v1/auth/register` e rota publica (`security: []`). A trava que vale
/// e a de `src/shared/idade/idade-minima.ts`, e [IdadeMinima] existe para a
/// pessoa nao gastar uma ida a rede a toa e para a recusa chegar ao lado do
/// campo. **As duas usam o fuso `America/Sao_Paulo`** e a mesma conta civil de
/// anos completos -- divergir em um dia aqui seria a tela recusar quem o
/// servidor aceita, no dia do aniversario.
library;

import 'package:flutter/services.dart';

/// Os oito digitos de uma data: `31121990`.
const int digitosDaData = 8;

/// O que a mascara brasileira ocupa: `31/12/1990`.
///
/// **Dez e nao oito**, e trocar isto por oito e o defeito silencioso que o
/// `maxLength` produz: o `BichuField` cortaria os dois ultimos digitos do ano e
/// o contador diria "8 de 8" com a data errada na tela.
const int limiteDaData = digitosDaData + 2;

/// A idade minima do Bichu, em anos completos (cliente, 18/10/2026).
///
/// **Igual ao `IDADE_MINIMA_EM_ANOS` de `src/shared/idade/idade-minima.ts`.**
/// Duas copias do numero sao inevitaveis (Dart nao importa TypeScript), e por
/// isso ele esta num `const` com o nome do que e, em vez de solto numa frase:
/// o dia em que o cliente mudar o numero, ha um lugar so para mudar em cada
/// lado, e os testes dos dois lados citam a constante.
const int idadeMinimaDoBichu = 16;

/// O fuso em que o aniversario e contado, **igual ao do servidor**.
///
/// Nao e usado para converter instante: e usado para decidir QUE DIA e hoje.
/// Ver [IdadeMinima.hojeNoFusoDoProduto].
const Duration _deslocamentoDeSaoPaulo = Duration(hours: -3);

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica que se le: `31/12/1990`.
///
/// **Progressiva de proposito**, como a do CEP e a do telefone: formata o que
/// ja existe sem esperar o campo encher. Mascara que so aparece no oitavo
/// digito faz o campo parecer quebrado enquanto se digita.
///
/// **Aceita digitacao continua sem barra, e e isso que a torna usavel.** Quem
/// digita `31121990` ve as barras nascerem sozinhas no terceiro e no quinto
/// digito; quem cola `31/12/1990` ou `31.12.1990` ve o mesmo resultado, porque
/// o que nao e digito e descartado antes da contagem. Nenhuma das duas formas
/// e recusada: esta funcao nao recusa nada.
String mascaraDeData(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  // Digito alem do teto e DESCARTADO na digitacao, e nao aceito para ser
  // recusado depois -- a mesma regra do CEP e do telefone.
  final cortado = digitos.length > digitosDaData
      ? digitos.substring(0, digitosDaData)
      : digitos;

  if (cortado.length <= 2) return cortado;
  if (cortado.length <= 4) {
    return '${cortado.substring(0, 2)}/${cortado.substring(2)}';
  }
  return '${cortado.substring(0, 2)}/${cortado.substring(2, 4)}/'
      '${cortado.substring(4)}';
}

/// O valor que vai para a API em `YYYY-MM-DD`, ou `null` quando o que foi
/// digitado nao serve.
///
/// **A unica funcao deste arquivo que produz valor de contrato**, e ela nao
/// adivinha: data curta, vazia, com digito a menos ou que **nao existe no
/// calendario** devolve `null`.
///
/// `31/02/1990` devolve `null` e nao `01/03/1990`: `DateTime` normaliza em
/// silencio, e a volta abaixo e o que recusa em vez de aceitar outra data.
/// Guardar a data errada sem ninguem reclamar e pior que recusar.
String? dataParaOContrato(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.length != digitosDaData) return null;

  final dia = int.parse(digitos.substring(0, 2));
  final mes = int.parse(digitos.substring(2, 4));
  final ano = int.parse(digitos.substring(4));

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  final montada = DateTime(ano, mes, dia);
  final existe =
      montada.year == ano && montada.month == mes && montada.day == dia;
  if (!existe) return null;

  String doisDigitos(int n) => n.toString().padLeft(2, '0');
  return '${ano.toString().padLeft(4, '0')}-'
      '${doisDigitos(mes)}-${doisDigitos(dia)}';
}

/// A mascara aplicada enquanto se digita.
///
/// Fora de [mascaraDeData] de proposito: a funcao pura e exercitavel sem
/// Flutter, e e ela que a isca mede.
///
/// **Nao recusa nada e nao valida nada.** Letra e simbolo nao passam porque
/// [mascaraDeData] descarta o que nao e digito, e nao porque esta classe
/// reprove alguma coisa.
class MascaraDeData extends TextInputFormatter {
  const MascaraDeData();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeData(depois.text);
    return TextEditingValue(
      text: formatado,
      // O cursor no fim: a mascara so cresce a direita enquanto se digita, e
      // manter o deslocamento antigo o jogaria para antes da barra.
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}

/// A regra da **idade minima** do lado da tela, num lugar so.
///
/// Espelha `src/shared/idade/idade-minima.ts`: mesmo numero
/// ([idadeMinimaDoBichu]), mesmo fuso e a mesma conta civil de anos completos.
/// **A autoridade e o servidor** -- esta classe existe para a recusa chegar ao
/// lado do campo em vez de voltar da rede.
///
/// Ela e a fonte unica das duas perguntas que a tela faz -- "o botao pode estar
/// habilitado?" e "o que eu digo quando recusar?" -- e e por isso que as duas
/// nao tem como divergir. Mesmo arranjo de
/// `app/lib/validacao/nome_de_exibicao.dart`.
class IdadeMinima {
  const IdadeMinima._();

  /// A cobranca do campo vazio ou incompleto.
  ///
  /// **Diz o que fazer, e nao que esta "invalido"** (regra de UX do BICHUS-31,
  /// criterio 3): "invalido" informa a pessoa de que ela errou e nao a ajuda a
  /// sair do lugar. As palavras "erro", "invalido", "falhou" e "ops" nao
  /// aparecem aqui de proposito.
  static const String precisaDaData = 'Digite a sua data de nascimento, como 31/12/1990.';

  /// A cobranca da data que nao existe no calendario.
  static const String dataNaoExiste = 'Confira o dia e o mês: essa data não existe.';

  /// A cobranca da data no futuro. **Mesma frase do servidor** e do
  /// `last_seen_at` do caso de perdido.
  static const String dataNoFuturo = 'Essa data ainda não chegou.';

  /// A cobranca de quem nao tem a idade minima.
  ///
  /// **Diz a REGRA e nao "dado invalido"**: a pessoa nao errou de digitacao, e
  /// a saida dela nao e corrigir o campo. Esconder o numero faria a tela
  /// repetir "confira a data" para quem conferiu.
  static const String aindaNaoTemIdade =
      'O Bichu é para quem tem $idadeMinimaDoBichu anos ou mais.';

  /// O dia de **hoje** no fuso do produto (`America/Sao_Paulo`).
  ///
  /// Deslocamento fixo de -3h e nao base de fusos: o app nao carrega `timezone`
  /// e acrescentar o pacote por causa de uma data de corte seria peso novo no
  /// APK. O custo disto esta medido e e aceitavel **porque esta classe nao e a
  /// autoridade**: no unico caso em que o deslocamento fixo erra -- um horario
  /// de verao brasileiro que volte a existir -- a tela erra por uma hora, o
  /// servidor continua certo, e o pior resultado e a tela deixar passar quem o
  /// servidor recusa com a mesma frase.
  ///
  /// O inverso, que seria a tela recusar quem o servidor aceita, **nao
  /// acontece**: a tela erraria para o lado de deixar passar.
  static DateTime hojeNoFusoDoProduto(DateTime agora) {
    final emSaoPaulo = agora.toUtc().add(_deslocamentoDeSaoPaulo);
    return DateTime(emSaoPaulo.year, emSaoPaulo.month, emSaoPaulo.day);
  }

  /// A idade em **anos completos** no dia `hoje`.
  ///
  /// A conta civil de sempre, imune a ano bissexto por construcao: subtrai os
  /// anos e desconta um se o aniversario ainda nao chegou neste ano. Nascido em
  /// 29/02 completa anos em 28/02 nos anos comuns, que e o que a comparacao
  /// `(mes, dia)` faz sozinha, sem caso especial.
  static int anosCompletos(DateTime nascimento, DateTime hoje) {
    final anos = hoje.year - nascimento.year;
    final aniversarioJaPassou = hoje.month > nascimento.month ||
        (hoje.month == nascimento.month && hoje.day >= nascimento.day);
    return aniversarioJaPassou ? anos : anos - 1;
  }

  /// A mensagem de recusa, ou `null` quando a data passa.
  ///
  /// A ordem das conferencias e a ordem em que elas ajudam: forma, calendario,
  /// futuro e so entao idade. Dizer "voce nao tem 16 anos" para quem digitou
  /// `30/13/2010` manda a pessoa procurar o problema no lugar errado.
  static String? recusa(String? bruto, {required DateTime agora}) {
    final String? iso = dataParaOContrato(bruto ?? '');
    if (iso == null) {
      // Duas causas, e a frase precisa separa-las: incompleta ainda nao e uma
      // data, e `31/02` e uma data que nao existe.
      final digitos = _somenteDigitos(bruto ?? '');
      return digitos.length == digitosDaData ? dataNaoExiste : precisaDaData;
    }

    final nascimento = DateTime.parse(iso);
    final hoje = hojeNoFusoDoProduto(agora);

    if (nascimento.isAfter(hoje)) return dataNoFuturo;
    if (anosCompletos(nascimento, hoje) < idadeMinimaDoBichu) {
      return aindaNaoTemIdade;
    }
    return null;
  }

  /// `true` quando ha data suficiente para o botao de enviar ficar habilitado.
  ///
  /// **Habilita com a data COMPLETA, e nao com a data boa.** A diferenca e
  /// deliberada: botao apagado nao diz por que, e quem tem 15 anos precisa
  /// receber a frase que explica a regra -- nao um botao que nao responde. Quem
  /// filtra de verdade e [recusa], no toque.
  static bool completo(String? bruto) => dataParaOContrato(bruto ?? '') != null;
}
