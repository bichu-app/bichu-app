import { describe, expect, it } from 'vitest';

import { CATEGORIAS, centavosParaCampo, centavosParaTexto, ESPECIES, precoEmCentavos, slugSugerido } from '../src/loja/dominio.ts';
import { conferirRotulo as conferirRotuloDaTag, mensagemDeErroDaTag } from '../src/loja/DialogoCriarTag.tsx';
import { corpoDeAlteracao, corpoDeCriacao, errosDoServidor, validarProduto, VALORES_VAZIOS } from '../src/loja/formulario-do-produto.ts';

describe('preco de referencia em centavos (AdminPriceInput.amount)', () => {
  it.each([
    ['89,90', 8990],
    ['189,9', 18990],
    ['1.234,56', 123456],
    ['R$ 74,90', 7490],
    ['59', 5900],
    ['189.90', 18990],
    ['1.000', 100000],
    ['0,01', 1],
  ])('"%s" vira %i centavos, inteiro', (texto, centavos) => {
    const r = precoEmCentavos(texto);
    expect(r).toBe(centavos);
    expect(Number.isInteger(r)).toBe(true);
  });

  it.each(['', 'abc', '0', '0,00', '10,999', '12,3,4', '-5', '1.23.4', '1000000,01'])('"%s" nao e preco', (texto) => {
    expect(precoEmCentavos(texto)).toBeUndefined();
  });

  it('nao passa por ponto flutuante: 0,29 e 1,15 dao o inteiro exato', () => {
    expect(precoEmCentavos('0,29')).toBe(29);
    expect(precoEmCentavos('1,15')).toBe(115);
    expect(precoEmCentavos('4,35')).toBe(435);
  });

  it('volta para o campo e para a tabela', () => {
    expect(centavosParaCampo(18990)).toBe('189,90');
    expect(centavosParaCampo(5)).toBe('0,05');
    expect(centavosParaTexto(123456)).toBe('R$ 1.234,56');
  });
});

describe('rotulos do contrato', () => {
  it('categoria e especie usam os seis e os tres codigos do contrato, com os rotulos do app', () => {
    expect(Object.keys(CATEGORIAS)).toEqual(['food', 'toy', 'hygiene', 'accessory', 'health', 'bed']);
    // `toy` e `accessory` no PLURAL desde 17/10/2026 (pedido do cliente). O
    // CÓDIGO não mudou -- a asserção acima continua em `toy`/`accessory` --,
    // porque trocar o código quebraria o APK instalado.
    expect(Object.values(CATEGORIAS)).toEqual(['Alimentação', 'Brinquedos', 'Higiene', 'Acessórios', 'Saúde', 'Cama e conforto']);
    expect(ESPECIES).toEqual({ dog: 'Cão', cat: 'Gato', other: 'Outros animais' });
  });

  it('identificador sugerido cabe no formato de Slug', () => {
    expect(slugSugerido('Pet Center Aurora')).toBe('pet-center-aurora');
    expect(slugSugerido('Empório Focinho & Cia')).toBe('emporio-focinho-cia');
    expect(slugSugerido('x'.repeat(40)).length).toBe(30);
  });
});

