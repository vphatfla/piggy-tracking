CREATE TABLE `user` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `email` VARCHAR(50) NOT NULL, 
    `username` VARCHAR(50),
    `name` VARCHAR(50) NOT NULL,
    `password` VARBINARY(60)
);
