import 'package:flutter/material.dart';

import '../../api/modelos_pet.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/moldura.dart';

/// A foto e o nome do pet no topo das telas do caso (criterio 1 da BICHUS-21).
///
/// **Ele existe para prevenir um deslize, e nao para decorar.** O criterio diz
/// por que: *"para prevenir o deslize de marcar o pet errado quando ha mais de
/// um"*. Quem esta com tres caes cadastrados e o celular em 11% precisa ver de
/// quem e o caso que esta sendo aberto em cada passo, e nao so na tela em que
/// escolheu.
///
/// **Uma parada de leitor de tela, e uma so.** O nome acessivel traz o nome e
/// os atributos numa frase, na ordem em que a tela le. Sem isto a foto, o nome
/// e a linha de atributos virariam tres paradas no topo de cada uma das tres
/// telas do fluxo.
class CabecalhoDoPet extends StatelessWidget {
  const CabecalhoDoPet({required this.pet, super.key});

  final Pet pet;

  /// A linha de atributos do 11.3, com o mesmo separador.
  static String atributosDe(Pet pet) {
    final partes = <String>[
      pet.especie.rotulo,
      if (pet.racaRotulo != null && pet.racaRotulo!.isNotEmpty) pet.racaRotulo!,
      if (pet.porte != null) pet.porte!.rotulo,
    ];
    return partes.join(' · ');
  }

  static String rotuloAcessivelDe(Pet pet) {
    final partes = <String>[pet.nome, atributosDe(pet)];
    return partes.where((p) => p.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      container: true,
      label: rotuloAcessivelDe(pet),
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          _Foto(pet: pet),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(pet.nome, style: textos.titleLarge),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  atributosDe(pet),
                  style: textos.bodyMedium?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A moldura do cabecalho, nos tres estados que a lista de fato produz.
///
/// `processing` **nao** vira "sem foto", pela mesma razao do cartao: quem
/// acabou de enviar uma foto veria a tela dizer que nao ha nenhuma e
/// desconfiaria do envio.
class _Foto extends StatelessWidget {
  const _Foto({required this.pet});

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
          alignment: const Alignment(0, -1 / 3),
          // Falha de rede cai na moldura vazia. **Esta tela precisa funcionar
          // sem conexao** (criterio 6), e sem conexao a miniatura nao baixa:
          // uma caixa vermelha de excecao no topo diria que o caso nao pode ser
          // aberto, quando ele pode.
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
