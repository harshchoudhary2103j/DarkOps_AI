"""
Command-line interface for the DarkOps AI Synthetic World Seeder.
"""

import argparse
import json
import os
import sys
from .config import ScenarioConfig
from .generator import generate_world
from .models import SyntheticWorld
from .validation import validate_world
from .canonical import to_canonical_json, compute_canonical_hash
from .importer import WorldImporter


def load_config(path: str) -> ScenarioConfig:
    if not os.path.exists(path):
        print(f"Error: Scenario config file not found: {path}", file=sys.stderr)
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return ScenarioConfig(**data)


def main():
    parser = argparse.ArgumentParser(description="DarkOps AI Synthetic World Seeder CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # 1. generate
    gen_parser = subparsers.add_parser("generate", help="Generate a synthetic world artifact")
    gen_parser.add_argument("--scenario", required=True, help="Path to scenario JSON configuration")
    gen_parser.add_argument("--seed", type=int, default=None, help="Override random seed")
    gen_parser.add_argument("--output", "-o", default=None, help="Output canonical JSON file path")

    # 2. validate
    val_parser = subparsers.add_parser("validate", help="Validate an existing synthetic world artifact")
    val_parser.add_argument("--input", "-i", required=True, help="Path to synthetic world JSON artifact")

    # 3. import
    imp_parser = subparsers.add_parser("import", help="Import a world artifact into the Operational API")
    imp_parser.add_argument("--input", "-i", required=True, help="Path to synthetic world JSON artifact")
    imp_parser.add_argument("--api-url", default=os.environ.get("OPERATIONAL_API_URL", "http://localhost:3000"))
    imp_parser.add_argument("--dry-run", action="store_true", help="Perform validation without sending HTTP requests")

    # 4. run-all
    run_parser = subparsers.add_parser("run-all", help="Generate, validate, and import a scenario")
    run_parser.add_argument("--scenario", required=True, help="Path to scenario JSON configuration")
    run_parser.add_argument("--seed", type=int, default=None, help="Override random seed")
    run_parser.add_argument("--output", "-o", default=None, help="Optional output path for generated artifact")
    run_parser.add_argument("--api-url", default=os.environ.get("OPERATIONAL_API_URL", "http://localhost:3000"))
    run_parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if args.command == "generate":
        config = load_config(args.scenario)
        if args.seed is not None:
            config.seed = args.seed

        print(f"[seeder] Generating synthetic world: scenario={config.scenario_id}, seed={config.seed}...")
        world = generate_world(config)
        canonical_json = to_canonical_json(world)
        sha256 = compute_canonical_hash(world)
        print(f"[seeder] Generation complete. Canonical SHA-256: {sha256}")

        if args.output:
            out_dir = os.path.dirname(args.output)
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(canonical_json)
            print(f"[seeder] Artifact saved to: {args.output}")
        else:
            print(canonical_json)

    elif args.command == "validate":
        print(f"[seeder] Validating artifact: {args.input}...")
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
        world = SyntheticWorld(**data)
        validate_world(world)
        sha256 = compute_canonical_hash(world)
        print(f"[seeder] Artifact is VALID. Stores: {len(world.stores)}, SKUs: {len(world.skus)}, Layouts: {len(world.warehouse_layouts)}")
        print(f"[seeder] Canonical SHA-256: {sha256}")

    elif args.command == "import":
        print(f"[seeder] Loading artifact: {args.input}...")
        with open(args.input, "r", encoding="utf-8") as f:
            data = json.load(f)
        world = SyntheticWorld(**data)
        validate_world(world)

        importer = WorldImporter(api_base_url=args.api_url)
        print(f"[seeder] Importing to {args.api_url} (dry_run={args.dry_run})...")
        report = importer.import_world(world, dry_run=args.dry_run)

        print("[seeder] Import Summary:")
        print(json.dumps(report.summary(), indent=2))
        if not report.is_success:
            sys.exit(1)

    elif args.command == "run-all":
        config = load_config(args.scenario)
        if args.seed is not None:
            config.seed = args.seed

        print(f"[seeder] Generating world: scenario={config.scenario_id}, seed={config.seed}...")
        world = generate_world(config)
        sha256 = compute_canonical_hash(world)
        print(f"[seeder] Generated successfully. Canonical SHA-256: {sha256}")

        if args.output:
            out_dir = os.path.dirname(args.output)
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(to_canonical_json(world))
            print(f"[seeder] Artifact saved to: {args.output}")

        importer = WorldImporter(api_base_url=args.api_url)
        print(f"[seeder] Importing to {args.api_url} (dry_run={args.dry_run})...")
        report = importer.import_world(world, dry_run=args.dry_run)

        print("[seeder] Import Summary:")
        print(json.dumps(report.summary(), indent=2))
        if not report.is_success:
            sys.exit(1)


if __name__ == "__main__":
    main()
