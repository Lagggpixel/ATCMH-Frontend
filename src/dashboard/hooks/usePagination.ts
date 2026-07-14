import {useState} from "react";

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
    const paginatedItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
    const goToPage = (p: number) => setPage(Math.max(0, Math.min(p, totalPages - 1)));
    const goNext = () => goToPage(page + 1);
    const goPrev = () => goToPage(page - 1);
    const reset = () => setPage(0);
    return { paginatedItems, page, totalPages, totalItems: items.length, goToPage, goNext, goPrev, reset, itemsPerPage };
}
