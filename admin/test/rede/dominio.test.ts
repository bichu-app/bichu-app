import { describe, expect, it } from 'vitest';

import {
  corpoDaMudanca,
  formularioDoEncontro,
  formularioVazio,
  montarCriacao,
  planoDeEdicao,
  tituloDaMudanca,
  validar,
  type EstadoDoFormulario,
} from '../../src/rede/dominio/formulario.ts';
import { campoDoInstante, dataCurta, faixaDeHorario, instanteDoCampo, mesPorExtenso } from '../../src/rede/dominio/horario.ts';
import { acoesDoEncontro, consultaDaLista, seloDoEncontro, textoDaContagem, textoSemResultado } from '../../src/rede/dominio/lista.ts';
import { achadosNasObservacoes } from '../../src/rede/dominio/observacoes.ts';
import { centavosDoTexto, valorComoOAppMostra } from '../../src/rede/dominio/valor.ts';
import { encontroDeExemplo } from '../../src/rede/duble/massa.ts';

describe('observações (D59, conveniência de tela)', () => {
  it('recusa os casos que PRECISAM reprovar', () => {
    const casos: Array<[string, string]> = [
      ['telefone', 'Chama no (11) 98765-4321'],
      ['telefone', 'zap 11987654321'],
      ['telefone', 'liga 11 9 8765 4321'],
      ['telefone', 'com largura zero 1\u200B1\u200B9\u200B8\u200B7\u200B6\u200B5\u200B4\u200B3'],
      ['telefone', 'dígitos de largura total \uFF11\uFF11\uFF19\uFF18\uFF17\uFF16\uFF15\uFF14\uFF13\uFF12\uFF11'],
      ['email', 'escreve para ana@exemplo.com.br'],
      ['email', 'ana arroba exemplo . com'],
      ['link', 'inscrição em https://exemplo.com/x'],
      ['link', 'veja www.exemplo.com'],
      ['link', 'site exemplo.com.br'],
      ['pix', 'paga no Pix antes'],
      ['pix', 'chave 123e4567-e89b-12d3-a456-426614174000'],
      ['endereco', 'fica na Rua das Flores, 123'],
      ['endereco', 'Av. Paulista perto do metrô'],
      ['endereco', 'portão nº 40'],
      ['bidi', 'texto com \u202E invertido'],
    ];
    for (const [tipo, texto] of casos) {
      expect(achadosNasObservacoes(texto), texto).toContain(tipo);
    }
  });

  it('deixa passar texto de complemento comum', () => {
    for (const texto of [
      'Ponto de encontro ao lado do lago.',
      'Até 10 filhotes por turma.',
      'Traga água; a praça tem pouca sombra depois das 10h.',
      'Encontro na Praça Benedito Calixto, perto do coreto.',
    ]) {
      expect(achadosNasObservacoes(texto), texto).toEqual([]);
    }
  });
});

describe('valor', () => {
  it('lê reais em centavos e recusa o resto', () => {
    expect(centavosDoTexto('15')).toBe(1500);
    expect(centavosDoTexto('15,5')).toBe(1550);
    expect(centavosDoTexto('15,50')).toBe(1550);
    expect(centavosDoTexto('1.250,00')).toBe(125000);
    for (const ruim of ['', '0', '15.5', 'R$ 15', '15,555', 'abc', '-3', '1000001']) {
      expect(centavosDoTexto(ruim), ruim).toBeNull();
    }
  });
  it('escreve como o app', () => {
    expect(valorComoOAppMostra(1500, 'per_dog')).toBe('R$ 15 por cão');
    expect(valorComoOAppMostra(1550, 'per_pair')).toBe('R$ 15,50 por dupla');
    expect(valorComoOAppMostra(125000, 'per_person')).toBe('R$ 1.250 por pessoa');
  });
});

