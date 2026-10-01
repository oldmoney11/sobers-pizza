-- Sobers official product photography refresh.
-- Safe to run more than once.
update public.products p
set image_url = v.image_url,
    updated_at = now()
from public.businesses b,
(values
 ('pepperoni-pizza','assets/sobers-pizza/official-products/pepperoni-pizza.png'),
 ('ceres-1l','assets/sobers-pizza/official-products/ceres-red-grape.png'),
 ('don-simon-1l','assets/sobers-pizza/official-products/don-simon-multifruits.png'),
 ('heineken-500ml','assets/sobers-pizza/official-products/heineken.png'),
 ('kiss-cider-500ml','assets/sobers-pizza/official-products/kiss-cider.png'),
 ('malta-guinness-330ml','assets/sobers-pizza/official-products/malta-guinness.png'),
 ('tampico-500ml','assets/sobers-pizza/official-products/tampico-citrus-punch.png'),
 ('tampico-1l','assets/sobers-pizza/official-products/tampico-citrus-punch.png'),
 ('walch-473ml','assets/sobers-pizza/official-products/welchs-grape.png'),
 ('can-drink','assets/sobers-pizza/official-products/canned-drinks.png')
) as v(slug,image_url)
where b.id = p.business_id
  and b.slug = 'sobers-pizza'
  and p.slug = v.slug;
