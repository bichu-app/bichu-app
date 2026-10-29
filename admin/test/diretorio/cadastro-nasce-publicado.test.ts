/**
 * O CADASTRO NASCE PUBLICADO, COBRANDO OS TRES CAMPOS (cliente, 29/10/2026).
 *
 * Verbatim: *"cobrar os dados no cadastro"*, sobre o pedido *"quando cadastrar
 * um estabelecimento no backoffice, ele ja deve salvar com o padrao publicado e
 * nao como rascunho"*.
 *
 * ## O QUE ESTE ARQUIVO GUARDA, E O QUE ELE DELIBERADAMENTE NAO GUARDA
 *
 * Ele guarda a REGUA LOCAL do formulario: o padrao de `Valores`, a lista de
 * situacoes que o cadastro oferece, e quando `validarEntrada` cobra cidade, UF
 * e telefone.
 *
 * **Ele NAO e o portao.** O portao e o servidor: `planejarCriacao` recusa o
 * `POST` incompleto com `400` nomeando os campos, venha ele deste formulario ou
 * de qualquer outro chamador, e isso esta medido em
 * `src/modules/professionals/application/diretorio-administrativo.test.ts`. O
 * cliente pediu portao, nao aviso -- e uma regra que vivesse so aqui seria
 * aviso. O que esta regua faz e poupar a viagem a rede.
 *
 * ## AS ISCAS, provadas NOS DOIS SENTIDOS
 *
 * Cada caso foi conferido reprovando com a regra antiga no lugar e passando com
 * a nova:
 *
 * | o que se poe no codigo de producao | `fail` |
 * |---|---|
 * | `VAZIO.situacao: 'draft'` (o padrao antigo) | 3 |
 * | `cobraPublicacao = false` (a regua antiga, que nao cobrava nada) | 2 |
 * | `cobraPublicacao = v.situacao !== 'draft'` (cobrar tambem ao retirar) | 1 |
 * | `SITUACOES_DO_CADASTRO` com os quatro valores | 1 |
 *
 * **A PRIMEIRA LINHA SO PASSOU A REPROVAR DEPOIS DE UMA CORRECAO**, e o erro
 * vale registrado porque e sutil: a primeira versao da fixa `cadastro()`
 * escrevia `situacao: 'published'` a mao, e com ela a sabotagem de `VAZIO`
 * deixava os OITO casos verdes -- a fixa media a si mesma. E o "eco" que o
 * cabecalho de `conjunto-exato-dos-checks.test.ts` descreve. A fixa passou a
 * partir de `...VAZIO`, e a mesma sabotagem reprova 3.
 */
import { describe, expect, it } from 'vitest';

import {
  SITUACOES_DA_EDICAO,
  SITUACOES_DO_CADASTRO,
  SITUACOES,
} from '../../src/diretorio/dominio.ts';
import { validarEntrada, VAZIO, type Valores } from '../../src/diretorio/FormularioDaEntrada.tsx';

/**
 * Um cadastro novo, **a partir de `VAZIO` do codigo de producao**.
 *
 * `...VAZIO` e nao um objeto escrito a mao, e a diferenca foi MEDIDA: com a
 * fixa escrevendo `situacao: 'published'`, trocar `VAZIO.situacao` de volta
 * para `'draft'` deixava os oito casos VERDES -- a fixa media a si mesma, que e
 * o "eco" que `conjunto-exato-dos-checks.test.ts` descreve no cabecalho dele.
 * Com o `spread`, a mesma sabotagem reprova.
 */
function cadastro(extra: Partial<Valores> = {}): Valores {
  return {
    ...VAZIO,
    nome: 'Clínica São Jorge',
    slug: 'clinica-sao-jorge',
    slugEditado: true,
    atividades: ['clinic'],
    ...extra,
  };
}

