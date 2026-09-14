import {useCallback, useMemo, useState} from "react";

export interface PaginationResult<T> {
    paginatedItems: T[];
    page: number;
    totalPages: number;
    totalItems: number;
    goToPage: (p: number) => void;
    goNext: () => void;
    goPrev: () => void;
    reset: () => void;
    itemsPerPage: number;
}

export function usePagination<T>(items: T[], itemsPerPage: number = 25): PaginationResult<T> {
    const [page, setPage] = useState(0);
    const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
    const paginatedItems = useMemo(
        () => items.slice(page * itemsPerPage, (page + 1) * itemsPerPage),
        [items, page, itemsPerPage],
    );
    const goToPage = useCallback((p: number) => setPage(Math.max(0, Math.min(p, totalPages - 1))), [totalPages]);
    const goNext = useCallback(() => setPage(current => Math.min(current + 1, totalPages - 1)), [totalPages]);
    const goPrev = useCallback(() => setPage(current => Math.max(0, current - 1)), []);
    const reset = useCallback(() => setPage(0), []);
    return useMemo(
        () => ({paginatedItems, page, totalPages, totalItems: items.length, goToPage, goNext, goPrev, reset, itemsPerPage}),
        [goNext, goPrev, goToPage, items.length, itemsPerPage, page, paginatedItems, reset, totalPages],
    );
}
