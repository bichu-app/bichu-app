// Textos de /t/{code}. Fonte: UX 12.1 e 12.5 (docs/05-ux-research.md) com as
// correcoes de .jarvis/site-microcopy-revisada.md, secao 1 (frames 227:15,
// 227:61, 227:75, 228:31, 230:100). Onde o frame corrigido diverge do print, vale
// o texto corrigido.
//
// O contrato nao traz o sexo do pet em `TagResolution`, entao as frases com o
// nome evitam artigo ("o Thor"/"a Nina"): "de Thor", "com Thor". Ver o relatorio.

export const TAG = {
  tituloDaPagina: 'Avisar o tutor',
  descricaoDaPagina: 'Achou um pet com a plaquinha do Bichu? Avise o tutor com um toque.',

  // 200
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

  // 201: F4.2, frames 227:15 e 230:100 corrigidos
  avisadoTitulo: (nome: string | null) => (nome ? `Pronto. O tutor de ${nome} foi avisado.` : 'Pronto. O tutor foi avisado.'),
  avisadoTexto: 'Ele recebe o aviso agora. Você pode ir embora.',
  conviteApp: 'O Bichu também tem app, para acompanhar a resposta do tutor e proteger o seu pet.',

  // 429 do POST: UX 12.5, situacao 2 (o aviso foi recebido; o contrato manda confirmar)
  recebidoTitulo: 'Recebemos o seu aviso.',
  recebidoTexto: 'Vamos avisar o tutor. Você pode ir embora.',
  emPerigo: 'Se o animal estiver machucado ou em perigo agora, procure uma clínica veterinária ou a autoridade local da sua cidade.',

  // falha do POST: 227:61, aprovado sem mudanca
  naoAvisouTitulo: 'Não conseguimos avisar o tutor.',
  naoAvisouTexto: 'Isso é problema nosso, não seu.',
  guardeEndereco: 'Para tentar mais tarde, guarde este endereço:',
  tentarDeNovo: 'Tentar de novo',

  // falha do GET: 227:75 corrigido
  naoAbriuTitulo: 'Não conseguimos abrir os dados deste pet.',
  naoAbriuTexto: 'Confira a conexão e tente de novo. Se não der, tire uma foto da plaquinha: com ela você abre esta página depois.',

  // 500 identificado: UX 12.6, `internal`
  foraDoArTitulo: 'O Bichu está fora do ar por alguns minutos.',
  foraDoArTexto: 'Já estamos arrumando. Tente de novo daqui a pouco.',

  // 400: 228:31, aprovado sem mudanca
  malformadoTitulo: 'Confira o código.',
  malformadoTexto: 'Parece que faltou alguma coisa, ou entrou um caractere a mais. O código está impresso embaixo do QR, na plaquinha.',
  campoCodigo: 'Código da tag',
  ajudaCodigo: 'Pode digitar com ou sem hífen, em maiúscula ou minúscula. Se confundir I com 1 ou O com 0, a gente entende.',
  botaoProcurar: 'Procurar este código',

  // 404 e 410 (UX 12.4 e ADR-0004)
  inexistenteTitulo: 'Esse código não é de nenhuma tag do Bichu.',
  inexistenteTexto: 'Confira se a plaquinha é do Bichu. Se for de outro serviço, o código não abre aqui.',
  desativadaTitulo: 'Esta tag foi desativada pelo tutor.',

  // 429 do GET: UX 12.6, `rate-limited`, com a espera do Retry-After
  espereTitulo: 'Espere um pouco antes de tentar de novo.',
  espereTexto: (espera: string | null) =>
    espera
      ? `Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo em ${espera}.`
      : 'Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo daqui a pouco.',
};

// A saida comum das telas 400, 404, 410 e 429 (UX F4.5). Na v1 ela nao tem
// destino na web: o achado sem plaquinha depende da ADR-0030. O componente
// RegistrarAchado isola isto para a troca da v2.
export const REGISTRAR_ACHADO = {
  titulo: 'Se você está com um animal agora, não precisa do código.',
  // Texto honesto da v1: sem botao, porque nao ha para onde levar.
  semDestino: 'Registrar um pet achado sem plaquinha vai ser pelo app do Bichu, que chega em breve na App Store e no Google Play.',
  // v2: rotulo do botao quando houver destino.
  botao: 'Registrar que achei um pet',
};
