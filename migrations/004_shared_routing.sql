begin;
create table if not exists public.routing_experiments (
 id uuid primary key default gen_random_uuid(),
 label text not null, delivery_date date not null,
 model_version text not null default 'taito-flex-v2.1-empty',
 active boolean not null default true,
 revision integer not null default 0 check(revision>=0),
 scenario jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.routing_quotes (
 id uuid primary key,
 experiment_id uuid not null references public.routing_experiments(id),
 participant_session uuid not null,
 condition text not null check(condition in ('control','green_label','default_green_combined')),
 evaluation jsonb not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists public.routing_bookings (
 experiment_id uuid not null references public.routing_experiments(id),
 participant_session uuid not null,
 request_id uuid not null,
 quote_id uuid not null references public.routing_quotes(id),
 receipt jsonb not null,
 created_at timestamptz not null default now(),
 primary key(experiment_id,participant_session),
 unique(experiment_id,request_id), unique(quote_id)
);
alter table public.routing_experiments enable row level security;
alter table public.routing_quotes enable row level security;
alter table public.routing_bookings enable row level security;
revoke all on public.routing_experiments,public.routing_quotes,public.routing_bookings from anon,authenticated;
grant all on public.routing_experiments,public.routing_quotes,public.routing_bookings to service_role;
create or replace function public.routing_commit(p_experiment uuid,p_expected integer,p_scenario jsonb,p_receipt jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.routing_experiments%rowtype; prior jsonb; q public.routing_quotes%rowtype;
begin
 select * into e from public.routing_experiments where id=p_experiment for update;
 if not found or not e.active then raise exception 'Experiment unavailable'; end if;
 select receipt into prior from public.routing_bookings
 where experiment_id=p_experiment and participant_session=(p_receipt->>'participantSession')::uuid;
 if found then return jsonb_build_object('status','duplicate','receipt',prior); end if;
 if e.revision<>p_expected then return jsonb_build_object('status','conflict'); end if;
 select * into q from public.routing_quotes where id=(p_receipt->>'quoteId')::uuid;
 if not found or q.experiment_id<>p_experiment or q.participant_session<>(p_receipt->>'participantSession')::uuid or q.expires_at<now() then raise exception 'Invalid quote'; end if;
 if (p_scenario->>'revision')::integer<>p_expected+1 or p_scenario->>'id'<>p_experiment::text then raise exception 'Invalid state'; end if;
 insert into public.routing_bookings(experiment_id,participant_session,request_id,quote_id,receipt)
 values(p_experiment,q.participant_session,(p_receipt->>'requestId')::uuid,q.id,p_receipt);
 update public.routing_experiments set revision=p_expected+1,scenario=p_scenario where id=p_experiment;
 return jsonb_build_object('status','committed','receipt',p_receipt);
end $$;
revoke all on function public.routing_commit(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.routing_commit(uuid,integer,jsonb,jsonb) to service_role;
commit;
-- Create each experiment separately. Keep its UUID as the invitation code.
-- insert into public.routing_experiments(label,delivery_date) values('Pilot 01','2026-09-15') returning id;
