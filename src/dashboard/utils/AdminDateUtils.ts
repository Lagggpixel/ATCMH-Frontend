interface IfcDisplayValue {
    ifcId?: string;
    ifcName?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const formatIfcDisplay = (value: IfcDisplayValue) => {
    if (value.ifcName) return value.ifcName;
    return value.ifcId ?? "No IFC linked";
};

export const parseUtcDateTimeInput = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error("Enter a valid session time.");
        }
        return date.toISOString();
    }

    const [, year, month, day, hour, minute, second = "0"] = match;
    // Interpret the input as local wall-clock time (datetime-local behavior),
    // then convert to UTC for storage/transmission.
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).toISOString();
};

export const generateHalfHourUtcDateTimeSuggestions = (start: Date = new Date(), count = 96) => {
    const first = new Date(start.getTime());
    first.setUTCSeconds(0, 0);
    const minutes = first.getUTCMinutes();
    if (minutes === 0 || minutes === 30) {
        first.setUTCMinutes(minutes);
    } else if (minutes < 30) {
        first.setUTCMinutes(30);
    } else {
        first.setUTCHours(first.getUTCHours() + 1, 0);
    }

    return Array.from({length: count}, (_, index) => {
        const date = new Date(first.getTime() + index * 30 * 60 * 1000);
        return [
            date.getUTCFullYear(),
            "-",
            pad(date.getUTCMonth() + 1),
            "-",
            pad(date.getUTCDate()),
            "T",
            pad(date.getUTCHours()),
            ":",
            pad(date.getUTCMinutes()),
        ].join("");
    });
};

interface AdminUtcDateFormatOptions {
    showUtcSuffix?: boolean;
}

export const formatAdminUtcDate = (value?: string | number, options: AdminUtcDateFormatOptions = {}) => {
    if (value == null) return "Not set";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const showUtcSuffix = options.showUtcSuffix ?? true;

    return [
        date.getUTCFullYear(),
        "-",
        pad(date.getUTCMonth() + 1),
        "-",
        pad(date.getUTCDate()),
        " ",
        pad(date.getUTCHours()),
        ":",
        pad(date.getUTCMinutes()),
        showUtcSuffix ? " UTC" : "",
    ].join("");
};
