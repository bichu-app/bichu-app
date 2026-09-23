import 'package:flutter/material.dart';

import '../../api/modelos_pet.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/saida_da_tela.dart';

/// O que a tela do codigo resolvido mostra, e por que ela tem **duas** formas
/// e nao tres.
///
/// `viewer` chega com tres valores (`owner`, `authenticated_other`,
/// `anonymous`) e o contrato diz, por escrito, que os dois ultimos **veem
/// exatamente a mesma coisa**: a excecao permanente nao distingue quem esta
/// logado (criterio 7 da BICHUS-57). Tratar os tres iguais apaga o modo dono;
/// inventar uma terceira forma cria distincao que o servidor nao faz e que
/// ninguem pediu. Sao duas.
enum FormaDaTelaDaTag {
  /// `F2.3`: o tutor apontou a camera para a plaquinha do proprio pet.
  modoDono,

  /// `F2.2`: quem escaneou nao e o dono. E a mesma peca da `F4.1` da web.
  achouOPet;

  static FormaDaTelaDaTag de(QuemEscaneou quem) {
    return switch (quem) {
      QuemEscaneou.dono => FormaDaTelaDaTag.modoDono,
      // Os dois caem aqui **de proposito**, e nao por esquecimento: o caminho
      // conservador serve o achador. O dono que caisse aqui por engano perde
      // uma tela; o achador que caisse no modo dono perde o resgate.
      QuemEscaneou.outroLogado ||
      QuemEscaneou.anonimo => FormaDaTelaDaTag.achouOPet,
    };
  }
}

/// F2.2 e F2.3: o que a pessoa ve depois de o codigo da tag resolver.
///
/// ## O que esta tela **nao** tem, e cada ausencia e decisao
///
/// **Nenhum botao `Avisar o tutor`.** Ele e a razao de a F2.2 existir, e por
/// isso a ausencia dele esta escrita aqui e no relatorio da entrega, e nao
/// escondida. `POST /v1/tags/{code}/found-reports` **nao tem cliente neste
/// app**: nao ha metodo em `TagsApi`, nao ha fila, nao ha tela de confirmacao.
/// Desenhar o botao mesmo assim repetiria o defeito que o criterio 2 da
/// BICHUS-62 existe para fechar -- as duas acoes `Ver meus pets` que
/// apontavam para o vazio. Um botao que nao avisa ninguem e pior que nenhum
/// botao: o achador vai embora **acreditando** que avisou.
///
/// **Nenhuma acao de dono.** `Ver o caso`, `Ver a Nina`, `Marcar como perdida`
/// e `Ver o arquivo da tag` precisam de `pet_id` e de `tag_id`, e o contrato
/// os poe **fora** deste corpo, em `GET /tags/{code}/owner-context` -- que
/// tambem nao tem cliente neste app. Sem os identificadores nao ha endereco
/// para onde mandar ninguem. `Marcar como perdida` teria um destino
/// **parecido** (`F3.0`, a escolha do pet), e ele e pior que nenhum: quem
/// escaneou a coleira da Nina e cai numa lista para escolher entre tres pets
/// pode abrir o caso do pet errado, que e o deslize exato que o cabecalho do
/// pet existe para prevenir.
///
/// O que sobra e informacao, e ela nao e pouca: **o cartao de manejo muda o
/// que o achador faz nos proximos trinta segundos** ("e medroso, nao corra
/// atras" evita a perseguicao que faz o animal fugir de novo), e a linha de
/// sinais e o que confirma que e o mesmo bicho que esta no colo.
///
/// ## A foto, que nao vem
///
/// `photo_url` chega `null` nesta rota, por desenho do servidor. A tela **nao
/// pode prometer foto**: nao ha moldura vazia, nao ha simbolo e nao ha
/// ilustracao. O paragrafo 5.4 do design system decide isso e diz por que, e
/// o motivo e de conversao e nao de estetica: *"uma ilustracao generica no
/// lugar da foto faz o achador duvidar de que e o pet certo"*. No lugar da
/// moldura sobem **o nome em `display-lg` e o cartao de sinais**, que e
/// exatamente a regra que o paragrafo manda aplicar quando nao ha foto.
class TelaDoPetDaTag extends StatelessWidget {
  const TelaDoPetDaTag({required this.tag, super.key});

