"""Check every current airport snapshot; frozen *-before-* snapshots are excluded."""
import json
from pathlib import Path
import sys
from runway_geometry import validate_runway


def audit(directory):
    airports, directions, errors = 0, 0, []
    for path in sorted(directory.glob('*.json')):
        if '-' in path.stem:
            continue
        airport = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(airport, dict) or 'icao' not in airport or 'features' not in airport:
            continue
        airports += 1
        for pair in airport.get('runways', [airport.get('runway')]):
            if pair is None:
                errors.append(f"{airport['icao']}: no runway geometry")
                continue
            directions += len(pair['ends'])
            try:
                validate_runway(pair, airport['features'])
            except ValueError as error:
                errors.append(f"{airport['icao']}: {error}")
    return airports, directions, errors


if __name__ == '__main__':
    directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'src/simulator/data'
    airports, directions, errors = audit(directory)
    print(f'Checked {airports} airports / {directions} runway directions')
    for error in errors:
        print(error)
    if not airports:
        raise SystemExit('No airport snapshots found')
    raise SystemExit(1 if errors else 0)
