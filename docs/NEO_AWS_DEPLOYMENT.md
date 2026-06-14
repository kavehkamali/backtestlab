# Neo + AWS Production Deployment

Production runs the Equilima backend on the private Neo machine. AWS remains the public edge only: Caddy terminates TLS and proxies to Neo through loopback-only reverse SSH tunnels.

## Runtime Layout

- Code: `/srv/webapps/equilima/current`
- Data/cache: `/srv/webdata/equilima`
- Secrets: `/etc/webapps/equilima.env`
- Service: `equilima.service`
- AWS proxy target: `127.0.0.1:18080`
- Neo app port: `127.0.0.1:8080`

`/etc/webapps/equilima.env` must be root-owned and group-readable by the deployment group, for example mode `0640`. Do not commit production secrets.

## Deploy On Neo

Run this on Neo after syncing the repository:

```bash
cd /srv/webapps/equilima/current
./deploy.sh
```

The deploy script creates or updates the Python virtualenv, installs CPU-only Torch, builds the frontend, restarts `equilima.service`, and checks `/api/health`.

## AWS Caddy

AWS should proxy the public site to the private tunnel port:

```caddy
equilima.com {
    reverse_proxy localhost:18080
}
```

The reverse SSH tunnel from Neo to AWS should include:

```bash
-R 18080:localhost:8080
```
