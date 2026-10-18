/**
 * O aviso ao TUTOR de que alguem escaneou a plaquinha do pet dele.
 *
 * ## O buraco que esta porta fecha
 *
 * `POST /v1/tags/{code}/found-reports` gravava o aviso, abria a conversa
 * mediada e devolvia `owner_notified: true` -- e **nao enfileirava entrega
 * nenhuma**. O texto do push para este caso existia desde a BICHUS-91
 * (`notifications/domain/conteudo-do-push.ts`, chave `tagEscaneada`) e **nunca
 * teve emissor**: o unico chamador de `montarMensagemDePush` fixava
 * `alertaDeVizinhanca`. `owner_notified` registrava INTENCAO, nao entrega.
 *
 * ## Pelo mesmo caminho do alerta de 5 km, e nao por um segundo
 *
 * A forma e copiada de `network/ports/aviso-de-aprovacao.ts` de proposito: a
 * API **enfileira** na mesma passagem que grava o aviso, e o WORKER entrega.
 * Nao ha envio sincrono dentro da requisicao do achador — quem escaneou a
 * plaquinha espera a resposta de pe, na rua, com o animal no colo, e um
 * provedor de push lento viraria um botao que nao responde no momento mais
 * critico do produto.
 *
 * Regra do payload (§11.5): **identificador, nunca conteudo renderizado.** O
 * trabalho leva o id do aviso e mais nada; quem monta o texto le a linha no
 * instante do envio.
 */
import type { UserId } from '../../../shared/types/brands.js';

/** O tipo do trabalho na fila, o mesmo de `JobKind` (`shared/ports/job-queue.ts`). */
export const TRABALHO_DE_AVISO_AO_TUTOR = 'tag.scan_notify' as const;

/**
 * O que a entrega precisa saber, lido no instante do envio.
 *
 * **Nao ha nada do ACHADOR aqui, e a ausencia e o desenho.** O produto expoe o
 * achador ao tutor dentro da conversa mediada, e so la; um push e superficie
 * publica (o cabecalho de `conteudo-do-push.ts` demonstra as tres razoes) e
 * nao e lugar para nome, recado nem foto de quem achou.
 *
 * Tambem nao ha lugar: nem ponto, nem endereco, nem bairro. O escaneamento da
 * plaquinha nao resolve localizacao neste caminho (`rotuloDaArea: null` em
 * `tag-service.avisar`), e inventar um rotulo aqui seria por na tela de
 * bloqueio um lugar que ninguem mediu.
 */
export interface AvisoAoTutorParaEntrega {
  readonly donoUserId: UserId;
  readonly nomeDoPet: string;
  /** O pet esta marcado como perdido? Muda o texto, e so o texto. */
  readonly casoAberto: boolean;
  /**
   * O `share_token` do caso aberto, quando ha um. **A unica chave que sai**, e
   * a substituicao que o item 6 do ADR-0010 nomeia.
   *
   * Nulo quando o pet nao tem caso aberto — que e justamente o caso mais
   * urgente (o tutor ainda nao sabe de nada). O pet nao tem chave publica
   * opaca propria: `pets.slug` so existe com perfil publico ligado e
   * `pets.id` e UUID interno, que o ADR-0010 proibe em push. Sem caso, o
   * aviso sai sem `ref` — e o toque nao precisa dele, porque o destino
   * escolhido (a secao `Pets`) nao e enderecavel por chave.
   */
  readonly tokenPublicoDoCaso: string | null;
}

export interface LeituraDoAvisoAoTutor {
  /**
   * `null` quando o aviso nao existe mais, nao veio de plaquinha, ou o pet foi
   * excluido: nada a avisar, e isso e desfecho e nao falha.
   */
  avisoDoAchado(foundReportId: string): Promise<AvisoAoTutorParaEntrega | null>;
}

export interface ResultadoDoAvisoAoTutor {
  readonly aceitos: number;
  readonly falhos: number;
  readonly semAparelho: boolean;
}

export interface EntregaDoAvisoAoTutor {
  /** Nao estoura: um aparelho que falha nao pode derrubar o aviso dos outros. */
  avisar(aviso: AvisoAoTutorParaEntrega): Promise<ResultadoDoAvisoAoTutor>;
}

/**
 * O endereco de e-mail do tutor, para a rede de seguranca.
 *
 * Mesma forma de `EmailVerificadoDoChamador` (`transfers`), e o adaptador e o
 * mesmo: `undefined` quando a conta nao tem e-mail verificado ou foi excluida.
 * A porta e declarada aqui porque quem a EXIGE e este caminho (§6).
 */
export interface EnderecoDeEmailDoTutor {
  emailVerificadoDe(conta: UserId): Promise<string | undefined>;
}
