import fs from "node:fs";
import path from "node:path";
import {LegalDocument, parseMarkdown} from "@/src/marketing/LegalDocument";

export default function TermsPage() {
    const markdown = fs.readFileSync(path.join(process.cwd(), "TERMS_OF_SERVICE.md"), "utf8");
    return <LegalDocument blocks={parseMarkdown(markdown)}/>;
}
