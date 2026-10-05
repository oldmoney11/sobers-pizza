-- Sobers security hardening. Review before applying to the shared live project.
begin;
create schema if not exists sobers_private;
revoke all on schema sobers_private from public, anon, authenticated;
do $backup$ begin if to_regprocedure('sobers_private.create_kiosk_order(text,text,text,fulfilment_type,jsonb,uuid,text,text,text)') is null then execute $definition$CREATE OR REPLACE FUNCTION sobers_private.create_kiosk_order(p_business_slug text, p_branch_code text, p_kiosk_code text, p_fulfilment fulfilment_type, p_requested_items jsonb, p_client_request_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_note text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, display_order_number text, order_total numeric, payment_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_branch public.branches%rowtype;
 selected_kiosk public.kiosks%rowtype;
 selected_product public.products%rowtype;
 existing_order public.platform_orders%rowtype;
 saved_order_id uuid;
 saved_order_number text;
 saved_display_number text;
 resolved_items jsonb := '[]'::jsonb;
 item jsonb;
 selected_options jsonb;
 option_group record;
 option_choice text;
 option_price numeric;
 quantity integer;
 unit_price numeric;
 line_total numeric;
 subtotal numeric := 0;
begin
 if p_client_request_id is null then
 raise exception 'A request identifier is required';
 end if;

 if p_fulfilment not in ('dine_in', 'takeaway') then
 raise exception 'Kiosk orders must be dine-in or takeaway';
 end if;

 if jsonb_typeof(p_requested_items) <> 'array'
 or jsonb_array_length(p_requested_items) = 0
 or jsonb_array_length(p_requested_items) > 50 then
 raise exception 'Order must contain between 1 and 50 items';
 end if;

 select b.* into selected_business
 from public.businesses b
 where b.slug = p_business_slug and b.status = 'active';
 if not found then raise exception 'Business is not available'; end if;

 select o.* into existing_order
 from public.platform_orders o
 where o.business_id = selected_business.id
 and o.client_request_id = p_client_request_id;
 if found then
 return query select existing_order.id, existing_order.order_number,
 existing_order.display_order_number, existing_order.total,
 existing_order.payment_status;
 return;
 end if;

 select s.* into selected_settings
 from public.business_settings s
 where s.business_id = selected_business.id
 for update;
 if not found then raise exception 'Business ordering settings are unavailable'; end if;

 select b.* into selected_branch
 from public.branches b
 where b.business_id = selected_business.id
 and b.code = p_branch_code and b.is_active;
 if not found then raise exception 'Branch is not available'; end if;

 select k.* into selected_kiosk
 from public.kiosks k
 where k.business_id = selected_business.id
 and k.branch_id = selected_branch.id
 and k.code = p_kiosk_code and k.is_active
 for update;
 if not found then raise exception 'Kiosk is not available'; end if;

 for item in select value from jsonb_array_elements(p_requested_items)
 loop
 begin
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 exception when others then
 raise exception 'Each item quantity must be a whole number';
 end;
 if quantity < 1 or quantity > 20 then
 raise exception 'Each item quantity must be between 1 and 20';
 end if;

 select p.* into selected_product
 from public.products p
 where p.business_id = selected_business.id
 and p.slug = item ->> 'product_key'
 and p.is_active and p.is_available;
 if not found then raise exception 'A requested product is unavailable'; end if;

 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then
 raise exception 'Selected options must be an object';
 end if;

 unit_price := selected_product.base_price;
 for option_group in select key, value from jsonb_each(selected_options)
 loop
 if selected_product.options -> option_group.key is null then
 raise exception 'A requested option group is invalid';
 end if;

 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in select value from jsonb_array_elements_text(option_group.value)
 loop
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 else
 raise exception 'A requested option value is invalid';
 end if;
 end loop;

 line_total := unit_price * quantity;
 subtotal := subtotal + line_total;
 resolved_items := resolved_items || jsonb_build_array(jsonb_build_object(
 'product_id', selected_product.id,
 'product_key', selected_product.slug,
 'product_name', selected_product.name,
 'quantity', quantity,
 'unit_price', unit_price,
 'selected_options', selected_options,
 'line_total', line_total
 ));
 end loop;

 saved_order_number := selected_settings.order_prefix || selected_settings.next_order_number;
 saved_display_number := selected_kiosk.display_prefix || lpad(selected_kiosk.next_display_number::text, 3, '0');

 update public.business_settings
 set next_order_number = next_order_number + 1, updated_at = now()
 where business_id = selected_business.id;

 update public.kiosks
 set next_display_number = next_display_number + 1, updated_at = now()
 where id = selected_kiosk.id;

 insert into public.platform_orders (
 business_id, branch_id, kiosk_id, order_number, display_order_number,
 client_request_id, status, fulfilment, source,
 customer_name, customer_phone, customer_note,
 subtotal, delivery_fee, discount_total, total, currency_code,
 payment_status
 ) values (
 selected_business.id, selected_branch.id, selected_kiosk.id,
 saved_order_number, saved_display_number, p_client_request_id,
 'new', p_fulfilment, 'kiosk',
 coalesce(nullif(trim(p_customer_name), ''), 'Kiosk Guest'),
 coalesce(nullif(trim(p_customer_phone), ''), 'Not provided'),
 nullif(trim(coalesce(p_customer_note, '')), ''),
 subtotal, 0, 0, subtotal, selected_business.currency_code, 'unpaid'
 ) returning id into saved_order_id;

 for item in select value from jsonb_array_elements(resolved_items)
 loop
 insert into public.platform_order_items (
 order_id, business_id, product_id, product_key, product_name,
 quantity, unit_price, selected_options, line_total
 ) values (
 saved_order_id, selected_business.id, (item ->> 'product_id')::uuid,
 item ->> 'product_key', item ->> 'product_name',
 (item ->> 'quantity')::integer, (item ->> 'unit_price')::numeric,
 item -> 'selected_options', (item ->> 'line_total')::numeric
 );
 end loop;

 return query select saved_order_id, saved_order_number, saved_display_number,
 subtotal, 'unpaid'::text;
end;
$function$
$definition$; end if; end $backup$;
do $backup$ begin if to_regprocedure('sobers_private.create_public_order(text,text,text,fulfilment_type,text,text,jsonb)') is null then execute $definition$CREATE OR REPLACE FUNCTION sobers_private.create_public_order(business_slug text, customer_name text, customer_phone text, fulfilment fulfilment_type, delivery_address text DEFAULT NULL::text, customer_note text DEFAULT NULL::text, requested_items jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(order_id uuid, order_number text, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_product public.products%rowtype;
 saved_customer_id uuid;
 saved_order_id uuid;
 saved_order_number text;
 item jsonb;
 resolved_items jsonb := '[]'::jsonb;
 selected_options jsonb;
 option_group record;
 option_choice text;
 option_price numeric;
 quantity integer;
 unit_price numeric;
 line_total numeric;
 subtotal numeric := 0;
 final_total numeric := 0;
begin
 if nullif(trim(customer_name), '') is null then
 raise exception 'Customer name is required';
 end if;

 if nullif(trim(customer_phone), '') is null then
 raise exception 'Customer phone is required';
 end if;

 if fulfilment = 'delivery'
 and nullif(trim(coalesce(delivery_address, '')), '') is null then
 raise exception 'Delivery address is required';
 end if;

 if jsonb_typeof(requested_items) <> 'array'
 or jsonb_array_length(requested_items) = 0
 or jsonb_array_length(requested_items) > 50 then
 raise exception 'Order must contain between 1 and 50 items';
 end if;

 select b.* into selected_business
 from public.businesses b
 where b.slug = business_slug
 and b.status = 'active';

 if not found then
 raise exception 'Business is not available';
 end if;

 select s.* into selected_settings
 from public.business_settings s
 where s.business_id = selected_business.id
 for update;

 if not found then
 raise exception 'Business ordering settings are unavailable';
 end if;

 if fulfilment = 'delivery' and not selected_settings.delivery_enabled then
 raise exception 'Delivery is not available';
 end if;

 if fulfilment = 'pickup' and not selected_settings.pickup_enabled then
 raise exception 'Pickup is not available';
 end if;

 for item in select value from jsonb_array_elements(requested_items)
 loop
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 if quantity < 1 or quantity > 20 then
 raise exception 'Each item quantity must be between 1 and 20';
 end if;

 select p.* into selected_product
 from public.products p
 where p.business_id = selected_business.id
 and p.slug = item ->> 'product_key'
 and p.is_active
 and p.is_available;

 if not found then
 raise exception 'A requested product is unavailable';
 end if;

 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then
 raise exception 'Selected options must be an object';
 end if;

 unit_price := selected_product.base_price;

 for option_group in select key, value from jsonb_each(selected_options)
 loop
 if selected_product.options -> option_group.key is null then
 raise exception 'A requested option group is invalid';
 end if;

 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in
 select value from jsonb_array_elements_text(option_group.value)
 loop
 option_price := (
 selected_product.options
 -> option_group.key -> 2 -> option_choice ->> 1
 )::numeric;
 if option_price is null then
 raise exception 'A requested option is invalid';
 end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (
 selected_product.options
 -> option_group.key -> 2 -> option_choice ->> 1
 )::numeric;
 if option_price is null then
 raise exception 'A requested option is invalid';
 end if;
 unit_price := unit_price + option_price;
 else
 raise exception 'A requested option value is invalid';
 end if;
 end loop;

 line_total := unit_price * quantity;
 subtotal := subtotal + line_total;

 resolved_items := resolved_items || jsonb_build_array(
 jsonb_build_object(
 'product_id', selected_product.id,
 'product_key', selected_product.slug,
 'product_name', selected_product.name,
 'quantity', quantity,
 'unit_price', unit_price,
 'selected_options', selected_options,
 'line_total', line_total
 )
 );
 end loop;

 saved_order_number :=
 selected_settings.order_prefix || selected_settings.next_order_number;

 update public.business_settings
 set next_order_number = next_order_number + 1
 where business_id = selected_business.id;

 insert into public.customers (
 business_id, full_name, phone, default_address
 ) values (
 selected_business.id,
 trim(customer_name),
 trim(customer_phone),
 nullif(trim(coalesce(delivery_address, '')), '')
 )
 on conflict (business_id, phone) do update
 set full_name = excluded.full_name,
 default_address = coalesce(excluded.default_address, public.customers.default_address)
 returning id into saved_customer_id;

 final_total := subtotal + selected_settings.default_delivery_fee;

 insert into public.platform_orders (
 business_id,
 customer_id,
 order_number,
 status,
 fulfilment,
 source,
 customer_name,
 customer_phone,
 delivery_address,
 customer_note,
 subtotal,
 delivery_fee,
 discount_total,
 total,
 currency_code
 ) values (
 selected_business.id,
 saved_customer_id,
 saved_order_number,
 'new',
 fulfilment,
 'pwa',
 trim(customer_name),
 trim(customer_phone),
 nullif(trim(coalesce(delivery_address, '')), ''),
 nullif(trim(coalesce(customer_note, '')), ''),
 subtotal,
 selected_settings.default_delivery_fee,
 0,
 final_total,
 selected_business.currency_code
 ) returning id into saved_order_id;

 for item in select value from jsonb_array_elements(resolved_items)
 loop
 insert into public.platform_order_items (
 order_id,
 business_id,
 product_id,
 product_key,
 product_name,
 quantity,
 unit_price,
 selected_options,
 line_total
 ) values (
 saved_order_id,
 selected_business.id,
 (item ->> 'product_id')::uuid,
 item ->> 'product_key',
 item ->> 'product_name',
 (item ->> 'quantity')::integer,
 (item ->> 'unit_price')::numeric,
 item -> 'selected_options',
 (item ->> 'line_total')::numeric
 );
 end loop;

 return query select saved_order_id, saved_order_number, final_total;
end;
$function$
$definition$; end if; end $backup$;
do $backup$ begin if to_regprocedure('sobers_private.create_public_order(text,text,text,fulfilment_type,text,text,jsonb,text)') is null then execute $definition$CREATE OR REPLACE FUNCTION sobers_private.create_public_order(business_slug text, customer_name text, customer_phone text, fulfilment fulfilment_type, delivery_address text DEFAULT NULL::text, customer_note text DEFAULT NULL::text, requested_items jsonb DEFAULT '[]'::jsonb, branch_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_branch public.branches%rowtype;
 selected_product public.products%rowtype;
 saved_customer_id uuid; saved_order_id uuid; saved_order_number text;
 item jsonb; resolved_items jsonb := '[]'::jsonb; selected_options jsonb;
 option_group record; option_choice text; option_price numeric;
 quantity integer; unit_price numeric; line_total numeric;
 subtotal numeric := 0; final_total numeric := 0;
begin
 if nullif(trim(customer_name), '') is null then raise exception 'Customer name is required'; end if;
 if nullif(trim(customer_phone), '') is null then raise exception 'Customer phone is required'; end if;
 if fulfilment = 'delivery' and nullif(trim(coalesce(delivery_address, '')), '') is null then raise exception 'Delivery address is required'; end if;
 if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 or jsonb_array_length(requested_items) > 50 then raise exception 'Order must contain between 1 and 50 items'; end if;

 select b.* into selected_business from public.businesses b where b.slug = business_slug and b.status = 'active';
 if not found then raise exception 'Business is not available'; end if;
 select s.* into selected_settings from public.business_settings s where s.business_id = selected_business.id;
 if not found then raise exception 'Business ordering settings are unavailable'; end if;
 if fulfilment = 'delivery' and not selected_settings.delivery_enabled then raise exception 'Delivery is not available'; end if;
 if fulfilment = 'pickup' and not selected_settings.pickup_enabled then raise exception 'Pickup is not available'; end if;

 select br.* into selected_branch from public.branches br
 where br.business_id = selected_business.id and br.is_active
 and (upper(br.code) = upper(coalesce(nullif(trim(branch_code), ''), 'MAIN-BRANCH'))
 or (branch_code is null and upper(br.code) in ('MAIN-BRANCH','PAKOS','PAKOS-ROAD')))
 order by case when upper(br.code) = 'MAIN-BRANCH' then 0 else 1 end limit 1 for update;
 if not found then raise exception 'Selected branch is not available'; end if;

 for item in select value from jsonb_array_elements(requested_items) loop
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 if quantity < 1 or quantity > 20 then raise exception 'Each item quantity must be between 1 and 20'; end if;
 select p.* into selected_product from public.products p where p.business_id = selected_business.id and p.slug = item ->> 'product_key' and p.is_active and p.is_available;
 if not found then raise exception 'A requested product is unavailable'; end if;
 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then raise exception 'Selected options must be an object'; end if;
 unit_price := selected_product.base_price;
 for option_group in select key, value from jsonb_each(selected_options) loop
 if selected_product.options -> option_group.key is null then raise exception 'A requested option group is invalid'; end if;
 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in select value from jsonb_array_elements_text(option_group.value) loop
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 else raise exception 'A requested option value is invalid'; end if;
 end loop;
 line_total := unit_price * quantity; subtotal := subtotal + line_total;
 resolved_items := resolved_items || jsonb_build_array(jsonb_build_object('product_id', selected_product.id, 'product_key', selected_product.slug, 'product_name', selected_product.name, 'quantity', quantity, 'unit_price', unit_price, 'selected_options', selected_options, 'line_total', line_total));
 end loop;

 saved_order_number := coalesce(selected_branch.order_prefix, selected_settings.order_prefix) || selected_branch.next_order_number;
 update public.branches set next_order_number = next_order_number + 1 where id = selected_branch.id;
 insert into public.customers (business_id, full_name, phone, default_address) values (selected_business.id, trim(customer_name), trim(customer_phone), nullif(trim(coalesce(delivery_address, '')), ''))
 on conflict (business_id, phone) do update set full_name = excluded.full_name, default_address = coalesce(excluded.default_address, public.customers.default_address) returning id into saved_customer_id;
 final_total := subtotal + selected_settings.default_delivery_fee;
 insert into public.platform_orders (business_id, branch_id, customer_id, order_number, status, fulfilment, source, customer_name, customer_phone, delivery_address, customer_note, subtotal, delivery_fee, discount_total, total, currency_code)
 values (selected_business.id, selected_branch.id, saved_customer_id, saved_order_number, 'new', fulfilment, 'pwa', trim(customer_name), trim(customer_phone), nullif(trim(coalesce(delivery_address, '')), ''), nullif(trim(coalesce(customer_note, '')), ''), subtotal, selected_settings.default_delivery_fee, 0, final_total, selected_business.currency_code) returning id into saved_order_id;
 for item in select value from jsonb_array_elements(resolved_items) loop
 insert into public.platform_order_items (order_id,business_id,product_id,product_key,product_name,quantity,unit_price,selected_options,line_total)
 values (saved_order_id,selected_business.id,(item->>'product_id')::uuid,item->>'product_key',item->>'product_name',(item->>'quantity')::integer,(item->>'unit_price')::numeric,item->'selected_options',(item->>'line_total')::numeric);
 end loop;
 return query select saved_order_id, saved_order_number, final_total;
end; $function$
$definition$; end if; end $backup$;
do $backup$ begin if to_regprocedure('sobers_private.track_public_order(text,text,text)') is null then execute $definition$CREATE OR REPLACE FUNCTION sobers_private.track_public_order(p_business_slug text, p_order_number text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
$definition$; end if; end $backup$;
revoke all on all functions in schema sobers_private from public, anon, authenticated;

create or replace function sobers_private.validate_items(target_slug text, items jsonb)
returns void language plpgsql security definer set search_path = '' as $validation$
declare item jsonb; product public.products%rowtype; g record; choice text; selected jsonb; choices jsonb; qty integer;
begin
 if items is null or jsonb_typeof(items) <> 'array' then raise exception 'Invalid order items'; end if;
 if jsonb_array_length(items) not between 1 and 30 then raise exception 'Order must contain 1 to 30 items'; end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item) <> 'object' then raise exception 'Invalid item'; end if;
  begin qty := (item->>'quantity')::integer; exception when others then raise exception 'Invalid quantity'; end;
  if qty is null or qty not between 1 and 20 then raise exception 'Invalid quantity'; end if;
  select p.* into product from public.products p join public.businesses b on b.id=p.business_id
   where b.slug=target_slug and p.slug=item->>'product_key' and p.is_active and p.is_available;
  if not found then raise exception 'Product unavailable'; end if;
  selected := coalesce(item->'selected_options','{}'::jsonb);
  if jsonb_typeof(selected) <> 'object' then raise exception 'Invalid options'; end if;
  for g in select key,value from jsonb_each(selected) loop
   if not coalesce(product.options,'{}'::jsonb) ? g.key then raise exception 'Invalid option group'; end if;
  end loop;
  for g in select key,value from jsonb_each(coalesce(product.options,'{}'::jsonb)) loop
   choices := g.value->2;
   if g.value->>1 = 'radio' then
    if selected->g.key is null or jsonb_typeof(selected->g.key) <> 'string' then raise exception 'Choose exactly one option for %', g.key; end if;
    choice := selected->>g.key;
    if not choices ? choice then raise exception 'Invalid option'; end if;
   elsif selected->g.key is not null then
    if jsonb_typeof(selected->g.key) <> 'array' then raise exception 'Invalid multiple-choice options'; end if;
    if jsonb_array_length(selected->g.key) > 20 then raise exception 'Too many options'; end if;
    if (select count(*) <> count(distinct value) from jsonb_array_elements_text(selected->g.key)) then raise exception 'Duplicate options'; end if;
    for choice in select value from jsonb_array_elements_text(selected->g.key) loop
     if not choices ? choice then raise exception 'Invalid option'; end if;
    end loop;
   end if;
  end loop;
 end loop;
end; $validation$;
revoke all on function sobers_private.validate_items(text,jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_public_order(business_slug text, customer_name text, customer_phone text, fulfilment fulfilment_type, delivery_address text DEFAULT NULL::text, customer_note text DEFAULT NULL::text, requested_items jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(order_id uuid, order_number text, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_product public.products%rowtype;
 saved_customer_id uuid;
 saved_order_id uuid;
 saved_order_number text;
 item jsonb;
 resolved_items jsonb := '[]'::jsonb;
 selected_options jsonb;
 option_group record;
 option_choice text;
 option_price numeric;
 quantity integer;
 unit_price numeric;
 line_total numeric;
 subtotal numeric := 0;
 final_total numeric := 0;
begin
 if business_slug = 'sobers-pizza' then raise exception 'Use the secure customer order endpoint'; end if;
 if nullif(trim(customer_name), '') is null then
 raise exception 'Customer name is required';
 end if;

 if nullif(trim(customer_phone), '') is null then
 raise exception 'Customer phone is required';
 end if;

 if fulfilment = 'delivery'
 and nullif(trim(coalesce(delivery_address, '')), '') is null then
 raise exception 'Delivery address is required';
 end if;

 if jsonb_typeof(requested_items) <> 'array'
 or jsonb_array_length(requested_items) = 0
 or jsonb_array_length(requested_items) > 50 then
 raise exception 'Order must contain between 1 and 50 items';
 end if;

 select b.* into selected_business
 from public.businesses b
 where b.slug = business_slug
 and b.status = 'active';

 if not found then
 raise exception 'Business is not available';
 end if;

 select s.* into selected_settings
 from public.business_settings s
 where s.business_id = selected_business.id
 for update;

 if not found then
 raise exception 'Business ordering settings are unavailable';
 end if;

 if fulfilment = 'delivery' and not selected_settings.delivery_enabled then
 raise exception 'Delivery is not available';
 end if;

 if fulfilment = 'pickup' and not selected_settings.pickup_enabled then
 raise exception 'Pickup is not available';
 end if;

 for item in select value from jsonb_array_elements(requested_items)
 loop
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 if quantity < 1 or quantity > 20 then
 raise exception 'Each item quantity must be between 1 and 20';
 end if;

 select p.* into selected_product
 from public.products p
 where p.business_id = selected_business.id
 and p.slug = item ->> 'product_key'
 and p.is_active
 and p.is_available;

 if not found then
 raise exception 'A requested product is unavailable';
 end if;

 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then
 raise exception 'Selected options must be an object';
 end if;

 unit_price := selected_product.base_price;

 for option_group in select key, value from jsonb_each(selected_options)
 loop
 if selected_product.options -> option_group.key is null then
 raise exception 'A requested option group is invalid';
 end if;

 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in
 select value from jsonb_array_elements_text(option_group.value)
 loop
 option_price := (
 selected_product.options
 -> option_group.key -> 2 -> option_choice ->> 1
 )::numeric;
 if option_price is null then
 raise exception 'A requested option is invalid';
 end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (
 selected_product.options
 -> option_group.key -> 2 -> option_choice ->> 1
 )::numeric;
 if option_price is null then
 raise exception 'A requested option is invalid';
 end if;
 unit_price := unit_price + option_price;
 else
 raise exception 'A requested option value is invalid';
 end if;
 end loop;

 line_total := unit_price * quantity;
 subtotal := subtotal + line_total;

 resolved_items := resolved_items || jsonb_build_array(
 jsonb_build_object(
 'product_id', selected_product.id,
 'product_key', selected_product.slug,
 'product_name', selected_product.name,
 'quantity', quantity,
 'unit_price', unit_price,
 'selected_options', selected_options,
 'line_total', line_total
 )
 );
 end loop;

 saved_order_number :=
 selected_settings.order_prefix || selected_settings.next_order_number;

 update public.business_settings
 set next_order_number = next_order_number + 1
 where business_id = selected_business.id;

 insert into public.customers (
 business_id, full_name, phone, default_address
 ) values (
 selected_business.id,
 trim(customer_name),
 trim(customer_phone),
 nullif(trim(coalesce(delivery_address, '')), '')
 )
 on conflict (business_id, phone) do update
 set full_name = excluded.full_name,
 default_address = coalesce(excluded.default_address, public.customers.default_address)
 returning id into saved_customer_id;

 final_total := subtotal + selected_settings.default_delivery_fee;

 insert into public.platform_orders (
 business_id,
 customer_id,
 order_number,
 status,
 fulfilment,
 source,
 customer_name,
 customer_phone,
 delivery_address,
 customer_note,
 subtotal,
 delivery_fee,
 discount_total,
 total,
 currency_code
 ) values (
 selected_business.id,
 saved_customer_id,
 saved_order_number,
 'new',
 fulfilment,
 'pwa',
 trim(customer_name),
 trim(customer_phone),
 nullif(trim(coalesce(delivery_address, '')), ''),
 nullif(trim(coalesce(customer_note, '')), ''),
 subtotal,
 selected_settings.default_delivery_fee,
 0,
 final_total,
 selected_business.currency_code
 ) returning id into saved_order_id;

 for item in select value from jsonb_array_elements(resolved_items)
 loop
 insert into public.platform_order_items (
 order_id,
 business_id,
 product_id,
 product_key,
 product_name,
 quantity,
 unit_price,
 selected_options,
 line_total
 ) values (
 saved_order_id,
 selected_business.id,
 (item ->> 'product_id')::uuid,
 item ->> 'product_key',
 item ->> 'product_name',
 (item ->> 'quantity')::integer,
 (item ->> 'unit_price')::numeric,
 item -> 'selected_options',
 (item ->> 'line_total')::numeric
 );
 end loop;

 return query select saved_order_id, saved_order_number, final_total;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_public_order(business_slug text, customer_name text, customer_phone text, fulfilment fulfilment_type, delivery_address text DEFAULT NULL::text, customer_note text DEFAULT NULL::text, requested_items jsonb DEFAULT '[]'::jsonb, branch_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_branch public.branches%rowtype;
 selected_product public.products%rowtype;
 saved_customer_id uuid; saved_order_id uuid; saved_order_number text;
 item jsonb; resolved_items jsonb := '[]'::jsonb; selected_options jsonb;
 option_group record; option_choice text; option_price numeric;
 quantity integer; unit_price numeric; line_total numeric;
 subtotal numeric := 0; final_total numeric := 0;
begin
 if business_slug = 'sobers-pizza' then raise exception 'Use the secure customer order endpoint'; end if;
 if nullif(trim(customer_name), '') is null then raise exception 'Customer name is required'; end if;
 if nullif(trim(customer_phone), '') is null then raise exception 'Customer phone is required'; end if;
 if fulfilment = 'delivery' and nullif(trim(coalesce(delivery_address, '')), '') is null then raise exception 'Delivery address is required'; end if;
 if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 or jsonb_array_length(requested_items) > 50 then raise exception 'Order must contain between 1 and 50 items'; end if;

 select b.* into selected_business from public.businesses b where b.slug = business_slug and b.status = 'active';
 if not found then raise exception 'Business is not available'; end if;
 select s.* into selected_settings from public.business_settings s where s.business_id = selected_business.id;
 if not found then raise exception 'Business ordering settings are unavailable'; end if;
 if fulfilment = 'delivery' and not selected_settings.delivery_enabled then raise exception 'Delivery is not available'; end if;
 if fulfilment = 'pickup' and not selected_settings.pickup_enabled then raise exception 'Pickup is not available'; end if;

 select br.* into selected_branch from public.branches br
 where br.business_id = selected_business.id and br.is_active
 and (upper(br.code) = upper(coalesce(nullif(trim(branch_code), ''), 'MAIN-BRANCH'))
 or (branch_code is null and upper(br.code) in ('MAIN-BRANCH','PAKOS','PAKOS-ROAD')))
 order by case when upper(br.code) = 'MAIN-BRANCH' then 0 else 1 end limit 1 for update;
 if not found then raise exception 'Selected branch is not available'; end if;

 for item in select value from jsonb_array_elements(requested_items) loop
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 if quantity < 1 or quantity > 20 then raise exception 'Each item quantity must be between 1 and 20'; end if;
 select p.* into selected_product from public.products p where p.business_id = selected_business.id and p.slug = item ->> 'product_key' and p.is_active and p.is_available;
 if not found then raise exception 'A requested product is unavailable'; end if;
 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then raise exception 'Selected options must be an object'; end if;
 unit_price := selected_product.base_price;
 for option_group in select key, value from jsonb_each(selected_options) loop
 if selected_product.options -> option_group.key is null then raise exception 'A requested option group is invalid'; end if;
 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in select value from jsonb_array_elements_text(option_group.value) loop
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 else raise exception 'A requested option value is invalid'; end if;
 end loop;
 line_total := unit_price * quantity; subtotal := subtotal + line_total;
 resolved_items := resolved_items || jsonb_build_array(jsonb_build_object('product_id', selected_product.id, 'product_key', selected_product.slug, 'product_name', selected_product.name, 'quantity', quantity, 'unit_price', unit_price, 'selected_options', selected_options, 'line_total', line_total));
 end loop;

 saved_order_number := coalesce(selected_branch.order_prefix, selected_settings.order_prefix) || selected_branch.next_order_number;
 update public.branches set next_order_number = next_order_number + 1 where id = selected_branch.id;
 insert into public.customers (business_id, full_name, phone, default_address) values (selected_business.id, trim(customer_name), trim(customer_phone), nullif(trim(coalesce(delivery_address, '')), ''))
 on conflict (business_id, phone) do update set full_name = excluded.full_name, default_address = coalesce(excluded.default_address, public.customers.default_address) returning id into saved_customer_id;
 final_total := subtotal + selected_settings.default_delivery_fee;
 insert into public.platform_orders (business_id, branch_id, customer_id, order_number, status, fulfilment, source, customer_name, customer_phone, delivery_address, customer_note, subtotal, delivery_fee, discount_total, total, currency_code)
 values (selected_business.id, selected_branch.id, saved_customer_id, saved_order_number, 'new', fulfilment, 'pwa', trim(customer_name), trim(customer_phone), nullif(trim(coalesce(delivery_address, '')), ''), nullif(trim(coalesce(customer_note, '')), ''), subtotal, selected_settings.default_delivery_fee, 0, final_total, selected_business.currency_code) returning id into saved_order_id;
 for item in select value from jsonb_array_elements(resolved_items) loop
 insert into public.platform_order_items (order_id,business_id,product_id,product_key,product_name,quantity,unit_price,selected_options,line_total)
 values (saved_order_id,selected_business.id,(item->>'product_id')::uuid,item->>'product_key',item->>'product_name',(item->>'quantity')::integer,(item->>'unit_price')::numeric,item->'selected_options',(item->>'line_total')::numeric);
 end loop;
 return query select saved_order_id, saved_order_number, final_total;
end; $function$
;
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
    clean_phone text := regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g');
    clean_request_id uuid := client_request_id;
    item jsonb;
    item_quantity integer;
begin
    if clean_request_id is null then
        raise exception 'A valid customer tracking reference is required';
    end if;

    if business_slug <> 'sobers-pizza' then raise exception 'Business is unavailable'; end if;
    perform pg_advisory_xact_lock(hashtextextended('sobers-order:' || business_slug, 0));
    -- Idempotency is checked first so a network retry never creates a duplicate.
    select o.* into existing_order
    from public.platform_orders o
    join public.businesses b on b.id = o.business_id
    where b.slug = business_slug and o.client_request_id = clean_request_id
    limit 1;
    if found then
        return query select existing_order.id, existing_order.order_number, existing_order.total;
        return;
    end if;

    if business_slug <> 'sobers-pizza' then raise exception 'Business is unavailable'; end if;
    if length(trim(coalesce(customer_name, ''))) not between 2 and 80 then raise exception 'Enter a valid customer name'; end if;
    if length(clean_phone) not between 9 and 15 then raise exception 'Enter a valid phone number'; end if;
    if length(coalesce(delivery_address, '')) > 300 or length(coalesce(customer_note, '')) > 500 then raise exception 'Order details are too long'; end if;
    if fulfilment = 'delivery' and length(trim(coalesce(delivery_address, ''))) < 5 then raise exception 'A delivery address is required'; end if;
    if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) not between 1 and 30 then raise exception 'Order must contain between 1 and 30 items'; end if;

    for item in select value from jsonb_array_elements(requested_items)
    loop
        if jsonb_typeof(item) <> 'object' or length(coalesce(item ->> 'product_key', '')) not between 1 and 120 then
            raise exception 'A requested item is invalid';
        end if;
        begin item_quantity := (item ->> 'quantity')::integer;
        exception when others then raise exception 'Each quantity must be a whole number'; end;
        if item_quantity not between 1 and 20 then raise exception 'Each quantity must be between 1 and 20'; end if;
        if jsonb_typeof(coalesce(item -> 'selected_options', '{}'::jsonb)) <> 'object' then raise exception 'Selected options are invalid'; end if;
    end loop;

    perform sobers_private.validate_items(business_slug, requested_items);
    -- Server-side abuse guard. This cannot be bypassed by disabling JavaScript.
    if (select count(*) from public.platform_orders o join public.businesses b on b.id = o.business_id
        where b.slug = business_slug and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = clean_phone
          and o.created_at > now() - interval '5 minutes') >= 5 then
        raise exception 'Too many recent orders. Please wait five minutes and try again';
    end if;
    if (select count(*) from public.platform_orders o join public.businesses b on b.id = o.business_id
        where b.slug = business_slug and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = clean_phone
          and o.created_at > now() - interval '24 hours') >= 30 then
        raise exception 'Daily order limit reached for this number';
    end if;

    -- A business-wide circuit breaker also bounds rotating-phone abuse.
    if (select count(*) from public.platform_orders o join public.businesses b on b.id=o.business_id
        where b.slug=business_slug and o.created_at > now()-interval '5 minutes') >= 500 then
        raise exception 'Ordering is temporarily busy. Please contact the restaurant';
    end if;
    if fulfilment is null or fulfilment not in ('pickup','delivery') then raise exception 'Invalid order type'; end if;
    select br.* into selected_branch
    from public.branches br join public.businesses b on b.id = br.business_id
    where b.slug = business_slug and b.status = 'active' and br.is_active = true
      and br.code = coalesce(nullif(trim(branch_code), ''), 'MAIN-BRANCH') limit 1;
    if not found then raise exception 'The selected branch is unavailable'; end if;
    if not selected_branch.accepting_orders then raise exception 'Online orders are paused for this branch'; end if;

    select * into created_order from sobers_private.create_public_order(
        business_slug, trim(customer_name), customer_phone, fulfilment,
        nullif(trim(coalesce(delivery_address, '')), ''), nullif(trim(coalesce(customer_note, '')), ''),
        requested_items, selected_branch.code
    );
    update public.platform_orders set client_request_id = clean_request_id where id = created_order.order_id;
    return query select created_order.order_id, created_order.order_number, created_order.order_total;
end;
$$;

revoke all on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) from public;
grant execute on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) to anon, authenticated;


CREATE OR REPLACE FUNCTION public.create_kiosk_order(p_business_slug text, p_branch_code text, p_kiosk_code text, p_fulfilment fulfilment_type, p_requested_items jsonb, p_client_request_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_note text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, display_order_number text, order_total numeric, payment_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_business public.businesses%rowtype;
 selected_settings public.business_settings%rowtype;
 selected_branch public.branches%rowtype;
 selected_kiosk public.kiosks%rowtype;
 selected_product public.products%rowtype;
 existing_order public.platform_orders%rowtype;
 saved_order_id uuid;
 saved_order_number text;
 saved_display_number text;
 resolved_items jsonb := '[]'::jsonb;
 item jsonb;
 selected_options jsonb;
 option_group record;
 option_choice text;
 option_price numeric;
 quantity integer;
 unit_price numeric;
 line_total numeric;
 subtotal numeric := 0;
begin
 if p_business_slug = 'sobers-pizza' then
  perform pg_advisory_xact_lock(hashtextextended('sobers-order:' || p_business_slug, 0));
  perform sobers_private.validate_items(p_business_slug,p_requested_items);
  if length(coalesce(p_customer_name,''))>80 or length(coalesce(p_customer_phone,''))>30 or length(coalesce(p_customer_note,''))>500 then raise exception 'Order details are too long'; end if;
  if not coalesce((select accepting_orders from public.branches where business_id=(select id from public.businesses where slug=p_business_slug) and code=p_branch_code),false) then raise exception 'Orders are paused'; end if;
  if (select count(*) from public.platform_orders o join public.kiosks k on k.id=o.kiosk_id join public.businesses b on b.id=o.business_id where b.slug=p_business_slug and k.code=p_kiosk_code and o.created_at>now()-interval '5 minutes') >=100 then raise exception 'This kiosk is temporarily busy. Please ask staff for help'; end if;
  if (select count(*) from public.platform_orders o join public.businesses b on b.id=o.business_id where b.slug=p_business_slug and o.created_at>now()-interval '5 minutes') >=500 then raise exception 'Ordering is temporarily busy'; end if;
 end if;
 if p_client_request_id is null then
 raise exception 'A request identifier is required';
 end if;

 if p_fulfilment not in ('dine_in', 'takeaway') then
 raise exception 'Kiosk orders must be dine-in or takeaway';
 end if;

 if jsonb_typeof(p_requested_items) <> 'array'
 or jsonb_array_length(p_requested_items) = 0
 or jsonb_array_length(p_requested_items) > 50 then
 raise exception 'Order must contain between 1 and 50 items';
 end if;

 select b.* into selected_business
 from public.businesses b
 where b.slug = p_business_slug and b.status = 'active';
 if not found then raise exception 'Business is not available'; end if;

 select o.* into existing_order
 from public.platform_orders o
 where o.business_id = selected_business.id
 and o.client_request_id = p_client_request_id;
 if found then
 return query select existing_order.id, existing_order.order_number,
 existing_order.display_order_number, existing_order.total,
 existing_order.payment_status;
 return;
 end if;

 select s.* into selected_settings
 from public.business_settings s
 where s.business_id = selected_business.id
 for update;
 if not found then raise exception 'Business ordering settings are unavailable'; end if;

 select b.* into selected_branch
 from public.branches b
 where b.business_id = selected_business.id
 and b.code = p_branch_code and b.is_active;
 if not found then raise exception 'Branch is not available'; end if;

 select k.* into selected_kiosk
 from public.kiosks k
 where k.business_id = selected_business.id
 and k.branch_id = selected_branch.id
 and k.code = p_kiosk_code and k.is_active
 for update;
 if not found then raise exception 'Kiosk is not available'; end if;

 for item in select value from jsonb_array_elements(p_requested_items)
 loop
 begin
 quantity := coalesce((item ->> 'quantity')::integer, 0);
 exception when others then
 raise exception 'Each item quantity must be a whole number';
 end;
 if quantity < 1 or quantity > 20 then
 raise exception 'Each item quantity must be between 1 and 20';
 end if;

 select p.* into selected_product
 from public.products p
 where p.business_id = selected_business.id
 and p.slug = item ->> 'product_key'
 and p.is_active and p.is_available;
 if not found then raise exception 'A requested product is unavailable'; end if;

 selected_options := coalesce(item -> 'selected_options', '{}'::jsonb);
 if jsonb_typeof(selected_options) <> 'object' then
 raise exception 'Selected options must be an object';
 end if;

 unit_price := selected_product.base_price;
 for option_group in select key, value from jsonb_each(selected_options)
 loop
 if selected_product.options -> option_group.key is null then
 raise exception 'A requested option group is invalid';
 end if;

 if jsonb_typeof(option_group.value) = 'array' then
 for option_choice in select value from jsonb_array_elements_text(option_group.value)
 loop
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 end loop;
 elsif jsonb_typeof(option_group.value) = 'string' then
 option_choice := option_group.value #>> '{}';
 option_price := (selected_product.options -> option_group.key -> 2 -> option_choice ->> 1)::numeric;
 if option_price is null then raise exception 'A requested option is invalid'; end if;
 unit_price := unit_price + option_price;
 else
 raise exception 'A requested option value is invalid';
 end if;
 end loop;

 line_total := unit_price * quantity;
 subtotal := subtotal + line_total;
 resolved_items := resolved_items || jsonb_build_array(jsonb_build_object(
 'product_id', selected_product.id,
 'product_key', selected_product.slug,
 'product_name', selected_product.name,
 'quantity', quantity,
 'unit_price', unit_price,
 'selected_options', selected_options,
 'line_total', line_total
 ));
 end loop;

 saved_order_number := selected_settings.order_prefix || selected_settings.next_order_number;
 saved_display_number := selected_kiosk.display_prefix || lpad(selected_kiosk.next_display_number::text, 3, '0');

 update public.business_settings
 set next_order_number = next_order_number + 1, updated_at = now()
 where business_id = selected_business.id;

 update public.kiosks
 set next_display_number = next_display_number + 1, updated_at = now()
 where id = selected_kiosk.id;

 insert into public.platform_orders (
 business_id, branch_id, kiosk_id, order_number, display_order_number,
 client_request_id, status, fulfilment, source,
 customer_name, customer_phone, customer_note,
 subtotal, delivery_fee, discount_total, total, currency_code,
 payment_status
 ) values (
 selected_business.id, selected_branch.id, selected_kiosk.id,
 saved_order_number, saved_display_number, p_client_request_id,
 'new', p_fulfilment, 'kiosk',
 coalesce(nullif(trim(p_customer_name), ''), 'Kiosk Guest'),
 coalesce(nullif(trim(p_customer_phone), ''), 'Not provided'),
 nullif(trim(coalesce(p_customer_note, '')), ''),
 subtotal, 0, 0, subtotal, selected_business.currency_code, 'unpaid'
 ) returning id into saved_order_id;

 for item in select value from jsonb_array_elements(resolved_items)
 loop
 insert into public.platform_order_items (
 order_id, business_id, product_id, product_key, product_name,
 quantity, unit_price, selected_options, line_total
 ) values (
 saved_order_id, selected_business.id, (item ->> 'product_id')::uuid,
 item ->> 'product_key', item ->> 'product_name',
 (item ->> 'quantity')::integer, (item ->> 'unit_price')::numeric,
 item -> 'selected_options', (item ->> 'line_total')::numeric
 );
 end loop;

 return query select saved_order_id, saved_order_number, saved_display_number,
 subtotal, 'unpaid'::text;
end;
$function$
;
create table if not exists sobers_private.tracking_attempts (
 lookup_hash text primary key, started_at timestamptz not null, attempts integer not null
);
alter table sobers_private.tracking_attempts enable row level security;
revoke all on sobers_private.tracking_attempts from public,anon,authenticated;
create index if not exists sobers_tracking_started on sobers_private.tracking_attempts(started_at);
create or replace function sobers_private.allow_tracking(reference text, phone text)
returns boolean language plpgsql security definer set search_path='' as $throttle$
declare v_lookup_hash text := md5(lower(reference)||':'||regexp_replace(coalesce(phone,''),'\D','','g')); n integer;
begin
 delete from sobers_private.tracking_attempts where started_at < now()-interval '1 day';
 insert into sobers_private.tracking_attempts as t (lookup_hash,started_at,attempts) values (v_lookup_hash,now(),1)
 on conflict (lookup_hash) do update set started_at=case when t.started_at < now()-interval '1 minute' then now() else t.started_at end,
 attempts=case when t.started_at < now()-interval '1 minute' then 1 else least(t.attempts+1,13) end returning attempts into n;
 return n <=12;
end; $throttle$;
revoke all on function sobers_private.allow_tracking(text,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.track_public_order(p_business_slug text, p_order_number text, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 selected_order public.platform_orders%rowtype;
 selected_branch public.branches%rowtype;
 result jsonb;
begin
 if p_business_slug = 'sobers-pizza' then
  if coalesce(p_order_number,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  if not sobers_private.allow_tracking(p_order_number,p_customer_phone) then return null; end if;
 end if;
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
$function$
;
-- Defense in depth; do not change other shared-project table policies here.
revoke all on all functions in schema sobers_private from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
