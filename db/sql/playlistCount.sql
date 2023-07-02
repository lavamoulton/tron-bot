CREATE TABLE IF NOT EXISTS playlistCount (
    name VARCHAR(50) NOT NULL,
    id VARCHAR(50) NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (name, id)
    FOREIGN KEY (name)
        REFERENCES playlists (name)
    FOREIGN KEY (id)
        REFERENCES players (id));