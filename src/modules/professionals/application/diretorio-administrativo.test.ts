/**
 * O caso de uso da escrita administrativa do diretorio, sem banco e sem
 * servidor.
 *
 * O duble e um repositorio em memoria que imita as duas coisas que o banco
 * garante e de que o caso de uso depende: **a versao lida no `WHERE`** (zero
 * linhas quando ela mudou) e o **`ROLLBACK`** quando algo lanca dentro da
 * transacao. A prova contra Postgres de verdade, pela rota, pertence a suite de
 * integracao.
 *
 * ## As iscas deste arquivo
 *
 * - **sem `If-Match`, 428 ANTES de ler o recurso**: a escrita nao chega a
 *   perguntar se a entrada existe;
 * - **versao velha, 412 sem gravar**;
 * - **`If-Match` com o sufixo da borda (`"3-gzip"`) PASSA**: foi esse sufixo
 *   que custou dias de "nao esta sendo salvo" em hml;
 * - **a entrada nasce rascunho, `import` e `unclaimed`**;
 * - **toda escrita grava a trilha**, com a acao do contrato e o `id` INTERNO;
 * - **a falha da trilha desfaz a escrita**;
 * - **editar nao despublica**;
 * - **a UF e gravada em maiuscula**: `sp` e `SP` na mesma coluna fariam o
 *   filtro da listagem perder metade das linhas sem erro nenhum;
 * - **o `id` interno nunca sai na resposta**.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import { comoData } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { EntradaAdministrativa } from '../domain/escrita-do-diretorio.js';
import {
  SlugOcupado,
  type DiretorioAdministrativoRepository,
  type MudancaDaEntrada,
  type NovaEntrada,
  type RecorteDeEntradas,
  type TransacaoDoDiretorio,
} from '../ports/diretorio-administrativo.js';

import { DiretorioAdministrativo, type Autor } from './diretorio-administrativo.js';

const AGORA = Date.UTC(2026, 9, 17, 15, 0, 0) as Instant;
const AUTOR: Autor = {
  adminAccountId: '0192a3b4-0000-7000-8000-00000000a0a0' as AdminAccountId,
  sessao: 'a1b2c3d4e5f60718',
  ip: '203.0.113.9',
  correlationId: 'corr-1',
};

// `comoData` e nao `new Date(...)`: a regra de arquitetura proibe construir
// tempo real em `application/`, e vale tambem para o teste.
const NASCEU_EM = Date.UTC(2026, 8, 30, 12, 0, 0) as Instant;
const NO_AR_DESDE = Date.UTC(2026, 9, 1, 12, 0, 0) as Instant;
const MEXERAM_EM = Date.UTC(2026, 9, 2, 12, 0, 0) as Instant;

const ID_DA_CLINICA = '0192a3b4-0000-7000-8000-0000000c1111';

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
    logo: null,
    photo: null,
    // A GALERIA (29/10/2026). VAZIA nesta fixa, que e o estado normal: a
    // publicacao nao cobra imagem, e a galeria tem casos proprios.
    imagens: [],
    // O endereco de rua existe na entrada desde 18/10/2026 e e OPCIONAL: esta
    // fixa o deixa nulo de proposito, porque uma entrada sem endereco tem de
    // continuar completa para publicar.
    postalCode: null,
    street: null,
    streetNumber: null,
    complement: null,
    phoneE164: '+551130612200',
    siteUrl: null,
    status: 'published',
    source: 'import',
    claimStatus: 'unclaimed',
    verificacoes: [],
    publishedAt: comoData(NO_AR_DESDE),
    createdAt: comoData(NASCEU_EM),
    updatedAt: comoData(MEXERAM_EM),
    version: 3,
  };
}

interface Memoria {
  readonly repositorio: DiretorioAdministrativoRepository;
  readonly trilha: AuditEvent[];
  /** Liga a falha da trilha, para provar que a escrita e desfeita. */
  trilhaFalha: boolean;
  /** As entradas por `id`. */
  readonly linhas: Map<string, EntradaAdministrativa>;
  /** O ultimo `commit` aconteceu? `false` quando a transacao foi desfeita. */
  gravou: boolean;
}

