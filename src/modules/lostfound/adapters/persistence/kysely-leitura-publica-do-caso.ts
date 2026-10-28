/**
 * Persistência da leitura pública do caso, pelo `share_token`.
 *
 * **Esta consulta não toca `users`.** Telefone, e-mail e endereço do tutor não
 * estão em tabela nenhuma que ela junte, então não há coluna para selecionar por
 * engano. O que ela seleciona é uma lista explícita, e o teste
 * `leitura-publica-do-caso-sem-dado-do-tutor.test.ts` lê o SQL compilado e
 * reprova se `users`, `owner_user_id` como coluna de saída, `id`, `pet_id` ou a
 * coordenada aparecerem na lista.
 *
 * **O dono entra só numa comparação.** `owner_user_id = :chamador` vira o
 * booleano `do_chamador`, calculado no banco. O identificador do tutor não é
 * lido para a aplicação, e com chamador anônimo a comparação nem é montada: o
 * booleano sai como `false` literal.
 *
 * **O token é a credencial**, e por isso não há predicado de dono no `WHERE`:
 * quem tem o link pode ler o caso, inclusive o vizinho que recebeu o alerta
 * (o contrato diz que esta é a operação que ele abre). `share_to_public_list`
 * também não entra: ele decide se o caso aparece na LISTA pública, e não se o
 * link que o tutor compartilhou funciona.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { CasoPublico, LeituraPublicaDoCaso } from '../../ports/leitura-publica-do-caso.js';

/** Pet nesses estados não tem mais caso público, mesmo com o caso aberto. */
const STATUS_DE_PET_SEM_CASO_PUBLICO: readonly string[] = ['deceased', 'archived'];

/**
 * O desfecho que diz que o animal VOLTOU (`StatusDoCaso`).
 *
 * Os outros dois encerramentos -- `closed_not_found` e `closed_false_alarm` --
 * **não** entram, e a separação é o ponto: `closed_not_found` é o caso que
 * terminou sem o animal, e dizer a um estranho que ele voltou seria falso.
 * Mesmo valor que `kysely-listagem-publica-de-perdidos.ts` já usa para o selo
 * `found_by_community`.
 */
const STATUS_DE_CASO_REENCONTRADO = 'closed_reunited';

export function construtorDaLeituraPublicaDoCaso(
  db: DbExecutor,
  shareToken: string,
  chamador: UserId | undefined,
) {
  return db
    .selectFrom('lost_cases')
    .innerJoin('pets', 'pets.id', 'lost_cases.pet_id')
    .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
    .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
    // A foto principal PRONTA, e só a derivada `card`, que é a única que a
    // superfície pública mostra. O índice `pet_photos_uma_principal` garante no
    // máximo uma linha, então a junção não multiplica o caso.
    .leftJoin('pet_photos', (juncao) =>
      juncao
        .onRef('pet_photos.pet_id', '=', 'pets.id')
        .on('pet_photos.is_primary', '=', true)
        .on('pet_photos.status', '=', 'ready')
        .on('pet_photos.deleted_at', 'is', null),
    )
    .select((eb) => [
      'lost_cases.share_token as share_token',
      'lost_cases.status as status',
      'lost_cases.last_seen_at as last_seen_at',
      'lost_cases.last_seen_city as last_seen_city',
      'lost_cases.last_seen_neighborhood as last_seen_neighborhood',
      'lost_cases.description as description',
      'pets.name as name',
      'pets.species_code as species_code',
      'pets.size_code as size_code',
      'pets.breed_free_text as breed_free_text',
      'pets.distinctive_marks as distinctive_marks',
      'pets.care_notes as care_notes',
      'pets.status as pet_status',
      'ref_breeds.label as breed_label',
      'ref_colors.label as color_label',
      'pet_photos.card_key as card_key',
      eb('pets.deleted_at', 'is not', null).as('pet_excluido'),
      chamador === undefined
        ? sql<boolean>`false`.as('do_chamador')
        : eb('lost_cases.owner_user_id', '=', chamador).as('do_chamador'),
    ])
    .where('lost_cases.share_token', '=', shareToken);
}

