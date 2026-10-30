/** Testes do portão de saída (ADR-0011, emenda 1, seção 4). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  autoTeste,
  inspecionarContrato,
  inspecionarFontes,
  lerColunasQueNaoSaem,
  semComentarios,
} from './portao-colunas-que-nao-saem.js';

const PROIBIDA = new Set(['created_by_user_id']);

function spec(yaml: string): Record<string, unknown> {
  return parseYaml(yaml) as Record<string, unknown>;
}

void describe('a isca interna do portão', () => {
  void it('não acusa nada quando o portão está inteiro', () => {
    assert.deepEqual(
      autoTeste(),
      [],
      'a isca interna acusou com o portão intacto: ela virou ruído e vai ser ignorada',
    );
  });
});

void describe('a lista de colunas sai das migrações, e não daqui', () => {
  void it('lê a coluna marcada com `NUNCA sai do servidor`', () => {
    const colunas = lerColunasQueNaoSaem([
      {
        caminho: 'migrations/exemplo.sql',
        conteudo: `COMMENT ON COLUMN professionals.created_by_user_id IS
            'QUEM CONVIDOU. Vinculo entre duas pessoas: NUNCA sai do servidor.';`,
      },
    ]);
    assert.deepEqual(
      colunas.map((c) => `${c.tabela}.${c.coluna}`),
      ['professionals.created_by_user_id'],
    );
  });

  void it('ignora coluna comentada sem a marca', () => {
    const colunas = lerColunasQueNaoSaem([
      {
        caminho: 'migrations/exemplo.sql',
        conteudo: `COMMENT ON COLUMN professionals.city IS 'Cidade onde a entidade atende.';`,
      },
    ]);
    assert.deepEqual(colunas, []);
  });

  void it('a migração real desta rodada marca created_by_user_id', () => {
    const conteudo = readFileSync(
      'migrations/20260921000002_profissionais-e-verificacoes-de-entidade.sql',
      'utf8',
    );
    const colunas = lerColunasQueNaoSaem([{ caminho: 'migracao', conteudo }]);
    assert.ok(
      colunas.some(
        (c) => c.tabela === 'professionals' && c.coluna === 'created_by_user_id',
      ),
      'a migração de professionals deixou de marcar created_by_user_id como coluna que não sai',
    );
  });

  void it('ADR-0027 20.7 fatia 7: a migracao real marca network_events.created_by_admin_id', () => {
    const conteudo = readFileSync('migrations/20260928000005_autoria-do-painel-na-rede.sql', 'utf8');
    const colunas = lerColunasQueNaoSaem([{ caminho: 'migracao', conteudo }]);
    assert.ok(
      colunas.some((c) => c.tabela === 'network_events' && c.coluna === 'created_by_admin_id'),
      'a migracao da autoria do painel deixou de marcar created_by_admin_id como coluna que nao sai',
    );
  });

  void it('ISCA fatia 7: created_by_admin_id projetado numa resposta do painel e no codigo reprova', () => {
    const proibida = new Set(['created_by_admin_id']);
    const noContrato = inspecionarContrato(
      spec(`
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /admin/network/events/{slug}:
    get:
      operationId: getAdminNetworkEvent
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  slug: { type: string }
                  created_by_admin_id: { type: string, format: uuid }
`),
      proibida,
    );
    assert.equal(noContrato[0]?.coluna, 'created_by_admin_id');
    const naFonte = inspecionarFontes(
      [{ caminho: 'isca.ts', conteudo: 'return { slug: l.slug, created_by_admin_id: l.created_by_admin_id };' }],
      proibida,
    );
    assert.equal(naFonte.length, 1);
  });
});

void describe('o contrato', () => {
  void it('reprova a coluna numa resposta, mesmo em operação autenticada', () => {
    const achados = inspecionarContrato(
      spec(`
openapi: 3.1.0
paths:
  /profissionais/{id}:
    get:
      operationId: getProfessional
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  created_by_user_id: { type: string, format: uuid }
`),
      PROIBIDA,
    );
    assert.equal(achados.length, 1, 'o portão deixou passar a coluna em rota autenticada');
    assert.equal(achados[0]?.coluna, 'created_by_user_id');
  });

  void it('reprova a coluna escondida atrás de um $ref', () => {
    const achados = inspecionarContrato(
      spec(`
openapi: 3.1.0
paths:
  /profissionais:
    get:
      operationId: listProfessionals
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Professional' }
components:
  schemas:
    Professional:
      type: object
      properties:
        created_by_user_id: { type: string, format: uuid }
`),
      PROIBIDA,
    );
    assert.ok(achados.length > 0, 'o portão não atravessou o $ref');
  });

  void it('reprova o componente declarado mesmo sem rota que o use ainda', () => {
    const achados = inspecionarContrato(
      spec(`
openapi: 3.1.0
paths: {}
components:
  schemas:
    Professional:
      type: object
      properties:
        created_by_user_id: { type: string, format: uuid }
`),
      PROIBIDA,
    );
    assert.ok(achados.length > 0, 'schema de componente sem rota passou despercebido');
  });

  void it('não acusa resposta que não carrega a coluna', () => {
    const achados = inspecionarContrato(
      spec(`
openapi: 3.1.0
paths:
  /profissionais/{id}:
    get:
      operationId: getProfessional
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  display_name: { type: string }
                  city: { type: string }
`),
      PROIBIDA,
    );
    assert.deepEqual(achados, [], 'achado falso: o portão acusaria o perfil legítimo');
  });
});

void describe('o código de servidor', () => {
  void it('reprova a coluna carregada para dentro de um objeto de resposta', () => {
    const achados = inspecionarFontes(
      [
        {
          caminho: 'src/professionals/adapters/http/mapper.ts',
          conteudo: 'return { id: linha.id, created_by_user_id: linha.created_by_user_id };',
        },
      ],
      PROIBIDA,
    );
    assert.equal(achados.length, 1);
    assert.match(achados[0]?.onde ?? '', /mapper\.ts:1/);
  });

  void it('não acusa arquivo que não cita a coluna', () => {
    const achados = inspecionarFontes(
      [{ caminho: 'src/professionals/domain/professional.ts', conteudo: 'export const x = 1;' }],
      PROIBIDA,
    );
    assert.deepEqual(achados, []);
  });
});

void describe('comentário não é código, e código continua sendo código', () => {
  void it('NÃO acusa a coluna citada em comentário de linha', () => {
    const achados = inspecionarFontes(
      [
        {
          caminho: 'src/modules/network/domain/encontro-da-rede.ts',
          conteudo: [
            '// A ORIGEM, e **não a autoria**: `admin` ou `community`.',
            '// `created_by_user_id` continua fora desta lista.',
            "const campos = ['origin'];",
          ].join('\n'),
        },
      ],
      PROIBIDA,
    );
    assert.deepEqual(
      achados,
      [],
      'achado falso: a prosa que DOCUMENTA a invariante foi lida como violação dela',
    );
  });

  void it('NÃO acusa a coluna citada em comentário de bloco nem em `/** */`', () => {
    const achados = inspecionarFontes(
      [
        {
          caminho: 'src/modules/network/domain/encontro-da-rede.ts',
          conteudo: [
            '/**',
            ' * **Não é o autor.** `created_by_user_id` nunca sai do servidor.',
            ' */',
            'export const origem = 1;',
            '/* created_by_user_id também aqui */',
          ].join('\n'),
        },
      ],
      PROIBIDA,
    );
    assert.deepEqual(achados, [], 'achado falso: comentário de bloco lido como código');
  });

  void it('REPROVA a coluna em código DEPOIS de um comentário que a cita', () => {
    const achados = inspecionarFontes(
      [
        {
          caminho: 'src/modules/network/adapters/http/mapper.ts',
          conteudo: [
            '// `created_by_user_id` nunca sai do servidor.',
            'export const corpo = { created_by_user_id: linha.created_by_user_id };',
          ].join('\n'),
        },
      ],
      PROIBIDA,
    );
    assert.equal(achados.length, 1, 'o portão ficou CEGO: coluna em código de verdade não acusou');
    assert.match(
      achados[0]?.onde ?? '',
      /mapper\.ts:2/,
      'o número de linha não é o do arquivo real: a limpeza encurtou o texto',
    );
  });

  void it('REPROVA a coluna dentro de literal de texto, que é código e não prosa', () => {
    const achados = inspecionarFontes(
      [
        {
          caminho: 'src/modules/network/adapters/persistence/repo.ts',
          conteudo: "const q = select('created_by_user_id'); // e nao e comentario",
        },
      ],
      PROIBIDA,
    );
    assert.equal(
      achados.length,
      1,
      'a coluna num literal de texto é `select(...)` de verdade, e tem de acusar',
    );
  });

  void it('`semComentarios` preserva a contagem de linhas', () => {
    const texto = ['// um', '/* dois', '   ainda dois */', 'const tres = 3;'].join('\n');
    assert.equal(
      semComentarios(texto).split('\n').length,
      texto.split('\n').length,
      'a limpeza mudou o número de linhas',
    );
    assert.match(semComentarios(texto), /const tres = 3;/, 'a limpeza comeu o código');
  });
});

