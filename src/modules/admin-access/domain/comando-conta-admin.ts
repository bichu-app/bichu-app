/**
 * As regras do comando `conta-admin` (ADR-0027 item 20.3; D43, D51, D61, D63),
 * sem banco, sem terminal e sem rede.
 *
 * O painel tem cadastro proprio (`admin_accounts`), e a senha dele nao se
 * define por tela nenhuma (D61): quem define e o cliente, digitando no
 * terminal do servidor. Este arquivo decide o que o comando aceita ANTES de
 * abrir conexao com o banco.
 *
 * ## A senha nunca entra por argumento
 *
 * Argumento fica no historico do shell, em `ps` de qualquer usuario da maquina
 * e no log do orquestrador de container. Variavel de ambiente fica em
 * `/proc/<pid>/environ` e em `docker inspect`. Arquivo fica no disco. O unico
 * canal que nao deixa rastro e o terminal sem eco, e e o unico que o comando
 * le. Uma opcao com cara de senha e recusada pelo NOME, e a recusa nunca repete
 * o valor: quem digitou `--senha x` ja expos `x` no historico, e o comando nao
 * vai expor de novo no log.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import {
  TAMANHO_MAXIMO_DE_SENHA,
  emailTemFormaValida,
  normalizarEmail,
  validarSenha,
} from '../../identity/ports/senha.js';

/**
 * Os codigos de saida, os mesmos do `conceder-papel` que este comando
 * substitui (item 20.3, regra 6), com o `3` significando agora "nao ha conta
 * administrativa com esse e-mail".
 */
export const SAIDA = {
  OK: 0,
  ERRO_INTERNO: 1,
  /** Subcomando ou opcao invalida, senha por argumento, sem terminal. */
  USO: 2,
  /** Nao ha conta administrativa com esse e-mail. */
  CONTA_INEXISTENTE: 3,
  /** Senha curta, longa, vazada, igual a do app, digitacoes diferentes, ou base de vazadas fora do ar. */
  SENHA_RECUSADA: 4,
  /** O operador nao confirmou, ou interrompeu. */
  CANCELADO: 5,
  /** O estado nao permite o pedido (e-mail ja em uso no `criar`, conta ja desativada, ja ativa). */
  CONFLITO: 6,
} as const;

export type CodigoDeSaida = (typeof SAIDA)[keyof typeof SAIDA];

/** D43. Quinze para conta do painel; o app continua com dez. */
export const TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA = 15;
/** Item 20.3, regra 2: acima de 256, recusada. */
export const TAMANHO_MAXIMO_DA_SENHA_ADMINISTRATIVA = Math.min(256, TAMANHO_MAXIMO_DE_SENHA);

export const TAMANHO_MAXIMO_DO_OPERADOR = 80;
/** O `CHECK` de `admin_accounts.display_name`: de 2 a 60 depois do `btrim`. */
export const TAMANHO_MINIMO_DO_NOME = 2;
export const TAMANHO_MAXIMO_DO_NOME = 60;

export type Subcomando = 'criar' | 'redefinir-senha' | 'desativar' | 'reativar' | 'encerrar-sessoes' | 'listar';

export const SUBCOMANDOS: readonly Subcomando[] = [
  'criar',
  'redefinir-senha',
  'desativar',
  'reativar',
  'encerrar-sessoes',
  'listar',
];

/** Os subcomandos que pedem senha nova no terminal. */
export const PEDEM_SENHA: ReadonlySet<Subcomando> = new Set(['criar', 'redefinir-senha', 'reativar']);

export type PedidoDoComando =
  | { readonly subcomando: 'listar' }
  | {
      readonly subcomando: Exclude<Subcomando, 'listar'>;
      readonly email: string;
      /** So no `criar`. */
      readonly nome: string | undefined;
      /** Quem roda o comando. Vai para `metadata.operator` da trilha. */
      readonly operador: string | undefined;
    };

export type ResultadoDaInterpretacao =
  | { readonly tipo: 'pedido'; readonly pedido: PedidoDoComando }
  | { readonly tipo: 'ajuda' }
  | { readonly tipo: 'recusa'; readonly codigo: CodigoDeSaida; readonly mensagem: string };

