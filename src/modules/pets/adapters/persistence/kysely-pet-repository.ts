/**
 * Persistência do cadastro do pet.
 *
 * **A autorização mora na cláusula `WHERE`**, e não num `if` depois da busca.
 * Todo método que toca um pet específico traz `owner_user_id = :dono` junto de
 * `id = :pet`, e é por isso que a porta exige o dono como argumento: a consulta
 * que devolveria o pet de outro tutor não existe neste arquivo.
 *
 * `deleted_at IS NULL` acompanha todas elas. A exclusão é lógica porque um pet
 * apagado de verdade levaria junto a trilha de auditoria, os avisos do achador
 * e o histórico do caso — e a `FOREIGN KEY ... ON DELETE CASCADE` faria isso em
 * silêncio, no meio de uma transação que ninguém está olhando.
 *
 * `breed_label` é resolvido aqui, no `LEFT JOIN` com `ref_breeds`, e não na
 * aplicação: é o que impede a ficha, o cartaz e o perfil público de repetirem a
 * mesma escolha de três formas ligeiramente diferentes.
 */
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { rotuloDaRaca } from '../../domain/breed.js';
import type {
  CodigosConhecidos,
  DadosDoPet,
  PetGravado,
  PetRepository,
  StatusDoPet,
} from '../../ports/pet-repository.js';
import type { Instant, PetId, UserId } from '../../../../shared/types/brands.js';
import type { TrechoRedigido } from '../../../../shared/redaction/redigir.js';

/** As colunas da leitura do dono, num lugar só: três consultas usam a mesma lista. */
const COLUNAS = [
  'pets.id',
  'pets.name',
  'pets.species_code',
  'pets.breed_code',
  'pets.breed_free_text',
  'pets.ref_data_version',
  'pets.size_code',
  'pets.primary_color_code',
  'pets.secondary_color_code',
  'pets.sex',
  'pets.neutered',
  'pets.birth_date_approx',
  'pets.distinctive_marks',
  'pets.care_notes',
  'pets.care_notes_redactions',
  'pets.microchip_number',
  'pets.sinpatinhas_id',
  'pets.status',
  'pets.slug',
  'pets.public_profile_enabled',
  'pets.created_at',
  'pets.updated_at',
] as const;

interface LinhaDoPet {
  id: string;
  name: string;
  species_code: 'dog' | 'cat' | 'other';
  breed_code: string | null;
  breed_free_text: string | null;
  ref_data_version: string | null;
  size_code: 'P' | 'M' | 'G' | 'GG';
  primary_color_code: string | null;
  secondary_color_code: string | null;
  sex: 'male' | 'female' | 'unknown' | null;
  neutered: boolean | null;
  birth_date_approx: Date | null;
  distinctive_marks: string | null;
  care_notes: string | null;
  care_notes_redactions: TrechoRedigido[];
  microchip_number: string | null;
  sinpatinhas_id: string | null;
  status: StatusDoPet;
  slug: string | null;
  public_profile_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  breed_list_label: string | null;
  active_tag_count: number | string;
  open_case_id: string | null;
}

