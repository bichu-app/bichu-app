import { useRef, useState } from 'react';

import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';
import { ErroDoCampo } from './basicos.tsx';
import { DialogoDeRecorte } from './DialogoDeRecorte.tsx';
import {
  conferirArquivo,
  conferirDimensao,
  DIMENSAO_MINIMA,
  enviarImagem,
  FalhaDeEnvio,
  ORIENTACAO_DE_TAMANHO,
  TIPOS_ACEITOS,
  type Proposito,
} from './envio-de-imagem.ts';
import { Icone } from './Icone.tsx';
import { devolverImagem, lerImagem, podeRecortar, recortar, type ImagemParaRecorte, type Janela } from './recorte-de-imagem.ts';

/**
 * UMA imagem, e nao uma galeria. A `Galeria` e `multiple` e ordenada por
 * posicao -- "a primeira e a principal" --, e nada disso existe numa logo: ela
 * e uma so, nao tem ordem e nao tem descricao por item. Reusar a galeria aqui
 * obrigaria a tela a esconder metade dos controles dela.
 *
 * O envio e o MESMO de todo o painel (`enviarImagem`, ADR-0007): politica,
 * bytes direto no armazenamento e `upload_id` confirmado depois pela escrita do
 * registro. Nao ha segundo caminho de envio no backoffice.
 *
 * Desde 29/10/2026 (BICHUS-314) a escolha passa pelo ENQUADRAMENTO: o arquivo
 * escolhido abre `DialogoDeRecorte`, e o que sobe sao os bytes do recorte. Onde
 * o navegador nao souber recortar, o envio segue exatamente como antes.
 */
export type PropositoDeImagemUnica = Extract<Proposito, 'directory_logo' | 'directory_photo'>;

export interface PropsDoCampoDeImagem {
  id: string;
  rotulo: string;
  proposito: PropositoDeImagemUnica;
  api: ClienteDaApi;
  /**
   * O que a PESSOA fez neste formulario:
   *
   * - `string`: ela escolheu uma imagem nesta sessao, os bytes subiram e este e
   *   o `upload_id` que a escrita confirma;
   * - `null`: ela REMOVEU a imagem gravada (o `PATCH` manda `null`);
   * - `undefined`: ela nao tocou no campo, e o que vale e `salva`.
   */
  uploadId: string | null | undefined;
  /** A imagem GRAVADA, como o servidor a devolve. Ignorada quando `uploadId` foi tocado. */
  salva?: Esquemas['AdminCatalogImage'] | null | undefined;
  aoMudar: (uploadId: string | null) => void;
  ajuda?: string | undefined;
  /** Erro de campo vindo do servidor (`logo_upload_id`, `photo_upload_id`). */
  erro?: string | undefined;
  dataCy?: string;
}

/**
 * A previa local (`blob:`) do arquivo escolhido, ou `null` onde o ambiente nao
 * sabe criar uma. Ela e CONFORTO -- ver o que se escolheu antes de salvar --, e
 * nao pode derrubar o envio: sem previa o campo mostra o lugar da imagem e os
 * bytes sobem igual.
 */
function previaLocal(arquivo: File): string | null {
  try {
    return URL.createObjectURL(arquivo);
  } catch {
    return null;
  }
}

