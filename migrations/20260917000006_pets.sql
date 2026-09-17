-- BICHUS-90 — o cadastro do pet.
--
-- A tabela espelha `PetInput` e `Pet` de `api/openapi.yaml`, que e a fonte. O
-- que o contrato declara e o servidor RESOLVE nao vira coluna: `breed_label`
-- sai de `ref_breeds.label` ou de `breed_free_text` na leitura, `photos` mora
-- em tabela propria, `active_tag_count` e `open_case_id` pertencem a `tags` e a
-- `lostfound`. Guardar copia de valor derivado e criar a segunda fonte que
-- envelhece sozinha.
--
-- `id` e UUIDv7 gerado pela APLICACAO (ADR-0002), sem DEFAULT no banco, pelo
-- mesmo motivo de `users`: o Postgres 16 nao tem `uuidv7()` nativo e uma funcao
-- SQL propria seria um segundo gerador de identificador.
--
-- `users.id` e a unica chave estrangeira para identidade. E-mail e telefone do
-- tutor nao aparecem aqui e nao aparecem em lugar nenhum perto do pet: quem
-- acha o animal avisa o tutor por contato mediado, sem nunca ver telefone nem
-- endereco, e a forma mais barata de sustentar isso e o dado nao estar por
-- perto.

-- Up Migration

