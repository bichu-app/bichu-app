/** A isca do TETO do contrato, que é a outra metade de `tempo-da-redacao.test.ts`. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

/**
 * Cada entrada é um teto que a redação do canal mediado depende de continuar
 * existindo, com o caminho exato dentro do contrato.
 */
const TETOS_QUE_ALIMENTAM_A_REDACAO: ReadonlyArray<{
  readonly operacao: string;
  readonly caminho: readonly string[];
  readonly teto: number;
  readonly onde: string;
}> = [
  {
    operacao: 'POST /conversations/{conversationId}/messages',
    caminho: [
      'paths',
      '/conversations/{conversationId}/messages',
      'post',
      'requestBody',
      'content',
      'application/json',
      'schema',
      'properties',
      'body',
      'maxLength',
    ],
    teto: 1000,
    onde: 'conversation-service.ts:206',
  },
  {
    operacao: 'POST /finder/conversation/messages',
    caminho: [
      'paths',
      '/finder/conversation/messages',
      'post',
      'requestBody',
      'content',
      'application/json',
      'schema',
      'properties',
      'body',
      'maxLength',
    ],
    teto: 1000,
    onde: 'primeira-mensagem.ts:114',
  },
  {
    operacao: 'componente PetInput.care_notes',
    caminho: ['components', 'schemas', 'PetInput', 'properties', 'care_notes', 'maxLength'],
    teto: 280,
    onde: 'pet-service.ts:140',
  },
];

function descer(raiz: unknown, caminho: readonly string[]): unknown {
  let atual: unknown = raiz;
  for (const passo of caminho) {
    if (typeof atual !== 'object' || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[passo];
  }
  return atual;
}

void describe('SEC-025 — o teto do contrato nos três campos que a redação recebe', () => {
  const bruto = readFileSync(CAMINHO_DA_SPEC, 'utf8');
  const spec: unknown = parseYaml(bruto);

  void it('encontra `api/openapi.yaml`, ou reprova dizendo que não encontrou', () => {
    assert.ok(
      typeof spec === 'object' && spec !== null,
      `SEC-025: não consegui ler ${CAMINHO_DA_SPEC} como YAML. Sem o contrato esta isca não ` +
        'confere teto nenhum, e aprovar sem olhar é o defeito que ela existe para impedir',
    );
  });

  for (const alvo of TETOS_QUE_ALIMENTAM_A_REDACAO) {
    void it(`${alvo.operacao} continua declarando maxLength ${alvo.teto}`, () => {
      const declarado = descer(spec, alvo.caminho);
      assert.equal(
        typeof declarado,
        'number',
        `SEC-025: o \`maxLength\` de ${alvo.operacao} SUMIU do contrato ` +
          `(${alvo.caminho.join(' > ')}). Esse número é o que impede que ` +
          `${alvo.onde} entregue à redação um texto do tamanho do \`bodyLimit\` de 1 MB. ` +
          'Se a remoção é deliberada, ela precisa vir com a decisão escrita, e este caso ' +
          'sai junto',
      );
      assert.ok(
        (declarado as number) <= alvo.teto,
        `SEC-025: o \`maxLength\` de ${alvo.operacao} subiu de ${alvo.teto} para ` +
          `${String(declarado)}. Quem subiu esse número alimentou ${alvo.onde} com mais ` +
          'texto do que qualquer medição desta suíte cobre. A redação é linear hoje ' +
          '(ver tempo-da-redacao.test.ts), então isto não é uma parada de processo — é o ' +
          'aviso de que a folga encolheu, e a decisão precisa estar escrita no commit',
      );
    });
  }
});
