-- Connect to the MySQL server as a user with administrative privileges (e.g., root)
-- CREATE USER and GRANT statements require administrative privileges
-- Create the new user
CREATE USER 'test_user' @'%' IDENTIFIED BY 'password';

-- Grant privileges to the new user (adjust privileges as needed)
GRANT
SELECT
,
INSERT
,
UPDATE
,
    DELETE ON test_db.* TO 'test_user' @'%';

-- Optional: Flush privileges to apply changes immediately
FLUSH PRIVILEGES;