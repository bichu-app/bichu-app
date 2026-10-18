/**
 * ISCA — O PUSH DO AVISO AO TUTOR, E O QUE ELE NAO PODE CARREGAR.
 *
 * O texto para `tagEscaneada` existia desde a BICHUS-91 e **nunca teve
 * emissor**: o unico chamador de `montarMensagemDePush` fixava
 * `alertaDeVizinhanca`. Este arquivo prova que o emissor existe e que o que ele
 * emite e pobre de proposito.
 *
 * O caso que esta suite trava, e que nenhum outro travava, e o do NEGATIVO: o
 * corpo e o titulo passam por uma varredura de endereco, ponto, coordenada,
 * CEP, telefone, e-mail e UUID. Uma mao futura que acrescente "visto na Rua X"
 * ou o bairro ao texto reprova aqui, e nao na tela de bloqueio de um tutor.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PushNaoEnviadoError,
  type MensagemDePush,
  type ResultadoDoEnvio,
} from '../../ports/push-sender.js';
import type { Aparelho } from '../../domain/aparelho.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AvisoAoTutorParaEntrega } from '../../../tags/ports/aviso-ao-tutor.js';
import { criarAvisoAoTutorPorPush } from './aviso-ao-tutor-por-push.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;

function montar(aparelhosPorDono: Record<string, Record<string, ResultadoDoEnvio | 'falha'>>) {
  const enviados: MensagemDePush[] = [];
  const revogados: string[] = [];
  const entrega = criarAvisoAoTutorPorPush({
    aparelhos: {
      listarDoDono: (dono) =>
        Promise.resolve(
          Object.keys(aparelhosPorDono[dono] ?? {}).map((id) => ({ id }) as unknown as Aparelho),
        ),
      enderecoDeEnvio: (id) => Promise.resolve(id === 'sem-token' ? null : `token-${id}`),
    },
    push: {
      transporte: 'teste',
      enviar: (m) => {
        enviados.push(m);
        const id = m.token.replace('token-', '');
        const resposta = Object.values(aparelhosPorDono).reduce<
          ResultadoDoEnvio | 'falha' | undefined
        >((achado, mapa) => achado ?? mapa[id], undefined);
        if (resposta === 'falha') {
          return Promise.reject(new PushNaoEnviadoError('cota', true, 'teste'));
        }
        return Promise.resolve(resposta ?? 'aceito');
      },
    },
    revogarPorTokenRecusado: (t) => {
      revogados.push(t);
      return Promise.resolve(true);
    },
  });
  return { entrega, enviados, revogados };
}

function aviso(parcial: Partial<AvisoAoTutorParaEntrega> = {}): AvisoAoTutorParaEntrega {
  return {
    donoUserId: TUTOR,
    nomeDoPet: 'Thor',
    casoAberto: true,
    tokenPublicoDoCaso: 'st_do_caso_aberto',
    ...parcial,
  };
}

/**
 * As formas que nao podem aparecer no fio. Deliberadamente mais estreitas que
 * a porteira do dominio: aqui o que se prova e que **este** texto nao as tem,
 * e nao que a porteira funciona (isso e `conteudo-do-push.test.ts`).
 */
const FORMAS_DE_LUGAR: ReadonlyArray<{ nome: string; regex: RegExp }> = [
  { nome: 'logradouro', regex: /\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[cç]a)\b/iu },
  { nome: 'coordenada', regex: /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/u },
  { nome: 'CEP', regex: /\b\d{5}-?\d{3}\b/u },
  { nome: 'numero de porta', regex: /,\s*\d{1,5}\b/u },
  // A clausula de lugar que `onde()` acrescenta quando o chamador passa um
  // bairro. Bairro E permitido em superficie publica pelo ADR-0010 e os textos
  // de UX 12.2 o usam de proposito -- mas no push da PLAQUINHA ele nao entra:
  // o produto mostra bairro na tela do caso, e um aviso que acende na tela de
  // bloqueio e mais pobre que a tela. Sem esta linha, um `bairro` ligado aqui
  // passaria por toda a varredura acima sem reprovar nada.
  { nome: 'clausula de lugar (", na ...")', regex: /,\s+n[ao]\s/u },
  { nome: 'UUID', regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu },
  { nome: 'telefone', regex: /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/u },
  { nome: 'e-mail', regex: /(?<![\w.+-])[\w.+-]+@[\w-]+\.[a-z]{2,}/iu },
];

