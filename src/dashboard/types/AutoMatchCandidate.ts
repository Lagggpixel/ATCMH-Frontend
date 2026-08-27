export type AutoMatchLeniency = "strict" | "medium" | "very-loose";

export interface WaitlistHelperPreferences {
    availability: string;
    leniency: AutoMatchLeniency;
}

export interface AutoMatchCandidate {
    id: number;
    mentee: string;
    ifcId?: string | null;
    ifcName?: string | null;
    timezone?: string | null;
    availability?: string | null;
    overlaps: boolean;
    distanceMinutes: number;
    waitlistTime: string;
}
