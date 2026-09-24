/**
 * `GET /v1/public/pets/{slug}`, pela borda HTTP (BICHUS-45).
 *
 * ## O teste de não-vazamento
 *
 * Mesmo desenho de `lostfound/adapters/http/leitura-publica-do-caso.test.ts`: o
 * dublê da porta é HOSTIL. Ele devolve o perfil legítimo com o e-mail, o
 * telefone, o endereço e os UUIDs do tutor e do pet como propriedades a mais, e
 * planta os mesmos dados no texto livre (nome, raça digitada, marcas). A
 * resposta passa pelo detector `shared/http/vazamento-publico.ts`, contra as
 * propriedades que `api/openapi.yaml` declara para `PublicPetProfile`, lidas em
 * tempo de execução.
 *
 * A consulta SQL é coberta por
 * `adapters/persistence/perfil-publico-sem-dado-do-tutor.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  achadosDeVazamento,
  propriedadesDeclaradas,
  type ValorPlantado,
} from '../../../../shared/http/vazamento-publico.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type { PerfilPublicoDoPet } from '../../ports/perfil-publico.js';
import { registrarRotaDoPerfilPublico } from './perfil-publico-routes.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa';
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';
const SLUG = 'thor-da-vila';
const EMAIL_DO_TUTOR = 'tutor.privado@exemplo.com';
const TELEFONE_DO_TUTOR = '+55 11 98765-4321';
const ENDERECO_DO_TUTOR = 'Rua das Acácias, 120';

const PLANTADOS: readonly ValorPlantado[] = [
  { rotulo: 'e-mail do tutor', valor: EMAIL_DO_TUTOR },
  { rotulo: 'telefone do tutor', valor: TELEFONE_DO_TUTOR, porDigitos: true },
  { rotulo: 'endereço do tutor', valor: 'Acácias' },
  { rotulo: 'UUID do tutor', valor: TUTOR },
  { rotulo: 'UUID do pet', valor: PET_ID },
];

function perfilHostil(parcial: Partial<PerfilPublicoDoPet> = {}): PerfilPublicoDoPet {
  const legitimo: PerfilPublicoDoPet = {
    slug: SLUG,
    nome: `Thor ${TELEFONE_DO_TUTOR}`,
    especie: 'dog',
    porte: 'M',
    racaRotulo: `SRD, fala com ${EMAIL_DO_TUTOR}`,
    corRotulo: 'Caramelo',
    marcas: `Mora na ${ENDERECO_DO_TUTOR}`,
    chaveDaFoto: 'pets/abc/card/f00d.webp',
    estaPerdido: true,
    ...parcial,
  };
  return {
    ...legitimo,
    id: PET_ID,
    ownerUserId: TUTOR,
    owner_user_id: TUTOR,
    email: EMAIL_DO_TUTOR,
    phone: TELEFONE_DO_TUTOR,
    address: ENDERECO_DO_TUTOR,
    careNotes: `Liga ${TELEFONE_DO_TUTOR}`,
  } as unknown as PerfilPublicoDoPet;
}

function montar(resposta: PerfilPublicoDoPet | undefined): {
  app: RegistradorDeRotas;
  slugs: string[];
} {
  const slugs: string[] = [];
  const app = criarServidor({
    problemBaseUrl: 'https://api.exemplo.invalid/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotaDoPerfilPublico(escopo, {
        perfis: {
          porSlug: (slug) => {
            slugs.push(slug);
            return Promise.resolve(resposta);
          },
        },
        baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, slugs };
}

async function pedir(
  app: RegistradorDeRotas,
  slug: string,
): Promise<{ status: number; tipo: string; corpo: Record<string, unknown>; cabecalhos: Record<string, unknown> }> {
  const resposta = await app.inject({ method: 'GET', url: `/v1/public/pets/${slug}` });
  return {
    status: resposta.statusCode,
    tipo: resposta.headers['content-type']?.toString() ?? '',
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
    cabecalhos: resposta.headers,
  };
}

void describe('não-vazamento: o perfil público não carrega dado do tutor nem id interno', () => {
  void it('getPublicPetBySlug: zero achados', async () => {
    const schema = carregarContrato('api/openapi.yaml').responseSchema('getPublicPetBySlug', '200');
    const resposta = await pedir(montar(perfilHostil()).app, SLUG);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(
      achadosDeVazamento(resposta.corpo, {
        declaradas: propriedadesDeclaradas(schema),
        plantados: PLANTADOS,
      }),
      [],
    );
  });

  void it('o 404 também não carrega nada', async () => {
    const resposta = await pedir(montar(undefined).app, SLUG);
    assert.equal(resposta.status, 404);
    assert.deepEqual(achadosDeVazamento(resposta.corpo, { plantados: PLANTADOS }), []);
  });
});

void describe('getPublicPetBySlug: o que o contrato declara', () => {
  void it('200 com o perfil público', async () => {
    const bancada = montar(perfilHostil({ nome: 'Thor' }));
    const resposta = await pedir(bancada.app, SLUG);
    assert.equal(resposta.status, 200);
    assert.match(resposta.tipo, /^application\/json/);
    assert.equal(resposta.corpo['slug'], SLUG);
    assert.equal(resposta.corpo['display_name'], 'Thor');
    assert.equal(resposta.corpo['is_lost'], true);
    assert.equal(resposta.corpo['photo_url'], 'https://midia.exemplo.invalid/pets/abc/card/f00d.webp');
    assert.deepEqual(bancada.slugs, [SLUG]);
  });

  void it('perfil desligado, excluído ou inexistente: 404 em problem+json', async () => {
    const resposta = await pedir(montar(undefined).app, SLUG);
    assert.equal(resposta.status, 404);
    assert.match(resposta.tipo, /^application\/problem\+json/);
    assert.equal(resposta.corpo['type'], 'https://api.exemplo.invalid/problems/not-found');
  });

  void it('a resposta não fica em cache compartilhado e não é indexada', async () => {
    const resposta = await pedir(montar(perfilHostil()).app, SLUG);
    assert.equal(resposta.cabecalhos['cache-control'], 'no-store');
    assert.equal(resposta.cabecalhos['x-robots-tag'], 'noindex, nofollow');
  });
});
