/**
 * As operações do cadastro do pet.
 *
 * Quatro regras atravessam este arquivo, e nenhuma é preferência de estilo:
 *
 * 1. **`care_notes` é redigido ANTES de gravar.** Telefone, e-mail, endereço e
 *    link saem aqui. Redigir na leitura deixaria o dado em claro em todo backup,
 *    toda réplica e todo log de replicação — e bastaria uma consulta nova,
 *    escrita por quem não conhece a regra, para publicá-lo. **E o tamanho é
 *    conferido depois dela**, porque a marca de remoção é mais longa que o
 *    trecho removido: ver `TETO_DE_CARE_NOTES`.
 * 2. **Pet de outro tutor responde 404, nunca 403.** A porta devolve `null` para
 *    "não existe" e para "não é seu" porque são a mesma resposta: um 403
 *    confirmaria a existência do registro a quem não deveria saber que ele
 *    existe.
 * 3. **A raça é conferida antes da escrita**, para que o erro seja
 *    `validation-failed` com o nome do campo, e não a violação de `CHECK` que o
 *    banco devolveria como 500.
 * 4. **Nada aqui conhece Fastify, Kysely ou relógio de parede.** Tudo entra por
 *    porta, e é o que permite os testes abaixo rodarem sem banco.
 */
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { problemas } from '../../../shared/http/errors.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { conferirRaca } from '../domain/breed.js';
import type { DadosDoPet, PetGravado, PetRepository } from '../ports/pet-repository.js';
import type { PetId, UserId } from '../../../shared/types/brands.js';

/**
 * Teto de pets por conta, como o contrato declara em `PetLimitReached`.
 *
 * O número é alto de propósito: ele existe contra automação, não contra o
 * tutor. Protetor independente com muitos animais é usuário real do produto, e
 * um teto apertado o expulsaria exatamente do caso de uso que o Bichu quer
 * servir. O que contém abuso de verdade é o teto de chamadas por janela.
 */
export const TETO_DE_PETS_POR_CONTA = 20;

/**
 * Teto de `care_notes` **depois da redação**, igual ao `CHECK`
 * `pets_care_notes_tamanho` da migração `20260917000006_pets.sql`
 * (`char_length(care_notes) <= 280`). O contrato declara o mesmo 280 em
 * `PetInput.care_notes`, e a igualdade dos dois é justamente o problema: a
 * redação roda DEPOIS da validação do schema e **cresce** o texto.
 *
 * O número vive aqui, e não é lido do contrato de propósito: quem sabota o
 * `maxLength` do contrato não deve conseguir afrouxar a conferência que
 * protege a coluna.
 */
export const TETO_DE_CARE_NOTES = 280;

export interface DependenciasDePets {
  readonly repositorio: PetRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

/**
 * O que a rota entrega, já normalizado: ainda **sem** redação nem validação.
 *
 * É `DadosDoPet` menos `careNotesRedactions`, e a ausência é o ponto: a lista
 * de trechos retirados é **produzida aqui dentro**, pela redação. Se ela
 * entrasse pela borda, um cliente poderia declarar "nada foi retirado" sobre um
 * texto cheio de telefone, e a tela mostraria a nota como se estivesse limpa.
 */
export type EntradaDoPet = Omit<DadosDoPet, 'careNotesRedactions'>;

export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

export class PetService {
  constructor(private readonly deps: DependenciasDePets) {}

  async criar(entrada: EntradaDoPet, chamador: ContextoDoChamador): Promise<PetGravado> {
    const quantos = await this.deps.repositorio.contarDoTutor(chamador.userId);
    if (quantos >= TETO_DE_PETS_POR_CONTA) throw problemas.tetoDePetsDaConta();

    const dados = await this.prepararEConferir(entrada);
    const id = this.deps.ids.uuidv7() as PetId;
    const pet = await this.deps.repositorio.criar(id, chamador.userId, dados);

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.created',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: pet.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });

    return pet;
  }

  async listar(chamador: ContextoDoChamador): Promise<readonly PetGravado[]> {
    return this.deps.repositorio.listarDoTutor(chamador.userId);
  }

  async buscar(pet: PetId, chamador: ContextoDoChamador): Promise<PetGravado> {
    const achado = await this.deps.repositorio.buscarDoTutor(pet, chamador.userId);
    // `null` cobre "não existe" e "não é seu", e as duas viram 404. Ver a regra
    // 2 no cabeçalho: distinguir as duas confirmaria a existência do registro.
    if (achado === null) throw problemas.naoEncontrado();
    return achado;
  }

