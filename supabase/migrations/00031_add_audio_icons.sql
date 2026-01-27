-- ============================================================================
-- Migration 00031: Add audio waveform and mixing icons
-- ============================================================================

INSERT INTO public.icons (emoji, name, category, keywords, sort_order) VALUES
('🎚️', 'Level Slider', 'Media', 'audio mixer fader waveform volume', 161),
('🎛️', 'Control Knobs', 'Media', 'audio mixer equalizer dj', 162),
('〰️', 'Wavy Dash', 'Media', 'waveform audio wave sound', 163),
('📶', 'Signal Bars', 'Media', 'audio level bars waveform', 164),
('🔈', 'Speaker Low', 'Media', 'audio sound volume quiet', 165),
('🔉', 'Speaker Medium', 'Media', 'audio sound volume', 166);
