import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Mensagem } from '../../identity/ports/mailer.js';
import type { UserId } from '../../../shared/types/brands.js';
import type {
  AvisoAoTutorParaEntrega,
  ResultadoDoAvisoAoTutor,
} from '../ports/aviso-ao-tutor.js';
import {
  avisarTutorDoAchado,
  montarAvisoDoAchadoParaTutor,
  type DependenciasDoAvisoAoTutor,
} from './avisar-tutor-do-achado.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const BASE = 'https://bichu.exemplo.invalido';

function bancada(opcoes: {
  aviso?: AvisoAoTutorParaEntrega | null;
  entrega?: ResultadoDoAvisoAoTutor;
  email?: string | undefined;
  mailFalha?: boolean;
}) {
  const avisados: AvisoAoTutorParaEntrega[] = [];
  const enviados: Mensagem[] = [];
  const deps: DependenciasDoAvisoAoTutor = {
    avisos: {
      avisoDoAchado: () =>
        Promise.resolve(
          opcoes.aviso === undefined
            ? {
                donoUserId: TUTOR,
                nomeDoPet: 'Thor',
                casoAberto: true,
                tokenPublicoDoCaso: 'st_caso',
              }
            : opcoes.aviso,
        ),
    },
    entrega: {
      avisar: (a) => {
        avisados.push(a);
        return Promise.resolve(
          opcoes.entrega ?? { aceitos: 1, falhos: 0, semAparelho: false },
        );
      },
    },
    mailer: {
      enviar: (m) => {
        if (opcoes.mailFalha === true) return Promise.reject(new Error('provedor fora do ar'));
        enviados.push(m);
        return Promise.resolve();
      },
    },
    contas: {
      emailVerificadoDe: () =>
        Promise.resolve('email' in opcoes ? opcoes.email : 'tutor@exemplo.invalido'),
    },
  };
  return { deps, avisados, enviados };
}

void describe('ISCA — o trabalho que avisa o tutor', () => {
  void it('push e e-mail saem na MESMA passagem, e o desfecho conta os dois', async () => {
    const { deps, avisados, enviados } = bancada({});

    const desfecho = await avisarTutorDoAchado(deps, 'aviso-1', BASE);

    assert.deepEqual(desfecho, {
      tipo: 'avisado',
      email: 'enviado',
      aceitos: 1,
      falhos: 0,
      semAparelho: false,
    });
    assert.equal(avisados.length, 1);
    assert.equal(
      enviados.length,
      1,
      'REPROVA: o e-mail deixou de sair quando o push foi aceito. `aceitos` e ' +
        'prova de que o provedor aceitou a mensagem, nao de que a pessoa leu.',
    );
  });

  void it('push barrado em TODO aparelho (o 403 de hml) nao impede o e-mail', async () => {
    const { deps, enviados } = bancada({
      entrega: { aceitos: 0, falhos: 2, semAparelho: false },
    });

    const desfecho = await avisarTutorDoAchado(deps, 'aviso-1', BASE);

    assert.equal(desfecho.tipo === 'avisado' && desfecho.email, 'enviado');
    assert.equal(
      enviados.length,
      1,
      'REPROVA: com o push falhando em todos os aparelhos, o tutor ficou sem ' +
        'nenhum canal. E exatamente o estado de hml hoje.',
    );
  });

  void it('tutor sem e-mail verificado: o desfecho diz, e nada e inventado', async () => {
    const { deps, enviados } = bancada({ email: undefined });

    const desfecho = await avisarTutorDoAchado(deps, 'aviso-1', BASE);

    assert.equal(desfecho.tipo === 'avisado' && desfecho.email, 'sem_endereco');
    assert.equal(enviados.length, 0);
  });

  void it('provedor de e-mail fora do ar nao derruba o trabalho: o push ja saiu', async () => {
    const { deps } = bancada({ mailFalha: true });

    const desfecho = await avisarTutorDoAchado(deps, 'aviso-1', BASE);

    assert.equal(desfecho.tipo === 'avisado' && desfecho.email, 'falhou');
  });

  void it('aviso que sumiu e DESFECHO e nao falha: nada e enviado e nada estoura', async () => {
    const { deps, avisados, enviados } = bancada({ aviso: null });

    assert.deepEqual(await avisarTutorDoAchado(deps, 'aviso-1', BASE), { tipo: 'sem_aviso' });
    assert.equal(avisados.length, 0);
    assert.equal(enviados.length, 0);
  });

  void it('o aviso entregue e o LIDO, e nao um montado aqui', async () => {
    const lido: AvisoAoTutorParaEntrega = {
      donoUserId: TUTOR,
      nomeDoPet: 'Nina',
      casoAberto: false,
      tokenPublicoDoCaso: null,
    };
    const { deps, avisados } = bancada({ aviso: lido });

    await avisarTutorDoAchado(deps, 'aviso-1', BASE);

    assert.deepEqual(avisados[0], lido);
  });
});

