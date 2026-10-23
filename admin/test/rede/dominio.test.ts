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
    expect(valorComoOAppMostra(1500, 'per_pet')).toBe('R$ 15 por pet');
    expect(valorComoOAppMostra(3000, 'per_pair')).toBe('R$ 30 por dupla (1 humano + 1 pet)');
    expect(valorComoOAppMostra(3000, 'per_two_people')).toBe('R$ 30 por dupla (2 humanos)');
    expect(valorComoOAppMostra(3000, 'per_person')).toBe('R$ 30 por humano');
    // Legado: aparece como "por pet".
    expect(valorComoOAppMostra(1500, 'per_dog')).toBe('R$ 15 por pet');
    expect(valorComoOAppMostra(1550, 'per_pair')).toBe('R$ 15,50 por dupla (1 humano + 1 pet)');
    expect(valorComoOAppMostra(125000, 'per_person')).toBe('R$ 1.250 por humano');
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
      'Informe o título do evento.',
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

  // Que o SERVIDOR responde o mesmo para estes cinco textos e provado na suite
  // da raiz, em `src/modules/network/domain/paridade-com-o-backoffice.test.ts`:
  // de dentro de `admin/` nao da para olhar para o servidor, porque o job do
  // backoffice roda `npm ci` so aqui, e o `kysely` que aquele import alcanca
  // nao existe na resolucao de la. Aqui fica a outra metade da corrente: que
  // `validar` usa de fato a contagem em code points, e nao o `length` do UTF-16.
  it('ISCA: o tamanho conta code points (🐶 conta 1; e + acento combinado conta 2)', () => {
    const casos: [string, boolean][] = [
      ['🐶'.repeat(200), true],
      ['🐶'.repeat(201), false],
      ['e\u0301'.repeat(100), true],
      ['e\u0301'.repeat(100) + 'x', false],
      ['  ' + '🐶'.repeat(200) + '  ', true],
    ];
    for (const [resumo, aceita] of casos) {
      const painel = !validar({ ...preenchido(), resumo }, 'novo', AGORA).some((e) => e.campo === 'resumo');
      expect(painel, `${[...resumo.trim()].length} code points`).toBe(aceita);
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
  // A DESCRICAO DA IMAGEM VIROU OPCIONAL EM 21/10/2026 (decisao do cliente).
  // Antes desta data este caso esperava `['fotos', 'alt-0']`: a foto pronta sem
  // descricao reprovava. Agora ela passa, e o que sobra e o erro de `fotos`, que
  // e do ENVIO em curso e nao da descricao.
  it('foto pronta SEM descrição não reprova mais; foto enviando ainda segura o envio', () => {
    const f = preenchido();
    f.fotos = [
      { chave: 'a', estado: 'ready', uploadId: '11111111-1111-4111-8111-111111111111', alt: '' },
      { chave: 'b', estado: 'enviando', alt: '' },
    ];
    expect(validar(f, 'novo', AGORA).map((e) => e.campo)).toEqual(['fotos']);
  });
  // A ISCA DA MEIA-DESCRICAO: opcional nao quer dizer "qualquer coisa serve".
  // Uma letra reprova NA TELA, porque o contrato recusa `alt_text` de um
  // caractere (`minLength: 2`) e um `400` sem endereco seria pior.
  it('ISCA: uma letra na descrição da foto reprova, mesmo com o campo opcional', () => {
    const f = preenchido();
    f.fotos = [{ chave: 'a', estado: 'ready', uploadId: '11111111-1111-4111-8111-111111111111', alt: 'a' }];
    expect(validar(f, 'novo', AGORA).map((e) => e.campo)).toEqual(['alt-0']);
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

describe('itens marcados por padrão no cadastro (decisão do cliente, 20/10)', () => {
  it('formulário NOVO nasce com água, guia e saquinho marcados', () => {
    expect([...formularioVazio().levar].sort()).toEqual(['leash', 'poop_bags', 'water']);
  });

  it('formulário NOVO nasce com a carteira de vacinação DESMARCADA', () => {
    expect(formularioVazio().levar).not.toContain('vaccination_card');
  });

  it('os quatro itens que o cliente não citou continuam desmarcados', () => {
    const levar = formularioVazio().levar;
    for (const item of ['water_bowl', 'treats', 'towel', 'toy'] as const) expect(levar).not.toContain(item);
  });

  it('o padrão não impede desmarcar: o que a tela tira sai do corpo da criação', () => {
    const corpo = montarCriacao({ ...preenchido(), levar: [] });
    expect(corpo.bring_items).toEqual([]);
  });

  it('REPROVA se o padrão vazar para a EDIÇÃO: o formulário reflete o que está salvo', () => {
    // `encontroDeExemplo` salvou `vaccination_card` e NAO salvou `leash`. Se o
    // padrao de criacao alcancasse a edicao, reabrir remarcaria `leash` e o
    // organizador perderia a escolha dele no primeiro salvamento.
    const salvo = encontroDeExemplo();
    const comVacina = { ...salvo, bring_items: ['water', 'vaccination_card'] as typeof salvo.bring_items };
    expect(formularioDoEncontro(comVacina).levar).toEqual(['water', 'vaccination_card']);
  });

  it('REPROVA se a edição de um encontro SEM itens herdar o padrão', () => {
    const salvo = encontroDeExemplo();
    const semItens = { ...salvo, bring_items: [] as typeof salvo.bring_items };
    expect(formularioDoEncontro(semItens).levar).toEqual([]);
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
    expect(corpoDaMudanca(original, f, plano)).toContain('O mapa deixa de aparecer no app, porque mostrava o lugar anterior.');
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
    expect(corpoDaMudanca(comEndereco, tirar, planoDeEdicao(comEndereco, tirar))[0]).toBe('O endereço deixa de aparecer no app. Quem usa o app não é avisado da mudança.');
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

  it('ISCA: mudou o lugar sem mexer no endereço salvo, o diálogo pede para conferir o endereço', () => {
    const comEndereco = encontroDeExemplo({ street_address: 'Rua Muniz de Sousa, 1119 – Aclimação, São Paulo/SP' });
    const aviso = 'O endereço continua: Rua Muniz de Sousa, 1119 – Aclimação, São Paulo/SP. Se mudou, corrija antes de confirmar.';
    const soLugar = { ...formularioDoEncontro(comEndereco), local: 'Praça General Polidoro' };
    expect(corpoDaMudanca(comEndereco, soLugar, planoDeEdicao(comEndereco, soLugar))).toContain(aviso);
    // Mexeu no endereco junto: nao avisa.
    const lugarEEndereco = { ...soLugar, endereco: 'Praça General Polidoro, s/n – Liberdade, São Paulo/SP' };
    expect(corpoDaMudanca(comEndereco, lugarEEndereco, planoDeEdicao(comEndereco, lugarEEndereco)).join(' ')).not.toMatch(/O endereço continua/);
    // Sem endereco salvo: nao avisa.
    const semEndereco = { ...formularioDoEncontro(original), local: 'Praça General Polidoro' };
    expect(corpoDaMudanca(original, semEndereco, planoDeEdicao(original, semEndereco)).join(' ')).not.toMatch(/O endereço continua/);
    // So o horario: nao avisa.
    const soHorario = { ...formularioDoEncontro(comEndereco), inicio: formularioDoEncontro(comEndereco).inicio.slice(0, 11) + '10:00' };
    expect(corpoDaMudanca(comEndereco, soHorario, planoDeEdicao(comEndereco, soHorario)).join(' ')).not.toMatch(/O endereço continua/);
  });

  it('links: vão na criação e no PATCH (sem senha), como URL completa; vazio tira', () => {
    const corpo = montarCriacao({ ...preenchido(), linkDoConvite: ' https://sympla.com.br/e/1 ', instagram: 'https://www.instagram.com/Org.Pet/' });
    expect(corpo.ticket_url).toBe('https://sympla.com.br/e/1');
    // Desde 17/10 o corpo leva a URL COMPLETA, como a pessoa digitou; quem
    // extrai o handle e o servidor.
    expect(corpo.instagram_url).toBe('https://www.instagram.com/Org.Pet/');
    expect(montarCriacao(preenchido())).not.toHaveProperty('ticket_url');
    const comLinks = encontroDeExemplo({ ticket_url: 'https://sympla.com.br/e/1', instagram_handle: 'org.pet', instagram_url: 'https://www.instagram.com/org.pet/' });
    const f = formularioDoEncontro(comLinks);
    // O formulario reabre com a URL COMPLETA que o servidor devolveu, e nao
    // com `@org.pet`: o campo passou a exigir endereco completo, e reabrir com
    // o apelido deixaria todo encontro ja salvo invalido no proprio formulario.
    expect(f.instagram).toBe('https://www.instagram.com/org.pet/');
    expect(planoDeEdicao(comLinks, f).patch).toBeNull();
    // Escrever o mesmo perfil de outro jeito nao e mudanca: a comparacao e por
    // handle, e so o esquema/`www.`/barra mudarem nao avisa os administradores.
    expect(planoDeEdicao(comLinks, { ...f, instagram: 'https://instagram.com/ORG.PET' }).patch).toBeNull();
    expect(planoDeEdicao(comLinks, { ...f, linkDoConvite: '', instagram: 'https://instagram.com/outra' }).patch).toEqual({ ticket_url: null, instagram_url: 'https://instagram.com/outra' });
    expect(planoDeEdicao(comLinks, { ...f, linkDoConvite: 'https://outro.com.br/x' }).mudanca).toBeNull();
  });
  it('links inválidos param no painel com o motivo', () => {
    const erros = validar({ ...preenchido(), linkDoConvite: 'http://exemplo.com.br', instagram: '@com espaco' }, 'novo', AGORA);
    expect(erros.map((e) => [e.campo, e.mensagem])).toEqual([
      ['linkDoConvite', 'O link precisa começar com https://.'],
      // `@com espaco` recusa pelo ESPACO, e nao por falta de `https://`: o
      // espaco e conferido ANTES do esquema, no painel
      // (`enderecos.ts`) e no servidor (`errosDoEnderecoCompleto`), que e
      // quem decide. A frase de `not_https` e a de quem escreveu um endereco
      // sem esquema, e esta entrada nunca chega la.
      ['instagram', 'Confira o endereço: ele não pode ter espaço.'],
    ]);
  });

  // -------------------------------------------------------------------------
  // 17/10: o padrao de endereco completo, no campo do Instagram
  // -------------------------------------------------------------------------
  //
  // "mantenha o padrao, todo campo de site/url, o usuario deve preencher
  // completo o endereco completo, inclusive com o https" -- cliente, 17/10.
  //
  // ISCA -- em `enderecos.ts`, em `recusaDoInstagram`, devolva `null` logo no
  // comeco. Os casos de recusa abaixo passam a aceitar tudo e reprovam.
  it('o Instagram exige a URL completa, e cada recusa diz o motivo', () => {
    const msg = (instagram: string): string | undefined =>
      validar({ ...preenchido(), instagram }, 'novo', AGORA).find((e) => e.campo === 'instagram')?.mensagem;

    // Aceitos: as tres formas de URL completa do perfil.
    for (const bom of [
      'https://instagram.com/bichu.app',
      'https://www.instagram.com/bichu.app',
      'https://m.instagram.com/bichu.app/',
    ]) {
      expect(msg(bom)).toBeUndefined();
    }

    // O apelido cru era aceito ate 17/10 e agora e recusado, com a forma certa
    // na frase: quem digitava `@bichu.app` precisa VER o que mudou.
    expect(msg('@bichu.app')).toBe('Cole o endereço completo do perfil. Por exemplo: https://instagram.com/bichu.app');
    expect(msg('bichu.app')).toBe('Cole o endereço completo do perfil. Por exemplo: https://instagram.com/bichu.app');
    expect(msg('instagram.com/bichu.app')).toBe('Cole o endereço completo do perfil. Por exemplo: https://instagram.com/bichu.app');

    // `http://` tem frase propria: a pessoa escreveu um esquema, so nao o certo.
    expect(msg('http://instagram.com/bichu.app')).toBe('Troque http:// por https://.');

    // E as protecoes que NAO podem ter afrouxado, cada uma com o motivo real.
    expect(msg('https://facebook.com/bichu')).toBe('O endereço precisa ser de um perfil do instagram.com.');
    expect(msg('https://u:s@instagram.com/bichu')).toBe('Tire o usuário e a senha do endereço.');
    expect(msg('https://203.0.113.5/bichu')).toBe('Use o endereço do perfil, e não um número de IP.');
    expect(msg('https://instagram.com/')).toBe('Falta o perfil no fim do endereço. Por exemplo: https://instagram.com/bichu.app');

    // Nenhuma recusa que nao seja de esquema pode falar de `https://`: foi
    // essa confusao que custou o tempo do cliente de manha.
    for (const ruim of ['https://facebook.com/bichu', 'https://u:s@instagram.com/bichu', 'https://203.0.113.5/bichu']) {
      expect(msg(ruim)).not.toContain('https://');
    }
  });

  it('só o horário: o lugar não vai, e o ponto que existir continua', () => {
    const f = { ...formularioDoEncontro(original), inicio: formularioDoEncontro(original).inicio.slice(0, 11) + '10:00' };
    const plano = planoDeEdicao(original, f);
    expect(plano.mudanca).not.toHaveProperty('place');
  });
  it('per_dog antigo: salvar sem mexer não muda; mexer no valor manda per_pet, nunca per_dog', () => {
    const antigo = encontroDeExemplo({ admission: { kind: 'paid', price: { amount: 3000, currency: 'BRL', unit: 'per_dog' } } });
    const f = formularioDoEncontro(antigo);
    expect(f.unidade).toBe('per_dog');
    expect(planoDeEdicao(antigo, f).acesso).toBeNull();
    // Escolher "por pet" de novo (o que ja aparecia) tambem nao e mudanca.
    expect(planoDeEdicao(antigo, { ...f, unidade: 'per_pet' }).acesso).toBeNull();
    expect(planoDeEdicao(antigo, { ...f, valor: '35' }).acesso).toEqual({ admission: { kind: 'paid', price: { amount: 3500, currency: 'BRL', unit: 'per_pet' } } });
    expect(planoDeEdicao(antigo, { ...f, unidade: 'per_pair' }).acesso?.admission).toEqual({ kind: 'paid', price: { amount: 3000, currency: 'BRL', unit: 'per_pair' } });
  });

  it('ISCA: mudar só o valor diz "O valor do evento muda para…" (QA r5)', () => {
    const pago = encontroDeExemplo({ admission: { kind: 'paid', price: { amount: 1500, currency: 'BRL', unit: 'per_pet' } } });
    const f = { ...formularioDoEncontro(pago), valor: '20' };
    const corpo = corpoDaMudanca(pago, f, planoDeEdicao(pago, f));
    expect(corpo[0]).toBe('O valor do evento muda para R$ 20 por pet, e o app mostra isso na hora.');
    expect(corpo.join(' ')).not.toMatch(/O evento o valor/);
    const privadoEValor = { ...f, visibilidade: 'private' as const };
    expect(corpoDaMudanca(pago, privadoEValor, planoDeEdicao(pago, privadoEValor))[0]).toBe(
      'O evento agora é privado, e o valor muda para R$ 20 por pet. O app mostra isso na hora.',
    );
  });

  it('visibilidade e valor vão na mudança de acesso', () => {
    const f = { ...formularioDoEncontro(original), visibilidade: 'private' as const, pago: true, valor: '20', unidade: 'per_pet' as const };
    const plano = planoDeEdicao(original, f);
    expect(plano.acesso).toEqual({ visibility: 'private', admission: { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_pet' } } });
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de acesso?');
    expect(corpoDaMudanca(original, f, plano)).toEqual([
      'O evento agora é privado e agora é pago, e o app mostra isso na hora.',
      'O link antigo do evento para de funcionar.',
      'Todos os administradores recebem um e-mail com o antes e o depois.',
    ]);
  });
  it('local e acesso juntos: o aviso aos administradores sai uma vez só, no fim (UX 30 B3, B11, B12)', () => {
    const f = { ...formularioDoEncontro(original), bairro: 'Cambuci', pago: true, valor: '20', unidade: 'per_pet' as const };
    const plano = planoDeEdicao(original, f);
    expect(tituloDaMudanca(plano)).toBe('Salvar a mudança de local e de acesso?');
    expect(corpoDaMudanca(original, f, plano)).toEqual([
      'O app passa a mostrar Parque da Aclimação, Cambuci. Quem usa o app não é avisado da mudança.',
      'O mapa deixa de aparecer no app, porque mostrava o lugar anterior.',
      'O evento agora é pago, e o app mostra isso na hora.',
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
      'A foto 1 veio de uma conta que não existe mais. Ela fica no evento enquanto você não mexer na galeria; qualquer mudança nas fotos a tira do evento.',
    );
    const duas = { fotos: [...f.fotos, { ...f.fotos[0]!, chave: 'sem-envio-2' }] };
    expect(avisoDeFotosSemEnvio(duas)).toBe(
      '2 fotos vieram de uma conta que não existe mais. Elas ficam no evento enquanto você não mexer na galeria; qualquer mudança nas fotos as tira do evento.',
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
      'Evento cancelado. O app mostra o aviso de cancelado até o horário de fim, às 11:00 de 11/10/2026.',
    );
  });
  it('sem fim: até o fim do dia do início no fuso do encontro, e não no dia UTC', () => {
    // 01:30 UTC de 12/10 ainda e 11/10 em Sao Paulo.
    const t = textosDoCancelamento({ starts_at: '2026-10-12T01:30:00Z', ends_at: null, time_zone: 'America/Sao_Paulo' });
    expect(t.corpo).toMatch(/^O evento não tem horário de fim, então continua no app, marcado como cancelado, até o fim do dia 11\/10\/2026\. /);
    expect(t.sucesso).toBe('Evento cancelado. O app mostra o aviso de cancelado até o fim do dia 11/10/2026.');
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
    expect(textoDaContagem(4, 4, 'todos', '')).toBe('4 eventos');
    expect(textoDaContagem(1, 1, 'encerrados', 'parque')).toBe('1 evento com “parque” em Encerrados');
    expect(textoDaContagem(20, 57, 'todos', '')).toBe('Mostrando 20 de 57 eventos');
    expect(textoSemResultado('encerrados', 'parque')).toEqual({ frase: 'Nenhum evento com “parque” em Encerrados.', limpar: 'Limpar busca e filtro' });
    expect(textoSemResultado('todos', 'parque').limpar).toBe('Limpar busca');
    expect(textoSemResultado('agendados', '').limpar).toBe('Limpar filtro');
  });
  it('menu: encerrado não cancela; removido não faz nada', () => {
    expect(acoesDoEncontro({ publication_status: 'published', timing: 'ended', visibility: 'public' })).toEqual({ editar: true, pedidos: false, cancelar: false, remover: true });
    expect(acoesDoEncontro({ publication_status: 'removed', timing: 'ended', visibility: 'private' })).toEqual({ editar: false, pedidos: false, cancelar: false, remover: false });
  });
});
