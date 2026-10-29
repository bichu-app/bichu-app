/**
 * A FRONTEIRA DA FILA DE INDICACAO, medida: **a imagem de uma indicacao que
 * ninguem aprovou nao tem caminho ate superficie publica.**
 *
 * Pedido do cliente de 29/10/2026: *"nao tem o campo do logotipo para o usuario
 * subir e indicar o estabelecimento"*. A indicacao vem de USUARIO, e e por isso
 * que a fila de revisao existe -- publicar sobre um terceiro que nao pediu nao
 * pode acontecer sem alguem olhar.
 *
 * ## O QUE GARANTE ISSO, E POR QUE NAO E PROSA
 *
 * `purpose` e o que amarra o envio ao destino (T9). O logotipo da indicacao e
 * assinado com `directory_suggestion_logo`, que e **separado** de
 * `directory_logo`:
 *
 * - `imagemDoEnvio` (em `diretorio-administrativo.ts`) exige `directory_logo`
 *   para aceitar um `upload_id` em `professionals.logo_image_id` -- e
 *   `professionals` E a superficie publica (`DirectoryEntrySummary`,
 *   `DirectoryEntry`);
 * - a escrita da indicacao exige o proposito inverso, na clausula `WHERE` da
 *   consulta do adaptador.
 *
 * **Com UM proposito para os dois, as duas direcoes estariam abertas** e a unica
 * defesa seria lembrar de conferir. Este arquivo mede a direcao que importa --
 * a que leva ao `Perto` --, e ela e mensuravel sem banco porque e uma
 * comparacao de valor no caso de uso.
 *
 * ## O QUE ESTE ARQUIVO NAO MEDE, e onde esta medido
 *
 * - **A direcao inversa** (envio do PAINEL recusado pela indicacao) e a
 *   clausula `WHERE` de `kysely-directory-suggestion-repository.ts`, e `WHERE`
 *   nao e mensuravel com dobre: um dobre que o imitasse faria este arquivo medir
 *   a si mesmo. Ela esta na suite de INTEGRACAO
 *   (`tests/integration/logotipo-da-indicacao.test.ts`).
 * - **O conjunto exato dos nove propositos** nos dois `CHECK`, que e do banco
 *   (`tests/integration/conjunto-exato-dos-checks.test.ts`).
 *
 * ## AS ISCAS, provadas NOS DOIS SENTIDOS
 *
 * | o que se poe no codigo de producao | reprova |
 * |---|---|
 * | `imagemDoEnvio` chamada com `'directory_suggestion_logo'` na logo | 1 (o controle positivo, invertido) |
 * | o proposito exigido na logo virando o da indicacao | 1 |
 *
 * **O CONTROLE POSITIVO ESTA NO PROPRIO ARQUIVO**, e nao e opcional: sem o caso
 * que ACEITA `directory_logo`, um `imagemDoEnvio` que recusasse TUDO deixaria o
 * caso da recusa verde e a logo do painel quebrada. Recusa sem aceitacao medida
 * nao e fronteira, e sim porta trancada.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import {
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  type ConfirmacaoDeCatalogo,
  type EnvioDeCatalogo,
  type PropositoDaImagem,
} from '../../media/ports/imagem-de-catalogo.js';
import type { EntradaAdministrativa } from '../domain/escrita-do-diretorio.js';
import type {
  DiretorioAdministrativoRepository,
  NovaEntrada,
  TransacaoDoDiretorio,
} from '../ports/diretorio-administrativo.js';

import { DiretorioAdministrativo, type Autor } from './diretorio-administrativo.js';

const AGORA = Date.UTC(2026, 9, 29, 15, 0, 0) as Instant;
const NASCEU_EM = Date.UTC(2026, 9, 20, 12, 0, 0) as Instant;
const ID_DA_CLINICA = '0192a3b4-0000-7000-8000-0000000c1111';

const AUTOR: Autor = {
  adminAccountId: '0192a3b4-0000-7000-8000-00000000a0a0' as AdminAccountId,
  sessao: 'a1b2c3d4e5f60718',
  ip: '203.0.113.9',
  correlationId: 'corr-1',
};

const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

/** Cidade, UF e telefone, que a criacao cobra desde 29/10/2026. */
const COMPLETA_PARA_PUBLICAR = {
  city: 'São Paulo',
  state: 'SP',
  phone_e164: '+551130612200',
} as const;

/** Um envio aberto, do proposito pedido, que ainda nao venceu. */
function envioAberto(id: string, purpose: PropositoDaImagem): EnvioDeCatalogo {
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
  readonly envios: Map<string, EnvioDeCatalogo>;
  readonly confirmacoes: ConfirmacaoDeCatalogo[];
  readonly trilha: AuditEvent[];
  gravou: boolean;
}

