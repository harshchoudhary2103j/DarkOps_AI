# Disaster Recovery & Backup Runbook

## 1. Overview
This runbook establishes procedures for automated database backups, emergency restoration, and worker crash recovery for DarkOps AI in production.

---

## 2. PostgreSQL Backup Procedures

### Render Managed PostgreSQL
Render automatically creates daily snapshots with point-in-time recovery on paid plans. For explicit backups:

1. **Manual Logical Backup (pg_dump)**:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file="darkops_backup_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Schema-Only Dump**:
   ```bash
   pg_dump "$DATABASE_URL" --schema-only --file=schema.sql
   ```

---

## 3. Disaster Recovery & Database Restoration

In the event of database corruption or data loss:

1. **Provision New Database**:
   Create a fresh PostgreSQL database instance in the Render dashboard.
2. **Restore Logical Backup**:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$NEW_DATABASE_URL" "darkops_backup_YYYYMMDD_HHMMSS.dump"
   ```
3. **Verify Migrations**:
   Run migration check to confirm schema integrity:
   ```bash
   DATABASE_URL="$NEW_DATABASE_URL" npm --prefix services/operational-api run migrate
   ```
4. **Update Service Environment Variable**:
   Update `DATABASE_URL` across `darkops-operational-api` and `darkops-simulation-worker`.
5. **Verify API Readiness**:
   ```bash
   curl -f https://darkops-operational-api.onrender.com/readyz
   ```

---

## 4. Worker Crash & Non-Destructive Recovery

### Simulation Worker Recovery
- If a simulation worker terminates unexpectedly while processing a job:
  - Jobs are locked using `SELECT ... FOR UPDATE SKIP LOCKED`. If a worker dies, the PostgreSQL connection terminates, automatically releasing locks on in-flight rows.
  - The job status can be reset to `QUEUED` or evaluated without corrupting baseline catalog data.
- **Heartbeat Monitoring**:
  - The worker maintains `/tmp/worker_heartbeat`. If heartbeat expires (> 20s), container orchestrator restarts the worker.
  - Historical run logs (`simulation_events`) are append-only and immutable.
