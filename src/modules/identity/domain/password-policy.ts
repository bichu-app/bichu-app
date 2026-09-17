/**
 * Política de senha, alinhada ao NIST SP 800-63B (ADR-0003).
 *
 * Mínimo de 10 caracteres, **sem exigência de composição** e **sem expiração
 * periódica**. Regra de composição empurra o usuário para `Senha@123`, que é
 * pior que uma frase longa, e é o ponto em que a prática antiga ainda circula
 * como se fosse correta.
 *
 * O que a política recusa é o que de fato quebra: senha curta, senha parecida
 * com o e-mail ou com o nome, e senha de lista de vazamento. A consulta à lista
 * de vazamentos é uma porta (`PasswordBreachList`) e não está implementada nesta
 * entrega; a ausência dela **não** silencia a verificação, ela só devolve
 * "desconhecido" e o resto da política continua valendo.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';

export const TAMANHO_MINIMO = 10;
export const TAMANHO_MAXIMO = 256;

export interface ContextoDaSenha {
  readonly email: string;
  readonly displayName?: string | undefined;
}

function normalizarParaComparacao(valor: string): string {
  return valor
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Semelhança com e-mail e nome. A comparação é feita sobre a forma normalizada,
 * porque `Marina.2024` e `marina2024` são a mesma senha do ponto de vista de
 * quem ataca a partir do endereço da conta.
 */
function pareceComIdentidade(senha: string, contexto: ContextoDaSenha): boolean {
  const alvo = normalizarParaComparacao(senha);
  if (alvo.length === 0) return false;

  const candidatos = [
    contexto.email.split('@')[0] ?? '',
    contexto.email,
    contexto.displayName ?? '',
  ]
    .map(normalizarParaComparacao)
    .filter((item) => item.length >= 4);

  return candidatos.some((item) => alvo.includes(item) || item.includes(alvo));
}

export function validarSenha(senha: string, contexto: ContextoDaSenha): ProblemFieldError[] {
  const erros: ProblemFieldError[] = [];

  if (senha.length < TAMANHO_MINIMO) {
    erros.push({
      field: 'password',
      code: 'too_short',
      message: `Use pelo menos ${TAMANHO_MINIMO} caracteres. Uma frase que só você lembra funciona bem.`,
    });
  }
  if (senha.length > TAMANHO_MAXIMO) {
    // O teto existe contra derivação cara com entrada gigante, não contra o
    // usuário: 256 caracteres cabem em qualquer frase que alguém escreva.
    erros.push({
      field: 'password',
      code: 'too_long',
      message: `Use no máximo ${TAMANHO_MAXIMO} caracteres.`,
    });
  }
  if (senha.trim().length === 0) {
    erros.push({ field: 'password', code: 'blank', message: 'A senha não pode ser só espaços.' });
  }
  if (pareceComIdentidade(senha, contexto)) {
    erros.push({
      field: 'password',
      code: 'similar_to_identity',
      message: 'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.',
    });
  }

  return erros;
}
