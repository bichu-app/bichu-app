/**
 * O disparo do alerta de 5 km (BICHUS-18), do lado do worker.
 *
 * A API enfileira e o worker envia (ADR-0001, e a métrica de arquitetura fala
 * em "da abertura ao último push ENFILEIRADO, ≤ 60 s"). Este arquivo é o outro
 * lado daquela linha: ele recebe um identificador de caso vindo da fila, conta
 * quem alcança, grava quem foi avisado e manda.
 *
 * ## O critério 7 é também a trava de idempotência da fila
 *
 * `podeDispararDeNovo` responde *"o caso não mandou alerta nas últimas 24 h"*.
 * Ele é critério do ADR-0006 e, sem nenhum esforço a mais, é o que impede uma
 * **retentativa da fila** de acordar 500 pessoas duas vezes: a segunda passada
 * lê o `dispatched_at` que a primeira gravou e desiste. Um disparo que ficou
 * `queued` e nunca saiu não bloqueia nada, porque a leitura é de
 * `dispatched_at` e não de `requested_at` — trabalho enfileirado e não feito
 * não gastou o direito de ninguém a ser avisado.
 *
 * ## `unavailable` é o `catch`, e só ele
 *
 * A consulta de alcance não engole exceção (ver o cabeçalho dela). Quem traduz
 * falha em `unavailable` é esta camada, que é a que tem o contexto para
 * registrar o erro junto. É a regra do ADR-0006 num lugar só: *"falha de
 * cálculo não vira zero"* — vira `unavailable` com `recipients_total: null`, e
 * a tela diz que não conseguiu calcular.
 *
 * ## Quem entra em `alert_recipients`, e por quê
 *
 * **Todo mundo que a consulta escolheu**, e não só quem o transporte aceitou.
 * A tabela existe para o teto de fadiga, e o teto de fadiga pergunta "esta
 * pessoa já foi escolhida para três alertas hoje?" — não "três chegaram?".
 * Gravar só as entregas aceitas faria um aparelho desligado render à pessoa
 * alertas extras no dia seguinte, e faria `recipients_total` deixar de ser o
 * número que a tela prometeu. Se a entrega chegou é outra pergunta, e ela já
 * tem dono: `registro-de-entregas.ts`, com o webhook do transporte.
 *
 * É também o que mantém o critério 7 da BICHUS-18 verdadeiro: o número gravado
 * no disparo é `contagemDe` sobre o mesmo alcance que a prévia usou, e não uma
 * terceira contagem feita aqui.
 *
 * ## O que este arquivo não faz
 *
 * Não monta texto de push (é `EntregaDoAlerta`, e do outro lado dela
 * `conteudo-do-push.ts`), não conhece FCM e não lê coordenada de tutor nenhum:
 * `AlcanceCalculado` traz conta e aparelho, e nenhuma distância. É assim que o
 * critério 8 da BICHUS-18 vale por construção — nenhuma coordenada de tutor
 * atravessa esta camada, porque ela não existe no caminho.
 */
