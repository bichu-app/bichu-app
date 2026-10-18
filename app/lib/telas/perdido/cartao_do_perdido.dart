import 'package:flutter/material.dart';

import '../../api/modelos_perdido.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';

/// O cartão da **listagem pública de perdidos** — a variante `lista` do
/// parágrafo 11.3 com os dois slots que `CartaoDePet` deliberadamente não
/// desenha.
///
/// `CartaoDePet` existe e recebe um `Pet`, que é o pet **do tutor**: ele traz
/// `id`, `status` e convite de plaquinha, e nada disso existe em
/// `PublicLostPet`. O cabeçalho dele já anotava a diferença: *"a linha de local
/// e data em `caption` ... é da lista de perdidos"*. Este é esse cartão, e ele
/// é o par do outro e não uma cópia.
///
/// ---------------------------------------------------------------------------
/// ## A FOTO, E OS BYTES QUE ELA CUSTA
///
/// A moldura é `foto/sm` (56 × 61,6 dp, parágrafo 5.4), e o servidor serve a
/// derivada **`thumb`** (176 × 194 px), que é a derivada desenhada **para este
/// tamanho** a 3x (`DERIVADAS_DA_FOTO_DE_PET`). As duas pontas combinam de
/// propósito, e a conta é esta:
///
/// | | Largura decodificada | Por cartão | Página de 20 |
/// |---|---|---|---|
/// | `thumb` com `cacheWidth` (o que este cartão faz) | 168 px | **121 KiB** | **2,37 MiB** |
/// | `thumb` sem `cacheWidth` | 176 px | 133 KiB | 2,60 MiB |
/// | `card` de 1024 px sem `cacheWidth` | 1024 px | 4,42 MiB | **88 MiB** |
///
/// O `ui.Image` em memória custa `largura × altura × 4` da imagem
/// **decodificada**, e não os bytes do arquivo. É por isso que a linha que
/// importa não é a segunda e sim a terceira: a economia grande veio de o
/// servidor selecionar `thumb_key` em vez de `card_key` na listagem, e o
/// `cacheWidth` é o que impede a próxima pessoa de apontar para a `card` "porque
/// já estava na mão" e pagar 88 MiB numa página.
///
/// **A conta acumula com `Carregar mais`**, e isso é honesto e não escondido: o
/// corpo da seção é um `ListView` da casca com os filhos construídos de uma vez,
/// então cem perdidos na tela são cem imagens decodificadas — 11,8 MiB. Não há
/// reciclagem a ganhar aqui sem a casca entregar o controlador de rolagem, que é
/// o mesmo impedimento que `RodapeDaPaginacao` documenta.
///
/// Quem faz as duas coisas é [ImagemDaRede], que já existe para isso. Este
/// cartão não decodifica nada por conta.
///
/// ---------------------------------------------------------------------------
/// ## O TOQUE NÃO LEVA A `/pets/:petId`, E NÃO PODE LEVAR
///
/// Aquela rota é endereçada por **UUID interno**, e o item 6 do ADR-0010 proíbe
/// UUID interno em saída pública. `PublicLostPet` não carrega `pet_id` — o
/// contrato diz que ele "nunca deve possuir" —, então não há o que passar para
/// lá nem se alguém quisesse. A chave é o `share_token`, e o destino é a página
/// do caso.
///
/// **Hoje [aoTocar] pode ser nulo, e nulo desenha um cartão que não promete
/// toque** (a mesma regra do critério 2 da BICHUS-62 que `CartaoDePet` segue):
/// a tela do caso público por token não existe no app — `getPublicLostCase` é
/// consumida pelo SITE, em `/p/{shareToken}`. Renderizar uma seta para lugar
/// nenhum seria pior que informar.
class CartaoDoPerdido extends StatelessWidget {
  const CartaoDoPerdido({
    required this.perdido,
    required this.agora,
    super.key,
    this.aoTocar,
  });

  final PerdidoPublico perdido;

  /// O instante de referência das frases relativas. **Injetado, e não
  /// `DateTime.now()` aqui dentro**: sem isso "há 5 dias" só se testa
  /// esperando cinco dias.
  final DateTime agora;

  final VoidCallback? aoTocar;

  /// O selo. Uma palavra, e ela entra no rótulo acessível **por texto**: quem
  /// usa leitor de tela não recebe a cor da borda.
  static const String selo = 'Perdido';

  /// O texto do [rotuloDaArea] nulo. **É do cliente, e não do servidor**: um
  /// rótulo fixo dentro de um campo de dado seria indistinguível de um bairro
  /// com esse nome, e é por isso que o contrato manda `area_label` nulo quando o
  /// caso só tem coordenada (BICHUS-21 critério 5).
  static const String semRegiao = 'Região não informada';

  /// A linha de atributos, separada por " · " como o 11.3 manda. Campo ausente
  /// **some da linha** em vez de virar travessão.
  static String atributosDe(PerdidoPublico p) {
    final partes = <String>[
      p.especie.rotulo,
      if (p.racaRotulo != null && p.racaRotulo!.isNotEmpty) p.racaRotulo!,
      p.porte.rotulo,
      // A cor ENTRA, diferente de `CartaoDePet`: o contrato devolve
      // `primary_color` já como RÓTULO resolvido pelo servidor, e não o código
      // de cruzamento que a outra lista recebe.
      if (p.cor != null && p.cor!.isNotEmpty) p.cor!,
    ];
    return partes.join(' · ');
  }

