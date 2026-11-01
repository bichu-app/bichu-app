import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { carregarContrato } from '../shared/http/contract.js';
import { ehOperacaoSemConta, inspecionarCamposPublicos } from './portao-contrato-publico.js';

const CAMINHO = 'api/openapi.yaml';
const OPERACAO = 'getNetworkEvent';

type Spec = Record<string, unknown>;

interface Esquema {
  properties?: Record<string, unknown>;
  required?: string[];
  [chave: string]: unknown;
}

function spec(): Spec {
  return parseYaml(readFileSync(CAMINHO, 'utf8')) as Spec;
}

function esquema(s: Spec, nome: string): Esquema {
  const componentes = s['components'] as { schemas?: Record<string, Esquema> } | undefined;
  const alvo = componentes?.schemas?.[nome];
  assert.ok(alvo, `\`${nome}\` nao existe no contrato: a isca nao tem onde morder.`);
  return alvo;
}

function operacoesSemConta() {
  const contrato = carregarContrato(CAMINHO);
  const semConta = [...contrato.operacoes.values()].filter((o) => ehOperacaoSemConta(o));
  assert.ok(
    semConta.length > 0,
    'REPROVA: nenhuma operacao sem conta no contrato. Filtro que nao filtra termina verde.',
  );
  return { contrato, semConta };
}

function achadosComCamposInjetados(campos: Record<string, unknown>): string[] {
  const s = spec();
  const publico = esquema(s, 'NetworkEventPublic');
  publico.properties = { ...publico.properties, ...campos };
  const { semConta } = operacoesSemConta();
  return inspecionarCamposPublicos(s, semConta)
    .filter((a) => a.operationId === OPERACAO)
    .map((a) => a.campo);
}

