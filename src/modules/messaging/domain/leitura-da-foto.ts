/** Dez minutos, em segundos. */
export const VALIDADE_DA_URL_DA_FOTO_EM_SEGUNDOS = 600;

const DONO_SEM_IDENTIFICADOR = 'sem-conta';

/** `true` quando a chave pode ser servida a quem NAO tem conta. */
export function podeSairParaQuemNaoTemConta(chave: string): boolean {
  const segmentos = chave.split('/');
  return (
    segmentos.length === 4 &&
    segmentos[0] === 'found-reports' &&
    segmentos[1] === DONO_SEM_IDENTIFICADOR &&
    segmentos[2] === 'sanitized'
  );
}

/** UMA FOTO QUE ESTE CHAMADOR ENVIAR CHEGA A SER LIDA PELO OUTRO LADO? */
export function fotoAlcancaOutroLado(conversa: { readonly achadorTemConta: boolean }): boolean {
  return conversa.achadorTemConta;
}
