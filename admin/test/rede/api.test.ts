import { describe, expect, it } from 'vitest';

import { criarClienteDaApi } from '../../src/api/cliente.ts';
import { criarApiDaRede, esperaPorExtenso } from '../../src/rede/api/redeApi.ts';
import { criarDuble } from '../../src/rede/duble/servidor.ts';
import { pedidosDeSenha } from './verificacoes.ts';

function montar() {
  const duble = criarDuble();
  const cliente = criarClienteDaApi({ fetch: duble.fetch });
  return { duble, api: criarApiDaRede({ cliente, fetch: duble.fetch }) };
}

describe('cliente da Rede contra o duble', () => {
  it('lista com os parâmetros do contrato', async () => {
    const { duble, api } = montar();
    const r = await api.listar({ sort: 'agenda', page: 1, limit: 20, publication_status: 'published', timing: 'ended' });
    expect(r.ok && r.dados.items.map((e) => e.slug)).toEqual(['piquenique-dos-vira-latas']);
    const consulta = duble.registro.at(-1)?.consulta;
    expect(consulta?.get('timing')).toBe('ended');
    expect(consulta?.get('publication_status')).toBe('published');
  });

  it('lê o ETag e o devolve em If-Match; versão velha vira falha de versão', async () => {
    const { api } = montar();
    const lido = await api.obter('encontro-de-caes-no-parque');
    expect(lido.ok && lido.etag).toBe('"1"');
    const ok = await api.atualizar('encontro-de-caes-no-parque', '"1"', { title: 'Outro título' });
    expect(ok.ok && ok.etag).toBe('"2"');
    const velho = await api.atualizar('encontro-de-caes-no-parque', '"1"', { title: 'De novo' });
    expect(!velho.ok && velho.falha).toEqual({ tipo: 'versao' });
  });

  it('observação com contato volta como validação, com o código do contrato', async () => {
    const { api } = montar();
    const r = await api.atualizar('encontro-de-caes-no-parque', '"1"', { notes: 'Liga 11987654321' });
    expect(!r.ok && r.falha).toEqual({ tipo: 'validacao', erros: [{ field: 'notes', code: 'contact_or_payment_detected' }] });
  });

  it('remover, cancelar, mover e mudar acesso saem só com If-Match, sem senha (07/10)', async () => {
    const { duble, api } = montar();
    const movido = await api.mover('encontro-de-caes-no-parque', '"1"', { starts_at: '2026-10-11T13:00:00Z', reason: 'chuva' });
    expect(movido.ok).toBe(true);
    const acesso = await api.mudarAcesso('encontro-de-caes-no-parque', '"2"', { admission: { kind: 'paid', price: { amount: 1000, currency: 'BRL', unit: 'per_pet' } }, reason: 'chuva' });
    expect(acesso.ok).toBe(true);
    expect((await api.cancelar('encontro-de-caes-no-parque', '"3"', 'Obra na praça')).ok).toBe(true);
    expect((await api.remover('encontro-de-caes-no-parque', '"4"')).ok).toBe(true);
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
  });

  it('fila: aprovar não volta a recusado; recusado pode ser aprovado', async () => {
    const { api } = montar();
    const pend = await api.pedidos('k3Jx9QpL2mZt7VwR4cYb', 'pending');
    expect(pend.ok && pend.dados.total).toBe(3);
    const aprovado = await api.aprovar('rq_Rafael_0004dddddddddd');
    expect(!aprovado.ok && aprovado.falha.tipo).toBe('validacao');
    expect((await api.recusar('rq_Rafael_0004dddddddddd')).ok).toBe(false);
    expect((await api.aprovar('rq_Marcos_0005eeeeeeeeee')).ok).toBe(true);
  });

  it('envio de foto: intenção com o propósito do encontro, bytes direto ao armazenamento', async () => {
    const { duble, api } = montar();
    const r = await api.enviarFoto(new File([new Uint8Array(10)], 'praca.jpg', { type: 'image/jpeg' }));
    expect(r).toMatchObject({ ok: true });
    const intencao = duble.registro.find((x) => x.caminho.endsWith('/catalog-image-intents'));
    expect(intencao?.corpo).toEqual({ purpose: 'network_event', content_type: 'image/jpeg', byte_size: 10 });
    expect(duble.registro.at(-1)?.metodo).toBe('PUT');
  });

  it('espera por extenso a partir do Retry-After', () => {
    expect(esperaPorExtenso(60)).toBe('1 minuto');
    expect(esperaPorExtenso(900)).toBe('15 minutos');
    expect(esperaPorExtenso(3600)).toBe('1 hora');
  });
});

describe('mensagens de falha (UX 30, B16 e B19)', async () => {
  const { mensagemDaFalha } = await import('../../src/rede/api/mensagens.ts');
  it('removido e título repetido', () => {
    expect(mensagemDaFalha({ tipo: 'validacao', erros: [{ field: 'slug', code: 'event_removed' }] }, 'salvar')).toBe(
      'Este encontro foi removido. Ele não aparece no app e não pode mais ser alterado.',
    );
    expect(mensagemDaFalha({ tipo: 'encontro-fechado' }, 'aprovar')).toBe('Este encontro não está mais aberto a pedidos. Eles não podem mais ser aprovados nem recusados.');
    expect(mensagemDaFalha({ tipo: 'endereco-ocupado' }, 'salvar')).toBe('Já existe um encontro com um título parecido. Mude o título e tente de novo.');
  });
});

describe('428 precondition-required (If-Match faltando)', () => {
  it('o painel trata como "reler", com texto próprio', async () => {
    const duble = criarDuble();
    const cliente = criarClienteDaApi({ fetch: duble.fetch });
    const api = criarApiDaRede({ cliente, fetch: duble.fetch });
    // Sem If-Match: o servidor responde 428.
    const r = await api.remover('encontro-de-caes-no-parque', '');
    expect(!r.ok && r.falha).toEqual({ tipo: 'sem-versao' });
    const { precisaReler } = await import('../../src/rede/api/redeApi.ts');
    const { mensagemDaFalha } = await import('../../src/rede/api/mensagens.ts');
    if (r.ok) throw new Error('deveria falhar');
    expect(precisaReler(r.falha)).toBe(true);
    expect(mensagemDaFalha(r.falha, 'remover')).toMatch(/^Não conseguimos confirmar qual versão deste encontro você está vendo, e nada foi gravado\./);
    expect(mensagemDaFalha(r.falha, 'remover')).not.toMatch(/Alguém alterou/);
  });

  it('toda escrita que o contrato protege com If-Match sai com ele, nas telas (isca do 428)', async () => {
    const { falhaDaResposta } = await import('../../src/rede/api/redeApi.ts');
    expect(falhaDaResposta(new Response(null, { status: 428 }), { type: 'x/precondition-required' })).toEqual({ tipo: 'sem-versao' });
    expect(falhaDaResposta(new Response(null, { status: 412 }), { type: 'x/precondition-failed' })).toEqual({ tipo: 'versao' });
  });
});
