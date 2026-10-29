import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A trilha de progresso de quem convida — **desenhada para receber prêmio
/// depois, sem redesenho**.
///
/// ## DE ONDE ELA VEM, E POR QUE ELA ESTÁ AQUI E NÃO EM `telas/conexoes/`
///
/// Ela nasceu em `lib/telas/conexoes/convide_tutores.dart` e **morreu com
/// aquela tela** em `c8d80a07` (PR #96, o menu unificado de 28/10/2026). O
/// cliente havia decidido que o QR e o placar (`invited_joined_count`)
/// viajavam para `Meus dados`; a trilha saiu junto **por omissão** — nenhuma
/// decisão a nomeou, e o próprio `6362efb2` registra a perda com estas
/// palavras: *"a `TrilhaDeConvites` [...] morreu, com cinco casos"*.
///
/// **Em 29/10/2026 o cliente pediu os marcos de volta**, verbatim: *"Sim,
/// traga os marcos."* Esta classe é a de `c8d80a07^`, recuperada do histórico
/// e não redesenhada: o desenho existia e foi aprovado.
///
/// Ela mora em `widgets/` e não na pasta da tela antiga por duas razões:
/// `lib/telas/conexoes/convide_tutores.dart` **não pode voltar ao disco** (há
/// isca que o proíbe, em `qr_do_convite_em_meus_dados_test.dart`), e o seu
/// único consumidor agora é `telas/perfil/tela_dados_pessoais.dart` — a mesma
/// vizinhança de `QrDoConvite`, que fez a mesma viagem.
///
/// ## O que ela entrega hoje é reconhecimento, e isso é decisão
///
/// Não há prêmio material: a plaquinha da coleira, que era o candidato óbvio,
/// **já é de graça** no produto, e "convide 3 e ganhe a plaquinha" não
/// entregaria nada. Então cada marco entrega uma palavra.
///
/// ## Por que a forma já serve para prêmio
///
/// [marcos] é uma lista de pares `quantos -> o que acontece lá`. Trocar a
/// palavra de um marco por um prêmio é trocar o texto daquele par — não há
/// nada nesta classe que suponha que o marco é simbólico: a trilha não sabe o
/// que ela entrega, só em que número entrega. Quando o prêmio existir, quem o
/// decidir mexe na lista e em mais nada.
///
/// **E é por isso que ela recebe `quantos` por parâmetro e não lê nada.** O
/// número vem de `invited_joined_count`, e uma trilha que fosse buscar o
/// próprio número seria uma segunda leitura do mesmo resumo que o bloco do
/// convite já lê.
class TrilhaDeConvites extends StatelessWidget {
  const TrilhaDeConvites({
    required this.quantos,
    super.key,
    this.marcos = padrao,
    this.comAFrase = true,
  });

  /// Quantas pessoas a conta trouxe, pela regra decidida: **conexão aceita E a
  /// pessoa com ao menos um pet com foto `ready`**.
  ///
  /// Os dois sinais juntos são também o freio anti-abuso: uma conta criada à
  /// toa não tem pet com foto aprovada, e por isso não conta.
  final int quantos;

  /// Os marcos, em ordem crescente. `(quantos, o que acontece)`.
  final List<MarcoDeConvite> marcos;

  /// A FRASE-CABEÇALHO ENTRA? **O único acréscimo de 29/10/2026 ao desenho
  /// recuperado, e ele existe para não dizer o mesmo número duas vezes.**
  ///
  /// A trilha nasceu numa tela DEDICADA ao convite, onde [quantosEmPalavras]
  /// era o cabeçalho da página. A casa nova é uma gaveta dentro de
  /// `Meus dados`, onde `TelaDadosPessoais.placarDeQuemEntrou` **já diz o
  /// número uma linha acima** — o placar de uma linha que o protótipo aprovou.
  /// Com a frase ligada, as duas afirmações ficariam empilhadas dizendo a
  /// mesma coisa.
  ///
  /// **O padrão é `true`, e o padrão é o comportamento original**: os quatro
  /// casos recuperados de `c8d80a07^` medem a frase, e eles não foram
  /// reescritos. Quem a desliga é só o bloco do convite, onde há placar.
  final bool comAFrase;

  /// Os marcos de hoje: **reconhecimento, e nenhum prêmio material**.
  static const List<MarcoDeConvite> padrao = <MarcoDeConvite>[
    MarcoDeConvite(1, 'O primeiro vizinho'),
    MarcoDeConvite(3, 'Três olhos a mais'),
    MarcoDeConvite(10, 'Dez na vizinhança'),
  ];

  static String quantosEmPalavras(int quantos) {
    if (quantos == 1) {
      return '1 tutor entrou no Bichu com o seu convite e já cadastrou um pet.';
    }
    return '$quantos tutores entraram no Bichu com o seu convite e já '
        'cadastraram um pet.';
  }

  /// O que falta para o próximo marco, ou **nulo quando não falta nada** —
  /// porque todos foram alcançados.
  ///
  /// Nulo e não "0 para o próximo": quem chegou ao fim da trilha não está a
  /// zero de nada, e uma frase de progresso ali seria um progresso que não
  /// existe.
  MarcoDeConvite? get proximo {
    for (final marco in marcos) {
      if (quantos < marco.quantos) return marco;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final alvo = proximo;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (comAFrase) ...<Widget>[
          Text(
            TrilhaDeConvites.quantosEmPalavras(quantos),
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
        for (final marco in marcos) ...<Widget>[
          _linhaDoMarco(marco, cores, textos),
          const SizedBox(height: BichuEspaco.e2),
        ],
        if (alvo != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            alvo.quantoFalta(quantos),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }

  Widget _linhaDoMarco(
    MarcoDeConvite marco,
    BichuCores cores,
    TextTheme textos,
  ) {
    final feito = quantos >= marco.quantos;
    // O glifo diz o estado, e o rótulo acessível também: um ícone de "feito"
    // sem texto deixa quem usa leitor de tela com uma lista de três nomes sem
    // saber qual foi alcançado.
    return Semantics(
      label: '${marco.rotulo}: ${feito ? 'alcançado' : 'ainda não'}',
      child: ExcludeSemantics(
        child: Row(
          children: <Widget>[
            Icon(
              feito ? Icons.check_circle_outline : Icons.radio_button_unchecked,
              size: 20,
              color: feito ? cores.success : cores.textMuted,
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Text(
                marco.rotulo,
                style: textos.bodyMedium?.copyWith(
                  color: feito ? cores.textPrimary : cores.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um marco da trilha: **em que número ele acontece, e o que acontece lá**.
///
/// O par existe separado para o prêmio futuro caber em [rotulo] sem a trilha
/// aprender nada novo.
class MarcoDeConvite {
  const MarcoDeConvite(this.quantos, this.rotulo);

  final int quantos;
  final String rotulo;

  String quantoFalta(int atuais) {
    final faltam = quantos - atuais;
    if (faltam <= 0) return rotulo;
    if (faltam == 1) return 'Falta 1 para “$rotulo”.';
    return 'Faltam $faltam para “$rotulo”.';
  }
}
