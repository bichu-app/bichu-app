import 'package:flutter/material.dart';

import '../api/modelos_pet.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'moldura.dart';

/// O cartao de pet do paragrafo 11.3, variante `lista`.
///
/// Anatomia do documento: container horizontal (raio `radius/lg`, padding
/// `space/4`, fundo `surface`, borda 1px `outline`), foto na moldura
/// `foto/sm`, e a coluna com selo de estado, nome em `title` e atributos em
/// `body-sm` separados por " · ".
///
/// ## Tres coisas que a anatomia pede e que este cartao **nao** desenha, com o
/// motivo de cada uma
///
/// 1. **O icone de navegacao 24 do fim da linha.** Ele anuncia que o cartao
///    leva a algum lugar, e a tela de detalhe do pet esta explicitamente fora
///    desta historia. Uma seta para lugar nenhum e o mesmo defeito do
///    `Ver meus pets` sem destino que a BICHUS-62 veio fechar, e o criterio 2
///    dela proibe por escrito: nenhuma acao sem destino e renderizada.
/// 2. **A linha de local e data em `caption`/`text-muted`.** Ela e da lista de
///    perdidos, onde bairro e data sao o que decide se vale olhar. Na lista do
///    proprio tutor nao ha local nem data a mostrar. O slot e reaproveitado
///    pelo convite de plaquinha do criterio 4.
/// 3. **Os estados de foco e pressionado aplicados ao cartao inteiro.** Eles
///    pressupoem um cartao clicavel, e este ainda nao leva a lugar nenhum. Sem
///    destino, um anel de foco seria uma parada de teclado que nao faz nada.
///    Eles voltam junto com a tela de detalhe.
///
/// O cartao e **uma unica parada de leitor de tela** (criterio 5): um
/// `Semantics` de container com `excludeSemantics`, cujo rotulo e composto por
/// [rotuloAcessivelDe]. Nao ha controle dentro de controle porque nao ha
/// controle nenhum.
class CartaoDePet extends StatelessWidget {
  const CartaoDePet({
    required this.pet,
    super.key,
    this.aoTocar,
    this.linhaDeAviso,
  });

  final Pet pet;

  /// O toque que leva a T.1, o detalhe do pet.
  ///
  /// **Opcional, e nulo continua sendo um estado legitimo.** O 11.3 chama o
  /// cartao de "destino de navegacao", mas ate a BICHUS-60/61 nao havia
  /// destino nenhum, e o criterio 2 da BICHUS-62 proibe renderizar acao sem
  /// ele. Com nulo o cartao volta a ser o que era: um container que informa e
  /// nao promete toque.
  final VoidCallback? aoTocar;

  /// O convite de plaquinha do criterio 4 da BICHUS-62.
  ///
  /// **E texto, e nao um botao, e a razao e o criterio 2 da mesma historia.**
  /// Nao existe rota de vinculo de plaquinha para um pet ja cadastrado: a
  /// emissao so acontece no fim do assistente (F1.6). Um `Vincular plaquinha`
  /// aqui abriria para nada. O verbo tambem sai do texto: convidar alguem a
  /// agir sem dar o caminho e pior que informar o estado.
  static const String convitePlaquinha = 'Ainda sem plaquinha com QR.';

  /// A TERCEIRA POSICAO do aviso persistente de cadastro (BICHUS-75, criterio
  /// 2): "no cartao de cada pet ele aparece como uma linha discreta".
  ///
  /// **Texto, e nao botao, e nao por economia.** O cartao e `excludeSemantics`
  /// com um rotulo composto, e um controle aqui dentro ou vira uma segunda
  /// parada de leitor de tela -- o que o criterio 5 da BICHUS-62 proibe -- ou
  /// e apagado pelo `excludeSemantics` e vira `btn=true tap=false`, que a
  /// suite de acessibilidade reprova. A acao mora nas posicoes 1 e 2, que sao
  /// as unicas duas telas em que a historia a pede.
  ///
  /// **A frase vem de fora**, e nao e montada aqui: o cartao nao sabe nada
  /// sobre verificacao de e-mail, e nao deve passar a saber.
  final String? linhaDeAviso;

