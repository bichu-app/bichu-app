/**
 * As regras do comando que concede e revoga papel (BICHUS-260; ADR-0027 D42,
 * D43 e D51), sem banco, sem terminal e sem rede.
 *
 * Conceder papel nao e operacao do painel (D51): um papel que se concede por
 * tela e a primeira coisa que um invasor com a senha de um administrador
 * usaria. Por isso ele e um comando no servidor, que so quem tem acesso a
 * maquina roda, e este arquivo e o que decide o que o comando aceita ANTES de
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
import { emailTemFormaValida, normalizarEmail } from './email.js';
import { TAMANHO_MAXIMO, validarSenha, type ContextoDaSenha } from './password-policy.js';

/**
 * Os codigos de saida. Diferentes entre si porque quem roda o comando por
 * roteiro precisa separar "digitei errado" de "a conta nao existe" de "quebrou".
 */
export const SAIDA = {
  OK: 0,
  ERRO_INTERNO: 1,
  /** Argumento invalido, papel fora da lista, senha por argumento, sem terminal. */
  USO: 2,
  /** O e-mail nao tem conta ativa. Nenhuma conta e criada. */
  CONTA_INEXISTENTE: 3,
  /** Senha curta, vazada, as duas digitacoes diferentes, ou base de vazadas fora do ar. */
  SENHA_RECUSADA: 4,
  /** O operador nao confirmou, ou interrompeu. */
  CANCELADO: 5,
  /** A conta existe mas nao pode receber o pedido (suspensa, e-mail ja em uso no `--criar-conta`). */
  CONFLITO: 6,
} as const;

export type CodigoDeSaida = (typeof SAIDA)[keyof typeof SAIDA];

/**
 * Os papeis que este comando concede e revoga. So `admin` na v1 (ADR-0027,
 * decisao do cliente de 23/09): `moderator` existe em `user_roles`, mas a
 * moderacao ainda nao existe, e conceder um papel que nenhuma tela usa e criar
 * uma conta dedicada (D42) sem motivo.
 */
export const PAPEIS_CONCEDIVEIS: readonly string[] = ['admin'];

/** D43. Quinze para conta com papel; o app continua com dez (`password-policy.ts`). */
export const TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA = 15;

export const TAMANHO_MAXIMO_DO_OPERADOR = 80;

export type AcaoDePapel = 'conceder' | 'revogar';

export interface PedidoDePapel {
  readonly acao: AcaoDePapel;
  readonly email: string;
  readonly papel: string;
  /** Cria a conta dedicada com senha pedida pelo terminal. So com `conceder`. */
  readonly criarConta: boolean;
  /** Quem roda o comando. Vai para `metadata.operator` da trilha. */
  readonly operador: string | undefined;
}

export type ResultadoDaInterpretacao =
  | { readonly tipo: 'pedido'; readonly pedido: PedidoDePapel }
  | { readonly tipo: 'ajuda' }
  | { readonly tipo: 'recusa'; readonly codigo: CodigoDeSaida; readonly mensagem: string };

/**
 * Nome de opcao com cara de senha. Casa pelo nome, com ou sem `=valor`, e em
 * qualquer caixa. `-p` entra porque e o atalho que `mysql` e `psql` ensinaram.
 */
const OPCAO_DE_SENHA = /^(?:--?(?:senha|password|passwd|pass|pwd|secret|segredo)|-p)(?:=|$)/i;

const OPCOES_COM_VALOR = new Set(['--email', '--papel', '--operador']);
const OPCOES_SEM_VALOR = new Set(['--revogar', '--criar-conta']);

export const AJUDA = [
  'Concede ou revoga papel administrativo (ADR-0027 D51).',
  '',
  'Uso:',
  '  node dist/bin/conceder-papel.js --email <e-mail> [--operador <nome>]',
  '  node dist/bin/conceder-papel.js --email <e-mail> --criar-conta [--operador <nome>]',
  '  node dist/bin/conceder-papel.js --email <e-mail> --revogar [--operador <nome>]',
  '',
  'Opcoes:',
  '  --email <e-mail>   conta que recebe ou perde o papel (obrigatorio)',
  `  --papel <papel>    ${PAPEIS_CONCEDIVEIS.join(', ')} (padrao: admin)`,
  '  --criar-conta      cria a conta dedicada; a senha e pedida duas vezes, sem eco',
  '  --revogar          revoga o papel em vez de conceder',
  '  --operador <nome>  quem esta rodando; sem a opcao, o comando pergunta',
  '',
  'A senha nunca e aceita por argumento, variavel de ambiente ou arquivo.',
  'O comando exige terminal: docker compose run --rm -it api node dist/bin/conceder-papel.js ...',
].join('\n');

function recusa(codigo: CodigoDeSaida, mensagem: string): ResultadoDaInterpretacao {
  return { tipo: 'recusa', codigo, mensagem };
}

function recusaDeSenhaPorArgumento(): ResultadoDaInterpretacao {
  return recusa(
    SAIDA.USO,
    'recusado: a senha nao e aceita por argumento. Ela e pedida pelo terminal, sem eco, ' +
      'com --criar-conta. Se o valor digitado era uma senha real, trate-a como exposta: ' +
      'ela ficou no historico do shell.',
  );
}

