/// A ação `cadastrar_pet` dentro do envelope de 8.3.
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
const String telaDeRetornoDoCadastro = 'F1.5';

/// Monta o envelope a partir do rascunho do assistente.
IntencaoPendente intencaoDeCadastrarPet(
  RascunhoDePet rascunho, {
  required DateTime criadaEm,
  double rolagem = 0,
  int passo = 2,
}) {
  final foto = rascunho.foto;
  return IntencaoPendente(
    acao: AcaoDeIntencao.cadastrarPet,
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