  /// A linha de atributos, do jeito que o 11.3 manda: separados por " · ".
  ///
  /// Campo ausente **some da linha** em vez de virar travessao ou "—": a
  /// resposta do servidor e a autoridade, e desenhar um espaco reservado para
  /// o que nao veio enche a tela de marcas de vazio.
  ///
  /// A **cor** nao entra, e isso e falta e nao escolha: o contrato devolve
  /// `primary_color_code`, que e um codigo de cruzamento
  /// (`caramelo`, `preto`), e nao ha `primary_color_label` como ha
  /// `breed_label`. Resolver o codigo pela lista de referencia custaria uma
  /// segunda chamada na tela mais percorrida do produto, e escrever o codigo
  /// cru na tela mostraria "caramelo" em caixa baixa ao lado de "Cao" e
  /// "Medio". Nomeado no relatorio.
  static String atributosDe(Pet pet) {
    final partes = <String>[
      pet.especie.rotulo,
      if (pet.racaRotulo != null && pet.racaRotulo!.isNotEmpty) pet.racaRotulo!,
      if (pet.porte != null) pet.porte!.rotulo,
    ];
    return partes.join(' · ');
  }

  /// O nome acessivel do cartao inteiro, na ordem em que a tela le.
  ///
  /// Uma frase so, porque o cartao e um no so. O selo entra por **texto**, e
  /// nao por cor: quem usa leitor de tela nao recebe a borda de urgencia.
  static String rotuloAcessivelDe(Pet pet, {String? linhaDeAviso}) {
    final partes = <String>[
      if (pet.status == StatusDoPet.perdido) 'Perdido',
      pet.nome,
      atributosDe(pet),
      if (pet.semTag) convitePlaquinha,
      // A linha do aviso entra no ROTULO tambem. Uma linha visivel que nao
      // entrasse aqui seria informacao que so existe para quem enxerga, e o
      // `excludeSemantics` do cartao a apagaria em silencio.
      if (linhaDeAviso != null && linhaDeAviso.isNotEmpty) linhaDeAviso,
    ];
    return partes.where((p) => p.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final perdido = pet.status == StatusDoPet.perdido;

    return Semantics(
      container: true,
      // **`button` e `onTap` andam juntos, sempre.** Anunciar o cartao como
      // botao sem republicar a acao o deixaria com `btn=true tap=false` --
      // quem usa leitor de tela ouviria que ha um botao e nao teria como
      // aciona-lo --, e `test/a11y/acao_de_controle_test.dart` reprova por
      // isso. `excludeSemantics` abaixo apaga a arvore do filho e leva junto a
      // acao que o `InkWell` publica, entao ela precisa ser redeclarada aqui.
      button: aoTocar != null,
      onTap: aoTocar,
      label: rotuloAcessivelDe(pet, linhaDeAviso: linhaDeAviso),
      // **Uma parada de leitor de tela, e uma so** (criterio 5). O rotulo
      // acima e composto por `rotuloAcessivelDe`, e os textos de dentro saem
      // da arvore: sem isto o nome, os atributos, o selo e o convite viram
      // quatro paradas, e quem usa VoiceOver desliza quatro vezes por cartao
      // numa lista de ate vinte.
      excludeSemantics: true,
      child: ClipRRect(
        // O raio vive no recorte, e nao na `BoxDecoration`, porque a borda
        // deste cartao **nao e uniforme**: o 11.3 manda uma borda esquerda de
        // urgencia diferente das outras tres quando o pet esta perdido, e o
        // Flutter recusa `borderRadius` em `Border` de cores diferentes. A
        // faixa de urgencia entra como filho posicionado, ja recortado pelo
        // mesmo raio.
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surface,
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Stack(
            children: <Widget>[
              // O `InkWell` embrulha o conteudo inteiro, e nao um botao
              // dentro dele: o 11.3 manda foco e pressionado valerem para o
              // cartao todo, e um alvo interno criaria duas paradas de foco no
              // mesmo objeto (criterio 5 da BICHUS-62). Com `aoTocar` nulo ele
              // nao publica acao nenhuma.
              InkWell(
                onTap: aoTocar,
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _MolduraDoPet(pet: pet),
                      const SizedBox(width: BichuEspaco.e4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            if (perdido) ...<Widget>[
                              const _SeloPerdido(),
                              const SizedBox(height: BichuEspaco.e2),
                            ],
                            Text(pet.nome, style: textos.titleMedium),
                            const SizedBox(height: BichuEspaco.e1),
                            Text(
                              atributosDe(pet),
                              style: textos.bodyMedium?.copyWith(
                                color: cores.textSecondary,
                              ),
                            ),
                            if (pet.semTag) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Text(
                                convitePlaquinha,
                                style: textos.bodySmall?.copyWith(
                                  color: cores.textMuted,
                                ),
                              ),
                            ],
                            if (linhaDeAviso != null &&
                                linhaDeAviso!.isNotEmpty) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Text(
                                linhaDeAviso!,
                                style: textos.bodySmall?.copyWith(
                                  color: cores.textMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (perdido)
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  // A faixa de urgencia do 11.3 pede **4 px** e o grupo
                  // `border` de design/tokens.json vai ate `thick`, que e 3.
                  // O sistema nao tem o valor; usar `BichuEspaco.e1` (4) aqui
                  // seria pintar borda com token de espacamento. Fica no
                  // maior que existe, e a falta esta nomeada no relatorio, na
                  // familia da BICHUS-109.
                  width: BichuBorda.thick,
                  child: ColoredBox(color: cores.urgency),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A moldura do cartao, nos tres estados que a lista de fato produz.
///
/// `processing` **nao** vira "sem foto": quem acabou de enviar uma foto veria
/// a tela dizer que nao ha nenhuma, e desconfiaria de que o envio falhou. O
/// esqueleto diz a verdade, que e "esta vindo".
class _MolduraDoPet extends StatelessWidget {
  const _MolduraDoPet({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    final capa = pet.fotoDeCapa;
    if (capa != null) {
      return Moldura(
        largura: BichuMoldura.larguraFotoSm,
        estado: EstadoDaMoldura.repouso,
        filho: Image.network(
          capa.urlDeMiniatura!,
          fit: BoxFit.cover,
          // Enquadramento `cover` com ponto focal no terco superior
          // (paragrafo 5.4): e onde esta a cabeca do animal na foto tipica de
          // tutor, e recortar pelo centro geometrico e o que faz o pet virar
          // um borrao marrom na miniatura.
          alignment: const Alignment(0, -1 / 3),
          // Falha de rede nao pode virar caixa vermelha de excecao no meio de
          // uma lista: cai na moldura vazia, que e o que o 11.4 manda.
          errorBuilder: (context, erro, pilha) =>
              const Moldura(largura: BichuMoldura.larguraFotoSm),
        ),
      );
    }
    return Moldura(
      largura: BichuMoldura.larguraFotoSm,
      estado: pet.temFotoEmProcessamento
          ? EstadoDaMoldura.carregando
          : EstadoDaMoldura.vazio,
    );
  }
}

/// O selo `PERDIDO` do paragrafo 11.5: fundo `urgency`, texto `on-urgency`,
/// `overline` em caixa alta, padding 4 x 8, raio `radius/sm`, icone 16.
///
/// Os dois sinais juntos (borda de urgencia e selo), nunca so a cor: o
/// paragrafo 11.3 exige isso por nome, e e o SC 1.4.1 do WCAG.
class _SeloPerdido extends StatelessWidget {
  const _SeloPerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: BichuEspaco.e1,
        horizontal: BichuEspaco.e2,
      ),
      decoration: BoxDecoration(
        color: cores.urgency,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(Icons.search, size: 16, color: cores.onUrgency),
          const SizedBox(width: BichuEspaco.e1),
          Text(
            'PERDIDO',
            style: textos.labelSmall?.copyWith(color: cores.onUrgency),
          ),
        ],
      ),
    );
  }
}
