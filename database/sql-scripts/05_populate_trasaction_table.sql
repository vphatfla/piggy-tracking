-- January
INSERT INTO
    `transaction` (
        `user_id`,
        `item_name`,
        `type`,
        `amount`,
        `comment`,
        `date`
    )
SELECT
    u.`id`,
    CONCAT('Item_', FLOOR(RAND() * 100) + 1),
    CASE
        WHEN RAND() < 0.2 THEN 'clothe_shopping'
        WHEN RAND() < 0.4 THEN 'food'
        WHEN RAND() < 0.6 THEN 'gas'
        WHEN RAND() < 0.8 THEN 'grocery'
        ELSE 'other_shopping'
    END,
    ROUND(RAND() * 1000, 2),
    CONCAT('Comment for ', u.`username`),
    DATE('2024-01-01')
FROM
    `user` u
LIMIT
    10;

-- February
INSERT INTO
    `transaction` (
        `user_id`,
        `item_name`,
        `type`,
        `amount`,
        `comment`,
        `date`
    )
SELECT
    u.`id`,
    CONCAT('Item_', FLOOR(RAND() * 100) + 1),
    CASE
        WHEN RAND() < 0.2 THEN 'clothe_shopping'
        WHEN RAND() < 0.4 THEN 'food'
        WHEN RAND() < 0.6 THEN 'gas'
        WHEN RAND() < 0.8 THEN 'grocery'
        ELSE 'other_shopping'
    END,
    ROUND(RAND() * 1000, 2),
    CONCAT('Comment for ', u.`username`),
    DATE('2024-02-01')
FROM
    `user` u
LIMIT
    10;

-- March
INSERT INTO
    `transaction` (
        `user_id`,
        `item_name`,
        `type`,
        `amount`,
        `comment`,
        `date`
    )
SELECT
    u.`id`,
    CONCAT('Item_', FLOOR(RAND() * 100) + 1),
    CASE
        WHEN RAND() < 0.2 THEN 'clothe_shopping'
        WHEN RAND() < 0.4 THEN 'food'
        WHEN RAND() < 0.6 THEN 'gas'
        WHEN RAND() < 0.8 THEN 'grocery'
        ELSE 'other_shopping'
    END,
    ROUND(RAND() * 1000, 2),
    CONCAT('Comment for ', u.`username`),
    DATE('2024-03-01')
FROM
    `user` u
LIMIT
    10;