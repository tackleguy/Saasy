/**
 * SectionHeading — the one heading pattern every marketing section uses.
 * A hairline rule, a large serif title on the left and an optional short
 * standfirst + action on the right, sitting on the shared 12-column grid.
 */
import clsx from "clsx";

interface Props {
  id: string;
  title: React.ReactNode;
  /** Short supporting sentence (one or two lines). */
  children?: React.ReactNode;
  /** Link or button aligned with the standfirst. */
  action?: React.ReactNode;
  as?: "h1" | "h2";
  size?: "lg" | "md";
  className?: string;
  /** Use on dark (ink) bands. */
  inverse?: boolean;
}

export default function SectionHeading({ id, title, children, action, as: Tag = "h2", size = "lg", className, inverse }: Props) {
  return (
    <header
      className={clsx(
        "grid gap-x-10 gap-y-5 border-t pt-6 sm:pt-8 lg:grid-cols-12",
        inverse ? "border-paper/20" : "border-ink",
        className
      )}
    >
      <Tag id={id} className={clsx("font-serif lg:col-span-7", size === "lg" ? "text-display-lg" : "text-display-md", inverse ? "text-paper" : "text-ink")}>
        {title}
      </Tag>
      {(children || action) && (
        <div className="flex flex-col items-start gap-5 lg:col-span-4 lg:col-start-9 lg:pt-2">
          {children && <p className={clsx("max-w-md text-[15px] leading-relaxed", inverse ? "text-paper/75" : "text-ash")}>{children}</p>}
          {action}
        </div>
      )}
    </header>
  );
}
