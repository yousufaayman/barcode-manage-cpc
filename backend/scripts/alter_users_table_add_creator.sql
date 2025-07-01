-- Alter users table to add "Creator" role
ALTER TABLE `users` 
MODIFY COLUMN `role` enum('Admin','Cutting','Sewing','Packaging','Creator') NOT NULL;

-- Verify the change
DESCRIBE `users`; 