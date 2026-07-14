import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('terms page renders the canonical RootSite terms document', () => {
	const termsDocument = path.join(projectRoot, 'TERMS_OF_SERVICE.md')
	const termsPage = readFileSync(path.join(projectRoot, 'app', 'terms', 'page.tsx'), 'utf8')
	const terms = readFileSync(termsDocument, 'utf8')

	assert.equal(existsSync(termsDocument), true)
	assert.match(termsPage, /fs\.readFileSync/)
	assert.match(termsPage, /TERMS_OF_SERVICE\.md/)
	assert.doesNotMatch(termsPage, /Terms of service content will be added here\./)
	assert.match(terms, /hello@atcmh\.org/)
	assert.match(terms, /Open a Moderator Ticket in the ATCMH Discord server/)
	assert.doesNotMatch(terms, /replace with official contact method/)
})

test('legal pages use the shared navbar with a Discord contact link', () => {
	const siteHeader = path.join(projectRoot, 'src', 'marketing', 'SiteHeader.tsx')
	const legalDocument = readFileSync(path.join(projectRoot, 'src', 'marketing', 'LegalDocument.tsx'), 'utf8')
	const policyPage = readFileSync(path.join(projectRoot, 'app', 'policy', 'page.tsx'), 'utf8')
	const termsPage = readFileSync(path.join(projectRoot, 'app', 'terms', 'page.tsx'), 'utf8')

	assert.equal(existsSync(siteHeader), true)

	const header = readFileSync(siteHeader, 'utf8')

	assert.match(policyPage, /<LegalDocument/)
	assert.match(termsPage, /<LegalDocument/)
	assert.match(legalDocument, /<SiteHeader\s*\/>/)
	assert.match(header, /label: 'Contact', href: discordUrl, external: true/)
	assert.match(header, /href: '\/#about'/)
})

test('terms describe the current consent and central authentication model', () => {
	const terms = readFileSync(path.join(projectRoot, 'TERMS_OF_SERVICE.md'), 'utf8')

	assert.match(terms, /Last updated: July 14, 2026/)
	assert.match(terms, /Dashboard and Exams Center/i)
	assert.match(terms, /central[^.]*opaque session/i)
	assert.match(terms, /login IP address/i)
	assert.match(terms, /alternate-account evidence review/i)
	assert.match(terms, /affirmatively agree/i)
	assert.doesNotMatch(terms, /dashboard uses Discord OAuth access tokens/i)
	assert.doesNotMatch(terms, /browser-readable Discord access token/i)
})
