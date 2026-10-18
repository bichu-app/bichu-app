/// O **apelido (`@`)**: a faixa, a normalizacao e as tres sugestoes.
///
/// ## Por que este arquivo nasceu
///
/// Decisao do cliente de 18/10/2026: *"o apelido esta livre, vai estar no
/// cadastro do usuario e na pagina de edicao do perfil"*. Antes disso **nao
/// havia apelido de pessoa em lugar nenhum** -- `users` nao tinha coluna, o
/// contrato nao tinha campo, e a unica coluna de slug do repositorio era
/// `pets.slug`, do ANIMAL.
///
/// O desenho vem fechado do plano `9d99ac0f`
/// (`design/prototipos/conexao-e-vitrine/PLANO.md`, secao 4-C) e **nao e
/// reaberto aqui**.
///
/// ## A FAIXA E A MESMA NOS TRES LUGARES, E ISSO E A ARMADILHA DO DIA
///
/// [FormaDoApelido.regex] e o mesmo de:
///
/// - o `CHECK` de `handles.handle` na migracao `20261018000021`;
/// - o `pattern` de `Handle` em `api/openapi.yaml`;
/// - `FORMA_DO_APELIDO` em `src/shared/apelido/apelido.ts`.
///
/// Esta casa ja pagou pela divergencia: o recado do achado aceitava **1000**
/// no contrato e a coluna recusava acima de **500**, e a pessoa recebia erro de
/// servidor em vez de recusa explicada. Aqui os quatro lugares carregam 5 e 20.
///
/// **O teto de 20 e do apelido NORMALIZADO, e por construcao ele e identico ao
/// digitado** -- conferido e nao suposto: o conjunto e ASCII restrito
/// (`[a-z0-9-]`), normalizar e so minusculo e aparo, e nessa classe
/// `toLowerCase` e um para um. Nao ha forma Unicode que mude o comprimento,
/// porque acento foi recusado.
///
/// ## A MASCARA NAO EXISTE AQUI, E A AUSENCIA E A DECISAO
///
/// Diferente de `formato/cep.dart`, `formato/telefone.dart` e
/// `formato/data.dart`, o apelido **nao tem mascara**: nao ha separador a
/// inserir nem gramatica a montar. O que ele tem e um [FiltroDeApelido], que
/// **descarta o que nao e aceito enquanto se digita** -- a mesma divisao de
/// trabalho das mascaras (formata, nao valida), com a mesma consequencia: o
/// filtro nunca recusa, nunca marca erro e nunca devolve vazio para punir.
///
/// ## NAO EXISTE "ESTE APELIDO ESTA DISPONIVEL?"
///
/// Nao ha funcao de disponibilidade neste arquivo, e nao pode haver: o plano
/// 4-C.5 matou a rota porque ela deixa varrer a base. A disponibilidade e
/// decidida **no envio**, pelo indice unico do banco, e quem repete recebe
/// `code: taken`. **Conferir antes e confiar e o defeito** -- a janela entre
/// conferir e gravar e onde a corrida mora.
///
/// A tela, em troca, oferece [IdentificadorDoApelido.sugestoes]: tres saidas
/// derivadas do que a pessoa digitou. E isso que resolve o nome curto legitimo
/// -- Ana, Leo, Ze -- **por exemplo e nao por paragrafo de apoio**, que o
/// cliente mandou remover das telas em 18/10.
library;

import 'package:flutter/services.dart';

/// O piso da faixa.
const int minimoDoApelido = 5;

/// O teto da faixa. Do normalizado -- que e identico ao digitado, ver o topo.
const int maximoDoApelido = 20;

/// A forma do apelido, **igual nos quatro lugares**.
///
/// `{3,18}` no meio e um caractere fixo em cada ponta: e isso que da 5 a 20 e
/// ao mesmo tempo proibe hifen no comeco e no fim.
class FormaDoApelido {
  const FormaDoApelido._();

  /// O MESMO regex do `CHECK`, do `pattern` do contrato e do TypeScript.
  static final RegExp regex = RegExp(r'^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$');
}

