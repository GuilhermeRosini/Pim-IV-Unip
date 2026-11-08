# Configuração do Supabase para o Saúde Plus

## Importar o esquema

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No painel do projeto, abra **SQL Editor** e crie uma consulta.
3. Cole o conteúdo de [`schema.sql`](./schema.sql) e execute.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon/public** (publishable).
5. Abra [`config.js`](./config.js) e substitua `https://SEU-PROJETO.supabase.co` e `SUA_CHAVE_PUBLICAVEL_OU_ANON` pelos valores copiados.
6. Em **Authentication → URL Configuration**, configure o endereço do site e adicione à lista de redirecionamentos a origem exata usada no desenvolvimento (por exemplo, `http://127.0.0.1:5500/**`) e a URL de produção.
7. Em **Authentication → Providers → Email**, deixe o provedor de e-mail ativo. Com confirmação de e-mail habilitada, o usuário precisa confirmar o link antes de entrar.

Abra `index.html` por um servidor local (por exemplo, Live Server no VS Code), não por `file://`. O HTML carrega o SDK oficial do Supabase, [`config.js`](./config.js) e o aplicativo. O esquema cria `profiles`, `dependents`, `appointments` e `exams`. O gatilho cria/atualiza o perfil sempre que uma conta é cadastrada ou tem e-mail/metadados atualizados em `auth.users`.

## Cadastro, login e credenciais

O formulário do site já chama `supabase.auth.signUp` com o e-mail e a senha e envia nome, telefone, endereço, CPF e nascimento como metadados. O gatilho SQL copia esses dados para `public.profiles`. Login, logout, redefinição de senha por e-mail e alteração de senha também usam Supabase Auth. Não é necessário enviar senhas para o Flask nem gravá-las em tabelas próprias.

**Importante:** o painel não revela senhas em texto puro. Em **Authentication → Users** você verá as contas, seus e-mails, IDs, datas de criação e estado de confirmação. O Auth valida as senhas sem mostrá-las; isso é intencional e protege os usuários. Os campos adicionais ficam em **Table Editor → profiles**.

## Onde consultar os cadastros

- **Authentication → Users** lista as contas registradas no Supabase Auth, incluindo e-mail, identificador, data de criação e confirmação.
- **Table Editor → profiles** mostra os dados do formulário associados a cada conta.
- No **SQL Editor**, para conferir os perfis:

```sql
select id, nome, email, telefone, created_at
from public.profiles
order by created_at desc;
```

O SQL Editor do painel tem acesso administrativo. No aplicativo, as políticas de RLS permitem a cada usuário autenticado consultar apenas os próprios dados. Não remova essas políticas para facilitar uma consulta administrativa.

## Segurança e contas antigas

`app.py` não cadastra nem autentica mais usuários. Isso evita que o fluxo antigo grave senhas em texto puro na tabela `usuarios`. Não coloque a chave `service_role` em [`config.js`](./config.js); no navegador use somente a chave anon/public.

Contas criadas pelo fluxo antigo não são convertidas automaticamente para Supabase Auth. Essas pessoas devem fazer um novo cadastro no site ou ser migradas por um processo administrativo seguro; nunca copie senhas em texto puro. Os registros de consultas, exames e dependentes ainda ficam no `localStorage` e não são enviados automaticamente às tabelas de mesmo nome.

CPF e dados de saúde são dados pessoais sensíveis. Restrinja acessos, colete apenas o necessário e defina uma política de privacidade e retenção adequada antes de usar dados reais.

Teste