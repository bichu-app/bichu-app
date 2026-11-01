import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaVivaDoPar, LeitorDeConexao } from '../../connections/ports/conexao.js';
import type { ResolvedorDeConvite } from '../../connections/ports/convite-de-conexao.js';
import type {
  PerfilDePessoaRepository,
  PessoaVisivel,
} from '../ports/perfil-de-pessoa-repository.js';
import { PerfilDePessoa } from './perfil-de-pessoa.js';

const AGORA = 1_800_000_000_000 as Instant;
const QUEM_OLHA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const ANA = '018f3a2b-0000-7000-8000-0000000000a1' as UserId;

const APELIDO = 'ana-do-bairro';

const ANA_VISIVEL: PessoaVisivel = {
  userId: ANA,
  handle: APELIDO,
  publicRef: 'refAnaBairro0000000001',
  displayName: 'Ana',
  petsCount: 2,
  canalVerificado: false,
};

function montar(opcoes: { conviteResolve: boolean; pessoaExiste?: boolean }) {
  const perfis: PerfilDePessoaRepository = {
    perfilPorApelido: (apelido: string) =>
      Promise.resolve(
        opcoes.pessoaExiste !== false && apelido === APELIDO ? ANA_VISIVEL : undefined,
      ),
    vitrineDeConexao: () => Promise.resolve([]),
  };
  const conexoes: LeitorDeConexao = {
    estaConectado: () => Promise.resolve(false),
    contarConexoes: () => Promise.resolve(7),
    arestaVivaEntre: (): Promise<ArestaVivaDoPar | undefined> => Promise.resolve(undefined),
    estadosPorApelido: () => {
      throw new Error('o perfil de UMA pessoa nao pergunta estado em lote');
    },
  };
  const convites: ResolvedorDeConvite = {
    resolver: () =>
      Promise.resolve(
        opcoes.conviteResolve
          ? { alvo: ANA, origem: 'invite_link' as const, apelido: APELIDO }
          : undefined,
      ),
  };
  return new PerfilDePessoa({ perfis, conexoes, convites, clock: { now: () => AGORA } });
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

function respostaInteira(erro: AppError): Record<string, unknown> {
  return {
    status: erro.status,
    problemType: erro.problemType,
    detail: erro.detail,
    title: erro.title,
    errors: erro.errors,
  };
}

void describe('convite resolvido devolve O PERFIL, e nao um recorte parecido', () => {
  void it('CONTRAPESO: convite valido devolve o perfil de quem emitiu', async () => {
    const servico = montar({ conviteResolve: true });
    const perfil = await servico.porConvite(QUEM_OLHA, 'um-token-valido');
    assert.equal(perfil.handle, APELIDO);
    assert.equal(perfil.displayName, 'Ana');
    assert.equal(perfil.petsCount, 2);
    assert.equal(perfil.connectionsCount, 7);
  });

  void it('o perfil resolvido carrega `connection_state`, que e o que o botao le', async () => {
    const servico = montar({ conviteResolve: true });
    const perfil = await servico.porConvite(QUEM_OLHA, 'um-token-valido');
    assert.equal(perfil.connectionState, 'none', 'sem aresta, o botao e "adicionar"');
    assert.equal(perfil.connectionRef, null);
  });

  void it('o perfil por CONVITE e o perfil por APELIDO sao IDENTICOS', async () => {
    const servico = montar({ conviteResolve: true });
    const porConvite = await servico.porConvite(QUEM_OLHA, 'um-token-valido');
    const porApelido = await servico.porApelido(QUEM_OLHA, APELIDO);
    assert.deepEqual(
      porConvite,
      porApelido,
      'o cliente pediu que o link levasse "para a pagina do perfil do usuario" -- a ' +
        'pagina, nao uma parecida. Uma projecao propria aqui divergiria da outra no ' +
        'primeiro campo que alguem acrescentasse a uma so.',
    );
  });

  void it('a vitrine NAO sai para quem nao e conexao, nem por este caminho', async () => {
    const servico = montar({ conviteResolve: true });
    const perfil = await servico.porConvite(QUEM_OLHA, 'um-token-valido');
    assert.equal(
      perfil.vitrine,
      undefined,
      'resolver um convite nao e uma relacao aceita: a emenda 2 do ADR-0010 da a ' +
        'vitrine so a conexao aceita, e o convite nao dispensa aceite.',
    );
  });
});

void describe('ISCA: convite invalido, VENCIDO e REVOGADO nao se distinguem', () => {
  void it('ISCA: os tres dao a MESMA resposta, campo por campo', async () => {
    const servico = montar({ conviteResolve: false });
    const respostas = await Promise.all(
      ['token-que-nunca-existiu', 'token-vencido', 'token-revogado'].map(async (token) =>
        respostaInteira(await erroDe(() => servico.porConvite(QUEM_OLHA, token))),
      ),
    );
    assert.deepEqual(respostas[0], respostas[1], 'inexistente e vencido divergem');
    assert.deepEqual(respostas[1], respostas[2], 'vencido e revogado divergem');
    assert.equal(respostas[0]?.status, 404);
    assert.equal(respostas[0]?.problemType, 'not-found');
  });

  void it('ISCA: nenhuma das tres respostas carrega pista no `detail`', async () => {
    const servico = montar({ conviteResolve: false });
    const erro = await erroDe(() => servico.porConvite(QUEM_OLHA, 'qualquer'));
    const texto = `${String(erro.detail ?? '')} ${String(erro.title ?? '')}`.toLowerCase();
    for (const pista of ['venc', 'expir', 'revog', 'usado', 'invalid', 'bloque']) {
      assert.ok(
        !texto.includes(pista),
        `a resposta diz "${pista}". "Este token ja existiu" e a informacao que diz a ` +
          'alguem que vale a pena continuar tentando.',
      );
    }
  });

  void it('ISCA: convite que nao resolve e PESSOA invisivel dao a MESMA resposta', async () => {
    const conviteMorto = montar({ conviteResolve: false });
    const pessoaInvisivel = montar({ conviteResolve: true, pessoaExiste: false });
    const a = await erroDe(() => conviteMorto.porConvite(QUEM_OLHA, 'token'));
    const b = await erroDe(() => pessoaInvisivel.porConvite(QUEM_OLHA, 'token'));
    assert.deepEqual(
      respostaInteira(a),
      respostaInteira(b),
      'distinguir "o convite morreu" de "a pessoa nao esta disponivel para voce" diria ' +
        'a quem foi bloqueado que o link que ele guardou um dia foi valido.',
    );
  });

  void it('ISCA: a comparacao REPROVA quando um `detail` e acrescentado', () => {
    const base = { status: 404, problemType: 'not-found', detail: undefined };
    assert.notDeepEqual(
      base,
      { ...base, detail: 'Convite expirado' },
      'a isca passou: a comparacao nao enxerga um `detail` novo.',
    );
  });
});
