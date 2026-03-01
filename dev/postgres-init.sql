SELECT 'CREATE DATABASE tachi_dev' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tachi_dev')\gexec
GRANT ALL PRIVILEGES ON DATABASE tachi_dev TO tachi;
