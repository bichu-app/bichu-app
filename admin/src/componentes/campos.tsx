import type { Ref } from 'react';

import { CampoDeTexto } from './basicos.tsx';
import {
  cepDosOitoDigitos,
  cepEmOitoDigitos,
  ERRO_AO_SAIR_DO_CEP,
  erraAoSairDoCep,
  LIMITE_DO_CEP,
  mascaraDeCep,
} from '../formato/cep.ts';
import { mascaraDeReais } from '../formato/dinheiro.ts';
import { ERRO_AO_SAIR_DO_EMAIL, erraAoSairDoCampo } from '../formato/email.ts';
import {
  ERRO_AO_SAIR_DO_TELEFONE,
  erraAoSairDoTelefone,
  LIMITE_DO_TELEFONE,
  mascaraDeTelefone,
  telefoneEmE164,
} from '../formato/telefone.ts';

/** Campo de valor monetario em reais. */
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
      modoDeEntrada="decimal"
      semCorrecao
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
 * Campo de e-mail: teclado de e-mail, nenhuma transformacao de texto e conferencia
 * ao sair do campo.
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
        if (erroDeForma && !erraAoSairDoCampo(v)) aoMudarErroDeForma(false);
        aoMudar(v);
      }}
      aoSair={() => aoMudarErroDeForma(erraAoSairDoCampo(valor))}
      tipo="email"
      modoDeEntrada="email"
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

/** Campo de CEP brasileiro: mascara ao digitar, oito digitos no envio. */
export function CampoDeCep({
  id,
  rotulo,
  valor,
  aoMudar,
  aoCompletar,
  erro,
  erroDeForma,
  aoMudarErroDeForma,
  ajuda,
  dataCy,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** Chamado com os oito digitos quando o CEP fica completo. */
  aoCompletar?: (cep: string) => void;
  erro?: string | undefined;
  erroDeForma: boolean;
  aoMudarErroDeForma: (erra: boolean) => void;
  ajuda?: string | undefined;
  dataCy?: string;
}) {
  const mostrado = erro ?? (erroDeForma ? ERRO_AO_SAIR_DO_CEP : undefined);
  return (
    <CampoDeTexto
      id={id}
      rotulo={rotulo}
      valor={valor}
      aoMudar={(v) => {
        if (erroDeForma && !erraAoSairDoCep(v)) aoMudarErroDeForma(false);
        const mascarado = mascaraDeCep(v);
        aoMudar(mascarado);
        const oitoDigitos = cepEmOitoDigitos(mascarado);
        if (oitoDigitos !== null && oitoDigitos !== cepEmOitoDigitos(valor)) {
          aoCompletar?.(oitoDigitos);
        }
      }}
      aoSair={() => aoMudarErroDeForma(erraAoSairDoCep(valor))}
      modoDeEntrada="numeric"
      semCorrecao
      maximo={LIMITE_DO_CEP}
      comoFica={cepEmOitoDigitos(valor) === null ? '' : `Fica ${cepDosOitoDigitos(cepEmOitoDigitos(valor))}.`}
      {...(mostrado !== undefined ? { erro: mostrado } : {})}
      {...(ajuda !== undefined ? { ajuda } : {})}
      {...(dataCy !== undefined ? { dataCy } : {})}
    />
  );
}

/** Campo de telefone brasileiro: mascara ao digitar, E.164 no envio. */
export function CampoDeTelefone({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  erroDeForma,
  aoMudarErroDeForma,
  ajuda,
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
  dataCy?: string;
}) {
  const mostrado = erro ?? (erroDeForma ? ERRO_AO_SAIR_DO_TELEFONE : undefined);
  const e164 = telefoneEmE164(valor);
  return (
    <CampoDeTexto
      id={id}
      rotulo={rotulo}
      valor={valor}
      aoMudar={(v) => {
        if (erroDeForma && !erraAoSairDoTelefone(v)) aoMudarErroDeForma(false);
        aoMudar(mascaraDeTelefone(v));
      }}
      aoSair={() => aoMudarErroDeForma(erraAoSairDoTelefone(valor))}
      tipo="tel"
      modoDeEntrada="tel"
      semCorrecao
      maximo={LIMITE_DO_TELEFONE}
      comoFica={e164 === null ? '' : `Fica ${e164}.`}
      {...(mostrado !== undefined ? { erro: mostrado } : {})}
      {...(ajuda !== undefined ? { ajuda } : {})}
      {...(dataCy !== undefined ? { dataCy } : {})}
    />
  );
}
