/**
 * O comando `conta-admin` (ADR-0027 item 20.3), sem banco, sem terminal e sem
 * rede proprios: tudo chega por porta, e o teste troca todas.
 *
 * ## A senha e do cliente
 *
 * Nos subcomandos que definem senha (`criar`, `redefinir-senha`, `reativar`), a
 * senha e pedida duas vezes pelo terminal, sem eco, e chega aqui como `Buffer`.
 * Ela so vira string para o que exige string (politica, base de vazadas,
 * conferencia com o app e derivacao), e os dois buffers sao zerados no
 * `finally`, com ou sem sucesso. Nenhum agente gera, grava ou le essa senha:
 * quem digita e o cliente (regra 1 do item 20.3).
 *
 * Nenhuma mensagem, evento de trilha, aviso ou erro deste arquivo recebe a
 * senha. O teste confere isso com uma sentinela.
 */
import { timingSafeEqual } from 'node:crypto';

import { comoIso, type Clock } from '../../../shared/time/clock.js';
import type { ListaDeSenhasVazadas } from '../../identity/ports/lista-de-senhas-vazadas.js';
import {
  SAIDA,
  TAMANHO_MAXIMO_DA_SENHA_ADMINISTRATIVA,
  validarNomeDoOperador,
  validarSenhaAdministrativa,
  type CodigoDeSaida,
  type PedidoDoComando,
} from '../domain/comando-conta-admin.js';
import type { AvisoPorEmail } from '../ports/aviso-por-email.js';
import type { ComandoDeContas, ContaNoComando } from '../ports/comando-de-contas.js';

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

/**
 * D63: a senha do painel nao pode ser a mesma da conta do app com o mesmo
 * e-mail. E a UNICA leitura do mundo do app no caminho do painel, e ela mora
 * no ponto de composicao (`src/bin/conta-admin.ts`), pela porta publica de
 * `identity`, e nao neste modulo.
 */
export interface ConferenciaComContaDoApp {
  /** `true` quando existe conta do app com esse e-mail e a senha confere com a credencial local dela. */
  mesmaSenhaDaContaDoApp(email: string, senha: string): Promise<boolean>;
}

export interface DependenciasDoComandoContaAdmin {
  readonly contas: ComandoDeContas;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly contaDoApp: ConferenciaComContaDoApp;
  readonly avisos: AvisoPorEmail;
  readonly interacao: Interacao;
  readonly clock: Clock;
  /** `gerarHashDeSenha` de `identity/ports/senha.ts`: o mesmo esquema do login. */
  readonly gerarHash: (senha: string) => Promise<string>;
}

const CONFIRMACAO = 'sim';

async function operadorDoPedido(operador: string | undefined, interacao: Interacao): Promise<string | undefined> {
  if (operador !== undefined) return operador;
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
  deps: DependenciasDoComandoContaAdmin,
): Promise<{ phc: string } | { recusa: CodigoDeSaida }> {
  const { interacao } = deps;
  const primeira = await interacao.perguntarSenha(
    'Senha da conta do painel (minimo de 15 caracteres; nada aparece na tela): ',
  );
  let segunda: SenhaDigitada | undefined;
  try {
    segunda = await interacao.perguntarSenha('Repita a senha: ');
    if (primeira.excedeu || segunda.excedeu) {
      interacao.mostrar(
        `recusado: a senha passa do teto de ${String(TAMANHO_MAXIMO_DA_SENHA_ADMINISTRATIVA)} caracteres.`,
      );
      return { recusa: SAIDA.SENHA_RECUSADA };
    }
    if (!mesmaSenha(primeira.bytes, segunda.bytes)) {
      interacao.mostrar('recusado: as duas digitacoes nao conferem. Nada foi gravado.');
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
      interacao.mostrar('recusado: esta senha aparece em vazamento publico (D43). Escolha outra; nada foi gravado.');
      return { recusa: SAIDA.SENHA_RECUSADA };
    }
    if (vazada === 'desconhecido') {
      // Definir senha e o unico momento em que da para dizer nao sem trancar
      // ninguem do lado de fora. Aprovar por falta de verificacao seria o
      // portao verde que nao verificou nada (item 20.3, regra 2).
      interacao.mostrar(
        'recusado: nao consegui consultar a base de senhas vazadas (D43), e sem ela a senha nao e ' +
          'aceita. Nada foi gravado. Confira a saida de rede do servidor e rode de novo.',
      );
      return { recusa: SAIDA.SENHA_RECUSADA };
    }

    if (await deps.contaDoApp.mesmaSenhaDaContaDoApp(email, senha)) {
      interacao.mostrar(
        'recusado: esta e a senha da conta do app com o mesmo e-mail (D63). O painel exige senha ' +
          'propria: quem descobrir uma nao pode ganhar a outra. Nada foi gravado.',
      );
      return { recusa: SAIDA.SENHA_RECUSADA };
    }

    return { phc: await deps.gerarHash(senha) };
  } finally {
    primeira.bytes.fill(0);
    segunda?.bytes.fill(0);
  }
}