void describe('ISCA — o texto do e-mail de rede de seguranca', () => {
  void it('caso aberto: diz que alguem esta com o animal, e nomeia o pet', () => {
    const m = montarAvisoDoAchadoParaTutor('tutor@exemplo.invalido', {
      nomeDoPet: 'Thor',
      casoAberto: true,
    }, BASE);

    assert.equal(m.para, 'tutor@exemplo.invalido');
    assert.equal(m.assunto, 'Alguem esta com Thor');
    assert.match(m.corpo, /escanear a plaquinha de Thor/u);
    assert.match(m.corpo, /dentro do aplicativo/u);
    assert.ok(m.corpo.includes(BASE));
  });

  void it('sem caso aberto: o texto nao afirma que o animal foi achado', () => {
    const m = montarAvisoDoAchadoParaTutor('tutor@exemplo.invalido', {
      nomeDoPet: 'Nina',
      casoAberto: false,
    }, BASE);

    assert.equal(m.assunto, 'Alguem escaneou a plaquinha de Nina');
    assert.match(m.corpo, /deveria estar com voce/u);
    assert.equal(
      /esta com o animal/u.test(m.corpo),
      false,
      'REPROVA: o texto do pet sem caso aberto passou a afirmar um fato que ' +
        'o produto nao sabe. A plaquinha foi escaneada; nao ha aviso de posse.',
    );
  });

  void it('NEGATIVO: o e-mail nao leva nada do achador nem do lugar nem o token dele', () => {
    for (const casoAberto of [true, false]) {
      const m = montarAvisoDoAchadoParaTutor('tutor@exemplo.invalido', {
        nomeDoPet: 'Thor',
        casoAberto,
      }, BASE);
      const texto = `${m.assunto}\n${m.corpo}`;
      for (const [nome, regex] of [
        ['logradouro', /\b(?:rua|avenida|alameda|travessa|rodovia|estrada)\b/iu],
        ['CEP', /\b\d{5}-?\d{3}\b/u],
        ['coordenada', /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/u],
        ['telefone', /\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/u],
        ['UUID', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu],
        ['link da conversa do achador', /\/c\//u],
      ] as const) {
        assert.equal(
          regex.test(texto),
          false,
          `REPROVA: o e-mail ao tutor passou a carregar ${nome}. O achador e ` +
            `visto dentro da conversa mediada, e so la; lugar nao e resolvido ` +
            `neste caminho.`,
        );
      }
    }
  });

  void it('a base da web entra sem barra dobrada, venha ela com barra ou sem', () => {
    const comBarra = montarAvisoDoAchadoParaTutor('t@e.invalido', { nomeDoPet: 'Thor', casoAberto: true }, `${BASE}/`);
    assert.equal(/\/\/$|invalido\/\//u.test(comBarra.corpo), false);
    assert.ok(comBarra.corpo.includes(BASE));
  });
});
