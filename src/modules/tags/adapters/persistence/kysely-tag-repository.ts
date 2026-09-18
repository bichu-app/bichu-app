/**
 * Persistência das tags.
 *
 * **A consulta de `buscarContextoDoDono` é o artefato principal deste arquivo.**
 * Uma consulta só, com `pet_tags.code_hash` e `pets.owner_user_id` na mesma
 * cláusula `WHERE`. Não há um segundo `select` do pet, e não há comparação de
 * dono em JavaScript: o banco devolve linha ou não devolve, e "não devolve" é o
 * mesmo resultado para código inexistente, revogado e de outro tutor.
 *
 * Feito com duas consultas e um `if`, isto vira o BOLA que o SEC-001 descreve —
 * é o mesmo defeito do par id-no-caminho mais token, e foi registrado como risco
 * médio no ADR-0021 justamente porque a versão errada *parece* certa na revisão.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import type { Instant, PetId, TagId, UserId } from '../../../../shared/types/brands.js';
import type {
  AvisoRecente,
  ContextoDoDono,
  MotivoDeRevogacao,
  NovaTag,
  NovoAviso,
  NovoScan,
  ResultadoDaEmissao,
  StatusDaTag,
  TagDoTutor,
  TagRepository,
  TagResolvida,
} from '../../ports/tag-repository.js';

/** Teto de tags ativas por pet (ADR-0004). */
const TETO_DE_TAGS_ATIVAS = 5;

/** Teto de emissões por pet em 24 h. Emissão em massa é o vetor de abuso da rota. */
const TETO_DE_EMISSOES_POR_DIA = 10;

const JANELA_DE_EMISSAO_EM_MS = 24 * 3600 * 1000;

/**
 * O pet está fora de cena para a rota pública.
 *
 * `deceased` e `archived` respondem 410 pelo mesmo caminho da tag revogada, e
 * com o mesmo texto: o ADR-0004 manda revogar as tags nesses eventos, e enquanto
 * a operação de revogação em cascata não existir, a leitura precisa chegar ao
 * mesmo resultado sozinha. Deixar responder 200 exibiria a ficha de um animal
 * morto a quem escaneou uma plaquinha achada na rua.
 */
const STATUS_INDISPONIVEIS = ['deceased', 'archived'];

interface LinhaDeTagDoTutor {
  id: string;
  status: string;
  code_suffix: string;
  label: string | null;
  scan_count: number;
  last_scanned_at: Date | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  created_at: Date;
}

function comoTagDoTutor(linha: LinhaDeTagDoTutor): TagDoTutor {
  return {
    id: linha.id as TagId,
    status: linha.status as StatusDaTag,
    // `char(4)` volta preenchido com espaço se algo gravar menos de quatro
    // caracteres. O `CHECK` da migração impede, e o corte aqui é a segunda
    // linha: o sufixo vai para a tela do tutor e espaço em branco à direita
    // seria lido como parte do código.
    codeSuffix: linha.code_suffix.trim(),
    label: linha.label,
    scanCount: linha.scan_count,
    lastScannedAt: linha.last_scanned_at,
    revokedAt: linha.revoked_at,
    revocationReason: linha.revocation_reason as MotivoDeRevogacao | null,
    createdAt: linha.created_at,
  };
}

