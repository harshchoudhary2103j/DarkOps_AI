UPDATE stores 
SET name = 'DarkStore SoHo & Lower Manhattan #03', 
    latitude = 40.722300, 
    longitude = -73.998000 
WHERE id = 'store-ord-1792148625903';

UPDATE stores 
SET name = 'DarkStore East Village & Midtown East #04', 
    latitude = 40.729500, 
    longitude = -73.982000 
WHERE id = 'store-ord-1792148473745';

UPDATE service_zones
SET boundary = '{"type": "Polygon", "coordinates": [[[-74.015, 40.715], [-73.985, 40.715], [-73.985, 40.735], [-74.015, 40.735], [-74.015, 40.715]]]}'
WHERE store_id = 'store-ord-1792148625903';

UPDATE service_zones
SET boundary = '{"type": "Polygon", "coordinates": [[[-73.995, 40.722], [-73.970, 40.722], [-73.970, 40.742], [-73.995, 40.742], [-73.995, 40.722]]]}'
WHERE store_id = 'store-ord-1792148473745';
