import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

import { comoResposta } from './conversation-routes.js';
import type { ConversaVisivel } from '../../application/conversation-service.js';
import { participantesVisiveis, type Papel } from '../../domain/conversa-mediada.js';
import type { AbsoluteUrl, ConversationId } from '../../../../shared/types/brands.js';

const CONVERSA = '018f3a2b-0000-7000-8000-00000000d0d0' as ConversationId;
const AVISO = '018f3a2b-0000-7000-8000-00000000d0e0';
const BASE_DE_MIDIA = 'https://midia.test' as AbsoluteUrl;

type PapelHumano = Exclude<Papel, 'system'>;

function schemaDoContrato(nome: string): {
  properties?: Record<string, { enum?: readonly unknown[] }>;
  required?: readonly string[];
} {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: {
      schemas: Record<
        string,
        { properties?: Record<string, { enum?: readonly unknown[] }>; required?: readonly string[] }
      >;
    };
  };
  const schema = spec.components.schemas[nome];
  assert.ok(schema !== undefined, `o contrato não declara o schema ${nome}`);
  return schema;
}

function conversaVista(papelDoChamador: PapelHumano): ConversaVisivel {
  return {
    id: CONVERSA,
    foundReportId: AVISO,
    fotoAlcancaOutroLado: true,
    caseId: null,
    petDisplayName: 'Aurora',
    status: 'open',
    papelDoChamador,
    participants: participantesVisiveis({
      nomeDoTutor: 'Leandro',
      nomeDoAchador: 'Marina',
      tutorDesabilitado: false,
      achadorDesabilitado: false,
      papelDoChamador,
      apelidoDoOutro: null,
      chaveDaFotoDoOutro: null,
    }),
    messages: [],
    nextCursor: null,
    naoLida: false,
    previaDaUltima: null,
    ultimaMensagemEm: null,
  };
}

const responder = (papel: PapelHumano): Promise<Record<string, unknown>> =>
  comoResposta(conversaVista(papel), BASE_DE_MIDIA, () =>
    Promise.resolve('https://privado.invalid/x' as AbsoluteUrl),
  );

function projecaoVistaPor(papel: PapelHumano, conexaoAceita: boolean): string {
  return JSON.stringify(
    participantesVisiveis({
      nomeDoTutor: 'Leandro',
      nomeDoAchador: 'Marina',
      tutorDesabilitado: false,
      achadorDesabilitado: false,
      papelDoChamador: papel,
      apelidoDoOutro: conexaoAceita ? 'marina' : null,
      chaveDaFotoDoOutro: conexaoAceita ? 'u/abc/thumb.jpg' : null,
    }),
  );
}

void describe('A DERIVAÇÃO NÃO DECIDE: por que `viewer_role` tem de ser um campo', () => {
  void it('SEM conexão aceita o corpo é IDÊNTICO para o chamador tutor e para o achador', () => {
    const vistoPeloTutor = projecaoVistaPor('tutor', false);
    const vistoPeloAchador = projecaoVistaPor('finder', false);
    assert.equal(
      vistoPeloTutor,
      vistoPeloAchador,
      'a projeção passou a distinguir os dois chamadores sem conexão aceita. Se ' +
        'isso é intencional, `viewer_role` deixou de ser necessário -- mas então ' +
        'alguma coisa do OUTRO lado passou a sair para o próprio lado, e é isso ' +
        'que a emenda 3 do ADR-0010 proíbe',
    );
    assert.match(vistoPeloTutor, /"handle":null.*"handle":null/s);
    assert.match(vistoPeloTutor, /"photoKey":null.*"photoKey":null/s);
  });

  void it('CONTROLE POSITIVO: COM conexão aceita a projeção DISTINGUE os dois', () => {
    assert.notEqual(
      projecaoVistaPor('tutor', true),
      projecaoVistaPor('finder', true),
      'a projeção não varia com o papel do chamador nem quando há conexão ' +
        'aceita: a medição acima não estava medindo nada',
    );
  });
});

