import sanitizeHtml from "sanitize-html";

export function safeGuideMediaUrl(value: string): boolean {
    if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !value.includes("\\"); } catch { return false; }
}

export function youtubeGuideEmbed(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) return null;
        const host = url.hostname.toLowerCase();
        let id: string | null = null;
        if (host === "youtu.be") id = url.pathname.split("/")[1];
        if (["youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"].includes(host)) {
            id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:embed|shorts)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
        }
        return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    } catch { return null; }
}

/** The backend enforces the same allowlist when saving; preview HTML is never trusted. */
export function sanitizePilotGuideHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "strike", "blockquote", "br", "hr", "a", "img", "figure", "figcaption", "video", "source", "iframe", "div", "aside", "span", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td"],
        allowedAttributes: {
            a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "width", "height", "loading"],
            iframe: ["src", "title", "width", "height", "allowfullscreen", "loading", "referrerpolicy"],
            video: ["src", "controls", "poster", "width", "height", "preload"], source: ["src", "type"],
            ol: ["start"], div: ["data-youtube-video"], aside: ["aria-label"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"],
        },
        allowedSchemes: ["https"], allowProtocolRelative: false,
        transformTags: {
            a: (_tag, attrs) => {
                const href = attrs.href ?? "";
                const safe = href.startsWith("#") || safeGuideMediaUrl(href);
                return {tagName: "a", attribs: {...(safe ? {href} : {}), ...(attrs.title ? {title: attrs.title} : {}), target: "_blank", rel: "noopener noreferrer"}};
            },
            iframe: (_tag, attrs): sanitizeHtml.Tag => {
                const src = youtubeGuideEmbed(attrs.src ?? "");
                return {tagName: "iframe", attribs: src ? {src, title: attrs.title || "Pilot guide video", allowfullscreen: "true", loading: "lazy", referrerpolicy: "strict-origin-when-cross-origin"} : {}};
            },
            img: (_tag, attrs) => ({tagName: "img", attribs: {...(safeGuideMediaUrl(attrs.src ?? "") ? {src: attrs.src} : {}), alt: attrs.alt ?? "", ...(attrs.title ? {title: attrs.title} : {}), loading: "lazy"}}),
            video: (_tag, attrs) => ({tagName: "video", attribs: {controls: "", preload: "metadata", ...(safeGuideMediaUrl(attrs.src ?? "") ? {src: attrs.src} : {}), ...(safeGuideMediaUrl(attrs.poster ?? "") ? {poster: attrs.poster} : {})}}),
            source: (_tag, attrs) => ({tagName: "source", attribs: {...(safeGuideMediaUrl(attrs.src ?? "") ? {src: attrs.src} : {}), ...(/^video\/[a-z0-9.+-]+$/i.test(attrs.type ?? "") ? {type: attrs.type} : {})}}),
            div: (_tag, attrs): sanitizeHtml.Tag => ({tagName: "div", attribs: Object.hasOwn(attrs, "data-youtube-video") ? {"data-youtube-video": ""} : {}}),
        },
        exclusiveFilter: frame => ["iframe", "img", "source"].includes(frame.tag) && !frame.attribs.src,
    });
}
