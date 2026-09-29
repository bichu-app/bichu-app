/**
 * A isca do TETO do contrato, que é a outra metade de `tempo-da-redacao.test.ts`.
 *
 * As duas guardam coisas diferentes, e a divisão é o ponto:
 *
 * - a isca de tempo guarda **a expressão regular**: ela reprova se alguém
 *   reintroduzir retrocesso quadrático em `redigir.ts` ou em
 *   `conteudo-do-push.ts`;
 * - esta aqui guarda **o teto**: ela reprova se alguém afrouxar o `maxLength`
 *   dos três campos que alimentam `redigirCanalMediado`.
 *
 * Por que a segunda continua existindo depois de a primeira existir. O conserto
 * tornou a redação linear, então o teto deixou de ser a única defesa contra a
 * parada do laço de eventos. Ele não deixou de ser defesa: a isca de tempo mede
 * 200 KB fixos, e quem remover o `maxLength` passa a alimentar a função com o
 * que couber no `bodyLimit` de 1 MB (`src/shared/http/server.ts`), que é cinco
 * vezes mais. Linear em 1 MB é aceitável; qualquer regressão futura em 1 MB não
 * é, e esta isca acusa o afrouxamento no dia em que ele acontece, com o motivo
 * escrito, em vez de no dia em que ele se combina com outra coisa.
 *
 * **Os três campos e onde eles entram na função**, conferido e não suposto:
 *   `POST /conversations/{conversationId}/messages` `body` -> conversation-service.ts:206
 *   `POST /finder/conversation/messages`            `body` -> primeira-mensagem.ts:114
 *   `PetInput.care_notes`                                  -> pet-service.ts:140
 *
 * O `/v1` que aparece nos caminhos da API mora em `servers[].url`, e não nas
 * chaves de `paths`. A primeira versão desta isca procurou `/v1/...` e não achou
 * nada -- e reprovou dizendo que o teto tinha sumido, que é o comportamento
 * correto de uma verificação que não consegue verificar. O caminho está certo
 * agora; o caso que acusou o engano fica registrado aqui porque ele é a prova
 * de que esta isca não aprova por ausência de dado.
 *
 * `/finder/conversation/messages` está no contrato e ainda não tem rota
 * implementada. O teto dele vale assim mesmo: ele é o número que quem for
 * implementar vai declarar no `schema` do Fastify.
 *
 * O que esta isca NÃO faz: ela não impede que o teto mude. Ela impede que ele
 * mude em silêncio. Quem precisar de um campo maior sobe o número aqui junto,
 * e o commit passa a dizer que a decisão foi tomada.
 */
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
    // Verificação que não consegue verificar reprova, nunca aprova: sem o
    // contrato na mão, todos os casos abaixo passariam por ausência de dado.
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
