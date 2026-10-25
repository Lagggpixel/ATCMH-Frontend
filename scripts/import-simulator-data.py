"""Import downloaded OSM XML and OurAirports CSVs; validate runway axes offline.

python scripts/import-simulator-data.py <map.osm> <airports.csv> <runways.csv>
"""
import csv
import json
import math
import argparse
import hashlib
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
from runway_geometry import bearing, mapped_centerline, validate_runway

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('osm'); parser.add_argument('airports'); parser.add_argument('runways')
parser.add_argument('--icao', default='EGPH'); parser.add_argument('--source-date', default=str(date.today()))
parser.add_argument('--output', type=Path)
parser.add_argument('--radar-only', action='store_true', help='Allow radar snapshots without mapped parking centerlines')
parser.add_argument('--osm-runway-geometry', action='store_true', help='Use matching mapped runway centerline endpoints and derived true headings')
args = parser.parse_args()
icao = args.icao.upper()
root = ET.parse(args.osm).getroot()
if root.find('remark') is not None:
    raise ValueError('Incomplete OSM extract')
nodes = {n.attrib['id']: (float(n.attrib['lon']), float(n.attrib['lat'])) for n in root.findall('node')}
with open(args.airports, encoding='utf-8-sig') as source:
    airport = next(a for a in csv.DictReader(source) if a['ident'] == icao)
with open(args.runways, encoding='utf-8-sig') as source:
    runways = [r for r in csv.DictReader(source) if r['airport_ident'] == icao and r['closed'] == '0']
lon, lat = float(airport['longitude_deg']), float(airport['latitude_deg'])
def point(x, y):
    return {'x': round((x-lon)*60*math.cos(math.radians(lat)), 5), 'y': round((y-lat)*60, 5)}
features = []
for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    kind = tags.get('aeroway')
    if kind not in ('runway', 'taxiway', 'apron', 'terminal', 'parking_position', 'hangar', 'taxilane'):
        continue
    refs = [n.attrib['ref'] for n in way.findall('nd')]
    if any(ref not in nodes for ref in refs):
        raise ValueError('Incomplete OSM way ' + way.attrib['id'])
    coords = [point(*nodes[ref]) for ref in refs]
    if len(coords) > 1:
        features.append({'id': way.attrib['id'], 'kind': kind, 'name': tags.get('ref', tags.get('name', '')), 'points': coords})
pairs = [{'id': r['le_ident'] + '/' + r['he_ident'], 'lengthFeet': int(r['length_ft']),
          'widthFeet': int(r['width_ft'] or 150), 'ends': [
              {'id': r[p+'ident'], 'heading': float(r[p+'heading_degT']),
               'point': point(float(r[p+'longitude_deg']), float(r[p+'latitude_deg']))} for p in ('le_', 'he_')]} for r in runways]
if args.osm_runway_geometry:
    for pair in pairs:
        first, last = mapped_centerline(pair, features)
        heading = bearing(first, last)
        for end, position, direction in zip(pair['ends'], (first, last), (heading, (heading + 180) % 360)):
            end.update(point=position, heading=round(direction, 3))
for pair in pairs:
    validate_runway(pair, features)
if not pairs or not any(f['kind'] == 'taxiway' for f in features):
    raise ValueError('Runways and mapped taxiways are required')
if not args.radar_only and not any(f['kind'] == 'parking_position' for f in features):
    raise ValueError('No oriented parking centerlines; inspect source before enabling ground creation')
data = {'icao': icao, 'name': airport['name'], 'origin': {'lat': lat, 'lon': lon}, 'elevation': int(airport['elevation_ft']),
        'sourceDate': args.source_date, 'osmAttribution': '© OpenStreetMap contributors · ODbL 1.0', 'runways': pairs, 'features': features}
data['dataVersion'] = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
data['sources'] = {key: hashlib.sha256(Path(path).read_bytes()).hexdigest() for key, path in
                   [('osmSha256', args.osm), ('airportsSha256', args.airports), ('runwaysSha256', args.runways)]}
if args.osm_runway_geometry:
    data['sources']['runwayGeometry'] = 'Joined OSM runway centerline segments; true headings derived from projected endpoints'
target = args.output or Path(__file__).resolve().parents[1] / f'src/simulator/data/{icao.lower()}.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(f'Imported {icao}: {len(pairs)} runway pairs and {len(features)} OSM features')
