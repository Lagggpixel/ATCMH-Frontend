import type {Session} from "../types/Session.ts";
import {parseUtcDateTimeInput} from "./AdminDateUtils.ts";

const pad = (value: number) => String(value).padStart(2, "0");

export interface SessionEditForm {
    airport: string;
    pilots: string;
    time: string;
}

export interface SessionUpdatePayload {
    airport: string;
    pilots: number;
    time: string;
}

export const createSessionEditForm = (session: Session): SessionEditForm => {
    const date = new Date(session.time);
    const time = Number.isNaN(date.getTime()) ? "" : [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        "T",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes()),
    ].join("");

    return {
        airport: session.airport.trim().toUpperCase(),
        pilots: String(session.pilots),
        time,
    };
};

export const toSessionUpdatePayload = (form: SessionEditForm): SessionUpdatePayload => ({
    airport: form.airport.trim().toUpperCase(),
    pilots: Number(form.pilots),
    time: parseUtcDateTimeInput(form.time),
});
