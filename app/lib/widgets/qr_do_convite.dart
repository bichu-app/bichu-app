import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O QR do **convite de conexão**: o quadrado que outra pessoa escaneia para
/// chegar ao seu perfil com o botão de adicionar.
///
/// ## ESTE QR É DESENHADO NO APARELHO, E O DA PLAQUINHA NÃO — a diferença
///
/// `QrDaPlaquinha` recebe PNG pronto do servidor, e o cabeçalho dela pede, com
/// todas as letras, que ninguém troque aquilo por um gerador local. **Aquele
/// pedido continua valendo**, e este widget não o contraria: a plaquinha
/// continua vindo do servidor, por duas medições que são dela — o leitor do app
/// exige a forma da URL, e a câmera comum do celular abre a página de quem
/// achou o pet.
///
/// Aqui não há PNG para baixar, e não vai haver: `ConnectionInviteIssued`
/// recusa devolver imagem **e** recusa devolver URL, com o motivo escrito —
/// *"devolver URL absoluta amarraria o convite ao domínio do dia"* — e termina
/// dizendo *"quem os monta é a tela"*. Pedir a imagem ao servidor seria pedir
/// que ele monte o endereço que acabou de recusar montar.
///
/// ## O QUE O QUADRADO CARREGA É O TOKEN, E NÃO UMA URL
///
/// A conta inteira está em `telas/escanear/convite_lido_do_qr.dart`, e ela é de
/// quatro medições: o destino do convite exige conta, a página web do convite
/// não existe (e o caminho `/c/` que o rascunho propôs já é da conversa do
/// achador), o app não abre por link (um `intent-filter`, MAIN/LAUNCHER, e
/// `assetlinks.json` vazio), e o servidor recusa montar o endereço.
///
/// Somadas: um QR com URL seria um QR que, lido pela câmera comum, abre um
/// **404** — e o 404 deste site serve um cartão que diz `Esta página não existe
/// no site do Bichu`. Um QR com o token cru, lido pela câmera comum, mostra
/// texto sem sentido, que é um não-evento e não uma afirmação falsa.
///
/// ## AS CORES SÃO PRETO E BRANCO, E ISSO NÃO É FALTA DE TOKEN
///
/// Um QR é um código de barras bidimensional: ele precisa de **contraste
/// máximo** entre módulo e fundo para a câmera de outro aparelho o decodificar
/// em pouca luz, de lado, no reflexo da vitrine. Pintá-lo com a paleta da marca
/// trocaria legibilidade por estética numa superfície cujo único trabalho é ser
/// lida por uma máquina. É a mesma razão pela qual a imagem do servidor também
/// sai em preto e branco.
///
/// O fundo branco é desenhado **por este widget** e não herdado da tela: no
/// tema escuro o fundo da superfície é escuro, e um QR escuro sobre escuro não
/// é lido por nada.
///
/// ## O TOKEN NÃO APARECE POR EXTENSO EM NENHUM LUGAR
///
/// E essa é a diferença em relação à plaquinha, onde o código impresso **é** a
/// alternativa textual. O token é um segredo ao portador de 43 símbolos: lido
/// em voz alta por um leitor de tela ele vaza para quem está ao lado, e digitado
/// à mão erra. O rótulo acessível diz **o que o quadrado é e para que serve**,
/// que é o que alguém que não vê precisa saber para apontar o aparelho de
/// outra pessoa para ele.
class QrDoConvite extends StatelessWidget {
  const QrDoConvite({required this.token, super.key});

  /// O token do convite — o conteúdo do quadrado, e nada mais.
  final String token;

  /// O lado da imagem, **o mesmo de `QrDaPlaquinha`**.
  ///
  /// Um número só para os dois QR do produto: um QR que encolhe de uma tela
  /// para a outra é um QR que a câmera do vizinho pega numa e não pega na
  /// outra.
  static const double lado = 200;

  /// A folga branca ao redor dos módulos.
  ///
  /// **Não é estética e não é zero por economia**: a especificação do QR pede
  /// uma zona silenciosa de quatro módulos, e sem ela o decodificador não acha
  /// a borda do símbolo quando o quadrado encosta em outro elemento da tela.
  static const double folgaSilenciosa = BichuEspaco.e3;

  /// O branco da zona silenciosa e do fundo do simbolo.
  ///
  /// **Cor por funcao optica, e nao cor de estilo** (parágrafo 19.5.1 do design
  /// system): ela e fixada por LEITOR DE MAQUINA, nao por paleta, e por isso e
  /// imune a troca de tinta da marca. Um QR pintado com os papeis do tema
  /// trocaria legibilidade por estetica numa superficie cujo unico trabalho e
  /// ser decodificada.
  ///
  /// **Escrita UMA vez e usada duas**, de propósito: o portao de
  /// `test/a11y/prosa_dos_tokens_test.dart` conta pontos de `Color(0x` em
  /// `app/lib/`, e a prosa de `design/tokens.json` declara quantos existem.
  /// Quatro literais soltos aqui seriam quatro pontos a declarar onde um
  /// conceito basta.
  static const Color brancoDoSimbolo = Color(0xFFFFFFFF);

  /// O preto dos modulos. Mesma classe, mesmo motivo.
  static const Color pretoDosModulos = Color(0xFF000000);

  static const String rotuloAcessivel =
      'QR do seu convite. Quem escanear este código com o Bichu abre o seu '
      'perfil e pode pedir conexão com você.';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Semantics(
      label: rotuloAcessivel,
      image: true,
      child: ExcludeSemantics(
        child: Container(
          width: lado,
          height: lado,
          padding: const EdgeInsets.all(folgaSilenciosa),
          decoration: BoxDecoration(
            // Branco fixo, e não `cores.surface`: ver o cabeçalho. O contorno
            // sim vem do tema, porque ele é moldura e não parte do símbolo.
            color: brancoDoSimbolo,
            borderRadius: BorderRadius.circular(BichuRaio.sm),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: QrImageView(
            data: token,
            version: QrVersions.auto,
            // `gapless: true` fecha as linhas de um pixel entre módulos que
            // alguns decodificadores leem como borda de módulo.
            gapless: true,
            backgroundColor: brancoDoSimbolo,
            eyeStyle: const QrEyeStyle(
              eyeShape: QrEyeShape.square,
              color: pretoDosModulos,
            ),
            dataModuleStyle: const QrDataModuleStyle(
              dataModuleShape: QrDataModuleShape.square,
              color: pretoDosModulos,
            ),
          ),
        ),
      ),
    );
  }
}
