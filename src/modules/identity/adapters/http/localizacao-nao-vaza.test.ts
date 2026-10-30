/**
 * A coluna geográfica não atravessa a borda, e a superfície pública não fica mais
 * fina que bairro, cidade e UF.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

import { inspecionarContrato } from '../../../../tools/portao-colunas-que-nao-saem.js';
import {
  ehOperacaoSemConta,
  inspecionarCamposPublicos,
} from '../../../../tools/portao-contrato-publico.js';
import { carregarContrato } from '../../../../shared/http/contract.js';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';

/** `<coluna> geography(Point, 4326)` em qualquer migração, com ou sem espaço. */
const COLUNA_GEOGRAFICA = /^\s*([a-z_][a-z0-9_]*)\s+geography\s*\(\s*Point\s*,\s*4326\s*\)/gim;

/** As colunas `geography` das migrações, lidas do disco. */
function colunasGeograficas(): { readonly nome: string; readonly origem: string }[] {
  const diretorio = 'migrations';
  const achadas: { nome: string; origem: string }[] = [];
  for (const arquivo of readdirSync(diretorio)) {
    if (!arquivo.endsWith('.sql')) continue;
    const conteudo = readFileSync(join(diretorio, arquivo), 'utf8');
    for (const achado of conteudo.matchAll(COLUNA_GEOGRAFICA)) {
      const nome = achado[1];
      if (nome !== undefined) achadas.push({ nome, origem: arquivo });
    }
  }
  return achadas;
}

function spec(): Record<string, unknown> {
  return parseYaml(readFileSync(CAMINHO_DA_SPEC, 'utf8')) as Record<string, unknown>;
}

void describe('o alvo existe, e a ausência dele é reprovação', () => {
  void it('a migração da BICHUS-92 declara uma coluna geography', () => {
    const doTutor = colunasGeograficas().filter((c) => c.origem.includes('localizacao'));
    assert.ok(
      doTutor.length > 0,
      'nenhuma coluna geography na migração da localização do tutor. ' +
        'Ou a coluna sumiu, ou o formato da declaração mudou — nos dois casos este ' +
        'arquivo passaria a aprovar tudo, e é por isso que ele reprova aqui.',
    );
  });

  void it('existe ao menos uma coluna geography no esquema inteiro', () => {
    const todas = colunasGeograficas();
    assert.ok(todas.length >= 3, `esperava lost_cases, professionals e a nova; achei ${String(todas.length)}`);
  });
});

void describe('a coluna geográfica não aparece em resposta nenhuma do contrato', () => {
  void it('zero ocorrências de cada nome de coluna geography, em qualquer operação', () => {
    const nomes = new Set(colunasGeograficas().map((c) => c.nome));
    const achados = inspecionarContrato(spec(), nomes);
    assert.deepEqual(
      achados.map((a) => `${a.onde}: ${a.coluna}`),
      [],
      'uma coluna geográfica entrou no contrato. O ponto existe para CONSULTA, não para exibição.',
    );
  });

  void it('ISCA: a mesma varredura ACUSA quando a coluna está numa resposta', () => {
    const nomes = new Set(colunasGeograficas().map((c) => c.nome));
    const iscaDoContrato = parseYaml(`
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /isca:
    get:
      operationId: iscaQueDeveReprovar
      security:
        - bearerAuth: []
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  ${[...nomes][0] ?? 'reference_point'}: { type: string }
                  inocente: { type: string }
`) as Record<string, unknown>;

    const achados = inspecionarContrato(iscaDoContrato, nomes);
    assert.ok(
      achados.length > 0,
      'a isca passou: a varredura do portão parou de enxergar a coluna em resposta, ' +
        'e a partir daí o caso anterior estaria medindo o silêncio dela',
    );
  });
});

