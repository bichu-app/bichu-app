/**
 * Barril dos links do encontro.
 *
 * As regras do link do convite e do handle do Instagram moram em
 * `./link-do-convite.ts`, que nao tem nenhum especificador de modulo para poder
 * ser importado pela suite da raiz (ver o cabecalho de la). As de ENDERECO
 * COMPLETO (site do parceiro e URL do Instagram) moram em
 * `src/endereco/enderecos.ts`, e nao aqui: elas valem para a aplicacao inteira
 * desde o padrao do cliente de 17/10/2026, e a Loja precisa delas. Um modulo da
 * `rede/` importado de dentro da `loja/` seria a dependencia errada.
 *
 * Este arquivo existe para que `import { ... } from './links.ts'` continue
 * valendo em todos os chamadores.
 */
export {
  handleDoInstagram,
  LIMITE_DO_LINK_DO_CONVITE,
  MENSAGEM_DO_LINK,
  recusaDoLinkDoConvite,
  type CodigoDoLink,
} from './link-do-convite.ts';

export {
  EXEMPLO_DO_INSTAGRAM,
  hostDoSite,
  LIMITE_DA_URL_DO_INSTAGRAM,
  LIMITE_DO_SITE,
  MENSAGEM_DO_INSTAGRAM,
  MENSAGEM_DO_SITE,
  mensagemDoInstagram,
  mensagemDoSite,
  recusaDoInstagram,
  recusaDoSite,
  type CodigoDoInstagram,
  type CodigoDoSite,
} from '../../endereco/enderecos.ts';
