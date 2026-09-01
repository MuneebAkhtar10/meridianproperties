import { ReactNode } from "react";

export interface PageProps {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export interface LayoutProps {
  children: ReactNode;
  params: Promise<Record<string, string>>;
} 