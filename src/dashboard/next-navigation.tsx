"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { createContext, type ComponentProps, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ParamsContext = createContext<Record<string, string | undefined>>({});
type MemoryNavigation = {
    pathname: string;
    searchParams: URLSearchParams;
    navigate: (to: string, options?: {replace?: boolean}) => void;
};
const MemoryNavigationContext = createContext<MemoryNavigation | null>(null);

export function MemoryRouter({initialEntries = ["/"], children}: {initialEntries?: string[]; children: ReactNode}) {
    const [entry, setEntry] = useState(initialEntries[0] ?? "/");
    const value = useMemo<MemoryNavigation>(() => {
        const url = new URL(entry, "https://atcmh.test");
        return {
            pathname: url.pathname,
            searchParams: url.searchParams,
            navigate: (to) => setEntry(to),
        };
    }, [entry]);
    return <MemoryNavigationContext.Provider value={value}>{children}</MemoryNavigationContext.Provider>;
}

function useCompatPathname() {
    const memory = useContext(MemoryNavigationContext);
    if (memory) return memory.pathname;
    // The test-only memory context and Next's runtime router are mutually exclusive.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return usePathname();
}

export function DashboardNavigationProvider({params, children}: {params?: Record<string, string | undefined>; children: ReactNode}) {
    return <ParamsContext.Provider value={params ?? {}}>{children}</ParamsContext.Provider>;
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {to: string};
export function Link({to, ...props}: LinkProps) {
    return <NextLink href={to} {...props}/>;
}

type NavLinkProps = Omit<LinkProps, "className"> & {
    end?: boolean;
    className?: string | ((state: {isActive: boolean}) => string | undefined);
};
export function NavLink({to, end = false, className, ...props}: NavLinkProps) {
    const pathname = useCompatPathname();
    const isActive = pathname === to || (!end && pathname.startsWith(`${to}/`));
    return <NextLink href={to} className={typeof className === "function" ? className({isActive}) : className} {...props}/>;
}

export function useNavigate() {
    const memory = useContext(MemoryNavigationContext);
    const memoryNavigate = useCallback((to: string, options?: {replace?: boolean}) => memory?.navigate(to, options), [memory]);
    if (memory) return memoryNavigate;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter();
    return useCallback((to: string, options?: {replace?: boolean}) => {
        return options?.replace ? router.replace(to) : router.push(to);
    }, [router]);
}

export function useLocation() {
    return {pathname: useCompatPathname()};
}

export function useParams<T extends Record<string, string | undefined>>() {
    return useContext(ParamsContext) as T;
}

export function useSearchParams() {
    const memory = useContext(MemoryNavigationContext);
    if (memory) return [memory.searchParams] as const;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const nextSearchParams = useNextSearchParams();
    return [nextSearchParams] as const;
}

export function Navigate({to, replace = false}: {to: string; replace?: boolean}) {
    const navigate = useNavigate();
    useEffect(() => navigate(to, {replace}), [navigate, replace, to]);
    return null;
}
