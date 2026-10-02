import { Loader2 } from "lucide-react";
import { siDiscord, siGithub, siX } from "simple-icons";

export const Icons = {
	spinner: Loader2,
};

// lucide-react v1 a retiré les icônes de marque. On reprend le tracé de
// simple-icons en gardant l'API des icônes lucide (size, className, ...props).
type BrandIconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };

function brandIcon(title: string, path: string) {
	return function BrandIcon({ size = 24, className, ...props }: BrandIconProps) {
		return (
			<svg
				role="img"
				viewBox="0 0 24 24"
				width={size}
				height={size}
				fill="currentColor"
				className={className}
				{...props}
			>
				<title>{title}</title>
				<path d={path} />
			</svg>
		);
	};
}

export const Github = brandIcon("GitHub", siGithub.path);
export const Discord = brandIcon("Discord", siDiscord.path);
export const XLogo = brandIcon("X", siX.path);
