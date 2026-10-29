/**
 * A GALERIA DO PARCEIRO no caso de uso (cliente, 29/10/2026: *"implemente a
 * tabela de galeria entao"*), sem banco, sem servidor e sem Docker.
 *
 * Pedido de origem, dele, em 28/10: *"no backoffice para cadastrar um parceiro,
 * so esta permitindo subir uma foto, deve ser padrao igual na pagina de
 * eventos"*.
 *
 * ## AS ISCAS, provadas NOS DOIS SENTIDOS
 *
 * Cada caso foi conferido reprovando com a regra errada no lugar e passando com
 * a certa:
 *
 * | o que se poe no codigo de producao | reprova |
 * |---|---|
 * | o proposito exigido virando `directory_photo` | 1 |
 * | `errosDaGaleria` sem a conferencia de `upload_id` repetido | 1 |
 * | `errosDaGaleria` sem a conferencia de tamanho de `alt_text` | 1 |
 * | `aplicarGaleria` gravando `''` em vez de nulo na descricao vazia | 1 |
 * | a galeria aplicada ANTES do `UPDATE` que confere a versao | 1 |
 * | a resposta do `POST` devolvendo `criada` sem a releitura | 1 |
 * | `entradaDaImagemDaGaleria` ignorada (imagem de outra entrada aceita) | 1 |
 *
 * ## O QUE ESTE ARQUIVO NAO MEDE
 *
 * - **A projecao da galeria**, que tem arquivo proprio
 *   (`domain/galeria-da-entrada.test.ts`).
 * - **O `CHECK` de `position` e o `UNIQUE` de `image_id`.** Sao do banco, e
 *   quem os mede e a suite de integracao. O dobre daqui NAO os imita de
 *   proposito: um dobre que recusasse por conta propria faria este arquivo
 *   medir a si mesmo.
 * - **A varredura de envios vencidos.** O que se confere aqui e que a
 *   confirmacao ACONTECE; que ela protege a imagem da varredura esta medido em
 *   `media/application/varredura-nao-apaga-a-vitrine.test.ts`.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type {
  ConfirmacaoDeCatalogo,
  EnvioDeCatalogo,
  PropositoDaImagem,
} from '../../media/ports/imagem-de-catalogo.js';
import type { EntradaAdministrativa } from '../domain/escrita-do-diretorio.js';
import type {
  DiretorioAdministrativoRepository,
  ImagemDaGaleriaNaPosicao,
  NovaEntrada,
  TransacaoDoDiretorio,
} from '../ports/diretorio-administrativo.js';

import { DiretorioAdministrativo, type Autor } from './diretorio-administrativo.js';

const AGORA = Date.UTC(2026, 9, 29, 15, 0, 0) as Instant;
const NASCEU_EM = Date.UTC(2026, 9, 20, 12, 0, 0) as Instant;
const ID_DA_CLINICA = '0192a3b4-0000-7000-8000-0000000c1111';
const ID_DE_OUTRA = '0192a3b4-0000-7000-8000-0000000c2222';

const AUTOR: Autor = {
  adminAccountId: '0192a3b4-0000-7000-8000-00000000a0a0' as AdminAccountId,
  sessao: 'a1b2c3d4e5f60718',
  ip: '203.0.113.9',
  correlationId: 'corr-1',
};

const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

/** Um envio aberto, do proposito certo, que ainda nao venceu. */
function envioAberto(id: string, purpose: PropositoDaImagem = 'directory_gallery'): EnvioDeCatalogo {
  return {
    id,
    kind: 'catalog_image',
    purpose,
    // Uma hora a frente de `AGORA`: o caso do vencido tem o seu, abaixo.
    expiresAt: comoData((AGORA + 3_600_000) as Instant),
    confirmedAt: null,
    catalogImageId: null,
  };
}

function entradaSemeada(): EntradaAdministrativa {
  return {
    slug: 'clinica-sao-jorge',
    kinds: ['clinic'],
    entityKind: 'professional',
    displayName: 'Clínica Veterinária São Jorge',
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Vila Mariana',
    postalCode: null,
    street: null,
    streetNumber: null,
    complement: null,
    phoneE164: '+551130612200',
    siteUrl: null,
    logo: null,
    photo: null,
    imagens: [],
    status: 'published',
    source: 'import',
    claimStatus: 'unclaimed',
    verificacoes: [],
    publishedAt: comoData(NASCEU_EM),
    createdAt: comoData(NASCEU_EM),
    updatedAt: comoData(NASCEU_EM),
    version: 3,
  };
}