describe('formulario de produto', () => {
  const validos = {
    ...VALORES_VAZIOS,
    titulo: 'Ração seca 15 kg',
    resumo: 'Para cães adultos.',
    categoria: 'food' as const,
    especies: ['dog' as const],
    parceiro: 'pet-center-aurora',
    link: 'https://www.petcenteraurora.com.br/racao',
    preco: '189,90',
    consultadoEm: '2026-09-15',
  };

  it('monta o corpo com o preco em centavos e sem slug', () => {
    const corpo = corpoDeCriacao(validos);
    expect(corpo.price).toEqual({ amount: 18990, currency: 'BRL', checked_at: '2026-09-15' });
    expect('slug' in corpo).toBe(false);
    expect(corpoDeAlteracao({ ...validos, preco: '', consultadoEm: '' }).price).toBeNull();
  });

  it('as mensagens da UX 29.4 e 29.10', () => {
    expect(validarProduto(VALORES_VAZIOS, { hoje: '2026-09-28' })).toEqual({
      'f-nome': 'Informe o nome do produto.',
      'f-desc': 'Escreva uma descrição.',
      'f-categoria': 'Escolha a categoria.',
      'f-especies': 'Marque pelo menos um animal.',
      'f-parceiro': 'Informe o parceiro ou a loja.',
      'f-link': 'O link precisa começar com https://.',
    });
    const hoje = { hostDoParceiro: 'petcenteraurora.com.br', hoje: '2026-09-28' };
    expect(validarProduto(validos, hoje)).toEqual({});
    expect(validarProduto({ ...validos, preco: '74,90,0' }, hoje)['f-preco']).toBe('Informe o preço em reais, por exemplo 89,90.');
    expect(validarProduto({ ...validos, consultadoEm: '' }, hoje)['f-data']).toBe('Com preço, informe também a data da consulta.');
    expect(validarProduto({ ...validos, consultadoEm: '2026-09-29' }, hoje)['f-data']).toBe('A data da consulta não pode ser depois de hoje.');
    expect(validarProduto({ ...validos, link: 'http://petcenteraurora.com.br/x' }, hoje)['f-link']).toBe('O link precisa começar com https://.');
    expect(validarProduto({ ...validos, link: 'https://outraloja.com.br/x' }, hoje)['f-link']).toBe(
      'O link precisa ser do site do parceiro escolhido (petcenteraurora.com.br) ou de um subdomínio dele, como www.petcenteraurora.com.br.',
    );
    // Host parecido nao e o do parceiro.
    expect(validarProduto({ ...validos, link: 'https://falsopetcenteraurora.com.br/x' }, hoje)['f-link']).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 17/10: o link que bloqueou o cliente, e a fronteira de rotulo
  // -------------------------------------------------------------------------

  it('o link do cliente passa no painel, com www e com parametro', () => {
    const cobasi = { hostDoParceiro: 'cobasi.com.br', hoje: '2026-10-17' };
    const doCliente =
      'https://www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673';
    expect(validarProduto({ ...validos, link: doCliente }, cobasi)['f-link']).toBeUndefined();
    expect(corpoDeCriacao({ ...validos, link: doCliente }).target_url).toBe(doCliente);
  });

  it('subdominio passa e host que so termina igual e recusado', () => {
    const cobasi = { hostDoParceiro: 'cobasi.com.br', hoje: '2026-10-17' };
    for (const link of [
      'https://cobasi.com.br/p',
      'https://www.cobasi.com.br/p',
      'https://loja.cobasi.com.br/p',
      'https://cobasi.com.br/p?idsku=1',
      'https://cobasi.com.br/p#ficha',
    ]) {
      expect(validarProduto({ ...validos, link }, cobasi)['f-link']).toBeUndefined();
    }
    // ISCA -- em `linkEDoParceiro`, troque `.endsWith(`.${alvo}`)` por
    // `.endsWith(alvo)`: estes tres passam a ser aceitos e o caso reprova.
    for (const link of [
      'https://malcobasi.com.br/p',
      'https://falsacobasi.com.br/p',
      'https://cobasi.com.br.golpe.io/p',
    ]) {
      expect(validarProduto({ ...validos, link }, cobasi)['f-link']).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // A MENSAGEM QUE MENTIA
  // -------------------------------------------------------------------------
  //
  // Todas as recusas do destino chegavam como `invalid_url` e viravam
  // "O link precisa comecar com https://" -- inclusive sobre um link que
  // comecava com `https://`. O cliente leu, acreditou, e foi procurar o
  // defeito no proprio link.
  //
  // ISCA -- em `formulario-do-produto.ts`, apague o bloco `MENSAGEM_DO_LINK`
  // de `mensagemDoCodigo`. Todos os casos abaixo caem na frase padrao e o
  // teste reprova.
  it('cada recusa do servidor no link diz o motivo real', () => {
    const texto = (code: string): string | undefined =>
      errosDoServidor([{ field: 'target_url', code }]).erros['f-link'];

    expect(texto('url_not_https')).toBe('O link precisa começar com https://.');
    expect(texto('url_has_credentials')).toBe('Tire o usuário e a senha do endereço antes de salvar.');
    expect(texto('url_ip_literal')).toBe('O link aponta para um número de IP. Use o endereço com o nome do site.');
    expect(texto('url_too_long')).toBe('O link é longo demais. Use o endereço direto do produto.');
    expect(texto('invalid_url')).toBe('Esse texto não é um endereço de site.');

    // E nenhuma delas, fora a de esquema, pode falar de `https://`.
    for (const code of ['url_has_credentials', 'url_ip_literal', 'url_too_long', 'invalid_url', 'host_mismatch']) {
      expect(texto(code)).not.toContain('https://');
    }
  });

  it('traduz o validation-failed do servidor pelo codigo, nunca pelo texto', () => {
    expect(
      errosDoServidor(
        [
          { field: 'target_url', code: 'host_mismatch' },
          { field: 'price.checked_at', code: 'future' },
          { field: 'tag_slugs[1]', code: 'unknown_tag' },
        ],
        { tagsEnviadas: ['adulto', 'porte-medio'] },
      ),
    ).toEqual({
      erros: {
        'f-link': 'O link precisa ser do site do parceiro escolhido, ou de um subdomínio dele.',
        'f-data': 'A data da consulta não pode ser depois de hoje.',
        'f-tags': 'Uma das tags mudou de nome desde que você abriu este formulário. Desmarque a tag indicada, escolha de novo e salve.',
      },
      tagsRecusadas: ['porte-medio'],
    });
    // L1 com o site conhecido; L4 com o nome da tag.
    expect(
      errosDoServidor(
        [
          { field: 'target_url', code: 'host_mismatch' },
          { field: 'tag_slugs[0]', code: 'inactive_tag' },
        ],
        { hostDoParceiro: 'petcenteraurora.com.br', tagsEnviadas: ['sem-graos'], rotuloDaTag: () => 'sem grãos' },
      ),
    ).toEqual({
      erros: {
        'f-link': 'O link precisa ser do site do parceiro escolhido (petcenteraurora.com.br) ou de um subdomínio dele, como www.petcenteraurora.com.br.',
        'f-tags': 'A tag “sem grãos” foi desativada. Desmarque-a para salvar, ou reative-a em Tags.',
      },
      tagsRecusadas: ['sem-graos'],
    });
    // N5 (UX 30.6): sem o nome da tag.
    expect(errosDoServidor([{ field: 'tag_slugs[3]', code: 'inactive_tag' }]).erros['f-tags']).toBe(
      'Uma das tags escolhidas foi desativada. Veja em Tags qual é, e desmarque-a ou reative-a para salvar.',
    );
  });
});

describe('galeria no corpo da alteracao', () => {
  it('sem mudanca na galeria, images nao vai; com mudanca, vai sem a imagem sem envio', async () => {
    const { valoresDoItem, corpoDeAlteracao: corpo } = await import('../src/loja/formulario-do-produto.ts');
    const { item } = await import('./apoio/massa.ts');
    const base = valoresDoItem(
      item({
        images: [
          { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: null, position: 0, alt_text: 'Frente' },
          { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: '00000000-0000-4000-8000-000000000002', position: 1, alt_text: 'Verso' },
        ],
      }),
    );
    expect(corpo({ ...base, titulo: 'Outro nome' }, base)).not.toHaveProperty('images');
    const { avisoDeImagensSemEnvio } = await import('../src/loja/formulario-do-produto.ts');
    expect(avisoDeImagensSemEnvio(base)).toBe(
      'A imagem 1 veio de uma conta que não existe mais. Ela fica no produto enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, a tira do produto. Para mudar a galeria sem perdê-la, envie o mesmo arquivo de novo.',
    );
    expect(avisoDeImagensSemEnvio({ imagens: [base.imagens[0]!, { ...base.imagens[0]!, chave: 'sem-envio-9' }] })).toBe(
      '2 imagens vieram de uma conta que não existe mais. Elas ficam no produto enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, as tira do produto. Para mudar a galeria sem perdê-las, envie os mesmos arquivos de novo.',
    );
    expect(corpo({ ...base, imagens: [...base.imagens].reverse() }, base).images).toEqual([
      { upload_id: '00000000-0000-4000-8000-000000000002', alt_text: 'Verso' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// O rotulo da tag no painel (o cliente travado em `N&D`, 17/10/2026)
// ---------------------------------------------------------------------------
// A conferencia da tela e conveniencia de UX: a autoridade e o servidor
// (`conferirRotulo` em `escrita-da-vitrine.ts`). O que estes casos provam e que
// a tela NAO recusa antes o que o servidor aceita -- era ela que barrava `N&D`
// sem nem chamar a API.
describe('rotulo de tag no painel', () => {
  it.each([['N&D'], ['Pro Plan'], ["Hill's"], ['Hill\u2019s'], ['Royal Canin'], ['Farmina N&D Ocean'], ['3 Cora\u00e7\u00f5es'], ['Omega 3 + 6'], ['3 Corac\u0327o\u0303es']])(
    'aceita o nome de marca %s',
    (rotulo) => {
      expect(conferirRotuloDaTag(rotulo)).toBeUndefined();
    },
  );

  it.each([['bit.ly/x'], ['loja.com.br'], ['a@b.io'], ['x/y'], ['promo!']])('ISCA: continua recusando %s', (rotulo) => {
    expect(conferirRotuloDaTag(rotulo)).toBe('Use s\u00f3 letras, n\u00fameros, espa\u00e7o e os sinais & - \u2019 +.');
  });

  it('recusa vazio, so espaco e acima de 24', () => {
    expect(conferirRotuloDaTag('')).toBe('Use de 2 a 24 caracteres.');
    expect(conferirRotuloDaTag('   ')).toBe('Use de 2 a 24 caracteres.');
    expect(conferirRotuloDaTag('a'.repeat(25))).toBe('Use de 2 a 24 caracteres.');
    expect(conferirRotuloDaTag('a'.repeat(24))).toBeUndefined();
  });

  it('caractere invisivel tem mensagem propria, e ela nao diz "especial"', () => {
    const recusa = conferirRotuloDaTag('Ra\u200bcao');
    expect(recusa).toBe('Este nome tem caractere invis\u00edvel. Apague o campo e digite o nome de novo.');
    expect(recusa).not.toMatch(/especia/i);
    expect(conferirRotuloDaTag('Ra\u202ecao')).toBe(recusa);
  });

  it('o codigo do servidor vira a mensagem certa na tela', () => {
    expect(mensagemDeErroDaTag('validation-failed', ['tag_invisible_char'])).toMatch(/invis\u00edvel/);
    expect(mensagemDeErroDaTag('validation-failed', ['tag_charset'])).toMatch(/& - \u2019 \+/);
    expect(mensagemDeErroDaTag('validation-failed', ['tag_slug_invalid'])).toMatch(/endere\u00e7o v\u00e1lido/);
    expect(mensagemDeErroDaTag('validation-failed', [])).toBe('Use de 2 a 24 caracteres.');
  });
});
