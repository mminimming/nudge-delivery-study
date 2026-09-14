-- Apply in Supabase SQL Editor before collecting the new survey version remotely.
-- Keeps all existing rows and permits the previously used versions as well.
begin;
alter table public.study_submissions add column if not exists cart_items jsonb not null default '[]'::jsonb;
drop policy if exists "public may submit study response" on public.study_submissions;
create policy "public may submit study response" on public.study_submissions
for insert to anon, authenticated with check (
  length(participant_id) between 1 and 100 and length(session_id) between 1 and 100
  and survey_version in ('1.1', '2.0-JP', '3.0-JP-Taito', '3.1-JP-Taito-Flex')
  and jsonb_typeof(delivery_information) = 'object'
  and jsonb_typeof(survey_responses) = 'object'
  and jsonb_typeof(event_log) = 'array'
);
commit;