import {
  contagemDe,
  podeDispararDeNovo,
  type EstadoDoDisparo,
} from '../domain/disparo-do-alerta.js';
import { RAIO_DO_ALERTA_EM_METROS } from '../domain/previa-do-alcance.js';
import type { AlcanceCalculado, AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { EntregaDoAlerta } from '../ports/entrega-do-alerta.js';
import type { RegistroDeDisparos } from '../ports/registro-de-disparos.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { CaseId, UserId } from '../../../shared/types/brands.js';

/**
 * De onde sai a URL pública da foto.
 *
 * Função e não string porque o hostname de mídia é decisão da composição
 * (ADR-0007: mídia de usuário servida na mesma origem é XSS com acesso à
 * sessão), e uma URL montada aqui carregaria o domínio do dia em que o código
 * foi escrito.
 */
export type UrlDeMidia = (chave: string) => string;

export interface DependenciasDoDisparo {
  readonly disparos: RegistroDeDisparos;
  readonly alcance: AlcanceDoAlerta;
  readonly entrega: EntregaDoAlerta;
  readonly clock: Clock;
  readonly urlDeMidia: UrlDeMidia;
}

/**
 * Por que o disparo não saiu, quando não saiu.
 *
 * Rótulos curtos e estáveis, para contar sem depender de texto — mesma razão do
 * `motivo` de `PushNaoEnviadoError`. Nenhum deles é erro: são desfechos, e o
 * worker completa o trabalho em todos eles em vez de reenfileirar. Reenfileirar
 * "o caso não existe mais" é gastar a fila até alguém olhar.
 */
export type DesfechoDoDisparo =
  /** Rodou. `estado` diz se foi `computed` ou `unavailable`. */
  | { readonly tipo: 'rodou'; readonly estado: EstadoDoDisparo; readonly avisados: number }
  /** O caso sumiu entre o enfileiramento e a execução. */
  | { readonly tipo: 'casoInexistente' }
  /** O caso foi encerrado: o animal voltou, ou a busca acabou. */
  | { readonly tipo: 'casoEncerrado' }
  /** Sem coordenada não há raio. Não é falha de envio e não gera retentativa. */
  | { readonly tipo: 'semCentro' }
  /** O critério 7: este caso já avisou a vizinhança nas últimas 24 h. */
  | { readonly tipo: 'jaDisparou' }
  /** Não há linha de disparo para este caso: nada foi pedido. */
  | { readonly tipo: 'semDisparoPendente' };

export class DisparoDoAlertaService {
  constructor(private readonly deps: DependenciasDoDisparo) {}

  async disparar(caso: CaseId): Promise<DesfechoDoDisparo> {
    const contexto = await this.deps.disparos.contextoDoCaso(caso);
    if (contexto === null) return { tipo: 'casoInexistente' };
    if (!contexto.aberto) return { tipo: 'casoEncerrado' };

    const disparo = await this.deps.disparos.ultimoDoCaso(caso);
    if (disparo === null) return { tipo: 'semDisparoPendente' };

    const agora = this.deps.clock.now();

    // O critério 7 vem ANTES da consulta cara, e a ordem não é estilo: uma
    // retentativa da fila contra um caso que já disparou não deve custar uma
    // varredura geoespacial para descobrir que não vai mandar nada.
    const ultimoEnvio = await this.deps.disparos.ultimoEnvioDoCaso(caso);
    if (!podeDispararDeNovo(ultimoEnvio, agora)) return { tipo: 'jaDisparou' };

    // Não deveria acontecer: um caso sem coordenada nasce `no_location` e não é
    // enfileirado (critério 14). Está aqui porque o worker recebe um
    // identificador e não pode assumir o que o produtor do trabalho fez.
    if (contexto.centro === undefined) return { tipo: 'semCentro' };

    const alcance = await this.calcular({
      centro: contexto.centro,
      raioEmMetros: RAIO_DO_ALERTA_EM_METROS,
      excluir: contexto.tutor,
      agora,
    });

    if (alcance === null) {
      await this.deps.disparos.concluir({
        id: disparo.id,
        estado: 'unavailable',
        tetoAtingido: false,
        avisados: [],
        enviadoEm: agora,
      });
      return { tipo: 'rodou', estado: 'unavailable', avisados: 0 };
    }

    const avisados: UserId[] = alcance.destinatarios.map((d) => d.usuario);

    // **A gravação vem ANTES do envio.** Se o processo morrer no meio do laço,
    // o pior desfecho é um disparo registrado que alcançou menos gente do que
    // diz; o desfecho oposto — mandar e não registrar — faria a retentativa
    // acordar as mesmas pessoas de novo e o teto de fadiga não ter o que
    // contar. Entre um número otimista e um alerta duplicado às três da manhã,
    // o número otimista é o erro barato.
    await this.deps.disparos.concluir({
      id: disparo.id,
      estado: 'computed',
      tetoAtingido: alcance.tetoAtingido,
      avisados,
      enviadoEm: agora,
    });

    const imagemUrl =
      contexto.fotoKey === null ? undefined : this.deps.urlDeMidia(contexto.fotoKey);

    for (const destinatario of alcance.destinatarios) {
      for (const aparelho of destinatario.aparelhos) {
        // Sem `await` numa promessa acumulada e sem `Promise.all`: 500 envios
        // simultâneos contra o transporte é a forma mais rápida de virar cota
        // estourada, e a cota estourada é retentável, então o resultado seria
        // a fila repetindo o alerta inteiro. Um por vez é lento e é o que o
        // TTL de seis horas do aviso comporta.
        await this.deps.entrega.avisar({
          aparelhoId: aparelho,
          nomeDoPet: contexto.nomeDoPet,
          especieCodigo: contexto.especie,
          bairro: contexto.bairro,
          tokenPublico: contexto.tokenPublico,
          imagemUrl,
        });
      }
    }

    return { tipo: 'rodou', estado: 'computed', avisados: contagemDe(alcance) ?? 0 };
  }

  /**
   * A consulta, com a falha traduzida em `null`.
   *
   * O `catch` é aqui e em lugar nenhum abaixo: é esta camada que conhece a
   * diferença entre "o banco não respondeu" e "não há ninguém por perto", e é
   * dela a decisão de chamar isso de `unavailable` em vez de zero.
   */
  private async calcular(consulta: {
    centro: { lat: number; lon: number };
    raioEmMetros: number;
    excluir: UserId;
    agora: ReturnType<Clock['now']>;
  }): Promise<AlcanceCalculado | null> {
    try {
      return await this.deps.alcance.alcancaveis(consulta);
    } catch (erro: unknown) {
      // O erro não some: ele sai no log do worker com o motivo, e o disparo
      // fica `unavailable`. Engolir sem registrar transformaria um defeito de
      // esquema numa métrica que ninguém procura.
      console.error(
        JSON.stringify({ evento: 'alert.reach_failed', erro: String(erro) }),
      );
      return null;
    }
  }
}
