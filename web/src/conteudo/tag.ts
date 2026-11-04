import consentimento from './consentimento-do-achador.json';

/**
 * O texto do consentimento, e a versão dele, como a tela os exibe.
 *
 * **A FONTE é o servidor** (`src/modules/found/domain/consentimento-de-contato.ts`):
 * é ele que grava o texto no registro, resolvendo-o a partir da versão que esta
 * tela manda. Este arquivo é a cópia exibida, e
 * `make verificar-texto-do-consentimento` prova que as duas são iguais byte a
 * byte — se divergirem, o registro afirma que a pessoa leu o que ela não leu.
 */
export const CONSENTIMENTO_DO_ACHADOR = {
  versao: consentimento.versao,
  texto: consentimento.texto,
};

export const TAG = {
  tituloDaPagina: 'Avisar o tutor',
  descricaoDaPagina: 'Achou um pet com a plaquinha do Bichu? Avise o tutor com um toque.',

  perdidoTitulo: 'Este pet está perdido',
  perdidoTexto: (nome: string, desde: string | null) =>
    desde ? `O tutor está procurando ${nome} ${desde}.` : `O tutor está procurando ${nome}.`,
  semFoto: 'Este pet não tem foto cadastrada. Confira os sinais abaixo.',
  altFoto: (nome: string) => `Foto de ${nome}, cadastrada pelo tutor.`,
  cuidadosTitulo: (nome: string) => `Cuidados com ${nome}`,
  cuidadosAtribuicao: (nome: string) => `O tutor de ${nome} escreveu:`,
  garantiaContato: 'O tutor recebe seu aviso sem que você veja telefone nem endereço.',
  botaoAvisar: 'Avisar o tutor',
  botaoAvisarDeNovo: 'Avisar o tutor de novo',
  enviando: 'Avisando o tutor…',
  abaixoDoBotao: 'É um toque. Você não precisa se cadastrar.',

  // O CONTATO DE QUEM ACHOU, sob consentimento (decisao do cliente, 03/11/2026).
  //
  // Tudo aqui vive DENTRO do ramo `estaPerdido`, junto do botao de avisar: sem
  // pet perdido nao ha aviso, e sem aviso nao ha a quem mandar contato. Os dois
  // casos de e2e do PR 162 afirmam que `input[type=email]`, `input[type=tel]` e
  // `textarea` somam ZERO no estado nao perdido, e e assim que tem de continuar.
  //
  // O `<details>` e deliberado, e nao enfeite: ele fecha a secao SEM JavaScript,
  // preservando "e um toque" para quem so quer avisar e ir embora. Quem quer ser
  // chamado abre, preenche e marca -- e quem nao quer nem ve os campos.
  contatoResumo: 'Quer que o tutor fale com você? (opcional)',
  contatoTexto:
    'Você não precisa deixar nada: o aviso chega ao tutor do mesmo jeito, e ele responde pela conversa do Bichu.',
  campoNomeDoAchador: 'Seu nome',
  campoEmailDoAchador: 'Seu e-mail',
  campoTelefoneDoAchador: 'Seu telefone',
  ajudaTelefoneDoAchador: 'Com DDD. Por exemplo: 11 91234-5678.',
  campoRecado: 'Recado para o tutor',
  ajudaRecado:
    'Onde você está com ele e como ele está. Telefone, e-mail e endereço escritos aqui são retirados — para isso existem os campos acima.',
  consentimentoRotulo: 'Aceito compartilhar meus dados com o tutor do pet',
  // A finalidade, escrita junto da caixinha. Nao e o texto do registro -- o
  // texto do registro e `CONSENTIMENTO_DO_ACHADOR.texto`, exibido logo abaixo.
  consentimentoFinalidade: 'Para quê: o tutor entrar em contato com você e recuperar o pet. Mais nada.',
  erroConsentimento:
    'Marque "Aceito compartilhar meus dados com o tutor do pet" para ele receber seu e-mail e telefone — ou apague os dois campos e avise sem eles.',
  erroTelefoneDoAchador: 'Confira o telefone: precisa do DDD e do número.',
  erroContatoVazio: 'Preencha seu e-mail ou seu telefone, senão não há contato para o tutor usar.',
  // Depois de avisar COM consentimento. Nao ha como desfazer, e a tela nao
  // oferece um desfazer que o produto nao tem.
  avisadoComContato: 'O tutor recebeu seu contato junto do aviso, e pode falar com você.',
  avisadoSemContato:
    'O tutor foi avisado, mas não conseguimos enviar o seu contato. Ele ainda pode responder pela conversa do Bichu.',

  // O pet existe, a tag vale, e o tutor NAO marcou o pet como perdido: aqui nao
  // ha aviso para enviar, e e por isso que o botao sai da pagina. Mas quem
  // escaneou a plaquinha pode ser justamente quem achou o animal ANTES de o
  // tutor perceber que ele saiu -- entao a pagina precisa dizer o que fazer, e
  // nao ficar sem acao nenhuma.
  naoPerdidoTitulo: 'Este pet não está marcado como perdido.',
  naoPerdidoTexto: (nome: string) =>
    `O tutor de ${nome} não avisou que ele saiu de casa. Por isso não há aviso para enviar daqui.`,
  naoPerdidoSeParecer: (nome: string) =>
    `Se ${nome} parece perdido, fique com ele em um lugar seguro e abra esta página de novo: quando o tutor marcar ${nome} como perdido, o botão de avisar aparece aqui.`,
  naoPerdidoEndereco: 'Para abrir esta página de novo, guarde este endereço:',

  avisadoTitulo: (nome: string | null) => (nome ? `Pronto. O tutor de ${nome} foi avisado.` : 'Pronto. O tutor foi avisado.'),
  avisadoTexto: 'Ele recebe o aviso agora. Você pode ir embora.',
  conviteApp: 'O Bichu também tem app, para acompanhar a resposta do tutor e proteger o seu pet.',

  recebidoTitulo: 'Recebemos o seu aviso.',
  recebidoTexto: 'Vamos avisar o tutor. Você pode ir embora.',
  emPerigo: 'Se o animal estiver machucado ou em perigo agora, procure uma clínica veterinária ou a autoridade local da sua cidade.',

  naoAvisouTitulo: 'Não conseguimos avisar o tutor.',
  naoAvisouTexto: 'Isso é problema nosso, não seu.',
  guardeEndereco: 'Para tentar mais tarde, guarde este endereço:',
  tentarDeNovo: 'Tentar de novo',

  naoAbriuTitulo: 'Não conseguimos abrir os dados deste pet.',
  naoAbriuTexto: 'Confira a conexão e tente de novo. Se não der, tire uma foto da plaquinha: com ela você abre esta página depois.',

  foraDoArTitulo: 'O Bichu está fora do ar por alguns minutos.',
  foraDoArTexto: 'Já estamos arrumando. Tente de novo daqui a pouco.',

  malformadoTitulo: 'Confira o código.',
  malformadoTexto: 'Parece que faltou alguma coisa, ou entrou um caractere a mais. O código está impresso embaixo do QR, na plaquinha.',
  campoCodigo: 'Código da tag',
  ajudaCodigo: 'Pode digitar com ou sem hífen, em maiúscula ou minúscula. Se confundir I com 1 ou O com 0, a gente entende.',
  botaoProcurar: 'Procurar este código',

  inexistenteTitulo: 'Esse código não é de nenhuma tag do Bichu.',
  inexistenteTexto: 'Confira se a plaquinha é do Bichu. Se for de outro serviço, o código não abre aqui.',
  desativadaTitulo: 'Esta tag foi desativada pelo tutor.',

  espereTitulo: 'Espere um pouco antes de tentar de novo.',
  espereTexto: (espera: string | null) =>
    espera
      ? `Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo em ${espera}.`
      : 'Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo daqui a pouco.',
};

export const REGISTRAR_ACHADO = {
  titulo: 'Se você está com um animal agora, não precisa do código.',
  // Aqui "em breve" NAO era ressalva de loja: e o fato de que registrar achado
  // sem plaquinha ainda nao existe. O fato fica; a formula das lojas sai.
  semDestino: 'Registrar um pet achado sem plaquinha vai ser pelo app do Bichu. Por aqui, ainda não dá.',
  botao: 'Registrar que achei um pet',
};
