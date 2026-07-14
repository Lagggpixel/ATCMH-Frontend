import {type FormEvent, useMemo, useState} from "react";
import type {AdminAssignment, AdminAssignmentGroup, AdminAssignmentPayload} from "../../types/AdminAssignment.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import styles from "./AdminAssignments.module.css";
import {useTableSort} from "../../hooks/useTableSort.ts";

interface AdminAssignmentsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    users: AtcmhUser[] | undefined;
    adminUser: AdminUser | undefined;
    assignments: AdminAssignment[] | undefined;
    token: string | null;
    onAssignmentChanged: (assignment: AdminAssignment) => void;
    onAssignmentDeleted: (assignmentId: number) => void;
}

const DEFAULT_TEMPLATE = `# Session {{session_count}} for {{mentee}}
{{description}}

__**ASSIGNMENTS:**__

{{groups}}

{{footer}}`;

const DEFAULT_SERVER_TYPE = `Training`;

const DEFAULT_DESCRIPTION = `Mentor: {{mentorTag}}
Server: **{{serverType}}**
Airport: **{{airport}}**
Runways: **{{runways}}**
Pattern Altitude: **{{patternAltitude}}**`;

const DEFAULT_FOOTER = `Rules:
- Fly at jet pattern altitude (1500’ AGL)
- 200kt on downwind (or as required for spacing).
- Less than 180-200kt on base.
- Less than 180kt on final.
- Follow all ATC commands even if they don’t make sense.
- Leave feedback at the end of the session

Let me know if you have any questions. Thanks for coming & enjoy!`;

type CollapsibleFieldId = "template" | "description" | "footer";

const emptyForm: AdminAssignmentPayload = {
    airport: "",
    runways: "Mentee's discretion",
    patternAltitude: "",
    serverType: DEFAULT_SERVER_TYPE,
    title: "",
    description: DEFAULT_DESCRIPTION,
    template: DEFAULT_TEMPLATE,
    footer: DEFAULT_FOOTER,
    groups: [
        {
            name: "Ground",
            slots: [
                {label: "", details: "Pushback conflict with below, patterns"},
                {label: "", details: "Pushback conflict with above, patterns"},
                {label: "", details: "Taxi give way conflict with above, patterns"}
            ],
        },
        {
            name: "Tower",
            slots: [
                {label: "", details: "Transition, inbound touch & go when overhead"},
            ],
        }
    ],
};

