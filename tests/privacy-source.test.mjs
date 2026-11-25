import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('privacy policy describes current login, audit, and linked-account processing', () => {
	const privacy = readFileSync(path.join(projectRoot, 'PRIVACY.md'), 'utf8')
	const receipt = JSON.parse(readFileSync(path.join(projectRoot, 'docs/simulator-policy-receipt.json'), 'utf8'))
	const revision = receipt.documents.find(document => document.file === 'PRIVACY.md')
	const updated = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })
		.format(new Date(revision.version))

	assert.ok(privacy.split('\n').includes('Last updated: ' + updated))
	assert.match(privacy, /^Website: https:\/\/www\.atcmh\.org\/$/m)
	assert.doesNotMatch(privacy, /^Website:.*https:\/\/(?:dashboard|exams)\.atcmh\.org/m)
	assert.match(privacy, /Dashboard and Exams Center/i)
	assert.match(privacy, /central[^.]*opaque session/i)
	assert.match(privacy, /login IP address/i)
	assert.match(privacy, /alternate-account evidence review/i)
	assert.match(privacy, /linked Discord and Infinite Flight Community identit/i)
	assert.match(privacy, /Mentorship Channels archive records conversations/i)
	assert.match(privacy, /Discord moderators and the ATCMH Super Admin/i)
	assert.match(privacy, /affirmatively agree/i)
	assert.doesNotMatch(privacy, /dashboard uses Discord OAuth access tokens/i)
	assert.doesNotMatch(privacy, /browser-readable Discord access token/i)
})
