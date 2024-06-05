CREATE TABLE users(
    id SERIAL PRIMARY KEY,
    name VARCHAR(25) UNIQUE NOT NULL,
    password VARCHAR(60) NOT NULL,
    role SMALLINT NOT NULL
);

CREATE TABLE refresh_sessions(
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(400) NOT NULL,
    finger_print VARCHAR(32) NOT NULL
);

-- correct

CREATE TABLE users(
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(25) UNIQUE NOT NULL,
    password VARCHAR(60) NOT NULL,
    role SMALLINT NOT NULL
);

CREATE TABLE refresh_sessions(
    id INT AUTO_INCREMENT PRIMARY KEY,
    c INT NOT NULL,
    refresh_token VARCHAR(400) NOT NULL,
    finger_print VARCHAR(32) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SELECT * FROM users;
SELECT * FROM refresh_sessions;