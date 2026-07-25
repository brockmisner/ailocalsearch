create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null, name text not null, target_name text not null,
  target_place_id text, target_cid text, target_domain text, center_latitude numeric(10,7) not null,
  center_longitude numeric(10,7) not null, country_code text not null default 'US', city text, postal_code text,
  default_grid_size integer not null default 5 check (default_grid_size between 3 and 15 and default_grid_size % 2 = 1),
  default_spacing_km numeric(8,3) not null default 1.0 check (default_spacing_km > 0), created_at timestamptz not null default now()
);
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, keyword text not null, target_name text not null,
  target_place_id text, center_latitude numeric(10,7) not null, center_longitude numeric(10,7) not null,
  grid_size integer not null, spacing_km numeric(8,3) not null, point_count integer not null, credit_cost integer not null,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  idempotency_key text not null, average_rank numeric(8,2), share_of_local_voice numeric(8,2), found_rate numeric(8,2),
  completed_points integer not null default 0, failed_points integer not null default 0, created_at timestamptz not null default now(), completed_at timestamptz,
  unique (organization_id,idempotency_key)
);
create table if not exists public.scan_points (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade, row_number integer not null, column_number integer not null,
  latitude numeric(10,7) not null, longitude numeric(10,7) not null, observed_latitude numeric(10,7), observed_longitude numeric(10,7),
  geo_distance_km numeric(9,3), geo_verified boolean not null default false, status text not null default 'queued', target_rank integer,
  screenshot_path text, ui_dump_path text, screenshot_sha256 text, provider_task_id text, completed_at timestamptz,
  unique(scan_id,row_number,column_number)
);
create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade, point_id uuid not null unique references public.scan_points(id) on delete cascade,
  keyword text not null, latitude numeric(10,7) not null, longitude numeric(10,7) not null, country_code text, city text, postal_code text,
  status text not null default 'queued', attempts integer not null default 0, max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(), claim_token uuid, claimed_at timestamptz, phone_id text,
  proxy_session_id text, provider_task_id text unique, dispatched_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create table if not exists public.observed_listings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  point_id uuid not null references public.scan_points(id) on delete cascade, rank integer not null, name text not null, place_id text,
  address text, rating numeric(3,2), review_count integer, created_at timestamptz not null default now(), unique(point_id,rank)
);
create table if not exists public.android_devices (
  phone_id text primary key, provider text not null default 'duoplus', device_kind text, status text not null default 'available',
  locked_by_job_id uuid references public.scan_jobs(id) on delete set null, locked_at timestamptz, last_seen_at timestamptz, metadata jsonb not null default '{}'
);
create table if not exists public.provider_webhook_events (
  provider text not null, event_id text not null, received_at timestamptz not null default now(), primary key(provider,event_id)
);

alter table public.campaigns enable row level security; alter table public.scans enable row level security; alter table public.scan_points enable row level security; alter table public.scan_jobs enable row level security; alter table public.observed_listings enable row level security; alter table public.android_devices enable row level security; alter table public.provider_webhook_events enable row level security;
create policy "tenant campaigns" on public.campaigns for all to authenticated using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid())) with check (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
create policy "tenant scans read" on public.scans for select to authenticated using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
create policy "tenant points read" on public.scan_points for select to authenticated using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));
create policy "tenant listings read" on public.observed_listings for select to authenticated using (organization_id in (select organization_id from public.organization_members where user_id=auth.uid()));

