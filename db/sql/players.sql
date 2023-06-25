CREATE TABLE IF NOT EXISTS players (
    id VARCHAR(50) NOT NULL,
    username VARCHAR(50) NOT NULL,
    displayName VARCHAR(50) NOT NULL,
    count INTEGER NOT NULL,
    tronBucks INTEGER NOT NULL,
    PRIMARY KEY (id));