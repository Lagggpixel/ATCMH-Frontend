import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("conditional application questions use restrained accessible entry motion", () => {
    const application = source("./ApplicationPage.tsx");
    const styles = source("./ApplicationPage.module.css");

    assert.match(application, /question\.dependsOnKey \? `\$\{styles\.question} \$\{styles\.conditionalQuestion}` : styles\.question/);
    assert.match(styles, /\.conditionalQuestion[^}]+animation: revealQuestion \.22s ease-out/);
    assert.match(styles, /@keyframes revealQuestion \{ from \{ opacity: 0; transform: translateY\(-\.35rem\); } to \{ opacity: 1; transform: translateY\(0\); } }/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[^{]+\{[^}]*\.conditionalQuestion[^}]+animation: none/);
});

test("application questions use open sections while controls retain boundaries", () => {
    const styles = source("./ApplicationPage.module.css");

    assert.match(styles, /\.question[^}]+border: 0[^}]+border-top:/);
    assert.match(styles, /\.question[^}]+background: transparent/);
    assert.match(styles, /\.question > input[^}]+border: 1px solid/);
    assert.match(styles, /\.discordAlternative \{[^}]+border-top:/);
    assert.doesNotMatch(styles, /\.discordAlternative \{[^}]+border-radius:/);
});
