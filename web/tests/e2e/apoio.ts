import { expect, type APIRequestContext, type Page } from '@playwright/test';
export { CODIGOS, TOKENS, SENHAS } from '../mock/cenarios.mjs';

export const MOCK = 'http://127.0.0.1:4399';

export type Pedido = { metodo: string; caminho: string; operacao: string | null; cabecalhos: Record<string, string>; corpo: unknown; erro?: string };

export async function limparPedidos(request: APIRequestContext) {
  await request.delete(`${MOCK}/__mock/pedidos`);
}
export async function pedidos(request: APIRequestContext): Promise<Pedido[]> {
  return (await request.get(`${MOCK}/__mock/pedidos`)).json();
}

/** Nenhuma chamada do site saiu do contrato (o mock registra caminho fora do contrato como erro). */
export async function semChamadaForaDoContrato(request: APIRequestContext) {
  const fora = (await pedidos(request)).filter((p) => p.erro);
  expect(fora, 'o site chamou a API fora do contrato').toEqual([]);
}

export async function titulo(page: Page) {
  return (await page.locator('h1').first().textContent())?.trim();
}