interface Memoria {
  readonly repositorio: DiretorioAdministrativoRepository;
  readonly linhas: Map<string, EntradaAdministrativa>;
  /** A galeria gravada por entrada, como `substituirImagens` a deixou. */
  readonly galerias: Map<string, readonly ImagemDaGaleriaNaPosicao[]>;
  /** Os envios por `upload_id`. O que nao esta aqui nao existe. */
  readonly envios: Map<string, EnvioDeCatalogo>;
  /** As confirmacoes pedidas, em ordem: e a prova de que a imagem foi criada. */
  readonly confirmacoes: ConfirmacaoDeCatalogo[];
  /** O dono de cada `catalog_images.id` que ja esta em alguma galeria. */
  readonly donosDeImagem: Map<string, string>;
  readonly trilha: AuditEvent[];
  gravou: boolean;
  /** A ORDEM dos efeitos, para provar que a galeria vem depois do `UPDATE`. */
  readonly ordem: string[];
}

function repositorioEmMemoria(): Memoria {
  const linhas = new Map<string, EntradaAdministrativa>([[ID_DA_CLINICA, entradaSemeada()]]);
  const memoria: Memoria = {
    linhas,
    galerias: new Map(),
    envios: new Map(),
    confirmacoes: [],
    donosDeImagem: new Map(),
    trilha: [],
    gravou: false,
    ordem: [],
    repositorio: {
      async emTransacao(trabalho) {
        const antes = new Map([...linhas].map(([k, v]) => [k, { ...v }]));
        const galeriasAntes = new Map(memoria.galerias);
        try {
          const r = await trabalho(transacao());
          memoria.gravou = true;
          return r;
        } catch (erro) {
          // O `ROLLBACK`: a galeria tambem volta, porque ela e escrita na MESMA
          // transacao. Um dobre que nao a desfizesse deixaria passar o caso em
          // que a recusa acontece com meia galeria gravada.
          linhas.clear();
          for (const [k, v] of antes) linhas.set(k, v);
          memoria.galerias.clear();
          for (const [k, v] of galeriasAntes) memoria.galerias.set(k, v);
          memoria.gravou = false;
          throw erro;
        }
      },
      listarEntradas() {
        const itens = [...linhas.values()];
        return Promise.resolve({ itens, total: itens.length });
      },
      entradaPorSlug(slug) {
        return Promise.resolve([...linhas.values()].find((l) => l.slug === slug) ?? null);
      },
    },
  };

  /** A entrada com a galeria que `substituirImagens` deixou, como o `SELECT` a devolveria. */
  function comGaleria(id: string): EntradaAdministrativa {
    const linha = linhas.get(id);
    if (linha === undefined) throw new Error(`${id} nao existe no dobre`);
    return {
      ...linha,
      imagens: (memoria.galerias.get(id) ?? []).map((i) => ({
        uploadId: null,
        imageId: i.imageId,
        position: i.position,
        altText: i.altText,
        status: 'processing' as const,
        publicKey: null,
        rejectionReason: null,
      })),
    };
  }

  function transacao(): TransacaoDoDiretorio {
    return {
      entradaPorSlug: (slug) =>
        Promise.resolve([...linhas.values()].find((l) => l.slug === slug) ?? null),
      idPorSlug: (slug) =>
        Promise.resolve([...linhas].find(([, l]) => l.slug === slug)?.[0] ?? null),
      recarregarEntrada: (id) => {
        memoria.ordem.push('recarregar');
        return Promise.resolve(comGaleria(id));
      },
      inserirEntrada(nova: NovaEntrada) {
        memoria.ordem.push('inserir');
        const criada: EntradaAdministrativa = {
          ...entradaSemeada(),
          slug: nova.slug,
          kinds: nova.kinds,
          displayName: nova.displayName,
          city: nova.city,
          state: nova.state,
          phoneE164: nova.phoneE164,
          status: nova.status,
          imagens: [],
          version: 1,
        };
        linhas.set(nova.id, criada);
        return Promise.resolve(criada);
      },
      atualizarEntrada(id, versaoLida, mudanca, agora) {
        memoria.ordem.push('atualizar');
        const atual = linhas.get(id);
        if (atual === undefined || atual.version !== versaoLida) return Promise.resolve(null);
        const alterada: EntradaAdministrativa = {
          ...atual,
          ...(mudanca.displayName === undefined ? {} : { displayName: mudanca.displayName }),
          ...(mudanca.status === undefined ? {} : { status: mudanca.status }),
          updatedAt: comoData(agora),
          version: atual.version + 1,
        };
        linhas.set(id, alterada);
        return Promise.resolve(alterada);
      },
      removerAvaliacao: () => {
        throw new Error('removerAvaliacao nao e exercitado por este arquivo');
      },
      envioDeCatalogo: (uploadId) => Promise.resolve(memoria.envios.get(uploadId) ?? null),
      confirmarEnvioDeCatalogo: (entrada) => {
        memoria.ordem.push('confirmar');
        memoria.confirmacoes.push(entrada);
        return Promise.resolve();
      },
      entradaDaImagem: () => {
        throw new Error('entradaDaImagem (logo/foto) nao e exercitado por este arquivo');
      },
      entradaDaImagemDaGaleria: (imagemId) =>
        Promise.resolve(memoria.donosDeImagem.get(imagemId) ?? null),
      substituirImagens: (entradaId, imagens) => {
        memoria.ordem.push('substituir');
        memoria.galerias.set(entradaId, imagens);
        return Promise.resolve();
      },
      registrarNaTrilha: (evento) => {
        memoria.trilha.push(evento);
        return Promise.resolve();
      },
    };
  }

  return memoria;
}

