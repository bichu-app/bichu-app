import { useRef, useState } from 'react';

import { DialogoDeRecorte } from './DialogoDeRecorte.tsx';
import {
  conferirArquivo,
  conferirDimensao,
  DIMENSAO_MINIMA,
  FalhaDeEnvio,
  LIMITE_EM_MB,
  MAXIMO_DE_IMAGENS,
  type Proposito,
} from './envio-de-imagem.ts';
import { Icone } from './Icone.tsx';
import { devolverImagem, lerImagem, podeRecortar, recortar, type ImagemParaRecorte, type Janela } from './recorte-de-imagem.ts';

/** Uma imagem da galeria, do ponto de vista da tela. */
export interface ImagemDaGaleria {
  chave: string;
  uploadId?: string;
  alt: string;
  estado: 'enviando' | 'erro' | 'enviada' | 'processing' | 'ready' | 'rejected';
  progresso?: number;
  erro?: string;
  motivo?: string | null;
  /**
   * A derivada publica quando pronta, ou a previa local (`blob:`) do arquivo
   * escolhido.
   */
  previa?: string | null;
  /** O arquivo que esta subindo, ja RECORTADO quando a pessoa enquadrou. */
  arquivo?: File;
  /** O arquivo CRU que a pessoa escolheu, guardado so para reenquadrar (BICHUS-314). */
  original?: File;
}

let contador = 0;
export function novaChave(): string {
  contador += 1;
  return `img-${Date.now().toString(36)}-${contador}`;
}

/**
 * A imagem ACEITA descricao (secao 25.5.1): a que falhou, a recusada e a que ainda
 * esta subindo nao mostram o campo.
 */
export function precisaDeDescricao(imagem: ImagemDaGaleria): boolean {
  return imagem.estado !== 'erro' && imagem.estado !== 'rejected' && imagem.estado !== 'enviando';
}

export function descricaoValida(alt: string): boolean {
  const t = alt.trim();
  return t.length >= 2 && t.length <= 150;
}

/** A descricao em branco e aceitavel? */
export function descricaoAceitavel(alt: string, obrigatoria: boolean): boolean {
  if (alt.trim() === '') return !obrigatoria;
  return descricaoValida(alt);
}

export interface PropsDaGaleria {
  id: string;
  imagens: ImagemDaGaleria[];
  aoMudar: (atualizar: (atual: ImagemDaGaleria[]) => ImagemDaGaleria[]) => void;
  enviar: (arquivo: File, aoProgredir: (p: number) => void) => Promise<string>;
  proposito: Proposito;
  mostrarErrosDeDescricao: boolean;
  erro?: string | undefined;
  titulo?: string;
  principal?: string;
  ajuda?: string;
  /** A descricao de cada imagem e obrigatoria? */
  descricaoObrigatoria?: boolean;
  /** O que o app LE quando a descricao nao vem. */
  reservaDaDescricao?: string;
  /**
   * Marca curta numa imagem (ex.: a foto sem envio da Rede, UX 30.7), tambem lida no
   * nome acessivel do item.
   */
  marca?: (imagem: ImagemDaGaleria) => string | undefined;
}

/**
 * Galeria de ate 8 imagens (secao 25.5.1, UX 29.10): a primeira e a principal;
 * mover, usar como principal e remover por botao, com a posicao no nome acessivel;
 * arrastar para reordenar e atalho, nao requisito (SC 2.5.7).
 */