const AdminAssignments = ({
                              loaded,
                              loggedIn,
                              error,
                              users,
                              adminUser,
                              assignments,
                              token,
                              onAssignmentChanged,
                              onAssignmentDeleted
                          }: AdminAssignmentsProps) => {
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<number | "new">("new");
    const [form, setForm] = useState<AdminAssignmentPayload>(emptyForm);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | undefined>();
    const [openFields, setOpenFields] = useState<Record<CollapsibleFieldId, boolean>>({
        template: false,
        description: false,
        footer: false,
    });

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);
    const selectedAssignment = useMemo(() => {
        if (selectedId === "new") return undefined;
        return assignments?.find(assignment => assignment.id === selectedId);
    }, [assignments, selectedId]);

    const assignableRecords = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!assignments) return [];
        return assignments
            .filter(assignment => {
                if (!normalized) return true;
                return [
                    assignment.airport,
                    assignment.title,
                    assignment.runways,
                    assignment.patternAltitude,
                    assignment.serverType,
                    assignment.description,
                    getUserName(usersById, assignment.ownerId),
                ].join(" ").toLowerCase().includes(normalized);
            })
            .map(assignment => ({
                airport: assignment.airport,
                title: assignment.title,
                runways: assignment.runways,
                patternAltitude: assignment.patternAltitude,
                serverType: assignment.serverType,
                description: assignment.description,
                template: assignment.template,
                footer: assignment.footer,
                ownerId: assignment.ownerId,
                id: assignment.id,
                active: assignment.active,
                groups: assignment.groups,
            }));
    }, [assignments, query, usersById]);

    const {sortedData} = useTableSort(
        "airport",
        "asc",
        assignableRecords
    );

    const canManageSelected = selectedAssignment == null || canManageAssignment(selectedAssignment, adminUser);

    const selectAssignment = (assignment: AdminAssignment) => {
        setSelectedId(assignment.id);
        setActionError(undefined);
        setForm({
            airport: assignment.airport,
            runways: assignment.runways,
            patternAltitude: assignment.patternAltitude,
            serverType: assignment.serverType || DEFAULT_SERVER_TYPE,
            title: assignment.title,
            description: assignment.description || DEFAULT_DESCRIPTION,
            template: assignment.template || DEFAULT_TEMPLATE,
            footer: assignment.footer || DEFAULT_FOOTER,
            groups: normalizeGroups(assignment.groups),
        });
    };

    const startNew = () => {
        setSelectedId("new");
        setActionError(undefined);
        setForm(clonePayload(emptyForm));
    };

    const updateField = (field: keyof Omit<AdminAssignmentPayload, "groups">, value: string) => {
        setForm(prev => ({...prev, [field]: field === "airport" ? value.toUpperCase() : value}));
    };

    const toggleField = (field: CollapsibleFieldId) => {
        setOpenFields(prev => ({...prev, [field]: !prev[field]}));
    };

    const updateGroupName = (groupIndex: number, name: string) => {
        setForm(prev => updateGroups(prev, groups => {
            groups[groupIndex] = {...groups[groupIndex], name};
        }));
    };

    const addGroup = () => {
        setForm(prev => ({...prev, groups: [...prev.groups, {name: "New Group", slots: [{label: "", details: ""}]}]}));
    };

    const removeGroup = (groupIndex: number) => {
        setForm(prev => ({...prev, groups: prev.groups.filter((_, index) => index !== groupIndex)}));
    };

    const updateSlot = (groupIndex: number, slotIndex: number, field: "label" | "details", value: string) => {
        setForm(prev => updateGroups(prev, groups => {
            const group = groups[groupIndex];
            const slots = group.slots.map((slot, index) => index === slotIndex ? {...slot, [field]: value} : slot);
            groups[groupIndex] = {...group, slots};
        }));
    };

    const addSlot = (groupIndex: number) => {
        setForm(prev => updateGroups(prev, groups => {
            const group = groups[groupIndex];
            groups[groupIndex] = {...group, slots: [...group.slots, {label: "", details: ""}]};
        }));
    };

    const removeSlot = (groupIndex: number, slotIndex: number) => {
        setForm(prev => updateGroups(prev, groups => {
            const group = groups[groupIndex];
            groups[groupIndex] = {...group, slots: group.slots.filter((_, index) => index !== slotIndex)};
        }));
    };

    const saveAssignment = async (event: FormEvent) => {
        event.preventDefault();
        setActionError(undefined);
        setBusy(true);

        try {
            const payload = cleanPayload(form);
            if (selectedId === "new") {
                const created = await ApiUtils.createAssignment(token, payload);
                if (created) {
                    onAssignmentChanged(created);
                    setSelectedId(created.id);
                    setForm({
                        airport: created.airport,
                        runways: created.runways,
                        patternAltitude: created.patternAltitude,
                        serverType: created.serverType,
                        title: created.title,
                        description: created.description,
                        template: created.template,
                        footer: created.footer,
                        groups: normalizeGroups(created.groups),
                    });
                }
            } else {
                const updated = await ApiUtils.updateAssignment(token, selectedId, payload);
                if (updated) {
                    onAssignmentChanged(updated);
                    setForm({
                        airport: updated.airport,
                        runways: updated.runways,
                        patternAltitude: updated.patternAltitude,
                        serverType: updated.serverType,
                        title: updated.title,
                        description: updated.description,
                        template: updated.template,
                        footer: updated.footer,
                        groups: normalizeGroups(updated.groups),
                    });
                }
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const removeAssignment = async () => {
        if (selectedId === "new") return;
        setActionError(undefined);
        setBusy(true);
        try {
            await ApiUtils.deleteAssignment(token, selectedId);
            onAssignmentDeleted(selectedId);
            startNew();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    if (!loggedIn) {
        return <AdminLoginScreen/>;
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}/>;
    }

    if (!users || !adminUser || !assignments) {
        return <AdminUnauthorizedScreen/>;
    }

    return (
        <div className={styles.adminAssignmentsContainer}>
            <div className={styles.headerActions} aria-label="Assignment actions">
                <button type="button" className={styles.newButton} onClick={startNew}>
                    New Assignment
                </button>
                <a className={styles.helpButton} href="/dashboard/guide/assignments" target="_blank" rel="noreferrer">
                    Help
                </a>
            </div>

            <div className={styles.assignmentsLayout}>
                <aside className={styles.assignmentListPanel}>
                    <div className={styles.panelHeader}>
                        <h2>Templates</h2>
                        <span>{sortedData.length}/{assignments.length}</span>
                    </div>
                    <label htmlFor="assignment-search">Search assignments</label>
                    <input
                        id="assignment-search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Airport, title, owner..."
                    />
                    <div className={styles.assignmentList}>
                        {sortedData.map((record) => (
                            <button
                                key={record.id}
                                type="button"
                                className={`${styles.assignmentListItem} ${record.id === selectedId ? styles.assignmentListItemActive : ""}`}
                                onClick={() => selectAssignment({
                                    id: record.id,
                                    airport: record.airport,
                                    title: record.title,
                                    runways: record.runways,
                                    patternAltitude: record.patternAltitude,
                                    serverType: record.serverType,
                                    description: record.description,
                                    template: record.template,
                                    footer: record.footer,
                                    ownerId: record.ownerId,
                                    active: record.active,
                                    groups: record.groups,
                                })}
                            >
                                <strong>{record.airport} - {record.title}</strong>
                                <span>{record.serverType || "Any server"} - {getUserName(usersById, record.ownerId)}</span>
                            </button>
                        ))}
                    </div>
                </aside>

                <main className={styles.assignmentEditorPanel}>
                    <form onSubmit={saveAssignment} className={styles.assignmentForm}>
                        <div className={styles.editorHeader}>
                            <div>
                                <h2>{selectedId === "new" ? "Create Assignment" : "Edit Assignment"}</h2>
                                {selectedAssignment ? (
                                    <p>Owner: {getUserName(usersById, selectedAssignment.ownerId)}</p>
                                ) : null}
                            </div>
                            {!canManageSelected ? (
                                <span className={styles.lockedBadge}>Read only</span>
                            ) : null}
                        </div>

                        <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>

                        <fieldset disabled={!canManageSelected || busy} className={styles.formFieldset}>
                            <div className={styles.fieldGrid}>
                                <label>
                                    <span>Title</span>
                                    <input value={form.title} onChange={event => updateField("title", event.target.value)} required/>
                                </label>
                                <label>
                                    <span>Airport</span>
                                    <input value={form.airport} onChange={event => updateField("airport", event.target.value)} maxLength={5} required/>
                                </label>
                                <label>
                                    <span>Runways</span>
                                    <input value={form.runways} onChange={event => updateField("runways", event.target.value)}/>
                                </label>
                                <label>
                                    <span>Pattern altitude</span>
                                    <input value={form.patternAltitude} onChange={event => updateField("patternAltitude", event.target.value)}/>
                                </label>
                                <label>
                                    <span>Server type</span>
                                    <input value={form.serverType} onChange={event => updateField("serverType", event.target.value)} placeholder="Training, IFATC..."/>
                                </label>
                            </div>

                            <CollapsibleTextarea
                                id="template"
                                label="Template"
                                value={form.template}
                                rows={8}
                                required
                                open={openFields.template}
                                onToggle={() => toggleField("template")}
                                onChange={value => updateField("template", value)}
                            />

                            <CollapsibleTextarea
                                id="description"
                                label="Description"
                                value={form.description}
                                rows={4}
                                open={openFields.description}
                                onToggle={() => toggleField("description")}
                                onChange={value => updateField("description", value)}
                            />

                            <CollapsibleTextarea
                                id="footer"
                                label="Footer"
                                value={form.footer}
                                rows={9}
                                open={openFields.footer}
                                onToggle={() => toggleField("footer")}
                                onChange={value => updateField("footer", value)}
                            />

                            <section className={styles.slotEditor}>
                                <div className={styles.sectionHeader}>
                                    <h3>Slots</h3>
                                    <button type="button" onClick={addGroup}>Add Group</button>
                                </div>
                                {form.groups.map((group, groupIndex) => (
                                    <article key={groupIndex} className={styles.groupEditor}>
                                        <div className={styles.groupHeader}>
                                            <input
                                                aria-label="Group name"
                                                value={group.name}
                                                onChange={event => updateGroupName(groupIndex, event.target.value)}
                                            />
                                            <button type="button" onClick={() => removeGroup(groupIndex)} disabled={form.groups.length === 1}>
                                                Remove Group
                                            </button>
                                        </div>
                                        <div className={styles.slotRows}>
                                            {group.slots.map((slot, slotIndex) => (
                                                <div key={slotIndex} className={styles.slotRow}>
                                                    <input
                                                        value={slot.label}
                                                        onChange={event => updateSlot(groupIndex, slotIndex, "label", event.target.value)}
                                                        placeholder="Slot label"
                                                        required
                                                    />
                                                    <input
                                                        value={slot.details}
                                                        onChange={event => updateSlot(groupIndex, slotIndex, "details", event.target.value)}
                                                        placeholder="Details"
                                                    />
                                                    <button type="button" onClick={() => removeSlot(groupIndex, slotIndex)} disabled={group.slots.length === 1}>
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" className={styles.secondaryButton} onClick={() => addSlot(groupIndex)}>
                                            Add Slot
                                        </button>
                                    </article>
                                ))}
                            </section>
                        </fieldset>

                        <div className={styles.formActions}>
                            <button type="submit" disabled={!canManageSelected || busy}>
                                {selectedId === "new" ? "Create Assignment" : "Save Assignment"}
                            </button>
                            {selectedId !== "new" && canManageSelected ? (
                                <button type="button" className={styles.dangerButton} onClick={removeAssignment} disabled={busy}>
                                    Remove
                                </button>
                            ) : null}
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
};

const getUserName = (usersById: Map<string, AtcmhUser>, id: string) => {
    const user = usersById.get(id);
    return user ? user.username : `User (${id})`;
};

const CollapsibleTextarea = ({
                                 id,
                                 label,
                                 value,
                                 rows,
                                 required = false,
                                 open,
                                 onToggle,
                                 onChange,
                             }: {
    id: CollapsibleFieldId;
    label: string;
    value: string;
    rows: number;
    required?: boolean;
    open: boolean;
    onToggle: () => void;
    onChange: (value: string) => void;
}) => (
    <section className={`${styles.collapsibleField} ${open ? styles.collapsibleFieldOpen : ""}`}>
        <button
            type="button"
            className={styles.collapsibleToggle}
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`assignment-${id}-field`}
        >
            <span>{label}</span>
            <span aria-hidden="true">{open ? "Hide" : "Show"}</span>
        </button>
        <div id={`assignment-${id}-field`} className={styles.collapsiblePanel}>
            <div className={styles.collapsiblePanelInner}>
                <textarea value={value} onChange={event => onChange(event.target.value)} rows={rows} required={required}/>
            </div>
        </div>
    </section>
);

const canManageAssignment = (assignment: AdminAssignment, adminUser: AdminUser | undefined) => {
    if (!adminUser) return false;
    return assignment.ownerId === adminUser.id || adminUser.canManageAllAssignments;
};

const clonePayload = (payload: AdminAssignmentPayload): AdminAssignmentPayload => JSON.parse(JSON.stringify(payload)) as AdminAssignmentPayload;

const normalizeGroups = (groups: AdminAssignmentGroup[]) => {
    return groups.length > 0 ? clonePayload({...emptyForm, groups}).groups : clonePayload(emptyForm).groups;
};

const updateGroups = (payload: AdminAssignmentPayload, update: (groups: AdminAssignmentGroup[]) => void) => {
    const groups = payload.groups.map(group => ({
        ...group,
        slots: group.slots.map(slot => ({...slot})),
    }));
    update(groups);
    return {...payload, groups};
};

const cleanPayload = (payload: AdminAssignmentPayload): AdminAssignmentPayload => ({
    ...payload,
    airport: payload.airport.trim().toUpperCase(),
    title: payload.title.trim(),
    runways: payload.runways.trim(),
    patternAltitude: payload.patternAltitude.trim(),
    serverType: payload.serverType.trim(),
    description: payload.description.trim(),
    template: payload.template.trim(),
    footer: payload.footer.trim(),
    groups: payload.groups.map(group => ({
        name: group.name.trim(),
        slots: group.slots.map(slot => ({
            label: slot.label.trim(),
            details: slot.details.trim(),
        })),
    })),
});

export default AdminAssignments;