describe('horário de Brasília', () => {
  it('converte o campo local para UTC e volta', () => {
    expect(instanteDoCampo('2026-10-10T09:00')).toBe('2026-10-10T12:00:00.000Z');
    expect(campoDoInstante('2026-10-10T12:00:00Z')).toBe('2026-10-10T09:00');
    expect(instanteDoCampo('10/10/2026')).toBeNull();
  });
  it('formata para a tela', () => {
    expect(dataCurta('2026-10-03T12:00:00Z')).toBe('sáb, 03/10/2026');
    expect(dataCurta('2026-09-27T12:00:00Z')).toBe('dom, 27/09/2026');
    expect(faixaDeHorario('2026-09-27T12:00:00Z', '2026-09-27T14:00:00Z')).toBe('9:00 às 11:00');
    expect(faixaDeHorario('2026-09-27T12:00:00Z', null)).toBe('9:00');
    expect(mesPorExtenso('2026-03')).toBe('março de 2026');
  });
});

function preenchido(): EstadoDoFormulario {
  return {
    ...formularioVazio(),
    titulo: 'Encontro no parque',
    resumo: 'Manhã de sábado.',
    inicio: '2026-10-10T09:00',
    fim: '2026-10-10T11:00',
    local: 'Parque da Aclimação',
    bairro: 'Aclimação',
    cidade: 'São Paulo',
  };
}
const AGORA = new Date('2026-09-28T12:00:00Z');

describe('validação do formulário', () => {
  it('formulário completo não tem erro', () => {
    expect(validar(preenchido(), 'novo', AGORA)).toEqual([]);
  });
  it('fim e ponto são opcionais (BO-8)', () => {
    expect(validar({ ...preenchido(), fim: '', ponto: null }, 'novo', AGORA)).toEqual([]);
  });
  it('dá a mensagem aprovada para cada campo', () => {
    const erros = validar({ ...formularioVazio(), portes: [] }, 'novo', AGORA).map((e) => e.mensagem);
    expect(erros).toEqual([
      'Informe o título do encontro.',
      'Escreva uma descrição.',
      'Informe quando começa.',
      'Informe o nome do local.',
      'Informe o bairro.',
      'Informe a cidade.',
      'Marque pelo menos um porte.',
    ]);
  });
  it('início no passado só reprova na criação', () => {
    const f = { ...preenchido(), inicio: '2026-09-01T09:00', fim: '' };
    expect(validar(f, 'novo', AGORA).map((e) => e.campo)).toEqual(['inicio']);
    expect(validar(f, 'editar', AGORA)).toEqual([]);
  });
  it('fim antes do início', () => {
    expect(validar({ ...preenchido(), fim: '2026-10-10T08:00' }, 'novo', AGORA).map((e) => e.mensagem)).toEqual([
      'O fim precisa ser depois do início.',
    ]);
  });
  it('pago sem valor e observação com telefone', () => {
    const erros = validar({ ...preenchido(), pago: true, valor: 'quinze', observacoes: 'Liga 11987654321' }, 'novo', AGORA);
    expect(erros.map((e) => e.campo)).toEqual(['valor', 'observacoes']);
  });
  it('foto pronta sem descrição reprova; foto enviando segura o envio', () => {
    const f = preenchido();
    f.fotos = [
      { chave: 'a', estado: 'ready', upload_id: '11111111-1111-4111-8111-111111111111', alt: '' },
      { chave: 'b', estado: 'enviando', alt: '' },
    ];
    expect(validar(f, 'novo', AGORA).map((e) => e.campo)).toEqual(['fotos', 'alt-0']);
  });
});

describe('montagem da criação', () => {
  it('usa os campos do contrato e omite o que é opcional e vazio', () => {
    const corpo = montarCriacao({ ...preenchido(), fim: '', levar: ['water', 'leash'] });
    expect(corpo).toEqual({
      title: 'Encontro no parque',
      summary: 'Manhã de sábado.',
      place: { place_name: 'Parque da Aclimação', neighborhood: 'Aclimação', city: 'São Paulo', state: 'SP' },
      starts_at: '2026-10-10T12:00:00.000Z',
      time_zone: 'America/Sao_Paulo',
      images: [],
      accepted_sizes: ['P', 'M', 'G', 'GG'],
      dog_age: 'any',
      vaccination_required: true,
      fenced_off_leash_area: false,
      amenities: [],
      visibility: 'public',
      admission: { kind: 'free' },
      bring_items: ['water', 'leash'],
    });
  });
  it('pago leva centavos, BRL e unidade; ponto vai no lugar', () => {
    const corpo = montarCriacao({ ...preenchido(), pago: true, valor: '15,50', unidade: 'per_pair', ponto: { lat: -23.5, lon: -46.6 } });
    expect(corpo.admission).toEqual({ kind: 'paid', price: { amount: 1550, currency: 'BRL', unit: 'per_pair' } });
    expect(corpo.place.point).toEqual({ lat: -23.5, lon: -46.6 });
  });
});