  final TagResolvida tag;

  /// A faixa do modo dono sem caso aberto (UX F2.3, primeira configuracao).
  ///
  /// **`de $nome` e nao `da $nome`, e a divergencia e deliberada.** A UX
  /// escreve `Esta tag é da Nina.` com um nome feminino, e a concordancia
  /// depende do sexo do animal -- que `TagResolution` **nao traz**: o corpo e
  /// a visao publica minima e nao tem `sex`. Entre inventar o artigo (e errar
  /// em metade dos pets) e usar a forma que serve aos dois, escolhi a
  /// segunda. Registrado como pergunta fechada na pauta de refinamento.
  static String faixaDeDonoDe(String nome) => 'Esta tag é de $nome.';

  /// A faixa do modo dono **com** caso aberto.
  ///
  /// Sem particípio, pela mesma razao: `procurada`/`procurado` concorda com o
  /// sexo do animal, e ele nao vem nesta resposta.
  static String faixaDeDonoComCasoDe(String nome, DateTime? desde) {
    if (desde == null) return 'Há um caso aberto para $nome.';
    return 'Há um caso aberto para $nome desde ${_comoData(desde)}.';
  }

  /// A faixa de urgencia da F4.1, item 7, para quem **nao** e o dono.
  static String faixaDePerdidoDe(String nome, DateTime? desde) {
    if (desde == null) return 'O tutor está procurando $nome.';
    return 'O tutor está procurando $nome desde ${_comoData(desde)}.';
  }

  /// `dd/mm`, sem depender de `intl`.
  ///
  /// O pacote nao esta no `pubspec`, e a versao dele e fixada pelo Flutter:
  /// uma dependencia nova por uma linha de texto e custo que esta tela nao
  /// pede. O ano fica de fora de proposito -- um caso aberto e recente, e a
  /// data completa rouba espaco da frase que importa.
  ///
  /// `toLocal()` porque `since` vem em UTC e quem le esta num fuso.
  static String _comoData(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes';
  }

  /// O titulo da F4.1, item 2.
  static String tituloDoAchadorDe(String nome) => 'Este é o $nome.';

  /// A atribuicao do cartao de manejo (F4.1, item 4).
  ///
  /// **Ela e o que torna o cartao util**: diz que aquilo e a voz de quem
  /// conhece o animal, e nao instrucao do Bichu.
  static String atribuicaoDosCuidadosDe(String nome) =>
      'O tutor de $nome '
      'escreveu:';

  /// O titulo do cartao de manejo.
  static String tituloDosCuidadosDe(String nome) => 'Cuidados com $nome';

  /// A linha de sinais da F4.1, item 3, com o separador do 11.3.
  ///
  /// Monta com o que **veio**, e omite o que nao veio: tres dos quatro campos
  /// sao anulaveis no contrato, e uma linha com `null` no meio e pior que uma
  /// linha curta.
  static String sinaisDe(TagResolvida tag) {
    final partes = <String>[
      tag.especie.rotulo,
      if (tag.porte != null) 'porte ${tag.porte!.rotulo.toLowerCase()}',
      if (_temTexto(tag.racaRotulo)) tag.racaRotulo!.trim(),
      if (_temTexto(tag.corPrincipal)) tag.corPrincipal!.trim(),
      if (_temTexto(tag.sinaisDistintivos)) tag.sinaisDistintivos!.trim(),
    ];
    return partes.join(' · ');
  }

  static bool _temTexto(String? valor) =>
      valor != null && valor.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final forma = FormaDaTelaDaTag.de(tag.quemEscaneou);
    final cores = BichuColors.of(context).cores;

