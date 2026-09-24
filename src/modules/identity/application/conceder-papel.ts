/**
 * O comando que concede e revoga papel administrativo (BICHUS-260; ADR-0027
 * D42, D43 e D51), sem banco, sem terminal e sem rede proprios: tudo chega por
 * porta, e o teste troca as tres.
 *
 * ## A senha e do cliente
 *
 * No `--criar-conta`, a senha e pedida duas vezes pelo terminal, sem eco, e
 * chega aqui como `Buffer`. Ela so vira string para as tres coisas que exigem
 * string (politica, base de vazadas e derivacao), e os dois buffers sao zerados
 * no `finally`, com ou sem sucesso. A string nao se apaga (JavaScript nao deixa)
 * e morre com o processo, que termina logo depois.
 *
 * Nenhuma mensagem, evento de trilha ou erro deste arquivo recebe a senha. As
 * mensagens de recusa sao as da politica, que nao a citam, e o teste confere
 * isso com uma sentinela.
 */
import { timingSafeEqual } from 'node:crypto';

import type { Clock } from '../../../shared/time/clock.js';
import {
  SAIDA,
  TAMANHO_MAXIMO_DA_SENHA,
  validarNomeDoOperador,
  validarSenhaAdministrativa,
  type CodigoDeSaida,
  type PedidoDePapel,
} from '../domain/concessao-de-papel.js';
import type { ListaDeSenhasVazadas } from '../ports/lista-de-senhas-vazadas.js';
import type { ContaParaPapel, RepositorioDePapeis } from '../ports/repositorio-de-papeis.js';

export interface SenhaDigitada {
  readonly bytes: Buffer;
  /** Passou do teto de bytes do leitor. */
  readonly excedeu: boolean;
}

/** O terminal, visto daqui. `mostrar` vai para a saida de erro. */
export interface Interacao {
  mostrar(texto: string): void;
  perguntar(rotulo: string): Promise<string>;
  perguntarSenha(rotulo: string): Promise<SenhaDigitada>;
}

export interface DependenciasDoComandoDePapel {
  readonly repositorio: RepositorioDePapeis;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly interacao: Interacao;
  readonly clock: Clock;
  /** `gerarHashDeSenha` de `domain/password.ts`: o mesmo esquema do login. */
  readonly gerarHash: (senha: string) => Promise<string>;
}

const CONFIRMACAO = 'sim';

const AVISO_D42 = [
  'AVISO (D42): conta com papel admin e DEDICADA.',
  '  - ela deixa de entrar pelo app: login e renovacao recusados com o mesmo 401 de senha errada;',
  '  - as sessoes moveis dela sao derrubadas agora;',
  '  - ela entra so no painel (admin.bichu.app).',
  '  Quem e administrador e tutor usa duas contas.',
].join('\n');

async function operadorDoPedido(
  pedido: PedidoDePapel,
  interacao: Interacao,
): Promise<string | undefined> {
  if (pedido.operador !== undefined) return pedido.operador;
  const digitado = await interacao.perguntar('Seu nome (vai para a trilha como operador): ');
  const problema = validarNomeDoOperador(digitado);
  if (problema !== undefined) {
    interacao.mostrar(`recusado: o nome do operador ${problema}`);
    return undefined;
  }
  return digitado.trim();
}

async function confirmou(interacao: Interacao, pergunta: string): Promise<boolean> {
  const resposta = await interacao.perguntar(`${pergunta} Digite "${CONFIRMACAO}" para confirmar: `);
  if (resposta.trim().toLowerCase() === CONFIRMACAO) return true;
  interacao.mostrar('cancelado: nada foi gravado.');
  return false;
}

function avisoDeTutor(conta: ContaParaPapel): string | undefined {
  if (!conta.papeis.includes('tutor')) return undefined;
  return (
    'ATENCAO: esta conta e de tutor. Com admin, a pessoa perde o acesso ao app e aos pets dela ' +
    'por esta conta. O ADR-0027 pede conta dedicada: considere --criar-conta com outro e-mail.'
  );
}

