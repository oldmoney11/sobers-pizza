-- Sobers Pizza launch controls: branch pauses, preparation estimates and richer tracking.
-- Safe to run more than once.

alter table public.branches
  add column if not exists accepting_orders boolean not null default true,
  add column if not exists prep_min_minutes integer not null default 20,
  add column if not exists prep_max_minutes integer not null default 30;

alter table public.branches drop constraint if exists branches_prep_minutes_check;
alter table public.branches add constraint branches_prep_minutes_check
  check (
    prep_min_minutes between 5 and 180
    and prep_max_minutes between prep_min_minutes and 240
  );

update public.branches br
set accepting_orders = coalesce(br.accepting_orders, true),
    prep_min_minutes = coalesce(br.prep_min_minutes, 20),
    prep_max_minutes = coalesce(br.prep_max_minutes, 30)
from public.businesses biz
where biz.id = br.business_id
  and biz.slug = 'sobers-pizza';

create or replace function public.create_public_order_v2(
    business_slug text,
    customer_name text,
    customer_phone text,
    fulfilment public.fulfilment_type,
    delivery_address text default null,
    customer_note text default null,
    requested_items jsonb default '[]'::jsonb,
    branch_code text default null,
    client_request_id uuid default null
)
returns table (order_id uuid, order_number text, order_total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_order public.platform_orders%rowtype;
    selected_branch public.branches%rowtype;
    created_order record;
    clean_request_id uuid := client_request_id;
begin
    if clean_request_id is null then
        raise exception 'A valid customer tracking reference is required';
    end if;

    select o.* into existing_order
    from public.platform_orders o
    join public.businesses b on b.id = o.business_id
    where b.slug = business_slug
      and o.client_request_id = clean_request_id
    limit 1;

    if found then
        return query select existing_order.id, existing_order.order_number, existing_order.total;
        return;
    end if;

    select br.* into selected_branch
    from public.branches br
    join public.businesses b on b.id = br.business_id
    where b.slug = business_slug
      and b.status = 'active'
      and br.is_active = true
      and br.code = coalesce(nullif(trim(branch_code), ''), 'MAIN-BRANCH')
    limit 1;

    if not found then
        raise exception 'The selected branch is unavailable';
    end if;

    if not selected_branch.accepting_orders then
        raise exception 'Online orders are paused for this branch';
    end if;

    select * into created_order
    from public.create_public_order(
        business_slug,
        customer_name,
        customer_phone,
        fulfilment,
        delivery_address,
        customer_note,
        requested_items,
        selected_branch.code
    );

    update public.platform_orders
    set client_request_id = clean_request_id
    where id = created_order.order_id;

    return query select created_order.order_id, created_order.order_number, created_order.order_total;
end;
$$;

revoke all on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) from public;
grant execute on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) to anon, authenticated;

create or replace function public.track_public_order(
    p_business_slug text,
    p_order_number text,
    p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected_order public.platform_orders%rowtype;
    selected_branch public.branches%rowtype;
    result jsonb;
begin
    if nullif(trim(p_order_number), '') is null
       or length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 7 then
        return null;
    end if;

    select o.* into selected_order
    from public.platform_orders o
    join public.businesses b on b.id = o.business_id
    where b.slug = p_business_slug
      and b.status = 'active'
      and (
        upper(trim(o.order_number)) = upper(trim(p_order_number))
        or lower(o.client_request_id::text) = lower(trim(p_order_number))
      )
      and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') =
          regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    limit 1;

    if not found then return null; end if;

    select br.* into selected_branch
    from public.branches br
    where br.id = selected_order.branch_id
    limit 1;

    select jsonb_build_object(
        'order_number', selected_order.order_number,
        'tracking_reference', selected_order.client_request_id,
        'display_order_number', selected_order.display_order_number,
        'status', selected_order.status,
        'payment_status', selected_order.payment_status,
        'fulfilment', selected_order.fulfilment,
        'source', selected_order.source,
        'subtotal', selected_order.subtotal,
        'delivery_fee', selected_order.delivery_fee,
        'discount_total', selected_order.discount_total,
        'total', selected_order.total,
        'currency_code', selected_order.currency_code,
        'created_at', selected_order.created_at,
        'updated_at', selected_order.updated_at,
        'branch_name', selected_branch.name,
        'branch_address', selected_branch.address,
        'branch_phone', selected_branch.phone,
        'branch_whatsapp_number', selected_branch.whatsapp_number,
        'prep_min_minutes', selected_branch.prep_min_minutes,
        'prep_max_minutes', selected_branch.prep_max_minutes,
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                'name', i.product_name,
                'quantity', i.quantity,
                'unit_price', i.unit_price,
                'selected_options', i.selected_options,
                'line_total', i.line_total
            ) order by i.created_at)
            from public.platform_order_items i
            where i.business_id = selected_order.business_id
              and i.order_id = selected_order.id
        ), '[]'::jsonb)
    ) into result;

    return result;
end;
$$;

revoke all on function public.track_public_order(text,text,text) from public;
grant execute on function public.track_public_order(text,text,text) to anon, authenticated;
