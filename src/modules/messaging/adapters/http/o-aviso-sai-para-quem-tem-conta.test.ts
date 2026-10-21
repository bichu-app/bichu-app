/**
 * BICHUS-35: O AVISO SAI NA VISTA AUTENTICADA, E NÃO NA DO ACHADOR.
 *
 * ## O fato protegido, e ele tem duas metades que se defendem juntas
 *
 * 1. `Conversation.found_report_id` SAI. Sem ele, a ampliação da autorização da
 *    intenção de foto (commit `46fc3a3b`) fica correta e **inalcançável**: o
 *    corpo de `createFoundReportPhotoUploadIntent` exige `found_report_id`, e o
 *    tutor não é o relator do aviso — o aviso não aparece em `listFoundReports`
 *    (que é a lista do relator) e `case_id` é o caso de perdido, não o aviso. O
 *    servidor autorizaria um pedido que a tela não tem como montar, e a frente
 *    mobile já parou de desenhar o botão de anexar por causa disso;
 * 2. `FinderConversation` **não** o recebe. O token do achador já endereça o
 *    aviso — é por isso que `createFinderPhotoUploadIntent` não pede id nenhum
 *    —, e entregar um UUIDv7, com o instante de criação dentro, a quem não tem
 *    conta é o que o SEC-001 proíbe.
 *
 * As duas numa conferência só, e de propósito: separadas, a primeira sozinha
 * convidaria a "consertar" o lado do achador acrescentando o campo lá também, e
 * a segunda sozinha seria satisfeita por o campo não existir em lugar nenhum.
 *
 * A metade 2 **também** é coberta por `exigirQueNaoVaza` em
 * `finder-conversation-routes.test.ts`, que reprova qualquer UUID no corpo do
 * achador. Aqui ela está declarada pelo nome, para que quem for acrescentar o
 * campo ali leia por que não pode.
 *
 * ## Por que o corpo da resposta é montado aqui
 *
 * **Nenhum portão deste repositório confere o CORPO da resposta** — o validador
 * de contrato confere o da requisição, e a resposta sai como a borda a monta.
 * Então declarar no contrato não é o campo sair: as duas coisas são medidas
 * separadamente neste arquivo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

import { comoResposta } from './conversation-routes.js';
import type { ConversaVisivel } from '../../application/conversation-service.js';
import type { AbsoluteUrl, ConversationId } from '../../../../shared/types/brands.js';

const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const AVISO = '018f3a2b-0000-7000-8000-0000000000ee';
const BASE_DE_MIDIA = 'https://midia.test' as AbsoluteUrl;

/** As propriedades que o contrato declara para um schema, lidas do YAML. */
function propriedadesDeSchema(nome: string): Set<string> {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  const schema = spec.components.schemas[nome];
  assert.ok(schema?.properties !== undefined, `o contrato não declara ${nome}`);
  return new Set(Object.keys(schema.properties));
}

function conversaVisivel(): ConversaVisivel {
  return {
    id: CONVERSA,
    foundReportId: AVISO,
    caseId: null,
    petDisplayName: 'Aurora',
    status: 'open',
    participants: [],
    messages: [],
    nextCursor: null,
    naoLida: false,
    previaDaUltima: null,
    ultimaMensagemEm: null,
  };
}

void describe('BICHUS-35: `found_report_id` sai para quem tem conta, e não para quem não tem', () => {
  void it('o CONTRATO declara `found_report_id` em `Conversation`', () => {
    assert.ok(
      propriedadesDeSchema('Conversation').has('found_report_id'),
      'sem este campo o tutor tem autorização para pedir intenção de foto e não ' +
        'tem de onde tirar o `found_report_id` que o corpo da operação exige',
    );
  });

  void it('o CONTRATO **não** declara `found_report_id` em `FinderConversation`', () => {
    assert.ok(
      !propriedadesDeSchema('FinderConversation').has('found_report_id'),
      'o campo entrou na vista de quem NÃO tem conta: é um UUIDv7, com o instante ' +
        'de criação dentro, e o SEC-001 proíbe. O token do achador já endereça o ' +
        'aviso, e é por isso que `createFinderPhotoUploadIntent` não pede id nenhum',
    );
  });

  void it('CONTROLE: os dois schemas foram lidos, e a assimetria do SEC-001 está de pé', () => {
    // A isca das duas asserções acima. Elas são de PRESENÇA e de AUSÊNCIA sobre
    // schemas diferentes; se o leitor devolvesse conjunto vazio para os dois, a
    // segunda ficaria verde sem medir nada. Este caso prova que há o que medir.
    const autenticada = propriedadesDeSchema('Conversation');
    const doAchador = propriedadesDeSchema('FinderConversation');
    assert.ok(autenticada.size > 0, 'o schema `Conversation` não foi lido');
    assert.ok(doAchador.size > 0, 'o schema `FinderConversation` não foi lido');
    assert.ok(autenticada.has('id'), '`Conversation` perdeu o `id`');
    assert.ok(!doAchador.has('id'), '`FinderConversation` ganhou `id` (SEC-001)');
  });

  void it('a RESPOSTA do detalhe carrega o aviso DAQUELA conversa', async () => {
    const resposta = await comoResposta(conversaVisivel(), BASE_DE_MIDIA, () =>
      Promise.resolve('https://privado.invalid/x' as AbsoluteUrl),
    );
    assert.equal(
      resposta['found_report_id'],
      AVISO,
      'a resposta não carrega o aviso, ou carrega outro valor',
    );
  });

  void it('CONTROLE: a resposta continua carregando `id` e `case_id`', () => {
    // Passa nos dois estados de qualquer isca desta frente. Sem ele, uma
    // montagem que trocasse a lista inteira de campos por `found_report_id`
    // passaria no caso acima.
    return comoResposta(conversaVisivel(), BASE_DE_MIDIA, () =>
      Promise.resolve('https://privado.invalid/x' as AbsoluteUrl),
    ).then((resposta) => {
      assert.equal(resposta['id'], CONVERSA);
      assert.ok('case_id' in resposta);
    });
  });
});
