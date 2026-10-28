import 'package:flutter/material.dart';

import '../theme/bichu_tokens.g.dart';
import 'marca_da_pessoa.dart';
import 'selo_de_validado.dart';

/// **UMA PESSOA, ESCRITA DO MESMO JEITO EM TODA LISTAGEM**: o circulo dela, o
/// nome dela e o selo dela, **sempre os tres juntos e nesta ordem**.
///
/// ## QUEM PEDIU, E QUANTAS VEZES
///
/// Isto e **padrao pedido pelo cliente**, e nao desenho de uma tela. Ele pediu
/// em 22/10/2026, literal: *"em todos os lugares que mostra o titulo/nome do
/// usuario tem que tornar padrao mostrar o selo e a foto dele"*. E voltou a
/// pedir, em 26/10/2026, depois de quatro superficies terem sido consertadas
/// uma a uma sem que a regra existisse em lugar nenhum:
///
/// > "ja pedi pra voce tornar isso padrao, sempre trazer a imagem, o
/// > titulo/nome do usuario e o selo juntos, toda vez que aparecer na listagem
/// > e voce continua me ignorando"
///
/// **O que falhou nas quatro vezes anteriores nao foi o conserto, foi a
/// ausencia de portao**: cada tela foi arrumada e a seguinte nasceu errada. O
/// portao e `app/test/widgets/padrao_de_identificacao_test.dart`, e e ele — e
/// nao este cabecalho — que impede a quinta cobranca.
///
/// ## OS TRES PARAMETROS SAO `required`, E ISSO E O MECANISMO
///
/// [nome], [urlDaFoto] e [comSelo] sao **todos obrigatorios**, e nenhum tem
/// valor padrao. A escolha nao e estilo: e ela que faz o **compilador** — e nao
/// um portao de texto — exigir que quem monta uma superficie nova responda as
/// tres perguntas. Um `comSelo` com padrao `false` deixaria o selo cair fora
/// por omissao, que e exatamente como ele caiu nas quatro vezes anteriores; uma
/// [urlDaFoto] com padrao `null` deixaria a foto cair fora do mesmo jeito.
///
/// **[urlDaFoto] e obrigatoria mas ANULAVEL, e a diferenca e o produto todo.**
/// O que o cliente pediu e que **o lugar da foto exista sempre**, e nao que
/// exista foto onde ela nao pode existir. Com nulo este widget desenha a
/// **inicial**, que nao e queda de emergencia: e o recurso que o proprio
/// cliente nomeou na emenda 3 do ADR-0010 (19/10/2026), literal — *"fica a
/// inicial ou o glifo generico que ja estava la"*. Ver a secao seguinte.
///
/// ## A INICIAL E FORMA VALIDA DE AVATAR, POR DECISAO DELE
///
/// Ha superficie onde a foto **nao pode** sair, e isso e decisao do cliente e
/// nao economia do squad:
///
/// - **conversa com quem nao e conexao aceita** — emenda 3 do ADR-0010,
///   19/10/2026, palavras dele: *"a foto aparece SO quando as duas pessoas ja
///   aceitaram conexao"*. O motivo esta escrito na emenda: a conversa e o canal
///   do **golpe do falso achador**, e rosto e insumo de engenharia social;
/// - **pessoa bloqueada** — `BlockedPerson` nao tem o campo, e o contrato diz
///   por que: *"Bloqueado e o oposto de conexao aceita, e foto aqui seria
///   emenda nova sem decisao que a sustente"*;
/// - **pedido de conexao** — `ConnectionPerson` tambem nao tem foto.
///
/// Nessas tres a [urlDaFoto] chega nula **porque o contrato nao tem o campo**,
/// e a inicial e o avatar. O portao aceita isso de proposito: um portao que
/// exigisse foto de verdade viraria impedimento para toda conta sem foto, que e
/// o defeito oposto e igualmente caro.
///
/// ## POR QUE ESTE WIDGET COMPOE, E NAO REDESENHA
///
/// Ele nao pinta circulo nem selo: ele junta [MarcaDaPessoa] (o circulo, a
/// queda para a inicial, o `cacheWidth`, o simbolo de falha de retrato) com
/// [NomeComSelo] (a disputa de largura entre nome e selo, o `Flexible`, o
/// `ellipsis`, as duas paradas de foco). As duas regras ja estavam resolvidas,
/// cada uma num lugar so, e **copia-las aqui seria a quinta copia** — a tela de
/// conexoes ja tinha a quarta copia do circulo escrita a mao.
///
/// **E por isso que [MarcaDaPessoa] continua sem parametro de selo.** A defesa
/// descrita no cabecalho dela — que acender o selo na area de mensagens exige um
/// importe visivel em revisao — fica inteira: este widget importa o selo, e a
/// isca de fonte de `selo_de_validado_test.dart` passou a reprovar
/// `FichaDaPessoa(` nos arquivos de mensagens junto com `NomeComSelo(`.
///
/// ## O QUE ESTE WIDGET NAO FAZ
///
/// - **nao tem toque.** Na lista de conexoes a linha inteira e a porta do
///   perfil; no Mural o cartao e conteudo e o apelido pode ser nulo. Quem
///   precisa de destino embrulha este widget, igual se faz com
///   [MarcaDaPessoa];
/// - **nao tem rotulo acessivel proprio.** O nome e lido pelo [NomeComSelo] e o
///   circulo e decorativo; quem precisa de um rotulo de linha (*"Perfil de
///   Marina"*) poe o `Semantics` por fora, como as telas ja fazem;
/// - **nao escolhe a inicial.** Ela sai de [MarcaDaPessoa.letraDe] sobre
///   [nome], que e `characters.first` e nao `nome[0]` — um nome fora do BMP
///   viraria losango com `[0]`.
class FichaDaPessoa extends StatelessWidget {
  const FichaDaPessoa({
    required this.nome,
    required this.urlDaFoto,
    required this.comSelo,
    super.key,
    this.lado = 40,
    this.estiloDoNome,
    this.abaixoDoNome,
  });

