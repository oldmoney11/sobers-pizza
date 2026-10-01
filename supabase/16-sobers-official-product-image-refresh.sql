-- Sobers official product photography refresh.
-- Safe to run more than once.
update public.products p
set image_url = v.image_url,
    updated_at = now()
from public.businesses b,
(values
 ('pineapple-pizza','assets/sobers-pizza/official-products/pineapple-pizza.webp'),
 ('chicken-shawarma','assets/sobers-pizza/official-products/chicken-shawarma.webp'),
 ('beef-shawarma','assets/sobers-pizza/official-products/beef-shawarma.webp'),
 ('combo-shawarma','assets/sobers-pizza/official-products/combo-shawarma.webp'),
 ('summer-wave','assets/sobers-pizza/official-products/juice-summer.webp'),
 ('pine-paradise','assets/sobers-pizza/official-products/juice-pine-paradise.webp'),
 ('citrus-blaze','assets/sobers-pizza/official-products/juice-citrus-blaze.webp'),
 ('orchard-fresh','assets/sobers-pizza/official-products/juice-orchard-fresh.webp'),
 ('fruit-fiesta','assets/sobers-pizza/official-products/juice-fruit-fiesta.webp'),
 ('sobers-sunset','assets/sobers-pizza/official-products/juice-sobers-sunset.webp'),
 ('pizza-cooler-cocktail','assets/sobers-pizza/official-products/juice-pizza-cooler-cocktail.webp'),
 ('smile-spritz','assets/sobers-pizza/official-products/juice-smile-spritz.webp'),
 ('banana-power','assets/sobers-pizza/official-products/juice-banana-power.webp'),
 ('mango-magic','assets/sobers-pizza/official-products/juice-mango-magic.webp'),
 ('mixed-berry','assets/sobers-pizza/official-products/juice-mixed-berry.webp'),
 ('strawberry-bliss','assets/sobers-pizza/official-products/juice-strawberry-bliss.webp'),
 ('sobers-special-smoothie','assets/sobers-pizza/official-products/juice-sobers-special-smoothie.webp'),
 ('vanilla-dream','assets/sobers-pizza/official-products/juice-vanilla-dream.webp'),
 ('chocolate-bliss','assets/sobers-pizza/official-products/juice-chocolate-bliss.webp'),
 ('strawberry-shake','assets/sobers-pizza/official-products/juice-strawberry-shake.webp'),
 ('sobers-triple-treat','assets/sobers-pizza/official-products/juice-sobers-triple-treat.webp'),
 ('chicken-pizza-pie','assets/sobers-pizza/official-products/chicken-pizza-pie.webp'),
 ('pepperoni-pizza','assets/sobers-pizza/official-products/pepperoni-pizza.webp'),
 ('ceres-1l','assets/sobers-pizza/official-products/ceres-red-grape.webp'),
 ('don-simon-1l','assets/sobers-pizza/official-products/don-simon-multifruits.webp'),
 ('heineken-500ml','assets/sobers-pizza/official-products/heineken.webp'),
 ('kiss-cider-500ml','assets/sobers-pizza/official-products/kiss-cider.webp'),
 ('malta-guinness-330ml','assets/sobers-pizza/official-products/malta-guinness.webp'),
 ('tampico-500ml','assets/sobers-pizza/official-products/tampico-citrus-punch.webp'),
 ('tampico-1l','assets/sobers-pizza/official-products/tampico-citrus-punch.webp'),
 ('walch-473ml','assets/sobers-pizza/official-products/welchs-grape.webp'),
 ('can-drink','assets/sobers-pizza/official-products/canned-drinks.webp')
) as v(slug,image_url)
where b.id = p.business_id
  and b.slug = 'sobers-pizza'
  and p.slug = v.slug;

update public.products p
set name = 'Welch''s 473ml',
    updated_at = now()
from public.businesses b
where b.id = p.business_id
  and b.slug = 'sobers-pizza'
  and p.slug = 'walch-473ml';
