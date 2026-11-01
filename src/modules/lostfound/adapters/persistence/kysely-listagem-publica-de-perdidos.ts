import { sql, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { Database, StatusDoPet } from '../../../../shared/db/schema.js';
import {
  DIAS_DO_SELO_DE_REENCONTRO,
  type JanelaDePerdidos,
  type ListagemPublicaDePerdidos,
  type PaginaDePerdidos,
  type PerdidoPublico,
  type RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';

const STATUS_DE_PET_SEM_CASO_PUBLICO: readonly StatusDoPet[] = ['deceased', 'archived'];

const HORAS_DA_JANELA: Readonly<Record<JanelaDePerdidos, number>> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

/**
 * O início da janela, contado do relógio da aplicação e nunca do `now()` do banco:
 * dois relógios na mesma decisão é o defeito que faz teste de carga falhar sozinho
 * em múltiplo comum.
 */
export function inicioDaJanela(agora: Date, janela: JanelaDePerdidos): Date {
  return new Date(agora.getTime() - HORAS_DA_JANELA[janela] * 60 * 60 * 1000);
}

/**
 * O INÍCIO DA JANELA DO SELO: `agora - 30 dias`, e o selo vale para o caso cujo
 * `closed_at` é **maior ou igual** a este instante.
 */
export function inicioDaJanelaDoSelo(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DO_SELO_DE_REENCONTRO * 24 * 60 * 60 * 1000);
}

/** A consulta base: os quatro predicados de publicação e as junções. */
export function construtorDaListagemPublicaDePerdidos(
  db: DbExecutor,
  recorte: RecorteDePerdidos,
) {
  const comAsJuncoes = db
    .selectFrom('lost_cases')
    .innerJoin('pets', 'pets.id', 'lost_cases.pet_id')
    .leftJoin('ref_breeds', 'ref_breeds.code', 'pets.breed_code')
    .leftJoin('ref_colors', 'ref_colors.code', 'pets.primary_color_code')
    .leftJoin('pet_photos', (juncao) =>
      juncao
        .onRef('pet_photos.pet_id', '=', 'pets.id')
        .on('pet_photos.is_primary', '=', true)
        .on('pet_photos.status', '=', 'ready')
        .on('pet_photos.deleted_at', 'is', null),
    );

  const reencontradoNaJanela = (eb: ExpressionBuilder<Database, 'lost_cases'>) =>
    eb.and([
      eb('lost_cases.status', '=', 'closed_reunited'),
      eb('lost_cases.closed_at', '>=', inicioDaJanelaDoSelo(recorte.agora)),
      eb.exists(
        eb
          .selectFrom('conversations')
          .whereRef('conversations.case_id', '=', 'lost_cases.id')
          .select('conversations.id'),
      ),
    ]);

  const comOEstado = (() => {
    switch (recorte.conjunto) {
      case 'aberto':
        return comAsJuncoes.where('lost_cases.status', '=', 'open');
      case 'reencontrado':
        return comAsJuncoes.where(reencontradoNaJanela);
      case 'padrao':
        return comAsJuncoes.where((eb) =>
          eb.or([eb('lost_cases.status', '=', 'open'), reencontradoNaJanela(eb)]),
        );
    }
  })();

  let consulta = comOEstado
    .where('lost_cases.share_to_public_list', '=', true)
    .where(sql<SqlBool>`conta_habilitada(lost_cases.owner_user_id)`)
    .where('pets.deleted_at', 'is', null)
    .where('pets.status', 'not in', STATUS_DE_PET_SEM_CASO_PUBLICO);

  if (recorte.cidade !== undefined) {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_city) = texto_para_busca(${recorte.cidade})`,
    );
  }

  if (recorte.janela !== undefined) {
    consulta = consulta.where(
      'lost_cases.last_seen_at',
      '>=',
      inicioDaJanela(recorte.agora, recorte.janela),
    );
  }

  const bairro = recorte.bairro?.trim();
  if (bairro !== undefined && bairro !== '') {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(lost_cases.last_seen_neighborhood) = texto_para_busca(${bairro})`,
    );
  }
  if (recorte.especie !== undefined) {
    consulta = consulta.where('pets.species_code', '=', recorte.especie);
  }
  if (recorte.porte !== undefined) {
    consulta = consulta.where('pets.size_code', '=', recorte.porte);
  }
  const termo = recorte.termo?.trim();
  if (termo !== undefined && termo !== '') {
    consulta = consulta.where(
      sql<SqlBool>`texto_para_busca(pets.name) LIKE padrao_de_busca(${termo})`,
    );
  }
  return consulta;
}

export function criarListagemPublicaDePerdidos(db: Db): ListagemPublicaDePerdidos {
  return {
    async listar(recorte: RecorteDePerdidos): Promise<PaginaDePerdidos> {
      const base = construtorDaListagemPublicaDePerdidos(db, recorte);

      const contagem = await base
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      const total = Number(contagem?.total ?? 0);

      const linhas = await base
        .select([
          'lost_cases.share_token as share_token',
          'lost_cases.status as status',
          'lost_cases.last_seen_at as last_seen_at',
          'lost_cases.last_seen_city as last_seen_city',
          'lost_cases.last_seen_neighborhood as last_seen_neighborhood',
          'pets.name as name',
          'pets.species_code as species_code',
          'pets.size_code as size_code',
          'pets.breed_free_text as breed_free_text',
          'ref_breeds.label as breed_label',
          'ref_colors.label as color_label',
          'pet_photos.thumb_key as thumb_key',
        ])
        .orderBy('lost_cases.last_seen_at', 'desc')
        .orderBy('lost_cases.share_token', 'asc')
        .limit(recorte.limite)
        .offset((recorte.pagina - 1) * recorte.limite)
        .execute();

      return {
        total,
        itens: linhas.map(
          (linha): PerdidoPublico => ({
            shareToken: linha.share_token,
            petNome: linha.name,
            especie: linha.species_code,
            porte: linha.size_code,
            racaRotulo: linha.breed_label ?? linha.breed_free_text,
            corRotulo: linha.color_label,
            vistoPorUltimoEm: linha.last_seen_at,
            cidade: linha.last_seen_city,
            bairro: linha.last_seen_neighborhood,
            chaveDaFoto: linha.thumb_key,
            encontradoPelaComunidade: linha.status === 'closed_reunited',
          }),
        ),
      };
    },
  };
}
