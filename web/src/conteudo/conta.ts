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
  regra: 'Pelo menos 10 caracteres.',
  mostrar: 'Mostrar a senha',
  esconder: 'Esconder a senha',
  botao: 'Salvar a senha nova',
  enviando: 'Salvando…',
  abaixoDoBotao: 'Ao salvar, você sai de todos os aparelhos onde entrou.',
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
  expiradoTexto: 'Por segurança, o link vale 30 minutos. Peça um novo no app do Bichu, em Esqueci minha senha, e ele chega em seguida.',
  alteradaTitulo: 'Senha alterada.',
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