function repositorioEmMemoria(): Memoria {
  const linhas = new Map<string, EntradaAdministrativa>([[ID_DA_CLINICA, entradaSemeada()]]);
  const memoria: Memoria = {
    linhas,
    envios: new Map(),
    confirmacoes: [],
    trilha: [],
    gravou: false,
    repositorio: {
      async emTransacao(trabalho) {
        const antes = new Map([...linhas].map(([k, v]) => [k, { ...v }]));
        try {
          const r = await trabalho(transacao());
          memoria.gravou = true;
          return r;
        } catch (erro) {
          linhas.clear();
          for (const [k, v] of antes) linhas.set(k, v);
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

  function transacao(): TransacaoDoDiretorio {
    return {
      entradaPorSlug: (slug) =>
        Promise.resolve([...linhas.values()].find((l) => l.slug === slug) ?? null),
      idPorSlug: (slug) =>
        Promise.resolve([...linhas].find(([, l]) => l.slug === slug)?.[0] ?? null),
      recarregarEntrada: (id) => {
        const linha = linhas.get(id);
        if (linha === undefined) throw new Error(`${id} nao existe no dobre`);
        return Promise.resolve(linha);
      },
      inserirEntrada(nova: NovaEntrada) {
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
      atualizarEntrada: () => {
        throw new Error('atualizarEntrada nao e exercitado por este arquivo');
      },
      removerAvaliacao: () => {
        throw new Error('removerAvaliacao nao e exercitado por este arquivo');
      },
      envioDeCatalogo: (uploadId) => Promise.resolve(memoria.envios.get(uploadId) ?? null),
      confirmarEnvioDeCatalogo: (entrada) => {
        memoria.confirmacoes.push(entrada);
        return Promise.resolve();
      },
      // **LANCA, e nao devolve nulo.** Este arquivo nunca chega aqui: ele so
      // exercita envio ABERTO (`confirmedAt: null`), e `entradaDaImagem` so e
      // consultada no ramo do envio ja confirmado. Um `() => null` faria um
      // caso que caisse naquele ramo passar como se tivesse medido a recusa.
      entradaDaImagem: () => {
        throw new Error('entradaDaImagem nao e exercitado por este arquivo');
      },
      entradaDaImagemDaGaleria: () => {
        throw new Error('entradaDaImagemDaGaleria nao e exercitado por este arquivo');
      },
      substituirImagens: () => {
        throw new Error('substituirImagens nao e exercitado por este arquivo');
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

void describe('o logotipo da INDICACAO nao entra em entrada do diretorio', () => {
  void it('o envio de `directory_suggestion_logo` e RECUSADO em `logo_upload_id`', async () => {
    // **O caso central da fronteira.** Um `upload_id` assinado pela rota do
    // aplicativo (`createDirectorySuggestionLogoUploadIntent`) chega a escrita
    // administrativa, que publica em superficie publica. Ele tem de ser
    // recusado -- e o motivo e o proposito, nao a autoria: a escrita
    // administrativa nao confere autoria de envio (ela e do painel), entao o
    // proposito e a unica conferencia que existe neste caminho.
    memoria.envios.set('e-1', envioAberto('e-1', PROPOSITO_DO_LOGOTIPO_DA_INDICACAO));

    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'pet-feliz',
        kinds: ['store'],
        display_name: 'Pet Feliz',
        ...COMPLETA_PARA_PUBLICAR,
        logo_upload_id: 'e-1',
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.equal(
      codigoDoCampo(erro, 'logo_upload_id'),
      'upload_not_usable',
      'REPROVA: a escrita do diretorio ACEITOU um envio assinado para uma ' +
        'indicacao. `professionals` sai em `DirectoryEntrySummary` e em ' +
        '`DirectoryEntry`, entao a logo de uma indicacao que ninguem aprovou ' +
        'acabou de chegar ao `Perto`. Isto e a razao de os dois propositos ' +
        'serem separados -- ver a prosa de `directory_suggestion_logo` em ' +
        '`media/ports/imagem-de-catalogo.ts`.',
    );
    // NADA foi gravado, e nenhuma imagem foi confirmada: a recusa acontece
    // ANTES do `INSERT`, dentro da transacao que volta inteira.
    assert.equal(memoria.gravou, false);
    assert.deepEqual(memoria.confirmacoes, []);
  });

  void it('CONTROLE POSITIVO: o envio de `directory_logo` e ACEITO e confirmado', async () => {
    // Sem este caso o de cima nao prova nada: um `imagemDoEnvio` que recusasse
    // TODO envio o deixaria verde e quebraria a logo do painel ao mesmo tempo.
    memoria.envios.set('e-1', envioAberto('e-1', 'directory_logo'));

    await diretorio.criarEntrada(AUTOR, {
      slug: 'pet-feliz',
      kinds: ['store'],
      display_name: 'Pet Feliz',
      ...COMPLETA_PARA_PUBLICAR,
      logo_upload_id: 'e-1',
    });

    assert.equal(memoria.gravou, true);
    assert.deepEqual(
      memoria.confirmacoes.map((c) => c.purpose),
      ['directory_logo'],
      'REPROVA: a logo do PAINEL deixou de ser aceita. A fronteira da ' +
        'indicacao nao pode custar o caminho que ja funcionava.',
    );
  });

  void it('os dois propositos sao valores DIFERENTES, e nao apelidos', () => {
    // A afirmacao mais barata do arquivo, e a que fecha a brecha mais tentadora:
    // alguem "simplificando" o `enum` faria
    // `PROPOSITO_DO_LOGOTIPO_DA_INDICACAO === 'directory_logo'`, e os dois casos
    // acima continuariam verdes -- o primeiro por aceitar o que devia recusar
    // nao e detectavel quando os dois valores sao o mesmo.
    // **Sem `as string` e sem argumento de tipo**, e as duas ausencias foram
    // apontadas por ferramenta: o `eslint` reprovou `as string` como assercao
    // desnecessaria e o `tsc` reprovou `notEqual<string>` com "Expected 0 type
    // arguments". O que o caso mede nao e o tipo, e o VALOR.
    assert.notEqual(
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
      'directory_logo',
      'REPROVA: o proposito do logotipo da indicacao virou `directory_logo`. ' +
        'Os dois casos acima passam a medir a mesma coisa, e a fronteira da ' +
        'fila de revisao deixou de existir sem nenhum teste ficar vermelho.',
    );
    assert.equal(PROPOSITO_DO_LOGOTIPO_DA_INDICACAO, 'directory_suggestion_logo');
  });
});