void describe('a pagina publica do encontro nao vaza', () => {

  void it('CONTROLE POSITIVO -- `getNetworkEvent` E uma operacao sem conta, e o portao a percorre', () => {
    const { semConta } = operacoesSemConta();
    const alvo = semConta.filter((operacao) => operacao.operationId === OPERACAO);
    assert.equal(
      alvo.length,
      1,
      `REPROVA: o portao de contrato publico NAO percorre \`${OPERACAO}\`. ` +
        'A autenticacao dela e opcional (`bearerAuth` mais `{}`), e isso a torna ' +
        'publica para este portao. Se ela saiu da varredura, todas as iscas deste ' +
        'arquivo passam a aprovar qualquer coisa.',
    );
  });

  void it('CONTROLE POSITIVO -- o contrato de hoje, sem injecao, nao tem achado nenhum nesta operacao', () => {
    const { semConta } = operacoesSemConta();
    const achados = inspecionarCamposPublicos(spec(), semConta).filter(
      (a) => a.operationId === OPERACAO,
    );
    assert.deepEqual(
      achados.map((a) => `${a.onde}.${a.campo}`),
      [],
      'REPROVA: a resposta publica do encontro ja declara campo privado hoje. ' +
        'As iscas abaixo nao distinguiriam o vazamento novo do que ja estava la.',
    );
  });

  void it('ISCA DE VAZAMENTO -- `street_address` no detalhe publico REPROVA, pelo nome', () => {
    const achados = achadosComCamposInjetados({
      street_address: { type: 'string', nullable: true },
    });
    assert.ok(
      achados.includes('street_address'),
      'REPROVA: o endereco por extenso do encontro entrou na resposta publica e o ' +
        'portao APROVOU. O ADR-0027 item 21.2 e literal: `street_address` sai so em ' +
        '`getNetworkEventLocation`, com `bearerAuth`, e nunca na agenda, no detalhe ' +
        'publico, no teaser nem nos detalhes do privado. A pagina `/encontro/{slug}` e ' +
        'lida sem conta: este campo nela e o endereco do encontro indo para um grupo ' +
        `de WhatsApp. Achados: ${JSON.stringify(achados)}`,
    );
  });

  void it('ISCA DE VAZAMENTO -- o logradouro por outros nomes tambem REPROVA', () => {
    for (const nome of ['street', 'address', 'address_line']) {
      const achados = achadosComCamposInjetados({ [nome]: { type: 'string' } });
      assert.ok(
        achados.includes(nome),
        `REPROVA: \`${nome}\` passou na resposta publica do encontro.`,
      );
    }
  });

  void it('o contrato de HOJE nao tem logradouro em `NetworkEventPublic`', () => {
    const propriedades = Object.keys(esquema(spec(), 'NetworkEventPublic').properties ?? {});
    for (const proibido of [
      'street_address',
      'street',
      'address',
      'postal_code',
      'street_number',
      'complement',
      'lat',
      'lon',
      'point',
      'geo',
    ]) {
      assert.ok(
        !propriedades.includes(proibido),
        `REPROVA: \`${proibido}\` esta em \`NetworkEventPublic\`, que e o corpo da ` +
          'pagina publica do encontro.',
      );
    }
  });

  void it('ISCA DE VAZAMENTO -- UUID interno na rota publica REPROVA (SEC-001, ADR-0010 item 6)', () => {
    for (const nome of ['id', 'event_id', 'created_by_id']) {
      const achados = achadosComCamposInjetados({ [nome]: { type: 'string', format: 'uuid' } });
      assert.ok(
        achados.includes(nome),
        `REPROVA: \`${nome}\` (UUID) entrou na resposta publica do encontro e o portao ` +
          'APROVOU. O ADR-0010 item 6 nao abre excecao: UUIDv7 e ordenavel e carrega o ' +
          'instante de criacao, entao publicar um por encontro entrega a base como ' +
          `telemetria. Achados: ${JSON.stringify(achados)}`,
      );
    }
  });

  void it('o endereco da pagina e o `slug`, e nao ha UUID no contrato de hoje', () => {
    const propriedades = Object.keys(esquema(spec(), 'NetworkEventPublic').properties ?? {});
    assert.ok(
      propriedades.includes('slug'),
      'REPROVA: `NetworkEventPublic` perdeu o `slug`, que e o endereco publico da pagina.',
    );
    assert.ok(
      !propriedades.some((p) => p === 'id' || p.endsWith('_id')),
      `REPROVA: identificador interno em \`NetworkEventPublic\`: ${JSON.stringify(propriedades)}`,
    );
  });

  void it('ISCA DE VAZAMENTO -- o teaser do privado continua com CINCO propriedades e sem `share_url`', () => {
    const teaser = esquema(spec(), 'NetworkEventPrivateTeaser');
    const propriedades = Object.keys(teaser.properties ?? {}).sort();
    assert.deepEqual(
      propriedades,
      ['local_date', 'slug', 'status', 'title', 'visibility'],
      'REPROVA: o teaser do encontro privado mudou de forma. Ele e a resposta que ' +
        'QUALQUER chamador recebe para um encontro privado, e e por ele nao ter lugar ' +
        'nem horario que o privado nao tem pagina publica. Propriedade nova aqui e ' +
        'conteudo de encontro fechado saindo para estranhos (ADR-0027 12.10).',
    );
    assert.equal(
      teaser['additionalProperties'],
      false,
      'REPROVA: o teaser deixou de ser lista fechada.',
    );
  });

  void it('`share_url` existe em `NetworkEventPublic` e NAO esta em `required`', () => {
    const publico = esquema(spec(), 'NetworkEventPublic');
    const propriedades = Object.keys(publico.properties ?? {});
    assert.ok(
      propriedades.includes('share_url'),
      'REPROVA: `share_url` saiu do contrato, e o aplicativo nao tem de onde tirar o ' +
        'link da pagina do encontro -- ele nao monta o endereco de proposito.',
    );
    assert.ok(
      !(publico.required ?? []).includes('share_url'),
      'REPROVA: `share_url` virou obrigatorio. **A AUSENCIA DELE E O INTERRUPTOR**: ' +
        'enquanto `site_page_availability` disser que a pagina nao esta publicada, o ' +
        'servidor OMITE o campo, e campo obrigatorio omitido e contrato quebrado -- ' +
        'ou seja, obrigar aqui obriga a acender a pagina.',
    );
  });

  void it('`share_url` nao e campo privado para o portao', () => {
    const { semConta } = operacoesSemConta();
    const achados = inspecionarCamposPublicos(spec(), semConta).filter(
      (a) => a.campo === 'share_url',
    );
    assert.deepEqual(
      achados.map((a) => a.operationId),
      [],
      'REPROVA: o portao acusou `share_url`. Se ele passou a ser campo proibido, a ' +
        'pagina publica do encontro nao pode existir na forma que o cliente pediu.',
    );
  });
});
