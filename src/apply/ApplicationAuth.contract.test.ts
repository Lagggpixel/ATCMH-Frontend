import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("signed-out applications offer both central authentication providers", () => {
    const application = source("./ApplicationPage.tsx");
    const styles = source("./ApplicationPage.module.css");

    assert.match(application, /aria-label="Choose a sign-in provider"/);
    assert.match(application, /loginPath\(ApiUtils\.apiOrigin, "discord", returnTo\)}>Continue with Discord/);
    assert.match(application, /loginPath\(ApiUtils\.apiOrigin, "ifc", returnTo\)}>Continue with Infinite Flight/);
    assert.match(application, /we will ask for the other one only if it is still needed/);
    assert.match(styles, /\.providerActions \{[^}]+grid-template-columns: repeat\(2/);
    assert.match(styles, /@media \(max-width: 480px\)/);
    assert.match(styles, /\.providerActions \{ grid-template-columns: 1fr; }/);
});

test("an incomplete session restarts central auth through its existing identity", () => {
    const application = source("./ApplicationPage.tsx");

    assert.match(application, /if \(!hasDiscord \|\| !hasIfc\)/);
    assert.match(application, /const setupProvider = hasDiscord \? "discord" : hasIfc \? "ifc" : "discord"/);
    assert.match(application, /loginPath\(ApiUtils\.apiOrigin, setupProvider, returnTo\)}>Continue account setup/);
    assert.match(application, /if \(!session \|\| !applicationType \|\| !hasDiscord \|\| !hasIfc\) return/);
    assert.match(application, /without creating a separate application link flow/);
    assert.doesNotMatch(application, /application\?\.status === "IFC_REQUIRED"/);
    assert.doesNotMatch(application, />Link Infinite Flight account</);
});
