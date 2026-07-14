import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {type FormEvent, useMemo, useState} from "react";
import styles from "./AdminUserNotes.module.css"
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import type {UserNote} from "../../types/UserNote.ts";
import {formatAdminUtcDate} from "../../utils/AdminDateUtils.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminToast from "./AdminToast.tsx";
import {useTableSort} from "../../hooks/useTableSort.ts";
import {usePagination} from "../../hooks/usePagination.ts";
import AdminPagination from "./AdminPagination.tsx";

interface AdminUserNotesProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    userNotes: UserNote[] | undefined;
    users: AtcmhUser[] | undefined;
    token: string | null;
    onUserNoteChanged: (note: UserNote) => void;
}

const AdminUserNotes = ({
                            loaded,
                            loggedIn,
                            error,
                            userNotes,
                            users,
                            token,
                            onUserNoteChanged
                        }: AdminUserNotesProps) => {
    const [filter, setFilter] = useState({
        staff: "",
        user: "",
        removed: "false" // false, true, all
    });
    const [createUserId, setCreateUserId] = useState("");
    const [createNote, setCreateNote] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const [editingNote, setEditingNote] = useState("");
    const [actionError, setActionError] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {name, value} = e.target;
        setFilter(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const usersById = useMemo(() => new Map(users?.map(user => [user.id, user]) ?? []), [users]);

    const displayedUserNotes = useMemo(() => {
        if (!userNotes || !users) return [];

        let filteredUserNotes = [...userNotes];

        if (filter.staff) {
            const staffFilter = filter.staff.toLowerCase();
            filteredUserNotes = filteredUserNotes.filter(userNote => {
                const staff = usersById.get(userNote.staff);
                return staff?.username.toLowerCase().includes(staffFilter);
            });
        }

        if (filter.user) {
            const userFilter = filter.user.toLowerCase();
            filteredUserNotes = filteredUserNotes.filter(userNote => {
                const user = usersById.get(userNote.user);
                return user?.username.toLowerCase().includes(userFilter);
            });
        }

        if (filter.removed !== "all") {
            const removedFilter = filter.removed === "false";
            filteredUserNotes = filteredUserNotes.filter(userNote => userNote.active === removedFilter);
        }

        filteredUserNotes.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        return filteredUserNotes;
    }, [filter, userNotes, users, usersById]);

    const getUserName = (id: string) => {
        const user = usersById.get(id);
        return user ? user.username : `User (${id})`;
    };

    const noteRecords = useMemo(() => displayedUserNotes.map(note => ({
        time: note.time,
        staff: getUserName(note.staff),
        user: getUserName(note.user),
        note: note.note,
        active: note.active,
        id: note.id,
    })), [displayedUserNotes, getUserName]);

    const {sortState, sortedData, handleSort} = useTableSort(
        "time",
        "desc",
        noteRecords
    );

    const [currentPage, setCurrentPage] = useState(25);

    const pagination = usePagination(sortedData, currentPage);
    const handlePageSizeChange = (newPerPage: number) => {
        setCurrentPage(newPerPage);
        pagination.reset();
    };

    const formatNoteTimeParts = (value: string) => {
        const [date = "", time = ""] = formatAdminUtcDate(value, {showUtcSuffix: false}).split(" ");
        return {date, time};
    };

    const runAction = async (action: () => Promise<UserNote | undefined>) => {
        setIsSaving(true);
        setActionError(undefined);
        try {
            const updated = await action();
            if (updated) {
                onUserNoteChanged(updated);
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreate = (event: FormEvent) => {
        event.preventDefault();
        const userId = createUserId.trim();
        if (!/^\d{5,20}$/.test(userId)) {
            setActionError("Enter a valid Discord user ID.");
            return;
        }
        if (!createNote.trim()) {
            setActionError("Enter a note before saving.");
            return;
        }
        runAction(async () => {
            const created = await ApiUtils.createUserNote(token, userId, createNote.trim());
            setCreateUserId("");
            setCreateNote("");
            setIsCreateOpen(false);
            return created;
        });
    };

    const startEdit = (userNote: UserNote) => {
        setEditingNoteId(userNote.id);
        setEditingNote(userNote.note);
        setActionError(undefined);
    };

    const saveEdit = (noteId: number) => {
        if (!editingNote.trim()) {
            setActionError("Enter a note before saving.");
            return;
        }
        runAction(async () => {
            const updated = await ApiUtils.updateUserNote(token, noteId, editingNote.trim());
            setEditingNoteId(null);
            setEditingNote("");
            return updated;
        });
    };

    if (!loggedIn) {
        return <AdminLoginScreen/>
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}></AdminErrorScreen>;
    }

    if (!userNotes || !users) {
        return <AdminUnauthorizedScreen/>;
    }

    return (
        <div className={styles.adminUserNotesContainer}>
            <div className={styles.adminUserNotesHeader}>
                <button type="button" onClick={() => setIsCreateOpen(true)}>Create Usernote</button>
            </div>

            <AdminToast message={actionError} onDismiss={() => setActionError(undefined)}/>

            {isCreateOpen && (
                <div className={styles.adminUserNotesModalBackdrop} role="presentation" onMouseDown={() => setIsCreateOpen(false)}>
                    <form className={styles.adminUserNotesModal} onSubmit={handleCreate} onMouseDown={event => event.stopPropagation()}>
                        <header>
                            <h2>Create Usernote</h2>
                            <button type="button" aria-label="Close create usernote" onClick={() => setIsCreateOpen(false)}>x</button>
                        </header>
                        <label>
                            User Discord ID
                            <input
                                type="text"
                                inputMode="numeric"
                                value={createUserId}
                                onChange={event => setCreateUserId(event.target.value)}
                                placeholder="User Discord ID"
                                autoFocus
                            />
                        </label>
                        <label>
                            Note
                            <textarea
                                value={createNote}
                                onChange={event => setCreateNote(event.target.value)}
                                placeholder="Write the note..."
                                rows={5}
                            />
                        </label>
                        <div className={styles.adminUserNotesModalActions}>
                            <button type="button" onClick={() => setIsCreateOpen(false)} disabled={isSaving}>Cancel</button>
                            <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Create"}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className={styles.adminUserNotesControls}>
                <div className={styles.adminUserNotesFilterControl}>
                    <label htmlFor="staff-filter">Filter by Staff:</label>
                    <input
                        id="staff-filter"
                        type="text"
                        name="staff"
                        placeholder="Search staff..."
                        value={filter.staff}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className={styles.adminUserNotesFilterControl}>
                    <label htmlFor="user-filter">Filter by User:</label>
                    <input
                        id="user-filter"
                        type="text"
                        name="user"
                        placeholder="Search users..."
                        value={filter.user}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className={styles.adminUserNotesFilterControl}>
                    <label htmlFor="removed-filter">Status:</label>
                    <select
                        id="removed-filter"
                        name="removed"
                        value={filter.removed}
                        onChange={handleFilterChange}
                    >
                        <option value="all">All user notes</option>
                        <option value="true">Removed Only</option>
                        <option value="false">Active Only</option>
                    </select>
                </div>
            </div>
            <div className={styles.adminUserNotesNotesCount}>
                Showing {displayedUserNotes.length} user note{displayedUserNotes.length !== 1 ? 's' : ''}
            </div>
            <div className={styles.adminUserNotesTable}>
                <table className={styles.adminUserNotesDataTable}>
                    <thead>
                    <tr>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("time")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("time");}}} aria-sort={sortState.column==="time" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Time <span className={`${styles.sortIndicator} ${sortState.column==="time" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="time" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("staff")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("staff");}}} aria-sort={sortState.column==="staff" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Staff <span className={`${styles.sortIndicator} ${sortState.column==="staff" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="staff" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("user")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("user");}}} aria-sort={sortState.column==="user" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            User <span className={`${styles.sortIndicator} ${sortState.column==="user" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="user" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("note")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("note");}}} aria-sort={sortState.column==="note" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Note <span className={`${styles.sortIndicator} ${sortState.column==="note" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="note" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col" role="button" tabIndex={0} onClick={() => handleSort("active")} onKeyDown={(e) => {if(e.key==="Enter"||e.key===" "){e.preventDefault();handleSort("active");}}} aria-sort={sortState.column==="active" ? (sortState.direction==="asc"?"ascending":"descending") : "none"}>
                            Status <span className={`${styles.sortIndicator} ${sortState.column==="active" ? styles.active : ""}`} aria-hidden="true">{sortState.column==="active" ? (sortState.direction==="asc"?"▲":"▼") : "▲"}</span>
                        </th>
                        <th scope="col">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pagination.paginatedItems.length > 0 ? pagination.paginatedItems.map((record) => {
                        const userNote = displayedUserNotes.find(n => n.id === record.id);
                        if (!userNote) return null;
                        return (
                        <tr key={userNote.id} className={userNote.active ? styles.active : styles.inactive}>
                            <td data-label="Time" className={styles.adminUserNotesTimeCell}>
                                {(() => {
                                    const timeParts = formatNoteTimeParts(record.time);
                                    return (
                                        <time dateTime={new Date(record.time).toISOString()}>
                                            <span>{timeParts.date}</span>
                                            <span>{timeParts.time}</span>
                                        </time>
                                    );
                                })()}
                            </td>
                            <td data-label="Staff">{record.staff}</td>
                            <td data-label="User">
                                <span className={styles.discordLink}>
                                    {record.user}
                                </span>
                            </td>
                            <td className={styles.adminUserNoteCellNote} data-label="Note">
                                {editingNoteId === userNote.id ? (
                                    <textarea
                                        value={editingNote}
                                        onChange={event => setEditingNote(event.target.value)}
                                        rows={4}
                                    />
                                ) : record.note}
                            </td>
                            <td data-label="Status">
                                {record.active ? (
                                    <span className={styles.adminActiveBadge}>Active</span>

                                ) : (
                                    <span className={styles.adminCancelledBadge}>Inactive</span>
                                )}
                            </td>
                            <td data-label="Actions" className={styles.adminUserNotesActionCell}>
                                <div className={styles.adminUserNotesActions}>
                                    {editingNoteId === userNote.id ? (
                                        <>
                                            <button type="button" onClick={() => saveEdit(userNote.id)} disabled={isSaving}>Save</button>
                                            <button type="button" className={styles.secondaryButton} onClick={() => setEditingNoteId(null)} disabled={isSaving}>Cancel</button>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => startEdit(userNote)} disabled={isSaving}>Edit</button>
                                    )}
                                    {record.active ? (
                                        <button type="button" className={styles.dangerButton} onClick={() => runAction(() => ApiUtils.deactivateUserNote(token, userNote.id))} disabled={isSaving}>Deactivate</button>
                                    ) : (
                                        <button type="button" onClick={() => runAction(() => ApiUtils.activateUserNote(token, userNote.id))} disabled={isSaving}>Activate</button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );}).filter(Boolean) : (
                        <tr>
                            <td className={styles.adminUserNotesNoResults} colSpan={6}>
                                No user notes match your filter criteria.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            <AdminPagination
                {...pagination}
                totalItems={sortedData.length}
                onItemsPerPageChange={handlePageSizeChange}
            />
        </div>
    );
}

export default AdminUserNotes;
