CREATE TABLE `user` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `email` VARCHAR(50) NOT NULL, 
    `name` VARCHAR(50) NOT NULL,
    `password` VARBINARY(60)
);
