-- Qdelícia Frutas — Controle de Caixas
-- Dados iniciais. Equivale ao que a função setup() criava na planilha.
--
-- COMO USAR: rode depois do schema.sql, no SQL Editor do Supabase.
-- Não sobrescreve nada: se a linha já existe, deixa como está.
--
-- Os tokens abaixo são os mesmos que já estão em uso no Google Sheets, de propósito —
-- assim os links de extrato já distribuídos continuam valendo depois da migração.

insert into public.locais (id, tipo, nome, limite_caixas, dias_prazo, token, obs) values
  ('L001','GALPAO', 'Galpão de Distribuição',        null, null, 'a69uisz7uv', ''),
  ('L002','FILIAL', 'Filial (exemplo — renomeie)',   null, null, 'xrr7yuy3x4', ''),
  ('L003','CLIENTE','Cliente Exemplo',                200,    7, 'b6p8xwmqr6', 'Apague depois de cadastrar os reais')
on conflict (id) do nothing;

insert into public.tipos_caixa (id, nome, valor_unit) values
  ('T001','Caixa Banana',          18.00),
  ('T002','Caixa Plástica Grande', 25.00)
on conflict (id) do nothing;

insert into public.usuarios (id, nome, perfil, pin, local_padrao) values
  ('U001','Administrador',     'ADMIN',     '1234','L001'),
  ('U002','Conferente Galpão', 'GALPAO',    '1111','L001'),
  ('U003','Motorista Exemplo', 'MOTORISTA', '2222','L001'),
  ('U004','Promotor Exemplo',  'PROMOTOR',  '3333', null)
on conflict (id) do nothing;

insert into public.config (chave, valor) values
  ('empresa',         'Qdelícia Frutas'),
  ('diasPrazoPadrao', '7')
on conflict (chave) do nothing;
