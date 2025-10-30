#!/usr/bin/env python3
"""
Export Kieswijzer 2025 data to JSON format.

Usage:
    python export_to_json.py
    
This will create statements_wide.json with the data in a structured format.
"""

import json
import pandas as pd
from pathlib import Path


def export_statements_to_json(
    csv_path: str = "statements_wide.csv",
    json_path: str = "statements_wide.json",
    format_type: str = "structured"
) -> None:
    """
    Export statements_wide.csv to JSON format.
    
    Args:
        csv_path: Path to input CSV file
        json_path: Path to output JSON file
        format_type: Output format - "structured" or "flat"
            - "structured": Nested format with statements and party positions
            - "flat": Simple array of objects (like CSV rows)
    """
    # Load the CSV
    df = pd.read_csv(csv_path)
    
    if format_type == "structured":
        # Create structured format
        data = {
            "metadata": {
                "source": "StemWijzer Tweede Kamerverkiezing 2025",
                "url": "https://tweedekamer2025.stemwijzer.nl",
                "total_statements": len(df),
                "total_parties": len(df.columns) - 2,  # Exclude statement_id and statement_text
                "stance_values": {
                    "1": "Agree (Eens)",
                    "0": "Neutral (Geen van beide)",
                    "-1": "Disagree (Oneens)"
                }
            },
            "parties": [col for col in df.columns if col not in ['statement_id', 'statement_text']],
            "statements": []
        }
        
        # Add each statement
        for _, row in df.iterrows():
            statement = {
                "id": row['statement_id'],
                "text": row['statement_text'],
                "positions": {}
            }
            
            # Add party positions
            for party in data["parties"]:
                stance = row[party]
                if pd.notna(stance):  # Check if not NaN
                    statement["positions"][party] = int(stance)
            
            data["statements"].append(statement)
    
    else:  # flat format
        # Convert DataFrame to list of dictionaries
        data = df.to_dict(orient='records')
    
    # Write to JSON file
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Exported {len(df)} statements to {json_path}")
    print(f"  Format: {format_type}")
    print(f"  File size: {Path(json_path).stat().st_size / 1024:.1f} KB")


def export_long_format_to_json(
    csv_path: str = "statements_long.csv",
    json_path: str = "statements_long.json"
) -> None:
    """
    Export statements_long.csv to JSON format.
    
    Args:
        csv_path: Path to input CSV file
        json_path: Path to output JSON file
    """
    df = pd.read_csv(csv_path)
    
    # Group by statement
    data = {
        "metadata": {
            "source": "StemWijzer Tweede Kamerverkiezing 2025",
            "url": "https://tweedekamer2025.stemwijzer.nl",
            "total_records": len(df),
            "format": "long (one row per statement-party combination)"
        },
        "data": df.to_dict(orient='records')
    }
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Exported {len(df)} records to {json_path}")
    print(f"  File size: {Path(json_path).stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    print("Exporting Kieswijzer 2025 data to JSON...\n")
    
    # Export wide format (structured)
    export_statements_to_json(
        csv_path="statements_wide.csv",
        json_path="statements_wide.json",
        format_type="structured"
    )
    
    print()
    
    # Export wide format (flat) - alternative format
    export_statements_to_json(
        csv_path="statements_wide.csv",
        json_path="statements_wide_flat.json",
        format_type="flat"
    )
    
    print()
    
    # Export long format
    export_long_format_to_json(
        csv_path="statements_long.csv",
        json_path="statements_long.json"
    )
    
    print("\n✓ All exports complete!")