/// O que o filtro de digitacao deixa passar: minuscula, digito e hifen.
final RegExp _aceitoNoApelido = RegExp(r'[^a-z0-9-]');

/// O apelido normalizado: minusculo e aparado, e nada mais.
///
/// Nada mais porque nada mais e necessario -- o conjunto aceito e ASCII
/// restrito, entao nao ha acento a decompor nem forma Unicode a escolher.
/// Acrescentar normalizacao Unicode aqui faria o comprimento do normalizado
/// deixar de ser igual ao do digitado, que e a propriedade de que o teto de 20
/// depende.
String normalizarApelido(String bruto) => bruto.trim().toLowerCase();

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
///
/// **A unica funcao deste arquivo que produz valor de contrato**, e ela nao
/// adivinha: fora da faixa ou fora da forma devolve `null`, e quem chama
/// decide. Devolve **sempre minusculo**.
String? apelidoParaOContrato(String bruto) {
  final normalizado = normalizarApelido(bruto);
  return FormaDoApelido.regex.hasMatch(normalizado) ? normalizado : null;
}

/// O filtro aplicado enquanto se digita.
///
/// **Nao recusa nada e nao valida nada**, pela mesma razao de `MascaraDeCep`:
/// maiuscula vira minuscula, e o que nao e aceito e descartado. O campo
/// continua digitavel, o botao continua vivo e nenhum caminho daqui marca
/// erro.
///
/// Ele **nao** cobra a faixa: `ze` continua digitavel, e quem recusa e
/// [IdentificadorDoApelido.recusa], no envio. Filtro que cobrasse a faixa
/// impediria a pessoa de digitar o quinto caractere depois do quarto.
class FiltroDeApelido extends TextInputFormatter {
  const FiltroDeApelido();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final filtrado = depois.text
        .toLowerCase()
        .replaceAll(_aceitoNoApelido, '')
        ;
    // Digito alem do teto e DESCARTADO na digitacao, e nao aceito para ser
    // recusado depois -- a mesma regra do CEP e da data.
    //
    // `substring` e nao `characters`: depois do `replaceAll` acima o texto e
    // ASCII puro (`[a-z0-9-]`), entao nao ha grafema composto a preservar, e
    // contar unidade de codigo da o mesmo que contar caractere.
    final cortado = filtrado.length > maximoDoApelido
        ? filtrado.substring(0, maximoDoApelido)
        : filtrado;
    return TextEditingValue(
      text: cortado,
      selection: TextSelection.collapsed(offset: cortado.length),
    );
  }
}

/// A regra do apelido do lado da tela, num lugar so.
///
/// Espelha `src/shared/apelido/apelido.ts`: mesma faixa, mesma forma, mesmo
/// esqueleto e a mesma lista de reservadas. **A autoridade e o servidor** --
/// esta classe existe para a recusa chegar ao lado do campo em vez de voltar da
/// rede, e para as tres sugestoes nascerem sem uma ida a mais.
///
/// Ela e a fonte unica das duas perguntas que a tela faz -- "o botao pode estar
/// habilitado?" e "o que eu digo quando recusar?" -- e e por isso que as duas
/// nao tem como divergir. Mesmo arranjo de `validacao/nome_de_exibicao.dart` e
/// de `IdadeMinima`, em `formato/data.dart`.
class IdentificadorDoApelido {
  const IdentificadorDoApelido._();

  /// A cobranca da faixa. **Diz so a faixa**, sem paragrafo de apoio: o
  /// cliente mandou remover textos de apoio das telas em 18/10, e a orientacao
  /// de verdade vem das tres [sugestoes].
  static const String foraDaFaixa =
      'De $minimoDoApelido a $maximoDoApelido caracteres: letras minúsculas, números e hífen.';

  /// A cobranca do apelido curto. Separada de [foraDaFaixa] porque o problema
  /// de quem digitou `ze` nao e o alfabeto, e dizer a lista de caracteres
  /// aceitos mandaria a pessoa olhar para o lugar errado.
  static const String curtoDemais = 'Use no mínimo $minimoDoApelido caracteres.';

