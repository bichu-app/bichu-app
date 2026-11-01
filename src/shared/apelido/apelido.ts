import { problemas } from '../http/errors.js';

/** A forma do apelido: **5 a 20**, minúsculas latinas, dígitos e hífen. */
export const FORMA_DO_APELIDO = /^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$/;

/** O piso da faixa, para a mensagem dizer o número e não uma aproximação. */
export const MINIMO_DO_APELIDO = 5;

/** O teto da faixa. Do normalizado — que é idêntico ao digitado, ver o topo. */
export const MAXIMO_DO_APELIDO = 20;

const PARECIDOS: ReadonlyMap<string, string> = new Map([
  ['0', 'o'],
  ['1', 'l'],
  ['i', 'l'],
  ['5', 's'],
  ['3', 'e'],
]);

/** As palavras reservadas do plano 4-C.6, refeitas para o piso de 5. */
export const RESERVADAS: readonly string[] = [
  'public',
  'media',
  'static',
  'assets',
  'health',
  'cartaz',
  'login',
  'entrar',
  'conta',
  'perfil',
  'perto',
  'achado',
  'perdido',
  'plaquinha',
  'evento',
  'eventos',
  'diretorio',
  'busca',
  'termos',
  'privacidade',
  'sobre',
  'bichu',
  'oficial',
  'equipe',
  'suporte',
  'atendimento',
  'ajuda',
  'moderacao',
  'moderador',
  'seguranca',
  'admin',
  'administrador',
  'sistema',
  'contato',
  'noreply',
  'no-reply',
  'verificado',
  'validado',
  'premium',
  'premio',
  'recompensa',
  'sorteio',
  'ganhador',
  'pagamento',
  'cobranca',
  'false',
  'teste',
  'usuario',
  'anonimo',
  'deleted',
  'excluido',
  'undefined',
];

const CONTIDA_PROIBIDA = 'bichu';

const CAMPO = 'handle';

/** O apelido normalizado: minúsculo e aparado, e nada mais. */
export function normalizarApelido(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/** O **esqueleto** de um apelido: sem hífen e com os parecidos colapsados. */
export function esqueletoDoApelido(bruto: string): string {
  const semHifen = normalizarApelido(bruto).replaceAll('-', '');
  let saida = '';
  for (const caractere of semHifen) {
    saida += PARECIDOS.get(caractere) ?? caractere;
  }
  return saida;
}

/** `true` quando o apelido cai numa palavra reservada. */
export function apelidoEhReservado(bruto: string): boolean {
  const esqueleto = esqueletoDoApelido(bruto);

  if (esqueleto.includes(esqueletoDoApelido(CONTIDA_PROIBIDA))) return true;

  return RESERVADAS.some((palavra) => esqueletoDoApelido(palavra) === esqueleto);
}

/** Três sugestões derivadas do que a pessoa digitou. */
export function sugestoesDeApelido(bruto: string): readonly string[] {
  const base = normalizarApelido(bruto)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAXIMO_DO_APELIDO - 3);

  const semente = base.length > 0 ? base : 'pessoa';

  const sufixos = ['-bichu-1', '-01', '-oi'];
  const candidatas: string[] = [];
  for (const sufixo of sufixos) {
    let candidata = `${semente}${sufixo}`.slice(0, MAXIMO_DO_APELIDO);
    candidata = candidata.replace(/-+$/g, '');
    while (candidata.length < MINIMO_DO_APELIDO) candidata += '0';
    if (FORMA_DO_APELIDO.test(candidata) && !apelidoEhReservado(candidata)) {
      candidatas.push(candidata);
    }
  }

  for (const extra of ['-10', '-20', '-30', '-40', '-50']) {
    if (candidatas.length >= 3) break;
    let candidata = `${semente}${extra}`.slice(0, MAXIMO_DO_APELIDO).replace(/-+$/g, '');
    while (candidata.length < MINIMO_DO_APELIDO) candidata += '0';
    if (
      FORMA_DO_APELIDO.test(candidata) &&
      !apelidoEhReservado(candidata) &&
      !candidatas.includes(candidata)
    ) {
      candidatas.push(candidata);
    }
  }

  return candidatas.slice(0, 3);
}

/** Confere o apelido recebido e devolve o **normalizado**. */
export function verificarApelido(bruto: unknown): string {
  if (typeof bruto !== 'string' || bruto.trim().length === 0) {
    throw problemas.validacao([
      { field: CAMPO, code: 'required', message: 'Escolha um apelido.' },
    ]);
  }

  const apelido = normalizarApelido(bruto);

  if (apelido.length < MINIMO_DO_APELIDO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_short',
        message: `Use no mínimo ${MINIMO_DO_APELIDO} caracteres no apelido.`,
      },
    ]);
  }
  if (apelido.length > MAXIMO_DO_APELIDO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_long',
        message: `Use no máximo ${MAXIMO_DO_APELIDO} caracteres no apelido.`,
      },
    ]);
  }

  if (!FORMA_DO_APELIDO.test(apelido)) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'format',
        message: `De ${MINIMO_DO_APELIDO} a ${MAXIMO_DO_APELIDO} caracteres: letras minúsculas, números e hífen.`,
      },
    ]);
  }

  if (apelidoEhReservado(apelido)) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'reserved',
        message: `De ${MINIMO_DO_APELIDO} a ${MAXIMO_DO_APELIDO} caracteres: letras minúsculas, números e hífen.`,
      },
    ]);
  }

  return apelido;
}

/** Traduz a violação de unicidade do banco em recusa de campo. */
export function recusaDeApelidoTomado(erro: unknown): unknown {
  const comCodigo = erro as { code?: string; constraint?: string; message?: string };
  if (comCodigo.code !== '23505') return undefined;

  const alvo = `${comCodigo.constraint ?? ''} ${comCodigo.message ?? ''}`;
  const ehApelido =
    alvo.includes('handles_pkey') ||
    alvo.includes('handles_esqueleto_unico') ||
    alvo.includes('handles_uma_pessoa_um_apelido') ||
    alvo.includes('handle');
  if (!ehApelido) return undefined;

  return problemas.validacao([
    {
      field: CAMPO,
      code: 'taken',
      message: 'Esse apelido já está em uso. Escolha outro.',
    },
  ]);
}
