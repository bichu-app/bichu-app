/**
 * Os campos do painel que tem forma propria: valor em reais e e-mail.
 *
 * **Um componente por tipo, reusado em todo lugar.** A alternativa -- repetir
 * `modoDeEntrada`, mascara, prefixo e conferencia em cada tela -- e exatamente
 * como este projeto ganhou tres numeros para o mesmo teto de imagem e dois
 * rotulos para a mesma unidade de preco. Aqui existe um lugar.
 *
 * Eles sao finos de proposito: desenham por cima de `CampoDeTexto`
 * (`basicos.tsx`), que continua sendo quem faz rotulo, ajuda, erro,
 * `aria-describedby` e contador.
 */
import type { Ref } from 'react';

import { CampoDeTexto } from './basicos.tsx';
import { mascaraDeReais } from '../formato/dinheiro.ts';
import { ERRO_AO_SAIR_DO_EMAIL, erraAoSairDoCampo } from '../formato/email.ts';

/**
 * Campo de valor monetario em reais.
 *
 * ## O que ele NAO faz, e e o ponto todo
 *
 * **Ele nao muda o que vai para a API.** O valor que ele guarda continua sendo
 * a string do formulario, e quem a transforma em `amount` continua sendo
 * `precoEmCentavos` (Loja) e `centavosDoTexto` (Rede), que devolvem **centavos
 * inteiros**. A mascara mexe no que a pessoa ve: ela normaliza para a
 * gramatica brasileira (`1.234,56`) que os dois leitores ja aceitam, e por
 * isso nenhum valor que entrava antes deixa de entrar.
 *
 * Preco errado em produto e o pior tipo de defeito, porque parece certo. Um
 * campo que "ajuda" convertendo para centavos aqui dentro seria a forma mais
 * curta de corromper preco em silencio.
 *
 * ## O `R$`
 *
 * Fica no rotulo e na linha viva abaixo do campo ("Fica R$ 1.234,56."), e
 * **nunca dentro do valor**: `centavosDoTexto` recusa `R$ 15` de proposito, e
 * um `R$` no valor deixaria o campo do encontro invalido a cada tecla.
 */
export function CampoDeValorEmReais({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  ajuda,
  maximo,
  dataCy,
  autoFoco,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string | undefined;
  ajuda?: string | undefined;
  maximo?: number;
  dataCy?: string;
  autoFoco?: boolean;
}) {
  return (
    <CampoDeTexto
      id={id}
      rotulo={rotulo}
      valor={valor}
      aoMudar={(v) => aoMudar(mascaraDeReais(v))}
      // Teclado numerico com virgula no celular e no tablet; `decimal`, e nao
      // `numeric`, porque `numeric` nao oferece o separador decimal.
      modoDeEntrada="decimal"
      // Zero transformacao de texto num campo de numero.
      semCorrecao
      // A virgula sozinha no fim e estado de quem esta digitando, e nao
      // entra na previa: "Fica R$ 12,." nao e uma frase.
      comoFica={valor.trim() === '' ? '' : `Fica R$ ${valor.replace(/,$/, '')}.`}
      {...(erro !== undefined ? { erro } : {})}
      {...(ajuda !== undefined ? { ajuda } : {})}
      {...(maximo !== undefined ? { maximo } : {})}
      {...(dataCy !== undefined ? { dataCy } : {})}
      {...(autoFoco !== undefined ? { autoFoco } : {})}
    />
  );
}

/**
 * Campo de e-mail: teclado de e-mail, nenhuma transformacao de texto e
 * conferencia ao sair do campo.
 *
 * **Nao tem mascara**, e isso e decisao: a parte local do RFC 5321 aceita
 * ponto, `+`, `_` e `-`, entao qualquer mascara ou recusa endereco valido ou
 * nao recusa nada. O que [formato/email.ts] documenta e o que vale.
 *
 * O erro de forma e **local** e vive em [erroDeForma]: ele aparece ao sair do
 * campo e sai sozinho quando o endereco volta a ser plausivel. O erro de
 * credencial ou de servidor vem em [erro] e **ganha a frente**, porque ele
 * sabe mais: "Confira o e-mail" por cima de "E-mail ou senha incorretos"
 * esconderia a unica informacao nova da tela.
 */
export function CampoDeEmail({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  erroDeForma,
  aoMudarErroDeForma,
  ajuda,
  autoComplete,
  somenteLeitura,
  referencia,
  dataCy,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string | undefined;
  erroDeForma: boolean;
  aoMudarErroDeForma: (erra: boolean) => void;
  ajuda?: string | undefined;
  autoComplete?: string;
  somenteLeitura?: boolean;
  referencia?: Ref<HTMLInputElement>;
  dataCy?: string;
}) {
  const mostrado = erro ?? (erroDeForma ? ERRO_AO_SAIR_DO_EMAIL : undefined);
  return (
    <CampoDeTexto
      id={id}
      rotulo={rotulo}
      valor={valor}
      aoMudar={(v) => {
        // O erro de forma sai assim que o endereco fica plausivel de novo, sem
        // esperar outro blur: erro que sobrevive a correcao e o defeito que a
        // secao 13 de UX proibe. Ele nao NASCE enquanto se digita, so morre.
        if (erroDeForma && !erraAoSairDoCampo(v)) aoMudarErroDeForma(false);
        aoMudar(v);
      }}
      aoSair={() => aoMudarErroDeForma(erraAoSairDoCampo(valor))}
      tipo="email"
      modoDeEntrada="email"
      // Sem correcao automatica, sem maiuscula automatica e sem corretor: no
      // celular a maiuscula automatica e a causa numero um de `Leandro@...`
      // num campo de e-mail.
      semCorrecao
      {...(mostrado !== undefined ? { erro: mostrado } : {})}
      {...(ajuda !== undefined ? { ajuda } : {})}
      {...(autoComplete !== undefined ? { autoComplete } : {})}
      {...(somenteLeitura !== undefined ? { somenteLeitura } : {})}
      {...(referencia !== undefined ? { referencia } : {})}
      {...(dataCy !== undefined ? { dataCy } : {})}
    />
  );
}