function repositorioEmMemoria(): Memoria {
  const linhas = new Map<string, EntradaAdministrativa>([[ID_DA_CLINICA, entradaSemeada()]]);
  const memoria: Memoria = {
    linhas,
    trilha: [],
    trilhaFalha: false,
    gravou: false,
    repositorio: {
      async emTransacao(trabalho) {
        // Copia antes, devolve a copia se algo lancar: e o `ROLLBACK`.
        const antes = new Map([...linhas].map(([k, v]) => [k, { ...v }]));
        const trilhaAntes = [...memoria.trilha];
        try {
          const r = await trabalho(transacao());
          memoria.gravou = true;
          return r;
        } catch (erro) {
          linhas.clear();
          for (const [k, v] of antes) linhas.set(k, v);
          memoria.trilha.length = 0;
          memoria.trilha.push(...trilhaAntes);
          memoria.gravou = false;
          throw erro;
        }
      },
      listarEntradas(recorte: RecorteDeEntradas) {
        const itens = [...linhas.values()].filter(
          (l) =>
            (recorte.status === undefined || l.status === recorte.status) &&
            // PERTINENCIA, como o adaptador de verdade (`= ANY(kinds)`). Igualdade
            // aqui faria o dobre discordar do banco: a entrada de tres
            // atividades nao apareceria no chip das outras duas, e o caso
            // passaria num dobre que mente.
            (recorte.kind === undefined || l.kinds.includes(recorte.kind)),
        );
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
      // A MODERACAO DA AVALIACAO (18/10/2026) NAO E EXERCITADA NESTE ARQUIVO.
      //
      // **Nao e corpo vazio**, e a diferenca importa: `() => null` faria um
      // caso que chegasse aqui ver "nao encontrado" e passar como se tivesse
      // medido a regra do 404. Este arquivo cobre a escrita da ENTRADA do
      // diretorio; a remocao de avaliacao tem outro dobre, no arquivo dela.
      removerAvaliacao: () => {
        throw new Error('removerAvaliacao nao e exercitado por este arquivo');
      },
      // A LOGO E A FOTO (18/10/2026) NAO SAO EXERCITADAS NESTE ARQUIVO, e os
      // tres dubles LANCAM em vez de devolver nulo pelo mesmo motivo de
      // `removerAvaliacao`: um `() => null` faria um caso que chegasse aqui
      // passar como se tivesse medido a recusa de envio. A regra da imagem tem
      // dobre proprio, em `imagem-da-entrada-do-diretorio.test.ts`.
      envioDeCatalogo: () => {
        throw new Error('envioDeCatalogo nao e exercitado por este arquivo');
      },
      confirmarEnvioDeCatalogo: () => {
        throw new Error('confirmarEnvioDeCatalogo nao e exercitado por este arquivo');
      },
      entradaDaImagem: () => {
        throw new Error('entradaDaImagem nao e exercitado por este arquivo');
      },
      // A GALERIA (29/10/2026) NAO E EXERCITADA NESTE ARQUIVO, e os dois dubles
      // LANCAM pela mesma razao dos tres acima: um `() => null` faria um caso
      // que chegasse aqui passar como se tivesse medido a recusa de envio.
      entradaDaImagemDaGaleria: () => {
        throw new Error('entradaDaImagemDaGaleria nao e exercitado por este arquivo');
      },
      substituirImagens: () => {
        throw new Error('substituirImagens nao e exercitado por este arquivo');
      },
      // `recarregarEntrada` SO e chamada quando o corpo trouxe `images`, e
      // nenhum caso deste arquivo traz: lancar e o que prova isso. Devolver a
      // linha guardada faria um caso futuro com galeria passar sem a releitura
      // ter acontecido.
      recarregarEntrada: (id: string) => {
        const linha = linhas.get(id);
        if (linha === undefined) throw new Error(`recarregarEntrada: ${id} nao existe no dobre`);
        return Promise.resolve(linha);
      },
      inserirEntrada(nova: NovaEntrada) {
        if ([...linhas.values()].some((l) => l.slug === nova.slug)) throw new SlugOcupado();
        const criada: EntradaAdministrativa = {
          slug: nova.slug,
          kinds: nova.kinds,
          // O MESMO padrao do adaptador de verdade
          // (`kysely-diretorio-administrativo.ts`): ausente vale
          // `professional`. Repetido aqui de proposito -- um dobre que
          // guardasse `undefined` deixaria passar o caso em que a aplicacao
          // esquece de resolver o padrao.
          entityKind: nova.entityKind ?? 'professional',
          displayName: nova.displayName,
          logo: null,
          photo: null,
          imagens: [],
          about: nova.about,
          city: nova.city,
          state: nova.state,
          neighborhood: nova.neighborhood,
          postalCode: nova.postalCode,
          street: nova.street,
          streetNumber: nova.streetNumber,
          complement: nova.complement,
          phoneE164: nova.phoneE164,
          siteUrl: null,
          status: nova.status,
          source: nova.source,
          claimStatus: nova.claimStatus,
          verificacoes: [],
          // O MARCO so quando a entrada NASCE no ar (cliente, 29/10/2026). O
          // dobre o honra em vez de fixar `null`: `null` fixo faria o caso do
          // padrao publicado passar sem a coluna ter sido escrita, que e
          // exatamente o defeito que o adaptador de verdade podia ter.
          publishedAt: nova.gravaMarcoDePublicacao === true ? comoData(nova.agora) : null,
          createdAt: comoData(nova.agora),
          updatedAt: comoData(nova.agora),
          version: 1,
        };
        linhas.set(nova.id, criada);
        return Promise.resolve(criada);
      },
      atualizarEntrada(id, versaoLida, mudanca: MudancaDaEntrada, agora) {
        const atual = linhas.get(id);
        // A versao no `WHERE`: zero linhas quando ela mudou.
        if (atual === undefined || atual.version !== versaoLida) return Promise.resolve(null);
        const alterada: EntradaAdministrativa = {
          ...atual,
          ...(mudanca.slug === undefined ? {} : { slug: mudanca.slug }),
          ...(mudanca.kinds === undefined ? {} : { kinds: mudanca.kinds }),
          ...(mudanca.entityKind === undefined ? {} : { entityKind: mudanca.entityKind }),
          ...(mudanca.displayName === undefined ? {} : { displayName: mudanca.displayName }),
          ...(mudanca.about === undefined ? {} : { about: mudanca.about }),
          ...(mudanca.city === undefined ? {} : { city: mudanca.city }),
          ...(mudanca.state === undefined ? {} : { state: mudanca.state }),
          ...(mudanca.neighborhood === undefined ? {} : { neighborhood: mudanca.neighborhood }),
          ...(mudanca.phoneE164 === undefined ? {} : { phoneE164: mudanca.phoneE164 }),
          ...(mudanca.status === undefined ? {} : { status: mudanca.status }),
          ...(mudanca.gravaMarcoDePublicacao === true ? { publishedAt: comoData(agora) } : {}),
          updatedAt: comoData(agora),
          version: atual.version + 1,
        };
        linhas.set(id, alterada);
        return Promise.resolve(alterada);
      },
      registrarNaTrilha(evento) {
        if (memoria.trilhaFalha) throw new Error('trilha indisponivel');
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
    // Só `uuidv7` é exercitado aqui; os outros três métodos da porta não têm
    // chamador nesta fatia, e um dublê que os implementasse fingiria cobertura.
    ids: {
      uuidv7: () => `0192a3b4-0000-7000-8000-00000000f0${String(++proximoId).padStart(2, '0')}`,
    } as unknown as IdGenerator,
    // Nenhuma entrada deste arquivo tem imagem, entao esta funcao nunca e
    // chamada. Ela existe porque a porta a exige, e um valor que gritasse
    // deixaria claro no dia em que alguem acrescentar um caso com imagem.
    urlDeMidia: (chave) => `https://midia.invalido/${chave}`,
    clock: { now: () => AGORA },
  });
});

async function tipoDoErro(trabalho: () => Promise<unknown>): Promise<string> {
  try {
    await trabalho();
    return 'nenhum';
  } catch (erro) {
    return erro instanceof AppError ? erro.problemType : 'outro';
  }
}

/**
 * O CORPO MINIMO DE UMA CRIACAO QUE PUBLICA (cliente, 29/10/2026).
 *
 * Desde 29/10 a entrada nasce `published` e publicar COBRA cidade, UF e
 * telefone. Os casos abaixo que medem OUTRA coisa -- a UF em maiuscula, o `id`
 * fora da resposta, a trilha, o 409 do slug -- partem daqui para nao reprovarem
 * pela regra que nao e o assunto deles.
 *
 * **Eles nao passaram a mandar `status: draft`**, e a escolha e deliberada: com
 * `draft` eles mediriam o caminho que o painel deixou de usar por padrao.
 */
const COMPLETA_PARA_PUBLICAR = {
  city: 'São Paulo',
  state: 'SP',
  phone_e164: '+551130612200',
} as const;

void describe('criar', () => {
  void it('a entrada nasce PUBLICADA, por importacao e sem titular (cliente, 29/10/2026)', async () => {
    // *"cobrar os dados no cadastro"*, sobre *"ele ja deve salvar com o padrao
    // publicado e nao como rascunho"*. SEM `status` no corpo: e o PADRAO que
    // mudou, e e o padrao que este caso mede.
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'passeios-da-bia',
      kind: 'walker',
      display_name: 'Passeios da Bia',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(criada.recurso.status, 'published');
    assert.equal(criada.recurso.source, 'import');
    assert.equal(criada.recurso.claim_status, 'unclaimed');
    // O MARCO: entrada que nasce no ar tem `published_at`. Nulo aqui faria o
    // painel ler uma entrada publicada como rascunho.
    assert.notEqual(criada.recurso.published_at, null);
    assert.equal(criada.recurso.missing_to_publish.length, 0);
    assert.equal(criada.etag, '"1"');
  });

  void it('sem cidade, UF e telefone o SERVIDOR recusa, nomeando os tres', async () => {
    // A recusa e daqui e nao do formulario: um chamador que mande o corpo
    // direto recebe o mesmo `400` com os campos nomeados. Portao no servidor.
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'passeios-da-bia',
        kind: 'walker',
        display_name: 'Passeios da Bia',
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(
      erro.errors?.map((e) => e.field),
      ['city', 'state', 'phone_e164'],
    );
    // E nada foi gravado: a regra recusa ANTES da transacao.
    assert.equal(memoria.gravou, false);
  });

  void it('faltando UM dos tres, so ele e nomeado', async () => {
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'passeios-da-bia',
        kind: 'walker',
        display_name: 'Passeios da Bia',
        city: 'São Paulo',
        state: 'SP',
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.ok(erro instanceof AppError);
    assert.deepEqual(
      erro.errors?.map((e) => e.field),
      ['phone_e164'],
    );
  });

  void it('`status: draft` CONTINUA existindo, e nao cobra nada', async () => {
    // O cliente confirmou: o rascunho fica como escolha explicita, para quem
    // quiser salvar incompleto.
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'passeios-da-bia',
      kind: 'walker',
      display_name: 'Passeios da Bia',
      status: 'draft',
    });
    assert.equal(criada.recurso.status, 'draft');
    assert.equal(criada.recurso.published_at, null);
    // E a tela continua sabendo o que falta, pela MESMA lista.
    assert.deepEqual(
      [...criada.recurso.missing_to_publish],
      ['city', 'state', 'phone_e164'],
    );
  });

  void it('`status: published` explicito e a mesma coisa que o padrao', async () => {
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'passeios-da-bia',
      kind: 'walker',
      display_name: 'Passeios da Bia',
      status: 'published',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(criada.recurso.status, 'published');
  });

  void it('telefone presente mas SO COM ESPACO nao publica -- e a recusa vem da FORMA', async () => {
    // **MEDIDO, e o resultado corrige o que eu ia escrever aqui:** retirar o
    // `.trim()` de `planejarCriacao` NAO reprova nenhum caso deste arquivo. A
    // recusa de `'   '` vem antes, de `errosDaForma` -> `errosDoTelefone`, que
    // nao casa a expressao de E.164. O mesmo vale para `city` (`errosDeTexto`
    // mede o texto APARADO) e para `state` (`errosDaUf`).
    //
    // Entao o `.trim()` la e defensivo e nao e a guarda: ele existe para um
    // chamador que alcance `planejarCriacao` sem passar por `errosDaForma`, e
    // nenhum caminho de hoje faz isso. Dito aqui porque a alternativa era um
    // comentario afirmando uma prova que a sabotagem desmentiu.
    //
    // O que ESTE caso guarda e o desfecho, que importa de qualquer jeito:
    // telefone so com espaco nao produz entrada publicada.
    const erro = await diretorio
      .criarEntrada(AUTOR, {
        slug: 'passeios-da-bia',
        kind: 'walker',
        display_name: 'Passeios da Bia',
        city: 'São Paulo',
        state: 'SP',
        phone_e164: '   ',
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    assert.ok(erro instanceof AppError);
    assert.equal(erro.problemType, 'validation-failed');
  });

  void it('grava a UF em MAIUSCULA, qualquer que seja a digitacao', async () => {
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'tosa-da-ana',
      kind: 'groomer',
      display_name: 'Tosa da Ana',
      state: ' sp ',
      city: ' Santo André ',
      phone_e164: '+551130612200',
    });
    assert.equal(criada.recurso.state, 'SP');
    assert.equal(criada.recurso.city, 'Santo André');
  });

  void it('o `id` interno nunca sai na resposta', async () => {
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'adestra-junto',
      kind: 'trainer',
      display_name: 'Adestra Junto',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal('id' in (criada.recurso as unknown as Record<string, unknown>), false);
  });

  void it('deixa UMA linha de trilha, com a acao do contrato e o `id` interno', async () => {
    await diretorio.criarEntrada(AUTOR, {
      slug: 'sos-silvestres',
      kind: 'vet',
      display_name: 'SOS Silvestres',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(memoria.trilha.length, 1);
    assert.equal(memoria.trilha[0]?.action, 'admin.directory_entry.created');
    assert.equal(memoria.trilha[0]?.resourceKind, 'directory_entry');
    assert.notEqual(memoria.trilha[0]?.resourceId, 'sos-silvestres');
  });

  void it('a falha da trilha desfaz a escrita', async () => {
    memoria.trilhaFalha = true;
    const antes = memoria.linhas.size;
    await assert.rejects(() =>
      diretorio.criarEntrada(AUTOR, {
        slug: 'nao-fica',
        kind: 'vet',
        display_name: 'Não fica',
        ...COMPLETA_PARA_PUBLICAR,
      }),
    );
    assert.equal(memoria.linhas.size, antes);
    assert.equal(memoria.trilha.length, 0);
  });

  void it('endereco repetido e 409, e nao 500', async () => {
    assert.equal(
      await tipoDoErro(() =>
        diretorio.criarEntrada(AUTOR, {
          slug: 'clinica-sao-jorge',
          kind: 'clinic',
          display_name: 'Outra clínica',
          ...COMPLETA_PARA_PUBLICAR,
        }),
      ),
      'slug-taken',
    );
  });

  void it('recusa o telefone fora de E.164, por campo', async () => {
    assert.equal(
      await tipoDoErro(() =>
        diretorio.criarEntrada(AUTOR, {
          slug: 'vet-lu',
          kind: 'vet',
          display_name: 'Vet Lu',
          phone_e164: '1130612200',
        }),
      ),
      'validation-failed',
    );
  });
});

void describe('alterar', () => {
  void it('sem `If-Match`, 428 ANTES de ler o recurso', async () => {
    // O slug nem existe: se a leitura acontecesse antes, a resposta seria 404.
    assert.equal(
      await tipoDoErro(() => diretorio.alterarEntrada(AUTOR, 'nao-existe', undefined, { city: 'X' })),
      'precondition-required',
    );
  });

  void it('versao velha e 412, sem gravar', async () => {
    assert.equal(
      await tipoDoErro(() =>
        diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"2"', { city: 'Campinas' }),
      ),
      'precondition-failed',
    );
    assert.equal(memoria.linhas.get(ID_DA_CLINICA)?.city, 'São Paulo');
  });

  void it('`If-Match` com o sufixo que a BORDA acrescenta passa', async () => {
    // `"3-gzip"` e o que o Caddy devolve na resposta comprimida, e o painel
    // reapresenta o que recebeu. Recusar isso foi o "nao esta sendo salvo".
    const alterada = await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3-gzip"', {
      neighborhood: 'Moema',
    });
    assert.equal(alterada.recurso.neighborhood, 'Moema');
    assert.equal(alterada.etag, '"4"');
  });

  void it('lixo no `If-Match` e 412, e nao 428', async () => {
    assert.equal(
      await tipoDoErro(() => diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '*', { city: 'X' })),
      'precondition-failed',
    );
  });

  void it('editar NAO despublica, e nao regrava o marco', async () => {
    const antes = memoria.linhas.get(ID_DA_CLINICA)?.publishedAt;
    const alterada = await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', {
      phone_e164: '+551130610000',
    });
    assert.equal(alterada.recurso.status, 'published');
    assert.deepEqual(memoria.linhas.get(ID_DA_CLINICA)?.publishedAt, antes);
  });

  void it('recusa a edicao que quebraria a publicacao, nomeando o campo', async () => {
    assert.equal(
      await tipoDoErro(() =>
        diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', { city: null }),
      ),
      'validation-failed',
    );
    assert.equal(memoria.linhas.get(ID_DA_CLINICA)?.city, 'São Paulo');
  });

  void it('entrada inexistente e 404 (com versao apresentada)', async () => {
    // `city` VALIDA de proposito. A isca nasceu com `city: 'X'`, copiado do caso
    // do 428 acima, e media outra coisa: `X` tem UM caractere e o contrato pede
    // `minLength: 2` (`api/openapi.yaml`, `AdminDirectoryEntryPatch.city`, linha
    // 10997), entao a forma do campo e recusada ANTES da leitura do recurso
    // (passo 2 antes do passo 4, no cabecalho de `diretorio-administrativo.ts`)
    // e pela rota o Ajv da borda nem chegaria ao caso de uso. O que este caso
    // afirma e o 404 do recurso ausente COM versao apresentada -- e para chegar
    // la o corpo precisa ser um corpo que o contrato aceita.
    assert.equal(
      await tipoDoErro(() =>
        diretorio.alterarEntrada(AUTOR, 'nao-existe', '"1"', { city: 'Campinas' }),
      ),
      'not-found',
    );
  });

  void it('a trilha guarda SO o que mudou, nos dois lados', async () => {
    await diretorio.alterarEntrada(AUTOR, 'clinica-sao-jorge', '"3"', { neighborhood: 'Moema' });
    assert.equal(memoria.trilha.length, 1);
    assert.equal(memoria.trilha[0]?.action, 'admin.directory_entry.updated');
    assert.deepEqual(memoria.trilha[0]?.after, { neighborhood: 'Moema' });
    assert.deepEqual(memoria.trilha[0]?.before, { neighborhood: 'Vila Mariana' });
  });

  void it('publicar um rascunho completo grava o marco', async () => {
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'hotel-quatro-patas',
      kind: 'sitter',
      display_name: 'Hotel Quatro Patas',
      city: 'Curitiba',
      state: 'PR',
      phone_e164: '+554133221100',
    });
    assert.equal(criada.recurso.missing_to_publish.length, 0);
    const publicada = await diretorio.alterarEntrada(AUTOR, 'hotel-quatro-patas', '"1"', {
      status: 'published',
    });
    assert.equal(publicada.recurso.status, 'published');
    assert.equal(publicada.recurso.published_at, comoData(AGORA).toISOString());
  });
});

