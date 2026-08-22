import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const YOUTUBE_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/;
const VIMEO_PATTERN = /vimeo\.com\/(\d+)/;
const VIDEO_FILE_PATTERN = /\.(mp4|webm|mov)(\?.*)?$/i;
const VIDEO_SHORTCODE = /\{\{video:\s*(\S+?)\s*\}\}/g;

/** Turns a `{{video:URL}}` shortcode into the right embed for whatever kind
 * of URL it is — YouTube/Vimeo get an iframe, a direct video file gets a
 * <video> tag. Runs before ReactMarkdown, which is told (via rehype-raw) to
 * pass the resulting HTML through rather than escape it — safe here because
 * post content is admin-authored, not user-submitted. */
function embedVideos(markdown: string): string {
  return markdown.replace(VIDEO_SHORTCODE, (_match, url: string) => {
    const youtube = url.match(YOUTUBE_PATTERN);
    if (youtube) {
      return `<div class="aspect-video w-full overflow-hidden rounded-lg"><iframe class="h-full w-full" src="https://www.youtube.com/embed/${youtube[1]}" title="Embedded video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    const vimeo = url.match(VIMEO_PATTERN);
    if (vimeo) {
      return `<div class="aspect-video w-full overflow-hidden rounded-lg"><iframe class="h-full w-full" src="https://player.vimeo.com/video/${vimeo[1]}" title="Embedded video" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (VIDEO_FILE_PATTERN.test(url)) {
      return `<video class="w-full rounded-lg" controls src="${url}"></video>`;
    }
    return `<p class="text-red-400">[Unrecognized video URL: ${url}]</p>`;
  });
}

export default function BlogMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose-blog">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {embedVideos(markdown)}
      </ReactMarkdown>
    </div>
  );
}