/**
 * Regra 5 do item 20.3: um e-mail para CADA administrador ativo, e no `criar`
 * tambem para o dono do endereco novo. Falha do envio nao desfaz a escrita; o
 * comando diz no terminal quem nao recebeu. E o que faz uma conta criada por
 * quem tomou a maquina aparecer na caixa de alguem.
 */
async function avisar(
  deps: DependenciasDoComandoContaAdmin,
  mensagem: { readonly assunto: string; readonly corpo: string },
  tambem: readonly string[] = [],
): Promise<void> {
  const ativas = (await deps.contas.listar()).filter((c) => c.status === 'active').map((c) => c.email);
  const destinos = [...new Set([...ativas, ...tambem])];
  const naoReceberam: string[] = [];
  for (const para of destinos) {
    try {
      await deps.avisos.enviar({ para, ...mensagem });
    } catch {
      naoReceberam.push(para);
    }
  }
  if (destinos.length === 0) {
    deps.interacao.mostrar('ATENCAO: nenhum administrador ativo para receber o aviso.');
  }
  if (naoReceberam.length > 0) {
    deps.interacao.mostrar(
      `ATENCAO: o aviso nao chegou a ${String(naoReceberam.length)} endereco(s): ${naoReceberam.join(', ')}. ` +
        'A escrita foi gravada; avise essas pessoas por outro canal.',
    );
  }
}

async function contaExistente(
  email: string,
  deps: DependenciasDoComandoContaAdmin,
): Promise<ContaNoComando | undefined> {
  const conta = await deps.contas.buscarPorEmail(email);
  if (conta === undefined) deps.interacao.mostrar('recusado: nao ha conta administrativa com esse e-mail.');
  return conta;
}

function quandoLegivel(deps: DependenciasDoComandoContaAdmin): string {
  return `${comoIso(deps.clock.now())} (UTC)`;
}

async function listar(deps: DependenciasDoComandoContaAdmin): Promise<CodigoDeSaida> {
  const contas = await deps.contas.listar();
  if (contas.length === 0) {
    deps.interacao.mostrar('nenhuma conta administrativa.');
    return SAIDA.OK;
  }
  deps.interacao.mostrar('e-mail | nome | estado | bloqueio | ultimo login');
  for (const c of contas) {
    deps.interacao.mostrar(
      [c.email, c.displayName, c.status, c.blockedReason ?? '-', c.lastLoginAt?.toISOString() ?? 'nunca'].join(' | '),
    );
  }
  return SAIDA.OK;
}