create or replace function public.create_scan_with_points(p_organization_id uuid,p_campaign_id uuid,p_keyword text,p_target_name text,p_target_place_id text,p_center_latitude numeric,p_center_longitude numeric,p_grid_size integer,p_spacing_km numeric,p_idempotency_key text,p_points jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ declare v_scan_id uuid; v_cost integer; v_wallet record; begin
 if auth.uid() is not null and not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid()) then raise exception 'membership required'; end if;
 select id into v_scan_id from public.scans where organization_id=p_organization_id and idempotency_key=p_idempotency_key; if v_scan_id is not null then return jsonb_build_object('scanId',v_scan_id,'idempotent',true); end if;
 v_cost:=jsonb_array_length(p_points); select * into v_wallet from public.reserve_credits(p_organization_id,v_cost,'map_grid',p_idempotency_key,jsonb_build_object('campaignId',p_campaign_id)); if not v_wallet.allowed then raise exception 'insufficient credits'; end if;
 insert into public.scans(organization_id,campaign_id,keyword,target_name,target_place_id,center_latitude,center_longitude,grid_size,spacing_km,point_count,credit_cost,idempotency_key) values(p_organization_id,p_campaign_id,p_keyword,p_target_name,p_target_place_id,p_center_latitude,p_center_longitude,p_grid_size,p_spacing_km,v_cost,v_cost,p_idempotency_key) returning id into v_scan_id;
 insert into public.scan_points(organization_id,scan_id,row_number,column_number,latitude,longitude) select p_organization_id,v_scan_id,(x->>'row')::int,(x->>'column')::int,(x->>'latitude')::numeric,(x->>'longitude')::numeric from jsonb_array_elements(p_points) x;
 insert into public.scan_jobs(organization_id,scan_id,point_id,keyword,latitude,longitude,country_code,city,postal_code) select p_organization_id,v_scan_id,sp.id,p_keyword,sp.latitude,sp.longitude,c.country_code,c.city,c.postal_code from public.scan_points sp join public.campaigns c on c.id=p_campaign_id where sp.scan_id=v_scan_id;
 return jsonb_build_object('scanId',v_scan_id,'pointCount',v_cost,'creditCost',v_cost,'idempotent',false); end $$;
revoke all on function public.create_scan_with_points(uuid,uuid,text,text,text,numeric,numeric,integer,numeric,text,jsonb) from public,anon; grant execute on function public.create_scan_with_points(uuid,uuid,text,text,text,numeric,numeric,integer,numeric,text,jsonb) to service_role;

create or replace function public.claim_scan_jobs(p_limit integer default 5) returns setof public.scan_jobs language plpgsql security definer set search_path='' as $$ begin return query update public.scan_jobs j set status='claimed',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 where j.id in(select id from public.scan_jobs where status in('queued','retry') and next_attempt_at<=now() order by created_at for update skip locked limit p_limit) returning j.*; end $$;
revoke all on function public.claim_scan_jobs(integer) from public,anon,authenticated; grant execute on function public.claim_scan_jobs(integer) to service_role;

