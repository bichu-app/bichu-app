import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/fila_offline.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/pets_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';

/// O que a tela do codigo resolvido mostra, e por que ela tem **tres** formas.
///
/// ## Eram duas, e viraram tres por decisao do cliente (18/10/2026)
///
/// O paragrafo que estava aqui dizia "sao duas", e ele estava certo enquanto a
/// unica pergunta era `viewer`. O cliente definiu a dinamica do escanear com
/// estas palavras: *"carrega a pagina do proprio pet. a dinamica e se eu
/// escanear o qr-code abre a pagina do pet. se o tutor marcou como perdido,
/// abre a pagina para o usuario enviar mensagem ao tutor."*
///
/// Isso faz de `lost.is_lost` uma bifurcacao de DESTINO, e nao mais so de
/// faixa: com caso aberto, a tela que o achador precisa e a de falar com o
/// tutor, e nao uma ficha com um botao no fim da rolagem. A terceira forma nao
/// e uma distincao nova de `viewer` -- e a mesma pessoa (quem nao e o dono)
/// diante de um fato diferente do animal.
///
/// ## `viewer` continua com tres valores e duas leituras
///
/// `owner`, `authenticated_other` e `anonymous`, e o contrato diz por escrito
/// que os dois ultimos **veem exatamente a mesma coisa**: a excecao permanente
/// nao distingue quem esta logado (criterio 7 da BICHUS-57). Tratar os tres
/// iguais apagaria o modo dono; distinguir os dois ultimos criaria diferenca
/// que o servidor nao faz.
enum FormaDaTelaDaTag {
  /// `F2.3`: o tutor apontou a camera para a plaquinha do proprio pet.
  ///
  /// **Esta forma e de passagem.** Ela carrega a pagina do pet (`T.1`) assim
  /// que `GET /tags/{code}/owner-context` responde o `pet_id` -- o que o
  /// cliente pediu com as palavras "carrega a pagina do proprio pet". O que se
  /// ve aqui e a ficha enquanto a ida acontece, e ela e o que fica quando
  /// aquela chamada falha.
  modoDono,

  /// `F2.2`: quem escaneou nao e o dono, e **nao ha caso aberto**. E a mesma
  /// peca da `F4.1` da web.
  achouOPet,

  /// Quem escaneou nao e o dono e **o tutor marcou o pet como perdido**.
  ///
  /// A pagina de falar com o tutor: identificacao do animal em cima (quem esta
  /// com o bicho no colo confirma pela cara dele), e a mensagem como a acao
  /// principal, acima dos sinais e do cartao de manejo.
  mensagemAoTutor;

  static FormaDaTelaDaTag de(QuemEscaneou quem, {required bool estaPerdido}) {
    return switch (quem) {
      QuemEscaneou.dono => FormaDaTelaDaTag.modoDono,
      // Os dois caem no caminho do achador **de proposito**, e nao por
      // esquecimento: o caminho conservador serve o achador. O dono que caisse
      // aqui por engano perde uma tela; o achador que caisse no modo dono
      // perde o resgate.
      QuemEscaneou.outroLogado || QuemEscaneou.anonimo => estaPerdido
          ? FormaDaTelaDaTag.mensagemAoTutor
          : FormaDaTelaDaTag.achouOPet,
    };
  }

  /// Se esta forma e a de quem **nao** e o dono, nas duas variantes.
  bool get eDoAchador => this != FormaDaTelaDaTag.modoDono;
}

