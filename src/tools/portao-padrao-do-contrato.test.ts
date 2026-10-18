/**
 * O portao do `default` do contrato contra o contrato real, e contra uma isca
 * por regra. Cada isca e o contrato real com UMA alteracao, feita sobre uma
 * COPIA em memoria -- `api/openapi.yaml` nunca e tocado. Se o portao deixar de
 * acusar qualquer uma, ele deixou de verificar aquilo, e este arquivo reprova
 * dizendo qual.
 *
 * As iscas da regra do TRECHO nao mexem em arquivo nenhum: o portao recebe um
 * leitor injetado, e a isca devolve por ele o conteudo que quiser.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';

import { conferirPadraoDoContrato } from './portao-padrao-do-contrato.js';

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
  const achada = caminhoDe(spec, caminho)[metodo];
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

void describe('portao do default do contrato', () => {
  void it('o contrato real passa, e todo default alcancado esta inventariado', () => {
    const { alcancados, violacoes } = conferirPadraoDoContrato(TEXTO);
    assert.deepEqual(violacoes, []);
    assert.ok(alcancados.length >= 60, `so ${String(alcancados.length)} defaults alcancados`);
  });

  /**
   * A medicao que tornou `useDefaults: false` seguro, presa ao arquivo: corpo
   * e query, com as edicoes separadas das criacoes. Se o contrato ganhar ou
   * perder um `default`, o caso acima ja reprova; este diz em que parte da
   * superficie ele estava.
   */
  void it('a medicao de 18/10: 66 defaults, 25 em corpo e 41 em query, 7 deles em edicao', () => {
    const { alcancados } = conferirPadraoDoContrato(TEXTO);
    assert.equal(alcancados.length, 66);
    assert.equal(alcancados.filter((a) => a.lugar === 'corpo').length, 25);
    assert.equal(alcancados.filter((a) => a.lugar === 'query').length, 41);
    assert.equal(alcancados.filter((a) => a.ehEdicao).length, 7);
    assert.deepEqual(
      [...new Set(alcancados.filter((a) => a.ehEdicao).map((a) => a.operationId))].sort(),
      ['changeAdminNetworkEventAccess', 'updateAdminNetworkEvent', 'updateLostCase', 'updateNetworkEvent'],
    );
  });

  const iscas: readonly { nome: string; regra: RegExp; alterar: (spec: Spec) => void }[] = [
    {
      // A isca central: `default` novo que ninguem inventariou. Depois de
      // `useDefaults: false`, esse campo chega indefinido ao caso de uso.
      nome: 'default novo num corpo de criacao, fora do inventario',
      regra:
        /createAdminStoreTag .*\(corpo\): default fora do inventario \(AdminStoreTagInput\/properties\/sort_order = 0\)/,
      alterar: (s) => void (propriedades(s, 'AdminStoreTagInput')['sort_order'] = { type: 'integer', default: 0 }),
    },
    {
      nome: 'default novo num corpo de PATCH, fora do inventario',
      regra:
        /updateAdminStoreItem .*\(corpo\): default fora do inventario \(AdminStoreItemPatch\/properties\/sort_order = 0\)/,
      alterar: (s) => void (propriedades(s, 'AdminStoreItemPatch')['sort_order'] = { type: 'integer', default: 0 }),
    },
    {
      // Atras de dois `$ref`: sem resolucao transitiva o portao passaria
      // batido, e a trilha da mensagem e o que diz onde mexer.
      nome: 'default atras de dois $ref a partir de um corpo',
      regra:
        /updateAdminStorePartner .*: default fora do inventario \(AdminStorePartnerPatch\/properties\/images -> StoreCatalogImagesInput\/items -> StoreCatalogImageInput\/properties\/alt_text = "x"\)/,
      alterar: (s) => {
        propriedades(s, 'AdminStorePartnerPatch')['images'] = { $ref: '#/components/schemas/StoreCatalogImagesInput' };
        propriedades(s, 'StoreCatalogImageInput')['alt_text'] = { type: 'string', default: 'x' };
      },
    },
    {
      // A superficie que a varredura por corpo nao ve: `useDefaults` tambem
      // preenchia query e parametro.
      nome: 'default novo num parametro de query',
      regra: /listAdminStoreTags .*\(query\): default fora do inventario \(q = "tudo"\)/,
      alterar: (s) => {
        const op = operacao(s, '/admin/store/tags', 'get');
        const params = op['parameters'] as Record<string, unknown>[];
        params.push({ name: 'q', in: 'query', schema: { type: 'string', default: 'tudo' } });
      },
    },
    {
      nome: 'default direto no corpo em linha de uma operacao',
      regra:
        /updateAdminStoreTag .*: default fora do inventario \(updateAdminStoreTag \(corpo em linha\)\/properties\/x = true\)/,
      alterar: (s) => {
        operacao(s, '/admin/store/tags/{tagSlug}', 'patch')['requestBody'] = {
          content: {
            'application/json': { schema: { type: 'object', properties: { x: { type: 'boolean', default: true } } } },
          },
        };
      },
    },
    {
      nome: 'linha do inventario cujo default sumiu do contrato',
      regra: /updateLostCase: no INVENTARIO com a trilha 'LostCaseInput\/properties\/share_to_public_list'/,
      alterar: (s) => void delete campo(s, 'LostCaseInput', 'share_to_public_list')['default'],
    },
    {
      nome: 'linha do inventario cuja operacao saiu do contrato',
      regra: /updateLostCase: no INVENTARIO e o contrato nao declara mais a operacao/,
      alterar: (s) => void delete caminhoDe(s, '/lost-cases/{caseId}')['patch'],
    },
    {
      nome: 'edicao parcial por POST que saiu do contrato',
      regra:
        /changeAdminNetworkEventAccess: listado em EDICOES_PARCIAIS_SERVIDAS_POR_POST e o contrato nao declara mais/,
      alterar: (s) => void delete caminhoDe(s, '/admin/network/events/{eventSlug}/access')['post'],
    },
  ];

  for (const isca of iscas) {
    void it(`isca que precisa reprovar: ${isca.nome}`, () => {
      const { violacoes } = conferirPadraoDoContrato(comAlteracao(isca.alterar));
      assert.ok(
        violacoes.some((v) => isca.regra.test(v)),
        `o portao nao acusou a isca '${isca.nome}'. Violacoes: ${JSON.stringify(violacoes)}`,
      );
    });
  }

  /**
   * A regra que faz o inventario valer mais do que um comentario: o portao
   * ABRE o arquivo e confere o trecho. Tirar o `?? TAMANHO_PADRAO` de uma
   * listagem reprova aqui, e nao em producao.
   */
  void it('isca que precisa reprovar: o codigo perdeu o padrao que o contrato promete', () => {
    const semOPadrao = (p: string): string =>
      readFileSync(resolve(process.cwd(), 'src', p), 'utf8').replaceAll(
        'const limit = query.limit ?? TAMANHO_PADRAO;',
        'const limit = query.limit as number;',
      );
    const { violacoes } = conferirPadraoDoContrato(TEXTO, semOPadrao);
    assert.ok(
      violacoes.some((v) =>
        /listStoreItems \(limit\): src\/modules\/store\/adapters\/http\/store-routes\.ts nao contem mais/.test(v),
      ),
      `o portao nao viu o padrao sumir do codigo. Violacoes: ${JSON.stringify(violacoes)}`,
    );
  });

  void it('isca que precisa reprovar: o arquivo do inventario sumiu', () => {
    const { violacoes } = conferirPadraoDoContrato(TEXTO, () => {
      throw new Error('ENOENT');
    });
    assert.ok(
      violacoes.some((v) => /o INVENTARIO aponta para src\/.*, que nao existe/.test(v)),
      `o portao nao acusou o arquivo sumido. Violacoes: ${JSON.stringify(violacoes)}`,
    );
  });

  void it('exemplo nao e default: `example` com default dentro nao reprova', () => {
    const texto = comAlteracao((s) => {
      propriedades(s, 'AdminStoreItemPatch')['name'] = {
        type: 'string',
        example: { default: 'isto e um exemplo, nao um default injetavel' },
      };
    });
    assert.deepEqual(conferirPadraoDoContrato(texto).violacoes, []);
  });

  void it('laco de $ref nao trava a varredura', () => {
    const texto = comAlteracao((s) => {
      s.components.schemas['IscaCiclo'] = {
        type: 'object',
        properties: { eu: { $ref: '#/components/schemas/IscaCiclo' }, x: { type: 'boolean', default: false } },
      };
      propriedades(s, 'AdminStoreItemPatch')['ciclo'] = { $ref: '#/components/schemas/IscaCiclo' };
    });
    const { violacoes } = conferirPadraoDoContrato(texto);
    assert.ok(
      violacoes.some((v) => /AdminStoreItemPatch\/properties\/ciclo -> IscaCiclo\/properties\/x = false/.test(v)),
      `a varredura nao chegou ao default atras do laco. Violacoes: ${JSON.stringify(violacoes)}`,
    );
  });
});
