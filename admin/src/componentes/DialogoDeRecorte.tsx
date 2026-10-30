import { useEffect, useRef, useState } from 'react';

import { DIMENSAO_MINIMA, type Proposito } from './envio-de-imagem.ts';
import { Dialogo } from './Dialogo.tsx';
import { Icone } from './Icone.tsx';
import {
  ENQUADRAMENTO_INICIAL,
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  janelaEmPixels,
  PASSO_DA_ESCALA,
  PASSO_DA_SETA,
  PROPORCAO_DA_MOLDURA,
  regiaoEnquadrada,
  tamanhoDoEnvio,
  type Enquadramento,
  type ImagemParaRecorte,
  type Janela,
} from './recorte-de-imagem.ts';

/** A largura em pixeis do desenho do palco. */
const LARGURA_DO_PALCO = 560;

export interface PropsDoDialogoDeRecorte {
  imagem: ImagemParaRecorte;
  proposito: Proposito;
  /**
   * O nome do que se esta enquadrando, para o titulo e os rotulos ("Logo", "Imagem 2
   * de 5").
   */
  rotulo: string;
  aoConfirmar: (janela: Janela) => void;
  aoFechar: () => void;
}

/** RECORTAR E REPOSICIONAR (BICHUS-314, cliente 28 e 29/10/2026). */
export function DialogoDeRecorte({ imagem, proposito, rotulo, aoConfirmar, aoFechar }: PropsDoDialogoDeRecorte) {
  const [enquadramento, setEnquadramento] = useState<Enquadramento>(ENQUADRAMENTO_INICIAL);
  const palco = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ x: number; y: number; de: Enquadramento } | null>(null);

  const proporcao = PROPORCAO_DA_MOLDURA[proposito] ?? imagem.largura / imagem.altura;
  const regiao = regiaoEnquadrada(imagem, PROPORCAO_DA_MOLDURA[proposito], enquadramento);
  const janela = janelaEmPixels(regiao, imagem.largura, imagem.altura);
  const envio = tamanhoDoEnvio(janela);
  const minima = DIMENSAO_MINIMA[proposito];
  const curta = envio.largura < minima.largura || envio.altura < minima.altura;

  const alturaDoPalco = Math.max(1, Math.round(LARGURA_DO_PALCO / proporcao));

  useEffect(() => {
    const canvas = tela.current;
    const pincel = canvas?.getContext('2d');
    if (!canvas || !pincel) return;
    pincel.clearRect(0, 0, canvas.width, canvas.height);
    pincel.drawImage(imagem.fonte, janela.left, janela.top, janela.width, janela.height, 0, 0, canvas.width, canvas.height);
  }, [imagem, janela.left, janela.top, janela.width, janela.height]);

  function mover(dx: number, dy: number) {
    setEnquadramento((e) => ({ ...e, centroX: e.centroX + dx, centroY: e.centroY + dy }));
  }

  function zoom(escala: number) {
    setEnquadramento((e) => ({ ...e, escala: Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, escala)) }));
  }

  function aoTeclar(evento: React.KeyboardEvent) {
    const passos: Record<string, [number, number]> = {
      ArrowLeft: [-PASSO_DA_SETA * regiao.w, 0],
      ArrowRight: [PASSO_DA_SETA * regiao.w, 0],
      ArrowUp: [0, -PASSO_DA_SETA * regiao.h],
      ArrowDown: [0, PASSO_DA_SETA * regiao.h],
    };
    const passo = passos[evento.key];
    if (!passo) return;
    evento.preventDefault();
    mover(passo[0], passo[1]);
  }

  const idDaAjuda = 'recorte-ajuda';
  const idDoAviso = 'recorte-aviso';

  return (
    <Dialogo titulo={`Enquadrar ${rotulo}`} papel="dialog" largo aoFechar={aoFechar} descricaoId={idDaAjuda}>
      <p className="t-body-sm c-sec" id={idDaAjuda}>
        O que fica dentro da moldura é o que é enviado. Arraste a imagem para reposicionar, ou use as setas do teclado; o zoom
        aproxima.
      </p>
      <div
        ref={palco}
        className="recorte-palco"
        style={{ aspectRatio: `${String(LARGURA_DO_PALCO)} / ${String(alturaDoPalco)}` }}
        tabIndex={0}
        role="application"
        data-foco-inicial
        data-testid="recorte-palco"
        aria-label={`Enquadramento de ${rotulo}. Use as setas para reposicionar.`}
        aria-describedby={idDaAjuda}
        onKeyDown={aoTeclar}
        onPointerDown={(e) => {
          arrasto.current = { x: e.clientX, y: e.clientY, de: enquadramento };
          palco.current?.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const de = arrasto.current;
          const largura = palco.current?.clientWidth ?? 0;
          const altura = palco.current?.clientHeight ?? 0;
          if (!de || largura === 0 || altura === 0) return;
          setEnquadramento({
            escala: de.de.escala,
            centroX: de.de.centroX - ((e.clientX - de.x) / largura) * regiao.w,
            centroY: de.de.centroY - ((e.clientY - de.y) / altura) * regiao.h,
          });
        }}
        onPointerUp={(e) => {
          arrasto.current = null;
          palco.current?.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          arrasto.current = null;
        }}
      >
        <canvas ref={tela} width={LARGURA_DO_PALCO} height={alturaDoPalco} data-testid="recorte-tela" />
        <span className="recorte-grade" aria-hidden="true" />
      </div>

      <div className="recorte-zoom">
        <button
          type="button"
          className="ibtn"
          aria-label="Diminuir o zoom"
          disabled={enquadramento.escala <= ESCALA_MINIMA}
          onClick={() => zoom(enquadramento.escala - PASSO_DA_ESCALA)}
        >
          <Icone nome="remove" tamanho="s20" />
        </button>
        <input
          className="input"
          type="range"
          data-testid="recorte-zoom"
          min={ESCALA_MINIMA * 100}
          max={ESCALA_MAXIMA * 100}
          step={PASSO_DA_ESCALA * 100}
          value={Math.round(enquadramento.escala * 100)}
          aria-label="Zoom"
          aria-valuetext={`${String(Math.round(enquadramento.escala * 100))} por cento`}
          onChange={(e) => zoom(Number(e.target.value) / 100)}
        />
        <button
          type="button"
          className="ibtn"
          aria-label="Aumentar o zoom"
          disabled={enquadramento.escala >= ESCALA_MAXIMA}
          onClick={() => zoom(enquadramento.escala + PASSO_DA_ESCALA)}
        >
          <Icone nome="add" tamanho="s20" />
        </button>
      </div>

      <span className="help" data-testid="recorte-medida">
        O recorte sai com {envio.largura} × {envio.altura} pixels.
      </span>
      {curta && (
        <span className="help err" id={idDoAviso}>
          <Icone nome="error" tamanho="s20" />O recorte precisa de pelo menos {minima.largura} × {minima.altura} pixels.
          Diminua o zoom ou escolha outra imagem.
        </span>
      )}

      <div className="acoes">
        <button type="button" className="btn sec" onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn pri"
          data-cy="recorte-confirmar"
          disabled={curta}
          {...(curta ? { 'aria-describedby': idDoAviso } : {})}
          onClick={() => {
            aoConfirmar(janela);
          }}
        >
          Usar este enquadramento
        </button>
      </div>
    </Dialogo>
  );
}
