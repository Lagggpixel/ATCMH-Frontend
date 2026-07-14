import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('privacy policy describes current login, audit, and linked-account processing', () => {
	const privacy = readFileSync(path.join(projectRoot, 'privacy.md'), 'utf8')

	assert.match(privacy, /Last updated: July 14, 2026/)
	assert.match(privacy, /Dashboard and Exams Center/i)
	assert.match(privacy, /central[^.]*opaque session/i)
	assert.match(privacy, /login IP address/i)
	assert.match(privacy, /alternate-account evidence review/i)
	assert.match(privacy, /linked Discord and Infinite Flight Community identit/i)
	assert.match(privacy, /affirmatively agree/i)
	assert.doesNotMatch(privacy, /dashboard uses Discord OAuth access tokens/i)
	assert.doesNotMatch(privacy, /browser-readable Discord access token/i)
})
