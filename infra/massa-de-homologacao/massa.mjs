/* global process */
/**
 * O CONTEUDO da massa de homologacao, e so ele. Nada aqui escreve.
 *
 * ===========================================================================
 * POR QUE O CONTEUDO MORA SEPARADO DE QUEM ESCREVE
 * ===========================================================================
 * `criar.mjs` escreve e `remover.mjs` apaga, e os dois precisam concordar sobre
 * O QUE e massa. Se o conteudo vivesse dentro de quem escreve, a remocao teria
 * de redescobri-lo por padrao de texto -- e `DELETE ... LIKE '%teste%'` e como
 * se apaga dado alheio sem perceber. A remocao deste conjunto e feita pelo
 * MANIFESTO (identificadores), e este arquivo so existe para a criacao ser
 * deterministica e revisavel.
 *
 * ===========================================================================
 * A MARCACAO E EM TRES FORMAS INDEPENDENTES, E CADA UMA COBRE UMA FALHA
 * ===========================================================================
 * 1. **VISIVEL** -- o prefixo `[teste]` em todo texto que chega na tela
 *    (`display_name` da conta, nome do pet, titulo do encontro, nome do
 *    profissional, titulo do item da Loja, corpo das mensagens). Cobre o olho
 *    humano: quem abre o aplicativo reconhece a massa no primeiro relance, sem
 *    consultar nada. NAO cobre a remocao -- texto muda, e o cliente pode
 *    renomear um registro enquanto navega.
 *
 * 2. **ESTRUTURAL, SEM DEPENDER DE TEXTO** -- tres marcas que nao estao na
 *    tela e nao se editam por engano:
 *    a) e-mail em `@exemplo-de-teste.invalid`. `.invalid` e reservado pela
 *       RFC 6761 e NAO RESOLVE em DNS nenhum, nunca: nenhuma destas contas
 *       pode receber mensagem, e nenhum endereco de pessoa de verdade pode
 *       colidir com um destes. Cobre o pior acidente possivel -- massa de
 *       teste mandando e-mail para alguem.
 *    b) apelido (`handles.handle`) com o prefixo `massateste`, e `slug` com o
 *       prefixo `massateste-`. Sao chaves UNICAS do banco: duas linhas nao
 *       podem disputar o mesmo valor, entao a marca e inviolavel por
 *       construcao.
 *    c) UMA linha em `audit.events` com a identidade do lote e a contagem por
 *       tabela. `audit.events.actor_user_id` NAO tem chave estrangeira para
 *       `users` (migracao 20260917000004, de proposito): a linha do lote
 *       SOBREVIVE ao expurgo das contas, entao ela continua respondendo "o que
 *       foi este lote" depois de a massa sair.
 *
 * 3. **O MANIFESTO** -- `MANIFESTO-<lote>.json`, versionado no repositorio,
 *    com TODO identificador criado, por tabela, na ordem de remocao segura.
 *    E por ele que `remover.mjs` apaga. E a unica das tres formas que da uma
 *    remocao exata: as duas primeiras identificam, e so esta ENUMERA.
 *
 * ===========================================================================
 * O QUE ESTA MASSA DELIBERADAMENTE NAO CRIA
 * ===========================================================================
 * Nenhum bloqueio (`user_blocks`), nenhuma conexao (`user_connections`) e
 * nenhuma denuncia (`profile_reports`, `photo_reports`, `publication_reports`,
 * `professional_review_reports`, `conversation_reports`).
 *
 * Nao e economia: as duas pontas de `user_blocks` e de `user_connections` sao
 * `ON DELETE CASCADE`, e `*_reports.reporter_user_id` tambem. Uma conta da
 * massa que aparecesse em qualquer uma dessas tabelas junto com uma conta DE
 * FORA levaria a linha da pessoa de fora embora no `DELETE` -- o bloqueio que
 * ELA montou, a conexao que ELA pediu, a denuncia que ELA abriu e que estava na
 * fila de moderacao. Nao criar e metade da protecao; a outra metade e a
 * conferencia previa de `remover.mjs`, que RECUSA apagar se encontrar qualquer
 * uma dessas linhas cruzando a fronteira do lote (o cliente vai NAVEGAR com a
 * massa dentro, e pode bloquear ou denunciar um perfil da massa depois que ela
 * subir).
 */

/** A identidade do lote. Entra no manifesto, no `audit.events` e nos prefixos. */
export const LOTE = 'massa-hml-2026-10-19';

/** O prefixo visivel. Curto de proposito: `pets.name` aceita 40 caracteres. */
export const MARCA_VISIVEL = '[teste]';

/**
 * `.invalid` e reservado pela RFC 6761 para "nunca resolve". Nao e um dominio
 * que alguem possa registrar depois e passar a receber o que a massa mandar.
 */
export const DOMINIO_INVALIDO = 'exemplo-de-teste.invalid';

/** O prefixo das chaves unicas. Veja a nota 2b do cabecalho. */
export const PREFIXO_ESTRUTURAL = 'massateste';

/** A versao dos termos em vigor, dita pelo cliente. */
export const VERSAO_DOS_TERMOS = '2026-09-17';

export const QUANTIDADE = 30;

