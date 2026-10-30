/**
 * ISCA — a rota nova da FOTO DO ESTABELECIMENTO exige a credencial DE FATO, e não
 * só no contrato.
 *
 * ## POR QUE ESTE ARQUIVO EXISTE
 *
 * O contrato declara `security: [{ bearerAuth: [] }]`, e `carregarContrato`
 * derruba a aplicação se alguma operação NÃO declarar nenhuma -- isso cobre a
 * DECLARAÇÃO. **Não cobre o servidor:** `security` no YAML não registra
 * autenticação em lugar nenhum, e um `registrarRota` que esquecesse
 * `donoAutenticado` subiria verde com a operação declarada como autenticada e a
 * rota aberta. Operação sem credencial exigida já derrubou uma subida inteira
 * neste projeto (577 casos em 135 arquivos, por uma causa só), e a declaração
 * estava lá.
 *
 * O que se mede aqui é o 401, com o servidor de verdade e o esquema de corpo do
 * contrato de verdade -- e que o caso de uso **não é alcançado**: assinar uma
 * autorização de envio é escrita irreversível, e ela não pode acontecer antes de
 * o chamador ser conhecido.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import { comoObjectKey } from '../../domain/chave-de-objeto.js';
import type { AutorizacaoDeCapa } from '../../ports/imagem-de-catalogo.js';
import type { CorpoDaIntencaoDaFoto } from '../../application/foto-da-indicacao.js';
import {
  registrarRotasDeMidia,
  rotaDeIntencaoDaFotoDaIndicacao,
  type DependenciasDasRotasDeMidia,
} from './media-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');
const CONTA = '0192a3b4-0000-7000-8000-00000000aaaa' as UserId;
const ID_DO_ENVIO = '0192a3b4-0000-7000-8000-00000000bbbb';
const TOKEN = 'um-token-que-o-autenticador-de-teste-aceita';

/** O corpo mínimo que `DirectorySuggestionPhotoIntentInput` exige. */
const CORPO: CorpoDaIntencaoDaFoto = {
  content_type: 'image/jpeg',
  byte_size: 900_000,
  width: 1280,
  height: 720,
};

interface Medicao {
  readonly status: number;
  readonly corpo: string;
  /** Quantas vezes o caso de uso foi ALCANÇADO. Zero é o ponto do 401. */
  readonly autorizacoes: number;
}

async function pedir(cabecalho: string | undefined): Promise<Medicao> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  let autorizacoes = 0;
  const naoChamar = (): never => {
    throw new Error('o cenário do 401 não pode alcançar esta dependência');
  };
  const deps = {
    contrato,
    baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
    autenticador: {
      autenticar: (token: string) =>
        token === TOKEN
          ? Promise.resolve({ userId: CONTA })
          // `problemas.naoAutenticado()`, e NÃO um `Error` qualquer: é o que o
          // `AuthService` de verdade lança (`auth-service.ts`, sete pontos). Um
          // `Error` cru aqui daria 500 e o caso mediria o dublê -- foi o que a
          // primeira versão deste arquivo fez, e o 500 que ela viu não existe no
          // caminho do produto.
          : Promise.reject(problemas.naoAutenticado()),
    },
    fotosDeIndicacao: {
      autorizar: (): Promise<AutorizacaoDeCapa> => {
        autorizacoes += 1;
        return Promise.resolve({
          uploadId: ID_DO_ENVIO,
          autorizacao: {
            metodo: 'POST',
            url: 'https://armazenamento.exemplo.invalid/envio' as AbsoluteUrl,
            campos: { key: comoObjectKey('directory/original/abc') },
            expiraEm: comoData(1_770_000_000_000 as Instant),
            maxBytes: 5_242_880,
          },
        });
      },
    },
    // As outras rotas do módulo não são exercitadas aqui, e o dublê que as
    // alcançasse esconderia uma chamada que não deveria acontecer.
    capasDeEncontro: { autorizar: naoChamar },
    fotosDoUsuario: { autorizar: naoChamar },
    logotiposDeIndicacao: { autorizar: naoChamar },
    midia: { autorizarEnvioDeFoto: naoChamar, confirmarFoto: naoChamar, excluirFoto: naoChamar },
  } as unknown as DependenciasDasRotasDeMidia;

  registrarRotasDeMidia(app, deps);
  try {
    const resposta = await app.inject({
      method: 'POST' as const,
      url: rotaDeIntencaoDaFotoDaIndicacao.path,
      payload: CORPO,
      ...(cabecalho === undefined ? {} : { headers: { authorization: cabecalho } }),
    });
    return { status: resposta.statusCode, corpo: resposta.body, autorizacoes };
  } finally {
    await app.close();
  }
}

