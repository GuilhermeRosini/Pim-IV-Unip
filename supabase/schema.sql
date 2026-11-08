-- Estrutura inicial do Saúde Plus; as senhas ficam exclusivamente no Supabase Auth.

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    nome text not null default '',
    email text not null unique,
    telefone text,
    endereco text,
    cpf text,
    data_nascimento date,
    plano text not null default 'Nenhum plano contratado',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.dependents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    nome text not null,
    parentesco text,
    tipo text,
    cpf text,
    data_nascimento date,
    responsavel_legal boolean,
    nome_responsavel text,
    acompanhante boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.appointments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    beneficiario_id text,
    beneficiario_nome text,
    especialidade text not null,
    medico text,
    crm text,
    data date not null,
    horario time not null,
    tipo text,
    rede text,
    status text not null default 'Agendada',
    created_at timestamptz not null default now()
);

create table if not exists public.exams (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    beneficiario_id text,
    beneficiario_nome text,
    tipo_exame text not null,
    data date not null,
    horario time not null,
    rede text,
    observacoes text,
    status text not null default 'Agendado',
    created_at timestamptz not null default now()
);

create index if not exists dependents_user_id_idx on public.dependents (user_id);
create index if not exists appointments_user_id_data_idx on public.appointments (user_id, data);
create index if not exists exams_user_id_data_idx on public.exams (user_id, data);

-- A criação do perfil acompanha o cadastro do Auth e copia apenas os metadados informados pelo formulário.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (
        id, nome, email, telefone, endereco, cpf, data_nascimento
    )
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nome', ''),
        new.email,
        new.raw_user_meta_data ->> 'telefone',
        new.raw_user_meta_data ->> 'endereco',
        new.raw_user_meta_data ->> 'cpf',
        nullif(new.raw_user_meta_data ->> 'data_nascimento', '')::date
    )
    on conflict (id) do update set
        email = excluded.email,
        nome = excluded.nome,
        telefone = excluded.telefone,
        endereco = excluded.endereco,
        cpf = excluded.cpf,
        data_nascimento = excluded.data_nascimento,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert or update of email, raw_user_meta_data on auth.users
    for each row execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.dependents enable row level security;
alter table public.appointments enable row level security;
alter table public.exams enable row level security;

drop policy if exists "Usuários consultam o próprio perfil" on public.profiles;
create policy "Usuários consultam o próprio perfil"
    on public.profiles for select
    to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Usuários atualizam o próprio perfil" on public.profiles;
create policy "Usuários atualizam o próprio perfil"
    on public.profiles for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

drop policy if exists "Usuários gerenciam os próprios dependentes" on public.dependents;
create policy "Usuários gerenciam os próprios dependentes"
    on public.dependents for all
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Usuários gerenciam as próprias consultas" on public.appointments;
create policy "Usuários gerenciam as próprias consultas"
    on public.appointments for all
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Usuários gerenciam os próprios exames" on public.exams;
create policy "Usuários gerenciam os próprios exames"
    on public.exams for all
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.dependents to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.exams to authenticated;
