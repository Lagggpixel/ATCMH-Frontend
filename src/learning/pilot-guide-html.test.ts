import assert from "node:assert/strict";
import test from "node:test";
import {initialPilotGuide} from "./pilot-guide-content";
import {safeGuideMediaUrl, sanitizePilotGuideHtml, youtubeGuideEmbed} from "./pilot-guide-html";

test("preview and reader HTML removes executable markup, handlers, and arbitrary embeds", () => {
    const output = sanitizePilotGuideHtml('<p style="color:red" onclick="alert(1)">Safe text</p><script>alert(1)</script><img src="https://images.test/photo.jpg" onerror="alert(1)" alt="Airport"><a href="javascript:alert(1)">Unsafe link</a><iframe src="https://frames.test/embed" title="Untrusted"></iframe><img src="data:image/svg+xml,unsafe">');
    assert.match(output, /Safe text/);
    assert.match(output, /alt="Airport"/);
    assert.match(output, /src="https:\/\/images\.test\/photo\.jpg"/);
    assert.doesNotMatch(output, /script|onclick|onerror|style=|javascript:|frames\.test|data:image/);
});

test("supplied YouTube URLs become restricted privacy-enhanced embeds", () => {
    for (const url of [
        "https://youtu.be/KQPcirkqKAY?si=source",
        "https://www.youtube.com/watch?v=KQPcirkqKAY",
        "https://www.youtube.com/shorts/KQPcirkqKAY",
        "https://www.youtube-nocookie.com/embed/KQPcirkqKAY",
    ]) assert.equal(youtubeGuideEmbed(url), "https://www.youtube-nocookie.com/embed/KQPcirkqKAY");
    for (const url of ["http://youtu.be/KQPcirkqKAY", "https://youtube.com.evil.test/watch?v=KQPcirkqKAY", "https://frames.test/KQPcirkqKAY", "javascript:alert(1)", "https://youtu.be/short"]) {
        assert.equal(youtubeGuideEmbed(url), null);
    }
    const output = sanitizePilotGuideHtml('<iframe src="https://www.youtube.com/embed/KQPcirkqKAY?autoplay=1" title="Transition example" onload="alert(1)"></iframe>');
    assert.match(output, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/KQPcirkqKAY"/);
    assert.match(output, /title="Transition example"/);
    assert.match(output, /loading="lazy"/);
    assert.doesNotMatch(output, /autoplay|onload/);
});

test("media and links reject unsafe schemes while preserving accessible safe content", () => {
    for (const url of ["https://images.test/photo.jpg", "/assets/airport.jpg"]) assert.equal(safeGuideMediaUrl(url), true);
    for (const url of ["http://images.test/photo.jpg", "//images.test/photo.jpg", "javascript:alert(1)", "data:image/png;base64,AA", "/\\images.test/photo.jpg", "https://user:secret@images.test/photo.jpg"]) assert.equal(safeGuideMediaUrl(url), false);
    const output = sanitizePilotGuideHtml('<a href="https://discord.com/channels/1/2" target="_blank">#requests</a><video controls src="https://media.test/example.mp4" poster="https://images.test/poster.jpg"><source src="https://media.test/example.webm" type="video/webm"></video><img src="/assets/airport.jpg" alt="Airport layout">');
    assert.match(output, /#requests/);
    assert.match(output, /rel="noopener noreferrer"/);
    assert.match(output, /src="https:\/\/media\.test\/example\.mp4"/);
    assert.match(output, /type="video\/webm"/);
    assert.match(output, /alt="Airport layout"/);
});

test("safe rich HTML survives visual-source previews without retaining executable attributes", () => {
    const output = sanitizePilotGuideHtml('<h1>Heading</h1><aside aria-label="Tip"><p>Callout</p></aside><figure><img src="/assets/airport.jpg" alt="Airport"><figcaption>Diagram</figcaption></figure><pre><code>Read-only example</code></pre><table><tbody><tr><th colspan="2">Runway</th><td onclick="alert(1)">22L</td></tr></tbody></table>');
    for (const value of ["<h1>Heading</h1>", 'aria-label="Tip"', "<figcaption>Diagram</figcaption>", "<pre><code>Read-only example</code></pre>", '<th colspan="2">Runway</th>', "<td>22L</td>"]) assert.ok(output.includes(value), value);
    assert.doesNotMatch(output, /onclick/);
});

test("sanitizing the full supplied guide preserves critical instructions and all video references", () => {
    const output = initialPilotGuide.chapters.map(chapter => sanitizePilotGuideHtml(chapter.html)).join("\n");
    for (const value of ["1500 feet above airport level", "210kts", "180kt", "160kt", "5NM", "3NM", "70kts", "200-300 feet above the ground", "FULL STOP", "remaining in the pattern", "It is acceptable to approve both aircraft at once"]) assert.ok(output.includes(value), value);
    for (const id of ["KQPcirkqKAY", "PZOu-uke1-g", "WJX1Dhpc5Gg"]) assert.ok(output.includes(`https://www.youtube-nocookie.com/embed/${id}`), id);
    assert.match(output, /transition assignment as a pilot/);
    assert.match(output, /upwind conflict assignment as a pilot/);
    assert.match(output, /GA assignment as a pilot/);
    assert.match(output, /discord\.com\/channels\/1210021410110447637\/1210061769532244028/);
    assert.match(output, /discord\.com\/channels\/1210021410110447637\/1210135084472995861/);
});