/**
 * Nome de opcao com cara de senha. Casa pelo nome, com ou sem `=valor`, e em
 * qualquer caixa. `-p` entra porque e o atalho que `mysql` e `psql` ensinaram.
 */
const OPCAO_DE_SENHA = /^(?:--?(?:senha|password|passwd|pass|pwd|secret|segredo|nova-senha)|-p)(?:=|$)/i;

const OPCOES_COM_VALOR = new Set(['--email', '--nome', '--operador']);

export const AJUDA = [
  'Contas do painel administrativo (ADR-0027 item 20.3).',
  '',
  'Uso:',
  '  node dist/bin/conta-admin.js criar --email <e-mail> --nome <nome> [--operador <nome>]',
  '  node dist/bin/conta-admin.js redefinir-senha --email <e-mail> [--operador <nome>]',
  '  node dist/bin/conta-admin.js desativar --email <e-mail> [--operador <nome>]',
  '  node dist/bin/conta-admin.js reativar --email <e-mail> [--operador <nome>]',
  '  node dist/bin/conta-admin.js encerrar-sessoes --email <e-mail> [--operador <nome>]',
  '  node dist/bin/conta-admin.js listar',
  '',
  'A senha e pedida pelo terminal, duas vezes, sem eco, e nunca e aceita por',
  'argumento, variavel de ambiente ou arquivo. Minimo de 15 caracteres; senha',
  'vazada ou igual a da conta do app com o mesmo e-mail e recusada.',
  'O comando exige terminal: docker compose run --rm -it api node dist/bin/conta-admin.js ...',
].join('\n');

function recusa(codigo: CodigoDeSaida, mensagem: string): ResultadoDaInterpretacao {
  return { tipo: 'recusa', codigo, mensagem };
}

function recusaDeSenhaPorArgumento(): ResultadoDaInterpretacao {
  return recusa(
    SAIDA.USO,
    'recusado: a senha nao e aceita por argumento. Ela e pedida pelo terminal, sem eco. ' +
      'Se o valor digitado era uma senha real, trate-a como exposta: ela ficou no historico do shell.',
  );
}

function separar(argumento: string): { nome: string; valor: string | undefined } {
  const igual = argumento.indexOf('=');
  if (igual === -1) return { nome: argumento, valor: undefined };
  return { nome: argumento.slice(0, igual), valor: argumento.slice(igual + 1) };
}

/**
 * Le a linha de comando. Senha por argumento e olhada em TODOS os argumentos
 * antes de qualquer outra coisa, para que um erro de outra opcao nao esconda a
 * recusa que mais importa.
 */
export function interpretarArgumentos(argumentos: readonly string[]): ResultadoDaInterpretacao {
  if (argumentos.some((argumento) => OPCAO_DE_SENHA.test(argumento))) {
    return recusaDeSenhaPorArgumento();
  }
  if (argumentos.includes('--ajuda') || argumentos.includes('-h') || argumentos.includes('--help')) {
    return { tipo: 'ajuda' };
  }

  const [primeiro, ...resto] = argumentos;
  if (primeiro === undefined) return recusa(SAIDA.USO, 'recusado: falta o subcomando. Use --ajuda.');
  if (!(SUBCOMANDOS as readonly string[]).includes(primeiro)) {
    // O valor NAO entra na mensagem: o caso tipico e a senha colada no lugar do subcomando.
    return recusa(SAIDA.USO, 'recusado: subcomando desconhecido (valor omitido). Use --ajuda.');
  }
  const subcomando = primeiro as Subcomando;

  const valores = new Map<string, string>();
  for (let i = 0; i < resto.length; i += 1) {
    const argumento = resto[i] ?? '';
    if (!argumento.startsWith('-')) {
      return recusa(
        SAIDA.USO,
        `recusado: argumento posicional inesperado na posicao ${String(i + 2)} (valor omitido).`,
      );
    }
    const { nome, valor } = separar(argumento);
    if (!OPCOES_COM_VALOR.has(nome)) {
      return recusa(SAIDA.USO, `recusado: opcao desconhecida ${nome}. Use --ajuda.`);
    }
    if (valores.has(nome)) {
      return recusa(SAIDA.USO, `recusado: ${nome} repetida. Valeria a ultima em silencio.`);
    }
    let conteudo = valor;
    if (conteudo === undefined) {
      conteudo = resto[i + 1];
      if (conteudo === undefined || conteudo.startsWith('--')) {
        return recusa(SAIDA.USO, `recusado: ${nome} exige um valor.`);
      }
      i += 1;
    }
    valores.set(nome, conteudo);
  }

  if (subcomando === 'listar') {
    if (valores.size > 0) return recusa(SAIDA.USO, 'recusado: listar nao recebe opcao.');
    return { tipo: 'pedido', pedido: { subcomando } };
  }

  const emailBruto = valores.get('--email');
  if (emailBruto === undefined) return recusa(SAIDA.USO, 'recusado: --email e obrigatorio. Use --ajuda.');
  const email = normalizarEmail(emailBruto);
  if (!emailTemFormaValida(email)) return recusa(SAIDA.USO, 'recusado: --email nao tem forma de e-mail.');

  const nomeBruto = valores.get('--nome');
  if (subcomando === 'criar') {
    if (nomeBruto === undefined) return recusa(SAIDA.USO, 'recusado: criar exige --nome.');
    const problema = validarNome(nomeBruto);
    if (problema !== undefined) return recusa(SAIDA.USO, `recusado: --nome ${problema}`);
  } else if (nomeBruto !== undefined) {
    return recusa(SAIDA.USO, `recusado: --nome so vale para criar.`);
  }

  const operador = valores.get('--operador');
  if (operador !== undefined) {
    const problema = validarNomeDoOperador(operador);
    if (problema !== undefined) return recusa(SAIDA.USO, `recusado: --operador ${problema}`);
  }

  return {
    tipo: 'pedido',
    pedido: { subcomando, email, nome: nomeBruto?.trim(), operador: operador?.trim() },
  };
}