/**
 * A LINHA da consulta, amarrada ao `select` de
 * [construtorDaLeituraPublicaDoCaso] em vez de escrita à mão.
 *
 * Escrita à mão ela divergiria: coluna removida do `select` continuaria
 * existindo no tipo, e o mapeamento abaixo seguiria compilando contra um campo
 * que a consulta não traz mais.
 */
export type LinhaDoCasoPublico = NonNullable<
  Awaited<ReturnType<ReturnType<typeof construtorDaLeituraPublicaDoCaso>['executeTakeFirst']>>
>;

/**
 * A LINHA vira [CasoPublico]. **Função pura e exportada, e isso é o ponto.**
 *
 * Os cinco motivos do 410 público são cinco ESTADOS DE DADO -- caso encerrado,
 * pet excluído, pet falecido, pet arquivado, e token desconhecido --, e quatro
 * deles são combinações de colunas desta linha. Enquanto o mapeamento morava
 * dentro de `porShareToken`, medir "pet falecido não ganha o agradecimento"
 * exigia subir Postgres, e por isso ninguém media: a regra de decência mais
 * importante desta entrega ficava sem prova barata.
 *
 * Exportada, cada um dos quatro é uma linha de dado e uma asserção, sem banco.
 * O quinto -- token desconhecido -- não tem linha nenhuma, e é justamente por
 * isso que ele não passa por aqui: quem o responde é `porShareToken`,
 * devolvendo `undefined`.
 */
export function casoDaLinha(linha: LinhaDoCasoPublico): CasoPublico {
  // **O MESMO predicado de pet de pé serve aos dois campos**, e não dois
  // parecidos. `aberto` e `reencontrado` respondem a perguntas diferentes
  // sobre o CASO, mas a mesma sobre o ANIMAL: ele existe e não está
  // falecido nem arquivado. Escritos separados, o dia em que um estado novo
  // de pet entrasse em `STATUS_DE_PET_SEM_CASO_PUBLICO` cobriria um e
  // deixaria o outro -- e o que ficaria de fora é justamente o que fala.
  const petDePe =
    linha.pet_excluido !== true && !STATUS_DE_PET_SEM_CASO_PUBLICO.includes(linha.pet_status);

  return {
    shareToken: linha.share_token,
    aberto: linha.status === 'open' && petDePe,
    // **Exige `petDePe`, e essa conjunção é a regra de decência da tela.**
    // Um pet que voltou para casa e depois morreu guarda
    // `status = 'closed_reunited'`, porque o desfecho daquele caso não
    // mudou. Sem este `&&`, quem abrisse o cartaz desse animal leria "ele
    // já foi encontrado, não se preocupe" -- e os quatro motivos que
    // continuam fundidos existem exatamente para isso não acontecer.
    reencontrado: linha.status === STATUS_DE_CASO_REENCONTRADO && petDePe,
    petNome: linha.name,
    especie: linha.species_code,
    porte: linha.size_code,
    // A raça da lista quando há código; o texto do tutor quando não há. Mesma
    // regra de `kysely-tag-repository.ts` (migração 5).
    racaRotulo: linha.breed_label ?? linha.breed_free_text,
    corRotulo: linha.color_label,
    marcas: linha.distinctive_marks,
    cuidados: linha.care_notes,
    descricao: linha.description,
    vistoPorUltimoEm: linha.last_seen_at,
    cidade: linha.last_seen_city,
    bairro: linha.last_seen_neighborhood,
    chaveDaFoto: linha.card_key,
    doChamador: linha.do_chamador === true,
  };
}

export function criarLeituraPublicaDoCaso(db: Db): LeituraPublicaDoCaso {
  return {
    async porShareToken(shareToken, chamador): Promise<CasoPublico | undefined> {
      const linha = await construtorDaLeituraPublicaDoCaso(db, shareToken, chamador).executeTakeFirst();
      // O TOKEN DESCONHECIDO, e ele é o único dos cinco motivos que não chega a
      // [casoDaLinha]: sem linha não há desfecho para consultar, então nenhuma
      // pergunta sobre reencontro é feita a respeito dele.
      if (linha === undefined) return undefined;
      return casoDaLinha(linha);
    },
  };
}
