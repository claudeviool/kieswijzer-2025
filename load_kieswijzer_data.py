#!/usr/bin/env python3
"""
Load Kieswijzer 2025 data into pandas DataFrames for analysis.

Usage:
    from load_kieswijzer_data import load_statements_wide, load_statements_long
    
    # Load wide format (statements × parties matrix)
    df_wide = load_statements_wide()
    
    # Load long format (one row per statement-party combination)
    df_long = load_statements_long()
"""

import pandas as pd
from pathlib import Path


def load_statements_wide(filepath: str = "statements_wide.csv") -> pd.DataFrame:
    """
    Load the wide-format CSV into a pandas DataFrame.
    
    Returns a DataFrame with:
    - Index: statement_id
    - Columns: statement_text, party names
    - Values: stance (-1, 0, 1)
    
    Args:
        filepath: Path to the wide-format CSV file
        
    Returns:
        DataFrame with statements as rows and parties as columns
    """
    df = pd.read_csv(filepath)
    
    # Set statement_id as index for easier lookup
    df = df.set_index('statement_id')
    
    return df


def load_statements_long(filepath: str = "statements_long.csv") -> pd.DataFrame:
    """
    Load the long-format CSV into a pandas DataFrame.
    
    Returns a DataFrame with columns:
    - statement_id: Statement identifier (t01, t02, ...)
    - statement_text: Full text of the statement
    - party: Party name
    - stance_value: Party's stance (-1, 0, 1)
    
    Args:
        filepath: Path to the long-format CSV file
        
    Returns:
        DataFrame in long format (one row per statement-party combination)
    """
    df = pd.read_csv(filepath)
    return df


def get_party_agreement(df_wide: pd.DataFrame, party1: str, party2: str) -> dict:
    """
    Calculate agreement statistics between two parties.
    
    Args:
        df_wide: Wide-format DataFrame from load_statements_wide()
        party1: Name of first party
        party2: Name of second party
        
    Returns:
        Dictionary with agreement statistics:
        - total_statements: Total number of statements
        - agreements: Number of statements where parties agree
        - disagreements: Number of statements where parties disagree
        - agreement_rate: Percentage of agreement (0-100)
    """
    if party1 not in df_wide.columns or party2 not in df_wide.columns:
        raise ValueError(f"One or both parties not found in data")
    
    p1_stances = df_wide[party1]
    p2_stances = df_wide[party2]
    
    # Count agreements (same stance)
    agreements = (p1_stances == p2_stances).sum()
    
    # Count disagreements (opposite stances: 1 vs -1 or -1 vs 1)
    disagreements = ((p1_stances == 1) & (p2_stances == -1)).sum() + \
                   ((p1_stances == -1) & (p2_stances == 1)).sum()
    
    total = len(p1_stances)
    agreement_rate = (agreements / total * 100) if total > 0 else 0
    
    return {
        'total_statements': total,
        'agreements': agreements,
        'disagreements': disagreements,
        'agreement_rate': round(agreement_rate, 2)
    }


def get_party_positions(df_wide: pd.DataFrame, party: str) -> pd.DataFrame:
    """
    Get all positions for a specific party.
    
    Args:
        df_wide: Wide-format DataFrame from load_statements_wide()
        party: Name of the party
        
    Returns:
        DataFrame with statement_text and stance for the party
    """
    if party not in df_wide.columns:
        raise ValueError(f"Party '{party}' not found in data")
    
    result = df_wide[['statement_text', party]].copy()
    result.columns = ['statement', 'stance']
    
    # Add human-readable stance labels
    stance_labels = {1: 'Agree', 0: 'Neutral', -1: 'Disagree'}
    result['stance_label'] = result['stance'].map(stance_labels)
    
    return result


def get_statement_positions(df_wide: pd.DataFrame, statement_id: str) -> pd.Series:
    """
    Get all party positions for a specific statement.
    
    Args:
        df_wide: Wide-format DataFrame from load_statements_wide()
        statement_id: Statement identifier (e.g., 't01')
        
    Returns:
        Series with party names as index and stances as values
    """
    if statement_id not in df_wide.index:
        raise ValueError(f"Statement '{statement_id}' not found in data")
    
    # Get all columns except statement_text
    parties = [col for col in df_wide.columns if col != 'statement_text']
    return df_wide.loc[statement_id, parties]


def calculate_agreement_matrix(df_wide: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate pairwise agreement rates between all parties.
    
    Args:
        df_wide: Wide-format DataFrame from load_statements_wide()
        
    Returns:
        DataFrame with parties as both rows and columns, values are agreement percentages
    """
    parties = [col for col in df_wide.columns if col != 'statement_text']
    
    # Create empty matrix
    agreement_matrix = pd.DataFrame(index=parties, columns=parties, dtype=float)
    
    # Calculate pairwise agreements
    for p1 in parties:
        for p2 in parties:
            if p1 == p2:
                agreement_matrix.loc[p1, p2] = 100.0
            else:
                stats = get_party_agreement(df_wide, p1, p2)
                agreement_matrix.loc[p1, p2] = stats['agreement_rate']
    
    return agreement_matrix


if __name__ == "__main__":
    # Example usage
    print("Loading Kieswijzer 2025 data...")
    
    # Load data
    df_wide = load_statements_wide()
    df_long = load_statements_long()
    
    print(f"\nWide format: {df_wide.shape[0]} statements × {df_wide.shape[1]-1} parties")
    print(f"Long format: {len(df_long)} rows")
    
    # Show example: agreement between two parties
    print("\n--- Example: Agreement between PVV and VVD ---")
    stats = get_party_agreement(df_wide, "PVV", "VVD")
    print(f"Agreement rate: {stats['agreement_rate']}%")
    print(f"Agreements: {stats['agreements']}/{stats['total_statements']}")
    print(f"Disagreements: {stats['disagreements']}/{stats['total_statements']}")
    
    # Show example: positions for one party
    print("\n--- Example: D66 positions (first 5) ---")
    d66_positions = get_party_positions(df_wide, "D66")
    print(d66_positions.head())
    
    # Show example: one statement's positions
    print("\n--- Example: Statement t01 positions ---")
    print(f"Statement: {df_wide.loc['t01', 'statement_text']}")
    positions = get_statement_positions(df_wide, 't01')
    print("\nParty positions:")
    for party, stance in positions.items():
        stance_label = {1: 'Agree', 0: 'Neutral', -1: 'Disagree'}[stance]
        print(f"  {party}: {stance_label}")