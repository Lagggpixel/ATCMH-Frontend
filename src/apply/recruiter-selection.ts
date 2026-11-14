/** Match the backend's registered-name comparison; never guess from text inside a draft. */
export function registeredRecruiter(value: string, recruiters: readonly string[]): string | undefined {
    const name = value.trim().toLowerCase();
    return name ? recruiters.find(recruiter => recruiter.trim().toLowerCase() === name) : undefined;
}
