CREATE TABLE `transaction` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `item_name` VARCHAR(150) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `comment` VARCHAR(255),
    `date` DATE NOT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
)