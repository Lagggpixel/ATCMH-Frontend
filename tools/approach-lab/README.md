# Approach Lab

Run the local simulator preview from the Frontend directory:

```sh
npm run approach:lab
```

Open <http://127.0.0.1:4179/>. The server listens only on this computer; press Ctrl+C in its terminal to stop it. Set `APPROACH_LAB_PORT` before starting to use a different port.

Choose an airport, runway, aircraft performance profile, starting position, heading, speed, altitude and wind. Click the map or enter the east/north offsets relative to the selected runway threshold. Negative east means west; negative north means south. Headings and wind directions are **true**, altitude is **feet MSL**, and airspeed is **knots IAS**.

The airspeed is the initial IAS. The selected aircraft's automatic speed profile controls its subsequent speed.

**Visual approach** sends the simulator's visual clearance and automatic readback. The optional Tower handoff is applied immediately after the readback. Turn it off to see what happens when an arrival remains on Approach. **RV → Traffic** sets the aircraft to expect vectors, then sends it to UNICOM through the same command and readback flow. The lab shows the path, outcome, events and time-scrubbable aircraft state. The simulation ends on landing, missed approach, unable, or the selected time limit.

The lab runs the **current local Frontend source**, including uncommitted simulator changes. It does not read or modify live sessions, connect to production, or model other traffic. It uses the simulator's bundled airport geometry and simplified aircraft performance; it is not real-world flight guidance. The displayed outcome is a forecast for the specified initial conditions, not a guarantee about a separate live session.