void describe('listar', () => {
  void it('a listagem do painel traz rascunho junto com publicada', async () => {
    await diretorio.criarEntrada(AUTOR, {
      slug: 'clinica-em-cadastro',
      kind: 'clinic',
      display_name: 'Clínica Em Cadastro',
      // `draft` EXPLICITO desde 29/10/2026: o padrao do cadastro passou a ser
      // `published`, e sem esta linha a listagem traria duas publicadas e o
      // caso mediria outra coisa.
      status: 'draft',
    });
    const pagina = await diretorio.listarEntradas({ sort: 'name', page: 1, limit: 50 });
    assert.equal(pagina.total, 2);
    assert.deepEqual(
      [...pagina.items].map((i) => i.status).sort(),
      ['draft', 'published'],
    );
  });
});

/**
 * O TIPO DE ENTIDADE na escrita do painel (`20261018000012`).
 *
 * Iscas desligadas em 18/10/2026, conferidas no disco, suite rodada e
 * reprovada, arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `criarEntrada` deixando de repassar `entity_kind` ao repositorio | 2 |
 * | o padrao `?? 'professional'` do dobre, devolvendo `undefined` | 1 |
 * | o `PATCH` deixando de mapear `entity_kind` para `entityKind` | 1 |
 */
void describe('o tipo de entidade na escrita administrativa', () => {
  void it('cadastrar ONG grava organization, e a atividade fica separada', async () => {
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'ong-patas-livres',
      kind: 'clinic',
      entity_kind: 'organization',
      display_name: 'ONG Patas Livres',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(criada.recurso.entity_kind, 'organization');
    assert.equal(criada.recurso.kind, 'clinic');
  });

  void it('cadastrar SEM o campo vale professional, que e o padrao da coluna', async () => {
    // E isto que faz a coluna ser ADITIVA: painel antigo, que nao manda o
    // campo, continua cadastrando -- e grava o valor que a entrada sempre teve.
    const criada = await diretorio.criarEntrada(AUTOR, {
      slug: 'clinica-sem-o-campo',
      kind: 'vet',
      display_name: 'Clínica sem o campo',
      ...COMPLETA_PARA_PUBLICAR,
    });
    assert.equal(criada.recurso.entity_kind, 'professional');
  });

  void it('corrigir o tipo de entidade pelo PATCH funciona', async () => {
    await diretorio.criarEntrada(AUTOR, {
      slug: 'virou-ong',
      kind: 'clinic',
      display_name: 'Virou ONG',
      ...COMPLETA_PARA_PUBLICAR,
    });
    // A entrada nasce em `version: 1`, entao o `ETag` do primeiro `PATCH` e
    // `"1"` -- a escrita administrativa exige o condicional (ADR-0030).
    const editada = await diretorio.alterarEntrada(AUTOR, 'virou-ong', '"1"', {
      entity_kind: 'organization',
    });
    assert.equal(editada.recurso.entity_kind, 'organization');
  });
});
