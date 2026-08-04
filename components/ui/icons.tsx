import { Loader2 } from "lucide-react";
import { siGithub } from "simple-icons";

export const Icons = {
	spinner: Loader2,
};

// lucide-react v1 a retiré les icônes de marque. On reprend le tracé de
// simple-icons en gardant l'API des icônes lucide (size, className, ...props).
export function Github({
	size = 24,
	className,
	...props
}: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
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
			<title>GitHub</title>
			<path d={siGithub.path} />
		</svg>
	);
}
