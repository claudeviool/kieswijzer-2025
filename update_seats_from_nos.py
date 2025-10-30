#!/usr/bin/env python3
"""
Update party seats from NOS VoteFlow API official results.
"""

import json
from datetime import datetime

# Read NOS data
with open('nos_national_results.json', 'r') as f:
    nos_data = json.load(f)

# Extract party seats from NOS data
parties = []
for party_data in nos_data['partijen']:
    party_name = party_data['partij']['short_name']
    seats = party_data['huidig']['zetels']
    votes = party_data['huidig']['stemmen']
    
    # Only include parties with seats
    if seats > 0:
        parties.append({
            'party': party_name,
            'seats': seats,
            'votes': votes
        })

# Sort by seats (descending), then by votes (descending)
parties.sort(key=lambda x: (-x['seats'], -x['votes']))

# Create output structure
output = {
    'metadata': {
        'source': 'NOS VoteFlow API',
        'source_url': 'https://voteflow.api.nos.nl/TK25/index.json',
        'election': 'Tweede Kamer 2025',
        'date': '2025-10-30',
        'publication_datetime': nos_data['publicatie_datum_tijd'],
        'municipalities_counted': nos_data['aantal_uitslagen'],
        'total_municipalities': 342,
        'status': 'Eindstand' if nos_data['aantal_uitslagen'] == 342 else 'Tussenstand',
        'eligible_voters': nos_data['huidige_verkiezing']['kiesgerechtigden'],
        'turnout': nos_data['huidige_verkiezing']['opkomst'],
        'turnout_percentage': nos_data['huidige_verkiezing']['opkomst_promillage'] / 10,
        'total_seats': 150,
        'notes': 'Official final results from NOS VoteFlow API. D66 and PVV tied at 26 seats each.'
    },
    'parties': parties
}

# Write to file
with open('party_seats_exitpoll_2025.json', 'w') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"✓ Updated party_seats_exitpoll_2025.json with official NOS results")
print(f"  Status: {output['metadata']['status']}")
print(f"  Municipalities: {output['metadata']['municipalities_counted']}/{output['metadata']['total_municipalities']}")
print(f"  Turnout: {output['metadata']['turnout_percentage']:.1f}%")
print(f"  Parties with seats: {len(parties)}")
print(f"\nTop 5 parties:")
for i, party in enumerate(parties[:5], 1):
    print(f"  {i}. {party['party']}: {party['seats']} seats ({party['votes']:,} votes)")