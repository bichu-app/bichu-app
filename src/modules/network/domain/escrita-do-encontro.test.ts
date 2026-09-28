/**
 * As regras da escrita administrativa da `Rede`, sem banco e sem servidor.
 *
 * Cada regra tem o caso que precisa reprovar: o detector de D59 com cada forma
 * de contato e de pagamento, a transicao aprovado -> recusado, o `slug` do
 * privado que nao pode carregar o que o administrador digitou, e a projecao da
 * fila que nao pode levar mais que os tres campos de D53.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  entradaDoCorpo,
  encontroAbertoParaDecisao,
  errosDasObservacoes,
  mesEmSaoPaulo,
  normalizarParaConferencia,
  errosDeTexto,
  errosDoHorario,
  lerIfMatch,
  podeDecidir,
  pontoMudou,
  projetarPedido,
  slugDoPrivado,
  slugDoTitulo,
  tempoDoEncontro,
} from './escrita-do-encontro.js';

const AGORA = Date.UTC(2026, 8, 28, 12, 0, 0) as Instant;
const d = (iso: string): Date => comoData(Date.parse(iso) as Instant);

void describe('D59: observacoes sem contato nem pagamento', () => {
  const codigos = (texto: string): string[] => errosDasObservacoes('notes', texto).map((e) => e.code);

  void it('ISCA: cada forma de contato e de pagamento e recusada', () => {
    for (const texto of [
      'Liga no (11) 98765-4321',
      'nove oito sete seis cinco quatro tres dois um',
      '1​1​9​8​7​6​5​4​3​2',
      'contato: org@exemplo.test',
      'https://exemplo.test/inscricao',
      'CEP 01310-100',
      'Avenida Paulista, 1000',
      'Chave pix: 123.456.789-09',
      'PIX na hora',
      'cnpj 12.345.678/0001-90',
      'chave 123e4567-e89b-12d3-a456-426614174000',
    ]) {
      assert.deepEqual(codigos(texto), ['contact_or_payment_detected'], texto);
    }
  });

  void it('ISCA (QA 28/09): encurtador, dominio, @perfil, PIX quebrado e dados bancarios sao recusados', () => {
    for (const texto of [
      'Inscricao em bit.ly/encontro',
      'Tudo em linktr.ee/organizacao',
      'veja meusite.com.br',
      'fale no wa.me/5511987654321',
      'site . com',
      'siga @organizacao',
      'Pague no p i x',
      'Pague no p-i-x',
      'Pague no P1X',
      'Pague no Pïx',
      'Aceitamos PicPay',
      'Aceitamos pic pay',
      'Mercado Pago na entrada',
      'ag 1234 cc 56789-0',
      'Agência: 0001 Conta: 12345-6',
      'deposite em qualquer.dominio/caminho',
    ]) {
      assert.deepEqual(codigos(texto), ['contact_or_payment_detected'], texto);
    }
  });

  void it('a normalizacao junta letra quebrada, troca digito que imita letra e tira acento', () => {
    assert.equal(normalizarParaConferencia('P-1-X e Pïx').letras, 'pix e pix');
    assert.equal(normalizarParaConferencia('p i x').letras, 'pix');
    assert.equal(normalizarParaConferencia('ag 1234').base, 'ag 1234');
  });

  void it('texto de complemento passa', () => {
    for (const texto of [
      'Traga agua e saquinho.',
      'Encontro na praca central, perto do coreto.',
      'Caes de todos os portes.',
      'Traga água.Leve petisco e um mix de brinquedos.',
      'Picnic liberado na sombra; evite pisar no canteiro.',
      'A agenda do mês tem 3 encontros e 2 caminhadas.',
    ]) {
      assert.deepEqual(codigos(texto), [], texto);
    }
  });

  void it('tamanho medido como o CHECK mede, e controle bidirecional recusado em todo texto', () => {
    assert.deepEqual(codigos(' a '), ['length']);
    assert.deepEqual(codigos('a'.repeat(501)), ['length']);
    assert.deepEqual(errosDeTexto('title', 'Caminhada⁦', 2, 120).map((e) => e.code), ['bidi_control']);
    assert.deepEqual(errosDeTexto('title', 'Caminhada', 2, 120), []);
  });
});

void describe('tempo e fuso', () => {
  const codigos = (ini: string, fim: string | null, fuso = 'America/Sao_Paulo') =>
    errosDoHorario(d(ini), fim === null ? null : d(fim), fuso, AGORA).map((e) => e.code);

  void it('fim antes do inicio, encontro que ja terminou e fuso inexistente sao recusados', () => {
    assert.deepEqual(codigos('2026-10-10T12:00:00Z', '2026-10-10T11:00:00Z'), ['ends_before_start']);
    assert.deepEqual(codigos('2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z'), ['event_in_past']);
    assert.deepEqual(codigos('2026-09-28T11:00:00Z', null), ['event_in_past']);
    assert.deepEqual(codigos('2026-10-10T12:00:00Z', null, 'America/Sao_Paul'), ['unknown_time_zone']);
  });

  void it('comecou e ainda nao terminou e aceito (corrigir encontro em andamento); o rotulo temporal e o da leitura publica', () => {
    assert.deepEqual(codigos('2026-09-28T11:00:00Z', '2026-09-28T13:00:00Z'), []);
    assert.equal(tempoDoEncontro({ startsAt: d('2026-09-28T11:00:00Z'), endsAt: d('2026-09-28T13:00:00Z') }, AGORA), 'happening');
    assert.equal(tempoDoEncontro({ startsAt: d('2026-09-28T11:00:00Z'), endsAt: null }, AGORA), 'ended');
    assert.equal(tempoDoEncontro({ startsAt: d('2026-10-01T11:00:00Z'), endsAt: null }, AGORA), 'upcoming');
  });
});

void describe('condicao de acesso', () => {
  void it('pago sem valor e gratuito com valor sao recusados', () => {
    assert.deepEqual(entradaDoCorpo({ kind: 'paid' }), {
      erros: [{ field: 'admission.price', code: 'admission_incomplete', message: 'Encontro pago precisa do valor e da unidade.' }],
    });
    const gratis = entradaDoCorpo({ kind: 'free', price: { amount: 100, currency: 'BRL', unit: 'per_dog' } });
    assert.ok('erros' in gratis);
    assert.deepEqual(entradaDoCorpo(undefined), { entrada: { tipo: 'free' } });
    assert.deepEqual(entradaDoCorpo({ kind: 'paid', price: { amount: 1500, currency: 'BRL', unit: 'per_pair' } }), {
      entrada: { tipo: 'paid', centavos: 1500, unidade: 'per_pair' },
    });
  });
});

void describe('slug', () => {
  void it('ISCA: o do privado e aleatorio, no formato do CHECK, e nao depende do titulo', () => {
    const a = slugDoPrivado(new Uint8Array(16).fill(7));
    const b = slugDoPrivado(new Uint8Array(16).fill(8));
    assert.match(a, /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/);
    assert.equal(a.length, 25);
    assert.notEqual(a, b);
    assert.equal(slugDoPrivado(new Uint8Array(16)), '0'.repeat(25));
  });

  void it('o do publico deriva do titulo, sem acento nem pontuacao, e com sufixo quando pedido', () => {
    assert.equal(slugDoTitulo('Caminhada: cães & tutores!'), 'caminhada-caes-tutores');
    assert.equal(slugDoTitulo('Caminhada no parque', 'ab12'), 'caminhada-no-parque-ab12');
    assert.equal(slugDoTitulo('!!'), undefined);
    assert.equal(slugDoTitulo('!!', 'ab12'), 'encontro-ab12');
    assert.ok((slugDoTitulo('x'.repeat(80), 'ab12') ?? '').length <= 30);
  });
});

void describe('decisao do pedido', () => {
  void it('ISCA: aprovado nao volta a recusado, nem e aprovado de novo', () => {
    assert.equal(podeDecidir({ decisao: 'approved', withdrawnAt: null }, 'declined'), false);
    assert.equal(podeDecidir({ decisao: 'approved', withdrawnAt: null }, 'approved'), false);
  });

  void it('recusado pode ser revertido para aprovado; pendente vai aos dois; desistido nao se decide', () => {
    assert.equal(podeDecidir({ decisao: 'declined', withdrawnAt: null }, 'approved'), true);
    assert.equal(podeDecidir({ decisao: 'declined', withdrawnAt: null }, 'declined'), false);
    assert.equal(podeDecidir({ decisao: 'pending', withdrawnAt: null }, 'approved'), true);
    assert.equal(podeDecidir({ decisao: 'pending', withdrawnAt: null }, 'declined'), true);
    assert.equal(podeDecidir({ decisao: 'declined', withdrawnAt: d('2026-09-20T00:00:00Z') }, 'approved'), false);
  });

  void it('D53: a projecao da fila leva so nome, mes da conta e o booleano do e-mail', () => {
    const p = projetarPedido({
      id: '0192a3b4-0000-7000-8000-000000000001',
      ref: 'refDoPedidoAAAAAAAAAAA',
      decisao: 'pending',
      requestedAt: d('2026-09-27T10:00:00Z'),
      decidedAt: null,
      withdrawnAt: null,
      encontro: { slug: 'abc', title: 'Encontro', startsAt: d('2026-10-10T12:00:00Z'), endsAt: null, timeZone: 'America/Sao_Paulo', publicacao: 'published' },
      solicitante: { displayName: 'Ana', contaCriadaEm: d('2024-07-19T15:30:00Z'), emailConfirmado: false },
    });
    assert.deepEqual(Object.keys(p.requester).sort(), ['display_name', 'email_verified', 'member_since']);
    assert.equal(p.requester.member_since, '2024-07');
    assert.ok(!JSON.stringify(p).includes('0192a3b4'), 'o id interno saiu na projecao');
  });
});

void describe('o encontro ainda recebe decisao sobre pedido? (QA 28/09)', () => {
  const futuro = { startsAt: d('2026-10-10T12:00:00Z'), endsAt: d('2026-10-10T14:00:00Z') };
  void it('ISCA: cancelado, removido e encerrado nao recebem; so o publicado que nao terminou recebe', () => {
    assert.equal(encontroAbertoParaDecisao({ ...futuro, publicacao: 'published' }, AGORA), true);
    assert.equal(encontroAbertoParaDecisao({ ...futuro, publicacao: 'cancelled' }, AGORA), false);
    assert.equal(encontroAbertoParaDecisao({ ...futuro, publicacao: 'removed' }, AGORA), false);
    assert.equal(
      encontroAbertoParaDecisao({ publicacao: 'published', startsAt: d('2026-09-01T12:00:00Z'), endsAt: d('2026-09-01T14:00:00Z') }, AGORA),
      false,
    );
  });
});

void describe('mes de criacao da conta em America/Sao_Paulo (QA 28/09)', () => {
  void it('ISCA: 01/04 as 02h UTC ainda e marco em Sao Paulo', () => {
    assert.equal(mesEmSaoPaulo(d('2026-04-01T02:00:00Z')), '2026-03');
    assert.equal(mesEmSaoPaulo(d('2026-04-01T03:00:00Z')), '2026-04');
  });
});

void describe('miudezas', () => {
  void it('If-Match: ausente, numero, e qualquer outra forma invalida', () => {
    assert.deepEqual(lerIfMatch(undefined), { tipo: 'ausente' });
    assert.deepEqual(lerIfMatch('"3"'), { tipo: 'numero', versao: 3 });
    assert.deepEqual(lerIfMatch('*'), { tipo: 'invalida' });
    assert.deepEqual(lerIfMatch('W/"3"'), { tipo: 'invalida' });
  });

  void it('o ponto mudou compara valor, sem precisar da coordenada fora daqui', () => {
    assert.equal(pontoMudou(null, null), false);
    assert.equal(pontoMudou(null, { lat: 1, lon: 1 }), true);
    assert.equal(pontoMudou({ lat: 1, lon: 1 }, { lat: 1, lon: 1 }), false);
  });
});
