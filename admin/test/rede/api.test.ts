import { describe, expect, it } from 'vitest';

import { criarClienteDaApi } from '../../src/api/cliente.ts';
import { criarApiDaRede, esperaPorExtenso, reautenticarPeloCliente } from '../../src/rede/api/redeApi.ts';
import { criarDuble, SENHA_DO_DUBLE } from '../../src/rede/duble/servidor.ts';
import { sensiveisSemReautenticacao } from './verificacoes.ts';

function montar() {
  const duble = criarDuble();
  const cliente = criarClienteDaApi({ fetch: duble.fetch });
  return { duble, api: criarApiDaRede({ cliente, fetch: duble.fetch }), reautenticar: reautenticarPeloCliente(cliente) };
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

  it('remover sem token pede a senha; senha errada é "incorreta"; com senha, remove', async () => {
    const { duble, api, reautenticar } = montar();
    const sem = await api.remover('', 'encontro-de-caes-no-parque', '"1"');
    expect(!sem.ok && sem.falha).toEqual({ tipo: 'precisa-da-senha' });
    expect(await reautenticar('errada', 'network_event_removal')).toEqual({ ok: false, motivo: 'incorreta' });
    const t = await reautenticar(SENHA_DO_DUBLE, 'network_event_removal');
    if (!t.ok) throw new Error('reautenticação do duble falhou');
    const r = await api.remover(t.token, 'encontro-de-caes-no-parque', '"1"');
    expect(r.ok).toBe(true);
    expect(duble.encontros.get('encontro-de-caes-no-parque')?.publication_status).toBe('removed');
    // A primeira tentativa, sem token, e exatamente o que a verificacao acusa.
    expect(sensiveisSemReautenticacao(duble.registro)).toHaveLength(1);
  });

  it('token de um escopo não abre outro, e não vale duas vezes', async () => {
    const { api, reautenticar } = montar();
    const t = await reautenticar(SENHA_DO_DUBLE, 'network_event_cancellation');
    if (!t.ok) throw new Error('reautenticação do duble falhou');
    const outro = await api.remover(t.token, 'encontro-de-caes-no-parque', '"1"');
    expect(!outro.ok && outro.falha.tipo).toBe('precisa-da-senha');
    const t2 = await reautenticar(SENHA_DO_DUBLE, 'network_event_cancellation');
    if (!t2.ok) throw new Error('reautenticação do duble falhou');
    expect((await api.cancelar(t2.token, 'encontro-de-caes-no-parque', '"1"', 'Obra na praça')).ok).toBe(true);
    const repetido = await api.cancelar(t2.token, 'encontro-de-caes-no-parque', '"2"', 'Obra na praça');
    expect(!repetido.ok && repetido.falha.tipo).toBe('precisa-da-senha');
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