export function Galeria({
  id,
  imagens,
  aoMudar,
  enviar,
  proposito,
  mostrarErrosDeDescricao,
  erro,
  titulo = 'Imagens do produto',
  principal = 'Principal',
  ajuda = `JPG, PNG ou WebP, até ${LIMITE_EM_MB} MB cada, com pelo menos ${String(DIMENSAO_MINIMA.store_item.largura)} × ${String(DIMENSAO_MINIMA.store_item.altura)} pixels. A primeira é a principal: ela aparece na lista e no app. Arraste para reordenar, ou use os botões de mover.`,
  descricaoObrigatoria = true,
  reservaDaDescricao = 'o nome do produto',
  marca,
}: PropsDaGaleria) {
  const [anuncio, setAnuncio] = useState('');
  const [recorte, setRecorte] = useState<{
    imagem: ImagemParaRecorte;
    original: File;
    indice: number | null;
    chave: string | null;
  }>();
  const seletor = useRef<HTMLInputElement>(null);
  const trocarEm = useRef<number | null>(null);
  const arrastando = useRef<number | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const n = imagens.length;
  const cheio = n >= MAXIMO_DE_IMAGENS;
  const principalMinusculo = principal.toLowerCase();

  function focar(seletorCss: string) {
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(seletorCss)?.focus());
  }

  function atualizar(chave: string, mudanca: Partial<ImagemDaGaleria>) {
    aoMudar((atual) => atual.map((im) => (im.chave === chave ? { ...im, ...mudanca } : im)));
  }

  async function subir(chave: string, arquivo: File, original?: File) {
    const cru = original ?? (podeRecortar() ? arquivo : undefined);
    const recusa = conferirArquivo(arquivo) ?? (await conferirDimensao(arquivo, proposito));
    if (recusa) {
      atualizar(chave, { estado: 'erro', erro: recusa, arquivo, ...(cru ? { original: cru } : {}) });
      setAnuncio(recusa);
      return;
    }
    atualizar(chave, { estado: 'enviando', progresso: 0, arquivo, ...(cru ? { original: cru } : {}) });
    try {
      const uploadId = await enviar(arquivo, (p) => atualizar(chave, { progresso: p }));
      atualizar(chave, { estado: 'enviada', uploadId, progresso: 100 });
      setAnuncio('Imagem enviada.');
    } catch (e) {
      const mensagem = e instanceof FalhaDeEnvio ? e.mensagem : 'A imagem não foi enviada.';
      atualizar(chave, { estado: 'erro', erro: mensagem });
      setAnuncio(mensagem);
    }
  }

  function substituir(indice: number, arquivo: File, original?: File) {
    const alvo = imagens[indice];
    if (!alvo) return;
    const nova: ImagemDaGaleria = {
      chave: novaChave(),
      alt: alvo.alt,
      estado: 'enviando',
      progresso: 0,
      previa: URL.createObjectURL(arquivo),
    };
    aoMudar((atual) => atual.map((im) => (im.chave === alvo.chave ? nova : im)));
    setAnuncio('Enviando outra imagem.');
    void subir(nova.chave, arquivo, original);
  }

  function acrescentar(arquivos: readonly File[], originais?: readonly File[]) {
    const novas = arquivos.map<ImagemDaGaleria>((arquivo) => ({
      chave: novaChave(),
      alt: '',
      estado: 'enviando',
      progresso: 0,
      previa: URL.createObjectURL(arquivo),
    }));
    aoMudar((atual) => [...atual, ...novas]);
    setAnuncio(arquivos.length === 1 ? 'Enviando imagem.' : `Enviando ${arquivos.length} imagens.`);
    novas.forEach((im, i) => {
      const arquivo = arquivos[i];
      if (arquivo) void subir(im.chave, arquivo, originais?.[i]);
    });
  }

  async function enquadrarOuSubir(arquivo: File, indice: number | null) {
    if (!conferirArquivo(arquivo)) {
      const imagem = await lerImagem(arquivo);
      if (imagem) {
        setRecorte({ imagem, original: arquivo, indice, chave: null });
        return;
      }
    }
    if (indice === null) acrescentar([arquivo]);
    else substituir(indice, arquivo);
  }

  function escolher(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    const indice = trocarEm.current;
    trocarEm.current = null;
    if (indice !== null) {
      const arquivo = arquivos[0];
      if (!arquivo || !imagens[indice]) return;
      void enquadrarOuSubir(arquivo, indice);
      return;
    }
    const livres = MAXIMO_DE_IMAGENS - n;
    const escolhidos = [...arquivos].slice(0, livres);
    const primeiro = escolhidos[0];
    if (escolhidos.length === 0 || !primeiro) return;
    if (escolhidos.length === 1) {
      void enquadrarOuSubir(primeiro, null);
      return;
    }
    acrescentar(escolhidos);
  }

  async function reenquadrar(im: ImagemDaGaleria) {
    if (!im.original) return;
    const imagem = await lerImagem(im.original);
    if (!imagem) {
      setAnuncio('Não foi possível abrir o enquadramento desta imagem.');
      return;
    }
    setRecorte({ imagem, original: im.original, indice: null, chave: im.chave });
  }

  async function confirmarRecorte(janela: Janela) {
    const pedido = recorte;
    if (!pedido) return;
    setRecorte(undefined);
    const recortado = (await recortar(pedido.imagem, janela)) ?? pedido.original;
    devolverImagem(pedido.imagem);
    if (pedido.chave !== null) {
      atualizar(pedido.chave, { estado: 'enviando', progresso: 0, previa: URL.createObjectURL(recortado) });
      await subir(pedido.chave, recortado, pedido.original);
      return;
    }
    if (pedido.indice === null) acrescentar([recortado], [pedido.original]);
    else substituir(pedido.indice, recortado, pedido.original);
  }

  function fecharRecorte() {
    if (recorte) devolverImagem(recorte.imagem);
    setRecorte(undefined);
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= n) return;
    aoMudar((atual) => {
      const copia = [...atual];
      const [x] = copia.splice(i, 1);
      if (x) copia.splice(j, 0, x);
      return copia;
    });
    setAnuncio(`Imagem movida para a posição ${j + 1} de ${n}.${j === 0 ? ` Ela agora é a ${principalMinusculo}.` : ''}`);
    focar(`[data-indice="${j}"] [data-mover="${delta}"]:not([disabled])`);
  }

  function tornarPrincipal(i: number) {
    aoMudar((atual) => {
      const copia = [...atual];
      const [x] = copia.splice(i, 1);
      if (x) copia.unshift(x);
      return copia;
    });
    setAnuncio(`Esta imagem agora é a ${principalMinusculo}.`);
    focar('[data-indice="0"] [data-remover]');
  }

  function remover(i: number) {
    const alvo = imagens[i];
    aoMudar((atual) => atual.filter((_, k) => k !== i));
    if (alvo?.previa?.startsWith('blob:')) URL.revokeObjectURL(alvo.previa);
    setAnuncio(`Imagem removida. ${n - 1} de ${MAXIMO_DE_IMAGENS}.`);
    focar('[data-adicionar]');
  }

  function rotuloDoRecorte(chave: string | null): string {
    const i = chave === null ? -1 : imagens.findIndex((im) => im.chave === chave);
    return i < 0 ? 'a imagem' : `a imagem ${i + 1} de ${n}`;
  }

  const idDaAjuda = `${id}-ajuda`;
  const idDoErro = `${id}-erro`;

  return (
    <div className={erro ? 'field err' : 'field'}>
      <div className="lab-row">
        <span className="lab" id={`${id}-titulo`}>
          {titulo}
        </span>
        <span className="t-body-sm c-sec contador-img">
          {n} de {MAXIMO_DE_IMAGENS} imagens
        </span>
      </div>
      <ol
        ref={lista}
        id={id}
        tabIndex={-1}
        className="galeria"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={[idDaAjuda, erro ? idDoErro : ''].filter(Boolean).join(' ')}
      >
        {imagens.map((im, i) => {
          const podeMover = im.estado !== 'enviando' && im.estado !== 'erro';
          const erroDeDescricao =
            mostrarErrosDeDescricao && precisaDeDescricao(im) && !descricaoAceitavel(im.alt, descricaoObrigatoria);
          const idDoAlt = `${id}-alt-${i}`;
          return (
            <li
              key={im.chave}
              className={im.estado === 'erro' || im.estado === 'rejected' ? 'tile err' : 'tile'}
              data-indice={i}
              aria-label={`Imagem ${i + 1} de ${n}${i === 0 ? `, ${principalMinusculo}` : ''}${marca?.(im) ? `, ${marca(im)}` : ''}`}
              draggable={podeMover}
              onDragStart={(e) => {
                arrastando.current = i;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (arrastando.current !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const de = arrastando.current;
                arrastando.current = null;
                if (de === null || de === i) return;
                mover(de, i - de);
              }}
            >
              <div className="tile-img">
                {im.previa ? <img src={im.previa} alt="" /> : <Icone nome="image" />}
                {i === 0 && (
                  <span className="selo pub t-overline tile-principal">
                    <Icone nome="check" tamanho="s16" />
                    {principal}
                  </span>
                )}
                {im.estado === 'enviando' && (
                  <div className="tile-over">
                    <div
                      className="barra-prog"
                      role="progressbar"
                      aria-valuenow={im.progresso ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Enviando imagem ${i + 1}`}
                    >
                      <span style={{ width: `${im.progresso ?? 0}%` }} />
                    </div>
                    <span className="t-caption">Enviando… {im.progresso ?? 0}%</span>
                  </div>
                )}
                {im.estado === 'processing' && (
                  <div className="tile-over">
                    <span className="spin" aria-hidden="true" />
                    <span className="t-caption">Conferindo a imagem…</span>
                  </div>
                )}
                {im.estado === 'erro' && (
                  <div className="tile-over err">
                    <span className="t-caption">{im.erro ?? 'A imagem não foi enviada.'}</span>
                  </div>
                )}
                {im.estado === 'rejected' && (
                  <div className="tile-over err">
                    <span className="t-label">Imagem recusada</span>
                    {im.motivo && <span className="t-caption">{im.motivo}</span>}
                  </div>
                )}
              </div>
              {marca?.(im) && <span className="selo venc t-overline">{marca(im)}</span>}
              {precisaDeDescricao(im) && (
                <div className={erroDeDescricao ? 'field tile-alt err' : 'field tile-alt'}>
                  <label className="t-caption" htmlFor={idDoAlt}>
                    {descricaoObrigatoria ? 'Descrição da imagem *' : 'Descrição da imagem (opcional)'}
                  </label>
                  <input
                    className="input"
                    id={idDoAlt}
                    maxLength={150}
                    value={im.alt}
                    onChange={(e) => atualizar(im.chave, { alt: e.target.value })}
                    aria-invalid={erroDeDescricao || undefined}
                    aria-describedby={erroDeDescricao ? `${idDoAlt}-erro` : `${id}-ajuda-alt`}
                  />
                  {erroDeDescricao && (
                    <span className="help err" id={`${idDoAlt}-erro`}>
                      <Icone nome="error" tamanho="s20" />
                      {descricaoObrigatoria
                        ? 'Descreva a imagem.'
                        : 'Escreva pelo menos duas letras, ou deixe o campo vazio.'}
                    </span>
                  )}
                </div>
              )}
              <div className="tile-acts">
                {im.estado === 'rejected' ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      trocarEm.current = i;
                      seletor.current?.click();
                    }}
                  >
                    Enviar outra
                  </button>
                ) : im.estado === 'erro' ? (
                  im.arquivo && !conferirArquivo(im.arquivo) ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setAnuncio('Enviando de novo.');
                        if (im.arquivo) void subir(im.chave, im.arquivo);
                      }}
                    >
                      Tentar de novo
                    </button>
                  ) : null
                ) : (
                  <>
                    <button
                      type="button"
                      className="ibtn"
                      data-mover="-1"
                      disabled={i === 0 || !podeMover}
                      aria-label={`Mover para a esquerda a imagem ${i + 1} de ${n}`}
                      title="Mover para a esquerda"
                      onClick={() => mover(i, -1)}
                    >
                      <Icone nome="back" tamanho="s20" />
                    </button>
                    <button
                      type="button"
                      className="ibtn"
                      data-mover="1"
                      disabled={i === n - 1 || !podeMover}
                      aria-label={`Mover para a direita a imagem ${i + 1} de ${n}`}
                      title="Mover para a direita"
                      onClick={() => mover(i, 1)}
                    >
                      <Icone nome="back" tamanho="s20" espelhado />
                    </button>
                    {i > 0 && podeMover && (
                      <button
                        type="button"
                        className="ibtn"
                        aria-label={`Usar como ${principalMinusculo} a imagem ${i + 1} de ${n}`}
                        title={`Usar como ${principalMinusculo}`}
                        onClick={() => tornarPrincipal(i)}
                      >
                        <Icone nome="check" tamanho="s20" />
                      </button>
                    )}
                    {
}
                    {im.original && podeMover && (
                      <button
                        type="button"
                        className="ibtn"
                        data-reenquadrar
                        aria-label={`Reenquadrar a imagem ${i + 1} de ${n}`}
                        title="Reenquadrar"
                        onClick={() => void reenquadrar(im)}
                      >
                        <Icone nome="edit" tamanho="s20" />
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="ibtn"
                  data-remover
                  aria-label={`Remover a imagem ${i + 1} de ${n}`}
                  title="Remover"
                  onClick={() => remover(i)}
                >
                  <Icone nome="delete" tamanho="s20" />
                </button>
              </div>
            </li>
          );
        })}
        <li className="tile">
          <button type="button" className="imgzone" data-adicionar disabled={cheio} onClick={() => seletor.current?.click()}>
            <Icone nome={cheio ? 'info' : 'add'} />
            <span className="t-body-sm">{cheio ? `Limite de ${MAXIMO_DE_IMAGENS} imagens atingido` : 'Adicionar imagens'}</span>
          </button>
        </li>
      </ol>
      <input
        ref={seletor}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        data-testid={`${id}-arquivo`}
        data-cy={`${id}-arquivo`}
        onChange={(e) => {
          escolher(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="help" id={idDaAjuda}>
        {ajuda}
      </span>
      <span className="help" id={`${id}-ajuda-alt`}>
        {descricaoObrigatoria
          ? 'Descrição da imagem: uma frase sobre o que aparece na foto. É lida para quem usa leitor de tela.'
          : `Descrição da imagem: uma frase sobre o que aparece na foto. É lida para quem usa leitor de tela. Sem ela, o app lê ${reservaDaDescricao}.`}
      </span>
      {erro && (
        <span className="help err" id={idDoErro}>
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      )}
      <span className="sr" aria-live="polite">
        {anuncio}
      </span>
      {recorte && (
        <DialogoDeRecorte
          imagem={recorte.imagem}
          proposito={proposito}
          rotulo={rotuloDoRecorte(recorte.chave)}
          aoConfirmar={(janela) => void confirmarRecorte(janela)}
          aoFechar={fecharRecorte}
        />
      )}
    </div>
  );
}
