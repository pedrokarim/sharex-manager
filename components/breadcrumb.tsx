'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { usePathname } from "next/navigation";
import Link from "next/link";

const routes = {
  '/': 'Accueil',
  '/gallery': 'Galerie',
  '/settings': 'Paramètres',
  '/settings/api-keys': 'Clés API',
  '/settings/api-keys/create': 'Nouvelle clé',
  '/settings/api-keys/[id]': 'Modifier clé',
};

export function BreadcrumbNav() {
  const pathname = usePathname();
  const paths = pathname.split('/').filter(Boolean);
  
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Accueil</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {paths.map((path, index) => {
          const href = `/${paths.slice(0, index + 1).join('/')}`;
          const isLast = index === paths.length - 1;
          
          return (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem key={path}>
                {isLast ? (
                  <BreadcrumbPage>{routes[href] || path}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{routes[href] || path}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
} 