/** Separa `--chave=valor` em nome e valor; opcao sem `=` devolve `valor` indefinido. */
function separar(argumento: string): { nome: string; valor: string | undefined } {
  const igual = argumento.indexOf('=');
  if (igual === -1) return { nome: argumento, valor: undefined };
  return { nome: argumento.slice(0, igual), valor: argumento.slice(igual + 1) };
}

/**
 * Le a linha de comando. A ordem das recusas importa: senha por argumento e
 * olhada em TODOS os argumentos antes de qualquer outra coisa, para que um
 * erro de outra opcao nao esconda a recusa que mais importa.
 */
export function interpretarArgumentos(argumentos: readonly string[]): ResultadoDaInterpretacao {
  if (argumentos.some((argumento) => OPCAO_DE_SENHA.test(argumento))) {
    return recusaDeSenhaPorArgumento();
  }
  if (argumentos.includes('--ajuda') || argumentos.includes('-h') || argumentos.includes('--help')) {
    return { tipo: 'ajuda' };
  }

  const valores = new Map<string, string>();
  const bandeiras = new Set<string>();

  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i] ?? '';
    if (!argumento.startsWith('-')) {
      // O valor NAO entra na mensagem: o caso tipico e a senha colada depois do e-mail.
      return recusa(SAIDA.USO, `recusado: argumento posicional inesperado na posicao ${String(i + 1)} (valor omitido).`);
    }
    const { nome, valor } = separar(argumento);

    if (OPCOES_SEM_VALOR.has(nome)) {
      if (valor !== undefined) return recusa(SAIDA.USO, `recusado: ${nome} nao recebe valor.`);
      if (bandeiras.has(nome)) return recusa(SAIDA.USO, `recusado: ${nome} repetida.`);
      bandeiras.add(nome);
      continue;
    }
    if (!OPCOES_COM_VALOR.has(nome)) {
      return recusa(SAIDA.USO, `recusado: opcao desconhecida ${nome}. Use --ajuda.`);
    }
    if (valores.has(nome)) {
      return recusa(SAIDA.USO, `recusado: ${nome} repetida. Valeria a ultima em silencio.`);
    }
    let conteudo = valor;
    if (conteudo === undefined) {
      conteudo = argumentos[i + 1];
      if (conteudo === undefined || conteudo.startsWith('--')) {
        return recusa(SAIDA.USO, `recusado: ${nome} exige um valor.`);
      }
      i += 1;
    }
    valores.set(nome, conteudo);
  }

  const emailBruto = valores.get('--email');
  if (emailBruto === undefined) return recusa(SAIDA.USO, 'recusado: --email e obrigatorio. Use --ajuda.');
  const email = normalizarEmail(emailBruto);
  if (!emailTemFormaValida(email)) return recusa(SAIDA.USO, 'recusado: --email nao tem forma de e-mail.');

  const acao: AcaoDePapel = bandeiras.has('--revogar') ? 'revogar' : 'conceder';
  const papel = valores.get('--papel') ?? 'admin';

  if (acao === 'revogar' && papel === 'tutor') {
    return recusa(
      SAIDA.USO,
      'recusado: tutor nao se revoga por este comando. E o papel de toda conta do app; ' +
        'quem deixa de ser tutor exclui a conta pelo fluxo de exclusao.',
    );
  }
  if (!PAPEIS_CONCEDIVEIS.includes(papel)) {
    return recusa(
      SAIDA.USO,
      `recusado: papel fora da lista. Este comando so trata: ${PAPEIS_CONCEDIVEIS.join(', ')}.`,
    );
  }

  const criarConta = bandeiras.has('--criar-conta');
  if (criarConta && acao === 'revogar') {
    return recusa(SAIDA.USO, 'recusado: --criar-conta so vale para conceder.');
  }

  const operador = valores.get('--operador');
  if (operador !== undefined) {
    const problema = validarNomeDoOperador(operador);
    if (problema !== undefined) return recusa(SAIDA.USO, `recusado: --operador ${problema}`);
  }

  return {
    tipo: 'pedido',
    pedido: { acao, email, papel, criarConta, operador: operador?.trim() },
  };
}

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
  // eslint-disable-next-line no-control-regex -- o que se procura aqui e justamente o controle.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(limpo)) return 'nao aceita caractere de controle.';
  return undefined;
}

/**
 * D43: a politica do produto (NIST SP 800-63B, `password-policy.ts`) com o
 * minimo de 15. O `too_short` do app, de 10, sai para nao dizer duas coisas
 * diferentes sobre o mesmo tamanho. A consulta a base de vazadas e porta e fica
 * fora daqui, porque e rede.
 */
export function validarSenhaAdministrativa(senha: string, contexto: ContextoDaSenha): ProblemFieldError[] {
  const doProduto = validarSenha(senha, contexto).filter((erro) => erro.code !== 'too_short');
  if (senha.length >= TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA) return doProduto;
  return [
    {
      field: 'password',
      code: 'too_short',
      message: `Conta administrativa exige pelo menos ${String(TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA)} caracteres (D43).`,
    },
    ...doProduto,
  ];
}

export { TAMANHO_MAXIMO as TAMANHO_MAXIMO_DA_SENHA };
