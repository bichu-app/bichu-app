import { describe, expect, it } from 'vitest';

import {
  corpoDaMudanca,
  cortarEmCodePoints,
  tamanhoComoOServidor,
  formularioDoEncontro,
  formularioVazio,
  avisoDeFotosSemEnvio,
  fotosSemEnvio,
  montarCriacao,
  planoDeEdicao,
  tituloDaMudanca,
  validar,
  type EstadoDoFormulario,
} from '../../src/rede/dominio/formulario.ts';
import { campoDoInstante, dataCurta, faixaDeHorario, instanteDoCampo, mesPorExtenso } from '../../src/rede/dominio/horario.ts';
import { acoesDoEncontro, consultaDaLista, seloDoEncontro, textosDoCancelamento, textoDaContagem, textoSemResultado } from '../../src/rede/dominio/lista.ts';
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
      ['email', 'ana arroba exemplo ponto com'],
      ['link', 'inscrição em https://exemplo.com/x'],
      ['link', 'veja www.exemplo.com'],
      ['link', 'site exemplo.com.br'],
      ['pix', 'paga no Pix antes'],
      ['pix', 'chave 123e4567-e89b-12d3-a456-426614174000'],
      ['endereco', 'fica na Rua das Flores, 123'],
      ['endereco', 'Av. Paulista perto do metrô'],
      ['endereco', 'Praça Benedito Calixto, 100'],
      ['endereco', 'cep 01234-000'],
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
      'Remarcado de 03.10.2026 para 10.10.2026.',
      'Encontro em 10/10/2026.',
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
  it('fim é opcional (BO-8)', () => {
    expect(validar({ ...preenchido(), fim: '' }, 'novo', AGORA)).toEqual([]);
  });
  it('dá a mensagem aprovada para cada campo', () => {
    const erros = validar({ ...formularioVazio(), portes: [] }, 'novo', AGORA).map((e) => e.mensagem);
    expect(erros).toEqual([
      'Informe o título do encontro.',
      'Escreva uma descrição.',
      'Informe quando começa.',
      'Informe o nome do lugar.',
      'Informe o bairro.',
      'Informe a cidade.',
      'Marque pelo menos um porte.',
    ]);
  });
  it('descrição vai até 200 caracteres (pedido de 01/10)', () => {
    expect(validar({ ...preenchido(), resumo: 'a'.repeat(200) }, 'novo', AGORA)).toEqual([]);
    expect(validar({ ...preenchido(), resumo: 'a'.repeat(201) }, 'novo', AGORA).map((e) => e.campo)).toEqual(['resumo']);
  });

  it('ISCA: o tamanho conta code points, como o servidor (🐶 conta 1; e + acento combinado conta 2)', async () => {
    const { errosDeTexto } = await import('../../../src/modules/network/domain/escrita-do-encontro.ts');
    const casos = ['🐶'.repeat(200), '🐶'.repeat(201), 'e\u0301'.repeat(100), 'e\u0301'.repeat(100) + 'x', '  ' + '🐶'.repeat(200) + '  '];
    for (const resumo of casos) {
      const servidor = errosDeTexto('summary', resumo, 2, 200).length === 0;
      const painel = !validar({ ...preenchido(), resumo }, 'novo', AGORA).some((e) => e.campo === 'resumo');
      expect(painel, `${[...resumo].length} code points: servidor ${servidor ? 'aceita' : 'recusa'}`).toBe(servidor);
    }
    expect(tamanhoComoOServidor('🐶')).toBe(1);
    expect(tamanhoComoOServidor('e\u0301')).toBe(2);
    expect(cortarEmCodePoints('🐶'.repeat(201), 200)).toBe('🐶'.repeat(200));
  });

  it('endereço é opcional; quando vem, de 5 a 200 code points, como o servidor', () => {
    expect(validar({ ...preenchido(), endereco: '' }, 'novo', AGORA)).toEqual([]);
    expect(validar({ ...preenchido(), endereco: 'Rua Mourato Coelho, 1200 – Pinheiros, São Paulo/SP' }, 'novo', AGORA)).toEqual([]);
    expect(validar({ ...preenchido(), endereco: 'Rua' }, 'novo', AGORA).map((e) => e.mensagem)).toEqual([
      'Escreva o endereço com pelo menos 5 caracteres, ou deixe em branco.',
    ]);
    expect(validar({ ...preenchido(), endereco: '🐶'.repeat(200) }, 'novo', AGORA)).toEqual([]);
    expect(validar({ ...preenchido(), endereco: '🐶'.repeat(201) }, 'novo', AGORA).map((e) => e.campo)).toEqual(['endereco']);
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
      { chave: 'a', estado: 'ready', uploadId: '11111111-1111-4111-8111-111111111111', alt: '' },
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
  it('pago leva centavos, BRL e unidade; a criação não manda ponto (o backoffice não tem mapa)', () => {
    const corpo = montarCriacao({ ...preenchido(), pago: true, valor: '15,50', unidade: 'per_pair' });
    expect(corpo.admission).toEqual({ kind: 'paid', price: { amount: 1550, currency: 'BRL', unit: 'per_pair' } });
    expect(corpo.place).not.toHaveProperty('point');
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
  it('horário e lugar vão na mudança, e o ponto antigo sai, porque era do lugar anterior', () => {
    const f = { ...formularioDoEncontro(original), inicio: formularioDoEncontro(original).inicio.slice(0, 11) + '10:00', local: 'Praça General Polidoro' };
    const plano = planoDeEdicao(original, f);
    expect(plano.patch).toBeNull();
    expect(plano.oQueMudou).toEqual(['horário', 'local']);
    expect(plano.mudanca?.place).toEqual({ place_name: 'Praça General Polidoro', neighborhood: 'Aclimação', city: 'São Paulo', state: 'SP', point: null });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de horário e local?');
    expect(corpoDaMudanca(original, f, plano)).toContain('O mapa do encontro sai do app, porque o ponto marcado era do lugar anterior.');
  });
  it('endereço: vai na criação aparado, muda por relocation (com senha) e sem tirar o ponto', () => {
    expect(montarCriacao({ ...preenchido(), endereco: '  Rua Mourato Coelho, 1200 – Pinheiros, São Paulo/SP ' }).street_address).toBe(
      'Rua Mourato Coelho, 1200 – Pinheiros, São Paulo/SP',
    );
    expect(montarCriacao(preenchido())).not.toHaveProperty('street_address');
    const f = { ...formularioDoEncontro(original), endereco: 'Rua Muniz de Sousa, 1119 – Aclimação, São Paulo/SP' };
    const plano = planoDeEdicao(original, f);
    expect(plano.patch).toBeNull();
    expect(plano.mudanca).toEqual({ street_address: 'Rua Muniz de Sousa, 1119 – Aclimação, São Paulo/SP' });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de local?');
    expect(corpoDaMudanca(original, f, plano)[0]).toBe(
      'O endereço passa a ser Rua Muniz de Sousa, 1119 – Aclimação, São Paulo/SP. Quem usa o app não é avisado da mudança.',
    );
    const comEndereco = encontroDeExemplo({ street_address: 'Rua Muniz de Sousa, 1119' });
    const tirar = { ...formularioDoEncontro(comEndereco), endereco: '' };
    expect(planoDeEdicao(comEndereco, tirar).mudanca).toEqual({ street_address: null });
    expect(corpoDaMudanca(comEndereco, tirar, planoDeEdicao(comEndereco, tirar))[0]).toBe('O endereço sai do app. Quem usa o app não é avisado da mudança.');
    expect(formularioDoEncontro(comEndereco).endereco).toBe('Rua Muniz de Sousa, 1119');
  });

  it('lugar e endereço juntos viram uma mudança só (uma senha), e o PATCH nunca leva endereço', () => {
    const f = { ...formularioDoEncontro(original), local: 'Praça General Polidoro', endereco: 'Rua Muniz de Sousa, 1119', titulo: 'Outro título' };
    const plano = planoDeEdicao(original, f);
    expect(plano.patch).toEqual({ title: 'Outro título' });
    expect(plano.patch).not.toHaveProperty('street_address');
    expect(plano.mudanca).toMatchObject({ place: { place_name: 'Praça General Polidoro' }, street_address: 'Rua Muniz de Sousa, 1119' });
    expect(plano.acesso).toBeNull();
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de local?');
  });

  it('só o horário: o lugar não vai, e o ponto que existir continua', () => {
    const f = { ...formularioDoEncontro(original), inicio: formularioDoEncontro(original).inicio.slice(0, 11) + '10:00' };
    const plano = planoDeEdicao(original, f);
    expect(plano.mudanca).not.toHaveProperty('place');
  });
  it('visibilidade e valor vão na mudança de acesso', () => {
    const f = { ...formularioDoEncontro(original), visibilidade: 'private' as const, pago: true, valor: '20', unidade: 'per_dog' as const };
    const plano = planoDeEdicao(original, f);
    expect(plano.acesso).toEqual({ visibility: 'private', admission: { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_dog' } } });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de acesso?');
    expect(corpoDaMudanca(original, f, plano)).toEqual([
      'O encontro agora é privado e agora é pago, e o app mostra isso na hora.',
      'O link antigo do encontro para de funcionar.',
      'Todos os administradores recebem um e-mail com o antes e o depois.',
    ]);
  });
  it('local e acesso juntos: o aviso aos administradores sai uma vez só, no fim (UX 30 B3, B11, B12)', () => {
    const f = { ...formularioDoEncontro(original), bairro: 'Cambuci', pago: true, valor: '20', unidade: 'per_dog' as const };
    const plano = planoDeEdicao(original, f);
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de local e de acesso?');
    expect(corpoDaMudanca(original, f, plano)).toEqual([
      'O app passa a mostrar Parque da Aclimação, Cambuci. Quem usa o app não é avisado da mudança.',
      'O mapa do encontro sai do app, porque o ponto marcado era do lugar anterior.',
      'O encontro agora é pago, e o app mostra isso na hora.',
      'Todos os administradores recebem um e-mail com o antes e o depois.',
    ]);
  });
});

describe('foto com upload_id nulo (conta apagada)', () => {
  const comOrfa = encontroDeExemplo({
    images: [
      { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: null, position: 0, alt_text: 'Cães no gramado' },
      { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: '00000000-0000-4000-8000-000000000002', position: 1, alt_text: 'Lago do parque' },
    ],
  });

  it('ganha chave estável que não depende do upload_id', () => {
    const f = formularioDoEncontro(comOrfa);
    expect(f.fotos.map((x) => x.chave)).toEqual(['sem-envio-0', '00000000-0000-4000-8000-000000000002']);
    expect(f.fotos[0]?.uploadId).toBeUndefined();
    expect(fotosSemEnvio(f)).toBe(1);
  });

  it('alerta diz a posição quando é uma foto só, e usa o plural com mais de uma (UX 30.7 R1)', () => {
    const f = formularioDoEncontro(comOrfa);
    expect(avisoDeFotosSemEnvio(f)).toBe(
      'A foto 1 veio de uma conta que não existe mais. Ela fica no encontro enquanto você não mexer na galeria; qualquer mudança nas fotos a tira do encontro.',
    );
    const duas = { fotos: [...f.fotos, { ...f.fotos[0]!, chave: 'sem-envio-2' }] };
    expect(avisoDeFotosSemEnvio(duas)).toBe(
      '2 fotos vieram de uma conta que não existe mais. Elas ficam no encontro enquanto você não mexer na galeria; qualquer mudança nas fotos as tira do encontro.',
    );
    expect(avisoDeFotosSemEnvio({ fotos: [f.fotos[1]!] })).toBeNull();
  });

  it('editar só o título NÃO manda images, e a foto sem envio fica no encontro', () => {
    const f = { ...formularioDoEncontro(comOrfa), titulo: 'Outro título' };
    expect(planoDeEdicao(comOrfa, f).patch).toEqual({ title: 'Outro título' });
  });

  it('mudar as fotos manda a galeria sem a foto que não pode ser reenviada', () => {
    const f = formularioDoEncontro(comOrfa);
    f.fotos = [...f.fotos].reverse();
    expect(planoDeEdicao(comOrfa, f).patch).toEqual({ images: [{ upload_id: '00000000-0000-4000-8000-000000000002', alt_text: 'Lago do parque' }] });
  });
});

describe('bug 5: prazo do cancelado no app', () => {
  it('com fim: até o horário de fim, no fuso do encontro', () => {
    expect(textosDoCancelamento({ starts_at: '2026-10-11T12:00:00Z', ends_at: '2026-10-11T14:00:00Z', time_zone: 'America/Sao_Paulo' }).sucesso).toBe(
      'Encontro cancelado. O app mostra o aviso de cancelado até o horário de fim, às 11:00 de 11/10/2026.',
    );
  });
  it('sem fim: até o fim do dia do início no fuso do encontro, e não no dia UTC', () => {
    // 01:30 UTC de 12/10 ainda e 11/10 em Sao Paulo.
    const t = textosDoCancelamento({ starts_at: '2026-10-12T01:30:00Z', ends_at: null, time_zone: 'America/Sao_Paulo' });
    expect(t.corpo).toMatch(/^O encontro não tem horário de fim, então continua no app, marcado como cancelado, até o fim do dia 11\/10\/2026\. /);
    expect(t.sucesso).toBe('Encontro cancelado. O app mostra o aviso de cancelado até o fim do dia 11/10/2026.');
    expect(t.corpo).not.toMatch(/horário previsto de fim/);
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
