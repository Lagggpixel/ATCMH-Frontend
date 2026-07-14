import {useState, useMemo} from "react";

export interface TableSortState {
    column: string;
    direction: 'asc' | 'desc';
}

export function useTableSort<T extends Record<string, unknown>>(
    initialColumn: string,
    initialDirection: 'asc' | 'desc',
    data: T[]
): { sortState: TableSortState; sortedData: T[]; handleSort: (column: string) => void } {
    const [sortState, setSortState] = useState<TableSortState>({
        column: initialColumn,
        direction: initialDirection,
    });

    const sortedData = useMemo(() => {
        const {column, direction} = sortState;
        return [...data].sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            let comparison = 0;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }
            return direction === 'asc' ? comparison : -comparison;
        });
    }, [data, sortState]);

    const handleSort = (column: string) => {
        setSortState(prev => ({
            column,
            direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc',
        }));
    };

    return {sortState, sortedData, handleSort};
}