/// F2.2 e F2.3: o que a pessoa ve depois de o codigo da tag resolver.
///
/// ## O que esta tela **nao** tem, e cada ausencia e decisao
///
/// **O botao `Avisar o tutor` EXISTE, e ele e a razao de a F2.2 existir.** Ele
/// chama `POST /v1/tags/{code}/found-reports` por `TagsApi.avisarOTutor`. Esta
/// tela passou a vida inteira sem ele, e o efeito era o pior possivel: as duas
/// primeiras etapas do laco do produto -- achar o animal, escanear a
/// plaquinha -- funcionavam, e a terceira, avisar o tutor, nao existia. Quem
/// achava o pet chegava aqui e ia embora sem caminho.
///
/// **A operacao nao exige conta**, e essa e a excecao permanente do contrato
/// (`security: [bearerAuth, {}]`). O achador com o bicho no colo nao vai criar
/// cadastro, e o corpo do pedido tambem e opcional: um toque, zero campos.
/// Data e hora sao do servidor.
///
/// **Sem sinal o aviso vai para a fila, e o botao diz que foi para a fila.** O
/// criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao aconteceu, e
/// aqui a mentira seria a mais caro do produto: quem acredita que avisou solta
/// o animal.
///
/// **A foto do achador continua de fora, e a ausencia e do contrato.**
/// `FoundReportFromTagInput` tem `found_at` e `client_note`, e nenhum campo de
/// imagem; a foto entra depois por `PATCH /found-reports/{id}`, que nao tem
/// cliente neste app. O aviso nao depende dela.
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
/// ## A foto, que agora vem -- e o que acontece quando ela nao vem
///
/// **O contrato sempre declarou `pet.photo_url` nesta rota**, e o exemplo de
/// 200 de `resolveTagCode` traz um endereco. Quem mandava `null` era o
/// servidor, numa linha fixa (`tag-routes.ts`) escrita quando o modulo `media`
/// ainda nao existia. Ele existe, a linha caiu, e o cliente achou o defeito
/// pelo sintoma certo: escaneou a plaquinha e a tela abriu **sem a foto do
/// pet**.
///
/// Com foto, ela e o PRIMEIRO elemento depois da faixa, e isso nao e
/// hierarquia de gosto: quem esta com um animal no colo confirma pela cara do
/// bicho antes de ler qualquer linha de sinais.
///
/// **Sem foto, nada muda em relacao ao que estava aqui**: nao ha moldura
/// vazia, nao ha simbolo e nao ha ilustracao. O paragrafo 5.4 do design system
/// decide isso e diz por que, e o motivo e de conversao e nao de estetica:
/// *"uma ilustracao generica no lugar da foto faz o achador duvidar de que e o
/// pet certo"*. No lugar da moldura sobem **o nome em `display-lg` e o cartao
/// de sinais**, que e exatamente a regra que o paragrafo manda aplicar quando
/// nao ha foto.
///
/// `Image.network` e nao a porta de arquivo: este endereco e de um objeto
/// **publico** e nao leva credencial nenhuma, ao contrario do QR do tutor. E
/// por isso tambem que nada aqui precisa de `dart:io` -- o portao de diretivas
/// o proibe dentro de `lib/telas`, e e ele que ja fez uma tela desenhar o
/// caminho do arquivo no lugar da imagem.
class TelaDoPetDaTag extends StatelessWidget {
  const TelaDoPetDaTag({required this.tag, required this.codigo, super.key});

  final TagResolvida tag;

