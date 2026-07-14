import styles from "./AdminPagination.module.css";

interface AdminPaginationProps {
    page: number;
    totalPages: number;
    itemsPerPage: number;
    goNext: () => void;
    goPrev: () => void;
    goToPage: (p: number) => void;
    onItemsPerPageChange?: (newPerPage: number) => void;
    totalItems?: number;
    className?: string;
    variant?: "default" | "inline";
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function AdminPagination({
    page,
    totalPages,
    itemsPerPage,
    goNext,
    goPrev,
    goToPage,
    onItemsPerPageChange,
    totalItems,
    className,
    variant = "default",
}: AdminPaginationProps) {
    if (totalPages <= 1) return null;

    const paginationClassName = [
        styles.paginationBar,
        variant === "inline" ? styles.paginationBarInline : "",
        className ?? "",
    ].filter(Boolean).join(" ");

    return (
        <div className={paginationClassName}>
            <div className={styles.paginationInfo}>
                {totalItems != null && (
                    <span>
                        {page * itemsPerPage + 1}–{Math.min((page + 1) * itemsPerPage, totalItems)} of {totalItems}
                    </span>
                )}
                <span>Page {page + 1} of {totalPages}</span>
            </div>

            <div className={styles.paginationControls}>
                <button
                    type="button"
                    className={styles.paginationButton}
                    disabled={page === 0}
                    onClick={goPrev}
                >
                    Previous
                </button>

                {totalPages > 7 ? (
                    <>
                        <PaginationPageButtons
                            page={page}
                            totalPages={totalPages}
                            goToPage={goToPage}
                        />
                    </>
                ) : (
                    Array.from({length: totalPages}, (_, i) => (
                        <button
                            key={i}
                            type="button"
                            className={`${styles.paginationButton} ${styles.paginationButtonPage} ${i === page ? styles.paginationButtonActive : ""}`}
                            onClick={() => goToPage(i)}
                        >
                            {i + 1}
                        </button>
                    ))
                )}

                <button
                    type="button"
                    className={styles.paginationButton}
                    disabled={page >= totalPages - 1}
                    onClick={goNext}
                >
                    Next
                </button>
            </div>

            {onItemsPerPageChange ? (
                <div className={styles.paginationPageSize}>
                    <label htmlFor="pagination-page-size">Items per page:</label>
                    <select
                        id="pagination-page-size"
                        value={itemsPerPage}
                        onChange={e => onItemsPerPageChange(Number(e.target.value))}
                    >
                        {PAGE_SIZE_OPTIONS.map(size => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                </div>
            ) : null}
        </div>
    );
}

function PaginationPageButtons({page, totalPages, goToPage}: {page: number; totalPages: number; goToPage: (p: number) => void}) {
    // Show first page, ..., current-1, current, current+1, ..., last page
    // Build a small window around the current page
    const range: number[] = [];
    const start = Math.max(1, page - 1);
    const end = Math.min(totalPages - 2, page + 1);
    range.push(0);
    if (start > 1) range.push(-1); // ellipsis marker
    for (let i = start; i <= end; i++) range.push(i);
    if (end < totalPages - 2) range.push(-1);
    range.push(totalPages - 1);

    return range.map((n, idx) => {
        if (n === -1) {
            return (
                <span key={`ellipsis-${idx}`} className={styles.paginationEllipsis} aria-hidden="true">
                    …
                </span>
            );
        }
        return (
            <button
                key={n}
                type="button"
                className={`${styles.paginationButton} ${styles.paginationButtonPage} ${n === page ? styles.paginationButtonActive : ""}`}
                onClick={() => goToPage(n)}
            >
                {n + 1}
            </button>
        );
    });
}