/**
 * Quem recebe coordenada, e por que a proporcao e esta.
 *
 * Dois tercos com coordenada (20 de 30) e um terco sem (10 de 30), atribuidos
 * por `indice % 3 === 0` -- e NAO "os 20 primeiros com, os 10 ultimos sem".
 *
 * A diferenca e o que torna a tela testavel. A outra frente ordena os **20
 * ultimos pets cadastrados** por distancia, com quem nao tem coordenada por
 * ultimo. Se a massa desse coordenada aos 20 primeiros, a janela de 20 cairia
 * inteira num unico comportamento e o outro nunca apareceria. Intercalado de
 * tres em tres, QUALQUER janela de tres registros consecutivos contem os dois
 * casos -- nao ha recorte da lista em que um deles se esconda.
 */
export function temCoordenada(indice) {
  return indice % 3 !== 0;
}

/**
 * A origem da coordenada, e so as duas que o ADR-0006 autoriza.
 *
 * `device_gps` e `map_pin`, e nada mais: nao existe geocodificacao neste
 * produto, nem direta nem reversa. A divisao e 12 por GPS e 8 por toque no
 * mapa, para que o toque no mapa -- o caminho de quem NEGA a permissao de
 * localizacao, que e o mais facil de esquecer -- tenha massa propria.
 */
export function origemDaCoordenada(indice) {
  return indice % 5 === 1 || indice % 5 === 2 ? 'map_pin' : 'device_gps';
}

/**
 * O passo da grade do ADR-0006: 0,001 grau, entre 92 m e 111 m no Brasil.
 *
 * A rota `PUT /v1/me/location` quantiza sozinha (`quantizar()` em
 * `src/modules/identity/domain/localizacao-de-referencia.ts`), entao mandar
 * coordenada ja na grade nao e exigencia dela -- e exigencia de QUEM LE o
 * resultado. Mandar 7 casas decimais e receber 3 de volta faria toda
 * conferencia de distancia desta massa comparar o que foi pedido com o que foi
 * gravado e achar que ha defeito. O `INSERT` direto de `professionals.geo`, que
 * nao passa por rota nenhuma, depende disto de verdade.
 */
export function naGrade(valor) {
  return Math.round(valor * 1000) / 1000 + 0;
}

/**
 * Distancias crescentes a partir da Avenida Paulista, em passos da grade.
 *
 * Nao e aleatorio e nao e um ponto so: a ordenacao por proximidade nao se prova
 * com 20 registros no mesmo lugar. Cada indice fica mais longe que o anterior,
 * entao a lista ordenada por distancia tem de sair na mesma ordem dos indices
 * -- e isso e uma afirmacao conferivel, ao contrario de "parece perto".
 */
export function coordenadaDe(indice) {
  const base = { lat: -23.561, lon: -46.656 };
  const passo = 0.004 * indice;
  return { lat: naGrade(base.lat - passo), lon: naGrade(base.lon - passo * 0.6) };
}

const NOMES = [
  'Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Elisa Prado',
  'Fabio Teixeira', 'Gabi Moraes', 'Heitor Campos', 'Ines Barbosa', 'Joao Peixoto',
  'Kelly Antunes', 'Lucas Ferraz', 'Marina Goulart', 'Natan Vieira', 'Olivia Pazos',
  'Pedro Quadros', 'Queila Ramos', 'Rafa Simoes', 'Sofia Toledo', 'Tiago Urbano',
  'Ursula Valente', 'Vitor Wagner', 'Wanda Xavier', 'Xuxa Yamada', 'Yuri Zanetti',
  'Zelia Abreu', 'Artur Bonfim', 'Bia Cardoso', 'Caio Delgado', 'Dora Esteves',
];

const CIDADES = [
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Bela Vista' },
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Pinheiros' },
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Tatuape' },
  { city: 'Guarulhos', state: 'SP', neighborhood: 'Centro' },
  { city: 'Santo Andre', state: 'SP', neighborhood: 'Vila Assuncao' },
  { city: 'Osasco', state: 'SP', neighborhood: 'Presidente Altino' },
];

/** O numero com dois digitos. A marca estrutural depende de ele ser estavel. */
export function sufixo(indice) {
  return String(indice).padStart(2, '0');
}

/**
 * As 30 contas.
 *
 * `handle` e `massateste01`..`massateste30`: 12 caracteres, dentro do
 * `^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$`, e com ESQUELETOS distintos entre si.
 * O esqueleto (`handle_esqueleto`, migracao 20261018000021) colapsa `0/o`,
 * `1/i/l`, `5/s` e `3/e` e remove hifens, e ele e UNICO -- dois apelidos que
 * so diferem nesses caracteres colidem. Os digitos 0..9 sao injetivos sob essa
 * traducao, entao dois numeros de dois digitos nunca colidem. `massateste` nao
 * e nenhuma das 50 palavras reservadas que a migracao semeia (`teste` e uma
 * delas; `massateste01` nao e `teste`, e a reserva e por valor e nao por
 * conteudo, exceto `bichu`, que casa por conteudo e nao aparece aqui).
 */
