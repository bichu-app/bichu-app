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
  semDestino: 'Registrar um pet achado sem plaquinha vai ser pelo app do Bichu, que chega em breve na App Store e no Google Play.',
  botao: 'Registrar que achei um pet',
};
