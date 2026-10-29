/**
 * DUPLICAR UMA ENTRADA DO DIRETORIO (cliente, 28/10/2026).
 *
 * Verbatim: *"Implemente um recurso de duplicar estabelecimento no
 * backoffice"*.
 *
 * ## O QUE ESTE ARQUIVO GUARDA, e e a regra e nao a tela
 *
 * A decisao de produto de duplicar e **o que a copia leva e o que ela nao
 * leva**, e ela esta inteira em `valoresDuplicados`. Por isso os casos aqui sao
 * sobre a FUNCAO e nao sobre cliques: a tela pode mudar de lugar que a regra
 * continua valendo, e o acidente caro -- herdar avaliacao ou repetir o
 * endereco publico -- e de dados, nao de interface.
 *
 * O caso do `slug` e o que mais importa. Nao basta "o slug nao e copiado": ele
 * tem de estar **vazio**, e nao sugerido a partir do nome. Sugerir a partir do
 * nome copiado produz o slug do ORIGINAL -- um formulario com cara de pronto
 * que leva `409 slug-taken` no envio.
 *
 * ## As iscas, e como cada uma foi provada
 *
 * Escritas ANTES de `valoresDuplicados` existir, e conferidas reprovando
 * (admin, 28/10/2026). Depois, com a funcao no lugar, cada regra foi desligada
 * uma a uma e a reprovacao conferida:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | a funcao nao existia ainda (o arquivo nem importava) | 5 |
 * | `slug: entrada.slug` (copiar o endereco publico) | 1 |
 * | `slug: slugSugerido(nome)` (sugerir, que da o slug do original) | 1 |
 * | `situacao: entrada.status` (herdar "no ar") | 1 |
 * | `slugEditado: true` (o nome deixa de voltar a sugerir) | 1 |
 */
import { describe, expect, it } from 'vitest';

import { valoresDuplicados } from '../../src/diretorio/FormularioDaEntrada.tsx';
import type { Entrada } from '../../src/diretorio/dominio.ts';

/**
 * Uma entrada COMPLETA e com historia: publicada, avaliada, verificada e com
 * imagem. A fonte precisa ter tudo o que a copia deve deixar para tras --
 * duplicar uma entrada pobre nao mediria nada.
 */
const FONTE = {
  slug: 'clinica-sao-jorge',
  display_name: 'Clínica São Jorge',
  kinds: ['clinic', 'vet'],
  kind: 'clinic',
  entity_kind: 'organization',
  about: 'Atende cães e gatos desde 1998.',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  postal_code: '05435000',
  street: 'Rua dos Pinheiros',
  street_number: '120A',
  complement: 'Conjunto 4',
  phone_e164: '+551130612200',
  site_url: 'https://saojorge.example/clinica',
  status: 'published',
  origin: 'invited',
  claim_status: 'claimed',
  missing_to_publish: [],
  verification: { level: 'document_verified', evidence_kinds: ['cnpj'] },
  logo: { status: 'ready', url: 'https://cdn.example/logo.webp' },
  photo: { status: 'ready', url: 'https://cdn.example/foto.webp' },
  // A GALERIA (29/10/2026). A fonte tem DUAS fotos de proposito: duplicar uma
  // entrada sem galeria nao mediria se a copia a deixa para tras.
  images: [
    {
      upload_id: '0192a3b4-0000-7000-8000-00000000e001',
      position: 0,
      alt_text: 'A fachada',
      source: 'uploaded',
      status: 'ready',
      url: 'https://cdn.example/g0.webp',
    },
    {
      upload_id: '0192a3b4-0000-7000-8000-00000000e002',
      position: 1,
      alt_text: null,
      source: 'uploaded',
      status: 'ready',
      url: 'https://cdn.example/g1.webp',
    },
  ],
  created_at: '2026-01-02T03:04:05Z',
  updated_at: '2026-10-27T10:00:00Z',
  version: 7,
} as unknown as Entrada;

