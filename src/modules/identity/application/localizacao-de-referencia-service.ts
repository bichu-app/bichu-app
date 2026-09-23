/**
 * O serviço da localização de referência: gravar, ler e apagar.
 *
 * Ele é fino porque a regra vive em dois lugares melhores — a quantização e a
 * validade no domínio, a autorização na cláusula `WHERE` do repositório. O que
 * sobra aqui é o que só existe quando os dois se juntam:
 *
 * 1. **A quantização acontece antes de gravar, sempre.** O único caminho para
 *    uma `LocalizacaoDeReferencia` é `localizacaoAGravar`, que quantiza. A
 *    coordenada bruta não tem como chegar ao repositório, porque o tipo que ele
 *    aceita não é o tipo que chega do cliente.
 * 2. **O que sai é o que foi gravado**, e não o eco do corpo. O contrato diz
 *    "já quantizada na resposta" em `putMyLocation`; devolver o que veio faria
 *    a tela mostrar uma precisão que o banco não tem, e faria o app acreditar
 *    que guardamos mais do que guardamos.
 * 3. **A trilha registra a mudança e nunca a coordenada.** A porta da auditoria
 *    diz isso por extenso ("nunca registrar ... coordenada bruta"), e aqui há
 *    um motivo a mais: a trilha sobrevive à exclusão da conta de propósito, e
 *    gravar o ponto nela desfaria o direito de apagamento por uma porta
 *    lateral. O que vai no metadado é a ORIGEM e a PRECISÃO.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import {
  localizacaoAGravar,
  type Coordenada,
  type LocalizacaoDeReferencia,
  type OrigemDaLocalizacao,
} from '../domain/localizacao-de-referencia.js';
import type {
  FamiliaDeSessao,
  LocalizacaoDeReferenciaRepository,
} from '../ports/localizacao-de-referencia-repository.js';

export interface ChamadorDaLocalizacao {
  readonly userId: UserId;
  /**
   * SEC-021: a sessão de aparelho de quem está chamando — o `sid` do token de
   * acesso (ADR-0002, emenda 1).
   *
   * **Obrigatório, e a obrigatoriedade é a decisão.** Torná-lo opcional daria
   * um caminho em que a localização é gravada sem dono de aparelho, e essa
   * linha nunca seria apagada por logout nenhum: seria uma coordenada imortal
   * com aparência de linha correta. Quem apresenta um token sem `sid` é
   * recusado na borda, onde a recusa tem um código HTTP.
   */
  readonly familia: FamiliaDeSessao;
  readonly correlationId: string;
  readonly ip?: string | undefined;
}

export interface DependenciasDaLocalizacao {
  readonly repositorio: LocalizacaoDeReferenciaRepository;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class LocalizacaoDeReferenciaService {
  constructor(private readonly deps: DependenciasDaLocalizacao) {}

  /**
   * Grava a localização informada, substituindo a anterior.
   *
   * A origem (`device_gps` ou `map_pin`) é guardada porque ela muda a leitura
   * do alcance: uma base formada só por quem concedeu a permissão de GPS
   * **subestima** quantos tutores seriam alcançáveis (critério 14), e sem a
   * coluna não há como dizer isso no relatório de homologação.
   */
  async informar(
    chamador: ChamadorDaLocalizacao,
    bruta: Coordenada,
    origem: OrigemDaLocalizacao,
  ): Promise<LocalizacaoDeReferencia> {
    const localizacao = localizacaoAGravar(bruta, origem, this.deps.clock.now());
    await this.deps.repositorio.gravar(chamador.userId, chamador.familia, localizacao);
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'privacy.reference_location_set',
      actorUserId: chamador.userId,
      resourceKind: 'user',
      resourceId: chamador.userId,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
      // A FAMÍLIA NÃO ENTRA NO METADADO, e a ausência é deliberada: ela é o
      // identificador da sessão de um aparelho, e a trilha sobrevive à exclusão
      // da conta de propósito. Gravá-la ali guardaria "quantos aparelhos esta
      // pessoa usou, e quando" depois de a conta ter sido apagada, que é a
      // mesma porta lateral que fez a coordenada ficar de fora.
      metadata: { source: origem, precision_m: localizacao.precisaoEmMetros },
    });
    return localizacao;
  }

  /**
   * A localização ainda válida **deste aparelho**, ou `null` quando este
   * aparelho nunca informou uma, ou informou e ela venceu.
   */
  atual(chamador: ChamadorDaLocalizacao): Promise<LocalizacaoDeReferencia | null> {
    return this.deps.repositorio.buscarValida(
      chamador.userId,
      chamador.familia,
      this.deps.clock.now(),
    );
  }

  /**
   * Sai do raio de alerta.
   *
   * Idempotente: apagar o que não existe responde 204, como o contrato manda.
   * Um 404 aqui estaria errado além de ser pior — "não tenho localização
   * gravada" é exatamente o estado que a pessoa pediu.
   *
   * **SEC-021: sai do raio ESTE aparelho, e só ele.** Os outros aparelhos da
   * mesma conta continuam onde estavam. Quem quer sair do raio em toda parte
   * precisa fazer isso em cada aparelho, e essa é a consequência direta de a
   * localização ser do aparelho: um botão num aparelho não decide por outro,
   * pela mesma razão que "Sair" não derruba o celular do marido.
   */
  async esquecer(chamador: ChamadorDaLocalizacao): Promise<void> {
    await this.deps.repositorio.apagar(chamador.userId, chamador.familia);
    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'privacy.reference_location_cleared',
      actorUserId: chamador.userId,
      resourceKind: 'user',
      resourceId: chamador.userId,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });
  }
}