describe('o cadastro nasce publicado (cliente, 29/10/2026)', () => {
  it('a situacao padrao do formulario de cadastro e "No ar"', () => {
    // Era `'draft'` ate 28/10/2026. Se esta linha cair, o padrao voltou a ser
    // rascunho e a decisao do cliente foi desfeita sem ninguem dizer.
    //
    // Le `VAZIO` DIRETO, e nao `cadastro()`: e o objeto de producao que decide,
    // e e dele que a afirmacao tem de sair.
    expect(VAZIO.situacao).toBe('published');
    expect(SITUACOES.published).toBe('No ar');
  });

  it('com "No ar" e os campos vazios, os TRES sao cobrados de uma vez', () => {
    // De uma vez, e nao um por requisicao: o resumo de erros marca os tres e a
    // pessoa corrige tudo numa passada.
    const erros = validarEntrada(cadastro());
    expect(Object.keys(erros).sort()).toEqual(['e-cidade', 'e-telefone', 'e-uf']);
  });

  it('com "No ar" e os tres preenchidos, nada e cobrado', () => {
    const erros = validarEntrada(
      cadastro({ cidade: 'São Paulo', uf: 'SP', telefone: '(11) 3061-2200' }),
    );
    expect(erros).toEqual({});
  });

  it('com "Rascunho" os tres NAO sao cobrados -- a porta continua aberta', () => {
    // O cliente confirmou que o rascunho fica, para quem quiser salvar
    // incompleto. Esta e a unica coisa que impede a decisao de virar "nao da
    // mais para salvar pela metade".
    expect(validarEntrada(cadastro({ situacao: 'draft' }))).toEqual({});
  });

  it('a cobranca segue a SITUACAO, e nao "criando ou editando"', () => {
    // A mesma frase do servidor: *quem publica precisa dos tres*. Uma regua que
    // lesse "estou criando" nao cobraria nada ao publicar pela edicao, e o
    // formulario descobriria a falta no `400`.
    const editandoEPublicando = cadastro({ situacao: 'published' });
    const editandoERetirando = cadastro({ situacao: 'hidden' });
    expect(Object.keys(validarEntrada(editandoEPublicando))).toHaveLength(3);
    expect(validarEntrada(editandoERetirando)).toEqual({});
  });

  it('a forma continua valendo por cima da obrigatoriedade', () => {
    // Cidade de UMA letra nao e "cidade preenchida": a recusa muda de frase e
    // continua existindo. Sem este caso, trocar o `else if` por um `if` solto
    // faria a cidade curta passar.
    const erros = validarEntrada(
      cadastro({ cidade: 'a', uf: 'SP', telefone: '(11) 3061-2200' }),
    );
    expect(erros['e-cidade']).toBe('Entre 2 e 80 caracteres.');
  });

  it('UF de uma letra e telefone sem DDD continuam recusados pela FORMA', () => {
    const erros = validarEntrada(
      cadastro({ cidade: 'São Paulo', uf: 'S', telefone: '3061-2200' }),
    );
    expect(erros['e-uf']).toBe('Use a sigla do estado, com duas letras.');
    expect(erros['e-telefone']).toBe('Informe o telefone com DDD. Por exemplo: (11) 3061-2200.');
  });

  it('o cadastro oferece DOIS valores de situacao, e a edicao QUATRO', () => {
    // `hidden` e `removed` sao RETIRADA, e o contrato nem as aceita na criacao
    // (`AdminDirectoryEntryCreateStatus`). Oferece-las no cadastro ofereceria
    // um `400`.
    expect([...SITUACOES_DO_CADASTRO]).toEqual(['published', 'draft']);
    expect([...SITUACOES_DA_EDICAO]).toEqual(['published', 'draft', 'hidden', 'removed']);
    // E o padrao do formulario e o PRIMEIRO da lista do cadastro: a ordem nao e
    // decorativa, ela diz qual e o padrao.
    expect(SITUACOES_DO_CADASTRO[0]).toBe(cadastro().situacao);
  });
});
