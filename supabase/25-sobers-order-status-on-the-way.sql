-- Allow a rider to move an order from ready to on the way.
-- Safe to run once. Does not change existing orders.
alter type public.order_status add value if not exists 'out_for_delivery';
