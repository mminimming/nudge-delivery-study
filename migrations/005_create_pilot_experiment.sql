-- 공유 실험 링크 생성용. 한 번만 실행하고 반환된 id를 보관하세요.
insert into public.routing_experiments(label, delivery_date, model_version)
values ('Taito dynamic delivery pilot', (current_date + 1), 'taito-flex-v2.1-empty')
returning id, label, delivery_date, model_version, revision;