describe('valoresDuplicados: o que a cópia leva', () => {
  it('leva os dados de preenchimento, inclusive os dois eixos', () => {
    const copia = valoresDuplicados(FONTE);
    expect(copia.nome).toBe('Clínica São Jorge');
    expect(copia.atividades).toEqual(['clinic', 'vet']);
    // O TIPO vai junto: uma ONG duplicada continua sendo uma ONG, e deixar o
    // tipo cair para o padrao faria a copia nascer `professional` em silencio.
    expect(copia.tipoDeEntidade).toBe('organization');
    expect(copia.sobre).toBe('Atende cães e gatos desde 1998.');
    expect(copia.cidade).toBe('São Paulo');
    expect(copia.uf).toBe('SP');
    expect(copia.bairro).toBe('Pinheiros');
    expect(copia.logradouro).toBe('Rua dos Pinheiros');
    expect(copia.numero).toBe('120A');
    expect(copia.complemento).toBe('Conjunto 4');
    expect(copia.site).toBe('https://saojorge.example/clinica');
  });

  it('o CEP e o telefone vão na gramática da tela, como na edição', () => {
    const copia = valoresDuplicados(FONTE);
    // Os oito digitos gravados viram a mascara; o E.164 vira a gramatica
    // brasileira. A copia e um formulario, e formulario mostra o que a pessoa
    // confere.
    expect(copia.cep).toBe('05435-000');
    expect(copia.telefone).not.toBe('+551130612200');
    expect(copia.telefone).toContain('3061');
  });

  it('a lista copiada é independente da fonte', () => {
    const copia = valoresDuplicados(FONTE);
    copia.atividades.push('groomer');
    // Sem a copia da lista, editar as atividades da copia mexeria no objeto
    // lido do servidor -- e a tela da fonte, ainda em memoria, mudaria junto.
    expect(FONTE.kinds).toEqual(['clinic', 'vet']);
  });
});

describe('valoresDuplicados: o que a cópia NÃO leva', () => {
  it('o slug fica VAZIO, e não sugerido a partir do nome', () => {
    const copia = valoresDuplicados(FONTE);
    expect(copia.slug).toBe('');
    // O contrapeso que importa: nao e so "diferente do original". Sugerir a
    // partir do nome copiado daria `clinica-sao-jorge`, que E o original --
    // formulario com cara de pronto e `409 slug-taken` no envio.
    expect(copia.slug).not.toBe(FONTE.slug);
    expect(copia.slug).not.toBe('clinica-sao-jorge');
  });

  it('`slugEditado` fica falso, para o nome voltar a sugerir', () => {
    // Com ele `true`, quem renomeasse a copia ("Clínica São Jorge Itaim")
    // ficaria com o campo de identificador vazio e sem sugestao nenhuma.
    expect(valoresDuplicados(FONTE).slugEditado).toBe(false);
  });

  it('a situação nasce a do CADASTRO NOVO, que desde 29/10/2026 é "No ar"', () => {
    // ESTE CASO MUDOU EM 29/10/2026, e mudou por decisao do cliente -- *"ele ja
    // deve salvar com o padrao publicado e nao como rascunho"*. Ate 28/10 ele
    // afirmava `'draft'`, e afirmava com razao: o `POST` nao aceitava `status` e
    // a entrada nascia sempre rascunho.
    //
    // O que o caso continua guardando e o que importava: a copia nao HERDA a
    // situacao do original, ela nasce com a do cadastro novo. Com a fonte
    // publicada as duas coincidem; o caso abaixo e que separa as duas coisas.
    expect(FONTE.status).toBe('published');
    expect(valoresDuplicados(FONTE).situacao).toBe('published');
  });

  it('a situação NÃO é herdada: duplicar entrada retirada não abre a cópia retirada', () => {
    // E este e o contrapeso que o caso acima perdeu quando os dois valores
    // coincidiram. `hidden` e `removed` sao ESTADO e nao preenchimento, e
    // "nasce retirada" nao e um estado que signifique algo -- o contrato nem
    // os aceita na criacao.
    const retirada = { ...FONTE, status: 'removed' } as unknown as Entrada;
    expect(valoresDuplicados(retirada).situacao).toBe('published');
  });

  it('não leva imagem: o contrato não dá como apontar para a do original', () => {
    const copia = valoresDuplicados(FONTE);
    // A leitura traz `logo`/`photo` como URL processada, SEM `upload_id`, e a
    // escrita so aceita `upload_id` ainda nao usado em outra entrada. Nao ha o
    // que mandar, entao os campos abrem vazios em vez de prometer a imagem.
    expect(copia.logoUploadId).toBeUndefined();
    expect(copia.fotoUploadId).toBeUndefined();
    // A GALERIA cai pela MESMA razao, e com uma a mais:
    // `professional_images.image_id` e UNIQUE GLOBAL, entao reaproveitar o
    // `upload_id` da fonte seria recusado com `400 upload_not_usable`.
    expect(copia.imagens).toEqual([]);
  });

  it('não leva identidade nem história: nenhum campo do original vaza para a cópia', () => {
    const copia = valoresDuplicados(FONTE);
    // A regra dita de uma vez, sobre as CHAVES: o formulario nao tem onde
    // guardar avaliacao, verificacao, carimbo de data, `version`,
    // `claim_status`, `origin` nem `missing_to_publish` -- e este caso cai no
    // dia em que alguem abrir um campo para um deles sem pensar.
    for (const proibido of [
      'rating',
      'verification',
      'created_at',
      'updated_at',
      'version',
      'claim_status',
      'origin',
      'missing_to_publish',
      'id',
      'logo',
      'photo',
    ]) {
      expect(Object.keys(copia)).not.toContain(proibido);
    }
  });
});
