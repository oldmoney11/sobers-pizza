-- Sobers official product photography refresh.
-- Safe to run more than once.
update public.products p
set image_url = v.image_url,
    updated_at = now()
from public.businesses b,
(values
 ('chicken-shawarma','assets/sobers-pizza/official-products/chicken-shawarma.png'),
 ('beef-shawarma','assets/sobers-pizza/official-products/beef-shawarma.png'),
 ('combo-shawarma','assets/sobers-pizza/official-products/combo-shawarma.png'),
 ('summer-wave','assets/sobers-pizza/official-products/juice-summer.png'),
 ('pine-paradise','assets/sobers-pizza/official-products/juice-pine-paradise.png'),
 ('citrus-blaze','assets/sobers-pizza/official-products/juice-citrus-blaze.png'),
 ('orchard-fresh','assets/sobers-pizza/official-products/juice-orchard-fresh.png'),
 ('fruit-fiesta','assets/sobers-pizza/official-products/juice-fruit-fiesta.png'),
 ('sobers-sunset','assets/sobers-pizza/official-products/juice-sobers-sunset.png'),
 ('pizza-cooler-cocktail','assets/sobers-pizza/official-products/juice-pizza-cooler-cocktail.png'),
 ('smile-spritz','assets/sobers-pizza/official-products/juice-smile-spritz.png'),
 ('banana-power','assets/sobers-pizza/official-products/juice-banana-power.png'),
 ('mango-magic','assets/sobers-pizza/official-products/juice-mango-magic.png'),
 ('mixed-berry','assets/sobers-pizza/official-products/juice-mixed-berry.png'),
 ('strawberry-bliss','assets/sobers-pizza/official-products/juice-strawberry-bliss.png'),
 ('sobers-special-smoothie','assets/sobers-pizza/official-products/juice-sobers-special-smoothie.png'),
 ('vanilla-dream','assets/sobers-pizza/official-products/juice-vanilla-dream.png'),
 ('chocolate-bliss','assets/sobers-pizza/official-products/juice-chocolate-bliss.png'),
 ('strawberry-shake','assets/sobers-pizza/official-products/juice-strawberry-shake.png'),
 ('sobers-triple-treat','assets/sobers-pizza/official-products/juice-sobers-triple-treat.png'),
 ('chicken-pizza-pie','assets/sobers-pizza/official-products/chicken-pizza-pie.png'),
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

update public.products p
set name = 'Welch''s 473ml',
    updated_at = now()
from public.businesses b
where b.id = p.business_id
  and b.slug = 'sobers-pizza'
  and p.slug = 'walch-473ml';
