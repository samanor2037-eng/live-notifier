-- Add user_id column referencing auth.users
ALTER TABLE channels 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS on channels
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own channels
CREATE POLICY "Users can manage their own channels" 
ON channels 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
