import {type FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useSearchParams} from "@/src/dashboard/next-navigation";
import {CaretLeft, CaretRight, MagnifyingGlass} from "@phosphor-icons/react";
import type {AdminAssignment, AdminAssignmentGroup, AdminAssignmentPayload} from "../../types/AdminAssignment.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import {formatUserName} from "../../../lib/user-display-name.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminToast from "./AdminToast.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import styles from "./AdminAssignments.module.css";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {useConfirmation} from "../../../platform/confirmation/ConfirmationProvider.tsx";

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
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const confirm = useConfirmation();
    const editParam = searchParams.get("edit");
    const selectedId: number | "new" | null = editParam === "new" ? "new" : editParam && /^\d+$/.test(editParam) ? Number(editParam) : null;
    const [form, setForm] = useState<AdminAssignmentPayload>(() => clonePayload(emptyForm));
    const baselineRef = useRef(JSON.stringify(emptyForm));
    const lastEditRef = useRef<string | null>(null);
    const confirmedTransitionRef = useRef<string | null>(null);
    const allowUnloadRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | undefined>();
    const [openFields, setOpenFields] = useState<Record<CollapsibleFieldId, boolean>>({
        template: false,
        description: false,
        footer: false,
    });

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);
    const selectedAssignment = useMemo(() => {
        if (selectedId === "new" || selectedId === null) return undefined;
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
    const dirty = selectedId !== null && JSON.stringify(form) !== baselineRef.current;

    useEffect(() => {
        const nextKey = editParam ?? "";
        if (lastEditRef.current === nextKey) return;
        if (nextKey !== "new" && nextKey !== "" && !assignments) return;
        if (lastEditRef.current !== null && dirty && confirmedTransitionRef.current !== nextKey) {
            const previousKey = lastEditRef.current;
            navigate(previousKey ? `/dashboard/assignments?edit=${previousKey}` : "/dashboard/assignments", {replace: true});
            void confirm({title: "Discard assignment changes?", message: "Your edits to this template have not been saved.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", tone: "danger"}).then(accepted => {
                if (!accepted) return;
                confirmedTransitionRef.current = nextKey;
                navigate(nextKey ? `/dashboard/assignments?edit=${nextKey}` : "/dashboard/assignments", {replace: true});
            });
            return;
        }
        confirmedTransitionRef.current = null;
        lastEditRef.current = nextKey;
        const selected = assignments?.find(assignment => String(assignment.id) === nextKey);
        const nextForm = selected ? assignmentToPayload(selected) : clonePayload(emptyForm);
        baselineRef.current = JSON.stringify(nextForm);
        setForm(nextForm);
        setActionError(undefined);
    }, [assignments, dirty, editParam, navigate, confirm]);

    useEffect(() => {
        if (!dirty) return;
        const preventUnload = (event: BeforeUnloadEvent) => { if (!allowUnloadRef.current) { event.preventDefault(); event.returnValue = ""; } };
        const preventDashboardNavigation = (event: MouseEvent) => {
            const anchor = (event.target as Element).closest("a[href]");
            if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
            const destination = new URL(anchor.getAttribute("href") ?? "", window.location.href);
            if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
            event.preventDefault();
            event.stopPropagation();
            void confirm({title: "Discard assignment changes?", message: "Your edits to this template have not been saved.", confirmLabel: "Discard and leave", cancelLabel: "Keep editing", tone: "danger"}).then(accepted => {
                if (accepted) { allowUnloadRef.current = true; window.location.assign(destination.href); }
            });
        };
        window.addEventListener("beforeunload", preventUnload);
        document.addEventListener("click", preventDashboardNavigation, true);
        return () => {
            window.removeEventListener("beforeunload", preventUnload);
            document.removeEventListener("click", preventDashboardNavigation, true);
        };
    }, [dirty, confirm]);

    const openEditor = async (key: string) => {
        if (key === (editParam ?? "")) return;
        if (dirty && !await confirm({title: "Discard assignment changes?", message: "Your edits to this template have not been saved.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", tone: "danger"})) return;
        confirmedTransitionRef.current = key;
        navigate(key ? `/dashboard/assignments?edit=${key}` : "/dashboard/assignments");
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
                    const saved = assignmentToPayload(created);
                    baselineRef.current = JSON.stringify(saved);
                    setForm(saved);
                    confirmedTransitionRef.current = String(created.id);
                    navigate(`/dashboard/assignments?edit=${created.id}`, {replace: true});
                }
            } else if (typeof selectedId === "number") {
                const updated = await ApiUtils.updateAssignment(token, selectedId, payload);
                if (updated) {
                    onAssignmentChanged(updated);
                    const saved = assignmentToPayload(updated);
                    baselineRef.current = JSON.stringify(saved);
                    setForm(saved);
                }
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const removeAssignment = async () => {
        if (selectedId === "new" || selectedId === null || !await confirm({title: "Remove template?", message: "This assignment template will be removed permanently.", confirmLabel: "Remove template", cancelLabel: "Keep template", tone: "danger"})) return;
        setActionError(undefined);
        setBusy(true);
        try {
            await ApiUtils.deleteAssignment(token, selectedId);
            onAssignmentDeleted(selectedId);
            baselineRef.current = JSON.stringify(emptyForm);
            confirmedTransitionRef.current = "";
            navigate("/dashboard/assignments", {replace: true});
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
        <div className={styles.adminAssignmentsContainer} data-editing={selectedId !== null}>
            <div className={styles.pageHeader}>
                <h1>Assignments</h1>
                <div className={styles.headerActions} aria-label="Assignment actions">
                    <a className={styles.helpButton} href="/dashboard/guide/assignments" target="_blank" rel="noreferrer">Help</a>
                    <button type="button" className={styles.newButton} onClick={() => openEditor("new")}><span className={styles.desktopNewLabel}>New assignment</span><span className={styles.mobileNewLabel}>New</span></button>
                </div>
            </div>

            <div className={styles.assignmentsLayout}>
                <aside className={styles.assignmentListPanel}>
                    <label htmlFor="assignment-search" className={styles.visuallyHidden}>Search assignments</label>
                    <div className={styles.searchField}><MagnifyingGlass size={18} aria-hidden="true"/><input
                        id="assignment-search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Search assignments..."
                    /></div>
                    <p className={styles.resultCount}>{sortedData.length} {sortedData.length === 1 ? "template" : "templates"}</p>
                    <div className={styles.assignmentList}>
                        {sortedData.map((record) => (
                            <button
                                key={record.id}
                                type="button"
                                className={`${styles.assignmentListItem} ${record.id === selectedId ? styles.assignmentListItemActive : ""}`}
                                onClick={() => openEditor(String(record.id))}
                            >
                                <strong>{record.airport} — {record.title}</strong>
                                <span>{record.serverType || "Any server"} · {getUserName(usersById, record.ownerId)}</span>
                                <CaretRight className={styles.listChevron} size={18} weight="bold" aria-hidden="true"/>
                            </button>
                        ))}
                        {!sortedData.length ? <p className={styles.noResults}>No templates match your search.</p> : null}
                    </div>
                </aside>

                <main className={styles.assignmentEditorPanel}>
                    <button type="button" className={styles.backButton} onClick={() => openEditor("")}><CaretLeft size={18} weight="bold" aria-hidden="true"/>Back to templates</button>
                    {selectedId === null ? <div className={styles.emptyEditor}><h2>Select a template</h2><p>Choose an assignment from the list, or create a new one.</p><button type="button" className={styles.newButton} onClick={() => openEditor("new")}>New assignment</button></div> : null}
                    {selectedId !== null ? (
                    <form onSubmit={saveAssignment} className={styles.assignmentForm}>
                        <div className={styles.editorHeader}>
                            <div>
                                <h2>{selectedId === "new" ? "New assignment" : `${selectedAssignment?.airport ?? form.airport} — ${selectedAssignment?.title ?? form.title}`}</h2>
                                {selectedAssignment ? (
                                    <p>{selectedAssignment.serverType || "Any server"} · {getUserName(usersById, selectedAssignment.ownerId)}</p>
                                ) : null}
                            </div>
                            {!canManageSelected ? (
                                <span className={styles.lockedBadge}>Read only</span>
                            ) : null}
                        </div>

                        <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>

                        <fieldset disabled={!canManageSelected || busy} className={styles.formFieldset}>
                            <h3 className={styles.basicsHeading}>Basics</h3>
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

                            <h3 className={styles.messageHeading}>Message content</h3>
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
                                                    <label><span>Label</span><input
                                                        value={slot.label}
                                                        onChange={event => updateSlot(groupIndex, slotIndex, "label", event.target.value)}
                                                        placeholder="Slot label"
                                                        required
                                                    /></label>
                                                    <label><span>Details</span><input
                                                        value={slot.details}
                                                        onChange={event => updateSlot(groupIndex, slotIndex, "details", event.target.value)}
                                                        placeholder="Details"
                                                    /></label>
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
                            <button type="submit" disabled={!canManageSelected || busy}>{busy ? "Saving…" : "Save"}</button>
                            {selectedId !== "new" && canManageSelected ? (
                                <button type="button" className={styles.dangerButton} onClick={removeAssignment} disabled={busy}>
                                    Remove
                                </button>
                            ) : null}
                        </div>
                    </form>
                    ) : null}
                </main>
            </div>
        </div>
    );
};

const getUserName = (usersById: Map<string, AtcmhUser>, id: string) =>
    formatUserName(id, usersById.get(id)?.username);

const assignmentToPayload = (assignment: AdminAssignment): AdminAssignmentPayload => ({
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
        <div id={`assignment-${id}-field`} className={styles.collapsiblePanel} inert={!open}>
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