CREATE TABLE pets (
  id                     uuid        PRIMARY KEY,
  owner_user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  name                   text        NOT NULL
                                     CONSTRAINT pets_name_tamanho
                                     CHECK (char_length(name) BETWEEN 1 AND 40),

  species_code           text        NOT NULL REFERENCES ref_species (code),

  -- A CHAVE QUE CRUZA. Sempre de `ref_breeds`, nunca digitada: "vira-lata",
  -- "vira lata", "SRD" e "sem raca definida" sao quatro textos para um animal
  -- so, e texto livre como chave de cruzamento significa que o cruzamento nao
  -- acontece exatamente no caso mais comum do Brasil.
  breed_code             text,

  -- O TEXTO QUE DESCREVE. Aceito e guardado, aparece na ficha, no cartaz e no
  -- perfil publico. **Nunca entra em cruzamento nem em filtro.**
  breed_free_text        text        CONSTRAINT pets_breed_free_text_tamanho
                                     CHECK (breed_free_text IS NULL
                                            OR char_length(breed_free_text) BETWEEN 1 AND 40),

  -- A versao da lista que O CLIENTE tinha em maos quando a pessoa escolheu.
  -- `ref_data_versions.is_current` responde "qual e a lista de hoje" e nao
  -- responde "de qual lista este pet foi escolhido" — e e a segunda pergunta
  -- que importa quando um codigo sai da lista ou muda de rotulo. Gravar a
  -- corrente no momento da escrita seria uma aproximacao, nao o fato: o cliente
  -- pode estar com uma copia antiga em cache, e quem sabe a versao usada e ele.
  --
  -- A FK garante integridade; ela NAO substitui validacao. Versao desconhecida
  -- precisa ser recusada na borda com `validation-failed`, senao a FK responde
  -- pela aplicacao com um 500.
  ref_data_version       text        REFERENCES ref_data_versions (version),

  size_code              text        NOT NULL REFERENCES ref_sizes (code),
  primary_color_code     text        REFERENCES ref_colors (code),
  secondary_color_code   text        REFERENCES ref_colors (code),

  sex                    text        CHECK (sex IN ('male', 'female', 'unknown')),
  neutered               boolean,
  birth_date_approx      date,

  distinctive_marks      text        CONSTRAINT pets_distinctive_marks_tamanho
                                     CHECK (distinctive_marks IS NULL
                                            OR char_length(distinctive_marks) <= 500),

  -- O que quem acabou de encontrar o animal precisa saber nos proximos cinco
  -- minutos, em uma frase. Os 280 caracteres sao desenho e nao economia: o
  -- destinatario le de pe, com uma mao, com o animal se mexendo.
  --
  -- Campo PUBLICO por definicao, sem interruptor de visibilidade: quem nao quer
  -- publicar deixa em branco. O servidor aplica a redacao do canal mediado
  -- antes de gravar — telefone, e-mail, endereco e link externo saem aqui, e
  -- nao na leitura, porque dado sensivel gravado em claro ja vazou para todo
  -- backup e todo log de replicacao.
  care_notes             text        CONSTRAINT pets_care_notes_tamanho
                                     CHECK (care_notes IS NULL OR char_length(care_notes) <= 280),

  -- O que a redacao retirou, para a tela explicar em vez de o tutor achar que o
  -- texto sumiu sozinho. Array sempre, nunca NULL: "nada retirado" e `[]`, e
  -- distinguir `[]` de NULL aqui seria distincao sem significado.
  care_notes_redactions  jsonb       NOT NULL DEFAULT '[]'::jsonb
                                     CONSTRAINT pets_care_notes_redactions_array
                                     CHECK (jsonb_typeof(care_notes_redactions) = 'array'),

  microchip_number       text        CONSTRAINT pets_microchip_number_tamanho
                                     CHECK (microchip_number IS NULL
                                            OR char_length(microchip_number) BETWEEN 1 AND 20),

  -- RG Animal do registro federal. Campo livre e SEM validacao automatica: o
  -- SinPatinhas nao tem API publica, e validar formato que nao se conhece
  -- recusaria numero verdadeiro.
  sinpatinhas_id         text        CONSTRAINT pets_sinpatinhas_id_tamanho
                                     CHECK (sinpatinhas_id IS NULL
                                            OR char_length(sinpatinhas_id) BETWEEN 1 AND 40),

  status                 text        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active', 'lost', 'deceased', 'archived')),

  slug                   text        CONSTRAINT pets_slug_formato
                                     CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  public_profile_enabled boolean     NOT NULL DEFAULT false,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,

  -- Raca da especie certa, imposta pelo banco. Como `breed_code` e anulavel e a
  -- FK e MATCH SIMPLE, a restricao nao se aplica quando nao ha raca escolhida,
  -- que e o comportamento desejado: raca e opcional, raca errada nao.
  CONSTRAINT pets_raca_e_da_especie
    FOREIGN KEY (breed_code, species_code) REFERENCES ref_breeds (code, species_code),

  -- Texto livre SO com codigo `outro_*`. "Shih Tzu" no codigo e "poodle" no
  -- texto sao duas respostas para uma pergunta, e a divergencia nao tem como
  -- ser resolvida depois.
  --
  -- O `breed_code IS NOT NULL` explicito nao e redundante: CHECK passa quando a
  -- expressao e NULL, entao `NULL IN ('outro_dog', ...)` deixaria passar texto
  -- livre SEM codigo nenhum — exatamente o estado que esta restricao existe
  -- para impedir, e em silencio.
  CONSTRAINT pets_texto_livre_so_com_codigo_outro
    CHECK (breed_free_text IS NULL
           OR (breed_code IS NOT NULL
               AND breed_code IN ('outro_dog', 'outro_cat', 'outro_other'))),

  -- Perfil publico ligado sem slug e um estado sem endereco: `/@{slug}` e a
  -- unica forma de alcanca-lo.
  CONSTRAINT pets_perfil_publico_exige_slug
    CHECK (NOT public_profile_enabled OR slug IS NOT NULL)
);

COMMENT ON COLUMN pets.breed_code IS
  'A chave que o cruzamento de perdido e achado compara. Sempre de ref_breeds.';
COMMENT ON COLUMN pets.breed_free_text IS
  'A raca como a pessoa escreveu. Descreve; NUNCA cruza e NUNCA filtra.';
COMMENT ON COLUMN pets.ref_data_version IS
  'BICHUS-90 criterio 5: a versao da lista que o CLIENTE usou, nao a corrente do servidor.';

-- Unicidade GLOBAL, e nao so entre pets vivos. `/@{slug}` e indexavel por
-- buscador e permanente: reaproveitar o endereco faria um resultado de busca
-- guardado apontar para outro animal. E o caso contrario ao do e-mail em
-- `users`, onde a conta excluida libera o endereco de proposito.
CREATE UNIQUE INDEX pets_slug_unico ON pets (slug) WHERE slug IS NOT NULL;

-- Listagem do tutor e a contagem que sustenta `pet-limit-reached`.
CREATE INDEX pets_do_tutor ON pets (owner_user_id) WHERE deleted_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS pets;
