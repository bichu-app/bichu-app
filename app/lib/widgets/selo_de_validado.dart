import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// **O SELO DE VALIDADO**, ao lado do nome de uma pessoa.
///
/// Pedido do cliente em 21/10/2026, literal: *"os usuarios que validados deve
/// ter um simbolo em frente de seu nome nos posts, comentarios, nas mensagens,
/// mostrando que e um usuario confiavel"*. E, sobre o desenho: *"o selo que eu
/// digo igual do instagram, nao sao as regras para obter, mas o designer dele,
/// como se fosse aquela tag"*.
///
/// ## O GLIFO E DECISAO DELE, O ROTULO E MEDIDO
///
/// Sao duas coisas separadas e e importante que continuem separadas.
///
/// **O glifo e a roseta** (`Icons.verified`, a mesma familia Material Symbols do
/// resto do app), porque foi isso que ele pediu — a tag do Instagram. Nenhum
/// vetor foi baixado e nenhuma dependencia foi acrescentada.
///
/// **O ROTULO DIZ O QUE O DADO PROVA, E NADA ALEM.** O booleano que acende este
/// selo e `contact_channel_verified`, que no servidor e
/// `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` — a mesma
/// regua dos quatro 409 `contact-channel-unverified`. E ele proprio fechou o
/// alcance disso: *"nao estamos validando documentos de faco, apenas e-mail por
/// enquanto e futuramente telefone"*.
///
/// Entao [rotulo] e **"Contato confirmado"**, e **nunca** "verificado",
/// "confiavel", "confirmado pela equipe" nem "validado". A diferenca nao e
/// estilo: quem usa leitor de tela recebe SO o rotulo, e um rotulo que dissesse
/// "usuario verificado" faria o produto assinar por uma conferencia de
/// identidade que nao existe. O caso
/// `app/test/widgets/selo_de_validado_test.dart` reprova as palavras pelo nome.
///
/// ## O ROTULO NAO NOMEIA O MEIO, E ISSO E DECISAO DELE
///
/// **Duas decisoes do cliente no MESMO dia (21/10/2026), e a SEGUNDA vence.**
/// Esta ordem esta escrita aqui de proposito: sem ela, alguem daqui a um mes
/// "consertaria" o rotulo de volta para a aprovacao anterior, achando que
/// estava corrigindo uma regressao.
///
/// 1. **Primeira**, ao fechar o alcance do selo: *"nao estamos validando
///    documentos de faco, apenas e-mail por enquanto e futuramente telefone"*.
///    O rotulo que saiu dali foi **"E-mail confirmado"**, porque na pratica so
///    e-mail era confirmado.
/// 2. **Segunda**, ao unificar a regua do selo do dono com a de terceiro:
///    *"tem que dizer que o usuario esta confirmado, independente do meio"*.
///
/// A segunda e posterior e e sobre a MESMA pergunta, entao ela manda:
/// **nenhum rotulo de selo nomeia o canal** — nem "E-mail confirmado", nem
/// "Telefone confirmado", nem a variante com os dois. O caso
/// `ISCA: o rotulo NAO NOMEIA O CANAL` reprova `e-mail`, `email` e `telefone`
/// dentro do rotulo do selo, para que a decisao tenha portao e nao so prosa.
///
/// **Por que "Contato confirmado" e nao "Canal de contato confirmado"**: e o
/// mesmo fato em menos palavras, e o rotulo divide 24 dp de largura com o nome
/// — mas o que decide e a honestidade, nao o tamanho. "Contato confirmado" e
/// literalmente o que o booleano prova (um canal de contato foi confirmado), e
/// casa com o nome do campo do contrato (`contact_channel_verified`), de modo
/// que contrato, codigo e tela dizem a mesma coisa.
///
/// **E ele resolve uma repeticao medida**: na tela de `Meus dados` a linha de
/// situacao ao lado do endereco diz "E-mail confirmado" — aquela fala do
/// e-mail e CONTINUA nomeando o canal, porque e sobre o canal. Com o selo
/// dizendo a mesma frase, quem usa leitor de tela ouvia a frase duas vezes na
/// mesma tela e nenhum `find` distinguia as duas.
///
/// ## O QUE ACONTECE COM `false`
///
/// **Nada.** O selo nao nasce, e nao nasce um selo cinza: um glifo apagado ao
/// lado do nome diria "esta conta foi reprovada", e `false` significa apenas
/// que ninguem confirmou nada. Quem monta decide com um `if`, e por isso este
/// widget nao tem parametro de estado — ver [NomeComSelo].
///
/// ## O ANEL NAO EXISTE AQUI
///
/// O selo do DONO, em `perfil/tela_dados_pessoais.dart`, pousa **sobre a foto**
/// e por isso tem um anel de cor de superficie: sem ele um glifo verde sobre
/// fundo verde desaparece. Aqui o selo pousa ao lado do NOME, sobre a superficie
/// do cartao, e um anel seria enfeite.
class SeloDeValidado extends StatelessWidget {
  const SeloDeValidado({super.key});