describe('plano de edição (as três operações)', () => {
  const original = encontroDeExemplo();

  it('sem mudança, nada a enviar', () => {
    expect(planoDeEdicao(original, formularioDoEncontro(original))).toEqual({ patch: null, mudanca: null, oQueMudou: [], acesso: null });
  });
  it('título e observações vão no patch, sem senha', () => {
    const f = { ...formularioDoEncontro(original), titulo: 'Novo título', observacoes: '' };
    const plano = planoDeEdicao(original, f);
    expect(plano.patch).toEqual({ title: 'Novo título', notes: null });
    expect(plano.mudanca).toBeNull();
    expect(plano.acesso).toBeNull();
  });
  it('horário e ponto vão na mudança, e o título do diálogo diz o que mudou', () => {
    const f = { ...formularioDoEncontro(original), inicio: formularioDoEncontro(original).inicio.slice(0, 11) + '10:00', ponto: { lat: -23.56, lon: -46.64 } };
    const plano = planoDeEdicao(original, f);
    expect(plano.patch).toBeNull();
    expect(plano.oQueMudou).toEqual(['horário', 'local']);
    expect(plano.mudanca?.place?.point).toEqual({ lat: -23.56, lon: -46.64 });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de horário e local?');
  });
  it('visibilidade e valor vão na mudança de acesso', () => {
    const f = { ...formularioDoEncontro(original), visibilidade: 'private' as const, pago: true, valor: '20', unidade: 'per_dog' as const };
    const plano = planoDeEdicao(original, f);
    expect(plano.acesso).toEqual({ visibility: 'private', admission: { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_dog' } } });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de acesso?');
    expect(corpoDaMudanca(original, f, plano).join(' ')).toContain('agora é privado e agora é pago');
  });
});

describe('lista', () => {
  it('traduz o filtro de escolha única nos parâmetros do contrato', () => {
    expect(consultaDaLista('agora', ' parque ', 'agenda', 1, 20)).toEqual({
      sort: 'agenda', page: 1, limit: 20, q: 'parque', publication_status: 'published', timing: 'happening',
    });
    expect(consultaDaLista('todos', 'p', 'atualizado', 2, 20)).toEqual({ sort: 'atualizado', page: 2, limit: 20 });
    expect(consultaDaLista('cancelados', '', 'agenda', 1, 20)).toMatchObject({ publication_status: 'cancelled' });
  });
  it('selo: cancelado e removido vencem o momento', () => {
    expect(seloDoEncontro({ publication_status: 'published', timing: 'happening' })).toBe('agora');
    expect(seloDoEncontro({ publication_status: 'cancelled', timing: 'upcoming' })).toBe('cancelado');
    expect(seloDoEncontro({ publication_status: 'removed', timing: 'ended' })).toBe('removido');
  });
  it('contagem e sem resultado com as variações da UX', () => {
    expect(textoDaContagem(4, 4, 'todos', '')).toBe('4 encontros');
    expect(textoDaContagem(1, 1, 'encerrados', 'parque')).toBe('1 encontro com “parque” em Encerrados');
    expect(textoDaContagem(20, 57, 'todos', '')).toBe('Mostrando 20 de 57 encontros');
    expect(textoSemResultado('encerrados', 'parque')).toEqual({ frase: 'Nenhum encontro com “parque” em Encerrados.', limpar: 'Limpar busca e filtro' });
    expect(textoSemResultado('todos', 'parque').limpar).toBe('Limpar busca');
    expect(textoSemResultado('agendados', '').limpar).toBe('Limpar filtro');
  });
  it('menu: encerrado não cancela; removido não faz nada', () => {
    expect(acoesDoEncontro({ publication_status: 'published', timing: 'ended', visibility: 'public' })).toEqual({ editar: true, pedidos: false, cancelar: false, remover: true });
    expect(acoesDoEncontro({ publication_status: 'removed', timing: 'ended', visibility: 'private' })).toEqual({ editar: false, pedidos: false, cancelar: false, remover: false });
  });
});
