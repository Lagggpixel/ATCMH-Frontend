"""Offline checks shared by the airport importer and catalogue audit.

Do not force parallel runway numbers to be parallel: check each physical runway
against its own mapped centreline, retaining displaced thresholds on that axis.
"""
import math

MAX_AXIS_ERROR_DEGREES = .35
MAX_LATERAL_METRES = 20
FEET_PER_NM = 6076.11549


def bearing(first, last):
    return math.degrees(math.atan2(last['x'] - first['x'], last['y'] - first['y'])) % 360


def angle_difference(first, last):
    return abs((first - last + 180) % 360 - 180)


def normalize_runway(identifier):
    return identifier.strip().upper().zfill(2) if identifier.strip().isdigit() else identifier.strip().upper().rjust(3, '0')


def mapped_centerline(pair, features):
    names = {normalize_runway(end['id']) for end in pair['ends']}
    mapped = [f for f in features if f['kind'] == 'runway'
              and {normalize_runway(name) for name in f['name'].split('/')} == names]
    if not mapped:
        raise ValueError(f"{pair.get('id', names)}: no matching mapped runway centerline")
    # Order along the supplied direction; do not use magnetic runway numbers.
    heading = math.radians(pair['ends'][0]['heading'])
    vector = math.sin(heading), math.cos(heading)
    changed = True
    while changed:
        changed = False
        ends = [p for feature in mapped for p in (feature['points'][0], feature['points'][-1])]
        for feature in features:
            if feature['kind'] != 'runway' or feature['name'] or feature in mapped:
                continue
            first, last = feature['points'][0], feature['points'][-1]
            dx, dy = last['x'] - first['x'], last['y'] - first['y']
            length = math.hypot(dx, dy)
            if length and abs(dx * vector[0] + dy * vector[1]) / length > .99 and (first in ends or last in ends):
                mapped.append(feature)
                changed = True
    points = [point for feature in mapped for point in feature['points']]
    if any(not math.isfinite(point[key]) for point in points for key in ('x', 'y')):
        raise ValueError(f"{pair.get('id', names)}: non-finite mapped runway coordinates")
    along = lambda point: point['x'] * vector[0] + point['y'] * vector[1]
    intervals = sorted((min(map(along, f['points'])), max(map(along, f['points']))) for f in mapped)
    reach = intervals[0][1]
    for start, stop in intervals[1:]:
        if start - reach > 50 / 1852:
            raise ValueError(f"{pair.get('id', names)}: disconnected mapped runway segments")
        reach = max(reach, stop)
    first, last = min(points, key=along), max(points, key=along)
    dx, dy = last['x'] - first['x'], last['y'] - first['y']
    length = math.hypot(dx, dy)
    if not length or not math.isfinite(length):
        raise ValueError(f"{pair.get('id', names)}: invalid mapped runway length")
    # Reject conflicting named segments rather than spanning unrelated geometry.
    if max(abs((p['x'] - first['x']) * dy - (p['y'] - first['y']) * dx) / length * 1852 for p in points) > MAX_LATERAL_METRES:
        raise ValueError(f"{pair.get('id', names)}: mapped runway segments are not collinear")
    return first, last


def validate_runway(pair, features):
    label = pair.get('id', '/'.join(end['id'] for end in pair['ends']))
    if len(pair['ends']) != 2 or len({normalize_runway(e['id']) for e in pair['ends']}) != 2:
        raise ValueError(f'{label}: two distinct runway ends are required')
    for end in pair['ends']:
        if not all(math.isfinite(end['point'][key]) for key in ('x', 'y')) or not math.isfinite(end['heading']):
            raise ValueError(f'{label}: non-finite runway coordinates or heading')
    first, last = (end['point'] for end in pair['ends'])
    length = math.hypot(last['x'] - first['x'], last['y'] - first['y'])
    feet = pair['lengthFeet']
    if not math.isfinite(feet) or feet <= 0 or not length or abs(length * FEET_PER_NM / feet - 1) > .1:
        raise ValueError(f'{label}: endpoint span differs from runway length by more than 10%')
    heading = bearing(first, last)
    if any(angle_difference(end['heading'], (heading + 180 * index) % 360) > 1.5 for index, end in enumerate(pair['ends'])):
        raise ValueError(f'{label}: true headings disagree with endpoint direction')
    mapped_first, mapped_last = mapped_centerline(pair, features)
    mapped_heading = bearing(mapped_first, mapped_last)
    axis_error = angle_difference(heading, mapped_heading)
    dx, dy = mapped_last['x'] - mapped_first['x'], mapped_last['y'] - mapped_first['y']
    mapped_length = math.hypot(dx, dy)
    lateral = max(abs((p['x'] - mapped_first['x']) * dy - (p['y'] - mapped_first['y']) * dx) / mapped_length * 1852 for p in (first, last))
    # OSM may omit a blast pad or displaced-threshold segment. Allow up to 10%
    # of the supplied length beyond either end, but reject a runway translated
    # far along an otherwise correct infinite centreline.
    margin = max(50 / 1852, feet / FEET_PER_NM * .1)
    along = [((p['x'] - mapped_first['x']) * dx + (p['y'] - mapped_first['y']) * dy) / mapped_length for p in (first, last)]
    if min(along) < -margin or max(along) > mapped_length + margin:
        raise ValueError(f'{label}: threshold lies beyond the mapped runway span')
    if axis_error > MAX_AXIS_ERROR_DEGREES or lateral > MAX_LATERAL_METRES:
        raise ValueError(f'{label}: runway differs from mapped centerline ({axis_error:.3f} degrees, {lateral:.1f} m lateral); inspect sources before using --osm-runway-geometry')
    return {'axisErrorDegrees': round(axis_error, 4), 'lateralMetres': round(lateral, 2)}
