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

const COMPLETA_PARA_PUBLICAR = {
  city: 'São Paulo',
  state: 'SP',
  phone_e164: '+551130612200',
} as const;

function envioAberto(id: string, purpose: PropositoDaImagem = 'directory_gallery'): EnvioDeCatalogo {
  return {
    id,
    kind: 'catalog_image',
    purpose,
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
  readonly galerias: Map<string, readonly ImagemDaGaleriaNaPosicao[]>;
  readonly envios: Map<string, EnvioDeCatalogo>;
  readonly confirmacoes: ConfirmacaoDeCatalogo[];
  readonly donosDeImagem: Map<string, string>;
  readonly trilha: AuditEvent[];
  gravou: boolean;
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
          publishedAt: nova.gravaMarcoDePublicacao === true ? comoData(nova.agora) : null,
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
      ...COMPLETA_PARA_PUBLICAR,
      images: [
        { upload_id: 'e-1', alt_text: 'A fachada' },
        { upload_id: 'e-2' },
      ],
    });

    assert.equal(memoria.confirmacoes.length, 2);
    assert.deepEqual(
      memoria.confirmacoes.map((c) => c.purpose),
      ['directory_gallery', 'directory_gallery'],
    );

    const galeria = memoria.galerias.get('0192a3b4-0000-7000-8000-0000000d0001');
    assert.deepEqual(
      galeria?.map((i) => i.position),
      [0, 1],
    );
    assert.equal(galeria?.[0]?.altText, 'A fachada');
    assert.equal(galeria?.[1]?.altText, null);

    assert.equal(escrito.recurso.images.length, 2);
    assert.ok(memoria.ordem.indexOf('recarregar') > memoria.ordem.indexOf('substituir'));
  });

  void it('o cadastro sem `images` nao toca a galeria e nao confirma envio nenhum', async () => {
    await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(memoria.confirmacoes.length, 0);
    assert.ok(!memoria.ordem.includes('substituir'));
  });

  void it('envio de OUTRO proposito e recusado com `upload_not_usable` no campo `images`', async () => {
    memoria.envios.set('e-1', envioAberto('e-1', 'directory_photo'));

    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
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
      ...COMPLETA_PARA_PUBLICAR,
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

    memoria.donosDeImagem.set('img-1', ID_DA_CLINICA);
    const escrito = await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      images: [{ upload_id: 'e-1' }],
    });
    assert.equal(escrito.recurso.images.length, 1);
    assert.equal(memoria.confirmacoes.length, 0);
  });

  void it('`upload_id` repetido na mesma lista e `duplicate_upload`, antes de qualquer escrita', async () => {
    memoria.envios.set('e-1', envioAberto('e-1'));
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
        images: [{ upload_id: 'e-1' }, { upload_id: 'E-1' }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images'), 'duplicate_upload');
    assert.equal(memoria.ordem.length, 0);
  });

  void it('mais de OITO imagens e `too_many_images`', async () => {
    const images = Array.from({ length: 9 }, (_, n) => ({ upload_id: `e-${String(n)}` }));
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
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
      ...COMPLETA_PARA_PUBLICAR,
        images: [{ upload_id: 'e-1', alt_text: 'a' }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.equal(codigoDoCampo(erro, 'images[0].alt_text'), 'length');

    await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
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
