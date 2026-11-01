const CARACTERE_PROIBIDO_NO_ENDERECO =
  // eslint-disable-next-line no-control-regex -- os controles são exatamente o alvo
  /[\u0000-\u0020\u007F-\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF<>,;:"\\]/u;

/** O motivo, pronto para a mensagem de erro, ou `null` se o endereço passa. */
export function motivoDaRecusaDeEndereco(endereco: string): string | null {
  const achado = CARACTERE_PROIBIDO_NO_ENDERECO.exec(endereco);
  if (achado === null) return null;
  const codigo = achado[0].codePointAt(0) ?? 0;
  const ponto = `U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`;
  return codigo === 0x0d || codigo === 0x0a
    ? `quebra de linha (${ponto})`
    : `caractere que o transporte não carrega (${ponto})`;
}