  /// A cobranca da palavra reservada e do apelido ja tomado -- **a mesma
  /// frase**, de proposito.
  ///
  /// Separar as duas contaria a quem esta digitando **quais** apelidos existem,
  /// que e a enumeracao que o plano 4-C.5 evitou matando a rota de
  /// disponibilidade. "Indisponivel" cobre reservada e tomada sem distinguir,
  /// e as tres sugestoes dao a saida nos dois casos.
  static const String indisponivel = 'Esse apelido não está disponível.';

  /// O mapa dos parecidos, **por GRUPO**, igual ao `translate` de
  /// `handle_esqueleto` na migracao e ao `PARECIDOS` do TypeScript.
  ///
  /// **DIVERGENCIA DECLARADA DO PLANO, e ela foi endossada pelo coordenador.**
  /// O plano escreve o mapa como `0->o`, `1->l`, `5->s`, `3->e`, e esse mapa
  /// **sozinho nao produz a colisao que o proprio plano exige**: com ele,
  /// `mar1a` vira `marla` e `maria` fica `maria`, e os dois coexistiriam -- ao
  /// contrario do invariante escrito, que diz que `@maria-silva`,
  /// `@mariasilva` e `@mar1a-silva` nao coexistem.
  ///
  /// Para o invariante valer, **`i` tambem colapsa em `l`**, e o mapa real e
  /// por GRUPO de parecidos: `{0,o}`, `{1,i,l}`, `{5,s}`, `{3,e}`.
  ///
  /// **O CUSTO, MEDIDO E DITO EM VOZ ALTA: `@lia-vet`, `@l1a-vet` e `@iia-vet` passam a
  /// ser o MESMO apelido.** Os tres viram `llavet`, entao o segundo e o
  /// terceiro a pedir sao recusados com "indisponivel". Os exemplos tem 5 ou
  /// mais caracteres de proposito: o piso de 5 ja barra `@lia`, entao ele nao
  /// ilustraria custo nenhum. Isso recusa alguns
  /// apelidos legitimos a mais do que o plano previa -- e a alternativa era
  /// deixar `@mar1a-silva` coexistir com `@maria-silva`, que e a imitacao que
  /// este freio existe para impedir. A troca e essa, e e deliberada.
  static const Map<String, String> _parecidos = <String, String>{
    '0': 'o',
    '1': 'l',
    'i': 'l',
    '5': 's',
    '3': 'e',
  };

  /// As palavras reservadas do plano 4-C.6, **lidas do plano e nao
  /// reinventadas**.
  ///
  /// A mesma lista esta em `src/shared/apelido/apelido.ts` e carregada em
  /// `handles` pela migracao `20261018000021`. Tres copias sao inevitaveis
  /// (SQL, TypeScript e Dart nao se importam), e e por isso que o teste deste
  /// arquivo confere o tamanho e a colisao de `noreply`/`no-reply`.
  static const List<String> reservadas = <String>[
    // Caminho
    'public', 'media', 'static', 'assets', 'health', 'cartaz', 'login',
    'entrar', 'conta', 'perfil', 'perto', 'achado', 'perdido', 'plaquinha',
    'evento', 'eventos', 'diretorio', 'busca', 'termos', 'privacidade',
    'sobre',
    // Plataforma
    'bichu', 'oficial', 'equipe', 'suporte', 'atendimento', 'ajuda',
    'moderacao', 'moderador', 'seguranca', 'admin', 'administrador',
    'sistema', 'contato', 'noreply', 'no-reply',
    // Golpe
    'verificado', 'validado', 'premium', 'premio', 'recompensa', 'sorteio',
    'ganhador', 'pagamento', 'cobranca',
    // Tecnicas
    'false', 'teste', 'usuario', 'anonimo', 'deleted', 'excluido',
    'undefined',
  ];

  /// A palavra cuja regra e **CONTEM**, e nao igualdade.
  ///
  /// `@suporte-bichu` e `@oi-bichu` sao a forma real do golpe, e nenhum dos
  /// dois e igual a `bichu`. Custo aceito: um `@bichuchi` legitimo e recusado.
  static const String _contidaProibida = 'bichu';

