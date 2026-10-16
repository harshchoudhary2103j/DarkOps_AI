import json
from typing import Any, Dict, Optional

from src.evaluation.models import EvaluationSummary


def persist_evaluation_summary(
    summary: EvaluationSummary,
    db_connection_url: str,
) -> None:
    """
    Persists an EvaluationSummary to PostgreSQL simulation_evaluations table.
    Uses parameterized SQL and upserts safely based on (run_id, evaluator_version, formula_version).
    """
    try:
        import psycopg2
    except ImportError as e:
        raise RuntimeError("psycopg2 is required for PostgreSQL persistence.") from e

    conn = psycopg2.connect(db_connection_url)
    try:
        with conn.cursor() as cur:
            kpis_dict = {
                k: v.model_dump() for k, v in summary.kpis.items()
            }
            upsert_query = """
                INSERT INTO simulation_evaluations (
                    id, run_id, scenario_id, seed,
                    evaluator_version, formula_version, status,
                    simulated_duration_seconds, cost_config, policy_config,
                    kpis, summary, data_quality_warnings, disclaimer,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    NOW(), NOW()
                ) ON CONFLICT (run_id, evaluator_version, formula_version) DO UPDATE SET
                    status = EXCLUDED.status,
                    simulated_duration_seconds = EXCLUDED.simulated_duration_seconds,
                    cost_config = EXCLUDED.cost_config,
                    policy_config = EXCLUDED.policy_config,
                    kpis = EXCLUDED.kpis,
                    summary = EXCLUDED.summary,
                    data_quality_warnings = EXCLUDED.data_quality_warnings,
                    updated_at = NOW()
            """
            cur.execute(
                upsert_query,
                (
                    summary.evaluation_id,
                    summary.run_id,
                    summary.scenario_id,
                    summary.seed,
                    summary.evaluator_version,
                    summary.formula_version,
                    summary.status,
                    summary.simulated_duration_seconds,
                    json.dumps(summary.cost_config),
                    json.dumps(summary.policy_config),
                    json.dumps(kpis_dict),
                    json.dumps(summary.model_dump()),
                    json.dumps(summary.data_quality_warnings),
                    summary.disclaimer,
                ),
            )
            conn.commit()
    finally:
        conn.close()
