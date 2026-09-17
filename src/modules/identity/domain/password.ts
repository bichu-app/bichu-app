/**
 * Senha local: PBKDF2-HMAC-SHA512, parâmetros gravados junto do hash.
 *
 * **Bcrypt está proibido neste projeto** (ADR-0003), por mais que seja o padrão
 * das bibliotecas de Node. O motivo não é criptográfico e sim de saída: o
 * Keycloak importa `pbkdf2-sha512` nativamente pela Admin API, e não entende
 * bcrypt sem provider de terceiro. Trocar o algoritmo aqui transformaria a
 * migração futura numa redefinição de senha em massa.
 *
 * Argon2id é superior no papel e é o padrão do Keycloak desde a versão 25, mas a
 * importação exige acertar memória, paralelismo, versão e tipo além das
 * iterações, e é aí que migração quebra. Entre o melhor no papel e o que
 * atravessa a fronteira sem cerimônia, a decisão foi o segundo.
 *
 * Os parâmetros vão **junto de cada hash**, em formato PHC, e nunca em
 * configuração global: é o que permite subir o custo sem reset em massa, e é o
 * que faz o rehash transparente do login ser possível.
 */
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(pbkdf2);

/** Recomendação corrente da OWASP para PBKDF2-SHA512, e padrão do Keycloak. */
export const ITERACOES_VIGENTES = 210_000;
export const BYTES_DE_SAL = 16;
export const BYTES_DERIVADOS = 64;
const DIGEST = 'sha512';
const ALGORITMO_PHC = 'pbkdf2-sha512';

export interface ParametrosDeHash {
  readonly iteracoes: number;
  readonly sal: Buffer;
  readonly derivado: Buffer;
}

/** `$pbkdf2-sha512$i=210000$<sal_b64>$<hash_b64>` (ADR-0003). */
export function codificarPhc(parametros: ParametrosDeHash): string {
  return [
    '',
    ALGORITMO_PHC,
    `i=${parametros.iteracoes}`,
    parametros.sal.toString('base64').replace(/=+$/, ''),
    parametros.derivado.toString('base64').replace(/=+$/, ''),
  ].join('$');
}

export function decodificarPhc(phc: string): ParametrosDeHash | undefined {
  const partes = phc.split('$');
  // A string começa com `$`, então a primeira parte é vazia: cinco campos ao
  // todo. Qualquer outra contagem é um formato que não emitimos.
  if (partes.length !== 5 || partes[0] !== '' || partes[1] !== ALGORITMO_PHC) return undefined;

  const iteracoesCasadas = /^i=(\d{1,9})$/.exec(partes[2] ?? '');
  if (iteracoesCasadas === null) return undefined;
  const iteracoes = Number.parseInt(iteracoesCasadas[1] ?? '', 10);
  if (!Number.isInteger(iteracoes) || iteracoes <= 0) return undefined;

  const sal = Buffer.from(partes[3] ?? '', 'base64');
  const derivado = Buffer.from(partes[4] ?? '', 'base64');
  if (sal.length === 0 || derivado.length === 0) return undefined;

  return { iteracoes, sal, derivado };
}

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(BYTES_DE_SAL);
  const derivado = await derivar(senha.normalize('NFKC'), sal, ITERACOES_VIGENTES, BYTES_DERIVADOS, DIGEST);
  return codificarPhc({ iteracoes: ITERACOES_VIGENTES, sal, derivado });
}

/**
 * Verificação em tempo constante. `===` sobre o hash vaza o tamanho do prefixo
 * comum pelo tempo de resposta (docs/04-seguranca.md 7.7).
 */
export async function verificarSenha(senha: string, phc: string): Promise<boolean> {
  const parametros = decodificarPhc(phc);
  if (parametros === undefined) return false;
  const derivado = await derivar(
    senha.normalize('NFKC'),
    parametros.sal,
    parametros.iteracoes,
    parametros.derivado.length,
    DIGEST,
  );
  if (derivado.length !== parametros.derivado.length) return false;
  return timingSafeEqual(derivado, parametros.derivado);
}

/**
 * Guardar os parâmetros junto do hash só vale alguma coisa se alguém os usar.
 * No login bem-sucedido, hash abaixo da política vigente é regravado dentro da
 * mesma transação; sem isso o formato PHC é documentação
 * (docs/04-seguranca.md 7.7, BICHUS-17 critério 6).
 */
export function precisaDeRehash(phc: string): boolean {
  const parametros = decodificarPhc(phc);
  if (parametros === undefined) return true;
  return (
    parametros.iteracoes < ITERACOES_VIGENTES ||
    parametros.sal.length < BYTES_DE_SAL ||
    parametros.derivado.length < BYTES_DERIVADOS
  );
}

/**
 * Hash de descarte, usado quando o e-mail não existe.
 *
 * A derivação precisa acontecer **mesmo sem usuário**, com os mesmos
 * parâmetros. Sem isso, a diferença entre "não achei o usuário" e "derivei
 * 210.000 iterações" é um oráculo de enumeração de centenas de milissegundos,
 * que anula a resposta 401 idêntica que o contrato tomou o cuidado de
 * especificar (docs/04-seguranca.md 7.1).
 *
 * É gerado uma vez por processo e nunca corresponde a senha nenhuma.
 */
let phcDeDescarte: string | undefined;

export async function consumirTempoDeVerificacao(senha: string): Promise<void> {
  phcDeDescarte ??= await gerarHashDeSenha(randomBytes(32).toString('base64'));
  await verificarSenha(senha, phcDeDescarte);
}
