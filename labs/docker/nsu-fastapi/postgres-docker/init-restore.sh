#!/bin/bash
set -e
pg_restore -U test -d test /docker-entrypoint-initdb.d/test.bkp
