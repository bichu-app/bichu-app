/** BICHUS-35: O AVISO SAI NA VISTA AUTENTICADA, E NÃO NA DO ACHADOR. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

import { comoResposta } from './conversation-routes.js';
import type { ConversaVisivel } from '../../application/conversation-service.js';
import { fotoAlcancaOutroLado } from '../../domain/leitura-da-foto.js';
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

/** A lista `required` que o contrato declara para um schema. */
function obrigatoriosDeSchema(nome: string): readonly string[] {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: { schemas: Record<string, { required?: readonly string[] }> };
  };
  return spec.components.schemas[nome]?.required ?? [];
}

function conversaVisivel(): ConversaVisivel {
  return {
    id: CONVERSA,
    foundReportId: AVISO,
    fotoAlcancaOutroLado: true,
    caseId: null,
    petDisplayName: 'Aurora',
    status: 'open',
    papelDoChamador: 'tutor',
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
    return comoResposta(conversaVisivel(), BASE_DE_MIDIA, () =>
      Promise.resolve('https://privado.invalid/x' as AbsoluteUrl),
    ).then((resposta) => {
      assert.equal(resposta['id'], CONVERSA);
      assert.ok('case_id' in resposta);
    });
  });
});

void describe('BICHUS-35: `photo_reaches_other_side` diz a VERDADE sobre o alcance', () => {
  const comAchador = (achadorTemConta: boolean): ConversaVisivel => ({
    ...conversaVisivel(),
    fotoAlcancaOutroLado: fotoAlcancaOutroLado({ achadorTemConta }),
  });

  const responder = (achadorTemConta: boolean): Promise<Record<string, unknown>> =>
    comoResposta(comAchador(achadorTemConta), BASE_DE_MIDIA, () =>
      Promise.resolve('https://privado.invalid/x' as AbsoluteUrl),
    );

  void it('o CONTRATO declara `photo_reaches_other_side` em `Conversation`, e OBRIGATÓRIO', () => {
    assert.ok(
      propriedadesDeSchema('Conversation').has('photo_reaches_other_side'),
      'o campo saiu do contrato: o tutor volta a mandar foto sem saber que o ' +
        'achador sem conta não a vê',
    );
    assert.ok(
      obrigatoriosDeSchema('Conversation').includes('photo_reaches_other_side'),
      'o campo ficou opcional. Opcional é pior que ausente aqui: o cliente teria ' +
        'de escolher um padrão, e o padrão errado é justamente `true`',
    );
  });

  void it('o CONTRATO **não** declara o campo em `FinderConversation`', () => {
    assert.ok(
      !propriedadesDeSchema('FinderConversation').has('photo_reaches_other_side'),
      'o campo entrou na vista de quem não tem conta, e aquele lado não decide ' +
        'nada com ele',
    );
  });

  void it('FALSO quando o achador NÃO tem conta — a foto do tutor não chega lá', async () => {
    const resposta = await responder(false);
    assert.equal(
      resposta['photo_reaches_other_side'],
      false,
      'o campo disse que a foto alcança o achador sem conta, e o guarda de ' +
        'SEC-001 (`podeSairParaQuemNaoTemConta`) recusa a chave do tutor: o tutor ' +
        'mandaria a foto e ficaria esperando resposta de quem não viu nada',
    );
  });

  void it('VERDADEIRO quando o achador tem conta — ele lê pela vista autenticada', async () => {
    const resposta = await responder(true);
    assert.equal(resposta['photo_reaches_other_side'], true);
  });

  void it('ISCA: os dois casos acima medem a DIFERENÇA, e não um valor fixo', async () => {
    const semConta = await responder(false);
    const comConta = await responder(true);
    assert.notEqual(
      semConta['photo_reaches_other_side'],
      comConta['photo_reaches_other_side'],
      'o campo não varia com `achadorTemConta`: ele é uma constante disfarçada ' +
        'de derivação',
    );
  });

  void it('CONTROLE: o alcance não mexe em mais nada da resposta', async () => {
    const semConta = await responder(false);
    const comConta = await responder(true);
    for (const chave of ['id', 'found_report_id', 'status', 'messages', 'unread']) {
      assert.deepEqual(
        semConta[chave],
        comConta[chave],
        `\`${chave}\` mudou junto com o alcance da foto`,
      );
    }
  });

  void it('CONTROLE NEGATIVO: a função do domínio é a MESMA que a borda usa', () => {
    assert.equal(fotoAlcancaOutroLado({ achadorTemConta: false }), false);
    assert.equal(fotoAlcancaOutroLado({ achadorTemConta: true }), true);
  });
});