let memoria: Memoria;
let diretorio: DiretorioAdministrativo;
let proximoId = 0;

beforeEach(() => {
  memoria = repositorioEmMemoria();
  proximoId = 0;
  diretorio = new DiretorioAdministrativo({
    repositorio: memoria.repositorio,
    // So `uuidv7` e chamado por este arquivo. A assercao larga e a mesma que
    // `diretorio-administrativo.test.ts` usa, e pelo mesmo motivo: declarar os
    // outros tres metodos da porta com valores que ninguem le daria a impressao
    // de que eles sao exercitados.
    ids: {
      uuidv7: () => {
        proximoId += 1;
        return `0192a3b4-0000-7000-8000-0000000d${String(proximoId).padStart(4, '0')}`;
      },
    } as unknown as IdGenerator,
    clock: { now: () => AGORA },
    urlDeMidia: URL_DE_MIDIA,
  });
});

/** O `code` de campo da recusa, ou `undefined` quando o erro nao e de validacao. */
function codigoDoCampo(erro: unknown, campo: string): string | undefined {
  if (!(erro instanceof AppError)) return undefined;
  return erro.errors?.find((e) => e.field === campo)?.code;
}

void describe('a galeria do parceiro, na escrita administrativa', () => {
  void it('o cadastro com galeria confirma cada envio e grava a ordem da lista', async () => {
    memoria.envios.set('e-1', envioAberto('e-1'));
    memoria.envios.set('e-2', envioAberto('e-2'));

    const escrito = await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
      city: 'São Paulo',
      state: 'SP',
      phone_e164: '+551130612200',
      images: [
        { upload_id: 'e-1', alt_text: 'A fachada' },
        { upload_id: 'e-2' },
      ],
    });

    // Os DOIS envios confirmados, e os dois com `purpose: directory_gallery`:
    // e a confirmacao que tira a linha da varredura de vencidos.
    assert.equal(memoria.confirmacoes.length, 2);
    assert.deepEqual(
      memoria.confirmacoes.map((c) => c.purpose),
      ['directory_gallery', 'directory_gallery'],
    );

    // A ORDEM da lista virou `position`, e a posicao 0 e a capa. Nao ha campo
    // de capa: a capa e a primeira, como na `Rede`.
    const galeria = memoria.galerias.get('0192a3b4-0000-7000-8000-0000000d0001');
    assert.deepEqual(
      galeria?.map((i) => i.position),
      [0, 1],
    );
    // `alt_text` ausente grava NULO, e nao `''`: `''` morreria no `CHECK` de
    // tamanho como 500.
    assert.equal(galeria?.[0]?.altText, 'A fachada');
    assert.equal(galeria?.[1]?.altText, null);

    // A RESPOSTA do `POST` ja mostra a galeria: sem a releitura ela sairia
    // `images: []` tendo gravado duas.
    assert.equal(escrito.recurso.images.length, 2);
    assert.ok(memoria.ordem.indexOf('recarregar') > memoria.ordem.indexOf('substituir'));
  });

  void it('o cadastro sem `images` nao toca a galeria e nao confirma envio nenhum', async () => {
    await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
    });
    assert.equal(memoria.confirmacoes.length, 0);
    assert.ok(!memoria.ordem.includes('substituir'));
  });

  void it('envio de OUTRO proposito e recusado com `upload_not_usable` no campo `images`', async () => {
    // T9: o proposito do envio tem de ser o do campo. A foto UNICA do lugar
    // (`directory_photo`) nao serve a galeria, e a recusa nao diz qual dos
    // casos ocorreu (ADR-0021).
    memoria.envios.set('e-1', envioAberto('e-1', 'directory_photo'));

    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
        images: [{ upload_id: 'e-1' }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images'), 'upload_not_usable');
    assert.equal(memoria.gravou, false);
  });

  void it('envio inexistente e envio VENCIDO saem com a MESMA recusa', async () => {
    memoria.envios.set('e-vencido', {
      ...envioAberto('e-vencido'),
      expiresAt: comoData((AGORA - 1) as Instant),
    });

    for (const uploadId of ['e-que-nao-existe', 'e-vencido']) {
      const erro = await diretorio
        .criarEntrada(AUTOR, {
          slug: 'pet-feliz',
          kinds: ['store'],
          display_name: 'Pet Feliz',
          images: [{ upload_id: uploadId }],
        })
        .then(
          () => undefined,
          (e: unknown) => e,
        );
      assert.equal(codigoDoCampo(erro, 'images'), 'upload_not_usable', uploadId);
    }
  });

  void it('imagem ja usada em OUTRA entrada e recusada, e na MESMA entrada e reaproveitada', async () => {
    // O painel manda a galeria inteira a cada salvamento. Recusar o envio ja
    // confirmado DESTA entrada faria a segunda gravacao de um telefone perder
    // todas as fotos.
    memoria.envios.set('e-1', {
      ...envioAberto('e-1'),
      confirmedAt: comoData(NASCEU_EM),
      catalogImageId: 'img-1',
    });

    memoria.donosDeImagem.set('img-1', ID_DE_OUTRA);
    const erro = await diretorio
      .alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', { images: [{ upload_id: 'e-1' }] })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images'), 'upload_not_usable');

    // A MESMA entrada: passa, e sem confirmar de novo.
    memoria.donosDeImagem.set('img-1', ID_DA_CLINICA);
    const escrito = await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      images: [{ upload_id: 'e-1' }],
    });
    assert.equal(escrito.recurso.images.length, 1);
    assert.equal(memoria.confirmacoes.length, 0);
  });

  void it('`upload_id` repetido na mesma lista e `duplicate_upload`, antes de qualquer escrita', async () => {
    // O schema do contrato nao sabe comparar itens entre si. Sem esta recusa a
    // mesma imagem ocuparia duas posicoes, e o `UNIQUE` de
    // `professional_images.image_id` a derrubaria como 500.
    memoria.envios.set('e-1', envioAberto('e-1'));
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
        images: [{ upload_id: 'e-1' }, { upload_id: 'E-1' }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images'), 'duplicate_upload');
    // Nem o `INSERT` aconteceu: a forma e conferida antes da transacao.
    assert.equal(memoria.ordem.length, 0);
  });

  void it('mais de OITO imagens e `too_many_images`', async () => {
    const images = Array.from({ length: 9 }, (_, n) => ({ upload_id: `e-${String(n)}` }));
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
        images,
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images'), 'too_many_images');
  });

  void it('`alt_text` de uma letra e recusado POR POSICAO, e ausente passa', async () => {
    memoria.envios.set('e-1', envioAberto('e-1'));
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
        images: [{ upload_id: 'e-1', alt_text: 'a' }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    // O campo nomeia a POSICAO: a tela marca a moldura certa.
    assert.equal(codigoDoCampo(erro, 'images[0].alt_text'), 'length');

    // Ausente e estado legitimo desde que a galeria nasceu: a descricao e
    // opcional nas tres galerias deste produto.
    await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
      images: [{ upload_id: 'e-1' }],
    });
    assert.equal(memoria.gravou, true);
  });

  void it('`images: []` TIRA todas, e e o unico jeito de dizer isso', async () => {
    memoria.galerias.set(ID_DA_CLINICA, [{ imageId: 'img-1', position: 0, altText: null }]);
    const escrito = await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      images: [],
    });
    assert.deepEqual(memoria.galerias.get(ID_DA_CLINICA), []);
    assert.deepEqual(escrito.recurso.images, []);
  });

  void it('a galeria e escrita DEPOIS do `UPDATE` que confere a versao', async () => {
    // A ordem nao e negociavel: e o `UPDATE ... WHERE version = $2` que confere
    // a versao lida. Substituir a galeria antes dele faria uma escrita que vai
    // morrer em 412 mexer no recurso antes de perder a corrida.
    memoria.envios.set('e-1', envioAberto('e-1'));
    await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      images: [{ upload_id: 'e-1' }],
    });
    assert.ok(
      memoria.ordem.indexOf('atualizar') < memoria.ordem.indexOf('substituir'),
      `ordem medida: ${memoria.ordem.join(' -> ')}`,
    );
  });

  void it('versao errada recusa com 412 e NAO toca a galeria', async () => {
    memoria.envios.set('e-1', envioAberto('e-1'));
    const erro = await diretorio
      .alterarEntrada(AUTOR, 'clinica-sao-jorge', '"1"', { images: [{ upload_id: 'e-1' }] })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'precondition-failed');
    assert.ok(!memoria.ordem.includes('substituir'));
    assert.equal(memoria.confirmacoes.length, 0);
  });

  void it('a trilha da edicao acusa a MUDANCA da quantidade de fotos', async () => {
    memoria.envios.set('e-1', envioAberto('e-1'));
    await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      images: [{ upload_id: 'e-1' }],
    });
    const evento = memoria.trilha.at(-1);
    assert.equal(evento?.before?.['images'], 0);
    assert.equal(evento?.after?.['images'], 1);
  });
});
