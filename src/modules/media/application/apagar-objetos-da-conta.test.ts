import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbsoluteUrl, ObjectKey, UserId } from '../../../shared/types/brands.js';
import { comoObjectKey } from '../domain/chave-de-objeto.js';
import type { ObjetoDaConta } from '../ports/media-repository.js';
import type { Classe, ObjectStorage } from '../ports/object-storage.js';
import { criarApagadorDeObjetosDaConta } from './apagar-objetos-da-conta.js';

const TUTORA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;

interface Apagado {
  readonly classe: Classe;
  readonly chave: ObjectKey;
}

function baldeDeMentira(quebrado = false): ObjectStorage & { readonly apagados: Apagado[] } {
  const apagados: Apagado[] = [];
  return {
    apagados,
    delete: (classe, chave) => {
      if (quebrado) return Promise.reject(new Error('o armazenamento recusou'));
      apagados.push({ classe, chave });
      return Promise.resolve();
    },
    createUploadIntent: () => {
      throw new Error('não usado neste arquivo');
    },
    getSignedReadUrl: () => Promise.resolve('https://exemplo.invalid/x' as AbsoluteUrl),
    head: () => Promise.resolve(null),
    get: () => Promise.resolve(Buffer.alloc(0)),
    put: () => Promise.resolve(),
  };
}

function repositorioCom(objetos: readonly ObjetoDaConta[]): {
  chavesDaConta: (dono: UserId) => Promise<readonly ObjetoDaConta[]>;
  perguntou: UserId[];
} {
  const perguntou: UserId[] = [];
  return {
    perguntou,
    chavesDaConta: (dono) => {
      perguntou.push(dono);
      return Promise.resolve(objetos);
    },
  };
}

const OS_TRES_DE_UMA_FOTO: readonly ObjetoDaConta[] = [
  { classe: 'privado', chave: comoObjectKey('pets/pet-1/original/aaaa') },
  { classe: 'publico', chave: comoObjectKey('card/bbbb.webp') },
  { classe: 'publico', chave: comoObjectKey('thumb/cccc.webp') },
];

void describe('SEC-020: os objetos da conta saem do armazenamento', () => {
  void it('apaga os TRÊS objetos de uma foto de pet, e devolve a contagem', async () => {
    const balde = baldeDeMentira();
    const repositorio = repositorioCom(OS_TRES_DE_UMA_FOTO);
    const apagar = criarApagadorDeObjetosDaConta({ repositorio, armazenamento: balde });

    const quantos = await apagar(TUTORA);

    assert.equal(
      quantos,
      3,
      'uma foto de pet confirmada são TRÊS objetos: o original privado e as derivadas ' +
        '`card` e `thumb`, as duas no balde público. Contar um deixa dois no armazenamento.',
    );
    assert.equal(balde.apagados.length, 3);
  });

  void it('cada objeto é apagado no BALDE em que ele está', async () => {
    const balde = baldeDeMentira();
    const apagar = criarApagadorDeObjetosDaConta({
      repositorio: repositorioCom(OS_TRES_DE_UMA_FOTO),
      armazenamento: balde,
    });

    await apagar(TUTORA);

    assert.deepEqual(
      balde.apagados.map((a) => ({ classe: a.classe, chave: String(a.chave) })),
      [
        { classe: 'privado', chave: 'pets/pet-1/original/aaaa' },
        { classe: 'publico', chave: 'card/bbbb.webp' },
        { classe: 'publico', chave: 'thumb/cccc.webp' },
      ],
      'algum objeto foi procurado no balde errado. O 404 do balde errado é tratado como ' +
        'sucesso pela porta, então o arquivo fica lá e ninguém fica sabendo.',
    );
  });

  void it('pergunta as chaves ao DONO, e não varre a tabela', async () => {
    const repositorio = repositorioCom(OS_TRES_DE_UMA_FOTO);
    const apagar = criarApagadorDeObjetosDaConta({
      repositorio,
      armazenamento: baldeDeMentira(),
    });

    await apagar(TUTORA);

    assert.deepEqual(repositorio.perguntou, [TUTORA]);
  });

  void it('conta SEM foto nenhuma não é falha: zero é sucesso', async () => {
    const balde = baldeDeMentira();
    const apagar = criarApagadorDeObjetosDaConta({
      repositorio: repositorioCom([]),
      armazenamento: balde,
    });

    assert.equal(await apagar(TUTORA), 0);
    assert.equal(balde.apagados.length, 0);
  });

  void it('a falha do armazenamento PROPAGA: não há sucesso com arquivo no balde', async () => {
    const apagar = criarApagadorDeObjetosDaConta({
      repositorio: repositorioCom(OS_TRES_DE_UMA_FOTO),
      armazenamento: baldeDeMentira(true),
    });

    const erro = await apagar(TUTORA).then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(
      erro !== undefined,
      'o armazenamento recusou e o apagamento respondeu SUCESSO. O expurgo seguiria para o ' +
        '`DELETE FROM users`, levaria o único ponteiro para o arquivo, e o objeto ficaria ' +
        'no balde sem nome e sem dono. É o resíduo permanente que a ordem existe para ' +
        'não produzir.',
    );
  });
});
