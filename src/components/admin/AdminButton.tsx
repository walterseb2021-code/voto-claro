import Link from "next/link";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "warning";
type Props = ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement> | { href?: never } & ButtonHTMLAttributes<HTMLButtonElement>) & { variant?: Variant };
const variants: Record<Variant, string> = {
  primary: "border-green-700 bg-green-700 text-white hover:bg-green-800",
  secondary: "border-[#dc2626] bg-white text-black hover:bg-[#bffcff]",
  danger: "border-red-700 bg-red-700 text-white hover:bg-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
};
export default function AdminButton({ variant = "secondary", className = "", ...props }: Props) {
  const classes = `inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal break-words text-center rounded-xl border-2 px-4 py-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`;
  if (props.href !== undefined) return <Link {...props} className={classes} />;
  return <button {...props} className={classes} />;
}
