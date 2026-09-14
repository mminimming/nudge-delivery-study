-- Supabase Dashboard > SQL Editor에서 전체를 한 번 실행합니다.
create table if not exists public.study_submissions (
  id uuid primary key default gen_random_uuid(), participant_id text not null,
  session_id text not null, assigned_condition text, final_choice_id text,
  selected_option_id text, survey_version text not null,
  delivery_information jsonb not null default '{}'::jsonb,
  option_exposures jsonb not null default '[]'::jsonb,
  selected_option jsonb not null default '{}'::jsonb,
  survey_responses jsonb not null default '{}'::jsonb,
  event_log jsonb not null default '[]'::jsonb,
  client_started_at timestamptz, client_submitted_at timestamptz,
  received_at timestamptz not null default now(),
  unique (participant_id, session_id)
);
alter table public.study_submissions enable row level security;
revoke all on table public.study_submissions from anon, authenticated;
grant insert on table public.study_submissions to anon, authenticated;
drop policy if exists "public may submit study response" on public.study_submissions;
create policy "public may submit study response" on public.study_submissions
for insert to anon, authenticated with check (
  length(participant_id) between 1 and 100 and length(session_id) between 1 and 100
  and survey_version in ('1.1', '2.0-JP', '3.0-JP-Taito', '3.1-JP-Taito-Flex') and jsonb_typeof(delivery_information) = 'object'
  and jsonb_typeof(survey_responses) = 'object' and jsonb_typeof(event_log) = 'array'
);
-- SELECT 정책은 만들지 않습니다. 공개 웹페이지는 응답을 읽을 수 없습니다.
create index if not exists study_submissions_received_at_idx on public.study_submissions (received_at desc);
create index if not exists study_submissions_participant_idx on public.study_submissions (participant_id);
alter table public.study_submissions add column if not exists cart_items jsonb not null default '[]'::jsonb;
