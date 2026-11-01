import { Icone } from '../componentes/Icone.tsx';
import { imagensDa, type Indicacao } from './fila.ts';

/**
 * O quadrado da LINHA: a logo quando ha, o icone quando nao. Nunca um `img` com
 * `src` vazio, que o navegador pinta como imagem quebrada.
 */
export function LogoDaIndicacao({ indicacao: i }: { indicacao: Indicacao }) {
  const { logo } = imagensDa(i);
  return (
    <span className="thumb" data-cy="logo-da-indicacao">
      {logo === null ? (
        <Icone nome="image" tamanho="s20" />
      ) : (
        <img src={logo} alt="" loading="lazy" width={48} height={48} />
      )}
    </span>
  );
}

/**
 * O BLOCO DO DIALOGO: onde quem revisa julga antes de aprovar ou recusar.
 *
 * As fotos saem em `card` (1024 x 576) porque e o tamanho em que se decide se
 * aquilo e mesmo o estabelecimento -- a `thumb` da linha nao serve para julgar,
 * e a `banner` e da ficha publica, que estas imagens nunca alcancam.
 */
export function ImagensDaIndicacao({ indicacao: i }: { indicacao: Indicacao }) {
  const { logo, prontas, processando, temAlgo } = imagensDa(i);

  return (
    <section className="ind-imgs" data-cy="imagens-da-indicacao">
      <h4 className="t-label c-sec ind-imgs-tit">Imagens enviadas</h4>

      {!temAlgo ? (
        <p className="ind-sem-img t-body-sm" data-cy="indicacao-sem-imagem">
          Esta indicação não tem imagens. Quem indica um profissional ou um
          estabelecimento raramente tem o arquivo da logo ou fotos do lugar — a
          indicação pode ser aprovada sem elas.
        </p>
      ) : (
        <>
          <p className="ind-imgs-logo">
            <span className="thumb">
              {logo === null ? (
                <Icone nome="image" tamanho="s20" />
              ) : (
                <img src={logo} alt={`Logotipo enviado na indicação de ${i.display_name}`} width={48} height={48} />
              )}
            </span>
            <span className="t-body-sm c-sec">{logo === null ? 'Sem logotipo' : 'Logotipo'}</span>
          </p>

          {prontas.length > 0 && (
            <ul className="ind-fotos">
              {prontas.map((url, n) => (
                <li key={url} className="ind-foto">
                  <span className="ind-foto-n t-caption">{n + 1}</span>
                  <img src={url} alt={`Foto ${String(n + 1)} do estabelecimento indicado`} loading="lazy" />
                </li>
              ))}
            </ul>
          )}

          {processando > 0 && (
            <p className="ind-proc t-body-sm" data-cy="indicacao-processando">
              <Icone nome="schedule" tamanho="s20" />
              <span>
                <strong>
                  {processando === 1
                    ? 'Mais 1 foto ainda está sendo processada.'
                    : `Mais ${String(processando)} fotos ainda estão sendo processadas.`}
                </strong>{' '}
                Esta indicação tem {String(i.photos_total)}{' '}
                {i.photos_total === 1 ? 'foto' : 'fotos'}; {String(prontas.length)}{' '}
                {prontas.length === 1 ? 'ficou pronta' : 'ficaram prontas'}. As que faltam aparecem
                aqui quando o processamento terminar — atualize a fila em alguns minutos se quiser
                vê-las antes de decidir.
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
