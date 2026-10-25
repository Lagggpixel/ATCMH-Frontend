"""Offline regression for OSM runways split into multiple ways."""
import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import copy
import runpy
from runway_geometry import validate_runway


class RunwayImportTest(unittest.TestCase):
    def test_joined_centerline_keeps_both_thresholds_and_ignores_crossing_runway(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            osm = root / 'airport.osm'
            osm.write_text('''<osm>
              <node id="1" lon="0" lat="0"/><node id="2" lon=".01" lat="0"/>
              <node id="3" lon=".02" lat="0"/><node id="4" lon=".03" lat="0"/>
              <node id="5" lon=".02" lat=".01"/>
              <way id="100"><nd ref="3"/><nd ref="4"/><tag k="aeroway" v="runway"/><tag k="ref" v="09/27"/></way>
              <way id="101"><nd ref="2"/><nd ref="3"/><tag k="aeroway" v="runway"/><tag k="ref" v="09/27"/></way>
              <way id="102"><nd ref="1"/><nd ref="2"/><tag k="aeroway" v="runway"/></way>
              <way id="103"><nd ref="3"/><nd ref="5"/><tag k="aeroway" v="runway"/></way>
              <way id="104"><nd ref="4"/><nd ref="5"/><tag k="aeroway" v="taxiway"/></way>
            </osm>''', encoding='utf-8')
            def write_csv(name, row):
                path = root / name
                with path.open('w', newline='', encoding='utf-8') as stream:
                    writer = csv.DictWriter(stream, fieldnames=row.keys())
                    writer.writeheader()
                    writer.writerow(row)
                return path
            airports = write_csv('airports.csv', {'ident': 'TEST', 'longitude_deg': '0', 'latitude_deg': '0', 'name': 'Test', 'elevation_ft': '0'})
            runways = write_csv('runways.csv', {'airport_ident': 'TEST', 'closed': '0', 'length_ft': '10936', 'width_ft': '150',
                'le_ident': '09', 'he_ident': '27', 'le_heading_degT': '90', 'he_heading_degT': '270',
                'le_longitude_deg': '0', 'le_latitude_deg': '0', 'he_longitude_deg': '.03', 'he_latitude_deg': '0'})
            output = root / 'result.json'
            command = [sys.executable, str(Path(__file__).with_name('import-simulator-data.py')), str(osm), str(airports), str(runways),
                '--icao', 'TEST', '--source-date', '2026-10-24', '--radar-only', '--output', str(output)]
            subprocess.run(command + ['--osm-runway-geometry'], check=True, capture_output=True)
            imported = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(imported['osmAttribution'], '\u00a9 OpenStreetMap contributors \u00b7 ODbL 1.0')
            ends = imported['runways'][0]['ends']
            self.assertEqual(ends[0], {'id': '09', 'heading': 90.0, 'point': {'x': 0.0, 'y': 0.0}})
            self.assertEqual(ends[1], {'id': '27', 'heading': 270.0, 'point': {'x': 1.8, 'y': 0.0}})
            # Default imports must reject skewed CSV endpoints before overwriting
            # an existing snapshot. The explicit mapped-geometry path repairs it.
            original = output.read_bytes()
            source = runways.read_text(encoding='utf-8').replace(',0,.03,0', ',.001,.03,0')
            runways.write_text(source, encoding='utf-8')
            rejected = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('runway', rejected.stderr.lower())
            self.assertEqual(output.read_bytes(), original)
            subprocess.run(command + ['--osm-runway-geometry'], check=True, capture_output=True)
            self.assertEqual(json.loads(output.read_text(encoding='utf-8'))['runways'][0]['ends'], ends)


class RunwayValidationTest(unittest.TestCase):
    def setUp(self):
        self.pair = {'id': '09/27', 'lengthFeet': 6076, 'ends': [
            {'id': '09', 'heading': 90, 'point': {'x': 0, 'y': 0}},
            {'id': '27', 'heading': 270, 'point': {'x': 1, 'y': 0}}]}
        self.features = [{'kind': 'runway', 'name': '27/9', 'points': [{'x': 0, 'y': 0}, {'x': 1, 'y': 0}]}]

    def test_valid_reciprocal_names_and_displaced_threshold(self):
        validate_runway(self.pair, self.features)
        self.pair['ends'][0]['point']['x'] = .05
        validate_runway(self.pair, self.features)

    def test_rejects_skewed_and_laterally_shifted_geometry(self):
        for positions in [(0, .02), (.02, .02)]:
            pair = copy.deepcopy(self.pair)
            for end, y in zip(pair['ends'], positions):
                end['point']['y'] = y
            with self.assertRaisesRegex(ValueError, 'mapped centerline'):
                validate_runway(pair, self.features)

    def test_rejects_magnetic_headings_and_reversed_ends(self):
        self.pair['ends'][0]['heading'] = 100
        with self.assertRaisesRegex(ValueError, 'true headings'):
            validate_runway(self.pair, self.features)
        self.pair['ends'][0]['heading'] = 90
        self.pair['ends'].reverse()
        # Reversing both labels and positions is valid; swapping positions alone is not.
        validate_runway(self.pair, self.features)
        self.pair['ends'][0]['point'], self.pair['ends'][1]['point'] = self.pair['ends'][1]['point'], self.pair['ends'][0]['point']
        with self.assertRaisesRegex(ValueError, 'true headings'):
            validate_runway(self.pair, self.features)

    def test_rejects_along_axis_translation_but_allows_small_map_omissions(self):
        self.pair['ends'][0]['point']['x'] += 2
        self.pair['ends'][1]['point']['x'] += 2
        with self.assertRaisesRegex(ValueError, 'mapped runway span'):
            validate_runway(self.pair, self.features)
        self.pair['ends'][0]['point']['x'] -= 1.95
        self.pair['ends'][1]['point']['x'] -= 1.95
        validate_runway(self.pair, self.features)

    def test_rejects_nonfinite_mapped_points(self):
        self.features[0]['points'].insert(1, {'x': float('nan'), 'y': 0})
        with self.assertRaisesRegex(ValueError, 'non-finite mapped'):
            validate_runway(self.pair, self.features)

    def test_rejects_nonfinite_zero_and_shortened_spans(self):
        for value in (float('nan'), float('inf'), 0, .5):
            pair = copy.deepcopy(self.pair)
            pair['ends'][1]['point']['x'] = value
            with self.assertRaises(ValueError):
                validate_runway(pair, self.features)

    def test_rejects_missing_and_conflicting_map_references(self):
        with self.assertRaisesRegex(ValueError, 'no matching'):
            validate_runway(self.pair, [])
        self.features.append({'kind': 'runway', 'name': '09/27', 'points': [{'x': 0, 'y': .2}, {'x': 1, 'y': .2}]})
        with self.assertRaisesRegex(ValueError, 'not collinear'):
            validate_runway(self.pair, self.features)

    def test_rejects_disconnected_named_segments(self):
        self.features.append({'kind': 'runway', 'name': '09/27', 'points': [{'x': 2, 'y': 0}, {'x': 3, 'y': 0}]})
        with self.assertRaisesRegex(ValueError, 'disconnected'):
            validate_runway(self.pair, self.features)

    def test_current_catalogue(self):
        audit = runpy.run_path(str(Path(__file__).with_name('audit-runway-geometry.py')))['audit']
        airports, directions, errors = audit(Path(__file__).resolve().parents[1] / 'src/simulator/data')
        self.assertGreaterEqual(airports, 32)
        self.assertGreaterEqual(directions, 132)
        self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
