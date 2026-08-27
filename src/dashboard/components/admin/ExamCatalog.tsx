import {useEffect, useMemo, useState} from "react";
import type {ExamCategory, ExamQuizSummary} from "../../types/Exam.ts";
import {
    filterExamQuizzes,
    formatExamUpdatedAt,
    getExamCategoryLabel,
    getExamCategoryOptions,
    groupExamQuizzes,
    type ExamVisibilityFilter,
} from "../../utils/ExamCatalogUtils.ts";
import styles from "./ExamCatalog.module.css";

interface ExamCatalogProps {
    quizzes: ExamQuizSummary[];
    revealQuizId?: string | null;
    onEdit?: (quiz: ExamQuizSummary) => void;
    categories?: ExamCategory[];
    onCreateCategory?: (name: string) => Promise<void>;
    onMoveQuizCategory?: (quiz: ExamQuizSummary, categoryId: string) => Promise<void>;
}

const ExamCatalog = ({quizzes, revealQuizId, onEdit, categories: managedCategories = [], onCreateCategory, onMoveQuizCategory}: ExamCatalogProps) => {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [visibility, setVisibility] = useState<ExamVisibilityFilter>("all");
    const [newCategory, setNewCategory] = useState("");
    const [pending, setPending] = useState<string | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const categories = useMemo(() => getExamCategoryOptions(quizzes, managedCategories), [managedCategories, quizzes]);
    const filteredQuizzes = useMemo(
        () => filterExamQuizzes(quizzes, query, category, visibility),
        [category, query, quizzes, visibility],
    );
    const folders = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return groupExamQuizzes(filteredQuizzes, managedCategories).filter(folder => {
            if (folder.quizzes.length > 0) return true;
            return visibility === "all"
                && (category === "all" || folder.id === category)
                && (!normalizedQuery || folder.name.toLowerCase().includes(normalizedQuery));
        });
    }, [category, filteredQuizzes, managedCategories, query, visibility]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (!revealQuizId) return;
        const folder = folders.find(item => item.quizzes.some(quiz => quiz.id === revealQuizId));
        if (!folder) return;
        setExpandedFolders(current => current.has(folder.id) ? current : new Set(current).add(folder.id));
    }, [folders, revealQuizId]);

    const toggleFolder = (id: string) => setExpandedFolders(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    return <section className={styles.catalog} aria-label="Exam catalog">
        <div className={styles.toolbar} aria-label="Exam catalog controls">
            <label className={styles.searchField}>
                <span className={styles.visuallyHidden}>Search exams</span>
                <input
                    aria-label="Search exams"
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search exams by title or description"
                />
            </label>
            <select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
            </select>
            <select aria-label="Filter by visibility" value={visibility} onChange={event => setVisibility(event.target.value as ExamVisibilityFilter)}>
                <option value="all">All visibility</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
            </select>
        </div>
        {onCreateCategory ? <form className={styles.categoryActions} onSubmit={event => { event.preventDefault(); if (!newCategory.trim()) return; setPending("create"); setCategoryError(null); void onCreateCategory(newCategory.trim()).then(() => setNewCategory("")).catch(reason => setCategoryError(reason instanceof Error ? reason.message : String(reason))).finally(() => setPending(null)); }}>
            <input aria-label="New folder name" value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="New folder name" maxLength={255}/><button type="submit" disabled={!newCategory.trim() || pending === "create"}>Create folder</button>
        </form> : null}
        {categoryError ? <p className={styles.categoryError} role="alert">{categoryError}</p> : null}

        <p className={styles.resultCount}>{filteredQuizzes.length} quizzes · {folders.length} mentor folders</p>

        {folders.length > 0 ? <div className={styles.folders}>
            {folders.map(folder => {
                const isExpanded = expandedFolders.has(folder.id);
                return <section className={styles.folder} key={folder.id}>
                    <button type="button" className={styles.folderHeader} aria-expanded={isExpanded} onClick={() => toggleFolder(folder.id)}>
                        <span className={styles.chevron} aria-hidden="true">{isExpanded ? "⌄" : "›"}</span>
                        <span>{folder.name}</span>
                        <span className={styles.folderCount}>{folder.quizzes.length} {folder.quizzes.length === 1 ? "quiz" : "quizzes"}</span>
                    </button>
                    {isExpanded ? <div className={styles.quizList}>
                        {folder.quizzes.map(quiz => <div className={`${styles.quizRow} ${quiz.id === revealQuizId ? styles.savedQuiz : ""}`} key={quiz.id}>
                            <span className={styles.examDetails}>
                                <strong>{quiz.title}</strong>
                                <span>{quiz.description || "No description"}</span>
                            </span>
                            <span className={`${styles.visibility} ${quiz.isPrivate ? styles.privateBadge : styles.publicBadge}`}>
                                {quiz.isPrivate ? "Private" : "Public"}
                            </span>
                            <span className={styles.updated}>{formatExamUpdatedAt(quiz.updatedAt)}</span>
                            {onEdit || onMoveQuizCategory ? <span className={styles.quizActions}>
                                {onEdit ? <button className={styles.editButton} type="button" onClick={() => onEdit(quiz)}>Edit</button> : null}
                                {onMoveQuizCategory ? <select className={styles.moveSelect} aria-label={`Move ${quiz.title} to another folder`} title="Move to another folder" defaultValue="" disabled={pending === quiz.id} onChange={event => { if (!event.target.value) return; setPending(quiz.id); setCategoryError(null); void onMoveQuizCategory(quiz, event.target.value).catch(reason => setCategoryError(reason instanceof Error ? reason.message : String(reason))).finally(() => setPending(null)); }}><option value="">Move</option>{managedCategories.filter(item => item.id !== quiz.categoryId).map(item => <option key={item.id} value={item.id}>{getExamCategoryLabel(item, managedCategories)}</option>)}</select> : null}
                            </span> : null}
                        </div>)}
                    </div> : null}
                </section>;
            })}
        </div> : <p className={styles.emptyState}>
            {quizzes.length === 0 ? "No exams are available yet." : "No exams match the current filters."}
        </p>}
    </section>;
};

export default ExamCatalog;
