"""Import a downloaded OSM XML extract and OurAirports CSVs; no network access.

python scripts/import-simulator-data.py <map.osm> <airports.csv> <runways.csv>
"""
import csv
import json
import math
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

root = ET.parse(sys.argv[1]).getroot()
nodes = {n.attrib['id']: (float(n.attrib['lon']), float(n.attrib['lat'])) for n in root.findall('node')}
airport = next(a for a in csv.DictReader(open(sys.argv[2], encoding='utf-8')) if a['ident'] == 'EGPH')
runway = next(a for a in csv.DictReader(open(sys.argv[3], encoding='utf-8')) if a['airport_ident'] == 'EGPH' and a['le_ident'] == '06')
lon, lat = float(airport['longitude_deg']), float(airport['latitude_deg'])
def point(x, y):
    return {'x': round((x-lon)*60*math.cos(math.radians(lat)), 5), 'y': round((y-lat)*60, 5)}
features = []
for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    kind = tags.get('aeroway')
    if kind not in ('runway', 'taxiway', 'apron', 'terminal', 'parking_position', 'hangar', 'taxilane'):
        continue
    coords = [point(*nodes[n.attrib['ref']]) for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if len(coords) > 1:
        features.append({'id': way.attrib['id'], 'kind': kind, 'name': tags.get('ref', tags.get('name', '')), 'points': coords})
data = {'icao': 'EGPH', 'name': airport['name'], 'origin': {'lat': lat, 'lon': lon}, 'elevation': int(airport['elevation_ft']),
        'sourceDate': str(date.today()), 'osmAttribution': '© OpenStreetMap contributors · ODbL 1.0',
        'runway': {'lengthFeet': int(runway['length_ft']), 'ends': [
            {'id': runway[p+'ident'], 'heading': float(runway[p+'heading_degT']),
             'point': point(float(runway[p+'longitude_deg']), float(runway[p+'latitude_deg']))} for p in ('le_', 'he_')]},
        'features': features}
target = Path(__file__).resolve().parents[1] / 'src/simulator/data/egph.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(f'Imported {len(features)} OSM features and EGPH runway metadata')