  /// Como a pessoa e escrita. **Ja resolvido por quem chama** — e dos modelos
  /// `nomeParaLer`, que cai para `@apelido` quem nao tem nome.
  final String nome;

  /// A derivada `thumb` de 176 px da foto, **ou nula**.
  ///
  /// Obrigatoria e anulavel de proposito: ver a secao *"A INICIAL E FORMA
  /// VALIDA DE AVATAR"* no cabecalho desta classe. Nula desenha a inicial de
  /// [nome], e nao um quadrado vazio nem um erro.
  final String? urlDaFoto;

  /// `contact_channel_verified` do servidor, **e nunca uma comparacao desta
  /// camada**.
  ///
  /// Obrigatorio para que a omissao nao seja possivel. Onde o contrato nao tem
  /// o campo (`BlockedPerson`, `ConnectedPerson`, `ConnectionPerson` para parte
  /// dos casos) quem chama passa `false` **e isso fica visivel na chamada** —
  /// que e o ponto: um `false` escrito e uma pergunta aberta com o cliente, e um
  /// parametro omitido nao e nada.
  final bool comSelo;

  /// O lado do circulo, em dp. 40 em cartao e linha de lista, 32 em comentario.
  final double lado;

  /// O estilo do nome. Nulo deixa o [NomeComSelo] herdar do tema.
  final TextStyle? estiloDoNome;

  /// A segunda linha, quando ela existe: `@apelido`, as contagens, a data do
  /// bloqueio. **Fica debaixo do nome e dentro do mesmo `Expanded`**, para que
  /// ela encolha com o nome em vez de empurrar o selo para fora.
  final Widget? abaixoDoNome;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        MarcaDaPessoa(
          urlDoIcone: urlDaFoto,
          inicial: MarcaDaPessoa.letraDe(nome),
          lado: lado,
        ),
        const SizedBox(width: BichuEspaco.e3),
        // `Expanded` na COLUNA e `Flexible` no texto dentro do `NomeComSelo`:
        // a coluna toma o vao que sobra depois do circulo, e la dentro e o nome
        // que encolhe com `…` para o selo nao desaparecer.
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              NomeComSelo(nome: nome, comSelo: comSelo, estilo: estiloDoNome),
              ?abaixoDoNome,
            ],
          ),
        ),
      ],
    );
  }
}
