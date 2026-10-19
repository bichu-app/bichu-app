/**
 * O caso de uso da vitrine passa ao registro o MESMO proposito que assinou.
 *
 * ## O DEFEITO, MEDIDO E NAO SUPOSTO
 *
 * Relato do cliente em 18/10/2026, contra homologacao: *"no perfil do usuario,
 * para subir a foto esta dando erro"*. Medido contra a pilha efemera de
 * integracao, no commit `f8c74714` -- o MESMO que
 * `https://hml.bichu.app/v1/health` reportava -- `POST
 * /v1/me/showcase/photo-intents` devolvia `201` e `PUT /v1/me/showcase`
 * devolvia `404` para a MESMA `upload_id`. Na tabela, a chave era de pessoa
 * (`people/original/...`, o prefixo de `user_showcase`) e a coluna `purpose`
 * dizia `network_event`.
 *
 * Eram DOIS lugares decidindo o proposito: este caso de uso, para assinar, e a
 * funcao de persistencia, com um literal proprio -- e `api.ts` tinha ligado a
 * funcao do ENCONTRO aqui. Agora ha UM valor (`PROPOSITO_DA_VITRINE`), e ele
 * vai para os dois lados.
 *
 * ## O QUE ESTE ARQUIVO MEDE, E POR QUE AQUI
 *
 * So o que e do caso de uso: que o proposito ENTREGUE ao registro e o mesmo que
 * foi ao preparador. O dublê do registro e o ponto de observacao -- com a
 * funcao de verdade, este arquivo importaria `media/adapters`, e a fronteira de
 * modulo (com razao) recusa.
 *
 * Os outros dois pedacos da mesma regra:
 *
 * - `src/modules/media/adapters/persistence/intencao-da-vitrine-grava-o-proposito.test.ts`
 *   -- que a funcao escreve na coluna o proposito que recebeu;
 * - `src/tools/vitrine-ligada-ao-registrador-certo.test.ts` -- a FIACAO de
 *   `api.ts`, que e onde o defeito morava.
 *
 * ## ISCA CONFERIDA
 *
 * Em 18/10/2026, trocando `purpose: PROPOSITO_DA_VITRINE` por
 * `purpose: 'network_event' as typeof PROPOSITO_DA_VITRINE` em
 * `autorizarEnvio`, os dois casos abaixo reprovam pelo nome.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ObjectKey } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { PreparadorDeEnvioDeCatalogo } from '../../media/ports/imagem-de-catalogo.js';
import { comoObjectKey } from '../../media/ports/imagem-de-catalogo.js';
import { PROPOSITO_DA_VITRINE } from '../adapters/persistence/kysely-vitrine.js';
import type { VitrineRepository } from '../ports/vitrine-repository.js';
import { VitrineDeFotos } from './vitrine-de-fotos-service.js';

const DONA = 'a1b2c3d4-0000-7000-8000-000000000001' as UserId;
const UPLOAD = '01a151f1-5d7f-708d-97fb-97d65d8f733c';

interface Medicao {
  /** Os propositos com que a politica foi ASSINADA, na ordem. */
  readonly assinados: string[];
  /** Os propositos que foram ao REGISTRO, na ordem. */
  readonly registrados: string[];
}

async function autorizar(): Promise<Medicao> {
  const assinados: string[] = [];
  const registrados: string[] = [];

  const envios: PreparadorDeEnvioDeCatalogo = {
    preparar: (contentType, _byteSize, proposito) => {
      assinados.push(proposito);
      return Promise.resolve({
        uploadId: UPLOAD,
        // `comoObjectKey` e a UNICA porta da marca (BICHUS-134): `as ObjectKey`
        // aqui prometeria ao compilador uma conferencia que ninguem fez.
        chave: chaveDeTeste(proposito),
        contentType,
        maxBytes: 5_242_880,
        autorizacao: {
          metodo: 'POST',
          url: 'http://objeto.invalido/balde',
          campos: {},
          expiraEm: dataFixa(Number(INSTANTE_FIXO) + 600_000),
          maxBytes: 5_242_880,
        },
      });
    },
  } as PreparadorDeEnvioDeCatalogo;

  /** A vitrine vazia: `listar` serve ao teto de nove, e nada mais. */
  const vitrine = {
    listar: () => Promise.resolve([]),
  } as unknown as VitrineRepository;

  const servico = new VitrineDeFotos({
    envios,
    vitrine,
    registrarIntencao: (_db, nova) => {
      registrados.push(nova.purpose);
      return Promise.resolve();
    },
    // Nenhum caso deste arquivo toca banco: o dublê acima não o usa.
    db: undefined as never,
    clock: relogioParado(INSTANTE_FIXO),
  });

  await servico.autorizarEnvio(DONA, {
    content_type: 'image/jpeg',
    byte_size: 400_000,
    width: 900,
    height: 900,
  });

  return { assinados, registrados };
}

/** A chave que o preparador de verdade produziria para este propósito. */
function chaveDeTeste(proposito: string): ObjectKey {
  return comoObjectKey(`${proposito === PROPOSITO_DA_VITRINE ? 'people' : 'events'}/original/p9Xab`);
}

void describe('a vitrine entrega ao registro o proposito que assinou (defeito de 18/10/2026)', () => {
  void it('ISCA: o proposito REGISTRADO é `user_showcase`', async () => {
    const { registrados } = await autorizar();

    assert.deepEqual(
      registrados,
      [PROPOSITO_DA_VITRINE],
      'a intenção da vitrine precisa ser registrada com o propósito dela. Com outro, ' +
        '`PUT /v1/me/showcase` responde 404 para a `upload_id` que `POST ' +
        '/v1/me/showcase/photo-intents` acabou de emitir -- a confirmação procura o ' +
        'envio com `purpose = user_showcase`, e nenhuma foto é salva.',
    );
  });

  void it('ISCA: o proposito REGISTRADO é o mesmo que ASSINOU a política', async () => {
    const { assinados, registrados } = await autorizar();

    // Esta é a conferência que o defeito teria reprovado: a chave assinada saiu
    // `people/...` (propósito da vitrine) e a linha foi ao banco com
    // `network_event`. Dois lugares decidindo, uma divergência.
    assert.deepEqual(
      registrados,
      assinados,
      'assinar com um propósito e gravar outro é o defeito de 18/10/2026 por inteiro: ' +
        'a política de envio vale para a chave de um prefixo e a linha fica com o ' +
        'propósito de outro destino.',
    );
  });
});
