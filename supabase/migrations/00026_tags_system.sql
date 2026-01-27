-- Tags System
-- Each group has its own set of tags
-- Videos can have multiple tags
-- Tags are auto-created when assigned to videos, auto-deleted when no longer used

-- Tags table (scoped to group and user)
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES channel_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Video tags junction table
CREATE TABLE IF NOT EXISTS video_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each video can only have a specific tag once
  UNIQUE(video_id, tag_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_user_group ON tags(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_video_tags_video ON video_tags(video_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_user ON video_tags(user_id);

-- Unique index to ensure tag names are unique per group per user (case insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_name_per_group
  ON tags(user_id, group_id, LOWER(name));

-- RLS Policies for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own tags" ON tags;
CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own tags" ON tags;
CREATE POLICY "Users can create their own tags"
  ON tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own tags" ON tags;
CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for video_tags
ALTER TABLE video_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own video tags" ON video_tags;
CREATE POLICY "Users can view their own video tags"
  ON video_tags FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own video tags" ON video_tags;
CREATE POLICY "Users can create their own video tags"
  ON video_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own video tags" ON video_tags;
CREATE POLICY "Users can delete their own video tags"
  ON video_tags FOR DELETE
  USING (auth.uid() = user_id);

-- Function to clean up unused tags
CREATE OR REPLACE FUNCTION cleanup_unused_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete tags that have no video_tags references
  DELETE FROM tags
  WHERE id = OLD.tag_id
    AND NOT EXISTS (
      SELECT 1 FROM video_tags WHERE tag_id = OLD.tag_id
    );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-cleanup tags when video_tags are deleted
DROP TRIGGER IF EXISTS trigger_cleanup_unused_tags ON video_tags;
CREATE TRIGGER trigger_cleanup_unused_tags
  AFTER DELETE ON video_tags
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_unused_tags();