export function CampoDeImagem({
  id,
  rotulo,
  proposito,
  api,
  uploadId,
  salva,
  aoMudar,
  ajuda,
  erro,
  dataCy,
}: PropsDoCampoDeImagem) {
  const [envio, setEnvio] = useState<{ progresso: number }>();
  const [recusa, setRecusa] = useState<string>();
  const [previa, setPrevia] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  /**
   * O arquivo ORIGINAL escolhido nesta sessao, e nunca o recortado: reenquadrar
   * sobre o recorte anterior impediria afastar o zoom de novo e empilharia
   * perda de qualidade a cada ajuste.
   */
  const [original, setOriginal] = useState<File>();
  const [emRecorte, setEmRecorte] = useState<ImagemParaRecorte>();
  const seletor = useRef<HTMLInputElement>(null);

  /** Troca a previa local e devolve o `blob:` anterior ao navegador. */
  function trocarPrevia(nova: string | null) {
    setPrevia((anterior) => {
      if (anterior?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(anterior);
        } catch {
          // Nada a fazer: o endereco ja nao vale, e falhar ao devolve-lo nao
          // pode parar a tela.
        }
      }
      return nova;
    });
  }

  /** A dimensao e o envio. Recebe o RECORTE quando houve um, e o arquivo cru quando nao. */
  async function enviarEscolhido(arquivo: File) {
    const naoServe = await conferirDimensao(arquivo, proposito);
    if (naoServe) {
      setRecusa(naoServe);
      setAnuncio(naoServe);
      return;
    }
    setRecusa(undefined);
    trocarPrevia(previaLocal(arquivo));
    setEnvio({ progresso: 0 });
    try {
      const novo = await enviarImagem(api, arquivo, proposito, (p) => setEnvio({ progresso: p }));
      setEnvio(undefined);
      aoMudar(novo);
      setAnuncio('Imagem enviada.');
    } catch (e) {
      const mensagem = e instanceof FalhaDeEnvio ? e.mensagem : 'A imagem não foi enviada.';
      setEnvio(undefined);
      trocarPrevia(null);
      setRecusa(mensagem);
      setAnuncio(mensagem);
    }
  }

  async function escolher(arquivo: File) {
    // A conferencia local vem ANTES de qualquer chamada: tipo e tamanho o
    // navegador sabe sozinho, e pedir politica para um arquivo de 8 MB so para
    // ouvir `422` gasta uma viagem e some com o motivo.
    const naoServe = conferirArquivo(arquivo);
    if (naoServe) {
      setRecusa(naoServe);
      setAnuncio(naoServe);
      return;
    }
    setOriginal(arquivo);
    const imagem = await lerImagem(arquivo);
    if (imagem) {
      // A dimensao minima e conferida DENTRO do dialogo, contra o recorte: um
      // arquivo grande pode virar um recorte pequeno demais, e um pequeno
      // ainda serve se a pessoa nao aproximar.
      setRecusa(undefined);
      setEmRecorte(imagem);
      return;
    }
    await enviarEscolhido(arquivo);
  }

  async function reenquadrar() {
    if (!original) return;
    const imagem = await lerImagem(original);
    if (imagem) setEmRecorte(imagem);
  }

  async function confirmarRecorte(janela: Janela) {
    const imagem = emRecorte;
    const arquivo = original;
    if (!imagem || !arquivo) return;
    setEmRecorte(undefined);
    // Sem bytes utilizaveis o envio segue com o arquivo cru: e melhor subir a
    // imagem inteira do que nao subir nada.
    const recortado = (await recortar(imagem, janela)) ?? arquivo;
    devolverImagem(imagem);
    await enviarEscolhido(recortado);
  }

  function fecharRecorte() {
    devolverImagem(emRecorte);
    setEmRecorte(undefined);
    // Sem o enquadramento nao ha envio, e o seletor volta a aceitar o MESMO
    // arquivo: sem limpar, escolher de novo nao dispara `change`.
    if (!uploadIdEnviado() && seletor.current) seletor.current.value = '';
  }

  function uploadIdEnviado() {
    return typeof uploadId === 'string';
  }

  function remover() {
    trocarPrevia(null);
    setEnvio(undefined);
    setRecusa(undefined);
    setOriginal(undefined);
    if (seletor.current) seletor.current.value = '';
    aoMudar(null);
    setAnuncio('Imagem removida.');
  }

  // Quem manda e o que a pessoa fez; a gravada so aparece enquanto o campo
  // esta intocado.
  const enviada = typeof uploadId === 'string';
  const gravada = uploadId === undefined ? (salva ?? undefined) : undefined;
  const endereco = enviada ? previa : gravada?.status === 'ready' ? (gravada.url ?? null) : null;
  const processando = gravada?.status === 'processing';
  const recusadaNoServidor = gravada?.status === 'rejected';
  const temImagem = enviada || gravada !== undefined;
  const mensagemDeErro = recusa ?? erro;

  const idDaOrientacao = `${id}-orientacao`;
  const idDaAjuda = `${id}-ajuda`;
  const idDoErro = `${id}-erro`;
  const minima = DIMENSAO_MINIMA[proposito];
  /**
   * A orientacao fica SEMPRE em tela, e nao so quando algo da errado (pedido
   * do cliente de 18/10/2026). Quem descobre o limite pela recusa ja perdeu o
   * tempo de escolher o arquivo errado.
   */
  const orientacao = `${ORIENTACAO_DE_TAMANHO} JPG, PNG ou WebP, com pelo menos ${String(minima.largura)} × ${String(minima.altura)} pixels.`;

  return (
    <div className={mensagemDeErro ? 'field err' : 'field'}>
      <label htmlFor={id}>{rotulo}</label>
      <div className="campo-img">
        <div className={mensagemDeErro || recusadaNoServidor ? 'tile err' : 'tile'}>
          <div className="tile-img">
            {endereco ? <img src={endereco} alt="" /> : <Icone nome="image" />}
            {envio && (
              <div className="tile-over">
                <div
                  className="barra-prog"
                  role="progressbar"
                  aria-valuenow={envio.progresso}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Enviando ${rotulo}`}
                >
                  <span style={{ width: `${String(envio.progresso)}%` }} />
                </div>
                <span className="t-caption">Enviando… {envio.progresso}%</span>
              </div>
            )}
            {!envio && processando && (
              <div className="tile-over">
                <span className="spin" aria-hidden="true" />
                <span className="t-caption">Conferindo a imagem…</span>
              </div>
            )}
            {!envio && recusadaNoServidor && (
              <div className="tile-over err">
                <span className="t-label">Imagem recusada</span>
                {gravada.rejection_reason && <span className="t-caption">{gravada.rejection_reason}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="campo-img-acoes">
          <input
            ref={seletor}
            className="input"
            id={id}
            type="file"
            accept={TIPOS_ACEITOS.join(',')}
            data-cy={dataCy ?? id}
            data-testid={`${id}-arquivo`}
            aria-invalid={mensagemDeErro ? true : undefined}
            aria-describedby={[idDaOrientacao, ajuda ? idDaAjuda : '', mensagemDeErro ? idDoErro : '']
              .filter(Boolean)
              .join(' ')}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void escolher(arquivo);
            }}
          />
          {/* Reenquadrar so existe para a imagem escolhida NESTA sessao: da
              gravada o painel tem a derivada publica, e nao o original -- cortar
              de novo em cima dela perderia qualidade e poderia cair abaixo da
              minima. Para reenquadrar uma gravada, escolha o arquivo outra vez. */}
          {original && podeRecortar() && !envio && (
            <button
              type="button"
              className="btn ghost sm"
              data-reenquadrar
              data-cy={`${dataCy ?? id}-reenquadrar`}
              aria-label={`Reenquadrar ${rotulo}`}
              onClick={() => void reenquadrar()}
            >
              <Icone nome="edit" tamanho="s20" />
              Reenquadrar
            </button>
          )}
          {temImagem && (
            <button
              type="button"
              className="btn ghost sm"
              data-remover
              data-cy={`${dataCy ?? id}-remover`}
              aria-label={`Remover ${rotulo}`}
              onClick={remover}
            >
              <Icone nome="delete" tamanho="s20" />
              Remover
            </button>
          )}
        </div>
      </div>
      <span className="help" id={idDaOrientacao}>
        {orientacao}
      </span>
      {ajuda && (
        <span className="help" id={idDaAjuda}>
          {ajuda}
        </span>
      )}
      {mensagemDeErro && <ErroDoCampo id={idDoErro}>{mensagemDeErro}</ErroDoCampo>}
      <span className="sr" aria-live="polite">
        {anuncio}
      </span>
      {emRecorte && (
        <DialogoDeRecorte
          imagem={emRecorte}
          proposito={proposito}
          rotulo={rotulo.toLowerCase()}
          aoConfirmar={(janela) => void confirmarRecorte(janela)}
          aoFechar={fecharRecorte}
        />
      )}
    </div>
  );
}
