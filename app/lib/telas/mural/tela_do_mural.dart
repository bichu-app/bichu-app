import 'package:flutter/material.dart';

import '../casca_com_abas.dart';

/// O corpo da secao `Mural`: **o LUGAR da linha do tempo, e so ele.**
///
/// ## O que esta frente construiu, e o que ela deliberadamente NAO construiu
///
/// Decisao do cliente de 19/10/2026, literal: *"a secao de timeline, onde as
/// publicacoes/notificacoes dos usuarios que ele segue e sao amigos apareca"*
/// e *"o menu onde o usuario vai fazer os posts, compartilhar suas fotos em
/// eventos"*.
///
/// **Esta frente construiu o LUGAR**: o slot na barra de baixo (medido,
/// `Mural` pede 50,90 dp num slot de 64,00), o ramo do `IndexedStack`, a rota
/// [Rotas.mural] e esta tela.
///
/// **Publicar, a linha do tempo, curtir, comentar e seguir sao de OUTRA
/// FRENTE**, que roda em paralelo e cria `user_publications`, o contrato e as
/// operacoes. Nao ha uma linha disso aqui, e a ausencia e o combinado -- duas
/// frentes construindo a mesma tela dao duas telas.
///
/// ## NAO HA ACAO FLUTUANTE NESTA SECAO, e a ausencia e a parte cuidada
///
/// O desenho previa `Publicar` com `Icons.post_add` no canto, como `Rede` tem
/// `Criar evento`. **Ela nao foi desenhada, e nao por esquecimento:** medido
/// nesta arvore, nao existe operacao de publicar. A tabela
/// `user_publications` **nao existe** -- ela aparece so em comentario, em
/// `src/shared/db/schema.ts` (*"SEM chave estrangeira: `user_publications` e
/// de outra fatia e nao existe"*) e em duas linhas da migracao
/// `20261018000032` --, e nao ha rota de linha do tempo nem de publicacao no
/// contrato.
///
/// Um botao de `Publicar` abriria o que? O criterio 2 da BICHUS-62 proibe
/// renderizar acao sem destino, **nem habilitada nem desabilitada**, e e
/// exatamente este caso: um alvo de 56 dp no canto de toda tela do Mural, que
/// nao leva a lugar nenhum. Quem trouxer a operacao de publicar traz a acao
/// com ela, no `acaoDeCriar` de `AbaMural` -- uma linha, no mesmo lugar em que
/// `Rede` tem a sua.
///
/// ## O ESTADO INICIAL E O MESMO COM E SEM CONTA, e isto foi decidido e nao
/// herdado
///
/// **Nao ha `ConviteParaEntrar` aqui**, e a ausencia e a escolha honesta. O
/// convite diz *"Entre para ver X"*, e e verdade em todas as telas que o usam
/// -- `Meus achados`, a area de mensagens, o diretorio: nelas a operacao
/// existe e entrar de fato mostra X. Aqui ela **nao existe**: quem entrasse
/// veria esta mesma caixa. Um convite seria uma porta que cobra uma conta e
/// entrega o mesmo nada, que e pior do que nenhuma porta.
///
/// Por isso a caixa e UMA, nos dois estados de sessao, e ela diz o que a secao
/// vai ser e o que ainda nao esta no ar.
///
/// ## O TEXTO NAO PROMETE AVISO, e isso tambem e medido
///
/// A frase e *"quando alguma publicar, aparece aqui"*, e **nunca** "a gente te
/// avisa": o envio de push esta bloqueado em producao por falta de permissao
/// da conta de servico, a caixa de notificacoes vive em ramo nao mesclado e a
/// rota de contagem nem esta no contrato. O sino esta na barra; o aviso nao
/// esta.
class CorpoDoMural extends StatelessWidget {
  const CorpoDoMural({super.key});

  /// O titulo da caixa do estado inicial. **Publico de proposito**: o portao
  /// o le daqui em vez de guardar uma copia do texto, e portao que guarda
  /// copia de texto fica verde no dia em que o texto muda.
  static const String tituloDoEstadoInicial = 'As publicações ficam aqui';

  /// A explicacao do estado inicial.
  ///
  /// **A segunda frase e a parte honesta**: ela diz que publicar ainda nao
  /// esta no ar, em vez de deixar a pessoa procurar um botao que nao existe.
  /// Estado vazio que esconde a razao de estar vazio e o defeito que
  /// `EstadoVazio` existe para nao repetir.
  static const String explicacaoDoEstadoInicial =
      'Quando as suas conexões publicarem, as publicações aparecem aqui. '
      'Publicar ainda não está no ar.';

  @override
  Widget build(BuildContext context) {
    return const EstadoVazio(
      titulo: tituloDoEstadoInicial,
      explicacao: explicacaoDoEstadoInicial,
      // **SEM ACAO**, e a ausencia esta justificada no cabecalho desta classe:
      // nao ha operacao de publicar nesta arvore, e `EstadoVazio` com uma
      // acao que nao leva a lugar nenhum seria o criterio 2 quebrado dentro
      // do proprio componente que existe para nao quebra-lo.
      acao: null,
    );
  }
}