  /// O nome acessivel. **"Contato confirmado", e nunca mais do que isso.**
  ///
  /// **UM rotulo para as QUATRO superficies** — publicacao, comentario, perfil
  /// de pessoa e pedido de conexao — **e para a tela do DONO**, que o le daqui
  /// em vez de ter constante propria. Dois rotulos para a mesma regua sao o
  /// caminho de volta para duas promessas, do mesmo jeito que dois nomes de
  /// campo eram o caminho de volta para duas reguas.
  ///
  /// Ver o cabecalho desta classe para as duas decisoes do cliente de
  /// 21/10/2026 e por que a segunda vence: o rotulo nao pode prometer mais do
  /// que o dado prova **e nao pode nomear o meio**.
  static const String rotulo = 'Contato confirmado';

  /// 20 dp: `icon.size.inline` do `design/tokens.json`, *"dentro de texto e
  /// chip"*, que e exatamente o que este selo e.
  ///
  /// **Nao e o 24 do selo do dono.** Aquele pousa sobre uma foto de 96 dp e e um
  /// elemento do retrato; este divide a linha com o nome, e um glifo de 24 ao
  /// lado de `titleMedium` compete com a palavra.
  static const double lado = BichuEspaco.e5;

  /// O vao entre o nome e o selo: `space.1`.
  static const double vao = BichuEspaco.e1;

  /// **O QUE O SELO CUSTA DE LARGURA: 24 dp.** [lado] + [vao].
  ///
  /// Esta constante existe para ser MEDIDA, e nao para ser lida: e ela que os
  /// casos de largura de `selo_de_validado_test.dart` somam ao orcamento do nome
  /// para dizer se ele ainda cabe. Numero repetido num teste e numero que
  /// diverge do desenho na primeira mudanca.
  static const double custoDeLargura = lado + vao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: rotulo,
      // `ExcludeSemantics` dentro, e nao `excludeSemantics: true` no `Semantics`
      // de fora: o `Icon` do Flutter nao anuncia nada por si quando nao tem
      // `semanticLabel`, mas deixa-lo explicito aqui impede que alguem
      // acrescente um `semanticLabel` no `Icon` e faca o leitor de tela anunciar
      // a pessoa duas vezes com duas frases diferentes.
      child: ExcludeSemantics(
        child: Icon(
          // A ROSETA. Decisao do cliente — a tag do Instagram.
          //
          // **O nome desta constante do Flutter nao e o rotulo**, e a distincao
          // importa: `Icons.verified` e o endereco do glifo na familia Material
          // Symbols, e o que quem usa leitor de tela ouve e [rotulo].
          Icons.verified,
          size: lado,
          color: cores.success,
        ),
      ),
    );
  }
}

/// **O NOME DE UMA PESSOA, com o selo de validado ao lado quando ele existe.**
///
/// Este widget existe porque o selo e o nome **disputam a mesma largura**, e a
/// disputa tem de ser resolvida num lugar so. Quatro superficies desenham nome
/// de pessoa de terceiro com selo (publicacao, comentario, perfil de pessoa e
/// pedido de conexao); quatro copias de `Row` + `Flexible` + `ellipsis` seriam
/// quatro lugares onde uma delas corta diferente das outras.
///
/// ## `Flexible` NO TEXTO, E NUNCA `Expanded`
///
/// Com `Expanded` o nome ocuparia toda a largura disponivel e empurraria o selo
/// para fora quando a linha tem outros ocupantes (o `⋮` do cartao, por
/// exemplo). Com `Flexible` o nome encolhe ate caber e o selo fica: e o NOME que
/// perde caractere, e nao o selo que desaparece — porque um nome com `…` ainda
/// e legivel e um selo ausente e informacao perdida.
///
/// ## O SELO NAO ENTRA NO `Semantics` DO NOME
///
/// Os dois sao paradas de foco separadas de proposito: o leitor de tela anuncia
/// o nome e depois "Contato confirmado". Costura-los numa frase so
/// (`"Maria, contato confirmado"`) faria o rotulo do selo depender de quem
/// monta, e e justamente o rotulo que nao pode variar.
///
/// ## MENSAGENS NAO USA ESTE WIDGET, E A AUSENCIA E A REGRA
///
/// Ver `app/test/widgets/selo_de_validado_test.dart`, o caso de contrapeso: a
/// area de mensagens e a tela da conversa **nao desenham selo**, e o motivo esta
/// escrito la e em `MarcaDaPessoa`.
class NomeComSelo extends StatelessWidget {
  const NomeComSelo({
    required this.nome,
    required this.comSelo,
    super.key,
    this.estilo,
    this.alinhamento = MainAxisAlignment.start,
  });

  final String nome;

  /// **`contact_channel_verified` do servidor, e nunca uma comparacao desta
  /// camada.**
  ///
  /// A tela nao tem a conta da outra pessoa para perguntar nada; o que ela tem e
  /// o booleano que a resposta trouxe. Com `false` o selo nao nasce — e nao
  /// nasce apagado.
  final bool comSelo;

  final TextStyle? estilo;

  final MainAxisAlignment alinhamento;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: alinhamento,
      // `min` para que a linha nao reserve largura que nao usa quando ela esta
      // dentro de um `Expanded` de fora — e o caso do cartao do Mural, onde o
      // `⋮` fica a direita.
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Flexible(
          child: Text(
            nome,
            style: estilo,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (comSelo) ...<Widget>[
          const SizedBox(width: SeloDeValidado.vao),
          const SeloDeValidado(),
        ],
      ],
    );
  }
}
