/// A ação `cadastrar_pet` dentro do envelope de 8.3.
///
/// É a **única das seis ações de 8.3 que este build sabe executar**, porque é
/// a única cujo fluxo inteiro existe em código hoje: o assistente de F1.3 a
/// F1.5, o `POST /pets` e a tela de resultado F1.6. As outras cinco
/// (`marcar_perdido`, `registrar_achado`, `responder_conversa`,
/// `encerrar_caso`, `gerar_tag`) entram aqui quando as telas delas entrarem —
/// o envelope já as aceita, e a guarda já sabe o que fazer com uma ação sem
/// executor registrado.
///
/// O que este arquivo demonstra, e que é o ponto da regra 3, é a diferença
/// entre executar e navegar: depois do login, o pet é **criado**, e a pessoa
/// chega em F1.6 com o pet dela na tela. Ela não volta para F1.5 para tocar em
/// `Cadastrar` de novo.
library;

import '../api/api_client.dart';
import '../api/mensagens_de_erro.dart';
import '../api/modelos_pet.dart';
import '../api/pets_api.dart';
import '../dispositivo/camera_e_galeria.dart';
import '../roteamento/rotas.dart';
import '../telas/pet/rascunho_de_pet.dart';
import '../telas/pet/resultado_do_cadastro.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de UX para onde o cadastro volta quando a criação falha.
///
/// F1.5 e não F1.3: é a tela do último passo, onde o botão foi tocado, e é
/// onde a faixa de erro faz sentido. Voltar para o primeiro passo obrigaria a
/// pessoa a atravessar o assistente inteiro de novo.
const String telaDeRetornoDoCadastro = 'F1.5';

/// Monta o envelope a partir do rascunho do assistente.
///
/// **A foto vai por caminho** (`FotoLocal.caminho`), e é por isso que este
/// envelope continua com alguns bytes de JSON mesmo quando a pessoa fotografou
/// um animal com a câmera de 48 MP do aparelho dela.
IntencaoPendente intencaoDeCadastrarPet(
  RascunhoDePet rascunho, {
  required DateTime criadaEm,
  double rolagem = 0,
  int passo = 2,
}) {
  final foto = rascunho.foto;
  return IntencaoPendente(
    acao: AcaoDeIntencao.cadastrarPet,
    // Nulo: o alvo desta ação é o pet, e ele só passa a existir quando ela
    // executa. É o mesmo caso do achado avulso do exemplo de 8.3.
    alvo: null,
    telaDeRetorno: telaDeRetornoDoCadastro,
    criadaEm: criadaEm,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{
        'nome': rascunho.nome,
        'especie': rascunho.especie?.valor,
        'porte': rascunho.porte?.valor,
        'sexo': rascunho.sexo?.valor,
        'breed_code': rascunho.breedCode,
        'breed_free_text': rascunho.breedFreeText,
        'ref_data_version': rascunho.refDataVersion,
        'cor_principal': rascunho.corPrincipalCodigo,
        'segunda_cor': rascunho.segundaCorCodigo,
        'sinais_particulares': rascunho.sinaisParticulares,
        'cuidados': rascunho.cuidados,
      },
      fotos: <FotoDaIntencao>[
        if (foto != null)
          FotoDaIntencao(
            caminho: foto.caminho,
            tipoDeConteudo: foto.tipoDeConteudo,
            tamanhoEmBytes: foto.tamanhoEmBytes,
          ),
      ],
      posicaoNaTela: PosicaoNaTela(rolagem: rolagem, passo: passo),
    ),
  );
}

/// Reconstrói o rascunho do assistente a partir do envelope.
///
/// É o que faz a tela de retorno abrir preenchida em vez de em branco. O
/// `ChangeNotifier` é novo, e não o de antes do login: o anterior morreu junto
/// com o processo, que é a situação que o envelope cobre.
RascunhoDePet rascunhoDoEnvelope(IntencaoPendente intencao) {
  final campos = intencao.rascunho.campos;
  String? texto(String chave) => campos[chave] as String?;

  final rascunho = RascunhoDePet()
    ..nome = texto('nome') ?? ''
    ..especie = Especie.de(texto('especie'))
    ..porte = Porte.de(texto('porte'))
    ..sexo = Sexo.de(texto('sexo'))
    ..breedCode = texto('breed_code')
    ..breedFreeText = texto('breed_free_text') ?? ''
    ..refDataVersion = texto('ref_data_version')
    ..corPrincipalCodigo = texto('cor_principal')
    ..segundaCorCodigo = texto('segunda_cor')
    ..sinaisParticulares = texto('sinais_particulares') ?? ''
    ..cuidados = texto('cuidados') ?? '';

  final fotos = intencao.rascunho.fotos;
  if (fotos.isNotEmpty) {
    final foto = fotos.first;
    // O arquivo continua no disco: o envelope guardou o endereço dele, e é
    // esse endereço que volta para o rascunho. Nenhum byte de imagem
    // atravessou a serialização.
    rascunho.foto = FotoLocal(
      caminho: foto.caminho,
      tipoDeConteudo: foto.tipoDeConteudo,
      tamanhoEmBytes: foto.tamanhoEmBytes,
    );
  }
  return rascunho;
}

/// O que a tela de retorno recebe quando a execução falha: o rascunho
/// recarregado **e** o erro explicado (regra 4 de 8.3).
class RetomadaDoCadastro {
  const RetomadaDoCadastro({required this.rascunho, this.erro});

  final RascunhoDePet rascunho;
  final MensagemDeErro? erro;
}

/// Registra `cadastrar_pet` na guarda.
AcaoExecutavel cadastroDePetExecutavel(PetsApi pets) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final rascunho = rascunhoDoEnvelope(intencao);
      final pet = await pets.cadastrarPet(
        nome: rascunho.nome,
        especie: rascunho.especie!,
        porte: rascunho.porte!,
        // A chave nasce aqui, na execução, e não no envelope: uma chave
        // gravada em disco seria reapresentada por um envelope que o servidor
        // já aceitou e devolveria um cadastro antigo como se fosse novo. Com
        // envelope apagado ao executar, cada envelope produz no máximo uma
        // criação — e o reenvio depois de `FalhaDeTempo` é da tela de retorno,
        // que tem a chave dela.
        idempotencyKey: ApiClient.novaChaveDeIdempotencia(),
        breedCode: rascunho.breedCode,
        breedFreeText: rascunho.breedFreeTextParaEnvio,
        refDataVersion: rascunho.refDataVersion,
        corPrincipalCodigo: rascunho.corPrincipalCodigo,
        segundaCorCodigo: rascunho.segundaCorCodigo,
        sexo: rascunho.sexo,
        sinaisParticulares: rascunho.sinaisParticulares,
        cuidados: rascunho.cuidados,
      );
      return ResultadoDaExecucao(
        rota: Rotas.petCadastrado,
        extra: ResultadoDoCadastro(pet: pet, fotoPendente: rascunho.foto),
      );
    },
    retomar: (intencao, erro) => RetomadaDoCadastro(
      rascunho: rascunhoDoEnvelope(intencao),
      erro: erro,
    ),
  );
}