// eslint-disable-next-line no-control-regex -- o que se procura aqui e justamente o controle.
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * O nome de quem roda o comando vai para a trilha, que sobrevive 24 meses. Sem
 * caractere de controle: uma sequencia de escape gravada ali repinta o terminal
 * de quem ler a trilha depois.
 */
export function validarNomeDoOperador(nome: string): string | undefined {
  const limpo = nome.trim();
  if (limpo.length === 0) return 'nao pode ser vazio.';
  if (limpo.length > TAMANHO_MAXIMO_DO_OPERADOR) {
    return `aceita no maximo ${String(TAMANHO_MAXIMO_DO_OPERADOR)} caracteres.`;
  }
  if (CONTROLE.test(limpo)) return 'nao aceita caractere de controle.';
  return undefined;
}

/** O nome que aparece no painel e nos avisos. O mesmo `CHECK` da tabela, e sem controle. */
export function validarNome(nome: string): string | undefined {
  const limpo = nome.trim();
  if (limpo.length < TAMANHO_MINIMO_DO_NOME || limpo.length > TAMANHO_MAXIMO_DO_NOME) {
    return `precisa ter de ${String(TAMANHO_MINIMO_DO_NOME)} a ${String(TAMANHO_MAXIMO_DO_NOME)} caracteres.`;
  }
  if (CONTROLE.test(limpo)) return 'nao aceita caractere de controle.';
  return undefined;
}

/**
 * D43: a politica do produto (NIST SP 800-63B) com o minimo de 15 e o teto de
 * 256. O `too_short` do app, de 10, sai para nao dizer duas coisas diferentes
 * sobre o mesmo tamanho. A base de vazadas e a conferencia com a senha do app
 * (D63) sao porta e ficam fora daqui, porque sao rede e banco.
 */
export function validarSenhaAdministrativa(senha: string, contexto: { email: string }): ProblemFieldError[] {
  const erros = validarSenha(senha, contexto).filter((erro) => erro.code !== 'too_short' && erro.code !== 'too_long');
  if ([...senha].length > TAMANHO_MAXIMO_DA_SENHA_ADMINISTRATIVA) {
    erros.unshift({
      field: 'password',
      code: 'too_long',
      message: `A senha aceita no maximo ${String(TAMANHO_MAXIMO_DA_SENHA_ADMINISTRATIVA)} caracteres.`,
    });
  }
  if ([...senha].length < TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA) {
    erros.unshift({
      field: 'password',
      code: 'too_short',
      message: `Conta do painel exige pelo menos ${String(TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA)} caracteres (D43).`,
    });
  }
  return erros;
}
