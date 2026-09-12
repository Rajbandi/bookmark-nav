import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

// 页脚 Markdown 白名单:仅行内内容与链接,标题/图片/列表等页脚不该出现的元素一律剥离
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
	// 去掉段落的默认外边距,保持页脚紧凑
	p: ({ children }) => <p className="m-0">{children}</p>,
};

// 后台页脚文字按 Markdown 渲染;react-markdown 默认不解析原始 HTML,天然防注入;
// remark-breaks 让单个换行渲染为换行(标准 Markdown 需要空行才分段,对页脚太苛刻)
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