export function criarTagRepository(db: Db): TagRepository {
  return {
    async resolverPorCodigo(codeHash): Promise<TagResolvida | undefined> {
      const linha = await db
        .selectFrom('pet_tags')
        .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
        .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
        .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
        .select([
          'pet_tags.id as tag_id',
          'pet_tags.status as tag_status',
          'pets.id as pet_id',
          'pets.owner_user_id',
          'pets.name',
          'pets.species_code',
          'pets.size_code',
          'pets.breed_free_text',
          'pets.distinctive_marks',
          'pets.care_notes',
          'pets.status as pet_status',
          'pets.deleted_at',
          'ref_breeds.label as breed_label',
          'ref_colors.label as color_label',
        ])
        .where('pet_tags.code_hash', '=', Buffer.from(codeHash))
        .executeTakeFirst();

      if (linha === undefined) return undefined;

      return {
        tagId: linha.tag_id as TagId,
        petId: linha.pet_id as PetId,
        ownerUserId: linha.owner_user_id as UserId,
        status: linha.tag_status,
        petIndisponivel:
          linha.deleted_at !== null || STATUS_INDISPONIVEIS.includes(linha.pet_status),
        pet: {
          displayName: linha.name,
          species: linha.species_code,
          // A raça da lista quando há código; o texto que a pessoa escreveu
          // quando não há. Os dois campos existem justamente porque um cruza e o
          // outro só descreve (migração 5).
          breedLabel: linha.breed_label ?? linha.breed_free_text,
          size: linha.size_code,
          primaryColor: linha.color_label,
          distinctiveMarks: linha.distinctive_marks,
          careNotes: linha.care_notes,
          isLost: linha.pet_status === 'lost',
        },
      };
    },

    /**
     * **A busca vinculada do ADR-0021.** Os dois predicados são irmãos no mesmo
     * `WHERE`, e o `status` ativo está junto deles pelo mesmo motivo: a tag
     * revogada do próprio tutor também é 404 aqui, e quem chama não recebe nada
     * com que pudesse distinguir os casos.
     */
    async buscarContextoDoDono(codeHash, dono): Promise<ContextoDoDono | undefined> {
      const linha = await db
        .selectFrom('pet_tags')
        .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
        .select(['pet_tags.id as tag_id', 'pets.id as pet_id'])
        .where('pet_tags.code_hash', '=', Buffer.from(codeHash))
        .where('pets.owner_user_id', '=', dono)
        .where('pet_tags.status', '=', 'active')
        .where('pets.deleted_at', 'is', null)
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return { petId: linha.pet_id as PetId, tagId: linha.tag_id as TagId };
    },

    async listarTagsDoPet(petId, dono): Promise<readonly TagDoTutor[] | undefined> {
      // O pet é conferido pela mesma consulta que traz as tags: o `innerJoin`
      // com o dono no `WHERE` é o que impede listar plaquinha de pet alheio a
      // partir de um id adivinhado.
      const pet = await db
        .selectFrom('pets')
        .select('id')
        .where('id', '=', petId)
        .where('owner_user_id', '=', dono)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (pet === undefined) return undefined;

      const linhas = await db
        .selectFrom('pet_tags')
        .innerJoin('pets', 'pets.id', 'pet_tags.pet_id')
        .select([
          'pet_tags.id as id',
          'pet_tags.status as status',
          'pet_tags.code_suffix as code_suffix',
          'pet_tags.label as label',
          'pet_tags.scan_count as scan_count',
          'pet_tags.last_scanned_at as last_scanned_at',
          'pet_tags.revoked_at as revoked_at',
          'pet_tags.revocation_reason as revocation_reason',
          'pet_tags.created_at as created_at',
        ])
        .where('pet_tags.pet_id', '=', petId)
        .where('pets.owner_user_id', '=', dono)
        .orderBy('pet_tags.created_at', 'desc')
        .execute();

      return linhas.map(comoTagDoTutor);
    },

    /**
     * Emissão e tetos na **mesma transação**, e os dois `count` com `FOR UPDATE`
     * sobre a linha do pet.
     *
     * Contar fora da transação e inserir depois deixa duas emissões simultâneas
     * passarem pelo teto de cinco, e a janela é grande o bastante para um duplo
     * toque na tela alcançá-la. O bloqueio é na linha do pet porque é ela que
     * define o conjunto que está sendo contado.
     */
    async emitir(nova: NovaTag, dono: UserId, agora: Instant): Promise<ResultadoDaEmissao> {
      return db.transaction().execute(async (trx) => {
        const pet = await trx
          .selectFrom('pets')
          .select('id')
          .where('id', '=', nova.petId)
          .where('owner_user_id', '=', dono)
          .where('deleted_at', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (pet === undefined) return { tipo: 'pet_nao_e_deste_tutor' };

        const ativas = await trx
          .selectFrom('pet_tags')
          .select(({ fn }) => fn.countAll<string>().as('total'))
          .where('pet_id', '=', nova.petId)
          .where('status', '=', 'active')
          .executeTakeFirstOrThrow();
        if (Number(ativas.total) >= TETO_DE_TAGS_ATIVAS) return { tipo: 'teto_de_ativas' };

        const inicioDaJanela = new Date(agora - JANELA_DE_EMISSAO_EM_MS);
        const doDia = await trx
          .selectFrom('pet_tags')
          .select(({ fn }) => fn.countAll<string>().as('total'))
          .where('pet_id', '=', nova.petId)
          .where('created_at', '>=', inicioDaJanela)
          .executeTakeFirstOrThrow();
        if (Number(doDia.total) >= TETO_DE_EMISSOES_POR_DIA) {
          return { tipo: 'teto_diario', retryAfterSeconds: JANELA_DE_EMISSAO_EM_MS / 1000 };
        }

        const linha = await trx
          .insertInto('pet_tags')
          .values({
            id: nova.id,
            pet_id: nova.petId,
            code_hash: Buffer.from(nova.codeHash),
            code_ciphertext: Buffer.from(nova.codeCiphertext),
            code_suffix: nova.codeSuffix,
            label: nova.label,
          })
          .returning([
            'id',
            'status',
            'code_suffix',
            'label',
            'scan_count',
            'last_scanned_at',
            'revoked_at',
            'revocation_reason',
            'created_at',
          ])
          .executeTakeFirstOrThrow();

        return { tipo: 'emitida', tag: comoTagDoTutor(linha) };
      });
    },

    /**
     * O scan e o contador andam juntos.
     *
     * `scan_count` poderia sair de um `count(*)` sobre `tag_scans`, mas a
     * retenção dos scans é de 90 dias: no dia do expurgo o contador da tag
     * andaria para trás sozinho. O contador é cumulativo, a tabela é a
     * evidência recente, e as duas coisas são diferentes.
     */
    async registrarScan(scan: NovoScan): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('tag_scans')
          .values({
            id: scan.id,
            tag_id: scan.tagId,
            ip_hmac: scan.ipHmac === null ? null : Buffer.from(scan.ipHmac),
            user_agent_hash:
              scan.userAgentHash === null ? null : Buffer.from(scan.userAgentHash),
            resulted_in_found_report: scan.resultouEmAviso,
          })
          .execute();

        await trx
          .updateTable('pet_tags')
          .set({
            scan_count: sql<number>`pet_tags.scan_count + 1`,
            last_scanned_at: sql<Date>`now()`,
          })
          .where('id', '=', scan.tagId)
          .execute();
      });
    },

    async registrarAviso(aviso: NovoAviso): Promise<void> {
      await db
        .insertInto('found_reports')
        .values({
          id: aviso.id,
          origin: 'tag_scan',
          tag_id: aviso.tagId,
          pet_id: aviso.petId,
          reporter_user_id: aviso.reporterUserId,
          finder_identity_hash:
            aviso.finderIdentityHash === null ? null : Buffer.from(aviso.finderIdentityHash),
          finder_token_hash: Buffer.from(aviso.finderTokenHash),
          finder_token_expires_at: new Date(aviso.finderTokenExpiresAt),
          found_at: new Date(aviso.foundAt),
          notes: aviso.notes,
        })
        .execute();
    },

    async avisoRecenteDoMesmoAchador(
      tagId,
      finderIdentityHash,
      desde,
    ): Promise<AvisoRecente | undefined> {
      // Sem identidade derivada não há como dizer que é o mesmo achador, e
      // agrupar por "todo mundo sem identidade" juntaria pessoas diferentes num
      // aviso só — que é justamente o que o tutor não pode perder de vista
      // quando há gente em cima do animal dele.
      if (finderIdentityHash === null) return undefined;

      const linha = await db
        .selectFrom('found_reports')
        .select(['id', 'created_at'])
        .where('tag_id', '=', tagId)
        .where('finder_identity_hash', '=', Buffer.from(finderIdentityHash))
        .where('created_at', '>=', new Date(desde))
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (linha === undefined) return undefined;
      return { id: linha.id, criadoEm: linha.created_at };
    },

    async jaAvisouRecentemente(tagId, finderIdentityHash, desde): Promise<boolean> {
      if (finderIdentityHash === null) return false;
      const linha = await db
        .selectFrom('found_reports')
        .select('id')
        .where('tag_id', '=', tagId)
        .where('finder_identity_hash', '=', Buffer.from(finderIdentityHash))
        .where('created_at', '>=', new Date(desde))
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
