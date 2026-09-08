export const ACCEPTED_MEDIA = "image/jpeg,image/png,image/heic,image/heif,image/heic-sequence,image/heif-sequence,image/gif,image/webp,video/mp4,video/webm,video/quicktime,.heic,.heif,.mov";
export const MEDIA_VALIDATION_MESSAGE = "Choose a JPEG, PNG, HEIC/HEIF, GIF, WebP, MP4, WebM, or MOV file no larger than 50 MB.";
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const acceptedMedia = new Set([
    "image/jpeg", "image/png", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence",
    "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime",
]);
const extensionMediaTypes: Record<string, string> = {
    jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif",
    gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
const heicMediaTypes = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export function mediaTypeForFile(file: File): string | undefined {
    const declared = file.type.toLowerCase();
    if (acceptedMedia.has(declared)) return declared;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return extensionMediaTypes[extension];
}

export function prepareMediaFile(file: File): File | undefined {
    const type = mediaTypeForFile(file);
    if (!type || file.size > MAX_MEDIA_BYTES) return undefined;
    return file.type.toLowerCase() === type ? file : new File([file], file.name, {type, lastModified: file.lastModified});
}

export function isHeicMediaFile(file: File | undefined): boolean {
    if (!file) return false;
    const type = file.type.toLowerCase();
    if (heicMediaTypes.has(type)) return true;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return extension === "heic" || extension === "heif";
}