  /// O codigo da plaquinha, **como veio no caminho da rota**.
  ///
  /// Ele nao sai de `TagResolvida`: a resposta publica de `GET /tags/{code}`
  /// nao devolve o codigo, de proposito (ele **e** a credencial). Quem tem o
  /// codigo e quem escaneou, e o endereco `/t/<codigo>` o carrega -- que e
  /// exatamente por que a rota existe como endereco e nao como navegacao
  /// imperativa.
  final String codigo;

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
    final forma = FormaDaTelaDaTag.de(
      tag.quemEscaneou,
      estaPerdido: tag.estaPerdido,
    );
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
              // A FOTO, quando ha uma. Ver a secao do cabecalho da classe:
              // sem foto nao entra moldura nenhuma, e o nome em `display-lg`
              // continua sendo o que sobe no lugar dela (5.4).
              ..._foto(tag),
              Text(
                switch (forma) {
                  // O dono ja sabe de quem e a tag: a faixa acabou de dizer.
                  // Repetir "Este e o Thor" acima dela seria a mesma frase duas
                  // vezes no topo da tela.
                  FormaDaTelaDaTag.modoDono => tag.nomeDoPet,
                  FormaDaTelaDaTag.achouOPet ||
                  FormaDaTelaDaTag.mensagemAoTutor => tituloDoAchadorDe(
                    tag.nomeDoPet,
                  ),
                },
                // `display-lg`: o tamanho que o 5.4 manda usar no lugar da foto
                // que nao veio.
                style: Theme.of(context).textTheme.displayLarge
                    ?.copyWith(color: cores.textPrimary),
              ),
              // A MENSAGEM AO TUTOR SOBE PARA CA quando ha caso aberto, e a
              // posicao e a decisao do cliente de 18/10: a tela de um pet
              // perdido e a tela de falar com o tutor. Acima dela ficam a foto
              // e o nome, que e o que a pessoa com o animal no colo usa para
              // confirmar que e o mesmo bicho; abaixo ficam os sinais e o
              // cartao de manejo, que ela le depois de ter avisado.
              //
              // Antes, o botao era o ULTIMO elemento da rolagem nas duas
              // formas do achador -- depois do cartao de sinais e do de manejo.
              if (forma == FormaDaTelaDaTag.mensagemAoTutor) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _AvisoAoTutor(tag: tag, codigo: codigo, comRecado: true),
              ],
              const SizedBox(height: BichuEspaco.e4),
              _CartaoDeSinais(tag: tag),
              if (_temTexto(tag.notasDeCuidado)) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                _CartaoDeManejo(tag: tag),
              ],
              // O BOTAO DE AVISAR O TUTOR, na forma do achador SEM caso
              // aberto. Com caso aberto ele ja apareceu acima, com o campo de
              // recado -- e ele nunca aparece duas vezes.
              //
              // **No modo dono ele nao aparece, e nao e economia de tela:** o
              // dono avisando a si mesmo geraria um aviso real, gastaria o
              // teto de 1 por `code`+`finder_identity` em 6 h e faria o tutor
              // receber um push de que alguem esta com o proprio pet dele.
              if (forma == FormaDaTelaDaTag.achouOPet) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _AvisoAoTutor(tag: tag, codigo: codigo),
              ],
              // A PORTA DO DONO PARA A PAGINA DO PROPRIO PET.
              //
              // Era aqui que o dono nao tinha acao nenhuma, e foi o que o
              // cliente viu: ele escaneou a coleira do proprio animal e chegou
              // numa tela de leitura, sem caminho para lugar nenhum.
              if (forma == FormaDaTelaDaTag.modoDono) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _PaginaDoPetDoDono(codigo: codigo, nome: tag.nomeDoPet),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// A foto do pet, ou nada.
  ///
  /// Lista vazia e **nao** um quadro vazio: ver a secao do cabecalho. A
  /// decisao de mostrar ou nao e so sobre `photo_url` ter chegado, e nao sobre
  /// quem esta olhando -- o dono tambem reconhece o proprio animal pela foto.
  List<Widget> _foto(TagResolvida tag) {
    final url = tag.fotoUrl;
    if (url == null || url.trim().isEmpty) return const <Widget>[];
    return <Widget>[
      _FotoDoPetDaTag(url: url, nome: tag.nomeDoPet),
      const SizedBox(height: BichuEspaco.e4),
    ];
  }

  List<Widget> _faixa(BuildContext context, FormaDaTelaDaTag forma) {
    final texto = switch (forma) {
      FormaDaTelaDaTag.modoDono =>
        tag.estaPerdido
            ? faixaDeDonoComCasoDe(tag.nomeDoPet, tag.perdidoDesde)
            : faixaDeDonoDe(tag.nomeDoPet),
      // Quem nao e o dono so ve faixa quando **ha** caso aberto -- e com caso
      // aberto a forma JA e `mensagemAoTutor`. Sem caso, a tela do achador
      // comeca pelo nome, como a F4.1.
      FormaDaTelaDaTag.mensagemAoTutor => faixaDePerdidoDe(
        tag.nomeDoPet,
        tag.perdidoDesde,
      ),
      FormaDaTelaDaTag.achouOPet => null,
    };
    if (texto == null) return const <Widget>[];
    return <Widget>[
      _FaixaDaTag(texto: texto, urgente: tag.estaPerdido),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }
}

