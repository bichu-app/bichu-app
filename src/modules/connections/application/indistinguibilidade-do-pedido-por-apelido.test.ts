/**
 * **A ISCA DA INDISTINGUIBILIDADE: apelido inexistente e apelido de quem bloqueou
 * você dão a MESMA resposta.**
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import { conexoesEmMemoria, type PessoaDeTeste } from '../adapters/persistence/conexoes-em-memoria-de-teste.js';
import type { LeitorDeBloqueio } from '../ports/leitor-de-bloqueio.js';
import type { ResolvedorDeApelido, ResolvedorDeConvite } from '../ports/convite-de-conexao.js';
import { ConexaoEntrePessoas, type ContextoDoChamador } from './conexao-entre-pessoas.js';

const AGORA = 1_800_000_000_000 as Instant;

const ANA = '018f3a2b-0000-7000-8000-0000000000a1' as UserId;
const BIA = '018f3a2b-0000-7000-8000-0000000000b2' as UserId;

const PESSOAS: readonly PessoaDeTeste[] = [
  { id: ANA, apelido: 'ana-do-bairro', nomeDeExibicao: 'Ana', habilitada: true },
  { id: BIA, apelido: 'bia-da-esquina', nomeDeExibicao: 'Bia', habilitada: true },
];

const contexto = (quem: UserId): ContextoDoChamador => ({
  userId: quem,
  correlationId: 'corr-1',
  ip: undefined,
});

/** Monta o serviço com um resolvedor de apelido que devolve o que o cenário pedir. */
function montar(alvo: UserId | undefined, bloqueado = false) {
  const bancada = conexoesEmMemoria(PESSOAS, AGORA);
  const trilha: AuditEvent[] = [];
  let sorteio = 0;
  const ids: IdGenerator = {
    uuidv7: () => {
      sorteio += 1;
      return `018f3a2b-0000-7000-8000-${String(sorteio).padStart(12, '0')}`;
    },
    opaqueToken: () => 'token-de-teste' as OpaqueToken,
    random128: () => new Uint8Array(16).fill(sorteio),
    random80: () => new Uint8Array(10).fill(sorteio),
  };
  const apelidos: ResolvedorDeApelido = { resolver: () => Promise.resolve(alvo) };
  const convites: ResolvedorDeConvite = { resolver: () => Promise.resolve(undefined) };
  const bloqueios: LeitorDeBloqueio = {
    existeBloqueioEntre: () => Promise.resolve(bloqueado),
  };
  const clock: Clock = { now: () => AGORA };
  const log: AuditLog = {
    record: (e: AuditEvent) => {
      trilha.push(e);
      return Promise.resolve();
    },
  };
  return {
    servico: new ConexaoEntrePessoas({
      conexoes: bancada.repositorio,
      convites,
      apelidos,
      bloqueios,
      trilha: log,
      ids,
      clock,
    }),
    bancada,
    trilha,
  };
}

async function erroDe(acao: () => Promise<unknown>): Promise<AppError> {
  try {
    await acao();
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  throw new Error('a ação não falhou, e era o que o teste media');
}

/** Tudo o que atravessa a borda, para comparar as respostas INTEIRAS. */
function respostaInteira(erro: AppError): Record<string, unknown> {
  return {
    status: erro.status,
    problemType: erro.problemType,
    detail: erro.detail,
    title: erro.title,
    errors: erro.errors,
  };
}

void describe('ISCA: apelido inexistente e apelido que te bloqueou sao INDISTINGUIVEIS', () => {
  void it('ISCA: as duas respostas sao IGUAIS, campo por campo', async () => {
    const inexistente = montar(undefined);
    const bloqueou = montar(ANA, true);

    const a = await erroDe(() => inexistente.servico.pedirPorApelido(contexto(BIA), 'nao-existe'));
    const b = await erroDe(() => bloqueou.servico.pedirPorApelido(contexto(BIA), 'ana-do-bairro'));

    assert.deepEqual(
      respostaInteira(a),
      respostaInteira(b),
      'as duas respostas divergem. Um `detail` diferente para "bloqueado" conta a ' +
        'quem foi bloqueado que a pessoa existe E que ela o bloqueou -- o aviso de ' +
        'bloqueio que o desenho nao da, servido por um campo de texto.',
    );
  });

  void it('as duas sao 404, e NUNCA 403 (ADR-0021)', async () => {
    for (const montagem of [montar(undefined), montar(ANA, true)]) {
      const erro = await erroDe(() =>
        montagem.servico.pedirPorApelido(contexto(BIA), 'qualquer-um'),
      );
      assert.equal(erro.status, 404);
      assert.equal(erro.problemType, 'not-found');
      assert.notEqual(erro.status, 403, '403 contaria que existe algo ali e que alguem te barrou');
    }
  });

  void it('nenhuma das duas cria aresta, e nenhuma das duas grava trilha', async () => {
    for (const montagem of [montar(undefined), montar(ANA, true)]) {
      await erroDe(() => montagem.servico.pedirPorApelido(contexto(BIA), 'qualquer-um'));
      assert.equal(montagem.bancada.linhas.length, 0, 'nenhuma aresta pode ter nascido');
      assert.deepEqual(
        montagem.trilha,
        [],
        'trilha gravada so num dos dois casos seria a distincao, por outro canal: a ' +
          'trilha e lida por gente, e um evento que existe apenas quando havia bloqueio ' +
          'conta o bloqueio a quem a consulta.',
      );
    }
  });

  /**
   * **O CONTRAPESO.** Sem ele, todos os casos acima passariam num mundo em que
   * `pedirPorApelido` sempre falha — e eles não distinguiriam "indistinguível" de
   * "quebrado".
   */
  void it('CONTRAPESO: apelido que resolve e nao esta bloqueado CRIA a aresta', async () => {
    const { servico, bancada } = montar(ANA, false);
    const conexao = await servico.pedirPorApelido(contexto(BIA), 'ana-do-bairro');
    assert.equal(conexao.state, 'pending_sent');
    assert.equal(bancada.linhas.length, 1, 'o caminho feliz TEM de criar a aresta');
    assert.equal(
      bancada.linhas[0]?.origem,
      'people_search',
      'a procedencia do caminho por apelido e `people_search`, e ela e gravada',
    );
  });

  /**
   * A isca da própria isca: ela prova que `respostaInteira` **enxerga** uma
   * divergência.
   */
  void it('ISCA: a comparacao REPROVA quando um `detail` e acrescentado', () => {
    const base = { status: 404, problemType: 'not-found', detail: undefined, title: 'x', errors: undefined };
    const comPista = { ...base, detail: 'Apelido não encontrado' };
    assert.notDeepEqual(
      base,
      comPista,
      'a isca passou: a comparacao nao enxerga um `detail` novo, entao o caso de ' +
        'cima nao mede a indistinguibilidade.',
    );
  });
});

void describe('o pedido por APELIDO e o pedido por CONVITE nao se distinguem na recusa', () => {
  /** As duas credenciais, as duas falhando. */
  void it('token que nao resolve e apelido que nao resolve dao a MESMA resposta', async () => {
    const montagem = montar(undefined);
    const porToken = await erroDe(() => montagem.servico.pedir(contexto(BIA), 'token-qualquer'));
    const porApelido = await erroDe(() =>
      montagem.servico.pedirPorApelido(contexto(BIA), 'apelido-qualquer'),
    );
    assert.deepEqual(respostaInteira(porToken), respostaInteira(porApelido));
  });
});