void describe('O CONTRATO declara `viewer_role`, e só na vista autenticada', () => {
  void it('`Conversation` declara o campo, OBRIGATÓRIO, com os dois papéis humanos', () => {
    const schema = schemaDoContrato('Conversation');
    const campo = schema.properties?.['viewer_role'];
    assert.ok(
      campo !== undefined,
      'o campo saiu do contrato: o cliente volta a adivinhar o papel do ' +
        'chamador, e a adivinhação não decide (ver o describe acima)',
    );
    assert.ok(
      (schema.required ?? []).includes('viewer_role'),
      'o campo ficou opcional. Opcional é pior que ausente: o cliente teria de ' +
        'escolher um padrão, e o padrão errado é justamente `tutor` -- que é o ' +
        'defeito de hoje com outro nome',
    );
    assert.deepEqual(
      campo.enum,
      ['tutor', 'finder'],
      '`system` não é valor possível: o Bichu não chama esta rota',
    );
  });

  void it('`FinderConversation` **não** declara o campo', () => {
    assert.ok(
      !('viewer_role' in (schemaDoContrato('FinderConversation').properties ?? {})),
      'o campo entrou na vista de quem NÃO tem conta. Lá o papel é `finder` por ' +
        'definição do próprio token, e não há o que dizer',
    );
  });

  void it('CONTROLE: os dois schemas foram lidos', () => {
    assert.ok(Object.keys(schemaDoContrato('Conversation').properties ?? {}).length > 0);
    assert.ok(Object.keys(schemaDoContrato('FinderConversation').properties ?? {}).length > 0);
  });
});

void describe('A RESPOSTA carrega o papel de quem chamou, nos DOIS sentidos', () => {
  void it('chamador TUTOR: `viewer_role` é `tutor`', async () => {
    const resposta = await responder('tutor');
    assert.equal(resposta['viewer_role'], 'tutor');
  });

  void it('chamador ACHADOR com conta: `viewer_role` é `finder`', async () => {
    const resposta = await responder('finder');
    assert.equal(
      resposta['viewer_role'],
      'finder',
      'a resposta afirmou `tutor` para o achador com conta: é exatamente a ' +
        'suposição que o app fazia, agora assada no servidor',
    );
  });

  void it('ISCA: o campo VARIA com o papel, e não é constante disfarçada', async () => {
    const doTutor = await responder('tutor');
    const doAchador = await responder('finder');
    assert.notEqual(
      doTutor['viewer_role'],
      doAchador['viewer_role'],
      'uma montagem que escrevesse `viewer_role: \'tutor\'` fixo passaria no ' +
        'primeiro caso; este é o que a reprova',
    );
  });

  void it('A FOTO CONTINUA SENDO DO OUTRO LADO, e o papel escolhe qual é o outro', async () => {
    for (const papel of ['tutor', 'finder'] as const) {
      const resposta = await responder(papel);
      const participantes = resposta['participants'] as readonly {
        role: string;
        handle: string | null;
        photo_icon_url: string | null;
      }[];
      const meu = participantes.find((p) => p.role === papel);
      assert.ok(meu !== undefined, `o próprio lado (${papel}) saiu da lista`);
      assert.equal(meu.handle, null, 'o próprio lado recebeu apelido');
      assert.equal(meu.photo_icon_url, null, 'o próprio lado recebeu foto');
      assert.equal(
        resposta['viewer_role'],
        papel,
        'o papel publicado discorda do papel que decidiu os nulos: a tela ' +
          'desenharia o avatar de um lado e a bolha do outro',
      );
    }
  });

  void it('CONTROLE: o campo novo não mexeu no resto da resposta', async () => {
    const resposta = await responder('tutor');
    assert.equal(resposta['id'], CONVERSA);
    assert.equal(resposta['found_report_id'], AVISO);
    assert.equal(resposta['pet_display_name'], 'Aurora');
    assert.equal(resposta['status'], 'open');
  });
});
