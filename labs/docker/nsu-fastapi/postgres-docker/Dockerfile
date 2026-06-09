FROM postgres:15

ENV POSTGRES_USER=test
ENV POSTGRES_PASSWORD=test
ENV POSTGRES_DB=test

COPY test.bkp /docker-entrypoint-initdb.d/
COPY init-restore.sh /docker-entrypoint-initdb.d/
