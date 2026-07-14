const MAX_IMPORT_BYTES = 1_048_576;
const ACCEPTED_TYPES = new Set(["application/json", "text/csv", "application/csv"]);

export const validateExamImportFile = (file: File): string | undefined => {
    if (!ACCEPTED_TYPES.has(file.type)) return "Select a JSON or CSV file.";
    if (file.size > MAX_IMPORT_BYTES) return "The import file must be 1 MB or smaller.";
    return undefined;
};