void describe('a rota da foto da indicação exige a credencial DE FATO', () => {
  void it('ISCA: SEM `Authorization` é 401, e o caso de uso NÃO é alcançado', async () => {
    // DESLIGAR PARA VER REPROVAR: em `media-routes.ts`, troque
    // `await donoAutenticado(request, deps)` por `CONTA` no handler desta rota.
    // A rota passa a assinar autorização de envio para quem não se identificou.
    const medicao = await pedir(undefined);

    assert.equal(
      medicao.status,
      401,
      `REPROVA: a rota respondeu ${String(medicao.status)} sem credencial. ` +
        '`security` no contrato não registra autenticação em lugar nenhum -- quem a ' +
        `exige é o handler. Corpo: ${medicao.corpo}`,
    );
    assert.equal(
      medicao.autorizacoes,
      0,
      'REPROVA: o caso de uso foi alcançado antes do 401. Assinar uma autorização de ' +
        'envio é escrita irreversível.',
    );
  });

  void it('`Authorization` que não é `Bearer`, e `Bearer` vazio, também são 401', async () => {
    for (const cabecalho of ['', 'Basic abc', 'Bearer', 'Bearer    ', 'bearer ' + TOKEN]) {
      const medicao = await pedir(cabecalho);
      assert.equal(medicao.status, 401, `${JSON.stringify(cabecalho)}: ${medicao.corpo}`);
      assert.equal(medicao.autorizacoes, 0, JSON.stringify(cabecalho));
    }
  });

  void it('token que o autenticador RECUSA é 401, e não 500', async () => {
    const medicao = await pedir('Bearer um-token-qualquer');
    assert.equal(medicao.status, 401, medicao.corpo);
    assert.equal(medicao.autorizacoes, 0);
    const problema = JSON.parse(medicao.corpo) as { type?: string };
    assert.match(problema.type ?? '', /\/unauthenticated$/);
  });

  /**
   * CONTRAPESO: sem este caso, uma rota que respondesse 401 a TUDO -- inclusive
   * a quem se identificou -- passaria nos três de cima.
   */
  void it('CONTRAPESO: COM a credencial a rota responde 201 e devolve o `UploadIntent`', async () => {
    const medicao = await pedir(`Bearer ${TOKEN}`);

    assert.equal(medicao.status, 201, medicao.corpo);
    assert.equal(medicao.autorizacoes, 1);
    const corpo = JSON.parse(medicao.corpo) as Record<string, unknown>;
    assert.equal(corpo['upload_id'], ID_DO_ENVIO);
    assert.equal(corpo['max_bytes'], 5_242_880);
    assert.ok(typeof corpo['expires_at'] === 'string');
  });

  /** O espelho do `x-rate-limit` do contrato, no caminho que a rota usa. */
  void it('o teto declarado na rota é 20 por hora, por conta -- o MESMO do logotipo', () => {
    assert.deepEqual(rotaDeIntencaoDaFotoDaIndicacao.rateLimit, [
      { dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' },
    ]);
    assert.equal(rotaDeIntencaoDaFotoDaIndicacao.path, '/media/directory-suggestion-photo-intents');
  });
});