void describe('ISCA — o aviso ao tutor sai por push, e sai pobre', () => {
  void it('entrega a cada aparelho do tutor; revoga o que sumiu e conta a falha', async () => {
    const { entrega, enviados, revogados } = montar({
      [TUTOR]: { a: 'aceito', b: 'aparelho-sumiu', c: 'falha', 'sem-token': 'aceito' },
    });

    const r = await entrega.avisar(aviso());

    assert.deepEqual(r, { aceitos: 1, falhos: 1, semAparelho: false });
    assert.deepEqual(revogados, ['token-b']);
    assert.equal(enviados.length, 3, 'o aparelho sem token nao recebe, e nao conta como falha');
  });

  void it('o texto do caso ABERTO e exatamente o do produto, e nada mais', async () => {
    const { entrega, enviados } = montar({ [TUTOR]: { a: 'aceito' } });

    await entrega.avisar(aviso({ casoAberto: true }));

    assert.equal(enviados[0]?.titulo, 'Alguém está com Thor');
    assert.equal(enviados[0]?.corpo, 'Uma pessoa escaneou a tag agora. Toque para falar.');
  });

  void it('o texto do pet SEM caso aberto diz o fato cru: e o tutor que nao sabe de nada', async () => {
    const { entrega, enviados } = montar({ [TUTOR]: { a: 'aceito' } });

    await entrega.avisar(aviso({ casoAberto: false, tokenPublicoDoCaso: null }));

    assert.equal(enviados[0]?.titulo, 'Alguém escaneou a tag de Thor');
    assert.equal(
      enviados[0]?.corpo,
      'Isso aconteceu agora. Se Thor deveria estar com você, confira.',
    );
    // Sem caso nao ha chave publica do caso, e `ref` sai vazio. O destino do
    // toque nao depende dele (ver `aviso-ao-tutor-por-push.ts`).
    assert.deepEqual(enviados[0]?.dados, { tipo: 'tagEscaneada', ref: '' });
  });

  void it('NEGATIVO: nem o titulo nem o corpo carregam endereco, ponto ou identificador', async () => {
    const { entrega, enviados } = montar({ [TUTOR]: { a: 'aceito' } });

    for (const casoAberto of [true, false]) {
      await entrega.avisar(aviso({ casoAberto }));
    }

    assert.equal(enviados.length, 2);
    for (const m of enviados) {
      for (const campo of [m.titulo, m.corpo, m.chaveDeAgrupamento, JSON.stringify(m.dados)]) {
        for (const forma of FORMAS_DE_LUGAR) {
          assert.equal(
            forma.regex.test(campo),
            false,
            `REPROVA: o push do aviso ao tutor passou a carregar algo com forma de ` +
              `${forma.nome}. Push aparece na tela de bloqueio, passa por um ` +
              `terceiro em claro e fica no historico do sistema: o produto mostra ` +
              `BAIRRO na tela do caso e o push tem de ser mais pobre que isso ` +
              `(ADR-0010, cabecalho de conteudo-do-push.ts). Campo: ${campo}`,
          );
        }
      }
      // Nem o nome, nem o recado, nem a foto de quem achou. O achador e visto
      // dentro da conversa mediada, e so la.
      assert.equal(m.imagemUrl, undefined);
      assert.deepEqual(Object.keys(m.dados).sort(), ['ref', 'tipo']);
      // **NEM O ID DA CONVERSA**, e esta linha existe por causa de uma
      // tentacao concreta: a area de mensagens do app ganhou a rota
      // `/mensagens/:conversaId`, e mandar o `conversaId` no push abriria a
      // conversa direto. Nao da -- `ConversationId` e `{format: uuid}` no
      // contrato e `conversations` nao tem coluna `ref`: seria UUID interno em
      // superficie publica (ADR-0010 item 6). O toque leva a LISTA, que nao
      // precisa de identificador. A porteira do dominio tambem barra a chave
      // pelo nome; esta asserccao barra o VALOR entrando por `ref`.
      assert.equal(
        'conversation_id' in m.dados || 'conversationId' in m.dados,
        false,
        'REPROVA: o push passou a carregar id de conversa.',
      );
    }
  });

  void it('tutor de OUTRO pet nao recebe nada: a lista de aparelhos e a do dono do aviso', async () => {
    const { entrega, enviados } = montar({
      [OUTRO_TUTOR]: { x: 'aceito', y: 'aceito' },
    });

    const r = await entrega.avisar(aviso({ donoUserId: TUTOR }));

    assert.deepEqual(r, { aceitos: 0, falhos: 0, semAparelho: true });
    assert.equal(
      enviados.length,
      0,
      'REPROVA: o aviso de um pet alcancou aparelho de outro tutor.',
    );
  });

  void it('ISCA: pet com nome de rua e barrado, e o desfecho conta a falha', async () => {
    // A troca esta assumida de olhos abertos no cabecalho de
    // `conteudo-do-push.ts`: a porteira falha FECHADO. Um pet chamado "Rua"
    // perde o push e e coberto pela rede de seguranca por e-mail.
    const { entrega, enviados } = montar({ [TUTOR]: { a: 'aceito' } });

    const r = await entrega.avisar(aviso({ nomeDoPet: 'Rua' }));

    assert.deepEqual(r, { aceitos: 0, falhos: 1, semAparelho: false });
    assert.equal(enviados.length, 0, 'o conteudo e barrado ANTES de qualquer envio');
  });
});