  async atualizar(
    pet: PetId,
    entrada: EntradaDoPet,
    chamador: ContextoDoChamador,
  ): Promise<PetGravado> {
    const dados = await this.prepararEConferir(entrada);
    const atualizado = await this.deps.repositorio.atualizar(pet, chamador.userId, dados);
    if (atualizado === null) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.updated',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: atualizado.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });

    return atualizado;
  }

  async excluir(pet: PetId, chamador: ContextoDoChamador): Promise<void> {
    const foi = await this.deps.repositorio.excluir(pet, chamador.userId, this.deps.clock.now());
    if (!foi) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.deleted',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: pet,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });
  }

  /**
   * Redige, confere a raça e confere os códigos — nesta ordem, e a ordem
   * importa: a redação muda o texto que será gravado, e conferir antes dela
   * validaria um valor que não é o que vai para o banco.
   */
  private async prepararEConferir(entrada: EntradaDoPet): Promise<DadosDoPet> {
    const redigido = redigirCanalMediado(entrada.careNotes);

    const problemaDaRaca = conferirRaca({
      breedCode: entrada.breedCode,
      breedFreeText: entrada.breedFreeText,
    });
    if (problemaDaRaca !== null) throw problemaDaRaca === 'codigo_outro_sem_texto'
      ? problemas.validacao([
          { field: 'breed_free_text', code: 'required', message: 'Diga qual é a raça.' },
        ])
      : problemas.validacao([
          {
            field: 'breed_free_text',
            code: 'conflict',
            message: 'Texto livre só com raça "outra". Escolha uma das duas.',
          },
        ]);

    const dados: DadosDoPet = {
      ...entrada,
      careNotes: entrada.careNotes === null ? null : redigido.texto,
      careNotesRedactions: redigido.retirados,
    };

    const conhecidos = await this.deps.repositorio.conferirCodigos(dados);
    const invalidos: { field: string; code: string; message: string }[] = [];
    if (!conhecidos.especieExiste) {
      invalidos.push({ field: 'species', code: 'unknown', message: 'Espécie desconhecida.' });
    }
    if (!conhecidos.porteExiste) {
      invalidos.push({ field: 'size', code: 'unknown', message: 'Porte desconhecido.' });
    }
    if (!conhecidos.racaExisteNaEspecie) {
      // A chave estrangeira composta do banco garante "raça da espécie certa";
      // ela não substitui esta validação, só a torna impossível de furar.
      invalidos.push({ field: 'breed_code', code: 'unknown', message: 'Raça desconhecida para esta espécie.' });
    }
    if (!conhecidos.corPrimariaExiste) {
      invalidos.push({ field: 'primary_color_code', code: 'unknown', message: 'Cor desconhecida.' });
    }
    if (!conhecidos.corSecundariaExiste) {
      invalidos.push({ field: 'secondary_color_code', code: 'unknown', message: 'Cor desconhecida.' });
    }
    if (!conhecidos.versaoExiste) {
      invalidos.push({ field: 'ref_data_version', code: 'unknown', message: 'Versão de lista desconhecida.' });
    }
    // O teto é conferido DEPOIS da redação, e não antes, porque a redação
    // CRESCE o texto: `[telefone removido]` tem 19 caracteres e substitui os 11
    // dígitos de um celular (+8), `[e-mail removido]` tem 17 e substitui
    // `a@b.co` (+11). MEDIDO: nota de 280 caracteres com um celular dentro sai
    // da redação com 288, e era o `CHECK` `pets_care_notes_tamanho` que a
    // recusava — como erro de servidor, que é o desfecho que não diz nada a
    // quem escreveu. O `maxLength: 280` do contrato não cobre isto: ele mede o
    // texto que ENTRA, e quem vai para a coluna é o que SAI da redação.
    //
    // A recusa é 400 com o limite na mensagem, e NÃO um corte: cortar aqui
    // deformaria o texto da pessoa sem ela saber, e `care_notes` é exatamente
    // a frase que alguém vai ler com o animal na mão.
    // `[...texto].length` e nao `texto.length`: o `char_length` do Postgres
    // conta CARACTERES, e `.length` conta unidades UTF-16 — um emoji sozinho
    // responde 2 e faria esta conferencia recusar nota que a coluna aceita.
    if (dados.careNotes !== null && [...dados.careNotes].length > TETO_DE_CARE_NOTES) {
      invalidos.push({
        field: 'care_notes',
        code: 'too_long',
        // Nunca o que foi retirado, pela mesma regra de `hint` em
        // `shared/redaction/redigir.ts`: esta mensagem vai para a tela, para o
        // log e para a trilha.
        message: `A nota passou de ${String(TETO_DE_CARE_NOTES)} caracteres depois de retirarmos os dados de contato. Encurte a nota.`,
      });
    }
    if (invalidos.length > 0) throw problemas.validacao(invalidos);

    return dados;
  }
}
