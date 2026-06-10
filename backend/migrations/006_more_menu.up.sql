-- More menu items: extra cocktails, light drinks, snacks, plus new
-- "mocktail" and "shot" categories for variety.
INSERT INTO menu_items (category, name, description, price) VALUES
    ('cocktail',  'Smoked Old Fashioned', 'Bourbon, demerara, bitters, applewood smoke', 320),
    ('cocktail',  'Neon Negroni',         'Gin, Campari, sweet vermouth, orange peel',   290),
    ('cocktail',  'Espresso Martini',     'Vodka, cold brew, coffee liqueur, foam',      300),
    ('cocktail',  'Paper Plane',          'Bourbon, Aperol, Amaro, lemon',               310),
    ('mocktail',  'Virgin Mojito',        'Lime, mint, soda, cane sugar',                110),
    ('mocktail',  'Sunset Cooler',        'Passionfruit, orange, grenadine, soda',       120),
    ('light',     'Hojicha Latte',        'Roasted green tea, steamed milk',             130),
    ('light',     'Sparkling Grape',      'White grape, lime, sparkling water',          100),
    ('snack',     'Edamame',              'Steamed, sea salt, togarashi',                 90),
    ('snack',     'Karaage Chicken',      'Japanese fried chicken, yuzu mayo',           190),
    ('snack',     'Cheese Board',         'Aged cheddar, brie, crackers, honey',         240),
    ('shot',      'Amber Flash',          'House whiskey shot, cinnamon kick',            120),
    ('shot',      'Blue Volt',            'Vodka, blue curaçao, citrus',                 130);
