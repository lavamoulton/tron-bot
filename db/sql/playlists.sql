CREATE TABLE IF NOT EXISTS playlists (
    name VARCHAR(50) NOT NULL,
    maxPlayers INTEGER NOT NULL,
    draft BOOLEAN NOT NULL,
    description TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (name));