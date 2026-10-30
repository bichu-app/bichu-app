/**
 * As palavras recusadas, agrupadas so para leitura humana: a moderacao junta tudo
 * num conjunto e nao distingue grupo.
 */
const VULGARIDADE_SEXUAL: readonly string[] = [
  'porra',
  'caralho',
  'foder',
  'fodase',
  'fodido',
  'fudido',
  'piroca',
  'xoxota',
  'xereca',
  'boquete',
  'punheta',
  'siririca',
  'putaria',
];

const ESCATOLOGIA: readonly string[] = [
  'merda',
];

const XINGAMENTO: readonly string[] = [
  'puta',
  'putinha',
  'vagabunda',
  'vagabundo',
  'otario',
  'idiota',
  'imbecil',
  'babaca',
  'canalha',
  'cretino',
  'panaca',
];

/** Sigla de xingamento. Duas letras nao entram: colidem com inicial. */
const SIGLA: readonly string[] = ['pqp', 'vtnc'];

/** Injuria de orientacao, identidade e capacidade. */
const DISCRIMINACAO: readonly string[] = [
  'viado',
  'boiola',
  'traveco',
  'sapatao',
  'mongoloide',
];

export const PALAVRAS_RECUSADAS: readonly string[] = [
  ...VULGARIDADE_SEXUAL,
  ...ESCATOLOGIA,
  ...XINGAMENTO,
  ...SIGLA,
  ...DISCRIMINACAO,
];

/** A LISTA DE EXCECAO, e **ela vence o bloqueio**. */
const NOME_PROPRIO: readonly string[] = [
  'pinto',
  'pintos',
  'buceta',
  'rola',
  'prego',
  'peruca',
  'cunha',
  'paulo',
  'veado',
  'cacete',
  'pau',
  'mongol',
  'japa',
];

const TERMO_DO_DOMINIO: readonly string[] = [
  'cao',
  'cadela',
  'cachorra',
  'cachorro',
  'bicho',
  'bichano',
  'rabo',
  'vaca',
  'egua',
  'galinha',
  'burro',
  'besta',
  'macaco',
  'piranha',
  'perereca',
  'crioulo',
  'preto',
  'corno',
  'escroto',
  'retardado',
];

export const EXCECOES: readonly string[] = [...NOME_PROPRIO, ...TERMO_DO_DOMINIO];
