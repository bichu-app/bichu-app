/**
 * Apelidos dos tipos do contrato usados pela Rede. Nada aqui e escrito a mao:
 * tudo sai de `src/api/generated/api.ts`, gerado de `api/openapi.yaml`.
 */
import type { components, operations } from '../../api/generated/api.ts';

type S = components['schemas'];

export type Encontro = S['AdminNetworkEvent'];
export type PaginaDeEncontros = S['AdminNetworkEventPage'];
export type EncontroInput = S['AdminNetworkEventInput'];
export type EncontroPatch = S['AdminNetworkEventPatch'];
export type Mudanca = S['AdminNetworkEventRelocation'];
export type MudancaDeAcesso = S['AdminNetworkEventAccessChange'];
export type Cancelamento = S['AdminNetworkEventCancellation'];
export type LugarInput = S['AdminNetworkEventPlaceInput'];
export type Ponto = S['NetworkEventPoint'];
export type Visibilidade = S['NetworkEventVisibility'];
export type Momento = S['AdminNetworkEventTiming'];
export type EstadoDePublicacao = S['AdminNetworkEventPublicationStatus'];
export type ItemParaLevar = S['NetworkEventBringItem'];
export type Estrutura = S['NetworkEventAmenity'];
export type IdadeDosCaes = S['NetworkEventDogAge'];
export type Porte = S['PetSize'];
export type UnidadeDoValor = S['EventPriceUnit'];
export type ImagemDaGaleria = S['AdminCatalogGalleryImage'];
export type ImagemInput = S['CatalogImageInput'];
export type Pedido = S['AdminJoinRequest'];
export type PaginaDePedidos = S['AdminJoinRequestPage'];
export type EstadoDoPedido = S['AdminJoinRequestStatus'];
export type EscopoDeReautenticacao = S['AdminReauthScope'];
export type ConcessaoDeReautenticacao = S['AdminReauthGrant'];
export type IntencaoDeEnvio = S['UploadIntent'];
export type Problema = S['Problem'];

export type FiltrosDaLista = NonNullable<operations['listAdminNetworkEvents']['parameters']['query']>;
export type OrdemDaLista = NonNullable<FiltrosDaLista['sort']>;
