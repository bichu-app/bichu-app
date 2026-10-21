/**
 * A FOTO DE PESSOA NÃO SAI EM RESPOSTA PÚBLICA — medido NO CONTRATO.
 *
 * Mora em `src/tools/` e não junto da projeção porque **lê `api/openapi.yaml` do
 * disco**, e `domain/` não conhece arquivo (o `eslint` deste repositório recusa
 * `node:fs` ali, e com razão). Os vizinhos deste diretório fazem o mesmo: os
 * portões de contrato público, administrativo e de colunas que não saem leem a
 * especificação daqui.
 *
 * ## Por que a regra é medida assim
 *
 * Ela era de OMISSÃO pura — "a foto do usuário sai em `Me` e em nenhuma outra
 * resposta" — e omissão não se mede exercitando a única superfície que deve
 * mostrar o campo: se mede varrendo as outras e provando que nenhuma o declara.
 * Um caso que chamasse `getMe` e achasse a foto passaria igual num mundo em que
 * a foto também sai na conversa mediada.
 *
 * ## O QUE A EMENDA 3 DO ADR-0010 MUDOU AQUI (19/10/2026)
 *
 * **Passou a existir UMA exceção, e ela é nomeada**: a foto sai no participante
 * da conversa mediada **quando as duas pessoas já aceitaram conexão**. Decisão
 * do cliente, com o conflito na mesa.
 *
 * Este arquivo **não foi afrouxado para abrir caminho** — ele ficou maior. A
 * regra continua cobrada (a frase do contrato, em dois pontos, inteira), e a
 * exceção ganhou casos próprios: ela tem de estar **escrita e datada** no
 * contrato, tem de ter **exatamente dois campos**, **não** pode estar em
 * `FinderConversation`, **não** pode carregar estado de moderação e **não** pode
 * trazer identificador interno. Uma terceira superfície continua reprovando.
 *
 * **O que este arquivo NÃO consegue medir** é o recorte em tempo de execução: o
 * contrato declara os dois campos anuláveis, e "anulável" não distingue "nulo
 * porque não é conexão" de "nulo por esquecimento". Essas duas pontas são
 * medidas em `messaging/adapters/persistence/conexao-aceita-na-clausula-where.test.ts`
 * (onde o predicado mora) e em
 * `tests/integration/foto-na-conversa-entre-conexoes.test.ts` (o corpo real).
 *
 * A projeção em si (a URL nula enquanto processa, o selo derivado) é medida em
 * `src/modules/identity/domain/foto-do-usuario-e-selo.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const contrato = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(contrato) as {
  components: { schemas: Record<string, unknown> };
};

/**
 * Os campos da EMENDA 3 do ADR-0010 (19/10/2026). Lista FECHADA.
 *
 * Um terceiro campo de pessoa em `participants` é superfície nova e precisa de
 * decisão do cliente — e é aqui que ela aparece.
 */
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

    // E a referência está dentro de `Me`: o trecho entre `Me:` e o schema
    // seguinte é onde ela tem de cair.
    const inicioDoMe = contrato.indexOf('\n    Me:\n');
    const inicioDoProximo = contrato.indexOf('\n    MeUpdate:\n');
    assert.ok(inicioDoMe > 0 && inicioDoProximo > inicioDoMe);
    const blocoDoMe = contrato.slice(inicioDoMe, inicioDoProximo);
    assert.match(blocoDoMe, /#\/components\/schemas\/MyPhoto\b/);
  });

  void it('`Conversation.participants` continua dizendo por extenso que não traz foto de perfil', () => {
    // Não é prosa decorativa: é a decisão registrada que impede alguém
    // "completar" a conversa mediada com a foto da pessoa. Se a frase sair, a
    // decisão saiu com ela, e este caso reprova.
    //
    // **A EMENDA 3 (19/10/2026) NÃO APAGOU A FRASE, e e por isso que a
    // contagem continua sendo 2.** A decisão do cliente foi uma exceção
    // NOMEADA — conexão aceita — escrita AO LADO da regra, e os casos abaixo
    // cobram a exceção pelo nome. Apagar a regra para abrir a exceção teria
    // deixado a próxima superfície sem nada contra ela.
    const frases = contrato.match(/telefone, e-mail nem foto de perfil/g) ?? [];
    assert.equal(frases.length, 2, 'a conversa do tutor e a do achador, as duas');
  });

  void it('EMENDA 3 -- a exceção está ESCRITA, com a data e a frase da decisão', () => {
    // A regra sem a exceção escrita ao lado dela é pior que as duas ausentes:
    // quem ler o contrato conclui que a foto nunca sai, e quem ler o código vê
    // que sai. Este caso cobra as duas metades no MESMO lugar.
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
    // **A metade estrutural da decisão.** O achador SEM CONTA não tem conexão
    // com ninguém, e não há chamador de quem medir a aresta. Uma descrição
    // dizendo "não vale para o achador" não é contrato: nenhum gerador de tipo
    // lê prosa, e o cliente gerado nasceria com o campo.
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
    // **ESTE CASO PERDEU METADE DO TRABALHO EM 20/10/2026, e a metade foi para
    // um lugar melhor.** Ele contava UMA ocorrência da propriedade e com isso
    // afirmava duas coisas de uma vez: "a emenda 3 tem hospedeiro" e "não existe
    // outro". A emenda 5 trouxe o segundo hospedeiro legítimo
    // (`PublicationAuthor`), e subir o número de 1 para 2 aqui teria afrouxado a
    // conferência: ela passaria a aceitar QUALQUER dois.
    //
    // Então a metade "e nenhuma outra" virou a LISTA FECHADA, por nome e por
    // caminho, no caso `photo_icon_url` tem uma LISTA FECHADA de hospedeiros.
    // Este caso guarda a outra metade, que continua valendo literalmente: a
    // superfície que a emenda 3 nomeou é a conversa mediada, e ela não mudou.
    //
    // A busca é por linha de propriedade (`^\s+photo_icon_url:`) e não por
    // substring: as menções dentro das descrições são prosa, e uma conferência
    // por substring contaria as duas emendas mais os comentários — que foi o
    // defeito de um portão desta casa.
    const linhas = contrato.match(/^\s+photo_icon_url:\s*$/gm) ?? [];
    assert.equal(
      linhas.length,
      3,
      'o número de declarações de `photo_icon_url` mudou. TRÊS são as emendas 3, 5 e a ' +
        'de 21/10/2026 (o resultado da busca); QUEM SÃO está no caso da lista fechada, ' +
        'e é lá que uma quarta reprova',
    );
    const conversa = JSON.stringify(spec.components.schemas['Conversation']);
    assert.match(conversa, /photo_icon_url/, 'a emenda 3 perdeu o hospedeiro dela');
  });

  void it('EMENDA 3 -- a foto do participante NÃO carrega estado de moderação', () => {
    // `MyPhoto`, que o DONO recebe, tem `status` e `rejection_reason`. Nenhum
    // dos dois é assunto de terceiro: motivo de recusa de uma foto é entre o
    // dono e quem modera. Foto que não está `ready` simplesmente não sai, e por
    // isso não há estado a desenhar — mesma redução de `PersonShowcasePhoto`.
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
    // E ela NÃO reaproveita `MyPhoto`, que traria os dois de volta.
    //
    // A conferência é pelo **`$ref`** e não pelo nome solto, e a diferença foi
    // medida: a descrição de `photo_icon_url` CITA `MyPhoto` por extenso para
    // dizer o que ela não é, e uma busca pelo nome solto reprovava a si mesma.
    // É o mesmo defeito que o caso "a vitrine não traz legenda" desta casa já
    // pagou — um portão que acusa a própria prosa é um portão que alguém
    // desliga.
    assert.ok(
      !JSON.stringify(spec.components.schemas['Conversation']).includes(
        '#/components/schemas/MyPhoto',
      ),
      '`Conversation` passou a alcançar `MyPhoto` por `$ref`: `status` e ' +
        '`rejection_reason` voltariam junto',
    );
  });

  void it('EMENDA 3 -- nenhum identificador INTERNO entrou junto (ADR-0010 item 6)', () => {
    // O apelido é alias público, escolhido pela pessoa e mutável. O que
    // continua proibido é o identificador interno e o endereço opaco: `id`,
    // `user_id`, `public_ref` e qualquer UUID.
    //
    // **Confere o NOME DAS PROPRIEDADES e o `format` DELAS, e não o texto do
    // bloco** — medido: a descrição de `handle` diz "nunca `users.public_ref`,
    // nunca UUID" para registrar a decisão, e uma varredura sobre o JSON
    // inteiro reprovava na própria frase que a defende.
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
    // `photo_url` da foto de PET e `photo_upload_id` (campo de escrita) são
    // outra coisa e continuam valendo. O que esta isca proíbe é um segundo
    // `photo:` que referencie a foto de pessoa.
    const ocorrencias = contrato.match(/^\s+photo:\s*$/gm) ?? [];
    // Duas: `Me.photo` e `AdminDirectoryEntry.photo` (a foto do LUGAR, que é de
    // estabelecimento e sai só na superfície administrativa). Uma terceira é
    // superfície nova e precisa de decisão do cliente.
    //
    // **Nem a emenda 3 nem a emenda 5 acrescentaram um `photo:`**, e isso é de
    // propósito: o campo das duas é `photo_icon_url`, uma URL escalar sem
    // estado. Se alguém um dia o trocar por um objeto `photo:`, este número vira
    // 3 e o caso reprova — que é o resultado certo, porque objeto abre espaço
    // para `status` e `rejection_reason` voltarem para dentro de uma resposta de
    // terceiro.
    assert.equal(ocorrencias.length, 2, 'um `photo:` a mais é uma superfície a mais');
  });

  void it('`photo_icon_url` tem uma LISTA FECHADA de hospedeiros, e sao TRES', () => {
    // **ESTE CASO SUBSTITUI UMA CONTAGEM POR UMA LISTA, e a diferença é o
    // ponto.** Até 20/10/2026 a emenda 3 tinha UM hospedeiro e um `assert.equal`
    // de contagem bastava. A emenda 5 trouxe o segundo, e subir o número de 1
    // para 2 teria afrouxado a conferência: ela passaria a aceitar QUALQUER
    // duas superfícies, inclusive uma pública.
    //
    // **São DOIS, e não três.** A contagem de campos `photo:` continua sendo
    // DOIS e não precisou subir, porque a emenda 5 não acrescentou um `photo:`:
    // o campo dela é `photo_icon_url`, escalar e sem estado, exatamente como o
    // da emenda 3. Medido, e não suposto.
    //
    // Então a conferência passou a ser a lista, por NOME e por CAMINHO. Uma
    // superfície nova não cabe aqui sem alguém escrever o nome dela — e é isso
    // que o portão existe para cobrar.
    //
    // **A varredura desce a árvore inteira**, e descobrir que isso era
    // necessário valeu o caso irmão em
    // `publicacao-nao-sai-para-quem-nao-tem-relacao.test.ts`: em
    // `Conversation.participants[]` o participante é um objeto INLINE — não há
    // schema `ConversationParticipant` —, e uma varredura que olhasse só as
    // propriedades de primeiro nível dos schemas NOMEADOS achava ZERO e ficava
    // verde **afirmando que o campo não existia em lugar nenhum**.
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
        // Emenda 3 (19/10/2026): a conversa mediada, entre conexões aceitas.
        // Objeto INLINE, e é por isso que a varredura desce a árvore.
        'components.schemas.Conversation.properties.participants.items',
        // **O TERCEIRO HOSPEDEIRO (21/10/2026), e ele é o ÚNICO que não exige
        // conexão aceita.** O cliente emendou a emenda 5 item 2: *"o resultado
        // tras foto sim, para identificar usuarios com nomes parecidos."* Com
        // só o nome, duas `Maria Silva` são indistinguíveis.
        //
        // **O que torna isto defensável são TRÊS FREIOS**, e eles são a
        // diferença entre busca e catálogo de rostos: a busca exige conta
        // (`bearerAuth` sem alternativa vazia), há piso de três caracteres, e
        // `q` vazio devolve lista vazia — não existe "listar todos". Quem vê a
        // foto já sabe aproximadamente quem procura.
        //
        // Se algum dos três cair, esta entrada tem de sair com ele.
        'components.schemas.PersonSearchResult',
        // Emenda 5 (20/10/2026): o autor de uma publicação do Mural. O
        // predicado da emenda 3 é satisfeito por construção ali — a linha do
        // tempo só devolve publicação de conexão aceita.
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
    // Sem esta isca, o caso de cima passaria por não haver hospedeiro novo — e
    // não por ele saber reconhecer um. E a mutação usa a forma INLINE de
    // propósito, que é justamente a que a versão antiga não enxergava.
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
    // Um campo de selo no corpo de escrita deixaria qualquer conta se declarar
    // validada, que é o mesmo defeito do `verification_level` do profissional:
    // perfil que declara o próprio nível torna a verificação decorativa.
    assert.ok(!bloco.includes('email_verified'), 'selo não é campo de escrita');
    // **Pelo NOME, e não só pelo sufixo `verified:`.** O selo do dono passou a
    // ser `contact_channel_verified` em 21/10/2026, e um campo de escrita com
    // esse nome é o mesmo defeito do `verification_level` do profissional.
    assert.ok(
      !bloco.includes('contact_channel_verified'),
      'selo não é campo de escrita',
    );
    assert.ok(!bloco.includes('verified:'), 'selo não é campo de escrita');
  });
});
