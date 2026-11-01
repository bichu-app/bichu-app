import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';

import { conferirPadraoInjetadoNaEdicao } from './portao-padrao-injetado-na-edicao.js';

const TEXTO = readFileSync(resolve(process.cwd(), 'api/openapi.yaml'), 'utf8');

type Spec = {
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

function comAlteracao(alterar: (spec: Spec) => void): string {
  const spec = parseYaml(TEXTO) as Spec;
  alterar(spec);
  return stringify(spec);
}

function caminhoDe(spec: Spec, caminho: string): Record<string, Record<string, unknown>> {
  const achado = spec.paths[caminho];
  assert.ok(achado !== undefined, `isca aponta para ${caminho}, que o contrato nao tem mais`);
  return achado;
}

function operacao(spec: Spec, caminho: string, metodo: string): Record<string, unknown> {
  const achada = spec.paths[caminho]?.[metodo];
  assert.ok(achada !== undefined, `isca aponta para ${metodo} ${caminho}, que o contrato nao tem mais`);
  return achada;
}

function propriedades(spec: Spec, schema: string): Record<string, Record<string, unknown>> {
  const achado = spec.components.schemas[schema];
  assert.ok(achado !== undefined, `isca aponta para o schema ${schema}, que o contrato nao tem mais`);
  const props = achado['properties'];
  assert.ok(typeof props === 'object' && props !== null, `${schema} nao tem properties`);
  return props as Record<string, Record<string, unknown>>;
}

function campo(spec: Spec, schema: string, nome: string): Record<string, unknown> {
  const achado = propriedades(spec, schema)[nome];
  assert.ok(achado !== undefined, `isca aponta para ${schema}.${nome}, que o contrato nao tem mais`);
  return achado;
}

void describe('portao do padrao injetado na edicao', () => {
  void it('o contrato real passa, e tem edicoes para conferir', () => {
    const { edicoesConferidas, violacoes } = conferirPadraoInjetadoNaEdicao(TEXTO);
    assert.deepEqual(violacoes, []);
    assert.ok(edicoesConferidas >= 5, `so ${String(edicoesConferidas)} edicoes com corpo JSON`);
  });

  void it('a divida de hoje e exatamente a que foi medida, com a trilha ate cada default', () => {
    const { alcancados } = conferirPadraoInjetadoNaEdicao(TEXTO);
    const porOperacao = new Map<string, string[]>();
    for (const a of alcancados) porOperacao.set(a.operationId, [...(porOperacao.get(a.operationId) ?? []), a.trilha]);

    assert.deepEqual(
      [...porOperacao.keys()].sort(),
      ['changeAdminNetworkEventAccess', 'updateAdminNetworkEvent', 'updateLostCase', 'updateNetworkEvent'],
      'mudou o conjunto de edicoes que alcanca default; atualize PADRAO_INJETADO_ACEITO_HOJE no mesmo commit',
    );
    assert.deepEqual(porOperacao.get('updateLostCase'), ['LostCaseInput/properties/share_to_public_list']);
    assert.deepEqual(porOperacao.get('updateNetworkEvent'), [
      'CommunityNetworkEventPatch/properties/accepted_sizes -> NetworkEventAcceptedSizes',
      'CommunityNetworkEventPatch/properties/dog_age -> NetworkEventDogAge',
    ]);
  });

  const iscas: readonly { nome: string; regra: RegExp; alterar: (spec: Spec) => void }[] = [
    {
      nome: 'default novo num corpo de PATCH limpo (AdminStoreItemPatch)',
      regra: /updateAdminStoreItem .*: o corpo da edicao alcanca um default \(AdminStoreItemPatch\/properties\/sort_order = 0\)/,
      alterar: (s) => void (propriedades(s, 'AdminStoreItemPatch')['sort_order'] = { type: 'integer', default: 0 }),
    },
    {
      nome: 'default atras de dois $ref a partir de um corpo de PATCH',
      regra:
        /updateAdminStorePartner .*: o corpo da edicao alcanca um default \(AdminStorePartnerPatch\/properties\/images -> StoreCatalogImagesInput\/items -> StoreCatalogImageInput\/properties\/alt_text = "x"\)/,
      alterar: (s) => {
        propriedades(s, 'AdminStorePartnerPatch')['images'] = { $ref: '#/components/schemas/StoreCatalogImagesInput' };
        propriedades(s, 'StoreCatalogImageInput')['alt_text'] = { type: 'string', default: 'x' };
      },
    },
    {
      nome: 'corpo de PATCH que e um *Input de criacao, com default',
      regra: /updateAdminStoreTag .*: o corpo da edicao alcanca um default \(AdminStoreItemInput\/properties\/sort_order = 0\)/,
      alterar: (s) => {
        const op = operacao(s, '/admin/store/tags/{tagSlug}', 'patch');
        op['requestBody'] = {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminStoreItemInput' } } },
        };
      },
    },
    {
      nome: 'default direto no corpo em linha de um PATCH',
      regra: /updateAdminStoreTag .*: o corpo da edicao alcanca um default \(updateAdminStoreTag \(corpo em linha\)\/properties\/x = true\)/,
      alterar: (s) => {
        const op = operacao(s, '/admin/store/tags/{tagSlug}', 'patch');
        op['requestBody'] = {
          content: {
            'application/json': { schema: { type: 'object', properties: { x: { type: 'boolean', default: true } } } },
          },
        };
      },
    },
    {
      nome: 'linha da divida cujo default sumiu do contrato',
      regra: /updateLostCase: listado em PADRAO_INJETADO_ACEITO_HOJE e o corpo da edicao nao alcanca mais/,
      alterar: (s) => void delete campo(s, 'LostCaseInput', 'share_to_public_list')['default'],
    },
    {
      nome: 'linha da divida cuja operacao saiu do contrato',
      regra: /updateLostCase: listado em PADRAO_INJETADO_ACEITO_HOJE e o contrato nao declara mais/,
      alterar: (s) => void delete caminhoDe(s, '/lost-cases/{caseId}')['patch'],
    },
    {
      nome: 'edicao parcial por POST que saiu do contrato',
      regra: /changeAdminNetworkEventAccess: listado em EDICOES_PARCIAIS_SERVIDAS_POR_POST e o contrato nao declara mais/,
      alterar: (s) => void delete caminhoDe(s, '/admin/network/events/{eventSlug}/access')['post'],
    },
    {
      nome: 'contrato sem nenhuma edicao com corpo',
      regra: /nenhuma operacao de edicao com corpo JSON/,
      alterar: (s) => {
        for (const item of Object.values(s.paths)) delete item['patch'];
        delete caminhoDe(s, '/admin/network/events/{eventSlug}/access')['post'];
      },
    },
  ];

  for (const isca of iscas) {
    void it(`isca que precisa reprovar: ${isca.nome}`, () => {
      const { violacoes } = conferirPadraoInjetadoNaEdicao(comAlteracao(isca.alterar));
      assert.ok(
        violacoes.some((v) => isca.regra.test(v)),
        `o portao nao acusou a isca '${isca.nome}'. Violacoes: ${JSON.stringify(violacoes)}`,
      );
    });
  }

  void it('exemplo nao e default: `example` com default dentro nao reprova', () => {
    const texto = comAlteracao((s) => {
      propriedades(s, 'AdminStoreItemPatch')['name'] = {
        type: 'string',
        example: { default: 'isto e um exemplo, nao um default injetavel' },
      };
    });
    const { violacoes } = conferirPadraoInjetadoNaEdicao(texto);
    assert.deepEqual(violacoes, []);
  });

  void it('laco de $ref nao trava a varredura', () => {
    const texto = comAlteracao((s) => {
      s.components.schemas['IscaCiclo'] = {
        type: 'object',
        properties: { eu: { $ref: '#/components/schemas/IscaCiclo' }, x: { type: 'boolean', default: false } },
      };
      propriedades(s, 'AdminStoreItemPatch')['ciclo'] = { $ref: '#/components/schemas/IscaCiclo' };
    });
    const { violacoes } = conferirPadraoInjetadoNaEdicao(texto);
    assert.ok(
      violacoes.some((v) => /AdminStoreItemPatch\/properties\/ciclo -> IscaCiclo\/properties\/x = false/.test(v)),
      `a varredura nao chegou ao default atras do laco. Violacoes: ${JSON.stringify(violacoes)}`,
    );
  });
});