export async function executarComandoContaAdmin(
  pedido: PedidoDoComando,
  deps: DependenciasDoComandoContaAdmin,
): Promise<CodigoDeSaida> {
  if (pedido.subcomando === 'listar') return listar(deps);

  const { interacao, contas } = deps;
  const operador = await operadorDoPedido(pedido.operador, interacao);
  if (operador === undefined) return SAIDA.USO;
  const { email } = pedido;

  switch (pedido.subcomando) {
    case 'criar': {
      const nome = pedido.nome ?? '';
      if ((await contas.buscarPorEmail(email)) !== undefined) {
        interacao.mostrar('recusado: ja existe conta administrativa com esse e-mail. Nada foi criado.');
        return SAIDA.CONFLITO;
      }
      if (!(await confirmou(interacao, `Criar a conta do painel ${email} (${nome})?`))) return SAIDA.CANCELADO;
      const definida = await senhaDefinida(email, deps);
      if ('recusa' in definida) return definida.recusa;
      const criada = await contas.criar({ email, nome, passwordPhc: definida.phc, operador, agora: deps.clock.now() });
      if (criada === 'email_em_uso') {
        interacao.mostrar('recusado: o e-mail passou a ter conta enquanto voce digitava. Nada foi criado.');
        return SAIDA.CONFLITO;
      }
      interacao.mostrar(`criada: conta do painel ${email}. Gravado na trilha. A senha nao e exibida nem registrada.`);
      await avisar(
        deps,
        {
          assunto: 'Uma conta nova foi criada no painel do Bichu',
          corpo:
            `Em ${quandoLegivel(deps)} a conta do painel ${email} (${nome}) foi criada no servidor, ` +
            `pelo comando conta-admin, por ${operador}.\n\n` +
            'Se ninguem da equipe pediu esta conta, alguem tem acesso ao servidor: avise o responsavel agora.',
        },
        [email],
      );
      return SAIDA.OK;
    }

    case 'redefinir-senha': {
      const conta = await contaExistente(email, deps);
      if (conta === undefined) return SAIDA.CONTA_INEXISTENTE;
      if (!(await confirmou(interacao, `Redefinir a senha de ${email}? Todas as sessoes dela caem.`))) {
        return SAIDA.CANCELADO;
      }
      const definida = await senhaDefinida(email, deps);
      if ('recusa' in definida) return definida.recusa;
      const estavaBloqueada = conta.blockedReason !== null;
      const r = await contas.redefinirSenha({ id: conta.id, passwordPhc: definida.phc, operador, agora: deps.clock.now() });
      interacao.mostrar(
        `redefinida: senha de ${email}. ${String(r.sessoesRevogadas)} sessao(oes) encerrada(s); ` +
          `${estavaBloqueada ? 'bloqueio removido' : 'nao havia bloqueio'}. Gravado na trilha.`,
      );
      await avisar(deps, {
        assunto: 'A senha de uma conta do painel do Bichu foi redefinida',
        corpo:
          `Em ${quandoLegivel(deps)} a senha da conta do painel ${email} foi redefinida no servidor, ` +
          `pelo comando conta-admin, por ${operador}. Todas as sessoes dela foram encerradas.\n\n` +
          'Se ninguem da equipe pediu isto, alguem tem acesso ao servidor: avise o responsavel agora.',
      });
      return SAIDA.OK;
    }

    case 'desativar': {
      const conta = await contaExistente(email, deps);
      if (conta === undefined) return SAIDA.CONTA_INEXISTENTE;
      if (conta.status === 'disabled') {
        interacao.mostrar('nada a fazer: a conta ja esta desativada. Nada foi gravado.');
        return SAIDA.OK;
      }
      if (!(await confirmou(interacao, `Desativar ${email}? Todas as sessoes dela caem agora.`))) return SAIDA.CANCELADO;
      const r = await contas.desativar({ id: conta.id, operador, agora: deps.clock.now() });
      if (!r.mudou) {
        interacao.mostrar('nada a fazer: a conta foi desativada enquanto voce confirmava.');
        return SAIDA.OK;
      }
      interacao.mostrar(`desativada: ${email}. ${String(r.sessoesRevogadas)} sessao(oes) encerrada(s). Gravado na trilha.`);
      await avisar(deps, {
        assunto: 'Uma conta do painel do Bichu foi desativada',
        corpo:
          `Em ${quandoLegivel(deps)} a conta do painel ${email} foi desativada no servidor, ` +
          `pelo comando conta-admin, por ${operador}. Todas as sessoes dela foram encerradas.`,
      });
      return SAIDA.OK;
    }

    case 'reativar': {
      const conta = await contaExistente(email, deps);
      if (conta === undefined) return SAIDA.CONTA_INEXISTENTE;
      if (conta.status === 'active') {
        interacao.mostrar('nada a fazer: a conta ja esta ativa. Nada foi gravado.');
        return SAIDA.OK;
      }
      if (!(await confirmou(interacao, `Reativar ${email}? A conta volta com senha nova, digitada agora.`))) {
        return SAIDA.CANCELADO;
      }
      const definida = await senhaDefinida(email, deps);
      if ('recusa' in definida) return definida.recusa;
      const r = await contas.reativar({ id: conta.id, passwordPhc: definida.phc, operador, agora: deps.clock.now() });
      if (!r.mudou) {
        interacao.mostrar('nada a fazer: a conta foi reativada enquanto voce digitava. Nada foi gravado.');
        return SAIDA.OK;
      }
      interacao.mostrar(`reativada: ${email}, com senha nova. Gravado na trilha.`);
      await avisar(deps, {
        assunto: 'Uma conta do painel do Bichu foi reativada',
        corpo:
          `Em ${quandoLegivel(deps)} a conta do painel ${email} foi reativada no servidor, com senha nova, ` +
          `pelo comando conta-admin, por ${operador}.\n\n` +
          'Se ninguem da equipe pediu isto, alguem tem acesso ao servidor: avise o responsavel agora.',
      });
      return SAIDA.OK;
    }

    case 'encerrar-sessoes': {
      const conta = await contaExistente(email, deps);
      if (conta === undefined) return SAIDA.CONTA_INEXISTENTE;
      if (!(await confirmou(interacao, `Encerrar todas as sessoes de ${email}? A senha nao muda.`))) {
        return SAIDA.CANCELADO;
      }
      const r = await contas.encerrarSessoes({ id: conta.id, operador, agora: deps.clock.now() });
      interacao.mostrar(`encerradas: ${String(r.sessoesRevogadas)} sessao(oes) de ${email}. Gravado na trilha.`);
      return SAIDA.OK;
    }
  }
}