    return Scaffold(
      backgroundColor: cores.surface,
      appBar: AppBar(
        // Desvio, e nao destino: o leitor continua na pilha, e quem escaneou a
        // plaquinha errada volta para a camera sem sair do fluxo.
        leading: const SaidaDaTela(tipo: TipoDeSaida.voltar),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            BichuEspaco.e4,
            BichuEspaco.e2,
            BichuEspaco.e4,
            BichuEspaco.e8,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // A faixa vem **antes** de tudo nas duas formas, e nao e enfeite:
              // na F2.3 a acessibilidade manda que ela seja o primeiro elemento
              // anunciado depois do titulo, porque carrega a informacao que
              // muda tudo; na F2.2 o item 7 da F4.1 a poe acima da foto pela
              // mesma razao.
              ..._faixa(context, forma),
              Text(
                switch (forma) {
                  // O dono ja sabe de quem e a tag: a faixa acabou de dizer.
                  // Repetir "Este e o Thor" acima dela seria a mesma frase duas
                  // vezes no topo da tela.
                  FormaDaTelaDaTag.modoDono => tag.nomeDoPet,
                  FormaDaTelaDaTag.achouOPet => tituloDoAchadorDe(
                    tag.nomeDoPet,
                  ),
                },
                // `display-lg`: o tamanho que o 5.4 manda usar no lugar da foto
                // que nao veio.
                style: Theme.of(context).textTheme.displayLarge
                    ?.copyWith(color: cores.textPrimary),
              ),
              const SizedBox(height: BichuEspaco.e4),
              _CartaoDeSinais(tag: tag),
              if (_temTexto(tag.notasDeCuidado)) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                _CartaoDeManejo(tag: tag),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _faixa(BuildContext context, FormaDaTelaDaTag forma) {
    final texto = switch (forma) {
      FormaDaTelaDaTag.modoDono =>
        tag.estaPerdido
            ? faixaDeDonoComCasoDe(tag.nomeDoPet, tag.perdidoDesde)
            : faixaDeDonoDe(tag.nomeDoPet),
      // Quem nao e o dono so ve faixa quando **ha** caso aberto. Sem caso, a
      // tela do achador comeca pelo nome, como a F4.1.
      FormaDaTelaDaTag.achouOPet =>
        tag.estaPerdido
            ? faixaDePerdidoDe(tag.nomeDoPet, tag.perdidoDesde)
            : null,
    };
    if (texto == null) return const <Widget>[];
    return <Widget>[
      _FaixaDaTag(texto: texto, urgente: tag.estaPerdido),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }
}

/// A faixa do topo, nas duas intensidades que a tela de fato produz.
///
/// **Urgencia so como preenchimento solido** (design system 6.4): um pet
/// marcado como perdido escaneado por alguem que nao e o dono e o momento mais
/// importante do produto inteiro, e ele nao pode chegar com a mesma tinta de um
/// aviso qualquer. Sem caso aberto a faixa e neutra, sobre `surface-alt`.
///
/// **Dois sinais, nunca so a cor** (WCAG 2.1 SC 1.4.1): o texto diz que o pet
/// esta sendo procurado, entao quem nao distingue a cor recebe a mesma
/// informacao. O `liveRegion` faz o leitor de tela anunciar a faixa assim que
/// ela aparece, que e o que a acessibilidade da F2.3 exige.
class _FaixaDaTag extends StatelessWidget {
  const _FaixaDaTag({required this.texto, required this.urgente});

  final String texto;
  final bool urgente;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: urgente ? cores.urgency : cores.surfaceAlt,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
        ),
        child: Text(
          texto,
          style: textos.titleLarge?.copyWith(
            color: urgente ? cores.onUrgency : cores.textPrimary,
          ),
        ),
      ),
    );
  }
}

/// O cartao de sinais: o item 3 da F4.1, e o que o 5.4 manda subir no lugar da
/// foto que nao veio.
class _CartaoDeSinais extends StatelessWidget {
  const _CartaoDeSinais({required this.tag});

  final TagResolvida tag;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
      child: Text(
        TelaDoPetDaTag.sinaisDe(tag),
        style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// O cartao de manejo (`care_notes`), com a atribuicao em cima.
///
/// Ausente quando o campo esta vazio; **nunca um cartao vazio** (F4.1, item 4).
class _CartaoDeManejo extends StatelessWidget {
  const _CartaoDeManejo({required this.tag});

  final TagResolvida tag;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            TelaDoPetDaTag.tituloDosCuidadosDe(tag.nomeDoPet),
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TelaDoPetDaTag.atribuicaoDosCuidadosDe(tag.nomeDoPet),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            tag.notasDeCuidado!.trim(),
            style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
          ),
        ],
      ),
    );
  }
}
