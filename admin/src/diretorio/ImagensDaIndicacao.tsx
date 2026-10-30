/**
 * AS IMAGENS DA INDICACAO, so para OLHAR.
 *
 * Nada aqui envia, recorta, reordena ou remove: as `Galeria` e `CampoDeImagem`
 * do painel sao EDITORES -- exigem `enviar`, `aoMudar` e um `proposito`, e
 * carregam a maquina de estados do upload. Aqui as imagens ja existem, ja
 * passaram pelo worker e chegam como URL de derivada publica na resposta. Usar
 * o editor para mostrar o que nao se edita custaria a maquina de upload inteira
 * numa tela que so le.
 *
 * O que se REUSA sao as pecas certas: a classe `.thumb` do quadrado de 48 px da
 * lista de produtos, e o `Icone nome="image"` que os dois editores ja desenham
 * quando nao ha previa.
 */
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
        // SEM IMAGEM: caso legitimo e comum -- quem indica a clinica do bairro
        // raramente tem o arquivo da logo dela. Dito com palavra, nao com buraco.
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
            // PROCESSANDO: `photos_total` maior que a lista. Dito na tela, com o
            // numero -- o revisor precisa saber que falta imagem para ver, e nao
            // que o lugar mandou pouco.
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
