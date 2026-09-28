-- Sobers Pizza: instant customer tracking references and live status lookup.
-- Safe to run more than once. This migration is mirrored from staging/supabase.

create or replace function public.create_public_order_v2(
    business_slug text,
    customer_name text,
    customer_phone text,
    fulfilment public.fulfilment_type,
    delivery_address text default null,
    customer_note text default null,
    requested_items jsonb default '[]'::jsonb,
    branch_code text default null,
    client_request_id text default null
)
returns table (order_id uuid, order_number text, order_total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_order public.platform_orders%rowtype;
    created_order record;
    clean_request_id text := upper(trim(coalesce(client_request_id, '')));
begin
    if clean_request_id !~ '^WEB-[A-Z0-9-]{8,40}$' then
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

    select * into created_order
    from public.create_public_order(
        business_slug,
        customer_name,
        customer_phone,
        fulfilment,
        delivery_address,
        customer_note,
        requested_items,
        branch_code
    );

    update public.platform_orders
    set client_request_id = clean_request_id
    where id = created_order.order_id;

    return query select created_order.order_id, created_order.order_number, created_order.order_total;
end;
$$;

revoke all on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,text) from public;
grant execute on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,text) to anon, authenticated;

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
        or upper(trim(coalesce(o.client_request_id, ''))) = upper(trim(p_order_number))
      )
      and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') =
          regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    limit 1;

    if not found then return null; end if;

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