function comoPet(linha: LinhaDoPet): PetGravado {
  const raca = { breedCode: linha.breed_code, breedFreeText: linha.breed_free_text };
  return {
    id: linha.id as PetId,
    name: linha.name,
    species: linha.species_code,
    breedCode: linha.breed_code,
    breedFreeText: linha.breed_free_text,
    breedLabel: rotuloDaRaca(raca, linha.breed_list_label),
    refDataVersion: linha.ref_data_version,
    size: linha.size_code,
    primaryColorCode: linha.primary_color_code,
    secondaryColorCode: linha.secondary_color_code,
    sex: linha.sex,
    neutered: linha.neutered,
    // `date` do Postgres não tem fuso; recortar os 10 primeiros caracteres do
    // ISO é o que mantém "01/03/2020" sendo 01/03/2020 em São Paulo e em UTC.
    birthDateApprox:
      linha.birth_date_approx === null
        ? null
        : new Date(linha.birth_date_approx).toISOString().slice(0, 10),
    distinctiveMarks: linha.distinctive_marks,
    careNotes: linha.care_notes,
    careNotesRedactions: linha.care_notes_redactions,
    microchipNumber: linha.microchip_number,
    sinpatinhasId: linha.sinpatinhas_id,
    status: linha.status,
    slug: linha.slug,
    publicProfileEnabled: linha.public_profile_enabled,
    activeTagCount: Number(linha.active_tag_count),
    // O CASO ABERTO, lido da consulta e não fixado em nulo.
    //
    // Até 20/10/2026 esta linha era `openCaseId: null`, com o comentário "o caso
    // de perdido chega com o módulo `lostfound`". O módulo chegou; a linha ficou.
    // Consequência MEDIDA na mesma data, contra Postgres de verdade: com um caso
    // `open` no banco, `GET /v1/pets/{petId}` respondia `200` com
    // `"status":"active","open_case_id":null` — e `pets.status` também fica
    // `active`, de propósito (ver o cabeçalho de `kysely-perfil-publico.ts`: o
    // caso aberto é a fonte da verdade sobre "perdido", e abrir um caso não
    // escreve em `pets.status`).
    //
    // Os DOIS campos que o aplicativo lê para saber que o animal está sendo
    // procurado diziam, juntos, que ele não estava. `Encontrei meu pet` — a ação
    // de desmarcar — não era desenhada para nenhum pet, em nenhum estado, porque
    // ela vive no ramo `_jaProcurado` de `tela_detalhe_do_pet.dart`, que é o OU
    // desses dois campos. O servidor encerrava o caso certo (`closeLostCase`
    // medido: `200`, `status: closed_reunited`, `reopen_deadline` a 7 dias); o
    // botão para pedir isso nunca apareceu.
    //
    // Nulo continua sendo o valor de pet sem caso aberto, e o índice único
    // parcial `lost_cases_um_aberto_por_pet` é o que garante que a subconsulta
    // devolve no máximo uma linha.
    openCaseId: linha.open_case_id,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

/**
 * Os valores que a edição grava, **derivados do próprio helper** e não escritos
 * à mão: a primeira versão deste tipo repetia as colunas e já divergiu do
 * schema em `sex` e `neutered`. Separados do construtor porque o `WHERE` é o
 * que está sob verificação, e misturar as duas coisas numa função só faria a
 * isca medir o `set` junto do predicado.
 */
export type ValoresDaAtualizacao = ReturnType<typeof valoresDaAtualizacao>;

/** Os valores da edição, na forma de coluna do banco. */
export function valoresDaAtualizacao(dados: DadosDoPet, quando: Date) {
  return {
    name: dados.name,
    species_code: dados.species,
    breed_code: dados.breedCode,
    breed_free_text: dados.breedFreeText,
    ref_data_version: dados.refDataVersion,
    size_code: dados.size,
    primary_color_code: dados.primaryColorCode,
    secondary_color_code: dados.secondaryColorCode,
    sex: dados.sex,
    neutered: dados.neutered,
    birth_date_approx: dados.birthDateApprox === null ? null : new Date(dados.birthDateApprox),
    distinctive_marks: dados.distinctiveMarks,
    care_notes: dados.careNotes,
    care_notes_redactions: JSON.stringify(dados.careNotesRedactions),
    microchip_number: dados.microchipNumber,
    sinpatinhas_id: dados.sinpatinhasId,
    updated_at: quando,
  };
}

/**
 * ## Os construtores, e por que a autorização passou a sair por eles
 *
 * ADR-0021: a autorização mora na cláusula `WHERE`, e em lugar nenhum além
 * dela. Essa afirmação **não é observável pela resposta da rota** — uma consulta
 * que traz o pet do outro e o descarta num `if` responde igual, até o dia em
 * que alguém mexe no `if`, e aí não existe teste que acuse, porque o `if` era o
 * teste.
 *
 * Até esta branch a afirmação valia por confiança. Cada uma das quatro
 * cláusulas de dono deste arquivo foi removida, uma por vez, e os 967 casos
 * unitários continuaram verdes nas quatro. O comportamento estava correto; o
 * que faltava era a verificação.
 *
 * `construtorD*` existe para que a afirmação seja **verificável**:
 * `autorizacao-na-clausula-where.test.ts` compila o SQL destas funções sem
 * executá-las, exige o predicado do dono ligado ao valor certo, e carrega as
 * iscas que precisam reprovar. É o instrumento da BICHUS-92, com a emenda da
 * BICHUS-237 (a posição `$n` é lida de volta).
 *
 * Eles recebem `DbExecutor` e não `Db` para que o mesmo predicado valha dentro
 * e fora de transação.
 */

/**
 * **A leitura do dono.** Base de `buscarDoTutor`, `listarDoTutor` e da releitura
 * que `criar` faz — três caminhos, um predicado só, de propósito: três cópias
 * seriam três chances de uma delas divergir sem ninguém acusar.
 */
export function construtorDaLeituraDoDono(db: DbExecutor, dono: UserId) {
  return db
    .selectFrom('pets')
    .leftJoin('ref_breeds', (j) =>
      j
        .onRef('ref_breeds.code', '=', 'pets.breed_code')
        .onRef('ref_breeds.species_code', '=', 'pets.species_code'),
    )
    .select((eb) => [
      ...COLUNAS,
      'ref_breeds.label as breed_list_label',
      eb
        .selectFrom('pet_tags')
        .whereRef('pet_tags.pet_id', '=', 'pets.id')
        .where('pet_tags.status', '=', 'active')
        .select(({ fn }) => fn.countAll().as('n'))
        .as('active_tag_count'),
      // `Pet.open_case_id` do contrato, que `comoPet` fixava em nulo.
      //
      // Subconsulta correlacionada e não `LEFT JOIN`: juntar `lost_cases` na
      // consulta base multiplicaria a linha do pet por caso quando um pet tiver
      // histórico de vários encerrados, e `listarDoTutor` passaria a devolver o
      // mesmo animal mais de uma vez. Mesma forma de `active_tag_count`, logo
      // acima, e pelo mesmo motivo.
      //
      // `status = 'open'` é o recorte, e ele é o campo: o contrato chama a coluna
      // `open_case_id`, e o índice único parcial `lost_cases_um_aberto_por_pet`
      // garante no máximo uma linha por pet. Caso ENCERRADO volta a nulo, que é o
      // que `reabrir` e `encerrar` fazem com o estado do caso — nenhum campo de
      // `Pet` aponta para o caso que fechou, e a prosa de `_casoEncerradoAgora`
      // em `tela_detalhe_do_pet.dart` já registra essa limitação.
      //
      // Sem predicado de dono aqui, e a ausência é correta: a correlação é por
      // `pets.id`, e a consulta externa já carrega `pets.owner_user_id = :dono`
      // (ADR-0021). Um caso cujo `owner_user_id` divergisse do dono do pet seria
      // banco inconsistente, e não um vazamento por este caminho.
      eb
        .selectFrom('lost_cases')
        .whereRef('lost_cases.pet_id', '=', 'pets.id')
        .where('lost_cases.status', '=', 'open')
        .select('lost_cases.id')
        .as('open_case_id'),
    ])
    .where('pets.owner_user_id', '=', dono)
    .where('pets.deleted_at', 'is', null);
}

/**
 * A contagem do tutor, que decide o teto de pets por conta.
 *
 * Sem o dono no `WHERE` ela conta os pets do mundo inteiro: a primeira conta a
 * criar um pet bateria no teto, e nenhum caso unitário acusaria.
 */
export function construtorDaContagemDoTutor(db: DbExecutor, dono: UserId) {
  return db
    .selectFrom('pets')
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/**
 * A edição da ficha. O dono é irmão do `id` no mesmo `WHERE`, e não um `if`
 * antes: o `UPDATE` que gravaria na ficha de outro tutor não existe aqui.
 */
export function construtorDaAtualizacao(
  db: DbExecutor,
  pet: PetId,
  dono: UserId,
  valores: ValoresDaAtualizacao,
) {
  return db
    .updateTable('pets')
    .set(valores)
    .where('id', '=', pet)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

/** A exclusão lógica, com o dono no mesmo `WHERE` pelo mesmo motivo. */
export function construtorDaExclusao(db: DbExecutor, pet: PetId, dono: UserId, quando: Instant) {
  return db
    .updateTable('pets')
    .set({ deleted_at: new Date(Number(quando)) })
    .where('id', '=', pet)
    .where('owner_user_id', '=', dono)
    .where('deleted_at', 'is', null);
}

export function criarPetRepository(db: Db): PetRepository {
  /** A leitura do dono, com o rótulo da raça e a contagem de tags ativas. */
  const leituraDoDono = (dono: UserId) => construtorDaLeituraDoDono(db, dono);

  return {
    async contarDoTutor(dono) {
      const linha = await construtorDaContagemDoTutor(db, dono).executeTakeFirstOrThrow();
      return Number(linha.n);
    },

    async conferirCodigos(dados: DadosDoPet): Promise<CodigosConhecidos> {
      const [especie, porte, raca, cor1, cor2, versao] = await Promise.all([
        db.selectFrom('ref_species').select('code').where('code', '=', dados.species).executeTakeFirst(),
        db.selectFrom('ref_sizes').select('code').where('code', '=', dados.size).executeTakeFirst(),
        dados.breedCode === null
          ? Promise.resolve(undefined)
          : db
              .selectFrom('ref_breeds')
              .select('code')
              .where('code', '=', dados.breedCode)
              // A espécie entra na conferência: `ref_breeds` tem chave composta,
              // e "raça que existe, mas de outro animal" é o erro que a FK
              // composta do banco recusaria com um 500.
              .where('species_code', '=', dados.species)
              .executeTakeFirst(),
        dados.primaryColorCode === null
          ? Promise.resolve(undefined)
          : db.selectFrom('ref_colors').select('code').where('code', '=', dados.primaryColorCode).executeTakeFirst(),
        dados.secondaryColorCode === null
          ? Promise.resolve(undefined)
          : db.selectFrom('ref_colors').select('code').where('code', '=', dados.secondaryColorCode).executeTakeFirst(),
        dados.refDataVersion === null
          ? Promise.resolve(undefined)
          : db
              .selectFrom('ref_data_versions')
              .select('version')
              .where('version', '=', dados.refDataVersion)
              .executeTakeFirst(),
      ]);

      // Campo ausente é campo válido: `undefined` por não ter sido consultado e
      // `undefined` por não ter sido achado se distinguem pelo valor de entrada.
      return {
        especieExiste: especie !== undefined,
        porteExiste: porte !== undefined,
        racaExisteNaEspecie: dados.breedCode === null || raca !== undefined,
        corPrimariaExiste: dados.primaryColorCode === null || cor1 !== undefined,
        corSecundariaExiste: dados.secondaryColorCode === null || cor2 !== undefined,
        versaoExiste: dados.refDataVersion === null || versao !== undefined,
      };
    },

    async criar(id, dono, dados) {
      await db
        .insertInto('pets')
        .values({
          id,
          owner_user_id: dono,
          name: dados.name,
          species_code: dados.species,
          breed_code: dados.breedCode,
          breed_free_text: dados.breedFreeText,
          ref_data_version: dados.refDataVersion,
          size_code: dados.size,
          primary_color_code: dados.primaryColorCode,
          secondary_color_code: dados.secondaryColorCode,
          sex: dados.sex,
          neutered: dados.neutered,
          birth_date_approx: dados.birthDateApprox === null ? null : new Date(dados.birthDateApprox),
          distinctive_marks: dados.distinctiveMarks,
          care_notes: dados.careNotes,
          care_notes_redactions: JSON.stringify(dados.careNotesRedactions),
          microchip_number: dados.microchipNumber,
          sinpatinhas_id: dados.sinpatinhasId,
        })
        .execute();

      const criado = await leituraDoDono(dono).where('pets.id', '=', id).executeTakeFirstOrThrow();
      return comoPet(criado as unknown as LinhaDoPet);
    },

    async listarDoTutor(dono) {
      const linhas = await leituraDoDono(dono).orderBy('pets.created_at', 'desc').execute();
      return linhas.map((l) => comoPet(l as unknown as LinhaDoPet));
    },

    async buscarDoTutor(pet, dono) {
      const linha = await leituraDoDono(dono).where('pets.id', '=', pet).executeTakeFirst();
      return linha === undefined ? null : comoPet(linha as unknown as LinhaDoPet);
    },

    async atualizar(pet, dono, dados) {
      const resultado = await construtorDaAtualizacao(
        db,
        pet,
        dono,
        valoresDaAtualizacao(dados, new Date()),
      ).executeTakeFirst();

      if (Number(resultado.numUpdatedRows) === 0) return null;
      return this.buscarDoTutor(pet, dono);
    },

    async excluir(pet: PetId, dono: UserId, quando: Instant) {
      const resultado = await construtorDaExclusao(db, pet, dono, quando).executeTakeFirst();
      return Number(resultado.numUpdatedRows) > 0;
    },
  };
}
