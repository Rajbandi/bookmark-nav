import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

// Allow only inline Markdown and links in the footer; strip headings, images, lists, and other elements.
const allowedElements = ["a", "p", "strong", "em", "del", "code", "br"];

const components: Components = {
	a: ({ children, href }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer nofollow"
			className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
		>
			{children}
		</a>
	),
	// Remove paragraph margins to keep the footer compact.
	p: ({ children }) => <p className="m-0">{children}</p>,
};

// Render footer Markdown; react-markdown ignores raw HTML by default to prevent injection.
// remark-breaks preserves single line breaks without requiring blank lines between paragraphs.
export default function FooterContent({ text }: { text: string }) {
	return (
		<ReactMarkdown
			allowedElements={allowedElements}
			unwrapDisallowed
			remarkPlugins={[remarkBreaks]}
			components={components}
		>
			{text}
		</ReactMarkdown>
	);
}
