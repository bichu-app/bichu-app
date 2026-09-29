// Textos de /verificar-email e /redefinir-senha. Fonte: UX 7.6.1 (C.5), 9.2,
// 12.6 e 23.7, com as correcoes de .jarvis/site-microcopy-revisada.md, secoes
// 2 e 3 (frames 232:*, 233:*). Onde o frame corrigido diverge do print, vale o
// texto corrigido.

export const VERIFICAR_EMAIL = {
  tituloDaPagina: 'Confirmar e-mail',
  descricaoDaPagina: 'Confirme o e-mail da sua conta no Bichu.',
  titulo: 'Confirme seu e-mail',
  texto: 'É por ele que a gente avisa você se alguém encontrar o seu pet.',
  botao: 'Confirmar meu e-mail',
  enviando: 'Confirmando…',
  confirmadoTitulo: 'E-mail confirmado.',
  confirmadoTexto: 'Pode voltar para o app do Bichu.',
  expiradoTitulo: 'Este link expirou.',
  // 233:160 (celular) e 233:254 (desktop): o texto muda com o aparelho, sem botao no desktop.
  expiradoTextoToque: 'Por segurança, o link de confirmação vale 24 horas. Peça um novo pelo app, em Perfil.',
  expiradoTextoMouse: 'Por segurança, o link de confirmação vale 24 horas. Abra o app do Bichu no celular e peça um novo em Perfil.',
  naoConfirmouTitulo: 'Não conseguimos confirmar agora.',
  naoConfirmouTexto: 'Seu e-mail ainda não foi confirmado. Confira a conexão e tente de novo.',
  tentarDeNovo: 'Tentar de novo',
};

export const REDEFINIR_SENHA = {
  tituloDaPagina: 'Criar uma senha nova',
  descricaoDaPagina: 'Crie uma senha nova para a sua conta no Bichu.',
  titulo: 'Criar uma senha nova',
  campo: 'Senha',
  // Versao B da UX 23.3, pedida pelo cliente em 19/09 (a frase da senha curta saiu).
  regra: 'Pelo menos 10 caracteres.',
  mostrar: 'Mostrar a senha',
  esconder: 'Esconder a senha',
  botao: 'Salvar a senha nova',
  enviando: 'Salvando…',
  abaixoDoBotao: 'Ao salvar, você sai de todos os aparelhos onde entrou.',
  // UX 23.7: a frase sai do `errors[].code`, nunca do texto do servidor.
  erros: {
    too_short: 'A senha precisa de pelo menos 10 caracteres.',
    too_long: 'Cabe até 256 caracteres.',
    blank: 'A senha não pode ser só espaços.',
    similar_to_identity: 'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.',
    breached: 'Essa senha já apareceu em vazamentos de outros sites. Escolha outra.',
    desconhecido: 'Essa senha não foi aceita. Escolha outra.',
  },
  naoSalvouTitulo: 'Não conseguimos salvar agora.',
  naoSalvouTexto: 'Sua senha não foi alterada.',
  tentarDeNovo: 'Tentar de novo',
  naoConferiuTitulo: 'Não conseguimos conferir o seu link.',
  naoConferiuTexto: 'Confira a conexão e tente de novo. Nada mudou na sua conta.',
  expiradoTitulo: 'Este link expirou.',
  // C.5 tem o botao "Pedir um link novo", que na web nao tem destino na v1
  // (pedir o link e `requestPasswordReset`, feito pelo app em C.4). O texto diz onde.
  expiradoTexto: 'Por segurança, o link vale 30 minutos. Peça um novo no app do Bichu, em Esqueci minha senha, e ele chega em seguida.',
  alteradaTitulo: 'Senha alterada.',
  // O botao "Entrar" do print nao tem destino na web: entrar e no app.
  alteradaTexto: 'Você já pode entrar no app com a senha nova. Avisamos por e-mail que ela mudou; se não foi você, responda aquele e-mail.',
};

export const COMUM_PUBLICO = {
  espereTitulo: 'Espere um pouco antes de tentar de novo.',
  espereTexto: (espera: string | null) =>
    espera
      ? `Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo em ${espera}.`
      : 'Vieram muitas tentativas deste aparelho nos últimos minutos. Tente de novo daqui a pouco.',
  foraDoArTitulo: 'O Bichu está fora do ar por alguns minutos.',
  foraDoArTexto: 'Já estamos arrumando. Tente de novo daqui a pouco.',
  erroTitulo: 'Algo não saiu como devia.',
  erroTexto: 'Tente de novo daqui a pouco. Se escrever para a gente, mande este código:',
};
