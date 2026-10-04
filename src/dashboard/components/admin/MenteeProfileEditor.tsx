import {useState} from "react";
import type {AdminMentee} from "../../types/AdminMentee.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import WeeklyAvailabilityEditor from "../../../apply/WeeklyAvailabilityEditor.tsx";
import {defaultWeeklyAvailabilityAnswer} from "../../../apply/weekly-availability.ts";
import styles from "./MenteeProfileEditor.module.css";

export default function MenteeProfileEditor({mentee, token, onSaved}: {
    mentee: AdminMentee; token: string | null; onSaved: (mentee: AdminMentee) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [region, setRegion] = useState(mentee.region ?? "");
    const [timezone, setTimezone] = useState(mentee.timezone ?? "");
    const [availability, setAvailability] = useState(mentee.availability || defaultWeeklyAvailabilityAnswer);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const begin = () => {
        setRegion(mentee.region ?? ""); setTimezone(mentee.timezone ?? "");
        setAvailability(mentee.availability || defaultWeeklyAvailabilityAnswer);
        setError(undefined); setSaved(false); setEditing(true);
    };
    return <section className={styles.editor} aria-label="Edit mentee profile">
        {!editing ? <><button type="button" onClick={begin}>Edit profile</button>{saved ? <p role="status">Profile saved.</p> : null}</> :
            <form onSubmit={async event => {
                event.preventDefault();
                if (busy) return;
                setBusy(true); setError(undefined);
                try {
                    const updated = await ApiUtils.updateMenteeProfile(token, mentee.id, {region, timezone, availability});
                    if (!updated) throw new Error("Your session expired. Sign in again to save.");
                    onSaved(updated); setEditing(false); setSaved(true);
                } catch (failure) { setError(failure instanceof Error ? failure.message : "Failed to save profile."); }
                finally { setBusy(false); }
            }}>
                <h3>Edit mentee profile</h3>
                <p>Changes are recorded in audit logs and sent to mentee-logs.</p>
                <fieldset disabled={busy}>
                    <label htmlFor="mentee-region">Region</label>
                    <input id="mentee-region" required maxLength={128} value={region} onChange={event => setRegion(event.target.value)}/>
                    <label htmlFor="mentee-timezone">Timezone</label>
                    <input id="mentee-timezone" required maxLength={128} placeholder="Europe/London or UTC+1" value={timezone} onChange={event => setTimezone(event.target.value)}/>
                    <h4>Weekly availability (UTC)</h4>
                    <WeeklyAvailabilityEditor id="mentee-profile-availability" value={availability} onChange={setAvailability}/>
                    {error ? <p role="alert">{error}</p> : null}
                    <div className={styles.actions}>
                        <button type="submit">{busy ? "Saving…" : "Save profile"}</button>
                        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </fieldset>
            </form>}
    </section>;
}
