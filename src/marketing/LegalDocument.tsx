export type MarkdownBlock =
	| { type: 'heading'; level: number; text: string }
	| { type: 'paragraph'; lines: string[] }
	| { type: 'list'; items: string[] }

export function parseMarkdown(markdown: string): MarkdownBlock[] {
	const blocks: MarkdownBlock[] = []
	let paragraph: string[] = []
	let list: string[] = []

	const flushParagraph = () => {
		if (paragraph.length === 0) {
			return
		}

		blocks.push({ type: 'paragraph', lines: paragraph })
		paragraph = []
	}

	const flushList = () => {
		if (list.length === 0) {
			return
		}

		blocks.push({ type: 'list', items: list })
		list = []
	}

	for (const rawLine of markdown.split(/\r?\n/)) {
		const line = rawLine.trim()

		if (line.length === 0) {
			flushParagraph()
			flushList()
			continue
		}

		const heading = line.match(/^(#{1,6})\s+(.+)$/)

		if (heading) {
			flushParagraph()
			flushList()
			blocks.push({
				type: 'heading',
				level: heading[1].length,
				text: heading[2],
			})
			continue
		}

		const listItem = line.match(/^[-*]\s+(.+)$/)

		if (listItem) {
			flushParagraph()
			list.push(listItem[1])
			continue
		}

		flushList()
		paragraph.push(line.replace(/\s{2,}$/, ''))
	}

	flushParagraph()
	flushList()

	if (blocks[0]?.type === 'paragraph' && blocks[0].lines.length === 1) {
		blocks[0] = {
			type: 'heading',
			level: 1,
			text: blocks[0].lines[0],
		}
	}

	return blocks
}

function renderInline(text: string) {
	const parts = text.split(/(`[^`]+`)/g)

	return parts.map((part, index) => {
		if (part.startsWith('`') && part.endsWith('`')) {
			return <code key={index}>{part.slice(1, -1)}</code>
		}

		return part
	})
}

function LegalDocumentBlock({ block }: { block: MarkdownBlock }) {
	if (block.type === 'heading') {
		if (block.level <= 1) {
			return <h2>{renderInline(block.text)}</h2>
		}

		if (block.level === 2) {
			return <h3>{renderInline(block.text)}</h3>
		}

		return <h4>{renderInline(block.text)}</h4>
	}

	if (block.type === 'list') {
		return (
			<ul>
				{block.items.map((item) => (
					<li key={item}>{renderInline(item)}</li>
				))}
			</ul>
		)
	}

	return (
		<p>
			{block.lines.map((line, index) => (
				<span key={`${line}-${index}`}>
					{index > 0 ? <br /> : null}
					{renderInline(line)}
				</span>
			))}
		</p>
	)
}

export function LegalDocument({ blocks }: { blocks: MarkdownBlock[] }) {
	return (
		<div className="marketing-product">
			<SiteHeader />
			<main className="legal-page">
				{blocks.map((block, index) => (
					<LegalDocumentBlock key={index} block={block} />
				))}
			</main>
		</div>
	)
}
import { SiteHeader } from './SiteHeader'