  /// `Visto por último ...`, relativo quando é recente e com data quando não é.
  ///
  /// Relativo até seis dias porque é a janela em que "há 3 dias" diz mais que
  /// "em 15/10" para quem vai sair procurando; daí em diante a data é mais
  /// precisa que a contagem. Sem `intl`: o pacote não está no `pubspec` e a
  /// versão dele é fixada pelo Flutter, e uma dependência nova por uma linha de
  /// texto é custo que esta tela não pede (mesma decisão de
  /// `tela_do_pet_da_tag.dart`).
  static String vistoPorUltimo(DateTime quando, DateTime agora) {
    final dias = _diasDeDiferenca(quando.toLocal(), agora.toLocal());
    final frase = switch (dias) {
      <= 0 => 'hoje',
      1 => 'ontem',
      < 7 => 'há $dias dias',
      _ => 'em ${_comoData(quando)}',
    };
    return 'Visto por último $frase';
  }

  /// Dias de calendário entre os dois, no fuso de quem lê. Dias de calendário e
  /// não de 24 h: um pet visto às 23h de ontem foi visto **ontem**, e "há 0
  /// dias" não é frase.
  static int _diasDeDiferenca(DateTime quando, DateTime agora) {
    final a = DateTime(quando.year, quando.month, quando.day);
    final b = DateTime(agora.year, agora.month, agora.day);
    return b.difference(a).inDays;
  }

  /// `dd/mm/aaaa`, no fuso de quem lê. O ano **entra** aqui, ao contrário do
  /// `dd/mm` da tela da tag: lá o caso é sempre recente; esta lista pode mostrar
  /// um caso de trinta dias atrás que atravessou a virada do ano.
  static String _comoData(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes/${local.year}';
  }

  /// O nome acessível do cartão inteiro, na ordem em que a tela lê. Uma frase
  /// só, porque o cartão é **uma única parada de leitor de tela**.
  static String rotuloAcessivelDe(PerdidoPublico p, DateTime agora) {
    return <String>[
      selo,
      p.nome,
      atributosDe(p),
      p.rotuloDaArea ?? semRegiao,
      vistoPorUltimo(p.vistoPorUltimoEm, agora),
    ].where((parte) => parte.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = perdido.urlDaFoto;

    final conteudo = Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // **Ausência é decisão de quem chama**, e é por isso que
          // `ImagemDaRede` recebe uma `url` não anulável: sem foto pronta a
          // moldura vazia fica, com o símbolo que diz que ali havia uma imagem.
          if (url == null || url.isEmpty)
            const Moldura(largura: BichuMoldura.larguraFotoSm)
          else
            Moldura(
              largura: BichuMoldura.larguraFotoSm,
              estado: EstadoDaMoldura.repouso,
              filho: ImagemDaRede(
                url: url,
                // Decorativa: o nome do pet, logo ao lado, já é o rótulo da
                // entrada, e uma foto rotulada faria o leitor de tela dizer o
                // nome duas vezes na mesma parada de foco.
                descricao: null,
                largura: BichuMoldura.larguraFotoSm,
                // Largura dividida pela altura. `BichuMoldura.proporcao` é
                // altura/largura, então o inverso é o que esta peça espera.
                proporcao: 1 / BichuMoldura.proporcao,
                raio: BichuRaio.none,
                simboloDeFalha: Icons.pets_outlined,
              ),
            ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Selo(texto: selo),
                const SizedBox(height: BichuEspaco.e2),
                Text(perdido.nome, style: textos.titleMedium),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  atributosDe(perdido),
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e2),
                _Linha(
                  icone: Icons.place_outlined,
                  texto: perdido.rotuloDaArea ?? semRegiao,
                ),
                const SizedBox(height: BichuEspaco.e1),
                _Linha(
                  icone: Icons.schedule_outlined,
                  texto: vistoPorUltimo(perdido.vistoPorUltimoEm, agora),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return Semantics(
      container: true,
      excludeSemantics: true,
      label: rotuloAcessivelDe(perdido, agora),
      button: aoTocar != null,
      child: aoTocar == null
          ? conteudo
          : InkWell(
              onTap: aoTocar,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              child: conteudo,
            ),
    );
  }
}

class _Selo extends StatelessWidget {
  const _Selo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e2,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.primaryContainer,
        borderRadius: BorderRadius.circular(BichuRaio.full),
      ),
      child: Text(
        texto,
        style: Theme.of(context)
            .textTheme
            .labelSmall
            ?.copyWith(color: cores.onPrimaryContainer),
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icone, size: BichuEspaco.e4, color: cores.textSecondary),
        const SizedBox(width: BichuEspaco.e1),
        Expanded(
          child: Text(
            texto,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cores.textSecondary),
          ),
        ),
      ],
    );
  }
}