async function conceder(
  pedido: PedidoDePapel,
  operador: string,
  deps: DependenciasDoComandoDePapel,
): Promise<CodigoDeSaida> {
  const { interacao, repositorio } = deps;
  const conta = await repositorio.buscarContaPorEmail(pedido.email);
  if (conta === undefined) {
    interacao.mostrar(
      'recusado: nenhuma conta ativa com esse e-mail. Nada foi criado. ' +
        'Para criar a conta dedicada com senha, rode de novo com --criar-conta.',
    );
    return SAIDA.CONTA_INEXISTENTE;
  }
  if (conta.papeis.includes(pedido.papel)) {
    interacao.mostrar(`nada a fazer: a conta ja tem o papel ${pedido.papel}. Nada foi gravado.`);
    return SAIDA.OK;
  }
  if (conta.status !== 'active') {
    interacao.mostrar(`recusado: a conta esta em '${conta.status}', e papel so se concede a conta ativa.`);
    return SAIDA.CONFLITO;
  }

  interacao.mostrar(AVISO_D42);
  const tutor = avisoDeTutor(conta);
  if (tutor !== undefined) interacao.mostrar(tutor);
  if (!(await confirmou(interacao, `Conceder ${pedido.papel} a ${pedido.email}?`))) return SAIDA.CANCELADO;

  const resultado = await repositorio.conceder({
    userId: conta.id,
    papel: pedido.papel,
    operador,
    agora: deps.clock.now(),
  });
  if (!resultado.mudou) {
    interacao.mostrar(`nada a fazer: a conta ganhou o papel ${pedido.papel} enquanto voce confirmava.`);
    return SAIDA.OK;
  }
  interacao.mostrar(
    `concedido: ${pedido.papel} a ${pedido.email}. Sessoes moveis derrubadas ` +
      `(${String(resultado.familiasMoveisDerrubadas)} familia(s) de refresh viva(s)). Gravado na trilha.`,
  );
  return SAIDA.OK;
}

async function revogar(
  pedido: PedidoDePapel,
  operador: string,
  deps: DependenciasDoComandoDePapel,
): Promise<CodigoDeSaida> {
  const { interacao, repositorio } = deps;
  const conta = await repositorio.buscarContaPorEmail(pedido.email);
  if (conta === undefined) {
    interacao.mostrar('recusado: nenhuma conta ativa com esse e-mail.');
    return SAIDA.CONTA_INEXISTENTE;
  }
  if (!conta.papeis.includes(pedido.papel)) {
    interacao.mostrar(`nada a fazer: a conta nao tem o papel ${pedido.papel}. Nada foi gravado.`);
    return SAIDA.OK;
  }
  if (!(await confirmou(interacao, `Revogar ${pedido.papel} de ${pedido.email}?`))) return SAIDA.CANCELADO;

  const resultado = await repositorio.revogar({
    userId: conta.id,
    papel: pedido.papel,
    operador,
    agora: deps.clock.now(),
  });
  if (!resultado.mudou) {
    interacao.mostrar(`nada a fazer: a conta perdeu o papel ${pedido.papel} enquanto voce confirmava.`);
    return SAIDA.OK;
  }
  interacao.mostrar(
    `revogado: ${pedido.papel} de ${pedido.email}. ` +
      `${String(resultado.sessoesAdministrativasRevogadas)} sessao(oes) do painel revogada(s). Gravado na trilha.`,
  );
  if (!resultado.papeisRestantes.includes('tutor')) {
    interacao.mostrar('A conta nao tem o papel tutor: ela continua sem entrar pelo app.');
  }
  return SAIDA.OK;
}

/** Iguais em tamanho e em conteudo, em tempo constante no conteudo. */
function mesmaSenha(primeira: Buffer, segunda: Buffer): boolean {
  return primeira.length === segunda.length && timingSafeEqual(primeira, segunda);
}

/**
 * Pede a senha duas vezes e devolve o PHC, ou o codigo de recusa. Os buffers
 * sao zerados aqui, em qualquer saida.
 */