export function contas() {
  return Array.from({ length: QUANTIDADE }, (_, i) => {
    const n = i + 1;
    const s = sufixo(n);
    return {
      indice: n,
      handle: `${PREFIXO_ESTRUTURAL}${s}`,
      email: `${PREFIXO_ESTRUTURAL}${s}@${DOMINIO_INVALIDO}`,
      displayName: `${MARCA_VISIVEL} ${NOMES[i]}`,
      // Datas espalhadas entre 1972 e 2009. Todas com 16 anos ou mais em
      // 19/10/2026, que e a idade minima que o cliente definiu: a mais nova
      // nasceu em 2009 e tem 17. Uma data de 2010 seria recusada com
      // `too_young`, e o lote inteiro pararia no meio.
      birthDate: `${String(1972 + ((i * 7) % 38))}-0${String(1 + (i % 9))}-${sufixo(1 + ((i * 3) % 27))}`,
      acceptedTermsVersion: VERSAO_DOS_TERMOS,
      ...CIDADES[i % CIDADES.length],
    };
  });
}

/**
 * Os 30 pets, e por que eles nao sao um por conta.
 *
 * `POST /v1/pets` recusa com 429 a partir de 10 por conta em 24 h
 * (`deny_429`, `pet-routes.ts:55`), e o teto de `users.pet_limit` e 20. Um pet
 * por conta cabe nos dois -- mas a lista de conversas NAO. Ela e por conta, e
 * a unica pessoa que pode estar em 30 conversas de uma vez e um tutor com 30
 * avisos de achado contra os pets DELE.
 *
 * Entao a conta 01 e a VITRINE: 6 pets, e 5 plaquinhas em cada um (o teto de
 * `issuePetTag` e por PET, 10 em 24 h, e o teto de dominio e 5 ativas por pet),
 * o que da 30 plaquinhas, 30 avisos e 30 conversas em UMA lista. As outras 24
 * contas levam um pet cada; 5 contas ficam sem pet, que tambem e um estado que
 * a tela precisa ter.
 */
export const CONTA_VITRINE = 1;
export const PETS_DA_VITRINE = 6;
export const PLAQUINHAS_POR_PET = 5;

const ESPECIES = ['dog', 'cat', 'other'];
const PORTES = ['P', 'M', 'G', 'GG'];
const SEXOS = ['female', 'male', 'unknown'];
const NOMES_DE_PET = [
  'Nina', 'Thor', 'Mel', 'Bidu', 'Amora', 'Zeca', 'Maya', 'Pipoca', 'Frajola',
  'Lola', 'Bento', 'Cacau', 'Duque', 'Estrela', 'Fiona', 'Gringo', 'Hulk',
  'Iris', 'Jade', 'Kiko', 'Luna', 'Malu', 'Nemo', 'Oscar', 'Pepita', 'Quina',
  'Romeu', 'Sushi', 'Tufao', 'Uva',
];
const SINAIS = [
  'Mancha branca no peito.',
  'Orelha esquerda dobrada.',
  'Rabo curto e grosso.',
  'Olho azul de um lado so.',
  'Cicatriz pequena na pata dianteira.',
  'Pelo malhado preto e caramelo.',
];

/**
 * A lista de pets: a qual conta cada um pertence, na ordem de criacao.
 *
 * A ordem IMPORTA. A outra frente mostra os 20 ULTIMOS cadastrados, e e por
 * isso que os 6 pets da vitrine vem primeiro e os demais depois: assim a
 * janela de 20 cai sobre contas variadas, com e sem coordenada, em vez de
 * sobre os 6 pets de uma conta so.
 */
export function pets() {
  const lista = [];
  for (let k = 0; k < PETS_DA_VITRINE; k += 1) lista.push(CONTA_VITRINE);
  for (let n = 2; lista.length < QUANTIDADE; n += 1) lista.push(n);
  return lista.map((contaIndice, i) => ({
    indice: i + 1,
    contaIndice,
    name: `${MARCA_VISIVEL} ${NOMES_DE_PET[i]}`,
    species: ESPECIES[i % ESPECIES.length],
    size: PORTES[i % PORTES.length],
    sex: SEXOS[i % SEXOS.length],
    neutered: i % 2 === 0,
    distinctive_marks: SINAIS[i % SINAIS.length],
  }));
}

/**
 * Os 30 encontros da Rede, tres por conta, em dez contas.
 *
 * Tres por conta e o teto de DOMINIO, nao de chamada: `createNetworkEvent`
 * responde 409 `community-event-limit-reached` a partir de 3 encontros ainda
 * nao terminados por autor (`network_events_ativos_do_autor`). O teto de
 * chamada e 5 em 24 h. Dez contas e o menor numero que cabe nos dois, e por
 * isso e dez e nao uma.
 *
 * `starts_at` espalhado em dias distintos porque a listagem ordena por
 * `starts_at ASC` com desempate por `slug`: trinta encontros no mesmo instante
 * provariam o desempate e nao a ordenacao.
 *
 * Os textos passam pelas conferencias do servidor, que RECUSAM endereco dentro
 * de `place_name` (CEP, numero depois de separador, `s/n`, 4 digitos seguidos)
 * e contato ou pagamento em `title`, `summary` e `notes` (telefone, e-mail,
 * link, `@apelido`, chave PIX). Nenhum nome de lugar aqui tem digito.
 */
