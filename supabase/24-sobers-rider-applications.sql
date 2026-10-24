-- Sobers Pizza: rider applications and admin approval.
-- Additive only. Does not change queue, accept, pickup, or completion.
-- Safe to run more than once. Does not delete riders, orders, or accounts.
-- A rider is active only after this business approves the application.

alter table public.delivery_riders
    add column if not exists approval_status text;

update public.delivery_riders
set approval_status = case when is_active then 'approved' else 'suspended' end
where approval_status is null
   or approval_status not in ('pending', 'approved', 'rejected', 'suspended');

alter table public.delivery_riders
    alter column approval_status set default 'pending';

alter table public.delivery_riders
    alter column approval_status set not null;

update public.delivery_riders
set is_active = (approval_status = 'approved')
where is_active is distinct from (approval_status = 'approved');

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'delivery_riders_approval_status_check'
          and conrelid = 'public.delivery_riders'::regclass
    ) then
        alter table public.delivery_riders
            add constraint delivery_riders_approval_status_check
            check (approval_status in ('pending', 'approved', 'rejected', 'suspended'));
    end if;
end $$;

create or replace function public.sobers_submit_rider_application(p_business_slug text default 'sobers-pizza')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    biz uuid;
    rider_name text;
    rider_phone text;
    current_status text;
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    if nullif(trim(coalesce(p_business_slug, '')), '') is null then
        raise exception 'Business is required';
    end if;
    select b.id into biz
    from public.businesses b
    where b.slug = trim(p_business_slug)
      and b.status = 'active';
    if biz is null then
        raise exception 'Business was not found';
    end if;
    select
        coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
        nullif(trim(coalesce(u.raw_user_meta_data->>'phone', '')), '')
    into rider_name, rider_phone
    from auth.users u
    where u.id = auth.uid();
    if rider_name is null then
        raise exception 'Rider name is required';
    end if;
    insert into public.delivery_riders (business_id, profile_id, display_name, phone, is_active, is_available, approval_status)
    values (biz, auth.uid(), rider_name, rider_phone, false, false, 'pending')
    on conflict (business_id, profile_id) do nothing;
    select r.approval_status into current_status
    from public.delivery_riders r
    where r.business_id = biz
      and r.profile_id = auth.uid();
    return current_status;
end;
$$;

create or replace function public.sobers_my_rider_status()
returns table (
    business_slug text,
    display_name text,
    phone text,
    approval_status text,
    is_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    return query
    select b.slug, r.display_name, r.phone, r.approval_status, r.is_available
    from public.delivery_riders r
    join public.businesses b on b.id = r.business_id
    where r.profile_id = auth.uid()
    order by b.slug;
end;
$$;

create or replace function public.sobers_review_rider(p_business uuid, p_rider uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected public.delivery_riders%rowtype;
    decision text;
    next_status text;
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    select * into selected
    from public.delivery_riders
    where id = p_rider
      and business_id = p_business;
    if not found then
        raise exception 'Rider not found';
    end if;
    decision := lower(trim(coalesce(p_decision, '')));
    if decision = 'approve' and selected.approval_status in ('pending', 'rejected') then
        next_status := 'approved';
    elsif decision = 'reject' and selected.approval_status = 'pending' then
        next_status := 'rejected';
    elsif decision = 'suspend' and selected.approval_status = 'approved' then
        next_status := 'suspended';
    elsif decision = 'reactivate' and selected.approval_status = 'suspended' then
        next_status := 'approved';
    else
        raise exception 'That decision is not available for this rider';
    end if;
    if next_status = 'suspended' and exists (
        select 1 from public.platform_orders o
        where o.rider_id = selected.id
          and o.status::text in ('ready', 'out_for_delivery')
    ) then
        raise exception 'This rider still has an active delivery. Suspend them after it is completed.';
    end if;
    update public.delivery_riders
    set approval_status = next_status,
        is_active = (next_status = 'approved'),
        is_available = case when next_status = 'approved' then is_available else false end
    where id = selected.id
      and business_id = p_business;
    return next_status;
end;
$$;

create or replace function public.sobers_save_rider(p_business uuid, p_email text, p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    raise exception 'Riders apply from the rider app. Approve the pending application instead.';
end;
$$;

drop function if exists public.sobers_list_riders(uuid);

create or replace function public.sobers_list_riders(p_business uuid)
returns table (
    id uuid,
    display_name text,
    phone text,
    email text,
    is_active boolean,
    is_available boolean,
    approval_status text,
    current_order text,
    completed_deliveries bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    return query
    select r.id, r.display_name, r.phone, u.email::text, r.is_active, r.is_available, r.approval_status,
        (
            select o.order_number
            from public.platform_orders o
            where o.rider_id = r.id
              and o.business_id = p_business
              and o.status::text in ('ready', 'out_for_delivery')
            order by o.updated_at desc
            limit 1
        ),
        (
            select count(*)
            from public.platform_orders o
            where o.rider_id = r.id
              and o.business_id = p_business
              and o.status::text = 'completed'
        )
    from public.delivery_riders r
    left join auth.users u on u.id = r.profile_id
    where r.business_id = p_business
    order by
        case r.approval_status
            when 'pending' then 0
            when 'approved' then 1
            when 'suspended' then 2
            else 3
        end,
        r.display_name;
end;
$$;

create or replace function public.sobers_create_rider_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    slug text;
    biz uuid;
    rider_name text;
    rider_phone text;
begin
    if coalesce(new.raw_user_meta_data->>'account_type', '') <> 'rider' then
        return new;
    end if;
    slug := nullif(trim(coalesce(new.raw_user_meta_data->>'business_slug', 'sobers-pizza')), '');
    select b.id into biz
    from public.businesses b
    where b.slug = slug
      and b.status = 'active';
    if biz is null then
        return new;
    end if;
    rider_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
    rider_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
    if rider_name is null then
        rider_name := split_part(coalesce(new.email, 'rider'), '@', 1);
    end if;
    insert into public.delivery_riders (business_id, profile_id, display_name, phone, is_active, is_available, approval_status)
    values (biz, new.id, rider_name, rider_phone, false, false, 'pending')
    on conflict (business_id, profile_id) do nothing;
    return new;
exception
    when others then
        -- Server log only. SQLSTATE has no email, phone, name, or row contents.
        raise log 'sobers_create_rider_application failed sqlstate=%', sqlstate;
        return new;
end;
$$;

do $$
begin
    execute 'drop trigger if exists sobers_rider_application_on_signup on auth.users';
    execute 'create trigger sobers_rider_application_on_signup after insert on auth.users for each row execute function public.sobers_create_rider_application()';
exception
    when insufficient_privilege then
        raise notice 'Signup trigger was not attached. The rider app still files the application at first sign-in.';
end $$;

revoke all on function public.sobers_submit_rider_application(text) from public, anon;
revoke all on function public.sobers_my_rider_status() from public, anon;
revoke all on function public.sobers_review_rider(uuid, uuid, text) from public, anon;
revoke all on function public.sobers_list_riders(uuid) from public, anon;
revoke all on function public.sobers_save_rider(uuid, text, text, text) from public, anon;
revoke all on function public.sobers_create_rider_application() from public, anon, authenticated;

grant execute on function public.sobers_submit_rider_application(text) to authenticated;
grant execute on function public.sobers_my_rider_status() to authenticated;
grant execute on function public.sobers_review_rider(uuid, uuid, text) to authenticated;
grant execute on function public.sobers_list_riders(uuid) to authenticated;
grant execute on function public.sobers_save_rider(uuid, text, text, text) to authenticated;
