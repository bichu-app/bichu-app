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
  readonly assinados: string[];
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

    assert.deepEqual(
      registrados,
      assinados,
      'assinar com um propósito e gravar outro é o defeito de 18/10/2026 por inteiro: ' +
        'a política de envio vale para a chave de um prefixo e a linha fica com o ' +
        'propósito de outro destino.',
    );
  });
});
