-- Enable RLS on restaurants (likely already enabled by default)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read restaurants (public listing)
CREATE POLICY "Anyone can read restaurants"
  ON restaurants FOR SELECT
  USING (true);

-- Allow anyone to insert restaurants (anonymous users with session tokens)
CREATE POLICY "Anyone can insert restaurants"
  ON restaurants FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update restaurants (ownership checked in application code via session_token)
CREATE POLICY "Anyone can update restaurants"
  ON restaurants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anyone to delete restaurants (ownership checked in application code via session_token)
CREATE POLICY "Anyone can delete restaurants"
  ON restaurants FOR DELETE
  USING (true);
