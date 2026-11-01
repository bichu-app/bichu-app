import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const contrato = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(contrato) as {
  components: { schemas: Record<string, unknown> };
};

const CAMPOS_DA_EMENDA = ['handle', 'photo_icon_url'] as const;

function propriedadesDoParticipante(esquema: string): string[] {
  const bloco = spec.components.schemas[esquema] as {
    properties?: {
      participants?: { items?: { properties?: Record<string, unknown> } };
    };
  };
  return Object.keys(bloco.properties?.participants?.items?.properties ?? {});
}

void describe('a foto de pessoa não sai em resposta pública (contrato)', () => {
  void it('`MyPhoto` é referenciado em UM lugar só, e esse lugar é `Me`', () => {
    const referencias = contrato.match(/#\/components\/schemas\/MyPhoto\b/g) ?? [];
    assert.equal(referencias.length, 1, 'duas referências significam uma segunda superfície');

    const inicioDoMe = contrato.indexOf('\n    Me:\n');
    const inicioDoProximo = contrato.indexOf('\n    MeUpdate:\n');
    assert.ok(inicioDoMe > 0 && inicioDoProximo > inicioDoMe);
    const blocoDoMe = contrato.slice(inicioDoMe, inicioDoProximo);
    assert.match(blocoDoMe, /#\/components\/schemas\/MyPhoto\b/);
  });

  void it('`Conversation.participants` continua dizendo por extenso que não traz foto de perfil', () => {
    const frases = contrato.match(/telefone, e-mail nem foto de perfil/g) ?? [];
    assert.equal(frases.length, 2, 'a conversa do tutor e a do achador, as duas');
  });

  void it('EMENDA 3 -- a exceção está ESCRITA, com a data e a frase da decisão', () => {
    const participantes = JSON.stringify(
      (spec.components.schemas['Conversation'] as {
        properties?: { participants?: unknown };
      }).properties?.participants,
    );
    assert.match(participantes, /19\/10\/2026/, 'a exceção precisa estar DATADA');
    assert.match(
      participantes,
      /aparece SO quando as duas pessoas ja aceitaram conexao/,
      'a FRASE da decisão do cliente precisa estar no contrato, e não uma paráfrase dela',
    );
  });

  void it('EMENDA 3 -- os dois campos existem em `Conversation`, e a lista é fechada', () => {
    const propriedades = propriedadesDoParticipante('Conversation').sort();
    assert.deepEqual(
      propriedades,
      ['display_name', 'handle', 'photo_icon_url', 'role'],
      'um campo a mais no participante da conversa é superfície nova de dado de ' +
        'pessoa, e precisa de decisão do cliente — este caso é onde ela aparece',
    );
  });

  void it('EMENDA 3 -- `FinderConversation` NÃO ganhou nenhum dos dois', () => {
    const propriedades = propriedadesDoParticipante('FinderConversation').sort();
    assert.deepEqual(
      propriedades,
      ['display_name', 'role'],
      'o schema do achador sem conta ganhou campo de pessoa. É o canal que NÃO ' +
        'tem chamador autenticado, e a foto não tem como ser recortada ali',
    );
    for (const campo of CAMPOS_DA_EMENDA) {
      assert.ok(
        !propriedades.includes(campo),
        `\`FinderConversation.participants\` declara \`${campo}\``,
      );
    }
  });

  void it('EMENDA 3 -- o hospedeiro DELA continua sendo `Conversation`', () => {
    const linhas = contrato.match(/^\s+photo_icon_url:\s*$/gm) ?? [];
    assert.equal(
      linhas.length,
      4,
      'o número de declarações de `photo_icon_url` mudou. QUATRO são as emendas 3, 5, a ' +
        'de 21/10/2026 (o resultado da busca) e a de 22/10/2026 (a lista das PRÓPRIAS ' +
        'conexões); QUEM SÃO está no caso da lista fechada, e é lá que uma quinta reprova',
    );
    const conversa = JSON.stringify(spec.components.schemas['Conversation']);
    assert.match(conversa, /photo_icon_url/, 'a emenda 3 perdeu o hospedeiro dela');
  });

  void it('EMENDA 3 -- a foto do participante NÃO carrega estado de moderação', () => {
    const bloco = spec.components.schemas['Conversation'] as {
      properties?: {
        participants?: {
          items?: { properties?: { photo_icon_url?: Record<string, unknown> } };
        };
      };
    };
    const foto = bloco.properties?.participants?.items?.properties?.photo_icon_url;
    assert.ok(foto !== undefined, 'o campo da emenda 3 saiu do contrato');
    assert.equal(foto['type'], 'string', 'um objeto aqui abriria espaço para estado');
    assert.equal(foto['format'], 'uri');
    for (const proibido of ['status', 'rejection_reason', 'upload_id', 'id']) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(foto, proibido),
        `\`${proibido}\` em \`photo_icon_url\`: estado da foto do DONO não sai para terceiro`,
      );
    }
    assert.ok(
      !JSON.stringify(spec.components.schemas['Conversation']).includes(
        '#/components/schemas/MyPhoto',
      ),
      '`Conversation` passou a alcançar `MyPhoto` por `$ref`: `status` e ' +
        '`rejection_reason` voltariam junto',
    );
  });

  void it('EMENDA 3 -- nenhum identificador INTERNO entrou junto (ADR-0010 item 6)', () => {
    const item = (spec.components.schemas['Conversation'] as {
      properties?: {
        participants?: { items?: { properties?: Record<string, { format?: string }> } };
      };
    }).properties?.participants?.items?.properties;
    assert.ok(item !== undefined, 'o item de `participants` saiu do contrato');
    for (const proibido of ['id', 'user_id', 'public_ref', 'ref', 'email', 'phone', 'phone_e164']) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(item, proibido),
        `\`${proibido}\` entrou em \`participants\`: o ADR-0010 item 6 não foi emendado`,
      );
    }
    for (const [nome, campo] of Object.entries(item)) {
      assert.notEqual(
        campo.format,
        'uuid',
        `\`${nome}\` declara \`format: uuid\`, e o ADR-0010 item 6 proíbe UUID em saída`,
      );
    }
  });

  void it('nenhuma outra resposta do contrato declara um campo `photo` de pessoa', () => {
    const ocorrencias = contrato.match(/^\s+photo:\s*$/gm) ?? [];
    assert.equal(ocorrencias.length, 2, 'um `photo:` a mais é uma superfície a mais');
  });

  void it('`photo_icon_url` tem uma LISTA FECHADA de hospedeiros, e sao QUATRO', () => {
    const hospedeiros: string[] = [];
    const andar = (no: unknown, caminho: string): void => {
      if (no === null || typeof no !== 'object') return;
      if (Array.isArray(no)) {
        no.forEach((item, i) => andar(item, `${caminho}[${String(i)}]`));
        return;
      }
      const objeto = no as Record<string, unknown>;
      const propriedades = objeto['properties'];
      if (
        propriedades !== null &&
        typeof propriedades === 'object' &&
        Object.prototype.hasOwnProperty.call(propriedades, 'photo_icon_url')
      ) {
        hospedeiros.push(caminho);
      }
      for (const [chave, valor] of Object.entries(objeto)) {
        andar(valor, caminho === '' ? chave : `${caminho}.${chave}`);
      }
    };
    andar(spec, '');

    assert.deepEqual(
      hospedeiros.sort(),
      [
        'components.schemas.ConnectedPerson',
        'components.schemas.Conversation.properties.participants.items',
        'components.schemas.PersonSearchResult',
        'components.schemas.PublicationAuthor',
      ].sort(),
      'a foto de pessoa ganhou hospedeiro novo, ou perdeu um. O ADR-0010 a limita ' +
        'às superfícies das emendas 3 e 5 e à emenda de 21/10/2026 (o resultado da ' +
        'busca), por nome, e abrir uma quarta é decisão do cliente — não de quem ' +
        'implementa. `FinderConversation.participants` NÃO está nesta lista, e a ' +
        'ausência é estrutural: ele serve o achador SEM CONTA, que não tem conexão ' +
        'com ninguém.',
    );
  });

  void it('ISCA: a varredura de hospedeiro REPROVA um `photo_icon_url` INLINE novo', () => {
    const achados: string[] = [];
    const andar = (no: unknown, caminho: string): void => {
      if (no === null || typeof no !== 'object') return;
      const objeto = no as Record<string, unknown>;
      const propriedades = objeto['properties'];
      if (
        propriedades !== null &&
        typeof propriedades === 'object' &&
        Object.prototype.hasOwnProperty.call(propriedades, 'photo_icon_url')
      ) {
        achados.push(caminho);
      }
      for (const [chave, valor] of Object.entries(objeto)) {
        andar(valor, caminho === '' ? chave : `${caminho}.${chave}`);
      }
    };
    andar(
      {
        components: {
          schemas: {
            PublicLostPet: {
              properties: {
                tutor: { properties: { photo_icon_url: { type: 'string' } } },
              },
            },
          },
        },
      },
      '',
    );
    assert.deepEqual(achados, ['components.schemas.PublicLostPet.properties.tutor']);
  });

  void it('não existe campo de escrita de selo: `MeUpdate` aceita foto e NÃO aceita validação', () => {
    const inicio = contrato.indexOf('\n    MeUpdate:\n');
    const fim = contrato.indexOf('\n    Device:\n', inicio);
    assert.ok(inicio > 0 && fim > inicio);
    const bloco = contrato.slice(inicio, fim);

    assert.match(bloco, /photo_upload_id/, 'a foto é escrita por aqui');
    assert.ok(!bloco.includes('email_verified'), 'selo não é campo de escrita');
    assert.ok(
      !bloco.includes('contact_channel_verified'),
      'selo não é campo de escrita',
    );
    assert.ok(!bloco.includes('verified:'), 'selo não é campo de escrita');
  });
});