/// A foto do pet no topo da tela da tag.
///
/// **`larguraFotoLg` e nao a pequena do cabecalho de caso**: la a foto confirma
/// de qual dos pets do tutor e o caso que esta sendo aberto, e um retrato de
/// 56 dp basta; aqui ela e o elemento com que uma pessoa na rua decide se o
/// animal no colo e o da tela.
///
/// **Falha de rede nao vira quadro vazio.** `errorBuilder` devolve nada, e a
/// moldura em `repouso` com filho vazio e um retangulo transparente -- sem
/// borda, sem simbolo e sem ilustracao, que e o que o 5.4 exige. Quem escaneou
/// a plaquinha sem sinal continua vendo o nome, os sinais e o cartao de
/// manejo, que e a informacao que muda o que ela faz nos proximos trinta
/// segundos.
///
/// O nome acessivel diz **de quem e a foto**: `Semantics(image: true)` sem
/// rotulo faria o leitor de tela anunciar "imagem" e nada mais.
class _FotoDoPetDaTag extends StatelessWidget {
  const _FotoDoPetDaTag({required this.url, required this.nome});

  final String url;
  final String nome;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: 'Foto de $nome',
      child: Center(
        child: Moldura(
          largura: BichuMoldura.larguraFotoLg,
          estado: EstadoDaMoldura.repouso,
          filho: Image.network(
            url,
            fit: BoxFit.cover,
            // O mesmo enquadramento do cabecalho do caso: focinho de animal
            // fica acima do centro geometrico da foto.
            alignment: const Alignment(0, -1 / 3),
            errorBuilder: (context, erro, pilha) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
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

/// Em que pe esta o aviso ao tutor.
///
/// **`naFila` e um desfecho, e nao um erro.** Ele existe porque o criterio 2 da
/// BICHUS-31 proibe tela de sucesso para o que nao aconteceu -- e aqui a
/// mentira seria a mais caro do produto inteiro: quem acredita que avisou solta
/// o animal e vai embora.
///
/// `/// Local:` este enum **nao vem do contrato**. Ele descreve o estado de uma
/// tela, e a API nao tem campo correspondente -- `FoundReportCreated` responde
/// `owner_notified`, que e outra pergunta (se o aviso foi agrupado a um
/// recente) e nao substitui esta.
enum _EstadoDoAviso { pronto, enviando, avisado, naFila, falhou }

/// O botao `Avisar o tutor` e os quatro desfechos dele.
///
/// ## Por que ele tem estado proprio, e nao vive na tela
///
/// `TelaDoPetDaTag` e `StatelessWidget` de proposito: ela e uma leitura, e o
/// que ela mostra nao muda depois de montada. O aviso e a unica parte que muda,
/// e por isso ele e o unico pedaco com estado. Tornar a tela inteira
/// `StatefulWidget` por causa de um botao reconstruiria o cartao de sinais e o
/// de manejo a cada toque.
///
/// ## A chave de idempotencia nasce UMA vez, no `initState`
///
/// **Nao no `onPressed`, e essa e a parte que se erra.** Se ela nascesse no
/// toque, a pessoa que toca, ve `Está demorando` e toca de novo mandaria duas
/// chaves diferentes -- e o servidor, corretamente, trataria os dois pedidos
/// como avisos distintos. O tutor receberia dois pushes do mesmo achador. A
/// chave e da ACAO ("este achador esta avisando sobre esta plaquinha"), e nao
/// da tentativa; e e a mesma que vai para a fila quando a rede cai.
class _AvisoAoTutor extends StatefulWidget {
  const _AvisoAoTutor({
    required this.tag,
    required this.codigo,
    this.comRecado = false,
  });

  final TagResolvida tag;
  final String codigo;

  /// Se o campo de RECADO entra, e com ele o rotulo de "enviar mensagem".
  ///
  /// Verdadeiro na forma [FormaDaTelaDaTag.mensagemAoTutor], que e a pagina de
  /// falar com o tutor de um pet perdido. O campo vira `client_note` no corpo
  /// de `POST /tags/{code}/found-reports` -- ele **ja esta no contrato**
  /// (`FoundReportFromTagInput`, maxLength 500) e nenhum caminho do app o
  /// mandava. A mensagem chega ao tutor dentro da conversa mediada que o
  /// proprio aviso abre, e e por isso que ela nao precisa de rota nova para
  /// SAIR daqui.
  final bool comRecado;

  /// O rotulo do botao, que muda quando este aparelho **ja avisou** nas
  /// ultimas 24 h (`already_notified`).
  ///
  /// Muda o texto e **nao** desabilita: o teto do contrato para
  /// `code`+`finder_identity` e `group_notification`, ou seja, o segundo aviso
  /// e anexado a conversa e nunca descartado. Quem achou o animal de novo, ou
  /// tem algo novo a dizer, precisa poder falar.
  static String rotuloDe(TagResolvida tag, {bool comRecado = false}) {
    if (comRecado) {
      return tag.jaAvisouDesteAparelho
          ? 'Enviar outra mensagem ao tutor'
          : 'Enviar mensagem ao tutor';
    }
    return tag.jaAvisouDesteAparelho ? 'Avisar o tutor de novo' : 'Avisar o tutor';
  }

  /// O titulo do bloco de mensagem, na forma de pet perdido.
  static const String tituloDaMensagem = 'Fale com o tutor';

  /// O rotulo do campo de recado.
  ///
  /// **Opcional em texto, e nao por asterisco** (UX 13): o caminho principal
  /// desta operacao continua sendo um toque e zero campos, e quem esta com o
  /// animal na rua nao pode ser obrigado a redigir nada para avisar.
  static const String rotuloDoRecado = 'Sua mensagem';

  static const String ajudaDoRecado =
      'Conte onde o animal esta e como o tutor pode te encontrar. O endereco '
      'exato nao e necessario.';

  /// O teto do campo, que e o do contrato (`client_note`, maxLength 500).
  static const int limiteDoRecado = 500;

  /// O texto do desfecho bom **quando a entrega saiu**
  /// (`owner_notified: true`).
  ///
  /// Afirma no passado porque, quando esta frase aparece, o servidor respondeu
  /// 201 **e** disse que a entrega ao tutor foi enfileirada.
  static const String textoDeAvisado =
      'O tutor foi avisado. Ele recebeu o aviso no celular agora.';

  /// O texto do desfecho bom **quando a entrega NAO saiu**
  /// (`owner_notified: false`).
  ///
  /// Este texto nasceu em 18/10/2026, e o motivo e o defeito que ele fecha. A
  /// tela mostrava [textoDeAvisado] sempre -- inclusive com
  /// `owner_notified: false` --, e o comentario que estava aqui dizia, com
  /// estas palavras, que o campo "nao muda este texto". Medido: a resposta
  /// devolvia `true` sem nenhuma entrega enfileirada, e a tela afirmava que o
  /// telefone do tutor apitou. Quem acredita que avisou solta o animal e vai
  /// embora.
  ///
  /// O que esta frase afirma e o que de fato aconteceu: o recado esta
  /// registrado no caso do animal, e o tutor o encontra ao abrir o aplicativo.
  /// Ela **nao** diz "talvez" e **nao** diz "falhou" -- nenhuma das duas e
  /// verdade, e as duas fariam a pessoa ir embora.
  static const String textoDeRegistrado =
      'Seu recado esta registrado no caso do animal, e o tutor o ve ao abrir '
      'o Bichu. Se puder, fique por perto.';

  /// O texto de quando o aviso foi para a fila.
  ///
  /// Diz o que aconteceu (ficou guardado) e o que falta (o sinal), e **nao**
  /// diz que o tutor foi avisado.
  static const String textoDaFila =
      'Você está sem sinal. O aviso ficou guardado e sai sozinho quando o '
      'sinal voltar. Se puder, fique por perto do animal.';

  @override
  State<_AvisoAoTutor> createState() => _AvisoAoTutorState();
}

class _AvisoAoTutorState extends State<_AvisoAoTutor> {
  /// A chave da ACAO. Ver o cabecalho da classe.
  final String _chave = ApiClient.novaChaveDeIdempotencia();

  /// O recado que vira `client_note`. Existe tambem quando o campo nao e
  /// desenhado, e ai vai vazio -- um controlador por forma seria dois caminhos
  /// para o mesmo corpo.
  final TextEditingController _recado = TextEditingController();

  _EstadoDoAviso _estado = _EstadoDoAviso.pronto;
  String? _erro;

  /// **Se a ENTREGA ao tutor foi enfileirada**, lido de `owner_notified`.
  ///
  /// Nulo enquanto ninguem avisou, e nulo tambem no desfecho da fila offline
  /// -- la nao houve resposta nenhuma, e inventar um valor aqui seria a
  /// mesma classe de mentira que este campo existe para desfazer.
  bool? _entregaSaiu;

  @override
  void dispose() {
    _recado.dispose();
    super.dispose();
  }

  Future<void> _avisar() async {
    final escopo = Escopo.of(context);
    setState(() {
      _estado = _EstadoDoAviso.enviando;
      _erro = null;
    });

    try {
      final criado = await escopo.tags.avisarOTutor(
        widget.codigo,
        idempotencyKey: _chave,
        recadoDoAchador: widget.comRecado ? _recado.text : null,
      );
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.avisado;
        _entregaSaiu = criado.tutorAvisado;
      });
    } on FalhaDeConexao {
      // A fila, com a MESMA chave. O corpo e o mesmo que a chamada mandaria,
      // montado pela funcao do cliente e nao a mao aqui.
      await escopo.fila.enfileirar(
        AcaoEnfileirada(
          id: ApiClient.novaChaveDeIdempotencia(),
          metodo: 'POST',
          caminho: TagsApi.caminhoDoAviso(widget.codigo),
          // O MESMO corpo que a chamada mandaria, recado incluido: enfileirar
          // sem o texto entregaria ao tutor um aviso mudo, e a pessoa teria
          // digitado para o vazio.
          corpo: TagsApi.corpoDoAviso(
            recadoDoAchador: widget.comRecado ? _recado.text : null,
          ),
          idempotencyKey: _chave,
          criadaEm: DateTime.now(),
        ),
      );
      if (!mounted) return;
      setState(() => _estado = _EstadoDoAviso.naFila);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.falhou;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      // O `catch (FalhaDeChamada)` acima parece exaustivo e nao e: corpo 200
      // fora do contrato estoura `TypeError` dentro de
      // `AvisoDoAchadorCriado.doJson`, e disco cheio estoura no `enfileirar`.
      // Sem este ramo o botao ficaria girando para sempre, com o erro engolido
      // -- que e exatamente o defeito que `registrarFalhaInesperada` existe
      // para acabar.
      registrarFalhaInesperada(erro, pilha, onde: 'aviso ao tutor pela tag');
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.falhou;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return switch (_estado) {
      // **O texto do desfecho sai de `owner_notified`.** Era um unico texto
      // para os dois valores do campo, e enquanto foi, esta tela afirmava que
      // o telefone do tutor apitou sem nada ter sido enfileirado.
      _EstadoDoAviso.avisado => _DesfechoDoAviso(
          texto: _entregaSaiu == true
              ? _AvisoAoTutor.textoDeAvisado
              : _AvisoAoTutor.textoDeRegistrado,
          peso: PesoDaFaixa.informativo,
        ),
      _EstadoDoAviso.naFila => const _DesfechoDoAviso(
          texto: _AvisoAoTutor.textoDaFila,
          peso: PesoDaFaixa.informativo,
        ),
      _EstadoDoAviso.pronto ||
      _EstadoDoAviso.enviando ||
      _EstadoDoAviso.falhou => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_erro != null) ...<Widget>[
              FaixaDeAviso(texto: _erro!),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // O BLOCO DE MENSAGEM, so na pagina de pet perdido.
            if (widget.comRecado) ...<Widget>[
              Text(
                _AvisoAoTutor.tituloDaMensagem,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: BichuColors.of(context).cores.textPrimary,
                    ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              BichuField(
                rotulo: _AvisoAoTutor.rotuloDoRecado,
                controlador: _recado,
                ajuda: _AvisoAoTutor.ajudaDoRecado,
                // **Opcional, e dito no rotulo.** O caminho principal desta
                // operacao e um toque e zero campos; exigir texto faria o
                // aviso depender de alguem conseguir escrever na rua.
                opcional: true,
                limite: _AvisoAoTutor.limiteDoRecado,
                linhas: 4,
                capitalizacao: TextCapitalization.sentences,
                habilitado: _estado != _EstadoDoAviso.enviando,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            BotaoPrimario(
              rotulo: _AvisoAoTutor.rotuloDe(
                widget.tag,
                comRecado: widget.comRecado,
              ),
              carregando: _estado == _EstadoDoAviso.enviando,
              // **Nao desabilita por estado de rede**, e nem enquanto envia o
              // botao perde o rotulo: `BotaoPrimario` trata `carregando`.
              aoTocar: _estado == _EstadoDoAviso.enviando ? null : _avisar,
            ),
          ],
        ),
    };
  }
}

/// O DONO ESCANEOU A PROPRIA PLAQUINHA: carrega a pagina do pet.
///
/// ## O que o cliente pediu, nas palavras dele
///
/// *"carrega a pagina do proprio pet. a dinamica e se eu escanear o qr-code
/// abre a pagina do pet."* O que ele viu antes disso: apontou a camera para a
/// coleira do proprio animal, a tela abriu a ficha, e **nao oferecia acao
/// nenhuma**. Era um beco com informacao bonita dentro.
///
/// ## Por que isto precisou de uma chamada a mais
///
/// A pagina do pet (`T.1`, `Rotas.detalheDoPet`) e enderecada por `pet_id`, e
/// o corpo publico de `GET /tags/{code}` **nao traz `pet_id`** -- de proposito,
/// porque aquela rota tem caminho anonimo e os identificadores internos nao
/// podem viajar nela (ADR-0010 item 6; SEC-001). Quem os tem e
/// `GET /tags/{code}/owner-context`, que exige `bearerAuth`. Ela existia no
/// contrato e no servidor desde sempre, e **nao tinha cliente neste app** --
/// essa ausencia era a razao escrita de o modo dono nao ter acao.
///
/// ## `pushReplacement`, e nao `push`
///
/// A tela da tag e um DESVIO no caminho do dono: ele apontou a camera para
/// saber se a plaquinha responde, e o destino e o pet. Empilhar as duas faria
/// o `Voltar` da pagina do pet cair numa ficha intermediaria que nao e lugar
/// de ninguem. Com a substituicao, voltar da pagina do pet leva de volta ao
/// leitor, que e de onde ele veio.
///
/// ## Quando a chamada falha
///
/// Fica a ficha (que ja diz "Esta tag e de Thor") mais a faixa com o motivo e
/// `Atualizar`. **Nenhum rotulo prometendo uma pagina que nao foi encontrada**:
/// o 404 desta rota cobre codigo inexistente, revogado e de outro tutor, e um
/// botao `Ver a pagina do Thor` que respondesse 404 para sempre seria a acao
/// sem destino que o criterio 2 da BICHUS-62 proibe.
class _PaginaDoPetDoDono extends StatefulWidget {
  const _PaginaDoPetDoDono({required this.codigo, required this.nome});

  final String codigo;
  final String nome;

  /// O que a tela diz enquanto a ida acontece.
  static String carregandoDe(String nome) => 'Abrindo a pagina de $nome...';

  static const String rotuloDeAtualizar = 'Atualizar';

  @override
  State<_PaginaDoPetDoDono> createState() => _PaginaDoPetDoDonoState();
}

class _PaginaDoPetDoDonoState extends State<_PaginaDoPetDoDono> {
  bool _carregando = true;
  String? _erro;

  @override
  void initState() {
    super.initState();
    // Depois do quadro: `initState` roda com a arvore travada, e navegar de
    // dentro dele marca o roteador sujo durante a montagem.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_abrir());
    });
  }

  Future<void> _abrir() async {
    final escopo = Escopo.of(context);
    final navegador = GoRouter.of(context);
    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      final contexto = await escopo.tags.contextoDoDono(widget.codigo);
      if (!mounted) return;
      if (contexto.petId.isEmpty) {
        // Corpo no formato certo e vazio por dentro. Navegar para
        // `/pets/` montaria um endereco que nao e de pet nenhum.
        setState(() {
          _carregando = false;
          _erro = MensagensDeErro.servidorFora;
        });
        return;
      }
      navegador.pushReplacement(Rotas.detalheDoPetDe(contexto.petId));
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      // Corpo 200 fora do contrato estoura dentro de `doJson`, e sem este ramo
      // o bloco ficaria girando para sempre com o erro engolido.
      registrarFalhaInesperada(erro, pilha, onde: 'pagina do pet pela tag');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final erro = _erro;
    if (erro != null) {
      return FaixaDeAviso(
        texto: erro,
        rotuloDaAcao: _PaginaDoPetDoDono.rotuloDeAtualizar,
        aoTocarNaAcao: () => unawaited(_abrir()),
      );
    }
    if (!_carregando) return const SizedBox.shrink();
    // Texto, e nao so um giro: quem escaneou precisa saber que a tela esta
    // indo para algum lugar.
    return Row(
      children: <Widget>[
        const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Text(
            _PaginaDoPetDoDono.carregandoDe(widget.nome),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
        ),
      ],
    );
  }
}

/// O desfecho do aviso, no lugar do botao.
///
/// **Substitui o botao em vez de ficar abaixo dele**, e isso e deliberado: um
/// botao `Avisar o tutor` ainda em pe depois de o aviso sair convida o segundo
/// toque, e o segundo toque com a mesma chave devolve a resposta original --
/// entao a pessoa tocaria e nada mudaria na tela. Botao que nao produz efeito
/// visivel e o formato mais curto de fazer alguem achar que o app travou.
///
/// `liveRegion` porque quem usa leitor de tela precisa ouvir o desfecho sem
/// varrer a tela de novo: o foco estava no botao, e o botao acabou de sumir.
class _DesfechoDoAviso extends StatelessWidget {
  const _DesfechoDoAviso({required this.texto, required this.peso});

  final String texto;
  final PesoDaFaixa peso;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      container: true,
      child: FaixaDeAviso(texto: texto, peso: peso),
    );
  }
}