  /// O esqueleto de um apelido: sem hifen e com os parecidos colapsados.
  ///
  /// Igual a `handle_esqueleto(text)` da migracao e a `esqueletoDoApelido` do
  /// TypeScript. Se os tres divergirem, a tela, o servidor e o banco passam a
  /// discordar sobre o que e parecido.
  static String esqueleto(String bruto) {
    final semHifen = normalizarApelido(bruto).replaceAll('-', '');
    final saida = StringBuffer();
    for (final caractere in semHifen.split('')) {
      saida.write(_parecidos[caractere] ?? caractere);
    }
    return saida.toString();
  }

  /// `true` quando o apelido cai numa palavra reservada.
  ///
  /// **A conferencia e sobre o ESQUELETO**, dos dois lados: senao
  /// `@b1chu-suporte` passa pela lista inteira, e `@5uporte` tambem.
  static bool ehReservado(String bruto) {
    final osso = esqueleto(bruto);
    if (osso.contains(esqueleto(_contidaProibida))) return true;
    return reservadas.any((palavra) => esqueleto(palavra) == osso);
  }

  /// Tres sugestoes derivadas do que a pessoa digitou.
  ///
  /// **Elas NAO sao conferidas contra o banco, e isso e de proposito**:
  /// conferir seria reintroduzir a consulta de disponibilidade por outra porta,
  /// com o mesmo dano de enumeracao. Uma sugestao pode estar tomada, e a pessoa
  /// descobre ao enviar -- como em qualquer outra escolha.
  static List<String> sugestoes(String bruto) {
    final base = normalizarApelido(bruto)
        .replaceAll(_aceitoNoApelido, '')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final semente = base.isEmpty
        ? 'pessoa'
        : base.substring(0, base.length > maximoDoApelido - 3 ? maximoDoApelido - 3 : base.length);

    final encontradas = <String>[];
    // Mais sufixos do que sugestoes pedidas: alguns caem na regra de CONTEM
    // (qualquer coisa com `bichu`) ou na lista, e a tela nao pode oferecer o
    // que ela mesma vai recusar.
    for (final sufixo in <String>['-01', '-oi', '-10', '-20', '-30', '-40']) {
      if (encontradas.length >= 3) break;
      var candidata = '$semente$sufixo';
      if (candidata.length > maximoDoApelido) {
        candidata = candidata.substring(0, maximoDoApelido);
      }
      candidata = candidata.replaceAll(RegExp(r'-+$'), '');
      while (candidata.length < minimoDoApelido) {
        candidata = '${candidata}0';
      }
      if (FormaDoApelido.regex.hasMatch(candidata) &&
          !ehReservado(candidata) &&
          !encontradas.contains(candidata)) {
        encontradas.add(candidata);
      }
    }
    return encontradas;
  }

  /// A mensagem de recusa, ou `null` quando o apelido passa.
  ///
  /// A ordem das conferencias e a ordem em que elas ajudam: faixa, forma e so
  /// entao reservada.
  ///
  /// **Nao confere disponibilidade** -- ver o topo deste arquivo.
  static String? recusa(String? bruto) {
    final normalizado = normalizarApelido(bruto ?? '');
    if (normalizado.length < minimoDoApelido) return curtoDemais;
    if (normalizado.length > maximoDoApelido) return foraDaFaixa;
    if (!FormaDoApelido.regex.hasMatch(normalizado)) return foraDaFaixa;
    if (ehReservado(normalizado)) return indisponivel;
    return null;
  }

  /// `true` quando ha apelido suficiente para o campo nao estar pendente.
  ///
  /// **Nao bloqueia botao nenhum**, e e aqui que o apelido difere da data de
  /// nascimento: o campo e OPCIONAL no cadastro, entao vazio e um estado
  /// valido, nao uma pendencia. Quem decide o botao e a tela, somando "vazio
  /// **ou** completo".
  static bool completo(String? bruto) => apelidoParaOContrato(bruto ?? '') != null;

  /// `true` quando o campo esta vazio -- um estado **valido** no cadastro.
  static bool vazio(String? bruto) => normalizarApelido(bruto ?? '').isEmpty;
}
