-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
    identifier TEXT NOT NULL,
    name TEXT NOT NULL,
    is_live BOOLEAN DEFAULT false,
    last_video_url TEXT,
    last_checked TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Insert initial polling interval setting
INSERT INTO settings (key, value)
VALUES ('app_config', '{"poll_interval_seconds": 5}')
ON CONFLICT (key) DO NOTHING;
