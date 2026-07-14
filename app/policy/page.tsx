import fs from "node:fs";
import path from "node:path";
import {LegalDocument, parseMarkdown} from "@/src/marketing/LegalDocument";

export default function PolicyPage() {
    const markdown = fs.readFileSync(path.join(process.cwd(), "privacy.md"), "utf8");
    return <LegalDocument blocks={parseMarkdown(markdown)}/>;
}
