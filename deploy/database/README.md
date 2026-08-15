# JD2Resume Persistence

The server database is a private PostgreSQL 16 container. It binds to the server loopback address only; local development reaches it through the SSH tunnel started by `npm run dev:remote-db` or `npm run preview:remote-db`.

Create `.server.env` from `.server.env.example` and place the matching private key at the configured path. The launcher reads the remote database credentials into memory and never writes them to the repository.

The server installation lives at `/opt/jd2resume/database`. `initialize.sh` creates the database, applies migrations, installs the daily systemd backup timer, and runs the first backup. `verify-backup.sh` restores the newest compressed dump into a temporary database and removes it after validation.

Account snapshots are stored in PostgreSQL and restored through `/api/account-state`. The browser does not retain an offline cache.
