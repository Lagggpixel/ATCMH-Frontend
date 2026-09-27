export const availableUserName = (value: string | null | undefined): string | undefined => {
    const name = value?.trim();
    return name && !/^(?:n\/?a)$/i.test(name) ? name : undefined;
};

export const formatUserName = (id: string | null | undefined, username?: string | null, fallback?: string | null): string =>
    (username?.trim() === `User (${id})` ? undefined : availableUserName(username))
    ?? availableUserName(fallback) ?? (id == null ? "System" : `User (${id})`);

export const matchesUserSearch = (id: string, username: string | null | undefined, query: string): boolean => {
    const normalized = query.trim().toLowerCase();
    return id.toLowerCase().includes(normalized) || (availableUserName(username)?.toLowerCase().includes(normalized) ?? false);
};
