export type DialogKeyResult = {close: true} | {close: false; focusIndex?: number};
export const dialogKeyResult = (key: string, shiftKey: boolean, activeIndex: number, focusableCount: number): DialogKeyResult => {
    if (key === "Escape") return {close: true};
    if (key !== "Tab" || focusableCount <= 0) return {close: false};
    if (shiftKey && activeIndex <= 0) return {close: false, focusIndex: focusableCount - 1};
    if (!shiftKey && (activeIndex < 0 || activeIndex >= focusableCount - 1)) return {close: false, focusIndex: 0};
    return {close: false, focusIndex: activeIndex + (shiftKey ? -1 : 1)};
};