void describe('a granularidade pública para em bairro, cidade e UF', () => {
  void it('nenhuma operação sem conta declara coordenada, distância, raio ou mapa', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const semConta = [...contrato.operacoes.values()].filter(ehOperacaoSemConta);
    assert.ok(semConta.length > 0, 'filtro que não filtra termina verde e ninguém desconfia');

    const achados = inspecionarCamposPublicos(spec(), semConta);
    assert.deepEqual(
      achados.map((a) => `${a.operationId}.${a.campo}`),
      [],
      'a superfície pública passou a dizer onde alguém está com precisão maior que bairro',
    );
  });

  void it('ISCA: o portão público ACUSA os quatro campos finos demais, e deixa passar os três permitidos', () => {
    const iscaPublica = parseYaml(`
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /isca:
    get:
      operationId: iscaDeGranularidade
      security: []
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  neighborhood: { type: string }
                  city: { type: string }
                  state: { type: string }
                  reference_point: { type: string }
                  distance_m: { type: integer }
                  radius_m: { type: integer }
                  map_url: { type: string }
`) as Record<string, unknown>;

    const paths = iscaPublica['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const achados = inspecionarCamposPublicos(iscaPublica, [
      {
        operationId: 'iscaDeGranularidade',
        method: 'get',
        path: '/isca',
        security: [],
        securitySchemes: [],
        effects: [],
        hasRateLimit: false,
        raw: paths['/isca']?.['get'] ?? {},
        parameters: [],
      },
    ]);

    const acusados = new Set(achados.map((a) => a.campo));
    for (const fino of ['reference_point', 'distance_m', 'radius_m', 'map_url']) {
      assert.ok(acusados.has(fino), `a isca passou em \`${fino}\``);
    }
    for (const permitido of ['neighborhood', 'city', 'state']) {
      assert.ok(
        !acusados.has(permitido),
        `o portão reprovou \`${permitido}\`, que é a granularidade PERMITIDA: ` +
          'portão que reprova tudo não distingue nada',
      );
    }
  });
});

/** Critério 6 e ADR-0006: **CEP e bairro não viram coordenada.** */
void describe('CEP e bairro não viram coordenada (critério 6, ADR-0006)', () => {
  const ARQUIVOS_DA_LOCALIZACAO = [
    'src/modules/identity/domain/localizacao-de-referencia.ts',
    'src/modules/identity/application/localizacao-de-referencia-service.ts',
    'src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.ts',
    'src/modules/identity/adapters/http/localizacao-de-referencia-routes.ts',
  ];

  const COLUNAS_DE_TEXTO = [
    'reference_postal_code',
    'reference_neighborhood',
    'reference_city',
    'reference_state',
  ];

  void it('nenhum arquivo da localização lê as colunas de texto de `users`', () => {
    const achados: string[] = [];
    for (const arquivo of ARQUIVOS_DA_LOCALIZACAO) {
      const conteudo = readFileSync(arquivo, 'utf8');
      const semComentarios = conteudo.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
      for (const coluna of COLUNAS_DE_TEXTO) {
        if (semComentarios.includes(coluna)) achados.push(`${arquivo}: ${coluna}`);
      }
    }
    assert.deepEqual(
      achados,
      [],
      'o caminho da localização passou a ler o endereço de cadastro. Texto não vira ' +
        'coordenada sem geocodificação, e ela não existe no MVP (ADR-0006).',
    );
  });

  void it('ISCA: a mesma varredura ACUSA um arquivo que lê a coluna de texto', () => {
    const iscaDeCodigo = `
      export function centroDoTutor(linha: { reference_neighborhood: string }) {
        return geocodificar(linha.reference_neighborhood);
      }
    `;
    const semComentarios = iscaDeCodigo.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
    assert.ok(
      COLUNAS_DE_TEXTO.some((coluna) => semComentarios.includes(coluna)),
      'a varredura passou num arquivo que lê o bairro de cadastro: ela parou de enxergar, ' +
        'e o caso anterior virou silêncio',
    );
  });

  void it('ISCA: a varredura NÃO acusa um comentário que cita a coluna', () => {
    const soComentario = `
      // reference_neighborhood existe e NAO serve como centro: ver ADR-0006.
      export const NADA = 1;
    `;
    const semComentarios = soComentario.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
    assert.ok(
      !COLUNAS_DE_TEXTO.some((coluna) => semComentarios.includes(coluna)),
      'a varredura acusa comentário: ela viraria fonte de achado falso, e é assim que ' +
        'uma conferência perde a confiança de quem a lê',
    );
  });
});

void describe('as rotas que devolvem a coordenada exigem sessão', () => {
  void it('getMyLocation, putMyLocation e deleteMyLocation não são públicas', () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    for (const id of ['getMyLocation', 'putMyLocation', 'deleteMyLocation']) {
      const operacao = contrato.operacoes.get(id);
      assert.ok(operacao !== undefined, `${id} sumiu do contrato`);
      assert.equal(
        ehOperacaoSemConta(operacao),
        false,
        `${id} virou operação sem conta: a coordenada de qualquer pessoa passou a sair ` +
          'para quem não tem sessão',
      );
      assert.ok(
        operacao.securitySchemes.includes('bearerAuth'),
        `${id} deixou de exigir bearerAuth`,
      );
    }
  });
});
