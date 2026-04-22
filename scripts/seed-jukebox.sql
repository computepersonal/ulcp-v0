-- Seed jukebox songs for testing
-- mycafe: 15 songs (Bollywood + English pop/rock)
-- restro-bar: 13 songs (Bollywood party + English club + 3 Spotify)

INSERT INTO public.jukebox_songs (id, tenant_id, title, artist, duration_secs, thumbnail, source, source_id, source_url, genre, language, is_active, sort_order, created_at)
VALUES
  -- ══════════ mycafe (cmna4ar4g0000k1hytp9m9a0m) ══════════
  ('s01', 'cmna4ar4g0000k1hytp9m9a0m', 'Tum Hi Ho', 'Arijit Singh', 261, 'https://img.youtube.com/vi/IJq0yyWug1k/mqdefault.jpg', 'youtube', 'IJq0yyWug1k', 'https://www.youtube.com/watch?v=IJq0yyWug1k', 'Bollywood', 'Hindi', true, 1, NOW()),
  ('s02', 'cmna4ar4g0000k1hytp9m9a0m', 'Channa Mereya', 'Arijit Singh', 289, 'https://img.youtube.com/vi/284Ov7ySmfA/mqdefault.jpg', 'youtube', '284Ov7ySmfA', 'https://www.youtube.com/watch?v=284Ov7ySmfA', 'Bollywood', 'Hindi', true, 2, NOW()),
  ('s03', 'cmna4ar4g0000k1hytp9m9a0m', 'Kesariya', 'Arijit Singh', 268, 'https://img.youtube.com/vi/BddP6PYo2gs/mqdefault.jpg', 'youtube', 'BddP6PYo2gs', 'https://www.youtube.com/watch?v=BddP6PYo2gs', 'Bollywood', 'Hindi', true, 3, NOW()),
  ('s04', 'cmna4ar4g0000k1hytp9m9a0m', 'Apna Bana Le', 'Arijit Singh', 275, 'https://img.youtube.com/vi/LEzMPmEKMAs/mqdefault.jpg', 'youtube', 'LEzMPmEKMAs', 'https://www.youtube.com/watch?v=LEzMPmEKMAs', 'Bollywood', 'Hindi', true, 4, NOW()),
  ('s05', 'cmna4ar4g0000k1hytp9m9a0m', 'Raataan Lambiyan', 'Jubin Nautiyal & Asees Kaur', 237, 'https://img.youtube.com/vi/gvyUuxdRdR4/mqdefault.jpg', 'youtube', 'gvyUuxdRdR4', 'https://www.youtube.com/watch?v=gvyUuxdRdR4', 'Bollywood', 'Hindi', true, 5, NOW()),
  ('s06', 'cmna4ar4g0000k1hytp9m9a0m', 'Pasoori', 'Ali Sethi & Shae Gill', 235, 'https://img.youtube.com/vi/5Eqb_-j3FDA/mqdefault.jpg', 'youtube', '5Eqb_-j3FDA', 'https://www.youtube.com/watch?v=5Eqb_-j3FDA', 'Pop', 'Punjabi', true, 6, NOW()),
  ('s07', 'cmna4ar4g0000k1hytp9m9a0m', 'Maan Meri Jaan', 'King', 213, 'https://img.youtube.com/vi/CMWT2aSnGoU/mqdefault.jpg', 'youtube', 'CMWT2aSnGoU', 'https://www.youtube.com/watch?v=CMWT2aSnGoU', 'Pop', 'Hindi', true, 7, NOW()),
  ('s08', 'cmna4ar4g0000k1hytp9m9a0m', 'Blinding Lights', 'The Weeknd', 200, 'https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg', 'youtube', '4NRXx6U8ABQ', 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', 'Pop', 'English', true, 8, NOW()),
  ('s09', 'cmna4ar4g0000k1hytp9m9a0m', 'Shape of You', 'Ed Sheeran', 234, 'https://img.youtube.com/vi/JGwWNGJdvx8/mqdefault.jpg', 'youtube', 'JGwWNGJdvx8', 'https://www.youtube.com/watch?v=JGwWNGJdvx8', 'Pop', 'English', true, 9, NOW()),
  ('s10', 'cmna4ar4g0000k1hytp9m9a0m', 'Levitating', 'Dua Lipa', 203, 'https://img.youtube.com/vi/TUVcZfQe-Kw/mqdefault.jpg', 'youtube', 'TUVcZfQe-Kw', 'https://www.youtube.com/watch?v=TUVcZfQe-Kw', 'Pop', 'English', true, 10, NOW()),
  ('s11', 'cmna4ar4g0000k1hytp9m9a0m', 'Bohemian Rhapsody', 'Queen', 354, 'https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg', 'youtube', 'fJ9rUzIMcZQ', 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', 'Rock', 'English', true, 11, NOW()),
  ('s12', 'cmna4ar4g0000k1hytp9m9a0m', 'Someone Like You', 'Adele', 285, 'https://img.youtube.com/vi/hLQl3WQQoQ0/mqdefault.jpg', 'youtube', 'hLQl3WQQoQ0', 'https://www.youtube.com/watch?v=hLQl3WQQoQ0', 'Pop', 'English', true, 12, NOW()),
  ('s13', 'cmna4ar4g0000k1hytp9m9a0m', 'Perfect', 'Ed Sheeran', 263, 'https://img.youtube.com/vi/2Vv-BfVoq4g/mqdefault.jpg', 'youtube', '2Vv-BfVoq4g', 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', 'Pop', 'English', true, 13, NOW()),
  ('s14', 'cmna4ar4g0000k1hytp9m9a0m', 'Uptown Funk', 'Bruno Mars', 270, 'https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg', 'youtube', 'OPf0YbXqDm0', 'https://www.youtube.com/watch?v=OPf0YbXqDm0', 'Funk', 'English', true, 14, NOW()),
  ('s15', 'cmna4ar4g0000k1hytp9m9a0m', 'Starboy', 'The Weeknd ft. Daft Punk', 230, 'https://img.youtube.com/vi/34Na4j8AVgA/mqdefault.jpg', 'youtube', '34Na4j8AVgA', 'https://www.youtube.com/watch?v=34Na4j8AVgA', 'Pop', 'English', true, 15, NOW()),

  -- ══════════ restro-bar (cmo1e5ix70000140y17yj65sy) ══════════
  ('s16', 'cmo1e5ix70000140y17yj65sy', 'Kar Gayi Chull', 'Badshah & Neha Kakkar', 227, 'https://img.youtube.com/vi/NTHz9ephYTw/mqdefault.jpg', 'youtube', 'NTHz9ephYTw', 'https://www.youtube.com/watch?v=NTHz9ephYTw', 'Bollywood', 'Hindi', true, 1, NOW()),
  ('s17', 'cmo1e5ix70000140y17yj65sy', 'Kala Chashma', 'Badshah & Amar Arshi', 269, 'https://img.youtube.com/vi/k4yXQkG6uz4/mqdefault.jpg', 'youtube', 'k4yXQkG6uz4', 'https://www.youtube.com/watch?v=k4yXQkG6uz4', 'Bollywood', 'Hindi', true, 2, NOW()),
  ('s18', 'cmo1e5ix70000140y17yj65sy', 'Amplifier', 'Imran Khan', 240, 'https://img.youtube.com/vi/GMi0gbnMJuM/mqdefault.jpg', 'youtube', 'GMi0gbnMJuM', 'https://www.youtube.com/watch?v=GMi0gbnMJuM', 'Punjabi', 'Punjabi', true, 3, NOW()),
  ('s19', 'cmo1e5ix70000140y17yj65sy', 'Abhi Toh Party', 'Badshah', 199, 'https://img.youtube.com/vi/QMw5W_RqrPc/mqdefault.jpg', 'youtube', 'QMw5W_RqrPc', 'https://www.youtube.com/watch?v=QMw5W_RqrPc', 'Bollywood', 'Hindi', true, 4, NOW()),
  ('s20', 'cmo1e5ix70000140y17yj65sy', 'Saturday Saturday', 'Badshah & Indeep Bakshi', 201, 'https://img.youtube.com/vi/pjDa3QVQvVo/mqdefault.jpg', 'youtube', 'pjDa3QVQvVo', 'https://www.youtube.com/watch?v=pjDa3QVQvVo', 'Bollywood', 'Hindi', true, 5, NOW()),
  ('s21', 'cmo1e5ix70000140y17yj65sy', 'Blinding Lights', 'The Weeknd', 200, 'https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg', 'youtube', '4NRXx6U8ABQ', 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', 'Pop', 'English', true, 6, NOW()),
  ('s22', 'cmo1e5ix70000140y17yj65sy', 'Uptown Funk', 'Bruno Mars', 270, 'https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg', 'youtube', 'OPf0YbXqDm0', 'https://www.youtube.com/watch?v=OPf0YbXqDm0', 'Funk', 'English', true, 7, NOW()),
  ('s23', 'cmo1e5ix70000140y17yj65sy', 'Despacito', 'Luis Fonsi ft. Daddy Yankee', 282, 'https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg', 'youtube', 'kJQP7kiw5Fk', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'Latin', 'Spanish', true, 8, NOW()),
  ('s24', 'cmo1e5ix70000140y17yj65sy', 'Rockstar', 'Post Malone ft. 21 Savage', 218, 'https://img.youtube.com/vi/UceaB4D0jpo/mqdefault.jpg', 'youtube', 'UceaB4D0jpo', 'https://www.youtube.com/watch?v=UceaB4D0jpo', 'Hip-Hop', 'English', true, 9, NOW()),
  ('s25', 'cmo1e5ix70000140y17yj65sy', 'Dance Monkey', 'Tones and I', 210, 'https://img.youtube.com/vi/q0hyYWKXF0Q/mqdefault.jpg', 'youtube', 'q0hyYWKXF0Q', 'https://www.youtube.com/watch?v=q0hyYWKXF0Q', 'Pop', 'English', true, 10, NOW()),
  ('s26', 'cmo1e5ix70000140y17yj65sy', 'As It Was', 'Harry Styles', 167, 'https://i.scdn.co/image/ab67616d00001e02b46f74097655d7f353caab14', 'spotify', '4LRPiXqCikLlN15c3yImP7', 'https://open.spotify.com/track/4LRPiXqCikLlN15c3yImP7', 'Pop', 'English', true, 11, NOW()),
  ('s27', 'cmo1e5ix70000140y17yj65sy', 'Anti-Hero', 'Taylor Swift', 200, 'https://i.scdn.co/image/ab67616d00001e02bb54dde68cd23e2a268ae0f5', 'spotify', '0V3wPSX9ygBnCm8psDIegu', 'https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIegu', 'Pop', 'English', true, 12, NOW()),
  ('s28', 'cmo1e5ix70000140y17yj65sy', 'Flowers', 'Miley Cyrus', 200, 'https://i.scdn.co/image/ab67616d00001e02f429549123dbe8552764ba1d', 'spotify', '0yLdNVWF3Srea0uzk55zFo', 'https://open.spotify.com/track/0yLdNVWF3Srea0uzk55zFo', 'Pop', 'English', true, 13, NOW())
ON CONFLICT (tenant_id, source, source_id) DO NOTHING;

-- Also seed songs for tenant_test_001 (the one with existing config)
INSERT INTO public.jukebox_songs (id, tenant_id, title, artist, duration_secs, thumbnail, source, source_id, source_url, genre, language, is_active, sort_order, created_at)
VALUES
  ('s29', 'tenant_test_001', 'Tum Hi Ho', 'Arijit Singh', 261, 'https://img.youtube.com/vi/IJq0yyWug1k/mqdefault.jpg', 'youtube', 'IJq0yyWug1k', 'https://www.youtube.com/watch?v=IJq0yyWug1k', 'Bollywood', 'Hindi', true, 1, NOW()),
  ('s30', 'tenant_test_001', 'Channa Mereya', 'Arijit Singh', 289, 'https://img.youtube.com/vi/284Ov7ySmfA/mqdefault.jpg', 'youtube', '284Ov7ySmfA', 'https://www.youtube.com/watch?v=284Ov7ySmfA', 'Bollywood', 'Hindi', true, 2, NOW()),
  ('s31', 'tenant_test_001', 'Kesariya', 'Arijit Singh', 268, 'https://img.youtube.com/vi/BddP6PYo2gs/mqdefault.jpg', 'youtube', 'BddP6PYo2gs', 'https://www.youtube.com/watch?v=BddP6PYo2gs', 'Bollywood', 'Hindi', true, 3, NOW()),
  ('s32', 'tenant_test_001', 'Blinding Lights', 'The Weeknd', 200, 'https://img.youtube.com/vi/4NRXx6U8ABQ/mqdefault.jpg', 'youtube', '4NRXx6U8ABQ', 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', 'Pop', 'English', true, 4, NOW()),
  ('s33', 'tenant_test_001', 'Shape of You', 'Ed Sheeran', 234, 'https://img.youtube.com/vi/JGwWNGJdvx8/mqdefault.jpg', 'youtube', 'JGwWNGJdvx8', 'https://www.youtube.com/watch?v=JGwWNGJdvx8', 'Pop', 'English', true, 5, NOW()),
  ('s34', 'tenant_test_001', 'Bohemian Rhapsody', 'Queen', 354, 'https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg', 'youtube', 'fJ9rUzIMcZQ', 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', 'Rock', 'English', true, 6, NOW()),
  ('s35', 'tenant_test_001', 'Uptown Funk', 'Bruno Mars', 270, 'https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg', 'youtube', 'OPf0YbXqDm0', 'https://www.youtube.com/watch?v=OPf0YbXqDm0', 'Funk', 'English', true, 7, NOW()),
  ('s36', 'tenant_test_001', 'Despacito', 'Luis Fonsi ft. Daddy Yankee', 282, 'https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg', 'youtube', 'kJQP7kiw5Fk', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'Latin', 'Spanish', true, 8, NOW()),
  ('s37', 'tenant_test_001', 'Pasoori', 'Ali Sethi & Shae Gill', 235, 'https://img.youtube.com/vi/5Eqb_-j3FDA/mqdefault.jpg', 'youtube', '5Eqb_-j3FDA', 'https://www.youtube.com/watch?v=5Eqb_-j3FDA', 'Pop', 'Punjabi', true, 9, NOW()),
  ('s38', 'tenant_test_001', 'Levitating', 'Dua Lipa', 203, 'https://img.youtube.com/vi/TUVcZfQe-Kw/mqdefault.jpg', 'youtube', 'TUVcZfQe-Kw', 'https://www.youtube.com/watch?v=TUVcZfQe-Kw', 'Pop', 'English', true, 10, NOW())
ON CONFLICT (tenant_id, source, source_id) DO NOTHING;
