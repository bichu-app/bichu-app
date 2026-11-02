import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../shared/time/relogio-de-teste.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Conta, FotoDoPerfil, IdentityRepository, NovaConta } from '../ports/identity-repository.js';
import { RepositorioQueRecusaTudo } from '../adapters/persistence/repositorio-que-recusa-tudo-de-teste.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { TokenSigner } from '../ports/token-signer.js';
import type { ContextoDaRequisicao } from './dependencies.js';
import { criarAuthService } from './auth-service.js';

const SENHA_BOA = 'coleira-azul-do-bidu-2026';
const EMAIL = 'marina@exemplo.com.br';

const CONTEXTO: ContextoDaRequisicao = {
  correlationId: '7c9a1b40-2f6e-4b8a-9d31-0a5e7c2b4d16',
  ip: '201.26.19.199',
  userAgent: 'Bichu/1.0 (Android)',
};

function naoDeveriaTerChegado(nome: string): never {
  throw new assert.AssertionError({
    message:
      `o cadastro chamou \`${nome}\` sem nome de exibição. A recusa precisa acontecer ` +
      'ANTES de qualquer escrita: conta criada sem nome é a queixa de 18/10/2026, e ' +
      'tornar o campo obrigatório depois não preenche o que já nasceu vazio.',
  });
}

function repositorioQueRecusaTudo(): IdentityRepository {
  return new (class extends RepositorioQueRecusaTudo {
    override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
      return Promise.resolve(null);
    }

    protected recusar(nome: string): never {
      return naoDeveriaTerChegado(nome);
    }
  })();
}

function contaRecemCriada(displayName: string | null): Conta {
  return {
    id: 'a1b2c3d4-0000-7000-8000-000000000001' as UserId,
    email: EMAIL,
    emailVerifiedAt: null,
    displayName,
    handle: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: INSTANTE_FIXO,
    createdAt: dataFixa(INSTANTE_FIXO),
  };
}

interface Bancada {
  readonly servico: ReturnType<typeof criarAuthService>;
  readonly eventos: AuditEvent[];
  readonly mensagens: Mensagem[];
  readonly recebidas: NovaConta[];
}

function montar(aceitandoEscrita = false): Bancada {
  const eventos: AuditEvent[] = [];
  const mensagens: Mensagem[] = [];
  const recebidas: NovaConta[] = [];

  const repositorio: IdentityRepository = aceitandoEscrita
    ? {
        ...repositorioQueRecusaTudo(),
        fotoDoPerfil: () => Promise.resolve(null),
        criarContaLocal: (nova: NovaConta) => {
          recebidas.push(nova);
          return Promise.resolve(contaRecemCriada(nova.displayName ?? null));
        },
        criarTokenDeVerificacao: () => Promise.resolve(),
        gravarRefresh: () => Promise.resolve(),
      }
    : repositorioQueRecusaTudo();

  const assinador: TokenSigner = aceitandoEscrita
    ? {
        emitir: (sub, agora: Instant, jti) => ({
          token: `acesso-de-${sub}`,
          expiresInSeconds: 900,
          issuedAt: Math.floor(agora / 1000),
          jti,
        }),
        verificar: () => ({ ok: false, motivo: 'malformado' }),
        jwks: () => [],
      }
    : {
        emitir: () => naoDeveriaTerChegado('TokenSigner.emitir'),
        verificar: () => ({ ok: false, motivo: 'malformado' }),
        jwks: () => [],
      };

  const trilha: AuditLog = {
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

  const mailer: Mailer = aceitandoEscrita
    ? {
        enviar(mensagem) {
          mensagens.push(mensagem);
          return Promise.resolve();
        },
      }
    : { enviar: () => naoDeveriaTerChegado('Mailer.enviar') };

  const servico = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'id-1',
      opaqueToken: () => 'segredo-opaco' as OpaqueToken,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(INSTANTE_FIXO),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: () => undefined,
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  return { servico, eventos, mensagens, recebidas };
}

async function recusaComNome(nome: string | undefined, rotulo: string): Promise<AppError> {
  const bancada = montar();
  try {
    await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: '1990-05-12',
        displayName: nome,
      },
      CONTEXTO,
    );
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o serviço fala por AppError, e não por Error cru');
    assert.deepEqual(bancada.eventos, [], 'nenhum evento de trilha para uma conta que não nasceu');
    return erro;
  }
  throw new assert.AssertionError({
    message:
      `o cadastro aceitou ${rotulo}. É exatamente a queixa de 18/10/2026, e a rota é ` +
      'pública: sem a trava aqui, a tela é só uma sugestão.',
  });
}

void describe('o cadastro exige nome de exibição (queixa do cliente de 18/10/2026)', () => {
  void it('chave `display_name` AUSENTE é recusada com 400, e nada é gravado', async () => {
    const erro = await recusaComNome(undefined, 'um cadastro sem a chave `display_name`');

    assert.equal(erro.status, 400, 'a resposta é 400, e nunca 201');
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  void it('`display_name` vazio é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome('', 'um cadastro com `display_name` vazio');

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      { field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' },
    ]);
  });

  void it('`display_name` SÓ COM ESPAÇO é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome(' '.repeat(3), 'um cadastro com `display_name` só com espaço');

    assert.equal(erro.status, 400);
    assert.equal(erro.problemType, 'validation-failed');
    assert.deepEqual(
      erro.errors,
      [{ field: 'display_name', code: 'required', message: 'Diga como você quer ser chamado.' }],
      'a recusa reaproveita o `code: required` que o contrato já declara, e não um código novo',
    );
  });

  void it('`display_name` acima de 80 caracteres é recusado com 400, e nada é gravado', async () => {
    const erro = await recusaComNome('a'.repeat(81), 'um nome de 81 caracteres');

    assert.equal(erro.status, 400);
    assert.deepEqual(erro.errors, [
      {
        field: 'display_name',
        code: 'too_long',
        message: 'Use no máximo 80 caracteres no nome.',
      },
    ]);
  });

  void it('cadastro COM nome continua funcionando, e o que chega ao banco é o nome aparado', async () => {
    const bancada = montar(true);

    const sessao = await bancada.servico.cadastrar(
      {
        email: EMAIL,
        password: SENHA_BOA,
        birthDate: '1990-05-12',
        displayName: '  Marina  ',
      },
      CONTEXTO,
    );

    assert.equal(bancada.recebidas.length, 1, 'a conta foi criada uma vez');
    assert.equal(
      bancada.recebidas[0]?.displayName,
      'Marina',
      'o que vai para o banco é o nome APARADO: gravar " Marina " faria o espaço aparecer ' +
        'em toda tela que mostra o nome e ordenaria a conta antes de todas as outras',
    );
    assert.equal(sessao.user.email, EMAIL, 'a sessão nasce para a conta cadastrada');
    assert.equal(
      sessao.user.display_name,
      'Marina',
      'o nome aparado também é o que volta na resposta: se o corpo devolvesse " Marina ", ' +
        'o app mostraria o espaço mesmo com o banco correto',
    );
    assert.equal(
      bancada.eventos.filter((e) => e.action === 'auth.account_created').length,
      1,
      'a trilha registrou a criação: o caminho inteiro foi percorrido, e não só a validação',
    );
  });
});