create or replace function public.claim_android_device(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare v_phone text; begin select phone_id into v_phone from public.android_devices where status='available' order by last_seen_at desc nulls last for update skip locked limit 1; if v_phone is null then return '{}'::jsonb; end if; update public.android_devices set status='busy',locked_by_job_id=p_job_id,locked_at=now() where phone_id=v_phone; return jsonb_build_object('phone_id',v_phone); end $$;
revoke all on function public.claim_android_device(uuid) from public,anon,authenticated; grant execute on function public.claim_android_device(uuid) to service_role;

create or replace function public.fail_or_retry_scan_job(p_job_id uuid,p_error text) returns void language plpgsql security definer set search_path='' as $$ declare j public.scan_jobs; begin select * into j from public.scan_jobs where id=p_job_id for update; update public.android_devices set status='available',locked_by_job_id=null,locked_at=null where locked_by_job_id=p_job_id; if j.attempts>=j.max_attempts then update public.scan_jobs set status='failed',last_error=p_error where id=p_job_id; update public.scan_points set status='failed',completed_at=now() where id=j.point_id; else update public.scan_jobs set status='retry',last_error=p_error,next_attempt_at=now()+make_interval(secs=>least(900,30*power(2,j.attempts)::int)) where id=p_job_id; end if; end $$;
revoke all on function public.fail_or_retry_scan_job(uuid,text) from public,anon,authenticated; grant execute on function public.fail_or_retry_scan_job(uuid,text) to service_role;

create or replace function public.complete_scan_point(p_event_id text,p_provider_task_id text,p_point_id uuid,p_status text,p_observed_latitude numeric,p_observed_longitude numeric,p_screenshot_path text,p_ui_dump_path text,p_screenshot_sha256 text,p_listings jsonb,p_error text) returns void language plpgsql security definer set search_path='' as $$ declare p public.scan_points; j public.scan_jobs; s public.scans; target_rank integer; dist numeric; avg_rank numeric; solv numeric; found numeric; begin
 insert into public.provider_webhook_events(provider,event_id) values('duoplus',p_event_id) on conflict do nothing; if not found then return; end if;
 select * into p from public.scan_points where id=p_point_id for update; select * into j from public.scan_jobs where point_id=p_point_id for update; select * into s from public.scans where id=p.scan_id for update;
 if p_status='completed' then
  if p_observed_latitude is not null and p_observed_longitude is not null then dist:=6371.0088*2*asin(sqrt(power(sin(radians(p_observed_latitude-p.latitude)/2),2)+cos(radians(p.latitude))*cos(radians(p_observed_latitude))*power(sin(radians(p_observed_longitude-p.longitude)/2),2))); end if;
  insert into public.observed_listings(organization_id,point_id,rank,name,place_id,address,rating,review_count) select p.organization_id,p.id,(x->>'rank')::int,x->>'name',x->>'placeId',x->>'address',nullif(x->>'rating','')::numeric,nullif(x->>'reviewCount','')::int from jsonb_array_elements(p_listings) x on conflict(point_id,rank) do update set name=excluded.name,place_id=excluded.place_id,address=excluded.address,rating=excluded.rating,review_count=excluded.review_count;
  select min(rank) into target_rank from public.observed_listings where point_id=p.id and ((s.target_place_id is not null and place_id=s.target_place_id) or lower(name)=lower(s.target_name));
  update public.scan_points set status='completed',observed_latitude=p_observed_latitude,observed_longitude=p_observed_longitude,geo_distance_km=dist,geo_verified=coalesce(dist<=2,false),target_rank=target_rank,screenshot_path=p_screenshot_path,ui_dump_path=p_ui_dump_path,screenshot_sha256=p_screenshot_sha256,provider_task_id=p_provider_task_id,completed_at=now() where id=p.id;
  update public.scan_jobs set status='completed' where id=j.id;
 else update public.scan_points set status='failed',completed_at=now() where id=p.id; update public.scan_jobs set status='failed',last_error=p_error where id=j.id; end if;
 update public.android_devices set status='available',locked_by_job_id=null,locked_at=null,last_seen_at=now() where locked_by_job_id=j.id;
 select avg(target_rank) filter(where geo_verified and target_rank is not null), coalesce(avg(case when geo_verified then case when target_rank is null then 0 else greatest(0,(21-target_rank)::numeric/20) end end)*100,0), coalesce(avg(case when geo_verified then case when target_rank is null then 0 else 1 end end)*100,0) into avg_rank,solv,found from public.scan_points where scan_id=s.id;
 update public.scans set completed_points=(select count(*) from public.scan_points where scan_id=s.id and status='completed'),failed_points=(select count(*) from public.scan_points where scan_id=s.id and status='failed'),average_rank=round(avg_rank,2),share_of_local_voice=round(solv,2),found_rate=round(found,2),status=case when (select count(*) from public.scan_points where scan_id=s.id and status in('queued','claimed','dispatched','retry'))=0 then case when (select count(*) from public.scan_points where scan_id=s.id and status='completed')=0 then 'failed' when (select count(*) from public.scan_points where scan_id=s.id and status='failed')>0 then 'partial' else 'completed' end else 'running' end,completed_at=case when (select count(*) from public.scan_points where scan_id=s.id and status in('queued','claimed','dispatched','retry'))=0 then now() else null end where id=s.id;
 end $$;
revoke all on function public.complete_scan_point(text,text,uuid,text,numeric,numeric,text,text,text,jsonb,text) from public,anon,authenticated; grant execute on function public.complete_scan_point(text,text,uuid,text,numeric,numeric,text,text,text,jsonb,text) to service_role;

create index if not exists scan_jobs_dispatch_idx on public.scan_jobs(status,next_attempt_at,created_at); create index if not exists scan_points_scan_idx on public.scan_points(scan_id); create index if not exists observed_listings_point_idx on public.observed_listings(point_id);