const LUGARES = [
  { place_name: 'Parque Villa-Lobos', neighborhood: 'Alto de Pinheiros', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Parque do Povo', neighborhood: 'Itaim Bibi', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Praca Benedito Calixto', neighborhood: 'Pinheiros', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Parque da Aclimacao', neighborhood: 'Aclimacao', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Parque Ibirapuera', neighborhood: 'Moema', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Parque Bosque Maia', neighborhood: 'Centro', city: 'Guarulhos', state: 'SP' },
  { place_name: 'Parque Central', neighborhood: 'Vila Assuncao', city: 'Santo Andre', state: 'SP' },
  { place_name: 'Parque Chico Mendes', neighborhood: 'Presidente Altino', city: 'Osasco', state: 'SP' },
  { place_name: 'Parque Previdencia', neighborhood: 'Vila Sonia', city: 'Sao Paulo', state: 'SP' },
  { place_name: 'Parque Burle Marx', neighborhood: 'Morumbi', city: 'Sao Paulo', state: 'SP' },
];

const IDADES = ['any', 'from_4_months', 'from_1_year', 'up_to_1_year'];
const ESTRUTURA = ['shade', 'benches', 'dog_water_fountain', 'parking_nearby', 'accessible_restroom'];
const PARA_LEVAR = ['water', 'water_bowl', 'leash', 'poop_bags', 'treats', 'towel', 'vaccination_card', 'toy'];

export const CONTAS_DE_ENCONTRO = 10;
export const ENCONTROS_POR_CONTA = 3;

export function encontros(agoraMs) {
  const lista = [];
  for (let c = 0; c < CONTAS_DE_ENCONTRO; c += 1) {
    for (let e = 0; e < ENCONTROS_POR_CONTA; e += 1) {
      const i = c * ENCONTROS_POR_CONTA + e;
      const lugar = LUGARES[c];
      // De 3 a 32 dias a frente, um por dia, sempre no futuro: o filtro padrao
      // da listagem e `when=upcoming`, e um encontro no passado nao apareceria
      // sem alguem trocar o filtro.
      const inicio = new Date(agoraMs + (3 + i) * 86400000);
      inicio.setUTCHours(13, 0, 0, 0);
      const fim = new Date(inicio.getTime() + 3 * 3600000);
      lista.push({
        indice: i + 1,
        // As contas de encontro sao a 1 a 10: a vitrine tambem organiza, para
        // que a conta que o cliente abre tenha encontro proprio na tela.
        contaIndice: c + 1,
        // O NUMERO VEM NO COMECO DO TITULO, E ISSO NAO E ESTILO.
        //
        // A rota deriva o `slug` do titulo e o TRUNCA em 30 caracteres. Com
        // `[teste] Encontro de tutores no <lugar>`, os 30 primeiros caracteres
        // sao identicos nos 30 encontros: todos viram
        // `teste-encontro-de-tutores-no-p`, e o segundo `INSERT` reprova por
        // `network_events_slug_unico`.
        //
        // MEDIDO EM HOMOLOGACAO, e vale registrar porque e defeito do produto e
        // nao da massa: a reprova nao vira "escolhe outro slug", vira **500**.
        // `inserirComSlugLivre` (`kysely-network-repository.js:833`) tenta de
        // novo DENTRO da transacao que o 23505 acabou de abortar, e a segunda
        // tentativa morre com `25P02 current transaction is aborted`. Sem
        // SAVEPOINT, o caminho de desempate de slug nao funciona -- quem criar
        // dois encontros de titulo parecido leva 500.
        //
        // A massa contorna porque precisa subir hoje: o numero entra na posicao
        // 16..17 do slug (`teste-encontro-01-no-parque-v`), dentro dos 30, e os
        // 30 slugs ficam distintos sem depender do desempate.
        title: `${MARCA_VISIVEL} Encontro ${String(i + 1).padStart(2, '0')} no ${lugar.place_name}`,
        summary: `${MARCA_VISIVEL} Passeio tranquilo com os cachorros, aberto a quem quiser chegar.`,
        place: lugar,
        starts_at: inicio.toISOString(),
        ends_at: fim.toISOString(),
        dog_age: IDADES[i % IDADES.length],
        vaccination_required: i % 4 !== 0,
        fenced_off_leash_area: i % 3 === 0,
        accepted_sizes: i % 2 === 0 ? ['P', 'M', 'G', 'GG'] : ['M', 'G'],
        amenities: ESTRUTURA.slice(0, 1 + (i % ESTRUTURA.length)),
        bring_items: PARA_LEVAR.slice(0, 1 + (i % 4)),
        notes: `${MARCA_VISIVEL} Levar carteirinha de vacina.`,
      });
    }
  }
  return lista;
}

/**
 * As 30 entradas do diretorio (`professionals`), e por que elas entram por
 * `INSERT` e nao por rota.
 *
 * **Nao existe rota nao administrativa que crie entrada de diretorio.** A unica
 * escrita nessa direcao e `POST /v1/directory/suggestions`, que grava em
 * `directory_suggestions` -- a FILA DE REVISAO -- e cujo recibo diz, no proprio
 * contrato, que "nada aparece no `Perto` ate alguem olhar". Virar entrada exige
 * `POST /v1/admin/directory/suggestions/{ref}/approval` ou
 * `POST /v1/admin/directory/entries`, as duas atras da sessao do painel. Criar
 * conta de administrador esta PROIBIDO nesta tarefa, entao o `INSERT` direto e
 * o unico caminho que resta -- e e o mesmo que `src/bin/seed.ts` usa.
 *
 * `source = 'import'` com `claim_status = 'unclaimed'` e a escolha que isola a
 * massa das contas:
 *   - `professionals_aceite_antes_do_perfil` exige `source = 'import'` OU
 *     `claim_status <> 'unclaimed'`. Nenhum perfil nasce sem aceite de quem ele
 *     descreve, e aqui nao ha ninguem a quem pedir aceite.
 *   - `professionals_titularidade_tem_marco` exige que `unclaimed` venha com
 *     `claimed_at` e `claimed_by_user_id` NULOS.
 *   - e a leitura do diretorio filtra por
 *     `conta_habilitada(professionals.claimed_by_user_id)`, que devolve
 *     VERDADEIRO para nulo (migracao 20261017000013). A entrada sem titular
 *     continua publicada -- medido, nao suposto.
 * O efeito: nenhuma das 30 entradas aponta para conta nenhuma, entao apagar
 * contas nao mexe nelas e apagar elas nao mexe em conta.
 *
 * Os oito glifos: `kind` tem 6 valores (`vet`, `groomer`, `walker`, `sitter`,
 * `trainer`, `clinic`) e `entity_kind` tem 2 (`professional`, `organization`).
 * A massa percorre os 6 e reserva 6 entradas para `organization`, que e a ONG.
 *
 * TODAS sem logo (`logo_image_id` nulo), de proposito: e o estado de reserva do
 * icone, e e o unico jeito de ele aparecer na tela. Veja a nota sobre imagens
 * no cabecalho de `criar.mjs`.
 */
const ATIVIDADES = ['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic'];

const NOMES_DE_LOCAL = [
  'Clinica Vet Bela Vista', 'Banho e Tosa Pinheiros', 'Passeio Tatuape',
  'Hospedagem Guarulhos', 'Adestra Santo Andre', 'Pronto Atendimento Osasco',
  'Vet da Praca', 'Pet Shop da Esquina', 'Caminhada com Cachorro',
  'Cuidadora de Bairro', 'Escola de Bons Modos', 'Clinica Vinte e Quatro Horas',
  'Vet Movel do Centro', 'Tosa Higienica Express', 'Dog Walker da Vila',
  'Casa de Hospedagem Calma', 'Treino Positivo', 'Clinica Popular',
  'Consultorio Vet Jardins', 'Estetica Animal', 'Passeios da Manha',
  'Hotelzinho Aconchego', 'Adestramento Gentil', 'Centro Veterinario Leste',
  'Resgate e Adocao Esperanca', 'Protetores da Zona Norte',
  'Lar Temporario Amparo', 'Abrigo Patas Livres', 'Ong Adota Sao Paulo',
  'Grupo de Castracao Solidaria',
];

export function profissionais(indiceDeOrganizacaoAPartirDe = 25) {
  return Array.from({ length: QUANTIDADE }, (_, i) => {
    const n = i + 1;
    const lugar = CIDADES[i % CIDADES.length];
    const ehOrganizacao = n >= indiceDeOrganizacaoAPartirDe;
    return {
      indice: n,
      slug: `${PREFIXO_ESTRUTURAL}-prof-${sufixo(n)}`,
      kind: ATIVIDADES[i % ATIVIDADES.length],
      entity_kind: ehOrganizacao ? 'organization' : 'professional',
      display_name: `${MARCA_VISIVEL} ${NOMES_DE_LOCAL[i]}`,
      about: `${MARCA_VISIVEL} Registro de massa de homologacao do lote ${LOTE}. `
        + 'Atendimento de segunda a sabado, com agendamento pelo telefone da entrada.',
      city: lugar.city,
      state: lugar.state,
      neighborhood: lugar.neighborhood,
      // `^\+[1-9][0-9]{7,14}$`. Sem telefone a entrada nasceria rascunho,
      // porque o telefone e o unico canal publico de `professionals`.
      phone_e164: `+5511${String(90000000 + n)}`,
      // Dois tercos com ponto no mapa, pela MESMA regra de `temCoordenada`:
      // a ordenacao do diretorio e `ST_Distance(geo, ponto) ASC NULLS LAST`,
      // e sem entrada sem ponto o `NULLS LAST` nunca e exercido.
      coordenada: temCoordenada(n) ? coordenadaDe(n) : null,
    };
  });
}

/**
 * Os 30 itens da Loja, e os dois CHECKs que mandam na forma deles.
 *
 * Tambem por `INSERT`: a escrita da Loja e do backoffice
 * (`POST /v1/admin/store/items`), e nao ha equivalente no aplicativo.
 *
 * 1. `store_items_subcategoria_e_da_categoria` e uma CHAVE ESTRANGEIRA
 *    COMPOSTA -- `FOREIGN KEY (category, subcategory) REFERENCES
 *    store_subcategories (category_code, code)` -- e nao um CHECK, como se
 *    costuma dizer. O efeito pratico e o mesmo e vale repetir: categoria e
 *    subcategoria se escrevem JUNTAS, e mover uma subcategoria de categoria
 *    exige reescrever `category` no mesmo passo. Os pares desta massa sao
 *    LIDOS de `store_subcategories` na hora da criacao, e nunca escritos a
 *    mao: um par inventado reprova com 23503, e um par copiado hoje pode
 *    deixar de existir amanha.
 * 2. `store_items_publicado_esta_completo` exige `partner_id`, `summary`,
 *    `category` e `target_path` em todo item com `active = true`, e
 *    `store_items_publicado_tem_data` exige `published_at`.
 *
 * O PRECO SAIU DA TELA neste lote, entao o valor nao precisa ficar bonito --
 * mas a coluna cobra coerencia: `store_items_preco_anda_completo` aceita os
 * tres nulos ou os tres preenchidos, e o gatilho
 * `store_items_data_de_consulta_nao_e_futura` recusa `price_checked_at` no
 * futuro. A massa preenche os tres com a data de HOJE, e deixa um terco dos
 * itens sem preco nenhum -- que e o outro estado valido da coluna.
 */
const ITENS = [
  'Racao seca para adultos', 'Petisco natural de frango', 'Comedouro antiderrapante',
  'Vermifugo de amplo espectro', 'Tapete higienico', 'Shampoo neutro',
  'Escova de cerdas macias', 'Bolinha resistente', 'Cama retangular lavavel',
  'Camiseta de algodao', 'Coleira ajustavel', 'Caixa de transporte media',
  'Clicker de adestramento', 'Grade de contencao', 'Racao umida sache',
  'Osso recreativo', 'Bebedouro de fonte', 'Suplemento articular',
  'Areia sanitaria', 'Lenco umedecido', 'Cortador de unhas',
  'Mordedor de corda', 'Colchonete de viagem', 'Capa de chuva',
  'Peitoral antipuxao', 'Bolsa de passeio', 'Apito de treino',
  'Portao retratil', 'Biscoito integral', 'Pote medidor',
];

export function itensDaLoja() {
  return Array.from({ length: QUANTIDADE }, (_, i) => {
    const n = i + 1;
    const comPreco = n % 3 !== 0;
    return {
      indice: n,
      slug: `${PREFIXO_ESTRUTURAL}-item-${sufixo(n)}`,
      title: `${MARCA_VISIVEL} ${ITENS[i]}`,
      summary: `${MARCA_VISIVEL} Item de massa de homologacao do lote ${LOTE}, `
        + 'criado para a tela ter o que paginar.',
      target_path: `/${PREFIXO_ESTRUTURAL}/item-${sufixo(n)}`,
      // Depois do unico item de verdade que existe hoje em homologacao, para a
      // ordenacao `curadoria` (`sort_order ASC, slug ASC`) nao embaralhar o que
      // o cliente ja tinha com o que a massa trouxe.
      sort_order: 500 + n,
      price_amount: comPreco ? 1990 + n * 310 : null,
    };
  });
}

/** O parceiro da Loja da massa. UM, proprio, para nao referenciar os dele. */
export const PARCEIRO = {
  slug: `${PREFIXO_ESTRUTURAL}-parceiro`,
  name: `${MARCA_VISIVEL} Parceiro de massa`,
  host: 'exemplo-de-teste.invalid',
};

/** As mensagens. Cada conversa recebe duas; o corpo aceita de 1 a 4000. */
export function corpoDaMensagem(indice, lado) {
  return lado === 'finder'
    ? `${MARCA_VISIVEL} Achei este animal aqui perto, conversa ${sufixo(indice)}.`
    : `${MARCA_VISIVEL} Obrigado por avisar, conversa ${sufixo(indice)}.`;
}

/**
 * A ordem em que a ULTIMA mensagem de cada conversa e enviada.
 *
 * Deliberadamente DIFERENTE da ordem de abertura. A lista de conversas ordena
 * por `coalesce(ultima mensagem, opened_at) DESC` -- e se a ultima mensagem
 * saisse na mesma ordem da abertura, a lista ficaria igual nas duas chaves e o
 * `coalesce` nunca seria exercido. Com a ordem embaralhada, a lista que sai
 * SO pode estar certa se o servidor ordenar pela ultima mensagem, e isso e uma
 * afirmacao que se confere contra o manifesto.
 *
 * A permutacao e um passo de 7 modulo 30 (7 e co-primo com 30, entao ela
 * percorre os 30 indices uma vez cada) -- deterministica, sem sorteio.
 */
export function ordemDaUltimaMensagem(total) {
  return Array.from({ length: total }, (_, k) => ((k * 7) % total) + 1);
}

if (process.argv[1]?.endsWith('massa.mjs')) {
  const esqueletos = new Set(
    contas().map((c) => c.handle.replace(/-/g, '').replace(/[01i53]/g, (d) =>
      ({ 0: 'o', 1: 'l', i: 'l', 5: 's', 3: 'e' })[d])),
  );
  process.stdout.write(
    `lote ${LOTE}\n`
    + `contas ${String(contas().length)} (esqueletos distintos: ${String(esqueletos.size)})\n`
    + `pets ${String(pets().length)}\n`
    + `encontros ${String(encontros(Date.now()).length)}\n`
    + `profissionais ${String(profissionais().length)}\n`
    + `itens da loja ${String(itensDaLoja().length)}\n`
    + `com coordenada ${String(contas().filter((c) => temCoordenada(c.indice)).length)}\n`,
  );
}

/* ==========================================================================
 * O ACRESCIMO DE 19/10 (segunda rodada): 30 CASOS DE PET PERDIDO, COM FOTO
 * ==========================================================================
 * A primeira rodada deixou `lost_cases` sem massa, e o motivo estava medido:
 * `openLostCase` responde 409 enquanto o pet nao tem foto `ready`
 * (`kysely-lost-case-repository.ts:119`). O que estava ERRADO era a conclusao
 * de que foto exigia o painel.
 *
 * Exige o painel a imagem de PRODUTO da Loja e a do DIRETORIO: so
 * `AdminCatalogImageIntentInput` declara `purpose`, e ela vive atras da sessao
 * administrativa. A foto de PET nao: `POST /v1/media/pet-photo-intents` e rota
 * do aplicativo, com `UploadIntentInput` (`content_type` em
 * `[image/jpeg, image/png, image/heic, image/webp]`, `byte_size` ate 5 MiB).
 * Entao a Loja e o diretorio seguem sem imagem -- e isso continua certo --, e
 * os 30 pets passam a ter foto de verdade.
 */

/**
 * As 12 cidades dos casos de perdido, e por que sao 12 e nao 1.
 *
 * Outra frente (`feat/pets-por-distancia`, ainda nao mesclada) tornou `city`
 * OPCIONAL em `GET /v1/public/lost-pets`, e o recorte padrao passou a ser os 20
 * mais recentes do pais inteiro. Trinta casos na mesma cidade deixariam essa
 * tela com uma cidade so -- ela abriria "cheia" e ainda assim nao exercitaria
 * nada. Espalhados em 12 cidades e 5 estados, a lista sem cidade e variada E o
 * filtro por cidade continua cortando de verdade.
 */
const CIDADES_DOS_PERDIDOS = [
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Bela Vista' },
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Pinheiros' },
  { city: 'Sao Paulo', state: 'SP', neighborhood: 'Tatuape' },
  { city: 'Guarulhos', state: 'SP', neighborhood: 'Centro' },
  { city: 'Campinas', state: 'SP', neighborhood: 'Cambui' },
  { city: 'Santos', state: 'SP', neighborhood: 'Gonzaga' },
  { city: 'Rio de Janeiro', state: 'RJ', neighborhood: 'Tijuca' },
  { city: 'Niteroi', state: 'RJ', neighborhood: 'Icarai' },
  { city: 'Belo Horizonte', state: 'MG', neighborhood: 'Savassi' },
  { city: 'Curitiba', state: 'PR', neighborhood: 'Batel' },
  { city: 'Porto Alegre', state: 'RS', neighborhood: 'Moinhos de Vento' },
  { city: 'Florianopolis', state: 'SC', neighborhood: 'Trindade' },
];

const RELATOS = [
  'Fugiu pelo portao quando chegou visita. Atende pelo nome e tem medo de moto.',
  'Sumiu na hora do passeio, soltou da coleira ao ver outro cachorro.',
  'Saiu pela janela do quintal durante a chuva forte da tarde.',
  'Foi visto pela ultima vez perto da padaria da esquina, sem coleira.',
  'Escapou durante a mudanca, quando a porta ficou aberta.',
  'Desapareceu a noite; costuma procurar lugar quente para dormir.',
];

/**
 * Os 30 casos. `last_seen_at` espalhado em dias DISTINTOS, do mais antigo ao
 * mais recente, porque a listagem publica ordena por `last_seen_at DESC` com
 * desempate por `share_token`: trinta casos no mesmo instante provariam o
 * desempate e nao a ordenacao, e a paginacao de 20 + 10 nao diria nada sobre a
 * ordem.
 *
 * Coordenada pela MESMA regra de `temCoordenada` (dois tercos sim, um terco
 * nao, intercalado de tres em tres). Ela decide se vai `last_seen_location`; o
 * caso sem ponto NAO dispara o alerta de 5 km, por desenho
 * (`AlertDispatch.reach_status`), e e esse estado que a tela precisa ter o que
 * mostrar.
 *
 * **`last_seen_area` VAI SEMPRE, inclusive junto do ponto**, e isto foi
 * corrigido depois de medir. O `anyOf` do `LostCaseInput` exige UM dos dois,
 * e a primeira versao desta massa leu isso como "um ou o outro". Errado: a
 * rota mapeia os dois campos INDEPENDENTEMENTE para o mesmo objeto `onde`
 * (`lost-case-routes.ts:660-664`), entao mandar os dois e aceito -- e e o que
 * o aplicativo faz, porque ele tem o ponto E o bairro digitado.
 *
 * A consequencia de ter mandado so o ponto foi medida em homologacao: o
 * ADR-0006 PROIBE geocodificacao reversa, entao o servidor nao deriva cidade
 * de coordenada, e os 20 casos nasceram com `last_seen_city` NULO. Na
 * listagem publica, que filtra por cidade digitada, eles ficaram
 * INVISIVEIS -- `select ... where texto_para_busca(last_seen_city) = ...`
 * nunca casa com nulo. Dos 30 casos, so 10 apareciam por cidade.
 */
export function casosDePerdido(agoraMs) {
  return Array.from({ length: QUANTIDADE }, (_, i) => {
    const n = i + 1;
    const lugar = CIDADES_DOS_PERDIDOS[i % CIDADES_DOS_PERDIDOS.length];
    // Do 44o dia atras ate ontem, um por dia e sempre no passado: "visto por
    // ultima vez" no futuro seria recusado, e seria mentira.
    const visto = new Date(agoraMs - (QUANTIDADE - i + 14) * 86400000);
    visto.setUTCHours(9 + (i % 10), (i * 7) % 60, 0, 0);
    return {
      indice: n,
      vistoEm: visto.toISOString(),
      lugar,
      comPonto: temCoordenada(n),
      ponto: temCoordenada(n) ? coordenadaDe(n) : null,
      descricao: `${MARCA_VISIVEL} ${RELATOS[i % RELATOS.length]}`,
    };
  });
}

/**
 * A FOTO, gerada aqui e nao baixada de ninguem.
 *
 * 600 x 600 porque e o minimo que o processamento exige
 * (`DIMENSAO_MINIMA_DA_FOTO_DE_PET`, `derivadas.ts:335`); menor que isso o
 * worker recusa e a foto nasce `rejected`, e sem foto `ready` nao ha caso de
 * perdido.
 *
 * SEM TEXTO, e isso e medido e nao preferencia: o conteiner da aplicacao nao
 * tem fontconfig (`Fontconfig error: Cannot load default config file`), entao
 * `<text>` renderiza em branco. Como o requisito e so "distinguiveis entre
 * si", o numero entra como BARRAS -- `n` barras na faixa de baixo --, que sao
 * geometria e nao dependem de fonte. Matiz propria por indice (12 graus de
 * passo) da a segunda dimensao de distincao.
 *
 * SVG entra como ENTRADA do sharp, que o rasteriza. Ele nunca e enviado como
 * imagem: `SVG nunca entra nesta lista -- e documento com script, nao imagem`
 * (o proprio contrato). O que sobe e o JPEG que sai daqui.
 */
export function svgDaFoto(indice) {
  const matiz = (indice * 12) % 360;
  const fundo = `hsl(${String(matiz)}, 42%, 38%)`;
  const claro = `hsl(${String(matiz)}, 55%, 86%)`;
  const barras = Array.from({ length: indice }, (_, k) => {
    const x = 20 + k * 18.6;
    return `<rect x="${x.toFixed(1)}" y="500" width="11" height="80" fill="${claro}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">`
    + `<rect width="600" height="600" fill="${fundo}"/>`
    + `<circle cx="300" cy="250" r="150" fill="${claro}"/>`
    + `<circle cx="248" cy="215" r="22" fill="${fundo}"/>`
    + `<circle cx="352" cy="215" r="22" fill="${fundo}"/>`
    + `<ellipse cx="300" cy="300" rx="38" ry="26" fill="${fundo}"/>`
    + `<rect x="0" y="470" width="600" height="130" fill="${fundo}" opacity="0.55"/>`
    + barras
    + `</svg>`;
}

/**
 * Os pets EXTRAS que o teto de casos abertos obriga, e o calculo que os obriga.
 *
 * `TETO_DE_CASOS_ABERTOS_POR_CONTA = 3` e `lost_cases_um_aberto_por_pet` (UNIQUE
 * em `pet_id` onde `status = 'open'`) juntos dao: casos abertos maximos =
 * `soma(min(pets_da_conta, 3))`.
 *
 * A massa tem 30 pets como 6 + 24 x 1, e os 6 da conta vitrine nao sao
 * negociaveis -- sao eles que levam 5 plaquinhas cada e produzem as 30 conversas
 * numa lista so, que e a unica forma de a paginacao daquela tela ser testavel.
 * Logo o maximo e 3 + 24 = 27, e 30 casos com 30 pets NAO EXISTE.
 *
 * Esta funcao devolve os pets que faltam, um por conta sem pet (a massa deixou
 * 5 contas assim de proposito). Cada um sobe com foto, porque sem foto `ready`
 * nao ha caso. O conjunto de pets passa de 30 para 33, e e esse numero que vai
 * ao manifesto e ao relatorio -- em vez de anunciar 30 casos e entregar 27.
 */
export function petsExtras(quantos, contas, jaExistem) {
  return Array.from({ length: quantos }, (_, k) => {
    const i = jaExistem + k;
    return {
      indice: i + 1,
      contaIndice: contas[k],
      name: `${MARCA_VISIVEL} ${NOMES_DE_PET[i % NOMES_DE_PET.length]} II`,
      species: ESPECIES[i % ESPECIES.length],
      size: PORTES[i % PORTES.length],
      sex: SEXOS[i % SEXOS.length],
      neutered: i % 2 === 0,
      distinctive_marks: SINAIS[i % SINAIS.length],
    };
  });
}