async function senhaDefinida(
  email: string,
  deps: DependenciasDoComandoDePapel,
): Promise<{ phc: string } | { recusa: CodigoDeSaida }> {
  const { interacao } = deps;
  const primeira = await interacao.perguntarSenha(
    'Senha da conta (minimo de 15 caracteres; nada aparece na tela): ',
  );
  let segunda: SenhaDigitada | undefined;
  try {
    segunda = await interacao.perguntarSenha('Repita a senha: ');
    if (primeira.excedeu || segunda.excedeu) {
      interacao.mostrar(`recusado: a senha passa do teto de ${String(TAMANHO_MAXIMO_DA_SENHA)} caracteres.`);
      return { recusa: SAIDA.SENHA_RECUSADA };
    }
    if (!mesmaSenha(primeira.bytes, segunda.bytes)) {
      interacao.mostrar('recusado: as duas digitacoes nao conferem. Nada foi criado.');
      return { recusa: SAIDA.SENHA_RECUSADA };
    }
    const senha = primeira.bytes.toString('utf8');

    const erros = validarSenhaAdministrativa(senha, { email });
    if (erros.length > 0) {
      for (const erro of erros) interacao.mostrar(`recusado: ${erro.message ?? erro.code}`);
      return { recusa: SAIDA.SENHA_RECUSADA };
    }

    const vazada = await deps.senhasVazadas.contem(senha);
    if (vazada === true) {
      interacao.mostrar(
        'recusado: esta senha aparece em vazamento publico (D43). Escolha outra; nada foi criado.',
      );
      return { recusa: SAIDA.SENHA_RECUSADA };
    }
    if (vazada === 'desconhecido') {
      // Recusar e o certo AQUI: definir senha e o unico momento em que da para
      // dizer nao sem trancar ninguem do lado de fora. Aprovar por falta de
      // verificacao seria o portao verde que nao verificou nada.
      interacao.mostrar(
        'recusado: nao consegui consultar a base de senhas vazadas (D43), e sem ela a senha nao e ' +
          'aceita. Nada foi criado. Confira a saida de rede do servidor e rode de novo.',
      );
      return { recusa: SAIDA.SENHA_RECUSADA };
    }

    return { phc: await deps.gerarHash(senha) };
  } finally {
    primeira.bytes.fill(0);
    segunda?.bytes.fill(0);
  }
}

async function criarConta(
  pedido: PedidoDePapel,
  operador: string,
  deps: DependenciasDoComandoDePapel,
): Promise<CodigoDeSaida> {
  const { interacao, repositorio } = deps;
  if ((await repositorio.buscarContaPorEmail(pedido.email)) !== undefined) {
    interacao.mostrar(
      'recusado: ja existe conta com esse e-mail. --criar-conta nao troca senha de conta existente; ' +
        'para conceder o papel a ela, rode sem --criar-conta.',
    );
    return SAIDA.CONFLITO;
  }

  interacao.mostrar(AVISO_D42);
  if (!(await confirmou(interacao, `Criar a conta dedicada ${pedido.email} com o papel ${pedido.papel}?`))) {
    return SAIDA.CANCELADO;
  }

  const definida = await senhaDefinida(pedido.email, deps);
  if ('recusa' in definida) return definida.recusa;

  const criada = await repositorio.criarContaAdministrativa({
    email: pedido.email,
    papel: pedido.papel,
    passwordPhc: definida.phc,
    operador,
    agora: deps.clock.now(),
  });
  if (criada === 'email_em_uso') {
    interacao.mostrar('recusado: o e-mail passou a ter conta enquanto voce digitava. Nada foi criado.');
    return SAIDA.CONFLITO;
  }
  interacao.mostrar(
    `criada: conta dedicada ${pedido.email} com o papel ${pedido.papel}. Gravado na trilha. ` +
      'Ela entra so pelo painel, e a senha nao e exibida nem registrada em lugar nenhum.',
  );
  return SAIDA.OK;
}

export async function executarPedidoDePapel(
  pedido: PedidoDePapel,
  deps: DependenciasDoComandoDePapel,
): Promise<CodigoDeSaida> {
  const operador = await operadorDoPedido(pedido, deps.interacao);
  if (operador === undefined) return SAIDA.USO;

  if (pedido.acao === 'revogar') return revogar(pedido, operador, deps);
  if (pedido.criarConta) return criarConta(pedido, operador, deps);
  return conceder(pedido, operador, deps);
}
