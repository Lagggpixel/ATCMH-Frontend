export interface AdminManual {
    id: number;
    filename: string;
    sourceUrl: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    uploadedBy: number;
    active: boolean;
    createdAt: number | null;
    updatedAt?: number | null;
}
