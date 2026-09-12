export function currentSectionIndex(tops: number[], sectionTop: number, sectionBottom: number, viewportHeight: number, atPageBottom: boolean): number | null {
    if (!tops.length || sectionBottom <= 24 || sectionTop >= viewportHeight) return null;
    if (atPageBottom && tops[tops.length - 1] < viewportHeight) return tops.length - 1;
    let current = 0;
    for (let index = 0; index < tops.length; index++) {
        if (tops[index] <= 32) current = index;
    }
    return current;
}
